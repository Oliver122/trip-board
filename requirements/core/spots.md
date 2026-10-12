# Core — Spots

How a trip's spots are created, read, changed and deleted through the API and the spot panel, how addresses are geocoded, and how the board switches between spots. A spot is either a home spot or carries one or two [kinds](./kinds.md); stay periods and the primary home base are described in [home](./home.md). Spot photos are in [images](./images.md), searching, filtering and sorting the list in [list](./list.md), and how spots join plan entries in [planning](./planning.md). Roles and the guard come from [trips](./trips.md) and [members](./members.md).

## Spot API

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-SPOT-01 | `POST /trips/:id/spots` (planner, board admin, owner) creates a spot with `title`, `lat`, `lng`, either `kindIds` (1 or 2 different kinds of the trip) or `category: "home"`, and optional `address`, `info`, `link` → 201 with the full spot. A visitor gets 403 and a non-member 404; the legacy `category`/`baseCategory` values `must_go` and `maybe` still map to the trip's preset kind (400 `kind_not_found` once it is deleted). <!-- R-06-01, R-28-10 --> | active | 06 | 28 | T-06-01, T-06-02, T-28-11 |
| C-SPOT-02 | `GET /trips/:id/spots` (any member) returns `{spots, total}` from `spots_view`, each spot with `displayCategory`, `kinds`, `planCount`, `firstScheduledAt`, `stayFrom`, `stayTo`, `primary`, `createdBy {id, name, avatar}`, `commentCount` and the caller's `unreadComments`. `total` is the number of spots in the trip before filtering. <!-- R-06-02, R-24-20 --> | active | 06 | 24 | T-06-01 |
| C-SPOT-03 | `GET /spots/:id`, `PATCH /spots/:id` and `DELETE /spots/:id` check access through the spot's trip: read needs a member, write needs planner or higher, and a spot of a trip the caller is not in is 404. `GET` also returns `plans: [{linkId, entryId, title, type, visitDate, visitTime}]`; `DELETE` answers 204. <!-- R-06-03, R-10-08 --> | active | 06 | 10 | T-06-02, T-06-03 |
| C-SPOT-04 | `planned` is never accepted as input: `category` or `baseCategory: "planned"` on create or update is 400 with `fields.category = "planned_automatic"`. Planned is derived from plan entries (see [planning](./planning.md)). <!-- R-06-04 --> | active | 06 | — | T-06-04 |
| C-SPOT-05 | Spot input is validated by one shared schema that matches the DB checks: `title` 1–120 characters after trimming, `address` ≤ 300, `info` ≤ 2000, `link` ≤ 500, `lat` −90..90, `lng` −180..180; a violation is 400 with `fields` naming the field. A `PATCH` with no known field is 400 `body: empty`; blank `address`, `info` and `link` are stored as null. <!-- R-06-09 --> | active | 06 | — | T-06-06 |
| C-SPOT-06 | A link without a scheme such as `www.hotel.jp` is stored as `https://www.hotel.jp`, while `http(s)` links are kept as typed. After that normalization only an `http(s)` URL with a host is valid, so `javascript:`, `ftp:`, whitespace only or a host without a dot is 400 `fields.link`; create, update and the client use the same function. <!-- R-18-01, R-18-02 --> | active | 18 | — | T-18-01, T-18-02 |
| C-SPOT-07 | Saving a spot (create or update) whose point lies outside the trip's bounding box grows the box to include it plus 10 % padding in the same transaction; a spot inside leaves the box unchanged. <!-- R-06-05 --> | active | 06 | — | T-06-05 |
| C-SPOT-08 | `PATCH` and `DELETE` on a spot accept the `updatedAt` the client last saw (`expectedUpdatedAt`, or the `If-Unmodified-Since` header); if the spot changed since, the API answers 409 `conflict` with the current spot and who changed it. Requests without the value are last-write-wins, and a kind change or kind delete counts as an edit of the spots it touches. <!-- R-19-15, R-19-18 --> | active | 19 | — | T-19-06 |
| C-SPOT-09 | Every spot create, update and delete records an activity event (`spot.create`, `spot.update`, `spot.delete`, resource `home` for home spots) in the same transaction, which also notifies the other open boards of the trip. <!-- R-19-03, R-19-04 --> | active | 19 | — | T-19-02 |

## Geocoding

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-SPOT-10 | `GET /geocode/search?q=&lang=&tripId=` and `GET /geocode/reverse?lat=&lng=&lang=` (any signed-in user) proxy Nominatim and return results normalised to `{label, lat, lng, bbox?}`. `q` is 1–200 characters, `lang` is `en` or `de` (default `en`), and bad input is 400; an upstream failure is 502 with a translated error key. <!-- R-06-06, R-06-08 --> | active | 06 | — | T-06-09 |
| C-SPOT-11 | The proxy sends a proper User-Agent, calls Nominatim at most once per second across the whole server, and caches results for 30 days in `geocode_cache`, so the same query twice calls upstream once. <!-- R-06-06 --> | active | 06 | — | T-06-07, T-06-08 |
| C-SPOT-12 | A search with `tripId` (the caller must be a member, otherwise 404) is biased to the trip's bounding box through Nominatim's `viewbox` parameter in `left,top,right,bottom` order. <!-- R-06-07 --> | active | 06 | — | T-06-10 |

## Spot panel

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-SPOT-13 | The spot panel is a labelled dialog that opens in add mode from the “Add new” button, and for an existing spot as an editable form for planners, board admins and owners or as a read-only view for visitors, who also do not see “Add new” or any footer actions. <!-- R-07-05, R-07-08 --> | active | 07 | — | T-07-01, T-07-06 |
| C-SPOT-14 | In add mode the location is set by address search or by clicking the map, which places a draggable pin and fills the address by reverse geocoding; the address has a copy button that shows “Copied”. <!-- R-07-05, R-07-06 --> | active | 07 | — | T-07-01, T-07-02, T-07-09 |
| C-SPOT-15 | The panel fields are title, address, category (the kind chips and Home, see [kinds](./kinds.md)), info (placeholder “e.g. opens at 12”), link and a created-by line with time; the footer is Cancel and Add in add mode, and Delete, Cancel and Save in edit mode. A saved link shows as a clickable link that opens in a new tab with `rel="noopener noreferrer"`. <!-- R-07-06, R-07-07, R-18-05 --> | active | 07 | 18 | T-07-01, T-07-03 |
| C-SPOT-16 | Delete in the panel first asks for confirmation inline (naming how many comments will go with the spot), then removes the pin and card at once. <!-- R-07-07, R-24-16 --> | active | 07 | 24 | T-07-03 |
| C-SPOT-17 | The panel closes with `Esc` or ✕ and focus returns to the element that opened it; focus is trapped while it is open. Closing with unsaved changes first asks “Discard unsaved changes?”. <!-- R-07-07, R-07-12 --> | active | 07 | — | T-07-08, T-07-11 |
| C-SPOT-18 | A planned spot shows a “Planned (n)” badge next to its category, and it switches to Planned right after the spot is added to a plan entry. <!-- R-07-09, R-11-08 --> | active | 07 | 11 | T-11-02 |
| C-SPOT-19 | Create, update and delete update map and list immediately (optimistically), and roll back with an error toast when the request fails. <!-- R-07-10 --> | active | 07 | — | T-07-07 |
| C-SPOT-20 | The link is validated in the client before saving and the panel only closes after a successful save: an invalid link shows an inline field error under *Link*, and any other failure (validation, network, 5xx) keeps the panel open with the user's draft unchanged plus the error message. <!-- R-18-02, R-18-03, R-18-04 --> | active | 18 | — | T-18-03 |
| C-SPOT-21 | If someone else changed the open spot while it has unsaved edits, the panel keeps the draft and shows a banner (“reload their version / keep editing”); a save that gets 409 opens a conflict dialog with both versions for the differing fields, where “use mine” resends without the check and “use theirs” takes the other version. A spot deleted by someone else closes its panel with a “Deleted by …” toast. <!-- R-19-11, R-19-13, R-19-16 --> | active | 19 | — | T-19-10, T-19-11 |

## Switching and right-click add

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-SPOT-22 | A right-click on an empty point of the board map by a planner, board admin or owner opens the add panel with the draft pin at that point and the address from reverse geocoding, and the browser's context menu does not open. A right-click on a pin, cluster or map control starts nothing, and for visitors (and on touch devices) the map does nothing and the browser menu opens as usual. <!-- R-25-01, R-25-02 --> | active | 25 | — | T-25-01, T-25-02 |
| C-SPOT-23 | While a panel is open and its draft equals its baseline, clicking another pin or list card opens that spot straight away, and a right-click on the map starts a new spot there (in a clean add panel it only moves the draft pin); this works from edit mode and add mode. A left-click on empty map in edit mode still moves the open spot. <!-- R-25-03, R-25-05 --> | active | 25 | — | T-25-03, T-25-05, T-25-06 |
| C-SPOT-24 | With unsaved changes every switch (pin click, card click, right-click add) first shows the “Discard unsaved changes?” prompt: OK discards and switches, Cancel keeps the open spot and its edits; in add mode a placed pin or a filled field counts as a change. While a save is running, switch clicks and right-clicks are ignored. <!-- R-25-04, R-25-05 --> | active | 25 | — | T-25-04, T-25-05, T-25-06 |

## Known gaps

- C-SPOT-04: R-06-04 says the 400 carries the message “planned is set automatically”, but `apps/api/src/spots/routes.ts` and `packages/shared/src/spots.ts` answer `invalid_request` with `fields.category = "planned_automatic"`; the rule describes that.
- C-SPOT-03: no DoD test covers the `plans` list in `GET /spots/:id` (R-10-08).
- C-SPOT-05: R-06-09 lists title, info and link limits only; the code also limits `address` to 300 characters (`packages/shared/src/spots.ts`), which no DoD test checks.
- C-SPOT-09: step 19 has no DoD test for the `spot.create` and `spot.delete` events (only T-19-02 for update); the rule is proven for update only.
