import { describe, expect, it } from "vitest";
import { domainGraph, RELATIONSHIP_TYPES, concepts } from "@/domain";
import {
  appendTrail,
  expandNeighborhood,
  layerBridgeCount,
  layerSubgraph,
  rankConcepts,
  relationshipSentence,
  shortestPath,
} from "./graph-explore";

const filters = {
  layerIds: new Set(domainGraph.layers.map((layer) => layer.id)),
  relationshipTypes: new Set(RELATIONSHIP_TYPES),
};

const directNeighbors = (id: string) =>
  new Set(
    domainGraph.relationships.flatMap((relationship) => {
      if (relationship.sourceId === id) return [relationship.targetId];
      if (relationship.targetId === id) return [relationship.sourceId];
      return [];
    }),
  );

describe("expandNeighborhood", () => {
  it("keeps the focus concept and its direct neighbours at depth 1", () => {
    const hood = expandNeighborhood(domainGraph, "retry-storm", 1, filters);
    const direct = directNeighbors("retry-storm");

    expect(hood.distance["retry-storm"]).toBe(0);
    expect(hood.concepts.map((c) => c.id).sort()).toEqual(
      ["retry-storm", ...direct].sort(),
    );
    for (const id of direct) expect(hood.distance[id]).toBe(1);
  });

  it("widens the neighbourhood as depth grows", () => {
    const one = expandNeighborhood(domainGraph, "retry-storm", 1, filters);
    const two = expandNeighborhood(domainGraph, "retry-storm", 2, filters);
    const three = expandNeighborhood(domainGraph, "retry-storm", 3, filters);

    expect(two.concepts.length).toBeGreaterThan(one.concepts.length);
    expect(three.concepts.length).toBeGreaterThanOrEqual(two.concepts.length);
    const oneIds = new Set(one.concepts.map((c) => c.id));
    expect(two.concepts.filter((c) => oneIds.has(c.id))).toHaveLength(one.concepts.length);
    expect(Math.max(...Object.values(two.distance))).toBeLessThanOrEqual(2);
  });

  it("returns an induced subgraph: every edge connects two visible concepts", () => {
    const hood = expandNeighborhood(domainGraph, "tail-latency", 2, filters);
    const visible = new Set(hood.concepts.map((c) => c.id));
    expect(
      hood.relationships.every((r) => visible.has(r.sourceId) && visible.has(r.targetId)),
    ).toBe(true);
  });

  it("respects relationship-type and layer filters", () => {
    const onlyMitigates = expandNeighborhood(domainGraph, "retry-storm", 2, {
      ...filters,
      relationshipTypes: new Set(["MITIGATES"] as const),
    });
    expect(onlyMitigates.relationships.every((r) => r.type === "MITIGATES")).toBe(true);

    const noApiLayer = expandNeighborhood(domainGraph, "retry-storm", 2, {
      ...filters,
      layerIds: new Set(domainGraph.layers.map((l) => l.id).filter((id) => id !== "api")),
    });
    expect(noApiLayer.concepts).toHaveLength(0);
  });

  it("returns nothing for an unknown concept", () => {
    const hood = expandNeighborhood(domainGraph, "does-not-exist", 2, filters);
    expect(hood.concepts).toHaveLength(0);
    expect(hood.relationships).toHaveLength(0);
  });
});

describe("layerSubgraph", () => {
  it("contains only concepts of that layer and the edges between them", () => {
    const view = layerSubgraph(domainGraph, "data", filters);
    expect(view.concepts.length).toBeGreaterThan(3);
    expect(view.concepts.every((c) => c.layerId === "data")).toBe(true);
    const visible = new Set(view.concepts.map((c) => c.id));
    expect(view.relationships.every((r) => visible.has(r.sourceId) && visible.has(r.targetId))).toBe(
      true,
    );
  });

  it("counts relationships that cross the layer boundary", () => {
    expect(layerBridgeCount(domainGraph, "data")).toBeGreaterThan(0);
    expect(layerBridgeCount(domainGraph, "nope")).toBe(0);
  });
});

describe("rankConcepts", () => {
  it("ranks name matches above body matches", () => {
    const ranked = rankConcepts(concepts, "replication");
    expect(ranked[0]?.concept.id).toBe("replication-lag");
    expect(ranked[0]?.matchedOn).toBe("name");
  });

  it("requires every term to match", () => {
    const ranked = rankConcepts(concepts, "connection pool");
    expect(ranked.map((r) => r.concept.id)).toContain("connection-pool-exhaustion");
    expect(rankConcepts(concepts, "connection zzzz")).toHaveLength(0);
  });

  it("honours the result limit and returns nothing for an empty query", () => {
    expect(rankConcepts(concepts, "cache", 2)).toHaveLength(2);
    expect(rankConcepts(concepts, "   ")).toHaveLength(0);
  });
});

describe("appendTrail", () => {
  it("appends new concepts", () => {
    expect(appendTrail(["a"], "b")).toEqual(["a", "b"]);
  });

  it("rewinds instead of repeating when revisiting", () => {
    expect(appendTrail(["a", "b", "c"], "b")).toEqual(["a", "b"]);
    expect(appendTrail(["a", "b"], "b")).toEqual(["a", "b"]);
  });

  it("caps the trail length", () => {
    expect(appendTrail(["a", "b", "c"], "d", 3)).toEqual(["b", "c", "d"]);
  });
});

describe("shortestPath", () => {
  it("finds the chain between two distant concepts", () => {
    const path = shortestPath(domainGraph, "memory-leak", "tail-latency");
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(1);
    let cursor = "memory-leak";
    for (const edge of path!) {
      expect([edge.sourceId, edge.targetId]).toContain(cursor);
      cursor = edge.sourceId === cursor ? edge.targetId : edge.sourceId;
    }
    expect(cursor).toBe("tail-latency");
  });

  it("returns an empty path for the same concept and null when disconnected", () => {
    expect(shortestPath(domainGraph, "gc-pause", "gc-pause")).toEqual([]);
    expect(
      shortestPath(domainGraph, "gc-pause", "tail-latency", {
        ...filters,
        relationshipTypes: new Set(["ALTERNATIVE_TO"] as const),
      }),
    ).toBeNull();
  });
});

describe("relationshipSentence", () => {
  it("reads as a sentence", () => {
    expect(relationshipSentence("MITIGATES", "Circuit Breaker", "Cascading Failure")).toBe(
      "Circuit Breaker mitigates Cascading Failure.",
    );
  });
});
