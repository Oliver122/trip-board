# board-list-390-light-de

- Screen: board-list
- Width: 390
- Theme: light
- Locale: de

## Seen

- One-row phone header: back chevron, "Japan 2026", a round grey "S" avatar at the top right; below it the title "Aktivitäten" with "6 Orte" on the right.
- A "Filter" button with a funnel icon at the top left of the list, about 44 px high.
- Three planned spots with a blue calendar mark and a map-pin button on the right: Shibuya Sky (13. Apr. 2026 18:00), teamLab Borderless (14. Apr. 2026 00:00), Fushimi Inari (18. Apr. 2026 09:00).
- A divider "Noch nicht geplant", then Nara Park (green "?" mark, "Nara Park, Nara") and the two home spots Hotel Gracery and Kyoto Ryokan (orange house marks, no second line).
- About 190 px of empty space below the list, then a bar with a small native checkbox "Nur auf der Karte sichtbar" and the bottom tab bar Karte, Liste (active, bold), Plan, Mehr.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The "Nur auf der Karte sichtbar" checkbox is the browser's native box, about 13 px, with the label as small text; unless the whole row is the target, this is far under 44 px, and it differs from the chips used elsewhere | bottom of the list, above the tab bar | U-25 |
| 2 | low | visual | The Nara Park mark is a bare green "?" at about 12 px, which reads as a missing icon rather than a category; and its second line repeats the name ("Nara Park, Nara") | middle of the list, Nara Park row | U-27 |

## Raw checks

- `overlap` Shibuya Sky (`button[data-testid="card-<id>"]`) → accepted: the Google Maps link sits in the 48 px strip the card reserves on its right, no text collides (see UI_REVIEW automated findings)
- `overlap` teamLab Borderless (`button[data-testid="card-<id>"]`) → accepted: same reserved right strip, no text collides
- `overlap` Fushimi Inari (`button[data-testid="card-<id>"]`) → accepted: same reserved right strip, no text collides
- `overlap` Nara Park (`button[data-testid="card-<id>"]`) → accepted: same reserved right strip, no text collides
- `overlap` Hotel Gracery (`button[data-testid="card-<id>"]`) → accepted: same reserved right strip, no text collides
- `overlap` Kyoto Ryokan (`button[data-testid="card-<id>"]`) → accepted: same reserved right strip, no text collides
