import { describe, expect, it } from "vitest";
import {
  createGraphIndex,
  domainGraph,
  incidentCatalog,
  validateIncidents,
  type Concept,
  type DomainGraph,
  type IncidentCatalog,
} from "@/domain";
import {
  CAUSAL_TYPES,
  confidenceLabel,
  createIncidentEngine,
  MAX_CAUSE_DEPTH,
  pathSentence,
} from "./incident-engine";

const index = createGraphIndex(domainGraph);
const engine = createIncidentEngine(index, incidentCatalog);

describe("incident catalog", () => {
  it("is internally consistent and anchored to the graph", () => {
    expect(validateIncidents(domainGraph, incidentCatalog)).toEqual([]);
  });

  it("gives every symptom at least one direct evidence link", () => {
    const direct = new Set(
      incidentCatalog.symptomEvidence
        .filter((link) => link.strength === "DIRECT")
        .map((link) => link.symptomId),
    );
    const missing = incidentCatalog.symptoms.filter((s) => !direct.has(s.id));
    expect(missing.map((s) => s.id)).toEqual([]);
  });

  it("resolves every symptom onto at least one concept", () => {
    const unresolved = incidentCatalog.symptoms.filter(
      (symptom) => engine.observationsFor(symptom.id).length === 0,
    );
    expect(unresolved.map((s) => s.id)).toEqual([]);
  });

  it("covers every layer with at least one symptom", () => {
    const layers = new Set(incidentCatalog.symptoms.map((s) => s.layerId));
    expect([...layers].sort()).toEqual(domainGraph.layers.map((l) => l.id).sort());
  });
});

describe("diagnose", () => {
  it("returns nothing for no symptoms", () => {
    const diagnosis = engine.diagnose([]);
    expect(diagnosis.causes).toEqual([]);
    expect(diagnosis.checks).toEqual([]);
  });

  it("ignores unknown symptom ids", () => {
    const diagnosis = engine.diagnose(["not-a-symptom"]);
    expect(diagnosis.symptomIds).toEqual([]);
    expect(diagnosis.causes).toEqual([]);
  });

  it("ranks the observed concept itself first for a single symptom", () => {
    const diagnosis = engine.diagnose(["lock-waits-up"]);
    expect(diagnosis.causes[0]?.concept.id).toBe("lock-contention");
    expect(diagnosis.causes[0]?.paths[0]?.length).toBe(0);
  });

  it("walks upstream to causes that were never observed directly", () => {
    const diagnosis = engine.diagnose(["lock-waits-up", "pool-wait-up", "idle-in-transaction"]);
    const longTransaction = diagnosis.causes.find((c) => c.concept.id === "long-transaction");
    expect(longTransaction).toBeDefined();
    expect(longTransaction!.coverage).toContain("pool-wait-up");
    const path = longTransaction!.paths.find((p) => p.symptomId === "pool-wait-up");
    expect(path!.steps.map((s) => s.relationship.type).every((t) => CAUSAL_TYPES.includes(t))).toBe(
      true,
    );
    expect(path!.steps[0]?.from.id).toBe("long-transaction");
    expect(path!.steps.at(-1)?.to.id).toBe("connection-pool-exhaustion");
  });

  it("prefers the cause that explains more symptoms over a closer one", () => {
    const broad = engine.diagnose(["retry-rate-up", "queue-depth-up", "timeouts-up", "error-rate-up"]);
    const top = broad.causes[0]!;
    expect(top.coverage.length).toBeGreaterThanOrEqual(3);
    expect(broad.causes.every((cause) => cause.coverage.length <= top.coverage.length)).toBe(true);
  });

  it("never walks further than the depth limit", () => {
    const diagnosis = engine.diagnose(incidentCatalog.symptoms.map((s) => s.id));
    const deepest = Math.max(
      ...diagnosis.causes.flatMap((cause) => cause.paths.map((path) => path.length)),
    );
    expect(deepest).toBeLessThanOrEqual(MAX_CAUSE_DEPTH);
  });

  it("is deterministic", () => {
    const a = engine.diagnose(["p99-latency-up", "gc-pauses-up", "memory-climbing"]);
    const b = engine.diagnose(["memory-climbing", "p99-latency-up", "gc-pauses-up"]);
    expect(a.causes.map((c) => c.concept.id)).toEqual(b.causes.map((c) => c.concept.id));
    expect(a.causes.map((c) => c.score)).toEqual(b.causes.map((c) => c.score));
  });

  it("reports symptoms it cannot place", () => {
    const orphanCatalog: IncidentCatalog = {
      symptoms: [
        ...incidentCatalog.symptoms,
        {
          id: "mystery-signal",
          name: "Mystery signal",
          layerId: "os",
          description: "Something nobody has mapped yet.",
          signal: "unknown",
          trend: "UP",
        },
      ],
      symptomEvidence: incidentCatalog.symptomEvidence,
      incidents: [],
    };
    const diagnosis = createIncidentEngine(index, orphanCatalog).diagnose([
      "mystery-signal",
      "gc-pauses-up",
    ]);
    expect(diagnosis.unobserved.map((s) => s.id)).toEqual(["mystery-signal"]);
    expect(diagnosis.causes.length).toBeGreaterThan(0);
  });

  it("lists mitigations and not-yet-seen effects for a cause", () => {
    const diagnosis = engine.diagnose(["retry-rate-up"]);
    const retryStorm = diagnosis.causes.find((c) => c.concept.id === "retry-storm")!;
    expect(retryStorm.mitigations.map((m) => m.id).sort()).toEqual([
      "circuit-breaker",
      "exponential-backoff",
    ]);
    expect(retryStorm.predicted.map((p) => p.concept.id)).toContain("queue-buildup");
  });

  it("suggests checks that separate the leading candidates", () => {
    const diagnosis = engine.diagnose(["p99-latency-up", "db-latency-up"]);
    expect(diagnosis.checks.length).toBeGreaterThan(0);
    for (const check of diagnosis.checks) {
      // A useful check is one some candidates do not produce.
      expect(check.rulesOut.length).toBeGreaterThan(0);
      expect(check.supports.length).toBeGreaterThan(0);
    }
    const [best] = diagnosis.checks;
    expect(best!.separation).toBeGreaterThanOrEqual(diagnosis.checks.at(-1)!.separation);
  });

  it("does not suggest a check for a signal already reported", () => {
    const diagnosis = engine.diagnose(["lock-waits-up", "pool-wait-up"]);
    const suggested = diagnosis.checks.map((check) => check.evidence.id);
    expect(suggested).not.toContain("ev-lock-counter");
    expect(suggested).not.toContain("ev-pool-metric");
  });
});

describe("replaying the seeded incidents", () => {
  it("puts the documented cause in the top three every time", () => {
    const misses = incidentCatalog.incidents
      .map((incident) => engine.replay(incident))
      .filter((replay) => replay.rootCauseRank === null || replay.rootCauseRank > 3)
      .map((replay) => `${replay.incident.slug}: ${replay.rootCauseRank}`);
    expect(misses).toEqual([]);
  });

  it("ranks the documented cause first for most incidents", () => {
    const firsts = incidentCatalog.incidents
      .map((incident) => engine.replay(incident))
      .filter((replay) => replay.rootCauseRank === 1);
    expect(firsts.length).toBeGreaterThanOrEqual(
      Math.ceil(incidentCatalog.incidents.length * 0.6),
    );
  });

  it("explains at least half of each incident's symptoms with its top cause", () => {
    for (const incident of incidentCatalog.incidents) {
      const { diagnosis } = engine.replay(incident);
      const top = diagnosis.causes[0]!;
      expect(top.coverageRatio).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("exposes the contributing concepts as real graph entries", () => {
    for (const incident of incidentCatalog.incidents) {
      const replay = engine.replay(incident);
      expect(replay.contributing.length).toBe(incident.contributingIds.length);
      expect(replay.rootCause).toBeDefined();
    }
  });
});

describe("explanations", () => {
  it("turns a path into a sentence", () => {
    const diagnosis = engine.diagnose(["pool-wait-up"]);
    const longTransaction = diagnosis.causes.find((c) => c.concept.id === "long-transaction")!;
    const sentence = pathSentence(longTransaction.paths[0]!);
    expect(sentence).toContain("Long-Running Transaction causes Lock Contention");
    expect(sentence).toContain("which causes Connection Pool Exhaustion");
  });

  it("says so when the concept is the observation", () => {
    const diagnosis = engine.diagnose(["gc-pauses-up"]);
    const gc = diagnosis.causes.find((c) => c.concept.id === "gc-pause")!;
    expect(pathSentence(gc.paths[0]!)).toBe("observed directly on this concept");
  });

  it("bands confidence", () => {
    expect(confidenceLabel(0.9)).toBe("Strong");
    expect(confidenceLabel(0.4)).toBe("Plausible");
    expect(confidenceLabel(0.1)).toBe("Weak");
  });
});

describe("engine over a tiny synthetic graph", () => {
  const concept = (id: string, layerId = "data"): Concept => ({
    id,
    slug: id,
    name: id.toUpperCase(),
    layerId,
    description: `${id} description`,
  });

  const graph: DomainGraph = {
    layers: [{ id: "data", name: "Data", order: 1, description: "data" }],
    concepts: [concept("root"), concept("middle"), concept("surface")],
    relationships: [
      { id: "root--CAUSES--middle", sourceId: "root", targetId: "middle", type: "CAUSES" },
      { id: "middle--CAUSES--surface", sourceId: "middle", targetId: "surface", type: "CAUSES" },
      {
        id: "surface--MITIGATES--root",
        sourceId: "surface",
        targetId: "root",
        type: "MITIGATES",
      },
    ],
    evidence: [
      {
        id: "ev-surface",
        conceptId: "surface",
        kind: "METRIC",
        trend: "UP",
        signal: "surface.signal",
        whatYouSee: "a number rising",
        whereToLook: "the dashboard",
        whyItMatters: "it is the symptom",
      },
    ],
    sources: [],
    conceptSources: [],
  };

  const catalog: IncidentCatalog = {
    symptoms: [
      {
        id: "surface-up",
        name: "Surface up",
        layerId: "data",
        description: "the surface signal is up",
        signal: "surface.signal",
        trend: "UP",
      },
    ],
    symptomEvidence: [{ symptomId: "surface-up", evidenceId: "ev-surface", strength: "DIRECT" }],
    incidents: [],
  };

  it("ranks nearer causes above further ones at equal coverage", () => {
    const diagnosis = createIncidentEngine(createGraphIndex(graph), catalog).diagnose(["surface-up"]);
    expect(diagnosis.causes.map((c) => c.concept.id)).toEqual(["surface", "middle", "root"]);
    expect(diagnosis.causes.map((c) => c.paths[0]!.length)).toEqual([0, 1, 2]);
  });

  it("does not follow mitigation edges backwards", () => {
    const diagnosis = createIncidentEngine(createGraphIndex(graph), catalog).diagnose(["surface-up"]);
    const root = diagnosis.causes.find((c) => c.concept.id === "root")!;
    expect(root.paths[0]!.steps.map((s) => s.relationship.type)).toEqual(["CAUSES", "CAUSES"]);
  });
});
