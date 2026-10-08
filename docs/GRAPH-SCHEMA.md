# Graph Schema

Authoring source of truth: `src/domain/schema.ts` (Zod) with data in `src/domain/seed/*`. The database is the runtime read path, seeded from that dataset and read through the server functions in `src/lib/atlas.functions.ts`.

| Entity | Key fields |
|---|---|
| Layer | id, name, order, description |
| Concept | id = slug (kebab-case), name, layerId, description, problem?, why?, mechanism?, tradeoffs?, betterAlternative? |
| Relationship | id = `source--type--target`, sourceId, targetId, type |
| Evidence | id, conceptId, kind, trend, signal (OTel-style name), whatYouSee, whereToLook, whyItMatters, falsePositive? |
| Source | id, kind, title, author, year?, url, note |
| ConceptSource | conceptId, sourceId, relevance (why this source matters for this concept) |

Source kinds: BOOK, PAPER, RFC, DOCS, ARTICLE, SPEC, TALK. Every concept carries at least one source; the `relevance` note is per link, not per source, so the same book can be cited for different reasons.

Relationship types: CAUSES, AMPLIFIES, MITIGATES, DEPENDS_ON, TRADEOFF_OF, ALTERNATIVE_TO, OBSERVED_BY, REQUIRES. Direction reads "source TYPE target".

Evidence kinds: METRIC, LOG, TRACE, PROFILE, QUERY_PLAN, PACKET, OS_COUNTER.
Evidence trends: UP, DOWN, SPIKE, FLAT, PRESENT — the direction the signal moves when the concept is active.

An evidence card must answer four questions: what you would see, where you would look, why that signal matters, and what else produces the same signal (`falsePositive`). Mitigations get evidence too: how you would know the protection is working.

## Invariants (enforced by `validateGraph`, tested in `src/domain/domain.test.ts`)
- Unique ids for every entity; unique concept slugs
- Every concept references an existing layer
- No dangling relationship/evidence references; no self-loops
- Only known relationship types and evidence kinds
- Every concept has at least one relationship

## Database shape (Phase 6)

Tables mirror the entities above with snake_case columns: `layers`, `concepts`, `relationships`, `sources`, `evidence`, `concept_sources`, plus `incidents` (empty until Phase 7). The domain invariants are duplicated as database constraints — unique slugs and layer order, checked relationship types and evidence kinds/trends, no self-loops, unique `(source_id, type, target_id)` — so neither layer can drift without the other failing loudly.

Two extras exist only in the database:

- `concepts.search_text` — a generated, lowercased concatenation of name, description and the four prose fields, used for text search.
- `concept_neighborhood(concept_id, depth)` and `atlas_stats()` — SQL functions for recursive traversal and dashboard counts.

All knowledge tables are readable by anyone and writable by no one: RLS with a public SELECT policy, and INSERT/UPDATE/DELETE revoked from the public roles. Re-seed with `bun scripts/seed-database.ts`; check the live contract with `bun scripts/verify-database.ts`.
