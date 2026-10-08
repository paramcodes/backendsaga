import { ClientOnly, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

import { AskPanel } from "@/components/atlas/ai/AskPanel";
import { createGraphIndex } from "@/domain/graph-index";
import type { DiagnosticsContext } from "@/lib/atlas.functions";
import { createIncidentEngine } from "@/lib/incident-engine";
import { symptomLine } from "@/lib/incident-view";
import { CauseList } from "./CauseList";
import { NextChecks } from "./NextChecks";
import { SymptomPicker } from "./SymptomPicker";

const CauseChainCanvas = lazy(() =>
  import("./CauseChainCanvas").then((module) => ({ default: module.CauseChainCanvas })),
);

type Props = {
  context: DiagnosticsContext;
  selected: string[];
  onChange: (symptomIds: string[]) => void;
};

const STARTERS: { label: string; symptomIds: string[] }[] = [
  { label: "Checkout is slow", symptomIds: ["p99-latency-up", "db-latency-up", "pool-wait-up"] },
  { label: "Everything is timing out", symptomIds: ["timeouts-up", "retry-rate-up", "queue-depth-up"] },
  { label: "Pods keep restarting", symptomIds: ["memory-climbing", "restart-loop"] },
  { label: "One zone looks sick", symptomIds: ["packet-loss", "connection-churn-up", "dns-slow"] },
];

/**
 * Triage: tick what you can see, and the engine walks the graph backwards.
 * The engine is pure, so every re-rank happens locally and instantly.
 */
export function TriageExperience({ context, selected, onChange }: Props) {
  const engine = useMemo(() => {
    const index = createGraphIndex({
      layers: context.layers,
      concepts: context.concepts,
      relationships: context.relationships,
      evidence: context.evidence,
      sources: [],
      conceptSources: [],
    });
    return {
      index,
      incidents: createIncidentEngine(index, {
        symptoms: context.symptoms,
        symptomEvidence: context.symptomEvidence,
        incidents: [],
      }),
    };
  }, [context]);

  const diagnosis = useMemo(
    () => engine.incidents.diagnose(selected),
    [engine, selected],
  );

  const [shownCauses, setShownCauses] = useState(5);
  const [chainId, setChainId] = useState<string | null>(null);

  // Keep the drawn chain on a candidate that still exists after a re-rank.
  useEffect(() => {
    const top = diagnosis.causes[0]?.concept.id ?? null;
    setChainId((current) =>
      current && diagnosis.causes.some((cause) => cause.concept.id === current) ? current : top,
    );
    setShownCauses(5);
  }, [diagnosis]);

  const chainCause =
    diagnosis.causes.find((cause) => cause.concept.id === chainId) ?? diagnosis.causes[0];

  const available = STARTERS.filter((starter) =>
    starter.symptomIds.every((id) => engine.incidents.getSymptom(id)),
  );

  const toggle = (symptomId: string) =>
    onChange(
      selected.includes(symptomId)
        ? selected.filter((id) => id !== symptomId)
        : [...selected, symptomId],
    );

  return (
    <div className="space-y-10">
      {selected.length > 0 && (
        <div className="space-y-6">
          <header className="border-b border-border pb-5">
            <p className="eyebrow">Diagnosis</p>
            <h2 className="mt-2 font-display text-3xl leading-tight md:text-4xl">
              {diagnosis.causes.length === 0
                ? "Nothing upstream of these signals"
                : `${diagnosis.causes[0]!.concept.name}, most likely`}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {diagnosis.causes.length === 0
                ? "These signals are not linked to anything in the atlas yet."
                : `${diagnosis.causes.length} candidate${
                    diagnosis.causes.length === 1 ? "" : "s"
                  } explain ${selected.length} observation${selected.length === 1 ? "" : "s"}, ranked by how much of what you see each one accounts for.`}
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {selected.map((id) => {
                const symptom = engine.incidents.getSymptom(id);
                if (!symptom) return null;
                return (
                  <li key={id}>
                    <button
                      onClick={() => toggle(id)}
                      title="Remove this observation"
                      className="border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                    >
                      {symptomLine(symptom)} ×
                    </button>
                  </li>
                );
              })}
            </ul>
          </header>

          {diagnosis.unobserved.length > 0 && (
            <p className="border-l-2 border-border pl-3 text-sm text-muted-foreground">
              No evidence links {diagnosis.unobserved.map((s) => s.name).join(", ")} into the graph
              yet, so {diagnosis.unobserved.length === 1 ? "it is" : "they are"} not being used to
              rank anything.
            </p>
          )}

          {chainCause && (
            <section aria-label="Cause chain">
              <div className="flex items-baseline justify-between gap-3">
                <p className="eyebrow">Why {chainCause.concept.name}</p>
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
                      layerName={engine.index.layerName}
                    />
                  </Suspense>
                </ClientOnly>
              </div>
            </section>
          )}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-10">
        <aside className="lg:sticky lg:top-[73px] lg:max-h-[calc(100vh-97px)] lg:overflow-y-auto lg:pr-2">
          <SymptomPicker
            symptoms={engine.incidents.symptoms}
            layers={context.layers}
            selected={selected}
            onToggle={toggle}
            onClear={() => onChange([])}
          />
        </aside>

        <section className="min-w-0 space-y-8">
          {selected.length === 0 ? (
            <div className="border border-border bg-card p-6 md:p-8">
              <h2 className="font-display text-2xl">Start from what you can see</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Tick the signals on the left. Every ranked cause comes with the chain of
                relationships that justifies it — no guessing, no model, just the graph walked
                backwards from your observations.
              </p>
              {available.length > 0 && (
                <div className="mt-6">
                  <p className="eyebrow">Common openings</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {available.map((starter) => (
                      <button
                        key={starter.label}
                        onClick={() => onChange(starter.symptomIds)}
                        className="border border-border px-3 py-1.5 text-sm transition-colors hover:border-foreground"
                      >
                        {starter.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-6 text-sm text-muted-foreground">
                Or replay a worked scenario from the{" "}
                <Link to="/incidents" className="text-primary underline-offset-4 hover:underline">
                  incident library
                </Link>
                .
              </p>
            </div>
          ) : (
            <>
              <section aria-label="Ranked causes" className="space-y-4">
                <p className="eyebrow">Ranked causes</p>
                <CauseList
                  diagnosis={diagnosis}
                  selectedId={chainCause?.concept.id ?? null}
                  onSelect={setChainId}
                  limit={shownCauses}
                  hasMore={diagnosis.causes.length > shownCauses}
                  onShowMore={() => setShownCauses((count) => count + 5)}
                />
              </section>

              <NextChecks checks={diagnosis.checks} />

              <AskPanel
                target={{ kind: "diagnose", symptomIds: selected }}
                title="A second reading of the same evidence"
                blurb="The ranking above is computed from the graph, not generated. This hands the model that ranking — the same signals, the same chains, the same checks — and asks it to write up how to work through it. It cannot re-rank anything."
                action="Read it back to me"
                placeholder="e.g. what would you check first at 3am?"
                caveat="Written by a model from the ranking above. If it disagrees with the ranked causes, the ranked causes are what the graph actually says."
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function CanvasFallback() {
  return (
    <div className="grid h-[28rem] w-full place-items-center border border-border bg-card md:h-[34rem] lg:h-[38rem]">
      <p className="font-mono text-xs uppercase text-muted-foreground">Drawing the chain…</p>
    </div>
  );
}
