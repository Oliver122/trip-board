# login-1280-dark

- Screen: login
- Width: 1280
- Theme: dark
- Locale: en

## Seen

- Header strip with a pin icon and "Trip Board" at the top left, and a Light / Dark / System switch at the top right with "Dark" highlighted.
- Below the header, a narrow column about 175 px wide starting at x≈553, not centred on the 1280 px page.
- An EN / DE language switch with "EN" highlighted; its bordered box runs the full column width, leaving an empty bordered area to the right of "DE".
- The heading "Log in", then a white "Continue with Discord" button about 175 px wide and 44 px high.
- The rest of the page (about 650 px) is empty dark background; there is no other text or link.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | visual | The EN/DE switch stretches to the column width with its buttons left-aligned, leaving an empty bordered area; the whole login form is only 175 px wide and sits in the upper part of a 1280 px page with a small *Continue with Discord* button, so the screen looks unfinished | centre top, the form under the header | U-12 |
| 2 | low | consistency | Two preference switches appear on one screen: the theme switch in the header and the language switch inside the form, in different styles and places, so the login form is not self-contained | top right header and above the "Log in" heading | rejected: header theme switch plus form language switch is a common split and nothing here is broken |

## Raw checks

None.
