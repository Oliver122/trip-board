# Step 20 — User interaction polish

**Goal:** the app reacts visibly to the pointer, errors are clearly red, and the header shows the people on the trip instead of placeholders.
**Depends on:** 13, 15, 18, 19

## Scope
- In: hover (and pressed) states for every clickable control, a red danger color for error notices, toasts and destructive buttons, removing the static *Trip* label from the header, a stacked member avatar group with a visible maximum instead of the *Members* text.
- Out: a real trip switcher (dropdown of trips), presence (“Aiko is online”), new colors outside the danger set, animations beyond simple color/shadow/lift transitions, changes to the members dialog itself.

## Current behavior (why this step exists)
| Topic | Today |
| --- | --- |
| Hover | `buttonVariants` in `components/ui/button.tsx` has no `hover:` styles. The whole web app has one `hover:` class. Tailwind v4 also resets buttons to `cursor: default`, so nothing changes under the mouse and buttons don’t look clickable |
| Error color | `--danger` is `#9f1239` (dark rose) / `#fda4af` (pink) and reads as maroon, not red. About half of the `role="alert"` messages have no color at all (`SpotPanel` link and form errors, `Gallery`, `AccountPage`, `RequestsPage`, admin `SettingsPage`, `UserPage`). Board and schedule toasts are always black/white, whether they report an error or not. Destructive buttons (delete, remove, leave, suspend, revoke) look the same as *Cancel* |
| *Trip* label | `AppShell` renders a fixed `<span data-testid="trip-switcher">` with the text `header.tripSwitcher` (“Trip” / “Reise”) on every page. It does nothing |
| Members | Inside a trip the header shows a text button *Members*; outside a trip (trip list, account) a non-clickable *Members* `<span>` is shown. `MemberAvatars` in `TripCard.tsx` already renders overlapping avatars but shows every member, with no limit |

## Requirements

### Hover states — general rules
| ID | Requirement |
| --- | --- |
| R-20-01 | Every clickable element listed in R-20-08 has a visible hover state and `cursor: pointer`. Non-clickable elements never get one |
| R-20-02 | Hover styles come from shared classes, not one-off colors: `buttonVariants` gets hover and pressed (`active:`) styles per variant, and a new `--hover` token (light `#f4f4f5`, dark `#27272a`) is the neutral hover background |
| R-20-03 | Hover kinds (used in the R-20-08 table): **H1 primary** — filled accent becomes slightly lighter (light) / darker (dark), pressed one step more. **H2 secondary** — outline buttons get the `--hover` background and a stronger border. **H3 ghost / icon** — `--hover` background, icon color goes from muted to foreground. **H4 danger** — see R-20-14. **H5 tab / nav** — inactive tabs get the `--hover` background, the active tab is unchanged. **H6 list item** — menu items, listbox options and date-picker days get the `--hover` background, the same look as the keyboard-highlighted option. **H7 card** — border darkens and the shadow grows slightly; no color fill. **H8 map control** — map buttons use H2; cluster bubbles scale to 1.05. **H9 avatar** — hovered avatar lifts 2 px above its neighbors and shows the member name as tooltip. **H10 text link** — underline on hover |
| R-20-04 | Disabled controls show no hover change, use `cursor: not-allowed` and keep their current dimmed look. This includes the disabled first/last reorder chevrons (R-18-12) |
| R-20-05 | Hover never replaces focus: `focus-visible` outlines stay as they are and look the same with or without hover |
| R-20-06 | Color, shadow and lift changes use a 150 ms transition; with `prefers-reduced-motion` the change is instant |
| R-20-07 | Hover only applies on devices that support it (Tailwind v4 `hover:` uses `@media (hover: hover)`), so touch devices don’t get “stuck” hover colors after a tap |

### Hover states — controls that must be hoverable
| ID | Requirement |
| --- | --- |
| R-20-08 | All controls below get the listed hover kind. Controls built with `<Button>` / `buttonVariants` get it through the variant (R-20-02); the others get the matching shared class |

| Area | Control | File | Kind |
| --- | --- | --- | --- |
| Header | App name link (*Tripboard*) | `components/Header.tsx` | H10 |
| Header | Tabs *Board*, *Schedule*, *Settings* | `components/AppShell.tsx` | H5 |
| Header | Member avatar group (R-20-17) and each avatar in it | `components/AppShell.tsx` | H3 for the group, H9 per avatar |
| Header | Theme switch (light / dark / system) | `components/Preferences.tsx` | H5 |
| Header | Avatar menu button | `components/Header.tsx` | H3 |
| Header | Avatar menu items *Account & settings*, *Admin*, *Log out* | `components/Header.tsx` | H6 |
| Login / join | *Continue with Discord*, *Join* | `pages/LoginPage.tsx`, `pages/JoinPage.tsx` | H1 |
| Login / join | Language switch | `components/Preferences.tsx` | H5 |
| Trip list | *New trip*, *Create your first trip* | `pages/TripsPage.tsx` | H1 |
| Trip list | Trip card (whole card link) | `trips/TripCard.tsx` | H7 |
| Trip list | *Settings* link on a trip card | `trips/TripCard.tsx` | H10 |
| Create / delete trip | *Create*, *Cancel*, *Delete* | `trips/CreateTripDialog.tsx`, `trips/DeleteTripDialog.tsx` | H1 / H2 / H4 |
| Board toolbar | Search, Filter, Sort, Export icon buttons, *Filters* button | `spots/SpotToolbar.tsx` | H2 |
| Board toolbar | Remove-filter chip (×), *Reset* | `spots/SpotToolbar.tsx` | H3 / H2 |
| Board | *Add new spot* | `pages/BoardPage.tsx` | H1 |
| Board | Spot card in the list (keeps the pin highlight on hover) | `spots/SpotList.tsx` | H7 |
| Board | Bottom-sheet handle (phone) | `spots/SpotList.tsx` | H3 |
| Board | *Reset* in the empty list | `spots/SpotList.tsx` | H2 |
| Board | Live banner *Reload their version*, *Keep editing* | `pages/BoardPage.tsx` | H1 / H2 |
| Map | Zoom in, zoom out, locate, *Retry* | `map/TripMap.tsx` | H8 |
| Map | Cluster bubbles | `map/TripMap.tsx` | H8 |
| Map | Pins (already grow on hover, R-05) | `map/Pin.tsx` | unchanged, must keep working |
| Spot panel | *Add* / *Save*, *Cancel* | `spots/SpotPanel.tsx` | H1 / H2 |
| Spot panel | *Delete spot* and its confirm *Delete* | `spots/SpotPanel.tsx` | H4 |
| Spot panel | Copy address | `spots/CopyAddress.tsx` | H2 |
| Spot panel | Saved link (opens in new tab) | `spots/SpotPanel.tsx` | H10 |
| Spot panel | *Add to plan*, *Add visit*, *Cancel* | `spots/InPlans.tsx` | H2 / H1 / H2 |
| Spot panel | Remove from plan (icon) | `spots/InPlans.tsx` | H4 |
| Gallery | Photo thumbnails | `images/Gallery.tsx` | H7 |
| Gallery | Delete photo (icon), close viewer (×) | `images/Gallery.tsx` | H4 / H3 |
| Dialogs | Close (×) in every dialog | `spots/Dialog.tsx`, `spots/ExportDialog.tsx` | H3 |
| Export | Format buttons / download | `spots/ExportDialog.tsx`, `spots/SpotToolbar.tsx` | H2 |
| Schedule | *Add bucket*, *Add single* | `pages/SchedulePage.tsx` | H1 / H2 |
| Schedule | Edit entry (icon) | `plan/ScheduleList.tsx` | H3 |
| Schedule | Drag handle (`cursor: grab`, `grabbing` while dragging) | `plan/ScheduleList.tsx` | H3 |
| Schedule | Move up, move down (chevrons) | `plan/ScheduleList.tsx` | H3 |
| Schedule | Remove from bucket (icon) | `plan/ScheduleList.tsx` | H4 |
| Schedule | *Add spot*, *Add visit*, *Cancel* | `plan/ScheduleList.tsx` | H2 / H1 / H2 |
| Schedule | Matching-spot options and *Create new spot “…”* | `plan/ScheduleList.tsx` | H6 |
| Schedule | Visit date picker days | `plan/VisitDatePicker.tsx` | H6 |
| Entry dialog | *Save*, *Cancel*, *Delete* and its confirm | `plan/EntryDialog.tsx` | H1 / H2 / H4 |
| Trip settings | *Save*, *Delete trip* | `pages/TripSettingsPage.tsx` | H1 / H4 |
| Members dialog | *Close*, *Cancel*, *Transfer ownership*, copy invite link | `members/MembersDialog.tsx` | H3 / H2 / H2 / H2 |
| Members dialog | Remove member, revoke invite, *Leave trip* | `members/MembersDialog.tsx` | H4 |
| Conflict dialog | *Use mine*, *Use theirs* | `live/ConflictDialog.tsx` | H1 / H2 |
| Account | *Request more storage*, *Send request* | `pages/AccountPage.tsx` | H2 / H1 |
| States | *Retry* in error states | `components/states.tsx` | H1 |
| Admin | Sidebar / tab nav links, *Back to trips* | `admin/AdminLayout.tsx` | H5 / H10 |
| Admin | Table rows that link to a user or trip | `admin/UsersPage.tsx`, `admin/TripsPage.tsx` | H6 |
| Admin | *Apply*, *Show N new*, filters | `admin/ActivityPage.tsx`, `admin/UsersPage.tsx` | H1 / H2 |
| Admin | Chart/table toggle | `admin/InsightChart.tsx` | H2 |
| Admin | *Extend*, *Unsuspend*, *Log out everywhere*, *Save*, *Cancel* | `admin/UserPage.tsx`, `admin/SettingsPage.tsx` | H1 / H2 |
| Admin | *Suspend*, *Reject* | `admin/UserPage.tsx`, `admin/RequestsPage.tsx` | H4 |
| Admin | *Approve* | `admin/RequestsPage.tsx` | H1 |

| ID | Requirement |
| --- | --- |
| R-20-09 | New clickable controls added later follow the same rule: a lint test fails for any raw `<button>`, `role="menuitem"`, `role="option"` or button-styled `<a>`/`<Link>` that neither uses `buttonVariants` nor one of the shared hover classes |

### Error notices in red
| ID | Requirement |
| --- | --- |
| R-20-10 | The danger tokens become red: `--danger` light `#b91c1c` / dark `#f87171` (text and icons, ≥ 4.5:1 on background and card). New tokens: `--danger-soft` (light `#fef2f2`, dark `rgb(248 113 113 / 0.12)`) for notice backgrounds, `--danger-border` (light `#fecaca`, dark `#7f1d1d`) and `--danger-solid` (light `#b91c1c`, dark `#dc2626`, white text) for toasts and confirm buttons |
| R-20-11 | Two shared components replace the hand-written `<p role="alert">` everywhere: **`FieldError`** — small red text with an alert icon under a field, linked with `aria-describedby`, and the field gets `aria-invalid` plus a red border. **`ErrorNotice`** — block with `--danger-soft` background, `--danger-border` border, alert icon and red text, for form-level and page-level errors. `ErrorState` uses `ErrorNotice` |
| R-20-12 | Every current error message uses one of them, including the ones without color today: `SpotPanel` link error and form error, `Gallery` upload/delete errors, `AccountPage` quota and request errors, `RequestsPage`, admin `SettingsPage`, `UserPage`. Field errors in create trip, trip settings, delete trip, join, login, members, *Add visit* and the entry dialog switch to `FieldError` / `ErrorNotice` |
| R-20-13 | Toasts get two kinds. **Error** (save/load/reorder failed, “Deleted by Aiko” is *not* an error): `--danger-solid` background, white text, alert icon, `role="alert"`, stays 6 s and has a close button. **Info**: today’s neutral look, `role="status"`, 4 s. Board and schedule share one toast component instead of the two copies in `BoardPage` and `SchedulePage` |
| R-20-14 | Destructive buttons get a `danger` variant of `Button`: red text and red border (outline) for the first step, `--danger-solid` filled for the final confirm in a dialog. Hover (H4): outline gets the `--danger-soft` background, filled gets slightly darker. Applies to all controls marked H4 in R-20-08 |
| R-20-15 | Color is never the only signal: every error keeps its text and icon, so it is still clear in grayscale and for color-blind users |

### Header: no static *Trip*, members as avatars
| ID | Requirement |
| --- | --- |
| R-20-16 | The static *Trip* label (`data-testid="trip-switcher"`) and the `tripSwitcher` slot in `Header` are removed, together with the unused `header.tripSwitcher` keys in `en` and `de` |
| R-20-17 | Inside a trip the members slot shows the trip’s members as a row of round avatars (32 px, 2 px ring in the header background color) that overlap by 8 px, in the same order as the trip card. Members without a Discord avatar show their initial on a neutral circle |
| R-20-18 | **Maximum:** `MAX_VISIBLE_MEMBERS = 4`. With 4 or fewer members all are shown. With more, the first 3 are shown plus a fourth circle `+N` (N = remaining members), so the group never gets wider than 4 circles |
| R-20-19 | The whole group is one button that opens the members dialog (same as the old *Members* button). Its accessible name lists who is on the trip, e.g. “Members: Sven, Aiko, Tom and 2 more” (translated), so the old *Members* label stays the button name for screen readers and tests |
| R-20-20 | Hovering an avatar shows the member name as tooltip (`title`) and lifts it (H9). Hovering `+N` shows the hidden names as tooltip |
| R-20-21 | Outside a trip (trip list, account, admin) the members slot is empty; the non-clickable *Members* text is removed |
| R-20-22 | The group updates without reload when members join, leave or are removed (member events from step 19), and when a member changes their avatar on the next trip load |
| R-20-23 | Header and trip card share one `MemberAvatars` component with a `max` prop; trip cards use the same maximum (R-20-18) |
| R-20-24 | At 375 px the header still fits: tabs, avatar group, theme switch and avatar menu wrap cleanly, and the group stays at most 4 circles wide |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-20-01 | unit | R-20-02, R-20-03, R-20-04 | `buttonVariants` for `default`, `outline`, `ghost` and `danger` contain hover, `active:` and `cursor-pointer` classes; `disabled` adds `cursor-not-allowed` and removes hover changes |
| T-20-02 | unit | R-20-09 | Lint test over `apps/web/src/**/*.tsx`: every raw `<button>`, `role="menuitem"`, `role="option"` and button-styled link uses `buttonVariants` or a shared hover class; adding a bare `<button>` makes it fail |
| T-20-03 | e2e | R-20-01, R-20-08 | For one control of each hover kind (H1–H10) on board, schedule, trip list, header and admin: background color, border, shadow, transform or text decoration differs between hovered and not hovered, and `cursor` is `pointer` |
| T-20-04 | e2e | R-20-04 | Hovering the disabled *move up* on the first schedule row changes nothing; `cursor` is `not-allowed` |
| T-20-05 | e2e | R-20-06 | With `reducedMotion: 'reduce'`, `transition-duration` on a hovered button is `0s` |
| T-20-06 | unit | R-20-10, R-20-15 | Contrast check: `--danger` on `--background`, `--card` and `--danger-soft` ≥ 4.5:1, and white on `--danger-solid` ≥ 4.5:1, in light and dark |
| T-20-07 | unit | R-20-11 | `FieldError` sets `aria-describedby` on its field, the field gets `aria-invalid="true"`; `ErrorNotice` renders icon, text and `role="alert"` |
| T-20-08 | e2e | R-20-12 | Entering `javascript:x` as spot link shows the error in red (computed color equals `--danger`), with the alert icon; same for an empty trip name in create trip |
| T-20-09 | e2e | R-20-13 | A forced 500 on spot save shows a red error toast with close button that stays ~6 s; “Deleted by Aiko” shows the neutral info toast |
| T-20-10 | e2e | R-20-14 | *Delete spot*, *Delete trip*, *Remove member* and *Leave trip* use the danger look; the confirm button in the delete trip dialog is filled red |
| T-20-11 | e2e | R-20-16, R-20-21 | No `trip-switcher` test id and no “Trip” / “Reise” label in the header on the trip list, board and account page; no *Members* text outside a trip. `e2e/shell.spec.ts` and `e2e/quality.spec.ts` drop their `trip-switcher` checks and assert the language via another header element |
| T-20-12 | unit | R-20-17, R-20-18, R-20-23 | `MemberAvatars` with 2, 4, 5 and 12 members renders 2, 4, 4 and 4 circles; for 5 and 12 the last circle reads `+2` and `+9`; members without avatar show their initial |
| T-20-13 | e2e | R-20-19, R-20-20 | On the seeded *Japan 2026* board the header shows the avatars of sven, aiko and tom; the button named like “Members…” opens the members dialog; hovering an avatar shows its name |
| T-20-14 | e2e | R-20-22 | Two contexts: sven removes tom; aiko’s header drops tom’s avatar within 2 s without reload |
| T-20-15 | e2e | R-20-24 | At 375 px and 768 px the header has no horizontal overflow on the board (screenshots attached) |
| T-20-16 | a11y | R-20-11, R-20-13, R-20-19 | Board, schedule, trip list, create trip with errors, and the members button pass axe in light and dark |
