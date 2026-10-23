# not-found-390-light-de

- Screen: not-found
- Width: 390
- Theme: light
- Locale: de

## Seen

- Top row: pin icon and "Trip Board" at the left edge, about 16 px from the screen edge, with nothing else on the row.
- Second row: the segmented theme switch "Hell" (selected, dark fill) / "Dunkel" / "System" and a grey round avatar "S", right-aligned; the header is about 115 px high in total, ending in a thin divider line.
- Heading "Seite nicht gefunden" and the line "Diese Seite gibt es nicht." are German and read fine.
- Below that, the underlined link "Zur Startseite" is the only way out of the page; it is small and plain text.
- The content block starts at about x=95 instead of 16, so it is indented far from the header's left edge; everything below y=245 is empty.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | "Zur Startseite", the only action on the page, is a plain underlined text link only 89 × 17 px, far under the 44 px target and not styled as a button | below the text, left of centre | U-04 |
| 2 | medium | mobile | The header wraps to two rows: the logo alone on the first row, the theme switch and avatar on the second, about 115 px of chrome before the 404 message | top of the screen | U-01 |
| 3 | low | layout | The content block starts at x≈95, while the logo is at x≈16 and the phone rule is 16 px from the edge; heading and link do not line up with the header, and the page is empty below the link | left side, under the header | U-38 |

## Raw checks

- `target-size` Zur Startseite (`div.flex > div.flex > main.mx-auto > a.cursor-pointer`) → U-04
