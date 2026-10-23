# schedule-390-dark

- Screen: schedule
- Width: 390
- Theme: dark
- Locale: en

## Seen

- One-row trip header: back arrow, "Japan 2026", avatar "S" at the right; below it the title "Schedule" with a white "+ Bucket" and an outlined "+ Single" button
- Single entry "Arrival" (home spot Hotel Gracery, 12 Apr 2026 15:00) with a dot, a pencil icon and its own "Add spot" button indented to x=56
- Bucket "Tokyo" (Hotel Gracery, 12 Apr 2026 – 16 Apr 2026) with a collapse chevron and pencil; rows "Shibuya Sky" (13 Apr 2026 18:00) and "teamLab Borderless" (14 Apr 2026), each with up and down chevrons and a red-outlined ✕; the first row's up chevron and the last row's down chevron are drawn dim
- Bucket "Kyoto" (Kyoto Ryokan, 17 Apr 2026 – 20 Apr 2026) with the row "Fushimi Inari" (18 Apr 2026 09:00), the same chevrons and ✕, and an "Add spot" button
- The list ends at about y=665 and the rest down to the bottom bar is empty; the bottom bar shows Map, List, Schedule (active, bold) and More

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | Each spot row ends in a red-outlined ✕ right next to the down chevron; it is the loudest element in the row, one mistap from a move button, and reads as delete although it only removes the spot from the bucket. The dimmed chevrons of the first and last row are still drawn, and the rows show no category mark | right end of the spot rows in Tokyo and Kyoto | U-05 |
| 2 | low | consistency | The left edges do not line up: bucket titles and the Arrival title start at x=64, the spot rows and the bucket "Add spot" buttons at x=16, and the Arrival "Add spot" button at x=56, so the hierarchy of bucket and spot is hard to read and the two "Add spot" buttons sit at different indents | left column, from the Arrival entry down to the Kyoto bucket | U-39 |
| 3 | low | state | The "Add spot" button under the single entry "Arrival" looks the same as the bucket ones although a single entry is one fixed appointment; it is unclear what it adds | under "Arrival", top left | U-39 |

## Raw checks

None.
