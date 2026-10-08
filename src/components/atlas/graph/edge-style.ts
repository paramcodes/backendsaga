import type { RelationshipType } from "@/domain";

/** Line treatment per relationship type. Colours live in styles.css. */
export const edgeAppearance: Record<RelationshipType, { className: string; dash?: string }> = {
  CAUSES: { className: "graph-edge graph-edge-causes" },
  AMPLIFIES: { className: "graph-edge graph-edge-amplifies", dash: "7 5" },
  MITIGATES: { className: "graph-edge graph-edge-mitigates", dash: "3 5" },
  DEPENDS_ON: { className: "graph-edge graph-edge-depends", dash: "10 4" },
  TRADEOFF_OF: { className: "graph-edge graph-edge-tradeoff", dash: "2 4" },
  ALTERNATIVE_TO: { className: "graph-edge graph-edge-alternative", dash: "12 5 3 5" },
  OBSERVED_BY: { className: "graph-edge graph-edge-observed", dash: "2 5" },
  REQUIRES: { className: "graph-edge graph-edge-requires" },
};
