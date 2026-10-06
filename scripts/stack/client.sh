#!/usr/bin/env bash
# The shared lane's client container, rebuilt or recreated WITH its sidecar.
#
#   bun run stack:client:build    rebuild the image; if the client is running,
#                                 recreate it and client-files-loopback
#   bun run stack:client:up       recreate both from the image already built
#
# ## Why not just `docker compose up -d client`
#
# `client-files-loopback` (infra/docker-compose.yml) runs in the client's
# network namespace — `network_mode: "service:client"` — which Docker resolves
# to the client *container's id* when the sidecar is created. Recreate the
# client alone (`up -d client`, `up -d --force-recreate client`, a rebuild
# followed by either) and the sidecar keeps running, attached to a namespace
# that no longer exists: no eth0, nothing listening on the new client's
# loopback, so every `/_next/image` fetch of a presigned MinIO URL fails from
# inside the new client. Nothing restarts it, and `depends_on: { restart: true }`
# does not help — measured 2026-10-05 under Compose v5.5.1 with two busybox
# services: after `up -d --force-recreate a`, `b` still had
# `NetworkMode=container:<old a id>` with or without `restart: true`.
#
# What does work is naming the sidecar in the same `up`: Compose then sees its
# namespace target changed and recreates it (same experiment: `up -d b` alone
# recreated `b` against the new `a`). So every client recreate goes through
# here, and names both.
#
# `--no-deps`: `api` and `actors` bind-mount the worktree, and starting or
# recreating them publishes every agent's uncommitted source (AGENTS.md,
# "Worktrees") — a client rebuild must never do that as a side effect.
#
# bash 3.2 (macOS): no associative arrays, no `mapfile`.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/docker-compose.yml"

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

recreate() {
  compose up -d --no-deps client client-files-loopback
}

case "${1:-}" in
  build)
    compose build client
    # Built, but only swapped in if a client is already running: a rebuild
    # with the lane down should not start half of it (`bun run stack:up` does
    # the whole lane, sidecar included).
    if [ -z "$(compose ps -q client)" ]; then
      echo "[stack:client] image built; no client running, so nothing to recreate (bun run stack:up starts the lane)"
      exit 0
    fi
    recreate
    ;;
  up)
    recreate
    ;;
  *)
    echo "usage: $0 build|up" >&2
    exit 2
    ;;
esac
