# members-768-dark

- Screen: members
- Width: 768
- Theme: dark
- Locale: en

## Seen

- Header behind the dimmed backdrop wraps to two rows: Trip Board logo with Board / Schedule / Trip settings tabs, then News, avatars S A T, Light / Dark / System switch and "sven"
- Centered "Members" dialog (about 512 px wide) with a title row and a × button top right
- Below the title, a right-aligned "Close" text button on its own row with empty space on its left
- Member rows: Sven (Owner, plain text), Aiko (Planner select, red-outlined trash button), Tom (Visitor select, red-outlined trash button)
- "Invite" section: "Each link works for one person", a Visitor select and a Create button, then "No active invites."
- A name select (Aiko) with a "Transfer ownership" button and the hint "Transfer ownership before leaving."
- Behind the dialog the map and the "Things to do" list (6 spots) column are dimmed; the Add new button shows at bottom left

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | layout | An extra right-aligned "Close" text button sits on its own row under the title row, which already has a × button, so about 50 px of empty space pushes the member list down | top of the dialog, below the title | U-18 |
| 2 | medium | mobile | The page header takes two rows (about 115 px) with a mostly empty first row, as on the other trip screens at 768 px | top of the page, behind the backdrop | U-01 |
| 3 | low | consistency | The trash buttons for removing a member are loud red outlines with no text label, right next to the role select, so a mistap is easy and the action is not named | right side of the Aiko and Tom rows | U-34 |
| 4 | low | text | The member select beside "Transfer ownership" has no visible label, so it is not clear what Aiko in the select means without reading the button | bottom of the dialog, left of the button | U-33 |

## Raw checks

None.
