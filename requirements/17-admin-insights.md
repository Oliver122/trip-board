# Step 17 — Admin: dashboard, activity & storage insights

**Goal:** admins see at a glance how the platform is used, who is doing what, and how much database and image storage is used.
**Depends on:** 16
**Result:** Graphs, “who is doing what” feed, database & storage usage with warnings
**Core:** C-ADMIN-05, C-ADMIN-10, C-ADMIN-13, C-ADMIN-21, C-ADMIN-22, C-ADMIN-23, C-ADMIN-24, C-ADMIN-25, C-ADMIN-26, C-ADMIN-27, C-ADMIN-28, C-ADMIN-29, C-ADMIN-30, C-ADMIN-31, C-ADMIN-32, C-ADMIN-33, C-OPS-12
**Status:** integrated 2026-10-11

## Scope
- In: dashboard KPIs and graphs, `metrics_daily` job, activity feed with filters and CSV export, per-user and per-trip activity graphs, storage page (DB size, table sizes, blob usage, forecast), capacity warnings, activity retention job.
- Out: external monitoring/alerting (a Discord webhook for warnings is optional, R-17-10).

## Requirements
| ID | Requirement |
| --- | --- |
| R-17-01 | Nightly job (00:05 UTC) runs `snapshot_daily_metrics(yesterday)`. A backfill command fills missing days from `activity_events` / `created_at` data |
| R-17-02 | `GET /admin/stats?range=7d|30d|90d|all` returns KPIs: users total + new in range, active users 24h/7d/30d (from `last_seen_at`), trips, spots, images, DB bytes, blob bytes, capacities |
| R-17-03 | `GET /admin/metrics?from=&to=` returns `metrics_daily` rows. Dashboard graphs: active users per day (line), activity per day by type (stacked bar), storage growth DB + images with capacity line (area), signups per day (bar), top 10 users by storage and top 10 trips by activity (horizontal bars) |
| R-17-04 | Activity feed: `GET /admin/activity` with filters user, trip, action (prefix like `spot.*` allowed), date range; cursor pagination; newest first. UI polls every 15 s while the tab is visible and shows “n new” instead of jumping |
| R-17-05 | Each event renders as a readable sentence in the user's language (“aiko added *Fushimi Inari* to *Japan 2026*”), built from `action` + `metadata`; unknown actions fall back to the raw action |
| R-17-06 | Activity CSV export with the same filters (max 100 000 rows, streamed) |
| R-17-07 | User detail and trip detail show a 30-day activity sparkline and link to the feed pre-filtered |
| R-17-08 | Storage page (`admin_storage_summary`, `admin_table_sizes`): DB and blob usage vs. capacity with progress bars, per-table data/index/rows, biggest users and trips, 30-day growth and a linear “full in …” forecast |
| R-17-09 | Capacity warning: when DB or blob usage ≥ `capacity_warn_pct`, all admin pages show an amber banner (red ≥ 95 %) linking to Storage |
| R-17-10 | Optional: `ADMIN_DISCORD_WEBHOOK_URL` — capacity warnings and new quota requests are posted to that channel (at most once per day per warning) |
| R-17-11 | Activity retention job deletes events older than 180 days (daily); `metrics_daily` keeps the history |
| R-17-12 | Dashboard and storage queries are fast: < 300 ms with 1 M activity events and 10 k users |
| R-17-13 | Charts have accessible text alternatives (data table toggle) and render in both themes and languages (localised dates/numbers, MB/GB formatting) |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-17-01 | api | R-17-01 | Running the job twice for the same day leaves one row with the correct counts; backfill for 30 days creates 30 rows |
| T-17-02 | api | R-17-02 | With a fake clock and seeded `last_seen_at` values, active 24h/7d/30d counts match the fixture |
| T-17-03 | api | R-17-03 | `/admin/metrics` returns rows in date order; `from > to` → 400; range > 2 years → 400 |
| T-17-04 | api | R-17-04 | Filters combine correctly (`user=aiko&action=spot.*` returns only aiko's spot events); cursor pages contain no duplicates or gaps while new events are inserted |
| T-17-05 | unit | R-17-05 | Every action listed in `DATABASE.md` §3 has an EN and DE sentence; unknown action falls back to raw text |
| T-17-06 | api | R-17-06 | CSV export with filters has the same rows as the feed; formula injection is escaped |
| T-17-07 | api | R-17-08 | Storage endpoint returns DB bytes > 0, a row per table, blob bytes equal to `sum(images.bytes)`, and a forecast that is null when there is no growth |
| T-17-08 | api | R-17-09 | With `blob_capacity_bytes` set just above usage, `/admin/stats` returns `warning: "blob", level: "red"` |
| T-17-09 | api | R-17-10 | With a fake webhook, crossing the threshold posts once; a second check the same day doesn't post again |
| T-17-10 | api | R-17-11 | Retention job with a fake clock deletes only events older than 180 days |
| T-17-11 | api | R-17-12 | Load test fixture (1 M events, 10 k users): `/admin/stats`, `/admin/activity` first page and `/admin/storage` each < 300 ms in CI |
| T-17-12 | e2e | R-17-03 | Dashboard renders all 6 charts with seeded metrics; switching range to 7d updates the charts and KPIs |
| T-17-13 | e2e | R-17-04, R-17-05 | While the feed is open, a planner adds a spot in another context → within 20 s “1 new” appears; clicking shows “… added *X* to *Japan 2026*” |
| T-17-14 | e2e | R-17-09 | Lowering capacity in Settings below usage shows the warning banner on every admin page |
| T-17-15 | a11y | R-17-13 | Dashboard and storage pages pass axe; each chart has a “Show as table” toggle with the same data |
