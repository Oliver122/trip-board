# Step 06 — Spots API & geocoding

**Goal:** spots can be created, read, updated and deleted through the API; addresses can be searched and reverse-geocoded.
**Depends on:** 04
**Result:** Spots can be created via API; address search works
**Core:** C-SPOT-01, C-SPOT-02, C-SPOT-03, C-SPOT-04, C-SPOT-05, C-SPOT-07, C-SPOT-10, C-SPOT-11, C-SPOT-12
**Status:** integrated 2026-10-11

## Scope
- In: spots CRUD, map scope auto-expand, geocode proxy with cache and rate limit, shared Zod schemas.
- Out: UI (07), images (08), planned status from plans (10; the field is already returned).

## Requirements
| ID | Requirement |
| --- | --- |
| R-06-01 | `POST /trips/:id/spots` (planner+): title, lat, lng, baseCategory (`must_go`/`maybe`/`home`), address?, info?, link? |
| R-06-02 | `GET /trips/:id/spots` (visitor+) returns rows from `spots_view` incl. `displayCategory`, `planCount`, `firstScheduledAt`, `createdBy {id, name, avatar}` |
| R-06-03 | `GET /spots/:id`, `PATCH /spots/:id` (planner+), `DELETE /spots/:id` (planner+). Access is checked through the spot's trip |
| R-06-04 | `planned` is rejected as input category (400, message: “planned is set automatically”) |
| R-06-05 | Saving a spot outside the trip bbox expands the bbox to include it + 10 % padding, in the same transaction |
| R-06-06 | `GET /geocode/search?q=&lang=` and `GET /geocode/reverse?lat=&lng=&lang=` proxy Nominatim with a proper User-Agent, ≤ 1 request/s globally, results cached 30 days in `geocode_cache` |
| R-06-07 | Geocode search is biased to the trip bbox when `tripId` is given (`viewbox` param) |
| R-06-08 | Geocode responses are normalised to `{label, lat, lng, bbox?}` |
| R-06-09 | Validation limits come from `packages/shared` and match DB checks (title ≤ 120, info ≤ 2000, link http(s) ≤ 500) |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-06-01 | api | R-06-01, R-06-02 | Planner creates a spot; list returns it with `displayCategory = baseCategory` and `createdBy` filled |
| T-06-02 | api | R-06-01, R-06-03 | Role matrix for create/update/delete: owner ✓, planner ✓, visitor 403, non-member 404 |
| T-06-03 | api | R-06-03 | Spot id from another trip → 404 for a member of a different trip |
| T-06-04 | api | R-06-04 | `baseCategory:"planned"` → 400 with the expected message key |
| T-06-05 | api | R-06-05 | Spot in Okinawa outside a Honshu-only bbox expands the bbox; a spot inside leaves it unchanged |
| T-06-06 | api | R-06-09 | `link:"javascript:alert(1)"`, 121-char title, lat 91 → 400 each |
| T-06-07 | api | R-06-06 | Same query twice → upstream fixture called once (second from cache) |
| T-06-08 | api | R-06-06 | 5 parallel uncached searches → upstream calls spaced ≥ 1 s apart |
| T-06-09 | api | R-06-06, R-06-08 | Upstream error → 502 with translated error key; response shape matches `{label, lat, lng}` |
| T-06-10 | unit | R-06-07 | Viewbox parameter derived from bbox in Nominatim's `left,top,right,bottom` order |
