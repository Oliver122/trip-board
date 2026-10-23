# members-768-light

- Screen: members
- Width: 768
- Theme: light
- Locale: en

## Seen

- A centred dialog about 512 px wide titled "Members" with a × button at the top right, over a barely dimmed board (map of East Asia, *Things to do* list column "6 spots").
- Directly under the title row a right-aligned "Close" text button sits alone on its own row.
- Member rows: Sven with the label "Owner"; Aiko with a "Planner" select and a red-outlined trash button; Tom with a "Visitor" select and a red-outlined trash button.
- An "Invite" section: "Each link works for one person", a "Visitor" select and a dark "Create" button, then "No active invites."
- A "Aiko" select with a "Transfer ownership" button and the note "Transfer ownership before leaving."
- Behind the dialog the header wraps to two rows (Trip Board, Board/Schedule/Trip settings; then News, member avatars S A T, Light/Dark/System switch and "sven").

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | layout | An extra right-aligned "Close" text button on its own row under the title row, which already has a ×; about 50 px of near-empty space before the first member | top of the dialog, below "Members" | U-18 |
| 2 | low | layout | The page header behind the dialog wraps to two rows, the second one mostly empty on the left, about 115 px of chrome above the map | top of the page, behind the backdrop | U-01 |
| 3 | low | visual | The backdrop dims the page only very slightly: the header, list column and map stay almost full contrast, so the dialog edge is defined mostly by its shadow and the page behind competes with it | around the dialog, whole page | U-35 |

## Raw checks

None.
