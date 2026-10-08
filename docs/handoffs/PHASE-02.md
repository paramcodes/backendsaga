# Phase 2 Handoff — Domain Model

## What exists
- Zod schema + types: `src/domain/schema.ts`
- Seed: 8 layers, 52 concepts, ~85 relationships, 12 evidence items (`src/domain/seed/`)
- Queries + `validateGraph`: `src/domain/index.ts` (no React)
- UI now reads only from the domain; Phase 1 mock data removed
- Graph page: neighbourhood view (selected concept + direct relationships), layer index, `?focus=` deep link
- Concept page shows relationships with direction and evidence

## Tests
`bunx vitest run` — domain validity (ids, types, layers, dangling refs, connectivity), validator negative cases, search, route matching for all pages. Playwright smoke test from Phase 1 not yet added.

## Decisions
- Concept id == slug for now.
- Node positions are computed in the UI, never stored in the domain.
- 8 layers instead of the plan's 19; extend in seed/layers.ts.

## Next phase
Phase 3 — Graph engine (React Flow + ELK) consuming `domainGraph` via an adapter.
