# board-map-390-light-de

- Screen: board-map
- Width: 390
- Theme: light
- Locale: de

## Seen

- One-row phone header: a back chevron, the title "Japan 2026" and a round "S" avatar at the right edge, about 48 px high.
- The map fills the screen with German labels (Sachalin, Sapporo, Hiroshima, Nagasaki, Japanisches Meer, Philippinensee), zoomed out so the view takes in Japan, Korea and the Russian Far East.
- Two orange home pins (house icons) near Tokyo and Hiroshima, with green and purple discs half hidden behind them; they are small and overlap.
- Map controls at the right: zoom in, zoom out and locate buttons, each about 44 px.
- A black "Neu hinzufügen" button with a plus at the bottom left, sitting over the OpenFreeMap / OpenStreetMap credit line.
- Bottom bar with four tabs: Karte (active, bold), Liste, Plan, Mehr.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | Map pins are 28 px, under 44 px, and the two visible ones overlap with discs behind them, so the one to tap is hard to hit | map, around Tokyo and Hiroshima | U-02 |
| 2 | medium | mobile | The "Neu hinzufügen" button covers the left half of the OpenFreeMap / OpenStreetMap credit line, which is cut off | bottom left of the map, above the tab bar | U-03 |

## Raw checks

- `target-size` Hotel Gracery (`button[data-testid="pin-<id>"]`) → U-02
- `target-size` Kyoto Ryokan (`button[data-testid="pin-<id>"]`) → U-02
- `overlap` OpenFreeMap / Neu hinzufügen (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → U-03
- `overlap` OpenStreetMap / Neu hinzufügen (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → U-03
- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot of the 11 px credit line
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the credit line is fixed at 11 px by design
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the credit line is fixed at 11 px by design
