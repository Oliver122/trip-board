# Step 25 — Faster spot switching and right-click add

**Goal:** a planner on *Japan 2026* right-clicks a point on the board map and the add panel opens with a pin there; with “Fushimi Inari” open and unchanged, a click on the “Kiyomizu-dera” pin opens that spot at once, without closing the panel first.
**Depends on:** 07
**Result:** Right-click the board map to start a spot there; with a spot open and unchanged, a click on another pin or card opens it at once
**Core:** C-MAP-13, C-SPOT-22, C-SPOT-23, C-SPOT-24
**Status:** integrated 2026-10-11

## Scope
- In: right-click on the board map to start a new spot at that point; switching between spots by pin or card while the panel is open; one unsaved-changes prompt for every switch, list cards included.
- Out: right-click add on the schedule map (the schedule's own *Create new spot* flow, R-18-23, stays as it is); long-press on touch devices, because it competes with map gestures (“Add new” stays the touch and keyboard path); a context menu with more actions; a Save / Discard / Cancel dialog that saves before switching.

## Current behavior
| Topic | Today |
| --- | --- |
| Adding a spot | Only the “Add new” button (R-07-05) opens add mode; the location is then set by address search or a left-click on the map. The map does nothing on right-click (`map/TripMap.tsx`) |
| Clicking a pin while a panel is open | Owners and planners always open a spot in edit mode, and in edit or add mode a pin click is ignored (`if (!placing) onSelect(…)` in `map/TripMap.tsx`). The panel has to be closed first |
| Clicking a card while a panel is open | `openSpot` in `pages/BoardPage.tsx` replaces the panel without checking for unsaved changes, so edits are lost silently |
| Left-click on empty map in edit mode | Moves the open spot to the clicked point and reverse geocodes the address |

## Requirements
| ID | Requirement |
| --- | --- |
| R-25-01 | On the board, an owner or planner who right-clicks an empty point of the map gets the add panel, as if they had pressed “Add new” and then clicked that point: the draft pin sits there and the address is filled by reverse geocoding. The browser's own context menu does not open |
| R-25-02 | A right-click on a pin, a cluster or a map control does not start a new spot. For visitors a right-click does nothing in the app, and the browser's context menu opens as usual |
| R-25-03 | While the panel is open and its draft equals its baseline (no unsaved changes), clicking another pin or list card opens that spot straight away, and a right-click on the map starts a new spot at that point. This works from edit mode and from add mode. In a clean add panel a right-click only moves the draft pin |
| R-25-04 | While the panel has unsaved changes, every switch (pin click, card click, right-click add) first shows the existing “Discard unsaved changes?” prompt. OK discards and switches; Cancel keeps the open spot and its edits unchanged. In add mode a placed pin or a filled field counts as a change. This replaces today's silent switch on card click |
| R-25-05 | A left-click on empty map in edit mode still moves the open spot (unchanged). While a save is in progress, switch clicks and right-clicks are ignored until it finishes |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-25-01 | e2e | R-25-01 | As `aiko` (planner) on *Japan 2026*: right-click an empty map point → the add panel opens, a draft pin is at that point, and the address comes from the reverse geocode fixture. Saving creates the spot there |
| T-25-02 | e2e | R-25-02 | As `aiko`, right-clicking a pin does not open add mode. As `tom` (visitor), right-clicking the map opens no panel and the `contextmenu` event is not prevented |
| T-25-03 | e2e | R-25-03 | As `aiko`, open a spot by its pin, change nothing, click another pin → the panel shows the second spot and no prompt appears. The same with a list card. In a clean add panel, right-clicking another point moves the draft pin there |
| T-25-04 | e2e | R-25-04 | As `aiko`, open a spot and change its title, then click another pin: the prompt appears. Cancel → the first spot stays open with the changed title. Again with OK → the second spot opens and the first spot's title is unchanged on the server. Repeated with a card click and with a right-click add |
| T-25-05 | e2e | R-25-05 | As `aiko`, with a spot open and unchanged, a left-click on empty map moves its draft pin and shows no prompt. While a delayed save is pending, a pin click does not switch the panel |
| T-25-06 | unit | R-25-03, R-25-04, R-25-05 | The switch decision returns “switch” for a clean draft, “confirm” for a changed draft in edit and add mode, and “ignore” while saving |
