# Phase 8 Handoff — AI Layer on Top of the Graph

## Completed

Three graph-grounded AI capabilities, all served through Lovable AI Gateway, all fed from
structured atlas records rather than free text:

- **Explain** (`POST /api/ai/explain`) — streams a seven-section walk-through of one concept
  (Problem, Why, Mechanism, Failure trace, Trade-offs, Alternative, Production evidence) built
  from the entry, its recorded relationships, the two-hop neighbourhood, its evidence cards and
  its cited sources. Surfaced on every concept page.
- **Diagnose** (`POST /api/ai/diagnose`) — streams a reading of a triage session. The ranking is
  computed by the deterministic engine from Phase 7 and handed to the model as fact; the model
  writes it up (Reading, Leading cause, Also possible, What this does not explain, Check next)
  and is explicitly forbidden from re-ranking. Surfaced on `/triage` once signals are selected.
- **Research** (`POST /api/ai/research`) — non-streaming structured generation. Given a topic,
  it is shown what the atlas already records on that topic, the controlled vocabulary (layer ids,
  relationship types, evidence kinds, source kinds, existing concept ids) and the computed gaps,
  then returns a proposal: new concepts, relationships, evidence cards and sources, each with a
  rationale and a verification step. Every proposal is reviewed in code (`reviewProposal`), stored
  in `research_proposals` with status `pending`, and rendered at `/research` with an
  accept/reject decision and a paste-able seed patch. **Nothing is ever written to the knowledge
  tables by the AI.**

Every answer exposes its graph context: the exact records the model received, counted and listed,
with an FNV-1a fingerprint echoed back in the `X-Atlas-Context-Hash` response header so the UI can
flag a mismatch between what the reader is shown and what the model was sent.

## Architecture state

```
src/lib/ai-context.ts    pure context builders (explain / diagnose / research) + renderer + hash
src/lib/ai-prompts.ts    pure instruction sets per capability + user-message builder
src/lib/ai-answer.ts     pure streaming markdown parser (heading/paragraph/list/code + spans)
src/lib/ai-proposal.ts   strict zod proposal schemas, reviewProposal(), proposalToSeedPatch()
        ^ no React, no SDK, no I/O — all four are unit-tested in isolation

src/lib/ai/gateway.ts        provider construction (Lovable AI Gateway), server-only
src/lib/ai/run-id.ts         X-Lovable-AIG-Run-ID fetch wrapper (never mints ids)
src/lib/ai/atlas-ai.server.ts  model calls: streamExplain, streamDiagnose, generateProposal

src/routes/api/ai/explain.ts   server route: loads records -> builds context -> streams
src/routes/api/ai/diagnose.ts  server route: loads records -> runs the engine -> streams
src/routes/api/ai/research.ts  server route: loads records -> generates -> reviews -> stores

src/lib/ai.functions.ts      listResearchProposals / getResearchProposal / decideResearchProposal
src/hooks/use-atlas-answer.ts  streaming state machine (idle/pending/streaming/done/stopped/error)
src/components/atlas/ai/*      AskPanel, AnswerBody, GraphContextCard, Elapsed,
                               ResearchConsole, ProposalView
src/routes/research.tsx        the review desk
```

Flow for a graph-grounded answer: route handler reads the knowledge tables through the server
functions, builds the context with a pure builder, renders it into a prompt with the *same*
renderer the UI uses to list the facts, calls the gateway with streaming on, and returns the
stream plus the context hash. The browser never sees the API key, the model id or the prompt.

## Files changed

New:
- `src/lib/ai-context.ts`, `src/lib/ai-prompts.ts`, `src/lib/ai-answer.ts`, `src/lib/ai-proposal.ts`
- `src/lib/ai-context.test.ts`, `src/lib/ai-answer.test.ts`, `src/lib/ai-proposal.test.ts`
- `src/lib/ai/gateway.ts`, `src/lib/ai/run-id.ts`, `src/lib/ai/atlas-ai.server.ts`
- `src/routes/api/ai/explain.ts`, `src/routes/api/ai/diagnose.ts`, `src/routes/api/ai/research.ts`
- `src/lib/ai.functions.ts`
- `src/hooks/use-atlas-answer.ts`
- `src/components/atlas/ai/AskPanel.tsx`, `AnswerBody.tsx`, `GraphContextCard.tsx`,
  `Elapsed.tsx`, `ResearchConsole.tsx`, `ProposalView.tsx`
- `src/routes/research.tsx`
- `drizzle/migrations/0003_atlas_research_proposals.sql` (applied)

Edited:
- `src/lib/atlas.functions.ts` — `getExplainContextData`, `getResearchContextData` readers
- `src/routes/concepts.$slug.tsx` — Explain panel
- `src/components/atlas/incident/TriageExperience.tsx` — second-reading panel
- `src/components/atlas/AppShell.tsx` — nav extended to eight entries (Research 07)
- `src/styles.css` — `.atlas-caret` streaming cursor
- `src/test/app-routing.test.tsx` — `/research`
- `AGENTS.md` — rules 11–13 (AI never writes knowledge; context is built by pure builders;
  the deterministic ranking always wins)
- `roadmap.md`

## Important decisions

1. **The AI is a reader, never a writer.** `research_proposals` is a separate table outside the
   knowledge schema. Accepting a proposal records a human decision; it does not touch
   `concepts`/`relationships`/`evidence`/`sources`. Applying it means pasting the generated seed
   patch into `src/domain/seed/*` and re-running `bun scripts/seed-database.ts`, which keeps the
   TypeScript domain canonical (AGENTS.md rule 9).
2. **Diagnose cannot re-rank.** The engine ranks; the model narrates. The instructions forbid
   re-ordering and the UI says so above the answer.
3. **One renderer for prompt and UI.** `renderContextPrompt` produces the prompt text and
   `GraphContextCard` lists the same sections, so "what the model was told" is not a claim — the
   hash is computed from the same structure and verified against the response header.
4. **Streaming for every chat call.** Explain and Diagnose stream; the research call is
   structured output consumed server-side. No artificial timeouts; Stop propagates an abort and
   the server treats an expected abort as a cancelled run.
5. **Strict schemas stay small and flat.** Proposal limits are enforced in review code, not in
   the schema (no bounds, formats or enums over runtime data), and generation is guarded against
   `NoObjectGeneratedError` with a text fallback.
6. **Suggestion chips fill the topic box; they never start a run.** A research run costs real
   money and minutes, so it always takes an explicit press.

## Tests

`bunx vitest run` — 132 passed across 11 files.

- `ai-context.test.ts` (24) — explain/diagnose/research contexts carry the right records, stay
  inside the caps on the busiest concept, are deterministic, reject unknown entries, hand over the
  engine's ranking verbatim, report unplaced signals and compute gaps from records.
- `ai-answer.test.ts` — streaming markdown parsing, including unterminated fences and marks.
- `ai-proposal.test.ts` — review drops unknown layers, duplicate ids, dangling endpoints,
  self-loops and over-limit items with readable reasons; the seed patch round-trips.
- `app-routing.test.tsx` — `/research` resolves.

Live verification (Playwright, dev server):
- `/concepts/retry-storm` → Explain streamed all seven headings in ~11 s, grounded in the entry's
  own records, zero console errors.
- `/triage?symptoms=db-latency-up,p99-latency-up,pool-wait-up` → second reading streamed in ~15 s
  and reproduced the engine's order (Query Plan Regression first), zero console errors.
- `/research` → queue renders, proposal expands with entries/links/signals/sources/verification,
  graph context and seed patch, zero console errors.

## Known problems

- A research run takes two to four minutes at the default effort. The UI shows an elapsed timer
  and a plain-language note, but there is no background job: closing the tab loses the run.
- Research proposals are world-readable like the rest of the knowledge base; writes go through a
  server function. There is no per-user ownership because there are no accounts yet (Phase 9).
- No cost ceiling on AI calls yet — deferred to Phase 10 along with structured request logs.

## Deferred work

- Accepted proposals still need a human to paste the seed patch; an "apply to seed" automation was
  deliberately not built (it would make the AI a writer).
- No AI on the graph canvas itself (explaining a *path* rather than a node).
- No caching of explanations; identical questions re-bill.

## Exact next phase

**Phase 9 — Learning system.** Per-concept mastery states and prerequisite-aware
recommendations, progress stored locally for guests and synced to an RLS-protected
`learning_progress` table when signed in, a `/learn` route, and status controls wherever a
concept appears. Tests plus `docs/handoffs/PHASE-09.md`.

## Commands to verify the current state

```bash
bunx tsgo --noEmit
bunx vitest run
bun scripts/verify-database.ts
```
