# Core — Auth

How people log in and stay logged in: Discord OAuth with PKCE, the session cookie, `GET /me`, logout, the CSRF origin check, suspended users and closed signups, the dev login for local work and the test login used by the test suites. The login page and the header avatar menu live in [app](./app.md); the user profile language is in [app](./app.md); admin suspension and the signup switch are managed in [admin](./admin.md); invite links that let a new person in while signups are closed are in [members](./members.md).

## Discord login

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-AUTH-01 | `GET /auth/discord?next=<path>` redirects (302) to Discord's authorize URL with scope `identify`, a random `state` and a PKCE `code_challenge`. `state`, the PKCE verifier, `next` and a 10-minute expiry are stored in a signed, HTTP-only `tb_oauth` cookie. <!-- R-02-01 --> | active | 02 | — | T-02-01 |
| C-AUTH-02 | `next` only accepts a same-origin relative path (it must start with `/`), otherwise the login falls back to `/trips`. `//host`, `https://…`, backslashes, NUL and line breaks are all refused. <!-- R-02-05 --> | active | 02 | — | T-02-05 |
| C-AUTH-03 | `GET /auth/discord/callback` checks the `state` against the signed cookie, exchanges the code, fetches the Discord profile and upserts the `users` row (username, display name, avatar, `last_login_at`), then redirects (302) to `WEB_ORIGIN` + `next` with the session cookie. A missing, forged, mismatched or expired state is `400` and creates no session. <!-- R-02-02, R-02-03 --> | active | 02 | — | T-02-02, T-02-03, T-02-04 |
| C-AUTH-04 | A Discord error on the callback redirects to `/login?error=…`: `access_denied` when the user cancelled, `discord_unavailable` for any other `error` parameter or when the Discord requests fail. The login page shows a translated message for `access_denied`, `suspended` (with the reason, cut at 500 characters), `signups_disabled`, `discord_unavailable` and a generic one for anything else. <!-- R-02-08, R-02-10 --> | active | 02 | — | T-02-10, T-02-12 |
| C-AUTH-05 | Users whose Discord id is listed in `ADMIN_DISCORD_IDS` get `app_role = admin` on every login (Discord and dev login). Removing an id from the env does not demote anyone. <!-- R-16-02, R-22-07 --> | active | 16 | 22 | T-16-02, T-22-07 |
| C-AUTH-06 | A suspended user cannot log in: the callback redirects to `/login?error=suspended&reason=…`, no session is created, and existing sessions of that user stop working. Their profile fields still refresh. <!-- R-02-10 --> | active | 02 | — | T-02-12 |
| C-AUTH-07 | With `app_settings.signups_enabled` false, a Discord account that does not exist yet is refused (`/login?error=signups_disabled`), unless its Discord id is in `ADMIN_DISCORD_IDS` or the login started from `/join/<code>` with an invite that is not revoked and not expired. Existing accounts log in as usual. <!-- R-02-10 --> | active | 02 | — | T-02-12 |
| C-AUTH-08 | Every login writes one `user.login` activity event in the same transaction as the session, and the API updates `users.last_seen_at` at most once every 5 minutes per user. <!-- R-02-11, R-22-06 --> | active | 02 | 22 | T-02-13, T-22-05 |

## Sessions

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-AUTH-09 | A session is a random 32-byte token in the `tb_session` cookie (HTTP-only, SameSite=Lax, Secure in production, `Max-Age` 30 days); only its SHA-256 hex is stored as `sessions.id`, together with the user agent (500 characters at most). <!-- R-02-03 --> | active | 02 | — | T-02-02 |
| C-AUTH-10 | Sessions last 30 days and slide: a request with less than 15 days left renews the expiry and resets the cookie. An expired session, or one of a suspended user, is deleted and answers `401`. <!-- R-02-04 --> | active | 02 | — | T-02-06 |
| C-AUTH-11 | `GET /me` returns the current user (`id`, `discordId`, `username`, `displayName`, `avatarUrl`, `locale`, `appRole`), or `401 unauthenticated` without a valid session. <!-- R-02-06 --> | active | 02 | — | T-02-07 |
| C-AUTH-12 | `POST /auth/logout` deletes the session row, clears the cookie, closes the user's open live streams for that session and answers `204`; without a valid session it still clears the cookie and answers `401`. <!-- R-02-06, R-19-06 --> | active | 02 | 19 | T-02-07, T-19-04 |
| C-AUTH-13 | Every state-changing API route (`POST`, `PATCH`, `PUT`, `DELETE`) needs the session cookie and an `Origin` header equal to `WEB_ORIGIN`; a foreign or missing origin is `403 forbidden_origin`. <!-- R-02-09 --> | active | 02 | — | T-02-08 |

## Dev login and test login

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-AUTH-14 | The dev login routes exist only when `DEV_LOGIN=1` (default `0`); otherwise `GET /auth/dev/users` and `POST /auth/dev/login` are `404` like any unknown route. With `DEV_LOGIN=1` the API refuses to start, naming `DEV_LOGIN`, when `NODE_ENV` is `production` or the host of `WEB_ORIGIN` is not `127.0.0.1`, `localhost` or `[::1]`. <!-- R-22-01, R-22-02 --> | active | 22 | — | T-22-01, T-22-02 |
| C-AUTH-15 | `GET /auth/dev/users` needs no session and returns the seeded users that exist (`sven`, `aiko`, `tom`, in that order) as `{users: [{discordId, username, displayName, appRole}]}`. <!-- R-22-04 --> | active | 22 | — | T-22-04 |
| C-AUTH-16 | `POST /auth/dev/login {discordId}` (Origin required) logs in as an existing user with the same session, sliding expiry and `last_login_at` update as the Discord login, and returns the `/me` body. A `discordId` that does not match `^[0-9]{5,25}$` is `400`, an unknown one `404` (it never creates a user), a suspended user `403` with the reason. <!-- R-22-05 --> | active | 22 | — | T-22-05, T-22-06 |
| C-AUTH-17 | The login page shows a “Dev login” block under “Continue with Discord” when `GET /api/auth/dev/users` answers `200`: one button per user (display name, plus an “admin” marker for admins) that logs in and follows `next`. On `404` the block is not rendered, and while the endpoint answers `200` the header shows a small “Dev login” badge. <!-- R-22-09, R-22-10 --> | active | 22 | — | T-22-08, T-22-09 |
| C-AUTH-18 | `POST /test/login {discordId}` exists only when `NODE_ENV=test`: with the app `Origin` it creates the user if missing and a session directly, answers with the `/me` body (`403` for a suspended user), and has no UI. The API and e2e suites use it to sign in without Discord. <!-- R-02-03, R-02-07 --> | active | 02 | — | T-02-09 |

## Known gaps

- C-AUTH-07: R-28-18 says an invite is valid only while `used_at IS NULL`, but the signups-closed check in `apps/api/src/auth/login.ts` (`signupAllowed`) only tests `revoked_at` and `expires_at`, so a used invite still lets a new account in while signups are off; the rule describes the code.
- C-AUTH-04: R-02-08 is covered for cancelled logins only; no test checks the `discord_unavailable` or `signups_disabled` messages on the login page.
- C-AUTH-18: no R-row defines `/test/login`; it is described in `README.md` and the step 22 current-behavior table only, and no test asserts its own contract (the suites only use it as a fixture).
