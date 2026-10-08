// Presentation model for incidents and diagnoses. Pure TypeScript: no React,
// no I/O. The engine decides what is true; this file decides how it reads.
import type { Concept, RelationshipType, Severity, Symptom, SymptomStrength } from "@/domain";
import type { Diagnosis, RankedCause } from "@/lib/incident-engine";

export const SEVERITY_META: Record<
  Severity,
  { label: string; blurb: string; className: string }
> = {
  SEV1: {
    label: "Sev 1",
    blurb: "Customer-visible outage; everyone is awake.",
    className: "severity-sev1",
  },
  SEV2: {
    label: "Sev 2",
    blurb: "Serious degradation; the business feels it.",
    className: "severity-sev2",
  },
  SEV3: {
    label: "Sev 3",
    blurb: "Contained problem; fixed inside business hours.",
    className: "severity-sev3",
  },
  SEV4: {
    label: "Sev 4",
    blurb: "Annoyance worth recording, not worth paging.",
    className: "severity-sev4",
  },
};

export const SEVERITY_ORDER: Severity[] = ["SEV1", "SEV2", "SEV3", "SEV4"];

export const STRENGTH_META: Record<SymptomStrength, { label: string; blurb: string }> = {
  DIRECT: {
    label: "Direct",
    blurb: "This signal is the observation — reading it is reading the symptom.",
  },
  SUPPORTING: {
    label: "Supporting",
    blurb: "Consistent with the observation, but other causes produce it too.",
  },
};

/** The roles a concept can play inside one cause chain. */
export type ChainRole = "cause" | "link" | "observed";

export type ChainNode =
  | { kind: "concept"; id: string; concept: Concept; role: ChainRole }
  | { kind: "symptom"; id: string; symptom: Symptom };

export type ChainEdge =
  | { kind: "causal"; id: string; source: string; target: string; type: RelationshipType }
  | { kind: "observation"; id: string; source: string; target: string; strength: SymptomStrength };

export type CauseChain = { nodes: ChainNode[]; edges: ChainEdge[] };

const SYMPTOM_PREFIX = "symptom:";

export const symptomNodeId = (symptomId: string): string => `${SYMPTOM_PREFIX}${symptomId}`;
export const isSymptomNodeId = (id: string): boolean => id.startsWith(SYMPTOM_PREFIX);

/**
 * The story of one candidate: cause → intermediate concepts → the concept the
 * signal was read on → the observation itself. Every edge on the canvas is a
 * row in the database, never an inference.
 */
export function buildCauseChain(cause: RankedCause, diagnosis: Diagnosis): CauseChain {
  const symptomById = new Map(
    diagnosis.observations.map(({ symptom }) => [symptom.id, symptom] as const),
  );
  const nodes = new Map<string, ChainNode>();
  const edges = new Map<string, ChainEdge>();

  const addConcept = (concept: Concept, role: ChainRole) => {
    const existing = nodes.get(concept.id);
    if (existing && existing.kind === "concept") {
      // "cause" and "observed" outrank the plain "link" role.
      if (existing.role === "link" && role !== "link") existing.role = role;
      return;
    }
    nodes.set(concept.id, { kind: "concept", id: concept.id, concept, role });
  };

  addConcept(cause.concept, "cause");

  for (const path of cause.paths) {
    for (const step of path.steps) {
      addConcept(step.from, step.from.id === cause.concept.id ? "cause" : "link");
      addConcept(step.to, step.to.id === path.observedConceptId ? "observed" : "link");
      edges.set(step.relationship.id, {
        kind: "causal",
        id: step.relationship.id,
        source: step.from.id,
        target: step.to.id,
        type: step.relationship.type,
      });
    }
    if (path.steps.length === 0) addConcept(cause.concept, "observed");

    const symptom = symptomById.get(path.symptomId);
    if (!symptom) continue;
    const nodeId = symptomNodeId(symptom.id);
    nodes.set(nodeId, { kind: "symptom", id: nodeId, symptom });
    edges.set(`obs:${path.observedConceptId}:${symptom.id}`, {
      kind: "observation",
      id: `obs:${path.observedConceptId}:${symptom.id}`,
      source: path.observedConceptId,
      target: nodeId,
      strength: path.strength,
    });
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** "Explains 3 of 4 observations" — the honest headline for a candidate. */
export function coverageSummary(cause: RankedCause, diagnosis: Diagnosis): string {
  const total = diagnosis.observations.filter(({ observed }) => observed.length > 0).length;
  const explained = new Set(cause.coverage).size;
  return `Explains ${explained} of ${total} observation${total === 1 ? "" : "s"}`;
}

export const confidencePercent = (confidence: number): number =>
  Math.max(0, Math.min(100, Math.round(confidence * 100)));

/** "DB latency up · db.query.p99" reads better than a bare id anywhere. */
export const symptomLine = (symptom: Symptom): string => `${symptom.name} · ${symptom.signal}`;

/**
 * Groups symptoms the way an engineer scans a dashboard: by the layer the
 * signal is read on, in the atlas' own layer order.
 */
export function groupSymptomsByLayer(
  symptoms: Symptom[],
  layers: { id: string; name: string }[],
): { layerId: string; layerName: string; symptoms: Symptom[] }[] {
  return layers
    .map((layer) => ({
      layerId: layer.id,
      layerName: layer.name,
      symptoms: symptoms
        .filter((symptom) => symptom.layerId === layer.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((group) => group.symptoms.length > 0);
}

/** URL state for triage is a stable, shareable list of symptom ids. */
export const encodeSymptoms = (ids: string[]): string | undefined =>
  ids.length > 0 ? [...ids].sort().join(",") : undefined;

export const decodeSymptoms = (raw: string | undefined, allowed: Set<string>): string[] =>
  (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && allowed.has(value));
