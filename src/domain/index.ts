// Domain graph: the curated seed, queries and validation. No React imports.
//
// The seed in `seed/*` is the canonical authoring surface. At runtime the same
// shape is served from the database (see src/lib/atlas.functions.ts); anything
// that reads a graph should go through `createGraphIndex` so it works with
// either source.
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
  type DomainGraph,
  type IncidentCatalog,
} from "./schema";
import { createGraphIndex } from "./graph-index";
import { layers } from "./seed/layers";
import { concepts } from "./seed/concepts";
import { relationships } from "./seed/relationships";
import { evidence } from "./seed/evidence";
import { conceptSources, sources } from "./seed/sources";
import { symptomEvidence, symptoms } from "./seed/symptoms";
import { incidents } from "./seed/incidents";

export * from "./schema";
export * from "./graph-index";

export const domainGraph: DomainGraph = {
  layers,
  concepts,
  relationships,
  evidence,
  sources,
  conceptSources,
};

/** Worked scenarios and the observations that open them. */
export const incidentCatalog: IncidentCatalog = { symptoms, symptomEvidence, incidents };

/** Index over the curated seed. Runtime screens use the database copy instead. */
export const seedIndex = createGraphIndex(domainGraph);

export const getConcept = seedIndex.getConcept;
export const getLayer = seedIndex.getLayer;
export const layerName = seedIndex.layerName;
export const conceptsInLayer = seedIndex.conceptsInLayer;
export const relationshipsFor = seedIndex.relationshipsFor;
export const evidenceFor = seedIndex.evidenceFor;
export const sourcesFor = seedIndex.sourcesFor;
export const degree = seedIndex.degree;
export const neighbors = seedIndex.neighbors;
export const conceptsWithEvidence = seedIndex.conceptsWithEvidence;
export const evidenceCoverage = seedIndex.evidenceCoverage;

export function searchConcepts(q: string): Concept[] {
  const s = q.trim().toLowerCase();
  if (!s) return concepts;
  return concepts.filter((c) =>
    [c.name, c.description, c.problem, c.mechanism]
      .filter(Boolean)
      .some((t) => t!.toLowerCase().includes(s)),
  );
}

/** Returns a list of problems; empty means the graph is valid. */
export function validateGraph(g: DomainGraph): string[] {
  const errors: string[] = [];
  const dupes = (ids: string[], label: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`duplicate ${label} id: ${id}`);
      seen.add(id);
    }
  };
  dupes(g.layers.map((l) => l.id), "layer");
  dupes(g.concepts.map((c) => c.id), "concept");
  dupes(g.concepts.map((c) => c.slug), "concept slug");
  dupes(g.relationships.map((r) => r.id), "relationship");
  dupes(g.evidence.map((e) => e.id), "evidence");
  dupes(g.sources.map((s) => s.id), "source");
  dupes(g.conceptSources.map((cs) => `${cs.conceptId}--${cs.sourceId}`), "concept source");

  const check = (
    schema: { safeParse: (v: unknown) => { success: boolean; error?: { message: string } } },
    v: unknown,
    label: string,
  ) => {
    const res = schema.safeParse(v);
    if (!res.success) errors.push(`invalid ${label}: ${res.error?.message}`);
  };
  g.layers.forEach((l) => check(layerSchema, l, `layer ${l.id}`));
  g.concepts.forEach((c) => check(conceptSchema, c, `concept ${c.id}`));
  g.relationships.forEach((r) => check(relationshipSchema, r, `relationship ${r.id}`));
  g.evidence.forEach((e) => check(evidenceSchema, e, `evidence ${e.id}`));
  g.sources.forEach((s) => check(sourceSchema, s, `source ${s.id}`));
  g.conceptSources.forEach((cs) =>
    check(conceptSourceSchema, cs, `concept source ${cs.conceptId}/${cs.sourceId}`),
  );

  const layerIds = new Set(g.layers.map((l) => l.id));
  const conceptIds = new Set(g.concepts.map((c) => c.id));
  const sourceIds = new Set(g.sources.map((s) => s.id));
  for (const c of g.concepts) {
    if (!layerIds.has(c.layerId)) errors.push(`concept ${c.id} has unknown layer ${c.layerId}`);
  }
  for (const r of g.relationships) {
    if (!conceptIds.has(r.sourceId)) errors.push(`relationship ${r.id} dangling source ${r.sourceId}`);
    if (!conceptIds.has(r.targetId)) errors.push(`relationship ${r.id} dangling target ${r.targetId}`);
    if (r.sourceId === r.targetId) errors.push(`relationship ${r.id} is a self-loop`);
  }
  for (const e of g.evidence) {
    if (!conceptIds.has(e.conceptId)) errors.push(`evidence ${e.id} dangling concept ${e.conceptId}`);
  }
  for (const cs of g.conceptSources) {
    if (!conceptIds.has(cs.conceptId)) errors.push(`source link dangling concept ${cs.conceptId}`);
    if (!sourceIds.has(cs.sourceId)) errors.push(`source link dangling source ${cs.sourceId}`);
  }
  return errors;
}

/**
 * Incidents validate against the graph, not only against themselves: a symptom
 * that points at missing evidence, or a scenario whose root cause is not a
 * concept, is a broken scenario.
 */
export function validateIncidents(g: DomainGraph, catalog: IncidentCatalog): string[] {
  const errors: string[] = [];
  const layerIds = new Set(g.layers.map((l) => l.id));
  const conceptIds = new Set(g.concepts.map((c) => c.id));
  const evidenceIds = new Set(g.evidence.map((e) => e.id));
  const symptomIds = new Set(catalog.symptoms.map((s) => s.id));

  const seenSymptom = new Set<string>();
  for (const symptom of catalog.symptoms) {
    const parsed = symptomSchema.safeParse(symptom);
    if (!parsed.success) errors.push(`invalid symptom ${symptom.id}: ${parsed.error.message}`);
    if (seenSymptom.has(symptom.id)) errors.push(`duplicate symptom id: ${symptom.id}`);
    seenSymptom.add(symptom.id);
    if (!layerIds.has(symptom.layerId)) {
      errors.push(`symptom ${symptom.id} has unknown layer ${symptom.layerId}`);
    }
  }

  const seenLink = new Set<string>();
  for (const link of catalog.symptomEvidence) {
    const parsed = symptomEvidenceSchema.safeParse(link);
    if (!parsed.success) {
      errors.push(`invalid symptom link ${link.symptomId}/${link.evidenceId}: ${parsed.error.message}`);
    }
    const key = `${link.symptomId}--${link.evidenceId}`;
    if (seenLink.has(key)) errors.push(`duplicate symptom link: ${key}`);
    seenLink.add(key);
    if (!symptomIds.has(link.symptomId)) errors.push(`link references unknown symptom ${link.symptomId}`);
    if (!evidenceIds.has(link.evidenceId)) {
      errors.push(`link references unknown evidence ${link.evidenceId}`);
    }
  }

  const seenIncident = new Set<string>();
  for (const incident of catalog.incidents) {
    const parsed = incidentSchema.safeParse(incident);
    if (!parsed.success) errors.push(`invalid incident ${incident.id}: ${parsed.error.message}`);
    if (seenIncident.has(incident.id)) errors.push(`duplicate incident id: ${incident.id}`);
    seenIncident.add(incident.id);
    for (const id of incident.symptomIds) {
      if (!symptomIds.has(id)) errors.push(`incident ${incident.id} references unknown symptom ${id}`);
    }
    for (const event of incident.timeline) {
      if (event.symptomId && !symptomIds.has(event.symptomId)) {
        errors.push(`incident ${incident.id} timeline references unknown symptom ${event.symptomId}`);
      }
    }
    if (!conceptIds.has(incident.rootCauseId)) {
      errors.push(`incident ${incident.id} root cause ${incident.rootCauseId} is not a concept`);
    }
    for (const id of incident.contributingIds) {
      if (!conceptIds.has(id)) {
        errors.push(`incident ${incident.id} contributing concept ${id} does not exist`);
      }
    }
  }
  return errors;
}

export { layers, concepts, relationships, evidence, sources, conceptSources };
export { symptoms, symptomEvidence, incidents };
