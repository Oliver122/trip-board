# spot-panel-768-dark

- Screen: spot-panel
- Width: 768
- Theme: dark
- Locale: en

## Seen

- An "Edit spot" panel, 448 px wide, slides in from the left over the map, with a × at the top right. The map is a 40 px dark strip on its left edge.
- The panel shows Title "Fushimi Inari", Address "68 Fukakusa Yabunouchicho, Kyoto" with a Copy address button, an "Open in Google Maps" link and the hint "Or click the map to place the pin".
- Category block: a read-only "Must go" badge, then the chips Must go ✓, Maybe and Home, and "Planned (1)" to their right. Below are Info (placeholder "e.g. opens at 12"), Link (empty, no placeholder), "Added by Sven · 23 Oct 2026 08:23" and "0/100 · 0 MB of 200 MB".
- Further down: an image drop zone, a "Find images on Google" link and a collapsed "Suggested photos" row. The sticky footer holds a red-outlined trash button on the left and Cancel and Save on the right.
- On the right, the "Things to do" list column (6 spots) shows Shibuya Sky, teamLab Borderless and Fushimi Inari (selected, with a calendar icon), then "Not scheduled yet" with Nara Park, Hotel Gracery and Kyoto Ryokan. The header above it is cut off: only "ight", Dark (active) and System of the theme switch show, then the avatar "S sven".

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | layout | The panel covers the map and leaves a 40 px strip, so the pin being edited is hidden. The panel also says "Or click the map to place the pin", which the user cannot do with the map this narrow | left half of the screen, panel over the map | U-09 |
| 2 | low | layout | The panel covers the left part of the header. The theme switch is cut to "ight / Dark / System" and the logo and News are hidden, so theme and account menu cannot be fully reached without closing the panel | top, header behind the panel | U-10 |
| 3 | low | consistency | The category shows "Must go" twice, once as a read-only badge and once as the selected chip. "Planned (1)" sits right of the chips and reads like a fourth option. The Info placeholder touches the top edge of its box and Link has no placeholder | panel, Category, Info and Link fields | U-13 |

## Raw checks

- `overlap` OpenFreeMap / Delete spot (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the map credit line lies under the panel's footer only while the panel is open; same cause as U-09
- `overlap` Add new / Suggested photos (`button[data-testid="add-new"]`) → accepted: the map-corner Add new button is drawn behind the panel, so the boxes overlap only behind it; same cause as U-09
- `overlap` Add new / Delete spot (`button[data-testid="add-new"]`) → accepted: the same hidden Add new button behind the panel footer; same cause as U-09
- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: the separator dot between the two map credit links, not content
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the credit line is fixed at 11 px by design
