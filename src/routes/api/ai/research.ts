import { createFileRoute } from "@tanstack/react-router";

/**
 * Researches a topic against the atlas and records a pending proposal. It
 * returns structured data rather than prose, and writes only to the proposal
 * queue — the knowledge tables stay read-only.
 */
export const Route = createFileRoute("/api/ai/research")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleResearch } = await import("@/lib/ai/atlas-ai.server");
        return handleResearch(request);
      },
    },
  },
});
