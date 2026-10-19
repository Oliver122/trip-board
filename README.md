# Trip Board

A shared, map-first travel planner: create a trip scoped to a region (e.g. _Japan 2026_), pin spots on an OpenStreetMap-based map, sort them into categories, schedule them into time buckets or single dates, and invite friends via Discord.

**Status:** steps 00–25 are in place (repo, database, Discord auth, app shell, trips, map board, spots API and geocoding, spot panel and list, image uploads and quotas, search, filter, and sort, planning API, schedule UI, home spots, members, roles, invites, export, hardening, admin, quality of life, live collaboration, interaction polish, CI/CD, local dev login, Google Maps import, spot discussions, and faster spot switching with right-click add).

Visual source: [Figma — Untitled](https://www.figma.com/design/hk3ksysV5sSUlMddhU0SME/Untitled?node-id=0-1&m=dev).

| Document                                                     | Contents                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| [`docs/SYSTEM_OVERVIEW.md`](docs/SYSTEM_OVERVIEW.md)         | How the system works end to end, outside integrations, ranked issue review |
| [`docs/PROJECT_SCOPE.md`](docs/PROJECT_SCOPE.md)             | Decisions, stack, repo structure, features (incl. admin area), API sketch  |
| [`docs/DESIGN.md`](docs/DESIGN.md)                           | Visual direction, wireframes, flow diagrams                                |
| [`docs/STITCH_DESIGN_GUIDE.md`](docs/STITCH_DESIGN_GUIDE.md) | Prompts to paste into Stitch, plus a review checklist                      |
| [`docs/database/`](docs/database/DATABASE.md)                | Database design, reference `schema.sql`, `checks.sql`                      |
| [`requirements/`](requirements/README.md)                    | 23 build steps, each with a test-based Definition of Done                  |

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

The web app listens on `WEB_PORT` (default **5180**) and the API on `API_PORT` (default **4080**). The browser talks only to the web origin; Vite proxies `/api/*` to the API, so `/api/health` hits `GET /health`. `pnpm dev` uses Discord login. `pnpm dev:local` uses the same ports and signs in as a seeded user without Discord settings. See [Local dev login](#local-dev-login).

`GET /health` returns `{ "status": "ok", "db": "ok" }` when Postgres answers, and `503` with `"db": "down"` when it does not. The API exits on startup if `DATABASE_URL` is missing. In production it also exits if `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `AUTH_SECRET`, or `WEB_ORIGIN` is missing. Outside production those Discord settings fall back to local placeholders so the API still boots.

## Auth

Log in at `/login`. The API uses Discord's authorization code flow with PKCE (`identify`). It keeps `state` and the code verifier in a short-lived signed cookie, then stores only the SHA-256 of the session token. Sessions last 30 days and are extended when fewer than 15 days remain. `GET /me` returns the current user; `POST /auth/logout` deletes the session. State-changing requests must send an `Origin` header equal to `WEB_ORIGIN`.

`PATCH /me` with `{ "locale": "en" | "de" }` stores the profile language. The shell reads that locale first, then the browser language, then English. Signed-in users change language, theme, and **List follows map** on **Account & settings** (`/account`). The switch updates the UI immediately and saves the profile. Login and join keep a language switch so the page can be read before a session exists. Theme (`system`, `light`, or `dark`) is stored in `localStorage` under `theme` and toggles the `dark` class on `<html>`. **List follows map** is stored under `listFollowsMap` (`1` or `0`, default off).

Suspended users are sent back to the login page with the suspension reason. When signups are disabled, a Discord account that is not already a user is refused unless `next` is a valid `/join/<code>` invite. Discord ids listed in `ADMIN_DISCORD_IDS` are promoted to admin on login.

Register `{WEB_ORIGIN}/api/auth/discord/callback` as the redirect URI on the Discord application. `POST /test/login` with `{ "discordId" }` exists only when `NODE_ENV=test`. Playwright starts the API in that mode (`pnpm dev:e2e`).

## Local dev login

`pnpm dev:local` starts the web app and the API on `WEB_PORT` and `API_PORT` (defaults **5180** and **4080**) with `NODE_ENV=development` and `DEV_LOGIN=1`. `pnpm dev` does not set that flag. A Discord client id, secret, and redirect URI are not required.

Open `http://127.0.0.1:5180/login`. Under “Continue with Discord”, **Dev login** lists the users from `pnpm db:seed`: **Sven (admin)**, **Aiko**, and **Tom**. A click signs in with the same 30-day session as Discord and follows `next`. The header shows a **Dev login** badge so a screenshot is not mistaken for production.

`DEV_LOGIN` is `0` or `1`, and the default is `0` (see `.env.example`). The API refuses to start when the flag is `1` and `NODE_ENV` is `production`, or when the hostname of `WEB_ORIGIN` is not `127.0.0.1`, `localhost`, or `[::1]`. A public origin cannot enable the shortcut, even under `pnpm dev`. `scripts/deploy.sh` never writes `DEV_LOGIN` into the server `.env`, and it stops before restart if that file already contains `DEV_LOGIN=1`.

## Map

`/trips/:id` is the board: a MapLibre map on [OpenFreeMap](https://openfreemap.org/) vector tiles (no API key), with a 360 px list column at desktop width. The first view fits the trip’s bounding box. Panning stays inside that box plus a 50% margin. The center and zoom are stored in the URL hash (`#zoom/lat/lng`), so a reload keeps the view. The board also copies that view into `sessionStorage` (`tripboard:viewport:board:<tripId>`). Place labels use `name:de` or `name:en` when the tiles have them, otherwise the local name. The light and dark map styles follow the `dark` class on `<html>`. Pins and the “Things to do” list come from the trip’s spots. The list shows every spot that matches search and filters. **List follows map** (account setting, default off) limits it to the current map view; `visible=1` or `visible=0` in the URL overrides that setting for the visit. Selecting a card flies the map to its pin. Planners add a spot from an address search or by clicking the map, then edit or delete it in the side panel. A link without a scheme (`hotel.jp`) is stored as `https://hotel.jp`. A link that is still invalid (`javascript:`, `ftp:`) shows an error under Link and leaves the panel open with the draft. Visitors get the same panel with read-only fields. A saved link opens in a new tab.

## Trips

Signed-in users open **My trips** at `/trips`. `POST /trips` creates a trip and an owner membership in one transaction and writes a `trip.create` activity event in that same transaction. `GET /trips/:id` is 404 for anyone who is not a member. Planners and owners can change the name, dates, and region box; only the owner can delete the trip. Delete cascades spots, plans, and members, and the image trigger queues blob keys in `blob_deletions`.

The create dialog searches a small built-in region list (Japan → `Asia/Tokyo`) and shows the browser timezone until a region is chosen. State-changing trip requests must send an `Origin` header equal to `WEB_ORIGIN`, same as logout.

## Images and quotas

Planners upload one photo at a time with `POST /spots/:id/images` (multipart field `file`). JPEG, PNG, WebP, and HEIC are accepted only when the bytes match that type, and only when the file is at most 10 MB. The API rotates the image, strips EXIF and GPS, resizes the longest side to 2048 px, and stores WebP at quality 80 in MinIO under `trips/<tripId>/spots/<spotId>/<uuid>.webp`. The database row is written after the upload; if that insert fails, the object is deleted.

Quota uses `user_quota_usage` (a per-user override, or the platform default of 100 images and 200 MB). The check runs in a transaction that locks the user row, so two uploads at once cannot both take the last slot. A miss is `413` with the current usage. `GET /me/quota` returns `{usedImages, maxImages, usedBytes, maxBytes}`. Members load a spot’s photos from `GET /spots/:id/images` and `GET /images/:id`. Those responses carry a signed `/images/:id/file` URL that lasts 10 minutes. `DELETE /images/:id` removes the row; the database trigger queues the blob, and a worker drains `blob_deletions` once a minute, backing off after each failure. More than 30 uploads from one user in a minute returns `429`. When `app_settings.uploads_enabled` is false, uploads return `503` with “Uploads are paused”.

The spot panel shows thumbnails, a drop zone, upload progress, a lightbox, and the quota line. A full quota disables the drop zone with “Image limit reached”. The account page shows the same usage as a progress bar.

With a spot panel open, a click on another pin or list card opens that spot straight away. If the panel has unsaved changes, every switch first asks “Discard unsaved changes?”; Cancel keeps the open spot and its edits, and clicks are ignored while a save is running. Planners and owners can also right-click an empty point on the board map to start a new spot there, with the address filled by reverse geocoding; right-clicking a pin, a cluster, or a control does nothing, and visitors keep the browser's own context menu. Touch devices keep **Add new** (there is no long-press add).

## Search, filter, and sort

The list toolbar searches, filters, and sorts the same spots the map draws. Search waits 250 ms, then matches title, address, and info without regard to case (`ÖFFNET` matches `öffnet`). `%` and `_` are literal characters. Filters are category (more than one; one chip per kind of the trip, plus Planned and Home; a spot matches a kind chip when either of its kinds does, and the URL holds `cat=<kindId>`, `cat=planned` or `cat=home`), scheduled or not, and who added the spot. “Only visible on map” follows **List follows map** unless the URL sets `visible=1` or `visible=0`. The default sort is scheduled first: spots with a visit time, a “Not scheduled yet” divider, then the rest by the primary kind's order (the trip's kinds, then home) and title. Other sorts are `datetime`, `category`, `az`, and `newest`. An unknown `sort` is `400`.

The view is the query string `?q=&cat=&status=&by=&sort=&visible=`. Active filters show as chips; Reset clears them. The count reads “6 spots”, or “2 of 6 spots” while a filter is on. When nothing matches, the list says “No spots match your filters”. `GET /trips/:id/spots` accepts those parameters (except `visible`, which follows the map) and returns `{spots, total}` in that order. Export uses that same list.

## Spots and geocoding

Planners and owners create spots with `POST /trips/:id/spots` (`title`, `lat`, `lng`, `kindIds` (one or two kinds of the trip) or `category: "home"` (the older `baseCategory` of `must_go`, `maybe` or `home` still works and maps to the trip's kind with that preset), plus optional `address`, `info`, and a `link`). A link with no scheme is stored with `https://`. `javascript:` and `ftp:` are `400` with `fields.link = invalid`. `HTTP://x.de` is stored unchanged. A home spot may also send `stayFrom`, `stayTo`, and `primary`. Stay dates on any other category are `400` with `home_only`. A stay that ends before it starts is `400` with `fields.stayTo = before_start`. Clearing the dates (`null`) leaves the spot a home spot. `primary: true` makes that spot the trip’s only primary home base. Changing its category away from home clears the flag and the stay dates. `planned` is rejected: the API returns `400` with `fields.baseCategory = planned_automatic`, because that status is computed from plan links. Visitors can read `GET /trips/:id/spots` and `GET /spots/:id`. Those responses come from `spots_view`, so `displayCategory` starts equal to the chosen category and `createdBy` is `{id, name, avatar}`. `GET /spots/:id` also includes `plans`: each entry the spot is in, with `linkId`, `entryId`, `title`, `type`, `visitDate`, and `visitTime`. `PATCH /spots/:id` and `DELETE /spots/:id` are planner-or-owner. Someone who is not a member of the spot's trip gets `404`. Each create, update, and delete writes `spot.create`, `spot.update`, or `spot.delete` in the same transaction.

Saving a spot outside the trip box grows the box to include that point, then pads every side by 10% of the new span. A spot already inside the box leaves the box unchanged.

`GET /geocode/search?q=&lang=&tripId=` and `GET /geocode/reverse?lat=&lng=&lang=` proxy Nominatim. `lang` is `en` or `de`. When `tripId` is set, search sends Nominatim a `viewbox` of `minLng,maxLat,maxLng,minLat` so results prefer the trip region. Responses are `{label, lat, lng, bbox?}` (search wraps them in `{results}`). The API sends `NOMINATIM_USER_AGENT`, keeps a global gap of at least one second between upstream calls, and stores responses in `geocode_cache` for 30 days. Search keys are `search:<lang>:<lowercased query>` plus the viewbox when a trip is set. Reverse keys are `reverse:<lang>:<lat 4dp>,<lng 4dp>`. An upstream failure is `502` with `{error: "geocode_unavailable"}`.

## Planning

Planners and owners build the schedule with `POST /trips/:id/plan`. A bucket needs `title`, `startDate`, and `endDate` (for example Tokyo, 12–16 Apr). A single needs `title` and `date` (for example Fuji, 16 Apr at `04:30`), and `400` with `fields.endDate = spans_days` if it covers more than one day. A bucket with no end date is `400` with `end_date_required`. Optional `startTime`, `endTime`, and `info` apply to both. `GET /trips/:id/plan` returns `{entries}` for any member, ordered by start date, start time, then sort order. Each entry includes its spots in sort order, and `home: {spotId, title}` or `null`. The home is the stay that overlaps the entry (`plan_entry_home`), otherwise the primary home base.

`PATCH /plan/:id` and `DELETE /plan/:id` edit or remove an entry. Deleting an entry removes its links and leaves the spots in place. `POST /plan/:id/spots` adds `{spotId, visitDate?, visitTime?, info?}`. The same spot can be added to many entries, and more than once to one bucket. `visitDate` must fall inside the entry; otherwise the response is `400` with `fields.visitDate = outside_range` and the message "Visit date must be inside the plan entry range". `PATCH /plan/:id/spots/:linkId` changes that date, time, or info. `DELETE` removes one link. `PUT /plan/:id/spots/order` with `{linkIds}` sets the order; a link from another entry is `400` with `fields.linkIds = other_entry`.

Shrinking a bucket’s dates clears visit dates that no longer fit and returns `clearedVisitDates` with the count. Entries may sit outside the trip’s own dates; those are saved and flagged `outsideTripDates: true`. A spot in at least one entry is `planned` on `spots_view` (`planCount` and `firstScheduledAt` update immediately). A home spot stays `home`. Removing the last link restores the base category. Visitors get `403` on every plan write. Someone who is not a member gets `404`. A spot from another trip is `404`. Each change writes `plan.create`, `plan.update`, `plan.delete`, `plan.spot_add`, or `plan.spot_remove` in the same transaction.

`GET /trips/:id/spots` also accepts `entry`, a plan entry id. The list and the map then include only spots linked to that entry. An id that is not a UUID is `400`.

## Schedule

`/trips/:id/schedule` lists buckets and single dates in chronological order, with the map beside the list. A bucket shows its date range, info, and visits, and can be collapsed. Its header names the resolved home (`⌂ Hotel Gracery`). A single shows its date and time, and the home only when that date falls inside a stay. Planners use **+ Bucket** and **+ Single** to add entries, then **Add spot** inside a bucket or single to attach a visit with a date inside that range, a time, and a note. The picker ends with **Create new spot**, which opens the spot panel on this page; after save the new spot is selected in the form. Visitors do not see that option. Move up, move down, and remove are icon buttons. The first and last rows keep their buttons disabled. A move highlights the row, keeps focus on the same button, and announces the new position. Drag shows a dimmed row and a drop line. A failed reorder restores the previous order and shows a toast. Shrinking a bucket shows how many visit dates will be cleared before the change is saved. Selecting an entry fits the map to its spots and highlights those pins. Visitors see the same list without add, edit, drag, or remove controls.

The schedule map does not reuse the board hash. Both pages used to read `#zoom/lat/lng`, and the tab link kept that hash, so the schedule opened on the board’s last view. A `moveend` from the map that was leaving could also write that hash onto the new URL. The schedule uses `#s/zoom/lat/lng` and otherwise fits the trip. Going back to the board restores the board view from its hash or from `sessionStorage`. Reloading either page keeps the view of the page you are on.

Home spots add **Stay from**, **Stay to**, and **Primary home base** to the panel. Switching the category away from Home asks before those fields are cleared. Two stays that share a day show an overlap warning on both panels; the overlap is allowed. The primary home uses a filled house pin and is listed ahead of the other home spots. Other home pins stay a house outline, including when the spot is also in a plan.

The spot panel’s **In plans** section lists the entries that include the spot. **Add to plan** puts it on an entry, and the category badge switches to _Planned_ with the visit count. The kinds field still edits the spot's kinds. The board filter adds **Plan entry**.

## Members, roles, and invites

**Members** on a trip opens the members dialog. Everyone sees avatars, names, and roles. The owner can switch a member between board admin, planner and visitor, remove them, or transfer ownership. A board admin can do everything a planner can and also manages the trip's spot kinds; members, invites and ownership stay with the owner. Transfer asks for confirmation, then the previous owner becomes a planner in the same transaction. Anyone except the owner can leave. The owner has to transfer ownership first (`409`, “transfer ownership first”).

`POST /trips/:id/invites` is owner-only. The role is `planner` or `visitor`, and it defaults to visitor. `owner` and `admin` are `400`. Each link works for one person. The code is `XXX-XXXX`: three letters or digits from the trip name (Japan 2026 → `JAP`) plus four Crockford characters that skip `0`, `O`, `1`, and `I`. It expires seven days after creation. `GET /trips/:id/invites` lists invites that are still unused, unrevoked and unexpired. `DELETE /invites/:id` revokes one.

`GET /join/:code` is public and returns the trip name, owner name, member count, and role. An unknown code is `404`. An expired, revoked or already used code is `410` with `expired`, `revoked` or `used`. `POST /join/:code` adds the signed-in user with that role and uses the code up in the same transaction. Someone who is already a member keeps their current role. Join attempts are limited to 10 per minute per IP.

The join page shows that preview and a **Join trip** button. Signed-out visitors get **Continue with Discord** with `next=/join/<code>`. A link-preview bot (for example `Discordbot`) that requests `GET /join/:code` receives HTML with Open Graph tags: the trip name as `og:title` and “Join on Trip Board” as the description. An expired code’s HTML omits the trip name. In development, the Vite server forwards those bot requests to the API. A production host that serves the static app should do the same for `GET /join/:code` when the user agent is a crawler, or Discord will preview the empty app shell.

## Export

**Export** on the board opens a dialog. **Full list** is the default. **Current view** sends the same search, category, status, added-by, plan entry, and sort parameters as the list, and the label shows how many of those filters are on (each selected category counts as one). The map’s “only visible” toggle stays on the board.

`GET /trips/:id/export?format=csv|pdf|ics` is open to every member, including visitors. Someone who is not a member gets `404`. An unknown format or sort is `400`. The download is named from the trip, for example `japan-2026-2026-10-06.csv`, using the trip timezone for the date. A successful download writes `export.download` in the same transaction.

CSV is UTF-8 with a byte-order mark, one row per visit, plus one row for each spot that has no visit. Headers and category labels follow the profile language. The category column shows the spot's kind names (the custom name, or the preset label), joined with `/` for two kinds. A cell that starts with `=`, `+`, `-`, or `@` is prefixed with `'` so Excel does not treat it as a formula.

PDF is an A4 itinerary: trip title, dates, and members, then the schedule day by day (each bucket or single with its spots and home), then spots that are not on a plan, grouped by primary kind in the trip's kind order (a spot with two kinds is listed under its first), then Planned and Home. Dates follow the profile language. The file uses a standard Latin font, so characters outside that set are replaced.

The calendar file has one event per bucket (all-day across the bucket’s dates), one per single entry, and one per visit that has a time. Location is the address, the description is the info text, and `GEO` is the latitude and longitude. Event ids stay the same across downloads. Times use the trip timezone (`TZID`).

## Import from Google Maps

**Import** sits next to **Export** on the board toolbar for owners and planners; visitors do not see it. The dialog explains how to get a file from [Google Takeout](https://takeout.google.com) (a `Saved/*.csv` list, or `Saved Places.json`) or from Google My Maps (export as KML). It accepts one `.csv`, `.json`, `.geojson`, or `.kml` file up to 5 MB, dropped or picked. A `.kmz`/`.zip` shows a message instead of a preview; so does any other file, or a CSV without a `Title` column, or more than 500 rows.

CSV columns are matched by name, case-insensitively (`Title`, `Note`, `URL`, `Comment`, `Address`); unknown columns are ignored. GeoJSON reads each `Point` feature; KML reads each `Placemark` with a point. A Google Maps URL can supply coordinates (`!3d…!4d…`, `@lat,lng`, `/search/lat,lng`, or `?q=lat,lng`). Title is cut to 120 characters, info (note plus comment) to 2000; a cut row is marked “shortened”.

Rows without coordinates are looked up one at a time through `GET /geocode/search`, biased to the trip’s region; the dialog shows “Locating N of M” and can be cancelled. A row is a duplicate when the trip already has a spot with the same link, or the same title within 200 m; duplicates and rows that were not found start unticked. A not-found row can be resolved with the same address search as the spot panel. The user picks `must_go` or `maybe` for the whole batch, then **Import N spots**.

`POST /trips/:id/spots/import` (planner+) takes up to 500 spots and writes them in one transaction: one multi-row insert, one trip bbox expansion, and one `spot.import` activity event (not one `spot.create` per spot). The import parser and dialog load only when the dialog opens, in a separate bundle chunk.

## Send a place from Google Maps

Planners can hand a place from Google Maps to a board by its link. Paste the link on the board (Ctrl/Cmd+V), or type it into the _Google Maps link_ field of the add panel; the panel opens with title, address, pin and link filled in. `POST /trips/:id/places/from-link` follows short links (`maps.app.goo.gl`) with `HEAD` requests to Google hosts only and matches the place through Nominatim; it never reads a Google page. At most 20 requests per user per minute.

- **Desktop:** on the account page, drag _Send to TripBoard_ to the bookmarks bar and click it on a Google Maps place.
- **Android:** install TripBoard from the browser menu, then Google Maps → _Share_ → _TripBoard_ and pick the trip (`/share`, a Web Share Target).
- **iPhone:** Safari has no share targets; use _Share → Copy_ in Google Maps and paste into the _Google Maps link_ field.

The installable app is `apps/web/public/manifest.webmanifest` plus a pass-through service worker (`sw.js`, production builds only; it caches nothing).

## Live updates

`GET /trips/:id/events` is a Server-Sent Events stream for members of that trip. Each API process keeps one Postgres connection on `LISTEN trip_events`. A write notifies that channel in the same transaction as its `activity_events` row, so a rollback sends nothing. The payload is ids only: trip, resource (`spot`, `image`, `plan`, `home`, `member`, `trip`), entity id, action, actor, and the tab’s `X-Client-Id`. The browser opens one stream per trip tab, ignores its own client id, and refetches the affected list after a short pause. Map position, open dialogs, scroll, and selection stay put.

A reverse proxy must not buffer this route (`X-Accel-Buffering: no` is set; nginx also needs `proxy_buffering off`) and must allow the connection to stay open (read timeout of at least 10 minutes). A comment line every 25 seconds keeps the proxy from treating it as idle. If the stream fails three times, the tab polls the existing GET routes every 15 seconds and only shows an error if that polling fails too. Hiding the tab for more than five minutes closes the stream; coming back reconnects and refetches once. Reconnect sends `Last-Event-ID`; the server does not replay missed events, it sends `event: resync`.

`PATCH` and `DELETE` for a spot, plan entry, or trip may send `expectedUpdatedAt` (or `If-Unmodified-Since`). A stale value is `409` with the current row and who saved it. The panel then asks whether to keep your draft or take theirs. Requests without the check stay last-write-wins. Reordering a bucket does not conflict; everyone else sees the new order through the stream. The admin dashboard shows how many streams this process has open, and the log records when the listener reconnects.

## Spot discussions and News

Every member, visitors included, can comment on a spot. The **Discussion** section at the bottom of the spot panel shows the thread oldest first and takes plain text of up to 2000 characters. Line breaks are kept and `http(s)` addresses become links; anything else, HTML included, is shown as typed. Ctrl/Cmd + Enter sends. Authors edit and delete their own comments; the owner deletes any comment. Deleting a spot names the comments that go with it.

`GET /spots/:id/comments?cursor=` returns 50 comments per page, `POST /spots/:id/comments` adds one (at most 20 per user per minute, then `429`), `PATCH /comments/:id` and `DELETE /comments/:id` follow the rules above, and `PUT /spots/:id/comments/read` records what the reader has seen. `GET /trips/:id/news` lists the spots with unread comments, and `POST /trips/:id/news/read` clears them. Spot and trip responses carry `commentCount` and `unreadComments`.

A comment is unread for a member when someone else wrote it after the member last saw that spot's thread and after they joined the trip. The header’s **News** button shows the trip's unread total; the panel lists the spots, and clicking one opens its discussion with a “New” divider above the first unread comment. A thread counts as read once its section has been on screen. The tab title and My trips show unread counts too. Marking comments read writes no activity event, so the admin feed shows only comment writes (`comment.create`, `comment.update`, `comment.delete`).

## Hardening

From 640 px to 1023 px the list column is 280 px and the spot panel stays a sheet on the right, so the list remains visible. Below 640 px the map is full screen and the list is a bottom sheet (`peek`, `half`, `full`) dragged from the handle or moved with the arrow keys. The toolbar becomes one **Filters** button, and the spot panel and dialogs fill the screen. The panel’s close control is named **Back**.

Every API response sends `Content-Security-Policy` (`self`, `https://tiles.openfreemap.org`, the blob origin, and `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`. Production also sends `Strict-Transport-Security`. A user, or an anonymous IP, is limited to 300 requests a minute; the 301st is `429` with `Retry-After`. `GET /trips/:id/events` is outside that limit and instead allows 5 open streams per user on each API process. Unexpected errors are `{error:"internal", requestId}` and the same id is in the JSON log line and the `x-request-id` header.

Housekeeping deletes expired sessions hourly, invites that expired or were revoked more than 90 days ago, geocode cache older than 30 days, and activity older than 180 days. Blob deletions still drain once a minute. Spot titles are text, and links that open a new tab use `rel="noopener noreferrer"`. The map library loads only when a board or schedule opens. `pnpm check:bundle` fails when the first-route JavaScript exceeds 250 kB gzip.

## Admin

Platform admins (`users.app_role = admin`) open **Admin** from the account menu. `/admin` has its own sidebar: Dashboard, Users, Trips, Activity, Storage, Requests, Settings, and Audit log. Someone who is not an admin gets the normal 404 page, and every `/admin/*` API route answers **404** for them and **401** when logged out.

Discord ids in `ADMIN_DISCORD_IDS` are promoted on login. Removing an id does not demote that user; demote them in the user detail. The last remaining admin cannot be demoted or suspended. Suspending someone deletes their sessions immediately. They cannot log in, and the login page shows the reason.

**Extend storage** sets `max_images` / `max_bytes` for one user, or clears the override. A limit below current usage blocks new uploads and deletes nothing. Raising the default quota in Settings applies to users without an override. Approving a storage request adds the amount to the current effective limit. Users ask from the account page (`POST /me/quota-requests`); one request can be pending at a time.

Every admin write inserts an `admin_audit_log` row in the same transaction, with before and after values. Trip detail for an admin who is not a member shows counts, members, and activity. Spot content stays on the member routes.

The dashboard reads `GET /admin/stats` and `GET /admin/metrics`, and shows how many live streams this API process has open (`GET /admin/streams`). A job at 00:05 UTC stores yesterday in `metrics_daily` (`pnpm db:metrics` backfills missing days). The activity feed polls every 15 seconds while the tab is visible and can download the same filter as CSV. Storage shows database and image use against the capacities from Settings. At or above the warning percent, every admin page shows a banner (red at 95% or more). If `ADMIN_DISCORD_WEBHOOK_URL` is set, that channel gets the capacity warning at most once per UTC day per resource, and a message for each new storage request. Activity older than 180 days is deleted daily; daily metrics are kept.

## Scripts

| Script                   | What it does                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`               | Starts the Vite web app and the Fastify API together                                                                                                                                                          |
| `pnpm dev:local`         | Same ports as `pnpm dev`, with `DEV_LOGIN=1`, so the login page can sign in as Sven, Aiko, or Tom without Discord                                                                                             |
| `pnpm build`             | Typechecks the API and shared package, and builds the web app                                                                                                                                                 |
| `pnpm lint`              | ESLint and Prettier                                                                                                                                                                                           |
| `pnpm typecheck`         | `tsc --noEmit` in each package                                                                                                                                                                                |
| `pnpm test`              | Unit and API tests (Vitest). The Postgres-up health test runs when `DATABASE_URL` is set                                                                                                                      |
| `pnpm test:e2e`          | Playwright on Chromium, Firefox, WebKit, and an iPhone 14 viewport. One project: `pnpm test:e2e --project=firefox` after `pnpm exec playwright install firefox`                                               |
| `pnpm test:e2e:docker`   | The whole Playwright suite in the Playwright Docker image, as CI runs it: fresh Postgres and MinIO, seeded data, headed Firefox under Xvfb. Extra args go to `playwright test`                                |
| `pnpm check:bundle`      | Fails when the first-route JS bundle exceeds 250 kB gzip, or the map library is in that bundle                                                                                                                |
| `pnpm textures:template` | Writes `docs/textures/kind-symbols-template.png` (the 8x8 grid for the artist) and the symbol table in `docs/textures/README.md`. Deterministic                                                               |
| `pnpm textures:manifest` | Reads `apps/web/public/textures/kind-symbols.png` and writes `apps/web/src/kinds/texture-manifest.json` (filled cells + content hash). `pnpm build` runs it first; CI fails if the committed manifest differs |
| `pnpm db:migrate`        | Applies the Drizzle table migration and the rules migration (triggers, views, trigram index)                                                                                                                  |
| `pnpm db:seed`           | Loads the Japan 2026 seed (3 users, 1 trip, 6 spots, 90 days of activity and metrics). Safe to run again                                                                                                      |
| `pnpm db:check`          | Migrates a temporary database and runs `docs/database/checks.sql` (42 `ok` lines)                                                                                                                             |
| `pnpm db:metrics`        | Backfills missing `metrics_daily` rows through yesterday (UTC)                                                                                                                                                |
| `pnpm push`              | Runs `scripts/deploy.sh` with the local `deploy.env` (see CI/CD and deployment)                                                                                                                               |

## CI/CD and deployment

[Step 21](requirements/21-ci-cd.md) defines the pipeline in `.github/workflows/ci.yml`. Every pull request runs `static` (migrate, `db:check`, lint, typecheck, unit and API tests), `build` (`pnpm build`, `pnpm check:bundle`), and Playwright once per project: `chromium`, `firefox`, `webkit` (the Safari engine), and `mobile`. A green Playwright run does not prove the build: e2e runs against the Vite dev server and `tsx`, which neither type-check nor bundle, so `build` is a separate required job.

The `e2e-report` job merges all browsers into one HTML report, uploaded as the `playwright-report` artifact for 14 days, also when tests fail. Download it from the run page, unzip it, and open it with `pnpm exec playwright show-report <folder>`. To run one browser locally, run `pnpm exec playwright install firefox`, then `pnpm test:e2e --project=firefox`. To reproduce a CI failure, use `pnpm test:e2e:docker` (for example `pnpm test:e2e:docker e2e/cleanup.spec.ts --project=firefox`). It needs only Docker, keeps clear of the dev stack, and ignores the local `.env`.

`ci-passed` succeeds only when every other check succeeded. It is the only required check. Set up a ruleset on `main` under **Settings → Rules → Rulesets** with these rules: require a pull request before merging, require the status check `ci-passed`, require the branch to be up to date, block force pushes and deletion, and leave the bypass list empty.

[Step 36](requirements/36-faster-ci.md) keeps `main` from running the same tests twice. When a pull request run is green, its `ci-passed` job uploads an artifact `tested-tree-<pr>-<tree>` (30 days) naming the git tree it tested. On a push to `main`, the `pr-verified` job (`scripts/ci-pr-verified.mjs`) checks that the commit belongs to exactly one merged pull request, that the latest run for that PR's head ended `success`, and that the recorded tree equals the pushed commit's tree. If so, `static`, `build`, `e2e` and `e2e-report` are skipped, `ci-passed` accepts the skips, `deploy` starts right away, and the run summary links the pull request run it reused. Otherwise the full pipeline runs as before; the summary shows the reason: `no_pull_request` (direct push, or more than one PR), `run_not_green`, `no_tested_tree`, `tree_mismatch` or `api_error`.

To run everything on `main` anyway, start the **CI** workflow by hand (**Actions → CI → Run workflow**, branch `main`): `pr-verified` is skipped, every job runs, and `deploy` follows. In CI, Playwright runs with two workers (`using 2 workers` in each e2e log; locally it keeps its default), and failed tests are retried once.

A push to `main` (a merge) runs the full checks only when `pr-verified` is false (or when the workflow is started by hand), and then `deploy`, which calls `scripts/deploy.sh` with the GitHub environment `production`. Deploys run one at a time. To roll back, re-run the `deploy` job of an earlier green run on `main`; database migrations are not reverted. Pull request checks need no secrets.

Set these on **Settings → Environments → production**. Optional keys that are left unset keep the value already in the server’s `.env`.

| Name                                         | Kind     | Required     | Notes                                                                                                              |
| -------------------------------------------- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `DEPLOY_HOST`                                | variable | yes          | Server hostname or IP                                                                                              |
| `DEPLOY_USER`                                | variable | yes          | `root`, or a user with password-less root rights. The script installs packages and writes systemd and nginx config |
| `DEPLOY_PATH`                                | variable | yes          | e.g. `/opt/trip-board`                                                                                             |
| `WEB_ORIGIN`                                 | variable | yes          | Public origin; the job checks `${WEB_ORIGIN}/api/health` after deploying                                           |
| `DEPLOY_SSH_PRIVATE_KEY`                     | secret   | yes          | A key just for CI, without passphrase; its public key goes into the server’s `authorized_keys`                     |
| `DEPLOY_KNOWN_HOSTS`                         | secret   | yes          | `ssh-keyscan -t ed25519 <host>`, checked against the server’s fingerprint. The deploy refuses to run without it    |
| `DISCORD_CLIENT_ID`                          | variable | first deploy | Otherwise the server keeps `replace-me` and login fails                                                            |
| `DISCORD_CLIENT_SECRET`                      | secret   | first deploy | Same                                                                                                               |
| `AUTH_SECRET`                                | secret   | first deploy | `openssl rand -base64 48`. Changing it logs everyone out                                                           |
| `DATABASE_URL`                               | secret   | no           | Defaults to the Compose Postgres on the server                                                                     |
| `ADMIN_DISCORD_IDS`                          | variable | no           | Comma-separated Discord ids promoted to admin                                                                      |
| `ADMIN_DISCORD_WEBHOOK_URL`                  | secret   | no           | Capacity warnings and storage requests                                                                             |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`      | variable | no           | Default to the server’s MinIO                                                                                      |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`             | secret   | no           | Same                                                                                                               |
| `NOMINATIM_BASE_URL`, `NOMINATIM_USER_AGENT` | variable | no           | Use a user agent with a contact address                                                                            |
| `COMMONS_BASE_URL`                           | variable | no           | Wikimedia Commons API for photo suggestions; defaults to `https://commons.wikimedia.org`                           |
| `WEB_PORT`, `API_PORT`                       | variable | no           | Keep `WEB_PORT` at `5180`; nginx and the server health check expect it                                             |

`pnpm push` from a laptop still works with a local `deploy.env` (copy `deploy.env.example`). Do not set `DEV_LOGIN` for a deploy. The script never copies that key, and it stops before restart when the server `.env` already has `DEV_LOGIN=1`.

## Verify the database design

`pnpm db:check` migrates a temporary database and runs the same checks. To check the reference DDL directly:

```bash
createdb tripboard_check
psql -v ON_ERROR_STOP=1 -d tripboard_check -f docs/database/schema.sql -f docs/database/checks.sql
```
