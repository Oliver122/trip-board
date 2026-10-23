# Mobile sketch

The target design for the phone (390 × 844 px, a frame of 36 columns stands for 390 px), drawn from the per-screenshot notes of step 41 and the findings in [UI_REVIEW.md](UI_REVIEW.md). It is a proposal, not a rule: the core rules change only when the step that builds a set of the *Implementation set* says so. Each wireframe shows the top of the screen as the review captured it.

## Principles

- Kept: below 640 px a trip has the fixed bottom bar with *Map*, *List*, *Schedule* and *More* (C-APP-25), the one-row 48 px trip header (C-APP-35), and no entry point for setup and bulk work (C-APP-36).
- Kept: every target is at least 44 × 44 px, content sits 16 px from the screen edge, and the bottom bar and sheets leave room for the safe area.
- Kept: one primary (solid) button per screen; red only for deleting (C-APP-16).
- Proposed change: the first map view fits the spots and keeps the trip region only as the pan limit (C-MAP-03); pins keep their size but get a 44 px hit area (C-MAP-08).
- Proposed change: outside a trip the page header is one row too, and the theme switch moves from the header into the avatar menu and the *More* sheet below 1024 px (C-APP-06, C-APP-35).
- Proposed change: the *More* sheet leaves the bottom bar visible and shows *Theme* and *Low data* as rows with their value (C-APP-25, C-APP-37).
- Proposed change: a list card names its kind in words and shows a visit without a time as a date only (C-LIST-13).

## Shared parts

### Phone header

The trip header below 640 px: one 48 px row, back to *My trips*, the trip name with an ellipsis (full name in `title`), the avatar as a 44 px target. Pages inside a trip add no second title or back link under it.

```
┌──────────────────────────────────┐
│ ‹  Japan 2026 with a very lo… (S)│
├──────────────────────────────────┤
│ (page content starts here)       │
└──────────────────────────────────┘
```

Fixes: U-42

### Page header

Outside a trip (My trips, account, join, not-found, admin notice): one 56 px row, the logo left and the avatar menu right. The theme and language move into the avatar menu, as they are in the *More* sheet; the username is not shown.

```
┌──────────────────────────────────┐
│ ◎ Trip Board                 (S) │
├──────────────────────────────────┤
│                    ┌───────────┐ │
│                    │ Account   │ │
│                    │ Theme   › │ │
│                    │ Admin     │ │
│                    │ Log out   │ │
│                    └───────────┘ │
└──────────────────────────────────┘
```

Fixes: U-01

### Bottom bar

Inside a trip below 640 px (C-APP-25): four tabs, icon over label, at least 48 px high, the active tab bold with a bar above, and the safe area below. Floating map buttons sit above it and never cover the map credit line.

```
┌──────────────────────────────────┐
│ (screen content)                 │
├──────────────────────────────────┤
│  ▔▔▔                             │
│  Map    List    Schedule    More │
│  ── safe area ──                 │
└──────────────────────────────────┘
```

Fixes: —

### Full-screen sheet

A sheet (More, Members on the phone) fills the screen above the bottom bar, so the bar stays visible and shows where the user came from. Title and ✕ on top, rows 48 px high on the 16 px edge, a chevron or value on each row that opens something, and a sticky footer only when the sheet saves.

```
┌──────────────────────────────────┐
│ More                           ✕ │
├──────────────────────────────────┤
│ ⚙  Settings                    › │
│ ⊕ Members                     ›  │
│ ✉  News                        › │
│ ◐  Theme             System    › │
│ ↓  Low data          Auto      › │
│                                  │
│                                  │
├──────────────────────────────────┤
│                             ▔▔▔▔ │
│  Map    List    Schedule    More │
│  ── safe area ──                 │
└──────────────────────────────────┘
```

Fixes: U-22, U-36, U-37

### Dialog

A dialog on the phone is full screen with one title row (title and ✕, no extra *Close* row). Each block has a heading, so different actions (invite, change owner) never run into each other.

```
┌──────────────────────────────────┐
│ Members                        ✕ │
├──────────────────────────────────┤
│ (S) Sven            Owner        │
│ (A) Aiko            Planner   ⋯  │
│                                  │
│ INVITE                           │
│ [Visitor ▾]          [ Create ]  │
│ No active invites.               │
│                                  │
│ OWNER                            │
│ New owner [Aiko ▾]               │
│ [ Transfer ownership ]           │
└──────────────────────────────────┘
```

Fixes: U-18, U-33

### Buttons

Primary: solid, one per screen, 44 px high. Secondary: outlined. Danger (red) only for deleting a thing and always with a label; removing something from a list is a neutral labelled button or a row menu entry. Every button is at least 44 × 44 px (`min-h-11 min-w-11`).

```
┌──────────────────────────────────┐
│ ┌──────────────┐ ┌──────────────┐│
│ │▓▓▓ Save ▓▓▓▓▓│ │   Cancel     ││
│ └──────────────┘ └──────────────┘│
│  primary          secondary      │
│                                  │
│ ┌──────────────┐ ┌──────────────┐│
│ │ × Delete spot│ │ Remove       ││
│ └──────────────┘ └──────────────┘│
│  danger, labelled neutral remove │
└──────────────────────────────────┘
```

Fixes: U-11, U-34

### Text link

A link that is the only way on (*My trips*, *Back home*, *Trip settings*) is a 44 px row with an arrow, not 20 px of underlined text.

```
┌──────────────────────────────────┐
│ ┌──────────────────────────────┐ │
│ │ ‹ My trips                   │ │
│ └──────────────────────────────┘ │
│   44 px high, whole row tappable │
└──────────────────────────────────┘
```

Fixes: U-04

### Empty and error messages

Empty, error and notice pages use one block on the 16 px edge under the page header: a heading, one sentence that says what happened and what to do, and one primary button. Not-found, an invalid invite and the admin notice all look like this.

```
┌──────────────────────────────────┐
│ ◎ Trip Board                 (S) │
├──────────────────────────────────┤
│                                  │
│ This invite link is not valid    │
│ Ask the person who invited you   │
│ for a new link.                  │
│                                  │
│ ┌──────────────────────────────┐ │
│ │▓▓▓▓▓▓▓▓▓ My trips ▓▓▓▓▓▓▓▓▓▓▓▓││
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

Fixes: U-06, U-15, U-38

## Screens

### login

Today: [login-390-light](ui-review/notes/login-390-light.md)

```
┌──────────────────────────────────┐
│ ◎ Trip Board                     │
├──────────────────────────────────┤
│                                  │
│                                  │
│                         [EN][DE] │
│ Log in                           │
│ Plan the trip together.          │
│                                  │
│ ┌──────────────────────────────┐ │
│ │▓▓▓ Continue with Discord ▓▓▓▓│ │
│ └──────────────────────────────┘ │
│                                  │
│                                  │
└──────────────────────────────────┘
```

Fixes: U-11, U-12

Changes:

- The card is the full width minus 16 px edges, centred vertically in the upper third, with the primary button as wide as the card.
- The language control is two 44 × 44 px buttons that hug their content, top right of the card; the theme moves to the system default (no header switch on this page).

Longest German label: "Mit Discord fortfahren"

### trips

Today: [trips-390-light](ui-review/notes/trips-390-light.md)

```
┌──────────────────────────────────┐
│ ◎ Trip Board                 (S) │
├──────────────────────────────────┤
│ My trips            [+ New trip] │
│                                  │
│ ┌──────────────────────────────┐ │
│ │ Japan 2026        Owner    ⋯ │ │
│ │ 12–24 Apr 2026     (S)(A)(T) │ │
│ │ 6 spots · 3 planned          │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ Iceland 2027      Planner  ⋯ │ │
│ │ no dates yet          (S)(A) │ │
│ └──────────────────────────────┘ │
│                                  │
└──────────────────────────────────┘
```

Fixes: U-01, U-04, U-44

Changes:

- One-row page header (shared part), no theme switch row.
- The card puts the role badge on the title line and the member avatars beside the dates, so it is about 120 px high instead of 200.
- *Trip settings* becomes a 44 px ⋯ menu on the card instead of a 20 px text link.
- *New trip* is the screen's primary button.

Longest German label: "Reiseeinstellungen"

### board-map

Today: [board-map-390-light](ui-review/notes/board-map-390-light.md)

```
┌──────────────────────────────────┐
│ ‹  Japan 2026                 (S)│
├──────────────────────────────────┤
│       ·   Tokyo                  │
│          ●  ⌂ ●                  │
│   Kyoto  ●                       │
│      ⌂ ●     (3)                 │
│    Nara ●                        │
│                                  │
│                             [+]  │
│                             [-]  │
│ ┌────────────┐               [◎] │
│ │ + Add new  │                   │
│ └────────────┘                   │
│ OpenFreeMap · OpenStreetMap      │
├──────────────────────────────────┤
│  ▔▔▔                             │
│  Map    List    Schedule    More │
│  ── safe area ──                 │
└──────────────────────────────────┘
```

Fixes: U-02, U-03, U-24

Changes:

- The first view fits the spots, not the trip region; the region stays the pan limit.
- Pins keep their drawing but get a 44 px hit area; close pins cluster with a count.
- *Add new* sits above the credit line, which stays fully visible bottom left.

Longest German label: "Neu hinzufügen"

### board-list

Today: [board-list-390-light](ui-review/notes/board-list-390-light.md)

```
┌──────────────────────────────────┐
│ ‹  Japan 2026                 (S)│
├──────────────────────────────────┤
│ [Filters]  Only on map  [ ○──]   │
│ 6 spots                          │
│ ▌Shibuya Sky                  ⚲  │
│ ▌Must go · 13 Apr 2026 18:00     │
│ ▌teamLab Borderless           ⚲  │
│ ▌Must go · 14 Apr 2026           │
│ ── NOT SCHEDULED YET ────────────│
│ ▌Nara Park                    ⚲  │
│ ▌Maybe · Nara                    │
│ ▌Hotel Gracery                ⚲  │
│ ▌Home · Shinjuku                 │
├──────────────────────────────────┤
│         ▔▔▔▔                     │
│  Map    List    Schedule    More │
│  ── safe area ──                 │
└──────────────────────────────────┘
```

Fixes: U-25, U-26, U-27, U-28

Changes:

- A card names its kind in words in the second line (no lone "?" symbol) and keeps the strip colour.
- A visit without a time shows only its date.
- The *Not scheduled yet* divider is a 12 px section label with a rule.
- *Only visible on map* is a styled 44 px switch row at the top of the list, next to *Filters*.

Longest German label: "Nur auf der Karte sichtbar"

### spot-panel

Today: [spot-panel-390-light](ui-review/notes/spot-panel-390-light.md)

```
┌──────────────────────────────────┐
│ Fushimi Inari   Planned (1)    ✕ │
├──────────────────────────────────┤
│ [✓ Must go] [Maybe] [Home]       │
│ ▾ Details                        │
│   68 Fukakusa Yabunouchicho,     │
│   Fushimi Ward, Kyoto        [⧉] │
│   ↗ Open in Google Maps          │
│   Info                           │
│   ┌────────────────────────────┐ │
│   │ Go early, before 8:00      │ │
│   └────────────────────────────┘ │
│ ▸ Photos (0)                     │
│ ▸ In plans (1)                   │
│ ▸ Comments (0)                   │
│ [ Delete spot ]                  │
├──────────────────────────────────┤
│ [ Cancel ]            [▓ Save ▓] │
└──────────────────────────────────┘
```

Fixes: U-13, U-14, U-34

Changes:

- The category chips show the choice once (no badge above them); *Planned (1)* moves to the title row.
- The address wraps to two lines and *Copy address* is a 44 px icon button beside it.
- The footer keeps *Cancel* and *Save*; *Delete spot* is a labelled danger button at the end of the sheet, not an icon in the footer.

Longest German label: "In Google Maps öffnen"

### add-spot

Today: [add-spot-390-light](ui-review/notes/add-spot-390-light.md)

```
┌──────────────────────────────────┐
│ New spot                       ✕ │
├──────────────────────────────────┤
│ Google Maps link                 │
│ ┌──────────────────────────────┐ │
│ │ Paste a link                 │ │
│ └──────────────────────────────┘ │
│ Title                            │
│ ┌──────────────────────────────┐ │
│ │                              │ │
│ └──────────────────────────────┘ │
│ Address                          │
│ ┌───────────────────────┐ ┌────┐ │
│ │ Search an address     │ │ ⌖  │ │
│ └───────────────────────┘ └────┘ │
│   ⌖ = pick on map                │
│ [Must go] [Maybe] [Home]         │
│ Link                             │
│ ┌──────────────────────────────┐ │
│ │ https://…                    │ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ [ Cancel ]             [▓ Add ▓] │
└──────────────────────────────────┘
```

Fixes: U-09, U-13

Changes:

- No "click the map" hint on the phone; instead *Pick on map* closes the sheet into a map with a centre cross and *Use this point*.
- The category chips have no badge above them; *Link* has a placeholder.

Longest German label: "Google-Maps-Link"

### schedule

Today: [schedule-390-light](ui-review/notes/schedule-390-light.md)

```
┌──────────────────────────────────┐
│ ‹  Japan 2026                 (S)│
├──────────────────────────────────┤
│ Schedule   [+ Bucket] [+ Single] │
│ ● Arrival · 12 Apr 15:00      ✎  │
│   ⌂ Hotel Gracery                │
│ ▾ Tokyo · 12–16 Apr            ✎ │
│   ⌂ Hotel Gracery                │
│   ▌Shibuya Sky  13 Apr 18:00   ⋯ │
│   ▌teamLab      14 Apr         ⋯ │
│   + Add spot                     │
│ ▾ Kyoto · 17–20 Apr            ✎ │
│   ⌂ Kyoto Ryokan                 │
│   ▌Fushimi Inari 18 Apr 09:00  ⋯ │
│   + Add spot                     │
├──────────────────────────────────┤
│                 ▔▔▔▔▔▔▔▔         │
│  Map    List    Schedule    More │
│  ── safe area ──                 │
└──────────────────────────────────┘
```

Fixes: U-05, U-39

Changes:

- Entry titles and their rows share one 16 px indent; *Add spot* sits in the same place for buckets and singles.
- A row ends in one ⋯ menu (*Move up*, *Move down*, *Remove from bucket*) instead of two chevrons and a red ✕; disabled moves are not shown.
- Each row shows its kind mark like the list.

Longest German label: "+ Einzeltermin"

### trip-settings

Today: [trip-settings-390-light](ui-review/notes/trip-settings-390-light.md)

```
┌──────────────────────────────────┐
│ ‹  Japan 2026                 (S)│
├──────────────────────────────────┤
│ Name                             │
│ ┌──────────────────────────────┐ │
│ │ Japan 2026                   │ │
│ └──────────────────────────────┘ │
│ Start            End             │
│ ┌──────────────┐ ┌──────────────┐│
│ │ 12 Apr 2026  │ │ 24 Apr 2026  ││
│ └──────────────┘ └──────────────┘│
│ ┌──────────────────────────────┐ │
│ │▓▓▓▓▓▓▓▓▓▓▓ Save ▓▓▓▓▓▓▓▓▓▓▓▓▓│ │
│ └──────────────────────────────┘ │
│ Spot kinds: on a larger screen.  │
│ [ Delete trip ]                  │
├──────────────────────────────────┤
│                             ▔▔▔▔ │
│  Map    List    Schedule    More │
│  ── safe area ──                 │
└──────────────────────────────────┘
```

Fixes: U-04, U-17, U-42

Changes:

- No page title or *My trips* link under the phone header (it has both).
- The date fields use the app language (`12 Apr 2026` in English).
- The kinds note stays (C-APP-36) as one muted line.

Longest German label: "Reiseeinstellungen"

### members

Today: [members-390-light](ui-review/notes/members-390-light.md)

```
┌──────────────────────────────────┐
│ Members                        ✕ │
├──────────────────────────────────┤
│ (S) Sven                  Owner  │
│ (A) Aiko   [Planner ▾]         ⋯ │
│ (T) Tom    [Visitor ▾]         ⋯ │
│                                  │
│ INVITE                           │
│ Each link works for one person.  │
│ [Visitor ▾]          [▓Create▓]  │
│ No active invites.               │
│                                  │
│ OWNER                            │
│ New owner                        │
│ [Aiko ▾]   [ Transfer ownership] │
│ Transfer ownership before you    │
│ can leave the trip.              │
└──────────────────────────────────┘
```

Fixes: U-18, U-33, U-34

Changes:

- One title row; the extra *Close* row is gone.
- Removing a member is in the row's ⋯ menu with its label, not a red trash icon beside the role.
- *Owner* is its own block with a labelled select.

Longest German label: "Besitz übertragen"

### more-sheet

Today: [more-sheet-390-light](ui-review/notes/more-sheet-390-light.md)

```
┌──────────────────────────────────┐
│ More                           ✕ │
├──────────────────────────────────┤
│ ⚙  Settings                    › │
│ ⊕  Members                     › │
│ ✉  News                        › │
│ ◐  Theme             System    › │
│ ↓  Low data          Auto      › │
│                                  │
│                                  │
│                                  │
├──────────────────────────────────┤
│                             ▔▔▔▔ │
│  Map    List    Schedule    More │
│  ── safe area ──                 │
└──────────────────────────────────┘
```

Fixes: U-22, U-36, U-37

Changes:

- Rows on the 16 px edge, each with its value and a chevron.
- *Theme* is a row like the others; it opens the three options.
- *Low data* shows Auto, On or Off and opens the options with one line of explanation.
- The bottom bar stays visible under the sheet.

Longest German label: "Datensparmodus"

### account

Today: [account-390-light](ui-review/notes/account-390-light.md)

```
┌──────────────────────────────────┐
│ ◎ Trip Board                 (S) │
├──────────────────────────────────┤
│ Account & settings               │
│ Signed in as Sven                │
│                                  │
│ STORAGE                          │
│ [░░░░░░░░░░░░░░░░░░░░] 0 / 200 MB│
│                                  │
│ SETTINGS                         │
│ Language          [EN][DE]       │
│ Theme   [Light][Dark][System]    │
│ Low data              Auto    ›  │
│ List follows map      [ ○──]     │
│                                  │
│ SEND PLACES FROM GOOGLE MAPS     │
│ Drag the button to your bar …    │
└──────────────────────────────────┘
```

Fixes: U-11, U-12, U-16, U-25, U-37

Changes:

- Theme and language are rows like in the *More* sheet; the header has no theme switch (shared page header).
- Segmented controls hug their buttons, each 44 × 44 px.
- The storage meter shows an empty track at 0 %.
- *List follows map* is a styled switch row.

Longest German label: "Orte aus Google Maps senden"

### join-invalid

Today: [join-invalid-390-light](ui-review/notes/join-invalid-390-light.md)

```
┌──────────────────────────────────┐
│ ◎ Trip Board                 (S) │
├──────────────────────────────────┤
│                                  │
│ This invite link is not valid    │
│ Ask the person who invited you   │
│ for a new link.                  │
│                                  │
│ ┌──────────────────────────────┐ │
│ │▓▓▓▓▓▓▓▓▓ My trips ▓▓▓▓▓▓▓▓▓▓▓▓││
│ └──────────────────────────────┘ │
│                                  │
│                                  │
└──────────────────────────────────┘
```

Fixes: U-12, U-15

Changes:

- Uses the shared empty-and-error block: heading, what to do, *My trips* as the primary button.
- Same alignment as not-found.

Longest German label: "Dieser Einladungslink ist ungültig."

### not-found

Today: [not-found-390-light](ui-review/notes/not-found-390-light.md)

```
┌──────────────────────────────────┐
│ ◎ Trip Board                 (S) │
├──────────────────────────────────┤
│                                  │
│ Page not found                   │
│ That page does not exist.        │
│                                  │
│ ┌──────────────────────────────┐ │
│ │▓▓▓▓▓▓▓▓ Back home ▓▓▓▓▓▓▓▓▓▓▓▓││
│ └──────────────────────────────┘ │
│                                  │
│                                  │
└──────────────────────────────────┘
```

Fixes: U-04, U-38

Changes:

- Content on the 16 px edge under the one-row page header.
- *Back home* is a full-width primary button, not a 20 px link.

Longest German label: "Zur Startseite"

### admin-dashboard

Today: [admin-dashboard-390-light](ui-review/notes/admin-dashboard-390-light.md)

```
┌──────────────────────────────────┐
│ ◎ Trip Board                 (S) │
├──────────────────────────────────┤
│                                  │
│ Admin area                       │
│ The admin area needs a larger    │
│ screen.                          │
│                                  │
│ ┌──────────────────────────────┐ │
│ │▓▓▓▓▓▓▓▓▓ My trips ▓▓▓▓▓▓▓▓▓▓▓▓││
│ └──────────────────────────────┘ │
│                                  │
│                                  │
└──────────────────────────────────┘
```

Fixes: U-06

Changes:

- The notice is rendered inside the normal page shell (header with avatar menu) as the shared empty-and-error block.
- *My trips* is a primary button.

Longest German label: "Der Admin-Bereich braucht einen größeren Bildschirm."

### admin-users

Today: [admin-users-390-light](ui-review/notes/admin-users-390-light.md)

```
┌──────────────────────────────────┐
│ ◎ Trip Board                 (S) │
├──────────────────────────────────┤
│                                  │
│ Admin area                       │
│ The admin area needs a larger    │
│ screen.                          │
│                                  │
│ ┌──────────────────────────────┐ │
│ │▓▓▓▓▓▓▓▓▓ My trips ▓▓▓▓▓▓▓▓▓▓▓▓││
│ └──────────────────────────────┘ │
│                                  │
│                                  │
└──────────────────────────────────┘
```

Fixes: U-06

Changes:

- Same notice and page shell as `admin-dashboard`.

Longest German label: "Der Admin-Bereich braucht einen größeren Bildschirm."

## Implementation set

Each set is one step (`/req-new`, numbered from 42), phone findings with the highest severity first. A set that names core rules changes them in its own step.

| Set | Title | U- IDs | Screens | Core rules | Depends on |
| --- | --- | --- | --- | --- | --- |
| S-01 | Phone map: fit the spots, 44 px pins, Add new above the credit | U-02, U-03, U-24 | `board-map`, `schedule` | C-MAP-03, C-MAP-08 | — |
| S-02 | One-row page header and 44 px way-back links | U-01, U-04, U-42 | `trips`, `trip-settings`, `not-found`, `account`, `join-invalid` | C-APP-35, C-APP-06 | — |
| S-03 | Phone list cards: kind names, date without time, switch row | U-25, U-26, U-27, U-28 | `board-list`, `board-map`, `account` | C-LIST-13, C-LIST-16 | — |
| S-04 | Spot panel on the phone: one category, wrapping address, labelled delete, no map hint | U-09, U-13, U-14, U-34 | `spot-panel`, `add-spot`, `members` | C-SPOT-28, C-APP-16 | — |
| S-05 | Schedule rows: one indent and a row menu | U-05, U-39 | `schedule` | C-PLAN-10 | — |
| S-06 | Notice, error and sign-in pages in the shared shell | U-06, U-11, U-12, U-15, U-38 | `admin-dashboard`, `admin-users`, `join-invalid`, `not-found`, `login` | C-APP-36 | S-02 |
| S-07 | Sheets and dialogs: 16 px rows, theme and low-data rows, owner block | U-18, U-22, U-33, U-36, U-37 | `more-sheet`, `members`, `account` | C-APP-25, C-APP-37 | S-02 |
| S-08 | Account, trip cards and settings polish | U-16, U-17, U-44 | `account`, `trip-settings`, `trips` | — | S-02 |

later: U-23 the fresh seed has one trip, so a long list of trips was not captured; take it up with a filter once a capture shows many trips
