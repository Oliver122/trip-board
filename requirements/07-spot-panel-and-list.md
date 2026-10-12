# Step 07 — Spot panel & list

**Goal:** the core of the sketch — add, view, edit and delete spots on the board; list and map stay in sync.
**Depends on:** 05, 06
**Result:** Add/edit/delete spots in the UI; list follows the map
**Core:** C-KIND-14, C-KIND-16, C-LIST-12, C-LIST-13, C-LIST-15, C-MAP-07, C-MAP-08, C-MAP-12, C-SPOT-13, C-SPOT-14, C-SPOT-15, C-SPOT-16, C-SPOT-17, C-SPOT-18, C-SPOT-19
**Status:** integrated 2026-10-11

## Scope
- In: pins from real data, “Things to do” list, viewport filtering (“only visible on map”), hover/select sync, spot panel (add/edit/view-only), address search + click-on-map, copy address, delete confirm, optimistic updates.
- Out: images (08), toolbar (09), “In plans” section (11).

## Requirements
| ID | Requirement |
| --- | --- |
| R-07-01 | Pins for all spots, colored by `displayCategory` |
| R-07-02 | The list shows spots inside the current viewport by default; “Only visible on map” toggle shows all |
| R-07-03 | List card: category strip, title, short address or first scheduled date, category icon |
| R-07-04 | Hovering a card highlights its pin and vice versa; clicking either selects it and opens the panel; the selected card scrolls into view |
| R-07-05 | “Add new” opens the panel in add mode; the user sets the location by address search **or** by clicking the map (draggable pin + reverse geocode) |
| R-07-06 | Panel fields: title, address (+ copy button), category (must go / maybe / home), info (placeholder “e.g. opens at 12”), link, created by + time |
| R-07-07 | Add mode footer: Cancel / Add. Edit mode: Delete / Cancel / Save. Unsaved changes prompt before closing |
| R-07-08 | Visitors see the panel read-only, without footer actions; “Add new” is hidden for visitors |
| R-07-09 | Planned spots show a “Planned (n)” badge next to the category |
| R-07-10 | Create/update/delete update map and list immediately (optimistic), and roll back with an error toast on failure |
| R-07-11 | Empty states: “No spots yet — add your first one” (trip empty) and “Nothing here — zoom out or turn off ‘only visible on map’” (viewport empty) |
| R-07-12 | Panel closes with `Esc` / ✕; focus returns to the element that opened it |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-07-01 | e2e | R-07-05, R-07-06, R-07-07 | Planner adds “Fushimi Inari” via address search, category Must go, info text → pin and card appear without reload |
| T-07-02 | e2e | R-07-05 | Click on the map in add mode places a pin and fills the address from reverse geocode (fixture) |
| T-07-03 | e2e | R-07-07 | Edit title and save → card title updates. Delete with confirm → pin and card disappear |
| T-07-04 | e2e | R-07-02 | Zooming to Tokyo hides Kyoto cards; toggling “only visible on map” off shows them again |
| T-07-05 | e2e | R-07-04 | Hovering a card adds the highlighted state to the matching pin; clicking a pin opens its panel and scrolls the card into view |
| T-07-06 | e2e | R-07-08 | Visitor (`tom`): no “Add new”, panel inputs are read-only, no Save/Delete |
| T-07-07 | e2e | R-07-10 | With the API returning 500 on save, the card reverts and an error toast shows |
| T-07-08 | e2e | R-07-07 | Closing a panel with unsaved changes asks for confirmation |
| T-07-09 | unit | R-07-06 | Copy button writes the address to the clipboard and shows “Copied” |
| T-07-10 | unit | R-07-11 | List shows the correct empty state for “no spots” vs. “none in view” |
| T-07-11 | a11y | R-07-12 | Panel is a labelled dialog; `Esc` closes it; focus is trapped while open and restored after |
