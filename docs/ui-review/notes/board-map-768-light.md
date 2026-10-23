# board-map-768-light

- Screen: board-map
- Width: 768
- Theme: light
- Locale: en

## Seen

- Header in two rows: row one has the Trip Board logo and the Board (active), Schedule and Trip settings tabs; row two has News, three member avatars (S, A, T), the Light/Dark/System switch with Light selected, and the user "sven". About 115 px of chrome before the map.
- Left, the map (about 488 px wide) at a very wide zoom over East Asia (Sea of Okhotsk to the Philippine Sea), with a small cluster of two pins (orange home-style pins, one over a green one) near the south coast of Honshu. Zoom +/- and locate buttons bottom right of the map, black "Add new" button bottom left, and the OpenFreeMap · OpenStreetMap credit line at the very bottom left.
- Right column "Things to do", 6 spots, with search, filter, sort, import and export icon buttons.
- Scheduled rows: Shibuya Sky 13 Apr 2026 18:00, teamLab Borderless 14 Apr 2026 00:00, Fushimi Inari 18 Apr 2026 09:00, each with a calendar icon on the right.
- Under "Not scheduled yet": Nara Park (Nara Park, Nara, green "?" mark), Hotel Gracery (filled orange home icon) and Kyoto Ryokan (outlined orange home icon).
- The list ends with empty space, then an "Only visible on map" checkbox at the bottom of the column.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | mobile | The page header wraps to two rows: tabs on the first row, then News, avatars, theme switch and username on a second, mostly empty-left row, pushing the map down about 115 px | top, the whole header | U-01 |
| 2 | low | visual | The map is zoomed out so far that all pins sit in a cluster about 70 px wide at the lower middle of the map; the two pins overlap (one green ring peeks out under an orange pin) and individual spots cannot be told apart or tapped, while the rest of the map is empty sea and Russia | map, around the Honshu coast | U-24 |
| 3 | low | touch | The "Only visible on map" checkbox is a native box of about 13 px with a text label, tiny next to the 44 px list icon buttons above | bottom of the list column | U-25 |
| 4 | low | consistency | The row icons carry no label: Hotel Gracery has a filled home icon and Kyoto Ryokan an outlined one, Nara Park a green "?", and the scheduled rows a calendar icon. The difference between filled and outlined home, and what "?" means, cannot be read from the image | right edge of the list rows | U-27 |

## Raw checks

- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot of the credit line, not content
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the credit line is fixed at 11 px by design and stays legible, bottom left of the map
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: same 11 px credit line as OpenFreeMap
