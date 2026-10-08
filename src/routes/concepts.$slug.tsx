import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { AskPanel } from "@/components/atlas/ai/AskPanel";
import { EvidenceCard } from "@/components/atlas/EvidenceCard";
import { AtlasNotFound, AtlasRouteError } from "@/components/atlas/RouteStates";
import { getConceptDetail } from "@/lib/atlas.functions";
import { conceptNeighborsQuery } from "@/lib/atlas-queries";
import { RELATIONSHIP_MEANINGS } from "@/lib/graph-explore";

export const Route = createFileRoute("/concepts/$slug")({
  loader: async ({ params }) => {
    const detail = await getConceptDetail({ data: { slug: params.slug } });
    if (!detail) throw notFound();
    return detail;
  },
  staleTime: 5 * 60 * 1000,
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Not found — Backend Atlas" }, { name: "robots", content: "noindex" }] };
    }
    const title = `${loaderData.concept.name} — Backend Atlas`;
    return {
      meta: [
        { title },
        { name: "description", content: loaderData.concept.description },
        { property: "og:title", content: title },
        { property: "og:description", content: loaderData.concept.description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  notFoundComponent: () => <AtlasNotFound what="entry" />,
  errorComponent: AtlasRouteError,
  component: ConceptDetail,
});

function ConceptDetail() {
  const { concept, layer, neighbors, evidence, sources } = Route.useLoaderData();
  const nearby = useQuery(conceptNeighborsQuery(concept.id, 2));
  const secondOrder = (nearby.data ?? []).filter((entry) => entry.hops === 2).slice(0, 8);

  const sections: [string, string | undefined][] = [
    ["The problem", concept.problem],
    ["Why it happens", concept.why],
    ["Mechanism", concept.mechanism],
    ["Trade-offs", concept.tradeoffs],
    ["Better alternative", concept.betterAlternative],
  ];

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 md:px-8 md:py-16">
      <Link
        to="/graph"
        search={{ focus: concept.id }}
        className="font-mono text-xs text-muted-foreground hover:text-primary"
      >
        ← GRAPH
      </Link>
      <p className="eyebrow mt-6 flex items-center gap-2">
        <span className={`layer-dot layer-${concept.layerId}`} />
        {layer.name} layer
      </p>
      <h1 className="mt-2 font-display text-4xl md:text-5xl">{concept.name}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{concept.description}</p>

      <div className="mt-10 space-y-8">
        {sections.map(([heading, body]) =>
          body ? (
            <section
              key={heading}
              className="grid gap-2 border-t border-border pt-4 md:grid-cols-[10rem_1fr]"
            >
              <h2 className="eyebrow">{heading}</h2>
              <p className="leading-relaxed">{body}</p>
            </section>
          ) : null,
        )}

        <section className="grid gap-2 border-t border-border pt-4 md:grid-cols-[10rem_1fr]">
          <h2 className="eyebrow">Related</h2>
          <ul className="space-y-1">
            {neighbors.map(({ relationship, concept: other, outgoing }) => (
              <li key={relationship.id}>
                <span
                  className="font-mono text-[10px] text-muted-foreground"
                  title={RELATIONSHIP_MEANINGS[relationship.type].summary}
                >
                  {outgoing ? relationship.type : `← ${relationship.type}`}{" "}
                </span>
                <Link
                  to="/concepts/$slug"
                  params={{ slug: other.slug }}
                  className="text-primary hover:underline"
                >
                  {other.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-2 border-t border-border pt-4 md:grid-cols-[10rem_1fr]">
          <div>
            <h2 className="eyebrow">Two hops away</h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Found by walking the graph in the database
            </p>
          </div>
          {nearby.isPending ? (
            <p className="text-sm text-muted-foreground">Walking the graph…</p>
          ) : secondOrder.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing sits two hops out — this entry’s neighbourhood is shallow.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {secondOrder.map(({ concept: other, layerName }) => (
                <li key={other.id}>
                  <Link
                    to="/concepts/$slug"
                    params={{ slug: other.slug }}
                    title={`${layerName} layer`}
                    className="flex items-center gap-2 border border-border px-2.5 py-1 text-xs transition-colors hover:border-foreground"
                  >
                    <span className={`layer-dot layer-${other.layerId}`} />
                    {other.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-2 border-t border-border pt-4 md:grid-cols-[10rem_1fr]">
          <div>
            <h2 className="eyebrow">Evidence</h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {evidence.length} signal{evidence.length === 1 ? "" : "s"}
            </p>
          </div>
          {evidence.length > 0 ? (
            <div className="space-y-4">
              {evidence.map((item) => (
                <EvidenceCard key={item.id} evidence={item} />
              ))}
              <Link
                to="/evidence"
                search={{ q: concept.name }}
                className="inline-block font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
              >
                All field signals →
              </Link>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              No evidence card yet for this entry. Until there is one, treat it as a model of how the
              system behaves rather than something you can confirm in your own telemetry.{" "}
              <Link to="/evidence" search={{}} className="text-primary underline-offset-4 hover:underline">
                Browse the signals that do exist
              </Link>
              .
            </p>
          )}
        </section>

        <section className="grid gap-2 border-t border-border pt-4 md:grid-cols-[10rem_1fr]">
          <div>
            <h2 className="eyebrow">Further reading</h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {sources.length} source{sources.length === 1 ? "" : "s"}
            </p>
          </div>
          <ul className="space-y-4">
            {sources.map(({ source, relevance }) => (
              <li key={source.id}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-display text-lg leading-snug underline-offset-4 hover:text-primary hover:underline"
                >
                  {source.title}
                </a>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {source.kind} · {source.author}
                  {source.year ? ` · ${source.year}` : ""}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{relevance}</p>
              </li>
            ))}
            {sources.length === 0 && (
              <li className="text-sm text-muted-foreground">
                No reference attached yet.{" "}
                <Link to="/library" className="text-primary underline-offset-4 hover:underline">
                  Browse the library
                </Link>
                .
              </li>
            )}
          </ul>
        </section>

        <section className="border-t border-border pt-6">
          <AskPanel
            target={{ kind: "explain", conceptId: concept.id }}
            title={`Explain ${concept.name}`}
            blurb="The model is handed this entry, its recorded links, what sits two hops out, the field signals and the cited sources — then asked to write it up as one walk-through. It is given nothing else."
            action="Explain this"
            placeholder={`e.g. why does ${concept.name.toLowerCase()} show up under load?`}
            caveat="Written by a model from the records below. The entry itself, its links and its signals are the curated source of truth; this is a reading of them."
          />
        </section>
      </div>
    </article>
  );
}
