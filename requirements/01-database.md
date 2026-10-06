# Step 01 — Database

**Goal:** the complete schema from [`docs/database`](../docs/database/DATABASE.md), as migrations, with seed data.
**Depends on:** 00

## Scope
- In: Drizzle schema for all tables, a hand-written migration for triggers/views/trigram index, seed script, DB test helpers.
- Out: API routes that use the tables (later steps).

## Requirements
| ID | Requirement |
| --- | --- |
| R-01-01 | `apps/api/src/db/schema.ts` defines every table, enum, constraint and index in `docs/database/schema.sql` |
| R-01-02 | A hand-written migration adds triggers, views (`spots_view`, `user_quota_usage`, `plan_entry_home`) and the trigram index |
| R-01-03 | `pnpm db:migrate` on an empty database produces a schema equivalent to `schema.sql` |
| R-01-04 | `pnpm db:seed` loads the seed described in `requirements/README.md` and is idempotent |
| R-01-05 | Test helper creates an isolated database (or schema) per test file and tears it down |
| R-01-06 | Typed query helpers exist for `spots_view` and `user_quota_usage` |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-01-01 | db | R-01-01..03 | After `db:migrate`, `docs/database/checks.sql` prints 42 `ok` lines and exits 0 |
| T-01-02 | db | R-01-03 | Schema diff (`pg_dump --schema-only` of migrated DB vs. DB built from `schema.sql`, normalised) is empty |
| T-01-03 | db | R-01-04 | Running `db:seed` twice leaves exactly the seed row counts (3 users, 1 trip, 6 spots, …) |
| T-01-04 | api | R-01-06 | `spots_view` helper returns `display_category = 'planned'` for a seeded spot in a bucket and `'maybe'` for an unplanned maybe spot |
| T-01-05 | api | R-01-05 | Two test files writing the same IDs run in parallel without conflicts |
| T-01-06 | — | R-01-03 | CI runs migrations + checks on a fresh Postgres 16 |
