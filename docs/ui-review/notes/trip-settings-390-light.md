# trip-settings-390-light

- Screen: trip-settings
- Width: 390
- Theme: light
- Locale: en

## Seen

- One-row phone header: back chevron, title "Japan 2026", avatar "S" at the right.
- Below it a grey "My trips" text link, then the heading "Japan 2026" with an "Owner" badge and the dates "12 Apr 2026 – 24 Apr 2026".
- "Trip settings" form: Name field ("Japan 2026"), Start date "12.04.2026" and End date "24.04.2026" with calendar icons, each field full width with 16 px side margins.
- Solid black "Save" button (about 65 × 44 px), left aligned.
- The line "Manage spot kinds on a larger screen." and an outlined red "Delete trip" button.
- Bottom bar with Map, List, Schedule and More; More is bold as the active tab. Empty space between Delete trip and the bar.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The "My trips" link is a 54 × 17 px grey text with no link styling, far under the 44 px target, and it duplicates the back chevron in the header | top left, above the trip title | U-04 |
| 2 | low | i18n | The date inputs show `12.04.2026` and `24.04.2026` (German format) in the English UI while the line above reads "12 Apr 2026 – 24 Apr 2026" | middle, Start date and End date fields | U-17 |
| 3 | low | state | "Manage spot kinds on a larger screen." is plain text with no link or action; it is the intended phone replacement for spot kind management (C-APP-36), so I do not count it as a defect | middle, below Save | rejected: C-APP-36 hides setup on the phone and asks for this hint |

## Raw checks

- `target-size` My trips (`[data-testid="settings-scroll"] a`) → U-04
