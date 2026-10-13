# Core — Trips

How trips are created, listed, edited and deleted: the trip API, the role guard every trip route reuses, the activity record written with each change, the My trips page, the create dialog, the trip settings page and the delete confirmation. A trip's region is a bounding box that the [map](./map.md) fits and limits itself to. Members and invites are in [members](./members.md), spot kinds created with a trip in [kinds](./kinds.md), live updates and conflicts in [live](./live.md), and the shared header and dialogs in [app](./app.md).

## API

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-TRIP-01 | `POST /trips {name, region:{bbox}, timezone, startDate?, endDate?}` (any logged-in user, Origin required) creates the trip, an owner membership for the caller, the four starter kinds *Must go*, *Maybe*, *Food* and *Sights* (in that order) and a `trip.create` event in one transaction → `201` with the trip. <!-- R-04-01, R-28-04, R-29-02 --> | active | 04 | 28, 29 | T-04-01, T-28-05, T-29-02 |
| C-TRIP-02 | Create and patch validate the body with the shared schema: the name is trimmed and must be 1–100 characters, dates must be real `YYYY-MM-DD` dates with `endDate` not before `startDate`, the bbox needs `min ≤ max` inside the world range, and `timezone` must be an IANA name known to `Intl`. Invalid input is `400 invalid_request` with `fields` (`empty`, `too_long`, `invalid_date`, `before_start`, `min_greater_than_max`, `invalid`). <!-- R-04-01 --> | active | 04 | — | T-04-02 |
| C-TRIP-03 | `GET /trips` lists the trips the caller is a member of, newest first, each with the caller's role, member count, created-by name, dates, timezone, region bbox, the members (id, name, avatar; owner first, then admins, planners, visitors by join date) and the caller's unread comment total. <!-- R-04-02, R-20-17, R-24-20 --> | active | 04 | 20, 24 | T-04-03, T-24-20 |
| C-TRIP-04 | `GET /trips/:id` returns the trip for members of any role; a non-member or unknown trip gets `404` (never `403`), so existence is not revealed. <!-- R-04-03 --> | active | 04 | — | T-04-04 |
| C-TRIP-05 | `PATCH /trips/:id` (planner, board admin or owner) changes name, `startDate`, `endDate` and/or the region bbox, needs at least one of them (`400` otherwise), writes a `trip.update` event and returns the trip; a visitor gets `403`. With the last seen `updatedAt` (`If-Unmodified-Since` header or `expectedUpdatedAt`) a changed trip answers `409 conflict` with `current` and `updatedBy`. <!-- R-04-04, R-19-15, R-28-01 --> | active | 04 | 19, 28 | T-04-05 |
| C-TRIP-06 | `DELETE /trips/:id` is owner only (`403` for others, same stale-version `409` as the patch) and answers `204`. It writes a `trip.delete` event first, then cascades to spots, plans and members and queues the image blobs in `blob_deletions`. <!-- R-04-04, R-19-15 --> | active | 04 | 19 | T-04-05, T-04-06 |
| C-TRIP-07 | The role guard `requireTripRole(min)` orders roles visitor < planner < admin < owner and is reused by every trip-scoped route: an unknown trip or a non-member is `404`, a member below the minimum is `403`. <!-- R-04-05, R-28-01 --> | active | 04 | 28 | T-04-07, T-28-01 |
| C-TRIP-08 | A stored role value the API does not know is never trusted silently: `parseTripRole` returns `null` for it, and only `roleOrVisitor` falls back to `visitor`, after logging a warning. <!-- R-26-09 --> | active | 26 | — | T-26-11 |
| C-TRIP-09 | `activity.record(tx, {actor, trip, action, entityId, metadata})` writes an `activity_events` row inside the caller's transaction, so a failed write leaves no event. Create, update and delete of a trip each write exactly one event (`trip.create`, `trip.update`, `trip.delete`) with the trip name in `metadata`. <!-- R-04-09 --> | active | 04 | — | T-04-10 |

## Pages and dialogs

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-TRIP-10 | The My trips page (`/trips`) shows one card per trip with name, dates, role badge, up to four member avatars (see [app](./app.md)), the creator, “N new comments” when there are unread ones, a link to the trip and a *Settings* link. A user without trips sees an empty state with “Create your first trip”. <!-- R-04-06, R-20-23, R-24-29 --> | active | 04 | 20, 24 | T-04-08, T-20-12 |
| C-TRIP-11 | The create-trip dialog asks for a name, a region picked from a search field and an optional date range; picking a region fills its bbox and its IANA time zone (the browser zone is the default). Saving posts the trip and opens its board. <!-- R-04-01, R-04-07 --> | active | 04 | — | T-04-08 |
| C-TRIP-12 | The trip settings page (`/trips/:id/settings`, the *Settings* tab of a trip, at most `max-w-3xl` wide) shows the trip name, role and dates; planners, board admins and owners can edit name, start and end date with inline field errors, visitors see it read-only, and a stale save opens the conflict dialog with “use mine” and “use theirs”. For board admins and the owner it also holds the *Spot kinds* section ([kinds](./kinds.md)); at 375 px the page has no horizontal scroll. <!-- R-04-04, R-19-16, R-32-01, R-32-02, R-32-06 --> | active | 04 | 19, 32 | T-32-02, T-32-09 |
| C-TRIP-13 | Only the owner sees *Delete trip* on the settings page; it opens a dialog that keeps the red confirm button disabled until the exact trip name is typed, then deletes the trip and returns to `/trips`. <!-- R-04-08, R-20-14 --> | active | 04 | 20 | T-04-09, T-20-10 |

## Known gaps

- C-TRIP-11: R-04-07 says the region comes from a geocode search result, but `apps/web/src/trips/CreateTripDialog.tsx` searches the 13 fixed regions in `packages/shared/src/regions.ts` (a comment there says step 06 would replace it); the rule describes the code.
- C-TRIP-12: no test proves the settings form (edit, read-only for visitors, stale-save conflict dialog); T-19-06 and T-19-10 cover spot conflicts only (R-04-04, R-19-16).
- C-TRIP-05: no test sends a stale `expectedUpdatedAt` to `PATCH` or `DELETE /trips/:id`, so the trip `409` is untested (R-19-15).
- C-TRIP-05: R-04-04 lists “owner, planner”; the code uses `requireTripRole(…, 'planner')`, which also admits board admins (R-28-01), and the rule describes the code.
