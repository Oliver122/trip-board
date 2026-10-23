# trip-settings-768-dark

- Screen: trip-settings
- Width: 768
- Theme: dark
- Locale: en

## Seen

- Header on two rows: logo, Board, Schedule and a highlighted Trip settings tab on the first row; member avatars S A T, the Light/Dark/System switch (Dark selected) and the user "sven" on the second row. No News item.
- Below the header: a small grey "My trips" link, the title "Japan 2026" with an Owner badge, and "12 Apr 2026 – 24 Apr 2026".
- Trip settings form: Name "Japan 2026", Start date "12.04.2026" and End date "24.04.2026" with calendar icons, and a white Save button.
- Spot kinds section with the hint "The categories this trip uses for its spots: name, color, symbol and order." and two rows: "Must go" (red !, 3 spots) and "Maybe" (green ?, 1 spot), each with icon buttons for color, up, down and delete.
- A greyed "Add kind" button with "2 of 12 kinds", and a red-outlined "Delete trip" button at the bottom.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | mobile | The page header wraps to two rows: the theme switch, avatars and user name sit on a second row beside a mostly empty line. About 115 px of chrome sits above the content, and there is no News item here. | top, in the header | U-01 |
| 2 | medium | touch | The "My trips" link is plain grey text about 54×17 px. It looks like a label rather than a link and is the only way back to the trip list from this screen. | top left, above the trip title | U-04 |
| 3 | low | i18n | The date inputs show "12.04.2026" and "24.04.2026" (German format) in the English UI, while the line above shows "12 Apr 2026 – 24 Apr 2026". | in the Start date and End date fields | U-17 |
| 4 | low | visual | "Add kind" has dim grey text on a dark grey fill, so it looks disabled although 2 of 12 kinds are used. It is much weaker than Save and Delete trip. | below the kind list, left | U-41 |
| 5 | low | consistency | The two kind name fields have different widths (Must go ends at about x=486, Maybe at about x=496) because the count text varies ("3 spots" vs "1 spot"), so the icon buttons do not line up between rows. | in the Spot kinds list | U-41 |

## Raw checks

- `target-size` My trips (`[data-testid="settings-scroll"] a`) → U-04
