# trips-768-light

- Screen: trips
- Width: 768
- Theme: light
- Locale: en

## Seen

- Header on one row, 62 px high: pin icon and "Trip Board" at the left, a Light/Dark/System switch (Light selected, dark fill) and the avatar "S" with "sven" at the right.
- Page title "My trips" at the left with a solid black "New trip" button at the right, 16 px+ from the 32 px page margin.
- One trip card, "Japan 2026", about 343 px wide in the left of a multi-column grid, with an "Owner" badge top right.
- The card shows the dates "12 Apr 2026 – 24 Apr 2026", three member avatars (S, A, T), "Created by Sven" and a plain-text "Trip settings" link at the bottom.
- The rest of the screen below the card (about 660 px) is empty off-white.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The "Trip settings" link is plain text at the same style as the card's body text and only 20 px high (box 310×20), so it does not look clickable and is under the 24 px minimum; it is the only way to the trip settings from this screen | bottom of the "Japan 2026" card | U-04 |
| 2 | low | layout | The header is a single row here (logo left, theme switch and account right), so the two-row wrap described for U-01 does not show at 768 on this screen | top, in the header | rejected: U-01 describes a header that wraps to two rows; this image shows one row of 62 px |
| 3 | low | layout | With one trip the card fills only the first of the grid columns and the right two thirds of the row stay empty; this is how the grid lays out a single item and nothing is cut off | middle left, beside the card | rejected: a one-item grid is expected with the seeded data |

## Raw checks

- `target-size` Trip settings (`main.mx-auto > div.grid > article.flex > a.cursor-pointer`) → U-04
