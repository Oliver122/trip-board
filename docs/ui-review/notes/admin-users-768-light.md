# admin-users-768-light

- Screen: admin-users
- Width: 768
- Theme: light
- Locale: en

## Seen

- One-row header: "Trip Board · Admin" and a "Back to app" link on the left, the Light/Dark/System switch on the right (Light selected).
- Fixed left sidebar about 240 px wide: Dashboard, Users (selected, dark pill), Trips, Activity, Storage, Requests, Settings, Audit log.
- Title "Users", then a search field "Search by name or Discord id" and an "All users" filter dropdown.
- Table with headers Name, Discord id, Role, Trips, Spots, Storage; three rows: Tom (1000…0003, User, Active, 1/0, 0), Aiko (…0002, User, Active, 1/0, 1), Sven (…0001, Admin, Active, 1/1, 5). Names are underlined links.
- The table is cut at the right edge: "Storage" touches the edge and later columns are not visible. The lower two thirds of the main area are empty.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | layout | The fixed 240 px sidebar leaves about 464 px for the table, which is cut after *Storage* with no scroll cue; the later columns (*Last active*, *Joined*) are not visible | right edge of the table, main area | U-08 |
| 2 | medium | layout | Headers do not sit over their values: the unnamed status column (Active) is under *Trips*, so "Active" is read as a trips value, "1/0" sits under *Spots* and "0/1/5" under *Storage* | table header row | U-07 |
| 3 | low | consistency | The table is text only and differs from DESIGN.md §3.9: no avatar, no status dot and no storage bar, so quota use cannot be seen at a glance, and no header shows a sort arrow although the rows are sortable (C-ADMIN-04) | table headers and rows | U-31 |

## Raw checks

None.
