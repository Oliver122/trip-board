# Trip Board

A shared, map-first travel planner: create a trip scoped to a region (e.g. _Japan 2026_), pin spots on an OpenStreetMap-based map, sort them into categories, schedule them into time buckets or single dates, and invite friends via Discord.

**Status:** steps 00–10 are in place (repo, database, Discord auth, app shell, trips, map board, spots API and geocoding, spot panel and list, image uploads and quotas, search, filter, and sort, planning API).

Visual source: [Figma — Untitled](https://www.figma.com/design/hk3ksysV5sSUlMddhU0SME/Untitled?node-id=0-1&m=dev).

| Document                                                     | Contents                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [`docs/PROJECT_SCOPE.md`](docs/PROJECT_SCOPE.md)             | Decisions, stack, repo structure, features (incl. admin area), API sketch |
| [`docs/DESIGN.md`](docs/DESIGN.md)                           | Visual direction, wireframes, flow diagrams                               |
| [`docs/STITCH_DESIGN_GUIDE.md`](docs/STITCH_DESIGN_GUIDE.md) | Prompts to paste into Stitch, plus a review checklist                     |
| [`docs/database/`](docs/database/DATABASE.md)                | Database design, reference `schema.sql`, `checks.sql`                     |
| [`requirements/`](requirements/README.md)                    | 18 build steps, each with a test-based Definition of Done                 |

Planned stack: React + TypeScript (Vite, Tailwind, shadcn/ui, MapLibre), Node.js (Fastify), PostgreSQL 16 (Drizzle), Discord OAuth2.

## Prerequisites

- Node.js 22 or newer
- pnpm 10 (`corepack enable` then `corepack prepare pnpm@10.15.1 --activate`)
- Docker, for Postgres 16 and MinIO

## Setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The web app listens on `WEB_PORT` (default **5180**) and the API on `API_PORT` (default **4080**). The browser talks only to the web origin; Vite proxies `/api/*` to the API, so `/api/health` hits `GET /health`.

`GET /health` returns `{ "status": "ok", "db": "ok" }` when Postgres answers, and `503` with `"db": "down"` when it does not. The API exits on startup if `DATABASE_URL` is missing. In production it also exits if `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `AUTH_SECRET`, or `WEB_ORIGIN` is missing. Outside production those Discord settings fall back to local placeholders so the API still boots.

## Auth

Log in at `/login`. The API uses Discord's authorization code flow with PKCE (`identify`). It keeps `state` and the code verifier in a short-lived signed cookie, then stores only the SHA-256 of the session token. Sessions last 30 days and are extended when fewer than 15 days remain. `GET /me` returns the current user; `POST /auth/logout` deletes the session. State-changing requests must send an `Origin` header equal to `WEB_ORIGIN`.

`PATCH /me` with `{ "locale": "en" | "de" }` stores the profile language. The shell reads that locale first, then the browser language, then English. The header language switch updates the UI immediately and, when you are logged in, saves the profile. Theme (`system`, `light`, or `dark`) is stored in `localStorage` under `theme` and toggles the `dark` class on `<html>`.

Suspended users are sent back to the login page with the suspension reason. When signups are disabled, a Discord account that is not already a user is refused unless `next` is a valid `/join/<code>` invite. Discord ids listed in `ADMIN_DISCORD_IDS` are promoted to admin on login.

Register `{WEB_ORIGIN}/api/auth/discord/callback` as the redirect URI on the Discord application. `POST /test/login` with `{ "discordId" }` exists only when `NODE_ENV=test`. Playwright starts the API in that mode (`pnpm dev:e2e`).

## Map

`/trips/:id` is the board: a MapLibre map on [OpenFreeMap](https://openfreemap.org/) vector tiles (no API key), with a 360 px list column at desktop width. The first view fits the trip’s bounding box. Panning stays inside that box plus a 50% margin. The center and zoom are stored in the URL hash (`#zoom/lat/lng`), so a reload keeps the view. Place labels use `name:de` or `name:en` when the tiles have them, otherwise the local name. The light and dark map styles follow the `dark` class on `<html>`. Pins and the “Things to do” list come from the trip’s spots. The list starts filtered to the current map view; turning off “Only visible on map” shows every spot. Planners add a spot from an address search or by clicking the map, then edit or delete it in the side panel. Visitors get the same panel with read-only fields.

## Trips

Signed-in users open **My trips** at `/trips`. `POST /trips` creates a trip and an owner membership in one transaction and writes a `trip.create` activity event in that same transaction. `GET /trips/:id` is 404 for anyone who is not a member. Planners and owners can change the name, dates, and region box; only the owner can delete the trip. Delete cascades spots, plans, and members, and the image trigger queues blob keys in `blob_deletions`.

The create dialog searches a small built-in region list (Japan → `Asia/Tokyo`) and shows the browser timezone until a region is chosen. State-changing trip requests must send an `Origin` header equal to `WEB_ORIGIN`, same as logout.

## Images and quotas

Planners upload one photo at a time with `POST /spots/:id/images` (multipart field `file`). JPEG, PNG, WebP, and HEIC are accepted only when the bytes match that type, and only when the file is at most 10 MB. The API rotates the image, strips EXIF and GPS, resizes the longest side to 2048 px, and stores WebP at quality 80 in MinIO under `trips/<tripId>/spots/<spotId>/<uuid>.webp`. The database row is written after the upload; if that insert fails, the object is deleted.

Quota uses `user_quota_usage` (a per-user override, or the platform default of 100 images and 200 MB). The check runs in a transaction that locks the user row, so two uploads at once cannot both take the last slot. A miss is `413` with the current usage. `GET /me/quota` returns `{usedImages, maxImages, usedBytes, maxBytes}`. Members load a spot’s photos from `GET /spots/:id/images` and `GET /images/:id`. Those responses carry a signed `/images/:id/file` URL that lasts 10 minutes. `DELETE /images/:id` removes the row; the database trigger queues the blob, and a worker drains `blob_deletions` once a minute, backing off after each failure. More than 30 uploads from one user in a minute returns `429`. When `app_settings.uploads_enabled` is false, uploads return `503` with “Uploads are paused”.

The spot panel shows thumbnails, a drop zone, upload progress, a lightbox, and the quota line. A full quota disables the drop zone with “Image limit reached”. The account page shows the same usage as a progress bar.

## Search, filter, and sort

The list toolbar searches, filters, and sorts the same spots the map draws. Search waits 250 ms, then matches title, address, and info without regard to case (`ÖFFNET` matches `öffnet`). `%` and `_` are literal characters. Filters are category (more than one), scheduled or not, and who added the spot. “Only visible on map” stays on unless the URL says `visible=0`. The default sort is scheduled first: spots with a visit time, a “Not scheduled yet” divider, then the rest by category (must go, maybe, home) and title. Other sorts are `datetime`, `category`, `az`, and `newest`. An unknown `sort` is `400`.

The view is the query string `?q=&cat=&status=&by=&sort=&visible=`. Active filters show as chips; Reset clears them. The count reads “6 spots”, or “2 of 6 spots” while a filter is on. When nothing matches, the list says “No spots match your filters”. `GET /trips/:id/spots` accepts those parameters (except `visible`, which follows the map) and returns `{spots, total}` in that order, which is also what export will use.

## Spots and geocoding

Planners and owners create spots with `POST /trips/:id/spots` (`title`, `lat`, `lng`, `baseCategory` of `must_go`, `maybe`, or `home`, plus optional `address`, `info`, and an `http(s)` `link`). `planned` is rejected: the API returns `400` with `fields.baseCategory = planned_automatic`, because that status is computed from plan links. Visitors can read `GET /trips/:id/spots` and `GET /spots/:id`. Those responses come from `spots_view`, so `displayCategory` starts equal to the chosen category and `createdBy` is `{id, name, avatar}`. `GET /spots/:id` also includes `plans`: each entry the spot is in, with `linkId`, `entryId`, `title`, `type`, `visitDate`, and `visitTime`. `PATCH /spots/:id` and `DELETE /spots/:id` are planner-or-owner. Someone who is not a member of the spot's trip gets `404`. Each create, update, and delete writes `spot.create`, `spot.update`, or `spot.delete` in the same transaction.

Saving a spot outside the trip box grows the box to include that point, then pads every side by 10% of the new span. A spot already inside the box leaves the box unchanged.

`GET /geocode/search?q=&lang=&tripId=` and `GET /geocode/reverse?lat=&lng=&lang=` proxy Nominatim. `lang` is `en` or `de`. When `tripId` is set, search sends Nominatim a `viewbox` of `minLng,maxLat,maxLng,minLat` so results prefer the trip region. Responses are `{label, lat, lng, bbox?}` (search wraps them in `{results}`). The API sends `NOMINATIM_USER_AGENT`, keeps a global gap of at least one second between upstream calls, and stores responses in `geocode_cache` for 30 days. Search keys are `search:<lang>:<lowercased query>` plus the viewbox when a trip is set. Reverse keys are `reverse:<lang>:<lat 4dp>,<lng 4dp>`. An upstream failure is `502` with `{error: "geocode_unavailable"}`.

## Planning

Planners and owners build the schedule with `POST /trips/:id/plan`. A bucket needs `title`, `startDate`, and `endDate` (for example Tokyo, 12–16 Apr). A single needs `title` and `date` (for example Fuji, 16 Apr at `04:30`), and `400` with `fields.endDate = spans_days` if it covers more than one day. A bucket with no end date is `400` with `end_date_required`. Optional `startTime`, `endTime`, and `info` apply to both. `GET /trips/:id/plan` returns `{entries}` for any member, ordered by start date, start time, then sort order. Each entry includes its spots in sort order.

`PATCH /plan/:id` and `DELETE /plan/:id` edit or remove an entry. Deleting an entry removes its links and leaves the spots in place. `POST /plan/:id/spots` adds `{spotId, visitDate?, visitTime?, info?}`. The same spot can be added to many entries, and more than once to one bucket. `visitDate` must fall inside the entry; otherwise the response is `400` with `fields.visitDate = outside_range` and the message "Visit date must be inside the plan entry range". `PATCH /plan/:id/spots/:linkId` changes that date, time, or info. `DELETE` removes one link. `PUT /plan/:id/spots/order` with `{linkIds}` sets the order; a link from another entry is `400` with `fields.linkIds = other_entry`.

Shrinking a bucket’s dates clears visit dates that no longer fit and returns `clearedVisitDates` with the count. Entries may sit outside the trip’s own dates; those are saved and flagged `outsideTripDates: true`. A spot in at least one entry is `planned` on `spots_view` (`planCount` and `firstScheduledAt` update immediately). A home spot stays `home`. Removing the last link restores the base category. Visitors get `403` on every plan write. Someone who is not a member gets `404`. A spot from another trip is `404`. Each change writes `plan.create`, `plan.update`, `plan.delete`, `plan.spot_add`, or `plan.spot_remove` in the same transaction.

## Scripts

| Script            | What it does                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm dev`        | Starts the Vite web app and the Fastify API together                                                     |
| `pnpm build`      | Typechecks the API and shared package, and builds the web app                                            |
| `pnpm lint`       | ESLint and Prettier                                                                                      |
| `pnpm typecheck`  | `tsc --noEmit` in each package                                                                           |
| `pnpm test`       | Unit and API tests (Vitest). The Postgres-up health test runs when `DATABASE_URL` is set                 |
| `pnpm test:e2e`   | Playwright: login, trips, and the map board                                                              |
| `pnpm db:migrate` | Applies the Drizzle table migration and the rules migration (triggers, views, trigram index)             |
| `pnpm db:seed`    | Loads the Japan 2026 seed (3 users, 1 trip, 6 spots, 90 days of activity and metrics). Safe to run again |
| `pnpm db:check`   | Migrates a temporary database and runs `docs/database/checks.sql` (42 `ok` lines)                        |

## Verify the database design

`pnpm db:check` migrates a temporary database and runs the same checks. To check the reference DDL directly:

```bash
createdb tripboard_check
psql -v ON_ERROR_STOP=1 -d tripboard_check -f docs/database/schema.sql -f docs/database/checks.sql
```
