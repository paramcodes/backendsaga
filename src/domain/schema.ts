// Canonical domain model. Pure TypeScript + Zod. Must not import React or UI code.
import { z } from "zod";

export const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case slug");

export const layerSchema = z.object({
  id: slugSchema,
  name: z.string().min(1),
  order: z.number().int().positive(),
  description: z.string().min(1),
});

export const conceptSchema = z.object({
  id: slugSchema,
  slug: slugSchema,
  name: z.string().min(1),
  layerId: slugSchema,
  description: z.string().min(1),
  problem: z.string().optional(),
  why: z.string().optional(),
  mechanism: z.string().optional(),
  tradeoffs: z.string().optional(),
  betterAlternative: z.string().optional(),
});

export const RELATIONSHIP_TYPES = [
  "CAUSES",
  "AMPLIFIES",
  "MITIGATES",
  "DEPENDS_ON",
  "TRADEOFF_OF",
  "ALTERNATIVE_TO",
  "OBSERVED_BY",
  "REQUIRES",
] as const;

export const relationshipSchema = z.object({
  id: z.string().min(1),
  sourceId: slugSchema,
  targetId: slugSchema,
  type: z.enum(RELATIONSHIP_TYPES),
});

export const EVIDENCE_KINDS = [
  "METRIC",
  "LOG",
  "TRACE",
  "PROFILE",
  "QUERY_PLAN",
  "PACKET",
  "OS_COUNTER",
] as const;

/** Direction the signal moves when the concept is active. */
export const EVIDENCE_TRENDS = ["UP", "DOWN", "SPIKE", "FLAT", "PRESENT"] as const;

/**
 * An evidence card: the bridge between an abstract concept and something an
 * engineer can actually observe. `signal` is OpenTelemetry-compatible — a
 * metric name, span attribute, log pattern or OS counter.
 */
export const evidenceSchema = z.object({
  id: slugSchema,
  conceptId: slugSchema,
  kind: z.enum(EVIDENCE_KINDS),
  trend: z.enum(EVIDENCE_TRENDS),
  signal: z.string().min(1),
  /** What you would see. */
  whatYouSee: z.string().min(1),
  /** Where you would look for it. */
  whereToLook: z.string().min(1),
  /** Why that signal matters. */
  whyItMatters: z.string().min(1),
  /** What else can produce the same signal. */
  falsePositive: z.string().optional(),
});

export const SOURCE_KINDS = ["BOOK", "PAPER", "RFC", "DOCS", "ARTICLE", "SPEC", "TALK"] as const;

/**
 * A primary reference. The atlas is a reading of the literature, not a
 * replacement for it: every claim should be traceable to something written by
 * people who measured it.
 */
export const sourceSchema = z.object({
  id: slugSchema,
  kind: z.enum(SOURCE_KINDS),
  title: z.string().min(1),
  author: z.string().min(1),
  year: z.number().int().min(1960).max(2100).optional(),
  url: z.string().url(),
  /** Why this reference earns its place in the library. */
  note: z.string().min(1),
});

/** Which part of a source speaks to a concept. */
export const conceptSourceSchema = z.object({
  conceptId: slugSchema,
  sourceId: slugSchema,
  relevance: z.string().min(1),
});

/**
 * A symptom is what the person on call actually sees: an observation stated
 * without a cause. Symptoms are deliberately separate from concepts — "p99 is
 * up" is not a concept, it is the thing you walk back from.
 */
export const symptomSchema = z.object({
  id: slugSchema,
  name: z.string().min(1),
  /** Where this is observed — a layer id, used for grouping. */
  layerId: slugSchema,
  /** The observation, phrased without naming a cause. */
  description: z.string().min(1),
  /** The canonical signal you would read it from. */
  signal: z.string().min(1),
  trend: z.enum(EVIDENCE_TRENDS),
});

/**
 * How strongly a symptom points at one evidence card. DIRECT means the card
 * *is* this observation; SUPPORTING means the card is consistent with it.
 */
export const SYMPTOM_STRENGTHS = ["DIRECT", "SUPPORTING"] as const;

export const symptomEvidenceSchema = z.object({
  symptomId: slugSchema,
  evidenceId: slugSchema,
  strength: z.enum(SYMPTOM_STRENGTHS),
});

export const SEVERITIES = ["SEV1", "SEV2", "SEV3", "SEV4"] as const;

/** One step of the story, as it was seen at the time. */
export const incidentEventSchema = z.object({
  /** Clock label as written in the timeline, e.g. "14:02". */
  at: z.string().min(1),
  note: z.string().min(1),
  /** The symptom that became visible at this moment, if any. */
  symptomId: slugSchema.optional(),
});

/**
 * A worked scenario: symptoms as they were observed, and — for teaching — the
 * cause that was eventually confirmed. The engine never reads `rootCauseId`;
 * it exists so a reader can compare the ranking with what was true.
 */
export const incidentSchema = z.object({
  id: slugSchema,
  slug: slugSchema,
  title: z.string().min(1),
  severity: z.enum(SEVERITIES),
  summary: z.string().min(1),
  /** What happened, in prose. */
  narrative: z.string().min(1),
  symptomIds: z.array(slugSchema).min(2),
  timeline: z.array(incidentEventSchema).min(2),
  rootCauseId: slugSchema,
  contributingIds: z.array(slugSchema),
  resolution: z.string().min(1),
  lesson: z.string().min(1),
});

export type Layer = z.infer<typeof layerSchema>;
export type Concept = z.infer<typeof conceptSchema>;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];
export type Relationship = z.infer<typeof relationshipSchema>;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export type EvidenceTrend = (typeof EVIDENCE_TRENDS)[number];
export type Evidence = z.infer<typeof evidenceSchema>;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export type Source = z.infer<typeof sourceSchema>;
export type ConceptSource = z.infer<typeof conceptSourceSchema>;
export type Symptom = z.infer<typeof symptomSchema>;
export type SymptomStrength = (typeof SYMPTOM_STRENGTHS)[number];
export type SymptomEvidence = z.infer<typeof symptomEvidenceSchema>;
export type Severity = (typeof SEVERITIES)[number];
export type IncidentEvent = z.infer<typeof incidentEventSchema>;
export type Incident = z.infer<typeof incidentSchema>;

export type DomainGraph = {
  layers: Layer[];
  concepts: Concept[];
  relationships: Relationship[];
  evidence: Evidence[];
  sources: Source[];
  conceptSources: ConceptSource[];
};

/**
 * Incidents sit beside the knowledge graph rather than inside it: the graph is
 * what is true in general, the catalog is what happened once.
 */
export type IncidentCatalog = {
  symptoms: Symptom[];
  symptomEvidence: SymptomEvidence[];
  incidents: Incident[];
};
