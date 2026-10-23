# login-768-dark

- Screen: login
- Width: 768
- Theme: dark
- Locale: en

## Seen

- One-row header, 62 px high: pin icon and "Trip Board" at top left, a Light / Dark / System switch at top right with "Dark" selected (white fill).
- Below the header, a narrow form 175 px wide (x 297 to 472) sits at the left of the centre, not centred on the page: an EN / DE segmented control with "EN" selected and an empty bordered area to the right of "DE".
- Under it the heading "Log in" and a white full-width-of-the-form "Continue with Discord" button, about 44 px high.
- The rest of the 768×1024 page, about 780 px, is empty black; no Dev login block, no invite text.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | visual | The EN/DE control stretches to the form width (175 px) with its two buttons left-aligned, leaving about 90 px of empty bordered box; the whole login form is only 175 px wide and sits left of the page centre at 768 px, with a small "Continue with Discord" button, so the page looks unfinished | upper middle, left of centre, under the header | U-12 |
| 2 | low | consistency | The header is one row here (logo left, theme switch right), while U-01 describes a wrapped two-row header at 768 on other pages; compare with `trips-768-dark` in the head review | top, in the header | rejected: the header is one row on this screen, nothing wraps, so U-01 does not apply here |

## Raw checks

None.
