# schedule-390-light-de

- Screen: schedule
- Width: 390
- Theme: light
- Locale: de

## Seen

- One-row trip header: back arrow, "Japan 2026", avatar "S" at the right; the bottom bar shows Karte, Liste, Plan (active, bold) and Mehr
- Title "Zeitplan" with two buttons, "+ Abschnitt" (solid, black) and "+ Einzeltermin" (outlined), both about 44 px high
- Single entry "Arrival" (12. Apr. 2026 15:00, home "Hotel Gracery") with a pencil icon and an "Ort hinzufügen" button
- Bucket "Tokyo" (12. Apr. 2026 – 16. Apr. 2026) with the spots Shibuya Sky (13. Apr. 2026 18:00) and teamLab Borderless (14. Apr. 2026), each with up and down chevrons and a red-outlined ✕
- Bucket "Kyoto" (17. Apr. 2026 – 20. Apr. 2026) with Fushimi Inari (18. Apr. 2026 09:00), the same controls, and "Ort hinzufügen"
- The lower part of the list is empty down to the tab bar; all German labels and dates fit without clipping

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | touch | Every spot row ends with two chevrons and a red-outlined ✕ side by side; the ✕ is the loudest element, sits right next to the down chevron (one mistap away) and reads as delete although it only removes the spot from the bucket; the disabled chevrons (first up, last down) are still drawn, and the rows show no category mark | right end of each spot row under Tokyo and Kyoto | U-05 |

## Raw checks

None.
