import { Link } from "@tanstack/react-router";

import type { WeakSpot } from "@/lib/learning-engine";
import { WEAK_SPOT_META, relativeDays } from "@/lib/learning-view";
import { MasteryControl } from "./MasteryControl";

/** The entries most likely to let someone down in an incident. */
export function WeakSpots({ spots }: { spots: WeakSpot[] }) {
  if (spots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing is going soft. Entries show up here when they sit half-read, rest on untouched
        groundwork, or go a long time without a look.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {spots.map((spot) => (
        <li key={spot.concept.id} className={`learn-card p-4 layer-${spot.concept.layerId}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
              <span className="layer-dot" />
              {WEAK_SPOT_META[spot.kind].label}
            </p>
            <span className="font-mono text-[0.65rem] text-muted-foreground">
              marked {relativeDays(spot.ageDays)}
            </span>
          </div>
          <h3 className="mt-1 font-display text-lg tracking-tight">
            <Link
              to="/concepts/$slug"
              params={{ slug: spot.concept.slug }}
              className="hover:text-primary"
            >
              {spot.concept.name}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{spot.detail}</p>
          {spot.related.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Start with{" "}
              {spot.related.map((concept, index) => (
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
          <div className="mt-3">
            <MasteryControl conceptId={spot.concept.id} size="compact" />
          </div>
        </li>
      ))}
    </ul>
  );
}
