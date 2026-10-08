import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Concept, Relationship } from "@/domain";

export type PositionedConcept = Concept & { x: number; y: number };

const NODE_WIDTH = 176;
const NODE_HEIGHT = 56;

export type DiagramNode = { id: string; width?: number; height?: number };
export type DiagramEdge = { id: string; source: string; target: string };
export type Point = { x: number; y: number };

/**
 * One ELK call, one answer: node id → position. Every canvas in the app goes
 * through here, so layout stays the layout engine's job and the domain records
 * stay presentation-agnostic.
 */
export async function layoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  options: Record<string, string> = {},
): Promise<Map<string, Point>> {
  if (nodes.length === 0) return new Map();

  const elk = new ELK();
  const known = new Set(nodes.map((node) => node.id));
  const graph: ElkNode = {
    id: "atlas",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "44",
      "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.edgeRouting": "SPLINES",
      ...options,
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: node.width ?? NODE_WIDTH,
      height: node.height ?? NODE_HEIGHT,
    })),
    // ELK throws on an edge that names a node it was never given.
    edges: edges
      .filter((edge) => known.has(edge.source) && known.has(edge.target))
      .map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  };

  const result = await elk.layout(graph);
  return new Map(
    (result.children ?? []).map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]),
  );
}

export async function layoutGraph(
  concepts: Concept[],
  relationships: Relationship[],
): Promise<PositionedConcept[]> {
  if (concepts.length === 0) return [];

  const positions = await layoutDiagram(
    concepts.map((concept) => ({ id: concept.id })),
    relationships.map((relationship) => ({
      id: relationship.id,
      source: relationship.sourceId,
      target: relationship.targetId,
    })),
  );

  return concepts.map((concept, index) => {
    const position = positions.get(concept.id);
    return {
      ...concept,
      x: position?.x ?? (index % 6) * (NODE_WIDTH + 50),
      y: position?.y ?? Math.floor(index / 6) * (NODE_HEIGHT + 50),
    };
  });
}
