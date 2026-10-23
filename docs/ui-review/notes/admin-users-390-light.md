# admin-users-390-light

- Screen: admin-users
- Width: 390
- Theme: light
- Locale: en

## Seen

- Top left at 24 px from the edge: the single line "The admin area needs a larger screen." in dark text on an off-white page.
- Directly below it, a plain-text link "My trips" in the same colour and size as body text, with no underline, button or icon.
- No header, logo, theme switch or account menu, and no bottom bar.
- Everything below y≈80 is empty background down to the bottom of the 844 px viewport (about 90 % of the screen).

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The only action, the "My trips" link, is 54×17 px (needs 44 px high) and looks like plain text, so it is hard to see and to tap. | top left, under the notice line | U-06 |
| 2 | medium | mobile | The notice is a bare page with no page shell (header, theme switch, account menu) and about 90 % empty space. | whole screen | U-06 |
| 3 | low | layout | The 24 px left margin is not the 16 px phone edge spacing, but it is consistent between the two lines. | left edge | rejected: matches the admin dashboard notice and does not hurt reading |

## Raw checks

- `target-size` My trips (`div#root > main.mx-auto > a.cursor-pointer`) → U-06
