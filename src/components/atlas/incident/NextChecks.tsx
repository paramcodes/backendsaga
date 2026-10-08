import { Link } from "@tanstack/react-router";

import type { NextCheck } from "@/lib/incident-engine";
import { EVIDENCE_KIND_META } from "@/lib/evidence-view";

/**
 * What to read next. A check earns its place by *separating* candidates: a
 * signal every leading suspect produces tells you nothing.
 */
export function NextChecks({ checks }: { checks: NextCheck[] }) {
  if (checks.length === 0) return null;

  return (
    <section aria-label="What to check next" className="space-y-3">
      <div>
        <p className="eyebrow">What to check next</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Each of these is read on a different suspect, so the answer narrows the list.
        </p>
      </div>
      <ol className="space-y-2">
        {checks.map((check) => {
          const kind = EVIDENCE_KIND_META[check.evidence.kind];
          return (
            <li
              key={check.evidence.id}
              className={`evidence-card border border-border bg-card p-4 kind-${check.evidence.kind.toLowerCase()}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="evidence-kind" title={kind.blurb}>
                  {kind.short}
                </span>
                <Link
                  to="/concepts/$slug"
                  params={{ slug: check.concept.slug }}
                  className="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
                >
                  {check.concept.name}
                </Link>
              </div>
              <p className="mt-2 break-words font-mono text-[0.8rem] leading-snug">
                {check.evidence.signal}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{check.evidence.whereToLook}</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {check.rulesOut.length > 0
                  ? `Rules out ${check.rulesOut
                      .slice(0, 3)
                      .map((candidate) => candidate.name)
                      .join(", ")}`
                  : "Confirms the leading candidate"}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
