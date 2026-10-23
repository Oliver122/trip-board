# board-map-390-light

- Screen: board-map
- Width: 390
- Theme: light
- Locale: en

## Seen

- One-row phone header: back chevron at the left, title "Japan 2026", a round grey avatar "S" at the right edge, about 48 px high.
- The map fills the screen and is zoomed out to East Asia (Sea of Okhotsk to Philippine Sea, Hiroshima and Nagasaki labelled); Japan is small in the middle.
- Two orange home pins near Tokyo and a green pin under the one near Kyoto, overlapping each other at about 28 px; no other spots are readable at this zoom.
- Bottom right: three stacked square map buttons (zoom in +, zoom out −, locate me), about 44 px each, with 16 px to the right edge.
- Bottom left: a black "+ Add new" button (about 115 x 44 px, 16 px from the edge) that covers the left half of the "OpenFreeMap | OpenStreetMap" credit line.
- Bottom bar with four tabs: Map (active, bold), List, Schedule, More, each with an icon above its label.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The map pins are 28 px, under 44 px, and the Tokyo and Kyoto pins overlap, so the pin to tap is hard to hit | centre of the map, around Tokyo and Kyoto | U-02 |
| 2 | medium | mobile | The Add new button sits on top of the OpenFreeMap / OpenStreetMap credit line; "OpenFreeMap" is mostly hidden and the 11 px text is hard to read | bottom left, above the tab bar | U-03 |
| 3 | low | touch | The avatar "S" is drawn as a circle of about 28 px, well under the 44 px target for the account menu | top right, in the header | rejected: the target-size check measured the avatar button at 44 px or more (no result for it in the raw JSON); only the drawn circle is 28 px |
| 4 | low | visual | The first view is zoomed out so far that the trip's spots are two small pins in a mostly empty map and no spot labels are readable, so the board gives little information at first sight | whole map area | U-24 |

## Raw checks

- `target-size` Hotel Gracery (`button[data-testid="pin-<id>"]`) → U-02
- `target-size` Kyoto Ryokan (`button[data-testid="pin-<id>"]`) → U-02
- `overlap` OpenFreeMap / Add new (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → U-03
- `overlap` OpenStreetMap / Add new (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → U-03
- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot between the two credit links, not content
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the credit line is fixed at 11 px by design; its being covered is U-03
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the credit line is fixed at 11 px by design; its being covered is U-03
