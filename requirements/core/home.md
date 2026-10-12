# Core — Home

Home spots: places to sleep that carry an optional stay period and at most one *primary home base* per trip, and how the right home is resolved and shown for each plan entry. A home spot is created and edited like any other spot ([spots](./spots.md)) but has no [kinds](./kinds.md); the entries it is shown next to are in [planning](./planning.md), and its place in the list order is in [list](./list.md).

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-HOME-01 | Only a home spot may have stay dates or be the primary home base: in the spot panel, choosing *Home* shows optional **Stay from / to** fields and a **Primary home base** checkbox. The API rejects stay dates or `primary: true` on a non-home spot with 400 `home_only`, a non-date value with `invalid_date`, and a stay end before its start with `before_start`. <!-- R-12-01 --> | active | 12 | — | T-12-03, T-12-05 |
| C-HOME-02 | Switching a spot's category away from Home hides the stay fields and clears them after a confirmation, and on save the API stores no stay dates for it. <!-- R-12-01 --> | active | 12 | — | T-12-05 |
| C-HOME-03 | A trip has at most one primary home base (`trips.primary_home_spot_id`): setting a spot as primary replaces the previous one, `primary: false` clears it, and a database trigger clears it when the spot is recategorised away from Home or the spot is deleted. <!-- R-12-02 --> | active | 12 | — | T-12-02 |
| C-HOME-04 | Stay dates may be cleared again; the spot stays a home spot without a stay period. <!-- R-12-08 --> | active | 12 | — | — |
| C-HOME-05 | Every entry of `GET /trips/:id/plan` carries `home: {spotId, title}`, resolved as the home spot whose stay period overlaps the entry's date range (the earliest stay start wins), else the trip's primary home base, else `null`. <!-- R-12-03 --> | active | 12 | — | T-12-01 |
| C-HOME-06 | The schedule shows the home next to each bucket (“⌂ Hotel Gracery”), and a single entry shows it only when its date falls inside a stay period. <!-- R-12-04 --> | active | 12 | — | T-12-06 |
| C-HOME-07 | A home spot keeps `displayCategory = home` when it is added to a plan entry, so its pin keeps the house icon instead of turning *Planned*. <!-- R-12-05 --> | active | 12 | — | T-12-04 |
| C-HOME-08 | The primary home base has a distinct marker, a filled house pin, and is listed first among the home spots of the list. <!-- R-12-07 --> | active | 12 | — | T-12-08 |
| C-HOME-09 | Two home spots with overlapping stay periods are allowed (a hotel change day) but the spot panel shows an overlap warning naming the other spot, in both panels. <!-- R-12-06 --> | active | 12 | — | T-12-07 |

## Known gaps

- C-HOME-04: no DoD test clears a stay period and checks that the spot stays home (R-12-08).
- C-HOME-08: T-12-08 proves the filled-house pin only; the “first among home spots” ordering (`orderPrimaryHomes` in `apps/web/src/spots/model.ts`, sort in `apps/api/src/spots/store.ts`) has no DoD test.
- C-HOME-03: R-12-02 does not say that deleting the primary home spot clears the flag; `docs/database/schema.sql` does this with a foreign key `ON DELETE SET NULL`, and no DoD test checks it.
