import { createFileRoute, Link } from "@tanstack/react-router";

import { SOURCE_KINDS, type SourceKind } from "@/domain/schema";
import { getSourceLibrary, type LibraryEntry } from "@/lib/atlas.functions";
import { AtlasRouteError } from "@/components/atlas/RouteStates";

export const Route = createFileRoute("/library")({
  loader: () => getSourceLibrary(),
  staleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title: "Library — Backend Atlas" },
      {
        name: "description",
        content:
          "The books, papers, RFCs and engineering write-ups every entry in the atlas is traced back to.",
      },
      { property: "og:title", content: "Library — Backend Atlas" },
      {
        property: "og:description",
        content: "Where the atlas got it from: the primary sources behind each failure mode.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: AtlasRouteError,
  component: LibraryPage,
});

const KIND_LABEL: Record<SourceKind, string> = {
  BOOK: "Books",
  PAPER: "Papers",
  RFC: "RFCs",
  SPEC: "Specifications",
  DOCS: "Documentation",
  ARTICLE: "Engineering write-ups",
  TALK: "Talks",
};

function LibraryPage() {
  const entries = Route.useLoaderData();
  const byKind = SOURCE_KINDS.map((kind) => ({
    kind,
    entries: entries.filter((entry) => entry.source.kind === kind),
  })).filter((group) => group.entries.length > 0);

  const linked = entries.reduce((total, entry) => total + entry.concepts.length, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-16">
      <p className="eyebrow">Plate V · Provenance</p>
      <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">Library</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        The atlas is a reading of the literature, not a replacement for it. Every entry points back
        at someone who measured the thing, wrote the standard, or ran the outage.
      </p>

      <div className="mt-8 grid grid-cols-3 border-y border-border">
        <div className="border-r border-border px-4 py-5">
          <div className="font-display text-3xl">{entries.length}</div>
          <div className="eyebrow mt-1">Sources</div>
        </div>
        <div className="border-r border-border px-4 py-5">
          <div className="font-display text-3xl">{linked}</div>
          <div className="eyebrow mt-1">Citations</div>
        </div>
        <div className="px-4 py-5">
          <div className="font-display text-3xl">{byKind.length}</div>
          <div className="eyebrow mt-1">Kinds</div>
        </div>
      </div>

      <nav aria-label="Jump to kind" className="mt-6 flex flex-wrap gap-2">
        {byKind.map((group) => (
          <a
            key={group.kind}
            href={`#${group.kind.toLowerCase()}`}
            className="border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            {KIND_LABEL[group.kind]}
            <span className="ml-2 opacity-60">{group.entries.length}</span>
          </a>
        ))}
      </nav>

      <div className="mt-10 space-y-14">
        {byKind.map((group) => (
          <section key={group.kind} id={group.kind.toLowerCase()} className="scroll-mt-20">
            <h2 className="border-b border-border pb-2 font-display text-2xl">
              {KIND_LABEL[group.kind]}
            </h2>
            <ul className="mt-4 space-y-8">
              {group.entries.map((entry) => (
                <SourceRow key={entry.source.id} entry={entry} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function SourceRow({ entry }: { entry: LibraryEntry }) {
  const { source, concepts } = entry;
  return (
    <li className="grid gap-3 md:grid-cols-[1fr_16rem]">
      <div>
        <h3 className="font-display text-xl leading-snug">
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="underline-offset-4 hover:text-primary hover:underline"
          >
            {source.title}
          </a>
        </h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {source.author}
          {source.year ? ` · ${source.year}` : ""}
        </p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{source.note}</p>
      </div>
      <div className="md:border-l md:border-border md:pl-4">
        <p className="eyebrow">Cited by</p>
        <ul className="mt-2 space-y-1.5">
          {concepts.map(({ concept, relevance }) => (
            <li key={concept.id} className="text-sm leading-snug">
              <Link
                to="/concepts/$slug"
                params={{ slug: concept.slug }}
                className="flex items-center gap-2 hover:text-primary"
              >
                <span className={`layer-dot layer-${concept.layerId}`} />
                {concept.name}
              </Link>
              <span className="block pl-4 text-xs text-muted-foreground">{relevance}</span>
            </li>
          ))}
          {concepts.length === 0 && (
            <li className="text-xs text-muted-foreground">Not yet cited by an entry.</li>
          )}
        </ul>
      </div>
    </li>
  );
}
