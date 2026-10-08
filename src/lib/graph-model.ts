import type { Concept, DomainGraph, Relationship, RelationshipType } from "@/domain";
import { expandNeighborhood, layerSubgraph, type ExploreFilters } from "./graph-explore";

export type GraphMode = "focus" | "atlas" | "layer";

export type GraphFilters = ExploreFilters & {
  mode: GraphMode;
  focusId: string;
  /** Hops kept around the focus concept in focus mode. Defaults to 1. */
  depth?: number | undefined;
  /** Layer shown in layer mode. */
  layerFocusId?: string | undefined;
};

export type GraphView = {
  concepts: Concept[];
  relationships: Relationship[];
  /** Hops from the focus concept inside this view. */
  distance: Record<string, number>;
};

function atlasView(graph: DomainGraph, filters: GraphFilters): GraphView {
  const concepts = graph.concepts.filter((concept) => filters.layerIds.has(concept.layerId));
  const visible = new Set(concepts.map((concept) => concept.id));
  const relationships = graph.relationships.filter(
    (relationship) =>
      filters.relationshipTypes.has(relationship.type) &&
      visible.has(relationship.sourceId) &&
      visible.has(relationship.targetId),
  );
  return { concepts, relationships, distance: distancesWithin(relationships, filters.focusId) };
}

/** BFS distances from the focus concept, computed inside the visible subgraph. */
function distancesWithin(relationships: Relationship[], focusId: string): Record<string, number> {
  const adjacency = new Map<string, string[]>();
  for (const relationship of relationships) {
    for (const [from, to] of [
      [relationship.sourceId, relationship.targetId],
      [relationship.targetId, relationship.sourceId],
    ] as const) {
      const list = adjacency.get(from);
      if (list) list.push(to);
      else adjacency.set(from, [to]);
    }
  }
  const distance: Record<string, number> = { [focusId]: 0 };
  let frontier = [focusId];
  let hop = 1;
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const other of adjacency.get(id) ?? []) {
        if (distance[other] !== undefined) continue;
        distance[other] = hop;
        next.push(other);
      }
    }
    frontier = next;
    hop += 1;
  }
  return distance;
}

export function buildGraphView(graph: DomainGraph, filters: GraphFilters): GraphView {
  if (filters.mode === "atlas") return atlasView(graph, filters);
  if (filters.mode === "layer") {
    return layerSubgraph(graph, filters.layerFocusId ?? "", filters);
  }
  return expandNeighborhood(graph, filters.focusId, filters.depth ?? 1, filters);
}

export function relationshipLabel(type: RelationshipType): string {
  return type.replaceAll("_", " ").toLowerCase();
}
