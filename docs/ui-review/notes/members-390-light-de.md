# members-390-light-de

- Screen: members
- Width: 390
- Theme: light
- Locale: de

## Seen

- Full-screen dialog titled "Mitglieder" with a × close button at the top right, 16 px from the edge.
- Below the title row, a right-aligned text button "Schließen" on its own row.
- Member rows: Sven (avatar S, label "Besitzer"), Aiko (role select "Planer", red-outlined trash button) and Tom (role select "Besucher", red-outlined trash button).
- Section "Einladen" with the hint "Jeder Link funktioniert für eine Person", a role select "Besucher" and a black "Erstellen" button, then "Keine aktiven Einladungen."
- A row with an "Aiko" select and a "Besitz übertragen" button, followed by the hint "Übertrage zuerst den Besitz, bevor du gehst."
- The lower half of the screen is empty white space.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | layout | The dialog has a title row with × and, right below it, an extra "Schließen" text button on its own row (about 50 px of empty space) before the first member, so the close action appears twice and pushes the list down. | top, between the title row and the first member | U-18 |
| 2 | low | consistency | The ownership transfer row ("Aiko" select and "Besitz übertragen") has no heading or label and sits directly under the invite hint "Keine aktiven Einladungen.", so it reads as part of the invite section. The hint below ("Übertrage zuerst den Besitz, bevor du gehst.") does not say what the row is for. | bottom, below the invite section | U-33 |

## Raw checks

None.
