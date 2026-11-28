#!/bin/sh
#
# SessionStart: say so when this checkout is far behind origin/main.
#
# A session loads its agent roles, hooks, skills, CLAUDE.md and AGENTS.md from its own checkout, once,
# at start. A checkout far behind main gives the session the old harness, with nothing to say so.
# Measured 2026-11-22: the primary checkout sat 109 commits behind origin/main, still on a months-old
# CLAUDE.md and the nextjs-* personas, with none of the build roles. Every session started there ran
# without them.
#
# It reads the last fetch only (no network), and prints a line of context for the session when HEAD
# is more than BEHIND commits behind. Silent otherwise; exits 0 always.
set -u

BEHIND=20
ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
git -C "$ROOT" rev-parse --verify -q origin/main >/dev/null 2>&1 || exit 0
n="$(git -C "$ROOT" rev-list --count HEAD..origin/main 2>/dev/null || echo 0)"
[ "$n" -gt "$BEHIND" ] 2>/dev/null || exit 0

echo "This checkout is $n commits behind origin/main (as of the last fetch). Its agent roles, hooks and AGENTS.md may be stale, so a multi-agent build should start its lead from a worktree cut from origin/main (.claude/skills/multi-agent-build)."
exit 0
