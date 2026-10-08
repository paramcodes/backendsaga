import { Link } from "@tanstack/react-router";

import type { Cluster } from "@/lib/learning-engine";
import { percent } from "@/lib/learning-view";

/**
 * Feedback loops in the graph: sets of entries that cause each other, so no
 * single one of them can be read first. They are learned as a group.
 */
export function LoopsCard({ clusters }: { clusters: Cluster[] }) {
  if (clusters.length === 0) return null;

  return (
    <section className="learn-card p-5">
      <p className="eyebrow">Learn together</p>
      <h2 className="mt-1 font-display text-xl tracking-tight">Loops with no entry point</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        These entries cause each other. Reading one in isolation leaves the cycle hidden, so take
        the set in one sitting.
      </p>

      <ul className="mt-4 space-y-4">
        {clusters.map((cluster, i) => (
          <li key={cluster.concepts.map((c) => c.id).join("-")}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                Loop {String(i + 1).padStart(2, "0")}
              </p>
              <span className="font-mono text-[0.65rem] text-muted-foreground">
                {percent(cluster.concepts.length === 0 ? 0 : cluster.known / cluster.concepts.length)}% known
              </span>
            </div>
            <p className="mt-1 text-sm">
              {cluster.concepts.map((concept, index) => (
                <span key={concept.id}>
                  {index > 0 && <span className="text-muted-foreground"> → </span>}
                  <Link
                    to="/concepts/$slug"
                    params={{ slug: concept.slug }}
                    className="underline decoration-border underline-offset-2 hover:decoration-foreground"
                  >
                    {concept.name}
                  </Link>
                </span>
              ))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{cluster.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
