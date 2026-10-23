# add-spot-390-dark

- Screen: add-spot
- Width: 390
- Theme: dark
- Locale: en

## Seen

- Full-screen panel headed "New spot" with a × close button at the top right, 16 px from the edge.
- Empty *Title* field, then *Google Maps link* with the placeholder "https://maps.app.goo.gl/..." and a *Fill in* button beside it.
- *Category* shows a read-only "Must go" badge, and right below it the chip row "Must go ✓", "Maybe", "Home", so the choice appears twice.
- A collapsible *Details* section is open: *Address* (empty), the hint "Or click the map to place the pin", *Info* with the placeholder "e.g. opens at 12", and *Link* (empty, no placeholder).
- A sticky footer with *Cancel* and a white *Add* button, right aligned; the form is cut by the footer edge below *Link*.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | low | consistency | The category block shows a "Must go" badge above the chip row that already contains "Must go ✓", so the current choice appears twice and the badge looks like a fifth option | middle, under the *Category* label | U-13 |
| 2 | medium | layout | The hint "Or click the map to place the pin" is shown while the panel covers the whole screen, so the map cannot be clicked | middle, under the *Address* field | U-09 |
| 3 | low | consistency | The *Link* field has no placeholder, unlike *Google Maps link* and *Info*, so it looks unfinished | bottom, above the footer | U-13 |

## Raw checks

None.
