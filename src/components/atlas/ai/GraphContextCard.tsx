// The receipt that sits next to every AI answer.
//
// It shows the exact records the model was handed, in the same order and
// wording it read them, plus the fingerprint of that text. If the answer's
// fingerprint and the context's fingerprint disagree, the reader is told —
// an answer whose context cannot be verified is worth less than no answer.
import { useState } from "react";

import type { AtlasContext } from "@/lib/ai-context";

type Props = {
  context: AtlasContext | null;
  pending?: boolean;
  /** Hash reported by the answer, when one has been streamed. */
  verifiedHash?: string | null;
  defaultOpen?: boolean;
  /** Shown when nothing has been loaded yet. */
  emptyNote?: string;
};

export function GraphContextCard({
  context,
  pending = false,
  verifiedHash = null,
  defaultOpen = false,
  emptyNote,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  if (pending && !context) {
    return (
      <div className="border border-border bg-muted/30 px-4 py-3">
        <p className="eyebrow">Graph context</p>
        <div className="mt-2 h-3 w-48 animate-pulse bg-border" />
      </div>
    );
  }

  if (!context) {
    return emptyNote ? (
      <div className="border border-dashed border-border px-4 py-3">
        <p className="eyebrow">Graph context</p>
        <p className="mt-1 text-sm text-muted-foreground">{emptyNote}</p>
      </div>
    ) : null;
  }

  const factCount = context.sections.reduce((total, section) => total + section.facts.length, 0);
  const mismatch = verifiedHash !== null && verifiedHash !== context.hash;

  return (
    <section className="border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/60"
      >
        <span>
          <span className="eyebrow block">Graph context</span>
          <span className="mt-1 block text-sm text-muted-foreground">
            {factCount} record{factCount === 1 ? "" : "s"} from {context.sections.length} section
            {context.sections.length === 1 ? "" : "s"} — everything the model was told, and nothing
            else.
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            title={
              mismatch
                ? "The answer was built from different context than the one shown here."
                : "Fingerprint of the exact text the model received."
            }
            className={`border px-1.5 py-0.5 font-mono text-[10px] ${
              mismatch ? "border-destructive text-destructive" : "border-border text-muted-foreground"
            }`}
          >
            #{context.hash}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {open ? "Hide" : "Show"}
          </span>
        </span>
      </button>

      {mismatch && (
        <p className="border-t border-destructive/40 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          The answer reports context #{verifiedHash}, which is not the context below. Re-run it
          before trusting what it says.
        </p>
      )}

      {open && (
        <div className="space-y-5 border-t border-border px-4 py-4">
          {context.question && (
            <div>
              <p className="eyebrow">Question asked</p>
              <p className="mt-1 text-sm">{context.question}</p>
            </div>
          )}
          {context.sections.map((section) => (
            <div key={section.title}>
              <p className="eyebrow">{section.title}</p>
              <p className="mt-0.5 text-xs italic text-muted-foreground">{section.note}</p>
              <dl className="mt-2 space-y-1.5">
                {section.facts.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="grid gap-x-3 sm:grid-cols-[12rem_1fr]">
                    <dt className="font-mono text-[11px] leading-5 text-muted-foreground">
                      {item.label}
                    </dt>
                    <dd className="text-sm leading-5">{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
