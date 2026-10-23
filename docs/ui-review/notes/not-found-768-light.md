# not-found-768-light

- Screen: not-found
- Width: 768
- Theme: light
- Locale: en

## Seen

- Header in one row: pin icon and "Trip Board" at the left, a Light / Dark / System switch (Light selected, black) and the avatar "S" with "sven" at the right
- Heading "Page not found" in bold, left-aligned at x=300, about 100 px below the top
- Line "That page does not exist." in grey under the heading
- Underlined text link "Back home" (73 × 17 px) as the only action
- The rest of the screen, about 800 px, is empty off-white

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | "Back home" is the only way out of the page but is a plain underlined text link only 17 px high (73 × 17), under the 24 px minimum at this width and easy to miss | below the message, left of centre | U-04 |
| 2 | low | layout | The message block sits in a narrow column starting at x=300 and is neither centred nor aligned with the logo at x=32, leaving the page mostly empty with the content in the top third | top centre-left, under the header | U-38 |
| 3 | low | consistency | U-01 says the header wraps to two rows at 768 px, but here it fits in one 62 px row with no wrapping | header across the top | rejected: not seen in this image, the header is one row |

## Raw checks

- `target-size` Back home (`div.flex > div.flex > main.mx-auto > a.cursor-pointer`) → U-04
