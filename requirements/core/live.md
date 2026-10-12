# Core — Live

Real-time collaboration: a Server-Sent Events stream per trip that tells open boards when something changed (fed by Postgres `LISTEN/NOTIFY`), the browser hook that refetches only what changed, a polling fallback, and the conflict check that stops two people silently overwriting each other. It touches every area that writes data ([spots](./spots.md), [planning](./planning.md), [members](./members.md), [kinds](./kinds.md), [discussions](./discussions.md), [images](./images.md), [import](./import.md)) and [admin](./admin.md) (open stream count, `activity_events`).

## Stream (server)

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-LIVE-01 | `GET /trips/:id/events` returns `text/event-stream` to any member of the trip; a non-member gets 404 and no session 401. <!-- R-19-01 --> | active | 19 | — | T-19-01 |
| C-LIVE-02 | Each API process holds one dedicated Postgres connection with `LISTEN trip_events`, outside the request pool, and routes notifications to the open streams of that trip in memory. <!-- R-19-02 --> | active | 19 | — | T-19-02 |
| C-LIVE-03 | A notification is sent in the same transaction as the `activity_events` insert, with an ids-only payload `{tripId, resource, id, action, actorId, clientId}`, so a rolled-back write sends nothing and no route can forget to publish. <!-- R-19-03 --> | active | 19 | — | T-19-02 |
| C-LIVE-04 | Notifications exist for the resources `spot`, `image`, `plan`, `home`, `member`, `trip`, `comment` and `kind`, and an import sends a single `spot.import` notification; marking comments as read sends none. <!-- R-19-04, R-23-18, R-24-10, R-24-23, R-28-09 --> | active | 19 | 23, 24, 28 | T-19-02, T-23-09, T-24-09, T-28-10 |
| C-LIVE-05 | Deleting a trip closes every stream of that trip, and removing a member or a member leaving closes that user's stream after the others get a `member` event. <!-- R-19-04 --> | active | 19 | — | T-19-03 |
| C-LIVE-06 | A comment line is sent every 25 s so proxies keep the stream open, the response sets `X-Accel-Buffering: no` and `cache-control: no-cache, no-transform`, and the heartbeat also closes the stream when its session has ended or expired. <!-- R-19-05, R-19-06 --> | active | 19 | — | T-19-04 |
| C-LIVE-07 | A user may have at most 5 open streams per API process (the sixth is 429), and the route is excluded from the normal request-rate limit. <!-- R-19-06 --> | active | 19 | — | T-19-04 |
| C-LIVE-08 | Events carry an `id` but are not replayed: a reconnect with `Last-Event-ID` gets `event: resync` so the client refetches everything once. <!-- R-19-07 --> | active | 19 | — | T-19-05 |
| C-LIVE-09 | If the `LISTEN` connection drops, the API reconnects with backoff (200 ms doubling to 10 s), logs "trip events listener reconnecting" and sends `resync` to all its streams. <!-- R-19-20, R-19-19 --> | active | 19 | — | T-19-05 |
| C-LIVE-10 | `GET /admin/streams` (admin only) returns the current number of open streams on the process, which the admin dashboard shows. <!-- R-19-19 --> | active | 19 | — | — |
| C-LIVE-11 | The README documents the route, the reverse-proxy settings (no buffering, read timeout of at least 10 minutes) and the polling fallback. <!-- R-19-21 --> | active | 19 | — | — |

## Browser

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-LIVE-12 | `useTripEvents(tripId)` opens one `EventSource` per open trip tab (board and schedule share it) and closes it on leave. <!-- R-19-08 --> | active | 19 | — | T-19-08 |
| C-LIVE-13 | Every write sends an `X-Client-Id` header (random per tab) and the tab ignores events with its own client id, because it already shows its own change. <!-- R-19-09 --> | active | 19 | — | T-19-07 |
| C-LIVE-14 | Incoming events are batched (about 300 ms) into refetches of only the affected data (spot list, plan, members or trip, kinds, comment threads, images), and the map position, open dialogs, scroll and selection are kept. <!-- R-19-10, R-24-10, R-28-09 --> | active | 19 | 24, 28 | T-19-07, T-19-08, T-19-09, T-28-15 |
| C-LIVE-15 | A spot whose panel is open with unsaved changes keeps the user's draft and shows a banner "Aiko changed this spot — reload their version / keep editing", while a panel without unsaved changes just updates. <!-- R-19-11 --> | active | 19 | — | T-19-10 |
| C-LIVE-16 | A spot or entry deleted by someone else closes its open panel or dialog with an info toast "Deleted by Aiko". <!-- R-19-13 --> | active | 19 | — | T-19-11 |
| C-LIVE-17 | If the stream fails 3 times in a row the client falls back to polling every 15 s and shows an error toast only if polling fails too. <!-- R-19-12 --> | active | 19 | — | T-19-12 |
| C-LIVE-18 | When the tab has been hidden for more than 5 minutes the stream is closed, and on return the client does one full refetch and reconnects. <!-- R-19-14 --> | active | 19 | — | — |

## Conflicts

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-LIVE-19 | `PATCH` and `DELETE` of a spot, a plan entry and a trip accept the `updatedAt` the client last saw (`If-Unmodified-Since` header or `expectedUpdatedAt` field, invalid value 400) and answer 409 with the current version and who changed it when the row changed since. <!-- R-19-15, R-26-08 --> | active | 19 | 26 | T-19-06 |
| C-LIVE-20 | Requests without the check (old tabs, API clients) and reordering inside a bucket are last-write-wins, and other users see the new order through the event. <!-- R-19-17, R-19-18 --> | active | 19 | — | T-19-06, T-19-09 |
| C-LIVE-21 | On a 409 the client shows a conflict dialog naming who changed it with their values against the user's for the differing fields, and the user picks "use mine" (resend without the check) or "use theirs". <!-- R-19-16, R-26-08 --> | active | 19 | 26 | T-19-10 |

## Known gaps

- C-LIVE-06: the heartbeat, the headers and the proxy behavior are only covered by the manual T-19-13 (no report); T-19-04 proves the stream closes on logout.
- C-LIVE-10: no test proves `GET /admin/streams` or its dashboard display (R-19-19).
- C-LIVE-11: documentation only; nothing checks the README text (R-19-21).
- C-LIVE-18: no test proves the 5-minute hidden-tab rule (R-19-14).
- C-LIVE-09: no test proves the log line or the backoff values (R-19-19, R-19-20); T-19-05 only proves reconnect and `resync`.
