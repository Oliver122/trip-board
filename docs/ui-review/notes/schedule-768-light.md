# schedule-768-light

- Screen: schedule
- Width: 768
- Theme: light
- Locale: en

## Seen

- Two-row page header: *Trip Board* logo with Board, Schedule (active, black) and Trip settings on row one; *News*, three member avatars (S, A, T), the Light/Dark/System switch and "S sven" on row two
- Title *Schedule* with the buttons *+ Bucket* (black) and *+ Single* (outlined) at the right
- Single entry *Arrival* with a home mark *Hotel Gracery*, "12 Apr 2026 15:00", a pencil icon and an *Add spot* button
- Expanded bucket *Tokyo* ("12 Apr 2026 – 16 Apr 2026", *Hotel Gracery*) with two rows, *Shibuya Sky* (13 Apr 2026 18:00) and *teamLab Borderless* (14 Apr 2026), each with a drag handle, two chevrons and a red-outlined ✕, then *Add spot*
- Collapsed bucket *Kyoto* ("17 Apr 2026 – 20 Apr 2026", *Kyoto Ryokan*) cut off at the bottom of the list area
- The map fills the lower 410 px under the list: Japan and East Asia with two home pins near Tokyo, zoom and locate buttons at the bottom right, the credit line at the bottom left

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | mobile | The page header wraps to two rows: *News*, avatars, theme switch and username sit on their own right-aligned row, so about 115 px of chrome precedes the *Schedule* title and the first row is mostly empty | top, the header above *Schedule* | U-01 |
| 2 | medium | touch | Each spot row ends in two chevrons and a red-outlined ✕ side by side; the ✕ is the loudest element and sits next to the down chevron, it reads as delete, the disabled chevrons (up on *Shibuya Sky*, down on *teamLab Borderless*) are still drawn, and the rows carry no category mark | right end of the *Shibuya Sky* and *teamLab Borderless* rows | U-05 |
| 3 | medium | layout | At 768 px the map is stacked under the list instead of beside it as DESIGN.md §3.4 draws it: the list gets only about 430 px, so *Kyoto* is cut at the bottom edge and any further bucket needs scrolling inside the list, while the map takes the rest of the screen. Compare 1280, where the two sit side by side | between the *Kyoto* row and the map, around y = 613 | U-20 |
| 4 | low | consistency | The single entry *Arrival* is indented differently from the buckets: its bullet sits at x = 30 and *Add spot* at x = 56, while *Add spot* in *Tokyo* starts at x = 16 | left, the *Arrival* block against the *Tokyo* block | U-39 |
| 5 | low | visual | The map is zoomed out to all of East Asia and shows only two home pins, none of the spots in the buckets, so it tells the user nothing about the selected entry (DESIGN.md §3.4: "MAP zoomed to the selected entry") | the map in the lower half | U-24 |

## Raw checks

- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: the separator dot between the two credit links, not content
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the 11 px credit line is fixed by design and readable at the bottom left of the map
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: same 11 px credit line as OpenFreeMap
