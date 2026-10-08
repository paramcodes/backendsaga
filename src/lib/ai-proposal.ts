// Research proposals: the shape the model must return, the checks the atlas
// runs on it, and the patch a human can paste into the curated seed.
//
// Pure TypeScript. The model never writes to the graph — this module is the
// only bridge between an answer and the authoring files, and it is manual on
// purpose (AGENTS.md rule 6).
import { z } from "zod";

import type { AtlasContext } from "@/lib/ai-context";

import {
  EVIDENCE_KINDS,
  EVIDENCE_TRENDS,
  RELATIONSHIP_TYPES,
  SOURCE_KINDS,
} from "@/domain/schema";

/**
 * Strict-schema rules for the Responses API: every property required, optional
 * values nullable rather than absent, no bounds, no defaults. Limits are
 * stated in the prompt and clamped here instead.
 */
export const proposedConceptSchema = z.object({
  slug: z.string(),
  name: z.string(),
  layerId: z.string(),
  description: z.string(),
  problem: z.string().nullable(),
  mechanism: z.string().nullable(),
  tradeoffs: z.string().nullable(),
  betterAlternative: z.string().nullable(),
  rationale: z.string(),
});

export const proposedRelationshipSchema = z.object({
  sourceId: z.string(),
  type: z.enum(RELATIONSHIP_TYPES),
  targetId: z.string(),
  rationale: z.string(),
});

export const proposedEvidenceSchema = z.object({
  conceptId: z.string(),
  kind: z.enum(EVIDENCE_KINDS),
  trend: z.enum(EVIDENCE_TRENDS),
  signal: z.string(),
  whatYouSee: z.string(),
  whereToLook: z.string(),
  whyItMatters: z.string(),
  falsePositive: z.string().nullable(),
});

export const proposedSourceSchema = z.object({
  id: z.string(),
  kind: z.enum(SOURCE_KINDS),
  title: z.string(),
  author: z.string(),
  year: z.number().nullable(),
  url: z.string(),
  note: z.string(),
  citesConceptId: z.string(),
});

export const researchProposalSchema = z.object({
  summary: z.string(),
  gaps: z.array(z.string()),
  concepts: z.array(proposedConceptSchema),
  relationships: z.array(proposedRelationshipSchema),
  evidence: z.array(proposedEvidenceSchema),
  sources: z.array(proposedSourceSchema),
  verification: z.array(z.string()),
});

export type ProposedConcept = z.infer<typeof proposedConceptSchema>;
export type ProposedRelationship = z.infer<typeof proposedRelationshipSchema>;
export type ProposedEvidence = z.infer<typeof proposedEvidenceSchema>;
export type ProposedSource = z.infer<typeof proposedSourceSchema>;
export type ResearchProposal = z.infer<typeof researchProposalSchema>;

/** What the model may add in one pass. Review cost is the limit, not tokens. */
export const PROPOSAL_LIMITS = {
  concepts: 4,
  relationships: 6,
  evidence: 4,
  sources: 3,
  gaps: 6,
  verification: 6,
} as const;

export const EMPTY_PROPOSAL: ResearchProposal = {
  summary: "",
  gaps: [],
  concepts: [],
  relationships: [],
  evidence: [],
  sources: [],
  verification: [],
};

export type ProposalIssue = { item: string; problem: string };

export type ReviewedProposal = {
  proposal: ResearchProposal;
  /** Everything dropped, and why — shown to the reviewer, never hidden. */
  issues: ProposalIssue[];
};

export type AtlasVocabulary = {
  conceptIds: Set<string>;
  layerIds: Set<string>;
  sourceIds: Set<string>;
  evidenceIds: Set<string>;
  /** `${sourceId}|${type}|${targetId}` for relationships already recorded. */
  relationshipKeys: Set<string>;
};

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const oneLine = (value: string): string => value.replace(/\s+/g, " ").trim();

/**
 * Everything the model returns passes through here before a human sees it:
 * unknown layers, duplicate ids, dangling endpoints and self-loops are dropped
 * with a reason, and the lists are clamped to the review budget.
 */
export function reviewProposal(raw: ResearchProposal, atlas: AtlasVocabulary): ReviewedProposal {
  const issues: ProposalIssue[] = [];
  const drop = (item: string, problem: string) => issues.push({ item, problem });

  const concepts: ProposedConcept[] = [];
  const proposedIds = new Set<string>();
  for (const candidate of raw.concepts) {
    const name = oneLine(candidate.name);
    const slug = SLUG.test(candidate.slug) ? candidate.slug : slugify(candidate.slug || name);
    if (!name || !slug) {
      drop(candidate.name || candidate.slug || "unnamed entry", "no usable name");
      continue;
    }
    if (atlas.conceptIds.has(slug)) {
      drop(name, `the atlas already has “${slug}”`);
      continue;
    }
    if (proposedIds.has(slug)) {
      drop(name, "proposed twice in one answer");
      continue;
    }
    if (!atlas.layerIds.has(candidate.layerId)) {
      drop(name, `unknown layer “${candidate.layerId}”`);
      continue;
    }
    if (concepts.length >= PROPOSAL_LIMITS.concepts) {
      drop(name, "over the per-answer limit for new entries");
      continue;
    }
    proposedIds.add(slug);
    concepts.push({
      ...candidate,
      slug,
      name,
      description: oneLine(candidate.description),
      rationale: oneLine(candidate.rationale),
    });
  }

  const known = (id: string) => atlas.conceptIds.has(id) || proposedIds.has(id);

  const relationships: ProposedRelationship[] = [];
  const seenEdges = new Set<string>();
  for (const candidate of raw.relationships) {
    const label = `${candidate.sourceId} ${candidate.type} ${candidate.targetId}`;
    if (!known(candidate.sourceId)) {
      drop(label, `“${candidate.sourceId}” is not an entry in the atlas or in this proposal`);
      continue;
    }
    if (!known(candidate.targetId)) {
      drop(label, `“${candidate.targetId}” is not an entry in the atlas or in this proposal`);
      continue;
    }
    if (candidate.sourceId === candidate.targetId) {
      drop(label, "an entry cannot relate to itself");
      continue;
    }
    const key = `${candidate.sourceId}|${candidate.type}|${candidate.targetId}`;
    if (atlas.relationshipKeys.has(key)) {
      drop(label, "already recorded in the atlas");
      continue;
    }
    if (seenEdges.has(key)) {
      drop(label, "proposed twice in one answer");
      continue;
    }
    if (relationships.length >= PROPOSAL_LIMITS.relationships) {
      drop(label, "over the per-answer limit for relationships");
      continue;
    }
    seenEdges.add(key);
    relationships.push({ ...candidate, rationale: oneLine(candidate.rationale) });
  }

  const evidence: ProposedEvidence[] = [];
  for (const candidate of raw.evidence) {
    const label = candidate.signal || candidate.conceptId;
    if (!known(candidate.conceptId)) {
      drop(label, `“${candidate.conceptId}” is not an entry in the atlas or in this proposal`);
      continue;
    }
    if (!oneLine(candidate.signal)) {
      drop(label, "no signal name");
      continue;
    }
    if (evidence.length >= PROPOSAL_LIMITS.evidence) {
      drop(label, "over the per-answer limit for signals");
      continue;
    }
    evidence.push({ ...candidate, signal: oneLine(candidate.signal) });
  }

  const sources: ProposedSource[] = [];
  const seenSources = new Set<string>();
  for (const candidate of raw.sources) {
    const id = SLUG.test(candidate.id) ? candidate.id : slugify(candidate.id || candidate.title);
    const label = oneLine(candidate.title) || id;
    if (!id || !label) {
      drop(label || "untitled source", "no usable title");
      continue;
    }
    if (!/^https?:\/\/\S+$/.test(candidate.url)) {
      drop(label, "no checkable URL");
      continue;
    }
    if (atlas.sourceIds.has(id) || seenSources.has(id)) {
      drop(label, "already in the library");
      continue;
    }
    if (!known(candidate.citesConceptId)) {
      drop(label, `cites “${candidate.citesConceptId}”, which is not an entry`);
      continue;
    }
    if (sources.length >= PROPOSAL_LIMITS.sources) {
      drop(label, "over the per-answer limit for sources");
      continue;
    }
    seenSources.add(id);
    sources.push({ ...candidate, id, title: label });
  }

  return {
    proposal: {
      summary: oneLine(raw.summary),
      gaps: raw.gaps.map(oneLine).filter(Boolean).slice(0, PROPOSAL_LIMITS.gaps),
      concepts,
      relationships,
      evidence,
      sources,
      verification: raw.verification.map(oneLine).filter(Boolean).slice(0, PROPOSAL_LIMITS.verification),
    },
    issues,
  };
}

export const proposalCounts = (proposal: ResearchProposal) => ({
  concepts: proposal.concepts.length,
  relationships: proposal.relationships.length,
  evidence: proposal.evidence.length,
  sources: proposal.sources.length,
});

export const isEmptyProposal = (proposal: ResearchProposal): boolean =>
  proposal.concepts.length === 0 &&
  proposal.relationships.length === 0 &&
  proposal.evidence.length === 0 &&
  proposal.sources.length === 0;

const ts = (value: string): string => JSON.stringify(oneLine(value));

const evidenceId = (proposal: ProposedEvidence, index: number): string =>
  `ev-${slugify(proposal.conceptId).slice(0, 24)}-${slugify(proposal.signal).slice(0, 16) || String(index + 1)}`;

/**
 * The accept path. Not a database write: a patch for the curated seed files,
 * which stay the authoring source. A human pastes it, reviews the diff and
 * re-seeds — so every accepted claim passes through code review.
 */
export function proposalToSeedPatch(proposal: ResearchProposal): string {
  const blocks: string[] = [];

  if (proposal.concepts.length) {
    blocks.push(
      [
        "// src/domain/seed/concepts.ts",
        ...proposal.concepts.map((concept) =>
          [
            `c(${ts(concept.slug)}, ${ts(concept.name)}, ${ts(concept.layerId)},`,
            `  ${ts(concept.description)},`,
            `  ${ts(concept.problem ?? "")},`,
            `  ${ts(concept.mechanism ?? "")},`,
            `  ${ts(concept.tradeoffs ?? "")},`,
            `  ${ts(concept.betterAlternative ?? "")}),`,
          ].join("\n"),
        ),
      ].join("\n"),
    );
  }

  if (proposal.relationships.length) {
    blocks.push(
      [
        "// src/domain/seed/relationships.ts",
        ...proposal.relationships.map(
          (rel) => `r(${ts(rel.sourceId)}, ${ts(rel.type)}, ${ts(rel.targetId)}),`,
        ),
      ].join("\n"),
    );
  }

  if (proposal.evidence.length) {
    blocks.push(
      [
        "// src/domain/seed/evidence.ts",
        ...proposal.evidence.map((card, index) =>
          [
            `e(${ts(evidenceId(card, index))}, ${ts(card.conceptId)}, ${ts(card.kind)}, ${ts(card.trend)},`,
            `  ${ts(card.signal)},`,
            `  ${ts(card.whatYouSee)},`,
            `  ${ts(card.whereToLook)},`,
            `  ${ts(card.whyItMatters)}${card.falsePositive ? `,\n  ${ts(card.falsePositive)}` : ""}),`,
          ].join("\n"),
        ),
      ].join("\n"),
    );
  }

  if (proposal.sources.length) {
    blocks.push(
      [
        "// src/domain/seed/sources.ts",
        ...proposal.sources.map((source) =>
          [
            `s(${ts(source.id)}, ${ts(source.kind)}, ${ts(source.title)}, ${ts(source.author)}, ${source.year ?? "undefined"},`,
            `  ${ts(source.url)},`,
            `  ${ts(source.note)}),`,
            `l(${ts(source.citesConceptId)}, ${ts(source.id)}, ${ts(source.note)}),`,
          ].join("\n"),
        ),
      ].join("\n"),
    );
  }

  if (blocks.length === 0) {
    return "// Nothing to apply: this proposal adds no records.";
  }

  return [
    "// Reviewed research proposal — paste into the curated seed, then run:",
    "//   bun scripts/seed-database.ts",
    "",
    ...blocks,
  ].join("\n\n");
}

/** A stored proposal, as the review queue shows it. */
export const PROPOSAL_STATUSES = ["pending", "accepted", "rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export type ResearchProposalRecord = {
  id: string;
  topic: string;
  question: string;
  status: ProposalStatus;
  model: string;
  runId: string | null;
  /** Fingerprint of the context the answer was built from. */
  contextHash: string;
  /** The context itself, kept so an old proposal can still be audited. */
  context: AtlasContext | null;
  summary: string;
  proposal: ResearchProposal;
  issues: ProposalIssue[];
  reviewNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type ProposalRow = {
  id: string;
  topic: string;
  question: string;
  status: string;
  model: string;
  run_id: string | null;
  context_hash: string;
  context: unknown;
  summary: string;
  proposal: unknown;
  issues: unknown;
  review_note: string | null;
  created_at: string;
  decided_at: string | null;
};

const issueListSchema = z.array(z.object({ item: z.string(), problem: z.string() }));

const contextFactSchema = z.object({ label: z.string(), detail: z.string() });
const contextSchema = z.object({
  kind: z.enum(["explain", "diagnose", "research"]),
  title: z.string(),
  subtitle: z.string(),
  question: z.string().nullable(),
  sections: z.array(
    z.object({ title: z.string(), note: z.string(), facts: z.array(contextFactSchema) }),
  ),
  conceptIds: z.array(z.string()),
  prompt: z.string(),
  hash: z.string(),
});

/**
 * Stored rows are read defensively: a row written by an older build still has
 * to render, so unreadable parts degrade to empty instead of throwing.
 */
export function toProposalRecord(row: ProposalRow): ResearchProposalRecord {
  const proposal = researchProposalSchema.safeParse(row.proposal);
  const issues = issueListSchema.safeParse(row.issues);
  const context = contextSchema.safeParse(row.context);
  const status = (PROPOSAL_STATUSES as readonly string[]).includes(row.status)
    ? (row.status as ProposalStatus)
    : "pending";

  return {
    id: row.id,
    topic: row.topic,
    question: row.question,
    status,
    model: row.model,
    runId: row.run_id,
    contextHash: row.context_hash,
    context: context.success ? context.data : null,
    summary: row.summary,
    proposal: proposal.success ? proposal.data : EMPTY_PROPOSAL,
    issues: issues.success ? issues.data : [],
    reviewNote: row.review_note,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}
