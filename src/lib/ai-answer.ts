// A tiny markdown reader for streamed answers.
//
// Pure TypeScript, no dependency: the model emits a known, narrow subset
// (headings, bullets, numbered lists, fenced code, inline code and bold) and
// the atlas renders it with its own typography. It must also cope with a
// half-finished document, because it parses the stream on every chunk.
export type AnswerSpan = { text: string; code?: true; strong?: true };

export type AnswerBlock =
  | { kind: "heading"; level: 2 | 3; spans: AnswerSpan[] }
  | { kind: "paragraph"; spans: AnswerSpan[] }
  | { kind: "list"; ordered: boolean; items: AnswerSpan[][] }
  | { kind: "code"; text: string };

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*)/g;

/** Splits a line into plain, `code` and **bold** runs. Unclosed marks stay literal. */
export function parseSpans(line: string): AnswerSpan[] {
  const spans: AnswerSpan[] = [];
  let cursor = 0;
  for (const match of line.matchAll(INLINE)) {
    const index = match.index ?? 0;
    if (index > cursor) spans.push({ text: line.slice(cursor, index) });
    const token = match[0];
    if (token.startsWith("`")) spans.push({ text: token.slice(1, -1), code: true });
    else spans.push({ text: token.slice(2, -2), strong: true });
    cursor = index + token.length;
  }
  if (cursor < line.length) spans.push({ text: line.slice(cursor) });
  return spans.filter((span) => span.text.length > 0);
}

const BULLET = /^\s{0,3}[-*•]\s+(.*)$/;
const NUMBERED = /^\s{0,3}(\d{1,2})[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;

export function parseAnswer(markdown: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let fence: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: parseSpans(paragraph.join(" ").trim()) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({
      kind: "list",
      ordered: list.ordered,
      items: list.items.map((item) => parseSpans(item)),
    });
    list = null;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");

    if (line.trimStart().startsWith("```")) {
      if (fence) {
        blocks.push({ kind: "code", text: fence.join("\n") });
        fence = null;
      } else {
        flush();
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(rawLine);
      continue;
    }

    if (line.trim() === "") {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({
        kind: "heading",
        level: heading[1]!.length >= 3 ? 3 : 2,
        spans: parseSpans(heading[2]!.trim()),
      });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]!.trim());
      continue;
    }

    const numbered = NUMBERED.exec(line);
    if (numbered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[2]!.trim());
      continue;
    }

    // A continuation line inside a list item belongs to that item.
    if (list && /^\s{2,}/.test(rawLine)) {
      list.items[list.items.length - 1] = `${list.items[list.items.length - 1]} ${line.trim()}`;
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  // An unterminated fence is normal mid-stream: show what has arrived.
  if (fence && fence.length) blocks.push({ kind: "code", text: fence.join("\n") });
  flush();
  return blocks;
}

/** The headings an answer actually produced — used to show section progress. */
export function answerHeadings(blocks: AnswerBlock[]): string[] {
  return blocks
    .filter((block): block is Extract<AnswerBlock, { kind: "heading" }> => block.kind === "heading")
    .map((block) => block.spans.map((span) => span.text).join(""));
}

export const isBlank = (text: string): boolean => text.trim().length === 0;

/**
 * A failure can land after the first words are already on screen, when the
 * HTTP status has been sent. The server appends this marker plus a sentence;
 * the reader shows the partial answer and the sentence, and never pretends the
 * answer finished.
 */
export const ANSWER_ERROR_MARKER = "\u0000atlas-answer-error:";

export function splitAnswerError(text: string): { answer: string; error: string | null } {
  const at = text.indexOf(ANSWER_ERROR_MARKER);
  if (at === -1) return { answer: text, error: null };
  const error = text.slice(at + ANSWER_ERROR_MARKER.length).trim();
  return {
    answer: text.slice(0, at),
    error: error || "The answer stopped before it finished.",
  };
}
