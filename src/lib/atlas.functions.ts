// The read API over the atlas database.
//
// Every screen reads the graph through these server functions; nothing in the
// UI talks to the database directly. The curated TypeScript seed in
// src/domain/seed stays the authoring surface (see scripts/seed-database.ts),
// and these functions serve the copy of it that lives in PostgreSQL.
import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type {
  Concept,
  DomainGraph,
  Evidence,
  Incident,
  Layer,
  Relationship,
  Source,
  Symptom,
  SymptomEvidence,
} from "@/domain";
import type { Database } from "@/integrations/supabase/types";
import { rankConcepts } from "@/lib/graph-explore";
import {
  toAtlasStats,
  toConcept,
  toConceptSource,
  toDomainGraph,
  toEvidence,
  toIncident,
  toLayer,
  toRelationship,
  toSource,
  toSymptom,
  toSymptomEvidence,
  type AtlasStats,
} from "@/lib/atlas-rows";

/**
 * Public, read-only Data API client. The knowledge tables grant SELECT to
 * `anon` and have no write policy, so the publishable key is the right level
 * of privilege here — never the service role.
 */
function db(): SupabaseClient<Database> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    throw new Error("The atlas database is not configured (missing backend credentials).");
  }
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Could not load ${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`Could not load ${what}: no rows returned`);
  return result.data;
}

/** Like `unwrap`, but "no such row" is a legitimate answer rather than a failure. */
function unwrapMaybe<T>(
  result: { data: T | null; error: { message: string } | null },
  what: string,
): T | null {
  if (result.error) throw new Error(`Could not load ${what}: ${result.error.message}`);
  return result.data;
}

// ---------------------------------------------------------------- payloads

/** The graph canvas needs structure, not prose attachments. */
export type AtlasGraphPayload = {
  layers: Layer[];
  concepts: Concept[];
  relationships: Relationship[];
};

export type ConceptNeighbor = { relationship: Relationship; concept: Concept; outgoing: boolean };
export type ConceptSourceRef = { source: Source; relevance: string };

export type ConceptDetailPayload = {
  concept: Concept;
  layer: Layer;
  neighbors: ConceptNeighbor[];
  evidence: Evidence[];
  sources: ConceptSourceRef[];
};

export type NeighborhoodEntry = { concept: Concept; layerName: string; hops: number };

export type EvidenceIndexPayload = {
  layers: Layer[];
  concepts: Concept[];
  evidence: Evidence[];
};

export type LibraryEntry = {
  source: Source;
  concepts: { concept: Concept; relevance: string }[];
};

export type AtlasOverviewPayload = {
  layers: Layer[];
  concepts: Concept[];
  stats: AtlasStats;
};

export type SearchResultEntry = {
  concept: Concept;
  layerName: string;
  matchedOn: string;
};

// --------------------------------------------------------------- functions

/** Layers only — the sidebar and the layer legend. */
export const getLayers = createServerFn({ method: "GET" }).handler(async (): Promise<Layer[]> => {
  const rows = unwrap(await db().from("layers").select("*").order("sort_order"), "the layers");
  return rows.map(toLayer);
});

/** Dashboard: counts straight from SQL plus the full entry list. */
export const getAtlasOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<AtlasOverviewPayload> => {
    const client = db();
    const [layerRows, conceptRows, statsJson] = await Promise.all([
      client.from("layers").select("*").order("sort_order").then((r) => unwrap(r, "the layers")),
      client.from("concepts").select("*").order("name").then((r) => unwrap(r, "the concepts")),
      client.rpc("atlas_stats").then((r) => unwrap(r, "the atlas statistics")),
    ]);
    return {
      layers: layerRows.map(toLayer),
      concepts: conceptRows.map(toConcept),
      stats: toAtlasStats(statsJson),
    };
  },
);

/** The whole structure of the graph, for the canvas. */
export const getAtlasGraph = createServerFn({ method: "GET" }).handler(
  async (): Promise<AtlasGraphPayload> => {
    const client = db();
    const [layerRows, conceptRows, relationshipRows] = await Promise.all([
      client.from("layers").select("*").order("sort_order").then((r) => unwrap(r, "the layers")),
      client.from("concepts").select("*").order("name").then((r) => unwrap(r, "the concepts")),
      client
        .from("relationships")
        .select("*")
        .order("id")
        .then((r) => unwrap(r, "the relationships")),
    ]);
    const graph: DomainGraph = toDomainGraph({
      layers: layerRows,
      concepts: conceptRows,
      relationships: relationshipRows,
    });
    return { layers: graph.layers, concepts: graph.concepts, relationships: graph.relationships };
  },
);

const slugInput = z.object({ slug: z.string().min(1).max(80) });

/** Everything one entry page needs, in a single round trip. */
export const getConceptDetail = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => slugInput.parse(data))
  .handler(async ({ data }): Promise<ConceptDetailPayload | null> => {
    const client = db();
    const conceptRow = unwrapMaybe(
      await client.from("concepts").select("*").eq("slug", data.slug).maybeSingle(),
      `the entry “${data.slug}”`,
    ) as Database["public"]["Tables"]["concepts"]["Row"] | null;
    if (!conceptRow) return null;

    const concept = toConcept(conceptRow);

    const [layerRow, relationshipRows, evidenceRows, linkRows] = await Promise.all([
      client
        .from("layers")
        .select("*")
        .eq("id", concept.layerId)
        .single()
        .then((r) => unwrap(r, "the layer")),
      client
        .from("relationships")
        .select("*")
        .or(`source_id.eq.${concept.id},target_id.eq.${concept.id}`)
        .then((r) => unwrap(r, "the relationships")),
      client
        .from("evidence")
        .select("*")
        .eq("concept_id", concept.id)
        .order("kind")
        .then((r) => unwrap(r, "the evidence")),
      client
        .from("concept_sources")
        .select("*, sources(*)")
        .eq("concept_id", concept.id)
        .then((r) => unwrap(r, "the sources")),
    ]);

    const relationships = relationshipRows.map(toRelationship);
    const otherIds = [
      ...new Set(
        relationships.map((rel) => (rel.sourceId === concept.id ? rel.targetId : rel.sourceId)),
      ),
    ];
    const neighborRows = otherIds.length
      ? unwrap(
          await client.from("concepts").select("*").in("id", otherIds),
          "the related entries",
        )
      : [];
    const byId = new Map(neighborRows.map((row) => [row.id, toConcept(row)]));

    const neighbors: ConceptNeighbor[] = relationships.flatMap((relationship) => {
      const outgoing = relationship.sourceId === concept.id;
      const other = byId.get(outgoing ? relationship.targetId : relationship.sourceId);
      return other ? [{ relationship, concept: other, outgoing }] : [];
    });

    const sources: ConceptSourceRef[] = linkRows.flatMap((row) => {
      const joined = (row as { sources: Database["public"]["Tables"]["sources"]["Row"] | null })
        .sources;
      if (!joined) return [];
      return [{ source: toSource(joined), relevance: toConceptSource(row).relevance }];
    });
    sources.sort((a, b) => a.source.title.localeCompare(b.source.title));

    return {
      concept,
      layer: toLayer(layerRow),
      neighbors,
      evidence: evidenceRows.map(toEvidence),
      sources,
    };
  });

const neighborsInput = z.object({
  conceptId: z.string().min(1).max(80),
  depth: z.number().int().min(1).max(3).optional(),
});

/**
 * Walks the graph in the database with a recursive CTE and returns everything
 * within `depth` hops, nearest first. The traversal belongs in SQL: it is a
 * reachability question about rows, not a rendering concern.
 */
export const getConceptNeighbors = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => neighborsInput.parse(data))
  .handler(async ({ data }): Promise<NeighborhoodEntry[]> => {
    const client = db();
    const hopRows = unwrap(
      await client.rpc("concept_neighborhood", {
        p_concept_id: data.conceptId,
        p_depth: data.depth ?? 2,
      }),
      "the neighbourhood",
    );
    const hopsById = new Map(hopRows.map((row) => [row.concept_id, row.hops]));
    const ids = [...hopsById.keys()].filter((id) => id !== data.conceptId);
    if (ids.length === 0) return [];

    const [conceptRows, layerRows] = await Promise.all([
      client
        .from("concepts")
        .select("*")
        .in("id", ids)
        .then((r) => unwrap(r, "the neighbouring entries")),
      client.from("layers").select("*").then((r) => unwrap(r, "the layers")),
    ]);
    const layerNames = new Map(layerRows.map((row) => [row.id, row.name]));

    return conceptRows
      .map((row) => {
        const concept = toConcept(row);
        return {
          concept,
          layerName: layerNames.get(concept.layerId) ?? concept.layerId,
          hops: hopsById.get(concept.id) ?? 99,
        };
      })
      .sort((a, b) => a.hops - b.hops || a.concept.name.localeCompare(b.concept.name));
  });

const conceptIdInput = z.object({ conceptId: z.string().min(1).max(80) });

/** Evidence for one entry — loaded on demand by the graph detail panel. */
export const getConceptEvidence = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => conceptIdInput.parse(data))
  .handler(async ({ data }): Promise<Evidence[]> => {
    const rows = unwrap(
      await db().from("evidence").select("*").eq("concept_id", data.conceptId).order("kind"),
      "the evidence",
    );
    return rows.map(toEvidence);
  });

/** The evidence index page: all cards, with the concepts and layers to group them by. */
export const getEvidenceIndex = createServerFn({ method: "GET" }).handler(
  async (): Promise<EvidenceIndexPayload> => {
    const client = db();
    const [layerRows, conceptRows, evidenceRows] = await Promise.all([
      client.from("layers").select("*").order("sort_order").then((r) => unwrap(r, "the layers")),
      client.from("concepts").select("*").order("name").then((r) => unwrap(r, "the concepts")),
      client.from("evidence").select("*").order("id").then((r) => unwrap(r, "the evidence")),
    ]);
    return {
      layers: layerRows.map(toLayer),
      concepts: conceptRows.map(toConcept),
      evidence: evidenceRows.map(toEvidence),
    };
  },
);

/** The reference library: every source and the entries that lean on it. */
export const getSourceLibrary = createServerFn({ method: "GET" }).handler(
  async (): Promise<LibraryEntry[]> => {
    const client = db();
    const [sourceRows, linkRows, conceptRows] = await Promise.all([
      client.from("sources").select("*").order("title").then((r) => unwrap(r, "the sources")),
      client.from("concept_sources").select("*").then((r) => unwrap(r, "the source links")),
      client.from("concepts").select("*").order("name").then((r) => unwrap(r, "the concepts")),
    ]);
    const conceptById = new Map(conceptRows.map((row) => [row.id, toConcept(row)]));
    const linksBySource = new Map<string, { concept: Concept; relevance: string }[]>();
    for (const row of linkRows) {
      const link = toConceptSource(row);
      const concept = conceptById.get(link.conceptId);
      if (!concept) continue;
      const bucket = linksBySource.get(link.sourceId);
      const entry = { concept, relevance: link.relevance };
      if (bucket) bucket.push(entry);
      else linksBySource.set(link.sourceId, [entry]);
    }
    return sourceRows.map((row) => {
      const source = toSource(row);
      const concepts = (linksBySource.get(source.id) ?? []).sort((a, b) =>
        a.concept.name.localeCompare(b.concept.name),
      );
      return { source, concepts };
    });
  },
);

const searchInput = z.object({
  q: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(60).optional(),
});

/**
 * Search runs in two stages: PostgreSQL narrows the rows with a case
 * insensitive match against the generated `search_text` column, then the pure
 * ranker in graph-explore orders what came back, so the graph toolbar and this
 * page agree on what "most relevant" means.
 */
export const searchAtlas = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => searchInput.parse(data))
  .handler(async ({ data }): Promise<SearchResultEntry[]> => {
    const client = db();
    const query = (data.q ?? "").trim();
    const limit = data.limit ?? 40;

    let builder = client.from("concepts").select("*");
    for (const term of query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
      builder = builder.ilike("search_text", `%${term.replaceAll("%", "\\%")}%`);
    }
    const [conceptRows, layerRows] = await Promise.all([
      builder.order("name").limit(200).then((r) => unwrap(r, "the search results")),
      client.from("layers").select("*").then((r) => unwrap(r, "the layers")),
    ]);
    const layerNames = new Map(layerRows.map((row) => [row.id, row.name]));
    const concepts = conceptRows.map(toConcept);

    if (!query) {
      return concepts.slice(0, limit).map((concept) => ({
        concept,
        layerName: layerNames.get(concept.layerId) ?? concept.layerId,
        matchedOn: "name",
      }));
    }

    return rankConcepts(concepts, query, limit).map(({ concept, matchedOn }) => ({
      concept,
      layerName: layerNames.get(concept.layerId) ?? concept.layerId,
      matchedOn,
    }));
  });

// -------------------------------------------------------------- diagnostics

/**
 * Everything the deterministic incident engine needs, in one payload.
 *
 * The engine is pure, so it runs in the browser against this context: ticking
 * a symptom re-ranks causes instantly, with no round trip and no model. The
 * database is still the single source of the knowledge it reasons over.
 */
export type DiagnosticsContext = {
  layers: Layer[];
  concepts: Concept[];
  relationships: Relationship[];
  evidence: Evidence[];
  symptoms: Symptom[];
  symptomEvidence: SymptomEvidence[];
};

export type IncidentSummary = {
  incident: Incident;
  symptoms: Symptom[];
};

export type IncidentsIndexPayload = {
  incidents: IncidentSummary[];
  layers: Layer[];
  symptoms: Symptom[];
};

export type IncidentDetailPayload = {
  incident: Incident;
  context: DiagnosticsContext;
  rootCause: Concept;
  contributing: Concept[];
};

async function loadDiagnosticsContext(
  client: SupabaseClient<Database>,
): Promise<DiagnosticsContext> {
  const [layerRows, conceptRows, relationshipRows, evidenceRows, symptomRows, linkRows] =
    await Promise.all([
      client.from("layers").select("*").order("sort_order").then((r) => unwrap(r, "the layers")),
      client.from("concepts").select("*").order("name").then((r) => unwrap(r, "the concepts")),
      client.from("relationships").select("*").order("id").then((r) => unwrap(r, "the relationships")),
      client.from("evidence").select("*").order("id").then((r) => unwrap(r, "the evidence")),
      client.from("symptoms").select("*").order("id").then((r) => unwrap(r, "the symptoms")),
      client
        .from("symptom_evidence")
        .select("*")
        .order("symptom_id")
        .then((r) => unwrap(r, "the symptom links")),
    ]);

  const graph: DomainGraph = toDomainGraph({
    layers: layerRows,
    concepts: conceptRows,
    relationships: relationshipRows,
    evidence: evidenceRows,
  });

  return {
    layers: graph.layers,
    concepts: graph.concepts,
    relationships: graph.relationships,
    evidence: graph.evidence,
    symptoms: symptomRows.map(toSymptom),
    symptomEvidence: linkRows.map(toSymptomEvidence),
  };
}

/** Triage: the graph, the signals, and the observations that point at them. */
export const getDiagnosticsContext = createServerFn({ method: "GET" }).handler(
  async (): Promise<DiagnosticsContext> => loadDiagnosticsContext(db()),
);

/** The incident index — scenario cards with the observations they opened with. */
export const getIncidentsIndex = createServerFn({ method: "GET" }).handler(
  async (): Promise<IncidentsIndexPayload> => {
    const client = db();
    const [incidentRows, symptomRows, layerRows] = await Promise.all([
      client.from("incidents").select("*").order("sort_order").then((r) => unwrap(r, "the incidents")),
      client.from("symptoms").select("*").order("id").then((r) => unwrap(r, "the symptoms")),
      client.from("layers").select("*").order("sort_order").then((r) => unwrap(r, "the layers")),
    ]);
    const symptoms = symptomRows.map(toSymptom);
    const byId = new Map(symptoms.map((symptom) => [symptom.id, symptom]));
    return {
      incidents: incidentRows.map((row) => {
        const incident = toIncident(row);
        return {
          incident,
          symptoms: incident.symptomIds.flatMap((id) => {
            const symptom = byId.get(id);
            return symptom ? [symptom] : [];
          }),
        };
      }),
      layers: layerRows.map(toLayer),
      symptoms,
    };
  },
);

/** One worked scenario plus the context needed to replay it in the browser. */
export const getIncidentDetail = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => slugInput.parse(data))
  .handler(async ({ data }): Promise<IncidentDetailPayload | null> => {
    const client = db();
    const incidentRow = unwrapMaybe(
      await client.from("incidents").select("*").eq("slug", data.slug).maybeSingle(),
      `the incident “${data.slug}”`,
    ) as Database["public"]["Tables"]["incidents"]["Row"] | null;
    if (!incidentRow) return null;

    const incident = toIncident(incidentRow);
    const context = await loadDiagnosticsContext(client);
    const byId = new Map(context.concepts.map((concept) => [concept.id, concept]));
    const rootCause = byId.get(incident.rootCauseId);
    if (!rootCause) {
      throw new Error(`The incident “${incident.slug}” points at a missing entry.`);
    }
    return {
      incident,
      context,
      rootCause,
      contributing: incident.contributingIds.flatMap((id) => {
        const concept = byId.get(id);
        return concept ? [concept] : [];
      }),
    };
  });
