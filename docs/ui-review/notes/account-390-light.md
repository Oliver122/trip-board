# account-390-light

- Screen: account
- Width: 390
- Theme: light
- Locale: en

## Seen

- Header on two rows: the "Trip Board" logo with pin icon, then below it the Light / Dark / System switch (Light selected) and the round "S" avatar, right-aligned
- Title "Account & settings" with "Signed in as Sven" under it
- Storage section: a full-width solid grey bar, the text "0/100 · 0 MB of 200 MB" and an outlined "Request more storage" button
- Low data section with a three-line explanation and three radio options in boxes: Automatic (selected), On, Off
- Settings section: Language with an EN / DE segmented control (EN selected), Theme with a Light / Dark / System control (Light selected), both stretched to full width with the buttons left-aligned
- A "List follows map" checkbox at the bottom edge; content sits 16 px from the left edge

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | mobile | The page header wraps to two rows: the logo alone on the first row, the theme switch and avatar on a second, so about 115 px of chrome sit above "Account & settings" and the first row is mostly empty | top, above the page title | U-01 |
| 2 | low | touch | The EN button is 43 px wide and DE 42 px wide, both under the 44 px target at 390 (the height of 44 is fine) | Settings, Language control | U-11 |
| 3 | low | visual | The Language and Theme segmented controls stretch to the full width with the buttons left-aligned, leaving a large empty bordered area to their right (about 270 px of the Language row, about 170 px of the Theme row) | Settings, Language and Theme rows | U-12 |
| 4 | low | visual | The storage meter at 0 / 200 MB is a solid mid-grey bar across the full width, so empty looks the same as full | Storage section, under the heading | U-16 |
| 5 | low | consistency | The theme can be set twice on this screen, in the header switch and again under Settings | header and Settings, Theme | rejected: C-APP-06 asks for the switch both in the header and in Account & settings |

## Raw checks

- `target-size` EN (`section.space-y-4 > div > div.flex > button.min-h-11`) → U-11
- `target-size` DE (`section.space-y-4 > div > div.flex > button.min-h-11`) → U-11
