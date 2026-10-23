# join-invalid-390-light

- Screen: join-invalid
- Width: 390
- Theme: light
- Locale: en

## Seen

- Header on two rows: pin icon with "Trip Board" at top left, then below it the Light / Dark / System switch (Light selected) and a round "S" avatar at the right, about 115 px of chrome in total.
- Below the header a large empty area, then a card centred vertically at about y 395 to 563, 16 px from the left and right edges.
- In the card an EN / DE segmented control stretched to the full card width (EN selected, DE next to it, a long empty bordered area to its right).
- The heading "Join a trip" and the single line "This invite link is not valid."
- Nothing else on screen: no link, button or hint for what to do next.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | touch | The EN language button is 43 px wide (DE 42 px), one or two pixels under the 44 px touch target at 390 px | in the card, EN / DE control at the top | U-11 |
| 2 | low | state | The invalid-invite message "This invite link is not valid." gives no next step: no My trips or Back home link and no hint to ask for a new link | in the card, under "Join a trip" | U-15 |
| 3 | medium | mobile | The page header wraps to two rows, the logo and then the theme switch and avatar on their own row, so about 115 px of chrome sit above a nearly empty page | top of the screen | U-01 |
| 4 | low | visual | The EN / DE control stretches over the whole card width with the buttons left-aligned, leaving a wide empty bordered area | in the card, top row | U-12 |

## Raw checks

- `target-size` EN (`section.w-full > div.mb-4 > div.flex > button.min-h-11`) → U-11
- `target-size` DE (`section.w-full > div.mb-4 > div.flex > button.min-h-11`) → U-11
