# more-sheet-390-dark

- Screen: more-sheet
- Width: 390
- Theme: dark
- Locale: en

## Seen

- A full-screen dark sheet titled "More" at the top left, with a × close button at the top right, and a divider line under the title row.
- Four plain rows with a line icon on the left, about 48 px apart: Settings, Members, News and Low data. The Low data row shows the value "Off" at the right edge.
- Below the rows is a Light / Dark / System segmented control, left-aligned and about 186 px wide, with Dark selected (white fill, dark text). It has no label.
- Everything below y = 315 is empty dark background, about 530 px, and no bottom tab bar is visible.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | layout | The rows and the theme control start 12 px from the left edge and "Off" ends 12 px from the right edge, while the title "More" sits at 16 px. The phone gutter should be 16 px and the title and rows do not line up. | left and right edges, rows under the title | U-22 |
| 2 | low | visual | The theme switch has no label or heading and is left-aligned at about 186 px, while the rows above run full width, so it reads as a stray control. The Light / Dark / System buttons are a different style from the rows (bordered, no icon). | below the Low data row | U-37 |
| 3 | low | state | The Low data row shows only "Off" as plain grey text, with no switch or chevron, so it is unclear that it can be tapped. The setting has three values (auto, on, off, C-APP-37) and the sheet shows no explanation of what Low data does or that auto is an option. | Low data row, right side | U-36 |
| 4 | low | layout | The sheet fills the whole screen and hides the bottom bar, so the user cannot see which tab they came from. About 530 px below the list is empty. Only the small × leads back, at the top right, far from the thumb. | whole screen, bottom half empty | U-22 |

## Raw checks

None.
