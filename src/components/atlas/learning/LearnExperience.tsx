import { useMemo } from "react";

import { createGraphIndex } from "@/domain/graph-index";
import type { AtlasGraphPayload } from "@/lib/atlas.functions";
import { useProgress } from "@/hooks/use-progress";
import { createLearningEngine, clustersWithProgress } from "@/lib/learning-engine";
import { AccountPanel } from "./AccountPanel";
import { LoopsCard } from "./LoopsCard";
import { NextUpList } from "./NextUpList";
import { ProgressOverview } from "./ProgressOverview";
import { StudyPlanner } from "./StudyPlanner";
import { WeakSpots } from "./WeakSpots";

type LearnExperienceProps = {
  graph: AtlasGraphPayload;
  /** The entry being planned towards, carried in the URL. */
  planTargetId: string | null;
  onPlanTarget: (conceptId: string | null) => void;
};

/**
 * The learning screen. Everything on it is derived in the browser by the pure
 * engine from two inputs: the graph (from the database) and the reader's own
 * marks. Nothing here writes to the knowledge base.
 */
export function LearnExperience({ graph, planTargetId, onPlanTarget }: LearnExperienceProps) {
  const { progress, ready } = useProgress();

  const engine = useMemo(
    () =>
      createLearningEngine(
        createGraphIndex({
          layers: graph.layers,
          concepts: graph.concepts,
          relationships: graph.relationships,
          evidence: [],
          sources: [],
          conceptSources: [],
        }),
      ),
    [graph],
  );

  const summary = useMemo(() => engine.summary(progress), [engine, progress]);
  const recommendations = useMemo(() => engine.recommend(progress, 6), [engine, progress]);
  const spots = useMemo(() => engine.weakSpots(progress), [engine, progress]);
  const loops = useMemo(
    () => clustersWithProgress(engine, progress, engine.clusters()),
    [engine, progress],
  );
  const path = useMemo(
    () => (planTargetId ? engine.studyPath(progress, planTargetId) : null),
    [engine, planTargetId, progress],
  );

  if (!ready) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading your progress">
        <div className="h-36 animate-pulse bg-muted" />
        <div className="h-24 animate-pulse bg-muted" />
        <div className="h-24 animate-pulse bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <ProgressOverview summary={summary} />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-10">
          <section>
            <p className="eyebrow">Read next</p>
            <h2 className="mt-1 font-display text-2xl tracking-tight">
              {summary.touched === 0 ? "Where to start" : "Picked from what you know"}
            </h2>
            <p className="mb-4 mt-1 max-w-2xl text-sm text-muted-foreground">
              Ranked by what the graph says you are ready for: entries whose groundwork you already
              hold, and entries that explain the most of what is still unread.
            </p>
            <NextUpList items={recommendations} onPlan={onPlanTarget} />
          </section>

          <section>
            <p className="eyebrow">Shaky ground</p>
            <h2 className="mt-1 font-display text-2xl tracking-tight">What is going soft</h2>
            <p className="mb-4 mt-1 max-w-2xl text-sm text-muted-foreground">
              Flagged entries first, then the ones you left half-read, the ones resting on untouched
              groundwork, and the ones you have not looked at in months.
            </p>
            <WeakSpots spots={spots} />
          </section>
        </div>

        <aside className="space-y-6">
          <AccountPanel touched={summary.touched} />
          <StudyPlanner
            concepts={graph.concepts}
            layers={graph.layers}
            targetId={planTargetId}
            path={path}
            onSelect={onPlanTarget}
          />
          <LoopsCard clusters={loops} />
        </aside>
      </div>
    </div>
  );
}
