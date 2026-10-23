# not-found-390-dark

- Screen: not-found
- Width: 390
- Theme: dark
- Locale: en

## Seen

- Header row 1: pin icon and "Trip Board" logo at the left edge (x=16), nothing else on the row.
- Header row 2: Light / Dark / System switch with "Dark" selected (white), and a round "S" avatar at the right; the header ends with a divider at about y=115.
- Heading "Page not found" and the grey line "That page does not exist." start at x=111, not at the 16 px edge where the logo sits.
- One underlined link "Back home" (73 × 17 px at x=111, y=222) is the only action on the page.
- Below y=250 the screen is empty black down to 844 px; there is no bottom bar.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | "Back home", the only way out of the page, is a plain underlined text link 73 × 17 px, far under the 44 px phone target, so it is hard to hit | below the text, top left of the content | U-04 |
| 2 | medium | mobile | The header wraps to two rows: the logo alone on the first, the theme switch and avatar on the second, about 115 px of chrome before the content, with the first row mostly empty | top, in the header | U-01 |
| 3 | low | layout | The 404 text and link start at x=111 while the logo and every phone screen use a 16 px edge, so the content is neither flush with the header nor centred (the text block spans x=111 to 279 on a 390 px screen) | upper left, under the header | U-38 |
| 4 | low | state | The grey sentence "That page does not exist." is low-contrast on black, and the page is otherwise empty with no hint of where the user was | under the heading | rejected: the grey is still readable at about 14 px and the page names one next step, Back home |

## Raw checks

- `target-size` Back home (`div.flex > div.flex > main.mx-auto > a.cursor-pointer`) → U-04
