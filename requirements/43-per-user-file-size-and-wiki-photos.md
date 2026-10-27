# Step 43 — Per-user file size limit and Wikipedia photos that fit

**Goal:** a platform admin sets the largest image file per user (default 10 MB, platform default in Settings), and Wikipedia / Commons image links no longer fail because the full original is too big.
**Depends on:** 16, 34
**Result:** In `/admin/users/<aiko>` *Extend storage* set *Max file size* to 20 MB: the user detail shows “Max file size 20 MB · override”, aiko can upload a 15 MB photo and tom still gets “The image is larger than 10 MB.” before anything is sent. Drag a large photo from a Wikipedia article (or paste its `upload.wikimedia.org` original link, or a `…/wiki/File:…` or `#/media/File:…` link) into a spot's gallery: it is added, and a page link gets the Commons credit and license
**Core:** —
**Status:** planned

## Scope
- In: `users.max_file_bytes` override and `app_settings.default_max_file_bytes`; the effective limit in `POST /spots/:id/images`, `from-url` and `from-commons`; `maxFileBytes` in `GET /me/quota` and in the 413 `too_large` body; the admin user detail, *Extend storage* and Settings fields; the client size check before upload and the limit in the error text (en + de); rewriting Wikimedia original and oversized thumbnail URLs to the 2048 px rendition; Wikipedia / Commons `File:` page links stored like a Commons suggestion; docs (`docs/PROJECT_SCOPE.md` §5.7 and decision 15, `docs/database/DATABASE.md`).
- Out: users choosing their own lower limit (not wanted); a per-file limit in quota requests (`POST /me/quota-requests` stays images and bytes, step 16 owns it); the per-file limit column in the admin users table and its filters (C-ADMIN-04 unchanged); changing the 2048 px / WebP 80 processing (C-IMG-02); image files hosted on other wikis or sites (only `upload.wikimedia.org`, `commons.wikimedia.org` and `*.wikipedia.org` are recognised).

## Current behavior
| Topic | Today |
| --- | --- |
| File limit | One hard limit for everyone: `maxUploadBytes = 10 MiB` in `packages/shared/src/images.ts`, used by the multipart parser, the global Fastify `bodyLimit` (12 MiB) and the `from-url` download cap (C-IMG-01, C-IMG-13). Admins can only change image count and total bytes per user |
| Error text | `images.errors.too_large` is the fixed “The image is larger than 10 MB.”; the client finds out only after sending the file |
| Wikipedia photos | Dragging a photo out of a Wikipedia media viewer or pasting its original link sends `upload.wikimedia.org/wikipedia/commons/a/ab/<file>`, often 15–40 MB; the download stops at 10 MB and the user sees 413 `too_large`. A `…/wiki/File:<file>` or `#/media/File:<file>` link is an HTML page and fails as not an image. *Suggested photos* works because it already asks for a 2048 px rendition (C-IMG-16) |

## Decisions
| Topic | Decision |
| --- | --- |
| Default stays 10 MB | The user first asked for 4.5 MB, then chose to keep 10 MB once it was clear that 4.5 MB would lower today's limit and make the Wikipedia failures more frequent |
| Who sets it | Only the platform admin, like the image and byte overrides: a per-user override in *Extend storage* and a platform default in Settings. `NULL` means the default |
| Range | 1 MB to 50 MB, whole MiB in the UI (stored in bytes). 50 MB bounds the request body the API accepts and the memory `sharp` gets |
| Wikimedia | Images are resized to 2048 px anyway (C-IMG-02), so a Wikimedia link is turned into the 2048 px rendition before downloading; the per-file limit then rarely matters for it. A `File:` page link reuses the `from-commons` path so it gets license check and credit |
| Units | “MB” in texts means MiB, as in the rest of the app (C-IMG-10) |

## Requirements

### Limit and API
| ID | Requirement |
| --- | --- |
| R-43-01 | Migration `0007_file_size_limit.sql`: `users.max_file_bytes bigint NULL CHECK (max_file_bytes BETWEEN 1048576 AND 52428800)` and `app_settings.default_max_file_bytes bigint NOT NULL DEFAULT 10485760` with the same check. `user_quota_usage` gains `max_file_bytes = COALESCE(u.max_file_bytes, s.default_max_file_bytes)`, and `has_override` is also true when only `max_file_bytes` is set. `admin_user_overview` keeps its columns |
| R-43-02 | `packages/shared` replaces `maxUploadBytes` with `fileSizeLimits = {min: 1 MiB, max: 50 MiB, default: 10 MiB}`. `POST /spots/:id/images` reads the uploader's effective `max_file_bytes` before reading the body and passes it as the multipart `fileSize` limit; the route's own `bodyLimit` is `max + 2 MiB`, the global `bodyLimit` stays 12 MiB for every other route. A file over the effective limit (also a `Content-Length` above limit + 2 MiB, rejected before the body is read) is 413 `{code: "too_large", maxFileBytes}` and nothing is stored |
| R-43-03 | `from-url` (C-IMG-13) stops the download after the caller's effective `max_file_bytes` instead of 10 MB, and `from-commons` (C-IMG-16) applies the same cap; both answer 413 `{code: "too_large", maxFileBytes}` |
| R-43-04 | `GET /me/quota` returns `{usedImages, maxImages, usedBytes, maxBytes, maxFileBytes}` with the effective value |
| R-43-05 | `PATCH /admin/users/:id/quota` also takes `maxFileBytes` (integer bytes, 1–50 MiB, else 400 with the field named); `reset: true` clears all three overrides. The audit row's `before` / `after` contain `maxFileBytes`, and `GET /admin/users/:id` returns `maxFileBytes` and whether it is the default or an override |
| R-43-06 | `GET` / `PATCH /admin/settings` read and change `defaultMaxFileBytes` (same range and 400), applied at once to users without an override and not to users with one; each change has its audit row |

### Admin UI
| ID | Requirement |
| --- | --- |
| R-43-07 | The user detail storage section shows “Max file size 20 MB” with the same *default* / *override* label as the bars. *Extend storage* has a *Max file size (MB)* number field (1–50, prefilled with the effective value; out of range disables *Save* with “Between 1 and 50 MB”), and *Reset to default* resets it too. The admin Settings page has *Default max file size (MB)* with the same range. New texts in `en` and `de` (*Maximale Dateigröße*) |

### Upload UI
| ID | Requirement |
| --- | --- |
| R-43-08 | The gallery drop zone and the add-mode *Photos* queue (C-IMG-18) check each chosen, dropped or pasted file against `maxFileBytes` from `GET /me/quota` before sending: a larger file is not sent and shows “The image is larger than 20 MB.” / “Das Bild ist größer als 20 MB.” with the user's limit; other files of the same drop still upload |
| R-43-09 | `images.errors.too_large` takes the limit as a value (“The image is larger than {{limit}}.”); `photoErrorMessage` fills it from the 413 body's `maxFileBytes`, falling back to the cached `GET /me/quota` value, and a 413 `quota_exceeded` still shows “Image limit reached” |

### Wikipedia and Commons links
| ID | Requirement |
| --- | --- |
| R-43-10 | Before downloading, `from-url` rewrites `https://upload.wikimedia.org/wikipedia/<project>/<h1>/<h2>/<name>` with a `.jpg`, `.jpeg`, `.png` or `.webp` name (any case) to `…/wikipedia/<project>/thumb/<h1>/<h2>/<name>/2048px-<name>`, and a `…/thumb/…/<N>px-<name>` URL with N > 2048 to the same with `2048px-`; a thumb of 2048 px or less and every other URL stay as they are. If the rewritten URL answers non-2xx (the original is smaller than 2048 px), the original URL is downloaded instead. The address checks of C-IMG-13 apply to every URL actually fetched, and `source_url` is the URL the user gave |
| R-43-11 | A `from-url` link on `commons.wikimedia.org`, `<lang>.wikipedia.org` or `<lang>.m.wikipedia.org` whose path is `/wiki/File:<name>` (or `/wiki/Datei:<name>`), or any `/wiki/…` page with a fragment `#/media/File:<name>`, is stored exactly like `POST /spots/:id/images/from-commons {fileTitle: "File:<name>"}` (percent-decoded name): license check 422 `license_not_allowed`, 409 `already_added`, credit and license, `metadata.source = "commons"`. A file Commons does not know (a local Wikipedia file) is 422 `fetch_failed` |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-IMG-21 | add | R-43-01, R-43-02, R-43-03 |
| C-IMG-22 | add | R-43-10, R-43-11 |
| C-IMG-01 | modify | R-43-02 |
| C-IMG-07 | modify | R-43-04 |
| C-IMG-10 | modify | R-43-08, R-43-09 |
| C-IMG-13 | modify | R-43-03, R-43-10, R-43-11 |
| C-IMG-16 | modify | R-43-03 |
| C-IMG-18 | modify | R-43-08 |
| C-ADMIN-05 | modify | R-43-07 |
| C-ADMIN-06 | modify | R-43-05, R-43-07 |
| C-ADMIN-18 | modify | R-43-06, R-43-07 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-43-01 | db | R-43-01 | On a migrated database: `default_max_file_bytes` is 10485760; setting `max_file_bytes` or the default to 1048575 or 52428801 fails the check; a user with only `max_file_bytes = 20 MiB` has `max_file_bytes` 20971520 and `has_override` true in `user_quota_usage`, a user without overrides gets the default; `docs/database/checks.sql` passes |
| T-43-02 | api | R-43-02, R-43-05 | tom (no override) uploads an 11 MB JPEG → 413 `{code: "too_large", maxFileBytes: 10485760}`, nothing in MinIO; admin sets aiko `maxFileBytes` 20 MiB → aiko's 15 MB JPEG → 201; a request with `Content-Length` of 30 MiB for aiko → 413 without the body being read |
| T-43-03 | api | R-43-06 | Admin sets `defaultMaxFileBytes` to 5 MiB → tom's 6 MB upload 413 with `maxFileBytes` 5242880, aiko (20 MiB override) still 201; one audit row with before / after |
| T-43-04 | api | R-43-05, R-43-06 | `PATCH /admin/users/:id/quota` and `PATCH /admin/settings` with `maxFileBytes` / `defaultMaxFileBytes` of 0, 500000, 60 MiB and 1.5 → 400 naming the field, nothing changed; `reset: true` clears `max_file_bytes` with the other two; the audit row's `before` / `after` contain `maxFileBytes`; `GET /admin/users/:id` shows the value and the override flag |
| T-43-05 | api | R-43-04 | `GET /me/quota` returns `maxFileBytes` 10485760 for tom and 20971520 for aiko after the override |
| T-43-06 | api | R-43-03 | With the injected fetch serving a 12 MB JPEG: `from-url` by tom → 413 `too_large` with `maxFileBytes`; by aiko with a 20 MiB override → 201. `from-commons` whose rendition is 12 MB → 413 for tom |
| T-43-07 | unit | R-43-10, R-43-11 | `apps/api/src/images/wikimedia.test.ts`: the rewrite function maps an original `.JPG` to its `2048px-` thumb, a `3840px-` thumb to `2048px-`, leaves a `250px-` thumb, an original `.svg` / `.gif` and a non-Wikimedia URL unchanged, keeps percent-encoded names intact, and returns `{fileTitle: "File:Kinkaku-ji 2019.jpg"}` for `commons.wikimedia.org/wiki/File:Kinkaku-ji_2019.jpg`, `de.m.wikipedia.org/wiki/Datei:…` and `en.wikipedia.org/wiki/Kinkaku-ji#/media/File:…` |
| T-43-08 | api | R-43-10 | `from-url` with an original `upload.wikimedia.org` URL whose fixture is 15 MB and whose `2048px-` thumb is 300 KB → 201, the fake fetch saw only the thumb URL, `source_url` is the given URL; with the thumb answering 404 and a 1 MB original → the original is fetched and stored; a rewritten URL resolving to a private address → 400 `url_not_allowed` |
| T-43-09 | api | R-43-11 | `from-url` with a Commons `File:` page link and a Wikipedia `#/media/File:` link (recorded Commons fixtures) → 201 with `source_url` = description page, credit, license and an `image.upload` event with `metadata.source = "commons"`; a non-free license → 422 `license_not_allowed`; the same file again on the spot → 409 `already_added`; a file unknown to Commons → 422 `fetch_failed` |
| T-43-10 | unit | R-43-09 | `apps/web/src/images/reasons.test.ts`: a 413 `too_large` with `maxFileBytes` 20971520 → “The image is larger than 20 MB.” (en) and “Das Bild ist größer als 20 MB.” (de); without `maxFileBytes` the cached quota value is used; a 413 `quota_exceeded` → “Image limit reached” |
| T-43-11 | e2e | R-43-08 | `e2e/file-size-limit.spec.ts`: tom drops an 11 MB and a 1 MB image on a spot's gallery → the message names 10 MB, no request is made for the 11 MB file (route spy) and the 1 MB one is added; the same in add mode leaves the 11 MB file out of the queue |
| T-43-12 | e2e | R-43-07 | Same file: sven opens aiko → *Extend storage*, enters 60 → *Save* disabled with “Between 1 and 50 MB”; enters 20 and a reason → “Max file size 20 MB · override” and an Audit log entry; Settings → *Default max file size* 12 → tom's user detail shows “12 MB · default”; aiko can then drop the 11 MB image and it is added |
| T-43-13 | a11y | R-43-07 | `e2e/a11y.spec.ts`: the user detail with *Extend storage* open and the admin Settings page pass axe with the new fields, each field has a label, and `en` / `de` have no missing keys |
