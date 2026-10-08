import { describe, expect, it } from "vitest";
import { domainGraph } from "@/domain";

import {
  EMPTY_PROPOSAL,
  isEmptyProposal,
  proposalToSeedPatch,
  researchProposalSchema,
  reviewProposal,
  slugify,
  type AtlasVocabulary,
  type ResearchProposal,
} from "./ai-proposal";

const atlas: AtlasVocabulary = {
  conceptIds: new Set(domainGraph.concepts.map((c) => c.id)),
  layerIds: new Set(domainGraph.layers.map((l) => l.id)),
  sourceIds: new Set(domainGraph.sources.map((s) => s.id)),
  evidenceIds: new Set(domainGraph.evidence.map((e) => e.id)),
  relationshipKeys: new Set(
    domainGraph.relationships.map((r) => `${r.sourceId}|${r.type}|${r.targetId}`),
  ),
};

const proposal = (overrides: Partial<ResearchProposal> = {}): ResearchProposal => ({
  ...EMPTY_PROPOSAL,
  summary: "WAL write amplification is not covered.",
  ...overrides,
});

const concept = (slug: string, layerId = "data") => ({
  slug,
  name: slug.replace(/-/g, " "),
  layerId,
  description: "A description.",
  problem: null,
  mechanism: null,
  tradeoffs: null,
  betterAlternative: null,
  rationale: "Missing from the data layer.",
});

describe("proposal schema", () => {
  it("keeps optional fields nullable rather than absent, as strict schemas require", () => {
    const parsed = researchProposalSchema.parse({
      ...EMPTY_PROPOSAL,
      summary: "x",
      concepts: [concept("wal-write-amplification")],
    });
    expect(parsed.concepts[0]!.problem).toBeNull();
    expect(() =>
      researchProposalSchema.parse({ ...EMPTY_PROPOSAL, relationships: [{ sourceId: "a", type: "CAUSES_MAYBE", targetId: "b", rationale: "" }] }),
    ).toThrow();
  });
});

describe("review", () => {
  it("drops entries the atlas already has", () => {
    const { proposal: reviewed, issues } = reviewProposal(
      proposal({ concepts: [concept("retry-storm", "api")] }),
      atlas,
    );
    expect(reviewed.concepts).toHaveLength(0);
    expect(issues[0]!.problem).toContain("already has");
  });

  it("drops entries filed under a layer that does not exist", () => {
    const { issues } = reviewProposal(
      proposal({ concepts: [concept("wal-amplification", "storage-engine")] }),
      atlas,
    );
    expect(issues[0]!.problem).toContain("unknown layer");
  });

  it("accepts a relationship between an existing entry and a newly proposed one", () => {
    const { proposal: reviewed, issues } = reviewProposal(
      proposal({
        concepts: [concept("wal-write-amplification")],
        relationships: [
          {
            sourceId: "wal-write-amplification",
            type: "CAUSES",
            targetId: "page-cache-thrashing",
            rationale: "More bytes per commit saturate the device queue.",
          },
        ],
      }),
      atlas,
    );
    expect(issues).toEqual([]);
    expect(reviewed.relationships).toHaveLength(1);
  });

  it("refuses dangling endpoints, self-loops and duplicates", () => {
    const existing = domainGraph.relationships[0]!;
    const { proposal: reviewed, issues } = reviewProposal(
      proposal({
        relationships: [
          { sourceId: "made-up", type: "CAUSES", targetId: "retry-storm", rationale: "" },
          { sourceId: "retry-storm", type: "CAUSES", targetId: "retry-storm", rationale: "" },
          {
            sourceId: existing.sourceId,
            type: existing.type,
            targetId: existing.targetId,
            rationale: "",
          },
        ],
      }),
      atlas,
    );
    expect(reviewed.relationships).toHaveLength(0);
    expect(issues.map((issue) => issue.problem)).toEqual([
      expect.stringContaining("not an entry"),
      expect.stringContaining("cannot relate to itself"),
      expect.stringContaining("already recorded"),
    ]);
  });

  it("requires a checkable URL on every source", () => {
    const { proposal: reviewed, issues } = reviewProposal(
      proposal({
        sources: [
          {
            id: "wal-internals",
            kind: "DOCS",
            title: "WAL Internals",
            author: "PostgreSQL",
            year: 2024,
            url: "ask the model",
            note: "n/a",
            citesConceptId: "replication-lag",
          },
        ],
      }),
      atlas,
    );
    expect(reviewed.sources).toHaveLength(0);
    expect(issues[0]!.problem).toContain("checkable URL");
  });

  it("clamps an over-eager answer to the review budget", () => {
    const many = Array.from({ length: 9 }, (_, i) => concept(`new-entry-${i}`));
    const { proposal: reviewed, issues } = reviewProposal(proposal({ concepts: many }), atlas);
    expect(reviewed.concepts).toHaveLength(4);
    expect(issues.filter((issue) => issue.problem.includes("limit"))).toHaveLength(5);
  });

  it("treats an empty answer as a valid outcome", () => {
    const { proposal: reviewed, issues } = reviewProposal(proposal(), atlas);
    expect(issues).toEqual([]);
    expect(isEmptyProposal(reviewed)).toBe(true);
  });
});

describe("seed patch", () => {
  it("writes code for the curated seed rather than touching the database", () => {
    const { proposal: reviewed } = reviewProposal(
      proposal({
        concepts: [concept("wal-write-amplification")],
        relationships: [
          {
            sourceId: "wal-write-amplification",
            type: "CAUSES",
            targetId: "page-cache-thrashing",
            rationale: "",
          },
        ],
        evidence: [
          {
            conceptId: "wal-write-amplification",
            kind: "METRIC",
            trend: "UP",
            signal: "pg_stat_wal.wal_bytes",
            whatYouSee: "WAL bytes per commit climbing.",
            whereToLook: "pg_stat_wal",
            whyItMatters: "Every extra byte is a write the device must absorb.",
            falsePositive: null,
          },
        ],
        sources: [
          {
            id: "pg-wal-internals",
            kind: "DOCS",
            title: "Write Ahead Logging",
            author: "PostgreSQL Global Development Group",
            year: 2024,
            url: "https://www.postgresql.org/docs/current/wal-intro.html",
            note: "The reference description of WAL.",
            citesConceptId: "wal-write-amplification",
          },
        ],
      }),
      atlas,
    );

    const patch = proposalToSeedPatch(reviewed);
    expect(patch).toContain("src/domain/seed/concepts.ts");
    expect(patch).toContain('c("wal-write-amplification", "wal write amplification", "data",');
    expect(patch).toContain('r("wal-write-amplification", "CAUSES", "page-cache-thrashing"),');
    expect(patch).toContain('"METRIC", "UP"');
    expect(patch).toContain('l("wal-write-amplification", "pg-wal-internals"');
    expect(patch).toContain("bun scripts/seed-database.ts");
  });

  it("says so when there is nothing to apply", () => {
    expect(proposalToSeedPatch(EMPTY_PROPOSAL)).toContain("Nothing to apply");
  });
});

describe("slugify", () => {
  it("turns a title into a kebab-case id", () => {
    expect(slugify("WAL Write Amplification!")).toBe("wal-write-amplification");
  });
});
