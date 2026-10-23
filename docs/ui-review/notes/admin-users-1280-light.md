# admin-users-1280-light

- Screen: admin-users
- Width: 1280
- Theme: light
- Locale: en

## Seen

- Admin header bar: "Trip Board · Admin", a "Back to app" link, and on the right the Light (selected, dark fill) / Dark / System switch
- Left sidebar, 240 px wide: Dashboard, Users (selected, dark pill), Trips, Activity, Storage, Requests, Settings, Audit log
- Title "Users", then a full-width search field "Search by name or Discord id" and an "All users" dropdown on its right
- Table headers: Name, Discord id, Role, Trips, Spots, Storage, Last active, Joined; the header row's bottom border ends near x=1134, short of the rows below
- Three rows: Tom (User, Active, 1/0, 0 spots, 0 MB of 200 MB, Never, 15 Jul 2026), Aiko (User, Active, 1/0, 1, 0 MB of 200 MB, Never, 15 Jul 2026), Sven (Admin, Active, 1/1, 5, 0 MB of 200 MB, 23 Oct 2026, 15 Jul 2026); names are underlined links
- Everything below the three rows is empty page

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | layout | The table has 9 value columns but 8 headers: the status values (Active) have no header, so "Trips" sits over "Active", "Spots" over "1/0", "Storage" over "0", "Last active" over "0 MB of 200 MB" and "Joined" over "Never"; the last date column ("15 Jul 2026") has no header at all, and the header border stops short of the rows | table header row, from "Trips" to the right edge | U-07 |
| 2 | low | consistency | The table differs from the DESIGN.md §3.9 sketch: no avatar column, no storage bar (plain text "0 MB of 200 MB"), no Status dot, and a plain "All users" dropdown instead of "Filters"; the sketch's rows also open the user detail while here only the underlined name looks clickable | table body and filter row | U-31 |
| 3 | low | text | The Discord ids are 18-digit raw numbers in the same weight as the names, hard to scan or tell apart (100000000000000003 vs …002 vs …001) | Discord id column | rejected: the seed ids are artificial and the id is the search key the design names |

## Raw checks

None.
