# board-list-390-dark

- Screen: board-list
- Width: 390
- Theme: dark
- Locale: en

## Seen

- One-row trip header: back chevron, "Japan 2026", round "S" avatar at the right edge.
- Title row "Things to do" with "6 spots" at the right, then a "Filters" button (about 97×44 px) on its own row.
- Three scheduled cards with a blue left bar and a calendar icon: Shibuya Sky 13 Apr 2026 18:00, teamLab Borderless 14 Apr 2026 00:00, Fushimi Inari 18 Apr 2026 09:00; each ends in a grey map-pin link.
- A "Not scheduled yet" divider, then Nara Park (green bar, small green "?", address "Nara Park, Nara") and the two home spots Hotel Gracery and Kyoto Ryokan (yellow bar, house icons, no second line, shorter rows).
- Empty dark area of about 190 px below the last card, then an "Only visible on map" checkbox row.
- Bottom bar with Map, List (active, bold), Schedule, More.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | consistency | "Only visible on map" uses the browser's small native checkbox (about 13 px) while the rest of the app uses styled chips and buttons; the box is a tiny target even though the row is about 44 px high | bottom, in the row above the tab bar | U-25 |
| 2 | low | visual | The category mark of Nara Park is a tiny green "?" (about 8 px), unlike the clear icons of the scheduled and home spots; it is hard to read as a category | right side of the Nara Park card | U-27 |
| 3 | low | text | The "Not scheduled yet" divider is about 11 px text in dim grey on near-black, low contrast, so the split between scheduled and unscheduled spots is easy to miss | between Fushimi Inari and Nara Park | U-28 |
| 4 | low | text | teamLab Borderless shows "14 Apr 2026 00:00", a midnight time that reads like a missing time | second card, second line | U-26 |
| 5 | low | layout | The map-pin links look like plain icons with no visible 44 px target, but the card strip is wide enough; the card boxes overlap by design | right edge of every card | rejected: the link sits in the 48 px strip the card reserves, same as the accepted overlap in the Automated findings |

## Raw checks

- `overlap` Shibuya Sky13 Apr 2026 18:00 / Open Shibuya Sky in Google Ma (`button[data-testid="card-<id>"]`) → accepted: the Google Maps link sits in the strip the card reserves on its right, no text collides
- `overlap` teamLab Borderless14 Apr 2026 00:00 / Open teamLab Borderles (`button[data-testid="card-<id>"]`) → accepted: same reserved strip, no text collides
- `overlap` Fushimi Inari18 Apr 2026 09:00 / Open Fushimi Inari in Googl (`button[data-testid="card-<id>"]`) → accepted: same reserved strip, no text collides
- `overlap` Nara ParkNara Park, Nara? / Open Nara Park in Google Maps (`button[data-testid="card-<id>"]`) → accepted: same reserved strip, no text collides
- `overlap` Hotel Gracery / Open Hotel Gracery in Google Maps (`button[data-testid="card-<id>"]`) → accepted: same reserved strip, no text collides
- `overlap` Kyoto Ryokan / Open Kyoto Ryokan in Google Maps (`button[data-testid="card-<id>"]`) → accepted: same reserved strip, no text collides
