# Core — Members

Who belongs to a trip and what they may do: the four trip roles (owner, board admin, planner, visitor), the role guard every trip route uses, the Members dialog, ownership transfer and leaving, single-use invite links with their join page and Discord link preview, and the member avatars in the header and on trip cards. It touches [trips](./trips.md) (membership is created with the trip), [kinds](./kinds.md) (board admins manage spot kinds), [live](./live.md) (member changes are pushed to open boards) and [auth](./auth.md) (joining needs a login).

## Roles and the guard

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-MEMB-01 | `requireTripRole(min)` guards every trip-scoped route with the order visitor < planner < board admin < owner; a non-member gets 404 (never 403) so the trip's existence is not revealed, and a member below the minimum gets 403. <!-- R-04-05, R-26-09, R-28-01 --> | active | 04 | 26, 28 | T-04-07, T-28-01 |
| C-MEMB-02 | A board admin (`trip_role` value `admin`) can do everything a planner can plus manage the trip's spot kinds, while members, invites and ownership transfer stay owner only. <!-- R-28-01, R-28-02 --> | active | 28 | — | T-28-02 |
| C-MEMB-03 | Permissions on all routes follow the matrix in `docs/PROJECT_SCOPE.md` §5.6 (owner, board admin, planner, visitor, non-member), so every write route returns the same status for the same role. <!-- R-13-11, R-28-02 --> | active | 13 | 28 | T-13-10, T-28-02 |
| C-MEMB-04 | Stored role strings are read through one `parseTripRole`; an unknown stored role is treated as a data error and falls back to `visitor` (least privilege) only at the one call site that needs a fallback (`roleOrVisitor`). <!-- R-26-09 --> | active | 26 | — | — |

## Members

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-MEMB-05 | `GET /trips/:id/members` (any member) lists the trip's members with user id, name, avatar URL and role, ordered owner, board admin, planner, then visitor. <!-- R-13-06, R-28-02 --> | active | 13 | 28 | T-13-11, T-20-13 |
| C-MEMB-06 | `PATCH /trips/:id/members/:userId {role}` (owner only) sets a member's role to `admin`, `planner` or `visitor`, records `member.role_update` and takes effect on the member's next request; the owner's own role cannot be set this way (400). <!-- R-13-06, R-28-02 --> | active | 13 | 28 | T-13-06, T-28-02, T-28-12 |
| C-MEMB-07 | `DELETE /trips/:id/members/:userId` (owner only) removes a member with 204 and records `member.remove`; trying to remove the owner is 409 "transfer ownership first". <!-- R-13-06, R-13-08 --> | active | 13 | — | T-20-14 |
| C-MEMB-08 | `POST /trips/:id/leave` lets any non-owner leave with 204 so the trip disappears from their list, while the owner gets 409 "transfer ownership first" and must transfer ownership before leaving. <!-- R-13-08 --> | active | 13 | — | T-13-08 |
| C-MEMB-09 | `POST /trips/:id/transfer {userId}` (owner only) makes an existing member the owner and turns the old owner into a planner in one transaction, leaving exactly one owner; a target who is not a member or is already the owner is 400. <!-- R-13-07, R-28-02 --> | active | 13 | 28 | T-13-07 |
| C-MEMB-10 | Removing a member or leaving sends a `member` live event to the others and closes the removed user's event stream; a removed member can no longer read the trip (404) but their comments and other content stay. <!-- R-13-06, R-19-04, R-24-07 --> | active | 13 | 19, 24 | T-19-03, T-24-06 |

## Invites and joining

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-MEMB-11 | `POST /trips/:id/invites {role?}` (owner only) creates an invite and returns 201 with the code `XXX-XXXX` (3 letters from the trip name plus 4 random Crockford characters) that expires in 7 days; the role is `planner` or `visitor` (default `visitor`) and `owner` or `admin` is 400. <!-- R-13-01, R-28-02 --> | active | 13 | 28 | T-13-01, T-13-02, T-28-02 |
| C-MEMB-12 | `GET /trips/:id/invites` (owner only) lists only invites that are unused, not revoked and not expired, with id, code, role and expiry, and `DELETE /invites/:id` (owner only) revokes one with 204. <!-- R-13-02, R-28-20 --> | active | 13 | 28 | T-28-25 |
| C-MEMB-13 | Invites are single-use: a join that adds a new member sets `used_at` and `used_by` in the same transaction as the membership row under a row lock, so two people joining at once cannot both get in, and the used invite leaves the owner's list live. <!-- R-28-18, R-28-20 --> | active | 28 | — | T-28-21, T-28-22, T-28-24, T-28-25 |
| C-MEMB-14 | `GET /join/:code` (public) returns the trip name, owner name, member count and the invite's role for a valid code; an unknown code is 404 and an expired, revoked or used code is 410 with the reason `expired`, `revoked` or `used`. <!-- R-13-03, R-28-18, R-28-19 --> | active | 13 | 28 | T-13-04, T-28-21, T-28-23 |
| C-MEMB-15 | `POST /join/:code` (logged in) adds the user with the invite's role, records `member.join`, sets `invited_via` and returns the trip id; an existing member keeps their role, is just redirected and does not use the code up. <!-- R-13-04, R-28-19 --> | active | 13 | 28 | T-13-03, T-13-05, T-28-23 |
| C-MEMB-16 | Both `GET` and `POST /join/:code` are rate-limited to 10 attempts per minute per IP (429) to stop code guessing. <!-- R-13-10 --> | active | 13 | — | T-13-09 |
| C-MEMB-17 | `GET /join/:code` called by a link-preview bot (by user agent) returns server-rendered HTML with Open Graph tags naming the trip, and expired, revoked, used or unknown codes get a generic preview without the trip name. <!-- R-13-12, R-28-19 --> | active | 13 | 28 | T-13-13, T-28-23 |
| C-MEMB-18 | The join page shows a trip preview card with a "Join trip" button, offers "Continue with Discord" with `next=/join/:code` when logged out, and shows the expired or "already used" message (en and de) for dead codes. <!-- R-13-05, R-13-03, R-28-19 --> | active | 13 | 28 | T-13-11, T-13-12, T-28-25 |

## Dialog and avatars

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-MEMB-19 | The Members dialog shows every member with avatar, name and role ("Board admin" for `admin`), and lets the owner change roles, remove members (danger button) and transfer ownership after a confirm, while other members can leave the trip. <!-- R-13-06, R-13-07, R-13-08, R-28-02 --> | active | 13 | 28 | T-28-12, T-13-11 |
| C-MEMB-20 | The invite section of the Members dialog has a role select (default Visitor), a Create button, a copy button that copies `https://<host>/join/CODE`, "expires in n days", revoke, and the note "Each link works for one person". <!-- R-13-09, R-28-20 --> | active | 13 | 28 | T-13-11, T-28-25 |
| C-MEMB-21 | Inside a trip the header shows the members as overlapping 32 px round avatars, at most 4 circles (3 avatars plus `+N` above 4 members), as one button that opens the Members dialog and whose accessible name lists who is on the trip; it is empty outside a trip. <!-- R-20-17, R-20-18, R-20-19, R-20-20, R-20-21, R-20-23 --> | active | 20 | — | T-20-12, T-20-13 |
| C-MEMB-22 | My trips cards show the same `MemberAvatars` component with the same maximum, and the header group updates without reload when members join, leave or are removed. <!-- R-04-06, R-20-22, R-20-23 --> | active | 04 | 20 | T-20-12, T-20-14 |

## Known gaps

- C-MEMB-04: no test proves the `parseTripRole` / `roleOrVisitor` fallback (R-26-09).
- C-MEMB-13: R-13-02 asks for a use count in the invite list; step 28 replaced `uses` with `used_at`, so the code lists no use count (`packages/shared/src/members.ts` `inviteSchema`); the rule describes the code.
- C-MEMB-15: expired or revoked codes are checked before the existing-member shortcut, so an existing member opening an expired code gets 410 instead of a redirect (`apps/api/src/members/store.ts` `joinTrip`); R-28-19 only promises the redirect for used and unused codes.
- C-MEMB-17: T-13-14 (real Discord preview) is manual and has no report yet; the Open Graph HTML is only proven by the api tests.
