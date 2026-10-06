# Step 13 — Members, roles & invites

**Goal:** share a trip via a Discord-friendly invite link; owner, planner and visitor permissions everywhere.
**Depends on:** 04 (role guard). Can be built any time after 04.

## Scope
- In: members dialog, role change, remove member, leave trip, transfer ownership, invites (create with role, default visitor, 7-day expiry, revoke), join page, expired page.
- Out: approval queue, email invites.

## Requirements
| ID | Requirement |
| --- | --- |
| R-13-01 | `POST /trips/:id/invites {role?}` (owner only). Role `planner` or `visitor`, **default visitor**. Code `XXX-XXXX` (3-letter prefix from trip name + 4 random Crockford chars); expires in 7 days |
| R-13-02 | `GET /trips/:id/invites` (owner) lists active invites with role, expiry and use count; `DELETE /invites/:id` revokes |
| R-13-03 | `GET /join/:code` (public) returns trip name, owner name, member count and role for a valid code. Expired/revoked/unknown codes → 410/404 with a reason |
| R-13-04 | `POST /join/:code` (logged in) adds the user with the invite's role. An existing member keeps their current role and is just redirected |
| R-13-05 | Join page: trip preview card + “Join trip” button. Logged out → “Continue with Discord” with `next=/join/:code` |
| R-13-06 | Members dialog: everyone sees members with avatar, name, role. Owner can change roles (planner ↔ visitor) and remove members |
| R-13-07 | Ownership transfer (owner → any member): the old owner becomes planner, one transaction, confirm dialog |
| R-13-08 | Any non-owner can leave a trip. The owner must transfer ownership before leaving |
| R-13-09 | Invite UI: role select (default Visitor), Create, copy link button (copies `https://<host>/join/CODE`), “expires in n days”, revoke |
| R-13-10 | Joining by invite is rate-limited (10 attempts/min per IP) to prevent code guessing |
| R-13-11 | Permissions across all routes follow the matrix in `docs/PROJECT_SCOPE.md` §5.6 |
| R-13-12 | `/join/:code` is served with server-rendered Open Graph tags (trip name, “Join on Trip Board”) so Discord shows a link preview. Expired codes get a generic preview without the trip name |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-13-01 | api | R-13-01 | Owner creates an invite without a role → role `visitor`, `expires_at = now + 7d`, code matches the format. Planner/visitor creating → 403 |
| T-13-02 | api | R-13-01 | `role:"owner"` → 400 |
| T-13-03 | api | R-13-03, R-13-04 | New user joins with a planner code → member with role planner, `invited_via` set, `uses` incremented |
| T-13-04 | api | R-13-03 | Fake clock + 7 days 1 minute → `GET`/`POST /join` → 410 “expired”. Revoked → 410 “revoked” |
| T-13-05 | api | R-13-04 | Existing planner joins with a visitor code → still planner |
| T-13-06 | api | R-13-06 | Owner changes aiko to visitor → aiko's next spot PATCH is 403 |
| T-13-07 | api | R-13-07 | Transfer to aiko → aiko owner, sven planner, exactly one owner row. Transfer to a non-member → 400 |
| T-13-08 | api | R-13-08 | Owner leave → 409 “transfer ownership first”; visitor leave → 204 and trip disappears from their list |
| T-13-09 | api | R-13-10 | 11th join attempt within a minute → 429 |
| T-13-10 | api | R-13-11 | Full permission matrix test: every write route × (owner, planner, visitor, non-member) returns the expected status |
| T-13-11 | e2e | R-13-05, R-13-09 | Owner creates a link (default Visitor) and copies it; a second browser context, logged out, opens it → Discord (fake) → joins → sees the board read-only |
| T-13-12 | e2e | R-13-03 | Expired link shows “This invite has expired. Ask the trip owner for a new link.” in EN and DE |
| T-13-13 | api | R-13-12 | `GET /join/JPN-7K3Q` with a bot User-Agent returns HTML with `og:title` containing the trip name; an expired code's HTML does not |
| T-13-14 | manual | R-13-09, R-13-12 | Pasting the link into Discord produces a clean link preview (Open Graph title/description of the join page) |
