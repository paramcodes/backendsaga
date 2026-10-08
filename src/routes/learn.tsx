import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { LearnExperience } from "@/components/atlas/learning/LearnExperience";
import { AtlasRouteError } from "@/components/atlas/RouteStates";
import { getAtlasGraph } from "@/lib/atlas.functions";

const searchSchema = z.object({
  plan: z.string().optional(),
});

export const Route = createFileRoute("/learn")({
  validateSearch: searchSchema,
  loader: () => getAtlasGraph(),
  staleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title: "Learn — Backend Atlas" },
      {
        name: "description",
        content:
          "Track what you know about backend failure modes and get the next entry to read, ordered by what the graph says you are ready for.",
      },
      { property: "og:title", content: "Learn — Backend Atlas" },
      {
        property: "og:description",
        content: "Mastery per entry, prerequisite-aware recommendations, and a route to any topic.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: AtlasRouteError,
  component: LearnRoute,
});

function LearnRoute() {
  const graph = Route.useLoaderData();
  const { plan } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8 md:py-16">
      <header className="mb-8">
        <p className="eyebrow">Learning</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl">Know the atlas</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Mark what you understand as you read. The atlas uses its own graph — what causes what,
          what requires what — to decide what you are ready for next and where your knowledge is
          thin.
        </p>
      </header>

      <LearnExperience
        graph={graph}
        planTargetId={plan ?? null}
        onPlanTarget={(conceptId) =>
          void navigate({
            search: (prev) => ({ ...prev, plan: conceptId ?? undefined }),
            replace: true,
          })
        }
      />
    </div>
  );
}
