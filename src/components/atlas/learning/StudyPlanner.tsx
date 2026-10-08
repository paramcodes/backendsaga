import { Link } from "@tanstack/react-router";

import type { Concept, Layer } from "@/domain/schema";
import { MASTERY_META, type StudyPath } from "@/lib/learning-engine";
import { groupConceptsByLayer, masteryClass, pathSummary } from "@/lib/learning-view";

type StudyPlannerProps = {
  concepts: Concept[];
  layers: Layer[];
  targetId: string | null;
  path: StudyPath | null;
  onSelect: (conceptId: string | null) => void;
};

/** Pick a destination; the atlas lays out the groundwork in reading order. */
export function StudyPlanner({ concepts, layers, targetId, path, onSelect }: StudyPlannerProps) {
  const groups = groupConceptsByLayer(concepts, layers);

  return (
    <section className="learn-card p-5">
      <p className="eyebrow">Plan a route</p>
      <h2 className="mt-1 font-display text-xl tracking-tight">Work towards one entry</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose something you want to understand. The atlas orders what sits underneath it.
      </p>

      <label className="mt-4 block">
        <span className="sr-only">Entry to work towards</span>
        <select
          value={targetId ?? ""}
          onChange={(event) => onSelect(event.target.value || null)}
          className="w-full border border-input bg-background px-2 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Choose an entry…</option>
          {groups.map((group) => (
            <optgroup key={group.layer.id} label={group.layer.name}>
              {group.concepts.map((concept) => (
                <option key={concept.id} value={concept.id}>
                  {concept.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {path && (
        <div className="mt-5">
          <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
            {pathSummary(path.steps.length, path.reached)}
          </p>

          <ol className="mt-3">
            {path.steps.map((step, i) => (
              <li key={step.concept.id} className="learn-step">
                <span className={`learn-step-num ${masteryClass(step.state)}`}>{i + 1}</span>
                <div className="min-w-0">
                  <Link
                    to="/concepts/$slug"
                    params={{ slug: step.concept.slug }}
                    className="font-medium hover:text-primary"
                  >
                    {step.concept.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{step.reason}</p>
                  {step.state !== "unknown" && (
                    <p className="font-mono text-[0.6rem] uppercase tracking-widest text-muted-foreground">
                      {MASTERY_META[step.state].label}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {path.alreadyKnown.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Skipped because you already know{" "}
              {path.alreadyKnown
                .slice(0, 4)
                .map((concept) => concept.name)
                .join(", ")}
              {path.alreadyKnown.length > 4 ? ` and ${path.alreadyKnown.length - 4} more` : ""}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
