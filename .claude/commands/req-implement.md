---
description: Implement requirements steps and extra tasks as a stack of pull requests (one branch and PR per part, atomic green commits), each part by a head agent (Opus 5.5, high) that splits work across up to 4 herdr worker agents
argument-hint: <step> [step…] [+ task…]
model: claude-opus-5-5
effort: high
---

Arguments: `$ARGUMENTS` — step numbers (`33 34`) and extra tasks after `+` (`33 + fix the toast spacing`). Every step is one **part**; every `+` task is one part after the steps (R-35-01). A task that only touches files of one step's part is instead a separate commit in that part. A task that would change a rule in `requirements/core/` stops the run: tell the user to write a step with `/req-new` first.

## Roles
- **Several parts** (more than one step or task): you are the **base agent**. You implement nothing and spawn no workers. You run `pnpm req:stack`, then one orchestrator per part, strictly one after another (section B).
- **A stack of one**, or an orchestrator started by a base agent: you are the **head agent** for one part (section H). A stack of one is one branch and one PR to `main`.

## Hard rules (R-35-03, R-35-10)
- Never merge a PR, never push to `main`, never delete a branch, never force-push without asking the user.
- Never amend or rebase a commit that is pushed. Workers never commit.
- Never stage with `git add -A`, `git add .` or `git commit -a`: stage by path. Never stash, reset or stage uncommitted files that do not belong to the run (they stay modified and in no commit). If they block a checkout, stop and tell the user.
- Never push a part that is not fully green, and never push a later part when an earlier one failed.

## B. Base agent
1. Must run inside herdr (`herdr pane current`). Run `pnpm req:stack $ARGUMENTS` (add `--resume` to continue an earlier stack). It prints `{parts: [{n, kind, id, title, branch, base}]}` in the right order or exits 1 with one message per problem (unknown step, cycle, already integrated, branch exists): show the messages and stop. Show the plan, then proceed.
2. `git fetch origin`. Part 1 starts from `origin/main`; part *k* starts from the tip of part *k−1*'s branch, and only after part *k−1* is committed and green (R-35-03).
3. For each part, in order: spawn an orchestrator in a new pane (same split and retry loop as section H.2, name `orch-<n>`, model Opus 5.5):
   `herdr agent start orch-<n> --kind claude --pane "$PANE" -- --model claude-opus-5-5 --effort high --permission-mode acceptEdits`
   Prompt it: `/req-implement <that part only>. You are the orchestrator for part <n> of <total>, started by a base agent. Branch: <branch>, base: <base> (already checked out / create it from the base tip). Commit atomically on that branch, replay in a worktree, push and open the PR only when green. Unrelated uncommitted files: <list>. End your final message with exactly one line: REQ-IMPLEMENT-RESULT <n> green|failed <PR url or reason>`.
   Supervise like a worker (H.3): loop `herdr agent wait orch-<n> --until idle --until blocked --until done --timeout …`; answer when `blocked`; on `idle` read the last 80 lines and look for the result line. Then close leftover panes of that orchestrator and its pane (`herdr pane close`).
   Start part *k+1* only after part *k* is committed and green. Never run two orchestrators at once.
4. If a part fails, push nothing for it or any later part; their commits stay local and the report names them. Skip later parts that depend on it and continue only with independent ones if their base is still valid (otherwise stop).
5. Once all PRs exist, update every PR body with the final stack links (R-35-09):
   `pnpm req:stack <same parts> --stack-section <n> --prs <url1> <url2> …` (use `-` for a part without a PR), then `gh pr edit <url> --body-file <file>` with the body's *Stack* section replaced.
6. Final summary (R-35-12): per part its branch, base, PR URL, commits (hash and subject) and DoD result (pass / fail / manual per T-test), report path, open items. Say that nothing was merged.

## H. Head agent (one part)
You plan, delegate to at most **4 worker agents** in herdr panes, verify with the real tests, commit, and open the part's PR. You write code yourself only for shared glue that cannot be split.

### H.0 Preconditions
- Inside herdr (`herdr pane current`), else stop and tell the user.
- Read `requirements/README.md` (conventions, global DoD G-1..G-10), the part's step file and the core files its `## Core changes` table names. Verify every step in **Depends on** is implemented (or is an earlier part of this stack). If not, stop and report.
- `git status`: note the uncommitted files that do not belong to this part. They stay out of every commit.
- Make sure you are on the part's branch (`git switch -c <branch> <base>`; for part 1 the base is `origin/main` after `git fetch`).

### H.1 Plan
1. Build a task list from the step's R- and T- rows plus the global DoD.
2. Split into **1-4 work packages** (`w1-api`, `w2-web`, …), each with: the R-/T-IDs it owns, an **exclusive file/directory ownership list** (shared files such as `package.json`, lockfile, migrations, `packages/shared` and translations are owned by one package or done by you first), and the exact commands that prove it.
3. If packages depend on each other, define the contract yourself first (routes, Zod schemas in `packages/shared`) and commit it as its own commit.
4. Show the plan briefly, then proceed.

### H.2 Spawn workers (herdr)
The new pane's shell needs a moment, so `agent start` must be retried while it returns `agent_pane_busy`:
```
PANE=$(herdr pane split --current --direction right --cwd "$PWD" --no-focus | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['pane']['pane_id'])")
for i in $(seq 1 15); do
  r=$(herdr agent start <name> --kind claude --pane "$PANE" -- --model claude-sonnet-5-5 --effort medium --permission-mode acceptEdits 2>&1)
  echo "$r" | grep -q '"error"' || break; sleep 1
done
herdr agent prompt <name> "<worker brief>"
```
Keep a map name -> pane id. Split from the previous worker pane (`--pane <ID>`); use `--direction down` after two columns. Run these via `bash -c` since the login shell is fish.

The worker brief is self-contained: step file path, owned R-/T-IDs, the files it may edit (and "do not touch anything else"), the contract, repo conventions (pnpm, TS, en+de strings, activity_events in the same transaction), the exact test commands, and "reply with a summary of changes and the test output when done; **do not commit**".

### H.3 Supervise
- `herdr agent wait <name> --until idle --until blocked --until done` (with `--timeout`, in a loop; check `herdr agent list`).
- `blocked` is a question or permission prompt: `herdr agent read <name> --lines 60`, answer with `herdr agent prompt <name> "..."` or `herdr agent send-keys`.
- Do not trust worker claims: read the diff of each worker's files.

### H.4 Verify (you run the tests yourself)
1. `pnpm lint && pnpm typecheck && pnpm test`
2. The step's T- tests by type: `api`/`unit` via `pnpm test`, `e2e`/`a11y` via `pnpm test:e2e` limited to the step's specs, `db` via `docs/database/checks.sql` when the schema changed.
3. Walk the global DoD G-1..G-10 against the diff.
Map every `T-NN-xx` to pass / fail / manual.

### H.5 Close or re-prompt
- Failure in a package: `herdr agent prompt <name> "<failing test id, exact output, expected behavior, files it may edit>" --wait`, then re-verify. At most **3** rounds per worker, then take over or report the blocker.
- Package green: `herdr pane close <PANE_ID>`. Close all worker panes at the end, also on abort.
- Never call a part done while a non-manual T- test fails.

### H.6 Integrate (only when every non-manual DoD test passes)
Skip this stage if any DoD test fails: core files, the step's **Status** and `INDEX.md` stay untouched. For a task part there is nothing to integrate.
1. For each row of the step's `## Core changes` table edit `requirements/core/<area>.md` (see `requirements/core/_FORMAT.md`):
   - `add`: append the row with the reserved ID (`Since` = this step, *Changed by* `—`).
   - `modify`: rewrite the rule text, add the step to *Changed by* (ascending), update the `<!-- R-… -->` comment and *Tests* to the T-IDs that prove the rule.
   - `remove`: set status `removed`, add the step to *Changed by*, keep the row.
   - Every `active` rule needs a T-ID, or `—` plus a bullet under `## Known gaps`. Tag new tests with their T-ID.
2. In the step file set `**Core:**` and `**Status:** integrated <today, YYYY-MM-DD>`.
3. Run `pnpm req:build`, then `pnpm req:check`; fix every problem (never edit `INDEX.md` by hand).

### H.7 Atomic commits (R-35-04, R-35-06, R-35-07)
Commit on the part's branch as work becomes green, never while a worker still edits the files involved:
- One logical change per commit (a shared contract, one finished work package, one test hardening, one fix, the core integration). Stage by path. A commit never holds files of two parts. The step's core integration (core files, **Core**/**Status** lines, `requirements/INDEX.md`) is the **last** commit of the part.
- Message: a subject in the repo's style (`git log --oneline -10`: one sentence, what changes and why it matters to the user), a body line `Step NN: R-NN-xx, …` (or `Task: <task text>`) saying what it covers, then the attribution trailer. Name only the commit's own change, no "also carries …".
- A later fix for code of an earlier part is committed on that part's branch. If later branches are not pushed yet, rebase them onto it; if they are, push the earlier branch and `git merge` it into each later branch in order. Never force-push.

### H.8 Report
After integrate, spawn the test reporter in a new pane unless the user opted out (split as in H.2, retry `agent start`):
```
herdr agent start reporter --kind claude --pane <PANE_ID> -- --model claude-sonnet-5-5 --effort low
herdr agent prompt reporter "/req-test-report <step>" --wait
```
Close the reporter pane, then commit the report file (`requirements/reports/NN-report.md`) on the part's branch as its own commit, so the PR contains it.

### H.9 Replay, push, pull request (R-35-05, R-35-08)
When all non-manual DoD tests pass, integrate is done and the report is committed:
1. Replay the part's commits in a clean worktree so unrelated files never matter:
   ```
   git worktree add ../req-replay-<branch> <branch>
   git -C ../req-replay-<branch> rebase -x "pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test" <base>
   git worktree remove --force ../req-replay-<branch>
   ```
   That is `git rebase -x "…" <base>` run inside the worktree (via `git -C`, no `cd`).
   A failing commit is fixed or split (unpushed history only) and replayed again. Always remove the worktree.
2. `git push -u origin <branch>`, then
   `gh pr create --base <base> --head <branch> --title "Step NN — <step title>" --body-file <file>` (task part: title `Task — <task text>`).
3. The PR body has: the step's **Goal** and **Result** (or the task text), the *Stack* section from `pnpm req:stack <all parts> --stack-section <n> --prs <known urls>`, the part's commits (short hash and subject), the T-test table (pass / fail / manual), the core changes, the report path, and ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
4. If the part is red, push nothing: the commits stay local and the report names them.

### H.10 Final summary
Finish with: packages, files changed, T-test table, core diff, report path, branch, base, PR URL, commits (hash and subject), open items. Leave anything that is not an atomic, green change uncommitted.
