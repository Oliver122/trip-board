# schedule-1280-dark

- Screen: schedule
- Width: 1280
- Theme: dark
- Locale: en

## Seen

- One-row header: Trip Board logo, Board / Schedule (active) / Trip settings tabs, News, three member avatars (S, A, T), Light / Dark (active) / System switch and the user sven.
- Left column titled Schedule with + Bucket and + Single buttons; the map fills the right 860 px (Japan, with pins near Osaka and Tokyo, zoom buttons bottom right, OpenFreeMap · OpenStreetMap credit bottom left).
- Single entry Arrival, home Hotel Gracery, 12 Apr 2026 15:00, with an edit pencil and an Add spot button.
- Bucket Tokyo (home Hotel Gracery, 12 Apr 2026 – 16 Apr 2026) with spots Shibuya Sky (13 Apr 2026 18:00) and teamLab Borderless (14 Apr 2026), each with a drag handle, two chevrons and a red-outlined ✕.
- Bucket Kyoto (home Kyoto Ryokan, 17 Apr 2026 – 20 Apr 2026) with Fushimi Inari (18 Apr 2026 09:00) and its own Add spot button.
- Lower third of the list column is empty; dates are in one consistent English format.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The red-outlined ✕ at the end of every spot row is the loudest element, sits next to the down chevron and reads as delete although it only removes the spot from the bucket; the disabled chevron (up on Shibuya Sky, down on teamLab Borderless) is still drawn and there is no category mark on the rows | right end of each spot row in the list column | U-05 |
| 2 | low | consistency | The Add spot button under the single entry Arrival is indented to x=56 (aligned with the title), while the Add spot buttons under Tokyo and Kyoto start at x=16, so the three identical buttons do not line up | list column, under Arrival versus under the buckets | U-39 |

## Raw checks

- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: separator dot of the map credit line, not content
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the credit line is fixed at 11 px by design and stays legible bottom left of the map
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: same 11 px credit line
