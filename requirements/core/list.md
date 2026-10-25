# Core — List

The board's “Things to do” list and its toolbar: text search, filters (including the kind chips), sort, the URL state that makes a view shareable, the counts and empty states, and the setting that makes the list follow the map. List and map pins always show the same filtered spots. The spots themselves are in [spots](./spots.md), the kinds behind the chips in [kinds](./kinds.md), the plan entry filter's data in [planning](./planning.md), and the export that reuses the same filter and sort in [export](./export.md).

## Query and sort (API)

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-LIST-01 | `GET /trips/:id/spots` (any member) accepts `q`, `cat`, `status`, `by`, `entry` and `sort` and returns the filtered, sorted spots plus `total` (all spots of the trip), so list, pins and export share one source of truth; an invalid value (unknown `sort`, a non-uuid `by`, a bad `cat` token) is 400 with `fields` naming the parameter. <!-- R-09-08, R-11-07 --> | active | 09 | 11 | T-09-04, T-09-05 |
| C-LIST-02 | `q` is a trimmed, case-insensitive substring search over title, address and info, so `ÖFFNET` finds “öffnet um 12”, and `%`, `_` and `!` are matched as plain characters, not wildcards. <!-- R-09-01 --> | active | 09 | — | T-09-01 |
| C-LIST-03 | `status` is `all`, `scheduled` (plan count above 0) or `unscheduled`, `by` filters spots created by one member, and `entry` keeps only the spots linked to one plan entry. <!-- R-09-02, R-11-07 --> | active | 09 | 11 | T-09-02, T-11-05 |
| C-LIST-04 | `cat` takes comma-separated tokens: a kind id, `planned` or `home`; a spot matches if either of its kinds equals a kind token (or it is planned, or it is a home spot), and several tokens match as “any of”. An old `must_go` or `maybe` token maps to the trip's preset kind while it exists and is otherwise dropped without an error, as is a kind id of another trip. <!-- R-09-02, R-28-15 --> | active | 09 | 28 | T-28-16, T-09-02 |
| C-LIST-05 | `sort` is `scheduled` (default), `datetime`, `category`, `az` or `newest`. “Scheduled first” orders scheduled spots by `firstScheduledAt`, then the rest with home spots last and the others by their primary kind's order, with the primary home base ahead of other home spots, then by title. <!-- R-09-03, R-09-04, R-12-07, R-28-15 --> | active | 09 | 12, 28 | T-09-03, T-09-04, T-28-16 |
| C-LIST-06 | Export applies exactly this filter and sort service (shared `listSpots`), so an export with `cat=…` contains the same spots in the same order as the list. <!-- R-14-07 --> | active | 14 | — | T-14-04 |

## Toolbar and URL state

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-LIST-07 | The toolbar has search, filter, sort and export buttons; typing in search is debounced by 250 ms and filters list and pins together. <!-- R-09-01, R-09-05 --> | active | 09 | — | T-09-06 |
| C-LIST-08 | The filter popover has a category section with one chip per kind in kind order with its spot count, then *Planned* and *Home*, plus “All” and “Clear” and a search field once there are more than 8 chips; below it come status (all, scheduled, not scheduled), added by (member), plan entry (any or one entry) and the “Only visible on map” toggle. <!-- R-09-02, R-11-07, R-29-13 --> | active | 09 | 11, 29 | T-09-06, T-11-05, T-29-13 |
| C-LIST-09 | Sort offers Scheduled first (default), date and time, category, A–Z and newest; the choice lives in the URL. <!-- R-09-03 --> | active | 09 | — | T-09-04 |
| C-LIST-10 | The view lives in the URL query (`?q=&cat=&status=&by=&entry=&sort=&visible=`), so a shared link reproduces the same chips and results; parsing is forgiving and drops invalid or unknown values, and default values are not written. <!-- R-09-06, R-11-07, R-28-15 --> | active | 09 | 11, 28 | T-09-05, T-09-07 |
| C-LIST-11 | Active filters show as removable chips and “Reset” clears them all; when more than 3 categories are selected they collapse into one chip such as “Food +3” whose tooltip, on hover or focus, lists all names. <!-- R-09-07, R-29-13 --> | active | 09 | 29 | T-09-06, T-29-13 |

## List content and behavior

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-LIST-12 | By default the list shows every spot that matches search and filters, independent of zoom and pan. The “List follows map” setting in *Account & settings* (stored per browser in `localStorage`, default off) restricts it to spots in the visible map area on every trip; the toolbar's “Only visible on map” toggle overrides it for the session, and a `visible` URL parameter wins over the setting. Both are the shared `Switch` (C-APP-40); below 640 px *Only visible on map* sits at the top of the list beside *Filters*. <!-- R-07-02, R-18-06, R-18-07, R-18-08, R-18-09, R-42-16 --> | active | 07 | 18, 42 | T-18-04, T-18-05, T-42-10 |
| C-LIST-13 | A list card shows a kind-colored strip, the title, a second line that starts with the kind's name in words (“Planned” / “Geplant”, “Home” / “Unterkunft” for those) followed by ` · ` and the short address or else the first scheduled date (with its time only when it has one, formatted as on the schedule), and a mark in one icon style for kinds, planned and home; hovering a card highlights its pin and the other way round, and clicking either selects the spot, opens the panel and scrolls the card into view. Selecting a card flies the map to its pin. <!-- R-07-03, R-07-04, R-18-10, R-42-13, R-42-14 --> | active | 07 | 18, 42 | T-07-05, T-42-08 |
| C-LIST-14 | The default order shows scheduled spots first, then a divider “Not scheduled yet”, then the rest; the divider is a 12 px section label in the muted foreground token with a rule across the column, at least 4.5 : 1 contrast in both themes. <!-- R-09-04, R-42-15 --> | active | 09 | 42 | T-09-08, T-42-10 |
| C-LIST-15 | A count shows “n spots”, or “n of m spots” while filters are active. With no spots the list says “No spots yet — add your first one”, with filters matching nothing “No spots match your filters” with a Reset button, and — only when “List follows map” is on — a spot-less view says “Nothing here — zoom out or turn off ‘only visible on map’”. <!-- R-07-11, R-09-09, R-09-10, R-18-10 --> | active | 07 | 09, 18 | T-07-10, T-09-09 |
| C-LIST-16 | Below 640 px the list is the *List* tab of the phone's bottom bar (C-APP-25): the toolbar and the cards full-screen with no map; at 640–1023 px the list column is narrower. <!-- R-15-01, R-15-02, R-38-01, R-38-02 --> | active | 15 | 38 | T-15-01, T-15-02, T-38-02 |

## Known gaps

- C-LIST-01: R-09-08 does not mention `total` or the `entry` parameter; the rule describes `packages/shared/src/spot-query.ts` and `apps/api/src/spots/store.ts`.
- C-LIST-09: no DoD test checks the sort control in the UI or that the choice reaches the URL (T-09-04 is an API test).
