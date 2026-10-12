---
description: Implement a requirements step with a head agent (Opus 5.5, high) that splits work across up to 4 herdr worker agents, runs the DoD tests, and closes or re-prompts workers
argument-hint: <step number, e.g. 07>
model: claude-opus-5-5
effort: high
---

You are the **head agent** for implementing step `$ARGUMENTS`. You plan, delegate to at most **4 worker agents** running in herdr panes, verify with the real tests, and either close each worker or re-prompt it. You write code yourself only for shared glue that cannot be split.

## 0. Preconditions
- Must run inside herdr: `herdr pane current` returns your pane. If it fails, stop and tell the user.
- Read `requirements/README.md` (conventions + global DoD G-1..G-10), `requirements/$ARGUMENTS-*.md` and the core files its `## Core changes` table names (`requirements/core/*.md`: they describe the state before the step). Verify every step in **Depends on** is implemented (check code/tests). If not, stop and report.
- `git status`: if the tree has unrelated uncommitted changes, tell the user and continue only on files of this step.

## 1. Plan
1. Build a task list from the step's R- and T- rows plus the global DoD.
2. Split into **1-4 work packages** (never more than 4; fewer is fine for small steps). Each package gets:
   - a name (`w1-api`, `w2-web`, ...),
   - the R-/T-IDs it owns,
   - an **exclusive file/directory ownership list**. Packages must not edit the same file. Shared files (`package.json`, lockfile, migrations, `packages/shared`, translation files) are owned by exactly one package, or done by you first, before spawning anyone.
   - the exact commands that prove it is done (e.g. `pnpm --filter @tripboard/api test -- trips`).
3. If packages depend on each other (e.g. API before UI), define the contract (routes, Zod schemas in `packages/shared`) yourself first and commit to disk, then spawn workers in parallel.
4. Show the plan briefly, then proceed without waiting unless something is ambiguous.

## 2. Spawn workers (herdr)
For each package (verified working; the new pane's shell needs a moment, so `agent start` must be retried while it returns `agent_pane_busy`):
```
PANE=$(herdr pane split --current --direction right --cwd "$PWD" --no-focus | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['pane']['pane_id'])")
for i in $(seq 1 15); do
  r=$(herdr agent start <name> --kind claude --pane "$PANE" -- --model claude-sonnet-5-5 --effort medium --permission-mode acceptEdits 2>&1)
  echo "$r" | grep -q '"error"' || break; sleep 1
done
herdr agent prompt <name> "<worker brief>"
```
Keep a map name -> pane id. Split from the previous worker pane (`--pane <ID>`) to keep layout sane; use `--direction down` after two columns. Use the `fish`-safe form: run these via `bash -c` since the login shell is fish.

Worker brief must be self-contained: step file path, the R-/T- IDs it owns, the files it may edit (and an explicit "do not touch anything else"), the contract, the repo conventions (pnpm, TS, en+de strings, activity_events in the same transaction), the exact test commands, and "reply with a summary of changes and the test output when done; do not commit".

## 3. Supervise
- Wait for workers: `herdr agent wait <name> --until idle --until blocked --until done` (use `--timeout` and loop; check `herdr agent list`).
- `blocked` means a question or permission prompt: `herdr agent read <name> --lines 60`, then answer with `herdr agent prompt <name> "..."` or `herdr agent send-keys`.
- Do not trust worker claims. Read the diff of files each worker owned.

## 4. Verify (you run the tests yourself)
Run, in order, and fix nothing silently:
1. `pnpm lint && pnpm typecheck && pnpm test`
2. The step's `T-` tests by type: `api`/`unit` via `pnpm test`, `e2e`/`a11y` via `pnpm test:e2e` limited to the step's specs, `db` via `docs/database/checks.sql` when the schema changed.
3. Walk the global DoD G-1..G-10 against the diff.

Map every `T-NN-xx` to pass / fail / not-run (manual and ci rows are listed as manual).

## 5. Close or re-prompt
- Failures attributable to a package: `herdr agent prompt <name> "<failing test id, exact output, expected behavior, files it may edit>" --wait`, then re-verify. Max **3** re-prompt rounds per worker; after that, take over or report the blocker.
- Package fully green: close it with `herdr pane close <PANE_ID>`. Close all worker panes at the end, also on abort.
- Never mark done while any non-manual T- test fails.

## 6. Integrate (only when every non-manual DoD test passes)
Skip this stage entirely if any DoD test fails: core files, the step's **Status** and `INDEX.md` stay untouched.
1. For each row of the step's `## Core changes` table, edit `requirements/core/<area>.md` (see `requirements/core/_FORMAT.md`):
   - `add`: append the row with the reserved ID (`Since` = this step, *Changed by* `—`).
   - `modify`: rewrite the rule text to the new behavior, add the step to *Changed by* (ascending), update the `<!-- R-… -->` source comment and *Tests* to the T-IDs that prove the current rule.
   - `remove`: set status `removed`, add the step to *Changed by*, keep the row and ID.
   - Every `active` rule needs at least one T-ID, or `—` plus a bullet under `## Known gaps`. Tag new tests with their T-ID (comment or title).
2. In the step file set `**Core:**` to the core IDs from the Core changes table and `**Status:** integrated <today, YYYY-MM-DD>`.
3. Run `pnpm req:build`, then `pnpm req:check`; fix every reported problem (never edit `INDEX.md` by hand).
4. Keep the core diff for the summary: `git diff -- requirements/core requirements/$ARGUMENTS-*.md`.

## 7. Report
Spawn the test reporter (command 3) in a new pane unless the user opted out:
```
(split as above, retry `agent start` until the shell is ready)
herdr agent start reporter --kind claude --pane <PANE_ID> -- --model claude-sonnet-5-5 --effort low
herdr agent prompt reporter "/req-test-report $ARGUMENTS" --wait
```
Then close the reporter pane. Finish with a short summary: packages, files changed, T-test table, the core diff (rules added / modified / removed), report path, open items. Do not commit unless the user asks.
