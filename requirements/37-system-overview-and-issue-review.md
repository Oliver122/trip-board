# Step 37 — System overview and issue review

**Goal:** one document, `docs/SYSTEM_OVERVIEW.md`, explains how Trip Board works end to end (every core area and every outside integration) and lists, ranked by severity, the issues worth looking at in security and privacy, external dependencies, spec and test gaps, and ops and scale, each with evidence and a suggested fix.
**Depends on:** 30, 33, 34
**Result:** Open `docs/SYSTEM_OVERVIEW.md`: it has a section for each of the 17 core areas and each outside service (Discord, Nominatim, OpenFreeMap, S3/MinIO, Google Maps, Google Images, Wikimedia Commons, GitHub Actions and the deploy host), and an *Issues* table sorted high → low where every row points at a file or core ID that exists; `pnpm test` fails when an area, an integration or an evidence link goes missing
**Core:** C-OPS-47
**Status:** integrated 2026-10-16

## Scope
- In: `docs/SYSTEM_OVERVIEW.md` (architecture, core areas, data flow, outside integrations, issue review); a check `scripts/overview.test.mjs` run by `pnpm test` that keeps the document's structure and evidence links honest; links to it from `README.md` and `docs/PROJECT_SCOPE.md`.
- Out: fixing any issue the review finds (each becomes its own step via `/req-new`); changing core rules or the *Known gaps* sections of the core files (step 30 owns their format); a rendered HTML or diagram site; a third-party security audit or penetration test.

## Current behavior
| Topic | Today |
| --- | --- |
| How it works | Spread over `docs/PROJECT_SCOPE.md` (still says “nothing is implemented yet”), `docs/DESIGN.md`, `docs/database/DATABASE.md`, 17 core files in `requirements/core/` and 37 step files. No single page explains the whole system |
| Integrations | Code talks to Discord OAuth and its avatar CDN (`apps/api/src/auth/discord.ts`), Nominatim (`geocode/nominatim.ts`), OpenFreeMap tiles (web map style), S3/MinIO (`images/storage.ts`), Google Maps short links (`places/resolve.ts`), arbitrary image URLs (`images/web-fetch.ts`), Wikimedia Commons (`images/commons.ts`), plus the web share target (`apps/web/public/manifest.webmanifest`), the bookmarklet, GitHub Actions (`.github/workflows/ci.yml`) and SSH deploy (`scripts/deploy.sh`). Their limits, failure modes and terms are not written down in one place |
| Known issues | The core files hold 63 *Known gaps* bullets; nothing ranks them or adds security, dependency or ops risks |

## Decisions
| Topic | Decision |
| --- | --- |
| One file | A single Markdown file in `docs/`, next to the other product docs, so it is read and diffed in pull requests like code |
| Core files stay the truth | The overview *summarizes and links*; it never restates a rule's exact limits as a second source. Each area section links its core file and names the core IDs it summarizes |
| Evidence, not opinion | Every issue names at least one `path:line`, core ID or T-ID that exists in the repo, says what could go wrong in one concrete sentence, and suggests a fix. Uncertain findings are marked *to verify* instead of left out |
| Report only | The step writes and checks the document. No code outside the check script and doc links changes |

## Requirements

### Structure and core functionality
| ID | Requirement |
| --- | --- |
| R-37-01 | `docs/SYSTEM_OVERVIEW.md` starts with a short summary, the date it reflects, and the commit it was written against, followed by these `##` sections in order: *Architecture*, *Core functionality*, *Outside integrations*, *Data and privacy*, *Operations*, *Issues*, *How to keep this current* |
| R-37-02 | *Architecture* shows the parts (web SPA, Fastify API, Postgres, blob storage, live events, housekeeping timers, outside services) in one mermaid `flowchart`, and one mermaid `sequenceDiagram` for a typical write (planner adds a spot: request → role guard → transaction with `activity_events` + `NOTIFY` → SSE to other members) |
| R-37-03 | *Core functionality* has one `###` subsection per core area file in `requirements/core/` (17 today, `_FORMAT.md` and `_unmapped.md` excluded), each 3–10 lines: what a user can do, the roles involved, the main routes or screens, which areas it touches, a link to its core file, and the count of its active rules and *Known gaps* bullets |

### Outside integrations
| ID | Requirement |
| --- | --- |
| R-37-04 | *Outside integrations* has one `###` subsection per outside service: Discord (OAuth and avatar CDN), Nominatim, OpenFreeMap, S3-compatible storage, Google Maps (pasted links, short-link resolve, share target, bookmarklet, file import), Google Images (search link and image drop/paste by URL), Wikimedia Commons, GitHub Actions, and the deploy host |
| R-37-05 | Each integration subsection has a table with the rows: *Used for*, *Direction* (browser → service, API → service, service → API), *Code* (file paths), *Config* (env vars or none), *Auth/keys*, *Limits and terms* (rate limit, usage policy, license or attribution duty), *Timeout and failure* (what the user sees when the service is slow or down), *Test double* (fixture, fake server or none), *Core rules* (IDs) |
| R-37-06 | For every API → service call the subsection states how outgoing requests are bounded: timeout, size limit, redirect limit, allowed schemes and hosts, and whether private and loopback addresses are refused, each taken from the code with a `path:line` reference |

### Data, operations and issues
| ID | Requirement |
| --- | --- |
| R-37-07 | *Data and privacy* lists which personal data is stored (Discord id, name, avatar, sessions, activity events, images and their source URLs), where (table or bucket), for how long (housekeeping retention), who can see it (role or admin), and which of it leaves the system to an outside service |
| R-37-08 | *Operations* describes local setup, CI jobs, deploy, health check, housekeeping jobs, backups and monitoring as they exist today, and says plainly “none” where something does not exist |
| R-37-09 | *Issues* is one table with the columns `ID`, `Severity`, `Category`, `Issue`, `What could go wrong`, `Evidence`, `Suggested fix`. IDs are `I-01`, `I-02`, …; severity is `high`, `medium` or `low`; category is `security`, `privacy`, `dependency`, `spec-gap`, `test-gap` or `ops`. Rows are sorted by severity, then category |
| R-37-10 | The review covers at least: session and cookie settings, CSRF and origin checks, cross-trip access (404 vs 403), SSRF on URL image fetch and short-link resolve, image content sniffing and size, signed URL lifetime, admin powers, secrets in the repo and deploy, Nominatim and OpenFreeMap usage policies, Commons license handling, behavior when each outside service is down, single-process limits of live events and timers, database and blob backups, log and error exposure, and every *Known gaps* bullet of the core files grouped into rows. Each topic either has an issue row or a line under the table saying why it is fine, with evidence |
| R-37-11 | Every `Evidence` cell holds at least one reference that resolves: a repo path (optionally `:line`), a core ID present in `requirements/core/`, or a T-ID present in a step file. A finding the author could not confirm is marked `to verify` in the `Issue` cell |
| R-37-12 | *How to keep this current* says when to update the document (a new core area, a new outside service, a fixed issue: mark it `fixed in step NN`, do not delete the row) and that `pnpm test` checks it |

### Check and links
| ID | Requirement |
| --- | --- |
| R-37-13 | `scripts/overview.test.mjs` (run by `node --test` from `pnpm test`, no new dependency) fails with one message per problem when: a section of R-37-01 is missing or out of order; a core area file has no `###` subsection under *Core functionality*; one of the integrations of R-37-04 has no subsection, or a subsection lacks a row of R-37-05; an *Issues* row has an invalid severity or category, a duplicate ID, or is out of sort order; an evidence path does not exist, a line number is past the end of the file, or a core ID or T-ID is not found |
| R-37-14 | `README.md` (docs section) and the header of `docs/PROJECT_SCOPE.md` link to `docs/SYSTEM_OVERVIEW.md`; the outdated “nothing is implemented yet” line in `PROJECT_SCOPE.md` is replaced by a pointer to the overview. (no core change) |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-OPS-47 | add | R-37-01, R-37-03, R-37-04, R-37-09, R-37-11, R-37-13 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-37-01 | unit | R-37-01, R-37-03, R-37-04, R-37-05, R-37-09, R-37-11, R-37-13 | `scripts/overview.test.mjs` passes on the written document, and its own fixture cases fail with the expected message for: a missing *Issues* section, a core area without subsection (a fake `requirements/core/zz.md`), a missing *Timeout and failure* row, severity `critical`, an `I-03` before an `I-02` of higher severity, evidence `apps/api/src/nope.ts`, `apps/api/src/app.ts:99999`, `C-SPOT-99` and `T-99-01` |
| T-37-02 | unit | R-37-13 | `pnpm test` runs the overview check (the root `test:req` script or an added script includes it) and exits non-zero when the check fails |
| T-37-03 | manual | R-37-02 | Both mermaid diagrams render on GitHub, and the sequence diagram matches the code path of `POST /trips/:id/spots` (role guard, one transaction with the activity event and the notification, SSE fan-out) |
| T-37-04 | manual | R-37-05, R-37-06 | For three integrations (Nominatim, URL image fetch, Google Maps short links) every *Timeout and failure* and outgoing-limit value is checked against the cited `path:line` and matches |
| T-37-05 | manual | R-37-07, R-37-08 | Data table checked against `docs/database/DATABASE.md` and the housekeeping rule C-OPS-12: every table holding user data appears with the right retention; *Operations* says “none” for anything that does not exist (e.g. backups if there are none) |
| T-37-06 | manual | R-37-10, R-37-11 | Checklist walk: every topic of R-37-10 has an issue row or a justified “fine” line; every *Known gaps* bullet of the 17 core files is covered by some row; three `high` rows are re-checked by reading the cited code and still hold |
| T-37-07 | manual | R-37-12, R-37-14 | README and `PROJECT_SCOPE.md` link to the overview, the stale status line is gone, and *How to keep this current* names the update triggers and the `pnpm test` check |
