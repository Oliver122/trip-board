# Step 18 — Quality of life

**Goal:** remove the small annoyances people hit every day on the board and the schedule.
**Depends on:** 07, 11, 15

## Scope
- In: forgiving spot links, list that does not follow the map unless you want it to, icon reorder buttons with visual feedback, language switch moved into settings, creating a spot from the schedule, one map that stays loaded and moves smoothly between board and schedule.
- Out: live updates between users (see [step 19](./19-live-collaboration.md)), new spot fields, changes to the planning API, keeping the map alive across different trips, theme/language changes without a map remount.

## Current behavior (why this step exists)
| Topic | Today |
| --- | --- |
| Links | `checkLink` in `packages/shared/src/spots.ts` rejects anything without `http(s)://`. The board closes the panel *before* the request (`BoardPage.save`), so a 400 throws the whole draft away and only shows “save failed” |
| List vs. map | `query.visible` defaults to `true` (R-07-02), so every zoom or pan reshuffles the list. The toolbar toggle only lives in the URL and is lost on the next visit |
| Reorder | Up/down buttons in `ScheduleList` show translated text (`schedule.up` / `schedule.down`). After a move nothing shows what moved; drag and drop has no drop indicator |
| Language | `LanguageSwitch` sits in the header (and the admin layout) next to the theme switch, and is also on the account page |
| Add spot in schedule | `AddSpotForm` only searches existing spots. A new spot means switching to the board, creating it, and coming back |
| Map on tab switch | Viewports are already separate (`#…` vs `#s/…`, `viewport.ts`), but the switch still feels like a fresh load: `BoardPage` and `SchedulePage` are sibling routes that each render their own `MapView`, so every switch destroys the MapLibre instance and builds a new one (new WebGL canvas, style and tiles fetched again → black frame). Before that, each page replaces the whole view with `LoadingState` while it refetches trip and spots. The two pages also place the map differently (board: map left, panel right; schedule: list left, map right) |

## Requirements

### Links
| ID | Requirement |
| --- | --- |
| R-18-01 | A link without a scheme (e.g. `maps.google.com/xyz`, `www.hotel.jp`) is accepted and stored as `https://…`. The same normalization runs in the shared schema, so API and UI agree |
| R-18-02 | Only links that are still invalid after normalization (e.g. `javascript:…`, spaces only, `ftp://…`) are rejected, with an inline field error under *Link*. The panel stays open |
| R-18-03 | Client-side validation runs before saving; the panel only closes after the input is valid |
| R-18-04 | If saving fails for any reason (validation, network, 5xx), the panel stays open (or reopens) with the user’s draft unchanged, plus the error message. No input is ever lost |
| R-18-05 | Saved links show as clickable, opening in a new tab (`rel="noopener noreferrer"`) |

### List and map
| ID | Requirement |
| --- | --- |
| R-18-06 | By default the spot list shows **all** spots that match search/filters, independent of zoom and pan |
| R-18-07 | A setting *“List follows map”* (account settings) turns on the current behavior: list shows only spots in the visible map area. Default: off |
| R-18-08 | The setting is stored per browser (`localStorage`, like the theme) and applies on every trip without a URL parameter |
| R-18-09 | The toolbar toggle stays as a quick override for the current session; the URL parameter still wins over the setting when present |
| R-18-10 | With *“List follows map”* off, selecting a card still flies the map to its pin; the “zoom out” empty state (R-07-11) is only shown when the setting is on |

### Reorder in buckets
| ID | Requirement |
| --- | --- |
| R-18-11 | Move up / move down are icon buttons (chevron up / chevron down from `lucide-react`) instead of text. The remove button becomes an icon button too. `aria-label`s and tooltips (`title`) stay translated |
| R-18-12 | First item has move up disabled (not hidden), last item has move down disabled, so buttons don’t jump around |
| R-18-13 | After a move, the moved row animates to its new place and is briefly highlighted (~1 s). With `prefers-reduced-motion`, only the highlight is shown |
| R-18-14 | Keyboard focus stays on the same button of the moved row, so pressing it again keeps moving the same spot |
| R-18-15 | Screen readers hear the result via an `aria-live="polite"` region, e.g. “Ramen Ichiran moved to position 2 of 5” |
| R-18-16 | Drag and drop: the dragged row is dimmed and a drop indicator line shows where it will land |
| R-18-17 | While the reorder request runs the order is already updated (optimistic, as today); on failure the old order comes back and a toast explains it |

### Language in settings
| ID | Requirement |
| --- | --- |
| R-18-18 | The EN/DE switch is removed from the header and the admin layout |
| R-18-19 | The account page becomes *Account & settings* with a *Settings* section holding language, theme and *List follows map* (R-18-07). The avatar menu entry is renamed accordingly |
| R-18-20 | The login and join pages (no session yet) keep a small language switch, so a German user can read them before logging in |
| R-18-21 | Changing the language still applies without reload and is saved to the profile (R-03-05 unchanged) |

### Create a spot from the schedule
| ID | Requirement |
| --- | --- |
| R-18-22 | In *Add spot* inside a bucket or single, the list of matching spots ends with *“Create new spot ‘&lt;search text&gt;’”*. Shown also when there are no spots at all |
| R-18-23 | It opens the existing spot panel on the schedule page, title prefilled with the search text. The location is set by address search or by clicking the schedule map, same as on the board |
| R-18-24 | After saving, the new spot is created and directly selected in the *Add spot* form, so the user only picks visit date/time and confirms. Cancelling the panel returns to the form with the search text kept |
| R-18-25 | The new spot also appears on the schedule map and the board without reload. Visitors do not see the option |
| R-18-26 | Uses the existing APIs (`POST /trips/:id/spots`, then add to plan). If adding to the plan fails, the spot stays created and the form shows it selected with an error, so the user can retry |

### Map when switching tabs
| ID | Requirement |
| --- | --- |
| R-18-27 | **One map per trip.** Board and schedule become child routes of a trip layout (`/trips/:id`), and that layout owns the only `TripMap`. Switching between board and schedule never unmounts the map. The MapLibre instance, WebGL canvas, style and loaded tiles stay, so there is no black frame and no tile reload |
| R-18-28 | **Stable map slot.** The map stays in the same DOM node on both tabs. Pages only swap the side panel (spot list or schedule list) and choose which side it sits on via layout/CSS (e.g. `order`), never by rendering the map in a different parent. When the map area changes size, `map.resize()` runs in the same frame (ResizeObserver), so the map never shows a stretched or blank strip |
| R-18-29 | **Shared trip data.** The layout loads trip and spots once and gives them to both pages (context). Page-only data (the plan on the schedule, filters on the board) loads inside the side panel with its own skeleton. The page-wide `LoadingState` only shows on the first visit to a trip, never on a tab switch |
| R-18-30 | **Camera transition.** On switching, the same map animates (`easeTo`/`fitBounds`, ~500 ms) from where it is to the target view. Schedule: trip region, or the selected entry’s spots. Board: the board’s last view (R-05-09 / sessionStorage), or the trip region if none. With `prefers-reduced-motion` it jumps instantly (`duration: 0`), still without reloading |
| R-18-31 | **Page-specific map props.** Pins, highlights, `placing`, draft pin and click handlers come from the active page and update in place on the existing map (markers swap, base map stays). A draft pin or placing mode from the board never carries over to the schedule, and the other way round |
| R-18-32 | **Viewports stay separate.** The existing per-page hash (`#zoom/lat/lng` vs `#s/zoom/lat/lng`) and storage keys stay. Because the instance now outlives the page, `moveend` writes for the page that is active *at the time of the event*. The transition animation in R-18-30 must not write the old page’s view into the new page’s hash. Reload on either tab keeps that tab’s view |
| R-18-33 | **No dark flash fallback.** The map container background matches the active theme’s map background color, so even the first load or a retry (tile error) never shows a black box |
| R-18-34 | **Lifetime.** The map lives as long as the user stays inside `/trips/:id/*`. On the trip settings tab it stays mounted but hidden (`visibility: hidden`, not `display: none`, so it keeps its size), so coming back is instant. Leaving the trip (other trip, trip list, account) destroys it normally |
| R-18-35 | Deep links and reloads (`/trips/:id`, `/trips/:id/schedule`, with or without hash) still work as before; the first map load on a direct visit is unchanged |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-18-01 | unit | R-18-01, R-18-02 | Shared schema: `www.hotel.jp` → `https://www.hotel.jp`; `HTTP://x.de` kept; `javascript:alert(1)` and `ftp://x` → `invalid` |
| T-18-02 | api | R-18-01 | `POST /trips/:id/spots` with `link: "hotel.jp"` stores `https://hotel.jp`; `PATCH` behaves the same |
| T-18-03 | e2e | R-18-02, R-18-03, R-18-04 | Entering `javascript:x` shows the field error and the panel stays open with title and address intact. Forcing a 500 on save keeps the panel open with the draft |
| T-18-04 | e2e | R-18-06, R-18-07 | Default: zooming to Tokyo keeps Kyoto cards in the list. After enabling *List follows map* in settings, the same zoom hides them; the setting survives reload |
| T-18-05 | unit | R-18-08, R-18-09 | Query parsing: no URL param → value from setting; `visible=0` / `visible=1` override it |
| T-18-06 | unit | R-18-11, R-18-12 | Reorder buttons render icons, have translated `aria-label`s, and are disabled at the ends |
| T-18-07 | e2e | R-18-13, R-18-14, R-18-15 | Clicking move down twice moves the same spot two places, keeps focus on its button, highlights the row, and the live region text matches |
| T-18-08 | e2e | R-18-17 | A failed reorder request restores the old order and shows the toast |
| T-18-09 | e2e | R-18-18, R-18-19, R-18-21 | Header has no language switch; switching to DE in settings changes the UI immediately and persists after reload |
| T-18-10 | e2e | R-18-20 | Login page offers the language switch while logged out |
| T-18-11 | e2e | R-18-22, R-18-23, R-18-24, R-18-25 | From a bucket: type “Onsen”, choose create, place it on the map, save → it is selected in the form, gets added to the bucket, and shows on the board without reload |
| T-18-12 | e2e | R-18-22 | As visitor, the create option is not shown |
| T-18-13 | e2e | R-18-27, R-18-28, R-18-29 | Tag the map on the board (`window.__tripboardMap.__probe = 1` and a `data-probe` on its canvas). Switch to schedule and back twice: the probe is still on the same instance and the same canvas element, `map-loading` and the page `LoadingState` never appear, and no new style request is made |
| T-18-14 | e2e | R-18-30, R-18-32 | Zoom the board to Tokyo, open schedule → map ends on the whole trip region; back to board → ends on Tokyo; the hash after each switch matches the active page only (`#…` on board, `#s/…` on schedule); reload on schedule keeps the schedule view |
| T-18-15 | e2e | R-18-30 | With `reducedMotion: 'reduce'` the camera reaches the target view right after the switch, with no intermediate `move` events |
| T-18-16 | e2e | R-18-31 | Start placing a new spot on the board (draft pin visible), switch to schedule → no draft pin, clicks on the map do nothing; the schedule's highlighted pins show; back on board, the board pins are back |
| T-18-17 | e2e | R-18-34, R-18-35 | Open trip settings and back → same map instance (probe kept). Open another trip → new instance. Direct load of `/trips/:id/schedule#s/…` opens at that view |
| T-18-18 | unit | R-18-32 | `remember` with a schedule-scoped event while the board is active (and vice versa) writes nothing |
| T-18-19 | a11y | R-18-11, R-18-19, R-18-22 | Schedule, settings and spot panel pass axe; reorder and create flows work by keyboard only |
