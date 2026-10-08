// The shared surface for the two reading capabilities: explain an entry, and
// give a second reading of a triage result.
//
// Three rules hold in both cases. Nothing is sent until the reader asks for
// it. The context is loadable *without* calling the model, so anyone can see
// what it would be told first. And the answer always appears with that
// context attached.
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import { AnswerBody } from "./AnswerBody";
import { Elapsed } from "./Elapsed";
import { GraphContextCard } from "./GraphContextCard";
import { useAtlasAnswer } from "@/hooks/use-atlas-answer";
import { getAiContext } from "@/lib/ai.functions";

export type AskTarget =
  | { kind: "explain"; conceptId: string }
  | { kind: "diagnose"; symptomIds: string[] };

type Props = {
  target: AskTarget;
  title: string;
  blurb: string;
  action: string;
  placeholder: string;
  /** Rendered above the answer; the line that keeps AI in its place. */
  caveat: string;
  disabled?: boolean;
  disabledNote?: string;
};

const targetKey = (target: AskTarget): string =>
  target.kind === "explain" ? target.conceptId : [...target.symptomIds].sort().join(",");

export function AskPanel({
  target,
  title,
  blurb,
  action,
  placeholder,
  caveat,
  disabled = false,
  disabledNote,
}: Props) {
  const inputId = useId();
  const [question, setQuestion] = useState("");
  const [armed, setArmed] = useState(false);
  const { state, running, run, stop, reset } = useAtlasAnswer(`/api/ai/${target.kind}`);

  const key = targetKey(target);
  const context = useQuery({
    queryKey: ["ai-context", target.kind, key],
    queryFn: () =>
      getAiContext({
        data:
          target.kind === "explain"
            ? { kind: "explain" as const, conceptId: target.conceptId, question: null }
            : { kind: "diagnose" as const, symptomIds: target.symptomIds, question: null },
      }),
    enabled: armed && !disabled,
    staleTime: 5 * 60 * 1000,
  });

  const ask = () => {
    setArmed(true);
    void run(
      target.kind === "explain"
        ? { conceptId: target.conceptId, question: question.trim() || null }
        : { symptomIds: target.symptomIds, question: question.trim() || null },
    );
  };

  const hasAnswer = state.text.trim().length > 0;

  return (
    <section className="border border-border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-4">
        <div>
          <p className="eyebrow">Ask the atlas</p>
          <h2 className="mt-1 font-display text-2xl">{title}</h2>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Graph-grounded
        </p>
      </header>

      <div className="space-y-4 px-5 py-4">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{blurb}</p>

        {disabled ? (
          <p className="border-l-2 border-border pl-3 text-sm text-muted-foreground">
            {disabledNote ?? "Not available yet."}
          </p>
        ) : (
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (!running) ask();
            }}
          >
            <div className="flex-1">
              <label htmlFor={inputId} className="eyebrow">
                Your question (optional)
              </label>
              <input
                id={inputId}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={placeholder}
                maxLength={400}
                className="mt-1 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {running ? (
                <button
                  type="button"
                  onClick={stop}
                  className="border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors hover:border-foreground"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  className="bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90"
                >
                  {hasAnswer || state.phase === "error" ? "Ask again" : action}
                </button>
              )}
              <button
                type="button"
                onClick={() => setArmed(true)}
                className="border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                Show the facts
              </button>
            </div>
          </form>
        )}

        {armed && !disabled && (
          <GraphContextCard
            context={context.data ?? null}
            pending={context.isPending}
            verifiedHash={state.contextHash}
            defaultOpen={state.phase === "idle"}
          />
        )}

        {context.isError && armed && (
          <p className="text-sm text-destructive">
            The context could not be loaded, so there is nothing to check the answer against.
          </p>
        )}

        {state.phase !== "idle" && (
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">
                {state.phase === "pending"
                  ? "Reading the graph…"
                  : state.phase === "streaming"
                    ? "Writing"
                    : state.phase === "stopped"
                      ? "Stopped"
                      : state.phase === "error" && !hasAnswer
                        ? "Failed"
                        : "Answer"}
              </p>
              <div className="flex items-center gap-3">
                <Elapsed since={state.startedAt} running={running} />
                {!running && (hasAnswer || state.phase === "error") && (
                  <button
                    type="button"
                    onClick={reset}
                    className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {state.phase === "pending" && (
              <div className="mt-3 space-y-2" aria-hidden>
                <div className="h-3 w-3/4 animate-pulse bg-border" />
                <div className="h-3 w-1/2 animate-pulse bg-border" />
              </div>
            )}

            {hasAnswer && (
              <>
                <p className="mt-2 max-w-2xl border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
                  {caveat}
                </p>
                <div className="mt-4">
                  <AnswerBody text={state.text} streaming={state.phase === "streaming"} />
                </div>
              </>
            )}

            {state.error && (
              <div className="mt-4 border border-destructive/40 bg-destructive/5 px-3 py-2">
                <p className="text-sm text-destructive">{state.error}</p>
                {state.retryable && !running && (
                  <button
                    type="button"
                    onClick={ask}
                    className="mt-2 border border-destructive/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-destructive transition-colors hover:bg-destructive/10"
                  >
                    Try again
                  </button>
                )}
              </div>
            )}

            {state.phase === "stopped" && (
              <p className="mt-3 text-sm text-muted-foreground">
                You stopped this answer, so it ends mid-thought.
              </p>
            )}

            {state.runId && (
              <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Run {state.runId.slice(0, 12)}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
