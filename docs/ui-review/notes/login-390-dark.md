# login-390-dark

- Screen: login
- Width: 390
- Theme: dark
- Locale: en

## Seen

- One-row header on a near-black page: pin icon and "Trip Board" at the left, a Light / Dark / System switch at the right with "Dark" selected (white fill), about 44 px high, divider line below.
- Below the header, a small EN / DE segmented control at x=109 to 283 with "EN" selected (white fill) and "DE" unselected; the right half of its bordered box is empty.
- Heading "Log in" under it, left-aligned with the control at x=108.
- A white "Continue with Discord" button, about 175 px wide and 44 px high, directly under the heading.
- Everything sits in a 175 px column that starts at x=108; the rest of the screen, about 600 px down to the bottom edge, is empty black.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | touch | The "EN" language button is 43 px wide and "DE" is 42 px, both under the 44 px target at 390 px (the height is 44 px). | upper left, in the EN/DE control under the header | U-11 |
| 2 | low | visual | The form is only 175 px wide and starts 108 px from the left edge, not 16 px, so it sits oddly in the upper middle of the screen. The EN/DE control has an empty bordered area to the right of "DE", and "Continue with Discord" is half the screen width. | below the header, left of centre | U-12 |

## Raw checks

- `target-size` EN (`main.mx-auto > div.mb-4 > div.flex > button.min-h-11`) → U-11
- `target-size` DE (`main.mx-auto > div.mb-4 > div.flex > button.min-h-11`) → U-11
