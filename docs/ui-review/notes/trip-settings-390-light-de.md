# trip-settings-390-light-de

- Screen: trip-settings
- Width: 390
- Theme: light
- Locale: de

## Seen

- One-row phone header: back chevron, title "Japan 2026" and an "S" avatar circle at the right edge.
- Below it a grey link "Meine Reisen", then the heading "Japan 2026" with an "Besitzer" badge and the dates "12. Apr. 2026 – 24. Apr. 2026".
- Section "Reiseeinstellungen" with full-width fields: Name "Japan 2026", Startdatum "12.04.2026", Enddatum "24.04.2026" (native date inputs with a calendar icon).
- A black "Speichern" button (about 98×44 px), left aligned.
- Grey text "Verwalte Orts-Arten auf einem größeren Bildschirm." and a red-outlined "Reise löschen" button.
- Bottom bar with Karte, Liste, Plan and Mehr; Mehr is bold (active). Content ends about 130 px above the bar, the rest is empty.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | The "Meine Reisen" link is a 87×17 px grey text with no link styling, far under the 44 px target, and it is the only way back to the trip list on this screen besides the back chevron | top left, above the trip title | U-04 |
| 2 | low | i18n | The dates are 12.04.2026 in the inputs and "12. Apr. 2026" above: consistent for German, so the English mismatch of U-17 does not show here | Startdatum and Enddatum fields | rejected: German format in the German UI is correct; U-17 concerns the English UI |
| 3 | low | consistency | "Japan 2026" appears twice within 100 px (header title and page heading) and "Meine Reisen" adds a third line of chrome before the form | top, header and heading | U-42 |

## Raw checks

- `target-size` Meine Reisen (`[data-testid="settings-scroll"] a`) → U-04
