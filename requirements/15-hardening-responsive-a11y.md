# Step 15 — Hardening, responsive & accessibility

**Goal:** release-ready: works on tablet and phone (simple), is secure, accessible and robust.
**Depends on:** 08, 12, 13, 14
**Result:** Works on tablet/phone, rate limits, audit passes
**Core:** C-APP-24, C-APP-25, C-APP-26, C-APP-27, C-LIST-16, C-OPS-12, C-OPS-13, C-OPS-14, C-OPS-15, C-OPS-17, C-OPS-21
**Status:** integrated 2026-10-11

## Scope
- In: tablet/phone layouts from `docs/DESIGN.md` §3.7, security headers, rate limits, housekeeping jobs, error tracking hooks, performance budget, full a11y pass, WebKit e2e.
- Out: dedicated phone UI (later phase), offline mode, realtime.

## Requirements
| ID | Requirement |
| --- | --- |
| R-15-01 | 640–1023 px: narrower list column; spot panel as a right-side sheet |
| R-15-02 | < 640 px: full-screen map, list as a draggable bottom sheet (peek / half / full), panel and dialogs full-screen, toolbar collapses into one “Filters” button |
| R-15-03 | Security headers: CSP (self + tile/blob origins), HSTS (prod), `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'` |
| R-15-04 | Global API rate limit (e.g. 300 req/min per user) on top of the specific ones (uploads, join, geocode) |
| R-15-05 | Housekeeping jobs run on schedule: expired sessions, old invites, geocode cache, blob deletions (`docs/database/DATABASE.md` §8) |
| R-15-06 | All user content is rendered as text (no HTML injection); links use `rel="noopener noreferrer"` |
| R-15-07 | Performance: board with 300 spots reaches interactive < 2.5 s on a mid laptop; JS bundle for the first route ≤ 250 kB gzip (map lib lazy-loaded) |
| R-15-08 | Structured JSON logs with request id; unexpected errors return a generic message plus the request id |
| R-15-09 | Full keyboard support: every action reachable without a mouse; visible focus rings |
| R-15-10 | E2E suite also runs on WebKit and a mobile viewport (iPhone 14 emulation) |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-15-01 | e2e | R-15-01 | At 800 px, opening a spot shows the side sheet and the list is still visible |
| T-15-02 | e2e | R-15-02 | At 390 px: bottom sheet drag to half shows cards; tapping a card opens a full-screen panel; back closes it |
| T-15-03 | api | R-15-03 | Response headers include the expected CSP, HSTS (prod config), nosniff, frame-ancestors |
| T-15-04 | api | R-15-04 | 301st request in a minute → 429 with `Retry-After` |
| T-15-05 | api | R-15-05 | Each job, run with a fake clock, deletes exactly the rows past their retention |
| T-15-06 | e2e | R-15-06 | A spot with title `<img src=x onerror=alert(1)>` renders as literal text in list, panel, PDF and CSV |
| T-15-07 | e2e | R-15-07 | Lighthouse (desktop) on the seeded board: performance ≥ 85; bundle-size check in CI fails above budget |
| T-15-08 | api | R-15-08 | A thrown error returns `{error:"internal", requestId}` and the log line contains the same id |
| T-15-09 | a11y | R-15-09 | axe on every page (login, trips, board, panel open, schedule, members, export, join, account) in both themes: no serious/critical issues |
| T-15-10 | e2e | R-15-09 | Keyboard-only script: create a spot, add it to a bucket, export CSV |
| T-15-11 | e2e | R-15-10 | Core e2e suite green on Chromium, WebKit and mobile viewport |
| T-15-12 | manual | all | Exploratory test on a real phone and tablet; findings logged as issues |
