# admin-dashboard-390-light-de

- Screen: admin-dashboard
- Width: 390
- Theme: light
- Locale: de

## Seen

- Top left, 24 px from the edge: the one-line notice "Der Admin-Bereich braucht einen größeren Bildschirm." wrapped onto two lines (y 35 and 56).
- Directly below it a plain-text link "Meine Reisen" (y about 89), styled like body text with no underline, button shape or icon.
- No header, logo, theme switch or account menu anywhere.
- The remaining roughly 88 % of the 844 px viewport is empty off-white space.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The only action, the "Meine Reisen" link, is 87 × 17 px (under 44 px) and looks like plain text, so it is hard to see and hit | top left, under the notice | U-06 |
| 2 | medium | mobile | The notice is a bare page without the normal shell (no header, theme switch or account menu) and about 88 % of the screen is empty | whole screen | U-06 |

## Raw checks

- `target-size` Meine Reisen (`div#root > main.mx-auto > a.cursor-pointer`) → U-06
