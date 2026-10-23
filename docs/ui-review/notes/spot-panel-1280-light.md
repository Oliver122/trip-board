# spot-panel-1280-light

- Screen: spot-panel
- Width: 1280
- Theme: light
- Locale: en

## Seen

- Top header on the left: "Trip Board" logo, tabs Board (active, black), Schedule, Trip settings; on the right the header is cut off by the panel after a bell icon and the letter "N" (News).
- The map of Kyoto fills the left 830 px with an orange home pin, a blue selected pin, an "Add new" button bottom left and the credit line "OpenFreeMap · OpenStreetMap" below it.
- The "Edit spot" panel on the right (x 832 to 1280) with a × close button, Title "Fushimi Inari", Address "68 Fukakusa Yabunouchicho, Kyoto" with a Copy address button, and "Open in Google Maps".
- The hint "Or click the map to place the pin", then Category: a read-only "Must go" badge, and below it the chips "Must go ✓", "Maybe", "Home" with "Planned (1)" at the right.
- Info textarea with the placeholder "e.g. opens at 12" at its top edge, an empty Link field, "Added by Sven · 23 Oct 2026 08:23", "0/100 · 0 MB of 200 MB", and a dashed drop zone "Drop images here or click to add".
- Sticky footer: red-outlined delete icon button on the left, Cancel and Save (black) on the right.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | layout | The panel starts at the top of the screen and covers the right part of the header: after the bell only the letter "N" of News shows, and the member avatars, theme switch and account menu are hidden, so theme and account cannot be reached while the panel is open | top right, header behind the panel | U-10 |
| 2 | low | consistency | The category shows a read-only "Must go" badge directly above the chip row that holds "Must go ✓", so the current choice appears twice; "Planned (1)" sits right of the chips at the same height and reads like a fourth option | middle of the panel, under "Category" | U-13 |
| 3 | low | text | The Info placeholder "e.g. opens at 12" is pressed against the top edge of the textarea (clipped by about 2 px), and the Link field has no placeholder at all | middle of the panel, Info and Link fields | U-13 |
| 4 | low | state | The hint "Or click the map to place the pin" is useful at 1280 px because the map stays visible, but it sits between the address and the category with no visible cue on the map (the edited pin is an unlabelled blue icon in the middle of the map) | upper panel, under "Open in Google Maps" | rejected: the map is visible and clickable at 1280, the design asks for the hint |

## Raw checks

- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot of the credit line
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the 11 px credit line is fixed by design and stays legible bottom left
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the 11 px credit line is fixed by design and stays legible bottom left
