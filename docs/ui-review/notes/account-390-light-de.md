# account-390-light-de

- Screen: account
- Width: 390
- Theme: light
- Locale: de

## Seen

- Header on two rows: the logo "Trip Board" alone on the first row, then the Hell / Dunkel / System switch (Hell selected) and the avatar "S" on a second row, about 115 px of chrome before the title.
- Title "Konto & Einstellungen" with "Angemeldet als Sven" below it.
- Section "Speicher": a full-width solid grey bar, "0/100 · 0 MB von 200 MB" and the button "Mehr Speicher anfragen".
- Section "Datensparmodus" with a three-line explanation and the radio chips Automatisch (selected), An, Aus.
- Section "Einstellungen": "Sprache" with the EN / DE switch (DE selected, buttons left, empty bordered space on the right), "Darstellung" with a second Hell / Dunkel / System switch, and the checkbox "Liste folgt der Karte" at the bottom edge.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | touch | The language buttons EN (43 px) and DE (42 px) are under 44 px wide; only the height is 44 px | middle, in the Sprache row | U-11 |
| 2 | low | visual | The EN/DE and Hell/Dunkel/System switches stretch to the full width with the buttons left-aligned, leaving a large empty bordered area to the right | middle, Sprache and Darstellung rows | U-12 |
| 3 | low | visual | The storage meter at 0 MB of 200 MB is a solid mid-grey bar over the full width, so empty looks the same as full | upper part, under Speicher | U-16 |
| 4 | medium | mobile | The page header wraps to two rows (logo, then theme switch and avatar), with a mostly empty first row and about 115 px of chrome above the content | top, in the header | U-01 |
| 5 | low | consistency | The theme switch appears twice on the screen, in the header and again as Darstellung, with the same three options | top right, and middle | U-37 |
| 6 | low | touch | The checkbox "Liste folgt der Karte" is a small native checkbox of about 13 px with a text-height label, much less than the 44 px target on the phone | bottom, at the screen edge | U-25 |

## Raw checks

- `target-size` EN (`section.space-y-4 > div > div.flex > button.min-h-11`) → U-11
- `target-size` DE (`section.space-y-4 > div > div.flex > button.min-h-11`) → U-11
