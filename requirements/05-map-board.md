# Step 05 — Map board

**Goal:** the trip page shows a styled OpenStreetMap map limited to the trip's region, with the board layout from the sketch.
**Depends on:** 04

## Scope
- In: MapLibre via `react-map-gl/maplibre`, custom minimal light/dark style on OpenFreeMap tiles, OSM attribution, board layout (map + right list column + “Add new” button), max bounds from trip bbox, zoom/locate controls, pin component (static demo data until 07).
- Out: real spot data (07), toolbar logic (09).

## Requirements
| ID | Requirement |
| --- | --- |
| R-05-01 | Map style: low-saturation land, pale water, muted labels; dark variant follows the app theme |
| R-05-02 | Initial view fits the trip bbox. Panning is limited to bbox + 50 % margin |
| R-05-03 | Layout ≥ 1024 px: map fills the left, a 360 px list column on the right, “Add new” floating bottom-left, zoom controls bottom-right |
| R-05-04 | Pin component: category color, icon per category, states default / hover / selected (larger + ring) |
| R-05-05 | Pins cluster when > 30 are close together; the cluster shows its count |
| R-05-06 | Map labels follow the app language where tiles provide `name:de` / `name:en`, otherwise the local name |
| R-05-07 | OSM / OpenFreeMap attribution is always visible |
| R-05-08 | Tile load failure shows a non-blocking error banner with retry |
| R-05-09 | Map viewport (center, zoom) is kept in the URL hash, so reload keeps the view |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-05-01 | unit | R-05-02 | `maxBoundsFor(bbox)` returns bbox + 50 % margin, clamped to world limits |
| T-05-02 | e2e | R-05-02 | Opening the seeded Japan trip shows the map centered on Japan (center within bbox) |
| T-05-03 | e2e | R-05-03 | At 1280 px the list column is 360 px wide and “Add new” is visible; screenshot matches baseline |
| T-05-04 | unit | R-05-04 | Pin renders the correct color variable and icon for each category, and the selected state class |
| T-05-05 | e2e | R-05-06 | With language DE, a label layer uses `name:de` |
| T-05-06 | e2e | R-05-07 | Attribution control is present and contains “OpenStreetMap” |
| T-05-07 | e2e | R-05-08 | With tile requests blocked, the error banner appears and the rest of the page works |
| T-05-08 | e2e | R-05-09 | After panning and reloading, the map restores the same center/zoom |
| T-05-09 | manual | R-05-01, R-05-05 | Visual review against the Stitch design in light and dark mode |
