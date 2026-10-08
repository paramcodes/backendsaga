// The graph context handed to the model.
//
// Pure TypeScript: no React, no network, no model calls. Given the graph (and
// a question) this produces the bounded slice of the atlas the model is
// allowed to reason over, *and* the exact text it receives — so the UI can
// show the reader the same facts, byte for byte, and prove it with a hash.
//
// Nothing here invents knowledge. Every fact comes from a record in the graph.
import type { Concept, Evidence } from "@/domain/schema";
import type { GraphIndex } from "@/domain/graph-index";
import {
  RELATIONSHIP_MEANINGS,
  rankConcepts,
  relationshipSentence,
  type RankedConcept,
} from "@/lib/graph-explore";
import type { Diagnosis } from "@/lib/incident-engine";
import { confidenceLabel, pathSentence } from "@/lib/incident-engine";

/** Hard caps. A prompt that grows with the graph stops being reviewable. */
export const AI_CONTEXT_LIMITS = {
  neighbors: 14,
  secondHop: 12,
  evidence: 8,
  sources: 6,
  causes: 5,
  pathsPerCause: 3,
  checks: 5,
  researchConcepts: 10,
  researchRelationships: 18,
  researchEvidence: 10,
  researchSources: 10,
  fieldChars: 420,
} as const;

export type AtlasContextKind = "explain" | "diagnose" | "research";

/** One line of context: a label and the record behind it. */
export type ContextFact = { label: string; detail: string };

export type ContextSection = {
  title: string;
  /** Why this section is in the prompt at all. */
  note: string;
  facts: ContextFact[];
};

export type AtlasContext = {
  kind: AtlasContextKind;
  title: string;
  subtitle: string;
  /** The reader's own question, when they asked one. */
  question: string | null;
  sections: ContextSection[];
  /** Graph ids that influenced the answer, for linking back from the UI. */
  conceptIds: string[];
  /** The literal text appended to the model's input. */
  prompt: string;
  /** Fingerprint of `prompt`; the server echoes it so the UI can verify. */
  hash: string;
};

const clip = (text: string, max: number = AI_CONTEXT_LIMITS.fieldChars): string =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

const fact = (label: string, detail: string | undefined | null): ContextFact[] =>
  detail ? [{ label, detail: clip(detail) }] : [];

/**
 * FNV-1a, 32 bit. Not a security primitive — a cheap, stable fingerprint so
 * the browser can check that the context it displays is the context that was
 * sent. Both sides run this same function over the same string.
 */
export function contextHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** The single renderer: what the reader sees is what the model reads. */
export function renderContextPrompt(sections: ContextSection[]): string {
  return sections
    .filter((section) => section.facts.length > 0)
    .map((section) => {
      const lines = section.facts.map((item) => `- ${item.label}: ${item.detail}`);
      return [`## ${section.title}`, `(${section.note})`, ...lines].join("\n");
    })
    .join("\n\n");
}

function finish(
  kind: AtlasContextKind,
  title: string,
  subtitle: string,
  question: string | null,
  sections: ContextSection[],
  conceptIds: string[],
): AtlasContext {
  const kept = sections.filter((section) => section.facts.length > 0);
  const prompt = renderContextPrompt(kept);
  return {
    kind,
    title,
    subtitle,
    question: question?.trim() ? clip(question.trim(), 400) : null,
    sections: kept,
    conceptIds: [...new Set(conceptIds)],
    prompt,
    hash: contextHash(prompt),
  };
}

const evidenceLine = (evidence: Evidence): string =>
  [
    `${evidence.kind} ${evidence.trend} · ${evidence.signal}`,
    `you see ${evidence.whatYouSee}`,
    `look in ${evidence.whereToLook}`,
    `it matters because ${evidence.whyItMatters}`,
    evidence.falsePositive ? `innocent look-alike: ${evidence.falsePositive}` : null,
  ]
    .filter(Boolean)
    .join(" — ");

/** Breadth-first hop distance, bounded, over the undirected graph. */
function hopsFrom(index: GraphIndex, rootId: string, maxHops: number): Map<string, number> {
  const distance = new Map<string, number>([[rootId, 0]]);
  let frontier = [rootId];
  for (let hop = 1; hop <= maxHops; hop += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of index.neighbors(id)) {
        if (distance.has(neighbor.other.id)) continue;
        distance.set(neighbor.other.id, hop);
        next.push(neighbor.other.id);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return distance;
}

// ------------------------------------------------------------------ explain

/**
 * Everything the model may say about one entry: the entry itself, the
 * relationships recorded on it, what sits two hops out, the evidence cards and
 * the cited sources. No prose beyond the records.
 */
export function buildExplainContext(
  index: GraphIndex,
  conceptId: string,
  question?: string | null,
): AtlasContext {
  const concept = index.getConcept(conceptId);
  if (!concept) {
    throw new Error(`Cannot build context for an unknown entry: ${conceptId}`);
  }

  const layerName = index.layerName(concept.layerId);
  const neighbors = index.neighbors(concept.id);
  const nearbyIds = neighbors.map((n) => n.other.id);

  const entry: ContextSection = {
    title: `Entry: ${concept.name}`,
    note: "the canonical record",
    facts: [
      { label: "Layer", detail: layerName },
      { label: "Description", detail: clip(concept.description) },
      ...fact("Problem it names", concept.problem),
      ...fact("Why it exists", concept.why),
      ...fact("Mechanism", concept.mechanism),
      ...fact("Trade-offs", concept.tradeoffs),
      ...fact("Better alternative", concept.betterAlternative),
    ],
  };

  const relationships: ContextSection = {
    title: "Recorded relationships",
    note: "direct edges, in the atlas' own wording",
    facts: neighbors.slice(0, AI_CONTEXT_LIMITS.neighbors).map((neighbor) => ({
      label: neighbor.rel.type,
      detail: neighbor.outgoing
        ? `${relationshipSentence(neighbor.rel.type, concept.name, neighbor.other.name)} (${index.layerName(neighbor.other.layerId)})`
        : `${relationshipSentence(neighbor.rel.type, neighbor.other.name, concept.name)} (${index.layerName(neighbor.other.layerId)})`,
    })),
  };

  const distance = hopsFrom(index, concept.id, 2);
  const secondHop = [...distance.entries()]
    .filter(([, hops]) => hops === 2)
    .map(([id]) => index.getConcept(id))
    .filter((c): c is Concept => Boolean(c))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, AI_CONTEXT_LIMITS.secondHop);

  const wider: ContextSection = {
    title: "Two hops out",
    note: "nearby entries the answer may mention, nothing further",
    facts: secondHop.map((other) => ({
      label: other.name,
      detail: `${index.layerName(other.layerId)} — ${clip(other.description, 160)}`,
    })),
  };

  const evidence = index.evidenceFor(concept.id).slice(0, AI_CONTEXT_LIMITS.evidence);
  const evidenceSection: ContextSection = {
    title: "Production evidence",
    note: "observable signals recorded for this entry",
    facts: evidence.map((card) => ({ label: card.id, detail: evidenceLine(card) })),
  };

  const sources = index.sourcesFor(concept.id).slice(0, AI_CONTEXT_LIMITS.sources);
  const sourceSection: ContextSection = {
    title: "Cited sources",
    note: "the only references the answer may cite",
    facts: sources.map(({ source, relevance }) => ({
      label: source.title,
      detail: `${source.kind} · ${source.author}${source.year ? ` (${source.year})` : ""} — ${relevance}`,
    })),
  };

  return finish(
    "explain",
    concept.name,
    `${layerName} · ${neighbors.length} relationships · ${index.evidenceFor(concept.id).length} signals`,
    question ?? null,
    [entry, relationships, wider, evidenceSection, sourceSection],
    [concept.id, ...nearbyIds, ...secondHop.map((c) => c.id)],
  );
}

// ----------------------------------------------------------------- diagnose

/**
 * The deterministic diagnosis, rendered for the model. The ranking is already
 * decided by the engine: the model writes it up, it does not re-rank. Giving
 * it the chains (not just the names) is what keeps it honest.
 */
export function buildDiagnoseContext(
  index: GraphIndex,
  diagnosis: Diagnosis,
  question?: string | null,
): AtlasContext {
  const reported: ContextSection = {
    title: "Reported signals",
    note: "what the on-call engineer ticked",
    facts: diagnosis.observations.map(({ symptom }) => ({
      label: symptom.name,
      detail: `${symptom.trend} · ${symptom.signal} — ${clip(symptom.description, 200)} (${index.layerName(symptom.layerId)})`,
    })),
  };

  const observedOn: ContextSection = {
    title: "Where each signal lands in the graph",
    note: "signal → evidence card → entry; the only bridge between the two",
    facts: diagnosis.observations.flatMap(({ symptom, observed }) =>
      observed.slice(0, 4).map((hit) => ({
        label: `${symptom.name} → ${hit.concept.name}`,
        detail: `${hit.strength} match via ${hit.evidence.map((e) => e.signal).join(", ")}`,
      })),
    ),
  };

  const causes = diagnosis.causes.slice(0, AI_CONTEXT_LIMITS.causes);
  const ranked: ContextSection = {
    title: "Ranked causes (computed by the engine, not by you)",
    note: "walked upstream along CAUSES and AMPLIFIES edges",
    facts: causes.map((cause) => ({
      label: `#${cause.rank} ${cause.concept.name}`,
      detail: [
        `${index.layerName(cause.concept.layerId)}`,
        `explains ${cause.coverage.length}/${diagnosis.symptomIds.length} signals`,
        `${confidenceLabel(cause.confidence)} (${Math.round(cause.confidence * 100)}%)`,
        cause.paths
          .slice(0, AI_CONTEXT_LIMITS.pathsPerCause)
          .map((path) => pathSentence(path))
          .join(" | "),
      ]
        .filter(Boolean)
        .join(" · "),
    })),
  };

  const mitigations: ContextSection = {
    title: "Recorded mitigations",
    note: "entries that MITIGATE a candidate cause",
    facts: causes.flatMap((cause) =>
      cause.mitigations.length
        ? [
            {
              label: cause.concept.name,
              detail: cause.mitigations.map((m) => m.name).join(", "),
            },
          ]
        : [],
    ),
  };

  const predicted: ContextSection = {
    title: "Predicted but unreported effects",
    note: "downstream of a candidate cause, not yet observed",
    facts: causes.flatMap((cause) =>
      cause.predicted.length
        ? [
            {
              label: cause.concept.name,
              detail: cause.predicted
                .slice(0, 5)
                .map((p) => `${p.relationship.type.toLowerCase()} ${p.concept.name}`)
                .join(", "),
            },
          ]
        : [],
    ),
  };

  const checks: ContextSection = {
    title: "Checks that separate the candidates",
    note: "evidence cards not yet claimed by a reported signal",
    facts: diagnosis.checks.slice(0, AI_CONTEXT_LIMITS.checks).map((check) => ({
      label: check.evidence.signal,
      detail: `look in ${check.evidence.whereToLook} — supports ${
        check.supports.map((s) => s.name).join(", ") || "nothing"
      }; argues against ${check.rulesOut.map((s) => s.name).join(", ") || "nothing"}`,
    })),
  };

  const unplaced: ContextSection = {
    title: "Signals with no graph link",
    note: "the atlas has no evidence card for these; say so",
    facts: diagnosis.unobserved.map((symptom) => ({
      label: symptom.name,
      detail: symptom.signal,
    })),
  };

  const count = diagnosis.symptomIds.length;
  return finish(
    "diagnose",
    `${count} signal${count === 1 ? "" : "s"} reported`,
    diagnosis.causes.length
      ? `Engine ranks ${diagnosis.causes[0]!.concept.name} first`
      : "No candidate cause in the graph",
    question ?? null,
    [reported, observedOn, ranked, mitigations, predicted, checks, unplaced],
    causes.map((cause) => cause.concept.id),
  );
}

// ----------------------------------------------------------------- research

/**
 * Search for a research topic is deliberately looser than the search box.
 * A topic is a phrase ("PostgreSQL write-ahead log and checkpoint tuning"),
 * and the atlas' ranked search requires every word to match, which answers
 * "nothing here" for almost any phrase. A model told the atlas holds nothing
 * then proposes duplicates, so the terms are also tried one at a time and the
 * union is handed over.
 */
function researchMatches(index: GraphIndex, query: string): Concept[] {
  const limit = AI_CONTEXT_LIMITS.researchConcepts;
  const whole: RankedConcept[] = rankConcepts(index.graph.concepts, query, limit);
  const found = new Map(whole.map((match) => [match.concept.id, match.concept]));

  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));

  for (const term of terms) {
    if (found.size >= limit) break;
    for (const match of rankConcepts(index.graph.concepts, term, limit)) {
      if (found.size >= limit) break;
      if (!found.has(match.concept.id)) found.set(match.concept.id, match.concept);
    }
  }

  return [...found.values()];
}

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "how",
  "why",
  "what",
  "when",
  "does",
  "are",
  "into",
  "from",
  "about",
  "under",
  "over",
  "tuning",
  "issues",
  "problems",
]);

/** Deterministic gaps: things the graph itself says are missing. */
export function researchGaps(index: GraphIndex, matches: Concept[]): string[] {
  const gaps: string[] = [];
  for (const concept of matches) {
    const missing: string[] = [];
    if (index.evidenceFor(concept.id).length === 0) missing.push("no evidence card");
    if (index.sourcesFor(concept.id).length === 0) missing.push("no cited source");
    if (index.degree(concept.id) <= 1) missing.push("only one relationship");
    if (!concept.mechanism) missing.push("no mechanism written");
    if (missing.length) gaps.push(`${concept.name}: ${missing.join(", ")}`);
  }
  return gaps;
}

/**
 * Research is the one capability that looks outward, so the context is mostly
 * about what the atlas *already* holds: the model's job is to propose what is
 * missing, in the atlas' own vocabulary, without duplicating what exists.
 */
export function buildResearchContext(index: GraphIndex, topic: string): AtlasContext {
  const query = topic.trim();
  const matched = researchMatches(index, query);
  const matchedIds = new Set(matched.map((c) => c.id));

  const existing: ContextSection = {
    title: "Entries the atlas already has on this topic",
    note: "ranked by the atlas' own search; do not propose these again",
    facts: matched.map((concept) => ({
      label: concept.name,
      detail: `${concept.id} · ${index.layerName(concept.layerId)} — ${clip(concept.description, 200)}`,
    })),
  };

  const edges = index.graph.relationships
    .filter((rel) => matchedIds.has(rel.sourceId) && matchedIds.has(rel.targetId))
    .slice(0, AI_CONTEXT_LIMITS.researchRelationships);
  const existingEdges: ContextSection = {
    title: "Relationships already recorded between them",
    note: "proposing one of these again is a duplicate",
    facts: edges.map((rel) => ({
      label: rel.type,
      detail: `${rel.sourceId} → ${rel.targetId}`,
    })),
  };

  const evidence = matched
    .flatMap((concept) => index.evidenceFor(concept.id))
    .slice(0, AI_CONTEXT_LIMITS.researchEvidence);
  const existingEvidence: ContextSection = {
    title: "Signals already recorded",
    note: "observable evidence the atlas holds here",
    facts: evidence.map((card) => ({
      label: card.conceptId,
      detail: `${card.kind} ${card.trend} · ${card.signal}`,
    })),
  };

  const sources = [
    ...new Map(
      matched
        .flatMap((concept) => index.sourcesFor(concept.id))
        .map((ref) => [ref.source.id, ref.source]),
    ).values(),
  ].slice(0, AI_CONTEXT_LIMITS.researchSources);
  const existingSources: ContextSection = {
    title: "Sources already cited here",
    note: "cite something new, or say the existing one already covers it",
    facts: sources.map((source) => ({
      label: source.title,
      detail: `${source.kind} · ${source.author}${source.year ? ` (${source.year})` : ""}`,
    })),
  };

  const vocabulary: ContextSection = {
    title: "Vocabulary a proposal must use",
    note: "ids and enum values the atlas accepts",
    facts: [
      {
        label: "Layers",
        detail: index.graph.layers.map((layer) => `${layer.id} (${layer.name})`).join(", "),
      },
      {
        label: "Relationship types",
        detail: Object.entries(RELATIONSHIP_MEANINGS)
          .map(([type, meaning]) => `${type}: A ${meaning.verb} B`)
          .join("; "),
      },
      { label: "Evidence kinds", detail: "METRIC, LOG, TRACE, PROFILE, QUERY_PLAN, PACKET, OS_COUNTER" },
      { label: "Evidence trends", detail: "UP, DOWN, SPIKE, FLAT, PRESENT" },
      { label: "Source kinds", detail: "BOOK, PAPER, RFC, DOCS, ARTICLE, SPEC, TALK" },
    ],
  };

  const gaps = researchGaps(index, matched);
  const gapSection: ContextSection = {
    title: "Gaps the atlas can already see",
    note: "computed from the records, before you add anything",
    facts: gaps.map((gap, i) => ({ label: `Gap ${i + 1}`, detail: gap })),
  };

  return finish(
    "research",
    query,
    `${matched.length} existing entries · ${edges.length} relationships · ${gaps.length} known gaps`,
    null,
    [existing, existingEdges, existingEvidence, existingSources, vocabulary, gapSection],
    matched.map((concept) => concept.id),
  );
}
