import { Link } from "@tanstack/react-router";

import type { Recommendation } from "@/lib/learning-engine";
import { percent } from "@/lib/learning-view";
import { MasteryBadge, MasteryControl } from "./MasteryControl";

type NextUpListProps = {
  items: Recommendation[];
  /** Opens the step-by-step plan for one entry. */
  onPlan: (conceptId: string) => void;
};

/** What to read next, and the reason it came up. */
export function NextUpList({ items, onPlan }: NextUpListProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Everything the atlas records is marked. Flag anything you want to revisit and it will come
        back here.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={item.concept.id} className={`learn-card p-4 layer-${item.concept.layerId}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                <span className="layer-dot" />
                {String(i + 1).padStart(2, "0")}
                <MasteryBadge state={item.state} />
              </p>
              <h3 className="mt-1 font-display text-xl tracking-tight">
                <Link
                  to="/concepts/$slug"
                  params={{ slug: item.concept.slug }}
                  className="hover:text-primary"
                >
                  {item.concept.name}
                </Link>
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {item.concept.description}
              </p>
            </div>
            {item.readiness.total > 0 && (
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                {percent(item.readiness.ratio)}% groundwork
              </span>
            )}
          </div>

          <ul className="mt-3 space-y-1 text-sm">
            {item.reasons.map((reason) => (
              <li key={reason} className="flex gap-2 text-foreground/80">
                <span className="text-muted-foreground">—</span>
                {reason}
              </li>
            ))}
          </ul>

          {item.unlocks.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Opens up{" "}
              {item.unlocks.map((concept, index) => (
                <span key={concept.id}>
                  {index > 0 && ", "}
                  <Link
                    to="/concepts/$slug"
                    params={{ slug: concept.slug }}
                    className="text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                  >
                    {concept.name}
                  </Link>
                </span>
              ))}
              .
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <MasteryControl conceptId={item.concept.id} size="compact" />
            <button
              type="button"
              onClick={() => onPlan(item.concept.id)}
              className="mastery-option"
              title="Show the reading order that leads here"
            >
              Plan a route
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
