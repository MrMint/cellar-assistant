---
name: multi-agent-build
description: Run a large change as a multi-agent build: plan to briefs to parallel stream-builder agents to a verify round to a fix round to one PR. Use when the owner says "run this as a build", hands over a plan too big for one session, or asks for parallel streams. Not for a change one session can make.
---

# Multi-agent build

You are the **lead**. You write no feature code. You turn a plan into briefs, spawn one
`stream-builder` per brief, merge their PRs into an integration branch, run a verify round, triage
it, run a fix round, and hand the owner one PR to main.

This process came from smart-home's Fettle builds (R3 to R13, 2026-10 to 11), and each rule below
carries the measurement it came from. Where cellar hasn't measured something yet, the rule says so.
Re-measure with `node tools/agent-spend.ts` after each build, and change the rule when the numbers
disagree.

## Where the rules live

Each rule has one home. Fettle kept stream rules in three files (the agent definition, a per-build
MECHANICS.md and a runbook), and they drifted: two of them said every agent keeps a five-minute
cache while the definition set an hour.

| Rules for | Home | Enforced by |
|---|---|---|
| Every stream | `.claude/agents/stream-builder.md` | its hooks: outline, search limit, typecheck, push guard |
| Every agent in this repo | `.claude/settings.json` | spawn guard, shell guard, wait guard, dev-stack hooks |
| The lead | this file | you, and `tools/agent-spend.ts` after each phase |
| One build only | `$BUILD/NOTES.md`: facts, not rules (stubs landed, routes moved, rulings) | nothing; keep it short |

Don't copy a role's rules into a brief or NOTES.md. Point at the definition.

## Where things live

`$BUILD` is the build's directory: `$BUILD = <primary checkout>/.builds/<name>/`. `.builds/` is
gitignored, and it lives in the primary checkout because that outlasts every worktree the build
makes, the lead's included. The scratchpad doesn't: a reboot or cleanup can clear it.

| Thing | Path |
|---|---|
| The plan: what each part delivers, model contract, file ownership, rulings | `$BUILD/plan.md` |
| Brief sources (you write these) | `$BUILD/briefs/src/<id>.md`, from [`templates/brief.src.md`](templates/brief.src.md) |
| Briefs and check files (generated) | `$BUILD/briefs/<id>.md`, `$BUILD/briefs/<id>.check.json` |
| Hand-offs between streams | `$BUILD/HANDOFFS.md`: one table under `## Rows`, an `H-<n>` row each |
| Verify findings, rulings, fix buckets | `$BUILD/FIX.md` |
| Fix-bucket brief sources | `$BUILD/briefs/src/fix-<bucket>.md`, from [`templates/fix-brief.src.md`](templates/fix-brief.src.md) |
| Your own state | `$BUILD/RESUME.md`, from [`templates/RESUME.md`](templates/RESUME.md) |

## One lead session per build, from a fresh checkout

- **Start the lead in a worktree cut from `origin/main`, at the repo root's `.claude/worktrees/`.**
  A session loads its agent definitions, hooks and skills from its own checkout, once, when it
  starts. The SessionStart freshness hook warns when a checkout is far behind main. Measured
  2026-11-22: the primary checkout was 109 commits behind and spawned none of these roles.
- **Never nest worktrees.** Create every stream's worktree under the repo root's
  `.claude/worktrees/`, never under another worktree's. In 2026-11 cellar held about forty worktrees
  nested inside one build's worktree, which `git worktree list` shows but nothing tears down in
  order.
- **The lead's context is the build's most expensive.** You can see only the agents your own
  session spawned, so don't hand a running build to another session. When the last wave has
  merged and nothing is running, bring RESUME.md up to date and start the verify and fix phases in
  a fresh lead session that reads only RESUME.md. In Fettle's R10 the lead ran its fix round at a
  median 442k context, and Fettle's earlier single-session passes peaked at 739k.
- At every phase change, update RESUME.md with the head of `node tools/agent-spend.ts --session
  <your session id prefix>`. A flag there (an unroled agent, an agent past 400k context, max
  effort) is a sizing error to fix before the next phase spawns.

## The phases

### 1. Plan, then a spec-gap pass before any spawn

Write `$BUILD/plan.md`. It has a section per part (what it delivers, the acceptance criteria),
`## Ownership` (a table: stream id, then the files and directories it owns, no file twice), `##
Model contract` (types and endpoints streams share), and `## Rulings` (`- **L<n> · DECIDED.** …`).

Before slicing, spawn one `reviewer` on `plan.md` with this job: list every part whose behaviour,
owner or data source is ambiguous, every part no stream owns, every file two streams own, and every
contradiction between a part and a ruling or the code on `origin/main`. Output goes to
`$BUILD/spec-gaps.md`. Rule each gap in `## Rulings`. Ask the owner only what the code, AGENTS.md
and the owner's earlier rulings don't settle. Why: in Fettle, rulings found mid-build grew from 11 to
20 across three releases, and each cost a stream a stall and the lead a context switch.

For a redesign or a migration, first spawn a `surveyor` to inventory every job the affected screens
do today: each control, where it leads, what it writes. Any job the plan drops needs a ruling. Why:
a Fettle redesign merged two rooms and silently dropped one's job (the shelf), and it came back
only after the owner noticed.

### 2. Briefs: write sources, generate briefs

Write one source per stream in `$BUILD/briefs/src/`, then generate:

```bash
node tools/slice-briefs.ts $BUILD          # every source; or name ids
```

- `@include plan.md § <heading> › <part>` copies the slices a stream needs into its brief. A brief
  that only points at sections makes the stream open the whole file again after every compaction:
  in Fettle's R3, streams re-read the two plan files about 470 times, 17% of all they read.
- `@owns` lists the files the stream owns. The pre-PR check fails on any changed file outside them.
- `@map` the existing files the stream will change (at most 25). The slicer writes each one's
  exports with line numbers, its importers (through barrels, `@/` and `@cellar-assistant/*`) and its
  tests. Re-slice a waiting stream's brief after the merges it waits on.
- `@tests` are the test files that prove its acceptance criteria.

The slicer refuses a heading or part that matches nothing or several things. Fix the source, never
the generated brief. It also refuses a brief over its line cap: that is two streams. In Fettle's
R4, every stream that hit or neared the 300-turn cap had a brief over 400 lines. Split by files
owned. `@size large <reason>` overrides the check when the work can't be split.

### 3. Spawn

**Start with at most four streams at once,** and raise that only when measured check times stay
flat. Fettle's ceiling of six came from a 14-core Mac running health-app's dev servers: there, a
stream's verify went from 3.6 to 10.7 minutes with eight to eleven agents running. A cellar stream
that runs `dev:bootstrap` brings up Postgres, MinIO, placement, a scheduler and two Dapr apps of
its own, so its ceiling is probably lower. It is not measured yet. Record the check times in
RESUME.md.

For each stream whose `Waits on` has merged, while you're under the ceiling:

1. Create its worktree: `git worktree add .claude/worktrees/<build>-<id> -b claude/<build>-<id>
   origin/claude/<build>` from the repo root, then `bun install --frozen-lockfile` in it. Never
   below the root.
2. Write the integration branch's remote ref into its `.review/changed-since`:
   `mkdir -p .review && echo origin/claude/<build> > .review/changed-since`. Without it, the pre-PR
   check measures from main and runs every package's tests.
3. Spawn `stream-builder` with a prompt of three lines: the brief path, the worktree path, and
   "Read your brief, then keep PROGRESS.md per your definition."
4. Record the stream in RESUME.md: id, agent id, worktree, branch.

Size streams by turns: S ≤ 120, M ≤ 250, M+ ≤ 300 (the cap). A stream that compacts three times
hands back; split the rest of its work using its PROGRESS.md.

**Plan at most two merge waves.** Before a wave spawns, land every seam two of its streams share as
your own stubs on the integration branch (a shared type, a route's layout slot, a contract entry).
That way no stream waits on another's merge to start. Why: one Fettle plan chained nine merges, and
a stream there was told "the base moved" four times while its check ran; its PR sat open 8.1 hours.

### 4. Merge

A stream's PR must carry the summary from `.review/pre-pr.md` with every step passing. If it's
missing or a step failed, send the PR back. A pass is a floor, not a review: in Fettle's R4, 23 of
24 stream PRs passed it and the verify round still found 87 defects. Merge into the integration
branch; never rebase it or force-push it. After each merge, add what the next streams need to know
to `$BUILD/NOTES.md`.

Copy each PR's hand-offs (work it found in another stream's files) into `$BUILD/HANDOFFS.md` as
`H-<n>` rows: the source stream, the owning stream, the file, one line. In Fettle's R4, 23 of 87 fix
rows needed a change in another bucket's files, and with no row to own them a second fix pass cost
about $41.

Don't message a stream that the base moved while its check runs. Put base moves in one note it
reads when the check finishes; it merges and re-runs the check once.

At each merge, dry-run the teardown of the streams that merged over an hour ago:
`node tools/teardown-worktrees.ts <build>-<id>`. It takes a worktree's dev stack down first, and
keeps anything with unpushed work. Auto mode blocks an agent's bulk `git worktree remove`, so ask
the owner to run `--apply`, or for a permission rule on the tool. Why: each worktree is several GB;
in Fettle 165 of them filled a 926 GB disk.

### 5. Verify round

When the last wave has merged, start every lens at once, each with a disjoint scope. In Fettle's R8,
52% of rows were found by two or more lenses.

| Lens | Agent | Job |
|---|---|---|
| Code | `reviewer` | The integration diff against `plan.md`, the rulings and AGENTS.md |
| Walk, split by route group if large | `verifier` | Each part's job end to end as a person, against the integration branch's stack (its worktree's `dev:bootstrap`, or `stack:up` on 3003), plus copy and consistency across screens |
| Hand-off check | `surveyor`, one per slice of HANDOFFS.md | Marks each `H-` row confirmed (still needed on the integration branch) or refuted |
| Suites | the lead | `bun run test` and `bun run test:e2e` on the integration branch, in the background, with the tree state recorded beside the counts (AGENTS.md § Testing and validation) |

In Fettle's R10, the Code lens found two of the four blockers for $11, and the hand-off check
refuted 79 of 154 rows before any bucket was sized for them. Each lens writes rows with a severity
(blocker, major, minor), a file or route, and the part it breaks.

### 6. Triage and fix

Spawn the hand-off buckets as soon as the hand-off check is in: they need no lens finding. In
Fettle's R10, 72 of 136 fix rows were hand-offs the streams had written themselves.

Merge the lens reports into `$BUILD/FIX.md`: one row per defect, deduplicated, each with an `F-<n>`
id, a severity, the owning stream (by file ownership) and the ruling it needs. It has three sections
the slicer reads: `## Rulings` (`- **FR-<n> · DECIDED.** …`), `## Buckets` (a table, bucket id in the
first cell) and `## Defects` (a table, `F-<n>` in the first cell). Split a row whose fix spans two
buckets' files.

Size each bucket at about 27 turns per row, so an M bucket (≤ 250 turns) holds at most 9 rows. That
rate is Fettle's R4: its buckets took 19 to 41 turns a row, and three that held 12 to 21 rows each
hit the cap. Spawn one fresh `stream-builder` per bucket from
[`templates/fix-brief.src.md`](templates/fix-brief.src.md). Never resume a build stream for a fix
round, because its cache is cold. **A fix bucket runs the pre-PR check once, at the end.** In
Fettle's R10, buckets ran their check 5.4 times each, and a check was running for 57% of their wall
time.

### 7. The PR to main

When the last fix bucket merges, re-run the suites on the integration branch. Fix any blocker before
the PR, and turn anything else into an issue. Then open one PR to main with what each part
delivered, the verify and fix counts, and the deferred rows as issues.

Ask the owner how they want the PR landed before you open it. Open it while the owner is awake if
you can, and fix the first CI run's failures right away. Nothing merges it on green, so tell the
owner in one line when its checks pass. In Fettle's R10 the PR opened at night and sat green for nine
hours.

### 8. Tear down and close

Dry-run `node tools/teardown-worktrees.ts <build>-` and paste its plan into RESUME.md and the PR.
Ask the owner to run it with `--apply`. Then write the build's numbers into RESUME.md: the
`agent-spend` head for the whole build, including the stream search-turn share, which is how the
search-limit hook's trial gets judged. Then end the session.

## Never

- Let a stream write outside its worktree, or run git in the primary checkout (the shell guard
  refuses a subagent's git writes there).
- Raise the 300k compaction cap, or give an agent other than `stream-builder` a 1-hour cache.
  Streams have one because their waits outlast five minutes: in Fettle's R9, 144 cold resumes under
  the five-minute cache rewrote 22.8M tokens, and R10's one-hour cache cut them to 7.
- Spawn `general-purpose` or `fork`. The spawn guard refuses them and any project agent with no
  `effort` or `maxTurns`, and it lists the roles that fit.
- Edit a generated brief by hand.
- Start a host dev server or build. The shell guard refuses those too (AGENTS.md § HARD).
