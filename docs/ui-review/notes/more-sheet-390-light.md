# more-sheet-390-light

- Screen: more-sheet
- Width: 390
- Theme: light
- Locale: en

## Seen

- Title "More" at the top left with a × close button at the top right, a thin divider below.
- Four full-width rows with icons: Settings, Members, News, and Low data with the value "Off" at the right edge, each about 48 px apart.
- Below them a Light / Dark / System segmented control, Light selected (dark fill, white text), about 44 px high and 186 px wide, left-aligned.
- The rest of the screen, about 530 px, is empty white; no bottom tab bar and no header are visible.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | layout | The sheet content does not sit on one left/right margin: the title "More" starts at 16 px, but the row icons, the Light segment and the right-aligned "Off" are only about 12 px from the screen edge, short of the 16 px phone margin | rows, theme switch and "Off" along both screen edges | U-22 |
| 2 | low | visual | The theme switch has no label and is left-aligned at 186 px width, so it reads as a stray control under the list; the rows have no separators or chevrons and the "Off" value looks like plain text, not a control | below the Low data row, left | U-37 |
| 3 | low | layout | The sheet is a full-height white page with about 530 px of empty space under five short items, with no bottom bar visible, so it looks like a separate screen rather than a sheet over the board | lower two thirds of the screen | U-22 |

## Raw checks

None.
