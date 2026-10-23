# spot-panel-390-light

- Screen: spot-panel
- Width: 390
- Theme: light
- Locale: en

## Seen

- Full-screen panel titled "Edit spot" with a × close button at the top right; no map or header visible behind it.
- Title field "Fushimi Inari", then a Category label with a read-only "Must go" badge above a chip row (Must go ✓ selected, Maybe, Home) and "Planned (1)" right of the Home chip.
- Collapsible "Details" section (open) with an Address field reading "68 Fukakusa Yabunouchich" beside a "Copy address" button, then an "Open in Google Maps" link.
- The hint "Or click the map to place the pin", then an Info textarea with the placeholder "e.g. opens at 12" and a Link field that is empty without a placeholder.
- Sticky footer: red-outlined trash button on the left, Cancel and a dark Save button on the right; content sits 16 px from the screen edge.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | consistency | The current category shows twice: a read-only "Must go" badge above the chips and the selected "Must go ✓" chip; "Planned (1)" floats right of the chips and reads like a fourth option | Category block, below the Title field | U-13 |
| 2 | low | visual | The Info placeholder "e.g. opens at 12" sits tight against the top edge of the textarea and the Link field has no placeholder | Info and Link fields, lower half | U-13 |
| 3 | low | text | The address is cut off ("68 Fukakusa Yabunouchich") because Copy address takes about 40 % of the row, so the full address cannot be read | Address row in Details | U-14 |
| 4 | low | state | The hint "Or click the map to place the pin" cannot be followed because the panel covers the whole screen | Below "Open in Google Maps" | U-09 |
| 5 | low | layout | The Delete button is a red-outlined icon with no text label, sitting in the same footer as Cancel and Save | Footer, bottom left | U-34 |

## Raw checks

None.
