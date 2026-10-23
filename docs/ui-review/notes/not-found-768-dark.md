# not-found-768-dark

- Screen: not-found
- Width: 768
- Theme: dark
- Locale: en

## Seen

- Header on one row, 62 px high: the pin icon with "Trip Board" at the left, a Light / Dark / System switch at the right with Dark selected (white fill), then the avatar "S" and "sven".
- Title "Page not found" in bold white text at about x=300, y=109.
- Grey line below it: "That page does not exist."
- Underlined link "Back home" below that (73 × 17 px at x=300, y=170), the only action on the page.
- The rest of the page, about 830 px, is empty near-black background.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | "Back home" is a 73 × 17 px text link, under the 24 px minimum, and it is the only way out of the page. It looks like body text with an underline, not like a button. | middle left, under the "That page does not exist." line | U-04 |
| 2 | low | consistency | The message block starts at x=300, a narrow column centred under a header whose content starts at x=32, so the title, the text and the logo share no left edge and the block reads as floating. The page is also top-aligned, unlike the centred card of the invalid invite page (compare `join-invalid` at 768). | below the header, centre of the page | U-38 |
| 3 | low | visual | The header here stays on one row at 768 px, unlike U-01, which describes a wrapped two-row header on other screens at this width, so the header differs between screens. | top, in the header | rejected: not a problem on this image, the header is one row and there is no empty first row |

## Raw checks

- `target-size` Back home (`div.flex > div.flex > main.mx-auto > a.cursor-pointer`) → U-04
