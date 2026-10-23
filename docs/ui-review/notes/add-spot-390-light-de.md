# add-spot-390-light-de

- Screen: add-spot
- Width: 390
- Theme: light
- Locale: de

## Seen

- Full-screen panel titled "Neuer Ort" with a × close button at the top right, over a white background.
- Empty fields "Titel", then "Google-Maps-Link" (placeholder "https://maps.app.goo.gl/...") with an outlined "Übernehmen" button beside it, then an empty "Adresse" field.
- "Kategorie" shows a small read-only "Muss hin" badge, and below it the chip row: selected "Muss hin ✓", "Vielleicht", "Unterkunft".
- A "Details" section header with a chevron, then the hint "Oder klicke auf die Karte, um die Markierung zu setzen" under the address field.
- "Info" textarea with the placeholder "z. B. öffnet um 12", whose top looks tight, and a "Link" label whose input is cut off by the footer.
- Fixed footer with the outlined "Abbrechen" and the solid black "Hinzufügen" buttons, both about 44 px high, 16 px from the right edge.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | layout | The panel is full-screen at 390 px, yet it still says "Oder klicke auf die Karte, um die Markierung zu setzen"; the map is covered, so the hint cannot be followed and the user has no other way to set the pin from it | under the "Adresse" field | U-09 |
| 2 | low | consistency | The current category appears twice: a read-only "Muss hin" badge above the chips and the pressed chip "Muss hin ✓" below, which wastes about 40 px of the first screen | "Kategorie" block, left | U-13 |
| 3 | low | consistency | The "Info" placeholder "z. B. öffnet um 12" sits tight against the top edge of the textarea, and the "Link" field has no visible placeholder, unlike "Google-Maps-Link"; "Titel" and "Adresse" have none either | "Info" and "Link" fields | U-13 |

## Raw checks

- `overlap` Link / Abbrechen (`[data-testid="spot-panel-body"] input`) → accepted: the Link input is only scrolled under the fixed footer at the fold, the panel body scrolls, and the footer buttons themselves do not overlap anything
- `overlap` Link / Hinzufügen (`[data-testid="spot-panel-body"] input`) → accepted: same as above, the Link input is partly under the fixed footer only because the body is scrolled to the top
