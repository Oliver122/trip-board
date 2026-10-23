# board-map-1280-dark

- Screen: board-map
- Width: 1280
- Theme: dark
- Locale: en

## Seen

- Header on one row: Trip Board logo, tabs Board (active, white), Schedule, Trip settings; right side News, three member avatars S/A/T, Light/Dark/System switch with Dark selected, and the user "sven".
- The map fills the left 920 px, zoomed out over East Asia and Japan; only a few pins are visible near Osaka and Tokyo (two yellow home pins, one green pin partly hidden behind the Osaka label). Zoom +/-/locate buttons bottom right of the map, a white "Add new" button bottom left, and the OpenFreeMap / OpenStreetMap credit line under it.
- Right list column "Things to do", "6 spots", with five icon buttons (search, filter, sort, download, upload).
- Three scheduled rows with a blue left edge and calendar icon: Shibuya Sky 13 Apr 2026 18:00, teamLab Borderless 14 Apr 2026 00:00, Fushimi Inari 18 Apr 2026 09:00.
- After the "Not scheduled yet" divider: Nara Park (green, "?" icon, "Nara Park, Nara"), Hotel Gracery and Kyoto Ryokan (yellow edge, home icons). Empty space below, and a small "Only visible on map" checkbox at the bottom.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | visual | The map is not framed on the trip's spots: it shows all of East Asia, so the pins for Tokyo, Kyoto and Nara are tiny and overlap near Osaka (the green pin sits under the "Osaka" label and a yellow pin), and the user has to zoom in before any spot is readable. | centre of the map, around Osaka and Tokyo | U-24 |
| 2 | low | consistency | Nara Park shows a green "?" instead of a category mark, unlike the other rows, which show a calendar or home icon; the "?" is unexplained and reads like a missing icon. | right list column, Nara Park row | U-27 |
| 3 | low | touch | The "Only visible on map" checkbox is about 13 px; it looks small and is tucked into the bottom corner, though its label is probably clickable. | bottom of the right list column | rejected: label text next to it forms a larger target and the size is above nothing that is required at 1280 |

## Raw checks

- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot between the two credit links, not content
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: 11 px credit line fixed by design and legible bottom left at 1280
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: same 11 px credit line, legible at 1280
