# Core — Export

Downloading a trip as a CSV, PDF or calendar (`.ics`) file, either the full list or the current filtered view. It reads spots and the schedule from [spots](./spots.md), [list](./list.md) (the same filter and sort logic), [planning](./planning.md) and [kinds](./kinds.md) (category names), and it writes one activity event that [admin](./admin.md) shows in the feed.

## Endpoint and dialog

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-EXP-01 | `GET /trips/:id/export?format=csv\|pdf\|ics` (any member, visitor included) returns the file as an attachment named `<trip-name-slug>-<yyyy-mm-dd>.<ext>` (date in the trip's timezone) with `cache-control: no-store`; a non-member gets 404 and an unknown `format` gets 400. <!-- R-14-02 --> | active | 14 | — | T-14-07, T-14-09 |
| C-EXP-02 | The export accepts the same filter, search and sort query params as the spot list and runs them through the same shared list service, so `format=csv&cat=<kind>` contains exactly the spots the list returns, in the same order; an invalid param is 400. <!-- R-14-07 --> | active | 14 | — | T-14-04 |
| C-EXP-03 | The export dialog offers the scope **Full list** (default) or **Current view** (labelled with the number of active filters, for example "Current view (2 filters)") and the formats CSV, PDF and Calendar, and downloads the chosen file. <!-- R-14-01 --> | active | 14 | — | T-14-09 |
| C-EXP-04 | A successful export records one `export.download` activity event with the trip name and format in the same transaction. <!-- R-04-09 --> | active | 04 | — | — |
| C-EXP-05 | A generated 500-spot trip exports in under 3 seconds. <!-- R-14-08 --> | active | 14 | — | T-14-08 |

## CSV

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-EXP-06 | The CSV is UTF-8 with a BOM and has one row per spot visit plus one row per unplanned spot, with the columns title, category, address, lat, lng, info, link, plan entry, entry type, date, time, created by, and headers and entry-type labels in the user's language. <!-- R-14-03 --> | active | 14 | — | T-14-01, T-14-02 |
| C-EXP-07 | The CSV category cell shows *Planned* or *Home* for those states and otherwise the spot's kind display names (a custom name or the translated preset label), joined with " / " when a spot has two kinds. <!-- R-14-03, R-28-16 --> | active | 14 | 28 | T-14-02, T-28-17 |
| C-EXP-08 | Every CSV cell starting with `=`, `+`, `-` or `@` is prefixed with `'` so spreadsheets do not run it as a formula. <!-- R-14-04 --> | active | 14 | — | T-14-03 |

## PDF

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-EXP-09 | The PDF is A4 in a minimal style with the trip title, dates and members, then the schedule day by day (buckets with their spots and home) with localised dates. <!-- R-14-05 --> | active | 14 | — | T-14-06 |
| C-EXP-10 | Spots not in the schedule are listed after the schedule grouped by primary kind in the trip's kind order, then *Planned* and *Home*, with their info text; a spot with two kinds is listed once, under its primary kind. <!-- R-14-05, R-28-16 --> | active | 14 | 28 | T-14-06, T-28-17 |

## Calendar

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-EXP-11 | The `.ics` has one `VEVENT` per plan entry (a timed single entry gets `DTSTART;TZID=<trip timezone>`, an untimed entry or bucket is an all-day span) plus one per spot visit that has a date and time, with the home's or spot's address as `LOCATION`, info as `DESCRIPTION` and `GEO` from lat/lng. <!-- R-14-06 --> | active | 14 | — | T-14-05 |
| C-EXP-12 | Calendar UIDs are stable (`plan-<entry id>@tripboard` and `visit-<visit id>@tripboard`), so re-importing an updated file updates events instead of duplicating them. With filters on, only entries linked to a listed spot and visits of listed spots are included. <!-- R-14-06, R-14-07 --> | active | 14 | — | T-14-05 |

## Known gaps

- C-EXP-04: no test proves the `export.download` activity event; no step file lists it (R-04-09, `apps/api/src/export/store.ts`).
- C-EXP-01: R-14-02 names the file `japan-2026-<yyyy-mm-dd>.<ext>` as an example; the code derives the slug from the trip's name (`apps/api/src/export/names.ts`), and the rule describes that.
- C-EXP-09: T-14-10 (the printed PDF looks clean, and the ICS imports into Google and Apple Calendar) is manual and only checked by hand.
