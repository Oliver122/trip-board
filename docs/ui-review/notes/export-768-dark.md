# export-768-dark

- Screen: export
- Width: 768
- Theme: dark
- Locale: en

## Seen

- Header on two rows behind the dimmed backdrop: Trip Board, Board (active), Schedule, Trip settings on the first row; News, avatars S A T, the Light/Dark/System switch (Dark active) and "sven" on the second.
- Behind the dialog the map (Japan, Korea, Sea of Okhotsk) on the left and the "Things to do" list column, 6 spots, with search, filter, sort, import and export icon buttons on the right; Shibuya Sky 13 Apr 2026 18:00 is the first card.
- Centered dialog titled "Export “Japan 2026”" with a × close button at the top right.
- Scope group: "Full list" (selected) and "Current view (0 filters)" radios; Format group: "CSV" (selected), "PDF" and "Calendar (.ics)" radios.
- Footer with one outlined "Download" button at the bottom right; there is no Cancel button, and × is the only way to close.
- Add new button and zoom/locate controls at the bottom of the map, and "Only visible on map" checkbox at the bottom of the list column, all dimmed.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | mobile | The page header wraps to two rows: the nav tabs on the first, News, avatars, the theme switch and the username on the second, about 115 px of chrome before any content at 768 px | top, the whole header | U-01 |
| 2 | low | consistency | "Download" is an outlined secondary button, while confirm actions elsewhere are solid, and the radios are the browser's native ones, unlike the chips elsewhere in the app | bottom right of the dialog, and the radio lists | U-19 |
| 3 | low | visual | Dialog follows DESIGN.md §3.6 and reads well: title, groups, labels and the Download button are legible against the dark card; the default selection is clear | whole dialog | rejected: matches the design and nothing is wrong |

## Raw checks

None.
