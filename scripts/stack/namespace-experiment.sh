#!/usr/bin/env bash
# Does Dapr **actor namespacing** isolate two stacks that share ONE placement
# service? Measured, not assumed.
#
#   scripts/stack/isolation-proof.sh --keep      # first: two stacks + sentinels
#   scripts/stack/namespace-experiment.sh
#
# The question matters because a shared control plane would be two fewer
# containers per worktree. The documented mechanism is: set `NAMESPACE` on daprd
# in self-hosted mode, and the multi-tenant placement service groups hash tables
# by namespace, so a sidecar in one namespace receives no placement information
# for another.
#
# ## The experiment
#
# Both stacks' apps are run against **stack A's placement service only**. Stack B
# keeps its own database, its own MinIO, its own everything else — only the
# placement address moves. Two runs:
#
#   CONTROL     neither side sets NAMESPACE.
#   NAMESPACED  A runs with NAMESPACE=proof-a, B with NAMESPACE=proof-b.
#
# In both runs, the ten `ReferenceDataActor` ids are requested through each
# stack's API sidecar, and the answer names the database the serving host holds
# (each database carries its own sentinel row). If namespacing isolates, the
# NAMESPACED run returns 10/10 own-database for both APIs while the CONTROL run
# does not.
#
# This is a diagnostic, not part of the lane. `scripts/stack/stack.sh` gives
# every stack its own placement, which isolates more than actor routing.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
STACK="$HERE/stack.sh"
SLUG_A="proof-a"
SLUG_B="proof-b"
KINDS="beer_style coffee_cultivar country sake_category sake_rice_variety sake_type spirit_type tea_category wine_style wine_variety"
SENTINEL_A="ZZ-SENTINEL-PROOF_A"
SENTINEL_B="ZZ-SENTINEL-PROOF_B"

# Every sidecar in both proof stacks runs with DAPR_API_TOKEN and refuses
# (401) a caller that does not present it as `dapr-api-token`
# (docs/architecture/target-stack.md, "Dapr API tokens"). Resolved by
# `stack.sh dapr-token` — the environment, then infra/.env, then the published
# development value — which is exactly what the stacks it starts run with, for
# every slug, so one token serves both. (A hard-coded env → default here once
# skipped infra/.env and 401'd.) Captured, never printed.
DAPR_TOKEN="$("$STACK" dapr-token)"

say()  { printf '\n=== %s\n' "$*"; }
step() { printf '  %s\n' "$*"; }
pass() { printf '  PASS %s\n' "$*"; }
note() { printf '  NOTE %s\n' "$*"; }

val() { CELLAR_STACK_SLUG="$1" "$STACK" env 2>/dev/null | sed -n "s/^export $2=//p" | head -1; }

A_PLACEMENT="$(val "$SLUG_A" PLACEMENT_PORT)"
B_PLACEMENT="$(val "$SLUG_B" PLACEMENT_PORT)"
A_API_DAPR="$(val "$SLUG_A" API_DAPR_HTTP_PORT)"
B_API_DAPR="$(val "$SLUG_B" API_DAPR_HTTP_PORT)"

for slug in "$SLUG_A" "$SLUG_B"; do
  [ -f "$REPO_ROOT/.stack/$slug/dapr.yaml" ] || {
    echo "no run file for $slug. Run: scripts/stack/isolation-proof.sh --keep" >&2; exit 1; }
done

served_by() { # served_by DAPR_HTTP_PORT KIND -> A|B|?
  local body attempt=0
  while [ "$attempt" -lt 3 ]; do
    body="$(curl -sS -m 25 -X POST \
      "http://127.0.0.1:$1/v1.0/actors/ReferenceDataActor/$2/method/all" \
      -H 'content-type: application/json' -H "dapr-api-token: $DAPR_TOKEN" \
      --data-binary '[{"viewerId":null,"kind":"system","requestId":"namespace-experiment"}]' 2>/dev/null || true)"
    case "$body" in
      *"$SENTINEL_A"*) printf 'A'; return 0 ;;
      *"$SENTINEL_B"*) printf 'B'; return 0 ;;
    esac
    attempt=$(( attempt + 1 )); sleep 2
  done
  printf '?'
}

census() { # census PORT -> "<a> <b> <unknown>"
  local kind who a=0 b=0 u=0
  for kind in $KINDS; do
    who="$(served_by "$1" "$kind")"
    case "$who" in A) a=$(( a + 1 )) ;; B) b=$(( b + 1 )) ;; *) u=$(( u + 1 )) ;; esac
  done
  printf '%s %s %s' "$a" "$b" "$u"
}

stop_run() { # stop_run FILE PIDFILE
  [ -f "$1" ] && { dapr stop -f "$1" >/dev/null 2>&1 || true; }
  [ -f "$2" ] && { kill "$(cat "$2")" 2>/dev/null || true; rm -f "$2"; }
}

# Both stacks' apps, on A's placement. `$3`/`$4` are the NAMESPACE values ("" for
# the control run).
start_both_on_a_placement() { # start_both_on_a_placement TAG NS_A NS_B
  local tag="$1" ns_a="$2" ns_b="$3"
  local a_file="$REPO_ROOT/.stack/$SLUG_A/dapr-ns-$tag.yaml"
  local b_file="$REPO_ROOT/.stack/$SLUG_B/dapr-ns-$tag.yaml"
  cp "$REPO_ROOT/.stack/$SLUG_A/dapr.yaml" "$a_file"
  sed -e "s|placementHostAddress: 127.0.0.1:$B_PLACEMENT|placementHostAddress: 127.0.0.1:$A_PLACEMENT|g" \
    "$REPO_ROOT/.stack/$SLUG_B/dapr.yaml" > "$b_file"
  grep -q "placementHostAddress: 127.0.0.1:$A_PLACEMENT" "$b_file" \
    || { echo "could not point B at A's placement" >&2; exit 1; }

  mkdir -p "$REPO_ROOT/.stack/$SLUG_A/logs" "$REPO_ROOT/.stack/$SLUG_B/logs"
  # `stack.sh run-file`, not a bare `dapr run`: the run file still needs the
  # stack's environment (BETTER_AUTH_SECRET among it) or the actor host dies on
  # boot and this experiment measures nothing. NAMESPACE is exported here and
  # inherited through it.
  # `NAMESPACE=""` is NOT the same as leaving it unset. daprd 1.18.3 treats an
  # empty value as set, and its scheduler client then tight-loops on
  # `rpc error: code = InvalidArgument desc = missing namespace or appID in
  # request` — 50,000 log lines a minute, measured. `env -u` for the control run.
  if [ -n "$ns_a" ]; then
    NAMESPACE="$ns_a" CELLAR_STACK_SLUG="$SLUG_A" "$STACK" run-file "$a_file" --detach \
      --log "$REPO_ROOT/.stack/$SLUG_A/logs/ns-$tag.log" --pid "$REPO_ROOT/.stack/$SLUG_A/ns-$tag.pid" >/dev/null 2>&1
  else
    env -u NAMESPACE CELLAR_STACK_SLUG="$SLUG_A" "$STACK" run-file "$a_file" --detach \
      --log "$REPO_ROOT/.stack/$SLUG_A/logs/ns-$tag.log" --pid "$REPO_ROOT/.stack/$SLUG_A/ns-$tag.pid" >/dev/null 2>&1
  fi
  if [ -n "$ns_b" ]; then
    NAMESPACE="$ns_b" CELLAR_STACK_SLUG="$SLUG_B" "$STACK" run-file "$b_file" --detach \
      --log "$REPO_ROOT/.stack/$SLUG_B/logs/ns-$tag.log" --pid "$REPO_ROOT/.stack/$SLUG_B/ns-$tag.pid" >/dev/null 2>&1
  else
    env -u NAMESPACE CELLAR_STACK_SLUG="$SLUG_B" "$STACK" run-file "$b_file" --detach \
      --log "$REPO_ROOT/.stack/$SLUG_B/logs/ns-$tag.log" --pid "$REPO_ROOT/.stack/$SLUG_B/ns-$tag.pid" >/dev/null 2>&1
  fi

  local i=0
  while [ "$i" -lt 150 ]; do
    if grep -q "Registering hosted actors" "$REPO_ROOT/.stack/$SLUG_A/logs/ns-$tag.log" 2>/dev/null \
    && grep -q "Registering hosted actors" "$REPO_ROOT/.stack/$SLUG_B/logs/ns-$tag.log" 2>/dev/null; then break; fi
    sleep 1; i=$(( i + 1 ))
  done
  for slug in "$SLUG_A" "$SLUG_B"; do
    grep -q "Registering hosted actors" "$REPO_ROOT/.stack/$slug/logs/ns-$tag.log" 2>/dev/null || {
      echo "  ABORT $slug's actor host never registered in run \"$tag\"; tail of its log:" >&2
      tail -25 "$REPO_ROOT/.stack/$slug/logs/ns-$tag.log" | sed 's/^/      /' >&2
      exit 1
    }
  done
  sleep 12   # let placement disseminate both hosts' identical actor types
}

stop_tag() { # stop_tag TAG
  stop_run "$REPO_ROOT/.stack/$SLUG_A/dapr-ns-$1.yaml" "$REPO_ROOT/.stack/$SLUG_A/ns-$1.pid"
  stop_run "$REPO_ROOT/.stack/$SLUG_B/dapr-ns-$1.yaml" "$REPO_ROOT/.stack/$SLUG_B/ns-$1.pid"
  sleep 4
}

say "setup"
step "one placement service for both stacks: A's, on 127.0.0.1:$A_PLACEMENT"
step "each stack keeps its own Postgres, MinIO, scheduler and ports"
"$STACK" env >/dev/null 2>&1 || true
CELLAR_STACK_SLUG="$SLUG_A" "$STACK" down >/dev/null 2>&1 || true
CELLAR_STACK_SLUG="$SLUG_B" "$STACK" down >/dev/null 2>&1 || true
CELLAR_STACK_SLUG="$SLUG_A" "$STACK" infra >/dev/null 2>&1
CELLAR_STACK_SLUG="$SLUG_B" "$STACK" infra >/dev/null 2>&1

say "run 1 · CONTROL — shared placement, no NAMESPACE"
start_both_on_a_placement control "" ""
set -- $(census "$A_API_DAPR"); C_A_A="$1"; C_A_B="$2"; C_A_U="$3"
set -- $(census "$B_API_DAPR"); C_B_A="$1"; C_B_B="$2"; C_B_U="$3"
step "A's API — served by A: $C_A_A/10, by B: $C_A_B/10, unknown: $C_A_U"
step "B's API — served by A: $C_B_A/10, by B: $C_B_B/10, unknown: $C_B_U"
stop_tag control

say "run 2 · NAMESPACED — same shared placement, NAMESPACE=proof-a / proof-b"
start_both_on_a_placement ns "$SLUG_A" "$SLUG_B"
set -- $(census "$A_API_DAPR"); N_A_A="$1"; N_A_B="$2"; N_A_U="$3"
set -- $(census "$B_API_DAPR"); N_B_A="$1"; N_B_B="$2"; N_B_U="$3"
step "A's API — served by A: $N_A_A/10, by B: $N_A_B/10, unknown: $N_A_U"
step "B's API — served by A: $N_B_A/10, by B: $N_B_B/10, unknown: $N_B_U"
step "namespace as placement saw it:"
grep -oE "unlocking disseminator [^ ]+" "$REPO_ROOT/.stack/$SLUG_A/logs/ns-ns.log" 2>/dev/null | sort -u | sed 's/^/    A: /' || true
grep -oE "unlocking disseminator [^ ]+" "$REPO_ROOT/.stack/$SLUG_B/logs/ns-ns.log" 2>/dev/null | sort -u | sed 's/^/    B: /' || true
stop_tag ns

say "result"
printf '  %-42s A serves   B serves   unknown\n' "RUN / CALLER"
printf '  %-42s %-10s %-10s %s\n' "control (no NAMESPACE), A's API"  "$C_A_A/10" "$C_A_B/10" "$C_A_U/10"
printf '  %-42s %-10s %-10s %s\n' "control (no NAMESPACE), B's API"  "$C_B_A/10" "$C_B_B/10" "$C_B_U/10"
printf '  %-42s %-10s %-10s %s\n' "NAMESPACE=proof-a/proof-b, A's API" "$N_A_A/10" "$N_A_B/10" "$N_A_U/10"
printf '  %-42s %-10s %-10s %s\n' "NAMESPACE=proof-a/proof-b, B's API" "$N_B_A/10" "$N_B_B/10" "$N_B_U/10"
printf '\n'
if [ "$N_A_A" = "10" ] && [ "$N_B_B" = "10" ] && { [ "$C_A_B" -gt 0 ] || [ "$C_B_A" -gt 0 ]; }; then
  pass "actor namespacing DID isolate the two stacks on one shared placement, where the control crossed over."
  note "It still leaves Postgres, MinIO, the collector and every app port to isolate per worktree, and the docs require a separate actor state store per namespace. See docs/architecture/local-dev-stacks.md."
elif [ "$C_A_B" = "0" ] && [ "$C_B_A" = "0" ]; then
  note "the CONTROL run did not cross over, so this run proves nothing either way. Placement may not have disseminated; check .stack/*/logs/ns-control.log."
else
  note "actor namespacing did NOT fully isolate on a shared placement here (A's API: $N_A_B/10 answers came from B's database)."
fi

say "restoring both stacks to their own placement"
CELLAR_STACK_SLUG="$SLUG_A" "$STACK" up --detach >/dev/null 2>&1
CELLAR_STACK_SLUG="$SLUG_B" "$STACK" up --detach >/dev/null 2>&1
CELLAR_STACK_SLUG="$SLUG_A" "$STACK" wait >/dev/null 2>&1 || true
CELLAR_STACK_SLUG="$SLUG_B" "$STACK" wait >/dev/null 2>&1 || true
step "done. Tear down with: scripts/stack/isolation-proof.sh --clean"
