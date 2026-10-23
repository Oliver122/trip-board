# join-invalid-1280-light

- Screen: join-invalid
- Width: 1280
- Theme: light
- Locale: en

## Seen

- One-row header: "Trip Board" with pin icon top left; top right the Light (selected, dark fill) / Dark / System switch and the avatar "S" with the name "sven".
- Below the header a large empty off-white area, with a small white card centred about 448 px wide (x 417 to 863, y 398 to 565).
- Inside the card an EN / DE segmented control as a full-width bordered bar, EN selected (dark fill), DE plain, with empty bordered space to its right.
- Heading "Join a trip", then the line "This invite link is not valid."
- Nothing else on the page: no link, button or hint after the message.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | state | The invalid invite message "This invite link is not valid." is a dead end: no *My trips* link, no hint to ask for a new link, although the user is signed in as sven. | centre card, below the heading | U-15 |
| 2 | low | visual | The EN/DE control stretches across the full card width with DE left-aligned, leaving about 320 px of empty bordered bar. | top of the centre card | U-12 |
| 3 | low | consistency | The card is small (about 448 × 168 px) in a mostly empty 1280 × 900 page, and carries a language switch that other error pages such as not-found do not. | centre of the page | U-15 |

## Raw checks

None.
