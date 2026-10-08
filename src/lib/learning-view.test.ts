import { describe, expect, it } from "vitest";

import { seedIndex } from "@/domain";
import { createLearningEngine, type MasteryState, type ProgressMap } from "./learning-engine";
import {
  MASTERY_CHOICES,
  coverageLine,
  depthLabel,
  groupConceptsByLayer,
  masteryBands,
  masteryClass,
  pathSummary,
  percent,
  relativeDays,
} from "./learning-view";

const engine = createLearningEngine(seedIndex);

const progressWith = (states: [string, MasteryState][]): ProgressMap =>
  Object.fromEntries(
    states.map(([conceptId, state]) => [
      conceptId,
      { conceptId, state, updatedAt: new Date().toISOString() },
    ]),
  );

describe("learning-view", () => {
  it("offers every state except 'unknown' as a choice", () => {
    expect(MASTERY_CHOICES).not.toContain("unknown");
    expect(MASTERY_CHOICES).toHaveLength(4);
  });

  it("maps a state to its colour class", () => {
    expect(masteryClass("needs-review")).toBe("mastery-needs-review");
  });

  it("clamps percentages", () => {
    expect(percent(-1)).toBe(0);
    expect(percent(0.456)).toBe(46);
    expect(percent(4)).toBe(100);
  });

  it("describes an empty atlas and a full one differently", () => {
    const empty = engine.summary({});
    expect(depthLabel(empty)).toBe("Nothing marked yet");
    const all = progressWith(seedIndex.graph.concepts.map((c) => [c.id, "mastered"] as [string, MasteryState]));
    expect(depthLabel(engine.summary(all))).toBe("Through the atlas");
  });

  it("writes a coverage line that counts only what is known", () => {
    const summary = engine.summary(
      progressWith([
        ["deadlock", "mastered"],
        ["retry-storm", "learning"],
      ]),
    );
    expect(coverageLine(summary)).toMatch(/^1 of 51 entries known · \d+% depth$/);
  });

  it("splits a stacked bar into bands that add up", () => {
    const summary = engine.summary(
      progressWith([
        ["deadlock", "mastered"],
        ["retry-storm", "learning"],
        ["cold-cache", "understood"],
      ]),
    );
    const bands = masteryBands(summary.counts, summary.total);
    expect(bands.map((b) => b.state)).toEqual(["mastered", "understood", "learning"]);
    const sum = bands.reduce((total, band) => total + band.width, 0);
    expect(sum).toBeCloseTo((3 / summary.total) * 100, 5);
  });

  it("returns no bands when nothing is marked", () => {
    expect(masteryBands(engine.summary({}).counts, 0)).toEqual([]);
  });

  it("groups concepts by layer in layer order", () => {
    const groups = groupConceptsByLayer(seedIndex.graph.concepts, seedIndex.graph.layers);
    expect(groups).toHaveLength(seedIndex.graph.layers.length);
    const orders = groups.map((g) => g.layer.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    for (const group of groups) {
      const names = group.concepts.map((c) => c.name);
      expect([...names].sort((a, b) => a.localeCompare(b))) .toEqual(names);
    }
  });

  it("phrases a study path by how much comes first", () => {
    expect(pathSummary(1, true)).toMatch(/read it now/i);
    expect(pathSummary(4, true)).toBe("3 entries to read first.");
    expect(pathSummary(2, true)).toBe("1 entry to read first.");
    expect(pathSummary(3, false)).toMatch(/not reachable/i);
  });

  it("reads timestamps the way a person would", () => {
    expect(relativeDays(0)).toBe("today");
    expect(relativeDays(1)).toBe("yesterday");
    expect(relativeDays(12)).toBe("12 days ago");
    expect(relativeDays(31)).toBe("a month ago");
    expect(relativeDays(95)).toBe("3 months ago");
  });
});
