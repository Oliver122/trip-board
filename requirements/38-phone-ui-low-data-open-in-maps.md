# Step 38 — Phone layout, low-data mode and “Open in Google Maps”

**Goal:** on a phone the trip is easy to use: Map, List and Schedule are separate tabs and each page shows fewer things. A low-data mode loads no photos and no map until you ask for them. Every spot has an *Open in Google Maps* link on desktop and on the phone.
**Depends on:** 08, 15, 19, 34
**Result:** At 390 px open *Japan 2026*: a bottom bar shows *Map · List · Schedule · More*, *List* shows the cards full-screen, and *Import*, *Export* and the schedule's drag handles are not shown. Turn on *Low data* in the avatar menu and reload: the board opens on *List*, a spot's photos are grey placeholders with *Load photo*, and the network tab shows no tile, photo or avatar request until you tap *Map* or *Load photo*. In any spot, *Open in Google Maps* opens the place in the Maps app on the phone and in a new tab on the desktop
**Core:** C-APP-25, C-LIST-16, C-APP-35, C-APP-36, C-SPOT-28, C-APP-37, C-IMG-20, C-MAP-18, C-MAP-10, C-IMG-18, C-SPOT-29
**Status:** integrated 2026-10-16

## Scope
- In: phone layout below 640 px (bottom tab bar, one view per tab, a compact header, a spot panel with collapsible sections); features hidden on the phone; the low-data setting (automatic and manual), what it holds back (photos, map and tiles, pin textures, photo suggestions, avatars) and the badge that shows it is on; the *Open in Google Maps* link in the spot panel and on list cards; updates to `docs/DESIGN.md` §3.7 and `docs/PROJECT_SCOPE.md`.
- Out: offline mode and a service-worker cache for data (later phase, `docs/PROJECT_SCOPE.md`); new API routes or changed permissions (none, the phone uses the same API); route directions or travel times (later phase); a native app; tablet layout 640–1023 px (unchanged, C-APP-24); smaller server-side thumbnails (not planned).

## Current behavior
| Topic | Today |
| --- | --- |
| Phone | Below 640 px the map is full-screen with the list as a draggable bottom sheet (C-APP-25, C-LIST-16). The header, toolbar, import, export, kind management, schedule drag-and-drop and admin are the desktop versions squeezed onto the screen |
| Traffic | The board always loads the MapLibre chunk, vector tiles and the pin texture atlas (C-MAP-01, C-MAP-10). The gallery loads every photo (C-IMG-10). A Maps link fills the add panel and loads Commons suggestions straight away (C-IMG-18). Avatars come from Discord's CDN |
| Open in maps | There is none. Only the spot's own `link`, if it was set, opens an external page |

## Decisions
| Topic | Decision |
| --- | --- |
| Same specs, other interface | The phone uses the same routes, API, roles and data. Hiding a feature on the phone only removes its UI entry point: the URL still works, and at ≥ 640 px it is back without a reload |
| What the phone hides | Hidden: bulk and setup work (import, export, kind management, schedule drag-and-drop, the bookmarklet, admin). Kept: viewing, adding and editing spots, photos from the camera or file picker, plans, comments, members |
| Low data is per device | It is stored in `localStorage`, not in the profile, because the same person may be on Wi-Fi at the desk and on roaming data on the phone |
| Live updates stay on | The event stream sends ids only, plus a comment line every 25 s (C-LIVE-03, C-LIVE-06), and each refetch only loads the affected data. That uses less data than polling, so low-data mode does not change it |
| One maps link | `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` opens the Google Maps app on Android and iOS when it is installed, and the website everywhere else. Coordinates are used instead of the title, so the pin is always exactly the spot |

## Requirements

### Phone layout (< 640 px)
| ID | Requirement |
| --- | --- |
| R-38-01 | Below 640 px a trip shows a fixed bottom tab bar (`nav`, labelled “Trip sections” / “Reisebereiche”) with *Map*, *List*, *Schedule* and *More* / *Karte*, *Liste*, *Plan*, *Mehr*. Each tab has an icon and a label, is at least 48 px high, marks the active tab with `aria-current="page"` and sits above the safe-area inset. *Map* shows the full-screen map with the *Add* button. *List* shows the toolbar and the cards full-screen with no map. *Schedule* is `/trips/:id/schedule`. *More* opens a sheet with *Settings*, *Members*, *News* (with the unread badge), *Low data* and the theme. The bottom sheet of C-APP-25 is removed |
| R-38-02 | Map and List are both `/trips/:id`, and the active one is kept in the query (`?view=list`). Back and forward move between them, a reload keeps the active one, and the map stays mounted while *List* is shown (C-MAP-16). Tapping a pin opens the spot's panel. Tapping a card opens its panel too, and *Show on map* in the panel switches to *Map* and flies to the pin. At ≥ 640 px `?view` is ignored and the desktop or tablet layout shows |
| R-38-03 | Below 640 px the header is one 48 px row: a back link to *My trips*, the trip name (truncated with an ellipsis, full name in `title`) and the avatar menu. The *Board*, *Schedule* and *Settings* tabs, the member avatars, the *News* button and the theme switch move to the bottom bar and the *More* sheet |
| R-38-04 | Below 640 px the spot panel is full-screen. Under the title and category it shows *Details* (address, info, link, *Open in Google Maps*) open, and *Photos (n)*, *In plans (n)* and *Comments (n)* as collapsed sections (`button` with `aria-expanded`), of which only one is open at a time. Unsaved-change protection (C-SPOT-17, C-SPOT-24) works the same |
| R-38-05 | Below 640 px these are not shown: *Import* and *Export* in the toolbar, the *Spot kinds* section of trip settings (replaced by a note “Manage spot kinds on a larger screen.”), drag handles in the schedule (the move up and down buttons of C-PLAN-14 stay), the image drop zone's drag hint (the file picker stays and on phones offers the camera with `accept="image/*"`), *Find images on Google*, and the bookmarklet section of the account page. `/admin/*` shows a notice “The admin area needs a larger screen.” with a link to *My trips*. Widening the window to ≥ 640 px brings everything back without a reload |

### Low-data mode
| ID | Requirement |
| --- | --- |
| R-38-06 | The setting *Low data* / *Datensparmodus* has the values `auto` (default), `on` and `off`, stored in `localStorage` (`dataSaver`, read and written inside `try/catch`; an unreadable or unknown value counts as `auto`). `auto` is on when `navigator.connection.saveData` is true or `navigator.connection.effectiveType` is `slow-2g` or `2g`, and it follows `connection` `change` events. Unsupported browsers count as off. The switch is in the avatar menu (on and off) and on the account page (all three values with a short explanation), in `en` and `de` |
| R-38-07 | While low data is on, the header shows a small badge *Low data* / *Datensparen* that opens the account page's setting. Turning it off loads what was held back without a reload. Turning it on stops new loads, but images already shown stay |
| R-38-08 | While low data is on, galleries and the lightbox request no image file and no signed URL file. Each photo is a placeholder of its aspect ratio with an image icon, its size (“240 kB”) and *Load photo* / *Foto laden*. *Load all (1.2 MB)* / *Alle laden (1,2 MB)* loads the spot's photos. A loaded photo stays loaded while the page is open. Uploading still works, and the new photo shows from the local file without downloading it again |
| R-38-09 | While low data is on, the board does not load the map chunk, the style or the tiles until *Load map* / *Karte laden* is pressed. On the phone the board opens on *List*, and *Map* asks “Load the map? Uses about 2–5 MB.” with *Load map* and *Cancel*. On a larger screen the map area shows that text and button in place of the map. Once loaded, the map stays for the rest of the page's life |
| R-38-10 | While low data is on, pins use their kind color and symbol without the texture atlas (no atlas request). The *Suggested photos* section is neither opened nor loaded on its own, also not when a Google Maps link fills the add panel (C-IMG-18), and it only loads when the user opens it. Member avatars show initials instead of loading the avatar URL |

### Open in Google Maps
| ID | Requirement |
| --- | --- |
| R-38-11 | Every saved spot (all roles, visitors included, on every screen size) shows *Open in Google Maps* / *In Google Maps öffnen* in the panel's details, next to the address. It is a link (`<a>`, external-link icon, `target="_blank"`, `rel="noopener noreferrer"`) to `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`, where the coordinates are rounded to 6 decimals and use a `.` as the decimal separator in every language. It does not appear in add mode before the spot is saved, and it uses the saved point, not an unsaved dragged pin |
| R-38-12 | On the phone's *List* tab each card also has a map-pin icon button with the same link, labelled “Open <title> in Google Maps” / “<title> in Google Maps öffnen”. Tapping it does not open the spot's panel |

### Docs
| ID | Requirement |
| --- | --- |
| R-38-13 | `docs/DESIGN.md` §3.7 shows the phone layout with the bottom bar, the *List* tab and the collapsed panel sections, and lists what the phone hides. `docs/PROJECT_SCOPE.md` row 12 and the later-phase list no longer call the phone UI a later phase. Both describe low-data mode and *Open in Google Maps* (no core change) |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-APP-25 | modify | R-38-01, R-38-02 |
| C-LIST-16 | modify | R-38-01, R-38-02 |
| C-APP-35 | add | R-38-03 |
| C-APP-36 | add | R-38-05 |
| C-SPOT-28 | add | R-38-04 |
| C-APP-37 | add | R-38-06, R-38-07 |
| C-IMG-20 | add | R-38-08 |
| C-MAP-18 | add | R-38-09 |
| C-MAP-10 | modify | R-38-10 |
| C-IMG-18 | modify | R-38-10 |
| C-SPOT-29 | add | R-38-11, R-38-12 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-38-01 | e2e | R-38-01, R-38-03 | At 390 px on the seeded board: the bottom bar has the four tabs, each ≥ 48 px high, *Map* is `aria-current="page"`; no bottom sheet exists; the header is one row with back link, trip name and avatar menu, without *Board*/*Schedule*/*Settings* tabs or member avatars; *More* opens a sheet with Settings, Members, News (badge), Low data and theme; *Schedule* goes to `/trips/:id/schedule` |
| T-38-02 | e2e | R-38-02 | At 390 px: *List* sets `?view=list` and shows the cards with no visible map canvas; Back returns to *Map*, reload on `?view=list` stays on *List*; switching tabs does not create a second map instance; a card opens its panel, *Show on map* switches to *Map* and selects the pin; resizing to 1280 px with `?view=list` shows the desktop board |
| T-38-03 | e2e | R-38-04 | At 390 px, opening *Kinkaku-ji* shows *Details* open and *Photos*, *In plans*, *Comments* collapsed with counts and `aria-expanded="false"`; opening *Comments* closes *Photos*; editing the title and tapping ✕ asks “Discard unsaved changes?” |
| T-38-04 | e2e | R-38-05 | As owner at 390 px: no *Import*/*Export* button, settings show the “larger screen” note instead of *Spot kinds*, the schedule has move buttons but no drag handle, the gallery has a file input with `accept="image/*"` but no *Find images on Google*, the account page has no bookmarklet, `/admin` shows the notice. After resizing to 1280 px, all of them are back without a reload |
| T-38-05 | unit | R-38-06 | `resolveDataSaver(stored, connection)`: `on`/`off` win over the connection; `auto` with `saveData: true`, `slow-2g` or `2g` → on, with `4g` or no `connection` → off; unknown stored value → `auto`; a throwing `localStorage` → `auto` without an error |
| T-38-06 | e2e | R-38-06, R-38-07 | Turning *Low data* on in the avatar menu shows the header badge and stores `on`; the account page shows `auto`/`on`/`off` with `on` selected; an emulated `saveData` connection with stored `auto` also shows the badge; turning it off loads the map and photos without a reload |
| T-38-07 | e2e | R-38-08, R-38-09, R-38-10 | With low data on at 1280 px and 390 px, the seeded board and the *Kinkaku-ji* panel (3 photos) are opened while all requests are recorded: no request to the tile origin, the style, the map chunk, the texture atlas, `/images/*/file` or signed image URLs, Wikimedia Commons or `/photo-suggestions`, or the avatar host. Pins show their symbol, and avatars show initials |
| T-38-08 | e2e | R-38-08 | With low data on: the gallery shows 3 placeholders with sizes and *Load all (…)*; *Load photo* on one requests exactly that image; *Load all* loads the other two; uploading a fixture photo shows it without a GET for its file |
| T-38-09 | e2e | R-38-09 | With low data on: at 1280 px the map area shows *Load map* and pressing it loads the tiles and shows pins; at 390 px the board opens on *List*, *Map* shows the confirm with the size note, *Cancel* stays on *List*, and *Load map* shows the map, which stays when switching tabs |
| T-38-10 | e2e | R-38-10 | With low data on, pasting a Google Maps link (recorded fixture) fills the add panel with *Suggested photos* collapsed and no `/photo-suggestions` request; opening the section sends it |
| T-38-11 | unit | R-38-11 | `googleMapsUrl({lat: 35.0393612, lng: 135.729243})` → `https://www.google.com/maps/search/?api=1&query=35.039361,135.729243`; a negative and a zero coordinate format correctly; with the German locale active the separator is still `.` |
| T-38-12 | e2e | R-38-11 | As visitor at 1280 px and as planner at 390 px, *Kinkaku-ji*'s panel has the link with the expected `href`, `target="_blank"` and `rel="noopener noreferrer"`. In add mode it is absent. After dragging the pin of an existing spot without saving, the `href` still has the saved point |
| T-38-13 | e2e | R-38-12 | At 390 px on *List*, each card has the map icon link with the translated label and the spot's URL; tapping it opens a popup page with that URL and does not open the panel |
| T-38-14 | a11y | R-38-01, R-38-04, R-38-07, R-38-08, R-38-09 | axe at 390 px in both themes on the board (*Map* and *List*), the *More* sheet, the panel with a section open, and with low data on (badge, photo placeholders, *Load map* confirm): no serious or critical issue |
| T-38-15 | unit | R-38-13 | Docs guard: `docs/DESIGN.md` §3.7 mentions the bottom bar, *Low data* and *Open in Google Maps*; `docs/PROJECT_SCOPE.md` no longer contains “dedicated phone UI” as a later phase |
| T-38-16 | manual | R-38-01, R-38-06, R-38-09, R-38-11 | On a real Android phone (Chrome, Data Saver on) and an iPhone (Safari): the bar sits above the home indicator, *auto* turns low data on under Data Saver, *Open in Google Maps* opens the Maps app at the spot when it is installed and the website when it is not, and the desktop opens a new tab |
