import { createFileRoute } from "@tanstack/react-router";

/**
 * Streams a second opinion on a set of ticked signals. The ranking itself is
 * the deterministic engine's; the model only writes it up, from the chains the
 * engine produced.
 */
export const Route = createFileRoute("/api/ai/diagnose")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleDiagnose } = await import("@/lib/ai/atlas-ai.server");
        return handleDiagnose(request);
      },
    },
  },
});
