# Step 32 — Spot kinds in trip settings and menus that are never clipped

**Goal:** board admins manage spot kinds in a *Spot kinds* section of the trip settings page instead of a dialog behind a menu in the filter toolbar, and every menu and picker shows all its options and a clearly visible selection.
**Depends on:** 29, 31
**Result:** As owner, open *Settings* of a trip: below the trip form is a *Spot kinds* section with all kinds, and the board's filter toolbar has no `⋮` menu any more. Open *Add kind*: all presets and “Custom kind…” are visible at once, also at 375 px and 768 px, nothing is cut off. In the symbol picker the chosen symbol has a clear ring and check mark
**Core:** C-KIND-12, C-KIND-18, C-KIND-19, C-KIND-21, C-KIND-25, C-TRIP-12, C-APP-20
**Status:** integrated 2026-10-12

## Scope
- In: moving the spot kinds management from `KindsDialog` (opened by `kinds/BoardMenu.tsx` in `spots/SpotToolbar.tsx`) into a section of `/trips/:id/settings`; removing the board menu from the filter toolbar; redirecting the old `?dialog=kinds` link; a wider settings page; `Menu` popovers that are rendered outside any scroll container and always fit the viewport; a clearly visible selected state in the symbol picker and the color swatches.
- Out: the kind chip filter in the toolbar itself (step 29, unchanged); the kind API, limits and request flow (steps 28, 29, unchanged); the platform admin's kind settings and approvals (step 29); the delete-kind confirmation, which stays a small modal (step 28); trip delete on the settings page (step 04).

## Current behavior
| Topic | Today |
| --- | --- |
| Where kinds live | A `⋮` *Board menu* (`kinds/BoardMenu.tsx`) sits at the end of the filter toolbar next to the kind chips, search and sort; its only item *Spot kinds* opens `KindsDialog` as a `lg` modal (`?dialog=kinds`). The trip settings page (`pages/TripSettingsPage.tsx`, `max-w-xl`) only has name, dates and delete, so board settings are split over two places |
| Add kind menu | `Menu` (`components/ui/menu.tsx`) renders its popover `absolute top-full` inside its parent. Inside the kinds modal the parent is the modal body with `overflow-y-auto`, so the list of presets plus “Custom kind…” (up to 9 items of 44 px) is cut off at the body's bottom edge and the lower items cannot be seen or must be scrolled for inside the modal |
| Symbol selection | The selected symbol in `SymbolPicker` only gets `border-foreground bg-hover` on a button without a border width, so the selection is barely visible in light and dark mode; the color swatches have the same weak mark |

## Decisions
| Topic | Decision |
| --- | --- |
| Place | Kinds are a board setting, so they belong on the trip settings page as a section *Spot kinds* with the anchor `#kinds`, below the trip form and above *Delete trip*. The filter toolbar only filters |
| No modal | The section renders the existing list, add menu, custom form, limit and request parts in place (no `Modal`), so nothing is nested in a second scroll container |
| Menu popover | `Menu` renders its popover in a portal on `document.body` with `position: fixed`, placed under the trigger, flipped above it when there is more room there, shifted to stay 8 px inside the viewport, and with `max-height` of the available space plus its own scrolling only when the viewport is smaller than the menu |
| Selection | Selected symbol and color: a 2 px `foreground` ring with 2 px offset plus a small check badge, so it does not depend on color alone |

## Requirements

### Kinds in settings
| ID | Requirement |
| --- | --- |
| R-32-01 | For a board admin or owner, `/trips/:id/settings` shows a section with the heading *Spot kinds* / *Ortsarten* and `id="kinds"` below the trip form and above *Delete trip*. It contains everything the kinds dialog had: the ordered list with swatch, name, spot count, rename, color, symbol, move up/down and delete, the *Add kind* menu with presets and “Custom kind…”, the custom form, “5 of 12 kinds”, the limit and request part, with its loading and error states |
| R-32-02 | Planners and visitors see no *Spot kinds* section on the settings page, and its DOM is not rendered |
| R-32-03 | The filter toolbar on the board has no board menu (`data-testid="board-menu"` does not exist for any role), and `kinds/BoardMenu.tsx` is deleted |
| R-32-04 | Opening `/trips/:id?dialog=kinds` as board admin or owner replaces the URL with `/trips/:id/settings#kinds` and scrolls the settings column (the page's own scroll container; the document does not scroll, step 31) so the section is in view; as planner or visitor the `dialog` parameter is removed and the board shows nothing else (as before) |
| R-32-05 | `/trips/:id/settings#kinds` opened directly scrolls the settings column so the *Spot kinds* section is in view and moves focus to its heading (`tabIndex=-1`) |
| R-32-06 | The settings page is at most `max-w-3xl` wide, so a kind row with name field, count and its 4 icon buttons fits on one line at ≥ 768 px; at 375 px rows wrap without horizontal scrolling (`document.scrollingElement.scrollWidth <= innerWidth`) |
| R-32-07 | Kind changes made by another user or a limit decision by the platform admin update the open settings section without a reload, as they did the dialog |
| R-32-08 | All new texts (section heading, its description line) exist in `en` and `de` |

### Menus and selection
| ID | Requirement |
| --- | --- |
| R-32-09 | Every `Menu` popover is rendered in a portal outside its parent, so no ancestor with `overflow` or `transform` can clip it: with the *Add kind* menu open, every `menuitem` lies fully inside the viewport and is visible without scrolling at 1280 × 800, 768 × 1024 and 375 × 667 |
| R-32-10 | The popover opens below the trigger aligned to `align` (start or end); if the space below is smaller than its height and the space above is larger, it opens above; it is shifted so it stays at least 8 px from every viewport edge; only if neither side fits it gets `max-height` of the larger space and scrolls inside itself, and the focused item scrolls into view |
| R-32-11 | `Menu` keeps its behavior from step 26: `aria-haspopup`, `aria-expanded`, `aria-controls` pointing at the portaled menu, arrow keys, Home, End, Escape and outside click close it and return focus to the trigger; a click inside the portaled popover is not an outside click; it closes when any scroll container around the trigger scrolls (a capture-phase `scroll` listener, e.g. the settings column) or the window resizes, but not when the popover itself scrolls |
| R-32-12 | The selected symbol in `SymbolPicker` and the selected color swatch show a 2 px ring in `foreground` with a 2 px offset and a check badge, visible in light and dark mode; the ring has at least 3:1 contrast against the card background, and unselected items have no ring |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-KIND-18 | modify | R-32-01, R-32-02, R-32-03, R-32-04, R-32-05 |
| C-KIND-19 | modify | R-32-01, R-32-06 |
| C-KIND-21 | modify | R-32-07 |
| C-KIND-12 | modify | R-32-12 |
| C-KIND-25 | modify | R-32-08 |
| C-TRIP-12 | modify | R-32-01, R-32-02, R-32-06 |
| C-APP-20 | modify | R-32-09, R-32-10, R-32-11 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-32-01 | e2e | R-32-01, R-32-03 | As owner on *Japan 2026*: the board has no `board-menu`; open *Settings*, the *Spot kinds* section lists the 2 seeded kinds (*Must go*, *Maybe*) in order with counts and “2 of 12 kinds”; add *Coffee* from the add menu, rename it, move it up, delete it; after a reload the settings page shows the result |
| T-32-02 | e2e | R-32-02 | As planner (`aiko`) and visitor (`tom`): the settings page has no element `#kinds` and no *Spot kinds* heading, and the board has no `board-menu` |
| T-32-03 | e2e | R-32-04, R-32-05 | As owner, go to `/trips/:id?dialog=kinds`: the URL becomes `/trips/:id/settings#kinds`, the section heading is in the viewport and focused. As visitor the same link ends on `/trips/:id` without `dialog` and no kinds UI |
| T-32-04 | e2e | R-32-09, R-32-10 | At 1280 × 800, 768 × 1024 and 375 × 667 on the settings page of a trip with 3 preset kinds (*Must go*, *Maybe*, *Food*), scroll the settings column so the *Add kind* button is at the bottom of the viewport and open the menu: all 5 missing presets and “Custom kind…” have bounding boxes fully inside the viewport and at least 8 px from its edges, and the menu opened above the trigger; with the button at the top it opens below |
| T-32-05 | unit | R-32-09, R-32-10, R-32-11 | Testing Library on `Menu` inside a `div` with `overflow: hidden; height: 50px`: the open `role="menu"` is not a descendant of that `div` but of `document.body`, the trigger's `aria-controls` equals its `id`, arrow keys, Home, End move focus, Escape and a mousedown outside close it and focus the trigger, a click on an item fires `onSelect`; with mocked `getBoundingClientRect` and a 300 px window the popover gets `max-height` and flips |
| T-32-06 | unit | R-32-12 | `SymbolPicker` and the color swatch group: the selected option has `aria-selected="true"` (`aria-pressed` for swatches), the ring classes and a check badge; unselected options have neither |
| T-32-07 | e2e | R-32-12 | In light and dark mode, take the computed ring color of the selected symbol and the card background: contrast ≥ 3:1; screenshot of the picker attached to the PR (G-6) |
| T-32-08 | e2e | R-32-07 | Two browsers as owner: one on the settings page, the other adds a kind on its own settings page; the first shows it within 2 s without reload. The platform admin approves a pending limit request; the open section shows the new limit |
| T-32-09 | e2e | R-32-06 | At 768 px every kind row's buttons share one line with its name field; at 375 px `document.scrollingElement.scrollWidth <= innerWidth` on the settings page |
| T-32-10 | a11y | R-32-01, R-32-11 | axe on the settings page with the *Spot kinds* section, the add menu open and the symbol picker open, in both themes: no serious or critical issue |
| T-32-11 | unit | R-32-08 | The missing-key test covers the new keys under `kinds.section*` in `en` and `de` |
