# trip-settings-390-dark

- Screen: trip-settings
- Width: 390
- Theme: dark
- Locale: en

## Seen

- One-row phone trip header: back chevron, "Japan 2026", round "S" avatar at the right.
- Below it a small grey "My trips" text link, then the title "Japan 2026" with an "Owner" badge and the dates "12 Apr 2026 – 24 Apr 2026".
- "Trip settings" heading with a Name field ("Japan 2026"), Start date (12.04.2026) and End date (24.04.2026), both with a calendar icon, and a white Save button.
- Grey line "Manage spot kinds on a larger screen." and a red-outlined "Delete trip" button.
- Bottom bar with Map, List, Schedule and More, More highlighted; the content ends well above it with empty space between.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The "My trips" link is a 54×17 px grey text with no link styling, far under 44 px, and it is the only way back to the trip list from this page except the header chevron | top left, above the trip title | U-04 |
| 2 | low | i18n | The date inputs show 12.04.2026 and 24.04.2026 (German format) while the line above reads "12 Apr 2026 – 24 Apr 2026" in the English UI | middle, in the Start date and End date fields | U-17 |
| 3 | low | consistency | The header is a single row here, so the two-row header of U-01 does not occur at this width on this screen | top, in the header | rejected: the one-row phone trip header is what C-APP-35 asks for |
| 4 | low | state | "Manage spot kinds on a larger screen." is plain grey text with no action, so a user on the phone has no next step for spot kinds | below Save, above Delete trip | rejected: C-APP-36 and C-KIND-18 hide this work on the phone by design |

## Raw checks

- `target-size` My trips (`[data-testid="settings-scroll"] a`) → U-04
