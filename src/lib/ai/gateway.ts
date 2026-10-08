// The one place the atlas talks to the Lovable AI Gateway.
//
// Every call streams (a buffered call that outlives the request still bills),
// runs on the Responses endpoint, keeps `store: false` because the gateway is
// stateless, and carries the run id the gateway minted.
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, streamText, type Output } from "ai";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
} from "./run-id";

/** Resolved default chat model for this workspace. */
export const ATLAS_MODEL = "openai/gpt-6-astra";

const GATEWAY_BASE_URL = "https://ai.gateway.lovable.dev/v1";

export type ReasoningEffort = "low" | "medium" | "high";

export type AtlasCallOptions = {
  instructions: string;
  prompt: string;
  effort?: ReasoningEffort;
  /** Supply only for structured answers; text answers stream raw markdown. */
  output?: ReturnType<typeof Output.object>;
};

export class GatewayConfigError extends Error {
  constructor() {
    super("The AI gateway key is missing, so the atlas cannot reach a model.");
    this.name = "GatewayConfigError";
  }
}

export function createAtlasCall(request: Request, options: AtlasCallOptions) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new GatewayConfigError();

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY_BASE_URL,
    apiKey,
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses(ATLAS_MODEL),
    instructions: options.instructions,
    messages: [{ role: "user", content: options.prompt }],
    abortSignal: request.signal,
    // A failed call is reported, never silently re-billed.
    maxRetries: 0,
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        reasoningEffort: options.effort ?? "medium",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
    ...(options.output ? { output: options.output } : {}),
  });

  return { result, runIdFetch, model: ATLAS_MODEL };
}

export type GatewayFailure = {
  /** Status to answer the browser with; upstream statuses are preserved. */
  status: number;
  /** Safe, user-readable sentence. Never a raw provider dump. */
  message: string;
  /** True only for the handful of statuses that are worth trying again. */
  retryable: boolean;
};

export function isAbortError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return true;
  }
  return false;
}

function safeProviderMessage(body: string | undefined) {
  if (!body) return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const direct = record["message"];
      if (typeof direct === "string" && direct.trim()) return direct.trim();
      const nested = record["error"];
      if (nested && typeof nested === "object") {
        const message = (nested as Record<string, unknown>)["message"];
        if (typeof message === "string" && message.trim()) return message.trim();
      }
    }
  } catch {
    // Not JSON — fall through rather than echo raw provider output.
  }
  return undefined;
}

export function describeGatewayError(error: unknown): GatewayFailure {
  if (error instanceof GatewayConfigError) {
    return { status: 500, message: error.message, retryable: false };
  }
  if (isAbortError(error)) {
    return { status: 499, message: "Answer stopped.", retryable: false };
  }

  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 502;
    const provider = safeProviderMessage(error.responseBody);
    switch (status) {
      case 400:
        return {
          status: 400,
          message: provider ?? "The model rejected the request the atlas built.",
          retryable: false,
        };
      case 401:
        return {
          status: 500,
          message: "The AI gateway refused the atlas' key, so no answer can be produced.",
          retryable: false,
        };
      case 402:
        return {
          status: 402,
          message:
            provider ??
            "This workspace is out of AI credits. Top up to use the explain, diagnose and research panels.",
          retryable: false,
        };
      case 403:
        return {
          status: 403,
          message: provider ?? "This workspace is not allowed to call this model.",
          retryable: false,
        };
      case 404:
        return {
          status: 404,
          message: "The AI endpoint this atlas calls is unavailable.",
          retryable: false,
        };
      case 429:
        return {
          status: 429,
          message: "The AI gateway is rate limiting this workspace. Wait a moment and ask again.",
          retryable: true,
        };
      default:
        if (status >= 500) {
          return {
            status: 502,
            message: "The AI gateway could not answer right now. Try again in a moment.",
            retryable: true,
          };
        }
        return {
          status,
          message: provider ?? "The AI gateway refused the request.",
          retryable: false,
        };
    }
  }

  return {
    status: 500,
    message: error instanceof Error && error.message ? error.message : "The answer failed.",
    retryable: false,
  };
}
