# login-1280-light

- Screen: login
- Width: 1280
- Theme: light
- Locale: en

## Seen

- Header with the pin logo and "Trip Board" at top left and a Light / Dark / System switch at top right ("Light" selected, dark fill).
- Below the header, a narrow form about 175 px wide at x=553 to 728, top-left of the centre column and starting about 95 px from the top.
- An EN / DE language switch: "EN" selected (dark fill), "DE" next to it, then an empty bordered area to the right of "DE" that fills the rest of the 175 px width.
- Heading "Log in" and a dark button "Continue with Discord" about 175 px wide.
- The rest of the 900 px viewport is empty; no Dev login block is shown.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | visual | The EN/DE switch stretches to the form width with its two buttons left-aligned, leaving an empty bordered area about 90 px wide to the right of "DE"; the whole form is only 175 px wide and sits at the top of an otherwise empty page, so the login looks unfinished at 1280 | top centre, language switch and form under the header | U-12 |
| 2 | low | visual | The "DE" button has a white background that differs from the page background, so it looks like a patch next to the empty area of the switch | top centre, right of "EN" | rejected: unselected state of the segmented control, same cause as U-12 |

## Raw checks

None.
