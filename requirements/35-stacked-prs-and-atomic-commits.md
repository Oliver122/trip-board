# Step 35 — Stacked pull requests and atomic commits from /req-implement

**Goal:** when `/req-implement` builds several steps or extra tasks in one run, every part lands as its own pull request in a stack (each based on the previous part's branch), and every commit in it is one green, self-contained change.
**Depends on:** 21, 30
**Result:** Run `/req-implement` for two planned steps: it opens two pull requests, the second based on the first one's branch, each PR body lists the whole stack with links, and `git log --stat` shows one logical change per commit, each passing lint, typecheck and tests on its own
**Core:** C-OPS-43, C-OPS-44, C-OPS-45, C-OPS-40, C-OPS-03
**Status:** integrated 2026-10-16

## Scope
- In: parts of a run (steps and extra tasks), `pnpm req:stack` (stack plan and the PR body's stack section), one branch and one PR per part with the previous part's branch as base, atomic and individually green commits, fixes for an earlier part, push and `gh pr create` when a part is green, rewritten `.claude/commands/req-implement.md` and the README flow.
- Out: merging, auto-merge or deleting branches (stays with the user); changes to the CI jobs themselves (step 21, only checked here); `/req-new` and `/req-test-report` (unchanged, step 30); rewriting the history of already merged steps.

## Current behavior
| Topic | Today |
| --- | --- |
| Several steps | `/req-implement 33 34` worked through both steps in one tree; they ended up in one commit (`552f771`) that also “carries step 32, which was still uncommitted”, and one PR (#15) |
| Commits | The committed `req-implement.md` says “Do not commit unless the user asks”. An uncommitted draft adds a *Commits* section (atomic commits *may* be made, never push) that this step replaces |
| Pull requests | Opened by hand after the run; nothing says which base a later step's PR uses |
| CI | `.github/workflows/ci.yml` runs on every `pull_request` without a branch filter, so a PR to a non-`main` base is checked too (C-OPS-18, gated by `ci-passed`, C-OPS-23) |

## Decisions
| Topic | Decision |
| --- | --- |
| Stack, not one big PR | One PR per part, part *k* based on part *k−1*'s branch. Each PR shows only its own diff and can be reviewed and merged in order; after the lower PR merges and its branch is deleted, GitHub retargets the next one to `main` |
| Who pushes | The head agent pushes and opens a part's PR only when that part is fully green. It never merges, never pushes to `main` and never force-pushes without asking |
| Green per commit | Proven by replaying the part's commits in a clean `git worktree` with `git rebase -x`, so unrelated uncommitted files in the user's tree never influence or enter a commit |
| Helper script | Branch names, bases and the stack section are computed by `scripts/req/stack.mjs`, so they are the same every run and unit-testable; git and `gh` calls stay in the command file |

## Requirements

### Parts and stack plan
| ID | Requirement |
| --- | --- |
| R-35-01 | `/req-implement` takes one or more parts: step numbers (`33 34`) and extra tasks written after `+` (`33 + fix the toast spacing`). Each step is one part. An extra task is its own part placed after the steps, unless it only touches files of one step's part, then it is a separate commit in that part. An extra task that would change a rule in `requirements/core/` stops and asks the user to write a step with `/req-new` first |
| R-35-02 | `pnpm req:stack <parts…>` (`scripts/req/stack.mjs`, no runtime dependency, also exporting its functions) prints JSON `{parts: [{n, kind, id, title, branch, base}]}`. Steps are ordered so that every step comes after the steps it depends on (ties by number), tasks keep their given order after the steps. Branches are `step-NN-<slug>` from the step file name and `task-<slug>` (kebab case of the task text, at most 40 characters); part 1's base is `main`, part *k*'s base is part *k−1*'s branch. It exits non-zero with one message per problem for: an unknown step number, a dependency cycle, a step whose **Status** is already `integrated`, and a branch that already exists locally or on `origin` (allowed with `--resume`, which continues that stack) |
| R-35-03 | The head agent starts from `origin/main` after `git fetch`, creates part 1's branch, and creates part *k*'s branch from the tip of part *k−1* only after part *k−1* is committed and green. Uncommitted files that do not belong to the run are never staged, stashed or reset; if they block a checkout, it stops and tells the user |

### Atomic commits
| ID | Requirement |
| --- | --- |
| R-35-04 | Every commit is one logical change (a shared contract, one finished work package, one test hardening, one fix, the core integration of a step) and is staged by path (never `git add -A` or `git commit -a`). A commit never holds files of two parts, and a step's core integration (core files, the step's **Core**/**Status** lines, `requirements/INDEX.md`) is the last commit of that step's part |
| R-35-05 | Before a part is pushed, its commits are replayed in a clean worktree (`git worktree add`, then `git rebase -x "pnpm lint && pnpm typecheck && pnpm test" <part base>`) and every commit passes; a failing commit is fixed or split before the push, and the worktree is removed afterwards |
| R-35-06 | A commit message has a subject in the repo's style (one sentence: what changes and why it matters to the user), a body line `Step NN: R-NN-xx, …` or `Task: <task text>` with what it covers, and the attribution trailer. It names only its own change (no “also carries …”). Workers never commit; the head agent never amends or rebases a pushed commit |
| R-35-07 | A fix found later for code of an earlier part is committed on that part's branch. If the later branches are not pushed yet, they are rebased onto it; if they are, the earlier branch is pushed and merged into each later branch in order (`git merge`), never force-pushed |

### Pull requests
| ID | Requirement |
| --- | --- |
| R-35-08 | When every non-manual DoD test of a part passes (and, for a step, integrate is done), the head agent pushes its branch (`git push -u origin <branch>`) and runs `gh pr create --base <part base> --head <branch>` with the title `Step NN — <step title>` or `Task — <task text>`. Parts are pushed in stack order; when a part fails, neither it nor any later part is pushed, their commits stay local and the report names them |
| R-35-09 | Each PR body has: the step's **Goal** and **Result** (or the task text), a *Stack* section, the part's commits (short hash and subject), its T-test table (pass / fail / manual), its core changes, the report path and the PR attribution line. The *Stack* section comes from `pnpm req:stack --stack-section <n> --prs <url…>`: every part in order with its PR link or “not opened”, the current part marked “this PR”, and the note “Merge in order; after the PR below merges, this one retargets to `main`.” Once all PRs of the run exist, every body is updated with `gh pr edit` so all links are filled in |
| R-35-10 | The head agent never merges a PR, never pushes to `main` and never deletes a branch. A run with a single step is a stack of one: one branch, one PR to `main` |
| R-35-11 | A PR whose base is another part's branch runs the full CI pipeline and reports `ci-passed`, and after the lower PR merges with its branch deleted, GitHub retargets it to `main` and CI runs again (no change expected to `ci.yml`; if a filter blocks it, it is removed) |

### Command and docs
| ID | Requirement |
| --- | --- |
| R-35-12 | `.claude/commands/req-implement.md` describes R-35-01 to R-35-10: the argument hint shows `<step> [step…] [+ task…]`, the draft *Commits* section and “Do not commit unless the user asks” are replaced, and the final summary lists per part its branch, base, PR URL, commits (hash and subject) and DoD result. `requirements/README.md` “Flow of a change” adds the stack and PR step after integrate |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-OPS-43 | add | R-35-01, R-35-02, R-35-03 |
| C-OPS-44 | add | R-35-04, R-35-05, R-35-06, R-35-07 |
| C-OPS-45 | add | R-35-08, R-35-09, R-35-10, R-35-11 |
| C-OPS-40 | modify | R-35-12 |
| C-OPS-03 | modify | R-35-02 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-35-01 | unit | R-35-02 | With fixture steps 91–93 (93 depends on 91, 92 is integrated): `91 93 + fix toast spacing` gives branches `step-91-…` (base `main`), `step-93-…` (base `step-91-…`), `task-fix-toast-spacing` (base `step-93-…`); `93 91` is reordered to `91 93`; a 60-character task is cut to 40 characters without a trailing dash; `99` (unknown), `92` (integrated) and a 91↔93 cycle each exit 1 with a message naming the step |
| T-35-02 | unit | R-35-02 | In a temp git repo with a branch `step-91-…` already present: `req:stack 91` exits 1 naming the branch; with `--resume` it prints the same plan and exits 0 |
| T-35-03 | unit | R-35-09 | `--stack-section 2 --prs <url1>` for a three-part plan lists the parts in order, links part 1, shows “not opened” for part 3, marks part 2 “this PR” and ends with the merge-in-order note; output is identical across runs |
| T-35-04 | unit | R-35-12 | Guard test on `.claude/commands/req-implement.md`: it contains `pnpm req:stack`, `gh pr create --base`, `git rebase -x` and `git worktree add`, its argument hint names several steps and `+ task`, and it no longer contains “Do not commit unless the user asks” or `git add -A` outside a “never” sentence; `requirements/README.md` “Flow of a change” mentions the stacked PRs |
| T-35-05 | ci | R-35-11 | Throwaway stack of two PRs (PR 2 based on PR 1's branch): both run CI and report `ci-passed`; merging PR 1 with branch deletion retargets PR 2 to `main` and its CI runs again |
| T-35-06 | manual | R-35-01, R-35-03, R-35-04, R-35-05, R-35-06, R-35-08, R-35-10 | In herdr, with an unrelated edited file in the tree, run `/req-implement` for two small planned steps plus one `+` task: three branches and three PRs, each based on the previous branch; `git log --stat <base>..<branch>` per part shows one logical change per commit, no file in two parts, the integration commit last; a fresh `git rebase -x "pnpm lint && pnpm typecheck && pnpm test"` per part passes; messages carry the `Step NN:` / `Task:` line; the unrelated file is still modified and in no commit; nothing was merged or pushed to `main`. A `+` task that would change a core rule makes the run stop and ask for `/req-new` |
| T-35-07 | manual | R-35-07, R-35-08 | In the same run, a bug in part 1 found while on part 2 is fixed by a commit on part 1's branch and merged up after part 1 was pushed (no force-push in the PR timeline); a deliberately failing DoD test in part 2 leaves part 1's PR open, part 2 and the task not pushed, and the report names both |
| T-35-08 | manual | R-35-09 | Each PR body of T-35-06 has the Goal/Result, the *Stack* section with all three links filled in after `gh pr edit`, its own commits, T-table, core changes and report path |
