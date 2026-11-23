# Step 46 — Schedule on the map: days, route collage, moving visits

**Goal:** the schedule stops being a list next to a map and becomes the map: every day of the plan gets a colour, its visits become numbered pins joined by a line, day cards float over the map like a collage, and a visit can be moved to another day or entry instead of being removed and re-added.
**Depends on:** 11, 18, 19, 42
**Result:** Open *Japan 2026* → *Schedule*. Bucket *Tokyo* opens into one group per day plus *Any day*; on the map each day of Tokyo has its own colour, its visits are pins numbered 1, 2, 3 joined by a dashed line, and a card per day ("Mon 13 Apr · 3 stops") sits over the map at that day's visits. Clicking a card fits the map to that day and fades the others. A visit's ⋯ → *Move to…* → another day moves its pin, number and line at once, and another member's open schedule follows without a reload.
**Core:** C-PLAN-05, C-PLAN-10, C-PLAN-14, C-PLAN-21, C-PLAN-22, C-MAP-14, C-MAP-19, C-MAP-20
**Status:** planned

## Scope
- In: a shared day model of the plan; day groups inside buckets; moving a visit to another day or entry (API and UI); drawing the plan on the shared map on the Schedule tab (day colours, numbered pins, day lines); floating day cards with day focus; seed data with dated visits.
- Out: a tray of unplanned spots to drag into the schedule (later step); visit durations and shifting a whole entry by N days (later step); real routing and travel times between stops (needs a routing service, later step if ever); a calendar or hour grid view (later step); photos on the map and the photobook (step 47); export changes (step 14 stays as it is).

## Analysis

### Current behavior
| Topic | Today |
| --- | --- |
| Structure | The schedule is a flat list of entries (C-PLAN-10). A bucket ("Tokyo, 12–16 Apr") is one group holding all its visits in one hand-made order; the days inside it are not shown. A visit's date is just a field on the row |
| Order vs. time | Visits are ordered by `sort_order` only (C-PLAN-05). A visit at 09:00 can sit below one at 18:00; the list never sorts by date or time |
| Moving | A visit can only move up or down inside its own bucket (C-PLAN-14). Moving it to another day means editing its date; moving it to another entry means *Remove from bucket* and *Add spot* again, losing its time and info. Singles have no reorder at all |
| Map | The schedule's map is the board map with a fit and a highlight (C-MAP-14): all planned pins look the same (calendar icon), there are no numbers, no order and no lines, so the map cannot answer "what do we do on Tuesday and in which order" |
| Phone | The schedule tab is the list only; the plan is invisible on the map tab |

### What a traveller needs
| Need | Why | In this step |
| --- | --- | --- |
| See each day on its own | Trips are lived day by day; a 5-day bucket with 15 visits is unreadable as one list | Day groups (R-46-02) |
| See the day as a route on the map | "Are we zig-zagging across town?" is the main planning question and only a map answers it | Day colours, numbers, lines (R-46-05), cards (R-46-06) |
| Order follows the clock | Timed visits must appear in time order without manual dragging | Day order (R-46-01) |
| Move things around cheaply | Plans change all the time: rain, closed museums, a day that is too full | Move API and *Move to…* (R-46-03, R-46-04) |
| A place for "sometime in Tokyo" | Not every visit has a day yet | *Any day* group (R-46-02) |
| See unplanned spots next to the plan | Pick what to add next | Out — later step |
| Durations, shifting dates, travel times | Realistic days, flight delays | Out — later steps |

## Decisions
| Topic | Decision |
| --- | --- |
| Day model | Computed, not stored: a pure `planDays(entries, locale)` in `packages/shared` turns the plan into days. No new table; `plan_entry_spots.visit_date` stays the only source |
| Day order | Inside a day, visits with a time come first in time order, then visits without a time in their `sort_order`. Dragging only reorders the untimed part; a timed visit is moved by changing its time |
| Colours | A fixed palette of 8 day colours, cycling by the day's position in the trip (day 1 = colour 1, day 9 = colour 1 again), defined as tokens for light and dark. The same day always has the same colour in the list, on the pins, the line and its card |
| Lines | Straight dashed lines between consecutive stops of a day. No routing service — the map shows order, not travel paths |
| Where it shows | Only on the Schedule tab. The board keeps its normal pins (C-MAP-07); the shared map instance (C-MAP-16) adds and removes the plan layers when the tab changes |
| Cards | HTML markers anchored at the centroid of the day's stops, from 1024 px only. Cards that would overlap are pushed apart vertically. A *Day cards* switch on the map hides them |
| Move | `PATCH /plan/:id/spots/:linkId` takes `planEntryId` so one request moves a visit with its time and info. A move to another entry puts the visit at the end of that entry |

## Requirements

### Days
| ID | Requirement |
| --- | --- |
| R-46-01 | `planDays(entries)` in `packages/shared` returns the trip's days in date order: one day per date that has at least one dated visit (in any entry), each with its date, its colour index (0–7, `dayNumber - 1` mod 8, where `dayNumber` counts from the trip's start date, or from the first dated visit when the trip has no dates), and its stops in day order (timed visits by `visitTime`, then untimed by `sort_order`, ties by entry start), each stop carrying `linkId`, `entryId`, `spotId` and its 1-based `stopNumber`. Undated visits of each entry are returned separately as that entry's *any day* list |
| R-46-02 | On the Schedule tab an open bucket shows one sub-group per day of its range that has visits (header "Mon 13 Apr" with the day's colour dot and the stop count) in date order, then *Any day* / *Ohne Tag* for its undated visits. A day's rows are in day order and show the stop number in the day's colour. A single shows its visits in day order with the day's colour. A day header is a button that focuses the day (R-46-07) |

### Moving visits
| ID | Requirement |
| --- | --- |
| R-46-03 | `PATCH /plan/:id/spots/:linkId` also accepts `planEntryId` (an entry of the same trip) together with an optional `visitDate`: the link moves to that entry, keeps its `visitTime` and `info` (a `visitTime` without the new `visitDate` is cleared), is placed at the end of the target's order, and the response is the updated link → 200. An entry of another trip or unknown is 404, a `visitDate` outside the target's range is 400 `fields.visitDate = "outside_range"` (C-PLAN-06), and the write records `plan.spot_move` with `metadata {fromEntryId, toEntryId, fromDate, toDate}` in the same transaction (which also notifies the trip, C-LIVE-03) |
| R-46-04 | Each visit's ⋯ menu (C-PLAN-14) gets *Move to…* / *Verschieben nach…*, a dialog listing every entry and, for buckets, each day of the range plus *Any day*; picking one moves the visit (same entry and another day only changes `visitDate`). From 640 px a row can also be dragged onto another day header or *Any day* group, in this or another bucket, with the drop target highlighted. The change is optimistic, a failed request restores the old place with an error toast, focus returns to the moved row's ⋯ button and the `aria-live` region announces "Moved to Tue 14 Apr, stop 2" |

### The plan on the map
| ID | Requirement |
| --- | --- |
| R-46-05 | While the Schedule tab is active the shared map draws the plan: every dated visit is a 28 px round pin in its day's colour with its stop number (a spot in several stops gets one pin per stop), the stops of each day are joined in order by a dashed 3 px line in the day's colour, and spots with no dated visit are drawn at 40 % opacity. Each numbered pin is a button labelled "<day>, stop <n>: <spot>" / "<Tag>, Stopp <n>: <Spot>" that selects its row in the list. Leaving the tab removes these layers and the board pins look as before |
| R-46-06 | From 1024 px the map shows one card per day over the map, anchored at the centroid of that day's stops: day colour bar, "Mon 13 Apr · 3 stops", and the first three spot names. Cards that would overlap on screen are moved apart vertically so none covers another, and a *Day cards* / *Tageskarten* switch (C-APP-40) on the map hides and shows them, kept in `localStorage` (`scheduleDayCards`, inside `try/catch`, default on). Below 1024 px there are no cards; pins and lines stay |
| R-46-07 | Focusing a day (clicking its card, its day header or a numbered pin's day) fits the map to that day's stops (48 px padding, at most zoom 16), draws the other days' pins, lines and cards at 30 % opacity and scrolls the list to the day; Escape or clicking the focused card again ends the focus. Selecting an entry (C-MAP-14) fits to the entry and shows all its days at full opacity |
| R-46-08 | The 8 day colours are tokens with a light and a dark value, each with at least 3:1 contrast against the map's land colour in that theme and white stop numbers at 4.5:1 on the pin. With `prefers-reduced-motion` the fit is instant |
| R-46-09 | When nothing in the plan has a visit date the schedule map shows a non-blocking hint "Give visits a day to see your route on the map" / "Gib Besuchen einen Tag, um deine Route auf der Karte zu sehen". A plan change from another member (a live `plan` event, C-LIVE-14) redraws pins, numbers, lines and cards without a reload and keeps the map position |

### Seed
| ID | Requirement |
| --- | --- |
| R-46-10 | `pnpm db:seed` gives the first bucket of *Japan 2026* dated visits on two different days (one day with two timed visits and one untimed, another day with one visit) and one undated visit, so the day groups, numbers, lines and cards have data (no core change) |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-PLAN-05 | modify | R-46-03 |
| C-PLAN-10 | modify | R-46-02 |
| C-PLAN-14 | modify | R-46-04 |
| C-PLAN-21 | add | R-46-01 |
| C-PLAN-22 | add | R-46-04 |
| C-MAP-14 | modify | R-46-07 |
| C-MAP-19 | add | R-46-05, R-46-08, R-46-09 |
| C-MAP-20 | add | R-46-06, R-46-07 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-46-01 | unit | R-46-01 | `planDays`: visits across two buckets and a single come out as days in date order with colour index from the trip start (day 9 → index 0); inside a day 18:00 sorts after 09:00 regardless of `sort_order` and untimed visits follow in `sort_order`; the same spot twice on one day gets two stops; undated visits land in their entry's *any day* list; a trip without dates counts from the first dated visit |
| T-46-02 | unit | R-46-02 | `ScheduleList` with a 3-day bucket renders the day headers in order with colour dot and count, omits a day without visits, shows *Any day* last, and numbers the rows 1..n per day |
| T-46-03 | api | R-46-03 | Moving a link to another entry with a valid `visitDate` → 200, the link is last in the target's order, keeps `visitTime` and `info`, and one `plan.spot_move` activity row with the from/to metadata exists; without `visitDate` the time is cleared; a date outside the target's range → 400 `outside_range`; an entry of another trip → 404; a visitor → 403 |
| T-46-04 | e2e | R-46-04 | As `aiko`: ⋯ → *Move to…* → the other seeded day moves the row under that day's header with the new stop number and announces it; dragging a row onto *Any day* clears its date; with the PATCH stubbed to 500 the row returns to its old place and an error toast shows |
| T-46-05 | e2e | R-46-05, R-46-10 | On the seeded schedule the map has numbered pins 1–3 for the first day and 1 for the second in their day colours, one line layer per day, unplanned spots at 40 % opacity; clicking pin "…, stop 2: …" selects its row; switching to the board shows normal pins and no plan layers |
| T-46-06 | e2e | R-46-06, R-46-07 | At 1280 px two day cards are visible and their boxes do not intersect; clicking a card fits the map to that day (its pins inside the viewport) and the other card has 30 % opacity; Escape restores it; turning *Day cards* off hides the cards after a reload too; at 768 px no card is rendered |
| T-46-07 | unit | R-46-08 | The 8 day colour tokens meet 3:1 against the land colour and 4.5:1 for white text, in light and dark (same check style as `contrast.test.ts`) |
| T-46-08 | e2e | R-46-09 | A trip with entries but no visit dates shows the map hint; with two browser contexts, a move by `aiko` updates `sven`'s pins and numbers within 3 s without a reload and `sven`'s map centre is unchanged |
| T-46-09 | a11y | R-46-04, R-46-06 | axe on the schedule with day groups, open *Move to…* dialog and visible day cards, light and dark: no serious or critical issues |
