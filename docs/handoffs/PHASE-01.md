# Phase 0 + 1 Handoff

## Platform deviation
Built on TanStack Start (React 19, TS, Tailwind v4, Vite) instead of Next.js, single app instead of apps/ + packages/. Domain-like code lives in `src/lib` with no React imports so it can later move to a package.

## What exists
- App shell: sidebar, top bar with search, mobile drawer (`src/components/atlas/AppShell.tsx`)
- Routes: `/` dashboard, `/graph` (SVG mock graph + detail panel), `/concepts/$slug`, `/search?q=`
- Mock data: `src/lib/mock-data.ts`
- Editorial design system in `src/styles.css` (Fraunces / IBM Plex)

## Not built (by design)
Database, AI, persistence, ELK, React Flow, real domain model.

## Next phase
Phase 2 — Domain model (Concept, Relationship, Evidence…) with Zod schemas and tests; graph view consumes it.
