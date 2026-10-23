# admin-users-768-dark

- Screen: admin-users
- Width: 768
- Theme: dark
- Locale: en

## Seen

- Top bar: "Trip Board · Admin", a "Back to app" link and the Light / Dark / System switch with Dark selected (white).
- Left sidebar about 240 px wide: Dashboard, Users (highlighted), Trips, Activity, Storage, Requests, Settings, Audit log.
- Title "Users", a search field "Search by name or Discord id" and an "All users" filter dropdown.
- Table headers Name, Discord id, Role, Trips, Spots, Storage; the last header touches the right edge and is cut after "Storage".
- Three rows: Tom (100000000000000003, User, Active, 1/0, 0), Aiko (…002, User, Active, 1/0, 1), Sven (…001, Admin, Active, 1/1, 5).
- Below the table the rest of the screen is empty.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | layout | The status column ("Active") has no header, so "Trips" sits over "Active", "Spots" over "1/0" and "Storage" over the spots count; every header from Trips on is above the wrong values | table header row, from "Trips" on | U-07 |
| 2 | medium | layout | The 240 px sidebar leaves about 528 px for the table, which is cut at the right edge ("Storage" header touches the edge, the Storage values are not under it) and nothing shows that it scrolls sideways; the Last active and Joined columns are out of sight | right edge of the table | U-08 |
| 3 | low | text | The Discord id column is wide and the 18-digit ids run almost into the Role column (about 16 px gap), which adds to the lack of room | Discord id column | U-08 |

## Raw checks

None.
