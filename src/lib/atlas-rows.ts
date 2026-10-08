// Row → domain mappers. Pure TypeScript: no I/O, no React, no Supabase client,
// so the translation between the database shape (snake_case, nulls) and the
// domain model (camelCase, optionals) can be tested without a database.
import {
  conceptSchema,
  conceptSourceSchema,
  evidenceSchema,
  incidentSchema,
  layerSchema,
  relationshipSchema,
  sourceSchema,
  symptomEvidenceSchema,
  symptomSchema,
  type Concept,
  type ConceptSource,
  type DomainGraph,
  type Evidence,
  type Incident,
  type IncidentCatalog,
  type Layer,
  type Relationship,
  type Source,
  type Symptom,
  type SymptomEvidence,
} from "@/domain";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
export type LayerRow = Tables["layers"]["Row"];
export type ConceptRow = Tables["concepts"]["Row"];
export type RelationshipRow = Tables["relationships"]["Row"];
export type EvidenceRow = Tables["evidence"]["Row"];
export type SourceRow = Tables["sources"]["Row"];
export type ConceptSourceRow = Tables["concept_sources"]["Row"];
export type SymptomRow = Tables["symptoms"]["Row"];
export type SymptomEvidenceRow = Tables["symptom_evidence"]["Row"];
export type IncidentRow = Tables["incidents"]["Row"];

/** `exactOptionalPropertyTypes` forbids `{ key: undefined }`, so omit instead. */
const opt = <K extends string, V>(key: K, value: V | null): Record<K, V> | Record<string, never> =>
  value === null ? {} : ({ [key]: value } as Record<K, V>);

export function toLayer(row: LayerRow): Layer {
  return layerSchema.parse({
    id: row.id,
    name: row.name,
    order: row.sort_order,
    description: row.description,
  });
}

export function toConcept(row: ConceptRow): Concept {
  return conceptSchema.parse({
    id: row.id,
    slug: row.slug,
    name: row.name,
    layerId: row.layer_id,
    description: row.description,
    ...opt("problem", row.problem),
    ...opt("why", row.why),
    ...opt("mechanism", row.mechanism),
    ...opt("tradeoffs", row.tradeoffs),
    ...opt("betterAlternative", row.better_alternative),
  });
}

export function toRelationship(row: RelationshipRow): Relationship {
  return relationshipSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    type: row.type,
  });
}

export function toEvidence(row: EvidenceRow): Evidence {
  return evidenceSchema.parse({
    id: row.id,
    conceptId: row.concept_id,
    kind: row.kind,
    trend: row.trend,
    signal: row.signal,
    whatYouSee: row.what_you_see,
    whereToLook: row.where_to_look,
    whyItMatters: row.why_it_matters,
    ...opt("falsePositive", row.false_positive),
  });
}

export function toSource(row: SourceRow): Source {
  return sourceSchema.parse({
    id: row.id,
    kind: row.kind,
    title: row.title,
    author: row.author,
    url: row.url,
    note: row.note,
    ...opt("year", row.year),
  });
}

export function toConceptSource(row: ConceptSourceRow): ConceptSource {
  return conceptSourceSchema.parse({
    conceptId: row.concept_id,
    sourceId: row.source_id,
    relevance: row.relevance,
  });
}

export function toSymptom(row: SymptomRow): Symptom {
  return symptomSchema.parse({
    id: row.id,
    name: row.name,
    layerId: row.layer_id,
    description: row.description,
    signal: row.signal,
    trend: row.trend,
  });
}

export function toSymptomEvidence(row: SymptomEvidenceRow): SymptomEvidence {
  return symptomEvidenceSchema.parse({
    symptomId: row.symptom_id,
    evidenceId: row.evidence_id,
    strength: row.strength,
  });
}

export function toIncident(row: IncidentRow): Incident {
  return incidentSchema.parse({
    id: row.id,
    slug: row.slug,
    title: row.title,
    severity: row.severity,
    summary: row.summary,
    narrative: row.narrative,
    symptomIds: row.symptom_ids,
    // `timeline` is jsonb; the schema is the gate between the database and the app.
    timeline: row.timeline,
    rootCauseId: row.root_cause_id,
    contributingIds: row.contributing_ids,
    resolution: row.resolution,
    lesson: row.lesson,
  });
}

export type IncidentRows = {
  symptoms: SymptomRow[];
  symptomEvidence: SymptomEvidenceRow[];
  incidents?: IncidentRow[];
};

/** Assembles the incident catalog from table rows. */
export function toIncidentCatalog(rows: IncidentRows): IncidentCatalog {
  return {
    symptoms: rows.symptoms.map(toSymptom),
    symptomEvidence: rows.symptomEvidence.map(toSymptomEvidence),
    incidents: (rows.incidents ?? []).map(toIncident),
  };
}

export type GraphRows = {
  layers: LayerRow[];
  concepts: ConceptRow[];
  relationships: RelationshipRow[];
  evidence?: EvidenceRow[];
  sources?: SourceRow[];
  conceptSources?: ConceptSourceRow[];
};

/** Assembles a full domain graph from table rows. Missing tables come back empty. */
export function toDomainGraph(rows: GraphRows): DomainGraph {
  return {
    layers: rows.layers.map(toLayer).sort((a, b) => a.order - b.order),
    concepts: rows.concepts.map(toConcept),
    relationships: rows.relationships.map(toRelationship),
    evidence: (rows.evidence ?? []).map(toEvidence),
    sources: (rows.sources ?? []).map(toSource),
    conceptSources: (rows.conceptSources ?? []).map(toConceptSource),
  };
}

/** Shape of the `atlas_stats()` database function. */
export type AtlasStats = {
  layers: number;
  concepts: number;
  relationships: number;
  evidence: number;
  sources: number;
  symptoms: number;
  incidents: number;
  conceptsWithEvidence: number;
  conceptsWithSources: number;
  byLayer: Record<string, number>;
};

const numeric = (value: unknown): number => (typeof value === "number" ? value : 0);

export function toAtlasStats(json: unknown): AtlasStats {
  const raw = (json ?? {}) as Record<string, unknown>;
  const byLayerRaw = (raw["byLayer"] ?? {}) as Record<string, unknown>;
  const byLayer: Record<string, number> = {};
  for (const [key, value] of Object.entries(byLayerRaw)) byLayer[key] = numeric(value);
  return {
    layers: numeric(raw["layers"]),
    concepts: numeric(raw["concepts"]),
    relationships: numeric(raw["relationships"]),
    evidence: numeric(raw["evidence"]),
    sources: numeric(raw["sources"]),
    symptoms: numeric(raw["symptoms"]),
    incidents: numeric(raw["incidents"]),
    conceptsWithEvidence: numeric(raw["conceptsWithEvidence"]),
    conceptsWithSources: numeric(raw["conceptsWithSources"]),
    byLayer,
  };
}
