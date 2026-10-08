// Phase 9 — the learning system, derived entirely from the graph.
//
// Pure TypeScript: no React, no I/O, no AI. Given a graph index and a map of
// mastery states it answers the four questions the atlas is supposed to answer:
//   What should I learn next?   -> recommend()
//   What am I weak at?          -> weakSpots()
//   What depends on this?       -> dependentsOf()
//   What is strongly connected? -> clusters()
import type { Concept, Layer, RelationshipType } from "@/domain/schema";
import type { GraphIndex } from "@/domain/graph-index";

export const MASTERY_STATES = ["unknown", "learning", "understood", "mastered", "needs-review"] as const;
export type MasteryState = (typeof MASTERY_STATES)[number];

/** States that count as "you know this" when ordering material. */
export const KNOWN_STATES = ["understood", "mastered"] as const satisfies readonly MasteryState[];

export const MASTERY_META: Record<
  MasteryState,
  { label: string; action: string; blurb: string; weight: number }
> = {
  unknown: {
    label: "Not started",
    action: "Clear",
    blurb: "Nothing recorded yet.",
    weight: 0,
  },
  learning: {
    label: "Learning",
    action: "I'm learning this",
    blurb: "Read it, still assembling the mechanism.",
    weight: 0.35,
  },
  understood: {
    label: "Understood",
    action: "I understand this",
    blurb: "Could explain the mechanism and the trade-off.",
    weight: 0.75,
  },
  mastered: {
    label: "Mastered",
    action: "I've debugged this live",
    blurb: "Recognised it in production and know the signals cold.",
    weight: 1,
  },
  "needs-review": {
    label: "Needs review",
    action: "Flag for review",
    blurb: "Knew it once; the details have gone soft.",
    weight: 0.4,
  },
};

export type ProgressEntry = { conceptId: string; state: MasteryState; updatedAt: string };
export type ProgressMap = Record<string, ProgressEntry>;

export type PrereqStrength = "hard" | "soft";

type Ordering = {
  /** Which end of the edge should be learned first. */
  direction: "source-first" | "target-first";
  strength: PrereqStrength;
  /** Reads as "<concept> <phrase> <other>". */
  phrase: string;
};

/**
 * Learning order read off the relationship vocabulary. The atlas records how
 * systems behave, not a syllabus, so the order is derived: you learn a cause
 * before its effect, and a problem before the thing that fixes it.
 */
export const LEARNING_ORDER: Partial<Record<RelationshipType, Ordering>> = {
  REQUIRES: { direction: "target-first", strength: "hard", phrase: "requires" },
  DEPENDS_ON: { direction: "target-first", strength: "hard", phrase: "depends on" },
  MITIGATES: { direction: "target-first", strength: "soft", phrase: "is the fix for" },
  CAUSES: { direction: "source-first", strength: "soft", phrase: "is caused by" },
  AMPLIFIES: { direction: "source-first", strength: "soft", phrase: "is made worse by" },
};

/** Edges that pair concepts without ordering them. */
export const COMPANION_TYPES = ["ALTERNATIVE_TO", "TRADEOFF_OF"] as const satisfies readonly RelationshipType[];

export type Prerequisite = {
  concept: Concept;
  strength: PrereqStrength;
  via: RelationshipType;
  /** Full sentence, e.g. "Circuit Breaker requires Missing Timeout". */
  sentence: string;
};

export type Dependent = {
  concept: Concept;
  strength: PrereqStrength;
  via: RelationshipType;
  sentence: string;
};

export type Companion = { concept: Concept; via: RelationshipType; sentence: string };

export type Readiness = {
  /** Prerequisites already in a known state. */
  known: number;
  total: number;
  ratio: number;
  /** Hard prerequisites still unknown — these block the concept outright. */
  blockedBy: Concept[];
  missing: Concept[];
};

export type Recommendation = {
  concept: Concept;
  state: MasteryState;
  score: number;
  reasons: string[];
  readiness: Readiness;
  /** Prerequisites you already know, the reason this one is next. */
  restsOn: Concept[];
  /** What this concept opens up once you know it. */
  unlocks: Concept[];
};

export type WeakSpotKind = "flagged" | "stalled" | "shaky" | "fading";

export type WeakSpot = {
  concept: Concept;
  kind: WeakSpotKind;
  state: MasteryState;
  detail: string;
  /** Days since the state was last touched, when that matters. */
  ageDays: number;
  related: Concept[];
};

export type StudyStep = { concept: Concept; state: MasteryState; reason: string };

export type StudyPath = {
  target: Concept;
  reached: boolean;
  steps: StudyStep[];
  alreadyKnown: Concept[];
};

export type Cluster = {
  concepts: Concept[];
  /** How many members are already in a known state. */
  known: number;
  /** One line describing why these belong together. */
  summary: string;
};

export type LayerProgress = {
  layer: Layer;
  total: number;
  known: number;
  ratio: number;
  counts: Record<MasteryState, number>;
};

export type ProgressSummary = {
  total: number;
  counts: Record<MasteryState, number>;
  known: number;
  touched: number;
  /** Weighted completion across the whole atlas, 0–1. */
  depth: number;
  byLayer: LayerProgress[];
};

export type LearningEngine = {
  stateOf: (progress: ProgressMap, conceptId: string) => MasteryState;
  prerequisitesOf: (conceptId: string) => Prerequisite[];
  dependentsOf: (conceptId: string) => Dependent[];
  companionsOf: (conceptId: string) => Companion[];
  readiness: (progress: ProgressMap, conceptId: string) => Readiness;
  reachOf: (conceptId: string) => number;
  summary: (progress: ProgressMap) => ProgressSummary;
  recommend: (progress: ProgressMap, limit?: number) => Recommendation[];
  weakSpots: (progress: ProgressMap, now?: number, limit?: number) => WeakSpot[];
  studyPath: (progress: ProgressMap, targetId: string) => StudyPath | null;
  clusters: () => Cluster[];
};

/** A "learning" state older than this has stalled. */
export const STALL_DAYS = 10;
/** Mastery recorded longer ago than this is worth refreshing. */
export const FADE_DAYS = 60;
/** How far the study path walks back through prerequisites. */
export const MAX_PATH_DEPTH = 3;
/** Steps the study path shows before the target itself. */
export const MAX_PATH_STEPS = 7;
/** How far downstream reach is counted. */
export const MAX_REACH_DEPTH = 3;

const EMPTY_COUNTS = (): Record<MasteryState, number> => ({
  unknown: 0,
  learning: 0,
  understood: 0,
  mastered: 0,
  "needs-review": 0,
});

const isKnown = (state: MasteryState): boolean =>
  (KNOWN_STATES as readonly MasteryState[]).includes(state);

const dayMs = 86_400_000;

const ageInDays = (iso: string, now: number): number => {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now - then) / dayMs));
};

const push = <T>(map: Map<string, T[]>, key: string, value: T): void => {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
};

const byName = (a: Concept, b: Concept): number => a.name.localeCompare(b.name);

export function createLearningEngine(index: GraphIndex): LearningEngine {
  const { concepts, relationships, layers } = index.graph;
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const layerRank = new Map(layers.map((l) => [l.id, l.order]));

  const prereqs = new Map<string, Prerequisite[]>();
  const dependents = new Map<string, Dependent[]>();
  const companions = new Map<string, Companion[]>();

  for (const rel of relationships) {
    const source = conceptById.get(rel.sourceId);
    const target = conceptById.get(rel.targetId);
    if (!source || !target) continue;

    if ((COMPANION_TYPES as readonly RelationshipType[]).includes(rel.type)) {
      const phrase = rel.type === "ALTERNATIVE_TO" ? "is an alternative to" : "trades off against";
      push(companions, source.id, {
        concept: target,
        via: rel.type,
        sentence: `${source.name} ${phrase} ${target.name}`,
      });
      push(companions, target.id, {
        concept: source,
        via: rel.type,
        sentence: `${target.name} ${phrase} ${source.name}`,
      });
      continue;
    }

    const ordering = LEARNING_ORDER[rel.type];
    if (!ordering) continue;

    // `later` is learned after `earlier`.
    const later = ordering.direction === "target-first" ? source : target;
    const earlier = ordering.direction === "target-first" ? target : source;

    push(prereqs, later.id, {
      concept: earlier,
      strength: ordering.strength,
      via: rel.type,
      sentence: `${later.name} ${ordering.phrase} ${earlier.name}`,
    });
    push(dependents, earlier.id, {
      concept: later,
      strength: ordering.strength,
      via: rel.type,
      sentence: `${later.name} ${ordering.phrase} ${earlier.name}`,
    });
  }

  const prerequisitesOf = (id: string): Prerequisite[] => prereqs.get(id) ?? [];
  const dependentsOf = (id: string): Dependent[] => dependents.get(id) ?? [];
  const companionsOf = (id: string): Companion[] => companions.get(id) ?? [];

  // How much of the atlas opens up downstream of a concept, bounded so a hub
  // in a dense cluster cannot claim the entire graph.
  const reach = new Map<string, number>();
  for (const concept of concepts) {
    const seen = new Set<string>([concept.id]);
    let frontier = [concept.id];
    for (let depth = 0; depth < MAX_REACH_DEPTH && frontier.length > 0; depth += 1) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const dep of dependentsOf(id)) {
          if (seen.has(dep.concept.id)) continue;
          seen.add(dep.concept.id);
          next.push(dep.concept.id);
        }
      }
      frontier = next;
    }
    reach.set(concept.id, seen.size - 1);
  }

  const maxReach = Math.max(1, ...concepts.map((c) => reach.get(c.id) ?? 0));
  const maxDegree = Math.max(1, ...concepts.map((c) => index.degree(c.id)));

  const stateOf = (progress: ProgressMap, conceptId: string): MasteryState =>
    progress[conceptId]?.state ?? "unknown";

  const readiness = (progress: ProgressMap, conceptId: string): Readiness => {
    const list = prerequisitesOf(conceptId);
    const seen = new Map<string, Prerequisite>();
    for (const prereq of list) {
      const existing = seen.get(prereq.concept.id);
      if (!existing || (existing.strength === "soft" && prereq.strength === "hard")) {
        seen.set(prereq.concept.id, prereq);
      }
    }
    const unique = [...seen.values()];
    const missing = unique.filter((p) => !isKnown(stateOf(progress, p.concept.id)));
    const blockedBy = missing.filter((p) => p.strength === "hard").map((p) => p.concept);
    const known = unique.length - missing.length;
    return {
      known,
      total: unique.length,
      ratio: unique.length === 0 ? 0 : known / unique.length,
      blockedBy: [...blockedBy].sort(byName),
      missing: missing.map((p) => p.concept).sort(byName),
    };
  };

  const summary = (progress: ProgressMap): ProgressSummary => {
    const counts = EMPTY_COUNTS();
    let weighted = 0;
    for (const concept of concepts) {
      const state = stateOf(progress, concept.id);
      counts[state] += 1;
      weighted += MASTERY_META[state].weight;
    }
    const byLayer: LayerProgress[] = [...layers]
      .sort((a, b) => a.order - b.order)
      .map((layer) => {
        const inLayer = index.conceptsInLayer(layer.id);
        const layerCounts = EMPTY_COUNTS();
        let known = 0;
        for (const concept of inLayer) {
          const state = stateOf(progress, concept.id);
          layerCounts[state] += 1;
          if (isKnown(state)) known += 1;
        }
        return {
          layer,
          total: inLayer.length,
          known,
          ratio: inLayer.length === 0 ? 0 : known / inLayer.length,
          counts: layerCounts,
        };
      });

    return {
      total: concepts.length,
      counts,
      known: counts.understood + counts.mastered,
      touched: concepts.length - counts.unknown,
      depth: concepts.length === 0 ? 0 : weighted / concepts.length,
      byLayer,
    };
  };

  const recommend = (progress: ProgressMap, limit = 6): Recommendation[] => {
    const scored: Recommendation[] = [];

    for (const concept of concepts) {
      const state = stateOf(progress, concept.id);
      if (isKnown(state)) continue;

      const ready = readiness(progress, concept.id);
      const neighbors = index.neighbors(concept.id);
      const knownNeighbors = neighbors.filter((n) => isKnown(stateOf(progress, n.other.id)));
      const neighborRatio = neighbors.length === 0 ? 0 : knownNeighbors.length / neighbors.length;
      const reachNorm = (reach.get(concept.id) ?? 0) / maxReach;
      const degreeNorm = index.degree(concept.id) / maxDegree;
      const hasEvidence = index.evidenceFor(concept.id).length > 0;

      const reasons: string[] = [];
      let score = 0;

      if (state === "needs-review") {
        score += 3;
        reasons.push("You flagged this for review.");
      }
      if (state === "learning") {
        score += 2;
        reasons.push("Already open — finish it before starting something new.");
      }
      if (ready.total > 0 && ready.ratio > 0) {
        score += 1.8 * ready.ratio;
        const restsOn = prerequisitesOf(concept.id)
          .filter((p) => isKnown(stateOf(progress, p.concept.id)))
          .map((p) => p.concept.name);
        const unique = [...new Set(restsOn)];
        if (unique.length > 0) {
          reasons.push(
            unique.length === 1
              ? `Builds straight on ${unique[0]}, which you know.`
              : `Builds on ${unique.slice(0, 2).join(" and ")}, which you know.`,
          );
        }
      }
      if (neighborRatio > 0) {
        score += 1.2 * neighborRatio;
        if (knownNeighbors.length >= 2 && ready.ratio === 0) {
          reasons.push(`Sits next to ${knownNeighbors.length} entries you already know.`);
        }
      }
      score += 1 * reachNorm;
      score += 0.6 * degreeNorm;
      if (hasEvidence) score += 0.3;

      const downstream = reach.get(concept.id) ?? 0;
      if (downstream >= 6) {
        reasons.push(`Upstream of ${downstream} other entries — learning it explains a lot of them.`);
      }
      if (ready.blockedBy.length > 0) {
        // Only a cold start is really blocked: if the learner already opened or
        // flagged the entry, the missing groundwork is a note, not a veto.
        if (state === "unknown") score -= 4;
        reasons.push(
          `Needs ${ready.blockedBy.map((c) => c.name).join(" and ")} first.`,
        );
      } else if (ready.total > 0 && ready.ratio === 0) {
        score -= 0.8 * Math.min(1, ready.total / 4);
      }

      if (reasons.length === 0) {
        reasons.push(
          degreeNorm > 0.4
            ? "A hub in the graph — most routes pass through it."
            : "Foundation material: nothing in the atlas has to come first.",
        );
      }

      scored.push({
        concept,
        state,
        score: Math.round(score * 1000) / 1000,
        reasons,
        readiness: ready,
        restsOn: prerequisitesOf(concept.id)
          .filter((p) => isKnown(stateOf(progress, p.concept.id)))
          .map((p) => p.concept)
          .filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i)
          .sort(byName),
        unlocks: dependentsOf(concept.id)
          .map((d) => d.concept)
          .filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i)
          .filter((c) => !isKnown(stateOf(progress, c.id)))
          .sort(byName)
          .slice(0, 4),
      });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const rankA = layerRank.get(a.concept.layerId) ?? 99;
      const rankB = layerRank.get(b.concept.layerId) ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      const degreeDiff = index.degree(b.concept.id) - index.degree(a.concept.id);
      if (degreeDiff !== 0) return degreeDiff;
      return byName(a.concept, b.concept);
    });

    return scored.slice(0, limit);
  };

  const weakSpots = (progress: ProgressMap, now = Date.now(), limit = 8): WeakSpot[] => {
    const spots: WeakSpot[] = [];

    for (const concept of concepts) {
      const entry = progress[concept.id];
      if (!entry) continue;
      const state = entry.state;
      const age = ageInDays(entry.updatedAt, now);

      if (state === "needs-review") {
        spots.push({
          concept,
          kind: "flagged",
          state,
          ageDays: age,
          detail:
            age > 0
              ? `Flagged ${age} day${age === 1 ? "" : "s"} ago and still open.`
              : "You flagged this for review.",
          related: dependentsOf(concept.id)
            .map((d) => d.concept)
            .slice(0, 3),
        });
        continue;
      }

      if (state === "learning" && age >= STALL_DAYS) {
        spots.push({
          concept,
          kind: "stalled",
          state,
          ageDays: age,
          detail: `Open for ${age} days without a change.`,
          related: companionsOf(concept.id)
            .map((c) => c.concept)
            .slice(0, 3),
        });
        continue;
      }

      if (isKnown(state)) {
        const ready = readiness(progress, concept.id);
        if (ready.missing.length > 0 && ready.total >= 2 && ready.ratio < 0.5) {
          spots.push({
            concept,
            kind: "shaky",
            state,
            ageDays: age,
            detail: `Marked ${MASTERY_META[state].label.toLowerCase()}, but ${ready.missing
              .slice(0, 2)
              .map((c) => c.name)
              .join(" and ")} underneath ${ready.missing.length === 1 ? "is" : "are"} untouched.`,
            related: ready.missing.slice(0, 3),
          });
          continue;
        }
        if (state === "mastered" && age >= FADE_DAYS) {
          spots.push({
            concept,
            kind: "fading",
            state,
            ageDays: age,
            detail: `Mastered ${age} days ago — worth a re-read of the signals.`,
            related: index.evidenceFor(concept.id).length > 0 ? [] : [],
          });
        }
      }
    }

    const kindRank: Record<WeakSpotKind, number> = { flagged: 0, stalled: 1, shaky: 2, fading: 3 };
    spots.sort((a, b) => {
      if (kindRank[a.kind] !== kindRank[b.kind]) return kindRank[a.kind] - kindRank[b.kind];
      if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays;
      return byName(a.concept, b.concept);
    });

    return spots.slice(0, limit);
  };

  const studyPath = (progress: ProgressMap, targetId: string): StudyPath | null => {
    const target = conceptById.get(targetId);
    if (!target) return null;

    const alreadyKnown: Concept[] = [];
    const candidates = new Map<string, Concept>();
    const distance = new Map<string, number>();
    const hardness = new Map<string, boolean>();
    const seen = new Set<string>([targetId]);
    let frontier = [targetId];

    for (let depth = 0; depth < MAX_PATH_DEPTH && frontier.length > 0; depth += 1) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const prereq of prerequisitesOf(id)) {
          const other = prereq.concept;
          if (prereq.strength === "hard") hardness.set(other.id, true);
          if (seen.has(other.id)) continue;
          seen.add(other.id);
          if (isKnown(stateOf(progress, other.id))) {
            alreadyKnown.push(other);
            continue;
          }
          candidates.set(other.id, other);
          distance.set(other.id, depth + 1);
          next.push(other.id);
        }
      }
      frontier = next;
    }

    // A causal graph fans out fast: three hops upstream of a late-stage failure
    // is most of the atlas. Keep the groundwork closest to the target so the
    // plan stays a plan.
    const kept = [...candidates.keys()]
      .sort((a, b) => {
        const hardDiff = Number(hardness.get(b) ?? false) - Number(hardness.get(a) ?? false);
        if (hardDiff !== 0) return hardDiff;
        const distDiff = (distance.get(a) ?? 9) - (distance.get(b) ?? 9);
        if (distDiff !== 0) return distDiff;
        const reachDiff = (reach.get(b) ?? 0) - (reach.get(a) ?? 0);
        if (reachDiff !== 0) return reachDiff;
        return byName(candidates.get(a)!, candidates.get(b)!);
      })
      .slice(0, MAX_PATH_STEPS);

    const needed = new Map(kept.map((id) => [id, candidates.get(id)!]));

    // Kahn over the induced prerequisite subgraph; ties resolve by layer order
    // then name so the path is identical on every machine.
    const pending = new Map<string, Set<string>>();
    for (const id of needed.keys()) {
      const blockers = new Set(
        prerequisitesOf(id)
          .map((p) => p.concept.id)
          .filter((other) => needed.has(other)),
      );
      pending.set(id, blockers);
    }

    const steps: StudyStep[] = [];
    const placed = new Set<string>();
    while (placed.size < needed.size) {
      const ready = [...needed.keys()]
        .filter((id) => !placed.has(id) && [...(pending.get(id) ?? [])].every((b) => placed.has(b)))
        .sort((a, b) => {
          const ca = needed.get(a)!;
          const cb = needed.get(b)!;
          const rankA = layerRank.get(ca.layerId) ?? 99;
          const rankB = layerRank.get(cb.layerId) ?? 99;
          if (rankA !== rankB) return rankA - rankB;
          return byName(ca, cb);
        });

      // A cycle among prerequisites: take the one with the fewest blockers.
      const pick =
        ready[0] ??
        [...needed.keys()]
          .filter((id) => !placed.has(id))
          .sort((a, b) => {
            const left = [...(pending.get(a) ?? [])].filter((x) => !placed.has(x)).length;
            const right = [...(pending.get(b) ?? [])].filter((x) => !placed.has(x)).length;
            if (left !== right) return left - right;
            return byName(needed.get(a)!, needed.get(b)!);
          })[0];

      if (!pick) break;
      placed.add(pick);
      const concept = needed.get(pick)!;
      const supports = dependentsOf(pick).filter((d) => d.concept.id === targetId || needed.has(d.concept.id));
      const reason =
        supports.length > 0 && supports[0]
          ? supports[0].sentence
          : `${target.name} builds on ${concept.name}`;
      steps.push({ concept, state: stateOf(progress, concept.id), reason });
    }

    steps.push({
      concept: target,
      state: stateOf(progress, targetId),
      reason: "The entry you asked for.",
    });

    return {
      target,
      reached: isKnown(stateOf(progress, targetId)),
      steps,
      alreadyKnown: alreadyKnown
        .filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i)
        .sort(byName),
    };
  };

  // Tarjan's strongly connected components over the learning-order edges:
  // groups whose members all reach each other are feedback loops, and they are
  // the groups you cannot learn one at a time.
  const clusters = (): Cluster[] => {
    const indexOf = new Map<string, number>();
    const low = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const found: string[][] = [];
    let counter = 0;

    const edgesFrom = (id: string): string[] =>
      dependentsOf(id)
        .map((d) => d.concept.id)
        .sort();

    const strongConnect = (start: string): void => {
      type Frame = { id: string; children: string[]; cursor: number };
      const frames: Frame[] = [{ id: start, children: edgesFrom(start), cursor: 0 }];
      indexOf.set(start, counter);
      low.set(start, counter);
      counter += 1;
      stack.push(start);
      onStack.add(start);

      while (frames.length > 0) {
        const frame = frames[frames.length - 1]!;
        if (frame.cursor < frame.children.length) {
          const child = frame.children[frame.cursor]!;
          frame.cursor += 1;
          if (!indexOf.has(child)) {
            indexOf.set(child, counter);
            low.set(child, counter);
            counter += 1;
            stack.push(child);
            onStack.add(child);
            frames.push({ id: child, children: edgesFrom(child), cursor: 0 });
          } else if (onStack.has(child)) {
            low.set(frame.id, Math.min(low.get(frame.id)!, indexOf.get(child)!));
          }
          continue;
        }

        frames.pop();
        const parent = frames[frames.length - 1];
        if (parent) low.set(parent.id, Math.min(low.get(parent.id)!, low.get(frame.id)!));

        if (low.get(frame.id) === indexOf.get(frame.id)) {
          const component: string[] = [];
          for (;;) {
            const popped = stack.pop();
            if (popped === undefined) break;
            onStack.delete(popped);
            component.push(popped);
            if (popped === frame.id) break;
          }
          if (component.length > 1) found.push(component);
        }
      }
    };

    for (const concept of [...concepts].sort((a, b) => a.id.localeCompare(b.id))) {
      if (!indexOf.has(concept.id)) strongConnect(concept.id);
    }

    return found
      .map((ids) => {
        const members = ids
          .map((id) => conceptById.get(id))
          .filter((c): c is Concept => Boolean(c))
          .sort(byName);
        return {
          concepts: members,
          known: 0,
          summary: `${members.length} entries that each lead back to the others — a feedback loop, so they only make sense together.`,
        };
      })
      .sort((a, b) => {
        if (b.concepts.length !== a.concepts.length) return b.concepts.length - a.concepts.length;
        return (a.concepts[0]?.name ?? "").localeCompare(b.concepts[0]?.name ?? "");
      });
  };

  return {
    stateOf,
    prerequisitesOf,
    dependentsOf,
    companionsOf,
    readiness,
    reachOf: (id) => reach.get(id) ?? 0,
    summary,
    recommend,
    weakSpots,
    studyPath,
    clusters,
  };
}

/** Clusters with the learner's own progress folded in. */
export function clustersWithProgress(
  engine: LearningEngine,
  progress: ProgressMap,
  clusters: Cluster[],
): Cluster[] {
  return clusters.map((cluster) => ({
    ...cluster,
    known: cluster.concepts.filter((c) =>
      (KNOWN_STATES as readonly MasteryState[]).includes(engine.stateOf(progress, c.id)),
    ).length,
  }));
}
