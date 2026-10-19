# Step 36 — Faster CI: no second test run after merge, two Playwright workers

**Goal:** a merged pull request deploys in minutes without running the same tests again on `main`, and pull request e2e jobs finish sooner because Playwright uses two workers in CI.
**Depends on:** 21
**Result:** Merge a green pull request: the `push` run on `main` shows `pr-verified` green, `static`, `build` and `e2e` skipped and `deploy` started within a few minutes; on a pull request every e2e log says “using 2 workers” and the slowest e2e job is clearly faster than the ~28 minutes of today
**Core:** C-OPS-46, C-OPS-18, C-OPS-23, C-OPS-24, C-OPS-21, C-OPS-07
**Status:** integrated 2026-10-16

## Scope
- In: a `pr-verified` job and `scripts/ci-pr-verified.mjs` that prove a `main` commit is exactly what a green pull request run tested; skipping `static`, `build`, `e2e` and `e2e-report` on `main` when it is proven; `ci-passed` and `deploy` working with that; a manual full run on `main`; `workers: 2` for Playwright in CI; the docs of the pipeline.
- Out: sharding e2e over more jobs or larger runners (not planned); changing which tests run on a pull request (step 21); the deploy script itself (step 21); a merge queue.

## Current behavior
| Topic | Today |
| --- | --- |
| After merge | `ci.yml` runs on `push` to `main` with all jobs again (C-OPS-18). The run after PR #15 took 30 minutes (13:16–13:46) although the pull request run had passed with the same code; `deploy` waits for it (C-OPS-24) |
| Why it is the same code | The `main` ruleset requires an up-to-date branch and `ci-passed` (C-OPS-23), so the tree that lands on `main` is the tree the pull request's last run checked out (`refs/pull/N/merge`) |
| Workers | `playwright.config.ts` sets no `workers`; on the private repo's 2-vCPU runners Playwright picks 1. Logs: “Running 220 tests using 1 worker” (chromium, 19 min), firefox 28 min, webkit 27 min |
| Parallel safety | Specs already run `fullyParallel` and avoid shared mutable data (C-OPS-31); dev login runs alone as a teardown |

## Decisions
| Topic | Decision |
| --- | --- |
| Proof, not trust | `main` skips tests only when it can prove the commit's tree equals the tree a successful pull request run tested. Anything else (direct push, a failed or missing run, a different tree, an API error) runs the full pipeline as today |
| Tree, not SHA | The merge commit's SHA differs from the PR run's merge ref, but the tree is the same for merge, squash and rebase merges when the branch was up to date. The PR run records its tree; `main` compares trees |
| Two workers | `workers: 2` only in CI; locally Playwright keeps its default. Retries stay at 1 (C-OPS-22), so a new flake from parallelism shows up as flaky in the summary and is fixed, not hidden |

## Requirements

### No second run after merge
| ID | Requirement |
| --- | --- |
| R-36-01 | On pull request runs, `ci-passed` (only when it succeeds) uploads an artifact `tested-tree` (30 days) holding `git rev-parse HEAD^{tree}` of the checked-out merge ref and the PR number |
| R-36-02 | `scripts/ci-pr-verified.mjs` (no runtime dependency, functions exported) gets the pushed commit and a GitHub API client and answers `{verified, reason}`. It is `verified: true` only when: the commit belongs to exactly one merged pull request (`GET /repos/{repo}/commits/{sha}/pulls`), the latest CI run for that PR's final head SHA ended `success`, that run has a `tested-tree` artifact for the same PR, and its tree equals the pushed commit's tree. Otherwise `verified: false` with one of the reasons `no_pull_request`, `run_not_green`, `no_tested_tree`, `tree_mismatch`, `api_error` |
| R-36-03 | On `push` to `main`, a first job `pr-verified` (`actions: read`, `contents: read`) runs the script, writes the result and reason to the job summary and exposes `verified` as an output. On pull request runs it does not exist or is skipped |
| R-36-04 | When `verified` is `true`, `static`, `build`, `e2e` and `e2e-report` are skipped on `main`; when it is `false`, they run exactly as on a pull request. The summary of a skipping run links the pull request run that was reused |
| R-36-05 | `ci-passed` also needs `pr-verified`. On a `push` with `verified: true` it succeeds when `pr-verified` succeeded and the four test jobs were skipped; in every other case it keeps today's rule (each needed job `success`, skipped or cancelled counts as failed). `pr-verified` failing makes `ci-passed` fail |
| R-36-06 | `deploy` keeps its conditions (C-OPS-24) and still needs `ci-passed`, so a verified merge deploys right after `pr-verified`. A `workflow_dispatch` on `main` runs the full pipeline (no skipping) and then deploys, as an escape hatch |

### Two Playwright workers
| ID | Requirement |
| --- | --- |
| R-36-07 | `playwright.config.ts` sets `workers: process.env.CI ? 2 : undefined`; every e2e job log shows “using 2 workers” (the `mobile` job with 2 tests may use fewer) |
| R-36-08 | With two workers the suite stays stable: tests that change global settings or depend on order stay serial (C-OPS-31), dev login still runs alone, and three pull request runs in a row show 0 failed and 0 flaky in every project. A test that turns flaky with two workers is fixed (shared data or waiting), not retried or made serial without a reason in the spec |

### Docs
| ID | Requirement |
| --- | --- |
| R-36-09 | `README.md` (CI section) says that `main` reuses the pull request run when the tree matches, lists the fallback reasons, explains the manual full run, and states the two CI workers |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-OPS-46 | add | R-36-01, R-36-02, R-36-03, R-36-04 |
| C-OPS-18 | modify | R-36-03, R-36-06 |
| C-OPS-23 | modify | R-36-05 |
| C-OPS-24 | modify | R-36-06 |
| C-OPS-21 | modify | R-36-07, R-36-08 |
| C-OPS-07 | modify | R-36-09 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-36-01 | unit | R-36-02 | `scripts/ci-pr-verified.test.mjs` (run by `pnpm test`) with a fake API: merged PR, green latest run, matching tree → `verified: true`; no PR → `no_pull_request`; latest run for the head SHA failed while an older one was green → `run_not_green`; no artifact → `no_tested_tree`; different tree → `tree_mismatch`; the API throws or answers 500 → `api_error`; two PRs for one commit → `no_pull_request` |
| T-36-02 | unit | R-36-01, R-36-03, R-36-04, R-36-05, R-36-06 | A test reads `.github/workflows/ci.yml`: `pr-verified` runs only on `push`, has `actions: read`, and exposes `verified`; `static`, `build`, `e2e` and `e2e-report` carry the `verified != 'true'` condition; `ci-passed` needs `pr-verified`; `ci-passed` uploads `tested-tree` only on pull requests; `workflow_dispatch` is a trigger and disables skipping |
| T-36-03 | unit | R-36-05 | `scripts/ci-passed.mjs` with `NEEDS` fixtures: push + verified + four skipped → pass; push + verified + `pr-verified` failure → fail; pull request with one skipped job → fail (as today); push + not verified + all success → pass |
| T-36-04 | ci | R-36-01, R-36-03, R-36-04, R-36-05, R-36-06 | Merge a green pull request: the PR run has the `tested-tree` artifact; the `main` run shows `pr-verified` green with the PR link in its summary, the four test jobs skipped, `ci-passed` green and `deploy` started, all within 5 minutes of the merge |
| T-36-05 | ci | R-36-02, R-36-04 | A commit pushed to `main` without a pull request (by an admin with the ruleset temporarily bypassed, or simulated on a fork) gets `no_pull_request` in the summary and the full pipeline runs; a manual `workflow_dispatch` on `main` runs every job and deploys |
| T-36-06 | ci | R-36-07, R-36-08 | Three runs in a row on the same pull request: every e2e log (except possibly `mobile`) says “using 2 workers”, every project shows 0 failed and 0 flaky, `ci-passed` is green, and the slowest e2e job is at least 25 % faster than the 28 minutes of the PR #15 run |
| T-36-07 | manual | R-36-09 | README CI section read against the workflow: reuse rule, fallback reasons, manual full run and two workers are described and match `ci.yml` |
