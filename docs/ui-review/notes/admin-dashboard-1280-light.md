# admin-dashboard-1280-light

- Screen: admin-dashboard
- Width: 1280
- Theme: light
- Locale: en

## Seen

- Header: "Trip Board · Admin" and a "Back to app" link on the left, the Light/Dark/System switch on the right (Light active); no avatar or account menu is visible.
- Left sidebar of 240 px: Dashboard (active, black), Users, Trips, Activity, Storage, Requests, Settings, Audit log; the Requests entry shows no count.
- Title "Dashboard" with the range switch 7 days / 30 days (active) / 90 days / All.
- Five stat tiles: Users 3 (+0 in this range), Active 7 days 1 (1 in 24 hours · 1 in 30 days), Trips 1 (+1 in this range), Database 9.5 MB (1 GB), Images 0 MB (10 GB).
- Two plain text lines below the tiles: "Events 30" and "0 open live connections".
- Chart cards, each with a "Show as table" button: Active users per day (one flat black line at the top), Activity per day (about 30 blue bars of equal height), Storage growth (dashed capacity line at the top, tan line at the bottom), Signups per day (empty card). The Top users by storage and Top trips by activity cards start at the bottom edge and are cut off.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | state | The Signups per day card is completely empty: no line, no bars, no "no signups in this range" text, so the user cannot tell whether the data is zero, still loading or broken. | right column, second chart row | U-29 |
| 2 | low | visual | The charts have no axes, tick labels, legend or value labels: the flat Active users line, the tan and dashed lines in Storage growth (which one is the capacity line?) and the 30 identical bars cannot be read, and the charts carry no dates or numbers. DESIGN.md §3.8 and C-ADMIN-29 expect localised dates and MB/GB values. | all four chart cards | U-21 |
| 3 | low | consistency | The Database and Images tiles show only "9.5 MB / 1 GB" and "0 MB / 10 GB" as plain text; DESIGN.md §3.8 draws a usage bar with a percentage in these two tiles, so how full the storage is cannot be seen at a glance. | top right, Database and Images tiles | U-31 |
| 4 | low | layout | "Events 30" and "0 open live connections" are two bare lines of body text between the tiles and the charts, with no card, label or unit, so they look like leftovers; "Events 30" does not say what is counted or for which range. | under the stat tiles, left | U-21 |
| 5 | low | consistency | No avatar or account menu appears in the admin header, which has only the theme switch; DESIGN.md §3.8 draws an avatar (◉) at the right, and C-ADMIN-03 expects the avatar menu, so account and sign-out are not reachable from here. | top right, in the header | U-30 |

## Raw checks

None.
