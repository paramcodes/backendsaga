// One research proposal, laid out for a reviewer.
//
// Nothing here is part of the atlas. It is a claim the model made, shown with
// the context it was given, the checks that would confirm it, and the patch a
// human would paste into the curated seed if they agree. Accepting records a
// decision; it never writes to the graph.
import { useState } from "react";

import { GraphContextCard } from "./GraphContextCard";
import {
  isEmptyProposal,
  proposalCounts,
  proposalToSeedPatch,
  type ProposalStatus,
  type ResearchProposalRecord,
} from "@/lib/ai-proposal";

type Props = {
  record: ResearchProposalRecord;
  onDecide?: (status: Exclude<ProposalStatus, "pending">, note: string) => void;
  deciding?: boolean;
};

const STATUS_STYLE: Record<ProposalStatus, string> = {
  pending: "border-border text-muted-foreground",
  accepted: "border-primary text-primary",
  rejected: "border-destructive/50 text-destructive",
};

const STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: "Awaiting review",
  accepted: "Accepted",
  rejected: "Rejected",
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="grid gap-x-3 sm:grid-cols-[8rem_1fr]">
      <dt className="eyebrow pt-0.5">{label}</dt>
      <dd className="text-sm leading-relaxed">{value}</dd>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
    >
      {copied ? "Copied" : "Copy patch"}
    </button>
  );
}

export function ProposalView({ record, onDecide, deciding = false }: Props) {
  const [note, setNote] = useState("");
  const [showPatch, setShowPatch] = useState(false);
  const counts = proposalCounts(record.proposal);
  const empty = isEmptyProposal(record.proposal);
  const patch = proposalToSeedPatch(record.proposal);

  return (
    <article className="border border-border bg-card">
      <header className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Research proposal</p>
            <h3 className="mt-1 font-display text-2xl leading-snug">{record.topic}</h3>
          </div>
          <span
            className={`shrink-0 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${STATUS_STYLE[record.status]}`}
          >
            {STATUS_LABEL[record.status]}
          </span>
        </div>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>{new Date(record.createdAt).toLocaleString()}</span>
          <span>{record.model}</span>
          <span>context #{record.contextHash}</span>
          <span>
            {counts.concepts} entries · {counts.relationships} links · {counts.evidence} signals ·{" "}
            {counts.sources} sources
          </span>
        </p>
      </header>

      <div className="space-y-6 px-5 py-5">
        {record.summary && <p className="max-w-3xl leading-relaxed">{record.summary}</p>}

        {record.proposal.gaps.length > 0 && (
          <section>
            <p className="eyebrow">Gaps it claims to fill</p>
            <ul className="mt-2 space-y-1 text-sm leading-relaxed text-muted-foreground">
              {record.proposal.gaps.map((gap, index) => (
                <li key={index} className="border-l-2 border-border pl-3">
                  {gap}
                </li>
              ))}
            </ul>
          </section>
        )}

        {empty ? (
          <p className="border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            Nothing survived review — the model proposed no entry, link, signal or source the atlas
            does not already hold.
          </p>
        ) : (
          <>
            {record.proposal.concepts.length > 0 && (
              <section>
                <p className="eyebrow">Proposed entries</p>
                <div className="mt-3 space-y-4">
                  {record.proposal.concepts.map((concept) => (
                    <div key={concept.slug} className="border border-border bg-background p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h4 className="font-display text-lg">{concept.name}</h4>
                        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          <span className={`layer-dot layer-${concept.layerId}`} />
                          {concept.layerId} · {concept.slug}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed">{concept.description}</p>
                      <dl className="mt-3 space-y-2 border-t border-border pt-3">
                        <Field label="Problem" value={concept.problem} />
                        <Field label="Mechanism" value={concept.mechanism} />
                        <Field label="Trade-offs" value={concept.tradeoffs} />
                        <Field label="Alternative" value={concept.betterAlternative} />
                        <Field label="Why add it" value={concept.rationale} />
                      </dl>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {record.proposal.relationships.length > 0 && (
              <section>
                <p className="eyebrow">Proposed links</p>
                <ul className="mt-3 space-y-3">
                  {record.proposal.relationships.map((rel, index) => (
                    <li key={index} className="border-l-2 border-border pl-3">
                      <p className="font-mono text-xs">
                        {rel.sourceId} <span className="text-primary">—{rel.type}→</span>{" "}
                        {rel.targetId}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {rel.rationale}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {record.proposal.evidence.length > 0 && (
              <section>
                <p className="eyebrow">Proposed signals</p>
                <div className="mt-3 space-y-3">
                  {record.proposal.evidence.map((card, index) => (
                    <div key={index} className="border border-border bg-background p-4">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {card.kind} · {card.trend} · {card.conceptId}
                      </p>
                      <p className="mt-1 font-mono text-sm">{card.signal}</p>
                      <dl className="mt-3 space-y-2 border-t border-border pt-3">
                        <Field label="You see" value={card.whatYouSee} />
                        <Field label="Look in" value={card.whereToLook} />
                        <Field label="Why" value={card.whyItMatters} />
                        <Field label="Looks the same" value={card.falsePositive} />
                      </dl>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {record.proposal.sources.length > 0 && (
              <section>
                <p className="eyebrow">Proposed sources</p>
                <ul className="mt-3 space-y-3">
                  {record.proposal.sources.map((source) => (
                    <li key={source.id}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-display text-lg leading-snug underline-offset-4 hover:text-primary hover:underline"
                      >
                        {source.title}
                      </a>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {source.kind} · {source.author}
                        {source.year ? ` · ${source.year}` : ""} · cites {source.citesConceptId}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {source.note}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {record.proposal.verification.length > 0 && (
          <section>
            <p className="eyebrow">How to check it before accepting</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed marker:font-mono marker:text-xs marker:text-muted-foreground">
              {record.proposal.verification.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </section>
        )}

        {record.issues.length > 0 && (
          <section className="border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="eyebrow text-destructive">Dropped in review</p>
            <ul className="mt-2 space-y-1 text-sm text-destructive">
              {record.issues.map((issue, index) => (
                <li key={index}>
                  <span className="font-mono text-xs">{issue.item}</span> — {issue.problem}
                </li>
              ))}
            </ul>
          </section>
        )}

        <GraphContextCard context={record.context} />

        {!empty && (
          <section>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowPatch((value) => !value)}
                aria-expanded={showPatch}
                className="eyebrow hover:text-foreground"
              >
                {showPatch ? "Hide" : "Show"} the seed patch
              </button>
              {showPatch && <CopyButton text={patch} />}
            </div>
            {showPatch && (
              <pre className="mt-3 max-h-96 overflow-auto border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
                <code>{patch}</code>
              </pre>
            )}
          </section>
        )}

        {record.status === "pending" && onDecide && (
          <section className="border-t border-border pt-4">
            <p className="eyebrow">Decision</p>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Accepting records that a human reviewed this and agreed. The entries still only enter
              the atlas when the seed files are edited and re-seeded.
            </p>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Review note (optional) — what you checked, what you changed."
              maxLength={400}
              rows={2}
              className="mt-3 w-full border border-input bg-transparent p-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={deciding}
                onClick={() => onDecide("accepted", note)}
                className="bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={deciding}
                onClick={() => onDecide("rejected", note)}
                className="border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </section>
        )}

        {record.status !== "pending" && (
          <p className="border-t border-border pt-4 text-sm text-muted-foreground">
            {STATUS_LABEL[record.status]}
            {record.decidedAt ? ` on ${new Date(record.decidedAt).toLocaleString()}` : ""}
            {record.reviewNote ? ` — ${record.reviewNote}` : "."}
          </p>
        )}
      </div>
    </article>
  );
}
