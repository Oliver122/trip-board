# Step 04 — Trips

**Goal:** create, list, rename and delete trips; the creator is owner.
**Depends on:** 02, 03
**Result:** Create “Japan 2026”, see it in My trips
**Core:** C-ADMIN-20, C-EXP-04, C-MEMB-01, C-MEMB-22, C-TRIP-01, C-TRIP-02, C-TRIP-03, C-TRIP-04, C-TRIP-05, C-TRIP-06, C-TRIP-07, C-TRIP-09, C-TRIP-10, C-TRIP-11, C-TRIP-12, C-TRIP-13
**Status:** integrated 2026-10-11

## Scope
- In: trips API, role guard middleware, activity log service, My trips page, create-trip dialog with region search (uses a minimal geocode search; full geocoding in step 06), trip settings (name, dates).
- Out: map (05), members UI (13).

## Requirements
| ID | Requirement |
| --- | --- |
| R-04-01 | `POST /trips {name, region:{bbox}, timezone, startDate?, endDate?}` creates the trip **and** an owner membership in one transaction. `timezone` must be a valid IANA name; the dialog pre-fills it from the region (e.g. Japan → `Asia/Tokyo`), falling back to the browser timezone |
| R-04-02 | `GET /trips` lists trips where the user is a member, with role, member count, created-by name, dates |
| R-04-03 | `GET /trips/:id` returns the trip for members only. Non-members get **404**, not 403, so trip existence isn't revealed |
| R-04-04 | `PATCH /trips/:id` (owner, planner): name, dates, bbox. `DELETE /trips/:id` (owner only) |
| R-04-05 | Role guard `requireTripRole(min)` with order visitor < planner < owner, reused by every trip-scoped route |
| R-04-06 | My trips page: cards with name, dates, role badge, member avatars; empty state with “Create your first trip” |
| R-04-07 | Create dialog: name, region search (“Japan”) → picks a result and its bounding box, optional date range |
| R-04-08 | Delete requires typing the trip name to confirm |
| R-04-09 | `activity.record(tx, {actor, trip, action, entityId, metadata})` service writes an `activity_events` row inside the caller's transaction. Trip create/update/delete use it (`trip.create`, …); every later step's writes use it too (global DoD G-10) |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-04-01 | api | R-04-01 | Create returns 201; DB has the trip, an owner membership for the caller, and `created_by` = caller |
| T-04-02 | api | R-04-01 | Invalid input (empty name, end before start, bbox min > max) → 400 with field errors |
| T-04-03 | api | R-04-02 | User sees only their trips, with the correct role per trip |
| T-04-04 | api | R-04-03 | Non-member `GET /trips/:id` → 404 |
| T-04-05 | api | R-04-04, R-04-05 | PATCH: owner ✓, planner ✓, visitor 403. DELETE: owner ✓, planner 403 |
| T-04-06 | api | R-04-04 | DELETE cascades (spots, plans, members) and queues image blobs (`blob_deletions`) |
| T-04-07 | unit | R-04-05 | Role guard matrix: every (role × required) combination returns the expected allow/deny |
| T-04-08 | e2e | R-04-06, R-04-07 | New user sees the empty state, creates “Japan 2026” with region Japan, lands on the trip page, and the trip appears in My trips |
| T-04-09 | e2e | R-04-08 | Delete is disabled until the exact trip name is typed |
| T-04-10 | api | R-04-09 | Create/rename/delete each write exactly one event with the trip name in `metadata`; if the trip write fails, no event is stored (same transaction) |
