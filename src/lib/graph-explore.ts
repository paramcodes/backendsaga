// Exploration algorithms over the domain graph.
// Pure TypeScript: no React, no UI imports, no DOM access.
import type { Concept, DomainGraph, Relationship, RelationshipType } from "@/domain";

export type ExploreFilters = {
  layerIds: ReadonlySet<string>;
  relationshipTypes: ReadonlySet<RelationshipType>;
};

export type Neighborhood = {
  concepts: Concept[];
  relationships: Relationship[];
  /** Hops from the focus concept, keyed by concept id. */
  distance: Record<string, number>;
};

export const MAX_DEPTH = 3;

function allowedRelationships(graph: DomainGraph, filters: ExploreFilters): Relationship[] {
  const inLayer = new Set(
    graph.concepts.filter((concept) => filters.layerIds.has(concept.layerId)).map((c) => c.id),
  );
  return graph.relationships.filter(
    (relationship) =>
      filters.relationshipTypes.has(relationship.type) &&
      inLayer.has(relationship.sourceId) &&
      inLayer.has(relationship.targetId),
  );
}

function adjacencyOf(relationships: Relationship[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    const list = adjacency.get(from);
    if (list) list.push(to);
    else adjacency.set(from, [to]);
  };
  for (const relationship of relationships) {
    add(relationship.sourceId, relationship.targetId);
    add(relationship.targetId, relationship.sourceId);
  }
  return adjacency;
}

/**
 * Breadth-first expansion around one concept, limited to `depth` hops.
 * Returns the induced subgraph: every allowed edge between visible concepts.
 */
export function expandNeighborhood(
  graph: DomainGraph,
  focusId: string,
  depth: number,
  filters: ExploreFilters,
): Neighborhood {
  const focus = graph.concepts.find((concept) => concept.id === focusId);
  if (!focus || !filters.layerIds.has(focus.layerId)) {
    return { concepts: [], relationships: [], distance: {} };
  }

  const edges = allowedRelationships(graph, filters);
  const adjacency = adjacencyOf(edges);
  const limit = Math.min(Math.max(Math.trunc(depth) || 1, 1), MAX_DEPTH);

  const distance: Record<string, number> = { [focusId]: 0 };
  let frontier = [focusId];
  for (let hop = 1; hop <= limit && frontier.length > 0; hop += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const other of adjacency.get(id) ?? []) {
        if (distance[other] !== undefined) continue;
        distance[other] = hop;
        next.push(other);
      }
    }
    frontier = next;
  }

  const concepts = graph.concepts.filter((concept) => distance[concept.id] !== undefined);
  const visible = new Set(concepts.map((concept) => concept.id));
  const relationships = edges.filter(
    (relationship) => visible.has(relationship.sourceId) && visible.has(relationship.targetId),
  );
  return { concepts, relationships, distance };
}

/** Every concept in one layer plus the relationships between them. */
export function layerSubgraph(
  graph: DomainGraph,
  layerId: string,
  filters: ExploreFilters,
): Neighborhood {
  const concepts = graph.concepts.filter((concept) => concept.layerId === layerId);
  const visible = new Set(concepts.map((concept) => concept.id));
  const relationships = graph.relationships.filter(
    (relationship) =>
      filters.relationshipTypes.has(relationship.type) &&
      visible.has(relationship.sourceId) &&
      visible.has(relationship.targetId),
  );
  const distance: Record<string, number> = {};
  for (const concept of concepts) distance[concept.id] = 0;
  return { concepts, relationships, distance };
}

/** How many relationships leave a layer for a different layer. */
export function layerBridgeCount(graph: DomainGraph, layerId: string): number {
  const layerOf = new Map(graph.concepts.map((concept) => [concept.id, concept.layerId]));
  return graph.relationships.filter((relationship) => {
    const source = layerOf.get(relationship.sourceId);
    const target = layerOf.get(relationship.targetId);
    return (source === layerId) !== (target === layerId);
  }).length;
}

export type MatchField = "name" | "description" | "problem" | "mechanism" | "tradeoffs";

export type RankedConcept = {
  concept: Concept;
  score: number;
  matchedOn: MatchField;
};

const FIELD_WEIGHT: Record<MatchField, number> = {
  name: 40,
  description: 18,
  problem: 12,
  mechanism: 10,
  tradeoffs: 6,
};

function scoreTerm(concept: Concept, term: string): { score: number; field: MatchField } | null {
  const name = concept.name.toLowerCase();
  if (name === term) return { score: 120, field: "name" };
  if (name.startsWith(term)) return { score: 90, field: "name" };
  if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(name)) {
    return { score: 70, field: "name" };
  }
  if (name.includes(term)) return { score: 55, field: "name" };

  const fields: [MatchField, string | undefined][] = [
    ["description", concept.description],
    ["problem", concept.problem],
    ["mechanism", concept.mechanism],
    ["tradeoffs", concept.tradeoffs],
  ];
  for (const [field, value] of fields) {
    if (value && value.toLowerCase().includes(term)) return { score: FIELD_WEIGHT[field], field };
  }
  if (concept.id.includes(term)) return { score: 30, field: "name" };
  return null;
}

/**
 * Relevance-ranked search. Every whitespace-separated term must match somewhere;
 * name matches outrank body matches. Stable and deterministic.
 */
export function rankConcepts(concepts: Concept[], query: string, limit?: number): RankedConcept[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const ranked: RankedConcept[] = [];
  for (const concept of concepts) {
    let total = 0;
    let best: MatchField = "description";
    let bestScore = -1;
    let matchedAll = true;
    for (const term of terms) {
      const hit = scoreTerm(concept, term);
      if (!hit) {
        matchedAll = false;
        break;
      }
      total += hit.score;
      if (hit.score > bestScore) {
        bestScore = hit.score;
        best = hit.field;
      }
    }
    if (matchedAll) ranked.push({ concept, score: total, matchedOn: best });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.concept.name.length !== b.concept.name.length) {
      return a.concept.name.length - b.concept.name.length;
    }
    return a.concept.name.localeCompare(b.concept.name);
  });
  return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
}

/**
 * Breadcrumb trail. Revisiting a concept rewinds the trail to it instead of
 * appending a duplicate, so the trail always reads as a path.
 */
export function appendTrail(trail: readonly string[], id: string, max = 8): string[] {
  const existing = trail.indexOf(id);
  if (existing !== -1) return trail.slice(0, existing + 1);
  const next = [...trail, id];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Shortest undirected path between two concepts, as the edges that connect them. */
export function shortestPath(
  graph: DomainGraph,
  fromId: string,
  toId: string,
  filters?: ExploreFilters,
): Relationship[] | null {
  const edges = filters
    ? allowedRelationships(graph, filters)
    : graph.relationships.slice();
  if (fromId === toId) return [];

  const byNode = new Map<string, Relationship[]>();
  for (const relationship of edges) {
    for (const node of [relationship.sourceId, relationship.targetId]) {
      const list = byNode.get(node);
      if (list) list.push(relationship);
      else byNode.set(node, [relationship]);
    }
  }

  const cameFrom = new Map<string, Relationship>();
  const seen = new Set([fromId]);
  let frontier = [fromId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const relationship of byNode.get(node) ?? []) {
        const other = relationship.sourceId === node ? relationship.targetId : relationship.sourceId;
        if (seen.has(other)) continue;
        seen.add(other);
        cameFrom.set(other, relationship);
        if (other === toId) {
          const path: Relationship[] = [];
          let cursor = toId;
          while (cursor !== fromId) {
            const edge = cameFrom.get(cursor);
            if (!edge) return null;
            path.unshift(edge);
            cursor = edge.sourceId === cursor ? edge.targetId : edge.sourceId;
          }
          return path;
        }
        next.push(other);
      }
    }
    frontier = next;
  }
  return null;
}

export type RelationshipMeaning = {
  label: string;
  /** Reads as "<source> <verb> <target>". */
  verb: string;
  summary: string;
  tone: "causal" | "protective" | "structural";
};

export const RELATIONSHIP_MEANINGS: Record<RelationshipType, RelationshipMeaning> = {
  CAUSES: {
    label: "causes",
    verb: "causes",
    summary: "The source directly produces the target. Remove the source and the target disappears.",
    tone: "causal",
  },
  AMPLIFIES: {
    label: "amplifies",
    verb: "amplifies",
    summary:
      "The source makes an existing problem worse. It is a multiplier, not the origin — fixing it alone rarely ends the incident.",
    tone: "causal",
  },
  MITIGATES: {
    label: "mitigates",
    verb: "mitigates",
    summary:
      "The source reduces how often or how badly the target happens. It buys headroom; it does not remove the cause.",
    tone: "protective",
  },
  DEPENDS_ON: {
    label: "depends on",
    verb: "depends on",
    summary: "The source cannot behave correctly unless the target is healthy.",
    tone: "structural",
  },
  TRADEOFF_OF: {
    label: "trade-off of",
    verb: "is a trade-off of",
    summary: "Improving one of these degrades the other. You are choosing a position, not a winner.",
    tone: "structural",
  },
  ALTERNATIVE_TO: {
    label: "alternative to",
    verb: "is an alternative to",
    summary: "Two different answers to the same problem. Pick one deliberately; running both adds confusion.",
    tone: "structural",
  },
  OBSERVED_BY: {
    label: "observed by",
    verb: "is observed by",
    summary: "The target is how the source becomes visible in production telemetry.",
    tone: "structural",
  },
  REQUIRES: {
    label: "requires",
    verb: "requires",
    summary: "The source is only safe or correct when the target is already in place.",
    tone: "structural",
  },
};

export function relationshipSentence(
  type: RelationshipType,
  sourceName: string,
  targetName: string,
): string {
  return `${sourceName} ${RELATIONSHIP_MEANINGS[type].verb} ${targetName}.`;
}
