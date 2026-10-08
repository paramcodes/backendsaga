import { describe, expect, it } from "vitest";
import { concepts, evidence, EVIDENCE_KINDS, type Concept, type Evidence } from "@/domain";
import {
  countByKind,
  decodeList,
  encodeList,
  filterEvidence,
  groupEvidenceByConcept,
  toggle,
  EVIDENCE_KIND_META,
  EVIDENCE_KIND_ORDER,
  EVIDENCE_TREND_META,
} from "./evidence-view";

const conceptById = new Map(concepts.map((c) => [c.id, c]));
const all = { kinds: [], layerIds: [], query: "" };

describe("filterEvidence", () => {
  it("returns everything with no filters", () => {
    expect(filterEvidence(evidence, all, conceptById)).toHaveLength(evidence.length);
  });

  it("filters by kind", () => {
    const plans = filterEvidence(evidence, { ...all, kinds: ["QUERY_PLAN"] }, conceptById);
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every((item) => item.kind === "QUERY_PLAN")).toBe(true);
  });

  it("filters by layer through the concept", () => {
    const data = filterEvidence(evidence, { ...all, layerIds: ["data"] }, conceptById);
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((item) => conceptById.get(item.conceptId)?.layerId === "data")).toBe(true);
  });

  it("requires every search term to match", () => {
    const one = filterEvidence(evidence, { ...all, query: "pool" }, conceptById);
    const two = filterEvidence(evidence, { ...all, query: "pool pending" }, conceptById);
    expect(one.length).toBeGreaterThan(two.length);
    expect(two.length).toBeGreaterThan(0);
  });

  it("searches inside the false-positive text", () => {
    const hits = filterEvidence(evidence, { ...all, query: "burstable" }, conceptById);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((item) => /burstable/i.test(item.falsePositive ?? ""))).toBe(true);
  });

  it("combines kind and layer as AND", () => {
    const combined = filterEvidence(
      evidence,
      { ...all, kinds: ["QUERY_PLAN"], layerIds: ["network"] },
      conceptById,
    );
    expect(combined).toEqual([]);
  });
});

describe("groupEvidenceByConcept", () => {
  it("groups under concepts in atlas order and drops unknown concepts", () => {
    const orphan: Evidence = {
      id: "ev-orphan",
      conceptId: "does-not-exist",
      kind: "LOG",
      trend: "PRESENT",
      signal: "x",
      whatYouSee: "x",
      whereToLook: "x",
      whyItMatters: "x",
    };
    const groups = groupEvidenceByConcept([...evidence, orphan], concepts);
    const ids = groups.map((g) => g.concept.id);
    expect(ids).not.toContain("does-not-exist");
    const order = concepts.map((c: Concept) => c.id);
    expect(ids).toEqual([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });
});

describe("filter chips", () => {
  it("counts every kind", () => {
    const counts = countByKind(evidence);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(evidence.length);
  });

  it("toggles values in and out", () => {
    expect(toggle(["a"], "b")).toEqual(["a", "b"]);
    expect(toggle(["a", "b"], "a")).toEqual(["b"]);
  });

  it("round-trips URL lists and rejects unknown values", () => {
    expect(encodeList([])).toBeUndefined();
    expect(decodeList(encodeList(["METRIC", "LOG"]), EVIDENCE_KINDS)).toEqual(["METRIC", "LOG"]);
    expect(decodeList("METRIC,NONSENSE", EVIDENCE_KINDS)).toEqual(["METRIC"]);
    expect(decodeList(undefined, EVIDENCE_KINDS)).toEqual([]);
  });
});

describe("presentation metadata", () => {
  it("describes every kind and trend used by the seed", () => {
    for (const kind of EVIDENCE_KINDS) expect(EVIDENCE_KIND_META[kind].label).toBeTruthy();
    expect(EVIDENCE_KIND_ORDER.slice().sort()).toEqual([...EVIDENCE_KINDS].sort());
    for (const item of evidence) expect(EVIDENCE_TREND_META[item.trend]).toBeDefined();
  });
});
