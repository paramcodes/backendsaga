# Phase 4 Handoff — Exploration UX

## Completed

The knowledge graph became an exploration tool rather than a picture.

- Depth-limited neighbourhoods (1–3 hops) with an induced subgraph: every edge
  between visible concepts is drawn, so second-hop structure is visible.
- Relevance-ranked search (name matches beat body matches, all terms must
  match) shared by the graph search box and the `/search` page.
- Breadcrumb trail that rewinds instead of duplicating when you revisit a
  concept, with a back control.
- Relationship inspection: clicking an edge (or the relation label in the
  detail panel) opens an inspector explaining what that relationship type
  means between those two concepts.
- Layer navigation: sidebar layers open a layer subgraph; the filter panel has
  a per-layer "only" action; a chip in the toolbar exits layer mode.
- Keyboard control: `/` search, `↑ ↓` results, `j k` connections, `Enter`
  select, `f` focus, `a` atlas, `1 2 3` depth, `l` filters, `.` fit, `e` open
  entry, `Backspace` back, `?` shortcuts, `Esc` dismiss.
- Exploration state is shareable: `focus`, `mode`, `depth` and `layer` live in
  the URL and are applied when the route changes under a mounted view.

## Architecture state

```text
src/domain/**            canonical knowledge (React-free)
src/lib/graph-explore.ts exploration algorithms (React-free)
src/lib/graph-model.ts   view derivation: focus | atlas | layer
src/lib/graph-layout.ts  ELK layout (owns all coordinates)
src/components/atlas/graph/*  presentation components
src/components/atlas/GraphExperience.tsx  state orchestration only
```

`GraphExperience` holds state and passes data down; every panel is a pure
presentational component. No coordinates are stored in the domain.

## Files changed

- Added `src/lib/graph-explore.ts`, `src/lib/graph-explore.test.ts`
- Added `src/components/atlas/graph/`: `ConceptNode.tsx`, `GraphToolbar.tsx`,
  `GraphFiltersPanel.tsx`, `ConceptDetailPanel.tsx`, `RelationshipInspector.tsx`,
  `Breadcrumbs.tsx`, `ShortcutsDialog.tsx`, `edge-style.ts`
- Rewrote `src/components/atlas/GraphExperience.tsx`
- Updated `src/lib/graph-model.ts` (depth, layer mode, distances),
  `src/routes/graph.tsx` (URL schema), `src/routes/search.tsx` (ranking),
  `src/components/atlas/AppShell.tsx` (layer links), `src/styles.css`

## Important decisions

1. Focus mode returns the induced subgraph, not a star. Seeing that two
   neighbours are themselves connected is usually the insight.
2. Exploration state lives in the URL so a neighbourhood can be shared.
3. Selecting a concept outside the open layer leaves layer mode, so the canvas
   never contradicts the detail panel.
4. Ranking is deterministic (score, then name length, then alphabetical) so the
   same query always produces the same order in tests and in the UI.

## Tests

`bunx vitest run` — 30 tests pass (domain 7, graph view 3, exploration 16,
routing 4). Browser verification with Playwright covered depth switching,
keyboard selection, the relationship inspector, the shortcuts dialog, atlas
mode, layer navigation from the sidebar and search-to-select.

## Known problems

- At very tall viewports the fitted graph can look small; ELK's layered
  algorithm produces wide layouts. Acceptable; revisit in Phase 10 performance.
- The atlas view renders all 51 nodes at once. Fine at this size, but viewport
  culling is queued for Phase 10.

## Deferred work

- Playwright specs committed to the repository (Phase 10).
- Evidence is still the thin Phase 2 record; Phase 5 expands it.

## Exact next phase

Phase 5 — Evidence model: extend the evidence record with what you would see,
where to look, why it matters and the likely false positive; cover at least 20
concepts; surface evidence cards in the UI.

## Commands to verify the current state

```bash
bunx vitest run
bunx tsgo --noEmit
# then open /graph and press ?
```
