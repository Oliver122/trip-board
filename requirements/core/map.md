# Core — Map

The one map of a trip: its style and labels, the region it fits and is limited to, the controls and attribution, pins (kind colors, split pins, textures, states), clustering, the view kept in the URL hash, the single map instance shared by the board, the schedule and the settings tab, and adding a spot by clicking or right-clicking the map. The spots behind the pins are in [spots](./spots.md), the kinds that give them colors and symbols in [kinds](./kinds.md), the list next to the map in [list](./list.md), the schedule that drives its highlights in [planning](./planning.md), and the trip region in [trips](./trips.md).

## Base map and region

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-MAP-01 | The base map is a low-saturation OpenFreeMap vector style (muted land, pale water, quiet labels), with a dark variant that follows the app theme. The container behind the canvas uses the theme's land color, so the first frame and a tile error never show a black box. <!-- R-05-01, R-18-33 --> | active | 05 | 18 | T-05-09 |
| C-MAP-02 | Place labels follow the app language: `name:de` / `name_de` in German, `name:en` / `name_en` in English, falling back to the local `name` when the tiles have no translation. <!-- R-05-06 --> | active | 05 | — | T-05-05 |
| C-MAP-03 | When a trip has at least one spot, the board's first view fits all spots (48 px padding, at most zoom 15) and the schedule's side map fits the spots of the first entry, else all spots; with no spots the first view fits the trip bbox. Only the first view is fitted, so spots added later never move the map, a view in the URL hash (C-MAP-15) wins over fitting, and panning is limited to the bbox plus a 50 % margin on every side, clamped to the world. <!-- R-05-02, R-42-07 --> | active | 05 | 42 | T-05-01, T-05-02, T-42-05, T-19-08 |
| C-MAP-04 | Attribution links to OpenFreeMap and OpenStreetMap (`rel="noopener noreferrer"`) are always visible in the map's bottom-left corner, and no control overlaps them: *Add new* sits above the attribution line at every width. <!-- R-05-07, R-42-09 --> | active | 05 | 42 | T-05-06, T-42-06 |
| C-MAP-05 | A tile load failure shows a non-blocking banner with a *Retry* button that remounts the map; the rest of the page keeps working. <!-- R-05-08 --> | active | 05 | — | T-05-07 |
| C-MAP-06 | Zoom in, zoom out and *Locate me* buttons sit bottom-right of the map; *Locate me* uses the browser's geolocation and eases to the position at zoom 12 or more. On a window of 1024 px or more the board is the map on the left, a 360 px list column on the right and *Add new* floating bottom-left. <!-- R-05-03 --> | active | 05 | — | T-05-03 |

## Pins and clusters

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-MAP-07 | Every spot is a round pin colored by what it is: the color and symbol of its kind, the *Planned* color with a calendar icon for a planned spot, the *Home* color with a house for a home spot (a filled house for the primary home). Pins are buttons named after the spot and its kinds, pressed when selected. <!-- R-05-04, R-07-01, R-12-05, R-12-07, R-28-13 --> | active | 05 | 07, 12, 28 | T-05-04, T-12-08 |
| C-MAP-08 | A pin has three states: default (28 px), hover (scaled up) and selected (36 px with a white ring). Below 640 px every pin button has a hit area of at least 44 × 44 px centred on the drawing, and where hit areas overlap the pin drawn on top gets the tap. Hovering a list card highlights its pin and hovering a pin highlights its card; clicking either selects the spot and opens its panel. <!-- R-05-04, R-07-04, R-42-08 --> | active | 05 | 07, 42 | T-07-05, T-42-06 |
| C-MAP-09 | A spot with two kinds gets a split pin: a circle divided vertically, left half the primary kind's color and right half the second kind's, with the primary kind's symbol in the middle. <!-- R-28-14 --> | active | 28 | — | T-28-26, T-28-27 |
| C-MAP-10 | When the texture atlas lists a symbol's cell as filled, the pin shows that texture as a round image (atlas as background, position from the symbol's index, `?v=<version>` for caching) inside the kind's color ring; unfilled symbols keep the vector symbol. If the atlas fails to load, pins fall back to the vector symbol, and an empty manifest makes no atlas request. While low data is on, no atlas is requested and pins show the kind color with the vector symbol. <!-- R-29-19, R-29-20, R-38-10 --> | active | 29 | 38 | T-29-20, T-29-21, T-29-22, T-38-07 |
| C-MAP-11 | More than 30 close pins merge into a cluster bubble showing the count (Supercluster, radius 60 px, up to zoom 16); clicking a bubble zooms in by two levels, to zoom 16 at most. <!-- R-05-05 --> | active | 05 | — | T-05-09 |
| C-MAP-12 | In add or edit mode a click on the map places the draft pin and the pin can be dragged; the new position fills the address by reverse geocoding. <!-- R-07-05 --> | active | 07 | — | T-07-02 |
| C-MAP-13 | On the board, an owner, board admin or planner who right-clicks an empty point of the map opens the add panel with the draft pin there and the address from reverse geocoding; the browser's own menu is suppressed only in that case. A right-click on a pin, a cluster or a control starts nothing, and for visitors (and touch long-presses) the browser menu is untouched. <!-- R-25-01, R-25-02 --> | active | 25 | — | T-25-01, T-25-02, T-25-03 |
| C-MAP-14 | Selecting a plan entry on the schedule fits the map to the entry's spots and highlights their pins; a selected list card on the board flies the map to its pin. <!-- R-11-05, R-18-10 --> | active | 11 | 18 | T-11-04 |

## View and lifetime

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-MAP-15 | The board keeps its view in the URL hash as `#zoom/lat/lng` and the schedule as `#s/zoom/lat/lng`; a reload restores the active page's view. Each page ignores the other's hash, and a camera move only writes the hash of the page that started it, so trip settings and the trip list stay clean. <!-- R-05-09, R-18-32, R-18-35 --> | active | 05 | 18 | T-05-08, T-18-14, T-18-17, T-18-18 |
| C-MAP-16 | Board, schedule and trip settings are child routes of one trip layout that owns the only map: switching between them never unmounts it (same MapLibre instance and canvas, no tile reload), on the settings tab it stays mounted but invisible, and leaving the trip destroys it. The layout loads trip and spots once and shares them, so the full-page loading state only shows on the first visit. <!-- R-18-27, R-18-28, R-18-29, R-18-34 --> | active | 18 | — | T-18-13, T-18-17 |
| C-MAP-17 | Switching tabs animates the same map in about 500 ms (instantly with `prefers-reduced-motion`): the schedule fits the trip region or the selected entry, the board returns to its last view or the trip region. Pins, highlights, draft pin and click handlers come from the active page, so a draft pin never carries over. <!-- R-18-30, R-18-31 --> | active | 18 | — | T-18-14, T-18-15, T-18-16 |
| C-MAP-18 | While low data is on and the map has not been loaded, the board loads no map chunk, style or tiles: at ≥ 640 px the map area shows “Load the map? Uses about 2–5 MB.” with *Load map* / *Karte laden*; on the phone the board opens on *List*, and *Map* shows the same question with *Load map* and *Cancel* (back to *List*). Once loaded, or once low data is off, the map stays for the rest of the page's life. <!-- R-38-09 --> | active | 38 | — | T-38-09, T-38-14 |

## Known gaps

- C-MAP-11: no automated test carries a T-ID for clustering; R-05-05 is only covered by the manual visual review T-05-09 (`apps/web/src/map/clusters.test.ts` exists without a tag).
- C-MAP-06: no test proves the zoom and locate buttons; T-05-03 only checks the 360 px list column and *Add new*.
- C-MAP-01: R-05-01 and the dark variant are only checked by the manual review T-05-09.
- C-MAP-13: R-25-01 names owners and planners; the code (`apps/web/src/pages/BoardPage.tsx`, `canEdit`) also lets board admins (R-28-01) right-click-add, and the rule describes the code.
