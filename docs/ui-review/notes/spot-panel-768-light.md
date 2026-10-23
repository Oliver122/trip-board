# spot-panel-768-light

- Screen: spot-panel
- Width: 768
- Theme: light
- Locale: en

## Seen

- An "Edit spot" panel, 448 px wide, slides in from the left with a × at the top right; only a 40 px strip of the map shows to its left.
- Panel fields top to bottom: Title "Fushimi Inari", Address "68 Fukakusa Yabunouchicho, Kyoto" with a Copy address button, an "Open in Google Maps" link and the hint "Or click the map to place the pin".
- Category: a read-only red "Must go" badge, then the chip row Must go (selected, ✓) / Maybe / Home, and "Planned (1)" at the right; below them Info (placeholder clipped at the top), Link (empty), "Added by Sven · 23 Oct 2026 08:23" and "0/100 · 0 MB of 200 MB".
- A dashed drop zone "Drop images here or click to add", the underlined link "Find images on Google" and a collapsed "Suggested photos" button; the sticky footer has a red delete button, Cancel and a black Save.
- Right of the panel the header is cut: the theme switch shows "ight", Dark, System, then the avatar "sven"; below it the list column "Things to do · 6 spots" with Shibuya Sky, teamLab Borderless, Fushimi Inari (highlighted), "Not scheduled yet" and Nara Park, Hotel Gracery, Kyoto Ryokan, plus "Only visible on map" at the bottom.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | layout | The panel covers the map and leaves a 40 px strip, so the pin of the spot being edited is hidden and "Or click the map to place the pin" cannot be done | left, behind the panel | U-09 |
| 2 | low | layout | The panel starts at the top of the screen and covers the left of the header; the "Light" button of the theme switch is cut to "ight" and the logo and trip name are hidden | top, over the header | U-10 |
| 3 | low | consistency | "Must go" appears twice (read-only badge and selected chip); "Planned (1)" floats right of the chips and reads as a fourth option; the Info placeholder is clipped at its top edge and Link has no placeholder | middle of the panel, category and Info fields | U-13 |
| 4 | low | consistency | "Find images on Google" is an underlined text link while the other links in the panel ("Open in Google Maps") have an icon and no underline, and it sits tight above the Suggested photos button | lower panel, under the drop zone | U-40 |

## Raw checks

- `overlap` OpenFreeMap / Delete spot (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the map credit line lies under the open panel, same cause as U-09
- `overlap` Add new / Suggested photos (`button[data-testid="add-new"]`) → accepted: the map-corner Add new button is drawn behind the panel, same cause as U-09
- `overlap` Add new / Delete spot (`button[data-testid="add-new"]`) → accepted: the map-corner Add new button is drawn behind the panel, same cause as U-09
- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot of the map credit line
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the credit line is 11 px by design
