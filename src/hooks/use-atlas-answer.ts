// Reads a streamed answer from one of the /api/ai routes.
//
// The server streams plain text and reports a failure that lands mid-answer
// inside the body (the status code has already gone out by then), so this hook
// always separates "what the model said" from "what went wrong" and never
// pretends a truncated answer is finished.
import { useCallback, useEffect, useRef, useState } from "react";

import { splitAnswerError } from "@/lib/ai-answer";

export type AnswerPhase = "idle" | "pending" | "streaming" | "done" | "stopped" | "error";

export type AtlasAnswerState = {
  phase: AnswerPhase;
  /** The answer so far, with any error marker stripped. */
  text: string;
  error: string | null;
  /** Set when the failure is worth another attempt (rate limit, gateway blip). */
  retryable: boolean;
  /** Fingerprint of the context the answer was built from. */
  contextHash: string | null;
  runId: string | null;
  startedAt: number | null;
};

const IDLE: AtlasAnswerState = {
  phase: "idle",
  text: "",
  error: null,
  retryable: false,
  contextHash: null,
  runId: null,
  startedAt: null,
};

const CONTEXT_HASH_HEADER = "X-Atlas-Context-Hash";
const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

async function readFailure(response: Response): Promise<{ message: string; retryable: boolean }> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      const message = typeof record["error"] === "string" ? record["error"] : "";
      if (message) return { message, retryable: record["retryable"] === true };
    }
  } catch {
    // Not JSON — fall through to the generic sentence below.
  }
  if (response.status === 429 || response.status >= 500) {
    return { message: "The model is busy. Try that again in a moment.", retryable: true };
  }
  return { message: `The request failed (${response.status}).`, retryable: false };
}

export function useAtlasAnswer(endpoint: string) {
  const [state, setState] = useState<AtlasAnswerState>(IDLE);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const apply = useCallback((update: (previous: AtlasAnswerState) => AtlasAnswerState) => {
    if (mounted.current) setState(update);
  }, []);

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  const reset = useCallback(() => {
    stop();
    apply(() => IDLE);
  }, [apply, stop]);

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      controller.current?.abort();
      const local = new AbortController();
      controller.current = local;
      apply(() => ({ ...IDLE, phase: "pending", startedAt: Date.now() }));

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: local.signal,
        });

        if (!response.ok || !response.body) {
          const failure = await readFailure(response);
          apply((previous) => ({
            ...previous,
            phase: "error",
            error: failure.message,
            retryable: failure.retryable,
          }));
          return;
        }

        apply((previous) => ({
          ...previous,
          phase: "streaming",
          contextHash: response.headers.get(CONTEXT_HASH_HEADER),
          runId: response.headers.get(RUN_ID_HEADER),
        }));

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let raw = "";

        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          raw += decoder.decode(chunk.value, { stream: true });
          const split = splitAnswerError(raw);
          apply((previous) => ({ ...previous, text: split.answer, error: split.error }));
        }
        raw += decoder.decode();

        const split = splitAnswerError(raw);
        apply((previous) => ({
          ...previous,
          text: split.answer,
          error:
            split.error ??
            (split.answer.trim() === "" ? "The model returned an empty answer." : null),
          retryable: split.error ? true : previous.retryable,
          phase: split.error || split.answer.trim() === "" ? "error" : "done",
        }));
      } catch (error) {
        if (local.signal.aborted) {
          apply((previous) => ({
            ...previous,
            phase: previous.text.trim() ? "stopped" : "idle",
          }));
          return;
        }
        apply((previous) => ({
          ...previous,
          phase: "error",
          retryable: true,
          error:
            error instanceof Error && error.message
              ? error.message
              : "The connection dropped before the answer arrived.",
        }));
      } finally {
        if (controller.current === local) controller.current = null;
      }
    },
    [apply, endpoint],
  );

  const running = state.phase === "pending" || state.phase === "streaming";

  return { state, running, run, stop, reset };
}
