import { describe, expect, it } from "vitest";
import { createGraphIndex, domainGraph, incidentCatalog } from "@/domain";

import {
  AI_CONTEXT_LIMITS,
  buildDiagnoseContext,
  buildExplainContext,
  buildResearchContext,
  contextHash,
  renderContextPrompt,
  researchGaps,
} from "./ai-context";
import { createIncidentEngine } from "./incident-engine";
import { buildUserMessage, EXPLAIN_INSTRUCTIONS, RESEARCH_INSTRUCTIONS } from "./ai-prompts";

const index = createGraphIndex(domainGraph);
const engine = createIncidentEngine(index, incidentCatalog);

const allDetails = (context: { sections: { facts: { detail: string }[] }[] }) =>
  context.sections.flatMap((section) => section.facts.map((f) => f.detail)).join("\n");

describe("explain context", () => {
  const context = buildExplainContext(index, "retry-storm");

  it("carries the entry, its relationships, its evidence and its sources", () => {
    const titles = context.sections.map((section) => section.title);
    expect(titles[0]).toContain("Retry Storm");
    expect(titles).toContain("Recorded relationships");
    expect(titles).toContain("Production evidence");
    expect(titles).toContain("Cited sources");
    expect(allDetails(context)).toContain(index.evidenceFor("retry-storm")[0]!.signal);
  });

  it("stays inside its caps so the prompt cannot grow with the graph", () => {
    const hub = [...domainGraph.concepts].sort((a, b) => index.degree(b.id) - index.degree(a.id))[0]!;
    const hubContext = buildExplainContext(index, hub.id);
    const section = (title: string) =>
      hubContext.sections.find((s) => s.title === title)?.facts.length ?? 0;
    expect(section("Recorded relationships")).toBeLessThanOrEqual(AI_CONTEXT_LIMITS.neighbors);
    expect(section("Two hops out")).toBeLessThanOrEqual(AI_CONTEXT_LIMITS.secondHop);
    expect(section("Production evidence")).toBeLessThanOrEqual(AI_CONTEXT_LIMITS.evidence);
    expect(section("Cited sources")).toBeLessThanOrEqual(AI_CONTEXT_LIMITS.sources);
  });

  it("renders the prompt from the same sections the UI shows", () => {
    expect(context.prompt).toBe(renderContextPrompt(context.sections));
    expect(context.hash).toBe(contextHash(context.prompt));
    for (const section of context.sections) {
      expect(context.prompt).toContain(`## ${section.title}`);
      for (const item of section.facts) {
        expect(context.prompt).toContain(item.detail);
      }
    }
  });

  it("is deterministic and refuses unknown entries", () => {
    expect(buildExplainContext(index, "retry-storm").hash).toBe(context.hash);
    expect(() => buildExplainContext(index, "not-a-real-entry")).toThrow(/unknown entry/i);
  });

  it("only names concepts that exist in the graph", () => {
    for (const id of context.conceptIds) {
      expect(index.getConcept(id)).toBeDefined();
    }
  });
});

describe("diagnose context", () => {
  const diagnosis = engine.diagnose(["p99-latency-up", "pool-wait-up", "retry-rate-up"]);
  const context = buildDiagnoseContext(index, diagnosis);

  it("hands over the engine's ranking, not a request to rank", () => {
    const ranked = context.sections.find((s) => s.title.startsWith("Ranked causes"));
    expect(ranked?.note).toContain("CAUSES");
    expect(ranked?.title).toContain("not by you");
    expect(ranked?.facts[0]?.label).toBe(`#1 ${diagnosis.causes[0]!.concept.name}`);
    expect(ranked?.facts.length).toBeLessThanOrEqual(AI_CONTEXT_LIMITS.causes);
  });

  it("explains how each signal reaches the graph", () => {
    const bridge = context.sections.find((s) => s.title.startsWith("Where each signal"));
    expect(bridge?.facts.length).toBeGreaterThan(0);
    expect(bridge?.facts.every((f) => /DIRECT|SUPPORTING/.test(f.detail))).toBe(true);
  });

  it("reports signals the graph cannot place", () => {
    const withUnplaced = buildDiagnoseContext(index, engine.diagnose(["dns-slow", "p99-latency-up"]));
    expect(withUnplaced.sections.map((s) => s.title)).toContain("Reported signals");
    expect(withUnplaced.prompt).toContain("Reported signals");
  });

  it("drops empty sections instead of sending blank headings", () => {
    const empty = buildDiagnoseContext(index, engine.diagnose([]));
    expect(empty.sections).toHaveLength(0);
    expect(empty.prompt).toBe("");
    expect(empty.subtitle).toContain("No candidate cause");
  });
});

describe("research context", () => {
  const context = buildResearchContext(index, "replication lag");

  it("shows what the atlas already holds so the model cannot duplicate it", () => {
    const existing = context.sections.find((s) => s.title.startsWith("Entries the atlas"));
    expect(existing?.facts.some((f) => f.label === "Replication Lag")).toBe(true);
    expect(existing?.facts.length).toBeLessThanOrEqual(AI_CONTEXT_LIMITS.researchConcepts);
  });

  it("supplies the controlled vocabulary a proposal must use", () => {
    const vocabulary = context.sections.find((s) => s.title.startsWith("Vocabulary"));
    const detail = vocabulary?.facts.map((f) => f.detail).join(" ") ?? "";
    expect(detail).toContain("distributed");
    expect(detail).toContain("AMPLIFIES");
    expect(detail).toContain("QUERY_PLAN");
    expect(detail).toContain("RFC");
  });

  it("computes gaps from the records rather than asking the model for them", () => {
    const thin = researchGaps(index, [
      { ...index.getConcept("replication-lag")!, id: "ghost-entry", mechanism: undefined },
    ]);
    expect(thin[0]).toContain("no evidence card");
    expect(thin[0]).toContain("no mechanism written");
  });

  it("handles a topic the atlas knows nothing about", () => {
    const unknown = buildResearchContext(index, "quantum tape drives");
    expect(unknown.sections.find((s) => s.title.startsWith("Entries the atlas"))).toBeUndefined();
    expect(unknown.prompt).toContain("Vocabulary a proposal must use");
  });

  it("still finds related entries when the topic is a phrase", () => {
    // Whole-phrase search is an AND over every word, so a research topic
    // would otherwise come back empty and invite duplicate proposals.
    const phrase = buildResearchContext(
      index,
      "PostgreSQL write-ahead log and checkpoint tuning",
    );
    const existing = phrase.sections.find((s) => s.title.startsWith("Entries the atlas"));
    expect(existing?.facts.length).toBeGreaterThan(0);
    expect(existing?.facts.some((f) => f.label === "Write Amplification")).toBe(true);
    expect(existing?.facts.length).toBeLessThanOrEqual(AI_CONTEXT_LIMITS.researchConcepts);
  });
});

describe("prompts", () => {
  it("pins the explain answer to the seven required sections", () => {
    for (const heading of [
      "## Problem",
      "## Why",
      "## Mechanism",
      "## Failure trace",
      "## Trade-offs",
      "## Alternative",
      "## Production evidence",
    ]) {
      expect(EXPLAIN_INSTRUCTIONS).toContain(heading);
    }
    expect(EXPLAIN_INSTRUCTIONS).toContain("Use ONLY the graph context");
  });

  it("forbids the research pass from writing to the atlas", () => {
    expect(RESEARCH_INSTRUCTIONS).toContain("You do not write to it");
    expect(RESEARCH_INSTRUCTIONS).toContain("Never duplicate");
  });

  it("sends the question, the context and the fingerprint", () => {
    const context = buildExplainContext(index, "retry-storm", "  why does it cascade?  ");
    const message = buildUserMessage(context);
    expect(message).toContain("Question: why does it cascade?");
    expect(message).toContain(context.prompt);
    expect(message).toContain(context.hash);
  });
});
