// Server functions for the AI layer's non-streaming work: the context preview
// a reader can inspect before spending a credit, and the research proposal
// queue. The streaming answers go through the routes in src/routes/api/ai.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { AtlasContext } from "@/lib/ai-context";
import type { ResearchProposalRecord } from "@/lib/ai-proposal";

const contextInput = z.union([
  z.object({
    kind: z.literal("explain"),
    conceptId: z.string().min(1).max(80),
    question: z.string().max(400).nullish(),
  }),
  z.object({
    kind: z.literal("diagnose"),
    symptomIds: z.array(z.string().min(1).max(80)).min(1).max(12),
    question: z.string().max(400).nullish(),
  }),
  z.object({
    kind: z.literal("research"),
    topic: z.string().min(2).max(160),
  }),
]);

/** What the model would be told, without calling the model. */
export const getAiContext = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => contextInput.parse(data))
  .handler(async ({ data }): Promise<AtlasContext> => {
    const { loadAiContext } = await import("@/lib/ai/atlas-ai.server");
    return loadAiContext(
      data.kind === "research" ? data : { ...data, question: data.question ?? null },
    );
  });

export const listResearchProposals = createServerFn({ method: "GET" }).handler(
  async (): Promise<ResearchProposalRecord[]> => {
    const { listProposals } = await import("@/lib/ai/atlas-ai.server");
    return listProposals();
  },
);

const decisionInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["accepted", "rejected"]),
  note: z.string().max(400).nullish(),
});

/**
 * Records a reviewer's decision. Accepting never writes to the graph — the
 * curated seed stays the only way knowledge enters the atlas.
 */
export const decideResearchProposal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => decisionInput.parse(data))
  .handler(async ({ data }): Promise<ResearchProposalRecord> => {
    const { decideProposal } = await import("@/lib/ai/atlas-ai.server");
    return decideProposal({ id: data.id, status: data.status, note: data.note ?? null });
  });
