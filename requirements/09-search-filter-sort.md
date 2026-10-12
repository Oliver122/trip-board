# Step 09 — Search, filter, sort

**Goal:** the four top-right toolbar buttons (search, filter, sort, export placeholder) work on list and map together.
**Depends on:** 07 (plan-related filters are wired up in 11)
**Result:** Toolbar works; “scheduled first” sort; URL state
**Core:** C-LIST-01, C-LIST-02, C-LIST-03, C-LIST-04, C-LIST-05, C-LIST-07, C-LIST-08, C-LIST-09, C-LIST-10, C-LIST-11, C-LIST-14, C-LIST-15
**Status:** integrated 2026-10-11

## Scope
- In: toolbar UI, server-side filtering via query params, URL state, active filter chips, “scheduled first” default sort.
- Out: export itself (14). The plan-entry filter appears once plans exist (11).

## Requirements
| ID | Requirement |
| --- | --- |
| R-09-01 | Search: debounced (250 ms) text search over title, address and info; case-insensitive, including umlauts (`ÖFFNET` matches `öffnet`) |
| R-09-02 | Filter popover: categories (multi), status (all / scheduled / not scheduled), added by (member), only visible on map |
| R-09-03 | Sort: **Scheduled first** (default), date/time, category, A–Z, newest |
| R-09-04 | “Scheduled first” order: scheduled spots by `firstScheduledAt`, then a divider “Not scheduled yet”, then the rest by category (must go → maybe → home) then title |
| R-09-05 | Filters apply to **both** list and pins |
| R-09-06 | State lives in the URL query (`?q=&cat=&status=&by=&sort=&visible=`); shared links reproduce the view |
| R-09-07 | Active filters show as removable chips; “Reset” clears all |
| R-09-08 | `GET /trips/:id/spots` accepts the same params and returns the filtered, sorted list (single source of truth for list and export) |
| R-09-09 | Count badge shows “n of m spots” when filtered |
| R-09-10 | No results: “No spots match your filters” + Reset button |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-09-01 | api | R-09-01, R-09-08 | `q=inari` finds “Fushimi Inari”; `q=ÖFFNET` finds info “öffnet um 12”; `q=%` is treated as a literal character, not a wildcard |
| T-09-02 | api | R-09-02, R-09-08 | `cat=must_go,home` returns only those display categories; `status=scheduled` returns only `planCount > 0` |
| T-09-03 | api | R-09-04 | Seed list with `sort=scheduled` matches the expected exact order (fixture) |
| T-09-04 | api | R-09-03 | Each sort option returns the expected order; unknown sort → 400 |
| T-09-05 | unit | R-09-06 | URL ↔ filter state round-trip for all params; invalid params are dropped |
| T-09-06 | e2e | R-09-05, R-09-07 | Filtering to Must go hides other pins and cards; removing the chip restores them |
| T-09-07 | e2e | R-09-06 | Copy URL with filters, open in a new context → same chips and results |
| T-09-08 | e2e | R-09-04 | Default view shows scheduled cards first, then the “Not scheduled yet” divider |
| T-09-09 | e2e | R-09-09, R-09-10 | Search with no hits shows the empty message; Reset brings back “6 spots” |
