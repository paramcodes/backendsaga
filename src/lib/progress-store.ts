// Where mastery states live before (and alongside) an account.
//
// Guests keep progress in the browser; signing in merges it with the copy in
// the database. Both halves use the same shapes and the same merge rule, so
// the sync is a two-line operation at the edges. No React, no I/O beyond the
// Storage object handed in.
import { MASTERY_STATES, type MasteryState, type ProgressEntry, type ProgressMap } from "./learning-engine";

export const PROGRESS_STORAGE_KEY = "atlas.progress.v1";

const isMasteryState = (value: unknown): value is MasteryState =>
  typeof value === "string" && (MASTERY_STATES as readonly string[]).includes(value);

const isoOrNow = (value: unknown): string => {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return new Date(0).toISOString();
};

/** Accepts anything (old storage, a stale server row) and returns a clean map. */
export function normalizeProgress(raw: unknown): ProgressMap {
  if (!raw || typeof raw !== "object") return {};
  const out: ProgressMap = {};

  const entries: unknown[] = Array.isArray(raw) ? raw : Object.values(raw);
  const keys: string[] = Array.isArray(raw) ? [] : Object.keys(raw);

  entries.forEach((value, i) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const conceptId =
      typeof record["conceptId"] === "string" && record["conceptId"].length > 0
        ? record["conceptId"]
        : (keys[i] ?? "");
    if (!conceptId) return;
    const state = record["state"];
    if (!isMasteryState(state) || state === "unknown") return;
    out[conceptId] = { conceptId, state, updatedAt: isoOrNow(record["updatedAt"]) };
  });

  return out;
}

/** Newest write per concept wins; ties keep the incoming value. */
export function mergeProgress(base: ProgressMap, incoming: ProgressMap): ProgressMap {
  const merged: ProgressMap = { ...base };
  for (const entry of Object.values(incoming)) {
    const existing = merged[entry.conceptId];
    if (!existing || Date.parse(entry.updatedAt) >= Date.parse(existing.updatedAt)) {
      merged[entry.conceptId] = entry;
    }
  }
  return merged;
}

/** Setting a concept back to "unknown" removes it — absence is the default. */
export function setProgressState(
  map: ProgressMap,
  conceptId: string,
  state: MasteryState,
  now: string = new Date().toISOString(),
): ProgressMap {
  const next = { ...map };
  if (state === "unknown") delete next[conceptId];
  else next[conceptId] = { conceptId, state, updatedAt: now };
  return next;
}

export function progressEntries(map: ProgressMap): ProgressEntry[] {
  return Object.values(map).sort((a, b) => a.conceptId.localeCompare(b.conceptId));
}

export function countTouched(map: ProgressMap): number {
  return Object.keys(map).length;
}

type MaybeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;

const browserStorage = (): MaybeStorage => {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    // Private mode or blocked storage: progress stays in memory for the session.
    return undefined;
  }
};

export function readStoredProgress(storage: MaybeStorage = browserStorage()): ProgressMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function writeStoredProgress(map: ProgressMap, storage: MaybeStorage = browserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Out of quota or blocked: the in-memory copy still drives the session.
  }
}

export function clearStoredProgress(storage: MaybeStorage = browserStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(PROGRESS_STORAGE_KEY);
  } catch {
    // Nothing to do — the caller already cleared its own state.
  }
}
