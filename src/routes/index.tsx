import { createFileRoute, Link } from "@tanstack/react-router";

import { getAtlasOverview } from "@/lib/atlas.functions";
import { AtlasRouteError } from "@/components/atlas/RouteStates";

export const Route = createFileRoute("/")({
  loader: () => getAtlasOverview(),
  staleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title: "Dashboard — Backend Atlas" },
      { name: "description", content: "A field guide to how backend systems fail, and why." },
      { property: "og:title", content: "Backend Atlas" },
      { property: "og:description", content: "A field guide to how backend systems fail, and why." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: AtlasRouteError,
  component: Dashboard,
});

function Dashboard() {
  const { concepts, layers, stats } = Route.useLoaderData();
  const layerNameById = new Map(layers.map((layer) => [layer.id, layer.name]));

  const cards = [
    { label: "Concepts", value: stats.concepts },
    { label: "Relationships", value: stats.relationships },
    { label: "Signals", value: stats.evidence },
    { label: "Sources", value: stats.sources },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-16">
      <p className="eyebrow">Volume I · Failure modes</p>
      <h1 className="mt-3 font-display text-4xl leading-tight md:text-6xl">
        Every slow request has <em>a cause</em> beneath it.
      </h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Trace symptoms down through the application, data, runtime, network and operating system.
      </p>
      <div className="mt-10 grid grid-cols-2 border-y border-border md:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="border-b border-r border-border px-4 py-6 last:border-r-0 md:border-b-0"
          >
            <div className="font-display text-4xl">{card.value}</div>
            <div className="eyebrow mt-1">{card.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {stats.conceptsWithEvidence} of {stats.concepts} entries carry field evidence —{" "}
        <Link to="/evidence" search={{}} className="text-primary underline-offset-4 hover:underline">
          what you would see, and where to look
        </Link>
        . Every entry is traced back to{" "}
        <Link to="/library" className="text-primary underline-offset-4 hover:underline">
          the literature it came from
        </Link>
        .
      </p>

      <section className="mt-10 grid gap-4 border border-border bg-card p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-7">
        <div>
          <p className="eyebrow">Something is broken right now</p>
          <h2 className="mt-2 font-display text-2xl leading-tight md:text-3xl">
            Tick what you see. Get the causes that explain it.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {stats.symptoms} dashboard signals are wired into the graph, and every ranked cause
            comes with the chain of relationships behind it. {stats.incidents} worked incidents are
            there to practise on.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 md:justify-end">
          <Link
            to="/triage"
            search={{}}
            className="border border-foreground px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-colors hover:bg-foreground hover:text-background"
          >
            Start triage
          </Link>
          <Link
            to="/incidents"
            className="border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            Incident library
          </Link>
        </div>
      </section>


      <div className="mt-12 grid gap-3 border-t border-border pt-6 sm:grid-cols-2 lg:grid-cols-4">
        {layers.map((layer) => (
          <Link
            key={layer.id}
            to="/graph"
            search={{ mode: "layer" as const, layer: layer.id }}
            className="group border border-border p-4 transition-colors hover:border-foreground"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-display text-lg group-hover:text-primary">
                <span className={`layer-dot layer-${layer.id}`} />
                {layer.name}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {stats.byLayer[layer.id] ?? 0}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{layer.description}</p>
          </Link>
        ))}
      </div>

      <div className="mt-12 flex items-baseline justify-between">
        <h2 className="font-display text-2xl">Entries</h2>
        <Link to="/graph" search={{}} className="text-sm text-primary underline-offset-4 hover:underline">
          Open the graph →
        </Link>
      </div>
      <ol className="mt-4 divide-y divide-border border-t border-border">
        {concepts.map((concept, index) => (
          <li key={concept.id}>
            <Link
              to="/concepts/$slug"
              params={{ slug: concept.slug }}
              className="group grid grid-cols-[3rem_1fr] gap-4 py-5 md:grid-cols-[3rem_1fr_10rem]"
            >
              <span className="font-mono text-xs text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <div className="font-display text-xl group-hover:text-primary">{concept.name}</div>
                <div className="text-sm text-muted-foreground">{concept.description}</div>
              </div>
              <span className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
                <span className={`layer-dot layer-${concept.layerId}`} />
                {layerNameById.get(concept.layerId) ?? concept.layerId}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
