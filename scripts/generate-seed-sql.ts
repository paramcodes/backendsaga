/**
 * Generates db/seed/atlas-seed.sql from the canonical TypeScript domain seed.
 *
 *   bun scripts/generate-seed-sql.ts          # regenerate the file
 *   psql "$SUPABASE_DB_URL" -f db/seed/atlas-seed.sql
 *
 * The output is idempotent: every row is upserted and anything no longer in
 * the seed is deleted, so running it twice leaves the database identical to
 * src/domain/seed/*.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { domainGraph, incidentCatalog, validateGraph, validateIncidents } from "../src/domain";

/** Pre-rendered SQL (arrays, jsonb) that must not be quoted as a literal. */
class Raw {
  constructor(readonly sql: string) {}
}

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const q = (value: Cell): string => {
  if (value instanceof Raw) return value.sql;
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return quote(value);
};

const textArray = (values: string[]): Raw =>
  new Raw(values.length === 0 ? "'{}'::text[]" : `ARRAY[${values.map(quote).join(", ")}]::text[]`);

const json = (value: unknown): Raw => new Raw(`${quote(JSON.stringify(value))}::jsonb`);

type Cell = string | number | null | undefined | Raw;
type Row = Cell[];

/** `touch` adds `updated_at = now()`; tables without that column opt out. */
function upsert(
  table: string,
  columns: string[],
  conflict: string[],
  rows: Row[],
  options: { touch?: boolean } = {},
): string {
  const updates = columns
    .filter((c) => !conflict.includes(c))
    .map((c) => `${c} = excluded.${c}`)
    .concat(options.touch === false ? [] : ["updated_at = now()"])
    .join(",\n    ");
  const values = rows.map((row) => `  (${row.map(q).join(", ")})`).join(",\n");
  return [
    `INSERT INTO public.${table} (${columns.join(", ")}) VALUES`,
    values,
    `ON CONFLICT (${conflict.join(", ")}) DO UPDATE SET`,
    `    ${updates};`,
    "",
  ].join("\n");
}

function prune(table: string, keyExpression: string, keys: string[]): string {
  return `DELETE FROM public.${table} WHERE ${keyExpression} NOT IN (\n  ${keys
    .map(q)
    .join(",\n  ")}\n);\n`;
}

const problems = [...validateGraph(domainGraph), ...validateIncidents(domainGraph, incidentCatalog)];
if (problems.length > 0) {
  console.error("Refusing to generate SQL from an invalid graph:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const { layers, concepts, relationships, evidence, sources, conceptSources } = domainGraph;
const { symptoms, symptomEvidence, incidents } = incidentCatalog;

const sql = [
  "-- GENERATED FILE — do not edit by hand.",
  "-- Source of truth: src/domain/seed/*. Regenerate with:",
  "--   bun scripts/generate-seed-sql.ts",
  "-- Apply with:",
  '--   psql "$SUPABASE_DB_URL" -f db/seed/atlas-seed.sql',
  "",
  "BEGIN;",
  "",
  upsert(
    "layers",
    ["id", "name", "sort_order", "description"],
    ["id"],
    layers.map((l) => [l.id, l.name, l.order, l.description]),
  ),
  upsert(
    "concepts",
    ["id", "slug", "name", "layer_id", "description", "problem", "why", "mechanism", "tradeoffs", "better_alternative"],
    ["id"],
    concepts.map((c) => [
      c.id,
      c.slug,
      c.name,
      c.layerId,
      c.description,
      c.problem ?? null,
      c.why ?? null,
      c.mechanism ?? null,
      c.tradeoffs ?? null,
      c.betterAlternative ?? null,
    ]),
  ),
  upsert(
    "relationships",
    ["id", "source_id", "target_id", "type"],
    ["id"],
    relationships.map((r) => [r.id, r.sourceId, r.targetId, r.type]),
  ),
  upsert(
    "sources",
    ["id", "kind", "title", "author", "year", "url", "note"],
    ["id"],
    sources.map((s) => [s.id, s.kind, s.title, s.author, s.year ?? null, s.url, s.note]),
  ),
  upsert(
    "evidence",
    ["id", "concept_id", "kind", "trend", "signal", "what_you_see", "where_to_look", "why_it_matters", "false_positive"],
    ["id"],
    evidence.map((e) => [
      e.id,
      e.conceptId,
      e.kind,
      e.trend,
      e.signal,
      e.whatYouSee,
      e.whereToLook,
      e.whyItMatters,
      e.falsePositive ?? null,
    ]),
  ),
  upsert(
    "concept_sources",
    ["concept_id", "source_id", "relevance"],
    ["concept_id", "source_id"],
    conceptSources.map((cs) => [cs.conceptId, cs.sourceId, cs.relevance]),
  ),
  upsert(
    "symptoms",
    ["id", "name", "layer_id", "description", "signal", "trend"],
    ["id"],
    symptoms.map((s) => [s.id, s.name, s.layerId, s.description, s.signal, s.trend]),
    { touch: false },
  ),
  upsert(
    "symptom_evidence",
    ["symptom_id", "evidence_id", "strength"],
    ["symptom_id", "evidence_id"],
    symptomEvidence.map((l) => [l.symptomId, l.evidenceId, l.strength]),
    { touch: false },
  ),
  upsert(
    "incidents",
    [
      "id", "slug", "title", "severity", "summary", "narrative", "symptom_ids",
      "timeline", "root_cause_id", "contributing_ids", "resolution", "lesson", "sort_order",
    ],
    ["id"],
    incidents.map((i, order) => [
      i.id,
      i.slug,
      i.title,
      i.severity,
      i.summary,
      i.narrative,
      textArray(i.symptomIds),
      json(i.timeline),
      i.rootCauseId,
      textArray(i.contributingIds),
      i.resolution,
      i.lesson,
      order + 1,
    ]),
  ),
  "-- Remove anything that is no longer part of the curated seed.",
  prune("incidents", "id", incidents.map((i) => i.id)),
  prune("symptom_evidence", "(symptom_id || '--' || evidence_id)", symptomEvidence.map((l) => `${l.symptomId}--${l.evidenceId}`)),
  prune("symptoms", "id", symptoms.map((s) => s.id)),
  prune("concept_sources", "(concept_id || '--' || source_id)", conceptSources.map((cs) => `${cs.conceptId}--${cs.sourceId}`)),
  prune("evidence", "id", evidence.map((e) => e.id)),
  prune("relationships", "id", relationships.map((r) => r.id)),
  prune("sources", "id", sources.map((s) => s.id)),
  prune("concepts", "id", concepts.map((c) => c.id)),
  prune("layers", "id", layers.map((l) => l.id)),
  "COMMIT;",
  "",
].join("\n");

const target = resolve(import.meta.dirname, "../db/seed/atlas-seed.sql");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, sql);

console.log(
  `Wrote ${target}\n` +
    `  ${layers.length} layers, ${concepts.length} concepts, ${relationships.length} relationships,\n` +
    `  ${evidence.length} evidence cards, ${sources.length} sources, ${conceptSources.length} source links,\n` +
    `  ${symptoms.length} symptoms, ${symptomEvidence.length} symptom links, ${incidents.length} incidents.`,
);
