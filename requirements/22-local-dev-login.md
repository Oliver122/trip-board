# Step 22 — Local dev login

**Goal:** after `pnpm dev:local`, a developer opens `http://127.0.0.1:5180/login`, clicks “Sven (admin)” and lands in the app as a platform admin, without Discord.
**Depends on:** 02, 03, 16
**Result:** `pnpm dev:local`, click “Sven (admin)” on the login page, land in the admin area without Discord
**Core:** C-ADMIN-02, C-ADMIN-20, C-AUTH-05, C-AUTH-08, C-AUTH-14, C-AUTH-15, C-AUTH-16, C-AUTH-17, C-OPS-03, C-OPS-07, C-OPS-28, C-OPS-29
**Status:** integrated 2026-10-11

## Scope
- In: a `DEV_LOGIN` env flag, a `pnpm dev:local` script on the standard ports (web `5180`, API `4080`), `GET /auth/dev/users` and `POST /auth/dev/login` for the seeded users, a dev login block on the login page, startup and deploy guards that keep the flag off any public server, README section.
- Out: passwords or any other second login method for real users, creating new users through the dev login, changing `POST /test/login` or `pnpm dev:e2e`, running production without `pnpm dev` (follow-up from step 21).

## Current behavior
| Topic | Today |
| --- | --- |
| Local login | Only Discord OAuth (`apps/api/src/auth/routes.ts`). Locally that needs a Discord application with `http://127.0.0.1:5180/api/auth/discord/callback` as redirect URI and real `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` in `.env` |
| Session without Discord | `POST /test/login {discordId}` exists only when `NODE_ENV=test` (`pnpm dev:e2e` through `scripts/dev-api-test.mjs`). It has no UI, and test mode also changes rate limits (`apps/api/src/app.ts`), so it is not a normal dev setup |
| `NODE_ENV` on the server | `scripts/deploy.sh` starts the server with `pnpm dev` under systemd and never writes `NODE_ENV` into `.env`. `apps/api/src/config.ts` defaults it to `development`. So the production server also runs with `NODE_ENV=development`, and `NODE_ENV` alone cannot decide whether the dev login is safe |
| Admin | `pnpm db:seed` creates `sven` (Discord id `100000000000000001`) with `app_role = admin` (`apps/api/src/db/seed.ts`) |

## Requirements

### Switch and guards
| ID | Requirement |
| --- | --- |
| R-22-01 | The API reads `DEV_LOGIN` (`0` or `1`, default `0`). The dev login routes (R-22-04, R-22-05) exist only when `DEV_LOGIN=1`; otherwise they return `404` like any unknown route |
| R-22-02 | With `DEV_LOGIN=1` the API refuses to start, naming `DEV_LOGIN` in the error, when `NODE_ENV` is `production`, or when the hostname of `WEB_ORIGIN` is not `127.0.0.1`, `localhost` or `[::1]`. A server with a public `WEB_ORIGIN` therefore cannot run it, even under `pnpm dev` |
| R-22-03 | `scripts/deploy.sh` never writes `DEV_LOGIN` to the server `.env`. When the server `.env` already has `DEV_LOGIN=1`, the script stops before restarting the service and names the key. `.env.example` lists `DEV_LOGIN=0` with a one-line warning |

### API
| ID | Requirement |
| --- | --- |
| R-22-04 | `GET /auth/dev/users` returns the seeded users that exist in the database (`sven`, `aiko`, `tom`) as `{users: [{discordId, username, displayName, appRole}]}`, in that order. No session is needed |
| R-22-05 | `POST /auth/dev/login {discordId}` logs in as an existing user: same session cookie, 30-day sliding session and `last_login_at` update as the Discord callback (R-02-03, R-02-04). It returns the `/me` body. A `discordId` that does not match `^[0-9]{5,25}$` is `400`. An unknown `discordId` is `404`; the route never creates a user. A suspended user is `403` with the reason (R-02-10). A missing or foreign `Origin` is `403` (R-02-09) |
| R-22-06 | A dev login writes one `user.login` activity event in the same transaction as the session, so the admin activity feed and dashboard look the same as after a Discord login |
| R-22-07 | `ADMIN_DISCORD_IDS` promotion applies to a dev login the same way as to a Discord login |

### Web and scripts
| ID | Requirement |
| --- | --- |
| R-22-08 | `pnpm dev:local` starts web and API with `DEV_LOGIN=1` on the standard ports (`WEB_PORT` / `API_PORT` from `.env`, defaults `5180` / `4080`) and `NODE_ENV=development`. `pnpm dev` keeps working without the dev login |
| R-22-09 | When `GET /api/auth/dev/users` answers `200`, the login page shows a “Dev login” block under “Continue with Discord” with one button per user (display name plus “admin” for `appRole = admin`). A click logs in and follows `next` like the Discord login (R-02-05). When the route answers `404`, the block is not rendered and the page looks as today |
| R-22-10 | While `DEV_LOGIN=1`, the app header shows a small “Dev login” badge, so a screenshot or screen share never looks like production |
| R-22-11 | The README explains `pnpm dev:local`, which users it offers, that Discord settings are not needed for it, and why the flag refuses public origins |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-22-01 | api | R-22-01 | With `DEV_LOGIN=0` (and with it unset), `GET /auth/dev/users` and `POST /auth/dev/login` return `404` and no `sessions` row is created |
| T-22-02 | unit | R-22-02 | `loadConfig` with `DEV_LOGIN=1` throws an error naming `DEV_LOGIN` for `NODE_ENV=production`, for `WEB_ORIGIN=https://trip.example.com`, and for `WEB_ORIGIN=http://192.168.1.5:5180`; it succeeds for `http://127.0.0.1:5180`, `http://localhost:5180` and `http://[::1]:5180` |
| T-22-03 | unit | R-22-03 | Running the `.env` merge step of `scripts/deploy.sh` with `DEV_LOGIN=1` in the deploy env leaves `DEV_LOGIN` out of the written `.env`. A server `.env` containing `DEV_LOGIN=1` makes the script exit non-zero with a message naming `DEV_LOGIN`, before `systemctl restart` |
| T-22-04 | api | R-22-04 | On the seeded database with `DEV_LOGIN=1`, `GET /auth/dev/users` without a cookie returns `sven`, `aiko`, `tom` in that order, and `sven` has `appRole: "admin"` |
| T-22-05 | api | R-22-05, R-22-06 | `POST /auth/dev/login {discordId: "100000000000000001"}` with the app `Origin` returns `200` with Sven’s `/me` body and a session cookie; the `sessions` row stores the SHA-256 of the cookie value; `users.last_login_at` is updated; exactly one `user.login` row for Sven is added to `activity_events`. `GET /admin/users` with that cookie returns `200` |
| T-22-06 | api | R-22-05 | `discordId: "abc"` → `400`; an unknown `discordId` → `404` and the `users` count is unchanged; a suspended user → `403` with the reason and no session; no `Origin` or a foreign `Origin` → `403` |
| T-22-07 | api | R-22-07 | With `ADMIN_DISCORD_IDS` containing Tom’s Discord id, a dev login as `tom` returns `appRole: "admin"` |
| T-22-08 | e2e | R-22-08, R-22-09, R-22-10 | API started with `DEV_LOGIN=1`: visiting `/admin` logged out lands on login; the “Dev login” block lists Sven, Aiko and Tom; clicking “Sven (admin)” returns to `/admin`, the admin page renders, and the header shows the “Dev login” badge. In both `en` and `de` |
| T-22-09 | e2e | R-22-09 | API started without `DEV_LOGIN`: the login page has no “Dev login” block and only “Continue with Discord” |
| T-22-10 | manual | R-22-08, R-22-11 | On a fresh clone, following only the README (`cp .env.example .env`, `docker compose up -d`, `pnpm install`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev:local`) with no Discord settings, a developer logs in as Sven at `http://127.0.0.1:5180/login` and opens the admin area |
