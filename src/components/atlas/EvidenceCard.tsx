import { Link } from "@tanstack/react-router";
import type { Evidence } from "@/domain";
import { EVIDENCE_KIND_META, EVIDENCE_TREND_META } from "@/lib/evidence-view";
import { cn } from "@/lib/utils";

type Props = {
  evidence: Evidence;
  /** Shown as a link above the signal when the card appears outside a concept page. */
  conceptName?: string | undefined;
  conceptSlug?: string | undefined;
  layerId?: string | undefined;
  className?: string | undefined;
};

const ROWS = [
  { key: "whatYouSee", label: "What you see" },
  { key: "whereToLook", label: "Where to look" },
  { key: "whyItMatters", label: "Why it matters" },
] as const;

export function EvidenceCard({ evidence, conceptName, conceptSlug, layerId, className }: Props) {
  const kind = EVIDENCE_KIND_META[evidence.kind];
  const trend = EVIDENCE_TREND_META[evidence.trend];

  return (
    <article
      className={cn(
        "evidence-card group relative flex flex-col border border-border bg-card p-4 md:p-5",
        `kind-${evidence.kind.toLowerCase()}`,
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <span className="evidence-kind" title={kind.blurb}>
          {kind.short}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span aria-hidden className="mr-1 text-sm leading-none">
            {trend.sign}
          </span>
          {trend.label}
        </span>
      </header>

      {conceptName && conceptSlug && (
        <Link
          to="/concepts/$slug"
          params={{ slug: conceptSlug }}
          className="mt-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
        >
          {layerId && <span className={`layer-dot layer-${layerId}`} />}
          {conceptName}
        </Link>
      )}

      <p className="mt-3 break-words font-mono text-[0.82rem] leading-snug text-foreground">
        {evidence.signal}
      </p>

      <dl className="mt-4 space-y-3 border-t border-border pt-3">
        {ROWS.map((row) => (
          <div key={row.key} className="grid gap-1 md:grid-cols-[7.5rem_1fr] md:gap-3">
            <dt className="eyebrow">{row.label}</dt>
            <dd className="text-sm leading-relaxed text-muted-foreground">{evidence[row.key]}</dd>
          </div>
        ))}
      </dl>

      {evidence.falsePositive && (
        <p className="mt-4 border-t border-dashed border-border pt-3 text-sm leading-relaxed text-muted-foreground">
          <span className="eyebrow mr-2 text-foreground">But</span>
          {evidence.falsePositive}
        </p>
      )}
    </article>
  );
}
