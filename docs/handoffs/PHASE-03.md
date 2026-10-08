# Phase 3 Handoff — Interactive Graph Engine

## What exists
- React Flow canvas with pan, zoom, fit-to-view, draggable nodes and a navigable minimap.
- ELK layered layout computes node positions at runtime; positions never enter domain data.
- Focus mode shows a selected concept and its immediate neighbourhood; Atlas mode exposes the full graph.
- Search, layer filters and relationship-type filters update the canvas without changing graph data.
- Node selection updates the detail panel and the shareable `?focus=` URL.
- Responsive layout preserves the graph and detail panel on small screens.
- `src/lib/graph-model.ts` is the React-free view adapter; `src/lib/graph-layout.ts` owns layout translation.

## Dependencies
- `@xyflow/react`: proven interaction engine for graph rendering, controls, minimap and accessible node selection.
- `elkjs`: deterministic automatic layout for dense directed graphs.

## Tests and verification
- `bunx vitest run`: 14 tests pass, including focus, complete-atlas and filter behavior.
- Live Playwright verification: focus navigation, full-atlas mode, concept search, URL synchronization, desktop and mobile layouts.
- Latest preview build: clean; no browser console or runtime errors observed.

## Decisions
- Focus mode is the default because it keeps causal paths legible; Atlas mode is available as an explicit overview.
- Relationship labels appear in focus mode and are omitted in Atlas mode to reduce visual noise.
- The canvas loads client-side so the browser-only graph engine never enters server rendering.

## Next phase
Phase 4 should begin only from the uploaded build plan; no future-phase functionality was added here.
