# Core — Discussions

Spot comments (the "Discussion" thread in the spot panel) and the News feature that tells each member which spots have comments they have not read yet. Every trip member, visitors included, can read and write comments. It touches [spots](./spots.md) (comment counts on cards, the panel, the delete confirm), [list](./list.md) (list cards and pins show unread state), [home](./home.md) (My trips cards show the unread total), [members](./members.md) (access and removal), [live](./live.md) (comment events refresh threads and counts) and [admin](./admin.md) (comment events in the activity feed).

## Data and rules

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-DISC-01 | A comment always belongs to a spot of its own trip and is deleted with that spot or trip, while deleting its author keeps the comment with `author` null (shown as "Former member"); the tables and the `comment` activity actions are documented in `docs/database/DATABASE.md`. <!-- R-24-01, R-24-03, R-24-07 --> | active | 24 | — | T-24-01, T-24-06 |
| C-DISC-02 | A comment body is trimmed, 1 to 2000 characters of plain text with line breaks; the limit lives in `packages/shared` and is enforced by the shared schema and a database `CHECK`. <!-- R-24-02 --> | active | 24 | — | T-24-01, T-24-02 |
| C-DISC-03 | A member who was removed from the trip or left it gets 404 on the thread, but their earlier comments stay and still show their name. <!-- R-24-07 --> | active | 24 | — | T-24-06 |
| C-DISC-04 | Creating, editing and deleting a comment each record one `comment.create`, `comment.update` or `comment.delete` activity event in the same transaction with `metadata {trip, spot}` (names only, never the comment text), and an owner deleting someone else's comment also stores `metadata.author`. <!-- R-24-09 --> | active | 24 | — | T-24-08 |
| C-DISC-05 | `POST /spots/:id/comments` allows at most 20 comments per user per minute; the next one is 429 with `Retry-After`, on top of the global limit. <!-- R-24-11 --> | active | 24 | — | T-24-10 |

## API

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-DISC-06 | `GET /spots/:id/comments?cursor=` (any member) returns comments oldest first, 50 per page with `nextCursor`, each with `id`, `body`, `createdAt`, `editedAt`, `author {id, displayName, avatarUrl}` (or null) and `canEdit` / `canDelete` for the caller; a non-member or unknown spot is 404, no session 401 and a bad cursor 400. <!-- R-24-04 --> | active | 24 | — | T-24-03, T-24-04 |
| C-DISC-07 | `POST /spots/:id/comments {body}` (any member, visitors included) creates a comment as the current user and returns 201 with it; an empty or too long body is 400, a non-member or unknown spot 404, no session 401. <!-- R-24-05 --> | active | 24 | — | T-24-03, T-24-04 |
| C-DISC-08 | `PATCH /comments/:id {body}` changes the body and sets `edited_at` for the author only (anyone else, the owner included, gets 403), and `DELETE /comments/:id` (204) is allowed for the author and the trip owner; a planner, visitor or board admin deleting someone else's comment is 403. <!-- R-24-06 --> | active | 24 | — | T-24-05 |
| C-DISC-09 | `GET /trips/:id/spots` and `GET /spots/:id` return `commentCount` and the caller's `unreadComments` per spot, and `GET /trips` returns `unreadComments` summed per trip. <!-- R-24-08, R-24-20 --> | active | 24 | — | T-24-07, T-24-20 |
| C-DISC-10 | Each comment write sends one live notification `{resource: "comment", id: <spot id>, action}` so members with the thread open refetch it and every member's counts update. <!-- R-24-10 --> | active | 24 | — | T-24-09, T-24-16 |

## Unread and News

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-DISC-11 | A comment is unread for a member when someone else wrote it after the member's `last_read_at` for the spot (stored in `spot_comment_reads`) and after their `joined_at`; editing a comment does not make it unread again and a new member does not start with old comments unread. <!-- R-24-18, R-24-19 --> | active | 24 | — | T-24-18, T-24-19, T-24-20 |
| C-DISC-12 | `GET /trips/:id/news` (any member) returns up to 50 spots with unread comments, newest comment first, each with spot id, title, `displayCategory`, `unreadComments` and the newest unread comment's author, `createdAt` and first 140 characters, plus `total` for the whole trip; a non-member or unknown trip is 404, no session 401. <!-- R-24-21 --> | active | 24 | — | T-24-21 |
| C-DISC-13 | `PUT /spots/:id/comments/read {upTo}` sets `last_read_at` to `upTo` (never backwards, never past now) and `POST /trips/:id/news/read` marks every spot of the trip read; both return 204, a bad `upTo` is 400, and neither records an activity event nor a live notification (an intended exception to G-10). <!-- R-24-22, R-24-23 --> | active | 24 | — | T-24-22 |

## Spot panel and list

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-DISC-14 | The spot panel shows a "Discussion" section for every role in view and edit mode (hidden in add mode), with avatar, name, relative time (full date on hover), "edited", line breaks kept, `http(s)` URLs as links with `rel="noopener noreferrer nofollow"` in a new tab and everything else as text; more than 50 comments load with "Show older", and an empty thread invites the first comment. <!-- R-24-12, R-24-15 --> | active | 24 | — | T-24-11, T-24-13, T-24-17 |
| C-DISC-15 | Below the thread is a text field with a "Send" button (Ctrl/Cmd + Enter also sends, Enter adds a line) that is disabled while empty or over the limit, shows a counter from 1800 characters, adds the comment at once and, on failure, removes it, restores the text and shows an error toast. <!-- R-24-13 --> | active | 24 | — | T-24-13, T-24-14 |
| C-DISC-16 | The author sees "Edit" (inline text field with Save and Cancel) and "Delete" (with a confirm) on their own comments, and the owner sees "Delete" on all comments. <!-- R-24-14 --> | active | 24 | — | T-24-15 |
| C-DISC-17 | A list card with comments shows a speech-bubble icon with the count and an accessible label such as "3 comments", and deleting a spot names how many comments will be deleted with it. <!-- R-24-16 --> | active | 24 | — | T-24-13, T-24-15, T-24-17 |
| C-DISC-18 | In the admin activity feed the three `comment.*` events read as "aiko commented on Fushimi Inari in Japan 2026" (and the edited / deleted variants) in English and German, and the action filter offers them. <!-- R-24-17 --> | active | 24 | — | T-24-12 |

## News UI and unread indicators

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-DISC-19 | The trip header (board and schedule) has a "News" bell button with a badge of the trip's unread total (`99+` above 99, none at 0) and an accessible name that includes the count, such as "News, 3 unread". <!-- R-24-24 --> | active | 24 | — | T-24-23, T-24-26 |
| C-DISC-20 | The News panel lists the unread spots with category color, "2 new", author, relative time and excerpt; clicking an entry goes to the board, selects the spot and opens its panel at the discussion, "Mark all as read" calls `POST /trips/:id/news/read`, and nothing unread shows "You're all caught up". <!-- R-24-25 --> | active | 24 | — | T-24-23, T-24-26 |
| C-DISC-21 | A thread is marked read only once its discussion section has been visible on screen (`IntersectionObserver`), not merely by selecting the spot, and a comment arriving live while it is visible is marked read at once. <!-- R-24-26 --> | active | 24 | — | T-24-24, T-24-25 |
| C-DISC-22 | When a thread with unread comments opens, a "New" divider sits above the first unread comment and stays until the panel closes. <!-- R-24-27 --> | active | 24 | — | T-24-23 |
| C-DISC-23 | A list card with unread comments shows its comment icon filled in the accent color with the unread count and the map pin gets a small dot; cards with only read comments keep the plain count. <!-- R-24-28 --> | active | 24 | — | T-24-24, T-24-26 |
| C-DISC-24 | A My trips card with unread comments shows "3 new comments", and while a trip is open the browser tab title starts with the unread total ("(3) Japan 2026 · Tripboard") and returns to the plain title at 0. <!-- R-24-29 --> | active | 24 | — | T-24-24, T-24-25 |
| C-DISC-25 | On a live `comment` event the badge, News panel, list cards, pins and tab title refresh their unread counts without reload, and marking read in one tab updates the user's other tabs on their next refetch or `resync`. <!-- R-24-30 --> | active | 24 | — | T-24-25 |

## Known gaps

- C-DISC-24: no test proves the "3 new comments" text on a My trips card (R-24-29); only the tab title is covered by T-24-24 and T-24-25.
- C-DISC-25: the "other tabs update on next refetch or resync" half of R-24-30 has no test.
- C-DISC-08: R-24-06 and the tests name only the owner as deleter; board admins (step 28) are not covered by any comment test and the code gives them no delete right (`apps/api/src/comments/store.ts`).
