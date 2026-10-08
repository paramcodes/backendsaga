# Backend Atlas roadmap

Phases 0–3 are complete (contract, app shell, domain model, graph engine).
Remaining phases follow the uploaded build plan, in order.

## Phase 4 — Exploration UX (done)
- [x] Pure exploration module: depth-limited neighbourhoods, ranked search, paths, relationship meanings
- [x] Breadcrumb trail, depth control, layer navigation, relationship inspector
- [x] Keyboard shortcuts + shortcuts dialog
- [x] Tests + docs/handoffs/PHASE-04.md

## Phase 5 — Evidence model (done)
- [x] Extend evidence schema with: what you would see / where to look / why it matters / false positive
- [x] Evidence for at least 20 concepts (85 signals, all 51 concepts)
- [x] Evidence cards on concept pages, evidence index route, evidence in the graph panel
- [x] Tests + docs/handoffs/PHASE-05.md

## Phase 6 — PostgreSQL backend (Lovable Cloud) (done)
- [x] Enable Cloud; migration for layers, concepts, relationships, sources, evidence, incidents and join tables
- [x] Seed the database from the curated TypeScript dataset (idempotent script)
- [x] Typed, Zod-validated server functions: graph, concepts, layers, neighbors, evidence, library, search
- [x] UI reads graph data from the database; knowledge tables locked read-only to the public
- [x] Tests + docs/handoffs/PHASE-06.md

## Phase 7 — Incident engine (done)
- [x] Incident + symptom model (29 symptoms, 91 evidence links), deterministic diagnosis engine over the graph
- [x] 10 incident scenarios seeded in the database; all replay with the documented cause in the top two
- [x] Incident routes (/triage, /incidents, /incidents/$slug) and the cause-chain diagram
- [x] Tests + docs/handoffs/PHASE-07.md

## Phase 8 — AI layer
- [x] Graph context builder (pure) + Lovable AI gateway server function
- [x] Explain / Diagnose / Research capabilities, every answer exposes its graph context
- [x] Research produces proposals; never mutates canonical knowledge
- [x] Tests + docs/handoffs/PHASE-08.md

## Phase 9 — Learning system
- [ ] Per-concept mastery states and prerequisite-aware recommendations
- [ ] Progress persistence (local for guests, account sync when signed in)
- [ ] Learning route + status controls across the app
- [ ] Tests + docs/handoffs/PHASE-09.md

## Phase 10 — Production hardening
- [ ] Performance: layout cost, viewport culling, memoisation, search index, DB indexes
- [ ] Accessibility, error boundaries, loading states, mobile, SEO
- [ ] Observability: structured logs, request ids, AI cost control, rate limiting
- [ ] Playwright end-to-end tests (including the Phase 1 smoke test deferred earlier)
- [ ] docs/OPERATIONS.md, docs/PRODUCTION.md, docs/handoffs/PHASE-10.md
