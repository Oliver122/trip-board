# Step 24 — Spot discussions

**Goal:** every member of *Japan 2026* can open “Fushimi Inari”, read what the others wrote about it, and add a comment such as “I'd go, but only early in the morning”; the others see it without reload, and anyone who was away finds it under “News” and as an unread badge on the spot.
**Depends on:** 07, 13, 17, 19
**Result:** Open “Fushimi Inari”, read and add comments that others see without reload; anyone who was away finds them under “News” and as an unread badge on the spot
**Core:** C-ADMIN-21, C-DISC-01, C-DISC-02, C-DISC-03, C-DISC-04, C-DISC-05, C-DISC-06, C-DISC-07, C-DISC-08, C-DISC-09, C-DISC-10, C-DISC-11, C-DISC-12, C-DISC-13, C-DISC-14, C-DISC-15, C-DISC-16, C-DISC-17, C-DISC-18, C-DISC-19, C-DISC-20, C-DISC-21, C-DISC-22, C-DISC-23, C-DISC-24, C-DISC-25, C-LIVE-04, C-LIVE-14, C-MEMB-10, C-SPOT-02, C-SPOT-16, C-TRIP-03, C-TRIP-10
**Status:** integrated 2026-10-11

## Scope
- In: one discussion thread per spot, shown in the spot panel; plain-text comments that any trip member can post, including visitors; editing and deleting your own comments; the owner removing any comment; a comment count on list cards; unread tracking per user and spot; a “News” panel in the trip header with unread badges on list cards, pins, My trips cards and the browser tab title; `spot_comments` and `spot_comment_reads` tables; comment and news routes; `comment.*` activity events; live updates; admin feed text.
- Out: threads on plan entries, home spots' stay periods or the trip as a whole; replies inside a thread (nested threads); @mentions; notifications outside the open app (e-mail, Discord, browser push); news about other changes such as new spots or plan edits; reactions and voting on spots (backlog, `docs/PROJECT_SCOPE.md` §10); images or files in comments; Markdown; comments in CSV / PDF / calendar export; “who is typing”.

## Current behavior
| Topic | Today |
| --- | --- |
| Comments | Listed under “not in v1” in `docs/PROJECT_SCOPE.md` §10. A spot has one `info` field (R-07-06) that planners overwrite; there is no place for several people to answer each other |
| Unread state | Nothing in the app is tracked per reader. The header (`components/Header.tsx`, step 20) has the app name and the member avatars; My trips cards (`TripCard.tsx`, R-04-06) show name, dates, role and avatars |
| Visitor writes | Visitors cannot write anything in a trip (`docs/PROJECT_SCOPE.md` §5.6). This step adds the first visitor write: comments |

## Requirements

### Data
| ID | Requirement |
| --- | --- |
| R-24-01 | A `spot_comments` table: `id`, `trip_id`, `spot_id`, `author_id`, `body`, `created_at`, `edited_at` (null until the first edit). `(trip_id, spot_id)` references `spots (trip_id, id)` with `ON DELETE CASCADE`, so a comment always belongs to a spot of the same trip and goes away with the spot or the trip. `author_id` references `users` with `ON DELETE SET NULL`. Index on `(spot_id, created_at, id)` |
| R-24-02 | `body` is trimmed, 1 to 2000 characters, plain text with line breaks. The limit lives in `packages/shared` next to the spot limits (R-06-09) and is checked by the shared schema and by a database `CHECK` |
| R-24-18 | A `spot_comment_reads` table: `user_id`, `trip_id`, `spot_id`, `last_read_at`, primary key `(user_id, spot_id)`. `(trip_id, spot_id)` references `spots (trip_id, id)` and `user_id` references `users`, both `ON DELETE CASCADE` |
| R-24-19 | A comment is **unread** for a member when someone else wrote it, it was created after that member's `last_read_at` for the spot, and after their `trip_members.joined_at` (a new member does not start with a pile of old comments as unread). Editing a comment does not make it unread again. Index on `spot_comments (trip_id, created_at)` for the unread counts |
| R-24-03 | `docs/database/DATABASE.md` documents the tables in §1 and §3 and lists `comment` with `create`, `update`, `delete` in the `activity_events` table. `docs/PROJECT_SCOPE.md` §5.6 gets the row “Comment on spots” with ✅ for owner, planner and visitor, and §10 no longer lists comments. `docs/database/checks.sql` gains a check that a comment for a spot of another trip is rejected |

### API
| ID | Requirement |
| --- | --- |
| R-24-04 | `GET /spots/:id/comments?cursor=` (any trip member) returns comments oldest first, 50 per page, with `nextCursor` when more exist. Each comment has `id`, `body`, `createdAt`, `editedAt`, `author {id, displayName, avatarUrl}` (`author: null` when the user was deleted) and `canEdit`, `canDelete` for the current user. A non-member or unknown spot is `404`, no session `401`, a bad cursor `400` |
| R-24-05 | `POST /spots/:id/comments {body}` (any trip member, visitors included) creates a comment as the current user and returns `201` with the comment. An empty or too long body is `400`. A non-member or unknown spot is `404`, no session `401` |
| R-24-06 | `PATCH /comments/:id {body}` changes the body and sets `edited_at`; only the author may do it. Another member, the owner included, is `403`. `DELETE /comments/:id` removes the comment; the author and the trip owner may do it, a planner or visitor deleting someone else's comment is `403`. Both: a non-member or unknown comment is `404`, no session `401`, a bad body `400` |
| R-24-07 | A member who was removed from the trip or left it loses access (`404`), but their comments stay and still show their name. A comment whose author was deleted shows as “Former member” |
| R-24-08 | `GET /trips/:id/spots` and `GET /spots/:id` return `commentCount` for each spot |
| R-24-09 | Creating, editing and deleting a comment each record one `activity_events` row (`comment.create`, `comment.update`, `comment.delete`) in the same transaction, with `metadata {trip, spot}` (names only, never the comment text). The owner deleting someone else's comment also stores `metadata.author` |
| R-24-10 | Each comment write sends one live notification `{resource: "comment", id: <spot id>, action}` (R-19-03). Members with that spot's panel open refetch the thread; every member's list updates the count |
| R-24-11 | `POST /spots/:id/comments` allows at most 20 comments per user per minute; the next one is `429` with `Retry-After`. The global limit (R-15-04) still applies |
| R-24-20 | `GET /trips/:id/spots` and `GET /spots/:id` return `unreadComments` for the current user next to `commentCount`. `GET /trips` returns `unreadComments` per trip (sum over its spots) |
| R-24-21 | `GET /trips/:id/news` (any trip member) returns the spots with unread comments for the current user, newest comment first, at most 50: spot `id`, `title`, `displayCategory`, `unreadComments`, and the newest unread comment's author, `createdAt` and the first 140 characters of its body. Plus `total`, the unread count over the whole trip. Non-member or unknown trip `404`, no session `401` |
| R-24-22 | `PUT /spots/:id/comments/read {upTo}` (any trip member) sets `last_read_at` to `upTo`, the `createdAt` of the newest comment the client has shown, but never moves it back and never past now; returns `204`. `POST /trips/:id/news/read` marks every spot of the trip as read for the current user. Bad `upTo` `400`, non-member or unknown spot/trip `404`, no session `401` |
| R-24-23 | Marking as read is not a change to the trip: it records **no** `activity_events` row and sends no live notification to other members, an intended exception to G-10. `docs/database/DATABASE.md` §3 says so under `activity_events` |

### UI
| ID | Requirement |
| --- | --- |
| R-24-12 | The spot panel, in view and edit mode and for every role, shows a “Discussion” section below the spot fields: each comment with avatar, name, relative time (full date on hover), “edited” when `editedAt` is set, and the body with line breaks kept and `http(s)` URLs as links (`rel="noopener noreferrer nofollow"`, new tab). Any other text, HTML included, is shown as text. More than 50 comments load with “Show older” |
| R-24-13 | Below the comments is a text field with a “Send” button. Ctrl/Cmd + Enter also sends, Enter adds a line. The button is disabled while the field is empty or over the limit, and a counter appears from 1800 characters. The new comment appears at once (optimistic) and the field clears; on failure it is removed, the text is put back, and an error toast shows. In add mode, before the spot exists, the section is hidden |
| R-24-14 | The author sees “Edit” and “Delete” on their own comments; the owner sees “Delete” on all comments. Edit turns the comment into a text field with Save / Cancel. Delete asks for confirmation |
| R-24-15 | With no comments, the section shows an empty state that invites the first comment (for example to ask whether others want to go there) |
| R-24-16 | A list card with at least one comment shows a speech-bubble icon with the count and an accessible label (“3 comments”). The delete confirmation of a spot names the number of comments that will be deleted with it |
| R-24-17 | The admin activity feed shows the events as “aiko commented on Fushimi Inari in Japan 2026”, “… edited a comment on …”, “… deleted a comment on …”, and the action filter offers the three `comment.*` actions |

### News
| ID | Requirement |
| --- | --- |
| R-24-24 | The trip header (board and schedule) has a “News” button with a bell icon and a badge with the trip's unread total (`99+` above 99, no badge at 0). Its accessible name includes the count (“News, 3 unread”) |
| R-24-25 | The button opens a panel listing the entries of R-24-21: spot title with category color, “2 new”, author avatar and name, relative time and the excerpt. Clicking an entry goes to the board (from the schedule as well), selects the spot, opens its panel scrolled to the discussion and marks it read. A “Mark all as read” button calls `POST /trips/:id/news/read`. With nothing unread the panel shows a “You're all caught up” empty state |
| R-24-26 | Opening a spot's panel marks its thread read once the discussion section has been visible on screen (`IntersectionObserver`), not merely by selecting the spot. A comment that arrives live while the section is visible is marked read right away |
| R-24-27 | When a thread with unread comments opens, a “New” divider sits above the first unread comment and stays until the panel closes, so the reader sees where to start |
| R-24-28 | A list card with unread comments shows its comment icon filled in the accent color with the unread count; the map pin gets a small dot. Cards with only read comments keep the plain count of R-24-16 |
| R-24-29 | A My trips card with unread comments shows “3 new comments”. While a trip is open the browser tab title starts with the unread total, e.g. “(3) Japan 2026 · Tripboard”, and goes back to the plain title at 0 |
| R-24-30 | On a live `comment` event (R-24-10) the badge, the News panel, list cards and pins refresh their unread counts without reload. Marking read in one tab updates the counts in the user's other tabs on their next refetch or `resync` (R-19-07) |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-24-01 | db | R-24-01, R-24-02, R-24-03 | On the migrated database: a comment with the `spot_id` of a spot in another trip fails; an empty body and a 2001-character body fail the `CHECK`; deleting the spot deletes its comments; deleting the author keeps the comment with `author_id` null. `checks.sql` passes |
| T-24-02 | unit | R-24-02 | The shared comment schema trims the body, accepts 1 and 2000 characters, and rejects `"   "` and 2001 characters |
| T-24-03 | api | R-24-04, R-24-05 | `tom` (visitor) posts on a seeded spot: `201`, the row has `author_id` = tom. With 60 comments, `GET` returns the oldest 50 and a `nextCursor`; the next page returns 10 and no cursor. `canEdit` is true only on the user's own comments; `canDelete` is true on all of them for `sven` (owner) |
| T-24-04 | api | R-24-04, R-24-05 | Errors: empty body and 2001 characters → `400`; bad cursor → `400`; no session → `401`; a non-member and an unknown spot → `404`, for both `GET` and `POST` |
| T-24-05 | api | R-24-06 | Aiko edits her comment: `200`, `edited_at` set. Sven editing Aiko's comment → `403`. Tom deleting Aiko's comment → `403`; Sven deleting it → `204`. Aiko deleting her own → `204`. Non-member → `404`, unknown comment → `404`, no session → `401`, empty body on `PATCH` → `400` |
| T-24-06 | api | R-24-07 | After Aiko is removed from the trip her `GET` is `404`, and Sven still sees her comment with her name. After a user is deleted, the comment is returned with `author: null` |
| T-24-07 | api | R-24-08 | A spot with 2 comments has `commentCount: 2` in `GET /trips/:id/spots` and `GET /spots/:id`; a spot without comments has `0` |
| T-24-08 | api | R-24-09 | Create, edit and delete each add exactly one `activity_events` row with the matching `comment.*` action and `metadata.trip` and `metadata.spot`, and no row contains the comment text. Sven deleting Aiko's comment stores `metadata.author`. A write that fails validation adds no row |
| T-24-09 | api | R-24-10 | A second member's event stream receives exactly one `comment` event with the spot id for each of create, edit and delete |
| T-24-10 | api | R-24-11 | With a fake clock, the 21st comment within one minute is `429` with `Retry-After`; after the minute passes the next one is `201` |
| T-24-11 | unit | R-24-12 | The comment body component renders `<b>hi</b>` as text, keeps line breaks, turns `https://example.com` into a link with the required `rel` and `target`, and leaves `javascript:alert(1)` as text |
| T-24-12 | unit | R-24-17 | The admin activity text renders the three `comment.*` events in `en` and `de` with actor, spot title and trip name |
| T-24-13 | e2e | R-24-12, R-24-13, R-24-15, R-24-16 | As `tom` (visitor) on *Japan 2026*: open a spot without comments and see the empty state, write two lines and send with Ctrl + Enter; the comment appears with his name and both lines, the field clears, and the list card shows “1”. In both `en` and `de` |
| T-24-14 | e2e | R-24-13 | With the comment route failing (`500` via route interception), sending removes the optimistic comment, puts the text back in the field and shows an error toast |
| T-24-15 | e2e | R-24-14, R-24-16 | As `aiko`: edit her comment, see “edited”; delete it after the confirm. As `sven`: “Delete” shows on Tom's comment but “Edit” does not. Deleting a spot with 2 comments: the confirmation names 2 comments |
| T-24-16 | e2e | R-24-10 | With Aiko and Tom on the same board and the same spot open, Tom's comment appears in Aiko's panel and the count on her list card updates without reload |
| T-24-17 | a11y | R-24-12, R-24-13, R-24-16 | The spot panel with a thread of 3 comments and the comment field, and the list with comment counts, pass axe; the field has a label and the count icon has an accessible name |
| T-24-18 | db | R-24-18 | Deleting a spot deletes its read rows; deleting a user deletes theirs; a read row with a `spot_id` of another trip fails |
| T-24-19 | unit | R-24-19 | The unread rule: someone else's comment after `last_read_at` → unread; own comment → not; comment before `joined_at` with no read row → not; edited old comment → not |
| T-24-20 | api | R-24-19, R-24-20 | Sven reads a spot, then Aiko posts 2 comments and Tom 1: for Sven the spot has `unreadComments: 3` in `GET /trips/:id/spots` and `GET /spots/:id`, and `GET /trips` shows 3 for *Japan 2026*. For Aiko the same spot shows 1. Aiko editing an old comment does not change Sven's count |
| T-24-21 | api | R-24-21 | With unread comments on 3 spots, `GET /trips/:id/news` returns 3 entries sorted by newest comment, the right counts, a 140-character excerpt and `total`. Non-member and unknown trip `404`, no session `401` |
| T-24-22 | api | R-24-22, R-24-23 | `PUT …/read` with the newest `createdAt` → `204` and `unreadComments: 0`; a later `PUT` with an older `upTo` leaves `last_read_at` unchanged; a comment posted after `upTo` is still unread; `upTo` in the future is stored as now; `upTo: "x"` → `400`; non-member → `404`; no session → `401`. `POST /trips/:id/news/read` clears all. Neither route adds an `activity_events` row or sends a live event |
| T-24-23 | e2e | R-24-24, R-24-25, R-24-27 | Aiko posts on two spots. As `sven` the header badge shows 2; the News panel lists both spots; clicking one opens the board panel at the discussion with the “New” divider above Aiko's comment, and the badge drops to 1. “Mark all as read” empties the panel to the caught-up state. From the schedule, clicking an entry lands on the board with the spot open. In both `en` and `de` |
| T-24-24 | e2e | R-24-26, R-24-28, R-24-29 | As `sven` with an unread spot: the list card shows the accent count and the pin has a dot; the tab title starts with “(1)”. Selecting the spot with the panel scrolled so the discussion is hidden keeps it unread; scrolling the discussion into view marks it read, the card, pin and title go back to normal. My trips shows “1 new comment” before and nothing after |
| T-24-25 | e2e | R-24-30 | Sven on the board, Tom posts on another spot: Sven's badge, card and tab title update without reload. Sven with that spot's discussion open on screen: Tom's comment appears and the badge does not go up |
| T-24-26 | a11y | R-24-24, R-24-25, R-24-28 | The News panel with entries and in its empty state, and a list with unread badges, pass axe; the News button's accessible name includes the count; the panel traps focus and Escape closes it |
