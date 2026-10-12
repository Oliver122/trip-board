# Step 00 — Repo & tooling

**Goal:** an empty but runnable monorepo with linting, tests and CI, so every later step only adds features.
**Depends on:** —
**Result:** `pnpm dev` starts web + api, CI is green
**Core:** C-APP-02, C-OPS-01, C-OPS-02, C-OPS-03, C-OPS-04, C-OPS-05, C-OPS-06, C-OPS-07, C-OPS-18
**Status:** integrated 2026-10-11

## Scope
- In: pnpm workspaces (`apps/web`, `apps/api`, `packages/shared`), TypeScript, ESLint + Prettier, Vitest, Playwright, Docker Compose (Postgres 16 + MinIO), CI pipeline, `.env.example`.
- Out: any feature code, database tables.

## Requirements
| ID | Requirement |
| --- | --- |
| R-00-01 | `pnpm install && pnpm dev` starts web (Vite) and api (Fastify) together; ports come from env (`WEB_PORT`, `API_PORT`) with non-default fallbacks |
| R-00-02 | `docker compose up -d` starts Postgres 16 and MinIO with healthchecks |
| R-00-03 | `GET /health` on the api returns `{ status: "ok", db: "ok" \| "down" }` |
| R-00-04 | Web proxies `/api/*` to the api in dev, so the browser uses one origin |
| R-00-05 | `packages/shared` is importable from both apps (one exported Zod schema used by both as proof) |
| R-00-06 | Scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:migrate`, `db:seed` (last two may be stubs) |
| R-00-07 | Config is read from env and validated at startup with Zod. Missing required vars stop the api with a clear message |
| R-00-08 | CI runs install → lint → typecheck → unit/api tests (with Postgres service) → build → e2e smoke |
| R-00-09 | README explains prerequisites, setup and every script |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-00-01 | api | R-00-03 | Given Postgres is up, `GET /health` returns 200 `{status:"ok",db:"ok"}`. Given the DB is unreachable, it returns 503 with `db:"down"` |
| T-00-02 | unit | R-00-07 | Config parser throws a readable error listing missing `DATABASE_URL` |
| T-00-03 | unit | R-00-05 | Shared schema validates the same sample in a web test and an api test |
| T-00-04 | e2e | R-00-01, R-00-04 | Opening the web root shows a placeholder page, and a fetch to `/api/health` from the page succeeds |
| T-00-05 | manual | R-00-02, R-00-09 | On a clean machine, following only the README gets the app running |
| T-00-06 | — | R-00-08 | CI pipeline is green on the main branch |
