#!/bin/sh
#
# SessionStart: reclaim the per-worktree dev stacks whose worktree is gone.
#
# CLEANING ON ENTRY, NOT ON EXIT. There is no hook for a conversation being
# archived, and the exit path cannot be trusted: a session killed mid-turn runs
# no hook at all. A session that starts does not care how the last one died.
#
# `stack.sh prune --apply` removes only a `cellar-*` compose project whose
# compose file no longer exists on disk, so it cannot reach a live worktree's
# stack, and the shared `cellar-stack` is skipped by name (scripts/stack/stack.sh,
# cmd_prune). That is what makes it safe to run unattended, from every session,
# alongside other sessions.
#
# Best effort by construction: every branch exits 0. A machine with no Docker or
# a daemon that is not running is a machine with nothing to reclaim, not a
# session that should fail to start.
set -eu

ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
[ -x "$ROOT/scripts/stack/stack.sh" ] || exit 0
command -v docker >/dev/null 2>&1 || exit 0
docker info >/dev/null 2>&1 || exit 0

# Detached, so a slow `compose down --volumes` never sits between the operator
# and their first prompt. The log is where to look when a stack went missing.
nohup "$ROOT/scripts/stack/stack.sh" prune --apply >"${TMPDIR:-/tmp}/cellar-dev-prune.log" 2>&1 &

exit 0
