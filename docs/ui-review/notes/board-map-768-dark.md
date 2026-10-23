# board-map-768-dark

- Screen: board-map
- Width: 768
- Theme: dark
- Locale: en

## Seen

- Header on two rows: Trip Board logo with Board (active), Schedule and Trip settings tabs; below, a row with News, avatars S, A, T, the Light/Dark/System switch (Dark active) and the account "sven", about 115 px of chrome
- Map on the left (about 488 px wide) zoomed out over East Asia (Sea of Okhotsk, Vladivostok, Seoul, Hiroshima, Philippine Sea) with three tiny pins/clusters around Honshu near Osaka and Tokyo
- Bottom of the map: a white "Add new" button bottom left, the OpenFreeMap / OpenStreetMap credit line under it, and zoom in, zoom out and locate buttons bottom right
- Right list column "Things to do", "6 spots", with search, filter, sort, import and export icon buttons
- Scheduled rows: Shibuya Sky 13 Apr 2026 18:00, teamLab Borderless 14 Apr 2026 00:00, Fushimi Inari 18 Apr 2026 09:00, each with a blue calendar icon
- Divider "Not scheduled yet", then Nara Park (Nara Park, Nara) with a green "?" mark, Hotel Gracery and Kyoto Ryokan with yellow home icons
- Footer of the list column: a native checkbox "Only visible on map"; empty dark space between the last row and the footer

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | mobile | The page header wraps to two rows: the logo and tabs, then News, avatars, theme switch and username on their own right-aligned row, leaving the first row's right half empty and pushing the map and list down by about 115 px | top, in the header | U-01 |
| 2 | low | visual | The map is zoomed out over half of East Asia for spots that all lie in Japan, so the pins are small and cluster near Osaka and Tokyo, a pin covers part of the "Osaka" label, and most of the map is empty sea and unrelated regions | left, map area | U-24 |
| 3 | low | consistency | "Only visible on map" uses the browser's native checkbox (a small light square on the dark footer), unlike the styled chips and icon buttons above it, and it is about 13 px, below the 24 px target | bottom right, list footer | U-25 |
| 4 | low | visual | Nara Park is marked with a bare green "?" glyph that is not self-explanatory and differs from the icons of the other unscheduled rows | right column, Nara Park row | U-27 |

## Raw checks

- `small-text` · (`div.relative > div.relative > div.absolute > p.absolute`) → accepted: the separator dot of the map credit line, not content
- `small-text` OpenFreeMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the credit line is fixed at 11 px by design and readable bottom left of the map
- `small-text` OpenStreetMap (`div.relative > div.absolute > p.absolute > a.cursor-pointer`) → accepted: the credit line is fixed at 11 px by design and readable bottom left of the map
