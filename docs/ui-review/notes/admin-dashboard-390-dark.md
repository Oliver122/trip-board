# admin-dashboard-390-dark

- Screen: admin-dashboard
- Width: 390
- Theme: dark
- Locale: en

## Seen

- Near-black page, 24 px from the left edge; the rest of the 390×844 image below y=80 is empty.
- Top line in white text: "The admin area needs a larger screen." (y≈35).
- Below it a single plain-text link "My trips" (y≈59 to 76, 54×17 px), styled the same as body text.
- No header, logo, theme switch, account menu or bottom bar is visible.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | mobile | The notice is a bare page: no header, theme switch, account menu or bottom bar, and about 90 % of the screen is empty, so it does not look like part of the app. | whole screen, below the two lines of text | U-06 |
| 2 | medium | touch | The only way out, "My trips", is a 54×17 px text link with no link styling (same colour and weight as the notice text), far under the 44 px target and easy to miss or mistap. | top left, under the notice line | U-06 |
| 3 | low | layout | Content is 24 px from the screen edge while other phone screens use 16 px, so the margin is inconsistent. Compare with other phone screens to confirm. | top left, text block | U-06 |

## Raw checks

- `target-size` My trips (`div#root > main.mx-auto > a.cursor-pointer`) → U-06
