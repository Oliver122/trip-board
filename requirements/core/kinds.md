# Core — Kinds

Per-trip spot kinds: the categories a trip defines for its spots (name, color, symbol, order), how a spot carries one or two of them, how they look on pins, list strips and badges, who manages them, the preset catalog and 64-symbol set, the per-trip kind limit with its request flow as a board admin sees it, and the symbol texture map. [Spots](./spots.md) holds the spot API and panel, [list](./list.md) the kind chip filter and sort, [home](./home.md) the Home system category, and [admin](./admin.md) the platform admin's side of limits and approvals. *Home* and *Planned* are fixed system states, not kinds.

## Kind data and API

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-KIND-01 | Each trip owns its spot kinds, each with a name, a `#RRGGBB` color, a symbol, a sort order and an optional `preset`; a trip always has at least 1 kind and every new trip gets *Must go*, *Maybe*, *Food* and *Sights* in that order in the same transaction as the trip. A kind with `preset` set and `name` null shows the translated preset label until it is renamed. <!-- R-28-03, R-28-04, R-29-02 --> | active | 28 | 29 | T-28-03, T-29-02 |
| C-KIND-02 | Kind names are 1–30 characters after trimming and unique per trip, case-insensitive (409 `kind_name_taken`); a trip has at most one kind per preset (409 `kind_preset_taken` when a preset is created twice). <!-- R-28-03, R-29-02, R-29-03 --> | active | 28 | 29 | T-28-06, T-29-03, T-29-04 |
| C-KIND-03 | `GET /trips/:id/kinds` (any member) lists the kinds in `sort_order` with a `spotCount` each plus the trip's effective `limit` and `count`; `POST` (board admin, owner) appends a custom kind `{name, color, symbol?}` (symbol defaults to `dot`) → 201, `PATCH /trips/:id/kinds/:kindId` renames it or changes color or symbol, and `PUT /trips/:id/kinds/order {ids}` must list every kind of the trip exactly once or it is 400. Planners and visitors get 403 on writes and another trip's kind is 404. <!-- R-28-06, R-29-06 --> | active | 28 | 29 | T-28-06, T-29-05 |
| C-KIND-04 | `POST /trips/:id/kinds {preset}` creates a ready-made kind at once with the preset's fixed color and symbol and a null name → 201; an unknown preset is 400. <!-- R-29-03 --> | active | 29 | — | T-29-03 |
| C-KIND-05 | A kind's color must have at least 3:1 contrast against white (400 `kind_color_contrast`), may not be the reserved *Planned* `#3E63DD` or *Home* `#F5A524` in any letter case (400 `kind_color_reserved`), and must be a `#RRGGBB` hex (otherwise 400); it is stored upper-case and used as is in dark mode. <!-- R-28-08 --> | active | 28 | — | T-28-08, T-28-09 |
| C-KIND-06 | `DELETE /trips/:id/kinds/:kindId?moveTo=<kindId>` (board admin, owner) deletes the kind; if spots use it `moveTo` is required (400) and must be another kind of the same trip (400 for the same kind, 404 for another trip's), and the links move in the same transaction as the delete, so a spot that already has the target kind just loses the deleted one. Deleting the last kind is 409 `kind_last`. <!-- R-28-07 --> | active | 28 | — | T-28-07 |
| C-KIND-07 | Every kind write records one `activity_events` row in the same transaction (`kind.create`, `kind.update`, `kind.reorder`, `kind.delete` with the name, and for a delete the target's name and the number of spots moved) and sends a live event, so other open boards update kinds, pins and filter chips without a reload. <!-- R-28-09 --> | active | 28 | — | T-28-10, T-28-15 |
| C-KIND-08 | The kind limit of a trip is its own `max_kinds` when set, otherwise the platform default `default_max_kinds` (12 unless changed), with a hard ceiling of 64; `POST /trips/:id/kinds` beyond it is 409 `kind_limit` with `{limit}`. Lowering a limit below a trip's current count deletes nothing and only blocks new kinds. <!-- R-28-03, R-29-06 --> | active | 28 | 29 | T-29-05, T-29-04 |
| C-KIND-09 | `POST /trips/:id/kind-limit-requests {requestedMax, message?}` (board admin, owner) → 201 with one `kind.limit_request` event; a second request while one is pending is 409 `request_pending`, `requestedMax` at or below the current limit or above 64 is 400, and `GET …/latest` (board admin, owner) returns the newest request with its status and decision note. At most one request per trip is pending. <!-- R-29-08, R-29-09 --> | active | 29 | — | T-29-07, T-29-04 |

## Catalog and symbols

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-KIND-10 | A kind's symbol is one of exactly 64 keys (`kindSymbols`, append-only so texture cells never move; `home` and `calendar` are system-only and not in the list), any other value is 400 `kind_symbol_unknown`, and every symbol has a translated name in `en` and `de`. <!-- R-28-03, R-29-01 --> | active | 28 | 29 | T-28-06, T-29-01 |
| C-KIND-11 | Eight presets exist, each with a fixed color and symbol defined once in `presetKinds`: `must_go`, `maybe`, `food`, `sights`, `shopping`, `coffee`, `nature`, `nightlife`. The “Add kind” button in the Spot kinds dialog is a menu that lists the presets the trip does not have yet, then “Custom kind…”, and picking a preset creates it at once. <!-- R-29-02, R-29-03 --> | active | 29 | — | T-29-02, T-29-09 |
| C-KIND-12 | The symbol picker shows the 64 symbols in a grid with a search field that filters by the translated name (current language, case-insensitive, umlaut-safe), arrow keys and Enter to pick, and “No symbol matches” when nothing fits; the add and edit forms show a live pin preview that follows name, color and symbol. The selected symbol (`aria-selected`) and the selected color swatch (`aria-pressed`) show a 2 px `foreground` ring with a 2 px offset and a check badge, with at least 3:1 contrast against the card in light and dark mode; unselected items have neither. <!-- R-29-04, R-29-05, R-32-12 --> | active | 29 | 32 | T-29-09, T-29-10, T-32-06, T-32-07 |

## Spots and kinds

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-KIND-13 | A spot is either a home spot with no kinds or has 1 or 2 different kinds of its own trip (a link never crosses trips, enforced by composite foreign keys and a deferred trigger), always listed in the trip's kind order with the first as its primary kind. `spots_view` returns them as `kinds` and sets `displayCategory` with the priority home, then planned, then kind, so a planned spot keeps its kinds. <!-- R-28-05, R-28-10 --> | active | 28 | — | T-28-03, T-28-11 |
| C-KIND-14 | Pins are colored by the spot's kind and show its symbol in white, the list card's 3 px strip and the category badge use the same color, and *Planned* and *Home* pins keep their own fixed look even for spots with two kinds. <!-- R-07-01, R-28-13 --> | active | 07 | 28 | T-28-13, T-28-26 |
| C-KIND-15 | A spot with two kinds shows a pin split into a left and right half in the two kinds' colors with the primary kind's symbol in the middle, a list strip split top and bottom, a badge with both names and dots, and an accessible pin name that lists both kinds. <!-- R-28-14 --> | active | 28 | — | T-28-26, T-28-27 |
| C-KIND-16 | In the spot panel the category field is a chip group of the trip's kinds in kind order plus a separate *Home* chip: at most 2 kind chips can be pressed (the others are disabled with “At most 2 kinds”), pressing *Home* clears the kinds and pressing a kind clears *Home*, and a new spot starts on the trip's first kind. <!-- R-07-06, R-28-13, R-29-14 --> | active | 07 | 28, 29 | T-28-13, T-29-14 |
| C-KIND-17 | One shared chip group (`components/ui/chip-group.tsx`) renders toggle chips with `aria-pressed`, a color dot or symbol, an optional count, a `max` that disables unpressed chips, arrow-key movement and a search field above 8 options, and a guard fails CI if the filter toolbar, spot panel or import dialog render a checkbox for the trip's kinds. <!-- R-29-12, R-29-15 --> | active | 29 | — | T-29-12, T-29-15 |

## Spot kinds section

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-KIND-18 | Board admins and the owner manage spot kinds in the *Spot kinds* section (`id="kinds"`, heading *Spot kinds* / *Ortsarten*) of `/trips/:id/settings`, below the trip form and above *Delete trip*; for planners and visitors the section is not rendered, and the board's filter toolbar has no board menu. `/trips/:id?dialog=kinds` sends board admins and the owner to `/trips/:id/settings#kinds` and drops the parameter for everyone else; `#kinds` scrolls the settings column to the section and focuses its heading. <!-- R-28-11, R-32-01, R-32-02, R-32-03, R-32-04, R-32-05 --> | active | 28 | 32 | T-28-12, T-32-01, T-32-02, T-32-03 |
| C-KIND-19 | The *Spot kinds* section lists the kinds in order with swatch, name and spot count and supports add, inline rename, color (10 swatches plus a hex field), symbol pick, move up and move down buttons (keyboard-operable) and delete, with loading and error states, and shows “5 of 12 kinds”. Rendered in place (no modal) on the settings page of at most `max-w-3xl`, a row keeps its name field, count and 4 icon buttons on one line at ≥ 768 px and wraps without horizontal scrolling at 375 px. <!-- R-28-11, R-29-11, R-32-01, R-32-06 --> | active | 28 | 29, 32 | T-28-13, T-28-19, T-29-23, T-32-01, T-32-09 |
| C-KIND-20 | Deleting a kind with spots asks “3 spots use Food” and a required “Move them to” select with the other kinds (Delete stays disabled until one is chosen), a kind without spots gets a plain confirm, and the last kind has no delete button. <!-- R-28-12 --> | active | 28 | — | T-28-14 |
| C-KIND-21 | At the kind limit the Add kind menu is disabled with “Kind limit reached” and a “Request more” form (requested number, message); while a request is pending the section says “Request for 20 kinds pending”, and an approved or rejected request shows its result and note once. Kind changes by another user and the platform admin's decision update the open *Spot kinds* section without a reload. <!-- R-29-10, R-29-11, R-32-07 --> | active | 29 | 32 | T-29-11, T-32-08 |

## Textures

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-KIND-22 | `pnpm textures:template` writes the committed, byte-identical-on-rerun `docs/textures/kind-symbols-template.png` (1024×1024, 8×8 cells of 128 px, dashed inscribed circle, index and symbol key per cell), and `docs/textures/README.md` is the artist brief with the index → symbol table and the drop path `apps/web/public/textures/kind-symbols.png`. <!-- R-29-16, R-29-17 --> | active | 29 | — | T-29-16, T-29-17 |
| C-KIND-23 | `pnpm textures:manifest` reads the atlas PNG and writes `apps/web/src/kinds/texture-manifest.json` `{version, filled}` (version is a content hash, a missing file gives `filled: []`, a PNG that is not 1024×1024 exits non-zero); `pnpm build` runs it first and CI fails when the committed manifest does not match the PNG. <!-- R-29-18 --> | active | 29 | — | T-29-18, T-29-19 |
| C-KIND-24 | Pins, badge dots, the symbol picker and the pin preview show a symbol's texture as a round image with the kind color as a 2 px ring only when its index is in `filled`; a two-kind pin keeps split colors with the primary symbol's texture, with an empty manifest the atlas is never requested, and a failed atlas load falls back to the vector symbol. <!-- R-29-19, R-29-20 --> | active | 29 | — | T-29-20, T-29-21, T-29-22 |

## Language

| ID | Rule | Status | Since | Changed by | Tests |
| --- | --- | --- | --- | --- | --- |
| C-KIND-25 | Preset labels, symbol names, the *Spot kinds* section (heading and description, `kinds.section*`), the limit and request texts and every kind error exist in `en` and `de`; kind names typed by users are not translated. <!-- R-28-17, R-29-21, R-32-08 --> | active | 28 | 29, 32 | T-28-20, T-29-24, T-32-11 |

## Known gaps

- C-KIND-01: R-28-03 and R-28-04 say two starter kinds and at most 12 kinds per trip; R-29-02 and R-29-06 replaced that (four starter kinds, a configurable limit), so T-28-05 no longer proves the starter set and only T-29-02 is listed.
- C-KIND-17: the guard for R-29-15 is a source scan in `apps/web/src/structure-lint.test.ts`; it checks that no `type="checkbox"` remains in the category sections but not that the replacement is a chip group.
