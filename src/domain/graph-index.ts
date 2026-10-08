// Query helpers over any graph — the curated seed, or the same data loaded
// from the database at runtime. Pure TypeScript: no React, no I/O.
import type { Concept, DomainGraph, Evidence, Relationship, Source } from "./schema";

export type Neighbor = { rel: Relationship; other: Concept; outgoing: boolean };
export type ConceptSourceRef = { source: Source; relevance: string };

export type GraphIndex = {
  graph: DomainGraph;
  getConcept: (id: string) => Concept | undefined;
  getLayer: (id: string) => DomainGraph["layers"][number] | undefined;
  layerName: (id: string) => string;
  conceptsInLayer: (layerId: string) => Concept[];
  relationshipsFor: (id: string) => Relationship[];
  evidenceFor: (id: string) => Evidence[];
  sourcesFor: (id: string) => ConceptSourceRef[];
  conceptsForSource: (sourceId: string) => Concept[];
  degree: (id: string) => number;
  neighbors: (id: string) => Neighbor[];
  conceptsWithEvidence: () => string[];
  evidenceCoverage: () => { covered: number; total: number; ratio: number };
};

const groupBy = <T>(items: T[], key: (item: T) => string): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
};

export function createGraphIndex(graph: DomainGraph): GraphIndex {
  const conceptById = new Map(graph.concepts.map((c) => [c.id, c]));
  const layerById = new Map(graph.layers.map((l) => [l.id, l]));
  const sourceById = new Map(graph.sources.map((s) => [s.id, s]));
  const byLayer = groupBy(graph.concepts, (c) => c.layerId);
  const evidenceByConcept = groupBy(graph.evidence, (e) => e.conceptId);
  const linksByConcept = groupBy(graph.conceptSources, (cs) => cs.conceptId);
  const linksBySource = groupBy(graph.conceptSources, (cs) => cs.sourceId);

  const incident = new Map<string, Relationship[]>();
  for (const rel of graph.relationships) {
    for (const id of [rel.sourceId, rel.targetId]) {
      const bucket = incident.get(id);
      if (bucket) bucket.push(rel);
      else incident.set(id, [rel]);
    }
  }

  const relationshipsFor = (id: string) => incident.get(id) ?? [];
  const evidenceFor = (id: string) => evidenceByConcept.get(id) ?? [];

  return {
    graph,
    getConcept: (id) => conceptById.get(id),
    getLayer: (id) => layerById.get(id),
    layerName: (id) => layerById.get(id)?.name ?? id,
    conceptsInLayer: (layerId) => byLayer.get(layerId) ?? [],
    relationshipsFor,
    evidenceFor,
    sourcesFor: (id) =>
      (linksByConcept.get(id) ?? []).flatMap((link) => {
        const source = sourceById.get(link.sourceId);
        return source ? [{ source, relevance: link.relevance }] : [];
      }),
    conceptsForSource: (sourceId) =>
      (linksBySource.get(sourceId) ?? []).flatMap((link) => {
        const concept = conceptById.get(link.conceptId);
        return concept ? [concept] : [];
      }),
    degree: (id) => relationshipsFor(id).length,
    neighbors: (id) =>
      relationshipsFor(id).flatMap((rel) => {
        const outgoing = rel.sourceId === id;
        const other = conceptById.get(outgoing ? rel.targetId : rel.sourceId);
        return other ? [{ rel, outgoing, other }] : [];
      }),
    conceptsWithEvidence: () => [...new Set(graph.evidence.map((e) => e.conceptId))],
    evidenceCoverage: () => {
      const covered = new Set(graph.evidence.map((e) => e.conceptId)).size;
      const total = graph.concepts.length;
      return { covered, total, ratio: total === 0 ? 0 : covered / total };
    },
  };
}
