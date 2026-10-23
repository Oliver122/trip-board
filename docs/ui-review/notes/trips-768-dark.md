# trips-768-dark

- Screen: trips
- Width: 768
- Theme: dark
- Locale: en

## Seen

- Header on one row, about 62 px high: pin icon and "Trip Board" at the left, a Light / Dark / System switch with "Dark" selected (white), and the avatar "S" with "sven" at the right
- Title "My trips" at the left with a white "New trip" button at the right, both 32 px from the screen edge
- One trip card in the left half of the grid: "Japan 2026" with an "Owner" badge top right, "12 Apr 2026 – 24 Apr 2026", three member avatars (S, A, T), "Created by Sven" and a plain-text link "Trip settings"
- The right half of the grid and everything below the card (about 660 px) is empty, because there is a single trip

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | "Trip settings" is a plain grey text link with no underline or icon, only 20 px high (box 310 × 20), under the 24 px minimum at this width, and it is the only way from the card to the trip's settings | bottom of the Japan 2026 card | U-04 |
| 2 | low | layout | The header is a single 62 px row here, with no wrapping of the logo and the theme switch onto two rows, so U-01 does not show on this image | top, in the header | rejected: the header is one row at 768 px on this screen; U-01's wrapping cannot be seen here |

## Raw checks

- `target-size` Trip settings (`main.mx-auto > div.grid > article.flex > a.cursor-pointer`) → U-04
