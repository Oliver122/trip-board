# admin-dashboard-768-dark

- Screen: admin-dashboard
- Width: 768
- Theme: dark
- Locale: en

## Seen

- One-row admin header: "Trip Board · Admin", a *Back to app* link, and the Light/Dark/System switch on the right with *Dark* selected.
- A fixed sidebar about 240 px wide lists Dashboard (active), Users, Trips, Activity, Storage, Requests, Settings and Audit log.
- The title "Dashboard" has a 7 days / 30 days / 90 days / All range switch beside it; *30 days* is selected.
- Five stat cards in a two-column grid: Users 3 (+0 in this range), Active 7 days 1, Trips 1 (+1), Database 9.5 MB of 1 GB, Images 0 MB of 10 GB. Images sits alone in the third row.
- Below the cards two plain text lines: "Events 30" and "0 open live connections".
- A card "Active users per day" with a *Show as table* button; its chart area is a single thin white line with empty space under it.
- A card "Activity per day" with *Show as table* and a row of about 25 blue bars cut off by the bottom of the image.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | visual | The "Active users per day" chart shows only a flat white line near the top of a roughly 150 px empty card, with no axis, label or value, so it is unclear whether it shows data or failed to render. | middle, in the Active users per day card | U-21 |
| 2 | low | layout | The five stat cards leave Images alone in the third row with an empty slot beside it, so the grid looks unfinished. | left, below the stat cards | U-32 |
| 3 | low | visual | "Events 30" and "0 open live connections" are loose lines of plain text with no label style or card, unlike the stat cards above them. Their meaning and weight are unclear. | middle, between the cards and the charts | U-21 |
| 4 | medium | layout | The fixed sidebar takes about 240 px of 768 px, leaving 528 px for the content. This is the same cause as on the users table, here it only squeezes the cards and the range switch. | left, the sidebar | U-08 |

## Raw checks

None.
