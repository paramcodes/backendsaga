// Renders a streamed answer with the atlas's own typography.
//
// The parser is pure (src/lib/ai-answer.ts) and copes with half-finished
// markdown, so this component can re-render on every chunk.
import { useMemo } from "react";

import { parseAnswer, type AnswerBlock, type AnswerSpan } from "@/lib/ai-answer";

function Spans({ spans }: { spans: AnswerSpan[] }) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.code) {
          return (
            <code
              key={index}
              className="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.84em] text-foreground"
            >
              {span.text}
            </code>
          );
        }
        if (span.strong) {
          return (
            <strong key={index} className="font-semibold text-foreground">
              {span.text}
            </strong>
          );
        }
        return <span key={index}>{span.text}</span>;
      })}
    </>
  );
}

function Block({ block, first }: { block: AnswerBlock; first: boolean }) {
  switch (block.kind) {
    case "heading":
      return block.level === 2 ? (
        <h3 className={`eyebrow border-t border-border pt-4 ${first ? "mt-0 border-t-0 pt-0" : "mt-7"}`}>
          <Spans spans={block.spans} />
        </h3>
      ) : (
        <h4 className="mt-5 font-display text-lg">
          <Spans spans={block.spans} />
        </h4>
      );
    case "paragraph":
      return (
        <p className="mt-3 leading-relaxed text-[0.95rem]">
          <Spans spans={block.spans} />
        </p>
      );
    case "list":
      return block.ordered ? (
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[0.95rem] leading-relaxed marker:font-mono marker:text-xs marker:text-muted-foreground">
          {block.items.map((item, index) => (
            <li key={index}>
              <Spans spans={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[0.95rem] leading-relaxed marker:text-muted-foreground">
          {block.items.map((item, index) => (
            <li key={index}>
              <Spans spans={item} />
            </li>
          ))}
        </ul>
      );
    case "code":
      return (
        <pre className="mt-3 overflow-x-auto border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
          <code>{block.text}</code>
        </pre>
      );
  }
}

/** `streaming` adds a caret so a pause reads as "still writing", not "done". */
export function AnswerBody({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const blocks = useMemo(() => parseAnswer(text), [text]);

  return (
    <div className="max-w-2xl">
      {blocks.map((block, index) => (
        <Block key={index} block={block} first={index === 0} />
      ))}
      {streaming && <span aria-hidden className="atlas-caret" />}
    </div>
  );
}
