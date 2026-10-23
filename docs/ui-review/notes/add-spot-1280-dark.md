# add-spot-1280-dark

- Screen: add-spot
- Width: 1280
- Theme: dark
- Locale: en

## Seen

- Header on the left shows the Trip Board logo and the tabs Board (active), Schedule, Trip settings; on the right a bell icon and a cut-off "N…" are all that is left, the rest of the header is under the panel
- The map of Japan fills the left 830 px with pins around Osaka and Tokyo, the credit line (OpenFreeMap, OpenStreetMap) bottom left and a dimmed *Add new* button above it
- The right panel, 448 px wide, is titled *New spot* with a × at the top right
- Fields top to bottom: Title (empty, no placeholder), Google Maps link (placeholder `https://maps.app.goo.gl/...`) with a *Fill in* button, Address (empty) with the hint "Or click the map to place the pin"
- Category shows a read-only "Must go" badge, then the chip row Must go ✓, Maybe, Home
- Then Info (textarea, placeholder "e.g. opens at 12") and Link (empty, no placeholder)
- Sticky footer with *Cancel* and *Add* buttons bottom right

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | layout | The panel starts at the top of the screen and covers the right part of the header: only a bell and a clipped "N…" remain, so News, avatars, theme switch and account menu cannot be reached while adding a spot | top right, over the header | U-10 |
| 2 | low | consistency | The category shows "Must go" twice: a read-only badge above and the selected chip "Must go ✓" in the row below; Link has no placeholder while Google Maps link and Info have one | middle of the panel, Category block, and the Link field at the bottom | U-13 |
| 3 | low | state | The hint "Or click the map to place the pin" is shown and is valid here, because the map is visible and usable at 1280 px | left of the panel, under Address | rejected: at 1280 px the map stays usable beside the panel, the hint is true (U-09 concerns 768 and 390) |
| 4 | low | visual | The *Add new* button on the map looks dimmed while the panel is open | bottom left of the map | rejected: it is inactive on purpose while the add panel is already open |

## Raw checks

- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot between the two credit links, not content
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the credit line is fixed at 11 px by design and is readable at the bottom left of the map
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: same 11 px credit line, readable beside the open panel
