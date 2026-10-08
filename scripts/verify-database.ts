/**
 * Contract check for the knowledge database.
 *
 * Runs against the live Data API with the *publishable* key — the same
 * credentials the app uses — so it proves what an anonymous reader can and
 * cannot do: read every table, traverse the graph, search, and nothing else.
 *
 *   bun scripts/verify-database.ts
 */
const URL_BASE = process.env["SUPABASE_URL"];
const KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];

if (!URL_BASE || !KEY) {
  console.error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set.");
  process.exit(1);
}

const rest = `${URL_BASE}/rest/v1`;
const headers = { apikey: KEY, "content-type": "application/json" };

let failures = 0;

function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`  ok   ${name} — ${detail}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name} — ${detail}`);
  }
}

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${rest}/${path}`, { headers });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function rpc(name: string, args: Record<string, unknown>) {
  const response = await fetch(`${rest}/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  console.log("Reads");
  for (const [table, min] of [
    ["layers", 8],
    ["concepts", 51],
    ["relationships", 80],
    ["evidence", 85],
    ["sources", 48],
    ["concept_sources", 100],
    ["symptoms", 28],
    ["symptom_evidence", 85],
    ["incidents", 10],
  ] as const) {
    const { status, body } = await get(`${table}?select=*`);
    const rows = Array.isArray(body) ? body.length : 0;
    check(table, status === 200 && rows >= min, `${rows} rows (status ${status})`);
  }

  console.log("Referential integrity");
  const concepts = (await get("concepts?select=id,layer_id")).body as {
    id: string;
    layer_id: string;
  }[];
  const layerIds = new Set(
    ((await get("layers?select=id")).body as { id: string }[]).map((row) => row.id),
  );
  const conceptIds = new Set(concepts.map((row) => row.id));
  check(
    "concepts.layer_id",
    concepts.every((row) => layerIds.has(row.layer_id)),
    "every concept sits in a known layer",
  );
  const rels = (await get("relationships?select=source_id,target_id")).body as {
    source_id: string;
    target_id: string;
  }[];
  check(
    "relationships endpoints",
    rels.every((row) => conceptIds.has(row.source_id) && conceptIds.has(row.target_id)),
    `${rels.length} edges resolve on both ends`,
  );
  const orphanEvidence = (await get("evidence?select=concept_id")).body as {
    concept_id: string;
  }[];
  check(
    "evidence.concept_id",
    orphanEvidence.every((row) => conceptIds.has(row.concept_id)),
    "no signal points at a missing concept",
  );

  const evidenceIds = new Set(
    ((await get("evidence?select=id")).body as { id: string }[]).map((row) => row.id),
  );
  const symptomIds = new Set(
    ((await get("symptoms?select=id")).body as { id: string }[]).map((row) => row.id),
  );
  const links = (await get("symptom_evidence?select=symptom_id,evidence_id")).body as {
    symptom_id: string;
    evidence_id: string;
  }[];
  check(
    "symptom_evidence endpoints",
    links.every((row) => symptomIds.has(row.symptom_id) && evidenceIds.has(row.evidence_id)),
    `${links.length} links resolve to a symptom and a signal`,
  );
  const incidents = (await get("incidents?select=slug,symptom_ids,root_cause_id,contributing_ids"))
    .body as {
    slug: string;
    symptom_ids: string[];
    root_cause_id: string;
    contributing_ids: string[];
  }[];
  check(
    "incidents reference live rows",
    incidents.every(
      (row) =>
        row.symptom_ids.length > 0 &&
        row.symptom_ids.every((id) => symptomIds.has(id)) &&
        conceptIds.has(row.root_cause_id) &&
        row.contributing_ids.every((id) => conceptIds.has(id)),
    ),
    `${incidents.length} scenarios point at known symptoms and concepts`,
  );

  console.log("Traversal");
  const hop1 = await rpc("concept_neighborhood", { p_concept_id: "retry-storm", p_depth: 1 });
  const hop2 = await rpc("concept_neighborhood", { p_concept_id: "retry-storm", p_depth: 2 });
  const n1 = Array.isArray(hop1.body) ? hop1.body.length : 0;
  const n2 = Array.isArray(hop2.body) ? hop2.body.length : 0;
  check("concept_neighborhood depth 1", hop1.status === 200 && n1 > 0, `${n1} neighbours`);
  check("concept_neighborhood depth 2", n2 > n1, `${n2} within two hops`);
  const unknown = await rpc("concept_neighborhood", { p_concept_id: "does-not-exist", p_depth: 2 });
  check(
    "unknown id traverses to nothing",
    unknown.status === 200 && Array.isArray(unknown.body) && unknown.body.length === 0,
    "empty result, no error",
  );

  console.log("Search");
  const hits = await get("concepts?select=id&search_text=ilike.*retry*");
  check(
    "ilike over search_text",
    hits.status === 200 && Array.isArray(hits.body) && hits.body.length > 0,
    `${Array.isArray(hits.body) ? hits.body.length : 0} matches for "retry"`,
  );

  console.log("Statistics");
  const stats = await rpc("atlas_stats", {});
  const payload = stats.body as Record<string, number> | null;
  check(
    "atlas_stats",
    stats.status === 200 && (payload?.["concepts"] ?? 0) === conceptIds.size,
    JSON.stringify(payload),
  );

  console.log("Write protection");
  for (const [table, body] of [
    ["layers", { id: "hack", name: "Hack", sort_order: 99, description: "nope" }],
    ["concepts", { id: "hack", slug: "hack", name: "Hack", layer_id: "data", description: "nope" }],
  ] as const) {
    const response = await fetch(`${rest}/${table}`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(body),
    });
    check(`anonymous insert into ${table} refused`, response.status >= 400, `status ${response.status}`);
  }
  const del = await fetch(`${rest}/concepts?id=eq.retry-storm`, { method: "DELETE", headers });
  check("anonymous delete refused", del.status >= 400, `status ${del.status}`);
  const incidentDel = await fetch(`${rest}/incidents?id=neq.none`, { method: "DELETE", headers });
  check("anonymous incident delete refused", incidentDel.status >= 400, `status ${incidentDel.status}`);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
