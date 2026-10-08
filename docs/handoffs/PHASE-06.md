# Phase 6 Handoff — PostgreSQL Backend

## Completed

The atlas now runs on a real database. Every page — dashboard, graph, concept,
evidence index, library, search — reads from PostgreSQL through typed server
functions. The curated TypeScript dataset is still where knowledge is authored;
the database is the runtime read path, rebuilt from that dataset by a seed
script.

Shipped in this phase:

- **Schema** (migration `0000_atlas_knowledge_schema.sql`): `layers`,
  `concepts`, `relationships`, `sources`, `evidence`, `concept_sources`, and
  `incidents` (the anchor Phase 7 builds on). Constraints carry the domain
  invariants into the database: layer order unique and positive, concept slug
  unique, relationship type checked against the eight known types, no
  self-loops, `(source_id, type, target_id)` unique, evidence kind and trend
  checked, source kind checked, year range checked, url shape checked.
- **A generated search column.** `concepts.search_text` is
  `GENERATED ALWAYS AS` the lowercased concatenation of name, description and
  the four prose fields, so text search never depends on application code
  remembering to update an index.
- **Two SQL functions.** `concept_neighborhood(concept_id, depth)` walks the
  undirected edge set with a recursive CTE and returns `(concept_id, hops)`,
  clamped to 1–4 hops. `atlas_stats()` returns one jsonb row with every count
  the dashboard shows, instead of six round trips.
- **Read-only to the public** (migration `0001_lock_knowledge_tables_read_only.sql`):
  RLS on, a public SELECT policy per table, and INSERT/UPDATE/DELETE/TRUNCATE
  revoked from the anonymous and signed-in roles. Writes happen only through
  the seed script's privileged key.
- **Sources** became first-class: 48 real books, papers, RFCs and docs, with
  ~107 concept↔source links and a per-link note saying *why* that source is
  worth reading for that concept. Every concept has at least one.
- **New surfaces**: `/library` (the reading list, grouped by source kind, each
  source showing what cites it) and a "Two hops away" section on concept pages
  fed by the recursive neighbourhood walk.

Row counts live in the database: 8 layers, 51 concepts, 82 relationships, 48
sources, 87 evidence cards, 107 concept↔source links.

## Architecture state

```text
drizzle/migrations/0000_atlas_knowledge_schema.sql   tables, checks, indexes, RLS, SQL functions
drizzle/migrations/0001_lock_knowledge_tables_read_only.sql  revoke writes from public roles

src/domain/**                 canonical authored knowledge (React-free, Zod-validated)
src/domain/graph-index.ts     createGraphIndex(graph) — the same lookups over ANY graph
src/domain/index.ts           seedIndex = createGraphIndex(domainGraph)

scripts/generate-seed-sql.ts  dataset -> db/seed/atlas-seed.sql (idempotent upserts + prune)
scripts/seed-database.ts      dataset -> database, via the Data API, in dependency order
scripts/verify-database.ts    live contract check: reads, integrity, traversal, search, writes refused

src/lib/atlas-rows.ts         database rows <-> domain records (Zod-validated both ways)
src/lib/atlas.functions.ts    server functions: overview, graph, concept, neighbors, evidence, library, search
src/lib/atlas-queries.ts      queryOptions for the three client-side reads
src/components/atlas/RouteStates.tsx  shared errorComponent / not-found

src/routes/*                  loaders call server functions; components render
```

The flow is one-directional: domain → database → server function → loader →
component. `createGraphIndex` is what makes the graph canvas indifferent to
where its data came from — it builds the same adjacency lookups from
loader-delivered rows that it used to build from the seed module.

## Files changed

- Added `drizzle/migrations/0000_atlas_knowledge_schema.sql`,
  `drizzle/migrations/0001_lock_knowledge_tables_read_only.sql`,
  `db/seed/atlas-seed.sql`, `scripts/generate-seed-sql.ts`,
  `scripts/seed-database.ts`, `scripts/verify-database.ts`
- Added `src/domain/graph-index.ts`, `src/domain/seed/sources.ts`
- Added `src/lib/atlas-rows.ts`, `src/lib/atlas-rows.test.ts`,
  `src/lib/atlas.functions.ts`, `src/lib/atlas-queries.ts`
- Added `src/hooks/use-debounced-value.ts`,
  `src/components/atlas/RouteStates.tsx`, `src/routes/library.tsx`,
  `docs/handoffs/PHASE-06.md`
- Rewrote `src/domain/index.ts` (now a thin wrapper over the index factory),
  `src/routes/index.tsx`, `src/routes/concepts.$slug.tsx`,
  `src/routes/evidence.tsx`, `src/routes/search.tsx`, `src/routes/graph.tsx`,
  `src/routes/__root.tsx`
- Updated `src/domain/schema.ts` (source + concept-source schemas),
  `src/components/atlas/AppShell.tsx` (layers from the loader, Library nav),
  `src/components/atlas/GraphExperience.tsx` (index built from loader data),
  `src/components/atlas/graph/ConceptDetailPanel.tsx` (pending evidence state),
  `src/test/app-routing.test.tsx`, `docs/GRAPH-SCHEMA.md`, `AGENTS.md`,
  `roadmap.md`

## Important decisions

1. **The TypeScript dataset stays canonical; the database is a projection.**
   Knowledge is reviewed as code — diffable, testable, one pull request per
   idea. The seed script is idempotent (upsert by primary key, then prune rows
   the dataset no longer contains), so re-seeding is safe and the database can
   be rebuilt from scratch at any time.
2. **Reads go through server functions, never from a loader to the database.**
   Loaders run on both client and server; keeping the client factory inside the
   handler means credentials and query shapes never reach the browser bundle.
3. **The publishable key, not the service key, serves page reads.** Public
   knowledge is public: a narrow SELECT policy plus revoked write privileges is
   a stronger guarantee than a privileged key with application-level checks.
   The service key appears in exactly one place — the seed script.
4. **Page-critical data loads in route loaders, not `useSuspenseQuery`.** SSR
   HTML arrives complete, which matters for a reference site that should be
   readable and indexable without JavaScript. The three genuinely interactive
   reads (panel evidence, two-hops-away, search-as-you-type) use TanStack Query
   with a 10-minute stale time, because this data changes on deploys, not on
   requests.
5. **Traversal belongs in SQL.** `concept_neighborhood` is a recursive CTE
   rather than repeated round trips, so depth-2 and depth-3 walks cost one
   request. The in-memory `expandNeighborhood` from Phase 4 still drives the
   canvas, where the whole graph is already loaded.
6. **`search_text` is a generated column.** The alternative — maintaining a
   concatenated column in application code — drifts the first time someone adds
   a field.
7. **Rows map through Zod on the way in.** `toConcept`, `toEvidence` and the
   rest parse database rows with the same schemas the seed data uses, so a
   schema change that the database has not followed fails loudly in one place
   instead of producing `undefined` deep inside a component.
8. **`incidents` ships empty in this phase.** The table and its constraints are
   part of the schema so Phase 7 adds behaviour, not plumbing; no incident
   logic, routes or UI exist yet.

## Tests

`bunx vitest run` — **57 tests pass** (6 files). `bunx tsgo --noEmit` — clean.

- `src/lib/atlas-rows.test.ts` (7): the whole graph round-trips through the
  database row shape unchanged; layers come back ordered by `sort_order`
  whatever order the rows arrive in; nulls become absent fields rather than
  empty strings; malformed rows are rejected by the schema; a working graph
  index is built from database rows; stats coerce counts returned as strings;
  responses missing optional tables degrade to empty collections.
- `scripts/verify-database.ts` — a live contract check against the running
  database: every table readable anonymously, referential integrity on
  `concepts.layer_id`, both relationship endpoints and `evidence.concept_id`,
  `concept_neighborhood` at depth 1 and 2 plus an unknown id, text search over
  `search_text`, `atlas_stats` totals, and anonymous INSERT/DELETE refused
  (this check is what caught the default privileges that RLS alone did not
  cover — fixed by migration 0001).
- Browser: all six routes render database content server-side; the graph loads
  9 nodes around a focus concept and its detail panel fills in signals fetched
  per concept; graph search navigates and re-layouts; a concept page shows
  two-hops-away entries and its sources; search-as-you-type updates the URL and
  the ranked results; an unknown slug renders the not-found page. No console
  errors.

## Known problems

- Seeding runs through the Data API rather than `psql`: the sandbox database
  role cannot write to these tables, and after migration 0001 neither can any
  public role. The seed script needs the privileged key in its environment.
- `/graph` loads the full node and edge set in one request (51 + 82 rows today,
  ~60 KB). That is the right trade for a graph this size — the canvas needs
  global adjacency for atlas mode — but a few thousand concepts would need a
  windowed fetch. Noted for Phase 10.
- Search uses `ILIKE` over the generated column, then ranks in TypeScript.
  Correct and fast at this size; a GIN/trigram index is the Phase 10 upgrade.
- There is no admin write path. Knowledge changes by editing the dataset and
  re-running the seed script. That is deliberate for now, but it means the
  Phase 8 research proposals will need their own table and write policy.

## Deferred work

- Full-text indexes, query timing and viewport culling (Phase 10).
- Incident rows, symptoms and the diagnosis engine (Phase 7) — the `incidents`
  table is in place and empty.
- A writable path for AI-proposed changes (Phase 8), which must stay separate
  from the canonical tables.

## Exact next phase

Phase 7 — the deterministic incident engine: a symptom model that maps
observations onto evidence, a diagnosis that walks CAUSES/AMPLIFIES edges
upstream and ranks candidate causes by symptom coverage and path length,
seeded incident scenarios, incident routes and an incident view of the graph.
No AI, no heuristics that cannot be explained by a path in the graph.

## Commands to verify the current state

```bash
bunx vitest run
bunx tsgo --noEmit
bun scripts/verify-database.ts     # live read/traversal/permission checks
bun scripts/seed-database.ts       # idempotent re-seed from the dataset
# then open /, /graph, /concepts/lock-contention, /evidence, /library, /search?q=lock
```
