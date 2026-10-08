import { ClientOnly, createFileRoute, Link, notFound } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";

import { CauseList } from "@/components/atlas/incident/CauseList";
import { IncidentTimeline } from "@/components/atlas/incident/IncidentTimeline";
import { NextChecks } from "@/components/atlas/incident/NextChecks";
import { SeverityBadge } from "@/components/atlas/incident/SeverityBadge";
import { AtlasNotFound, AtlasRouteError } from "@/components/atlas/RouteStates";
import { createGraphIndex } from "@/domain/graph-index";
import { getIncidentDetail } from "@/lib/atlas.functions";
import { createIncidentEngine } from "@/lib/incident-engine";
import { encodeSymptoms } from "@/lib/incident-view";

const CauseChainCanvas = lazy(() =>
  import("@/components/atlas/incident/CauseChainCanvas").then((module) => ({
    default: module.CauseChainCanvas,
  })),
);

export const Route = createFileRoute("/incidents/$slug")({
  loader: async ({ params }) => {
    const detail = await getIncidentDetail({ data: { slug: params.slug } });
    if (!detail) throw notFound();
    return detail;
  },
  staleTime: 5 * 60 * 1000,
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Not found — Backend Atlas" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${loaderData.incident.title} — Backend Atlas`;
    return {
      meta: [
        { title },
        { name: "description", content: loaderData.incident.summary },
        { property: "og:title", content: title },
        { property: "og:description", content: loaderData.incident.summary },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  notFoundComponent: () => <AtlasNotFound what="incident" />,
  errorComponent: AtlasRouteError,
  component: IncidentDetail,
});

function IncidentDetail() {
  const { incident, context, rootCause, contributing } = Route.useLoaderData();
  const [revealed, setRevealed] = useState(false);
  const [chainId, setChainId] = useState<string | null>(null);

  const { index, replay } = useMemo(() => {
    const graphIndex = createGraphIndex({
      layers: context.layers,
      concepts: context.concepts,
      relationships: context.relationships,
      evidence: context.evidence,
      sources: [],
      conceptSources: [],
    });
    const engine = createIncidentEngine(graphIndex, {
      symptoms: context.symptoms,
      symptomEvidence: context.symptomEvidence,
      incidents: [incident],
    });
    return { index: graphIndex, replay: engine.replay(incident) };
  }, [context, incident]);

  const { diagnosis, rootCauseRank } = replay;
  const chainCause =
    diagnosis.causes.find((cause) => cause.concept.id === chainId) ?? diagnosis.causes[0];
  const symptoms = diagnosis.observations.map(({ symptom }) => symptom);

  return (
    <article className="mx-auto max-w-6xl px-4 py-10 md:px-8 md:py-14">
      <Link to="/incidents" className="font-mono text-xs text-muted-foreground hover:text-primary">
        ← INCIDENTS
      </Link>

      <header className="mt-6 border-b border-border pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <SeverityBadge severity={incident.severity} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {symptoms.length} observations · {diagnosis.causes.length} candidates
          </span>
        </div>
        <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">{incident.title}</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{incident.summary}</p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-12">
        <div className="min-w-0 space-y-10">
          <section>
            <h2 className="eyebrow">What happened</h2>
            <p className="mt-3 leading-relaxed">{incident.narrative}</p>
          </section>

          <section>
            <h2 className="eyebrow">Timeline</h2>
            <div className="mt-4">
              <IncidentTimeline timeline={incident.timeline} symptoms={symptoms} />
            </div>
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-[73px] lg:self-start">
          <section>
            <h2 className="eyebrow">Observations</h2>
            <ul className="mt-3 space-y-2">
              {symptoms.map((symptom) => (
                <li key={symptom.id} className="border border-border bg-card px-3 py-2">
                  <p className="text-sm">{symptom.name}</p>
                  <p className="mt-0.5 break-words font-mono text-[11px] text-muted-foreground">
                    {symptom.signal}
                  </p>
                </li>
              ))}
            </ul>
          </section>
          <Link
            to="/triage"
            search={{ symptoms: encodeSymptoms(incident.symptomIds) }}
            className="block border border-border bg-card p-4 transition-colors hover:border-foreground"
          >
            <p className="eyebrow">Keep digging</p>
            <p className="mt-1 text-sm">
              Open these {symptoms.length} signals in triage and add your own →
            </p>
          </Link>
        </aside>
      </div>

      <div className="mt-12 space-y-10">
        {chainCause && (
          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="eyebrow">The chain behind {chainCause.concept.name}</h2>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                cause → effect → what you read
              </p>
            </div>
            <div className="mt-3">
              <ClientOnly fallback={<CanvasFallback />}>
                <Suspense fallback={<CanvasFallback />}>
                  <CauseChainCanvas
                    cause={chainCause}
                    diagnosis={diagnosis}
                    layerName={index.layerName}
                  />
                </Suspense>
              </ClientOnly>
            </div>
          </section>
        )}

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
          <section className="min-w-0 space-y-4">
            <div>
              <h2 className="eyebrow">What the engine says</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ranked from the observations above alone — the documented cause is not an input.
              </p>
            </div>
            <CauseList
              diagnosis={diagnosis}
              selectedId={chainCause?.concept.id ?? null}
              onSelect={setChainId}
              limit={5}
            />
          </section>

          <div className="lg:sticky lg:top-[73px] lg:self-start">
            <NextChecks checks={diagnosis.checks} />
          </div>
        </div>

        <section className="border border-border bg-card p-5 md:p-6">
            <h2 className="eyebrow">What it actually was</h2>
            {revealed ? (
              <div className="mt-3 space-y-4">
                <p className="font-display text-2xl leading-tight">
                  <span className={`layer-dot layer-${rootCause.layerId} mr-2 align-middle`} />
                  <Link
                    to="/concepts/$slug"
                    params={{ slug: rootCause.slug }}
                    className="hover:text-primary"
                  >
                    {rootCause.name}
                  </Link>
                </p>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {rootCauseRank
                    ? `The engine ranked it ${ordinal(rootCauseRank)} from the signals alone`
                    : "The engine did not surface it from these signals"}
                </p>
                {contributing.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Contributing:{" "}
                    {contributing.map((concept, position) => (
                      <span key={concept.id}>
                        {position > 0 && ", "}
                        <Link
                          to="/concepts/$slug"
                          params={{ slug: concept.slug }}
                          className="hover:text-primary"
                        >
                          {concept.name}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
                <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-2">
                  <div>
                    <h3 className="eyebrow">Resolution</h3>
                    <p className="mt-1 text-sm leading-relaxed">{incident.resolution}</p>
                  </div>
                  <div>
                    <h3 className="eyebrow">Lesson</h3>
                    <p className="mt-1 text-sm leading-relaxed">{incident.lesson}</p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                  Make your call from the ranking first — then compare it with what the team found.
                </p>
                <button
                  onClick={() => setRevealed(true)}
                  className="mt-4 border border-foreground px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors hover:bg-foreground hover:text-background"
                >
                  Reveal the documented cause
                </button>
              </>
            )}
          </section>
      </div>
    </article>
  );
}

function ordinal(value: number): string {
  const suffix = value === 1 ? "st" : value === 2 ? "nd" : value === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

function CanvasFallback() {
  return (
    <div className="grid h-[28rem] w-full place-items-center border border-border bg-card md:h-[34rem] lg:h-[38rem]">
      <p className="font-mono text-xs uppercase text-muted-foreground">Drawing the chain…</p>
    </div>
  );
}
