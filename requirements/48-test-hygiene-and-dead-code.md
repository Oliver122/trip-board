# Step 48 — Test hygiene and dead code

**Goal:** the test suite is green on every run and every test is traceable. A test that only passes on its retry fails CI, and code, files and dependencies nothing uses are removed and kept out by a CI check.
**Depends on:** 30, 36, 45
**Result:** `pnpm test` passes three times in a row with no image-storage failure. `pnpm deadcode` prints nothing and runs in the CI `static` job. A pull request with a test that passes only on retry is red. `pnpm req:check` names every test file that proves no T-ID and every T-ID in code that no step defines. `migrated.sql` and `reference.sql` are gone from the root.
**Core:** C-OPS-19, C-OPS-22, C-OPS-42, C-OPS-57, C-OPS-58
**Status:** planned

## Scope
- In: fixing the shared-bucket flake in the api image tests; failing CI on flaky e2e tests; a T-ID or a listed reason for every test file; unknown T-IDs in code; forbidding `.only` and unconditional skips; `knip` for unused files, exports and dependencies; removing what it finds; deleting the duplicate root SQL dumps.
- Out: splitting big files such as `BoardPage.tsx` or the stores (a refactor step of its own); writing tests for the untested rules listed in I-12, I-13 and I-31 (a test-gap step); making CI faster (step 36); removing features. Only code that nothing reaches is removed, and no behaviour changes.

## Current behavior
| Topic | Today |
| --- | --- |
| Api flake | `images/images.test.ts` (T-08-05) and `images/file-size.test.ts:136` fail now and then in the full `pnpm test` run because `expect(await storage.list()).toEqual([])` sees a `trips/…/*.webp` key from another test file. All test files share one MinIO bucket. They pass alone (step 44 report, *Failures*; T-08-02 in steps 35–37) |
| Retries | Playwright retries once in CI (C-OPS-22, `playwright.config.ts:24`), so a test that fails once and passes once is green and nobody sees it |
| Untagged tests | 9 test files name no T-ID: `e2e/00-webgl.spec.ts`, `e2e/ui-review/capture.spec.ts`, `apps/web/src/api/write.test.ts`, `apps/web/src/map/clusters.test.ts`, `apps/web/src/map/trip.test.ts`, `apps/web/src/pages/TripSettingsPage.test.tsx`, `apps/api/src/db/isolation-b.test.ts`, `apps/api/src/spots/bbox.test.ts`, `apps/web/src/components/ui/setting-row.test.tsx`. `req:check` only looks the other way: every T-ID in a step must appear in code |
| Skips | One `test.skip`, in `e2e/dev-login.spec.ts:118`. It is conditional (Chromium only) and has a reason. Nothing stops an unconditional skip or a `.only` from landing |
| Dead code | `tsc --noUnusedLocals --noUnusedParameters` is clean in all three packages, but nothing checks unused exports, unused files or unused dependencies |
| Stray files | `migrated.sql` and `reference.sql` (32 kB each, byte-identical, from the initial commit) are not referenced anywhere (I-33) |

## Decisions
| Topic | Decision |
| --- | --- |
| Flake fix | Each api test file gets its own key prefix: the storage helper in tests gets a per-file `prefix`, and `list()` / cleanup only look under it. One bucket stays, so there is no new MinIO setup in CI |
| Flaky gate | Playwright `failOnFlakyTests: true` in CI. `retries: 1` stays, so the trace on first retry still gets recorded, but a test that needs it fails the job |
| Untagged files | A file must either name a T-ID or appear in `scripts/req/untagged-tests.json` with a one-line reason (setup checks, helpers, the UI-review capture). The list is meant to stay short: a file that proves behaviour gets the T-ID of the rule it proves |
| Dead-code tool | `knip` (a pinned devDependency, no network at run time), configured with the real entry points. Something used only dynamically goes into `knip.json`'s `ignore` with a comment, never silenced in bulk |
| Tests of removed code | A test whose only purpose was code that is now removed is deleted along with it. A T-ID that then vanishes from code must belong only to `removed` core rules, or `req:check` flags it (C-OPS-42 already does for active rules) |

## Requirements

### Green and honest tests
| ID | Requirement |
| --- | --- |
| R-48-01 | The api test storage helper takes a per-file key prefix (derived from the test file name). Uploads, `list()` and the after-each cleanup in `images.test.ts`, `file-size.test.ts` and every other test file that asserts on stored keys only see keys under their own prefix, so a key left by another file never fails an assertion. The `toEqual([])` checks stay, scoped to the prefix |
| R-48-02 | In CI, Playwright runs with `failOnFlakyTests: true`: a test that fails and then passes on its retry makes its `e2e` job fail, and the report marks it flaky. `retries: 1` and the trace on first retry stay. Locally nothing changes |
| R-48-03 | ESLint fails on `.only` in any test (`test.only`, `it.only`, `describe.only`) and on an unconditional `test.skip` / `it.skip` / `describe.skip` / `test.fixme`. A conditional skip (`test.skip(condition, reason)` or a callback) is allowed, and Playwright keeps `forbidOnly` in CI |

### Traceable tests
| ID | Requirement |
| --- | --- |
| R-48-04 | `pnpm req:check` fails with `file:1 test file names no T-ID` for every `*.test.ts(x)`, `*.test.mjs` and `*.spec.ts` under `apps/`, `packages/`, `e2e/` and `scripts/` that contains no `T-NN-NN` and is not listed in `scripts/req/untagged-tests.json`. That file holds `{path, reason}` entries, and an entry whose file is gone or now has a T-ID is itself an error |
| R-48-05 | `pnpm req:check` fails with `file:line unknown T-ID` for a `T-NN-NN` in a test file that no step's Definition of Done defines, and reports `file:line T-ID only proves removed rules` for a located T-ID that appears only in `removed` core rules and in no active rule or planned step |
| R-48-06 | Each of the 9 untagged files (see *Current behavior*) either gets the T-ID of the rule it proves, in a test title or a `// T-NN-NN` comment, or gets a `untagged-tests.json` entry with its reason. At most 4 entries remain (`00-webgl`, `ui-review/capture` and the isolation pair are the expected ones). Every T-ID or removed-rule finding of R-48-05 on the current tree is fixed: the ID is corrected, or the test is deleted when it only tests removed behaviour |

### Dead code
| ID | Requirement |
| --- | --- |
| R-48-07 | `knip` is a pinned root devDependency with a `knip.json` that names the workspaces and their entry points (the api server and its scripts such as seed and migrate, the web `main.tsx` and Vite config, the e2e specs and the Playwright config, `scripts/**/*.mjs`). `pnpm deadcode` runs it and reports unused files, unused exports and types, and unused dependencies and devDependencies. The CI `static` job runs `pnpm deadcode` after `pnpm typecheck`, and any finding fails the job |
| R-48-08 | Everything `pnpm deadcode` finds on the current tree is removed, or, when it is used in a way knip cannot see (a dynamic import, a file loaded by path, a CLI-only dependency), added to `ignore` / `ignoreDependencies` with a comment saying who uses it. Removing code changes no behaviour: `pnpm test`, `pnpm test:e2e` on Chromium and `pnpm check:bundle` pass, and the step report lists the removed files, exports and dependencies with counts (no core change) |
| R-48-09 | `migrated.sql` and `reference.sql` are deleted from the repository root, nothing references them (`git grep` finds only history docs), and I-33 in `docs/SYSTEM_OVERVIEW.md` is marked fixed in step 48 (no core change) |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-OPS-19 | modify | R-48-07 |
| C-OPS-22 | modify | R-48-02 |
| C-OPS-42 | modify | R-48-04, R-48-05 |
| C-OPS-57 | add | R-48-01, R-48-03 |
| C-OPS-58 | add | R-48-07 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-48-01 | api | R-48-01 | A test puts a stray key under another file's prefix. Then the T-08-05 style cleanup assertion of `images.test.ts` still passes, and that file's own `list()` does not include the stray key |
| T-48-02 | manual | R-48-01 | `pnpm --filter @tripboard/api test` runs 3 times in a row on a fresh database with 0 failures. The outputs' pass counts are recorded in `requirements/reports/48-report.md` |
| T-48-03 | ci | R-48-02 | On a throwaway pull request, a spec that fails on its first attempt and passes on `testInfo.retry === 1` makes the `chromium` job and `ci-passed` fail, and the report lists the test as flaky. With the spec removed the run is green |
| T-48-04 | unit | R-48-03 | ESLint on fixture files: `test.only(…)` and an unconditional `it.skip(…)` each report an error, while `test.skip(({ browserName }) => browserName !== 'chromium')` and `test.skip(cond, 'reason')` pass |
| T-48-05 | unit | R-48-04, R-48-05 | `scripts/req` tests on a fixture tree: an untagged test file → `test file names no T-ID`, the same file listed in `untagged-tests.json` → ok, a listed file that now has a T-ID or is gone → error, `T-99-01` in a test → `unknown T-ID`, and a T-ID only on a removed rule → `only proves removed rules` |
| T-48-06 | ci | R-48-04, R-48-05, R-48-06 | `pnpm req:check` on the step branch exits 0, and `untagged-tests.json` has at most 4 entries, each with a reason |
| T-48-07 | unit | R-48-07 | `pnpm deadcode` exits non-zero on a fixture workspace with an unused exported function, an unused file and an unused dependency, naming all three, and exits 0 on the fixture with them removed |
| T-48-08 | ci | R-48-07, R-48-08 | The `static` job runs `pnpm deadcode` and it exits 0 on the step branch. A throwaway commit adding an unused export makes `static` fail |
| T-48-09 | manual | R-48-08, R-48-09 | Checklist in `requirements/reports/48-report.md`: the removed files, exports and dependencies with counts, every `ignore` entry with its reason, `pnpm test`, `pnpm test:e2e --project chromium` and `pnpm check:bundle` passing, `git grep -n "migrated.sql\|reference.sql"` showing only docs, and I-33 marked fixed |
