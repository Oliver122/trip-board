# Step 14 — Export (CSV, PDF, calendar)

**Goal:** download the full list or the current filtered view as CSV, PDF or iCal.
**Depends on:** 09, 11
**Result:** Download CSV, PDF and calendar file
**Core:** C-EXP-01, C-EXP-02, C-EXP-03, C-EXP-05, C-EXP-06, C-EXP-07, C-EXP-08, C-EXP-09, C-EXP-10, C-EXP-11, C-EXP-12, C-LIST-06
**Status:** integrated 2026-10-11

## Scope
- In: export dialog, `GET /trips/:id/export`, CSV, PDF (server-rendered), `.ics`. Uses the same filter params as the list.
- Out: JSON, GPX, KML (backlog).

## Requirements
| ID | Requirement |
| --- | --- |
| R-14-01 | Export dialog: scope **Full list** (default) or **Current view** (shows the number of active filters); format CSV / PDF / Calendar |
| R-14-02 | `GET /trips/:id/export?format=csv\|pdf\|ics&<list params>` (visitor+) returns a file download named `japan-2026-<yyyy-mm-dd>.<ext>` |
| R-14-03 | **CSV**: UTF-8 with BOM (opens correctly in Excel), one row per spot **visit** plus unplanned spots. Columns: title, category, address, lat, lng, info, link, plan entry, entry type, date, time, created by. Headers in the user's language |
| R-14-04 | CSV values are escaped against formula injection (cells starting with `= + - @` are prefixed with `'`) |
| R-14-05 | **PDF**: A4, minimal style. Trip title, dates, members. Schedule by day (buckets with their spots and home), then unscheduled spots grouped by category, with info text. Localised dates |
| R-14-06 | **ICS**: one `VEVENT` per single entry and per bucket (all-day span), plus per visit with a time. Location = address, description = info, geo = lat/lng. Stable UIDs so re-imports update instead of duplicating. Times use the trip's `timezone` (`TZID`) |
| R-14-07 | The export uses exactly the same filter/sort logic as the list (shared service) |
| R-14-08 | Large trips (500 spots) export in < 3 s |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-14-01 | api | R-14-02, R-14-03 | Seed CSV export: header row in EN; row count = visits + unplanned spots; parses with a CSV parser; BOM present |
| T-14-02 | api | R-14-03 | DE user gets German headers and German category labels |
| T-14-03 | api | R-14-04 | A spot titled `=HYPERLINK("x")` is exported as `'=HYPERLINK("x")` |
| T-14-04 | api | R-14-07 | `export?format=csv&cat=must_go` contains exactly the spots the list returns for `cat=must_go`, in the same order |
| T-14-05 | api | R-14-06 | ICS validates with an iCal parser; Fuji single entry → event at 04:30 local time; UIDs identical across two exports |
| T-14-06 | api | R-14-05 | PDF is generated, has ≥ 1 page, and its text contains the trip title, “Tokyo” and an unscheduled spot title |
| T-14-07 | api | R-14-02 | Non-member → 404; visitor → 200 |
| T-14-08 | api | R-14-08 | Export of a generated 500-spot trip completes in < 3 s in CI |
| T-14-09 | e2e | R-14-01 | With 2 filters active, the dialog shows “Current view (2 filters)”; downloading CSV triggers a file with the expected name |
| T-14-10 | manual | R-14-05, R-14-06 | The PDF looks clean when printed; the ICS imports into Google Calendar and Apple Calendar |
