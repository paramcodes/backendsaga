// The research desk.
//
// A topic goes in; a reviewable proposal comes out and is queued. The model
// may draw on what it knows, but it is shown exactly what the atlas already
// holds so it cannot re-propose it, and every claim it makes arrives with a
// verification step and a patch a human still has to apply.
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Elapsed } from "./Elapsed";
import { ProposalView } from "./ProposalView";
import {
  isEmptyProposal,
  proposalCounts,
  type ProposalStatus,
  type ResearchProposalRecord,
} from "@/lib/ai-proposal";
import { decideResearchProposal } from "@/lib/ai.functions";

type Phase = "idle" | "running" | "done" | "error" | "stopped";

const SUGGESTIONS = [
  "PostgreSQL write-ahead log and checkpoint tuning",
  "Head-of-line blocking in HTTP/2 and HTTP/3",
  "Backpressure in streaming pipelines",
  "Tail latency from garbage collection",
];

const FILTERS: { id: ProposalStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Awaiting review" },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
];

export function ResearchConsole({ proposals }: { proposals: ResearchProposalRecord[] }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [fresh, setFresh] = useState<ResearchProposalRecord | null>(null);
  const [filter, setFilter] = useState<ProposalStatus | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);

  const research = async (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 2) return;
    controller?.abort();
    const local = new AbortController();
    setController(local);
    setPhase("running");
    setError(null);
    setFresh(null);
    setStartedAt(Date.now());

    try {
      const response = await fetch("/api/ai/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: trimmed }),
        signal: local.signal,
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message =
          body && typeof body === "object" && typeof (body as Record<string, unknown>)["error"] === "string"
            ? ((body as Record<string, unknown>)["error"] as string)
            : `The research call failed (${response.status}).`;
        setPhase("error");
        setError(message);
        return;
      }
      const body = (await response.json()) as { record: ResearchProposalRecord };
      setFresh(body.record);
      setOpenId(body.record.id);
      setPhase("done");
      void router.invalidate();
    } catch (cause) {
      if (local.signal.aborted) {
        setPhase("stopped");
        return;
      }
      setPhase("error");
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "The connection dropped before the proposal arrived.",
      );
    } finally {
      setController((current) => (current === local ? null : current));
    }
  };

  const decide = async (
    record: ResearchProposalRecord,
    status: Exclude<ProposalStatus, "pending">,
    note: string,
  ) => {
    setDeciding(record.id);
    try {
      const updated = await decideResearchProposal({
        data: { id: record.id, status, note: note.trim() || null },
      });
      if (fresh?.id === updated.id) setFresh(updated);
      await router.invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That decision could not be recorded.");
    } finally {
      setDeciding(null);
    }
  };

  const queue = proposals.filter((record) => filter === "all" || record.status === filter);
  const running = phase === "running";
  const pendingCount = proposals.filter((record) => record.status === "pending").length;

  return (
    <div className="space-y-10">
      <section className="border border-border bg-card">
        <div className="space-y-4 px-5 py-5">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (!running) void research(topic);
            }}
          >
            <div className="flex-1">
              <label htmlFor="research-topic" className="eyebrow">
                Topic to research
              </label>
              <input
                id="research-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="e.g. PostgreSQL write-ahead log and checkpoint tuning"
                maxLength={160}
                className="mt-1 w-full border-b border-input bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {running ? (
                <button
                  type="button"
                  onClick={() => controller?.abort()}
                  className="border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors hover:border-foreground"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={topic.trim().length < 2}
                  className="bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Research it
                </button>
              )}
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow" title="Fills the box — you still press Research it">
              Try
            </span>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={running}
                onClick={() => setTopic(suggestion)}
                className="border border-border px-2.5 py-1 text-xs transition-colors hover:border-foreground disabled:opacity-40"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {running && (
            <div className="flex items-center gap-3 border-t border-border pt-4">
              <div className="h-3 w-40 animate-pulse bg-border" />
              <p className="text-sm text-muted-foreground">
                Reading the atlas, then researching the gaps. This takes a couple of minutes.
              </p>
              <Elapsed since={startedAt} running={running} />
            </div>
          )}

          {phase === "stopped" && (
            <p className="border-t border-border pt-4 text-sm text-muted-foreground">
              Stopped. Nothing was recorded.
            </p>
          )}

          {error && (
            <div className="border border-destructive/40 bg-destructive/5 px-3 py-2">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>
      </section>

      {fresh && (
        <section className="space-y-3">
          <p className="eyebrow">Just proposed</p>
          <ProposalView
            record={fresh}
            deciding={deciding === fresh.id}
            onDecide={(status, note) => void decide(fresh, status, note)}
          />
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
          <div>
            <p className="eyebrow">Review queue</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {proposals.length} proposal{proposals.length === 1 ? "" : "s"} recorded ·{" "}
              {pendingCount} awaiting review
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                aria-pressed={filter === option.id}
                className={`border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                  filter === option.id
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Research a topic above and it lands in this queue.
          </p>
        ) : (
          <ul className="space-y-3">
            {queue.map((record) => {
              const counts = proposalCounts(record.proposal);
              const open = openId === record.id;
              return (
                <li key={record.id}>
                  {open ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setOpenId(null)}
                        className="eyebrow hover:text-foreground"
                      >
                        ← Collapse
                      </button>
                      <ProposalView
                        record={record}
                        deciding={deciding === record.id}
                        onDecide={(status, note) => void decide(record, status, note)}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenId(record.id)}
                      className="flex w-full flex-wrap items-baseline justify-between gap-3 border border-border bg-card px-4 py-3 text-left transition-colors hover:border-foreground"
                    >
                      <span className="min-w-0">
                        <span className="block font-display text-lg leading-snug">
                          {record.topic}
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {isEmptyProposal(record.proposal)
                            ? "No additions survived review"
                            : `${counts.concepts} entries · ${counts.relationships} links · ${counts.evidence} signals · ${counts.sources} sources`}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {record.status} · {new Date(record.createdAt).toLocaleDateString()}
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
