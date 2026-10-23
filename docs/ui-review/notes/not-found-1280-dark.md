# not-found-1280-dark

- Screen: not-found
- Width: 1280
- Theme: dark
- Locale: en

## Seen

- A one-row header on a near-black page: pin icon and "Trip Board" at the top left, the Light / Dark / System switch at the top right with "Dark" highlighted as a white segment, then the avatar "S" and the name "sven".
- Title "Page not found" in white, bold, in a narrow column starting at x≈556, top-aligned about 100 px below the header line.
- Grey help text "That page does not exist." under the title.
- An underlined white link "Back home" (about 73 × 17 px) as the only action on the page.
- Everything below y≈190 is empty dark space down to the bottom of the 900 px viewport.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | "Back home" is the only way out of the page but is a bare underlined text link only 17 px high (73 × 17), under the 24 px minimum and easy to miss next to the title | centre, under "That page does not exist." | U-04 |
| 2 | low | visual | The message block is a small left-aligned column near the top while the rest of the 1280 px page is empty, so the page looks unfinished | centre column, top of the page | rejected: a top-aligned content column is the plain page layout; the content is readable and the link is visible |

## Raw checks

- `target-size` Back home (`div.flex > div.flex > main.mx-auto > a.cursor-pointer`) → U-04
