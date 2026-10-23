# trips-390-light-de

- Screen: trips
- Width: 390
- Theme: light
- Locale: de

## Seen

- Header wraps to two rows: the pin icon and "Trip Board" at the top left, then below it the segmented switch "Hell / Dunkel / System" (Hell selected, dark fill) and a round "S" avatar at the right, about 115 px of chrome before content.
- Title "Meine Reisen" at the left and a black "Neue Reise" button at the right, both 16 px from the screen edge.
- One trip card "Japan 2026" with a small grey "Besitzer" badge at the top right, the dates "12. Apr. 2026 – 24. Apr. 2026", three member avatars S, A, T, "Erstellt von Sven".
- A plain-text link "Reiseeinstellungen" at the bottom of the card, styled like body text.
- The rest of the screen below the card (about 430 px) is empty, as expected with a single trip.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | mobile | The page header takes two rows (logo alone on the first, theme switch and avatar on the second), about 115 px of chrome with an empty right half in the first row, pushing "Meine Reisen" down | top, in the header | U-01 |
| 2 | medium | touch | "Reiseeinstellungen" is a text-only link 20 px high (box 324 × 20), looks like plain text and not like a link, far under 44 px | bottom of the Japan 2026 card | U-04 |
| 3 | low | visual | The "Besitzer" badge text is about 12 px and light grey on near-white, low contrast; it is informational only and not clickable, so this is acceptable for a role chip | top right of the card | rejected: a non-interactive role chip, readable in the image |

## Raw checks

- `target-size` Reiseeinstellungen (`main.mx-auto > div.grid > article.flex > a.cursor-pointer`) → U-04
