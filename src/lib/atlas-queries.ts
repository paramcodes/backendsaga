// Query options for the reads that happen *after* a page is on screen:
// evidence for the concept selected in the graph, the second-order
// neighbourhood of an entry, and search-as-you-type.
//
// Page-critical data is loaded by route loaders instead (see the route files),
// so the server-rendered HTML always arrives complete.
import { queryOptions } from "@tanstack/react-query";

import { getConceptEvidence, getConceptNeighbors, searchAtlas } from "@/lib/atlas.functions";

/** The atlas is edited by deploying, not by users: cache aggressively. */
const STALE = 10 * 60 * 1000;

export const conceptEvidenceQuery = (conceptId: string) =>
  queryOptions({
    queryKey: ["atlas", "evidence", conceptId],
    queryFn: () => getConceptEvidence({ data: { conceptId } }),
    staleTime: STALE,
  });

export const conceptNeighborsQuery = (conceptId: string, depth = 2) =>
  queryOptions({
    queryKey: ["atlas", "neighbors", conceptId, depth],
    queryFn: () => getConceptNeighbors({ data: { conceptId, depth } }),
    staleTime: STALE,
  });

export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ["atlas", "search", q],
    queryFn: () => searchAtlas({ data: { q } }),
    staleTime: STALE,
  });
