# Core — Admin

The platform admin area at `/admin` (only for users whose `app_role` is `admin`): users, trips, storage quotas and quota requests, kind-limit requests and per-trip limits, platform settings, the audit log, and the insights (dashboard graphs, the "who is doing what" activity feed, database and blob usage with capacity warnings), plus the `activity_events` and `metrics_daily` data they read. It touches [auth](./auth.md) (admin promotion at login, suspension), [images](./images.md) (quotas and uploads on/off), [kinds](./kinds.md) (the per-trip kind limit), [members](./members.md), [live](./live.md) (decisions notify open boards) and [ops](./ops.md) (housekeeping jobs).

## Access

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-ADMIN-01 | `requireAppRole('admin')` guards every `/admin/*` route: a normal user gets 404 so the admin area is not revealed, and a logged-out request gets 401. <!-- R-16-01 --> | active | 16 | — | T-16-01 |
| C-ADMIN-02 | On login (Discord or dev login) a user whose Discord id is in `ADMIN_DISCORD_IDS` gets `app_role = admin`; removing an id from the env does not demote anyone, demoting is done in the UI. <!-- R-16-02, R-22-07 --> | active | 16 | 22 | T-16-02, T-22-07 |
| C-ADMIN-03 | The admin layout has a sidebar (Dashboard, Users, Trips, Activity, Storage, Requests with the pending count, Settings, Audit log) and a "Back to app" link, the header avatar menu shows "Admin" only for admins, and all admin pages are translated (en and de) and follow the design system. <!-- R-16-03, R-16-15 --> | active | 16 | — | T-16-13, T-16-15, T-16-16 |

## Users

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-ADMIN-04 | `GET /admin/users` lists users with search by name or Discord id, filters (admins, suspended, at least 80 % of quota, inactive for 90 days), sorting by any column and cursor pagination of 50 per page. <!-- R-16-04 --> | active | 16 | — | T-16-03 |
| C-ADMIN-05 | The user detail shows profile, trips with roles, storage bars (images, bytes, effective limit and whether it is the default or an override), the last 20 actions, a 30-day activity sparkline that links to the feed pre-filtered, and the user's quota requests. <!-- R-16-05, R-17-07 --> | active | 16 | 17 | T-16-13 |
| C-ADMIN-06 | `PATCH /admin/users/:id/quota {maxImages?, maxBytes?, reset?, reason?}` sets or clears a per-user storage override (the "Extend storage" action); values below current usage only block new uploads, nothing is deleted, and the UI warns about it. <!-- R-16-06 --> | active | 16 | — | T-16-04, T-16-05, T-16-13 |
| C-ADMIN-07 | Suspending a user (`POST /admin/users/:id/suspend {reason}`, reason required) logs them out at once and blocks login with "Your account is suspended: <reason>", `unsuspend` reverses it, and an admin cannot suspend themselves (400). <!-- R-16-07 --> | active | 16 | — | T-16-06, T-16-07 |
| C-ADMIN-08 | `PATCH /admin/users/:id/role` makes or removes an admin, and the last remaining admin cannot be demoted or suspended (409). <!-- R-16-08 --> | active | 16 | — | T-16-07 |
| C-ADMIN-09 | `POST /admin/users/:id/logout-all` deletes all sessions of a user. <!-- R-16-09 --> | active | 16 | — | — |
| C-ADMIN-10 | The trips table (`GET /admin/trips`) supports search and sorting, and the trip detail shows members, counts, storage, the last 20 actions, a 30-day activity sparkline and the effective kind limit; admins see trip metadata and activity but not spot content unless they are members (`GET /trips/:id/spots` stays 404). <!-- R-16-14, R-17-07, R-29-07 --> | active | 16 | 17, 29 | T-16-12, T-29-06 |

## Storage quota requests

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-ADMIN-11 | `POST /me/quota-requests {images?, bytes?, message?}` creates a storage request (201) with at most one pending at a time (409) and at least one amount (400), and the account page shows usage, "Request more storage", and the status and decision note. <!-- R-16-10 --> | active | 16 | — | T-16-08, T-16-14 |
| C-ADMIN-12 | The Requests page lists pending requests first with current usage; approving takes an editable amount (by default added to the current effective limit) and rejecting takes a note, and each decision runs in one transaction with its audit row. <!-- R-16-11, R-16-13 --> | active | 16 | — | T-16-09, T-16-14 |
| C-ADMIN-13 | With `ADMIN_DISCORD_WEBHOOK_URL` set, a new storage request is posted to that Discord channel. <!-- R-17-10 --> | active | 17 | — | — |

## Kind limits

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-ADMIN-14 | The effective kinds-per-trip limit is the trip's `max_kinds` override or the platform `default_max_kinds` (default 12, 1 to 64), and an admin sets or clears a trip's override with `PATCH /admin/trips/:id/kind-limit {maxKinds or null, reason?}`, each write adding an audit row with before and after. <!-- R-29-06, R-29-07 --> | active | 29 | — | T-29-05, T-29-06 |
| C-ADMIN-15 | `POST /trips/:id/kind-limit-requests {requestedMax, message?}` (board admin and owner) creates a request (201) and records `kind.limit_request`; a second one while pending is 409 `request_pending`, a value at or below the limit or above 64 is 400, and `GET /trips/:id/kind-limit-requests/latest` returns the newest request with status and note. <!-- R-29-08, R-29-09 --> | active | 29 | — | T-29-04, T-29-07 |
| C-ADMIN-16 | The admin Requests page lists kind-limit requests next to storage requests (type column, type filter, sidebar count of both), and approving (editable value, default the requested one) sets `trips.max_kinds` while rejecting takes a note, each in one transaction with an audit row and a live event to the trip. <!-- R-29-10 --> | active | 29 | — | T-29-08, T-29-11, T-29-23 |
| C-ADMIN-17 | In the Spot kinds dialog, at the limit "Add kind" is disabled with "Kind limit reached" and a "Request more" form, a pending request shows "Request for 20 kinds pending", and a decision shows its result and note once. <!-- R-29-11 --> | active | 29 | — | T-29-11 |

## Settings and audit

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-ADMIN-18 | `GET` and `PATCH /admin/settings` read and change the default storage quota, database and blob capacity, warning threshold, uploads on/off, signups on/off and the default kinds per trip (1 to 64), and saved values apply at once (uploads off gives 503 "Uploads are paused", signups off blocks unknown Discord accounts without an invite). <!-- R-16-12, R-29-07 --> | active | 16 | 29 | T-16-10, T-16-11, T-29-06 |
| C-ADMIN-19 | Every admin write inserts an `admin_audit_log` row (before and after JSON, reason) in the same transaction, and `GET /admin/audit` lists them with filters for admin, target and action. <!-- R-16-13 --> | active | 16 | — | T-16-04, T-16-09 |

## Activity events

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-ADMIN-20 | `activity.record(tx, {...})` writes an `activity_events` row inside the caller's transaction for every write (trip create, update and delete first, every later write too), so a failed write leaves no event, and a Discord or dev login records `user.login`. <!-- R-04-09, R-22-06 --> | active | 04 | 22 | T-04-10, T-22-05 |
| C-ADMIN-21 | `GET /admin/activity` filters by user, trip, action (a prefix such as `spot.*` works) and date range, uses cursor pagination, newest first, and shows each event as a readable sentence in the user's language built from `action` and `metadata`, with the raw action for unknown ones. <!-- R-17-04, R-17-05, R-23-19, R-24-17 --> | active | 17 | 23, 24 | T-17-04, T-17-05, T-23-10, T-24-12 |
| C-ADMIN-22 | The activity page polls every 15 s while the tab is visible and shows "n new" instead of jumping the list. <!-- R-17-04 --> | active | 17 | — | T-17-13 |
| C-ADMIN-23 | `GET /admin/activity/export` downloads the same filters as CSV (at most 100 000 rows, streamed, formula-escaped). <!-- R-17-06 --> | active | 17 | — | T-17-06 |
| C-ADMIN-24 | A daily housekeeping job deletes `activity_events` older than 180 days, and `metrics_daily` keeps the history. <!-- R-17-11 --> | active | 17 | — | T-17-10 |

## Dashboard and storage insights

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-ADMIN-25 | A nightly job at 00:05 UTC runs `snapshot_daily_metrics(yesterday)` into `metrics_daily` (running it twice leaves one row per day), and a backfill command fills missing days from `activity_events` and `created_at` data. <!-- R-17-01 --> | active | 17 | — | T-17-01 |
| C-ADMIN-26 | `GET /admin/stats?range=7d\|30d\|90d\|all` returns the KPIs (users total and new, active users 24 h / 7 d / 30 d from `last_seen_at`, trips, spots, images, database and blob bytes, capacities) and the capacity warning. <!-- R-17-02, R-17-09 --> | active | 17 | — | T-17-02, T-17-08 |
| C-ADMIN-27 | `GET /admin/metrics?from=&to=` returns `metrics_daily` rows in date order, and `from` after `to` or a range over 2 years is 400. <!-- R-17-03 --> | active | 17 | — | T-17-03 |
| C-ADMIN-28 | The dashboard shows six charts (active users per day, activity per day by type, storage growth with the capacity line, signups per day, top 10 users by storage, top 10 trips by activity) that follow the range switch, and the dashboard shows the current open live streams. <!-- R-17-03, R-19-19 --> | active | 17 | 19 | T-17-12 |
| C-ADMIN-29 | Charts have a "Show as table" toggle with the same data and render in both themes and languages (localised dates and numbers, MB/GB formatting). <!-- R-17-13 --> | active | 17 | — | T-17-15 |
| C-ADMIN-30 | `GET /admin/storage` shows database and blob usage against capacity, per-table data, index and row counts, the biggest users and trips, 30-day growth and a linear "full in …" forecast (null without growth). <!-- R-17-08 --> | active | 17 | — | T-17-07, T-17-15 |
| C-ADMIN-31 | When database or blob usage reaches `capacity_warn_pct` every admin page shows an amber banner (red from 95 %) linking to Storage. <!-- R-17-09 --> | active | 17 | — | T-17-08, T-17-14 |
| C-ADMIN-32 | With `ADMIN_DISCORD_WEBHOOK_URL` set, a capacity warning is posted to that channel at most once per day per resource. <!-- R-17-10 --> | active | 17 | — | T-17-09 |
| C-ADMIN-33 | The dashboard, activity first page and storage queries answer in under 300 ms with 1 M activity events and 10 000 users. <!-- R-17-12 --> | active | 17 | — | T-17-11 |

## Known gaps

- C-ADMIN-09: no test proves "log out everywhere" (R-16-09).
- C-ADMIN-13: no test proves that a new storage request is posted to the webhook (R-17-10); T-17-09 covers capacity warnings only.
- C-ADMIN-17: the Spot kinds dialog request UI is covered only by the e2e T-29-11; no unit test for the pending and decision texts (R-29-11).
- C-ADMIN-20: R-04-09 asks that every write records an event, but marking comments as read (R-24-23) is an intended exception and nothing enforces the rule except per-feature tests.
- C-ADMIN-28: no test proves the open-streams figure on the dashboard (R-19-19).
- C-ADMIN-15: kind-limit requests are not posted to the Discord webhook, which R-17-10 only promises for storage requests (`apps/api/src/admin/kind-limits.ts`).
