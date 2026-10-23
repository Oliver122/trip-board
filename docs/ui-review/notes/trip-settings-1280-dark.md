# trip-settings-1280-dark

- Screen: trip-settings
- Width: 1280
- Theme: dark
- Locale: en

## Seen

- One-row header: Trip Board logo, tabs Board, Schedule and the active Trip settings (white chip), member avatars S, A, T, the Light/Dark/System switch with Dark selected, and the user "sven".
- A 704 px wide column starts with a small grey "My trips" link, then the title "Japan 2026" with an Owner badge and the dates "12 Apr 2026 – 24 Apr 2026".
- Section "Trip settings": fields Name (Japan 2026), Start date (12.04.2026) and End date (24.04.2026) with calendar icons, and a white Save button.
- Section "Spot kinds" with the line "The categories this trip uses for its spots: name, color, symbol and order."
- Two kind rows: red "!" "Must go" with "3 spots", green "?" "Maybe" with "1 spot", each with palette, up, down and delete icon buttons.
- An "Add kind" button with "2 of 12 kinds", and the top edge of a red-outlined button cut by the bottom of the image (below the fold).

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The "My trips" link is plain grey text, 54×17 px, and the only way back to the trip list from this page; it looks like a label, not a link | top left of the content column, above the title | U-04 |
| 2 | low | i18n | The date inputs show `12.04.2026` and `24.04.2026` (German format) in the English UI, while the line under the title says "12 Apr 2026 – 24 Apr 2026" | Start date and End date fields | U-17 |
| 3 | low | consistency | The two kind name inputs have different widths (about 409 px for "Must go", 419 px for "Maybe") because the "3 spots" and "1 spot" labels differ in width, so the icon buttons to the right do not line up with the inputs' right edges | Spot kinds rows | U-41 |

## Raw checks

- `target-size` My trips (`[data-testid="settings-scroll"] a`) → U-04
