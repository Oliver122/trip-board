# admin-users-390-dark

- Screen: admin-users
- Width: 390
- Theme: dark
- Locale: en

## Seen

- Near-black page, about 90 % empty below the first two lines.
- Top left at 24 px from the edge: the line "The admin area needs a larger screen." in white text.
- Below it a plain white text link "My trips" (54 × 17 px at x 24, y 59), styled like body text.
- No header, logo, theme switch, account menu or bottom bar; the rest of the 844 px viewport is blank.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | mobile | The notice is a bare page: one line of text and a link, with no header, theme switch or account menu, and the rest of the screen (about 90 %) is empty | whole screen, top left | U-06 |
| 2 | medium | touch | The *My trips* link is 54 × 17 px, far under 44 px, and looks like plain text, yet it is the only way out of this screen | top left, under the notice line | U-06 |
| 3 | low | mobile | The text sits 24 px from the screen edge, not the 16 px the phone layout uses elsewhere; minor inconsistency | top left | rejected: the layout is harmless and the notice page is replaced anyway under U-06 |

## Raw checks

- `target-size` My trips (`div#root > main.mx-auto > a.cursor-pointer`) → U-06
