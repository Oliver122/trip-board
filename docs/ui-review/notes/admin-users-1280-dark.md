# admin-users-1280-dark

- Screen: admin-users
- Width: 1280
- Theme: dark
- Locale: en

## Seen

- Admin header: "Trip Board · Admin", a "Back to app" link and the Light/Dark/System switch at the top right with Dark selected
- Left sidebar with Dashboard, Users (highlighted white), Trips, Activity, Storage, Requests, Settings, Audit log
- Title "Users" with a wide search field ("Search by name or Discord id") and an "All users" filter select
- Table headers Name, Discord id, Role, Trips, Spots, Storage, Last active, Joined over three rows: Tom, Aiko (both User) and Sven (Admin), with underlined names
- Values such as "1/0", "0 MB of 200 MB", "Never", "23 Oct 2026" and "15 Jul 2026"; the lower two thirds of the page are empty

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | layout | The table has 8 headers but 9 columns: the "Active" status column has no header, so "Trips" sits over "Active", "Spots" over "1/0", "Storage" over the spot count, "Last active" over "0 MB of 200 MB" and "Joined" over "Never"; the last date column ("15 Jul 2026") has no header and the header rule stops short of it | table header row, from Role to the right edge | U-07 |
| 2 | low | consistency | The only sign that a row opens the user detail is the underlined name; the rest of the row looks static, and the design shows a status dot, avatar and storage bar that are not here | table rows | rejected: the design says rows open the detail and the underlined name is the link; the missing bar and avatar are a design drift outside this image's scope |

## Raw checks

None.
