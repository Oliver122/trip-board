# board-map-1280-light

- Screen: board-map
- Width: 1280
- Theme: light
- Locale: en

## Seen

- One-row header: *Trip Board* logo, tabs Board (active, black), Schedule, Trip settings; on the right *News*, member avatars S / A / T, a Light / Dark / System switch (Light active) and the account chip "sven".
- Map fills the left 920 px, zoomed out over East Asia (Korea, China, Japan, Sakhalin); two orange home pins and a green pin sit near Osaka and Tokyo, small against the map. Zoom +, − and locate buttons at bottom right of the map, an *Add new* button at bottom left, credit line OpenFreeMap · OpenStreetMap under it.
- Right list column "Things to do", 6 spots, with search, filter, sort, import and export icon buttons.
- Scheduled rows: Shibuya Sky 13 Apr 2026 18:00, teamLab Borderless 14 Apr 2026 00:00, Fushimi Inari 18 Apr 2026 09:00, each with a calendar icon.
- Divider "Not scheduled yet", then Nara Park (Nara Park, Nara) with a green "?" at the right, and the home spots Hotel Gracery and Kyoto Ryokan with a house icon and no second line.
- Footer of the column: checkbox "Only visible on map".

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | visual | The initial map view is not framed on the spots: the pins are tiny and bunched in the middle of a map that mostly shows Korea, China and the sea, so the trip is hard to read at a glance and the Tokyo pins overlap. | map, centre around Osaka and Tokyo | U-24 |
| 2 | low | visual | The green "?" at the right of the Nara Park row is an unexplained mark; it looks like a help icon, not a category, and differs from the calendar and house icons of the other rows. | list column, Nara Park row, right edge | U-27 |
| 3 | low | consistency | The home spots (Hotel Gracery, Kyoto Ryokan) are shorter single-line rows without an address line, so the list rhythm changes, and "Not scheduled yet" is faint grey on white, low in contrast. | list column, lower rows and divider | U-28 |

## Raw checks

- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot of the credit line
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: 11 px credit line by design, legible and not covered at 1280
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: 11 px credit line by design, legible and not covered at 1280
