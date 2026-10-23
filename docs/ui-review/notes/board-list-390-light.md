# board-list-390-light

- Screen: board-list
- Width: 390
- Theme: light
- Locale: en

## Seen

- One-row header: back chevron, "Japan 2026", and a grey avatar circle "S" at the right (C-APP-35).
- Toolbar: heading "Things to do" with "6 spots" on the right, then a single outlined "Filters" button.
- Three scheduled cards (Shibuya Sky 13 Apr 2026 18:00, teamLab Borderless 14 Apr 2026 00:00, Fushimi Inari 18 Apr 2026 09:00) with a blue strip, a blue calendar icon and a map-pin link on the right.
- A "Not scheduled yet" divider, then Nara Park (green strip, address "Nara Park, Nara", green "?" icon) and two shorter orange home cards, Hotel Gracery and Kyoto Ryokan, with house icons.
- Empty space below the cards, then a bar with a native checkbox "Only visible on map", then the bottom tab bar Map, List (active, bold), Schedule, More.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | visual | The "Only visible on map" checkbox is the unstyled native browser checkbox, about 13 px, unlike the rest of the UI; the filter also refers to a map that is not shown on the List tab | bottom, above the tab bar | U-25 |
| 2 | low | visual | Nara Park's category icon is a small green "?", which reads as a missing icon or help, not a category | middle right, on the Nara Park card | U-27 |
| 3 | low | consistency | The toolbar holds only "Filters"; DESIGN.md §3.7 shows search, locate and sort controls in the phone toolbar, so they are either folded into Filters (not visible) or missing | top, under the heading | rejected: not visible in the image whether they sit inside Filters, so not judged as a defect |
| 4 | low | visual | The two home cards are 46 px high against 67 px for the others and show no second line, so the rows look uneven in rhythm, though the touch height is fine | lower list, Hotel Gracery and Kyoto Ryokan | rejected: cards without an address or date are shorter by design |

## Raw checks

- `overlap` Shibuya Sky13 Apr 2026 18:00 / Open Shibuya Sky in Google Ma (`button[data-testid="card-<id>"]`) → accepted: the map-pin link sits in the strip the card reserves on its right, so no text collides
- `overlap` teamLab Borderless14 Apr 2026 00:00 / Open teamLab Borderles (`button[data-testid="card-<id>"]`) → accepted: same reserved strip for the map-pin link
- `overlap` Fushimi Inari18 Apr 2026 09:00 / Open Fushimi Inari in Googl (`button[data-testid="card-<id>"]`) → accepted: same reserved strip for the map-pin link
- `overlap` Nara ParkNara Park, Nara? / Open Nara Park in Google Maps (`button[data-testid="card-<id>"]`) → accepted: same reserved strip for the map-pin link
- `overlap` Hotel Gracery / Open Hotel Gracery in Google Maps (`button[data-testid="card-<id>"]`) → accepted: same reserved strip for the map-pin link
- `overlap` Kyoto Ryokan / Open Kyoto Ryokan in Google Maps (`button[data-testid="card-<id>"]`) → accepted: same reserved strip for the map-pin link
