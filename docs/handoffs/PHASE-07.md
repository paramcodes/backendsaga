# Phase 7 Handoff — Deterministic Incident Engine

## Completed

The atlas can now be used in the other direction. Phases 1–6 answer "what is
this and what does it touch"; Phase 7 answers "I can see these signals — what
is upstream of all of them". No AI is involved: the engine is a pure function
over the knowledge graph, and the same observations always produce the same
ranking.

Shipped in this phase:

- **Symptom model.** 29 symptoms, at least two per layer, each phrased strictly
  as an observation ("Connection pool wait time up"), with a canonical signal
  string (`db.client.connection.pending_requests`) and a trend. A symptom never
  names a cause and never points at a concept directly.
- **Symptom ↔ evidence links.** 91 links, each `DIRECT` (this evidence card *is*
  that observation) or `SUPPORTING` (the card is consistent with it). This is the
  only bridge from a symptom into the graph, so every diagnosis reads back as
  "this signal, on this evidence card, on this concept".
- **Diagnosis engine** (`src/lib/incident-engine.ts`, no React, no I/O, no AI):
  resolves symptoms onto concepts through evidence, walks `CAUSES` and
  `AMPLIFIES` edges upstream (breadth-first, shortest chain wins, `MITIGATES` is
  never followed), and ranks candidates by how many distinct observations each
  one explains, then by a distance- and strength-weighted score. Every ranked
  cause carries the actual path that justifies it, plus mitigations, predicted
  downstream effects it would also produce, unexplained symptoms, and a ranked
  list of next checks.
- **Next checks.** The engine picks evidence belonging to the top candidates
  that nobody has reported yet, and scores each by how many candidates it would
  rule out. This turns the ranking into an action: "go read this, it separates
  the top three".
- **10 worked incidents** with narrative, timed timeline, resolution and lesson.
  The documented root cause is never an engine input — it is the answer key,
  revealed behind a button after you have made your own call. All ten rank their
  documented cause in the top two from the signals alone; six rank it first.
- **Three new surfaces.** `/triage` (tick what you see, get a live ranking and a
  chain diagram), `/incidents` (the scenario library), `/incidents/$slug` (replay
  one scenario against the engine and compare with what the team found).
- **Cause-chain diagram.** The same ELK + React Flow stack as the knowledge
  graph, but laid out as cause → effect → what you read, with the reported
  signals as dashed terminal nodes.

Row counts in the database: 29 symptoms, 91 symptom↔evidence links, 10
incidents, on top of the Phase 6 totals.

## Architecture state

```text
src/domain/           symptoms, symptom evidence, incidents (authoring source)
  schema.ts           + symptomSchema, symptomEvidenceSchema, incidentSchema
  seed/symptoms.ts    29 symptoms + 91 evidence links
  seed/incidents.ts   10 scenarios
  index.ts            incidentCatalog, validateIncidents, seedIndex extensions
src/lib/
  incident-engine.ts  pure diagnosis: resolve → walk upstream → rank → checks
  incident-view.ts    pure presentation: chain building, severity meta, URL codec
  graph-layout.ts     layoutDiagram() — generic ELK layout, layoutGraph delegates
  atlas-rows.ts       database rows → domain objects (symptoms, incidents)
  atlas.functions.ts  getDiagnosticsContext / getIncidentsIndex / getIncidentDetail
src/components/atlas/incident/
  SymptomPicker, CauseList, NextChecks, IncidentTimeline, SeverityBadge,
  ChainNodes, CauseChainCanvas (lazy), TriageExperience (lazy canvas)
src/routes/           triage.tsx, incidents.index.tsx, incidents.$slug.tsx
```

The engine runs in the browser against a payload fetched once by the route
loader (`getDiagnosticsContext`: layers, concepts, relationships, evidence,
symptoms, symptom links — about 100 KB). Ticking a symptom therefore re-ranks
instantly with no round trip, and the ranking is reproducible offline from the
same payload.

## Files changed

Added:

- `src/domain/seed/symptoms.ts`, `src/domain/seed/incidents.ts`
- `src/lib/incident-engine.ts`, `src/lib/incident-engine.test.ts`
- `src/lib/incident-view.ts`, `src/lib/incident-view.test.ts`
- `src/components/atlas/incident/` — `SeverityBadge.tsx`, `SymptomPicker.tsx`,
  `CauseList.tsx`, `ChainNodes.tsx`, `CauseChainCanvas.tsx`, `NextChecks.tsx`,
  `IncidentTimeline.tsx`, `TriageExperience.tsx`
- `src/routes/triage.tsx`, `src/routes/incidents.index.tsx`,
  `src/routes/incidents.$slug.tsx`
- `drizzle/migrations/0002_atlas_incidents.sql`
- `docs/handoffs/PHASE-07.md`

Changed:

- `src/domain/schema.ts` — symptom, symptom-evidence, severity, incident event
  and incident schemas; `IncidentCatalog` type
- `src/domain/index.ts` — `incidentCatalog`, `validateIncidents`, symptom
  helpers on `seedIndex`
- `src/lib/graph-layout.ts` — extracted `layoutDiagram` so any diagram can use
  ELK; `layoutGraph` now delegates to it
- `src/lib/atlas-rows.ts` — symptom/incident row mappers, `toIncidentCatalog`,
  symptom and incident counts in `AtlasStats`
- `src/lib/atlas.functions.ts` — three incident server functions
- `src/components/atlas/AppShell.tsx` — seven nav entries, "Start triage" in the
  top bar
- `src/routes/index.tsx` — "Something is broken right now" panel on the dashboard
- `src/styles.css` — severity badges, symptom chips, confidence bars, timeline,
  chain node and observation-edge tokens
- `src/test/app-routing.test.tsx` — the three new routes
- `scripts/seed-database.ts`, `scripts/verify-database.ts`,
  `scripts/generate-seed-sql.ts` — symptoms and incidents
- `roadmap.md`

## Important decisions

1. **Symptoms reach the graph only through evidence.** A symptom could have
   carried a `conceptIds` list, which would have been less work. It was rejected
   because it would duplicate knowledge that already lives on evidence cards and
   let the two drift. The cost is that a symptom with no evidence link explains
   nothing; the engine reports those explicitly as unplaced rather than hiding
   them.
2. **`MITIGATES` is never walked as a cause edge.** Only `CAUSES` and
   `AMPLIFIES` propagate failure. Mitigations are surfaced separately, as "what
   would have stopped this".
3. **Coverage dominates the ranking.** A cause that explains three of your
   observations always outranks one that explains two with a shorter path.
   Distance and link strength only break ties within the same coverage, which
   keeps the ranking stable and explainable.
4. **Four hops maximum.** Past four hops almost everything in a connected
   systems graph explains almost everything; the limit keeps candidate lists
   meaningful and the walk cheap.
5. **The documented root cause is never an engine input.** `rootCauseId` is read
   only to score the replay and to reveal the answer. This is what keeps the
   incident library honest as a test set.
6. **Two incidents were re-tuned, not the ranking.** `afternoon-gc-spiral` and
   `show-all-page` initially ranked their documented cause fourth and fifth. The
   fix was in the data, not the scoring: a `restart-loop` symptom was missing
   from the atlas, and `show-all-page`'s documented cause was wrong (the page
   had no pagination; N+1 was a consequence).
7. **The engine runs client-side.** The diagnostic context is one loader fetch;
   re-ranking on every tick is a pure function over data already in memory. A
   server round trip per tick would have been slower and no more trustworthy,
   since the ranking is deterministic either way.
8. **Chain canvases size themselves.** Cause chains are wide and shallow, so the
   canvas measures the laid-out bounding box and picks a height instead of
   reserving a fixed block of mostly empty space.

## Tests

`bunx vitest run` — 97 tests, 8 files.

New in this phase:

- `src/lib/incident-engine.test.ts` (24): catalog validation; every symptom has
  a `DIRECT` link and resolves onto at least one concept; every layer covered;
  empty and unknown inputs; single symptom ranks its own concept first; the walk
  passes through unobserved intermediate causes; broader causes outrank closer
  ones; the depth limit is never exceeded; the ranking is deterministic across
  input order; unplaced symptoms are reported; mitigations and predicted effects
  are exposed; next checks separate candidates and never repeat a reported
  signal; all ten incidents replay with the documented cause in the top three.
- `src/lib/incident-view.test.ts` (13): chain construction from a ranked cause,
  severity metadata, confidence percentages, symptom lines, layer grouping, and
  the symptom URL codec round-trip.
- `src/test/app-routing.test.tsx`: `/triage`, `/incidents`, `/incidents/$slug`.

Database contract checks: `bun scripts/verify-database.ts` — symptom-evidence
endpoints resolve, incident references resolve, anonymous writes to the new
tables are refused.

## Known problems

- Four incidents rank their documented cause second rather than first. In each
  case the first-ranked candidate is a true upstream cause that explains the
  same observations (for example heap pressure above a memory leak), so this is
  honest behaviour rather than a bug — but it does mean "rank 1" is not a
  guarantee.
- The symptom picker lists all 29 symptoms grouped by layer. With a much larger
  catalogue the filter box would need to become the primary interaction.
- The diagnostic context payload grows with the graph. It is fine at 51 concepts
  and 87 evidence cards; past a few thousand rows the engine would need to move
  server-side or the payload would need slicing by layer.

## Deferred work

- Multi-cause diagnosis ("two independent things are broken") — the engine
  currently ranks single causes and shows coverage, which is enough to notice
  the case but does not name it.
- Time-aware ranking: the incident timelines carry ordering that the engine
  ignores. "Lock waits appeared before latency rose" is strong evidence a human
  uses and the engine does not.
- Saving a triage session (shareable beyond the URL, with notes).
- Negative observations ("the cache hit ratio did *not* move"), which would rule
  candidates out rather than only ranking them in.

## Exact next phase

Phase 8 — the AI layer, on the Lovable AI gateway:

1. A pure graph context builder that turns a question into a bounded slice of
   the graph.
2. Three capabilities: Explain, Diagnose, Research.
3. Every answer exposes the graph context it was given.
4. Research proposes changes into a pending-proposals table; it never mutates
   canonical knowledge.
5. Tests + `docs/handoffs/PHASE-08.md`.

## Commands to verify the current state

```bash
bunx vitest run            # 97 tests
bunx tsgo --noEmit         # types
bun scripts/verify-database.ts   # database contract (reads, integrity, read-only)
bun scripts/seed-database.ts     # re-seed from the curated dataset (idempotent)
```

Pages to check: `/triage`, `/triage?symptoms=db-latency-up,p99-latency-up`,
`/incidents`, `/incidents/checkout-lock-storm`.
