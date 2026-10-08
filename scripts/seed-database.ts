/**
 * Applies the curated domain seed to the connected database.
 *
 *   bun scripts/seed-database.ts
 *
 * Writes go through the Data API as service_role (the only role with write
 * grants on the knowledge tables). Every row is upserted and rows that are no
 * longer part of the seed are deleted, so the database ends up identical to
 * src/domain/seed/*.
 *
 * The equivalent portable artifact is db/seed/atlas-seed.sql — see
 * scripts/generate-seed-sql.ts.
 */
import { domainGraph, incidentCatalog, validateGraph, validateIncidents } from "../src/domain";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

// The Data API accepts the secret key in `apikey`; it is not a JWT, so it must
// not be sent as a bearer token.
const headers = { apikey: key, "Content-Type": "application/json" };
const CHUNK = 40;

async function call(path: string, init: RequestInit): Promise<void> {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
  if (!res.ok) throw new Error(`${init.method} ${path} → ${res.status} ${await res.text()}`);
}

async function upsert(table: string, conflict: string, rows: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await call(`${table}?on_conflict=${conflict}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + CHUNK)),
    });
  }
  console.log(`  ${table}: ${rows.length} rows upserted`);
}

async function prune(table: string, column: string, keep: string[]): Promise<void> {
  const list = keep.map((value) => `"${value}"`).join(",");
  await call(`${table}?${column}=not.in.(${encodeURIComponent(list)})`, { method: "DELETE" });
}

const problems = [...validateGraph(domainGraph), ...validateIncidents(domainGraph, incidentCatalog)];
if (problems.length > 0) {
  console.error("Refusing to seed from an invalid graph:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const { layers, concepts, relationships, evidence, sources, conceptSources } = domainGraph;

console.log("Seeding the atlas…");
await upsert("layers", "id", layers.map((l) => ({
  id: l.id, name: l.name, sort_order: l.order, description: l.description,
})));
await upsert("concepts", "id", concepts.map((c) => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  layer_id: c.layerId,
  description: c.description,
  problem: c.problem ?? null,
  why: c.why ?? null,
  mechanism: c.mechanism ?? null,
  tradeoffs: c.tradeoffs ?? null,
  better_alternative: c.betterAlternative ?? null,
})));
await upsert("relationships", "id", relationships.map((r) => ({
  id: r.id, source_id: r.sourceId, target_id: r.targetId, type: r.type,
})));
await upsert("sources", "id", sources.map((s) => ({
  id: s.id, kind: s.kind, title: s.title, author: s.author, year: s.year ?? null, url: s.url, note: s.note,
})));
await upsert("evidence", "id", evidence.map((e) => ({
  id: e.id,
  concept_id: e.conceptId,
  kind: e.kind,
  trend: e.trend,
  signal: e.signal,
  what_you_see: e.whatYouSee,
  where_to_look: e.whereToLook,
  why_it_matters: e.whyItMatters,
  false_positive: e.falsePositive ?? null,
})));
// Link rows have a composite key and no stable surrogate id, so the join
// table is rewritten wholesale rather than diffed.
await call("concept_sources?concept_id=not.is.null", { method: "DELETE" });
await upsert("concept_sources", "concept_id,source_id", conceptSources.map((cs) => ({
  concept_id: cs.conceptId, source_id: cs.sourceId, relevance: cs.relevance,
})));

const { symptoms, symptomEvidence, incidents } = incidentCatalog;
await upsert("symptoms", "id", symptoms.map((s) => ({
  id: s.id, name: s.name, layer_id: s.layerId, description: s.description, signal: s.signal, trend: s.trend,
})));
// Composite key, no surrogate id: rewritten wholesale like concept_sources.
await call("symptom_evidence?symptom_id=not.is.null", { method: "DELETE" });
await upsert("symptom_evidence", "symptom_id,evidence_id", symptomEvidence.map((l) => ({
  symptom_id: l.symptomId, evidence_id: l.evidenceId, strength: l.strength,
})));
await upsert("incidents", "id", incidents.map((i, order) => ({
  id: i.id,
  slug: i.slug,
  title: i.title,
  severity: i.severity,
  summary: i.summary,
  narrative: i.narrative,
  symptom_ids: i.symptomIds,
  timeline: i.timeline,
  root_cause_id: i.rootCauseId,
  contributing_ids: i.contributingIds,
  resolution: i.resolution,
  lesson: i.lesson,
  sort_order: order + 1,
})));

// Deletions run child-first so foreign keys stay satisfied.
console.log("Pruning rows that left the seed…");
await prune("incidents", "id", incidents.map((i) => i.id));
await prune("symptoms", "id", symptoms.map((s) => s.id));
await prune("evidence", "id", evidence.map((e) => e.id));
await prune("relationships", "id", relationships.map((r) => r.id));
await prune("concepts", "id", concepts.map((c) => c.id));
await prune("sources", "id", sources.map((s) => s.id));
await prune("layers", "id", layers.map((l) => l.id));

console.log("Done.");
