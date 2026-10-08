# Phase 3 — Interactive Graph Engine

## Goal
Replace the static neighbourhood diagram with a polished, explorable map of all Backend Atlas concepts while keeping the domain model as the source of truth.

## Build
- Add a pure graph adapter that converts domain concepts and relationships into renderable nodes and edges without importing React.
- Build the canvas with React Flow and ELK automatic layout, including pan, zoom, fit-to-view, minimap, directional edges, and clear layer/relationship styling.
- Add useful exploration controls: full graph vs focused neighbourhood, layer and relationship filters, concept search, reset/fit controls, and URL-synced selection.
- Keep a responsive detail panel with concept summary, inbound/outbound connections, and a link to the full concept entry.
- Preserve the existing Backend Atlas visual language while improving hierarchy, readability, keyboard access, and mobile behavior.

## Technical details
- Add `@xyflow/react` for the proven interaction engine and `elkjs` for deterministic graph layout.
- Keep graph transformation and layout inputs outside UI components so they remain portable and testable.
- Load the browser-dependent canvas only after hydration to preserve server rendering safety.
- Do not change the schema or seed content in this phase.

## Verification and handoff
- Add unit tests for graph adaptation, filtering, focus expansion, and layout integrity.
- Run the complete automated test suite.
- Verify the live graph at desktop and mobile sizes, including node selection, filters, zoom controls, and deep links.
- Document the dependency choices, behavior, limitations, and next-step handoff in `docs/handoffs/PHASE-03.md`.
