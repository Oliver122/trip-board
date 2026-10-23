# members-390-light

- Screen: members
- Width: 390
- Theme: light
- Locale: en

## Seen

- Full-screen dialog titled "Members" with a × close button at the top right, 16 px from the edge
- Directly below the title divider, a right-aligned "Close" text button on its own row, before any member
- Three member rows: Sven (Owner, plain text at the right), Aiko (Planner select plus red-outlined trash button), Tom (Visitor select plus red-outlined trash button)
- "Invite" heading with the note "Each link works for one person", a Visitor role select and a solid black "Create" button; below it "No active invites."
- A row with an "Aiko" select and an outlined "Transfer ownership" button, with the note "Transfer ownership before leaving."; the lower half of the screen is empty

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | layout | An extra right-aligned "Close" text button sits on its own row under the title, about 50 px of empty space before the first member; the × already closes the dialog and the DESIGN.md §3.5 sketch has no such row | top right, below the title bar | U-18 |
| 2 | low | state | The transfer row has no heading or label: an "Aiko" select next to "Transfer ownership" reads as a stray control, and the note "Transfer ownership before leaving." below it is only a hint, so it is unclear that the button hands the trip to Aiko | bottom, below "No active invites." | U-33 |

## Raw checks

None.
