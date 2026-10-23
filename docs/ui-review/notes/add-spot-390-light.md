# add-spot-390-light

- Screen: add-spot
- Width: 390
- Theme: light
- Locale: en

## Seen

- Full-screen panel titled "New spot" with a × close button at the top right, over a white background.
- Title field (empty), then a Google Maps link field with the placeholder "https://maps.app.goo.gl/..." and a "Fill in" button beside it.
- Category block: a read-only red "Must go" badge, then a chip row "Must go ✓" (selected), "Maybe", "Home".
- A "Details" section header with a chevron, open, holding Address (empty), the hint "Or click the map to place the pin", Info (placeholder "e.g. opens at 12", resize handle) and Link (empty).
- Sticky footer with "Cancel" (outlined) and "Add" (solid black) buttons at the bottom right; fields and text sit 16 px from the screen edges.

## Problems

| # | Severity | Category | Issue | Where | Known |
| --- | --- | --- | --- | --- | --- |
| 1 | medium | layout | The hint "Or click the map to place the pin" is shown, but the panel is full-screen at 390 px and the map is not visible or usable, so the instruction cannot be followed | middle, under the Address field | U-09 |
| 2 | low | consistency | The current category appears twice: a read-only "Must go" badge above the chip row and the selected "Must go ✓" chip; the badge looks like a fourth, separate option | middle, in the Category block | U-13 |
| 3 | low | consistency | The Link field has no placeholder, while Info and the Google Maps link field have one; Title and Address are also empty without a hint | bottom, last field above the footer | U-13 |

## Raw checks

None.
