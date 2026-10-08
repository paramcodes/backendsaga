import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

  it.each([
    ["/", "/"],
    ["/graph", "/graph"],
    ["/evidence", "/evidence"],
    ["/library", "/library"],
    ["/research", "/research"],
    ["/search", "/search"],
    ["/triage", "/triage"],
    ["/incidents", "/incidents/"],
    ["/incidents/checkout-lock-storm", "/incidents/$slug"],
    ["/concepts/gc-pause", "/concepts/$slug"],
  ])("matches %s", (path, routeId) => {
    const last = router.matchRoutes(path).at(-1);
    expect(last?.routeId).not.toBe(rootRouteId);
    expect(last?.routeId).toBe(routeId);
  });
});
