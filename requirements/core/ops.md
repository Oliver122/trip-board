# Core — Ops

How the repo is built, run, checked and shipped: the dev setup and scripts, configuration and health, the database (migrations, checks, seed, test databases), server hardening that applies to every route, housekeeping jobs, the CI pipeline and its end-to-end matrix, the deploy to production, local dev login settings, e2e stability rules, and the texture atlas tooling. Login behavior is in [auth](./auth.md), the web side of errors and hardening in [app](./app.md), and the kinds whose symbols the textures decorate in [kinds](./kinds.md). The requirements process itself (core files, index, `pnpm req:check`) is added by step 30.

## Repo, config and health

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-OPS-01 | `pnpm dev` starts the web app (Vite) and the API (Fastify) together on ports from `WEB_PORT` and `API_PORT` (defaults 5180 and 4080, no fallback to another port), and Vite proxies `/api/*` to the API so the browser uses one origin. <!-- R-00-01, R-00-04 --> | active | 00 | — | T-00-04 |
| C-OPS-02 | `docker compose up -d` starts Postgres 16 and MinIO, each with a healthcheck; `.env.example` lists every variable the API reads. <!-- R-00-02 --> | active | 00 | — | T-00-05 |
| C-OPS-03 | The root scripts are `dev`, `dev:local`, `dev:e2e`, `build`, `lint` (eslint plus prettier check), `typecheck`, `test`, `test:e2e`, `db:migrate`, `db:seed`, `db:check`, `db:metrics`, `check:bundle`, `textures:template`, `textures:manifest` and `push`; every workspace package keeps a `build` script, so `pnpm -r --if-present build` cannot skip one. <!-- R-00-06, R-21-04, R-22-08, R-29-16 --> | active | 00 | 21, 22, 29 | — |
| C-OPS-04 | The API reads its configuration from the environment and validates it at startup with Zod: without `DATABASE_URL` it stops with a message naming the missing variable, and with `NODE_ENV=production` it also requires the Discord, `AUTH_SECRET`, `WEB_ORIGIN` and S3 settings. <!-- R-00-07 --> | active | 00 | — | T-00-02 |
| C-OPS-05 | `GET /health` answers `{status: "ok", db: "ok"}` with `200`, or `db: "down"` with `503` when the database is unreachable. <!-- R-00-03 --> | active | 00 | — | T-00-01 |
| C-OPS-06 | `packages/shared` is imported by both apps; the same Zod schemas validate the same sample in a web test and an API test. <!-- R-00-05 --> | active | 00 | — | T-00-03 |
| C-OPS-07 | `README.md` explains the prerequisites, setup, every script, every environment variable with its kind and whether production needs it, the `production` environment and branch ruleset for deploys, and `pnpm dev:local`. <!-- R-00-09, R-21-08, R-22-11 --> | active | 00 | 21, 22 | T-00-05, T-21-12, T-22-10 |

## Database

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-OPS-08 | `apps/api/src/db/schema.ts` defines every table, enum, constraint and index, and numbered SQL migrations (tables, then triggers, views and the trigram index, then each later change) are applied in order and tracked by hash. `pnpm db:migrate` on an empty database gives a schema equal to `docs/database/schema.sql`. <!-- R-01-01, R-01-02, R-01-03 --> | active | 01 | — | T-01-01, T-01-02 |
| C-OPS-09 | `pnpm db:check` migrates a scratch database and runs `docs/database/checks.sql`, which must print exactly the expected number of `ok` lines (74 today) and nothing else. <!-- R-01-01, R-01-03 --> | active | 01 | — | T-01-01 |
| C-OPS-10 | `pnpm db:seed` applies the migrations and loads the seed data described in `requirements/README.md` (users sven, aiko and tom, the *Japan 2026* trip with spots, homes and plans); running it twice leaves exactly the seed row counts. <!-- R-01-04 --> | active | 01 | — | T-01-03 |
| C-OPS-11 | Test helpers create an isolated, migrated database per test file (`tb_<random>`, dropped with `WITH (FORCE)` at the end), so files writing the same ids can run in parallel; typed helpers return a spot's display category from `spots_view` and a user's quota from `user_quota_usage`. <!-- R-01-05, R-01-06 --> | active | 01 | — | T-01-05, T-01-04 |
| C-OPS-12 | Housekeeping jobs run on timers inside the API: expired sessions hourly; invites older than 90 days, geocode cache older than 30 days and activity events older than 180 days daily; queued image blob deletions every minute. <!-- R-15-05, R-17-11 --> | active | 15 | 17 | T-15-05, T-17-10 |

## Server hardening

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-OPS-13 | Every response carries a `Content-Security-Policy` (self plus the tile and blob origins, `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`, plus HSTS in production only. <!-- R-15-03 --> | active | 15 | — | T-15-03 |
| C-OPS-14 | A global rate limit of 300 requests per minute per session (per IP without one) answers `429 rate_limited` with `Retry-After`; the live events stream is excluded. <!-- R-15-04, R-19-06 --> | active | 15 | 19 | T-15-04 |
| C-OPS-15 | Every response has an `x-request-id`, logs are structured JSON carrying that id, and an unexpected error returns `500 {error: "internal", requestId}` without internals. <!-- R-15-08 --> | active | 15 | — | T-15-08 |
| C-OPS-16 | Every API error goes through `sendError` and has the shape `{error: <code>, fields?, ...extra}` (described by `apiErrorBodySchema`), and malformed id path parameters are `400 invalid_request` with the standard body. <!-- R-26-10, R-26-11 --> | active | 26 | — | T-26-12, T-26-13 |
| C-OPS-17 | The first route's JavaScript stays within 250 kB gzip, with the map library and the import dialog as separate lazy chunks; `pnpm check:bundle` fails the build otherwise. <!-- R-15-07, R-21-04 --> | active | 15 | 21 | T-15-07, T-21-01 |

## CI pipeline

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-OPS-18 | One workflow, `.github/workflows/ci.yml`, runs on every pull request and on pushes to `main`; a newer push to the same pull request cancels the older run, runs on `main` are never cancelled. It runs jobs `static`, `build`, `e2e`, `e2e-report`, `ci-passed` and `deploy` on `ubuntu-24.04` with Node 22, pnpm from `packageManager`, a frozen lockfile and the pnpm store cache. <!-- R-00-08, R-21-01, R-21-02, R-21-35 --> | active | 00 | 21 | T-21-01, T-21-20 |
| C-OPS-19 | `static` runs against Postgres 16 and MinIO with the CI environment and no secrets: `db:migrate`, `db:check`, `pnpm lint`, `pnpm typecheck` and `pnpm test`. <!-- R-21-03 --> | active | 21 | — | T-21-01, T-21-13 |
| C-OPS-20 | `build` runs `pnpm build`, fails if `texture-manifest.json` differs from what the atlas produces, and then runs `pnpm check:bundle`. <!-- R-21-04, R-29-18 --> | active | 21 | 29 | T-21-01, T-29-19 |
| C-OPS-21 | `e2e` is a matrix over `chromium`, `firefox`, `webkit` and `mobile` (Chromium with iPhone 14 emulation) with `fail-fast: false` and a 30-minute timeout; each job has Postgres, MinIO and the seeded database, installs and caches only its own browser, and the `chromium` job builds the web app first for the Lighthouse test. With a green suite each job is expected to finish in under 15 minutes. <!-- R-15-10, R-21-05, R-21-06, R-21-07, R-21-30, R-21-36 --> | active | 15 | 21 | T-21-02, T-21-03, T-21-17, T-21-20 |
| C-OPS-22 | Playwright reports `blob` and `github` in CI and `list` locally, keeps a trace on first retry plus screenshots and video on failure, and retries once in CI. Each `e2e` job uploads its blob report (1 day), and `e2e-report` merges them into one HTML `playwright-report` artifact (14 days) and a job summary with passed, failed, flaky and skipped counts per project and the names of failed and flaky tests. <!-- R-21-09, R-21-10, R-21-11, R-21-12, R-21-15 --> | active | 21 | — | T-21-04, T-21-05 |
| C-OPS-23 | `ci-passed` needs `static`, `build`, `e2e` and `e2e-report`, runs even when they fail, and fails unless every one ended `success` (skipped or cancelled counts as failed). It is the only required check of the `main` ruleset (pull request, up-to-date branch, no force push, no bypass). <!-- R-21-13, R-21-14 --> | active | 21 | — | T-21-03, T-21-06 |

## Deploy

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-OPS-24 | `deploy` runs only for a push to `main` in `Oliver122/trip-board` after `ci-passed`, uses the GitHub environment `production` that holds all deploy secrets and variables, and runs one at a time (`deploy-production`, never cancelled). Pull request runs skip it and never see the secrets. <!-- R-21-16, R-21-17, R-21-18 --> | active | 21 | — | T-21-07, T-21-08, T-21-09 |
| C-OPS-25 | `scripts/write-deploy-env.sh` fails naming the missing key (never a value) unless host, user, path, `WEB_ORIGIN`, the SSH private key and `DEPLOY_KNOWN_HOSTS` are set, then writes a mode-600 deploy env with the non-empty values, the key file and `~/.ssh/known_hosts`; `scripts/deploy.sh` uploads the commit, migrates and restarts the service. <!-- R-21-19, R-21-20, R-21-21 --> | active | 21 | — | T-21-07, T-21-10 |
| C-OPS-26 | After the deploy, `scripts/deploy-health.sh` polls `${WEB_ORIGIN}/api/health` for up to 60 seconds, expects `200` with `status: "ok"` and `db: "ok"`, and writes the commit and the response to the job summary; the credentials are removed at the end. <!-- R-21-22 --> | active | 21 | — | T-21-07 |
| C-OPS-27 | `pnpm push` from a laptop with a local `deploy.env` runs the same `scripts/deploy.sh` as CI, and a rollback is a re-run of the `deploy` job of an earlier green run on `main`; migrations are never reverted. <!-- R-21-23, R-21-24 --> | active | 21 | — | T-21-11, T-21-12 |
| C-OPS-28 | `scripts/deploy.sh` never writes `DEV_LOGIN` to the server `.env` and stops before restarting the service, naming the key, when the server `.env` already has `DEV_LOGIN=1`; `.env.example` lists `DEV_LOGIN=0` with a warning. <!-- R-22-03 --> | active | 22 | — | T-22-03 |
| C-OPS-29 | `pnpm dev:local` starts web and API with `DEV_LOGIN=1` and `NODE_ENV=development` on the standard ports without any Discord settings, and `pnpm dev` keeps running without the dev login; `pnpm dev:e2e` starts the API in test mode for Playwright. <!-- R-22-08 --> | active | 22 | — | T-22-08, T-22-10 |

## E2E stability

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-OPS-30 | `pnpm test` ends with no unhandled errors: every `pg.Pool` and `pg.Client` has an `error` listener, `TripHub.stop()` also ends a client whose connect was still running and cancels a pending reconnect, and tests close the app and the pool before dropping their database. <!-- R-21-25 --> | active | 21 | — | T-21-13 |
| C-OPS-31 | The suite never depends on shared mutable data: seeded trips, spots and users stay as `db:seed` left them, tests that change a language or user settings use a fresh user (or `showLocale`, which only rewrites the page's `/api/me`), tests that change global settings run serially and restore them, and `mode: 'serial'` is used only where tests really depend on each other. <!-- R-21-28, R-21-29, R-27-02 --> | active | 21 | 27 | T-21-15, T-21-16, T-27-02 |
| C-OPS-32 | E2E assertions wait for the visible condition: no `waitForTimeout`, `test.slow`, raised timeouts or added retries in the cleanup spec (a guard test enforces it), and an app bug behind a flake gets a component unit test (the menu keeps focus after a refetch). <!-- R-27-03, R-27-04 --> | active | 27 | — | T-27-03, T-27-04 |
| C-OPS-33 | The suite fails fast and clearly without WebGL: a first test in every project checks for a `webgl2` or `webgl` context, the Firefox job runs headed under Xvfb with software GL, and the shared map helpers stop at once when the page logged `Failed to create WebGL context`. <!-- R-21-26, R-21-27 --> | active | 21 | — | T-21-14 |
| C-OPS-34 | Shared e2e helpers remove timing flakes: `settle` waits until no animation is running before `expectHover` and every axe run, `focusByKeyboard` starts from a known element and works in all three engines, the export link sets `download` so WebKit downloads it, and the invite-link test stubs `navigator.clipboard`. <!-- R-21-31, R-21-32, R-21-33, R-21-34 --> | active | 21 | — | T-21-18, T-21-19 |
| C-OPS-35 | The 401 cleanup test waits for an idle page before clearing cookies, `cleanup.spec.ts` has a `T-26-16` test for the shared locale keys and runs on Firefox and WebKit (Chromium-only tests carry `@chromium`), `prettier --check .` passes (`.claude` is ignored), and the cleanup spec stays green 10 times in a row. <!-- R-27-05, R-27-06, R-27-07, R-27-08, R-27-09 --> | active | 27 | — | T-27-05, T-27-06, T-27-07, T-27-08, T-27-09 |

## Texture tooling

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-OPS-36 | `pnpm textures:template` writes `docs/textures/kind-symbols-template.png`: a deterministic 1024×1024 transparent PNG of 8×8 cells of 128 px with a 1 px grid, a dashed guide for each cell's inscribed circle, the cell index and symbol key, and a light grey reference symbol. `docs/textures/README.md` is the artist brief. <!-- R-29-16, R-29-17 --> | active | 29 | — | T-29-16, T-29-17 |
| C-OPS-37 | `pnpm textures:manifest` reads `apps/web/public/textures/kind-symbols.png` (if it exists) and writes `apps/web/src/kinds/texture-manifest.json` `{version, filled}` where `version` is the PNG's content hash and `filled` lists the cells that have pixels inside their circle; no PNG gives an empty list, a PNG that is not 1024×1024 exits non-zero, and `pnpm build` runs it first. <!-- R-29-18 --> | active | 29 | — | T-29-18 |

## Requirements process

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-OPS-38 | `requirements/core/` holds one file per area (17 areas, fixed `C-<AREA>-NN` prefixes) that describes current behavior as rule rows `\| ID \| Rule \| Status \| Since \| Changed by \| Tests \|`, with a `## Known gaps` list at the end; where step text and code disagree, the rule follows the code and the gap names the R-ID and file. The exact format is `requirements/core/_FORMAT.md`. <!-- R-30-01, R-30-03, R-30-04 --> | active | 30 | — | T-30-01, T-30-05, T-30-06 |
| C-OPS-39 | Every R-row of an integrated step is folded into a core rule (its R-ID in the rule's source comment and its step in *Since* or *Changed by*) or listed with a reason in `requirements/core/_unmapped.md`. Each step file carries `**Result:**`, `**Core:**` and `**Status:**` lines under **Depends on**. <!-- R-30-02, R-30-05 --> | active | 30 | — | T-30-04 |
| C-OPS-40 | A new step is a change to the core: it has a `## Core changes` table (`add`, `modify`, `remove` with the causing R-IDs), `/req-new` writes it from the affected core files, `/req-implement` applies it to the core files only after the DoD passes (integrate: rule text, *Changed by*, *Tests*, status, `**Status:** integrated <date>`, `pnpm req:build`), and `/req-test-report` adds a Core line with the changed IDs and the `req:check` result. <!-- R-30-06, R-30-07, R-30-08, R-30-09 --> | active | 30 | — | T-30-07 |
| C-OPS-41 | `pnpm req:build` (`scripts/req/req.mjs`, no runtime dependency) writes `requirements/INDEX.md`: the step graph from **Depends on**, the steps table with status, core IDs and result, every core rule with its located test files, and a coverage summary. The output is byte-identical across runs and passes prettier, and `requirements/README.md` links it instead of keeping its own graph and table. <!-- R-30-10, R-30-11, R-30-12 --> | active | 30 | — | T-30-02, T-30-09 |
| C-OPS-42 | `pnpm req:check` exits non-zero with one `file:line` message per problem: stale `INDEX.md`, duplicated, malformed or misplaced core IDs, bad tables, core changes that name missing or already existing IDs or are not reflected after integrate, unknown T-IDs, active rules without tests outside Known gaps, and non-manual/ci T-IDs not mentioned in any file under `apps/`, `packages/`, `e2e/` or `scripts/`. CI runs it in the `static` job, so it gates `ci-passed`. <!-- R-30-13, R-30-14, R-30-15 --> | active | 30 | — | T-30-03, T-30-05, T-30-08 |

## Known gaps

- C-OPS-03: no test or check lists the root scripts, so R-00-06 is untested.
- C-OPS-09: T-01-01 and R-01-03 text say the checks print 42 `ok` lines; `apps/api/src/db/checks.ts` (`expectedCheckCount`) expects 74, and the rule describes the code.
- C-OPS-17: R-15-07 asks for an interactive time under 2.5 s with 300 spots; `e2e/perf.spec.ts` (T-15-07) runs Lighthouse on the 6-spot seeded board and asserts a performance score of at least 0.85 instead, and the bundle budget is only enforced by `scripts/check-bundle.mjs`.
- C-OPS-21: R-21-07 says the whole suite passes on all four projects, but `playwright.config.ts` limits the `mobile` project to tests tagged `@mobile` (the WebGL check and the responsive spec), so R-15-10's “core suite on a mobile viewport” is only partly met. T-15-11 (“core suite green on Chromium, WebKit and mobile”) has no single tagged test, so it is not listed in Tests.
