# trips-390-dark

- Screen: trips
- Width: 390
- Theme: dark
- Locale: en

## Seen

- Header on two rows: the pin logo and "Trip Board" at the top left, then below it a Light / Dark / System switch (Dark selected, white) and a round "S" avatar at the right; about 115 px of chrome before the content.
- Title "My trips" at the left with a white "New trip" button at the right, both 16 px from the screen edge.
- One trip card, "Japan 2026", with an "Owner" pill at its top right, the dates "12 Apr 2026 – 24 Apr 2026", three member avatars (S, A, T) and "Created by Sven".
- A plain-text "Trip settings" link at the bottom of the card, with no underline, icon or border.
- The lower 55 % of the screen is empty black.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The "Trip settings" link is a bare text link only 20 px high (box 324 × 20 at y 377) with no link styling, so it looks like a caption and is far below the 44 px target; it is the only way to open the trip's settings from this card. | bottom of the Japan 2026 card | U-04 |
| 2 | medium | mobile | The page header wraps to two rows: the logo alone on the first row, the theme switch and avatar on a second row, about 115 px of chrome with a mostly empty first row, which pushes "My trips" down. | top of the screen, above the title | U-01 |
| 3 | low | visual | The member avatars (S, A, T) are about 32 px and could be mistaken for buttons, but nothing indicates they are controls. | in the card, under the dates | rejected: they read as a static member list, no action is visible in the image |

## Raw checks

- `target-size` Trip settings (`main.mx-auto > div.grid > article.flex > a.cursor-pointer`) → U-04
