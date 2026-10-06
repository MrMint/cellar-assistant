#!/usr/bin/env bash
# Demonstrate that two concurrent local stacks are isolated — and that the
# thing doing the isolating is the **per-stack placement service**, not the
# app-id.
#
#   scripts/stack/isolation-proof.sh            run the whole thing
#   scripts/stack/isolation-proof.sh --keep     leave both stacks running
#   scripts/stack/isolation-proof.sh --clean    tear the two proof stacks down
#
# ## What it proves, and how
#
# Two stacks, `proof-a` and `proof-b`, each with its own compose project, its
# own Postgres, its own placement and its own scheduler. Each database gets a
# sentinel row per reference table, naming the stack it lives in. Every probe
# then goes through an **API sidecar** — `POST /v1.0/actors/ReferenceDataActor/
# <kind>/method/byValue` — which is the real call path
# (`services/api/src/dapr.ts`), so what answers is whichever actor host placement
# routes to, reading whichever database that host holds.
#
#   PHASE 1  isolated: each stack's API sees only its own sentinel.
#   PHASE 2  crossed:  stack B's apps are restarted against stack A's placement
#            — nothing else changed, app-ids still distinct — and stack A's API
#            starts getting answers out of stack B's database.
#   PHASE 3  restored: B goes back to its own placement; phase 1 holds again.
#
# Phase 2 is the hazard, observed rather than argued. It is also why this script
# exists as a script: a paragraph claiming "app-ids do not isolate actors" is
# the kind of claim `src/lib/dev-checks/capability-claims.test.ts` was written
# about. Run it instead.
#
# ## Prerequisite
#
# A running stack to copy a schema from (default project `cellar-stack`). This
# repository's schema comes from the cutover transform of an Nhost dump, not
# from a replayable migration chain, so the fastest correct empty database is a
# `pg_dump --schema-only` of one that already works. `--source-project` picks a
# different donor.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
STACK="$HERE/stack.sh"

SLUG_A="proof-a"
SLUG_B="proof-b"
SOURCE_PROJECT="cellar-stack"
KEEP=0
CLEAN_ONLY=0
KINDS="beer_style coffee_cultivar country sake_category sake_rice_variety sake_type spirit_type tea_category wine_style wine_variety"

# Every sidecar in both proof stacks runs with DAPR_API_TOKEN and refuses
# (401) a caller that does not present it as `dapr-api-token`
# (docs/architecture/target-stack.md, "Dapr API tokens"). Resolved by
# `stack.sh dapr-token` — the environment, then infra/.env, then the published
# development value — which is exactly what the stacks it starts run with, for
# every slug, so one token serves both. (A hard-coded env → default here once
# skipped infra/.env and 401'd.) Captured, never printed.
DAPR_TOKEN="$("$STACK" dapr-token)"

while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1 ;;
    --clean) CLEAN_ONLY=1 ;;
    --source-project) shift; SOURCE_PROJECT="$1" ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

say()  { printf '\n=== %s\n' "$*"; }
step() { printf '  %s\n' "$*"; }
fail() { printf '  FAIL %s\n' "$*"; FAILURES=$(( FAILURES + 1 )); }
pass() { printf '  PASS %s\n' "$*"; }
FAILURES=0

stack() { # stack SLUG ARGS...
  local slug="$1"; shift
  CELLAR_STACK_SLUG="$slug" "$STACK" "$@"
}

# Read one derived variable out of a stack's environment.
val() { # val SLUG NAME
  CELLAR_STACK_SLUG="$1" "$STACK" env 2>/dev/null \
    | sed -n "s/^export $2=//p" | head -1
}

pg() { # pg SLUG SQL
  local project container
  project="cellar-$1"
  container="$(docker ps --filter "label=com.docker.compose.project=$project" \
    --filter "label=com.docker.compose.service=postgres" --format '{{.Names}}' | head -1)"
  [ -n "$container" ] || { echo "no postgres container for $project" >&2; return 1; }
  docker exec -i -e PGPASSWORD=cellar "$container" \
    psql -U cellar -d cellar -tAq -v ON_ERROR_STOP=1 -c "$2"
}

teardown() {
  say "tearing down the two proof stacks"
  stack "$SLUG_A" down --volumes >/dev/null 2>&1 || true
  stack "$SLUG_B" down --volumes >/dev/null 2>&1 || true
  rm -rf "$REPO_ROOT/.stack/$SLUG_A" "$REPO_ROOT/.stack/$SLUG_B"
  step "gone"
}

if [ "$CLEAN_ONLY" -eq 1 ]; then teardown; exit 0; fi

# ---------------------------------------------------------------------------
say "0 · two stacks, derived independently"
# ---------------------------------------------------------------------------
for slug in "$SLUG_A" "$SLUG_B"; do
  step "$slug -> project cellar-$slug, api $(val "$slug" API_PORT), postgres $(val "$slug" POSTGRES_PORT), placement $(val "$slug" PLACEMENT_PORT)"
done

A_API_DAPR="$(val "$SLUG_A" API_DAPR_HTTP_PORT)"
B_API_DAPR="$(val "$SLUG_B" API_DAPR_HTTP_PORT)"
A_PLACEMENT="$(val "$SLUG_A" PLACEMENT_PORT)"
B_PLACEMENT="$(val "$SLUG_B" PLACEMENT_PORT)"
[ -n "$A_API_DAPR" ] && [ -n "$B_API_DAPR" ] || { echo "could not derive ports" >&2; exit 1; }
[ "$A_PLACEMENT" != "$B_PLACEMENT" ] \
  && pass "distinct placement ports: $A_PLACEMENT vs $B_PLACEMENT" \
  || fail "both stacks derived placement port $A_PLACEMENT"

# ---------------------------------------------------------------------------
say "1 · infra up, schema cloned, sentinels written"
# ---------------------------------------------------------------------------
for slug in "$SLUG_A" "$SLUG_B"; do
  step "$slug: compose infra"
  stack "$slug" infra >/dev/null 2>&1 || { echo "infra failed for $slug" >&2; exit 1; }
done

for slug in "$SLUG_A" "$SLUG_B"; do
  # `count(*) from information_schema.tables` is NOT the test: `infra/postgres`
  # installs postgis, which puts `spatial_ref_sys` in `public` before anything
  # of ours exists. Ask for a table this proof actually reads.
  if [ "$(pg "$slug" "select to_regclass('public.country') is not null")" = "t" ]; then
    step "$slug: schema already present, skipping clone"
  else
    step "$slug: pg_dump --schema-only from project $SOURCE_PROJECT"
    stack "$slug" db:clone --schema-only --from "$SOURCE_PROJECT" >/dev/null 2>&1 \
      || { echo "schema clone failed for $slug (is project $SOURCE_PROJECT running?)" >&2; exit 1; }
  fi
done

# One sentinel per reference table per stack, so that whichever host answers,
# the row it returns names the database it read.
for slug in "$SLUG_A" "$SLUG_B"; do
  sentinel="ZZ-SENTINEL-$(printf '%s' "$slug" | tr 'a-z-' 'A-Z_')"
  for kind in $KINDS; do
    pg "$slug" "insert into $kind (value, comment) values ('$sentinel', 'isolation proof: $slug') on conflict (value) do nothing" >/dev/null
  done
  step "$slug: sentinel $sentinel inserted into all 10 reference tables"
done
SENTINEL_A="ZZ-SENTINEL-PROOF_A"
SENTINEL_B="ZZ-SENTINEL-PROOF_B"

for slug in "$SLUG_A" "$SLUG_B"; do
  step "$slug: dapr run -f (apps + sidecars on the host)"
  stack "$slug" up --detach >/dev/null 2>&1
done
for slug in "$SLUG_A" "$SLUG_B"; do
  stack "$slug" wait >/dev/null 2>&1 || { echo "$slug never became ready; see .stack/$slug/logs/dapr-run.log" >&2; exit 1; }
  step "$slug: ready"
done

# ---------------------------------------------------------------------------
# One probe = one real actor invocation through an API sidecar, on the same
# path a resolver uses (`services/api/src/dapr.ts` builds exactly this URL).
#
# `ReferenceDataActor.all` returns the whole table, and each database holds
# exactly one of the two sentinels — so the response itself names the database
# the answering host is connected to. No ambiguity between "not found" and
# "the call failed": a response with neither sentinel is reported as `?`, never
# silently counted as isolation.
# ---------------------------------------------------------------------------
served_by() { # served_by DAPR_HTTP_PORT KIND -> A|B|?
  local body attempt=0
  while [ "$attempt" -lt 3 ]; do
    body="$(curl -sS -m 25 -X POST \
      "http://127.0.0.1:$1/v1.0/actors/ReferenceDataActor/$2/method/all" \
      -H 'content-type: application/json' -H "dapr-api-token: $DAPR_TOKEN" \
      --data-binary '[{"viewerId":null,"kind":"system","requestId":"isolation-proof"}]' 2>/dev/null || true)"
    case "$body" in
      *"$SENTINEL_A"*) printf 'A'; return 0 ;;
      *"$SENTINEL_B"*) printf 'B'; return 0 ;;
    esac
    # A rebalancing placement table answers 500 for a moment; retry before
    # calling it an unknown.
    attempt=$(( attempt + 1 ))
    sleep 2
  done
  printf '?'
}

# Which host served each of the ten reference actor ids.
census() { # census DAPR_HTTP_PORT -> "<a> <b> <unknown> <map>"
  local kind who a=0 b=0 u=0 map=""
  for kind in $KINDS; do
    who="$(served_by "$1" "$kind")"
    case "$who" in
      A) a=$(( a + 1 )) ;;
      B) b=$(( b + 1 )) ;;
      *) u=$(( u + 1 )) ;;
    esac
    map="$map $kind=$who"
  done
  printf '%s %s %s %s' "$a" "$b" "$u" "$map"
}

say "2 · PHASE 1 — each stack on its own placement"
step "smoke: the call path itself works"
SMOKE="$(served_by "$A_API_DAPR" country)"
if [ "$SMOKE" = "A" ]; then
  pass "A's API sidecar reaches ReferenceDataActor and reads A's database"
else
  fail "A's API sidecar answered \"$SMOKE\" for country — the probe, not the isolation, is broken"
  printf '\n  raw response:\n'
  curl -sS -m 25 -X POST \
    "http://127.0.0.1:$A_API_DAPR/v1.0/actors/ReferenceDataActor/country/method/all" \
    -H 'content-type: application/json' -H "dapr-api-token: $DAPR_TOKEN" \
    --data-binary '[{"viewerId":null,"kind":"system","requestId":"isolation-proof"}]' | head -c 600 | sed 's/^/    /'
  echo
  exit 1
fi

set -- $(census "$A_API_DAPR"); A1_A="$1"; A1_B="$2"; A1_U="$3"; shift 3; A1_MAP="$*"
set -- $(census "$B_API_DAPR"); B1_A="$1"; B1_B="$2"; B1_U="$3"; shift 3; B1_MAP="$*"
step "stack A's API — served by A: $A1_A/10, by B: $A1_B/10, unknown: $A1_U"
step "stack B's API — served by A: $B1_A/10, by B: $B1_B/10, unknown: $B1_U"
[ "$A1_A" = "10" ] && pass "stack A saw only stack A's data" \
  || fail "stack A: A=$A1_A B=$A1_B ?=$A1_U (expected A=10)"
[ "$B1_B" = "10" ] && pass "stack B saw only stack B's data" \
  || fail "stack B: A=$B1_A B=$B1_B ?=$B1_U (expected B=10)"

# ---------------------------------------------------------------------------
say "3 · PHASE 2 — the hazard: stack B's apps moved onto stack A's placement"
# ---------------------------------------------------------------------------
step "nothing else changes. App-ids stay distinct (actors-proof-a vs actors-proof-b)."
CROSSED="$REPO_ROOT/.stack/$SLUG_B/dapr-crossed.yaml"
sed -e "s|placementHostAddress: 127.0.0.1:$B_PLACEMENT|placementHostAddress: 127.0.0.1:$A_PLACEMENT|g" \
  "$REPO_ROOT/.stack/$SLUG_B/dapr.yaml" > "$CROSSED"
grep -q "placementHostAddress: 127.0.0.1:$A_PLACEMENT" "$CROSSED" \
  || { echo "could not rewrite B's placement address" >&2; exit 1; }

CROSSED_LOG="$REPO_ROOT/.stack/$SLUG_B/logs/dapr-run-crossed.log"
stack "$SLUG_B" down >/dev/null 2>&1 || true
stack "$SLUG_B" infra >/dev/null 2>&1
step "starting B's apps with placementHostAddress = A's placement ($A_PLACEMENT)"
# Through `stack.sh run-file`, not a bare `dapr run`: the variant run file still
# needs the stack's environment. A bare `dapr run -f` here is what the first
# version of this script did, and B's actor host died on boot with
# `[auth] BETTER_AUTH_SECRET is required` — leaving only B's *API* sidecar on A's
# placement, hosting nothing, so nothing crossed and the phase read as a pass.
stack "$SLUG_B" run-file "$CROSSED" --detach \
  --log "$CROSSED_LOG" --pid "$REPO_ROOT/.stack/$SLUG_B/crossed.pid" >/dev/null 2>&1

# The crossed phase is only meaningful if B's ACTOR HOST is actually up and has
# reported its types. Check that, loudly, rather than inferring it from a census.
i=0
while [ "$i" -lt 120 ]; do
  if grep -q "Registering hosted actors" "$CROSSED_LOG" 2>/dev/null; then break; fi
  sleep 1; i=$(( i + 1 ))
done
if grep -q "Registering hosted actors" "$CROSSED_LOG" 2>/dev/null; then
  step "B's actor host registered its types against A's placement"
else
  fail "B's actor host never registered — the crossed phase would prove nothing. Tail of $CROSSED_LOG:"
  tail -25 "$CROSSED_LOG" | sed 's/^/      /'
  exit 1
fi
# Give placement a moment to disseminate the second host's identical actor types.
sleep 10

set -- $(census "$A_API_DAPR"); A2_A="$1"; A2_B="$2"; A2_U="$3"; shift 3; A2_MAP="$*"
step "stack A's API, unchanged — served by A: $A2_A/10, by B: $A2_B/10, unknown: $A2_U"
step "per-actor-id:$A2_MAP"
if [ "$A2_B" -gt 0 ]; then
  pass "HAZARD REPRODUCED — $A2_B of 10 actor ids on stack A's API were served by stack B's process, against stack B's database"
else
  fail "expected some ids to be served by B's host, saw none (A=$A2_A B=$A2_B ?=$A2_U). Placement may not have disseminated yet."
fi
if grep -q "Dissemination complete" "$REPO_ROOT/.stack/$SLUG_B/logs/dapr-run-crossed.log" 2>/dev/null; then
  step "B's host reported dissemination against A's placement (.stack/$SLUG_B/logs/dapr-run-crossed.log)"
fi

# ---------------------------------------------------------------------------
say "4 · PHASE 3 — B put back on its own placement"
# ---------------------------------------------------------------------------
if [ -f "$REPO_ROOT/.stack/$SLUG_B/crossed.pid" ]; then
  dapr stop -f "$CROSSED" >/dev/null 2>&1 || true
  kill "$(cat "$REPO_ROOT/.stack/$SLUG_B/crossed.pid")" 2>/dev/null || true
  rm -f "$REPO_ROOT/.stack/$SLUG_B/crossed.pid"
fi
sleep 3
stack "$SLUG_B" up --detach >/dev/null 2>&1
stack "$SLUG_B" wait >/dev/null 2>&1 || true
sleep 6
set -- $(census "$A_API_DAPR"); A3_A="$1"; A3_B="$2"; A3_U="$3"
step "stack A's API — served by A: $A3_A/10, by B: $A3_B/10, unknown: $A3_U"
[ "$A3_A" = "10" ] && pass "isolation restored" \
  || fail "isolation not restored: A=$A3_A B=$A3_B ?=$A3_U"

# ---------------------------------------------------------------------------
say "summary"
# ---------------------------------------------------------------------------
printf '  Each cell is "of the 10 ReferenceDataActor ids, how many were served by\n'
printf '  which stack\x27s actor host" — measured through an API sidecar.\n\n'
printf '  %-34s served by A   served by B   unknown\n' "PHASE"
printf '  %-34s %-13s %-13s %s\n' "1 own placement, A's API"   "$A1_A/10" "$A1_B/10" "$A1_U/10"
printf '  %-34s %-13s %-13s %s\n' "1 own placement, B's API"   "$B1_A/10" "$B1_B/10" "$B1_U/10"
printf '  %-34s %-13s %-13s %s   <-- the hazard\n' "2 SHARED placement, A's API" "$A2_A/10" "$A2_B/10" "$A2_U/10"
printf '  %-34s %-13s %-13s %s\n' "3 own placement again, A's API" "$A3_A/10" "$A3_B/10" "$A3_U/10"
printf '\n  phase 2 map:%s\n' "$A2_MAP"

if [ "$KEEP" -eq 0 ]; then teardown; else say "left running (--keep). Tear down: $0 --clean"; fi

if [ "$FAILURES" -gt 0 ]; then printf '\n%s check(s) failed.\n' "$FAILURES"; exit 1; fi
printf '\nAll checks passed.\n'
