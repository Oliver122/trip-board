# admin-users-390-light-de

- Screen: admin-users
- Width: 390
- Theme: light
- Locale: de

## Seen

- Top left, 24 px from the edge, the plain text "Der Admin-Bereich braucht einen größeren Bildschirm." wrapped over two lines.
- Below it the text link "Meine Reisen" (87 × 17 px at x 24, y 80), styled like body text.
- No header, logo, theme switch or account menu, and no bottom bar.
- The rest of the viewport, about 750 px, is empty.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The only action, the "Meine Reisen" link, is 17 px high and 87 px wide, far under 44 px, and looks like plain text | top left, under the notice | U-06 |
| 2 | medium | mobile | The notice is a bare page with no header, theme switch or account menu, and about 90 % of the screen is empty | whole screen | U-06 |

## Raw checks

- `target-size` Meine Reisen (`div#root > main.mx-auto > a.cursor-pointer`) → U-06
