import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";

import { EVIDENCE_KINDS, type EvidenceKind } from "@/domain/schema";
import { EvidenceCard } from "@/components/atlas/EvidenceCard";
import { AtlasRouteError } from "@/components/atlas/RouteStates";
import { getEvidenceIndex } from "@/lib/atlas.functions";
import {
  EVIDENCE_KIND_META,
  EVIDENCE_KIND_ORDER,
  countByKind,
  decodeList,
  encodeList,
  filterEvidence,
  groupEvidenceByConcept,
  toggle,
} from "@/lib/evidence-view";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  kinds: z.string().optional(),
  layers: z.string().optional(),
  q: z.string().optional(),
});

export const Route = createFileRoute("/evidence")({
  validateSearch: searchSchema,
  loader: () => getEvidenceIndex(),
  staleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title: "Evidence — Backend Atlas" },
      {
        name: "description",
        content:
          "Every concept tied to something observable: the metric, log, trace, plan or kernel counter that proves it, and the signal that fakes it.",
      },
      { property: "og:title", content: "Evidence — Backend Atlas" },
      {
        property: "og:description",
        content: "What you would see, where you would look, and why that signal matters.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: AtlasRouteError,
  component: EvidenceIndex,
});

function EvidenceIndex() {
  const { concepts, layers, evidence } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const conceptById = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  const layerIds = useMemo(() => layers.map((layer) => layer.id), [layers]);

  const activeKinds = decodeList<EvidenceKind>(search.kinds, EVIDENCE_KINDS);
  const activeLayers = decodeList(search.layers, layerIds);
  const query = search.q ?? "";

  const filtered = useMemo(
    () => filterEvidence(evidence, { kinds: activeKinds, layerIds: activeLayers, query }, conceptById),
    [activeKinds, activeLayers, conceptById, evidence, query],
  );
  const groups = useMemo(() => groupEvidenceByConcept(filtered, concepts), [concepts, filtered]);
  const totals = useMemo(() => countByKind(evidence), [evidence]);
  const coveredConcepts = useMemo(
    () => new Set(evidence.map((item) => item.conceptId)).size,
    [evidence],
  );

  const setSearch = (next: { kinds?: string[]; layers?: string[]; q?: string }) => {
    void navigate({
      search: (prev) => ({
        ...prev,
        ...(next.kinds ? { kinds: encodeList(next.kinds) } : {}),
        ...(next.layers ? { layers: encodeList(next.layers) } : {}),
        ...(next.q !== undefined ? { q: next.q || undefined } : {}),
      }),
      replace: true,
    });
  };

  const hasFilters = activeKinds.length > 0 || activeLayers.length > 0 || query.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-16">
      <p className="eyebrow">Plate IV · Field signals</p>
      <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">Evidence</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        A concept you cannot observe is a belief. Each card names the signal, where it lives, what it
        proves — and the innocent explanation that produces the very same shape.
      </p>

      <div className="mt-8 grid grid-cols-3 border-y border-border">
        <div className="border-r border-border px-4 py-5">
          <div className="font-display text-3xl">{evidence.length}</div>
          <div className="eyebrow mt-1">Signals</div>
        </div>
        <div className="border-r border-border px-4 py-5">
          <div className="font-display text-3xl">{coveredConcepts}</div>
          <div className="eyebrow mt-1">Concepts covered</div>
        </div>
        <div className="px-4 py-5">
          <div className="font-display text-3xl">{EVIDENCE_KIND_ORDER.length}</div>
          <div className="eyebrow mt-1">Kinds of proof</div>
        </div>
      </div>

      <section aria-label="Filters" className="mt-8 space-y-4">
        <input
          value={query}
          onChange={(event) => setSearch({ q: event.target.value })}
          placeholder="Filter by signal, tool or symptom…"
          aria-label="Filter evidence"
          className="w-full border-b border-input bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <div className="flex flex-wrap gap-2">
          {EVIDENCE_KIND_ORDER.map((kind) => {
            const active = activeKinds.includes(kind);
            return (
              <button
                key={kind}
                onClick={() => setSearch({ kinds: toggle(activeKinds, kind) })}
                aria-pressed={active}
                title={EVIDENCE_KIND_META[kind].blurb}
                className={cn(
                  "border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:border-foreground hover:text-foreground",
                )}
              >
                {EVIDENCE_KIND_META[kind].label}
                <span className="ml-2 opacity-60">{totals[kind]}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {layers.map((layer) => {
            const active = activeLayers.includes(layer.id);
            return (
              <button
                key={layer.id}
                onClick={() => setSearch({ layers: toggle(activeLayers, layer.id) })}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-2 border border-border px-3 py-1.5 text-xs transition-colors",
                  active ? "border-foreground bg-accent" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={`layer-dot layer-${layer.id}`} />
                {layer.name}
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-8 flex items-baseline justify-between border-t border-border pt-4">
        <p className="eyebrow">
          {filtered.length} signal{filtered.length === 1 ? "" : "s"} · {groups.length} concept
          {groups.length === 1 ? "" : "s"}
        </p>
        {hasFilters && (
          <button
            onClick={() => void navigate({ search: {}, replace: true })}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="mt-10 text-muted-foreground">
          Nothing matches that combination. Try a single kind, or search for a tool name such as{" "}
          <button
            className="text-primary underline-offset-4 hover:underline"
            onClick={() => setSearch({ q: "EXPLAIN", kinds: [], layers: [] })}
          >
            EXPLAIN
          </button>
          .
        </p>
      ) : (
        <div className="mt-6 space-y-12">
          {groups.map(({ concept, items }) => (
            <section key={concept.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
                <h2 className="flex items-center gap-2 font-display text-2xl">
                  <span className={`layer-dot layer-${concept.layerId}`} />
                  <Link
                    to="/concepts/$slug"
                    params={{ slug: concept.slug }}
                    className="hover:text-primary"
                  >
                    {concept.name}
                  </Link>
                </h2>
                <Link
                  to="/graph"
                  search={{ focus: concept.id }}
                  className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
                >
                  See in graph →
                </Link>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {items.map((item) => (
                  <EvidenceCard key={item.id} evidence={item} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
