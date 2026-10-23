# trip-settings-1280-light

- Screen: trip-settings
- Width: 1280
- Theme: light
- Locale: en

## Seen

- One-row header: Trip Board logo, Board / Schedule / Trip settings tabs (Trip settings selected, dark pill), avatars S, A, T, Light/Dark/System switch (Light selected) and the user "sven".
- A centred column (about 704 px wide) starts with the grey link "My trips", the title "Japan 2026" with an "Owner" badge, and the dates "12 Apr 2026 – 24 Apr 2026".
- "Trip settings" form: Name "Japan 2026", Start date "12.04.2026", End date "24.04.2026" (both with calendar icons) and a dark Save button.
- "Spot kinds" section with the hint "The categories this trip uses for its spots: name, color, symbol and order." and two rows: red "!" Must go (3 spots) and green "?" Maybe (1 spot), each with palette, up, down and trash icon buttons.
- Below the rows: an "Add kind" button with "2 of 12 kinds", then the top edge of a red-outlined button (probably delete trip) cut off at the bottom of the viewport.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The "My trips" link is a 54×17 px grey text link, under the 24 px minimum, and looks like a plain label; it is the only way back to the trip list from the page body. | top left of the content column, above the title | U-04 |
| 2 | low | i18n | The date inputs show the German format 12.04.2026 and 24.04.2026 in the English UI, while the line under the title reads "12 Apr 2026 – 24 Apr 2026". | Start date and End date fields | U-17 |

## Raw checks

- `target-size` My trips (`[data-testid="settings-scroll"] a`) → U-04
