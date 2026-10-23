# join-invalid-390-dark

- Screen: join-invalid
- Width: 390
- Theme: dark
- Locale: en

## Seen

- Header on two rows: pin icon and "Trip Board" top left, then below it a Light / Dark / System switch (Dark selected, white) and a round "S" avatar at the right, about 115 px of chrome in total
- Below the header a large empty black area of about 280 px
- A card, 16 px from the left and right edges, centred vertically, with an EN / DE segmented control (EN selected, white) that stretches over the full card width
- Card title "Join a trip" and the single line "This invite link is not valid."
- No button, link or hint below the message; the rest of the screen (about 280 px) is empty

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | mobile | The header wraps to two rows: the logo alone on the first row, the theme switch and avatar on the second, about 115 px of chrome with a mostly empty first row | top, in the header | U-01 |
| 2 | low | touch | The EN language button is 43 px wide (DE 42 px), under the 44 px target at 390; only the height is 44 px | middle, in the card, top left | U-11 |
| 3 | low | visual | The EN / DE control stretches over the full card width with the two buttons left-aligned, leaving a large empty bordered area to their right | middle, in the card, first row | U-12 |
| 4 | low | state | The invalid invite message gives no next step: no link to My trips or login and no hint to ask for a new link | middle, in the card, under "Join a trip" | U-15 |

## Raw checks

- `target-size` EN (`section.w-full > div.mb-4 > div.flex > button.min-h-11`) → U-11
- `target-size` DE (`section.w-full > div.mb-4 > div.flex > button.min-h-11`) → U-11
