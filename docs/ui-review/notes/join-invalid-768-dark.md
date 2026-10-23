# join-invalid-768-dark

- Screen: join-invalid
- Width: 768
- Theme: dark
- Locale: en

## Seen

- Header on one row, 62 px high: "Trip Board" logo at the left; at the right a Light / Dark / System switch with "Dark" selected (white fill), then an avatar "S" and "sven".
- Below the header a large empty black area; the content is one card (about 448 px wide) centred on the screen at y 460 to 628.
- Card top: an EN / DE switch stretched across the card width, "EN" selected (white), "DE" unselected and left-aligned, the rest of the bordered bar empty.
- Card text: the heading "Join a trip" and the line "This invite link is not valid."
- The card has no button or link: no way to ask for a new link and no way back to My trips.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | state | The only content is "This invite link is not valid." with no next step: no My trips link or Back home, no hint to ask the inviter for a new link. The user is stuck except for the logo in the header | centre card, below the message | U-15 |
| 2 | low | visual | The EN / DE switch stretches over the full card width (about 397 px) with the two buttons left-aligned, so most of the bordered bar is empty | centre card, top row | U-12 |
| 3 | low | layout | The header is one row at 768 px, so the two-row wrapping described in U-01 does not show on this screen | top, in the header | rejected: header fits on one row here, U-01 does not apply to this image |

## Raw checks

None.
