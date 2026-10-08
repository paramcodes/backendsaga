import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";

import { TriageExperience } from "@/components/atlas/incident/TriageExperience";
import { AtlasRouteError } from "@/components/atlas/RouteStates";
import { getDiagnosticsContext } from "@/lib/atlas.functions";
import { decodeSymptoms, encodeSymptoms } from "@/lib/incident-view";

const DESCRIPTION =
  "Tick the signals you can see and the atlas walks its causal graph backwards to rank the causes that explain them.";

export const Route = createFileRoute("/triage")({
  validateSearch: z.object({ symptoms: z.string().optional() }),
  loader: () => getDiagnosticsContext(),
  staleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title: "Triage — Backend Atlas" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Triage — Backend Atlas" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: AtlasRouteError,
  component: TriagePage,
});

function TriagePage() {
  const context = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const allowed = useMemo(
    () => new Set(context.symptoms.map((symptom) => symptom.id)),
    [context.symptoms],
  );
  const selected = useMemo(
    () => decodeSymptoms(search.symptoms, allowed),
    [allowed, search.symptoms],
  );

  const setSelected = (symptomIds: string[]) => {
    const encoded = encodeSymptoms(symptomIds);
    void navigate({
      search: encoded ? { symptoms: encoded } : {},
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-8 md:py-14">
      <header className="mb-8 border-b border-border pb-6">
        <p className="eyebrow">Triage</p>
        <h1 className="mt-2 font-display text-4xl md:text-5xl">What is actually broken?</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted-foreground">{DESCRIPTION}</p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Deterministic: the same observations always produce the same ranking, and every rank is
          backed by a path you can click through.
        </p>
      </header>
      <TriageExperience context={context} selected={selected} onChange={setSelected} />
    </div>
  );
}
