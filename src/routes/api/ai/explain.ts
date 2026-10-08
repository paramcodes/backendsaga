import { createFileRoute } from "@tanstack/react-router";

/**
 * Streams an explanation of one entry. The body carries an entry id and an
 * optional question — never facts: the graph context is assembled on the
 * server so the answer can only speak about records the atlas really holds.
 */
export const Route = createFileRoute("/api/ai/explain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleExplain } = await import("@/lib/ai/atlas-ai.server");
        return handleExplain(request);
      },
    },
  },
});
