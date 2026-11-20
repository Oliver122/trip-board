# Step 45 — Close out step 44, slim the dashboard, add service health

**Goal:** step 44 is integrated and verified on the host, and the admin dashboard trades its three never-moving charts (signups, top 10 users, top 10 trips) for a service-health panel that answers the questions an admin of a small platform actually has: is the API restarting, are requests failing, did the housekeeping jobs run.
**Depends on:** 17, 44
**Result:** After a deploy, `kill <api pid>` on the host and `/health` answers again within seconds (step 44's Result, now verified). `/admin` shows three charts (active users, activity by type, storage growth) plus a *Service health* panel: process start time, API starts per day, 5xx and 429 counts per day, and every housekeeping job with its last run, result and an overdue flag — each job with a *Run now* button that runs it at once.
**Core:** C-ADMIN-28, C-ADMIN-34, C-OPS-56
**Status:** planned

## Scope
- In: integrating step 44's core changes and verifying its Result on the host after a deploy; removing the signups-per-day, top-10-users and top-10-trips charts (UI, locale keys, and the `topUsers` / `topTrips` queries in `GET /admin/metrics`); new tables `ops_counters` and `job_runs`; counting API starts, 5xx and 429 responses; recording every housekeeping job run; `GET /admin/ops` and the dashboard *Service health* panel; `POST /admin/ops/jobs/:job/run`.
- Out: serving a production build and `NODE_ENV=production` (I-01, its own step); external monitoring, uptime probes and log shipping (I-15); alerting on error counts (the Discord webhook stays capacity-and-requests only, C-ADMIN-32/C-ADMIN-13); moving counters out of the process (I-32); request latency percentiles (needs a histogram store, a later step if ever).

## Current behavior
| Topic | Today |
| --- | --- |
| Step 44 | Implemented on `step-44-api-stability` but `**Status:** planned`: C-OPS-54/55 are not in `core/ops.md`, C-OPS-14, C-IMG-02/05, C-MEMB-16 and C-SPOT-11 still show the pre-44 text. Its Result (kill the API child, systemd restarts the unit) has never run on the host |
| Dashboard | Six charts (C-ADMIN-28). On a platform with a handful of users, signups per day is a flat zero line and the two top-10 bars never change — three of six charts carry no information |
| Top-10 queries | `GET /admin/metrics` computes `topUsers` and `topTrips` on every dashboard load (`apps/api/src/admin/metrics.ts:24`) only to feed the dropped charts |
| Service visibility | Nothing records API starts, error responses or job outcomes. A housekeeping job failure is one `console.error` line (`apps/api/src/housekeeping/jobs.ts:87`) nobody reads; a crash loop after a deploy is invisible unless someone watches `journalctl` |
| Job control | No way to run a housekeeping job on demand; after changing capacity settings an admin waits until 00:05 UTC for the metrics snapshot |

## Decisions
| Topic | Decision |
| --- | --- |
| Counting without load | 5xx and 429 are counted in memory by an `onResponse` hook and flushed to `ops_counters` every 60 s and on close, so a scanner flood never turns refusals into database writes; a crash loses at most 60 s of counts, which is fine for trend data. `api_starts` is written directly once at boot |
| Days | `ops_counters.day` is the UTC date, like `metrics_daily` |
| Job list | The seven jobs are the existing names in `startHousekeeping`: `sessions`, `invites`, `geocode`, `commons`, `activity`, `blobs`, `metrics`. `job_runs` keeps one row per job (upsert), not a history — `blobs` runs every minute and a history table would be churn for nothing |
| Overdue | A job is flagged overdue when its last start is older than twice its interval; a job with no row shows as "not yet run". The API returns each job's interval so the UI needs no duplicate of the schedule |
| Run now | `POST /admin/ops/jobs/:job/run` calls the same job function the timer calls and awaits it, so the response carries the real outcome; it records the run in `job_runs` and an `admin_audit_log` row like every admin write (C-ADMIN-19) |
| Never in the way | Recording is best-effort everywhere: a failed counter flush, start insert or job-run upsert writes one structured error log line and never fails the request, the boot or the job itself |

## Requirements

### Step 44 close-out
| ID | Requirement |
| --- | --- |
| R-45-01 | Step 44 is integrated: its `## Core changes` table is applied to the core files (C-OPS-54 and C-OPS-55 added; C-OPS-14, C-IMG-05, C-MEMB-16, C-SPOT-11 and C-IMG-02 modified with step 44 in *Changed by* and its tests listed), step 44's header says `**Status:** integrated <date>`, and `pnpm req:build` and `pnpm req:check` pass (no core change) |
| R-45-02 | After the next deploy, step 44's Result is verified on the host and recorded in this step's report: `kill <api pid>` of the running unit → systemd restarts the whole unit and `/health` answers 200 within seconds, and `journalctl` shows the restart (no core change) |

### Dashboard slim-down
| ID | Requirement |
| --- | --- |
| R-45-03 | The dashboard no longer renders the signups-per-day, top-10-users and top-10-trips charts (`chart-signups`, `chart-users`, `chart-trips` test ids are gone); the three remaining charts (active users per day, activity per day by type, storage growth with the capacity line) keep the range switch, the "Show as table" toggle and the open-live-streams figure, and the dropped charts' translation keys are removed from both the en and de catalogs |
| R-45-04 | `GET /admin/metrics` no longer runs the top-10 queries and its response has no `topUsers` or `topTrips` fields; the `days` rows are unchanged |

### Service health data
| ID | Requirement |
| --- | --- |
| R-45-05 | A migration adds `ops_counters` (`day date` primary key, `http_5xx`, `http_429`, `api_starts` as non-negative integers defaulting 0) and `job_runs` (`job text` primary key, `last_started_at`, `last_finished_at` nullable, `last_result` `ok` or `error`, `last_error text` nullable), `docs/database/schema.sql` and `docs/database/checks.sql` cover them, and `pnpm db:check` passes |
| R-45-06 | At boot, after the pool is ready and before `listen`, the API increments today's `api_starts`; an `onResponse` hook counts responses with status ≥ 500 into `http_5xx` and status 429 into `http_429` in memory, flushed to `ops_counters` every 60 s and on Fastify close. A failed insert or flush writes one structured JSON error line and never fails the boot or a request |
| R-45-07 | The housekeeping `run` wrapper upserts the job's `job_runs` row on every run: `last_started_at` when it starts and, when it settles, `last_finished_at` with `last_result: "ok"`, or `last_result: "error"` and the message in `last_error`. The existing error log line stays; a failed upsert only logs |

### Service health in the admin area
| ID | Requirement |
| --- | --- |
| R-45-08 | `GET /admin/ops?range=7d\|30d\|90d` (default 30d, anything else 400) returns the process start time, the `ops_counters` rows of the range in date order, and one entry per job (all seven, also those without a row) with its interval in ms, last start, last finish, result and error |
| R-45-09 | The dashboard shows a *Service health* panel: the process start time ("up since …"), API starts and 5xx/429 counts per day as a chart that follows the range switch and has the "Show as table" toggle (C-ADMIN-29), and a jobs table (name, last run as a relative time, result, error message on failure) where a job whose last start is older than twice its interval is marked overdue and a job without a row shows "not yet run" |
| R-45-10 | `POST /admin/ops/jobs/:job/run` runs that job once with the same function the timer uses, awaits it, answers 200 `{job, result: "ok"\|"error", error?}`, updates `job_runs` and writes an `admin_audit_log` row; an unknown job name is 404. Each row of the jobs table has a *Run now* button that calls it and refreshes the panel |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-ADMIN-28 | modify | R-45-03, R-45-04, R-45-09 |
| C-ADMIN-34 | add | R-45-08, R-45-09, R-45-10 |
| C-OPS-56 | add | R-45-05, R-45-06, R-45-07 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-45-01 | manual | R-45-01 | Checklist: every core row of step 44's table shows the new text with step 44 in *Changed by* and its T-44 tests, `requirements/44-api-stability.md` says `**Status:** integrated <date>`, and `pnpm req:build && pnpm req:check` exit 0 |
| T-45-02 | manual | R-45-02 | On the host after the deploy: `systemctl status` shows the unit active, `kill <api pid>` → within ~10 s the unit is active again with a new main PID and `curl /api/health` answers `{status:"ok"}`; the restart appears in `journalctl -u <unit>`. Outcome recorded in `requirements/reports/45-report.md` |
| T-45-03 | e2e | R-45-03 | The seeded dashboard shows exactly the test ids `chart-active`, `chart-activity`, `chart-storage` and the service-health panel — `chart-signups`, `chart-users` and `chart-trips` do not exist; switching the range to 7d still updates the three charts and the KPIs |
| T-45-04 | unit | R-45-03 | The en and de locale catalogs contain no keys under the dropped charts' prefixes (`admin.dashboard.charts.signups`, `.users`, `.trips`) and both still contain the keys of the three kept charts and the service-health panel |
| T-45-05 | api | R-45-04 | `GET /admin/metrics` with seeded data returns `days` in date order and has no `topUsers` or `topTrips` property |
| T-45-06 | db | R-45-05 | After `pnpm db:migrate` both tables exist with the primary keys, defaults and non-negative checks; `docs/database/checks.sql` prints its new expected `ok` count |
| T-45-07 | api | R-45-06 | Building the app twice against the same database leaves today's `api_starts` at 2; a request answering 500 and one answering 429, then a 60 s fake-timer flush → `http_5xx` 1 and `http_429` 1; with the counters' pool query failing, the flush logs one JSON error line and a normal request still answers 200 |
| T-45-08 | api | R-45-07 | Running a job through the wrapper upserts its row with `last_result: "ok"` and both timestamps; a job that rejects leaves `last_result: "error"` and the message in `last_error`; a failing upsert logs and does not reject the wrapper |
| T-45-09 | api | R-45-08 | `GET /admin/ops` returns the start time, counter rows in date order and exactly seven jobs each with an interval, including one without a `job_runs` row; `range=9x` → 400 |
| T-45-10 | e2e | R-45-09, R-45-10 | With a seeded stale `job_runs` row (last start three days back for a daily job) the panel marks that job overdue and shows another as "not yet run"; the errors chart has the table toggle; clicking *Run now* on `sessions` shows the refreshed last run as "ok" |
| T-45-11 | api | R-45-10 | `POST /admin/ops/jobs/blobs/run` → 200 `{result:"ok"}`, an updated `job_runs` row and one `admin_audit_log` row; a job whose function rejects → 200 `{result:"error", error}`; `/admin/ops/jobs/nope/run` → 404 |
