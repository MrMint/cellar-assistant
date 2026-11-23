#!/bin/sh
#
# WorktreeRemove: take the removed worktree's dev stack down, volumes included.
#
# Fires when a worktree is removed at session exit, when a subagent finishes, or
# when a background session is deleted. There is no reading of this event under
# which the checkout comes back, so its database goes too.
#
# THE PATH COMES FROM THE HOOK, NOT FROM $PWD. `worktree_path` is passed as $1
# by .claude/settings.json; this hook runs for a worktree that is not the one
# the session is in, and $PWD here would tear down the wrong stack. An empty
# argument is a no-op.
#
# Only a worktree that ever ran `dev:up` has a `.stack/` directory; without one
# there is nothing to take down. `stack.sh down` refuses the shared
# `cellar-stack` project on its own. dev-prune.sh catches whatever never got here.
set -eu

WORKTREE="${1:-}"
[ -n "$WORKTREE" ] || exit 0
[ -d "$WORKTREE/.stack" ] || exit 0
[ -x "$WORKTREE/scripts/stack/stack.sh" ] || exit 0
command -v docker >/dev/null 2>&1 || exit 0

"$WORKTREE/scripts/stack/stack.sh" down --volumes || true

exit 0
