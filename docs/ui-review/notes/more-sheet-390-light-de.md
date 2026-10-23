# more-sheet-390-light-de

- Screen: more-sheet
- Width: 390
- Theme: light
- Locale: de

## Seen

- Full-screen sheet titled "Mehr" at the top left with a × close button at the top right, a divider below.
- Four rows, each about 48 px high with an icon and label: Einstellungen, Mitglieder, Neuigkeiten, Datensparmodus (the last with the value "Aus" at the right edge).
- Below the rows a segmented theme control "Hell" (selected, black) / "Dunkel" / "System", about 44 px high, left-aligned and only about 190 px wide.
- Everything ends at about 315 px; the remaining 530 px of the screen is empty white and no bottom tab bar is visible.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | layout | The row icons, the theme control and the "Aus" value sit about 12 px from the screen edge, while the "Mehr" title starts at 16 px, so the sheet has two different side insets instead of 16 px | left and right edges of the rows and the theme control | U-22 |
| 2 | low | state | "Datensparmodus" shows only the value "Aus" as plain grey text, so it does not look tappable, and the three states auto, an and aus (C-APP-37) cannot be told apart; no explanation is shown | fourth row, right side | U-36 |
| 3 | low | visual | The theme control has no label ("Design" or "Darstellung") and does not match the rows above it: it is a small left-aligned block under a list of full-width rows | below the fourth row | U-37 |
| 4 | low | layout | The sheet fills the whole screen but uses only the top third; the rest is empty and the tab bar is not shown, so the only way back is the × at the top right, far from the thumb. DESIGN.md §3.7 draws a bottom bar with ⋯ and does not say that a full-screen sheet replaces it | lower two thirds of the screen | rejected: C-APP-25 says dialogs are full-screen on the phone and the sheet is close to that; compare with the sheet at 390 light English to see whether it is the same |

## Raw checks

None.
