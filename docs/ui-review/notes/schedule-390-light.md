# schedule-390-light

- Screen: schedule
- Width: 390
- Theme: light
- Locale: en

## Seen

- One-row phone header: back chevron, "Japan 2026", avatar "S" at the right.
- Title "Schedule" with two buttons on its right: black "+ Bucket" and outlined "+ Single".
- Single entry "Arrival" (dot marker, home spot "Hotel Gracery", 12 Apr 2026 15:00) with a pencil edit button and an "Add spot" button below.
- Bucket "Tokyo" (chevron, Hotel Gracery, 12 Apr 2026 – 16 Apr 2026) with rows Shibuya Sky (13 Apr 2026 18:00) and teamLab Borderless (14 Apr 2026), each with up/down chevrons and a red-outlined ✕, then "Add spot".
- Bucket "Kyoto" (Kyoto Ryokan, 17 Apr 2026 – 20 Apr 2026) with Fushimi Inari (18 Apr 2026 09:00), chevrons, ✕ and "Add spot".
- About 120 px of empty space below the list, above the bottom bar (Map, List, Schedule active, More).

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | Each spot row ends with two chevrons and a red-outlined ✕ packed into about 130 px; the ✕ is the loudest element and sits one mistap from the down chevron, it only removes the spot from the bucket but reads as delete, and disabled chevrons (first up, last down) are still drawn greyed. Rows also show no category mark. | right end of the Shibuya Sky, teamLab Borderless and Fushimi Inari rows | U-05 |
| 2 | low | mobile | Header is a single row of about 48 px with back, trip name and avatar, as C-APP-35 asks; no wrapped header here. | top of the screen | rejected: the phone trip header is as designed, U-01 does not apply on this screen |
| 3 | low | layout | Empty space under the last bucket is only the end of a short list, not chrome pushing content down. | below Kyoto, above the bottom bar | rejected: the list is short, nothing is hidden |

## Raw checks

None.
