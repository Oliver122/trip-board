# admin-dashboard-768-light

- Screen: admin-dashboard
- Width: 768
- Theme: light
- Locale: en

## Seen

- Admin header in one row: "Trip Board · Admin", a "Back to app" link and the Light / Dark / System switch (Light active) on the right.
- A 240 px sidebar with Dashboard (active, dark pill), Users, Trips, Activity, Storage, Requests, Settings and Audit log, then empty space below.
- Title "Dashboard" with the range buttons 7 days, 30 days (active), 90 days and All.
- Five stat cards in two columns: Users 3 (+0 in this range), Active 7 days 1 (1 in 24 hours · 1 in 30 days), Trips 1 (+1 in this range), Database 9.5 MB (1 GB), Images 0 MB (10 GB). The Images card sits alone in the third row with an empty slot to its right.
- Two plain lines without styling, "Events 30" and "0 open live connections", between the cards and the charts.
- Chart card "Active users per day" with a "Show as table" button: almost empty, only a thin dark line near the top. Below it the card "Activity per day" with a "Show as table" button and a row of blue bars cut off by the bottom of the image.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | visual | The charts have no axes, value labels or legend: the "Active users per day" card shows a single line at the top of a 150 px empty area, so the value (1 user) cannot be read, and the "Activity per day" bars have no key; the numbers are only behind "Show as table". | middle and bottom of the content, in the two chart cards | U-21 |
| 2 | low | visual | "Events 30" and "0 open live connections" are loose, unstyled lines of body text between the stat cards and the first chart, not part of the stat row. | below the stat cards, left | U-21 |
| 3 | low | layout | The five stat cards wrap into a two-column grid, so "Images" sits alone with an empty slot on its right and the cards take about 330 px of height; DESIGN.md §3.8 shows the five cards in one row. | top of the content, third row of cards | U-32 |
| 4 | low | layout | The fixed 240 px sidebar takes a third of the 768 px width, leaving about 464 px for the content, and is mostly empty below its eight links; the same cause as the cut table in U-08, here it squeezes the cards into two columns. | left edge, full height | U-32 |

## Raw checks

None.
