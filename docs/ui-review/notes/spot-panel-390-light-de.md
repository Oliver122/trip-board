# spot-panel-390-light-de

- Screen: spot-panel
- Width: 390
- Theme: light
- Locale: de

## Seen

- Full-screen panel titled "Ort bearbeiten" with a × close button at the top right; the map is not visible behind it.
- "Titel" field filled with "Fushimi Inari", then "Kategorie" with a read-only "Muss hin" badge and, below it, the chip row "Muss hin ✓", "Vielleicht", "Unterkunft", with "Geplant (1)" at the far right of the third row.
- A collapsible "Details" section holds "Adresse" (field showing "68 Fukakusa Yabunouch", cut off) next to an "Adresse kopieren" button, the link "In Google Maps öffnen" and the hint "Oder klicke auf die Karte, um die Markierung zu setzen".
- "Info" is a textarea with the placeholder "z. B. öffnet um 12", whose top edge looks clipped, then an empty "Link" field cut by the footer.
- Sticky footer: a red-outlined trash icon button at the left, "Abbrechen" and a solid "Speichern" at the right; all are about 44 px high, with 16 px side margins.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | text | The address field is cut ("68 Fukakusa Yabunouch") because the "Adresse kopieren" button takes about 40 % of the row, so the full address cannot be read. | Details section, Adresse row | U-14 |
| 2 | low | consistency | The current category appears twice: as a "Muss hin" badge and as the checked chip "Muss hin ✓" directly below. "Geplant (1)" floats at the right of the chip row and reads like a fourth option. The "Info" placeholder is clipped at its top and "Link" has no placeholder. | Kategorie block and the Info and Link fields | U-13 |
| 3 | medium | layout | The panel is full-screen, yet it still says "Oder klicke auf die Karte, um die Markierung zu setzen", which cannot be done while the panel covers the map. | Details section, below "In Google Maps öffnen" | U-09 |

## Raw checks

None.
