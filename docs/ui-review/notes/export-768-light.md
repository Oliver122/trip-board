# export-768-light

- Screen: export
- Width: 768
- Theme: light
- Locale: en

## Seen

- A centred modal, about 384 px wide, titled "Export “Japan 2026”" with a × at the top right, over the board (map plus the "Things to do" column, 6 spots) dimmed by a light overlay.
- Scope group: radio "Full list" (selected) and "Current view (0 filters)", under a "Scope" label.
- Format group: radio "CSV" (selected), "PDF" and "Calendar (.ics)", under a "Format" label.
- Footer separated by a rule, with an outlined "Download" button at the bottom right.
- Behind the dialog the header wraps to two rows (Trip Board, Board/Schedule/Trip settings tabs, then News, avatars S A T, Light/Dark/System switch and "sven"), and the list rows Shibuya Sky, Borderless, Fushimi Inari, Hotel Gracery and Kinkaku-ji peek out on the right.
- The dialog matches the DESIGN.md §3.6 layout: title, scope, format, Download.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | consistency | "Download" is an outlined secondary button, not the solid primary used for confirm actions elsewhere, and the radios are the browser's native 13 px ones, unlike the chips used in other panels. The confirm action looks like a secondary one. | bottom right, in the dialog footer; the radio dots in the dialog body | U-19 |
| 2 | medium | mobile | The page header behind the dialog wraps to two rows and takes about 115 px of chrome before any content. This is outside the dialog but shows in this image. | top, behind the overlay | U-01 |

## Raw checks

None.
