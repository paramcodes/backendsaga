import { describe, expect, it } from "vitest";

import { createGraphIndex, domainGraph, incidentCatalog } from "@/domain";
import { createIncidentEngine } from "./incident-engine";
import {
  SEVERITY_META,
  SEVERITY_ORDER,
  buildCauseChain,
  confidencePercent,
  coverageSummary,
  decodeSymptoms,
  encodeSymptoms,
  groupSymptomsByLayer,
  isSymptomNodeId,
  symptomLine,
  symptomNodeId,
} from "./incident-view";

const engine = createIncidentEngine(createGraphIndex(domainGraph), incidentCatalog);

describe("cause chain", () => {
  const diagnosis = engine.diagnose(["pool-wait-up", "lock-waits-up"]);
  const cause = diagnosis.causes.find((c) => c.concept.id === "long-transaction")!;
  const chain = buildCauseChain(cause, diagnosis);

  it("starts at the candidate and ends at the observations", () => {
    const roles = new Map(
      chain.nodes.flatMap((node) => (node.kind === "concept" ? [[node.id, node.role]] : [])),
    );
    expect(roles.get("long-transaction")).toBe("cause");
    expect(roles.get("connection-pool-exhaustion")).toBe("observed");
    expect(chain.nodes.some((node) => node.kind === "symptom" && node.id.includes("pool-wait-up"))).toBe(
      true,
    );
  });

  it("only draws edges that exist in the graph", () => {
    const relationshipIds = new Set(domainGraph.relationships.map((r) => r.id));
    for (const edge of chain.edges) {
      if (edge.kind === "causal") expect(relationshipIds.has(edge.id)).toBe(true);
    }
  });

  it("connects each observed concept to its symptom", () => {
    const observation = chain.edges.find(
      (edge) => edge.kind === "observation" && edge.target === symptomNodeId("pool-wait-up"),
    );
    expect(observation).toBeDefined();
    expect(observation!.source).toBe("connection-pool-exhaustion");
  });

  it("never repeats a node", () => {
    const ids = chain.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("handles a cause that was observed directly", () => {
    const direct = diagnosis.causes.find((c) => c.concept.id === "lock-contention")!;
    const built = buildCauseChain(direct, diagnosis);
    const self = built.nodes.find((node) => node.id === "lock-contention")!;
    expect(self.kind === "concept" && self.role).toBe("cause");
    expect(built.edges.some((edge) => edge.kind === "observation")).toBe(true);
  });

  it("tags symptom node ids so the canvas can tell them apart", () => {
    expect(isSymptomNodeId(symptomNodeId("pool-wait-up"))).toBe(true);
    expect(isSymptomNodeId("lock-contention")).toBe(false);
  });
});

describe("labels", () => {
  it("summarises coverage honestly", () => {
    const diagnosis = engine.diagnose(["pool-wait-up", "lock-waits-up", "dns-slow"]);
    const cause = diagnosis.causes.find((c) => c.concept.id === "long-transaction")!;
    expect(coverageSummary(cause, diagnosis)).toBe("Explains 2 of 3 observations");
  });

  it("clamps confidence to a percentage", () => {
    expect(confidencePercent(0.5)).toBe(50);
    expect(confidencePercent(1.9)).toBe(100);
    expect(confidencePercent(-1)).toBe(0);
  });

  it("writes a symptom as name and signal", () => {
    const symptom = engine.getSymptom("pool-wait-up")!;
    expect(symptomLine(symptom)).toContain(symptom.signal);
  });

  it("describes every severity", () => {
    for (const severity of SEVERITY_ORDER) {
      expect(SEVERITY_META[severity].label.length).toBeGreaterThan(0);
      expect(SEVERITY_META[severity].blurb.length).toBeGreaterThan(0);
    }
  });
});

describe("symptom grouping and url state", () => {
  it("groups by layer in atlas order and drops empty layers", () => {
    const groups = groupSymptomsByLayer(incidentCatalog.symptoms, domainGraph.layers);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((group) => group.symptoms.length > 0)).toBe(true);
    const order = domainGraph.layers.map((l) => l.id);
    const seen = groups.map((g) => g.layerId);
    expect(seen).toEqual(order.filter((id) => seen.includes(id)));
  });

  it("encodes a stable, shareable symptom list", () => {
    expect(encodeSymptoms([])).toBeUndefined();
    expect(encodeSymptoms(["b", "a"])).toBe("a,b");
  });

  it("ignores unknown ids when decoding", () => {
    const allowed = new Set(["a", "b"]);
    expect(decodeSymptoms("a, c ,b", allowed)).toEqual(["a", "b"]);
    expect(decodeSymptoms(undefined, allowed)).toEqual([]);
  });
});
