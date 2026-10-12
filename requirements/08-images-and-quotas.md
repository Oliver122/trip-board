# Step 08 — Images & quotas

**Goal:** planners upload photos to spots; storage cannot be flooded.
**Depends on:** 07
**Result:** Upload photos to a spot; limits enforced
**Core:** C-IMG-01, C-IMG-02, C-IMG-03, C-IMG-04, C-IMG-05, C-IMG-06, C-IMG-07, C-IMG-08, C-IMG-09, C-IMG-10, C-IMG-11, C-IMG-12
**Status:** integrated 2026-10-11

## Scope
- In: upload endpoint, `sharp` processing, S3-compatible storage (MinIO locally), per-user quota, gallery in the panel, delete image, blob cleanup worker, quota display in panel and account page.
- Out: image editing/cropping, captions.

## Requirements
| ID | Requirement |
| --- | --- |
| R-08-01 | `POST /spots/:id/images` (planner+), multipart, one file per request. Accepted: JPEG, PNG, WebP, HEIC. Rejected before processing if > 10 MB or the type sniffed from content is not allowed |
| R-08-02 | Processing: auto-rotate, strip metadata (EXIF/GPS), resize to max 2048 px longest side, encode WebP (quality 80) |
| R-08-03 | Quota: `used_images + 1 ≤ max_images` and `used_bytes + new ≤ max_bytes` (post-compression, effective limits from `user_quota_usage`: per-user override or platform default), checked in a transaction holding `SELECT … FOR UPDATE` on the user row. Otherwise 413 with current usage |
| R-08-04 | Stored as `trips/<tripId>/spots/<spotId>/<uuid>.webp`; DB row only after a successful upload; on DB failure the object is deleted |
| R-08-05 | Images are served through short-lived signed URLs (10 min), only to trip members |
| R-08-06 | `DELETE /images/:id` (planner+) removes the row; the trigger queues the blob; a worker deletes it with retries |
| R-08-07 | `GET /me/quota` returns `{usedImages, maxImages, usedBytes, maxBytes}` |
| R-08-08 | Panel gallery: thumbnails, drag-drop or click to add, upload progress, delete, lightbox. Shows “12/100 · 18 MB of 200 MB” |
| R-08-09 | Upload rate limit: 30 uploads per user per minute (429) |
| R-08-10 | Account page shows quota usage as a progress bar |
| R-08-11 | When `app_settings.uploads_enabled` is false, uploads return 503 “Uploads are paused” and the drop zone shows that message |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-08-01 | api | R-08-01, R-08-02 | A 4000×3000 JPEG with GPS EXIF → stored WebP is 2048×1536 with no EXIF; row has the correct `bytes`/`width`/`height` |
| T-08-02 | api | R-08-01 | 11 MB file → 413; a `.jpg` that is really a PDF → 415; nothing stored |
| T-08-03 | api | R-08-03 | User with `max_images=2` and 2 images → 3rd upload returns 413 with usage |
| T-08-04 | api | R-08-03 | User with 1 slot left sends 2 uploads in parallel → exactly one succeeds |
| T-08-05 | api | R-08-03 | Byte limit: upload exceeding `max_bytes` after compression → 413 |
| T-08-06 | api | R-08-04 | Simulated DB failure after upload → object removed from MinIO |
| T-08-07 | api | R-08-05 | Non-member cannot get a signed URL (404); the URL expires after 10 min (fake clock) |
| T-08-08 | api | R-08-06 | Deleting an image, a spot, or a trip results in the objects being gone from MinIO after the worker runs |
| T-08-09 | api | R-08-09 | 31st upload within a minute → 429 |
| T-08-10 | api | R-08-01 | Visitor upload → 403 |
| T-08-11 | e2e | R-08-08 | Planner drags 2 images into the panel → progress, thumbnails, counter updates; lightbox opens on click |
| T-08-13 | api | R-08-11 | Uploads disabled → 503, nothing stored; re-enabled → upload works |
| T-08-12 | e2e | R-08-08, R-08-10 | With quota full, the drop zone is disabled with the message “Image limit reached” |
