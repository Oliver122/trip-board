# trips-390-light

- Screen: trips
- Width: 390
- Theme: light
- Locale: en

## Seen

- Header on two rows: the pin logo and "Trip Board" at top left, then below it, right-aligned, the Light / Dark / System switch (Light selected) and a round "S" avatar; about 115 px of chrome before the title.
- Title row: "My trips" at left, a dark "New trip" button at right, both 16 px from the screen edges.
- One trip card, "Japan 2026", with a small "Owner" badge at its top right.
- Inside the card: the dates "12 Apr 2026 – 24 Apr 2026", three grey member avatars (S, A, T), "Created by Sven" and a plain-text "Trip settings" link at the bottom.
- Below the card the screen is empty down to the bottom edge (one trip only).

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | mobile | The header wraps to two rows: the logo alone on the first row and the theme switch and avatar on a second, mostly empty row, so about 115 px are chrome before "My trips" starts. | top of the screen, in the header | U-01 |
| 2 | medium | touch | "Trip settings" is a text-only link 20 px high in a 324 px wide box, with no underline or chevron, so it reads as plain text and is hard to tap. | bottom of the trip card | U-04 |
| 3 | low | visual | The "Owner" badge is small (about 12 px text) and sits a little above the baseline of the card title "Japan 2026", so the two do not line up. | top right of the trip card | U-44 |
| 4 | low | visual | The three member avatars (S, A, T) are identical light grey circles with one letter and no count or name, so they say little about who is in the trip. | in the trip card, under the dates | rejected: the seed users have no avatar image, so the letter circles are the designed fallback (C-MEMB-21) |

## Raw checks

- `target-size` Trip settings (`main.mx-auto > div.grid > article.flex > a.cursor-pointer`) → U-04
