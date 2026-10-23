# spot-panel-1280-dark

- Screen: spot-panel
- Width: 1280
- Theme: dark
- Locale: en

## Seen

- Header on the left: Trip Board logo, tabs Board (active, white), Schedule, Trip settings; on the right the header is covered by the panel after a bell icon, so only a cut-off "N…" shows.
- Dark map of the Kyoto area with an orange home pin at the top and a selected blue pin with a calendar icon in the middle; the Add new button and the 11 px OpenFreeMap / OpenStreetMap credit sit bottom left.
- Right panel "Edit spot" with a × at its top right; fields Title "Fushimi Inari", Address "68 Fukakusa Yabunouchicho, Kyoto" with a Copy address button, the Open in Google Maps link and the hint "Or click the map to place the pin".
- Category block: a "Must go" badge, then a chip row Must go ✓, Maybe, Home with "Planned (1)" at the far right; below it Info (placeholder "e.g. opens at 12", its top clipped) and an empty Link field.
- "Added by Sven · 23 Oct 2026 08:23", "0/100 · 0 MB of 200 MB", and a dashed drop zone "Drop images here or click to add".
- Sticky footer: red-outlined trash button on the left, Cancel and Save on the right.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | layout | The panel starts at the top of the screen and covers the right part of the header: only "N…" of News is visible, the member avatars, theme switch and account menu are hidden, so they cannot be reached while editing. | top right, behind the panel | U-10 |
| 2 | low | consistency | The current category appears twice: a read-only "Must go" badge above the chip row that holds "Must go ✓". "Planned (1)" sits right of the chips and reads like a fourth option; the Info placeholder "e.g. opens at 12" is clipped at its top and the Link field has no placeholder. | category block, middle of the panel | U-13 |
| 3 | low | visual | The delete button is a red-outlined trash icon with no text, in the footer far from Cancel and Save; it is the loudest control and the only one without a label. | bottom left of the panel footer | U-34 |

## Raw checks

- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot of the map credit line
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the 11 px map credit line is fixed by design and legible bottom left
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the 11 px map credit line is fixed by design and legible bottom left
