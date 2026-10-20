# Step 39 — One locale source and deploys from a commit

**Goal:** fix the two severe points of the roast that are still open: the translation strings live in one place only, and `pnpm push` deploys the checked-out commit instead of whatever is on disk.
**Depends on:** 03, 21, 37
**Result:** `ls apps/web/public/locales` fails and the app still shows English and German. Edit any tracked file without committing and run `pnpm push`: it stops before connecting to the server and names the changed file. Commit it and run `pnpm push` again: it prints the short commit id it uploads, an untracked file next to it is not on the server, and `cat $DEPLOY_PATH/REVISION` on the server shows that commit
**Core:** —
**Status:** planned

## Scope
- In: removing the mirror `apps/web/public/locales/`, the test that keeps the one source and stops the mirror from returning, the paths in `docs/DESIGN.md` §7 and `docs/PROJECT_SCOPE.md`; a new `scripts/deploy-archive.sh` that checks the working tree and writes the commit as a tar stream, used by `scripts/deploy.sh`; the `REVISION` file on the server; the line references to `scripts/deploy.sh` in `docs/SYSTEM_OVERVIEW.md`; the C-APP-07 *Known gaps* bullet.
- Out: the other roast points (each its own step if wanted: flaky `T-08-02`, failing CI on retries, splitting `BoardPage.tsx`, the root SQL dumps, a read-only share link); production mode and backups (`docs/SYSTEM_OVERVIEW.md` I-01, I-03, a later ops step); removing files on the server that were deleted from the repo (the upload still extracts over the old tree); requiring the commit to be on `origin/main` (only a warning here); the CI `deploy` job (it checks out a clean commit and keeps working unchanged).

## Current behavior
| Topic | Today |
| --- | --- |
| Locales | The app imports `apps/web/src/locales/{en,de}/common.json` (`apps/web/src/i18n.ts:3`). `apps/web/public/locales/{en,de}/common.json` is a byte-identical copy that nothing loads at runtime; `T-03-01` in `apps/web/src/locales.test.ts` only asserts the two stay equal. Every new string is written twice. `docs/DESIGN.md` §7 still names the `public/` copy as the source |
| Deploy | `scripts/deploy.sh:2` says "Upload the working tree": it tars the repo directory minus a few excludes, so uncommitted edits and untracked files (agent briefs, scratch files) reach the server. C-OPS-25 already promises that it "uploads the commit". Nothing on the server says which commit runs |

## Decisions
| Topic | Decision |
| --- | --- |
| Which locale copy stays | `apps/web/src/locales/`: it is the one the bundle imports and the one the e2e cleanup spec reads. The `public/` copy is deleted, not generated, because nothing fetches `/locales/*.json` |
| What counts as dirty | Staged or unstaged changes to tracked files. Untracked files do not block the deploy, because `git archive` never ships them (so `.claude/briefs/` does not get in the way) |
| What gets uploaded | `git archive HEAD` plus a `REVISION` file with the full commit id. Ignored files such as `deploy.env` and `.env` are therefore never in the upload, without an exclude list |
| No override | There is no `--force` flag. To deploy an experiment, commit it (on any branch) first |
| Unpushed commit | Allowed, with a warning, so a laptop deploy of a local branch still works (C-OPS-27) |

## Requirements

### One locale source
| ID | Requirement |
| --- | --- |
| R-39-01 | `apps/web/public/locales/` is deleted. The only translation files are `apps/web/src/locales/en/common.json` and `apps/web/src/locales/de/common.json`, imported by `apps/web/src/i18n.ts`. The app shows the same English and German texts as before, and `apps/web/dist/` after `pnpm build` contains no `locales/` folder |
| R-39-02 | `apps/web/src/locales.test.ts` no longer reads the `public/` copy. A test fails, naming the path, when `apps/web/public/locales` exists or when a file under `apps/`, `packages/`, `e2e/` or `scripts/` (except that test) contains the string `public/locales` |
| R-39-03 | `docs/DESIGN.md` §7 and the tree in `docs/PROJECT_SCOPE.md` name `apps/web/src/locales/{en,de}/common.json`; the C-APP-07 bullet is removed from *Known gaps* in `requirements/core/app.md` |

### Deploy from a commit
| ID | Requirement |
| --- | --- |
| R-39-04 | `scripts/deploy-archive.sh` run in a repository with staged or unstaged changes to tracked files exits `1` before writing anything to stdout, and prints to stderr “Refusing to deploy: N uncommitted change(s). Commit or stash them first.” followed by one line per changed path (as `git status --porcelain --untracked-files=no` lists them). Untracked files do not count |
| R-39-05 | In a clean repository it writes to stdout a tar stream of `git archive HEAD` with one extra top-level file `REVISION` that holds the full 40-character commit id and a newline, and prints “Deploying <short id> <subject>” to stderr. Untracked and ignored files (e.g. `deploy.env`, `.env`, `node_modules/`) are not in the stream |
| R-39-06 | When `HEAD` is not contained in `origin/main` (or `origin/main` does not exist), `scripts/deploy-archive.sh` still succeeds but prints “Warning: <short id> is not on origin/main; CI has not checked it.” to stderr |
| R-39-07 | `scripts/deploy.sh` runs `scripts/deploy-archive.sh` first, before it reads `deploy.env` or opens any SSH connection, and pipes its stream into the remote `tar -xf -` instead of `tar -C "$root" -cf - .` with excludes. When the archive script fails, `deploy.sh` exits `1` with the archive script's message and makes no SSH connection. The header comment says “Upload the checked-out commit and restart Trip Board” |
| R-39-08 | After a successful deploy `$DEPLOY_PATH/REVISION` on the server holds the deployed commit id; `pnpm push` and the CI `deploy` job behave as before otherwise (C-OPS-25, C-OPS-27, C-OPS-28 unchanged in effect) |
| R-39-09 | The `scripts/deploy.sh:<line>` evidence in `docs/SYSTEM_OVERVIEW.md` points at the same code after the change (`node scripts/overview/check.mjs` passes and each cited line still shows what the row says), and `README.md` notes that `pnpm push` needs a clean working tree |

## Core changes
| Core ID | Change | From |
| --- | --- | --- |
| C-APP-38 | add | R-39-01, R-39-02 |
| C-OPS-25 | modify | R-39-05, R-39-07, R-39-08 |
| C-OPS-48 | add | R-39-04, R-39-06 |

## Definition of Done
| ID | Type | Covers | Test |
| --- | --- | --- | --- |
| T-39-01 | unit | R-39-01, R-39-02, R-39-03 | `apps/web/src/locales.test.ts`: `apps/web/public/locales` does not exist; no file under `apps/`, `packages/`, `e2e/`, `scripts/`, `docs/` other than this test contains `public/locales`; `requirements/core/app.md` has no *Known gaps* bullet starting with `C-APP-07`; `T-03-01` still passes against `src/locales` only |
| T-39-02 | ci | R-39-01 | In the CI `build` job, `test ! -e apps/web/dist/locales` after `pnpm build`; the e2e suite (which renders English and German texts) passes unchanged |
| T-39-03 | unit | R-39-04 | Vitest test (next to `apps/api/src/deploy-env.test.ts`) creates a temp git repo with a copy of `scripts/deploy-archive.sh`, commits a file, then modifies it and stages another: the script exits `1`, stdout is empty, stderr has the refusal line with `2 uncommitted change(s)` and both paths. With only an untracked file it exits `0` |
| T-39-04 | unit | R-39-05 | Same temp repo, clean, with an untracked `deploy.env` and an ignored `.env`: exit `0`, the stream lists exactly the committed files plus `REVISION`, `REVISION` equals `git rev-parse HEAD` + newline, stderr has `Deploying <short id> <subject>` |
| T-39-05 | unit | R-39-06 | Same temp repo with no `origin` remote: exit `0` and stderr has the warning line; after adding a bare `origin` with `main` pushed at `HEAD` and fetching, no warning |
| T-39-06 | unit | R-39-07 | `scripts/deploy.sh` with a dirty temp repo and a `PATH` whose `ssh` stub writes a marker file: exits `1`, the refusal message is on stderr, no marker file exists, and the missing-`deploy.env` message is not printed (the check runs first). The script source no longer contains `tar -C "$root" -cf` |
| T-39-07 | manual | R-39-05, R-39-08 | Run `pnpm push` from a clean tree with an untracked scratch file: the app answers on `/api/health`, `cat $DEPLOY_PATH/REVISION` shows `git rev-parse HEAD`, the scratch file is not on the server; the next CI deploy on `main` also updates `REVISION` |
| T-39-08 | manual | R-39-09 | `node scripts/overview/check.mjs` passes; open each `scripts/deploy.sh:<line>` cited in `docs/SYSTEM_OVERVIEW.md`: the line shows the code the row describes; `README.md` mentions the clean-tree rule next to `pnpm push` |
