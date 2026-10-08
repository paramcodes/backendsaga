import { describe, expect, it } from "vitest";

import { seedIndex } from "@/domain";
import { RELATIONSHIP_TYPES } from "@/domain/schema";
import {
  COMPANION_TYPES,
  FADE_DAYS,
  KNOWN_STATES,
  LEARNING_ORDER,
  MASTERY_STATES,
  STALL_DAYS,
  clustersWithProgress,
  createLearningEngine,
  type MasteryState,
  type ProgressMap,
} from "./learning-engine";

const engine = createLearningEngine(seedIndex);
const NOW = Date.parse("2026-03-01T00:00:00.000Z");
const daysAgo = (days: number): string => new Date(NOW - days * 86_400_000).toISOString();

const progressOf = (entries: Array<[string, MasteryState, number?]>): ProgressMap =>
  Object.fromEntries(
    entries.map(([conceptId, state, age = 0]) => [
      conceptId,
      { conceptId, state, updatedAt: daysAgo(age) },
    ]),
  );

const firstEdge = (type: (typeof RELATIONSHIP_TYPES)[number]) =>
  seedIndex.graph.relationships.find((r) => r.type === type);

describe("learning order", () => {
  it("covers every relationship type as ordering, companion or deliberately ignored", () => {
    const ignored = ["OBSERVED_BY"];
    for (const type of RELATIONSHIP_TYPES) {
      const handled =
        Boolean(LEARNING_ORDER[type]) ||
        (COMPANION_TYPES as readonly string[]).includes(type) ||
        ignored.includes(type);
      expect(handled, `${type} has no learning semantics`).toBe(true);
    }
  });

  it("treats REQUIRES as a hard prerequisite pointing backwards", () => {
    const edge = firstEdge("REQUIRES");
    expect(edge).toBeDefined();
    const prereqs = engine.prerequisitesOf(edge!.sourceId);
    const match = prereqs.find((p) => p.concept.id === edge!.targetId);
    expect(match?.strength).toBe("hard");
    expect(match?.sentence).toContain("requires");
  });

  it("puts the problem before the fix for MITIGATES", () => {
    const edge = firstEdge("MITIGATES");
    expect(edge).toBeDefined();
    const prereqs = engine.prerequisitesOf(edge!.sourceId).map((p) => p.concept.id);
    expect(prereqs).toContain(edge!.targetId);
  });

  it("puts the cause before the effect for CAUSES", () => {
    const edge = firstEdge("CAUSES");
    expect(edge).toBeDefined();
    const prereqs = engine.prerequisitesOf(edge!.targetId).map((p) => p.concept.id);
    expect(prereqs).toContain(edge!.sourceId);
  });

  it("mirrors prerequisites as dependents", () => {
    for (const concept of seedIndex.graph.concepts.slice(0, 12)) {
      for (const prereq of engine.prerequisitesOf(concept.id)) {
        const back = engine.dependentsOf(prereq.concept.id).map((d) => d.concept.id);
        expect(back).toContain(concept.id);
      }
    }
  });

  it("keeps alternatives and trade-offs unordered", () => {
    const edge = firstEdge("ALTERNATIVE_TO");
    expect(edge).toBeDefined();
    const companions = engine.companionsOf(edge!.sourceId).map((c) => c.concept.id);
    expect(companions).toContain(edge!.targetId);
    const prereqs = engine.prerequisitesOf(edge!.sourceId).map((p) => p.concept.id);
    expect(prereqs).not.toContain(edge!.targetId);
  });
});

describe("readiness", () => {
  it("reports a hard prerequisite as a blocker until it is known", () => {
    const edge = firstEdge("REQUIRES")!;
    const blocked = engine.readiness({}, edge.sourceId);
    expect(blocked.blockedBy.map((c) => c.id)).toContain(edge.targetId);

    const cleared = engine.readiness(progressOf([[edge.targetId, "understood"]]), edge.sourceId);
    expect(cleared.blockedBy.map((c) => c.id)).not.toContain(edge.targetId);
    expect(cleared.known).toBeGreaterThan(blocked.known);
  });

  it("counts a prerequisite once even when two edges imply it", () => {
    for (const concept of seedIndex.graph.concepts) {
      const ready = engine.readiness({}, concept.id);
      const ids = new Set(engine.prerequisitesOf(concept.id).map((p) => p.concept.id));
      expect(ready.total).toBe(ids.size);
    }
  });
});

describe("recommendations", () => {
  it("returns a deterministic ranked list from a cold start", () => {
    const first = engine.recommend({}, 6);
    const second = engine.recommend({}, 6);
    expect(first.map((r) => r.concept.id)).toEqual(second.map((r) => r.concept.id));
    expect(first).toHaveLength(6);
    expect(first.every((r) => r.reasons.length > 0)).toBe(true);
  });

  it("never recommends something already understood or mastered", () => {
    const top = engine.recommend({}, 3).map((r) => r.concept.id);
    const progress = progressOf(top.map((id) => [id, "mastered"] as [string, MasteryState]));
    const next = engine.recommend(progress, 8).map((r) => r.concept.id);
    for (const id of top) expect(next).not.toContain(id);
  });

  it("puts a review flag at the top", () => {
    const quiet = [...seedIndex.graph.concepts]
      .reverse()
      .find((c) => engine.readiness({}, c.id).blockedBy.length === 0)!;
    const ranked = engine.recommend(progressOf([[quiet.id, "needs-review", 2]]), 5);
    expect(ranked[0]?.concept.id).toBe(quiet.id);
    expect(ranked[0]?.reasons.join(" ")).toMatch(/review/i);
  });

  it("keeps a flagged entry near the top even when groundwork is missing", () => {
    const edge = firstEdge("REQUIRES")!;
    const ranked = engine.recommend(progressOf([[edge.sourceId, "needs-review", 1]]), 5);
    expect(ranked.map((r) => r.concept.id)).toContain(edge.sourceId);
    const flagged = ranked.find((r) => r.concept.id === edge.sourceId)!;
    expect(flagged.reasons.join(" ")).toMatch(/first/i);
  });

  it("lifts a concept once the material underneath it is known", () => {
    const candidate = seedIndex.graph.concepts.find(
      (c) => engine.prerequisitesOf(c.id).length >= 2 && engine.readiness({}, c.id).blockedBy.length === 0,
    );
    expect(candidate).toBeDefined();
    const cold = engine.recommend({}, 51).findIndex((r) => r.concept.id === candidate!.id);
    const warmProgress = progressOf(
      engine.prerequisitesOf(candidate!.id).map((p) => [p.concept.id, "mastered"] as [string, MasteryState]),
    );
    const warm = engine.recommend(warmProgress, 51).findIndex((r) => r.concept.id === candidate!.id);
    expect(warm).toBeLessThan(cold);
  });

  it("explains a blocked concept instead of silently hiding it", () => {
    const edge = firstEdge("REQUIRES")!;
    const ranked = engine.recommend({}, 51);
    const blocked = ranked.find((r) => r.concept.id === edge.sourceId);
    expect(blocked).toBeDefined();
    expect(blocked!.reasons.join(" ")).toMatch(/first/i);
  });

  it("offers what each recommendation unlocks", () => {
    const ranked = engine.recommend({}, 6);
    expect(ranked.some((r) => r.unlocks.length > 0)).toBe(true);
    for (const item of ranked) {
      expect(item.unlocks.length).toBeLessThanOrEqual(4);
      expect(new Set(item.unlocks.map((c) => c.id)).size).toBe(item.unlocks.length);
    }
  });
});

describe("weak spots", () => {
  it("finds nothing when nothing is recorded", () => {
    expect(engine.weakSpots({}, NOW)).toEqual([]);
  });

  it("reports flags, stalls, shaky foundations and fading mastery in that order", () => {
    const shakyTarget = seedIndex.graph.concepts.find((c) => engine.readiness({}, c.id).total >= 2)!;
    const flagged = seedIndex.graph.concepts.find((c) => c.id !== shakyTarget.id)!;
    const stalled = seedIndex.graph.concepts.find(
      (c) => c.id !== shakyTarget.id && c.id !== flagged.id,
    )!;
    const faded = seedIndex.graph.concepts.find(
      (c) =>
        c.id !== shakyTarget.id &&
        c.id !== flagged.id &&
        c.id !== stalled.id &&
        engine.readiness({}, c.id).total === 0,
    )!;

    const spots = engine.weakSpots(
      progressOf([
        [flagged.id, "needs-review", 3],
        [stalled.id, "learning", STALL_DAYS + 4],
        [shakyTarget.id, "mastered", 1],
        [faded.id, "mastered", FADE_DAYS + 5],
      ]),
      NOW,
    );

    expect(spots.map((s) => s.kind)).toEqual(["flagged", "stalled", "shaky", "fading"]);
    expect(spots[0]?.concept.id).toBe(flagged.id);
    expect(spots[1]?.detail).toContain("without a change");
    expect(spots[2]?.related.length).toBeGreaterThan(0);
    expect(spots[3]?.detail).toContain("worth a re-read");
  });

  it("leaves a recent learning state alone", () => {
    const concept = seedIndex.graph.concepts[0]!;
    expect(engine.weakSpots(progressOf([[concept.id, "learning", 1]]), NOW)).toEqual([]);
  });
});

describe("study path", () => {
  it("returns null for an unknown target", () => {
    expect(engine.studyPath({}, "not-a-concept")).toBeNull();
  });

  it("ends on the target and orders prerequisites before the things that need them", () => {
    const target = seedIndex.graph.concepts.find((c) => engine.prerequisitesOf(c.id).length >= 2)!;
    const path = engine.studyPath({}, target.id)!;
    expect(path.steps.at(-1)?.concept.id).toBe(target.id);

    // Causal graphs contain loops, and inside a loop no order is correct.
    // Everything outside a loop must still come after what it builds on.
    const loopOf = new Map<string, number>();
    engine.clusters().forEach((cluster, i) => {
      for (const concept of cluster.concepts) loopOf.set(concept.id, i);
    });

    const position = new Map(path.steps.map((step, i) => [step.concept.id, i]));
    for (const step of path.steps) {
      for (const prereq of engine.prerequisitesOf(step.concept.id)) {
        const at = position.get(prereq.concept.id);
        if (at === undefined) continue;
        const sameLoop =
          loopOf.has(step.concept.id) && loopOf.get(step.concept.id) === loopOf.get(prereq.concept.id);
        if (!sameLoop) expect(at).toBeLessThan(position.get(step.concept.id)!);
      }
    }
  });

  it("drops what you already know out of the steps", () => {
    const target = seedIndex.graph.concepts.find((c) => engine.prerequisitesOf(c.id).length >= 2)!;
    const known = engine.prerequisitesOf(target.id)[0]!.concept;
    const path = engine.studyPath(progressOf([[known.id, "mastered"]]), target.id)!;
    expect(path.steps.map((s) => s.concept.id)).not.toContain(known.id);
    expect(path.alreadyKnown.map((c) => c.id)).toContain(known.id);
  });

  it("marks a target you already know as reached", () => {
    const target = seedIndex.graph.concepts[3]!;
    expect(engine.studyPath(progressOf([[target.id, "understood"]]), target.id)!.reached).toBe(true);
    expect(engine.studyPath({}, target.id)!.reached).toBe(false);
  });
});

describe("clusters", () => {
  const clusters = engine.clusters();

  it("finds feedback loops where every member reaches the others", () => {
    expect(clusters.length).toBeGreaterThan(0);
    for (const cluster of clusters) {
      expect(cluster.concepts.length).toBeGreaterThanOrEqual(2);
      const members = new Set(cluster.concepts.map((c) => c.id));
      for (const start of members) {
        const seen = new Set([start]);
        const queue = [start];
        while (queue.length > 0) {
          const id = queue.shift()!;
          for (const dep of engine.dependentsOf(id)) {
            if (seen.has(dep.concept.id)) continue;
            seen.add(dep.concept.id);
            queue.push(dep.concept.id);
          }
        }
        for (const other of members) expect(seen.has(other)).toBe(true);
      }
    }
  });

  it("never lists a concept in two clusters and is stable", () => {
    const seen = new Set<string>();
    for (const cluster of clusters) {
      for (const concept of cluster.concepts) {
        expect(seen.has(concept.id)).toBe(false);
        seen.add(concept.id);
      }
    }
    expect(engine.clusters().map((c) => c.concepts.map((x) => x.id).join(","))).toEqual(
      clusters.map((c) => c.concepts.map((x) => x.id).join(",")),
    );
  });

  it("folds progress into the cluster view", () => {
    const first = clusters[0]!;
    const progress = progressOf([[first.concepts[0]!.id, "mastered"]]);
    const withProgress = clustersWithProgress(engine, progress, clusters);
    expect(withProgress[0]?.known).toBe(1);
  });
});

describe("summary", () => {
  it("counts every concept exactly once", () => {
    const summary = engine.summary({});
    const total = MASTERY_STATES.reduce((sum, state) => sum + summary.counts[state], 0);
    expect(total).toBe(seedIndex.graph.concepts.length);
    expect(summary.depth).toBe(0);
    expect(summary.known).toBe(0);
  });

  it("reaches full depth when everything is mastered", () => {
    const all = progressOf(
      seedIndex.graph.concepts.map((c) => [c.id, "mastered"] as [string, MasteryState]),
    );
    const summary = engine.summary(all);
    expect(summary.depth).toBe(1);
    expect(summary.known).toBe(seedIndex.graph.concepts.length);
    expect(summary.byLayer.every((l) => l.ratio === 1)).toBe(true);
  });

  it("keeps layer totals equal to the layer sizes", () => {
    const summary = engine.summary({});
    for (const row of summary.byLayer) {
      expect(row.total).toBe(seedIndex.conceptsInLayer(row.layer.id).length);
    }
    expect(summary.byLayer.map((l) => l.layer.order)).toEqual(
      [...summary.byLayer.map((l) => l.layer.order)].sort((a, b) => a - b),
    );
  });

  it("treats understood and mastered as known", () => {
    expect([...KNOWN_STATES]).toEqual(["understood", "mastered"]);
  });
});
