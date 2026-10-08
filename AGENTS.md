<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Backend Atlas rules
1. Never rewrite unrelated files.
2. Do not introduce dependencies without documenting why.
3. Do not build future phases prematurely; build plan phases in order.
4. Every phase finishes with tests and a handoff in docs/handoffs/.
5. Domain logic and graph data must not import React or UI components (keeps them portable/testable).
6. AI must never become a hidden source of truth for graph structure.
7. App chrome (sidebar/topbar) lives in AppShell, rendered once from __root (single layout).
8. Graph view derivation lives in a React-free adapter; ELK owns computed positions so domain records stay presentation-agnostic.
9. The TypeScript domain stays the canonical authoring source; the database is the runtime read path, re-seeded from it (one reviewable place to author knowledge, one fast place to read it).
10. Routes read data only through server functions in `src/lib/*.functions.ts`; loaders never touch the database client directly (loaders are isomorphic, so credentials and SQL must stay server-side).
11. AI writes nothing into the knowledge tables; model output lands in a separate proposals table that a human reviews and applies through the seed (keeps the curated graph auditable).
12. Model context comes only from pure builders in `src/lib/ai-context.ts`, rendered by the same function the UI uses to list the facts, so the shown context and the sent prompt cannot drift.
13. Where a deterministic engine produces a result, the model may narrate it but never re-order or override it (the computed answer stays the answer).
