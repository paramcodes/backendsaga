// Presentation helpers for the learning screens.
//
// Pure formatting only: no React, no DOM. The engine decides what is true,
// this file decides how it reads.
import type { Concept, Layer } from "@/domain/schema";
import {
  MASTERY_META,
  type MasteryState,
  type ProgressSummary,
  type WeakSpotKind,
} from "./learning-engine";

/** The order the control offers, left to right. "unknown" is the Clear button. */
export const MASTERY_CHOICES = ["learning", "understood", "mastered", "needs-review"] as const;

export const masteryClass = (state: MasteryState): string => `mastery-${state}`;

export const masteryLabel = (state: MasteryState): string => MASTERY_META[state].label;

export const percent = (ratio: number): number => Math.round(Math.max(0, Math.min(1, ratio)) * 100);

export const WEAK_SPOT_META: Record<WeakSpotKind, { label: string; blurb: string }> = {
  flagged: { label: "You flagged it", blurb: "Marked for review and still waiting." },
  stalled: { label: "Stalled", blurb: "Opened a while ago and never closed out." },
  shaky: { label: "Built on sand", blurb: "Marked known, but the groundwork underneath is untouched." },
  fading: { label: "Going cold", blurb: "Mastered long enough ago that the signals have faded." },
};

/** A one-line read on how far through the atlas someone is. */
export function depthLabel(summary: ProgressSummary): string {
  if (summary.touched === 0) return "Nothing marked yet";
  if (summary.known === 0) return "Getting started";
  if (summary.depth < 0.15) return "Early footing";
  if (summary.depth < 0.35) return "Finding the shape";
  if (summary.depth < 0.6) return "Working knowledge";
  if (summary.depth < 0.85) return "Deep in it";
  return "Through the atlas";
}

/** "3 of 51 entries · 6%" style line used in headers. */
export function coverageLine(summary: ProgressSummary): string {
  const entries = summary.total === 1 ? "entry" : "entries";
  return `${summary.known} of ${summary.total} ${entries} known · ${percent(summary.depth)}% depth`;
}

/** Width of each mastery band in a stacked bar, as CSS percentages. */
export function masteryBands(
  counts: Record<MasteryState, number>,
  total: number,
): { state: MasteryState; width: number }[] {
  if (total <= 0) return [];
  return (["mastered", "understood", "learning", "needs-review"] as const)
    .map((state) => ({ state: state as MasteryState, width: (counts[state] / total) * 100 }))
    .filter((band) => band.width > 0);
}

export type LayerGroup = { layer: Layer; concepts: Concept[] };

/** Concepts bucketed by layer, in layer order, for grouped pickers. */
export function groupConceptsByLayer(concepts: Concept[], layers: Layer[]): LayerGroup[] {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const groups = new Map<string, Concept[]>();
  for (const concept of concepts) {
    const bucket = groups.get(concept.layerId);
    if (bucket) bucket.push(concept);
    else groups.set(concept.layerId, [concept]);
  }
  return [...groups.entries()]
    .flatMap(([layerId, list]) => {
      const layer = byId.get(layerId);
      return layer ? [{ layer, concepts: [...list].sort((a, b) => a.name.localeCompare(b.name)) }] : [];
    })
    .sort((a, b) => a.layer.order - b.layer.order);
}

/** "4 steps before it" / "ready to read now". */
export function pathSummary(steps: number, reached: boolean): string {
  if (!reached) return "Not reachable from what the atlas records — read it on its own.";
  if (steps <= 1) return "Nothing stands in the way — read it now.";
  return `${steps - 1} ${steps === 2 ? "entry" : "entries"} to read first.`;
}

export function relativeDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? "a month ago" : `${months} months ago`;
}
