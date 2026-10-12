# Step 31 — Sidebar scrolling and delete icon buttons

**Goal:** scrolling a long list, spot panel or schedule moves only that column and never the page or the map, and delete actions are icon buttons whose content never spills out of the button.
**Depends on:** 26, 29
**Result:** With 30 spots, scroll the list or an open spot panel with the mouse wheel: only the column moves, the map keeps its zoom and position, and the page never scrolls. Delete in the spot panel, a plan entry and a comment is a trash icon with a tooltip, and nothing overflows a button in English or German
**Core:** C-APP-16, C-APP-30, C-APP-31, C-SPOT-16, C-DISC-16, C-PLAN-20
**Status:** integrated 2026-10-12

## Scope
- In: scroll containment of the board list column, the spot panel (side variant of `Modal`) and the schedule list at all three layouts (≥ 1024, 640–1023, < 640 px); the document never scrolling on the board and schedule; icon-only delete buttons (first step) in the spot panel footer, the plan entry dialog footer and comment actions; inline confirm rows that wrap instead of overflowing; a guard against button text overflow.
- Out: the trip delete on the settings page and the kind delete in the kinds dialog (they already have room, or are icons, step 29); the *Edit* action on comments (stays text); the bottom sheet's drag gesture itself (step 15, only its inner scrolling is in scope); changing map wheel or pinch zoom over the map (step 05).

## Current behavior
| Topic | Today |
| --- | --- |
| Scrolling | With enough cards in the list or content in the spot panel, a wheel or trackpad scroll over the column scrolls it, but the scroll also reaches the page or the map, so the map moves or zooms together with the column. The spot panel is a `fixed inset-0` side `Modal` (`components/ui/modal.tsx`) over the map; the list `<ul>` and the panel body use `overflow-auto` without `overscroll-behavior` |
| Delete buttons | The spot panel footer (`spots/SpotPanel.tsx`) and the plan entry dialog footer (`plan/EntryDialog.tsx`) show a text *Delete* button, and the inline confirm row puts the question and two text buttons on one `justify-between` line; in the narrow panel and in German (“Ort löschen”) the text overflows its button. Comments (`comments/SpotDiscussion.tsx`) show *Delete* as a text link |

## Decisions
| Topic | Decision |
| --- | --- |
| Icon | `Trash2` from `lucide-react`, 16 px, in a square button of at least 44 × 44 px, `danger` variant |
| Name | Each icon button has an `aria-label` and a native `title` tooltip from the translation files (en + de), e.g. “Delete spot” / “Ort löschen” |
| Final confirm | The final confirm button keeps a short text label next to the icon (“Delete” / “Löschen”), because an icon alone is too weak for an irreversible action; it never wraps or overflows |
| Containment | `overscroll-behavior: contain` on every scrolling column, and the board and schedule pages fill the viewport exactly (`html`, `body` and the trip layout never get a scrollbar) |

## Requirements

### Scrolling
| ID | Requirement |
| --- | --- |
| R-31-01 | On `/trips/:id` and `/trips/:id/schedule` the document never scrolls: at 1280, 768 and 375 px, with 30 spots and the spot panel open, `document.scrollingElement.scrollTop` stays 0 and the page has no vertical or horizontal scrollbar, whatever is scrolled |
| R-31-02 | A wheel or trackpad scroll over the board list column scrolls only the list: the list's `scrollTop` changes, while the map's zoom and center stay exactly the same |
| R-31-03 | A wheel or trackpad scroll over the open spot panel (any part: header, body, footer) scrolls only the panel body, and the map's zoom and center stay the same. This holds at ≥ 1024 px, where the panel covers the list, and at 640–1023 px, where it is a sheet next to the list |
| R-31-04 | When a scrolled column reaches its top or bottom, further scrolling in the same direction does nothing: it does not chain to the page or the map (`overscroll-behavior: contain`) |
| R-31-05 | The schedule list column scrolls the same way: only the column moves, the schedule map keeps its zoom and center, and it does not chain at its ends |
| R-31-06 | Below 640 px, scrolling inside the bottom sheet at the *half* or *full* snap scrolls the list and does not pan or zoom the map behind it, and the sheet keeps its snap |
| R-31-07 | A wheel scroll over the map itself (outside any column or panel) still zooms the map as before |

### Delete icon buttons
| ID | Requirement |
| --- | --- |
| R-31-08 | The first-step *Delete* in the spot panel footer is an icon-only `Trash2` button (danger variant, ≥ 44 × 44 px) with `aria-label` and `title` “Delete spot” / “Ort löschen”; it opens the same inline confirmation as before |
| R-31-09 | The first-step *Delete* in the plan entry dialog footer is an icon-only `Trash2` button with `aria-label` and `title` “Delete entry” / “Eintrag löschen”; it opens the same inline confirmation as before |
| R-31-10 | A comment's *Delete* action is an icon-only `Trash2` button with `aria-label` and `title` “Delete comment” / “Kommentar löschen”, shown under the same conditions as before (author or owner) and still asking for confirmation |
| R-31-11 | In the spot panel and entry dialog the inline confirm row puts the question (with the comment count for spots) on its own line above *Cancel* and the final confirm button whenever both do not fit on one line; the final confirm button shows the trash icon plus “Delete” / “Löschen”, with `white-space: nowrap` |
| R-31-12 | No button in the spot panel, the plan entry dialog or the comment list has content wider than itself: for every `button` there, `scrollWidth <= clientWidth` and its text does not overlap a neighbour, in English and German, at 1280, 768 and 375 px, in both the normal and the confirming state |
| R-31-13 | Keyboard and screen-reader use is unchanged: the icon buttons are reachable by Tab, show the focus ring, are announced by their label, and after *Cancel* in the inline confirm focus returns to the trash button |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-APP-30 | add | R-31-01, R-31-02, R-31-03, R-31-04, R-31-05, R-31-06, R-31-07 |
| C-APP-16 | modify | R-31-08, R-31-09, R-31-10, R-31-11 |
| C-APP-31 | add | R-31-12, R-31-13 |
| C-SPOT-16 | modify | R-31-08, R-31-11 |
| C-PLAN-20 | add | R-31-09, R-31-11 |
| C-DISC-16 | modify | R-31-10 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-31-01 | e2e | R-31-01, R-31-02, R-31-04 | At 1280 px on a trip with 30 spots: read the map's zoom and center, move the mouse over the list and wheel down 2000 px, then up 4000 px. The list's `scrollTop` went above 0 and back to 0, the map's zoom and center are unchanged, and `document.scrollingElement.scrollTop` is 0 throughout |
| T-31-02 | e2e | R-31-01, R-31-03, R-31-04 | At 1280 and 768 px, open a spot with a 2000-character info and 20 comments; wheel over the panel header, body and footer past the end and back. Only the panel body's `scrollTop` changes; map zoom and center and the document scroll stay unchanged |
| T-31-03 | e2e | R-31-01, R-31-05 | On the schedule with 12 plan entries at 1280 px, wheel over the schedule list past both ends: the list scrolls, the schedule map's zoom and center and the document scroll stay unchanged |
| T-31-04 | e2e | R-31-07 | Wheel over an empty point of the board map: the zoom changes (regression guard for the containment) |
| T-31-05 | unit | R-31-04 | The list `<ul>`, the side `Modal` body and the schedule list render with the `overscroll-contain` class, and the board layout root has `h-dvh` / `overflow-hidden` (component test) |
| T-31-06 | manual | R-31-06 | On a real phone (iOS Safari and Android Chrome) with 30 spots: drag the sheet to *half* and *full*, swipe inside the list to both ends; the list scrolls, the map behind does not move and the sheet keeps its snap. Note the result in the step 31 report |
| T-31-07 | unit | R-31-08, R-31-09, R-31-10, R-31-13 | Testing Library on `SpotPanel`, `EntryDialog` and `SpotDiscussion`: the delete control is a `button` with accessible name “Delete spot” / “Delete entry” / “Delete comment”, a matching `title`, an `svg` child and no visible text; in `de` the names are “Ort löschen” / “Eintrag löschen” / “Kommentar löschen”; clicking it shows the confirmation, and *Cancel* returns focus to it |
| T-31-08 | e2e | R-31-08, R-31-11 | As planner: open a spot with 3 comments, click the trash button, see “Delete this spot? Also deletes 3 comments.” above *Cancel* and *Delete*, confirm; pin and card disappear (as T-07-03) |
| T-31-09 | e2e | R-31-09, R-31-10 | Delete a plan entry and a comment through their trash buttons and confirm; both are gone after reload. A visitor sees no trash button on others' comments |
| T-31-10 | e2e | R-31-11, R-31-12 | In `en` and `de`, at 1280, 768 and 375 px, for the spot panel and the entry dialog in normal and confirming state, and the comment list: every visible `button` has `scrollWidth <= clientWidth` and no two buttons' bounding boxes overlap |
| T-31-11 | a11y | R-31-13 | axe on the board with the spot panel open in confirming state and on the entry dialog, in both themes: no serious or critical issue (no unnamed buttons) |
