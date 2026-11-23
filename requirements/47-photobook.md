# Step 47 — Photobook: trip photos placed on the map

**Goal:** members collect the trip's photos in a photobook where every photo sits at its place. The place comes from the photo's GPS, read in the browser, or is set by hand. Each photo is linked to the nearby spot when there is one, and the book is laid out day by day as a collage next to the map.
**Depends on:** 08, 38, 43
**Result:** Open *Japan 2026* → *Photobook*. Drop five phone photos: the ones with GPS appear as round thumbnails on the map at the place they were taken (one next to a spot shows that spot's name), and the book shows them on a page per day ("Mon 13 Apr"). A photo without GPS waits under *Not placed yet*; *Place on map* → click the map pins it. The spot's gallery shows the photo linked to it, and the stored file still has no EXIF.
**Core:** C-APP-01, C-APP-03, C-APP-25, C-IMG-09, C-IMG-23, C-IMG-24, C-IMG-25, C-IMG-26, C-IMG-27, C-IMG-28, C-MAP-21
**Status:** planned

## Scope
- In: photo location and capture time on `images`; photos that belong to the trip without a spot; reading GPS and capture time in the browser before upload; linking to the nearest spot; placing or moving a photo by hand; the *Photobook* tab with day pages, a collage layout, map markers and a bulk upload; low-data behaviour; seed photos.
- Out: a printable or PDF photobook (export, later step); captions edited by several people at once with conflict handling (a caption is last-write-wins here); video; face or content recognition; moving photos between trips; photos on the schedule's day route (step 46 draws visits only, a later step can combine them).

## Current behavior
| Topic | Today |
| --- | --- |
| Where photos live | Only in a spot's gallery: `images.spot_id` is `NOT NULL` and the blob key is `trips/<trip>/spots/<spot>/…` (C-IMG-04). A photo of a street or a viewpoint that is no spot has nowhere to go |
| Location and time | The server strips EXIF and GPS on upload (C-IMG-02) and keeps no capture time, so a photo's place and day are lost on upload |
| Browsing | There is no view of all the trip's photos; you open spot after spot |
| Map | Pins are spots only (C-MAP-07) |

## Decisions
| Topic | Decision |
| --- | --- |
| One table | Photobook photos are `images` rows, so quota (C-IMG-03), the per-file limit (C-IMG-21), signed URLs, blob deletion, live `image` events and low data (C-IMG-20) work unchanged. `spot_id` becomes nullable and new columns hold the point and the time |
| Reading EXIF | In the browser with `exifr` (reads JPEG, HEIC and WebP) before the upload, sent as form fields `lat`, `lng`, `takenAt`. The server goes on stripping all metadata from the stored file (C-IMG-02), so the location lives only in the row, where trip members can see it, and nowhere in the file |
| Capture time | `taken_at` is a `timestamp without time zone`: the camera's wall-clock time at the place (`DateTimeOriginal`). Day pages group by its date, which is the day the traveller lived, whatever the viewer's time zone |
| Linking to a spot | On upload and on every manual placement the API links the photo to the nearest spot of the trip within 150 m of its point (`spot_id`), unless the client names a spot. The photo keeps its own point. A photo with no point and no spot is *not placed* |
| Deleting a spot | A spot's photos without their own point (gallery uploads) are deleted with it as today. Photos with their own point stay in the photobook and lose the link |
| Opting out | The upload dialog has *Use photo locations* / *Fotostandorte verwenden* (on by default, kept per device). When it is off, no GPS is sent and every photo lands in *Not placed yet* |

## Requirements

### Data
| ID | Requirement |
| --- | --- |
| R-47-01 | A migration makes `images.spot_id` nullable, adds a foreign key `images(trip_id) → trips ON DELETE CASCADE`, and adds `lat` / `lng` (`double precision`, both null or both set, −90..90 / −180..180), `taken_at timestamp` (nullable), `place_source` (`exif`, `manual` or null) and `caption` (≤ 500 characters, nullable). Deleting a spot deletes its images that have no own point and sets `spot_id` to null on the rest, which still queues the blobs of deleted rows (C-IMG-09). `docs/database/schema.sql`, `DATABASE.md` and `checks.sql` cover it, and `pnpm db:check` passes |

### API
| ID | Requirement |
| --- | --- |
| R-47-02 | `POST /trips/:id/photos` (planner, board admin, owner; visitor 403, non-member 404) takes one multipart file plus optional fields `lat`, `lng`, `takenAt` (`YYYY-MM-DDTHH:MM:SS`), `spotId` and `caption`. It runs the upload pipeline of C-IMG-01..06 and C-IMG-21 with the same codes, stores the blob as `trips/<tripId>/photos/<uuid>.webp`, and answers 201 with the image record. Only one of `lat` / `lng`, a value out of range or a bad `takenAt` is 400 with `fields`, and a `spotId` of another trip is 404. Without `spotId` the photo is linked to the nearest spot within 150 m of its point, if any. `place_source` is `exif` when a point was sent. The write records `image.upload` with `metadata.source = "photobook"` |
| R-47-03 | `GET /trips/:id/photos` (any member) returns every image of the trip, gallery photos included, as `{id, url, width, height, bytes, lat, lng, takenAt, spotId, spotTitle, placeSource, caption, uploadedBy}`. The URL is signed (C-IMG-08). `lat` / `lng` are the photo's own point, else its spot's point, else null. Photos are sorted by `takenAt`, then by `created_at`, with undated photos last |
| R-47-04 | `PATCH /images/:id {lat?, lng?, spotId?, caption?}` (planner, board admin, owner; visitor 403, non-member 404) places, moves or captions a photo. A new point sets `place_source = "manual"` and links the nearest spot within 150 m unless `spotId` is given. `spotId: null` with no point is 400 `would_unplace`, so a photo cannot be lost from both the map and the galleries. It answers 200 with the record and records `image.update` with the changed fields in `metadata` |

### Photobook tab
| ID | Requirement |
| --- | --- |
| R-47-05 | A trip has a *Photobook* / *Fotobuch* tab at `/trips/:id/photos`. It is a child route of the trip layout and shares the one map (C-MAP-16). It sits after *Schedule* in the header and in the phone's *More* sheet. On the phone it opens as the book, with a *Map* toggle |
| R-47-06 | The book shows one page per `takenAt` date ("Mon 13 Apr", "Mo., 13. Apr."), in date order, then *No date* / *Ohne Datum*. Each page is a collage: a justified grid where photos keep their aspect ratio in rows of about 160 px (120 px below 640 px), grouped under a place line (the spot's title, else "Near <reverse-geocoded place>" from the geocode cache). Clicking a photo opens the lightbox (C-IMG-10) with caption, place, time and uploader. Planners can edit the caption there. Loading, empty ("No photos yet — drop your trip photos here") and error states exist |
| R-47-07 | While the tab is active, every placed photo is a 40 px round thumbnail marker on the map with a white ring. Markers cluster with a count, like C-MAP-11. Clicking a marker scrolls the book to the photo and highlights it, clicking a photo in the book flies the map to its marker, and each marker is a button labelled "Photo <time>, <place>". Leaving the tab removes the markers |
| R-47-08 | Planners get a drop zone and a file picker that take up to 50 files at once. For each file the browser reads GPS and `DateTimeOriginal` with `exifr` and shows a review list ("4 with location · 1 without") before *Upload*. Files are sent one after another with progress. A file over `maxFileBytes` is left out with the gallery's message (C-IMG-10), and the other files still upload. With *Use photo locations* off, no `lat` / `lng` is sent. The switch is stored in `localStorage` (`photoLocations`, inside `try/catch`). Reading EXIF never blocks the upload: a file that cannot be read goes up without a point or time |
| R-47-09 | Photos without a point and without a spot are listed in *Not placed yet* / *Noch nicht platziert* at the top of the book. Their *Place on map* button puts the map in placing mode with the cursor "Click where this photo was taken": a click there sends `PATCH` with the point, and Escape cancels. *Pick a spot* chooses a spot from the spot picker instead. A planner can drag a placed photo's marker to move it, which sends `PATCH` with the new point. Visitors see no drop zone, placing controls or draggable markers |
| R-47-10 | While low data is on, markers show an image icon instead of the thumbnail and the book shows the placeholders of C-IMG-20 with *Load photo* and *Load all (<size>)*. No image file or signed URL is requested before that |
| R-47-11 | A photo that is linked to a spot also shows in that spot's gallery (C-IMG-10). Upload, place, caption or delete by another member updates the book and the markers through the live `image` event (C-LIVE-14) without a reload |

### Seed
| ID | Requirement |
| --- | --- |
| R-47-12 | `pnpm db:seed` adds four photobook photos to *Japan 2026*, with their blobs in MinIO: two on one day with a point (one within 150 m of a seeded spot and linked to it), one on another day with a point and no spot nearby, and one with no point and no date (no core change) |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-APP-01 | modify | R-47-05 |
| C-APP-03 | modify | R-47-05 |
| C-APP-25 | modify | R-47-05 |
| C-IMG-09 | modify | R-47-01 |
| C-IMG-23 | add | R-47-01, R-47-02 |
| C-IMG-24 | add | R-47-03 |
| C-IMG-25 | add | R-47-04, R-47-09 |
| C-IMG-26 | add | R-47-06, R-47-11 |
| C-IMG-27 | add | R-47-08 |
| C-IMG-28 | add | R-47-10 |
| C-MAP-21 | add | R-47-07 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-47-01 | db | R-47-01 | After `pnpm db:migrate`: an image with `lat` but no `lng` is rejected, `caption` over 500 characters is rejected, and an image with `spot_id` null is accepted. Deleting a spot removes its pointless image and queues its blob, while its photo with a point stays with `spot_id` null. Deleting the trip removes both. `checks.sql` prints its new expected `ok` count |
| T-47-02 | api | R-47-02 | A JPEG with `lat`/`lng` 30 m from a seeded spot → 201, linked to that spot, `place_source = "exif"`, key under `trips/<id>/photos/`, and the stored WebP has no EXIF or GPS. A point 2 km away → `spot_id` null. Only `lat` → 400. `takenAt=yesterday` → 400. A `spotId` of another trip → 404. A visitor → 403. Over quota → 413 `quota_exceeded`. One `image.upload` row with `metadata.source = "photobook"` is written |
| T-47-03 | api | R-47-03 | `GET /trips/:id/photos` on the seed returns gallery and photobook photos. A gallery photo carries its spot's point, the unplaced photo has `lat` null, the order is by `takenAt` with undated last, and every URL is signed. A non-member → 404 |
| T-47-04 | api | R-47-04 | `PATCH` with a point near a spot → 200, `place_source = "manual"`, linked. `spotId` given → that spot wins over the nearest. `spotId: null` on a photo without a point → 400 `would_unplace`. A visitor → 403. One `image.update` activity row is written |
| T-47-05 | e2e | R-47-05, R-47-06 | The *Photobook* tab opens at `/trips/:id/photos` without remounting the map. The seed shows two day pages in order plus *No date*, with the place line showing the linked spot's title. Clicking a photo opens the lightbox with time and place. At 375 px the tab is in the *More* sheet and opens as the book |
| T-47-06 | e2e | R-47-07 | Three seeded thumbnail markers are on the map. Clicking one scrolls the book to its photo and highlights it, clicking a book photo moves the map centre to its marker, and switching to the board removes the markers |
| T-47-07 | unit | R-47-08 | The EXIF reader on fixture files: a JPEG and a HEIC with GPS yield `lat`/`lng`/`takenAt`, a PNG without EXIF yields nothing and no error, and a corrupt file yields nothing and no error. With locations off, the built form data has no `lat`/`lng` |
| T-47-08 | e2e | R-47-08 | Dropping three fixtures (two with GPS, one without) shows "2 with location · 1 without". After *Upload*, two new markers appear and one photo is in *Not placed yet*. A file over the per-file limit is listed as skipped and the others upload |
| T-47-09 | e2e | R-47-09 | As `aiko`: *Place on map* on the unplaced seed photo, then a map click, moves it out of *Not placed yet* and adds its marker. Dragging a marker sends a `PATCH` with the new point. As `tom` there is no drop zone and no *Place on map*, and markers cannot be dragged |
| T-47-10 | e2e | R-47-10 | With low data on, the photobook makes no request for `/images/*/file` or signed URLs. Markers show the icon. *Load all* loads the page's photos |
| T-47-11 | e2e | R-47-11 | The seeded linked photo is in the spot's gallery. With two browser contexts, a caption edit by `aiko` shows in `sven`'s lightbox within 3 s without a reload |
| T-47-12 | a11y | R-47-06, R-47-08, R-47-09 | axe on the photobook with day pages, the upload review list and placing mode, in light and dark: no serious or critical issues |
