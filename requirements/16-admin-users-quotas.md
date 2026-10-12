# Step 16 — Admin: access, users & storage quotas

**Goal:** admins can open the admin area, manage users, and extend storage per user or for everyone. Users can request more storage.
**Depends on:** 08 (quotas), 13 (members). Activity events have been written since step 04.
**Result:** Admin manages users, extends storage, handles requests, settings, audit log
**Core:** C-ADMIN-01, C-ADMIN-02, C-ADMIN-03, C-ADMIN-04, C-ADMIN-05, C-ADMIN-06, C-ADMIN-07, C-ADMIN-08, C-ADMIN-09, C-ADMIN-10, C-ADMIN-11, C-ADMIN-12, C-ADMIN-18, C-ADMIN-19, C-APP-05, C-AUTH-05
**Status:** integrated 2026-10-11

## Scope
- In: admin role and bootstrap, `/admin` layout, users table + detail, trips table + detail, quota override (“extend storage”), quota requests (user + admin side), suspend/unsuspend, make/remove admin, log out everywhere, settings page, audit log page.
- Out: graphs, activity feed, storage page (step 17).

## Requirements
| ID | Requirement |
| --- | --- |
| R-16-01 | `requireAppRole('admin')` guards every `/admin/*` route. Non-admins get **404** (the admin area isn't revealed) |
| R-16-02 | On login, users whose Discord id is in `ADMIN_DISCORD_IDS` get `app_role = admin`. Removing an id from the env does **not** demote automatically (demote in the UI) |
| R-16-03 | Admin layout at `/admin`: sidebar (Dashboard, Users, Trips, Activity, Storage, Requests with pending count, Settings, Audit log), “Back to app”. Header avatar menu shows “Admin” only for admins |
| R-16-04 | Users table (`admin_user_overview`): search by name / Discord id, filters (admins, suspended, ≥ 80 % quota, inactive > 90 days), sort by any column, cursor pagination (50 per page) |
| R-16-05 | User detail: profile, trips + roles, storage bars (images, bytes, effective limit and whether it's default or override), last 20 actions, quota requests |
| R-16-06 | **Extend storage**: `PATCH /admin/users/:id/quota {maxImages?, maxBytes?, reset?, reason?}` sets or clears the override. Values may be lower than current usage (blocks new uploads only; nothing is deleted), with a warning in the UI |
| R-16-07 | Suspend `{reason}` / unsuspend. Suspended users are logged out at once (DB trigger), can't log in, and see “Your account is suspended: <reason>”. Admins can't suspend themselves |
| R-16-08 | Make / remove admin. The last remaining admin can't be demoted or suspended (409) |
| R-16-09 | “Log out everywhere” deletes all sessions of a user |
| R-16-10 | User side: account page shows usage and “Request more storage” (`POST /me/quota-requests {images?, bytes?, message?}`); one pending request at a time; status and decision note are shown |
| R-16-11 | Requests page: pending first, with current usage. Approve with an editable amount (adds to the current effective limit by default) or reject with a note |
| R-16-12 | Settings page: default quota, database/blob capacity, warning threshold, uploads on/off, signups on/off. Saved values apply at once |
| R-16-13 | **Every admin write** inserts an `admin_audit_log` row (before/after JSON, reason) in the same transaction. Audit log page lists them with filters (admin, target, action) |
| R-16-14 | Trips table (`admin_trip_overview`) with search/sort; trip detail with members, counts, storage, last 20 actions. Admins see trip **metadata and activity**, not spot content, unless they are members |
| R-16-15 | All admin pages are translated (EN/DE) and follow the design system |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-16-01 | api | R-16-01 | Every `/admin/*` route (enumerated from the router) returns 404 for a normal user and 401 when logged out |
| T-16-02 | api | R-16-02 | Login with a Discord id from `ADMIN_DISCORD_IDS` → `app_role = admin`; other ids stay `user` |
| T-16-03 | api | R-16-04 | Seed 120 users; search, each filter and sort return the expected rows; pagination returns all rows exactly once |
| T-16-04 | api | R-16-06, R-16-13 | Set aiko to 300 images / 1 GB → `user_quota_usage` reflects it, `has_override` true, audit row has before/after. `reset:true` → back to defaults |
| T-16-05 | api | R-16-06 | Upload that failed with 413 succeeds after the admin raises the limit |
| T-16-06 | api | R-16-07 | Suspend tom → his existing cookie gets 401; new login is refused with the reason; unsuspend → login works |
| T-16-07 | api | R-16-07, R-16-08 | Admin suspending self → 400; demoting the last admin → 409 |
| T-16-08 | api | R-16-10 | User creates a request → 201; a second while pending → 409; invalid (no amount) → 400 |
| T-16-09 | api | R-16-11, R-16-13 | Approve +500 MB on a 200 MB default → override 700 MB, request approved with `decided_by`, one audit row, all in one transaction (simulated failure leaves nothing changed) |
| T-16-10 | api | R-16-12 | `uploads_enabled = false` → upload returns 503 “Uploads are paused”. `signups_enabled = false` → unknown Discord account can't log in; a known one can; an unknown one with a valid invite can |
| T-16-11 | api | R-16-12 | Raising `default_max_bytes` applies to users without override, not to users with one |
| T-16-12 | api | R-16-14 | Admin (non-member) `GET /admin/trips/:id` returns counts and members; `GET /trips/:id/spots` for that trip is still 404 |
| T-16-13 | e2e | R-16-03, R-16-05, R-16-06 | Admin opens Users → aiko → Extend storage → 1 GB, reason → bars and “override” label update; the Audit log shows the entry |
| T-16-14 | e2e | R-16-10, R-16-11 | User requests +500 MB; admin sees “Requests 1” in the sidebar, approves; user's account page shows “Approved: +500 MB” and the new limit |
| T-16-15 | e2e | R-16-03 | A normal user doesn't see the “Admin” menu entry, and `/admin` shows the 404 page |
| T-16-16 | a11y | R-16-15 | All admin pages pass axe; tables have proper headers; both languages have no missing keys |
