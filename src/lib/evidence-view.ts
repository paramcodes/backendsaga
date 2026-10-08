// Pure evidence presentation logic: labels, filtering, grouping, ranking.
// No React, no DOM — this module is unit-testable on its own.
import type { Concept, Evidence, EvidenceKind } from "@/domain";

export type EvidenceTrend = Evidence["trend"];

export const EVIDENCE_KIND_META: Record<
  EvidenceKind,
  { label: string; short: string; blurb: string }
> = {
  METRIC: {
    label: "Metric",
    short: "MET",
    blurb: "A number sampled over time: counters, gauges, histograms.",
  },
  LOG: {
    label: "Log",
    short: "LOG",
    blurb: "A line emitted when something specific happened.",
  },
  TRACE: {
    label: "Trace",
    short: "TRC",
    blurb: "One request's journey, span by span, across services.",
  },
  PROFILE: {
    label: "Profile",
    short: "PRF",
    blurb: "Where the process spent CPU time or allocated memory.",
  },
  QUERY_PLAN: {
    label: "Query plan",
    short: "PLN",
    blurb: "What the database decided to do with your statement.",
  },
  PACKET: {
    label: "Packet",
    short: "PKT",
    blurb: "The wire itself: captures, retransmits, handshakes.",
  },
  OS_COUNTER: {
    label: "OS counter",
    short: "SYS",
    blurb: "Kernel and cgroup accounting below the runtime.",
  },
};

export const EVIDENCE_TREND_META: Record<EvidenceTrend, { label: string; sign: string }> = {
  UP: { label: "rises", sign: "↑" },
  DOWN: { label: "falls", sign: "↓" },
  SPIKE: { label: "spikes", sign: "⌃" },
  FLAT: { label: "holds flat", sign: "→" },
  PRESENT: { label: "appears", sign: "•" },
};

export const EVIDENCE_KIND_ORDER: EvidenceKind[] = [
  "METRIC",
  "TRACE",
  "LOG",
  "QUERY_PLAN",
  "PROFILE",
  "OS_COUNTER",
  "PACKET",
];

export type EvidenceFilters = {
  kinds: EvidenceKind[];
  layerIds: string[];
  query: string;
};

export const EMPTY_EVIDENCE_FILTERS: EvidenceFilters = { kinds: [], layerIds: [], query: "" };

const haystack = (item: Evidence, concept: Concept | undefined) =>
  [
    item.signal,
    item.whatYouSee,
    item.whereToLook,
    item.whyItMatters,
    item.falsePositive ?? "",
    concept?.name ?? "",
    concept?.description ?? "",
  ]
    .join(" \u0001 ")
    .toLowerCase();

/**
 * Filters evidence by kind, layer and free text. All three narrow together;
 * free text requires every whitespace-separated term to appear somewhere.
 */
export function filterEvidence(
  items: Evidence[],
  filters: EvidenceFilters,
  conceptById: Map<string, Concept>,
): Evidence[] {
  const terms = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const kinds = new Set(filters.kinds);
  const layerIds = new Set(filters.layerIds);

  return items.filter((item) => {
    if (kinds.size > 0 && !kinds.has(item.kind)) return false;
    const concept = conceptById.get(item.conceptId);
    if (layerIds.size > 0 && (!concept || !layerIds.has(concept.layerId))) return false;
    if (terms.length === 0) return true;
    const text = haystack(item, concept);
    return terms.every((term) => text.includes(term));
  });
}

export type EvidenceGroup = { concept: Concept; items: Evidence[] };

/**
 * Groups evidence under its concept, preserving the concept ordering of the
 * atlas and dropping evidence whose concept is unknown.
 */
export function groupEvidenceByConcept(
  items: Evidence[],
  concepts: Concept[],
): EvidenceGroup[] {
  const byConcept = new Map<string, Evidence[]>();
  for (const item of items) {
    const list = byConcept.get(item.conceptId);
    if (list) list.push(item);
    else byConcept.set(item.conceptId, [item]);
  }
  const groups: EvidenceGroup[] = [];
  for (const concept of concepts) {
    const list = byConcept.get(concept.id);
    if (list && list.length > 0) groups.push({ concept, items: list });
  }
  return groups;
}

/** Count of evidence per kind, for filter chips and coverage panels. */
export function countByKind(items: Evidence[]): Record<EvidenceKind, number> {
  const counts = Object.fromEntries(
    EVIDENCE_KIND_ORDER.map((kind) => [kind, 0]),
  ) as Record<EvidenceKind, number>;
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

/** Toggles a value in a list; used by the kind and layer filter chips. */
export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** Serialises a filter list for the URL; empty becomes undefined. */
export const encodeList = (list: string[]): string | undefined =>
  list.length > 0 ? list.join(",") : undefined;

/** Parses a comma-separated URL filter, keeping only allowed values. */
export const decodeList = <T extends string>(raw: string | undefined, allowed: readonly T[]): T[] => {
  if (!raw) return [];
  const permitted = new Set<string>(allowed);
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is T => permitted.has(part));
};
