import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { SeverityBadge } from "@/components/atlas/incident/SeverityBadge";
import { AtlasRouteError } from "@/components/atlas/RouteStates";
import { getIncidentsIndex } from "@/lib/atlas.functions";
import { SEVERITY_META, SEVERITY_ORDER, encodeSymptoms } from "@/lib/incident-view";
import type { Severity } from "@/domain";
import { cn } from "@/lib/utils";

const DESCRIPTION =
  "Ten worked production incidents: the signals that appeared, the order they appeared in, and the cause that explained them.";

export const Route = createFileRoute("/incidents/")({
  loader: () => getIncidentsIndex(),
  staleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title: "Incident library — Backend Atlas" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Incident library — Backend Atlas" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: AtlasRouteError,
  component: IncidentsPage,
});

function IncidentsPage() {
  const { incidents } = Route.useLoaderData();
  const [severity, setSeverity] = useState<Severity | null>(null);

  const visible = useMemo(
    () =>
      severity ? incidents.filter((entry) => entry.incident.severity === severity) : incidents,
    [incidents, severity],
  );

  const counts = useMemo(() => {
    const result = new Map<Severity, number>();
    for (const entry of incidents) {
      result.set(entry.incident.severity, (result.get(entry.incident.severity) ?? 0) + 1);
    }
    return result;
  }, [incidents]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-16">
      <header className="border-b border-border pb-6">
        <p className="eyebrow">Incident library</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">Scenarios worth replaying</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{DESCRIPTION}</p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Each one runs through the same engine as{" "}
          <Link to="/triage" className="text-primary underline-offset-4 hover:underline">
            triage
          </Link>
          . Diagnose it yourself first; the documented cause stays hidden until you ask for it.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSeverity(null)}
          aria-pressed={severity === null}
          className={cn(
            "border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
            severity === null
              ? "border-foreground text-foreground"
              : "border-border text-muted-foreground hover:border-foreground",
          )}
        >
          All {incidents.length}
        </button>
        {SEVERITY_ORDER.filter((level) => counts.has(level)).map((level) => (
          <button
            key={level}
            onClick={() => setSeverity(severity === level ? null : level)}
            aria-pressed={severity === level}
            className={cn(
              "border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
              severity === level
                ? "border-foreground text-foreground"
                : "border-border text-muted-foreground hover:border-foreground",
            )}
          >
            {SEVERITY_META[level].label} {counts.get(level)}
          </button>
        ))}
      </div>

      <ol className="mt-8 space-y-4">
        {visible.map(({ incident, symptoms }) => (
          <li key={incident.id}>
            <article className="group border border-border bg-card p-5 transition-colors hover:border-foreground md:p-6">
              <div className="flex flex-wrap items-center gap-3">
                <SeverityBadge severity={incident.severity} />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {symptoms.length} observations
                </span>
              </div>
              <h2 className="mt-3 font-display text-2xl leading-tight">
                <Link
                  to="/incidents/$slug"
                  params={{ slug: incident.slug }}
                  className="hover:text-primary"
                >
                  {incident.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {incident.summary}
              </p>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {symptoms.map((symptom) => (
                  <li
                    key={symptom.id}
                    className="border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                    title={symptom.signal}
                  >
                    {symptom.name}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-4 border-t border-border pt-3 font-mono text-[10px] uppercase tracking-widest">
                <Link
                  to="/incidents/$slug"
                  params={{ slug: incident.slug }}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Replay it →
                </Link>
                <Link
                  to="/triage"
                  search={{ symptoms: encodeSymptoms(incident.symptomIds) }}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  Load these signals into triage →
                </Link>
              </div>
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}
