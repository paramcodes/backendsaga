# Phase 5 Handoff — Evidence Model

## Completed

Every concept in the atlas is now observable. Evidence stopped being a label
and became a card that answers four questions:

- **What you would see** — the shape of the observation, not the definition.
- **Where you would look** — the specific tool, table or panel.
- **Why that signal matters** — the inference it licenses.
- **But** — the innocent explanation that produces the same signal.

Numbers: **85 signals across all 51 concepts**, every evidence kind in use
(METRIC 43, OS_COUNTER 12, LOG 13, TRACE 9, QUERY_PLAN 4, PROFILE 4, PACKET 1),
and a named false positive on more than 80% of them.

Surfaces:

- `/evidence` — the field-signal index: filter by kind, by layer and by free
  text (search covers the signal, all four prose fields and the concept), with
  every filter in the URL. Grouped by concept in atlas order.
- Concept pages render full evidence cards, and say plainly when a concept has
  none rather than hiding the section.
- The graph detail panel shows an "Observable as" strip with the top signals.
- The dashboard reports coverage and links into the index.

## Architecture state

```text
src/domain/schema.ts        evidenceSchema: kind, trend, signal + 4 prose fields
src/domain/seed/evidence.ts 85 authored cards (React-free)
src/domain/index.ts         evidenceFor, conceptsWithEvidence, evidenceCoverage
src/lib/evidence-view.ts    pure filtering, grouping, counting, URL list codecs
src/components/atlas/EvidenceCard.tsx  one card, used by three surfaces
src/routes/evidence.tsx     the index route
```

The domain stays pure; `evidence-view.ts` holds every decision the page makes
so the route component is markup plus state.

## Files changed

- Added `src/lib/evidence-view.ts`, `src/lib/evidence-view.test.ts`,
  `src/components/atlas/EvidenceCard.tsx`, `src/routes/evidence.tsx`,
  `docs/handoffs/PHASE-05.md`
- Rewrote `src/domain/seed/evidence.ts` (12 thin records → 85 full cards)
- Updated `src/domain/schema.ts`, `src/domain/index.ts`,
  `src/domain/domain.test.ts`, `src/routes/concepts.$slug.tsx`,
  `src/routes/index.tsx`, `src/components/atlas/AppShell.tsx`,
  `src/components/atlas/graph/ConceptDetailPanel.tsx`, `src/styles.css`,
  `src/test/app-routing.test.tsx`, `docs/GRAPH-SCHEMA.md`

## Important decisions

1. `description` was replaced by four named fields rather than extended. A
   single blob invites restating the concept; named fields force the author to
   say where to look.
2. `trend` (UP / DOWN / SPIKE / FLAT / PRESENT) is part of the record. "Pool
   wait time" is not evidence; "pool wait time rising while usage is pinned" is.
3. `falsePositive` is optional in the schema but expected in review, and a test
   enforces that more than 80% of cards carry one. Evidence that cannot lie is
   usually evidence that was not thought through.
4. Evidence is authored for mitigations too (circuit breaker, bulkhead,
   backpressure), answering "how would I know this is working?".
5. Filters serialise as comma-separated URL lists, validated against the
   allowed values on read, so a hand-edited URL cannot produce an invalid state.

## Tests

`bunx vitest run` — 49 tests pass.

- domain (14): coverage is complete, every kind used, every layer reached,
  all four fields present and substantive, false-positive ratio, the ten most
  connected concepts all carry evidence.
- evidence-view (11): kind/layer/text filtering, AND semantics across terms,
  search inside the false-positive text, grouping order, unknown concepts
  dropped, URL list round-trips rejecting unknown values.
- Browser: the index renders 85 cards in 51 groups, kind filter narrows to 4,
  adding text narrows to 3, clearing restores, concept page shows 3 cards, the
  graph panel shows the "Observable as" strip. No console errors.

## Known problems

- The index renders every card at once (85 today). Fine now; if evidence grows
  past a few hundred it needs windowing — noted for Phase 10.
- Evidence is authored by the agent from standard practice. It is accurate as
  guidance, but signal names vary by runtime and version; treat them as the
  name to search for, not a copy-paste query.

## Deferred work

- Evidence in the database (Phase 6) and as AI context (Phase 8).
- Linking evidence to incident symptoms (Phase 7) — the symptom → evidence →
  concept chain is what the incident engine will walk.

## Exact next phase

Phase 6 — PostgreSQL backend on Lovable Cloud: tables for layers, concepts,
relationships, sources, evidence and the join tables; seed from the curated
TypeScript dataset; typed server functions; UI reads from the database.

## Commands to verify the current state

```bash
bunx vitest run
bunx tsgo --noEmit
# then open /evidence and filter by Query plan
```
