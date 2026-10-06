# Step 02 — Discord auth

**Goal:** log in with Discord, stay logged in, log out.
**Depends on:** 01

## Scope
- In: Discord OAuth2 (authorization code + PKCE, scope `identify`), sessions, `/me`, login page, protected routes, `next` redirect.
- Out: trip permissions (step 04+), profile editing beyond language (step 03).

## Requirements
| ID | Requirement |
| --- | --- |
| R-02-01 | `GET /auth/discord?next=<path>` redirects to Discord with `state` and PKCE. Both are stored in a short-lived signed cookie |
| R-02-02 | `GET /auth/discord/callback` validates `state`, exchanges the code, fetches the profile, upserts `users` (refreshing username, display name, avatar, `last_login_at`) |
| R-02-03 | A session is created: random 32-byte token in an HTTP-only, Secure (prod), SameSite=Lax cookie; only its SHA-256 is stored |
| R-02-04 | Sessions last 30 days, sliding (renewed when < 15 days left) |
| R-02-05 | `next` only accepts same-origin relative paths (no open redirect); default `/trips` |
| R-02-06 | `GET /me` returns the current user or 401; `POST /auth/logout` deletes the session and clears the cookie |
| R-02-07 | Web: login page with “Continue with Discord”, a header avatar menu with logout, and redirect to login for protected pages |
| R-02-08 | OAuth errors (user cancels, Discord down) show a friendly, translated error on the login page |
| R-02-10 | Login is refused for suspended users (“Your account is suspended: <reason>”) and, when `app_settings.signups_enabled` is false, for Discord accounts without an existing user, unless the login started from a valid invite link |
| R-02-11 | Login writes a `user.login` activity event; the API updates `users.last_seen_at` at most every 5 minutes per user |
| R-02-09 | State-changing requests require the session cookie **and** an `Origin` header matching the app origin (CSRF) |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-02-01 | api | R-02-01 | Redirect URL contains client_id, `identify` scope, `state`, `code_challenge`; a state cookie is set |
| T-02-02 | api | R-02-02, R-02-03 | With the fake Discord server, the callback creates the user, sets the cookie, and stores a 64-hex session id ≠ cookie value |
| T-02-03 | api | R-02-02 | Second login with a changed Discord username updates the existing user (same `id`) |
| T-02-04 | api | R-02-01 | Callback with wrong/missing `state` returns 400 and creates no session |
| T-02-05 | api | R-02-05 | `next=https://evil.com` and `next=//evil.com` redirect to `/trips` |
| T-02-06 | api | R-02-04 | Using a fake clock, a session at day 16 is extended, one at day 31 returns 401 |
| T-02-07 | api | R-02-06 | `/me` without a cookie → 401; after logout, the old cookie → 401 |
| T-02-08 | api | R-02-09 | `POST /auth/logout` with a foreign `Origin` → 403 |
| T-02-09 | e2e | R-02-07 | Visiting `/trips` logged out lands on login; after test login it returns to `/trips` and shows the username in the header |
| T-02-10 | e2e | R-02-08 | Callback with `error=access_denied` shows the translated “Login cancelled” message |
| T-02-12 | api | R-02-10 | Suspended user's callback → no session, redirect to login with the reason. Signups off → new account refused, existing account OK, new account via `next=/join/<valid code>` OK |
| T-02-13 | api | R-02-11 | Login writes one `user.login` event; 10 requests within 5 minutes update `last_seen_at` once |
| T-02-11 | manual | all | Real Discord login works with a dev application |
