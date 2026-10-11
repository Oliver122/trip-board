# Step 29 — Kind catalog, kind limits, chip filters and a symbol texture map

**Goal:** a board admin on *Japan 2026* opens “Add kind”, picks the ready-made “Coffee” or searches 64 symbols for a custom kind, and when the trip reaches its kind limit, asks the platform admin for more right from the dialog. The filter and the spot panel pick kinds with color chips instead of a long list of checkboxes. `pnpm textures:template` writes an 8×8 PNG grid that you can send to an artist. Each cell they fill later shows as a round texture in the pins of that symbol, and empty cells are never loaded.
**Depends on:** 16, 28

## Scope
- In: the symbol catalog grows from 12 to 64; more preset kinds (new trips start with 4, the others are one click away in the “Add kind” menu); a per-trip kind limit with a platform default in admin Settings, a per-trip override, and a request / approve flow; one shared chip toggle group that replaces the kind checkboxes in the filter popover, the spot panel and the import preview; a symbol picker with search and a live pin preview; a texture template PNG plus artist brief, a build-time manifest of filled cells, and round textured pins for filled symbols.
- Out: the artist's actual textures (later delivery, dropped in as one PNG); uploading textures or own symbols in the UI; textures per trip or per kind (a texture belongs to a symbol); textures for *Home* and *Planned*; turning the status filter's and other non-kind checkboxes (“only visible on map”, “primary home base”) into chips. Those checkboxes stay as they are.

## Current behavior
| Topic | Today |
| --- | --- |
| Symbols | 12 keys in `kindSymbols` (`packages/shared/src/kinds.ts`), drawn by `apps/web/src/kinds/symbols.tsx` (lucide icons; `!` and `?` as text glyphs) |
| Presets | `kind_preset` = `must_go`, `maybe`; every new trip gets exactly those two |
| Kind limit | Fixed `kindLimits.perTrip = 12`; the 13th kind → 409 `kind_limit` with no way to get more |
| Filter | One `<input type="checkbox">` per kind plus *Planned* and *Home* in `spots/SpotToolbar.tsx`; with many kinds the popover becomes a long list |
| Spot panel | Kinds are checkboxes in `spots/SpotPanel.tsx`, *Home* is one more checkbox |
| Requests | Admin “Requests” page (step 16) handles storage quota requests only |

## Decisions
| Topic | Decision |
| --- | --- |
| Texture cells | One cell per symbol. Cell index = the symbol's position in `kindSymbols`, row by row (index 0 top left, 7 top right, 63 bottom right). New symbols are only ever appended, so cells never move |
| Atlas format | One PNG, exactly 1024×1024 px, 8×8 cells of 128×128 px, sRGB with alpha |
| “Filled” | A cell counts as filled if at least 1 % of the pixels inside its inscribed circle have alpha ≥ 16. Only filled cells are listed in the manifest; the web app never requests the atlas when the manifest is empty |
| Round display | The square cell is cropped to its inscribed circle. The texture replaces the white symbol, and the kind's color stays visible as a ring, so a textured pin still shows its kind color |
| New trips | Start with *Must go*, *Maybe*, *Food*, *Sights*. Existing trips keep their kinds; no migration adds kinds |
| Kind limit | Platform default in `app_settings` (default 12), optional per-trip override set by a platform admin; hard ceiling 64. Owners and board admins can request more |

## Requirements

### Catalog and presets
| ID | Requirement |
| --- | --- |
| R-29-01 | `kindSymbols` grows to exactly 64 keys. The 12 existing keys keep positions 0–11, and 52 new keys are appended, each mapped to a lucide icon in `symbols.tsx`. `home` and `calendar` stay system-only and are not in the list. A unit-tested constant `kindSymbolCount = 64` guards the size, and the list is documented as append-only (removing or reordering a key moves texture cells). Each symbol has a translated name in `en` and `de` |
| R-29-02 | `kind_preset` gets the values `food`, `sights`, `shopping`, `coffee`, `nature`, `nightlife`, each with a fixed color from `kindSwatches` and a symbol, defined once in `presetKinds` in `packages/shared`. Every new trip gets *Must go*, *Maybe*, *Food*, *Sights* in that order, in the same transaction as the trip. A trip has at most one kind per preset (partial unique index `(trip_id, preset) WHERE preset IS NOT NULL`) |
| R-29-03 | The “Add kind” button in the Spot kinds dialog becomes a menu (shared menu, R-26-03): first the presets the trip does not have yet, each with its color, symbol and translated label, then “Custom kind…”. Picking a preset creates it at once (`POST /trips/:id/kinds {preset}` → 201, name null, preset color and symbol). Posting a preset the trip already has → 409 `kind_preset_taken` |
| R-29-04 | Symbol picker: the 64 symbols in a grid with a search field that filters by translated name (in the current language, case-insensitive, umlaut-safe). Arrow keys move between symbols, and Enter picks one. Without matches, the picker shows “No symbol matches”. A filled texture cell shows the texture in the grid tile instead of the vector icon |
| R-29-05 | The add and edit forms show a live pin preview (the real `Pin` component, one kind) that updates as name, color and symbol change, including the textured look when the symbol has a filled cell |

### Kind limit and requests
| ID | Requirement |
| --- | --- |
| R-29-06 | `app_settings.default_max_kinds` (int, default 12, CHECK 1–64) and `trips.max_kinds` (nullable int, CHECK 1–64) are added. The effective limit is `COALESCE(trips.max_kinds, default_max_kinds)`. `POST /trips/:id/kinds` beyond it → 409 `kind_limit` with `{limit}` in the body. Lowering a limit below a trip's current count deletes nothing and only blocks new kinds. `GET /trips/:id/kinds` returns `limit` and `count` |
| R-29-07 | The admin Settings page (step 16) has a “Kinds per trip” number field (1–64). The admin trip detail shows the effective limit and whether it is the default or an override, and lets the admin set or clear the override (`PATCH /admin/trips/:id/kind-limit {maxKinds \| null, reason?}`). Both writes add an `admin_audit_log` row with before/after in the same transaction (R-16-13) |
| R-29-08 | New table `kind_limit_requests (id, trip_id, requested_by, requested_max, message, status, decided_by, decided_at, decision_note, created_at)` with `request_status`, at most one pending request per trip (partial unique index), `decided_at` set exactly when status leaves `pending` (CHECK). `requested_max` must be greater than the current effective limit and at most 64. `trip_id` cascades on trip delete, and `requested_by` / `decided_by` are `ON DELETE SET NULL` |
| R-29-09 | `POST /trips/:id/kind-limit-requests {requestedMax, message?}` (board admin, owner) → 201 and one `kind.limit_request` activity event in the same transaction. A second request while one is pending → 409 `request_pending`, and `requestedMax` ≤ the current limit or > 64 → 400. `GET /trips/:id/kind-limit-requests/latest` (board admin, owner) returns the newest request with status and decision note |
| R-29-10 | The admin Requests page lists kind limit requests next to storage requests (type column, filter by type, and the sidebar count includes both). Approve with an editable value (default: the requested one) sets `trips.max_kinds`, and reject takes a note. Each decision runs in one transaction with its `admin_audit_log` row and sends a live event (step 19) to the trip, so an open Spot kinds dialog shows the new limit without a reload |
| R-29-11 | The Spot kinds dialog shows “5 of 12 kinds”. At the limit, the Add kind menu is disabled with the hint “Kind limit reached” and a “Request more” button that opens a form (requested number, message). While a request is pending, the dialog shows “Request for 20 kinds pending” instead. An approved or rejected request shows its result and note once, until the next request |

### Chip filters and pickers
| ID | Requirement |
| --- | --- |
| R-29-12 | A shared `components/ui/chip-group.tsx` renders a wrap of toggle chips (`button` with `aria-pressed`, color dot or symbol, label, optional count). It supports a `max` (chips that are not pressed are disabled at the max, with a hint), keyboard use (Tab into the group, arrow keys between chips, Space/Enter to toggle), and a search field that appears when there are more than 8 options. It is added to the component inventory in `docs/DESIGN.md` (R-26-13) |
| R-29-13 | The filter popover's category section uses the chip group: one chip per kind in kind order with its spot count, then *Planned* and *Home*, plus “All” and “Clear” actions. Matching, URL params (`cat=<kindId>`, `planned`, `home`) and forgiving links stay as in R-28-15. The active-filter chips in the toolbar collapse to “Food +3” when more than 3 categories are selected, and the full list shows on hover/focus (tooltip) |
| R-29-14 | The spot panel's category field uses the chip group with `max` 2 for kinds, plus a separate *Home* chip that clears the kinds when pressed (and is cleared when a kind is pressed). Behavior and limits stay as in R-28-13. The Google Maps import preview's kind picker uses the same component |
| R-29-15 | A guard (extending R-26-12) fails CI if `SpotToolbar.tsx`, `SpotPanel.tsx` or `import/ImportDialog.tsx` render a checkbox whose options come from the trip's kinds. In practice, no `type="checkbox"` remains inside their category sections |

### Texture map
| ID | Requirement |
| --- | --- |
| R-29-16 | `pnpm textures:template` (script using `sharp`) writes `docs/textures/kind-symbols-template.png`: 1024×1024, transparent background, 8×8 cells of 128 px with a 1 px grid, each cell's inscribed circle as a dashed guide, the cell index and symbol key in small text, and the current vector symbol in light grey as a reference. The template is committed. It is deterministic: running it twice gives byte-identical files |
| R-29-17 | `docs/textures/README.md` is the artist brief: canvas size, cell size, row-by-row order with a table of index → symbol key → English name, “only the circle is shown, keep important detail inside it”, “leave a cell fully transparent to keep the default symbol”, sRGB PNG with alpha, and where to drop the finished file (`apps/web/public/textures/kind-symbols.png`) |
| R-29-18 | `pnpm textures:manifest` reads `apps/web/public/textures/kind-symbols.png` if it exists and writes `apps/web/src/kinds/texture-manifest.json` `{version, filled: number[]}` (`version` = content hash of the PNG). A missing file gives `filled: []`. A PNG that is not exactly 1024×1024 makes the script exit non-zero with a clear message. `pnpm build` runs it first, and CI fails if the committed manifest does not match the PNG |
| R-29-19 | Pins, badge dots, the symbol picker and the pin preview show a symbol's texture only if its index is in `filled`: a circle with the atlas as background (`background-size: 800%`, position from the index, `?v=<version>` for cache busting), `border-radius: 50%`, and the kind color as a 2 px ring. A two-kind pin keeps its split colors and shows the primary symbol's texture in the middle. *Planned*, *Home*, selected and hover styles and accessible names are unchanged. With `filled` empty, no request for the atlas is made, and pins look exactly as in step 28 |
| R-29-20 | If the atlas fails to load at runtime, pins fall back to the vector symbol (no broken image, no console error beyond the failed request) |

### General
| ID | Requirement |
| --- | --- |
| R-29-21 | All new text (64 symbol names, 6 presets, limit and request UI, admin labels, chip group labels, errors `kind_preset_taken`, `request_pending`) exists in `en` and `de`. `docs/database/DATABASE.md` documents `default_max_kinds`, `trips.max_kinds`, `kind_limit_requests` and the `kind.limit_request` action |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-29-01 | unit | R-29-01 | `kindSymbols` has 64 unique keys; the first 12 equal the step 28 list in order; every key has a renderable icon and an `en` and `de` name; `home`/`calendar` are not in it |
| T-29-02 | api | R-29-02 | `POST /trips` creates *Must go*, *Maybe*, *Food*, *Sights* with the documented colors, symbols and order; a failed trip insert leaves no kinds. An existing seeded trip still has exactly its old kinds after migrating |
| T-29-03 | api | R-29-03 | `POST /kinds {preset:"coffee"}` → 201 with preset color and symbol; again → 409 `kind_preset_taken`; unknown preset → 400; planner → 403 (plus the G-3 set) |
| T-29-04 | db | R-29-02, R-29-06, R-29-08 | Two kinds with the same preset in one trip fail; `max_kinds = 0` or 65 fails; two pending limit requests for one trip fail; a decided request without `decided_at` fails. `docs/database/checks.sql` passes |
| T-29-05 | api | R-29-06 | With default 12, the 13th kind → 409 `kind_limit` `{limit:12}`; after the admin sets the trip override to 14, two more kinds succeed and the 15th fails; clearing the override returns to the default; lowering the default to 3 keeps all existing kinds and blocks new ones. `GET /kinds` returns `limit` and `count` |
| T-29-06 | api | R-29-07 | Settings write of `default_max_kinds` and the trip override each write one audit row with before/after; values 0 and 65 → 400; non-admin → 404 (R-16-01) |
| T-29-07 | api | R-29-09 | Board admin requests 20 → 201 and one `kind.limit_request` event; second request → 409 `request_pending`; `requestedMax` 12 (equal to limit) or 65 → 400; visitor and planner → 403; another trip → 404 |
| T-29-08 | api | R-29-10 | Admin approves with 18 → `trips.max_kinds = 18`, request approved with `decided_by` and `decided_at`, one audit row, one live event on the trip channel; a simulated failure leaves request and trip unchanged. Reject with a note → status rejected, limit unchanged |
| T-29-09 | e2e | R-29-03, R-29-05 | Board admin on a fresh trip opens Add kind: the menu lists Shopping, Coffee, Nature, Nightlife (not the 4 starter kinds), then “Custom kind…”. Picking Coffee adds it at once. In the custom form, the pin preview changes color and symbol as they are picked |
| T-29-10 | e2e | R-29-04 | Symbol picker: typing “kat” in German shows the cat symbol; “zzz” shows “No symbol matches”; arrow keys + Enter pick a symbol and the saved kind uses it |
| T-29-11 | e2e | R-29-10, R-29-11 | Trip at its limit: Add kind is disabled with “Kind limit reached”; the admin requests 14 kinds → the dialog shows the pending text. Platform admin approves on the Requests page (type column shows the kind request); the board's open dialog shows “4 of 14 kinds” without a reload and Add kind is enabled |
| T-29-12 | unit | R-29-12 | Chip group: toggles `aria-pressed`, respects `max` (others disabled with hint), arrow keys move focus, Space toggles, search field appears only above 8 options and filters labels |
| T-29-13 | e2e | R-29-13 | On a trip with 10 kinds: the filter popover shows chips with counts and a search field; “All” then “Clear” work; picking 4 kinds shows “Food +3” in the toolbar with all names on focus; the URL and results match R-28-15 |
| T-29-14 | e2e | R-29-14 | Spot panel: pressing two kind chips disables the rest with the hint; pressing *Home* clears both kinds and saving makes a home spot; import preview picks kinds with the same chips |
| T-29-15 | unit | R-29-15 | The guard fails on a fixture file that renders kind options as checkboxes and passes on the current source |
| T-29-16 | unit | R-29-16 | Running the template script twice gives byte-identical output; the PNG is 1024×1024 with alpha; a pixel at a cell corner is transparent and a pixel on the grid line is not |
| T-29-17 | manual | R-29-17 | The brief and template are sent to the artist (or a colleague) and they can say, without asking, which cell is “coffee” and what area will be visible |
| T-29-18 | unit | R-29-18 | Manifest script: no PNG → `filled: []`; a fixture atlas with cells 5 and 11 filled → `[5, 11]`; a cell with only corner pixels outside the circle → not filled; a 1000×1000 PNG → non-zero exit; same PNG twice → same `version` |
| T-29-19 | ci | R-29-18 | A pull request that changes the atlas without regenerating the manifest fails CI |
| T-29-20 | unit | R-29-19 | `Pin` with a symbol in `filled` renders the texture circle with the right `background-position` for its index, and the kind color ring; with a symbol not in `filled`, the vector symbol; a two-kind pin shows split colors and the primary symbol's texture; the accessible name is unchanged |
| T-29-21 | e2e | R-29-19 | With the default empty manifest, loading a board makes no request to `/textures/kind-symbols.png` and pins match the step 28 screenshots. With the fixture atlas and manifest (cell 5 = food), a Food pin shows the texture (computed `background-image` contains the atlas) |
| T-29-22 | e2e | R-29-20 | With the fixture manifest but the atlas request blocked (route abort), Food pins show the vector food symbol |
| T-29-23 | a11y | R-29-04, R-29-11, R-29-12, R-29-13 | Spot kinds dialog (with Add kind menu, symbol picker, request form), filter popover and admin Requests page pass axe with no serious or critical issues in light and dark mode |
| T-29-24 | unit | R-29-21 | Missing-key check covers all new keys (64 symbol names, presets, limit, request, chip group, errors) in `en` and `de` |
