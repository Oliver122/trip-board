# Core — Import

Importing places saved in Google Maps (a Takeout list CSV, a `Saved Places.json` GeoJSON file or a My Maps KML file) into a trip as spots: the import dialog with parsing, locating, duplicate detection and preview in the browser, and the single `POST /trips/:id/spots/import` call that writes them. It touches [spots](./spots.md) (the rows become ordinary spots and share the spot limits), [kinds](./kinds.md) (the kinds an import assigns), [map](./map.md) (address search through geocoding and the map fitting the new spots), [live](./live.md) (other members see the import) and [admin](./admin.md) (the activity event).

## Dialog and parsing

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-IMP-01 | The board toolbar shows "Import" next to "Export" for owners, board admins and planners (not visitors), and it opens a dialog that explains in short steps how to get each file (the `https://takeout.google.com` link, which box to tick, the KML checkbox in My Maps). <!-- R-23-01 --> | active | 23 | — | T-23-11, T-23-12 |
| C-IMP-02 | The dialog accepts one file by picker or drag and drop (`.csv`, `.json`, `.geojson`, `.kml`, at most 5 MB); a `.kmz` or `.zip` shows a hint to export KML or extract the list CSV, and any other file or one that cannot be parsed shows an error without a preview. <!-- R-23-02 --> | active | 23 | — | T-23-12 |
| C-IMP-03 | In a CSV, columns are found by header name, case-insensitive (`Title`, `Note`, `URL`, `Comment`, `Address`) with unknown columns ignored, a UTF-8 BOM, quoted fields and line breaks inside quotes handled, rows without a title skipped and counted, and a file without a `Title` column is an error. <!-- R-23-03 --> | active | 23 | — | T-23-01 |
| C-IMP-04 | In GeoJSON each `Point` feature is a row, with the title from `properties.Title`, `properties.Location["Business Name"]` or `properties.name`, the address from `properties.Location.Address`, the link from `properties["Google Maps URL"]`, and coordinates `[0, 0]` counted as missing. <!-- R-23-04 --> | active | 23 | — | T-23-02 |
| C-IMP-05 | In KML each `Placemark` with a `Point` is a row (`name` is the title, `description` with HTML removed is the info, coordinates are `lng,lat[,alt]`), and placemarks without a point are skipped and counted. <!-- R-23-05 --> | active | 23 | — | T-23-02 |
| C-IMP-06 | Coordinates are read from a Google Maps URL in this order: `!3d<lat>!4d<lng>`, `@<lat>,<lng>`, `/search/<lat>,<lng>`, `?q=<lat>,<lng>`, and values outside lat ±90 / lng ±180 count as missing. The parser is `parseGoogleMapsLink` in `packages/shared`, shared with the board (C-SPOT-25), which also reads the place name from a `/maps/place/<name>/` segment or a non-coordinate `q`/`query`, and a name and address hint from Google Maps share text. <!-- R-23-06, R-33-01 --> | active | 23 | 33 | T-23-03, T-33-01 |
| C-IMP-07 | Each row becomes a spot with the title cut to 120 characters, the info made of Note and Comment joined by an empty line (cut to 2000), the address, and the link only when it is `http(s)` and at most 500 characters; a cut row is marked "shortened" in the preview. <!-- R-23-07 --> | active | 23 | — | T-23-01 |
| C-IMP-08 | A file with more than 500 rows is an error that names the limit and nothing is imported, and the parser and dialog load only when the dialog opens so the first-route bundle does not grow. <!-- R-23-08 --> | active | 23 | — | T-23-14 |

## Locating and preview

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-IMP-09 | Rows without coordinates are looked up one at a time through `GET /geocode/search` with `tripId` (title plus address as the query, biased to the trip bbox), the first result is used, no result marks the row "not found", and the preview shows "Locating 12 of 48" with a cancel button that (like closing the dialog) stops further requests. <!-- R-23-09 --> | active | 23 | — | T-23-05, T-23-11 |
| C-IMP-10 | The preview lists every row with title, address or found label and a status (from file, found by search, not found, duplicate, shortened); the user can untick rows or choose another search result, and not-found rows stay unticked and cannot be imported until the user picks a place with the address search or skips them. <!-- R-23-10 --> | active | 23 | — | T-23-11 |
| C-IMP-11 | A row is a duplicate when the trip already has a spot with the same link or the same title (trimmed, case-insensitive) within 200 m, and two rows of one file follow the same rule; duplicates are unticked by default and can be ticked. <!-- R-23-11 --> | active | 23 | — | T-23-04, T-23-11 |
| C-IMP-12 | The user picks one or two of the trip's kinds, or *Home*, for all imported spots (default: the trip's first kind) with the shared chip group (at most 2 kinds, a separate *Home* chip that clears the kinds). <!-- R-23-12, R-28-16, R-29-14 --> | active | 23 | 28, 29 | T-28-18, T-29-14 |
| C-IMP-13 | The import button names the count ("Import 45 spots") and is disabled while locating runs or when no row is ticked; after success the dialog closes, a message names the count and the map fits the new spots. <!-- R-23-13 --> | active | 23 | — | T-23-11 |

## API and effects

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-IMP-14 | `POST /trips/:id/spots/import` (planner and above) takes `{source: "google_csv" \| "google_geojson" \| "kml", kindIds or category, spots: [{title, lat, lng, address?, info?, link?}]}` with 1 to 500 spots validated with the shared spot schema and a 2 MB body limit, and returns 201 `{created, spots}` with the same row shape as `GET /trips/:id/spots`. <!-- R-23-14, R-28-10, R-28-16 --> | active | 23 | 28 | T-23-06, T-28-18 |
| C-IMP-15 | The import is all or nothing: one invalid spot is 400 with its index and field and nothing is written, more than 500 spots or `category: "planned"` is 400, a visitor is 403, a non-member or unknown trip 404 and no session 401. <!-- R-23-15 --> | active | 23 | — | T-23-07 |
| C-IMP-16 | All spots are inserted in one transaction with one multi-row insert and their kind links, and the trip bbox expands once to fit all new spots plus 10 % padding, not once per spot. <!-- R-23-16, R-28-16 --> | active | 23 | 28 | T-23-06 |
| C-IMP-17 | An import records exactly one `spot.import` activity event (`metadata {trip, count, source}`) in the same transaction and no `spot.create` per spot; a rolled-back import records none. <!-- R-23-17 --> | active | 23 | — | T-23-08 |
| C-IMP-18 | An import sends one live notification `{resource: "spot", action: "spot.import"}`, so other members see the new spots on the board and list without reload. <!-- R-23-18 --> | active | 23 | — | T-23-09, T-23-13 |
| C-IMP-19 | The admin activity feed shows the event as "aiko imported 45 spots into Japan 2026" in English and German, and the action filter offers `spot.import`. <!-- R-23-19 --> | active | 23 | — | T-23-10 |

## Known gaps

- C-IMP-14: R-23-14 and R-23-15 describe `baseCategory: "must_go"` or `"maybe"` and call `home` a 400; since step 28 the code accepts `kindIds` (1 or 2) or `category` including `home` (`packages/shared/src/spots.ts` `spotImportSchema`), and the rule describes that. T-23-07 only checks `planned` now.
- C-IMP-12: R-23-12 says `home` is not offered and the default category is `maybe`; R-28-16 and R-29-14 replaced that with kind chips plus *Home* (`apps/web/src/import/ImportDialog.tsx`).
- C-IMP-01: the "Import" button is shown to board admins as well as owners and planners, which R-23-01 predates; no test covers a board admin seeing it.
- C-IMP-08: T-23-15 (a real Takeout export imports into a test trip) is manual and has no report.
