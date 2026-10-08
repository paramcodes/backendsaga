import { createFileRoute, Link } from "@tanstack/react-router";

import { ResearchConsole } from "@/components/atlas/ai/ResearchConsole";
import { AtlasRouteError } from "@/components/atlas/RouteStates";
import { listResearchProposals } from "@/lib/ai.functions";

const DESCRIPTION =
  "Point the atlas at a topic it has not covered and it researches the gap, then queues a reviewable proposal — new entries, links, signals and sources, none of them applied automatically.";

export const Route = createFileRoute("/research")({
  loader: () => listResearchProposals(),
  staleTime: 30 * 1000,
  head: () => ({
    meta: [
      { title: "Research desk — Backend Atlas" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Research desk — Backend Atlas" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: AtlasRouteError,
  component: ResearchPage,
});

function ResearchPage() {
  const proposals = Route.useLoaderData();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 md:py-14">
      <header className="mb-8 border-b border-border pb-6">
        <p className="eyebrow">Research desk</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">What is the atlas missing?</h1>
        <p className="mt-3 max-w-3xl text-lg text-muted-foreground">{DESCRIPTION}</p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          The model never edits the graph. It is shown what the atlas already holds, asked for what
          is missing, and its answer is checked against the{" "}
          <Link to="/graph" search={{}} className="text-primary underline-offset-4 hover:underline">
            existing records
          </Link>{" "}
          before anyone sees it: unknown layers, duplicate ids, dangling links and self-references
          are dropped with the reason shown. What survives is a patch for the curated seed files,
          which a human still has to read and apply.
        </p>
      </header>

      <ResearchConsole proposals={proposals} />
    </div>
  );
}
