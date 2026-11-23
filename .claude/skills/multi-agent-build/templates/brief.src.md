# Brief · <id> · <what it delivers>

Your role's rules are in `.claude/agents/stream-builder.md`, which you already have. Keep PROGRESS.md
per those rules.

- **Worktree:** `<repo>/.claude/worktrees/<build>-<id>`, branch `claude/<build>-<id>`.
- **PR base:** `claude/<build>`, titled `<build> <id>: <what>`. Never main.
- **Size:** <S|M|M+> (S ≤ 120 turns, M ≤ 250, M+ ≤ 300). If you compact three times, stop, update
  PROGRESS.md and hand back.
- **Before the PR:** `node tools/pre-pr-check.ts --brief <build dir>/briefs/<id>.md`, and its summary
  in the PR body.

## Goal
<one sentence: what a person can do when this lands>

## Acceptance criteria
- <the plan's parts this stream delivers>
- Every write path you add or touch has a test that proves the wrong write impossible (wrong user,
  wrong cellar, a write that should not happen), shown failing first.
- The pre-PR check passes.

## Files you own
@owns <paths and directories, repo-relative>

No other file. A change you need elsewhere goes to its owner, named in your PR body as a hand-off.

## What to build
@include plan.md § <part>

## Code map
@map <the existing files this stream changes, repo-relative>

## The contract you code against
@include plan.md § Model contract › <entries>

## Rulings that bind you
@include plan.md § Rulings › <L1>; <L5>

## Waits on
<ids that must be merged first, or "nothing">

## Hands off to
<who takes what next>

@tests <repo-relative test files that prove the criteria>
