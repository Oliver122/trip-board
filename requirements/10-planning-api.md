# Step 10 — Planning API

**Goal:** buckets and single entries with spots, through the API; spots become *Planned* automatically.
**Depends on:** 06
**Result:** Buckets/singles via API; auto *Planned*
**Core:** C-PLAN-01, C-PLAN-02, C-PLAN-03, C-PLAN-04, C-PLAN-05, C-PLAN-06, C-PLAN-07, C-PLAN-08, C-PLAN-10, C-SPOT-03
**Status:** integrated 2026-10-11

## Scope
- In: plan entries CRUD, adding/removing/reordering spots in entries (many-to-many), per-link visit date/time/info, auto *Planned* via `spots_view`.
- Out: UI (11), home spot resolution (12).

## Requirements
| ID | Requirement |
| --- | --- |
| R-10-01 | `GET /trips/:id/plan` (visitor+) returns entries in chronological order (start date, start time, sort order), each with its spots in order |
| R-10-02 | `POST /trips/:id/plan` (planner+). Bucket: `title, startDate, endDate, startTime?, endTime?, info?`. Single: `title, date, startTime?, endTime?, info?` |
| R-10-03 | `PATCH /plan/:id`, `DELETE /plan/:id` (planner+). Deleting an entry never deletes spots |
| R-10-04 | `POST /plan/:id/spots {spotId, visitDate?, visitTime?, info?}` (planner+). The same spot may be added to many entries and more than once to the same bucket |
| R-10-05 | `PATCH /plan/:id/spots/:linkId` (date, time, info), `DELETE /plan/:id/spots/:linkId`, `PUT /plan/:id/spots/order [linkIds]` |
| R-10-06 | `visitDate` must lie inside the entry range → otherwise 400 with a clear message. Shrinking a bucket clears visit dates outside the new range and reports how many were cleared |
| R-10-07 | Spot responses reflect plans immediately: `displayCategory = planned` when `planCount > 0` (home stays home), `firstScheduledAt` updated |
| R-10-08 | `GET /spots/:id` includes `plans: [{entryId, title, type, visitDate, visitTime}]` |
| R-10-09 | Optional trip dates: entries outside the trip date range are allowed but flagged `outsideTripDates: true` |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-10-01 | api | R-10-02 | Create bucket “Tokyo 12–16 Apr” and single “Fuji 16 Apr 04:30” → 201; bucket without end date → 400; single spanning days → 400 |
| T-10-02 | api | R-10-01 | Plan list order: Tokyo (12 Apr) before Fuji (16 Apr 04:30) before Kyoto (17 Apr) |
| T-10-03 | api | R-10-04, R-10-07 | Adding a Must go spot to Tokyo → spot list shows `planned`, `planCount 1`; adding it to a second entry → `planCount 2` |
| T-10-04 | api | R-10-04 | Same spot twice in one bucket on 13 and 15 Apr → both links returned |
| T-10-05 | api | R-10-05, R-10-07 | Removing the last link → spot shows its base category again |
| T-10-06 | api | R-10-06 | Visit date 30 Apr in a 12–16 Apr bucket → 400. Shrinking the bucket to 12–14 Apr clears the 15 Apr visit and the response says `clearedVisitDates: 1` |
| T-10-07 | api | R-10-03 | Deleting an entry leaves its spots; their categories revert if no other links remain |
| T-10-08 | api | R-10-05 | Reorder with a link id from another entry → 400; valid reorder persists |
| T-10-09 | api | R-10-02..05 | Role matrix: visitor 403 on all writes; non-member 404; spot from another trip → 400/404 |
| T-10-10 | api | R-10-09 | Entry before trip start → `outsideTripDates: true` |
