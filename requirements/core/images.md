# Core — Images

Photos on spots: the upload endpoint with its checks and processing, the per-user storage quota as it is enforced on upload, signed image URLs, deleting images and their blobs, the upload rate limit and pause switch, and the gallery in the spot panel and the quota bar on the account page. The photos belong to [spots](./spots.md); the platform admin sets quota overrides, defaults and the uploads switch in [admin](./admin.md), and deleting a trip also removes its blobs ([trips](./trips.md)).

## Upload

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-IMG-01 | `POST /spots/:id/images` (planner, board admin, owner) takes one multipart file per request; a visitor gets 403 and a non-member 404. The type is sniffed from the file content and only JPEG, PNG, WebP and HEIC are accepted: a file over 10 MB is 413 `too_large`, any other type (a PDF named `.jpg`) is 415 `unsupported_media`, and nothing is stored in either case. <!-- R-08-01 --> | active | 08 | — | T-08-02, T-08-10 |
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
| C-IMG-10 | The spot panel gallery shows thumbnails, a drop zone that takes dropped or chosen files (several at once) with upload progress, a delete button and a lightbox, and the counter “12/100 · 18 MB of 200 MB”; read-only members see the thumbnails and the lightbox but no drop zone or delete. <!-- R-08-08 --> | active | 08 | — | T-08-11 |
| C-IMG-11 | When the quota is full the drop zone is disabled with “Image limit reached”, and when uploads are paused it shows “Uploads are paused”. <!-- R-08-08, R-08-11 --> | active | 08 | — | T-08-12 |
| C-IMG-12 | The account page shows the user's quota usage as a progress bar with the same “used/max · MB” text. <!-- R-08-10 --> | active | 08 | — | — |

## Known gaps

- C-IMG-12: no DoD test covers the quota progress bar on the account page (R-08-10); T-08-12 only checks the drop zone.
- C-IMG-11: the “Uploads are paused” drop zone message (R-08-11) has no UI test; T-08-13 is an API test and T-08-12 covers only the full-quota message.
- C-IMG-10: R-08-08 does not say what read-only members see; the rule describes `canEdit` handling in `apps/web/src/images/Gallery.tsx`, which no DoD test checks.
- C-IMG-07: `GET /me/quota` is only checked as a side effect of T-08-01, there is no DoD test of its own for R-08-07.
