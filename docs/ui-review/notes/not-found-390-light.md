# not-found-390-light

- Screen: not-found
- Width: 390
- Theme: light
- Locale: en

## Seen

- Top row: a map-pin icon and the "Trip Board" wordmark at the left edge, with nothing else on the row.
- Second row: a Light / Dark / System segmented switch with "Light" selected (dark fill), and a round grey avatar "S" at the right edge.
- A divider line under the header at about y=115, so the header takes about 115 px of the 844 px screen.
- Heading "Page not found", with "That page does not exist." under it.
- An underlined "Back home" link (about 73×17 px at y=222) as the only action.
- Everything below y=245 is empty, so about 70 % of the screen is blank.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | "Back home" is the only way out of the page, yet it is a plain underlined text link 73×17 px, far under the 44 px target at 390 | below the body text, left of centre | U-04 |
| 2 | medium | mobile | The header wraps to two rows: the logo row has nothing next to it, and the theme switch and avatar sit on their own row, about 115 px of chrome before the content | top of the screen, in the header | U-01 |
| 3 | low | layout | The content starts about 111 px from the left edge while the logo above sits 16 px from it, so the heading, text and link are not aligned with the header and the phone's 16 px edge spacing is not used | left, under the header | U-38 |

## Raw checks

- `target-size` Back home (`div.flex > div.flex > main.mx-auto > a.cursor-pointer`) → U-04
