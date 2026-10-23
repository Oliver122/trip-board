# join-invalid-1280-dark

- Screen: join-invalid
- Width: 1280
- Theme: dark
- Locale: en

## Seen

- Header on one row: "Trip Board" logo with pin icon at the top left; at the top right a Light / Dark / System switch with Dark selected (white fill), then an avatar "S" and the name "sven".
- A single card, about 448 px wide, centred in the page (roughly y 397 to 565), with large empty dark space above and below it.
- At the top of the card an EN / DE segmented control stretched over the card width: EN selected (white fill), DE next to it, and about 320 px of empty bordered area to its right.
- Title "Join a trip" below the control, then the single line "This invite link is not valid."
- Nothing else in the card: no button, no link and no hint about what to do next.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | state | The card says only "This invite link is not valid." and offers no next step: no *My trips* link and no hint to ask the inviter for a new link, so the signed-in user is left on a dead end and must use the browser or the logo | centre card, under the title "Join a trip" | U-15 |
| 2 | low | visual | The EN/DE segmented control stretches over the full card width with its two buttons left-aligned, leaving a large empty bordered area right of DE | top of the centre card | U-12 |
| 3 | low | consistency | A language switch is the first element of a card that only shows an error, so it draws more attention than the message itself; the title "Join a trip" also does not tell that the link failed (compare with the not-found page) | centre card, above the title | U-15 |

## Raw checks

None.
