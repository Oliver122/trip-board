# members-390-dark

- Screen: members
- Width: 390
- Theme: dark
- Locale: en

## Seen

- Full-screen dialog titled "Members" with a × at the top right, then a divider.
- Directly below, a right-aligned "Close" text button on its own row, with empty space around it.
- Member rows: Sven (Owner, plain text on the right), Aiko with a "Planner" select and a red-outlined trash button, Tom with a "Visitor" select and a red-outlined trash button.
- An "Invite" section with the hint "Each link works for one person", a "Visitor" select and a "Create" button, then "No active invites."
- Below that, an "Aiko" select next to a "Transfer ownership" button, and the hint "Transfer ownership before leaving."
- The lower 300 px of the screen is empty. Content keeps a 16 px edge on both sides.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | layout | The extra "Close" row under the title duplicates the × and adds about 50 px of empty chrome before the first member, pushing the list down on a phone | top, below the title row | U-18 |
| 2 | low | state | The "Aiko" select and "Transfer ownership" button have no heading or label, so it is unclear what the select picks. The hint "Transfer ownership before leaving." names no Leave action, and nothing on screen says why the owner cannot leave | middle, below "No active invites." | U-33 |
| 3 | low | visual | The remove buttons are red-outlined trash icons beside the role selects, the loudest element in each row and close to the select. Nothing on screen shows that they remove the member, with no label or confirmation cue | right edge of the Aiko and Tom rows | U-34 |

## Raw checks

None.
