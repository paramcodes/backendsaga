import { describe, expect, it } from "vitest";

import { answerHeadings, parseAnswer, parseSpans } from "./ai-answer";

describe("answer spans", () => {
  it("reads inline code and bold", () => {
    expect(parseSpans("watch `pg_stat_activity` and **act fast**")).toEqual([
      { text: "watch " },
      { text: "pg_stat_activity", code: true },
      { text: " and " },
      { text: "act fast", strong: true },
    ]);
  });

  it("leaves a half-typed mark alone while the answer streams", () => {
    expect(parseSpans("waiting on `pg_stat")).toEqual([{ text: "waiting on `pg_stat" }]);
  });
});

describe("answer blocks", () => {
  const markdown = [
    "## Problem",
    "Retries pile on a service that is already failing.",
    "",
    "## Failure trace",
    "- Retry Storm → Connection Pool Exhaustion",
    "- Connection Pool Exhaustion → Tail Latency",
    "",
    "## Check next",
    "1. Look at `db.client.connections.wait_time`",
    "2. Then the pool size",
    "",
    "```sql",
    "select count(*) from pg_stat_activity;",
    "```",
  ].join("\n");

  const blocks = parseAnswer(markdown);

  it("keeps headings, paragraphs, both list kinds and code apart", () => {
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "list",
      "heading",
      "list",
      "code",
    ]);
    expect(answerHeadings(blocks)).toEqual(["Problem", "Failure trace", "Check next"]);
  });

  it("marks numbered lists as ordered", () => {
    const lists = blocks.filter((block) => block.kind === "list");
    expect(lists[0]).toMatchObject({ ordered: false });
    expect(lists[1]).toMatchObject({ ordered: true });
    expect(lists[0]!.kind === "list" && lists[0]!.items).toHaveLength(2);
  });

  it("joins wrapped paragraph lines", () => {
    const wrapped = parseAnswer("A long sentence\nthat wrapped mid-stream.");
    expect(wrapped).toHaveLength(1);
    expect(wrapped[0]!.kind === "paragraph" && wrapped[0]!.spans[0]!.text).toBe(
      "A long sentence that wrapped mid-stream.",
    );
  });

  it("renders a document that is still arriving", () => {
    const partial = parseAnswer("## Problem\nRetries pi");
    expect(partial.map((block) => block.kind)).toEqual(["heading", "paragraph"]);

    const openFence = parseAnswer("```\nselect 1");
    expect(openFence).toEqual([{ kind: "code", text: "select 1" }]);
  });

  it("returns nothing for an empty answer", () => {
    expect(parseAnswer("")).toEqual([]);
    expect(parseAnswer("\n\n  \n")).toEqual([]);
  });
});
