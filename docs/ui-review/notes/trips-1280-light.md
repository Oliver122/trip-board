# trips-1280-light

- Screen: trips
- Width: 1280
- Theme: light
- Locale: en

## Seen

- Single-row header: pin icon and "Trip Board" at the left; at the right the Light / Dark / System switch (Light selected, dark fill) and an avatar "S" with "sven".
- Page title "My trips" at the left of a 960 px column, with a dark "New trip" button at the right edge of that column.
- One trip card, "Japan 2026", with an "Owner" badge top right, the dates "12 Apr 2026 – 24 Apr 2026", three member avatars (S, A, T) and "Created by Sven".
- The card ends with a plain-text "Trip settings" link, about 20 px high, in the same colour as body text.
- The card takes about 470 px of the 960 px column; the rest of the page below and to the right of it is empty.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The "Trip settings" link is plain text about 20 px high with no link styling, so it does not look clickable and is a small target (box 438×20 px; under the 24 px minimum for this width). It is the only way to the trip's settings from this screen. | bottom of the trip card, left | U-04 |
| 2 | low | visual | The card is the only content and fills only the left half of the column; the right half and everything below is empty, so the screen looks unfinished. This is expected with one trip in the seed. | main area, right of and below the card | rejected: the seed has a single trip, the grid fills with more trips |

## Raw checks

- `target-size` Trip settings (`main.mx-auto > div.grid > article.flex > a.cursor-pointer`) → U-04
