# Core — Images

Photos on spots: the upload endpoint with its checks and processing, the per-user storage quota as it is enforced on upload, signed image URLs, deleting images and their blobs, the upload rate limit and pause switch, and the gallery in the spot panel and the quota bar on the account page. The photos belong to [spots](./spots.md); the platform admin sets quota overrides, defaults and the uploads switch in [admin](./admin.md), and deleting a trip also removes its blobs ([trips](./trips.md)).

## Upload

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-IMG-01 | `POST /spots/:id/images` (planner, board admin, owner) takes one multipart file per request; a visitor gets 403 and a non-member 404. The type is sniffed from the file content and only JPEG, PNG, WebP and HEIC are accepted: a file over 10 MB is 413 `too_large`, any other type (a PDF named `.jpg`) is 415 `unsupported_media`, and nothing is stored in either case. A URL can also be stored through `from-url` (C-IMG-13). <!-- R-08-01, R-34-03 --> | active | 08 | 34 | T-08-02, T-08-10, T-34-01, T-34-02 |
| C-IMG-02 | An accepted image is auto-rotated, stripped of EXIF and GPS metadata, resized to at most 2048 px on the longest side (never enlarged) and encoded as WebP quality 80; the row stores the resulting `bytes`, `width` and `height`. <!-- R-08-02 --> | active | 08 | — | T-08-01 |
| C-IMG-03 | The quota is checked on the processed size: an upload needs `used_images + 1 ≤ max_images` and `used_bytes + new ≤ max_bytes`, where the limits are the uploader's override or the platform default (100 images and 200 MiB), read inside a transaction that holds `SELECT … FOR UPDATE` on the user row so parallel uploads cannot both take the last slot. Otherwise the answer is 413 `quota_exceeded` with the current usage. <!-- R-08-03 --> | active | 08 | — | T-08-03, T-08-04, T-08-05 |
| C-IMG-04 | The WebP is stored as `trips/<tripId>/spots/<spotId>/<uuid>.webp` and the database row is written only after the upload succeeded; if the database write fails the stored object is deleted again. <!-- R-08-04 --> | active | 08 | — | T-08-06 |
| C-IMG-05 | At most 30 uploads per user per minute are accepted; the 31st within a minute is 429 `rate_limited`. Files rejected for size or type do not count. <!-- R-08-09 --> | active | 08 | — | T-08-09 |
| C-IMG-06 | When `app_settings.uploads_enabled` is false every upload is 503 `uploads_paused` (“Uploads are paused”) and nothing is stored; uploads work again once it is switched back on. <!-- R-08-11 --> | active | 08 | — | T-08-13 |
| C-IMG-07 | `GET /me/quota` returns the caller's `{usedImages, maxImages, usedBytes, maxBytes}` with the effective limits. <!-- R-08-07 --> | active | 08 | — | T-08-01 |

## Reading and deleting

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-IMG-08 | `GET /spots/:id/images` and `GET /images/:id` (any member) return image records with a signed URL that is valid for 10 minutes; a non-member gets 404 and cannot obtain a URL, and `GET /images/:id/file` serves the WebP only for an unexpired, valid signature (otherwise 403). <!-- R-08-05 --> | active | 08 | — | T-08-07 |
| C-IMG-09 | `DELETE /images/:id` (planner, board admin, owner) → 204 removes the row; a database trigger queues the blob, and a worker deletes queued blobs with retries (up to 10 attempts, waiting longer after each failure). Deleting a spot or a trip queues its images the same way. <!-- R-08-06 --> | active | 08 | — | T-08-08 |

## Interface

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-IMG-10 | The spot panel gallery shows thumbnails, a drop zone that takes dropped or chosen files (several at once) with upload progress, a delete button and a lightbox, and the counter “12/100 · 18 MB of 200 MB”; read-only members see the thumbnails and the lightbox but no drop zone or delete. The drop zone is focusable and also takes pasted files, dropped or pasted `data:image/…` URIs (also as `<img src>` in dropped HTML) and `http(s)` image URLs (`text/uri-list`, `text/plain` or an `<img src>`; a Google `…/imgres?imgurl=<x>` link is unwrapped to `<x>`), which go to C-IMG-13; other text shows “This is not an image or image link”. <!-- R-08-08, R-34-02 --> | active | 08 | 34 | T-08-11, T-34-04, T-34-05 |
| C-IMG-11 | When the quota is full the drop zone is disabled with “Image limit reached”, and when uploads are paused it shows “Uploads are paused”. <!-- R-08-08, R-08-11 --> | active | 08 | — | T-08-12 |
| C-IMG-12 | The account page shows the user's quota usage as a progress bar with the same “used/max · MB” text. <!-- R-08-10 --> | active | 08 | — | — |

## Photos from the web and Wikimedia Commons

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-IMG-13 | `POST /spots/:id/images/from-url {url}` (planner, board admin, owner; visitor 403, non-member 404) downloads an `http(s)` URL of at most 2000 characters on port 80 or 443 and stores it through the upload pipeline with the codes of `POST /spots/:id/images`. The API downloads with a TripBoard User-Agent, follows at most 3 redirects, gives up after 10 s (422 `fetch_failed`), stops after 10 MB (413 `too_large`) and treats a non-2xx answer as 422 `fetch_failed`. It only connects to public addresses: every resolved and connected IP, also after redirects, must not be loopback, private, link-local, CGNAT, multicast, unspecified, IPv6 unique-local or an IPv4-mapped form of those, otherwise 400 `url_not_allowed`, and the connection uses the checked IP. It records `image.upload` with `metadata.source = "url"` in the same transaction. <!-- R-34-03, R-34-04, R-34-06 --> | active | 34 | — | T-34-01, T-34-02, T-34-03 |
| C-IMG-14 | Images have nullable `source_url` (≤ 2000), `credit` (≤ 300) and `license` (≤ 100). A URL photo stores its final URL in `source_url` and the lightbox shows “Source: <host>” as a link (new tab, `rel="noopener noreferrer"`); uploaded files leave all three null. <!-- R-34-05 --> | active | 34 | — | T-34-01, T-34-05, T-34-12 |
| C-IMG-15 | `GET /trips/:id/photo-suggestions?lat=&lng=` (planner, board admin, owner; visitor 403, non-member 404, out-of-range point 400) asks Commons for files within 150 m and returns up to 8 `{fileTitle, thumbUrl, width, height, artist, license, descriptionUrl}`, only JPEG, PNG and WebP under CC0, Public Domain, CC BY or CC BY-SA; an upstream error or 5 s timeout is 502 `commons_failed`. Answers are cached 7 days in `commons_cache` keyed by the point rounded to 4 decimals, and the cleanup job removes older rows. <!-- R-34-07, R-34-08 --> | active | 34 | — | T-34-06, T-34-12 |
| C-IMG-16 | `POST /spots/:id/images/from-commons {fileTitle}` (same roles and codes as C-IMG-13) looks the file up on Commons again, rejects a type or license outside the allowed set with 422 `license_not_allowed`, downloads a rendition of at most 2048 px from `upload.wikimedia.org` only and stores it through the upload pipeline with `source_url` = the description page, `credit` = artist and `license`. The same file twice on one spot is 409 `already_added`; it records `image.upload` with `metadata.source = "commons"`. <!-- R-34-09 --> | active | 34 | — | T-34-07 |
| C-IMG-17 | The gallery (planner, board admin, owner) has a collapsed *Suggested photos* / *Fotovorschläge* button; opening it loads the suggestions for the spot's point (nothing is requested before), each with artist, license and an *Add* button, files already on the spot left out, with a loading skeleton, “No free photos found near this place”, a retry line on error and a footer “From Wikimedia Commons”. The lightbox credits a Commons photo as “Photo: <artist> · <license> · Wikimedia Commons”, linked to `source_url`. <!-- R-34-10, R-34-11 --> | active | 34 | — | T-34-08, T-34-11 |
| C-IMG-18 | In add mode the panel shows a *Photos* section once the draft has a pin, taking the same drops and pastes as the gallery and offering the suggestions for the draft pin (opened and loaded at once when the draft came from a Google Maps link); picked photos are queued as previews with a remove button, at most 4, and a queued photo counts as a change for the discard prompt. After *Add* creates the spot the panel closes as before and the client sends the queued photos one after another; if any fails one toast says “Spot added. 1 photo could not be added: <reason>” and the spot is never rolled back. <!-- R-34-12, R-34-13 --> | active | 34 | — | T-34-09, T-34-11 |
| C-IMG-19 | For planners, board admins and owners the gallery shows *Find images on Google* / *Bilder bei Google suchen*, a link to `https://www.google.com/search?tbm=isch&q=<title> <address>` in a new tab with `rel="noopener noreferrer"`, hidden when the title is empty and for visitors. The new texts and the errors `url_not_allowed`, `fetch_failed`, `commons_failed`, `license_not_allowed` and `already_added` exist in `en` and `de`. <!-- R-34-01, R-34-14 --> | active | 34 | — | T-34-05, T-34-10, T-34-13 |

## Known gaps

- C-IMG-12: no DoD test covers the quota progress bar on the account page (R-08-10); T-08-12 only checks the drop zone.
- C-IMG-11: the “Uploads are paused” drop zone message (R-08-11) has no UI test; T-08-13 is an API test and T-08-12 covers only the full-quota message.
- C-IMG-10: R-08-08 does not say what read-only members see; the rule describes `canEdit` handling in `apps/web/src/images/Gallery.tsx`, which no DoD test checks.
- C-IMG-07: `GET /me/quota` is only checked as a side effect of T-08-01, there is no DoD test of its own for R-08-07.
