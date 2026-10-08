import { describe, expect, it } from "vitest";

import { domainGraph } from "@/domain";
import { createGraphIndex } from "@/domain/graph-index";
import {
  toAtlasStats,
  toConcept,
  toDomainGraph,
  toEvidence,
  toLayer,
  type ConceptRow,
  type EvidenceRow,
  type GraphRows,
  type LayerRow,
} from "@/lib/atlas-rows";

/**
 * The database stores the same knowledge in snake_case with explicit nulls.
 * These helpers reproduce that shape from the seed so the mappers can be tested
 * without a network round-trip; the seeding script writes exactly these columns.
 */
function rowsFromSeed(): GraphRows {
  return {
    layers: domainGraph.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      sort_order: layer.order,
      description: layer.description,
      updated_at: "2026-01-01T00:00:00Z",
    })),
    concepts: domainGraph.concepts.map((concept) => ({
      id: concept.id,
      slug: concept.slug,
      name: concept.name,
      layer_id: concept.layerId,
      description: concept.description,
      problem: concept.problem ?? null,
      why: concept.why ?? null,
      mechanism: concept.mechanism ?? null,
      tradeoffs: concept.tradeoffs ?? null,
      better_alternative: concept.betterAlternative ?? null,
      search_text: concept.name.toLowerCase(),
      updated_at: "2026-01-01T00:00:00Z",
    })),
    relationships: domainGraph.relationships.map((rel) => ({
      id: rel.id,
      source_id: rel.sourceId,
      target_id: rel.targetId,
      type: rel.type,
      updated_at: "2026-01-01T00:00:00Z",
    })),
    evidence: domainGraph.evidence.map((item) => ({
      id: item.id,
      concept_id: item.conceptId,
      kind: item.kind,
      trend: item.trend,
      signal: item.signal,
      what_you_see: item.whatYouSee,
      where_to_look: item.whereToLook,
      why_it_matters: item.whyItMatters,
      false_positive: item.falsePositive ?? null,
      updated_at: "2026-01-01T00:00:00Z",
    })),
    sources: domainGraph.sources.map((source) => ({
      id: source.id,
      kind: source.kind,
      title: source.title,
      author: source.author,
      year: source.year ?? null,
      url: source.url,
      note: source.note,
      updated_at: "2026-01-01T00:00:00Z",
    })),
    conceptSources: domainGraph.conceptSources.map((link) => ({
      concept_id: link.conceptId,
      source_id: link.sourceId,
      relevance: link.relevance,
      updated_at: "2026-01-01T00:00:00Z",
    })),
  };
}

describe("row mappers", () => {
  it("round-trips the whole graph through the database shape", () => {
    const restored = toDomainGraph(rowsFromSeed());
    expect(restored.layers).toEqual(domainGraph.layers);
    expect(restored.concepts).toEqual(domainGraph.concepts);
    expect(restored.relationships).toEqual(domainGraph.relationships);
    expect(restored.evidence).toEqual(domainGraph.evidence);
    expect(restored.sources).toEqual(domainGraph.sources);
    expect(restored.conceptSources).toEqual(domainGraph.conceptSources);
  });

  it("orders layers by sort_order whatever order the rows arrive in", () => {
    const rows = rowsFromSeed();
    const shuffled = { ...rows, layers: [...rows.layers].reverse() };
    const orders = toDomainGraph(shuffled).layers.map((layer) => layer.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("drops nulls rather than turning them into empty strings", () => {
    const row: ConceptRow = {
      id: "null-test",
      slug: "null-test",
      name: "Null test",
      layer_id: "data",
      description: "A concept with only the required prose filled in.",
      problem: null,
      why: null,
      mechanism: null,
      tradeoffs: null,
      better_alternative: null,
      search_text: "null test",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const concept = toConcept(row);
    expect(concept.problem).toBeUndefined();
    expect("problem" in concept).toBe(false);
    expect(concept.betterAlternative).toBeUndefined();
  });

  it("rejects rows the schema does not allow", () => {
    const badLayer = { id: "x", name: "X", sort_order: 0, description: "", updated_at: null };
    expect(() => toLayer(badLayer as unknown as LayerRow)).toThrow();

    const badEvidence = {
      id: "ev-bad",
      concept_id: "gc-pause",
      kind: "VIBES",
      trend: "UP",
      signal: "nothing",
      what_you_see: "nothing",
      where_to_look: "nowhere",
      why_it_matters: "it does not",
      false_positive: null,
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(() => toEvidence(badEvidence as unknown as EvidenceRow)).toThrow();
  });

  it("builds a working index from database rows", () => {
    const index = createGraphIndex(toDomainGraph(rowsFromSeed()));
    expect(index.getConcept("retry-storm")?.name).toBe("Retry Storm");
    expect(index.neighbors("retry-storm").length).toBeGreaterThan(0);
    expect(index.evidenceFor("retry-storm").length).toBeGreaterThan(0);
    expect(index.sourcesFor("retry-storm").length).toBeGreaterThan(0);
  });

  it("coerces the stats function's json, including counts returned as strings", () => {
    const stats = toAtlasStats({
      layers: 8,
      concepts: 51,
      relationships: 82,
      evidence: 87,
      sources: 48,
      conceptsWithEvidence: 51,
      conceptsWithSources: 51,
      byLayer: { data: 10, api: "8" },
    });
    expect(stats.concepts).toBe(51);
    expect(stats.byLayer["data"]).toBe(10);
    expect(stats.byLayer["api"]).toBe(0);
  });

  it("survives a response missing the optional tables", () => {
    const rows = rowsFromSeed();
    const graph = toDomainGraph({
      layers: rows.layers,
      concepts: rows.concepts,
      relationships: rows.relationships,
    });
    expect(graph.evidence).toEqual([]);
    expect(graph.sources).toEqual([]);
    expect(graph.conceptSources).toEqual([]);
  });
});
