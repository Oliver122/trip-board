# add-spot-1280-light

- Screen: add-spot
- Width: 1280
- Theme: light
- Locale: en

## Seen

- The header shows Trip Board, the Board tab (active), Schedule and Trip settings; at the right edge the *News* bell is cut off by the panel.
- The map of Japan fills the left 832 px with a few pins around Osaka and Tokyo, the dark *Add new* button bottom left and the OpenFreeMap / OpenStreetMap credit line under it.
- A 448 px panel titled *New spot* with a × sits on the right: Title (empty), Google Maps link with placeholder `https://maps.app.goo.gl/...` and a *Fill in* button, Address with the hint "Or click the map to place the pin".
- The Category block shows a small "Must go" badge, then a chip row with "Must go ✓" (selected), "Maybe" and "Home".
- Below are Info (textarea with placeholder "e.g. opens at 12", its top touching the border) and Link (empty, no placeholder).
- The sticky footer has *Cancel* (outlined) and *Add* (solid, dark).

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | consistency | The current category appears twice: a read-only "Must go" badge above the chip row that already shows "Must go ✓" | in the panel, under the Category label | U-13 |
| 2 | low | text | The Info placeholder "e.g. opens at 12" sits tight against the top border of the textarea and looks clipped; Link has no placeholder while Info and the maps link do | in the panel, Info and Link fields | U-13 |
| 3 | low | layout | The open panel covers the right part of the header, so the *News* bell is cut ("N") and the theme switch and account menu are hidden | top right, in the header | U-10 |
| 4 | low | visual | The category badge sits right above the chips with little gap, so the two rows look crowded compared with the 16 px rhythm of the other fields | in the panel, Category block | rejected: part of the duplicate badge in U-13, the gap goes with it |

## Raw checks

- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot of the credit line
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the 11 px credit line is fixed by design and readable bottom left
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the 11 px credit line is fixed by design and readable bottom left
