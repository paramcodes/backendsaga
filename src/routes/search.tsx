import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";

import { AtlasRouteError } from "@/components/atlas/RouteStates";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { searchAtlas } from "@/lib/atlas.functions";
import { searchQuery } from "@/lib/atlas-queries";

export const Route = createFileRoute("/search")({
  validateSearch: z.object({ q: z.string().optional() }),
  loaderDeps: ({ search }) => ({ q: search.q ?? "" }),
  loader: async ({ deps }) => ({
    q: deps.q,
    results: await searchAtlas({ data: { q: deps.q } }),
  }),
  staleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title: "Search — Backend Atlas" },
      { name: "description", content: "Search backend failure modes, mechanisms and symptoms." },
      { property: "og:title", content: "Search — Backend Atlas" },
      {
        property: "og:description",
        content: "Search backend failure modes, mechanisms and symptoms.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: AtlasRouteError,
  component: SearchPage,
});

const FIELD_LABEL: Record<string, string> = {
  name: "name",
  description: "summary",
  problem: "problem",
  why: "why",
  mechanism: "mechanism",
  tradeoffs: "trade-offs",
};

function SearchPage() {
  const { q = "" } = Route.useSearch();
  const initial = Route.useLoaderData();
  const navigate = useNavigate({ from: "/search" });

  const [text, setText] = useState(q);
  const debounced = useDebouncedValue(text, 180);

  // The address bar follows what was actually searched, so a result list stays
  // shareable without re-running a query on every keystroke.
  useEffect(() => {
    if (debounced === q) return;
    void navigate({ search: debounced ? { q: debounced } : {}, replace: true });
  }, [debounced, navigate, q]);

  const results = useQuery({
    ...searchQuery(debounced),
    placeholderData: keepPreviousData,
    ...(debounced === initial.q ? { initialData: initial.results } : {}),
  });

  const ranked = results.data ?? [];
  const stale = results.isFetching || debounced !== text;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-8 md:py-16">
      <p className="eyebrow">Index</p>
      <h1 className="font-display text-4xl">Search</h1>
      <input
        autoFocus
        aria-label="Search query"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="e.g. latency, locks, retries"
        className="mt-6 w-full border-b-2 border-foreground bg-transparent py-2 font-display text-2xl outline-none placeholder:text-muted-foreground"
      />
      <p className="mt-3 font-mono text-xs text-muted-foreground">
        {stale ? "SEARCHING…" : `${ranked.length} RESULTS${debounced.trim() ? " · RANKED BY RELEVANCE" : ""}`}
      </p>

      {!stale && ranked.length === 0 && (
        <p className="mt-8 text-muted-foreground">
          Nothing matches “{debounced}”. Try a symptom (“latency”), a mechanism (“lock”) or a layer
          name.
        </p>
      )}

      <ul className={`mt-4 divide-y divide-border ${stale ? "opacity-60" : ""}`}>
        {ranked.map(({ concept, layerName, matchedOn }) => (
          <li key={concept.id} className="py-4">
            <Link to="/concepts/$slug" params={{ slug: concept.slug }} className="group block">
              <div className="flex items-baseline justify-between gap-4">
                <div className="font-display text-xl group-hover:text-primary">{concept.name}</div>
                {debounced.trim() && (
                  <span className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
                    matched {FIELD_LABEL[matchedOn] ?? matchedOn}
                  </span>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {layerName} · {concept.description}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
