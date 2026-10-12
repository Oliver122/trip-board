# Step 23 — Import spots from Google Maps

**Goal:** a planner exports the list “Kyoto” from Google Maps, drops the file on the board, checks a preview, and the list's places appear as spots of the trip in one step.
**Depends on:** 07, 17, 19
**Result:** Drop a Google Takeout list CSV on the board, check the preview, and its places appear as spots
**Core:** C-ADMIN-21, C-IMP-01, C-IMP-02, C-IMP-03, C-IMP-04, C-IMP-05, C-IMP-06, C-IMP-07, C-IMP-08, C-IMP-09, C-IMP-10, C-IMP-11, C-IMP-12, C-IMP-13, C-IMP-14, C-IMP-15, C-IMP-16, C-IMP-17, C-IMP-18, C-IMP-19, C-LIVE-04
**Status:** integrated 2026-10-11

## Scope
- In: an “Import” action in the board toolbar for planners and owners, file parsing in the browser for the Google Takeout list CSV, the Takeout `Saved Places.json` (GeoJSON) and a Google My Maps KML, coordinates from the file or from the existing geocode route, a preview with duplicates and rows that were not found, `POST /trips/:id/spots/import`, one `spot.import` activity event, live update for other members, admin feed text.
- Out: reading lists from a shared Google Maps link (`maps.app.goo.gl/…`), the Google Places API, the whole Takeout `.zip` and `.kmz` files, images from the list, home spots and stay periods, “paste a Google Maps link to auto-fill” on a single spot (backlog, `docs/PROJECT_SCOPE.md` §10), JSON / GPX / KML export.

## Why a file import
Google Maps has no public API that returns a user's saved lists. A shared list link only opens a Google web page, and reading that page is scraping: it breaks without notice and is against the Google Maps terms. The Places API needs a paid key, and its terms limit how long coordinates may be stored. Google Takeout is the supported way to get the user's own lists out:

| Source | File | Coordinates |
| --- | --- | --- |
| Takeout → **Saved** | one CSV per list, e.g. `Saved/Kyoto.csv`, columns `Title, Note, URL`, sometimes `Tags`, `Comment`, `Address` | **None**, except for URLs that carry them (dropped pins, `@lat,lng`, `!3d…!4d…`) |
| Takeout → **Maps (your places)** | `Saved Places.json`, GeoJSON, starred places | Yes, but some features are `[0, 0]` |
| Google My Maps → Export | KML (tick “Export as KML instead of KMZ”) | Yes |

Most list CSV rows therefore need a geocode lookup. Nominatim allows one request per second, so the browser runs the lookups one after another and shows progress. The server does not run a job queue for this. A 200-row list takes a little over 3 minutes the first time. The `geocode_cache` makes a second try fast.

## Requirements

### File and parsing
| ID | Requirement |
| --- | --- |
| R-23-01 | The board toolbar shows “Import” next to “Export” for owners and planners. Visitors do not see it. It opens an import dialog that explains in short steps how to get each file (link to `https://takeout.google.com`, which box to tick, the KML checkbox in My Maps) |
| R-23-02 | The dialog accepts one file by picker or drag and drop: `.csv`, `.json`, `.geojson`, `.kml`, at most 5 MB. A `.kmz` or `.zip` file shows a message that tells the user what to do instead (export as KML / extract the list CSV). Any other file or a file that cannot be parsed shows an error and no preview |
| R-23-03 | **CSV:** columns are found by header name, case-insensitive (`Title`, `Note`, `URL`, `Comment`, `Address`); unknown columns are ignored. A UTF-8 BOM, quoted fields, commas and line breaks inside quotes are handled. Rows without a title are skipped and counted. A file without a `Title` column is an error |
| R-23-04 | **GeoJSON:** each `Point` feature is one row. Title comes from `properties.Title` or `properties.Location["Business Name"]` or `properties.name`. Address from `properties.Location.Address`. Link from `properties["Google Maps URL"]`. Coordinates `[0, 0]` count as missing |
| R-23-05 | **KML:** each `Placemark` with a `Point` is one row: `name` → title, `description` → info (HTML tags removed), coordinates from `lng,lat[,alt]`. Placemarks without a point (lines, shapes) are skipped and counted |
| R-23-06 | Coordinates are read from a Google Maps URL when it contains them, in this order: `!3d<lat>!4d<lng>`, `@<lat>,<lng>`, `/search/<lat>,<lng>`, `?q=<lat>,<lng>`. Values outside lat ±90 / lng ±180 count as missing |
| R-23-07 | Each row maps to a spot: title (cut to 120 characters), info = Note and Comment joined by an empty line (cut to 2000), address, link = the Google Maps URL when it is `http(s)` and at most 500 characters, otherwise no link. The limits come from `packages/shared` (R-06-09). A row that was cut is marked “shortened” in the preview |
| R-23-08 | More than 500 rows is an error that names the limit; nothing is imported. The parser and import UI load only when the dialog opens, so the first-route bundle budget does not grow |

### Locating and preview
| ID | Requirement |
| --- | --- |
| R-23-09 | Rows without coordinates are looked up through `GET /geocode/search` with `tripId` (bias to the trip bbox, R-06-07), query = title plus address when there is one. Requests run one at a time, never in parallel. The first result is used. No result marks the row “not found”. The preview shows “Locating 12 of 48” and a cancel button. Cancel or closing the dialog stops further requests |
| R-23-10 | The preview lists every row with title, address or found label, and a status: from file, found by search, not found, duplicate, shortened. Rows that are not found are unticked and cannot be imported until the user picks a place with the address search of the spot panel (R-07) or skips them. The user can untick any row and can choose another search result for a found row |
| R-23-11 | A row is a duplicate when the trip already has a spot with the same link, or the same title (trimmed, case-insensitive) within 200 m. Two rows of the same file follow the same rule. Duplicates are unticked by default and can be ticked |
| R-23-12 | The user picks one category for the import: `must_go` or `maybe`, default `maybe`. `home` is not offered |
| R-23-13 | The import button names the count (“Import 45 spots”) and is disabled while locating runs or when no row is ticked. After success the dialog closes, a message names the count, and the map fits the new spots |

### API
| ID | Requirement |
| --- | --- |
| R-23-14 | `POST /trips/:id/spots/import` (planner+) takes `{source: "google_csv" \| "google_geojson" \| "kml", baseCategory: "must_go" \| "maybe", spots: [{title, lat, lng, address?, info?, link?}]}` with 1 to 500 spots, validated with the shared spot schema. The route body limit is 2 MB. It returns `201 {created: n, spots: [...]}` with the same row shape as `GET /trips/:id/spots` |
| R-23-15 | The import is all or nothing. One invalid spot is `400` with its index and field, and no row is written. `baseCategory: "home"` or `"planned"` is `400`. A visitor is `403`. A non-member or unknown trip is `404`. No session is `401` |
| R-23-16 | All spots are inserted in one transaction with one multi-row insert. The trip bbox expands once to fit all new spots plus 10 % padding (R-06-05), not once per spot |
| R-23-17 | The import records exactly **one** `spot.import` row in `activity_events` in the same transaction, with `metadata {trip, count, source}`. It does not write one `spot.create` per spot. `docs/database/DATABASE.md` §3 lists `import` under `spot` |
| R-23-18 | The import sends one live notification `{resource: "spot", action: "spot.import"}` (R-19-03). Other members on the board see the new spots without reload |
| R-23-19 | The admin activity feed shows the event as “aiko imported 45 spots into Japan 2026”, and the action filter offers `spot.import` |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-23-01 | unit | R-23-03, R-23-07 | A Takeout CSV fixture with a BOM, a quoted note with a comma and a line break, a `Comment` column, an unknown `Tags` column and one row without a title gives the expected rows; the empty row is counted as skipped; a 130-character title is cut to 120 and marked shortened. A CSV without `Title` is an error |
| T-23-02 | unit | R-23-04, R-23-05 | A `Saved Places.json` fixture gives title, address and link from `Location`; a `[0, 0]` feature has no coordinates. A KML fixture with two points and one line gives two rows (HTML removed from the description) and one skipped |
| T-23-03 | unit | R-23-06 | Each URL form gives the expected coordinates; `/maps/place/Name/data=!4m2!3m1!1s0x…:0x…` gives none; `@95,10` gives none |
| T-23-04 | unit | R-23-11 | Same link → duplicate; same title in other case 150 m away → duplicate; same title 300 m away → not a duplicate; two equal rows in one file → the second is a duplicate |
| T-23-05 | unit | R-23-09 | With a fake geocode client, 5 rows without coordinates cause 5 calls in order and never two at the same time; cancel after the second call stops the rest; a row with coordinates in the URL causes no call |
| T-23-06 | api | R-23-14, R-23-16 | Planner imports 3 spots, one outside the trip bbox: `201`, `created: 3`, `GET /trips/:id/spots` returns them with `displayCategory = maybe` and `createdBy` filled; the bbox contains all three plus padding |
| T-23-07 | api | R-23-15 | Role matrix: owner `201`, planner `201`, visitor `403`, non-member `404`, unknown trip `404`, no session `401`. 501 spots → `400`; `baseCategory: "home"` → `400`; the third of 3 spots with `lat: 91` → `400` naming index 2 and `lat`, and the `spots` count is unchanged |
| T-23-08 | api | R-23-17 | One import of 3 spots adds exactly one `activity_events` row with action `spot.import` and `metadata.count = 3`, and no `spot.create` row. A rolled-back import adds none |
| T-23-09 | api | R-23-18 | A second member's event stream receives exactly one `spot` change event for an import of 3 spots |
| T-23-10 | unit | R-23-19 | The admin activity text renders a `spot.import` event in `en` and `de` with actor, count and trip name |
| T-23-11 | e2e | R-23-01, R-23-02, R-23-09, R-23-10, R-23-11, R-23-12, R-23-13 | As `aiko` on *Japan 2026*, with recorded Nominatim fixtures: import a CSV with 4 rows (one with `@lat,lng` in the URL, one found by search, one not found, one titled “Fushimi Inari” at the seeded position). The preview shows the four statuses, the duplicate and the not-found rows are unticked, picking a place for the not-found row ticks it, choosing `must_go` and “Import 3 spots” closes the dialog, and the list shows the 3 new spots. In both `en` and `de` |
| T-23-12 | e2e | R-23-01, R-23-02 | As `tom` (visitor) the toolbar has no “Import”. As `aiko`, dropping a `.kmz` shows the KML hint, and a `.txt` shows an error without preview |
| T-23-13 | e2e | R-23-18 | With Aiko and Sven on the same board, Aiko's import of 2 spots appears on Sven's map and list without reload |
| T-23-14 | unit | R-23-08 | A CSV with 501 rows is an error naming 500. The production build puts the import parser in a separate chunk that the board route does not load |
| T-23-15 | manual | R-23-03, R-23-04, R-23-05 | A real Takeout export (one `Saved/*.csv` and `Saved Places.json`) and a real My Maps KML import into a test trip; most rows with a known place name are found, and the notes appear as spot info |
