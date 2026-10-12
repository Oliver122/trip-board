# Step 26 — Cleaner menus, hardened core, shared components

**Goal:** menus and dialogs look and behave the same everywhere, the API/web core has one clean way to do each repeated job, and the duplicated pieces are replaced by shared components before new features land.
**Depends on:** 23 (steps 24 and 25 are on their own branches; merge them first, then re-check the inventory below)
**Result:** All dialogs, menus, confirms and selects share one component; one web error/request path and one API role/param/error helper; guards fail CI on duplicates
**Core:** C-APP-05, C-APP-08, C-APP-12, C-APP-18, C-APP-19, C-APP-20, C-APP-21, C-APP-22, C-APP-23, C-APP-28, C-APP-29, C-LIVE-19, C-LIVE-21, C-MEMB-01, C-MEMB-04, C-OPS-16, C-TRIP-08
**Status:** integrated 2026-10-11

## Scope
- In: one shared dialog/modal, one shared menu/popover, one shared confirm dialog (replaces `window.confirm`), one shared select, one shared skeleton; one API error class and one request helper on the web side; one `parseRole` and one param-parsing helper on the API side; lint and test guards so the duplicates do not come back; a written component inventory in `docs/DESIGN.md`.
- Out: new features, new routes, visual redesign beyond the cleanup (colors/tokens stay as in steps 03 and 20), database changes, behavior changes of the existing endpoints.

## Current behavior (why this step exists)
| Topic | Today |
| --- | --- |
| Modals | `spots/Dialog.tsx` is a side panel with focus trap and Escape. `CreateTripDialog` (two overlays), `ExportDialog`, `import/ImportDialog` and `live/ConflictDialog` each build their own `fixed inset-0` backdrop with different z-index (30/40/50), padding and mobile behavior. `DeleteTripDialog`, `MembersDialog`, `EntryDialog`, `AccountPage/RequestDialog` and `admin/UserPage/ExtendDialog` are further variants |
| Menus | `components/Header.tsx` `AvatarMenu` hand-rolls open state, Escape and outside-click. No other menu shares it |
| Confirm | `window.confirm` is used in `BoardPage` (2×), `SchedulePage`, `SpotPanel` and `comments/SpotDiscussion`. It cannot be styled, translated per app locale, or tested like other UI |
| Selects | Raw `<select>` in `admin/UsersPage`, `members/MembersDialog`, `spots/InPlans`, `spots/SpotToolbar`, `spots/SpotPanel` with separate styling |
| Skeletons | `PanelSkeleton` is defined twice (`pages/BoardPage.tsx`, `pages/SchedulePage.tsx`) |
| Web errors | 8 error classes across clients: `ConflictError` (3 copies: trips, spots, plan), `AuthError`, `NotFoundError`, `ApiError`, `SaveError`, `MembersError`, `CommentError`. 15 files call `fetch(` directly; `api/write.ts` only covers writes |
| API | `parseRole` exists twice (`trips/roles.ts`, `members/store.ts`) with different fallbacks (`null` vs `'visitor'`); a third inline variant maps invite roles. `members/routes.ts` has its own `parseMemberParams` |

## Requirements

### Shared UI components
| ID | Requirement |
| --- | --- |
| R-26-01 | A single `components/ui/modal.tsx` provides backdrop, focus trap, Escape, restore-focus, `aria-modal`, labelled title, scroll lock, and one z-index scale (`panel` 20, `modal` 40, `top` 50). `spots/Dialog.tsx` is rebuilt on it (side-panel variant). `CreateTripDialog`, `ExportDialog`, `ImportDialog`, `ConflictDialog`, `DeleteTripDialog`, `MembersDialog`, `EntryDialog`, `RequestDialog` and `ExtendDialog` use it and no longer contain `fixed inset-0` |
| R-26-02 | On viewports below 640 px the modal is full-screen; above that it is centered with one fixed max-width set (`sm`, `md`, `lg`) chosen by prop. Header, body and footer (actions right-aligned, primary last) are slots so all dialogs share the same spacing |
| R-26-03 | A `components/ui/menu.tsx` provides trigger + popover with `aria-haspopup`/`aria-expanded`, Escape, outside-click, arrow-key navigation between items, Home/End, and focus back to the trigger. `AvatarMenu` uses it. Menu items use the H6 hover from step 20 |
| R-26-04 | A `useConfirm()` hook and `ConfirmDialog` (built on R-26-01) replace every `window.confirm`: title, message, confirm label, cancel label, and a `danger` flag that styles the confirm button per R-20-14. Cancel is focused first for `danger`. No `window.confirm` remains in `apps/web/src` |
| R-26-05 | A `components/ui/select.tsx` wraps the native `<select>` with the shared border, radius, focus ring, disabled style and chevron, plus a `label` prop that renders the visible/visually-hidden label. All five raw `<select>` usages use it. Native behavior (keyboard, mobile picker) is kept |
| R-26-06 | One `PanelSkeleton` lives in `components/states.tsx` (exported with `aria-busy`) and both pages import it |

### Core hardening
| ID | Requirement |
| --- | --- |
| R-26-07 | The web has one `api/http.ts` with `request(path, init)` that sets `credentials: 'include'`, JSON headers, parses the error body and throws a single `ApiError { status, code, fields, body }`. Subclass-free helpers `isConflict(e)`, `isAuth(e)`, `isNotFound(e)` replace the `instanceof` checks. `AuthError`, `NotFoundError`, the three `ConflictError` copies, `SaveError`, `MembersError` and `CommentError` are removed. Every client in `*/client.ts` goes through `request` |
| R-26-08 | A conflict (`409`) still exposes `current` and `updatedBy` through `ApiError.body`, so the conflict dialog from step 19 works unchanged |
| R-26-09 | The API has one exported `parseTripRole(value): TripRole \| null` in `trips/roles.ts`. `members/store.ts` and the invite mapper use it; unknown roles are treated as a data error (logged and mapped to the least privilege `visitor` only at the one call site that needs a fallback, named `roleOrVisitor`) instead of silently |
| R-26-10 | Path params (`tripId`, `spotId`, `userId`, …) are parsed by one shared helper in `http/validate.ts` that returns 400 with the standard error body on a malformed UUID. `parseMemberParams` and the other local parsers are removed |
| R-26-11 | Every `reply.code(4xx)` / `5xx` error reply in `apps/api/src` goes through one `sendError(reply, status, code, extra?)` helper in `http/errors.ts`, and the error body keeps today’s shape `{ error: <code>, fields?, ...extra }` (e.g. `current`, `updatedBy`, `requestId`), described once by `apiErrorBodySchema` in `packages/shared`. Status codes and bodies of existing endpoints do not change |

### Guards and documentation
| ID | Requirement |
| --- | --- |
| R-26-12 | A lint/test guard fails CI if `apps/web/src` contains `window.confirm`, `fixed inset-0` outside `components/ui/modal.tsx`, a raw `<select` outside `components/ui/select.tsx`, or `fetch(` outside `api/` and the files on a short allow-list (session, locale, login, dev-login) |
| R-26-13 | `docs/DESIGN.md` gets a “Components” section: inventory of the shared pieces (button, modal, menu, confirm, select, notice, toast, states, skeleton, avatar group, category badge) with when to use each and a rule that new features reuse them before adding a variant |
| R-26-14 | Menus and dialogs have en + de strings for the new shared labels (cancel, confirm, close, menu), and new/changed UI shows loading, empty and error states per G-7 where it fetches |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-26-01 | unit | R-26-01, R-26-02 | Modal renders title/labelled dialog, traps Tab, closes on Escape, restores focus, locks body scroll; size prop sets max-width class; stacked `top` modal sits above `modal` |
| T-26-02 | e2e | R-26-01, R-26-02 | At 1280 px and 390 px open create-trip, export, import, delete-trip and members: centered at 1280, full-screen at 390; backdrop click and Escape close |
| T-26-03 | unit | R-26-03 | Menu opens on click/Enter, ArrowDown/Up moves, Home/End jump, Escape and outside click close, focus returns to trigger |
| T-26-04 | e2e | R-26-03 | Avatar menu: open, navigate by keyboard, log out |
| T-26-05 | unit | R-26-04 | `useConfirm` resolves true on confirm, false on cancel/Escape; `danger` focuses Cancel and styles confirm red |
| T-26-06 | e2e | R-26-04 | Discarding unsaved spot edits, deleting a comment and clearing a stay each show the ConfirmDialog; Cancel keeps data, Confirm applies; text is German after locale switch |
| T-26-07 | unit | R-26-05 | Select shows label, value, disabled state; `onChange` fires; label is associated (`getByLabelText`) |
| T-26-08 | e2e | R-26-05, R-26-06 | Role change in members dialog, sort in toolbar and user filter in admin work through the shared select; board and schedule loading show the shared skeleton |
| T-26-09 | unit | R-26-07, R-26-08 | `request` sets credentials/headers, throws `ApiError` with status/code/fields for 400, 401, 404, 409, 500 and network failure; 409 body exposes `current` and `updatedBy` |
| T-26-10 | e2e | R-26-07, R-26-08 | Two sessions edit the same spot: conflict dialog from step 19 still appears and resolves; 401 redirects to login |
| T-26-11 | api | R-26-09 | `parseTripRole` returns the role or `null`; members list and invite response use it; an unknown role value in a row is logged and surfaces as `visitor` only through `roleOrVisitor` |
| T-26-12 | api | R-26-10 | Every route with an id param returns 400 for `not-a-uuid` with the standard body; valid ids behave as before (existing G-3 tests stay green) |
| T-26-13 | api | R-26-11 | Sample of routes from trips, spots, plan, members, images, comments, admin: error bodies match the shared schema for 400/401/403/404/409 |
| T-26-14 | ci | R-26-12 | Guard test fails on a fixture file containing each forbidden pattern and passes on the repo |
| T-26-15 | a11y | R-26-01, R-26-03, R-26-04, R-26-05, R-26-14 | Axe finds no serious/critical issues on each modal, the avatar menu open, the confirm dialog and a page with selects, in en and de |
| T-26-16 | unit | R-26-14 | Locale missing-key test passes for the new keys in en and de |
| T-26-17 | manual | R-26-13 | `docs/DESIGN.md` lists every shared component above with usage guidance and links to its file |
