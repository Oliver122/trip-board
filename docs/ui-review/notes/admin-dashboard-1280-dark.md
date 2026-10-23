# admin-dashboard-1280-dark

- Screen: admin-dashboard
- Width: 1280
- Theme: dark
- Locale: en

## Seen

- Top bar: "Trip Board · Admin", a plain "Back to app" link, and a Light / Dark / System switch at the right with Dark selected; no avatar or account menu
- Left sidebar with Dashboard (active, light pill), Users, Trips, Activity, Storage, Requests, Settings, Audit log; no pending count next to Requests
- Title "Dashboard" with the range switch 7 days / 30 days (selected) / 90 days / All
- Five stat cards: Users 3 (+0 in this range), Active 7 days 1 (1 in 24 hours · 1 in 30 days), Trips 1 (+1 in this range), Database 9.5 MB of 1 GB, Images 0 MB of 10 GB; all numbers, no bars
- Two unstyled lines below the cards: "Events 30" and "0 open live connections"
- Chart cards, each with a "Show as table" button: Active users per day (one flat white line), Activity per day (about 24 identical blue bars), Storage growth (dashed capacity line and a brown line at the bottom), Signups per day (completely empty); a third row of cards is cut at the fold

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | visual | The charts have no axes, value labels or legend: the Activity per day bars and the flat lines of Active users and Storage growth cannot be read, the capacity dashed line and the brown line are not named, and the numbers are only behind "Show as table" | the four chart cards in the middle | U-21 |
| 2 | low | visual | "Events 30" and "0 open live connections" are two loose lines of plain text between the stat cards and the charts, unstyled and not aligned to the card grid | left, below the stat cards | U-21 |
| 3 | low | state | The Signups per day card is a blank dark box: no bars, no axis and no "No signups in this range" text, so empty data looks the same as a chart that failed to render | right of Storage growth, middle right | U-29 |
| 4 | low | visual | The Database (9.5 MB, 1 GB) and Images (0 MB, 10 GB) cards show used and capacity as two numbers; DESIGN.md §3.8 draws a usage bar with a percentage in these two cards | top right, last two stat cards | U-31 |
| 5 | low | consistency | The admin header has no avatar or account menu at the right, only the theme switch; DESIGN.md §3.8 shows the avatar next to "Back to app", and C-ADMIN-03 expects the avatar menu | top right, in the header | U-30 |

## Raw checks

None.
