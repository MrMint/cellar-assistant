# Fix brief · <bucket> · <what it fixes>

Your role's rules are in `.claude/agents/stream-builder.md`. Read this brief, then the original
stream's PROGRESS.md at `<its worktree>/PROGRESS.md` (or its archived copy) for what it decided and
why.

- **Worktree:** `<repo>/.claude/worktrees/<build>-fix-<bucket>`, branch `claude/<build>-fix-<bucket>`.
- **PR base:** `claude/<build>`, titled `<build> fix <bucket>: <what>`. Never main.
- **Size:** <S|M|M+>, at about 27 turns per row: at most 9 rows in an M (≤ 250 turns). If you compact
  three times, stop, update PROGRESS.md and hand back.
- **Before the PR:** the pre-PR check, once, at the end:
  `node tools/pre-pr-check.ts --brief <build dir>/briefs/fix-<bucket>.md`, with its summary in the PR body.

## Goal
Every row below is fixed, or answered in the PR body with why it isn't a defect.

## Acceptance criteria
- Each row has a test that fails before the fix and passes after. A row only a browser can show gets
  the verifier's reproduction steps, re-run, in the PR body.
- A row that needs a change in a file you don't own goes in your PR body as a hand-off, never into
  that file.

## Rulings on this round
@include FIX.md § Rulings

## Your rows
@include FIX.md § Buckets › <bucket>
@include FIX.md § Defects › <F-1>; <F-2>

<!-- A hand-off bucket lists its H- rows instead of, or as well as, F- rows: -->
<!-- @include HANDOFFS.md § Rows › <H-1>; <H-2> -->

## Files you own
@owns <the files the rows name>

## Code map
@map <the files the rows name>

@tests <the test files you will add or change>
