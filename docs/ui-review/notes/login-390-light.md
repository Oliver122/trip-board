# login-390-light

- Screen: login
- Width: 390
- Theme: light
- Locale: en

## Seen

- Header on one row: pin icon and "Trip Board" at the left, a Light / Dark / System segmented switch at the right with Light selected (dark fill).
- Below the header a 175 px wide column starts at x=108, about 108 px from the left edge and 107 px from the right.
- Top of the column: an EN / DE segmented control inside a bordered box that is wider than its two buttons; EN is selected (dark fill), DE plain, and the right half of the box is empty.
- Heading "Log in", left-aligned in that column.
- A dark "Continue with Discord" button, the same 175 px width as the column, 44 px high.
- The rest of the screen, from about y=245 down to 844, is empty.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | touch | The EN language button is 43 px wide (DE 42 px), one or two pixels under the 44 px touch target at 390 px, because only the height is fixed | below the header, top left of the form | U-11 |
| 2 | low | visual | The login form is a narrow 175 px column in the upper middle of the 390 px screen, with no card or centring. The EN/DE control stretches over it with an empty bordered area to the right of DE, and "Continue with Discord" is only about 45 % of the screen width, a small target for the only action; the sides are about 108 px, not 16 px | centre of the page under the header | U-12 |

## Raw checks

- `target-size` EN (`main.mx-auto > div.mb-4 > div.flex > button.min-h-11`) → U-11
- `target-size` DE (`main.mx-auto > div.mb-4 > div.flex > button.min-h-11`) → U-11
