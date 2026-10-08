import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { z } from "zod";

import { AtlasRouteError } from "@/components/atlas/RouteStates";
import { getAtlasGraph } from "@/lib/atlas.functions";

const GraphExperience = lazy(() =>
  import("@/components/atlas/GraphExperience").then((module) => ({ default: module.GraphExperience })),
);

export const Route = createFileRoute("/graph")({
  validateSearch: z.object({
    focus: z.string().optional(),
    mode: z.enum(["focus", "atlas", "layer"]).optional(),
    depth: z.coerce.number().int().min(1).max(3).optional(),
    layer: z.string().optional(),
  }),
  loader: () => getAtlasGraph(),
  staleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title: "Knowledge Graph — Backend Atlas" },
      {
        name: "description",
        content: "Explore how backend failure modes cause, amplify and mitigate each other.",
      },
      { property: "og:title", content: "Knowledge Graph — Backend Atlas" },
      {
        property: "og:description",
        content: "Explore how backend failure modes cause, amplify and mitigate each other.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: AtlasRouteError,
  component: GraphPage,
});

function GraphPage() {
  const graph = Route.useLoaderData();
  const { focus, mode, depth, layer } = Route.useSearch();
  return (
    <ClientOnly fallback={<GraphLoading />}>
      <Suspense fallback={<GraphLoading />}>
        <GraphExperience
          graph={graph}
          {...(focus ? { initialFocus: focus } : {})}
          {...(mode ? { initialMode: mode } : {})}
          {...(depth ? { initialDepth: depth } : {})}
          {...(layer ? { initialLayer: layer } : {})}
        />
      </Suspense>
    </ClientOnly>
  );
}

function GraphLoading() {
  return (
    <div className="grid min-h-[calc(100vh-57px)] place-items-center bg-background">
      <p className="font-mono text-xs uppercase text-muted-foreground">Opening the atlas…</p>
    </div>
  );
}
