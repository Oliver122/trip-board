# add-spot-768-light

- Screen: add-spot
- Width: 768
- Theme: light
- Locale: en

## Seen

- A 448 px wide "New spot" panel slides in from the left with a × at its top right; a 40 px strip of map (place labels such as "Changch…", "Pyong…") is left at the far left.
- Fields top to bottom: Title, Google Maps link with a *Fill in* button, Address with the hint "Or click the map to place the pin", then Category with the chips Must go, Maybe and Home, Info (placeholder "e.g. opens at 12") and Link (no placeholder).
- A tiny empty rounded badge sits between the "Category" label and the chip row.
- The sticky footer holds *Cancel* (outlined) and *Add* (solid black), right aligned.
- Right of the panel the header shows the end of the Light/Dark/System switch ("ight" cut off) and the avatar "S sven"; below it the list column "Things to do", 6 spots, with search, filter, sort, import and export buttons.
- The list shows Shibuya Sky (13 Apr 2026 18:00), teamLab Borderless (14 Apr 2026 00:00), Fushimi Inari (18 Apr 2026 09:00), then "Not scheduled yet" with Nara Park, Hotel Gracery and Kyoto Ryokan; the checkbox "Only visible on map" is at the bottom.
- The *Add new* button and the map credit are partly visible at the bottom left, next to the panel edge.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | layout | The panel covers almost the whole map, leaving a 40 px strip, and the hint "Or click the map to place the pin" asks for something that cannot be done in that strip | left side, panel and map strip, under Address | U-09 |
| 2 | low | layout | The panel covers the left part of the header: the theme switch is cut ("ight" instead of Light) and the logo and News are hidden, so theme and account are hard to reach while the panel is open | top, across the header | U-10 |
| 3 | low | consistency | An empty rounded badge (about 18 px wide, no text) sits above the category chips, no category is selected, and the Info placeholder is cut at its top edge while Link has no placeholder | middle of the panel, between Category and the chips; the Info and Link fields | U-13 |
| 4 | low | visual | The panel is 448 px high in content and the lower 280 px between Link and the footer are empty, while the fields above are tightly packed | lower half of the panel | rejected: normal for a short form with a sticky footer |

## Raw checks

- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot of the map credit line, not content
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the 11 px map credit is fixed by design and is readable bottom left
