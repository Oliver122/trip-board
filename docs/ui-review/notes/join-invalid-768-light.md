# join-invalid-768-light

- Screen: join-invalid
- Width: 768
- Theme: light
- Locale: en

## Seen

- One-row header, 62 px high: pin logo and "Trip Board" at the left; Light (selected, black), Dark, System switch, avatar "S" and "sven" at the right
- Below it about 400 px of empty page, then a centred white card (about 448 px wide, 160 to 608 px across) with a thin border and a soft shadow
- Top of the card: an EN / DE segmented control, EN selected (black), stretched over the full card width so DE is followed by about 330 px of empty bordered area
- Heading "Join a trip", then the single line "This invite link is not valid."
- The card ends there: no button, link or hint; the rest of the page below the card is empty

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | state | The card says only "This invite link is not valid." and offers no next step: no My trips link, no hint to ask the inviter for a new link. The user is stuck unless they use the logo or browser back | centre card, under the heading "Join a trip" | U-15 |
| 2 | low | visual | The EN/DE segmented control stretches over the whole card width with the buttons left-aligned, leaving a large empty bordered strip right of DE | top of the centre card | U-12 |
| 3 | low | layout | The card floats in the vertical middle with about 400 px of empty space above it, while the invalid-link message is a one-line state; a language switch dominates the card above the heading | centre of the page | U-15 |
| 4 | low | layout | The header is one row at 768 px here, so the two-row header of U-01 does not show on this image | top, in the header | rejected: header is a single 62 px row at 768, U-01 does not apply to this image |

## Raw checks

None.
