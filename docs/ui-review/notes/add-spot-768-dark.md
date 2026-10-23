# add-spot-768-dark

- Screen: add-spot
- Width: 768
- Theme: dark
- Locale: en

## Seen

- A "New spot" panel slides in from the left, 448 px wide, with a × at its top right; only a 40 px strip of the map shows to its left, with cut-off place names (Qiqihar, Pyongyang, Yellow Sea).
- Fields top to bottom: Title (empty, no placeholder), Google Maps link (placeholder `https://maps.app.goo.gl/…`, with a Fill in button), Address (empty), the hint "Or click the map to place the pin".
- Category block: a "Must go" badge, then a chip row with "Must go ✓" (selected), "Maybe" and "Home"; then Info (textarea, placeholder "e.g. opens at 12", top of the text touches the border) and Link (empty, no placeholder).
- Sticky footer at the bottom of the panel with Cancel and Add; about 170 px of empty panel above it.
- To the right of the panel, the header is cut off: the theme switch shows "ight | Dark | System" and the avatar "S sven"; below it the list column "Things to do, 6 spots" with Shibuya Sky, teamLab Borderless, Fushimi Inari, Nara Park, Hotel Gracery and Kyoto Ryokan, and "Only visible on map" at the bottom.
- The OpenFreeMap credit is bottom left of the map strip, partly under the panel edge.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | layout | The panel covers most of the map, leaving a 40 px strip, so the map cannot be used to place the pin; the hint "Or click the map to place the pin" still invites it | left, over the map; hint under Address | U-09 |
| 2 | low | layout | The panel covers the left part of the header: the theme switch is cut to "ight", and the logo and *News* are hidden, so theme and account cannot be reached while the panel is open | top, header left of the avatar | U-10 |
| 3 | low | consistency | The "Must go" badge appears above the chip row that contains "Must go ✓", so the choice shows twice; the Info placeholder sits tight against the textarea top and Link has no placeholder, unlike the Maps link field | middle, Category, Info and Link | U-13 |

## Raw checks

- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot of the map credit line, not content
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the 11 px credit line is fixed by design and legible at the bottom left of the map
