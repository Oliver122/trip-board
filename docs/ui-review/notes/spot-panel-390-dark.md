# spot-panel-390-dark

- Screen: spot-panel
- Width: 390
- Theme: dark
- Locale: en

## Seen

- Full-screen panel titled "Edit spot" with a × close button at the top right, no map or board header behind it
- Title field filled with "Fushimi Inari", then a Category label with a small "Must go" badge and, below it, the chip row "Must go ✓" (selected), "Maybe", "Home", with "Planned (1)" at the right end of the last row
- A collapsible "Details" section (chevron up) holding the Address field "68 Fukakusa Yabunouchich" cut at the right edge, a "Copy address" button beside it, an "Open in Google Maps" link and the hint "Or click the map to place the pin"
- Info textarea with the placeholder "e.g. opens at 12", and a Link field with no placeholder, cut by the footer edge
- Sticky footer: a red-outlined trash icon button at the left, "Cancel" and a solid "Save" button at the right; content sits 16 px from the screen edge

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | consistency | The category shows a read-only "Must go" badge above the chip row that already shows "Must go ✓", so the choice appears twice; "Planned (1)" floats at the right of the chips and reads like a fourth option; the Link field has no placeholder | category block, under the Title field | U-13 |
| 2 | low | text | The address "68 Fukakusa Yabunouchich" is cut at the field edge because "Copy address" takes about 40 % of the row, so the full address cannot be read | Details section, address row | U-14 |
| 3 | medium | layout | The panel is full-screen and the map is not usable, yet it says "Or click the map to place the pin" | Details section, below "Open in Google Maps" | U-09 |
| 4 | low | state | The trash button in the footer is icon-only with no text label, so it is not clear that it deletes the spot (it is 44 px and separated from Save, so a mistap is unlikely) | bottom left, in the sticky footer | rejected: the red outline and the distance from Save/Cancel make the intent clear enough, and delete needs a confirmation step the image cannot show |

## Raw checks

None.
