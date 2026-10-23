# trip-settings-768-light

- Screen: trip-settings
- Width: 768
- Theme: light
- Locale: en

## Seen

- Header on two rows: Trip Board logo and the tabs Board, Schedule, Trip settings (active, dark pill) on row one; member avatars S, A, T, the Light/Dark/System switch and the avatar with "sven" right-aligned on row two. No News item.
- Small grey "My trips" link above the title, then "Japan 2026" with an "Owner" badge and the dates "12 Apr 2026 – 24 Apr 2026".
- "Trip settings" form: Name (Japan 2026), Start date (12.04.2026) and End date (24.04.2026) as full-width inputs with calendar icons, and a dark Save button.
- "Spot kinds" section with the text "The categories this trip uses for its spots: name, color, symbol and order."
- Two kind rows: red "!" Must go (3 spots) and green "?" Maybe (1 spot), each with a name field and palette, up, down and delete icon buttons.
- "Add kind" button with "2 of 12 kinds", and a red-outlined "Delete trip" button at the bottom left.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The "My trips" link is a plain grey text link only 54×17 px, which looks like a caption and is the only way back to the trip list from this page. | top left of the content, above "Japan 2026" | U-04 |
| 2 | medium | mobile | The header wraps to two rows, with a mostly empty second row (avatars, theme switch, "sven") and about 115 px of chrome before the content; News is not shown here. | top, the header | U-01 |
| 3 | low | i18n | The date inputs show "12.04.2026" and "24.04.2026" (German format) in the English UI, while the line under the title says "12 Apr 2026 – 24 Apr 2026". | Start date and End date fields | U-17 |

## Raw checks

- `target-size` My trips (`[data-testid="settings-scroll"] a`) → U-04
