# Step 33 — Send a place from Google Maps to the board

**Goal:** a planner finds a place in Google Maps and hands it to TripBoard by pasting its link, sharing it from the Google Maps app on Android, or clicking a bookmark on desktop, and the add panel opens with title, address, pin and link filled in.
**Depends on:** 06, 23, 25
**Result:** As planner, copy the Google Maps link of *Kinkaku-ji* and press Ctrl+V on the board: the add panel opens with the title “Kinkaku-ji”, the address, the pin on the temple and the link. On Android, install TripBoard, then Google Maps → *Share* → *TripBoard* → pick the trip: same panel. On the account page, drag *Send to TripBoard* to the bookmarks bar; clicking it on a Google Maps place does the same
**Core:** C-IMP-06, C-SPOT-25, C-SPOT-26, C-SPOT-27, C-APP-32, C-APP-33, C-APP-34
**Status:** integrated 2026-10-12

## Scope
- In: one parser for Google Maps links in `packages/shared` (also used by the import), `POST /trips/:id/places/from-link` that resolves short links and places the pin, paste on the board, a *Google Maps link* field in the add panel, a `/share` page with a trip picker, an installable web app (manifest, icons, a minimal service worker) with a Web Share Target, a *Send to TripBoard* bookmarklet and short instructions on the account page.
- Out: photos (step 34, which opens Commons suggestions for a place from a link); the Google Places API and a Google basemap (not planned, see Decisions); a browser extension (not planned, see Decisions); offline use of the board; the import dialog (step 23, unchanged apart from sharing the parser).

## Current behavior
| Topic | Today |
| --- | --- |
| Getting a place from Google | Planners look the place up in Google Maps in another tab, then type or copy name and address into the add panel by hand. The address search (Nominatim) often misses shops and restaurants by name |
| Google links | `apps/web/src/import/url-coords.ts` reads coordinates from long Google Maps URLs for the Takeout import (C-IMP-06). Short links (`maps.app.goo.gl/…`), which is what *Share → Copy link* gives, carry no coordinates and are not understood anywhere |
| App install | No web app manifest or service worker, so TripBoard cannot be installed and does not appear in the Android share menu |

## Decisions
| Topic | Decision |
| --- | --- |
| The link is the hand-off | Google pages cannot be embedded and a page cannot see clicks in another tab, but every way of leaving Google Maps (Share, Copy link, the address bar) gives a link. So the link is what TripBoard accepts, from three entry points: paste, the Android share menu and a bookmarklet. All three end in the same draft |
| Short links | The API follows the redirects of a short link to the long Maps URL with `HEAD` requests and never reads a Google page body, so nothing is scraped. Only Google hosts are followed, which also rules out SSRF. Google may send an EU visitor to `consent.google.com?continue=<url>`; the `continue` URL is taken instead of loading that page |
| Where the point comes from | The point is matched through the existing Nominatim service (name plus address hint, accepted within 300 m of the link's coordinates), so stored data is OpenStreetMap data where possible. When there is no match, the coordinates in the link the user shared are used, as the Takeout import already does (C-IMP-06). Nothing else from Google is stored except the link itself in the existing `link` field |
| No Places API, no extension | The Places API needs a billing account, limits what may be stored and forbids showing its data on our OSM map. A browser extension needs its own login tokens, store publishing and fixes whenever Google changes its page. Both were compared and set aside; the link covers desktop and phones at no cost. A Places search field can still be added later on top of this step |
| iPhone | Safari does not support share targets, so on iPhone the flow is *Share → Copy* in Google Maps and paste into the *Google Maps link* field. The account page says so |
| Bookmarklet in React | React 19 refuses `javascript:` URLs in `href`, so the bookmarklet link gets its `href` through `setAttribute` on a ref; TripBoard never runs that code itself |

## Requirements

### Link parsing and resolving
| ID | Requirement |
| --- | --- |
| R-33-01 | `parseGoogleMapsLink(url, text?)` lives in `packages/shared` and returns `{lat, lng, name, addressHint}` (each possibly `null`). Coordinates follow C-IMP-06 unchanged. `name` comes from the `/maps/place/<name>/` path segment (URL-decoded, `+` as space) or from a `q`/`query` parameter that is not a coordinate pair. With share text from the Google Maps app (`Name\nAddress\nhttps://maps.app.goo.gl/…`, also `Name, Address` on one line) the first non-URL line is the name and the next one the address hint, overriding the URL's name. `apps/web/src/import/url-coords.ts` is replaced by it and the import behaves as before |
| R-33-02 | `POST /trips/:id/places/from-link {url?, text?}` (planner, board admin, owner; visitor 403, non-member 404) takes the first `http(s)` URL in `url` or else in `text` (each ≤ 2000 characters). It accepts only Google Maps links: hosts `maps.app.goo.gl`, `goo.gl` with path `/maps…`, `maps.google.<tld>`, `www.google.<tld>` and `google.<tld>` with path `/maps…` or `/search…`; anything else, or no URL, is 400 `link_not_google_maps`. At most 20 requests per user per minute, then 429 `rate_limited` with `Retry-After` |
| R-33-03 | A short link is resolved by `HEAD` requests with manual redirects (a `GET` whose body is not read if `HEAD` answers 405), at most 5 hops, 5 s in total, each hop to an allowed host from R-33-02 or `consent.google.com`, whose `continue` parameter is used as the next URL. A hop to any other host, too many hops, a timeout or a non-2xx/3xx answer is 502 `link_resolve_failed`. No response body from Google is read or stored |
| R-33-04 | The route answers `{title, address, lat, lng, link, placed}`. With a name, it searches the geocode service (C-SPOT-10 to C-SPOT-12: Nominatim, its rate limit, cache and the trip's bounding box) for `name, addressHint`, then for `name`. When the link has coordinates, the first hit within 300 m wins and gives `lat`, `lng` and `address`; without a match the link's coordinates are used and `address` comes from reverse geocoding. When the link has no coordinates, the first hit inside the trip's bounding box (or the first hit if the trip has none) is used. `placed` is `false` with `lat`/`lng` `null` when no point was found. `title` is the name cut to 120 characters or `null`; `link` is the URL the user gave if it is at most 500 characters, otherwise `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` (or `<name>` when not placed). A geocoder failure gives the link's coordinates and `address: null` instead of an error |

### Getting the link into the board
| ID | Requirement |
| --- | --- |
| R-33-05 | On the board, for planners, board admins and owners, Ctrl/Cmd+V while focus is not in an `input`, `textarea` or `contenteditable` element and no modal is open reads the pasted text; if R-33-01 finds a Google Maps link in it, the board shows a toast “Looking up place…”, calls R-33-02 and opens the add panel with the result. Other pasted text is ignored without a message. An open panel with unsaved changes first asks “Discard unsaved changes?” (C-SPOT-24) |
| R-33-06 | The add panel has a *Google Maps link* / *Google-Maps-Link* field with a *Fill in* / *Übernehmen* button above the address field (planners and up, add mode only). *Fill in* calls R-33-02 and fills the draft the same way; while it runs the button shows a spinner, and errors appear under the field with their translated text |
| R-33-07 | A draft filled from a link sets title (only if empty when filled from the field), address, link and the draft pin, pans the map to the pin, and counts as a change for the discard prompt; everything stays editable before *Add*. With `placed: false` the pin stays unset and a note says “Couldn't place this on the map. Click the map to set the pin.” |
| R-33-08 | `/share?url=&text=&title=` (signed-in users; a signed-out user goes through login and comes back to the same URL) shows “Add to which trip?” with the trips where the user is planner, board admin or owner, the last board they opened preselected (kept in `localStorage`, read and written inside `try/catch`), and a *Continue* button that goes to `/trips/:id?addFrom=<url>&text=<text>`. With no such trip it says “You have no trip you can add spots to” with a link to `/trips`. The board resolves `addFrom` like R-33-05, opens the panel and removes the parameters with `replace`; as visitor the parameters are removed and nothing opens |
| R-33-09 | `apps/web/public/manifest.webmanifest` (linked from `index.html`) has `name`, `short_name`, `start_url: "/trips"`, `display: "standalone"`, theme and background colors, icons of 192 and 512 px plus a maskable one, and `share_target {action: "/share", method: "GET", params: {title: "title", text: "text", url: "url"}}`. A service worker is registered in production builds only; it has a fetch handler that passes every request to the network and caches nothing, so the board and the API behave as before |
| R-33-10 | The account page has a section *Send places from Google Maps* / *Orte aus Google Maps senden* with: a draggable *Send to TripBoard* bookmarklet that opens `<origin>/share?url=<encoded location.href>&title=<encoded document.title>` in a new tab (its `href` set through `setAttribute`), a *Copy* button for the same code, and three short how-tos (desktop bookmark, Android share after installing, iPhone copy and paste into the *Google Maps link* field) |
| R-33-11 | All new texts and the error messages `link_not_google_maps` and `link_resolve_failed` exist in `en` and `de` |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-IMP-06 | modify | R-33-01 |
| C-SPOT-25 | add | R-33-02, R-33-03, R-33-04 |
| C-SPOT-26 | add | R-33-05, R-33-07, R-33-11 |
| C-SPOT-27 | add | R-33-06 |
| C-APP-32 | add | R-33-08 |
| C-APP-33 | add | R-33-09 |
| C-APP-34 | add | R-33-10 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-33-01 | unit | R-33-01 | Parser with recorded real links: `/maps/place/Kinkaku-ji/@35.0394,135.7292,17z/data=…!3d35.0394!4d135.7292` → name and the `!3d!4d` point; `?q=Ichiran+Shibuya` → name, no point; `?q=35.1,135.7` → point, no name; share text `Kinkaku-ji\n1 Kinkakujicho, Kita Ward, Kyoto\nhttps://maps.app.goo.gl/abc` → name and address hint; one-line `Name, Address https://…`; out-of-range coordinates → null. The existing T-23 import parser tests still pass |
| T-33-02 | api | R-33-02 | Planner → 200; visitor 403; other trip 404; `https://example.com/x`, `https://maps.app.goo.gl.evil.com/x`, `https://www.google.com/mail` and text without a URL → 400 `link_not_google_maps`; a URL only in `text` is found; the 21st request within a minute (fake clock) → 429 with `Retry-After` |
| T-33-03 | api | R-33-03 | Against a fake redirect server mapped to the Google hosts by the injectable fetcher: a short link with 2 hops resolves using only `HEAD` and no body read; a hop to `consent.google.com?continue=…` continues with the `continue` URL without requesting the consent page; a hop to `example.com`, 6 hops, a 6 s hang (fake timer) or a 500 → 502 `link_resolve_failed` |
| T-33-04 | api | R-33-04 | With recorded Nominatim fixtures: a link whose name search hits 40 m away → Nominatim point and label, `placed: true`; a first hit 2 km away and a second within 300 m → the second; no hit → the link's point and the reverse-geocoded address; a name-only link inside the trip box → the hit in the box; nothing found → `placed: false` with nulls; a 600-character link is replaced by the `api=1` search URL; Nominatim down → link point with `address: null` |
| T-33-05 | e2e | R-33-05, R-33-07 | Planner (`aiko`) on *Japan 2026* with a fake resolver: paste a Kinkaku-ji share text on the map → toast, add panel with title, address, link and pin, map centered on it; *Add* saves the spot with that link. Paste “hello” → nothing happens. Paste while the search box has focus → only the text goes into the box. Paste a link while another spot has unsaved edits → discard prompt first |
| T-33-06 | e2e | R-33-06, R-33-07 | In the add panel, type a title “Golden Pavilion”, put a link into *Google Maps link*, *Fill in*: title kept, address and pin set; a link the fake marks as unplaceable shows the note and no pin; `https://example.com` shows the translated `link_not_google_maps` error under the field |
| T-33-07 | e2e | R-33-08 | Signed out, open `/share?text=…&url=https://maps.app.goo.gl/abc` → login → back on `/share`; the trip list holds *Japan 2026* preselected after it was last opened; *Continue* opens the board with the filled add panel and a URL without `addFrom`. As `tom`, who is only a visitor, `/share` shows “You have no trip you can add spots to”, and `/trips/:id?addFrom=…` opens nothing and drops the parameter |
| T-33-08 | e2e | R-33-09 | The production build serves `manifest.webmanifest` with the required fields, both icons load, `share_target` matches R-33-09, `index.html` links it, and a service worker is registered whose fetch handler leaves `/api` responses uncached (a changed spot shows its new value after reload) |
| T-33-09 | unit | R-33-10 | The bookmarklet code, run in a fake `window` with `location.href` `https://www.google.com/maps/place/Kinkaku-ji/@35,135,17z` and a title, calls `window.open` with `<origin>/share?url=…&title=…` correctly encoded; the rendered link's `href` attribute starts with `javascript:` and *Copy* writes the same code to the clipboard |
| T-33-10 | a11y | R-33-06, R-33-08, R-33-10 | axe on the add panel with the *Google Maps link* field and an error, on `/share` and on the account page section, in both themes: no serious or critical issue |
| T-33-11 | unit | R-33-11 | The missing-key test covers the new `share.*` and `places.link*` keys and both error codes in `en` and `de` |
| T-33-12 | manual | R-33-01, R-33-03, R-33-09, R-33-10 | On a real Android phone: install TripBoard from Chrome, share three places from the Google Maps app (a temple, a ramen shop, a dropped pin) to TripBoard and add them; on desktop Chrome and Firefox use the bookmarklet on two place pages; on an iPhone copy a link and use *Fill in*. Note in the report which links needed `placed: false` |
