// Deterministic incident diagnosis. Pure TypeScript: no React, no I/O, no AI.
//
// The chain is always the same and always inspectable:
//
//   symptom -> evidence card -> concept that exhibits it -> upstream causes
//
// Nothing is scored that cannot be read back as a path through the graph.
import type {
  Concept,
  Evidence,
  Incident,
  IncidentCatalog,
  Relationship,
  RelationshipType,
  Symptom,
  SymptomStrength,
} from "@/domain/schema";
import type { GraphIndex } from "@/domain/graph-index";

/** Only these two relationship types carry causation upstream. */
export const CAUSAL_TYPES: readonly RelationshipType[] = ["CAUSES", "AMPLIFIES"];

/** How far back from an observed concept the engine will walk. */
export const MAX_CAUSE_DEPTH = 4;

/** A DIRECT link means the evidence card *is* the observation. */
const STRENGTH_WEIGHT: Record<SymptomStrength, number> = { DIRECT: 1, SUPPORTING: 0.55 };

/** Contribution decays with distance: a cause four hops away explains less. */
const distanceWeight = (length: number) => 1 / (1 + length);

export type ObservedConcept = {
  concept: Concept;
  strength: SymptomStrength;
  evidence: Evidence[];
};

export type SymptomObservation = {
  symptom: Symptom;
  /** Concepts whose evidence matches this observation, strongest first. */
  observed: ObservedConcept[];
};

export type CauseStep = {
  relationship: Relationship;
  from: Concept;
  to: Concept;
};

export type CausePath = {
  symptomId: string;
  /** The concept the symptom was observed on — the end of the chain. */
  observedConceptId: string;
  strength: SymptomStrength;
  /** Causal steps from the candidate cause down to the observed concept. */
  steps: CauseStep[];
  length: number;
  contribution: number;
};

export type RankedCause = {
  concept: Concept;
  layerName: string;
  rank: number;
  /** Symptom ids this cause explains. */
  coverage: string[];
  coverageRatio: number;
  score: number;
  /** 0–1, relative to explaining every selected symptom directly. */
  confidence: number;
  paths: CausePath[];
  averageLength: number;
  /** Concepts that MITIGATE this cause. */
  mitigations: Concept[];
  /** Downstream effects not yet reported — what to expect if this is it. */
  predicted: { concept: Concept; relationship: Relationship }[];
  /** Selected symptoms this cause does not account for. */
  unexplained: string[];
};

export type NextCheck = {
  evidence: Evidence;
  concept: Concept;
  /** Candidate causes this check would support, in rank order. */
  supports: { conceptId: string; name: string; rank: number }[];
  /** Candidates it would argue against, because they do not produce it. */
  rulesOut: { conceptId: string; name: string; rank: number }[];
  /** Higher when the check separates the leading candidates cleanly. */
  separation: number;
};

export type Diagnosis = {
  symptomIds: string[];
  observations: SymptomObservation[];
  causes: RankedCause[];
  /** Selected symptoms with no evidence link into the graph. */
  unobserved: Symptom[];
  checks: NextCheck[];
};

export type IncidentReplay = {
  incident: Incident;
  diagnosis: Diagnosis;
  /** 1-based position of the documented cause in the ranking, or null. */
  rootCauseRank: number | null;
  rootCause: Concept | undefined;
  contributing: Concept[];
};

export type IncidentEngine = {
  symptoms: Symptom[];
  incidents: Incident[];
  getSymptom: (id: string) => Symptom | undefined;
  getIncident: (slug: string) => Incident | undefined;
  symptomsByLayer: () => { layerId: string; layerName: string; symptoms: Symptom[] }[];
  /** Concepts a symptom is observed on, without any causal walking. */
  observationsFor: (symptomId: string) => ObservedConcept[];
  diagnose: (symptomIds: string[]) => Diagnosis;
  replay: (incident: Incident) => IncidentReplay;
};

const byStrength = (a: ObservedConcept, b: ObservedConcept) =>
  STRENGTH_WEIGHT[b.strength] - STRENGTH_WEIGHT[a.strength] ||
  b.evidence.length - a.evidence.length ||
  a.concept.name.localeCompare(b.concept.name);

export function createIncidentEngine(
  index: GraphIndex,
  catalog: IncidentCatalog,
): IncidentEngine {
  const symptomById = new Map(catalog.symptoms.map((symptom) => [symptom.id, symptom]));
  const incidentBySlug = new Map(catalog.incidents.map((incident) => [incident.slug, incident]));
  const evidenceById = new Map(index.graph.evidence.map((card) => [card.id, card]));

  /** symptomId -> conceptId -> { strength, evidence[] } */
  const observationIndex = new Map<string, Map<string, ObservedConcept>>();
  /** evidenceId -> symptomIds that claim it */
  const symptomsByEvidence = new Map<string, string[]>();

  for (const link of catalog.symptomEvidence) {
    const card = evidenceById.get(link.evidenceId);
    if (!card) continue;
    const concept = index.getConcept(card.conceptId);
    if (!concept) continue;

    const existing = symptomsByEvidence.get(card.id);
    if (existing) existing.push(link.symptomId);
    else symptomsByEvidence.set(card.id, [link.symptomId]);

    let perConcept = observationIndex.get(link.symptomId);
    if (!perConcept) {
      perConcept = new Map();
      observationIndex.set(link.symptomId, perConcept);
    }
    const current = perConcept.get(concept.id);
    if (current) {
      current.evidence.push(card);
      if (link.strength === "DIRECT") current.strength = "DIRECT";
    } else {
      perConcept.set(concept.id, { concept, strength: link.strength, evidence: [card] });
    }
  }

  /** targetId -> incoming causal relationships (edges that point at it). */
  const upstream = new Map<string, Relationship[]>();
  /** sourceId -> outgoing causal relationships. */
  const downstream = new Map<string, Relationship[]>();
  for (const relationship of index.graph.relationships) {
    if (!CAUSAL_TYPES.includes(relationship.type)) continue;
    const up = upstream.get(relationship.targetId);
    if (up) up.push(relationship);
    else upstream.set(relationship.targetId, [relationship]);
    const down = downstream.get(relationship.sourceId);
    if (down) down.push(relationship);
    else downstream.set(relationship.sourceId, [relationship]);
  }

  const observationsFor = (symptomId: string): ObservedConcept[] =>
    [...(observationIndex.get(symptomId)?.values() ?? [])].sort(byStrength);

  /**
   * Walk backwards along CAUSES/AMPLIFIES from one observed concept, keeping
   * the shortest chain to every concept that could have produced it.
   */
  function walkUpstream(observed: ObservedConcept, symptomId: string): Map<string, CausePath> {
    const paths = new Map<string, CausePath>();
    const base: CausePath = {
      symptomId,
      observedConceptId: observed.concept.id,
      strength: observed.strength,
      steps: [],
      length: 0,
      contribution: STRENGTH_WEIGHT[observed.strength],
    };
    paths.set(observed.concept.id, base);

    let frontier: CausePath[] = [base];
    for (let depth = 1; depth <= MAX_CAUSE_DEPTH && frontier.length > 0; depth += 1) {
      const next: CausePath[] = [];
      for (const path of frontier) {
        const head = path.steps[0]?.from.id ?? observed.concept.id;
        for (const relationship of upstream.get(head) ?? []) {
          if (paths.has(relationship.sourceId)) continue;
          const from = index.getConcept(relationship.sourceId);
          const to = index.getConcept(relationship.targetId);
          if (!from || !to) continue;
          const extended: CausePath = {
            symptomId,
            observedConceptId: observed.concept.id,
            strength: observed.strength,
            steps: [{ relationship, from, to }, ...path.steps],
            length: depth,
            contribution: STRENGTH_WEIGHT[observed.strength] * distanceWeight(depth),
          };
          paths.set(relationship.sourceId, extended);
          next.push(extended);
        }
      }
      frontier = next;
    }
    return paths;
  }

  function diagnose(selected: string[]): Diagnosis {
    const symptomIds = [...new Set(selected)].filter((id) => symptomById.has(id));
    const observations: SymptomObservation[] = [];
    const unobserved: Symptom[] = [];

    for (const id of symptomIds) {
      const symptom = symptomById.get(id)!;
      const observed = observationsFor(id);
      if (observed.length === 0) unobserved.push(symptom);
      observations.push({ symptom, observed });
    }

    /** conceptId -> symptomId -> best path */
    const candidates = new Map<string, Map<string, CausePath>>();
    for (const { symptom, observed } of observations) {
      for (const entry of observed) {
        for (const [conceptId, path] of walkUpstream(entry, symptom.id)) {
          let perSymptom = candidates.get(conceptId);
          if (!perSymptom) {
            perSymptom = new Map();
            candidates.set(conceptId, perSymptom);
          }
          const best = perSymptom.get(symptom.id);
          if (
            !best ||
            path.contribution > best.contribution ||
            (path.contribution === best.contribution && path.length < best.length)
          ) {
            perSymptom.set(symptom.id, path);
          }
        }
      }
    }

    const explained = symptomIds.filter((id) => (observationIndex.get(id)?.size ?? 0) > 0);
    const scored = [...candidates.entries()].flatMap(([conceptId, perSymptom]) => {
      const concept = index.getConcept(conceptId);
      if (!concept) return [];
      const paths = [...perSymptom.values()].sort(
        (a, b) => b.contribution - a.contribution || a.length - b.length,
      );
      const score = paths.reduce((total, path) => total + path.contribution, 0);
      const coverage = paths.map((path) => path.symptomId);
      const averageLength =
        paths.length === 0 ? 0 : paths.reduce((total, p) => total + p.length, 0) / paths.length;
      return [{ concept, paths, score, coverage, averageLength }];
    });

    scored.sort(
      (a, b) =>
        b.coverage.length - a.coverage.length ||
        b.score - a.score ||
        a.averageLength - b.averageLength ||
        a.concept.name.localeCompare(b.concept.name),
    );

    const observedConceptIds = new Set(
      observations.flatMap(({ observed }) => observed.map((entry) => entry.concept.id)),
    );

    const causes: RankedCause[] = scored.map((entry, position) => {
      const covered = new Set(entry.coverage);
      return {
        concept: entry.concept,
        layerName: index.layerName(entry.concept.layerId),
        rank: position + 1,
        coverage: entry.coverage,
        coverageRatio: explained.length === 0 ? 0 : covered.size / explained.length,
        score: Number(entry.score.toFixed(4)),
        confidence:
          explained.length === 0 ? 0 : Math.min(1, Number((entry.score / explained.length).toFixed(4))),
        paths: entry.paths,
        averageLength: Number(entry.averageLength.toFixed(2)),
        mitigations: index
          .neighbors(entry.concept.id)
          .filter((n) => n.rel.type === "MITIGATES" && n.rel.targetId === entry.concept.id)
          .map((n) => n.other),
        predicted: (downstream.get(entry.concept.id) ?? []).flatMap((relationship) => {
          if (observedConceptIds.has(relationship.targetId)) return [];
          const concept = index.getConcept(relationship.targetId);
          return concept ? [{ concept, relationship }] : [];
        }),
        unexplained: explained.filter((id) => !covered.has(id)),
      };
    });

    return {
      symptomIds,
      observations,
      causes,
      unobserved,
      checks: buildChecks(causes, symptomIds),
    };
  }

  /**
   * The next signal worth reading: evidence that belongs to a leading
   * candidate, is not already implied by a reported symptom, and separates the
   * candidates rather than confirming all of them.
   */
  function buildChecks(causes: RankedCause[], symptomIds: string[]): NextCheck[] {
    const top = causes.slice(0, 5);
    if (top.length < 2) return [];
    const selected = new Set(symptomIds);
    const checks = new Map<string, NextCheck>();

    for (const cause of top) {
      for (const card of index.evidenceFor(cause.concept.id)) {
        const claimedBy = symptomsByEvidence.get(card.id) ?? [];
        if (claimedBy.some((symptomId) => selected.has(symptomId))) continue;
        const existing = checks.get(card.id);
        if (existing) {
          existing.supports.push({
            conceptId: cause.concept.id,
            name: cause.concept.name,
            rank: cause.rank,
          });
          continue;
        }
        checks.set(card.id, {
          evidence: card,
          concept: cause.concept,
          supports: [{ conceptId: cause.concept.id, name: cause.concept.name, rank: cause.rank }],
          rulesOut: [],
          separation: 0,
        });
      }
    }

    const ranked = [...checks.values()].map((check) => {
      const supporting = new Set(check.supports.map((s) => s.conceptId));
      const rulesOut = top
        .filter((cause) => !supporting.has(cause.concept.id))
        .map((cause) => ({ conceptId: cause.concept.id, name: cause.concept.name, rank: cause.rank }));
      const bestRank = Math.min(...check.supports.map((s) => s.rank));
      return {
        ...check,
        rulesOut,
        // Separates best when it belongs to one leading candidate only.
        separation: Number(((rulesOut.length / top.length) * distanceWeight(bestRank - 1)).toFixed(4)),
      };
    });

    ranked.sort(
      (a, b) =>
        b.separation - a.separation ||
        Math.min(...a.supports.map((s) => s.rank)) - Math.min(...b.supports.map((s) => s.rank)) ||
        a.evidence.signal.localeCompare(b.evidence.signal),
    );
    return ranked.slice(0, 6);
  }

  return {
    symptoms: catalog.symptoms,
    incidents: catalog.incidents,
    getSymptom: (id) => symptomById.get(id),
    getIncident: (slug) => incidentBySlug.get(slug),
    symptomsByLayer: () =>
      index.graph.layers
        .map((layer) => ({
          layerId: layer.id,
          layerName: layer.name,
          symptoms: catalog.symptoms.filter((symptom) => symptom.layerId === layer.id),
        }))
        .filter((group) => group.symptoms.length > 0),
    observationsFor,
    diagnose,
    replay: (incident) => {
      const diagnosis = diagnose(incident.symptomIds);
      const position = diagnosis.causes.findIndex(
        (cause) => cause.concept.id === incident.rootCauseId,
      );
      return {
        incident,
        diagnosis,
        rootCauseRank: position === -1 ? null : position + 1,
        rootCause: index.getConcept(incident.rootCauseId),
        contributing: incident.contributingIds.flatMap((id) => {
          const concept = index.getConcept(id);
          return concept ? [concept] : [];
        }),
      };
    },
  };
}

/** "Lock contention causes connection pool exhaustion, which causes …" */
export function pathSentence(path: CausePath): string {
  if (path.steps.length === 0) return "observed directly on this concept";
  const verbs: Record<string, string> = { CAUSES: "causes", AMPLIFIES: "amplifies" };
  const first = path.steps[0]!;
  let sentence = `${first.from.name} ${verbs[first.relationship.type] ?? "affects"} ${first.to.name}`;
  for (const step of path.steps.slice(1)) {
    sentence += `, which ${verbs[step.relationship.type] ?? "affects"} ${step.to.name}`;
  }
  return sentence;
}

/** Plain-language confidence band, used for labels only. */
export function confidenceLabel(confidence: number): "Strong" | "Plausible" | "Weak" {
  if (confidence >= 0.6) return "Strong";
  if (confidence >= 0.3) return "Plausible";
  return "Weak";
}
