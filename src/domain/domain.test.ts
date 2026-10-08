import { describe, expect, it } from "vitest";
import {
  conceptsWithEvidence,
  degree,
  domainGraph,
  evidenceCoverage,
  evidenceFor,
  EVIDENCE_KINDS,
  neighbors,
  RELATIONSHIP_TYPES,
  searchConcepts,
  validateGraph,
} from "./index";

describe("domain graph seed", () => {
  it("is valid (unique ids, valid types, layers, no dangling refs)", () => {
    expect(validateGraph(domainGraph)).toEqual([]);
  });

  it("has a curated size of 50–100 concepts", () => {
    expect(domainGraph.concepts.length).toBeGreaterThanOrEqual(50);
    expect(domainGraph.concepts.length).toBeLessThanOrEqual(100);
  });

  it("only uses known relationship types", () => {
    for (const r of domainGraph.relationships) expect(RELATIONSHIP_TYPES).toContain(r.type);
  });

  it("is well-connected: every concept has at least one relationship", () => {
    const orphans = domainGraph.concepts.filter((c) => neighbors(c.id).length === 0).map((c) => c.id);
    expect(orphans).toEqual([]);
  });

  it("every layer has concepts", () => {
    for (const l of domainGraph.layers)
      expect(domainGraph.concepts.some((c) => c.layerId === l.id)).toBe(true);
  });
});

describe("validateGraph detects problems", () => {
  it("flags dangling, duplicate and unknown-layer references", () => {
    const g = structuredClone(domainGraph);
    const [a, b] = [g.concepts[0]!, g.concepts[1]!];
    g.concepts.push({ ...a });
    g.concepts.push({ ...b, id: "ghost-layer", slug: "ghost-layer", layerId: "nope" });
    g.relationships.push({ id: "x", sourceId: "missing", targetId: a.id, type: "CAUSES" });
    g.relationships.push({ id: "y", sourceId: a.id, targetId: b.id, type: "BOGUS" as never });
    const errs = validateGraph(g).join("\n");
    expect(errs).toMatch(/duplicate concept id/);
    expect(errs).toMatch(/unknown layer nope/);
    expect(errs).toMatch(/dangling source missing/);
    expect(errs).toMatch(/invalid relationship y/);
  });
});

describe("search", () => {
  it("finds by name and mechanism", () => {
    expect(searchConcepts("deadlock").map((c) => c.id)).toContain("deadlock");
    expect(searchConcepts("CFS quota").map((c) => c.id)).toContain("cpu-throttling");
  });
});

describe("evidence", () => {
  const { evidence } = domainGraph;

  it("covers at least 20 concepts", () => {
    expect(conceptsWithEvidence().length).toBeGreaterThanOrEqual(20);
    expect(evidenceCoverage().covered).toBe(conceptsWithEvidence().length);
  });

  it("leaves no concept unobservable", () => {
    const { covered, total } = evidenceCoverage();
    const missing = domainGraph.concepts
      .filter((c) => evidenceFor(c.id).length === 0)
      .map((c) => c.id);
    expect(missing).toEqual([]);
    expect(covered).toBe(total);
  });

  it("uses every kind of proof", () => {
    for (const kind of EVIDENCE_KINDS) expect(evidence.some((e) => e.kind === kind)).toBe(true);
  });

  it("reaches every layer", () => {
    const covered = new Set(
      conceptsWithEvidence().map((id) => domainGraph.concepts.find((c) => c.id === id)?.layerId),
    );
    for (const layer of domainGraph.layers) expect(covered).toContain(layer.id);
  });

  it("answers all four questions in full sentences", () => {
    for (const e of evidence) {
      expect(e.signal.length).toBeGreaterThan(3);
      expect(e.whatYouSee.length).toBeGreaterThan(20);
      expect(e.whereToLook.length).toBeGreaterThan(15);
      expect(e.whyItMatters.length).toBeGreaterThan(30);
      expect(e.whatYouSee).not.toEqual(e.whyItMatters);
    }
  });

  it("names a false positive for most signals", () => {
    const withTrap = evidence.filter((e) => e.falsePositive && e.falsePositive.length > 20);
    expect(withTrap.length / evidence.length).toBeGreaterThan(0.8);
  });

  it("gives evidence to the most connected concepts", () => {
    const busiest = [...domainGraph.concepts]
      .sort((a, b) => degree(b.id) - degree(a.id))
      .slice(0, 10);
    for (const c of busiest) expect(evidenceFor(c.id).length).toBeGreaterThan(0);
  });
});
