# account-390-dark

- Screen: account
- Width: 390
- Theme: dark
- Locale: en

## Seen

- Header on two rows: pin logo and "Trip Board" at the top left, then below it the Light / Dark / System switch (Dark selected, white) and a round "S" avatar at the right, about 115 px of chrome in total
- Title "Account & settings" with "Signed in as Sven" below it
- Storage section: a solid grey bar across the full width, "0/100 · 0 MB of 200 MB", and a "Request more storage" button
- Low data section with a grey explanation text of four lines and three radio buttons: Automatic (selected, outlined), On, Off
- Settings section: Language with an EN / DE segmented control (EN selected) stretched over the full width, Theme with Light / Dark / System (Dark selected) also stretched, and a "List follows map" checkbox at the very bottom edge

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | mobile | The header wraps to two rows: the logo alone on the first row, the theme switch and avatar on the second, so about 115 px of the 844 px screen is chrome before "Account & settings" | top, in the header | U-01 |
| 2 | low | touch | The EN button is 43 px wide and DE 42 px wide, under the 44 px touch target at 390 px (the height is 44 px) | Settings, Language control | U-11 |
| 3 | low | visual | The EN / DE and Light / Dark / System controls stretch over the full width with the buttons left-aligned, leaving a large empty bordered area on the right | Settings, Language and Theme rows | U-12 |
| 4 | low | visual | The storage meter at 0/100 and 0 MB of 200 MB is a solid mid-grey bar over the full width, so empty looks the same as full | Storage section, below the title | U-16 |
| 5 | low | consistency | The theme choice appears twice on the same screen (header switch and the Theme row in Settings), which looks redundant on the phone | header and Settings, Theme row | rejected: the Settings row is what DESIGN.md asks for on the account screen and the header switch is part of the shared header (U-01 covers its cost) |

## Raw checks

- `target-size` EN (`section.space-y-4 > div > div.flex > button.min-h-11`) → U-11
- `target-size` DE (`section.space-y-4 > div > div.flex > button.min-h-11`) → U-11
