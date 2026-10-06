# Stitch design guide

How to use: paste **Part 1** into Stitch as the first prompt, together with `docs/sketch.png` as the reference image. Then paste each block in **Part 2** one at a time to generate or refine individual screens. Part 3 is a checklist for reviewing what Stitch produces.

---

## Part 1 — Master prompt (paste as-is)

```text
Design a web app called "Trip Board": a shared, map-first travel planner for a small group of friends.
Desktop first (1440 px), but it must also work on tablet. Minimal, calm, modern. Think Linear / Notion
calm, not a playful travel site.

CORE IDEA
A trip (e.g. "Japan 2026") is a board. The main screen is a large map on the left and a narrow
"Things to do" list on the right. The list only shows the spots visible in the map area. Each spot is a
pin on the map and a card in the list; hovering one highlights the other. Spots can be scheduled
into "buckets" (a named time span like "Tokyo · 12–16 Apr" with several spots) or "single" entries
(one spot at one date and time).

VISUAL STYLE
- Neutral, minimal: white / zinc-50 surfaces, zinc-200 1px borders, zinc-900 text. Dark mode: zinc-950
  background, zinc-800 borders, zinc-50 text.
- Color is used ONLY as a signal for spot categories: small dot, 3px left strip on list cards, pin color.
  Never colored card backgrounds.
    Must go   #E5484D  (red)
    Maybe     #30A46C  (green)
    Planned   #3E63DD  (blue, set automatically when a spot is scheduled)
    Home      #F5A524  (amber, accommodation)
- Primary buttons: solid zinc-900 with white text (inverted in dark mode). Secondary: white with border.
- Font: Inter. 14px base, titles 600 weight, small muted meta text (zinc-500).
- Radius: 10px cards and panels, 8px inputs, fully round pins, chips and avatars.
- Shadows only on floating elements (panels, popovers): soft, large blur, low opacity.
- Icons: thin line icons (Lucide style).
- Map: custom light, low-saturation OpenStreetMap style: light grey land, pale blue-grey water,
  muted labels, thin roads, so colored pins stand out. Dark variant for dark mode.
- Pins: round, filled with the category color, white icon inside (! must go, ? maybe, calendar planned,
  house home). Selected pin is larger with a white ring and soft shadow.
- Generous spacing, 8px grid. No gradients, no illustrations, no stock photos in the UI chrome.

LAYOUT OF THE MAIN BOARD
- Top header (56px): logo "Trip Board", trip switcher dropdown "Japan 2026 ▾", segmented tabs
  [Board | Schedule], member avatar stack with count, EN/DE language switch, user avatar menu.
- Left: full-height map. Bottom-left floating primary button "+ Add new".
  Bottom-right: zoom +/−, locate. OSM attribution small in the corner.
- Right column (360px): header "Things to do" with a count, then a toolbar of 4 icon buttons:
  Search, Filter, Sort, Export. Below: active filter chips (removable). Then a scrollable list of spot
  cards. Scheduled spots come first, sorted by date, then a small divider "Not scheduled yet",
  then the rest grouped by category. Footer toggle: "Only visible on map".
- List card: 3px category strip on the left, title (600), one muted line (city · date/time or address),
  small category icon on the right. Hover: light zinc-100 background. Selected: border zinc-900.

SPOT PANEL (opens when clicking "+ Add new" or a card/pin)
Floating panel over the map, 440px wide, right next to the list, full height minus margins.
Fields stacked: Title, Address (with a small copy icon button, hint "or click on the map"),
Category select (Must go / Maybe / Home) with a status badge "Planned (2)" beside it, Info textarea
(placeholder "e.g. opens at 12, closed Mondays"), Link, Photos (thumbnail grid + dashed add tile,
quota text "12/100 · 18 MB"), "In plans" list (e.g. "Kyoto · Apr 18 06:30 ✕", button "+ Add to plan"),
meta line "Added by @sven · 2 days ago". Sticky footer: "Delete" (text, destructive) on the left,
"Cancel" and primary "Save" on the right. In add mode the button is "Add". Close X top-right.
For Home spots: extra "Stay from / to" date fields and a "Primary home base" checkbox.

TONE OF COPY
Short, friendly, plain. Real content: Japan trip with Tokyo, Kyoto, Nara, Mt. Fuji, Shibuya Sky,
teamLab Planets, Fushimi Inari, Hotel Gracery Shinjuku, a Kyoto ryokan. Users: sven, aiko, tom.
```

---

## Part 2 — Screen prompts (paste one at a time)

### 2.1 Trip board (main screen)
```text
Generate the main Trip Board screen for "Japan 2026" exactly as described in the master prompt.
Map of Japan with 8 pins: 3 blue (planned) around Tokyo, 1 amber house (Hotel Gracery) in Tokyo,
2 red (must go) in Kyoto, 1 green (maybe) in Nara, 1 amber house in Kyoto.
List on the right: "Things to do · 6", toolbar, one chip "Must go ✕".
Cards: "Shibuya Sky — Tokyo · Apr 13, 18:00" (blue), "teamLab Planets — Tokyo · Apr 14" (blue),
divider "Not scheduled yet", "Fushimi Inari Taisha — Kyoto" (red), "Nara Park — Nara" (green).
Hover state on "Shibuya Sky": its pin is enlarged with a ring.
```

### 2.2 Spot panel — add
```text
Same board, with the spot panel open in ADD mode on top of the map. Title "Fushimi Inari Taisha",
address being typed with an autocomplete dropdown of 3 results, a temporary pin on the map
with a pulsing ring. Category "Must go". Info empty with placeholder. No photos yet (only the dashed
add tile). No "In plans" section. Footer: Cancel / Add.
```

### 2.3 Spot panel — edit
```text
Same board, spot panel in EDIT mode for "Fushimi Inari Taisha". Category Must go with blue badge
"Planned (2)". Info: "Open 24h. Go before 7:00 to avoid crowds." Link inari.jp. Two photo thumbnails
and the add tile, quota "12/100 · 18 MB". In plans: "Kyoto · Apr 17–19 · Apr 18 06:30" and
"Day trip Nara · Apr 20", each with a small remove X, then "+ Add to plan". Meta "Added by @aiko ·
2 days ago". Footer: Delete (left, red text), Cancel, Save.
Also show a read-only variant for a visitor: same layout, plain text instead of inputs, no footer.
```

### 2.4 Toolbar popovers
```text
Show the right list column with three popovers side by side (as separate frames):
1) Search: input with "ramen", results count.
2) Filter: Category chips (multi-select, each with its color dot), Status radio (All / Scheduled /
   Not yet), "Plan entry" select, "Added by" select with avatars, "Only visible on map" switch,
   footer Reset / Apply.
3) Sort: radio list — Scheduled first (selected), Date & time, Category, A–Z, Newest.
```

### 2.5 Schedule view
```text
Schedule tab of "Japan 2026". Left (60%): chronological list. Bucket groups are cards with a header
"Tokyo · Apr 12 – 16", a house chip "⌂ Hotel Gracery", collapse chevron, an info line, and rows:
"Apr 13 · 18:00  Shibuya Sky", "Apr 14  teamLab Planets", "—  Tsukiji Outer Market" with drag
handles. Single entries are compact rows with a dot: "Mt. Fuji sunrise · Apr 16, 04:30".
Then "Kyoto · Apr 17 – 19 ⌂ Kyoto Ryokan" (collapsed) and "Day trip Nara · Apr 20".
Top: buttons "+ Bucket" and "+ Single". Right (40%): map zoomed to the selected Tokyo bucket.
Also show the "New bucket" dialog: title, date range picker, optional start/end time, info textarea.
```

### 2.6 Members & invite
```text
Modal "Members" for Japan 2026. List: sven — Owner; aiko — Planner (role select, remove icon);
tom — Visitor (role select, remove icon). Section "Invite people": role select defaulting to
"Visitor", primary button "Create link". An active invite card: code "JPN-7K3Q" in monospace,
"expires in 6 days", "Visitor", copy-link button, revoke icon. Bottom: "Transfer ownership" text button.
```

### 2.7 Join page and expired invite
```text
Centered card on a muted, blurred map background: small trip map thumbnail, "You're invited to
Japan 2026", "by sven · 3 members", role chip "Visitor", primary button "Continue with Discord"
(Discord blurple #5865F2 with Discord logo; the only place this color appears).
Second frame: same card style, "This invite has expired", "Ask the trip owner for a new link."
```

### 2.8 Login and My trips
```text
Login: minimal centered card, logo, one line "Plan trips together, on one map.", button
"Continue with Discord". My trips: header with "+ New trip", grid of trip cards (static map preview
of the region, name, date range, role chip, avatar stack). Empty state: simple line icon,
"No trips yet", "Create your first trip, like ‘Japan 2026’", primary button.
```

### 2.9 Export dialog
```text
Small modal "Export Japan 2026": Scope radio "Full list" (selected) / "Current view (2 filters)",
Format as three selectable tiles with icons: CSV, PDF, Calendar (.ics). Primary button "Download".
```

### 2.10 Tablet and dark mode
```text
Regenerate the trip board at 820px wide: the list column is narrower (300px), the spot panel opens
as a right-side sheet over the list. Then show the desktop board in dark mode with the dark map style.
```

### 2.11 German version (check text fit)
```text
Show the board and the edit panel with German UI text: "Aktivitäten", "Neu hinzufügen",
"Muss ich hin", "Vielleicht", "Eingeplant", "Unterkunft", "Nur auf der Karte sichtbare",
"Nicht eingeplant", "Speichern", "Abbrechen", "Löschen", "Zum Plan hinzufügen". Make sure no label
is truncated.
```

### 2.12 Admin — dashboard
```text
Admin area of Trip Board, same minimal design system. Left sidebar (240px): Dashboard (active),
Users, Trips, Activity, Storage, Requests (badge "2"), Settings, Audit log; header "Trip Board · Admin"
with "← Back to app". Content: title "Dashboard" with a segmented range picker 7d / 30d / 90d / All.
Row of 5 KPI cards: Users 128 (+9 this week), Active 7d 41 (32 %), Trips 37, Database 312 MB of 1 GB
(thin progress bar 31 %), Images 6.4 GB of 10 GB (64 %). Below a 2×2 grid of chart cards:
line chart "Active users per day", stacked bar chart "Activity per day" (spots, plans, images, other),
area chart "Storage growth" with a dashed capacity line, horizontal bar chart "Top users by storage".
Charts use neutral zinc tones with one accent (zinc-900); category colors only for the activity types.
```

### 2.13 Admin — users and user detail
```text
Admin "Users" page: search input, Filters dropdown (Admins, Suspended, Over 80 % quota, Inactive 90d),
dense table: avatar, name, role chip (User/Admin), status dot (ok / suspended), trips joined/owned,
spots, storage as a tiny inline progress bar with "180 / 200 MB" (amber above 80 %, red above 95 %),
last active ("5 min"), joined date. Row hover, sortable column headers.
Second frame: "User detail: aiko". Left column: profile header with action buttons (Make admin,
Suspend, Log out everywhere), trips with roles, a pending quota request card with Approve / Reject.
Right column: storage card with two bars (images 62/100, bytes 180/200 MB ⚠ 90 %), "Limit: default",
primary button "Extend storage"; a small 30-day activity sparkline and the last 5 actions.
Third frame: "Extend storage" dialog: images and storage fields showing current → new value,
"Reset to default" checkbox, reason input, Cancel / Save.
```

### 2.14 Admin — activity and storage
```text
Admin "Activity" page: filter bar (User, Trip, Action type, Date range, Export CSV) and a pulsing
"live" dot. Feed rows: time, avatar + name, monospace action tag (image.upload, spot.create,
member.join, plan.spot_add, export.download), then a readable description
("Fushimi Inari · Japan 2026 · 1.2 MB"). "Load more" at the bottom.
Second frame: Admin "Storage" page: two large cards "Database 312 MB of 1 GB" and
"Images 6.4 GB of 10 GB" with progress bars and a forecast line ("+0.9 GB / 30 days · full in ~4 months"),
a table of database tables (name, data, index, rows) and a "Biggest trips" list.
Show the warning banner variant: amber, "Image storage is at 84 % of capacity".
```

### 2.15 Admin — settings and requests; account storage
```text
Admin "Settings": sections "Default quota" (images, storage), "Capacity" (database size, image storage
size, warning threshold slider 80 %), "Switches" (Uploads enabled, New signups enabled) with toggles,
sticky Save bar. Admin "Requests": list of quota requests with user, amount, message, current usage,
Approve (editable amount) / Reject (note).
User side, account page: storage card with two bars and a secondary button "Request more storage",
plus the request dialog (amount, reason) and the "Request pending" state.
```

---

## Part 3 — Review checklist

| Check | Expected |
| --- | --- |
| Color use | Category colors only on dots, strips, pins, badges. No colored card fills |
| Map | Desaturated; pins are the most saturated thing on screen |
| Hierarchy | Map dominates; list readable at a glance; panel doesn't hide the selected pin |
| Planned status | Shown as a badge, not as a selectable category |
| Visitor view | Clearly read-only, no disabled-looking inputs everywhere |
| States | Empty list, no search results, loading skeleton cards, error banner |
| German | Longest labels fit (“Nur auf der Karte sichtbare”) |
| Dark mode | Same hierarchy; category colors still readable (≥ 3:1 on background) |
| Touch targets | ≥ 40 px for buttons and pins on tablet |
| Admin area | Clearly separate (sidebar, “Admin” label) but same design system; dense tables stay readable |
| Charts | Neutral palette, labelled axes, values readable without hovering |
| Warnings | Quota and capacity warnings use amber (≥ 80 %) and red (≥ 95 %) consistently |

When a screen is approved, export it from Stitch (image + code) into `docs/design/` so the build steps can reference it.
