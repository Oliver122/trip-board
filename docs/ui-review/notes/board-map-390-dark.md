# board-map-390-dark

- Screen: board-map
- Width: 390
- Theme: dark
- Locale: en

## Seen

- One-row trip header: back chevron, title "Japan 2026" and a round "S" avatar at the right.
- Full-bleed dark map zoomed out to east Asia (Amur Oblast, Sea of Japan, Sapporo, Hiroshima, Nagasaki, Philippine Sea labels); Japan fills only a small part of the width.
- Only two yellow house pins are readable, near Tokyo (x≈160 and x≈211, y≈463 and y≈455); a green and a blue ring peek out from under them, so the other spots are stacked beneath.
- Bottom right: stacked zoom in (+), zoom out (−) and locate buttons, each about 42 px wide.
- Bottom left: white "+ Add new" button with the map credit "OpenFreeMap · OpenStreetMap" underlined and partly hidden behind it.
- Bottom tab bar with Map (active, bold), List, Schedule and More.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | Map pins are 28 px, under 44 px, and the Tokyo pins lie on top of each other, so the one to tap is hard to hit. | middle of the map, around Tokyo | U-02 |
| 2 | medium | mobile | The "Add new" button covers the left half of the credit line: "OpenFreeMap" is hidden and only "OpenStreetMap" can be read. | bottom left, above the tab bar | U-03 |
| 3 | medium | layout | The map opens zoomed out so far that the Tokyo, Kyoto and Nara spots sit within about 60 px of each other and merge into two pins plus stray rings, while the rest of the screen shows Russia, Korea and China. The trip's spots are not framed. | centre of the map | U-24 |
| 4 | low | visual | The pins that stay visible are the two home pins, so the screen shows no spot pin and no spot can be recognised or told apart at this zoom; no count or cluster badge shows that more spots lie below. | near Tokyo | U-24 |
| 5 | low | visual | The map credit line is 11 px and has a low-contrast underline on the dark map, but it is a licence line fixed by design. | bottom left | rejected: fixed 11 px credit line by design, the cover by Add new is U-03 |

## Raw checks

- `target-size` Hotel Gracery (`button[data-testid="pin-<id>"]`) → U-02
- `target-size` Kyoto Ryokan (`button[data-testid="pin-<id>"]`) → U-02
- `overlap` OpenFreeMap / Add new (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → U-03
- `overlap` OpenStreetMap / Add new (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → U-03
- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot between the two credit links
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the credit line is fixed at 11 px by design
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the credit line is fixed at 11 px by design
