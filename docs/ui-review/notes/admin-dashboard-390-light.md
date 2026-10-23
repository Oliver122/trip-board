# admin-dashboard-390-light

- Screen: admin-dashboard
- Width: 390
- Theme: light
- Locale: en

## Seen

- Top left, plain text: "The admin area needs a larger screen." at about y=35, 24 px from the left edge.
- Directly below it a text link "My trips" (54 × 17 px at x=24, y=59), styled like body text with no underline or button look.
- No header, logo, theme switch, account menu or bottom bar; the rest of the 390 × 844 image (about 90 %) is empty off-white.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The only way out, the "My trips" link, is 54 × 17 px, far under the 44 px phone target, and looks like plain text next to the notice, so it is easy to miss and hard to tap | top left, below the notice line | U-06 |
| 2 | medium | mobile | The notice is a bare page with no header, theme switch or account menu and about 90 % empty space, unlike the other phone screens | whole screen | U-06 |
| 3 | low | layout | Content sits 24 px from the left edge, not the 16 px used on the phone elsewhere; the text is also tight to the top with no chrome above it | top left | U-06 |

## Raw checks

- `target-size` My trips (`div#root > main.mx-auto > a.cursor-pointer`) → U-06
