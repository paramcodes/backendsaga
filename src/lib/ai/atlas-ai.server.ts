// The AI layer, server side.
//
// Three capabilities — explain, diagnose, research — and one rule behind all
// of them: the model never decides what the atlas knows. The graph is loaded
// here, the context is built here, and the answer is judged against it. The
// browser cannot smuggle facts in; it sends an entry id, a list of ticked
// signals or a topic, and nothing else.
import { NoObjectGeneratedError, NoOutputGeneratedError, Output } from "ai";

import { createGraphIndex, type GraphIndex } from "@/domain/graph-index";
import type { Json } from "@/integrations/supabase/types";
import type { DomainGraph } from "@/domain/schema";
import {
  buildDiagnoseContext,
  buildExplainContext,
  buildResearchContext,
  type AtlasContext,
} from "@/lib/ai-context";
import { ANSWER_ERROR_MARKER } from "@/lib/ai-answer";
import { INSTRUCTIONS_BY_KIND, buildUserMessage } from "@/lib/ai-prompts";
import {
  EMPTY_PROPOSAL,
  researchProposalSchema,
  reviewProposal,
  toProposalRecord,
  type AtlasVocabulary,
  type ProposalIssue,
  type ProposalRow,
  type ProposalStatus,
  type ResearchProposal,
  type ResearchProposalRecord,
} from "@/lib/ai-proposal";
import { getDiagnosticsContext, getSourceLibrary } from "@/lib/atlas.functions";
import { atlasDb, unwrap, unwrapMaybe } from "@/lib/atlas-db.server";
import { createIncidentEngine } from "@/lib/incident-engine";

import { ATLAS_MODEL, createAtlasCall, describeGatewayError, isAbortError } from "./gateway";
import { getLovableAiGatewayResponseHeaders, RUN_ID_HEADER } from "./run-id";

// ------------------------------------------------------------------ loading

type LoadedAtlas = {
  index: GraphIndex;
  symptoms: Awaited<ReturnType<typeof getDiagnosticsContext>>["symptoms"];
  symptomEvidence: Awaited<ReturnType<typeof getDiagnosticsContext>>["symptomEvidence"];
};

/**
 * One read for every capability. The atlas is small (tens of entries), so the
 * whole graph is cheaper to load than three bespoke queries, and every
 * capability then runs against exactly the same picture.
 */
async function loadAtlas(): Promise<LoadedAtlas> {
  const [diagnostics, library] = await Promise.all([getDiagnosticsContext(), getSourceLibrary()]);

  const graph: DomainGraph = {
    layers: diagnostics.layers,
    concepts: diagnostics.concepts,
    relationships: diagnostics.relationships,
    evidence: diagnostics.evidence,
    sources: library.map((entry) => entry.source),
    conceptSources: library.flatMap((entry) =>
      entry.concepts.map((link) => ({
        conceptId: link.concept.id,
        sourceId: entry.source.id,
        relevance: link.relevance,
      })),
    ),
  };

  return {
    index: createGraphIndex(graph),
    symptoms: diagnostics.symptoms,
    symptomEvidence: diagnostics.symptomEvidence,
  };
}

function resolveConcept(index: GraphIndex, idOrSlug: string) {
  return (
    index.getConcept(idOrSlug) ??
    index.graph.concepts.find((concept) => concept.slug === idOrSlug) ??
    null
  );
}

function vocabulary(index: GraphIndex): AtlasVocabulary {
  return {
    conceptIds: new Set(index.graph.concepts.map((concept) => concept.id)),
    layerIds: new Set(index.graph.layers.map((layer) => layer.id)),
    sourceIds: new Set(index.graph.sources.map((source) => source.id)),
    evidenceIds: new Set(index.graph.evidence.map((card) => card.id)),
    relationshipKeys: new Set(
      index.graph.relationships.map((rel) => `${rel.sourceId}|${rel.type}|${rel.targetId}`),
    ),
  };
}

// ------------------------------------------------------------------ context

export type AiContextInput =
  | { kind: "explain"; conceptId: string; question: string | null }
  | { kind: "diagnose"; symptomIds: string[]; question: string | null }
  | { kind: "research"; topic: string };

/**
 * The context a request would use, without calling a model. The UI shows this
 * before anyone spends a credit, so a reader can see exactly which records an
 * answer would be built from.
 */
export async function loadAiContext(input: AiContextInput): Promise<AtlasContext> {
  const atlas = await loadAtlas();

  if (input.kind === "explain") {
    const concept = resolveConcept(atlas.index, input.conceptId);
    if (!concept) throw new Error(`There is no entry called “${input.conceptId}”.`);
    return buildExplainContext(atlas.index, concept.id, input.question);
  }

  if (input.kind === "diagnose") {
    const engine = createIncidentEngine(atlas.index, {
      symptoms: atlas.symptoms,
      symptomEvidence: atlas.symptomEvidence,
      incidents: [],
    });
    const diagnosis = engine.diagnose(input.symptomIds);
    return buildDiagnoseContext(atlas.index, diagnosis, input.question);
  }

  return buildResearchContext(atlas.index, input.topic);
}

// ------------------------------------------------------------- HTTP helpers

const encoder = new TextEncoder();

function jsonError(status: number, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: message, ...extra }, { status });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const asStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/**
 * Streams the answer as plain text. The context fingerprint travels in a
 * header so the browser can prove the answer on screen belongs to the context
 * next to it. A failure that lands after the first token cannot change the
 * status code, so it is appended to the body behind a marker instead.
 */
async function streamAnswer(
  request: Request,
  context: AtlasContext,
  effort: "low" | "medium" | "high",
) {
  let call: ReturnType<typeof createAtlasCall>;
  try {
    call = createAtlasCall(request, {
      instructions: INSTRUCTIONS_BY_KIND[context.kind],
      prompt: buildUserMessage(context),
      effort,
    });
  } catch (error) {
    const failure = describeGatewayError(error);
    return jsonError(failure.status, failure.message, { retryable: failure.retryable });
  }

  const iterator = call.result.textStream[Symbol.asyncIterator]();

  // Pull the first chunk here: until the gateway has answered, a failure can
  // still be reported honestly with a status code.
  let first: IteratorResult<string>;
  try {
    first = await iterator.next();
  } catch (error) {
    const failure = describeGatewayError(error);
    if (failure.status === 499) return new Response(null, { status: 499 });
    return jsonError(failure.status, failure.message, { retryable: failure.retryable });
  }

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done && first.value) controller.enqueue(encoder.encode(first.value));
        if (!first.done) {
          while (true) {
            const chunk = await iterator.next();
            if (chunk.done) break;
            if (chunk.value) controller.enqueue(encoder.encode(chunk.value));
          }
        }
      } catch (error) {
        if (!isAbortError(error)) {
          const failure = describeGatewayError(error);
          controller.enqueue(encoder.encode(`${ANSWER_ERROR_MARKER}${failure.message}`));
        }
      } finally {
        controller.close();
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });

  const headers = getLovableAiGatewayResponseHeaders(undefined, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Atlas-Context-Hash": context.hash,
    "Access-Control-Expose-Headers": "X-Atlas-Context-Hash",
  });
  const runId = call.runIdFetch.getRunId();
  if (runId) headers.set(RUN_ID_HEADER, runId);

  return new Response(body, { status: 200, headers });
}

// ----------------------------------------------------------------- handlers

export async function handleExplain(request: Request): Promise<Response> {
  const body = await readJson(request);
  const conceptId = asString(body["conceptId"]);
  if (!conceptId) return jsonError(400, "Ask about a specific entry.");

  let context: AtlasContext;
  try {
    context = await loadAiContext({
      kind: "explain",
      conceptId,
      question: asString(body["question"]) || null,
    });
  } catch (error) {
    return jsonError(400, error instanceof Error ? error.message : "Unknown entry.");
  }

  return streamAnswer(request, context, "medium");
}

export async function handleDiagnose(request: Request): Promise<Response> {
  const body = await readJson(request);
  const symptomIds = asStringList(body["symptomIds"]);
  if (symptomIds.length === 0) {
    return jsonError(400, "Tick at least one signal before asking for a second opinion.");
  }

  let context: AtlasContext;
  try {
    context = await loadAiContext({
      kind: "diagnose",
      symptomIds,
      question: asString(body["question"]) || null,
    });
  } catch (error) {
    return jsonError(400, error instanceof Error ? error.message : "Unknown signals.");
  }

  return streamAnswer(request, context, "medium");
}

/**
 * Research is the only capability that returns structured data, and the only
 * one that writes anything — to the proposal queue, never to the graph.
 */
export async function handleResearch(request: Request): Promise<Response> {
  const body = await readJson(request);
  const topic = asString(body["topic"]);
  if (!topic) return jsonError(400, "Name a topic to research.");

  const atlas = await loadAtlas();
  const context = buildResearchContext(atlas.index, topic);

  let call: ReturnType<typeof createAtlasCall>;
  try {
    call = createAtlasCall(request, {
      instructions: INSTRUCTIONS_BY_KIND.research,
      prompt: buildUserMessage(context),
      effort: "high",
      output: Output.object({ schema: researchProposalSchema }),
    });
  } catch (error) {
    const failure = describeGatewayError(error);
    return jsonError(failure.status, failure.message, { retryable: failure.retryable });
  }

  let raw: ResearchProposal | null = null;
  try {
    raw = (await call.result.output) as ResearchProposal;
  } catch (error) {
    if (isAbortError(error)) return new Response(null, { status: 499 });

    // A malformed answer is recoverable once, from the text the model did
    // produce — never by paying for the same call again. An empty answer
    // (NoOutputGeneratedError) has nothing to salvage.
    const text = NoObjectGeneratedError.isInstance(error) ? error.text : undefined;
    const salvaged = text ? salvageProposal(text) : null;
    if (!salvaged) {
      const failure = describeGatewayError(error);
      return jsonError(
        failure.status === 500 ? 502 : failure.status,
        failure.status === 500
          ? "The model's answer did not fit the proposal format, so nothing was recorded."
          : failure.message,
        { retryable: failure.retryable },
      );
    }
    raw = salvaged;
  }

  const reviewed = reviewProposal(raw ?? EMPTY_PROPOSAL, vocabulary(atlas.index));
  const record = await recordProposal({
    topic,
    question: context.question,
    model: call.model,
    runId: call.runIdFetch.getRunId() ?? null,
    context,
    proposal: reviewed.proposal,
    issues: reviewed.issues,
  });

  return Response.json({ record }, { headers: contextHeaders(context, record.runId) });
}

function contextHeaders(context: AtlasContext, runId: string | null) {
  const headers = getLovableAiGatewayResponseHeaders(undefined, {
    "Cache-Control": "no-store",
    "X-Atlas-Context-Hash": context.hash,
    "Access-Control-Expose-Headers": "X-Atlas-Context-Hash",
  });
  if (runId) headers.set(RUN_ID_HEADER, runId);
  return headers;
}

/** Last-chance read of a JSON answer that failed schema validation. */
function salvageProposal(text: string): ResearchProposal | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    const result = researchProposalSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------- proposal store

type ProposalDraft = {
  topic: string;
  question: string | null;
  model: string;
  runId: string | null;
  context: AtlasContext;
  proposal: ResearchProposal;
  issues: ProposalIssue[];
};

/**
 * Writes need the privileged client: the proposal table is readable by
 * everyone and writable by no public role, exactly like the knowledge tables.
 */
async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function recordProposal(draft: ProposalDraft): Promise<ResearchProposalRecord> {
  const client = await adminClient();
  const row = unwrap(
    await client
      .from("research_proposals")
      .insert({
        topic: draft.topic,
        question: draft.question ?? "",
        status: "pending",
        model: draft.model,
        run_id: draft.runId,
        context_hash: draft.context.hash,
        context: draft.context as unknown as Json,
        summary: draft.proposal.summary,
        proposal: draft.proposal as unknown as Json,
        issues: draft.issues as unknown as Json,
      })
      .select("*")
      .single(),
    "the proposal",
  );
  return toProposalRecord(row as unknown as ProposalRow);
}

export async function listProposals(status?: ProposalStatus): Promise<ResearchProposalRecord[]> {
  const client = atlasDb();
  let query = client
    .from("research_proposals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (status) query = query.eq("status", status);
  const rows = unwrap(await query, "the research proposals");
  return rows.map((row) => toProposalRecord(row as ProposalRow));
}

export async function getProposal(id: string): Promise<ResearchProposalRecord | null> {
  const client = atlasDb();
  const row = unwrapMaybe(
    await client.from("research_proposals").select("*").eq("id", id).maybeSingle(),
    "the proposal",
  );
  return row ? toProposalRecord(row as ProposalRow) : null;
}

/**
 * Accepting a proposal records the decision. It does not touch the graph:
 * the curated seed is still edited by a human, which is the whole point of
 * keeping AI out of the source of truth.
 */
export async function decideProposal(input: {
  id: string;
  status: Exclude<ProposalStatus, "pending">;
  note?: string | null;
}): Promise<ResearchProposalRecord> {
  const client = await adminClient();
  const row = unwrap(
    await client
      .from("research_proposals")
      .update({
        status: input.status,
        review_note: input.note?.trim() || null,
        decided_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .select("*")
      .single(),
    "the proposal",
  );
  return toProposalRecord(row as unknown as ProposalRow);
}

export { ATLAS_MODEL };
