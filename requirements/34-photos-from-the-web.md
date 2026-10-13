# Step 34 — Add spot photos from Google Images and Wikimedia Commons

**Goal:** a planner gets a photo into a spot without saving it to disk first, either by dragging or pasting a picture from Google Images or by adding a freely licensed photo that Wikimedia Commons suggests for the spot's location.
**Depends on:** 08, 33
**Result:** As planner, open *Kinkaku-ji*, click *Find images on Google*, drag a picture from the Google tab onto the gallery: it uploads and appears like any other photo, with its source in the lightbox. Open *Suggested photos*: Commons photos taken near the temple show with author and license; *Add* one and the lightbox credits it. When a place comes in from a Google Maps link, the add panel shows those suggestions straight away, and photos picked there are added right after *Add*
**Core:** C-IMG-01, C-IMG-10, C-IMG-13, C-IMG-14, C-IMG-15, C-IMG-16, C-IMG-17, C-IMG-18, C-IMG-19
**Status:** integrated 2026-10-12

## Scope
- In: paste of image files into the gallery, dropping or pasting an image URL or `data:` image, `POST /spots/:id/images/from-url` with a safe server-side download, *Find images on Google* link, Wikimedia Commons suggestions near the spot (`GET /trips/:id/photo-suggestions`, `POST /spots/:id/images/from-commons`), source and credit on images, queued photos in add mode, a `commons_cache` table.
- Out: Google place photos from the Places API (not planned, see step 33 Decisions); choosing a cover photo or reordering; image editing; photos in the import dialog (step 23); checking the copyright of a dropped image, which stays with the uploader like any upload (C-IMG-01).

## Current behavior
| Topic | Today |
| --- | --- |
| Adding photos | The gallery (`images/Gallery.tsx`) takes dropped or chosen *files* only (C-IMG-10). A picture dragged from another browser tab arrives as a URL or HTML, not as a file, so nothing happens; a copied image cannot be pasted |
| Add mode | The gallery only renders once the spot exists (`spot ? <Gallery …/> : null` in `spots/SpotPanel.tsx`), and the panel closes after *Add* (C-SPOT-20), so a new spot never gets a photo in the same flow |
| Source | An image row has no source or credit |

## Decisions
| Topic | Decision |
| --- | --- |
| Google Images | The board cannot read Google's results, so the user stays in charge: *Find images on Google* opens the image search in a new tab, and whatever the user drags or pastes back is handled. Google Images drags usually carry a `data:` thumbnail, an `imgres?imgurl=` link or the image URL, so all three are understood |
| Server download | A URL is downloaded by the API, not the browser (no CORS problems, the same checks as an upload). Because the server fetches a URL the user chose, the fetch only goes to public internet addresses (SSRF protection), with the check made on the IP actually connected to |
| Same pipeline | Every web photo goes through the upload pipeline of step 08 (type sniffing, 10 MB, resize, WebP, quota, rate limit, upload switch) and counts against the planner's quota like an upload |
| Commons | Wikimedia Commons is free, needs no key and its photos may be stored with credit. Suggestions come from Commons' geosearch around the spot point; small places often have none, then the strip says so. Only licenses that allow reuse with credit are offered |

## Requirements

### Photos from Google and other sites
| ID | Requirement |
| --- | --- |
| R-34-01 | For planners, board admins and owners the gallery shows *Find images on Google* / *Bilder bei Google suchen*, a link to `https://www.google.com/search?tbm=isch&q=<title> <address>` (URL-encoded) in a new tab with `rel="noopener noreferrer"`; hidden when the title is empty |
| R-34-02 | The drop zone is focusable and accepts paste (Ctrl/Cmd+V) while it or the gallery has focus. Pasted or dropped *files* upload as before (C-IMG-10). A dropped or pasted `data:image/…` URI (also as `<img src>` inside dropped HTML) is turned into a file and uploaded the normal way. Any other dropped or pasted `http(s)` URL (`text/uri-list`, `text/plain` or the `src` of a dropped `<img>`) goes to R-34-03; a Google `…/imgres?imgurl=<x>` link is unwrapped to `<x>` first. Text that is not a URL shows “This is not an image or image link” |
| R-34-03 | `POST /spots/:id/images/from-url {url}` (planner, board admin, owner; visitor 403, non-member 404) downloads the URL and stores it through the upload pipeline with the same codes as `POST /spots/:id/images` (413 `too_large`, 415, 413 quota, 429, 503 `uploads_paused`). `url` is an `http(s)` URL of at most 2000 characters on port 80 or 443 (else 400 `fields.url`). The download sends a TripBoard User-Agent, follows at most 3 redirects, gives up after 10 s (422 `fetch_failed`), stops reading after 10 MB (413 `too_large`) and treats a non-2xx answer as 422 `fetch_failed` |
| R-34-04 | The download only connects to public addresses: the host is resolved by the API and every resolved and connected IP, also after each redirect, must not be loopback, private (RFC 1918), link-local (incl. `169.254.169.254`), CGNAT, multicast, unspecified, IPv6 unique-local or IPv4-mapped forms of those; otherwise 400 `url_not_allowed` and no request is made to that address. The connection uses the checked IP (no second DNS lookup) |
| R-34-05 | Images get nullable `source_url` (≤ 2000), `credit` (≤ 300) and `license` (≤ 100) columns with a migration. A URL photo stores the final URL after redirects in `source_url`; the lightbox shows “Source: <host>” as a link (new tab, `rel="noopener noreferrer"`). Uploaded files leave all three null and look as before |
| R-34-06 | A URL photo records an `image.upload` activity event in the same transaction with `metadata.source = "url"` |

### Wikimedia Commons suggestions
| ID | Requirement |
| --- | --- |
| R-34-07 | `GET /trips/:id/photo-suggestions?lat=&lng=` (planner, board admin, owner; visitor 403, non-member 404; `lat`/`lng` in range else 400) asks the Commons API (`COMMONS_BASE_URL`, default `https://commons.wikimedia.org`, with a User-Agent naming the app) for files within 150 m (`list=geosearch`, namespace 6) and their `imageinfo` (`extmetadata`, a 320 px thumbnail). It returns up to 8 `{fileTitle, thumbUrl, width, height, artist, license, descriptionUrl}` with `artist` as plain text, keeping only JPEG, PNG and WebP files under CC0, Public Domain, CC BY or CC BY-SA (any version). An upstream error or 5 s timeout is 502 `commons_failed` |
| R-34-08 | Suggestion answers are cached for 7 days in a new `commons_cache` table keyed by the point rounded to 4 decimals, so a second request for the same place does not call Commons; the existing cleanup job removes older rows |
| R-34-09 | `POST /spots/:id/images/from-commons {fileTitle}` (same roles and codes as R-34-03) looks the file up through the Commons API again (the client's URLs are never trusted), rejects a file outside the allowed types or licenses with 422 `license_not_allowed`, downloads a rendition of at most 2048 px from `upload.wikimedia.org` only, and stores it through the upload pipeline with `source_url` = the file's description page, `credit` = artist and `license` = the license short name. The same file twice on one spot is 409 `already_added`. It records `image.upload` with `metadata.source = "commons"` |
| R-34-10 | For planners, board admins and owners the gallery has a collapsed *Suggested photos* / *Fotovorschläge* button; opening it loads the suggestions for the spot's point (nothing is requested before). Each thumbnail shows artist and license and has an *Add* button; files already added to the spot are left out. It shows a skeleton while loading, “No free photos found near this place” when empty and a retry line on error, and the strip footer says “From Wikimedia Commons” with a link |
| R-34-11 | The lightbox shows a Commons photo's credit as “Photo: <artist> · <license> · Wikimedia Commons”, linked to `source_url` |

### Add mode
| ID | Requirement |
| --- | --- |
| R-34-12 | In add mode the panel shows a *Photos* section once the draft has a pin: it takes the same drops and pastes as R-34-02 and offers the suggestions of R-34-10 for the draft pin; when the draft was filled from a Google Maps link (step 33) the suggestions open and load at once. Picked photos are queued as small previews with a remove button, at most 4. A queued item counts as a change for the discard prompt |
| R-34-13 | After *Add* creates the spot, the client sends the queued photos one after another (files to the upload route, URLs to R-34-03, Commons files to R-34-09) and the panel closes as before; the spot already shows on the map. If any of them fails, one toast says “Spot added. 1 photo could not be added: <reason>”; the spot is never rolled back for a photo |
| R-34-14 | All new texts and error messages (`url_not_allowed`, `fetch_failed`, `commons_failed`, `license_not_allowed`, `already_added`) exist in `en` and `de` |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-IMG-13 | add | R-34-03, R-34-04, R-34-06 |
| C-IMG-14 | add | R-34-05 |
| C-IMG-15 | add | R-34-07, R-34-08 |
| C-IMG-16 | add | R-34-09 |
| C-IMG-17 | add | R-34-10, R-34-11 |
| C-IMG-18 | add | R-34-12, R-34-13 |
| C-IMG-19 | add | R-34-01, R-34-14 |
| C-IMG-10 | modify | R-34-02 |
| C-IMG-01 | modify | R-34-03 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-34-01 | api | R-34-03, R-34-05, R-34-06 | A local fixture server (allowed through the injectable resolver of the test setup) serves a 4000×3000 JPEG behind one redirect: `from-url` → 201, stored WebP is 2048×1536, `source_url` is the final URL, an `image.upload` event with `source: "url"` exists in the same transaction (rolled back with the image on a forced DB error) |
| T-34-02 | api | R-34-03 | Fixture serves a PDF → 415; 11 MB → 413 and the read stopped at 10 MB; 404 → 422 `fetch_failed`; 4 redirects → 422; a 12 s response (fake timer) → 422; `ftp://`, port 8080, 2001 characters → 400 `fields.url`; visitor 403, other trip 404, uploads paused 503, full quota 413 |
| T-34-03 | api | R-34-04 | With the real resolver: `http://127.0.0.1/`, `http://10.0.0.5/`, `http://169.254.169.254/latest/meta-data`, `http://[::1]/`, `http://[::ffff:127.0.0.1]/`, a host name resolving to `192.168.1.2`, and a public fixture that redirects to `http://127.0.0.1/` all → 400 `url_not_allowed`, and a listener on 127.0.0.1 received no request |
| T-34-04 | unit | R-34-02 | Drop/paste parser: `data:image/png;base64,…` → File; `https://www.google.com/imgres?imgurl=https%3A%2F%2Fa.example%2Fx.jpg&…` → `https://a.example/x.jpg`; HTML with `<img src>` → its URL; `text/uri-list` with comments → first URL; “hello” → not-an-image error |
| T-34-05 | e2e | R-34-01, R-34-02, R-34-05 | Planner on *Kinkaku-ji*: *Find images on Google* has the image-search URL and `rel`; drop a `text/uri-list` with the fixture image URL onto the gallery → progress, thumbnail, counter +1; the lightbox shows “Source: <host>”; paste a PNG file into the focused drop zone → uploaded |
| T-34-06 | api | R-34-07, R-34-08 | Against recorded Commons fixtures: a point with 10 files returns 8, drops a GIF, a CC BY-NC and a “fair use” file, artist is plain text without HTML; a second request does not call the fake server; a cache row older than 7 days is refetched and removed by the cleanup job; visitor 403, `lat=91` 400, fake answering 500 → 502 |
| T-34-07 | api | R-34-09 | `from-commons` for an allowed file stores it with `source_url`, `credit`, `license` and an event with `source: "commons"`; the same file again → 409; a CC BY-NC file → 422 `license_not_allowed`; a fixture whose rendition URL is not on `upload.wikimedia.org` → 422 and nothing downloaded |
| T-34-08 | e2e | R-34-10, R-34-11 | Planner opens *Suggested photos* on *Kinkaku-ji* (fixtures): no request before the click, then thumbnails with artist and license; *Add* the first → it joins the gallery and leaves the strip; the lightbox shows “Photo: … · CC BY-SA 4.0 · Wikimedia Commons”; a point with no files shows the empty text; a failing fake shows the retry line |
| T-34-09 | e2e | R-34-12, R-34-13 | Planner: *Add new*, set a pin, queue one Commons suggestion and one dropped fixture URL, *Add*: the spot appears, its gallery has both photos in order. Paste a Kinkaku-ji Maps link on the board (step 33): the add panel opens with the suggestion strip already loaded. Again with a queued URL that answers 404: the spot is saved and one toast names the failed photo. A queued photo makes *Cancel* ask “Discard unsaved changes?” |
| T-34-10 | e2e | R-34-01, R-34-10 | Visitor (`tom`) sees neither *Find images on Google* nor *Suggested photos*, and the API answers 403 to both new image routes |
| T-34-11 | a11y | R-34-10, R-34-12 | axe on the spot panel with the suggestion strip open, and on the add panel with two queued photos, in both themes: no serious or critical issue; queued previews and *Add* buttons have accessible names |
| T-34-12 | db | R-34-05, R-34-08 | After migration: the three new `images` columns exist with their length checks, `commons_cache` exists with its `created_at` index, and `docs/database/checks.sql` still passes with its updated count |
| T-34-13 | unit | R-34-14 | The missing-key test covers the new `images.web*` and `images.suggestions*` keys and the new error codes in `en` and `de` |
| T-34-14 | manual | R-34-02, R-34-07 | In Chrome and Firefox with the real sites: drag three different Google Images results onto the gallery (thumbnail grid and opened preview) and add one Commons suggestion for a Kyoto temple; all four end up in the gallery |
