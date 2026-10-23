# join-invalid-390-light-de

- Screen: join-invalid
- Width: 390
- Theme: light
- Locale: de

## Seen

- Header wraps to two rows: "Trip Board" with a pin icon at the top left, then below it the theme switch (Hell selected, Dunkel, System) and a grey round avatar "S" at the right; about 115 px of chrome before the content.
- A large empty area (about 280 px) above the card, and about 280 px below it; the card is centred vertically in the viewport.
- The card, 16 px from both screen edges, starts with an EN / DE language switch (DE selected, black) that stretches across the whole card width, with the buttons left-aligned and an empty bordered area to the right.
- Heading "Reise beitreten", below it the text "Dieser Einladungslink ist ungültig."
- Nothing else on the screen: no link, button or hint for what to do next.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | touch | The EN and DE language buttons are 43 and 42 px wide (44 px high), one or two pixels under the 44 px touch target at 390 px | top of the card, left | U-11 |
| 2 | low | state | The only content is "Dieser Einladungslink ist ungültig." with no next step: no hint to ask for a new link and no link to My trips or home, so the user is stuck on the screen | in the card, under the heading | U-15 |
| 3 | low | visual | The EN/DE segmented control stretches over the full card width, leaving about 220 px of empty bordered space to the right of the two buttons | top of the card | U-12 |
| 4 | medium | mobile | The page header wraps to two rows (logo, then theme switch and avatar on their own row) and costs about 115 px before any content, with the first row mostly empty | top of the screen | U-01 |

## Raw checks

- `target-size` EN (`section.w-full > div.mb-4 > div.flex > button.min-h-11`) → U-11
- `target-size` DE (`section.w-full > div.mb-4 > div.flex > button.min-h-11`) → U-11
