# Step 03 — App shell, design system, i18n

**Goal:** the empty app looks like the final product: layout, design tokens, components, EN/DE, light/dark.
**Depends on:** 00 (can run in parallel with 01–02)

## Scope
- In: Tailwind + shadcn/ui setup, design tokens from `docs/DESIGN.md` §1 / Stitch guide, header layout, routing skeleton, `react-i18next` with `en`/`de`, theme switch, shared state components (loading, empty, error).
- Out: real data screens.

## Requirements
| ID | Requirement |
| --- | --- |
| R-03-01 | Tokens as CSS variables + Tailwind theme: neutral palette, 4 category colors, radius, shadows, font (Inter), for light and dark |
| R-03-02 | Header: logo, trip switcher slot, Board/Schedule tabs slot, members slot, language switch, avatar menu |
| R-03-03 | Routes exist: `/login`, `/trips`, `/trips/:id` (board), `/trips/:id/schedule`, `/join/:code`, `/account`, 404 page |
| R-03-04 | `public/locales/{en,de}/common.json` with namespaced keys. Language detection order: user profile → browser → `en` |
| R-03-05 | Language switch updates the UI without reload and saves to the profile (`PATCH /me {locale}`) when logged in |
| R-03-06 | Dates and times are formatted with `Intl` in the active locale (helper in `lib/format.ts`) |
| R-03-07 | Theme: system / light / dark, saved in localStorage |
| R-03-08 | Reusable `<LoadingState>`, `<EmptyState>`, `<ErrorState retry>` components with translated default text |
| R-03-09 | Category UI primitives: `<CategoryDot>`, `<CategoryBadge>`, `<CategoryStrip>` using tokens |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-03-01 | unit | R-03-04 | `en` and `de` files have identical key sets (test fails and lists missing keys) |
| T-03-02 | unit | R-03-04 | Lint rule flags a JSX string literal that is not a translation call |
| T-03-03 | e2e | R-03-05 | Switching to DE changes the header texts immediately and persists after reload |
| T-03-04 | api | R-03-05 | `PATCH /me {locale:"de"}` stores the locale; `{locale:"fr"}` → 400 |
| T-03-05 | unit | R-03-06 | `formatDate(2026-04-13)` → `13 Apr 2026` (en) / `13. Apr. 2026` (de) |
| T-03-06 | e2e | R-03-07 | Dark mode toggles `class="dark"` on `<html>` and survives reload |
| T-03-07 | e2e | R-03-03 | Unknown URL shows the translated 404 page with a link home |
| T-03-08 | unit | R-03-08, R-03-09 | Components render with translated defaults and the correct category color variable |
| T-03-09 | a11y | R-03-01 | Login and 404 pages: no serious/critical axe issues in both themes; text contrast ≥ 4.5:1 |
