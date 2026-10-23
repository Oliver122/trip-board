# schedule-768-dark

- Screen: schedule
- Width: 768
- Theme: dark
- Locale: en

## Seen

- Header on two rows: the logo with the Board / Schedule (active) / Trip settings tabs, then News, the avatars S, A, T, the Light / Dark (active) / System switch and "sven"
- Title "Schedule" with the buttons "+ Bucket" and "+ Single" on the right
- Single entry "Arrival" (Hotel Gracery, 12 Apr 2026 15:00) with an edit pencil and an "Add spot" button
- Bucket "Tokyo" (Hotel Gracery, 12 Apr 2026 – 16 Apr 2026) with the rows Shibuya Sky (13 Apr 2026 18:00) and teamLab Borderless (14 Apr 2026), each with a drag handle, two chevrons and a red-outlined ✕, then "Add spot"
- Bucket "Kyoto" (Kyoto Ryokan, 17 Apr 2026 – 20 Apr 2026), cut off at the bottom of the list box
- Lower half of the screen is the map (East Asia, two home markers near Tokyo, zoom and locate buttons, credit line bottom left)

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | mobile | The page header wraps to two rows (tabs, then News, avatars, theme switch and username), about 115 px of chrome before the Schedule title, with a mostly empty second row | top, the header above "Schedule" | U-01 |
| 2 | medium | touch | Each spot row ends with two chevrons and a red-outlined ✕ side by side; the ✕ is the loudest element, one mistap from the down chevron, and reads as delete; the disabled chevrons (up on Shibuya Sky, down on teamLab Borderless) are still drawn; rows show no category mark | right end of the Shibuya Sky and teamLab Borderless rows | U-05 |
| 3 | low | layout | The list gets the upper half and the map the lower half; the Kyoto bucket is cut off at the map edge after its header, so its spots are not visible without scrolling the small list box | middle, where the list meets the map | U-20 |
| 4 | low | text | The map credit line is 11 px text (OpenFreeMap, OpenStreetMap and the separator dot) | bottom left, on the map | rejected: fixed at 11 px by design and legible, as accepted in the automated findings |

## Raw checks

- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot between the two credit links, not content
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the 11 px credit line is fixed by design and legible
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the 11 px credit line is fixed by design and legible
