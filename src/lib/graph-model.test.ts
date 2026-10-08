import { describe, expect, it } from "vitest";
import { domainGraph, RELATIONSHIP_TYPES } from "@/domain";
import { buildGraphView } from "./graph-model";

const allLayers = new Set(domainGraph.layers.map((layer) => layer.id));
const allRelationships = new Set(RELATIONSHIP_TYPES);

describe("graph view adapter", () => {
  it("builds a focused neighbourhood around one concept", () => {
    const view = buildGraphView(domainGraph, {
      mode: "focus",
      focusId: "connection-pool-exhaustion",
      layerIds: allLayers,
      relationshipTypes: allRelationships,
    });

    expect(view.concepts.some((concept) => concept.id === "connection-pool-exhaustion")).toBe(true);
    expect(view.relationships.length).toBeGreaterThan(0);
    const directIds = new Set(
      domainGraph.relationships.flatMap((relationship) => {
        if (relationship.sourceId === "connection-pool-exhaustion") return [relationship.targetId];
        if (relationship.targetId === "connection-pool-exhaustion") return [relationship.sourceId];
        return [];
      }),
    );
    expect(
      view.concepts.every(
        (concept) => concept.id === "connection-pool-exhaustion" || directIds.has(concept.id),
      ),
    ).toBe(true);
  });

  it("returns the complete atlas when every filter is enabled", () => {
    const view = buildGraphView(domainGraph, {
      mode: "atlas",
      focusId: "tail-latency",
      layerIds: allLayers,
      relationshipTypes: allRelationships,
    });

    expect(view.concepts).toHaveLength(domainGraph.concepts.length);
    expect(view.relationships).toHaveLength(domainGraph.relationships.length);
  });

  it("removes nodes and edges excluded by filters", () => {
    const view = buildGraphView(domainGraph, {
      mode: "atlas",
      focusId: "tail-latency",
      layerIds: new Set(["network"]),
      relationshipTypes: new Set(["CAUSES"]),
    });

    expect(view.concepts.every((concept) => concept.layerId === "network")).toBe(true);
    expect(view.relationships.every((relationship) => relationship.type === "CAUSES")).toBe(true);
    expect(
      view.relationships.every((relationship) =>
        view.concepts.some((concept) => concept.id === relationship.sourceId || concept.id === relationship.targetId),
      ),
    ).toBe(true);
  });
});
