# not-found-1280-light

- Screen: not-found
- Width: 1280
- Theme: light
- Locale: en

## Seen

- One-row header on a near-white page: pin icon and "Trip Board" at the top left, a Light / Dark / System switch with "Light" selected (dark fill) and the avatar "S" with "sven" at the top right.
- Title "Page not found" in bold, centred column starting at x=556, about 108 px from the top.
- Grey line below the title: "That page does not exist."
- One underlined link, "Back home" (73 × 17 px at x=556, y=170), the only action on the page.
- The rest of the 900 px viewport, about 700 px, is empty; the text column sits top-aligned, left of the page centre.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | "Back home" is the only way out of the page, yet it is an underlined text link 73 × 17 px, under the 24 px minimum, with no button look. It is easy to miss and hard to hit. | below the text, left in the content column | U-04 |
| 2 | low | layout | The content is a small text block in the upper part of the page with about 700 px of empty space below, and the column does not look centred (it starts at x=556). It is plain but harmless at 1280, so it is not a defect of this image. | whole page below the link | rejected: sparse by design for a 404, no content is hidden and the next step is visible |

## Raw checks

- `target-size` Back home (`div.flex > div.flex > main.mx-auto > a.cursor-pointer`) → U-04
