# members-1280-light

- Screen: members
- Width: 1280
- Theme: light
- Locale: en

## Seen

- The Members dialog is centred (about 512 px wide) over the dimmed board: title "Members" with a × at top right, the map and the "Things to do" list (6 spots) visible behind it.
- Directly under the title row sits a right-aligned "Close" text button on its own row, before the first member.
- Member rows: Sven (Owner, plain text), Aiko with a "Planner" dropdown and a red-outlined trash button, Tom with a "Visitor" dropdown and a red-outlined trash button.
- An "Invite" section: hint "Each link works for one person", a "Visitor" role dropdown and a black "Create" button, then "No active invites."
- At the bottom an "Aiko" dropdown with a "Transfer ownership" button and the line "Transfer ownership before leaving." with no heading above it.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | layout | An extra right-aligned "Close" text button on its own row (about 50 px of empty space) sits below the title row that already has a ×; the DESIGN.md §3.5 sketch has only the ✕ and goes straight to the members | top of the dialog, under the title | U-18 |
| 2 | low | consistency | The transfer block has no heading or divider and its Aiko dropdown has no visible label, so it is not clear that it picks the new owner; the Invite section above has a heading and a rule | bottom of the dialog, below "No active invites." | U-33 |
| 3 | low | state | The red-outlined trash buttons beside each member are icon-only with no visible label and the same strong red as a destructive action, so remove-member has no visible text explaining it | right edge of the Aiko and Tom rows | U-34 |

## Raw checks

None.
