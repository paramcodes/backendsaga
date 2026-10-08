import { describe, expect, it } from "vitest";

import {
  PROGRESS_STORAGE_KEY,
  clearStoredProgress,
  countTouched,
  mergeProgress,
  normalizeProgress,
  progressEntries,
  readStoredProgress,
  setProgressState,
  writeStoredProgress,
} from "./progress-store";
import type { ProgressMap } from "./learning-engine";

const entry = (conceptId: string, state: string, updatedAt: string) => ({ conceptId, state, updatedAt });

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("normalizeProgress", () => {
  it("keeps well-formed entries and drops junk", () => {
    const map = normalizeProgress({
      "retry-storm": entry("retry-storm", "mastered", "2026-01-02T00:00:00.000Z"),
      "cache-stampede": entry("cache-stampede", "nonsense", "2026-01-02T00:00:00.000Z"),
      "lock-contention": "not an object",
    });
    expect(Object.keys(map)).toEqual(["retry-storm"]);
    expect(map["retry-storm"]?.state).toBe("mastered");
  });

  it("drops 'unknown', because not-started is simply absent", () => {
    const map = normalizeProgress({ "n-plus-one": entry("n-plus-one", "unknown", "2026-01-02T00:00:00.000Z") });
    expect(map).toEqual({});
  });

  it("recovers the concept id from the key when the row omits it", () => {
    const map = normalizeProgress({ deadlock: { state: "learning", updatedAt: "2026-01-02T00:00:00.000Z" } });
    expect(map["deadlock"]?.conceptId).toBe("deadlock");
  });

  it("accepts a plain array of rows, as the database returns them", () => {
    const map = normalizeProgress([entry("deadlock", "learning", "2026-01-02T00:00:00.000Z")]);
    expect(map["deadlock"]?.state).toBe("learning");
  });

  it("replaces an unreadable timestamp with the epoch so it loses every merge", () => {
    const map = normalizeProgress({ deadlock: entry("deadlock", "learning", "whenever") });
    expect(map["deadlock"]?.updatedAt).toBe(new Date(0).toISOString());
  });

  it("returns an empty map for anything that is not a record", () => {
    expect(normalizeProgress(null)).toEqual({});
    expect(normalizeProgress("x")).toEqual({});
  });
});

describe("mergeProgress", () => {
  const older: ProgressMap = normalizeProgress({
    deadlock: entry("deadlock", "learning", "2026-01-01T00:00:00.000Z"),
    "retry-storm": entry("retry-storm", "mastered", "2026-01-05T00:00:00.000Z"),
  });
  const newer: ProgressMap = normalizeProgress({
    deadlock: entry("deadlock", "mastered", "2026-02-01T00:00:00.000Z"),
    "cold-cache": entry("cold-cache", "understood", "2026-01-09T00:00:00.000Z"),
  });

  it("takes the most recent state per concept", () => {
    const merged = mergeProgress(older, newer);
    expect(merged["deadlock"]?.state).toBe("mastered");
    expect(merged["retry-storm"]?.state).toBe("mastered");
    expect(merged["cold-cache"]?.state).toBe("understood");
  });

  it("does not let an older write undo a newer one", () => {
    const merged = mergeProgress(newer, older);
    expect(merged["deadlock"]?.state).toBe("mastered");
  });

  it("is stable when merged twice", () => {
    const once = mergeProgress(older, newer);
    expect(mergeProgress(once, newer)).toEqual(once);
  });
});

describe("setProgressState", () => {
  it("adds a timestamped entry", () => {
    const map = setProgressState({}, "deadlock", "learning", "2026-03-01T00:00:00.000Z");
    expect(map["deadlock"]).toEqual({
      conceptId: "deadlock",
      state: "learning",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
  });

  it("removes the entry when the state goes back to unknown", () => {
    const map = setProgressState({}, "deadlock", "learning", "2026-03-01T00:00:00.000Z");
    expect(setProgressState(map, "deadlock", "unknown")).toEqual({});
  });

  it("leaves the previous map untouched", () => {
    const before = setProgressState({}, "deadlock", "learning", "2026-03-01T00:00:00.000Z");
    setProgressState(before, "deadlock", "mastered");
    expect(before["deadlock"]?.state).toBe("learning");
  });
});

describe("browser storage", () => {
  it("round-trips through a storage object", () => {
    const storage = fakeStorage();
    const map = setProgressState({}, "deadlock", "mastered", "2026-03-01T00:00:00.000Z");
    writeStoredProgress(map, storage);
    expect(storage.data.has(PROGRESS_STORAGE_KEY)).toBe(true);
    expect(readStoredProgress(storage)).toEqual(map);
    clearStoredProgress(storage);
    expect(readStoredProgress(storage)).toEqual({});
  });

  it("survives corrupted storage", () => {
    const storage = fakeStorage();
    storage.setItem(PROGRESS_STORAGE_KEY, "{not json");
    expect(readStoredProgress(storage)).toEqual({});
  });

  it("does nothing without a storage object (server render)", () => {
    expect(readStoredProgress(undefined)).toEqual({});
    expect(() => writeStoredProgress({}, undefined)).not.toThrow();
  });

  it("counts and lists entries in a stable order", () => {
    let map: ProgressMap = {};
    map = setProgressState(map, "retry-storm", "learning", "2026-03-01T00:00:00.000Z");
    map = setProgressState(map, "deadlock", "mastered", "2026-03-02T00:00:00.000Z");
    expect(countTouched(map)).toBe(2);
    expect(progressEntries(map).map((e) => e.conceptId)).toEqual(["deadlock", "retry-storm"]);
  });
});
