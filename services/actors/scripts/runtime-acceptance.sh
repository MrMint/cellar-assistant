#!/usr/bin/env bash
# Does the actor host actually work on the runtime it is currently running under?
#
#   services/actors/scripts/runtime-acceptance.sh
#
# Seven proofs, against the host-run stack for THIS worktree
# (docs/architecture/local-dev-stacks.md — `bun run dev:up --detach` first). It
# does not care which interpreter is serving; it asks the host what it is and
# then tries to break it. `scripts/soak/run-soak.sh` runs it as the gate on each
# arm of a Bun/Node A/B.
#
# Unit tests cannot replace this and the distinction is the whole point. Every
# claim below needs a real sidecar, a real Scheduler or a real Postgres:
#
#   1. every actor type src/index.ts registers is registered WITH the sidecar
#   2. an actor method invoked across the sidecar hop returns correctly, and a
#      warm activation is reused
#   3. a typed ActorError crosses as HTTP 200 + x-daprerrorresponseheader
#   4. a Scheduler-backed reminder FIRES — one-shot, armed from an actor turn
#   5. the outbox drains, i.e. the 2 s keep-alive reminder is running (through
#      `PingActor.ping`, the one outbox target declared as an operational probe
#      in services/actors/src/lib/outbox-targets.ts — the drainer refuses anything
#      undeclared on attempt 1)
#   6. Postgres works under concurrent load, through `pg`, without the pool
#      exploding
#   7. better-auth still serves /api/auth/* on the same Express app
#
# Number 4 is the one to read first. It is the least likely thing to survive a
# runtime change and the most silent when it does not: nothing fails, no request
# errors, work simply stops happening.
#
# `--with-shutdown` adds an eighth proof that STOPS THE HOST: it SIGTERMs it and
# asserts the graceful path in `src/index.ts` actually ran. It is opt-in for the
# obvious reason, and it needs the app's stdout, so pass `--log <dapr-run.log>`
# (scripts/soak/run-soak.sh keeps one per arm).
#
# Every row it creates — the proof-4 job and its outbox rows, the proof-5 outbox
# row — is deleted on exit, pass or fail. A harness row left `dead` is never
# reaped (the retention sweep keeps dead rows as evidence), so it would sit in
# MaintenanceActor's dead-letter report and page as a new dead letter.
#
# Exit status is the number of failed proofs; 99 means it could not start.
set -uo pipefail

WITH_SHUTDOWN=0
APP_LOG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --with-shutdown) WITH_SHUTDOWN=1 ;;
    --log) shift; APP_LOG="$1" ;;
    *) echo "unknown option: $1" >&2; exit 99 ;;
  esac
  shift
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
STACK_SH="$REPO_ROOT/scripts/stack/stack.sh"

# Derived from the source, not hardcoded. A literal 47 went stale the moment a
# 48th actor was registered and failed proof 1 on a healthy host. Counting the
# `entry(SomethingActor, …)` calls in src/actors/registry.ts — the list
# src/index.ts registers by looping over — makes the proof "the running host
# registered what the source registers", which is the claim worth making.
#
# Counted as OCCURRENCES in comment-stripped code with newlines folded, not
# with `grep -c`: that counts matching *lines*, so two calls on one line
# counted as one, and a formatter wrapping a long entry across lines would
# hide it. Only `entry(` followed by an `…Actor` identifier counts, so the
# `entry(Class, Descriptor)` in the file's prose is not a call. And
# cross-checked: the number of calls must equal the number of *distinct*
# classes named; they differ when a class is registered twice, and then the
# count is not trustworthy, so the script refuses to guess and exits 99 rather
# than run proof 1 against a wrong number. EXPECTED_ACTOR_TYPES in the
# environment overrides all of it.
if [ -z "${EXPECTED_ACTOR_TYPES:-}" ]; then
  registry_code="$(sed -e 's://.*$::' "$APP_DIR/src/actors/registry.ts" | tr '\n' ' ')"
  entries="$(printf '%s\n' "$registry_code" \
    | grep -oE 'entry\( *[A-Z][A-Za-z0-9_]*Actor *,' | tr -d ' ')"
  register_calls="$(printf '%s\n' "$entries" | grep -c . | tr -d ' ')"
  register_named="$(printf '%s\n' "$entries" | sort -u | grep -c . | tr -d ' ')"
  if [ "$register_calls" -eq 0 ] || [ "$register_calls" != "$register_named" ]; then
    echo "ERROR cannot derive the expected actor-type count from" \
      "src/actors/registry.ts: $register_calls entry(…Actor, …) call(s) but" \
      "$register_named distinct class(es). Set EXPECTED_ACTOR_TYPES." >&2
    exit 99
  fi
  EXPECTED_ACTOR_TYPES="$register_calls"
fi

eval "$("$STACK_SH" env)" || { echo "ERROR stack.sh env failed" >&2; exit 99; }
PG="${COMPOSE_PROJECT_NAME}-postgres-1"
PG_USER="${POSTGRES_USER:-cellar}"
PG_DB="${POSTGRES_DB:-cellar}"

PASS=0
FAIL=0
ok()   { printf '  OK   %s\n' "$*"; PASS=$(( PASS + 1 )); }
bad()  { printf '  FAIL %s\n' "$*"; FAIL=$(( FAIL + 1 )); }
head_() { printf '\n== %s\n' "$*"; }

q() { docker exec -i "$PG" psql -U "$PG_USER" -d "$PG_DB" -At -c "$1"; }

# What this run created, deleted by the EXIT trap. Filled in as rows are made.
CLEANUP_JOB=""
CLEANUP_TAG=""
cleanup() {
  if [ -n "$CLEANUP_JOB" ]; then
    q "delete from outbox where target_id = '$CLEANUP_JOB'" >/dev/null 2>&1 || true
    q "delete from jobs where id = '$CLEANUP_JOB'" >/dev/null 2>&1 || true
  fi
  if [ -n "$CLEANUP_TAG" ]; then
    q "delete from outbox where payload->>'tag' = '$CLEANUP_TAG'" >/dev/null 2>&1 || true
  fi
  rm -f /tmp/acceptance-body.$$
}
trap cleanup EXIT

uuid() { python3 -c 'import uuid;print(uuid.uuid4())'; }
user_ctx() { printf '{"viewerId":"%s","kind":"user","requestId":"acceptance"}' "$1"; }
system_ctx() { printf '{"viewerId":null,"kind":"system","requestId":"acceptance"}'; }

# The two Dapr tokens, resolved the way `dev:up` resolves them
# (scripts/stack/stack.sh, `export_passthrough`): the caller's environment,
# then infra/.env, then the published development value. Read here, never
# printed.
#
#   DAPR_API_TOKEN  every caller of a sidecar's API presents it
#                   (`dapr-api-token`); daprd refuses anything else.
#   APP_API_TOKEN   what a sidecar presents to its app. The actor host refuses
#                   `/actors/*` and `/dapr/*` without it
#                   (services/actors/src/lib/dapr-app-token.ts), so proof 1's
#                   direct `GET /dapr/config` must carry it too — without it
#                   the app answers 401 and proof 1 reads "0 entities".
ENV_FILE="${CELLAR_ENV_FILE:-$REPO_ROOT/infra/.env}"
token_value() { # token_value NAME DEFAULT
  local value line
  eval "value=\${$1:-}"
  if [ -z "$value" ] && [ -f "$ENV_FILE" ]; then
    line="$(grep -E "^[[:space:]]*$1[[:space:]]*=" "$ENV_FILE" 2>/dev/null | tail -1 || true)"
    value="$(printf '%s' "${line#*=}" | sed -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")"
  fi
  printf '%s' "${value:-$2}"
}
DAPR_TOKEN="$(token_value DAPR_API_TOKEN cellar-dev-dapr-api-token)"
APP_TOKEN="$(token_value APP_API_TOKEN cellar-dev-app-api-token)"

# Invoke through a sidecar. $1 = sidecar http port.
invoke() {
  local port="$1" type="$2" id="$3" method="$4" body="$5"
  curl -sS -m 30 -D - -o /tmp/acceptance-body.$$ -X POST \
    "http://127.0.0.1:$port/v1.0/actors/$type/$id/method/$method" \
    -H 'content-type: application/json' -H "dapr-api-token: $DAPR_TOKEN" \
    --data-binary "$body"
}
body_() { cat /tmp/acceptance-body.$$; }

printf '\n#### services/actors runtime acceptance — stack %s (slot %s)\n' \
  "$CELLAR_STACK_SLUG" "$CELLAR_STACK_SLOT"
printf '     app %s · actors sidecar %s · api sidecar %s · postgres %s\n' \
  "$ACTORS_PORT" "$ACTORS_DAPR_HTTP_PORT" "$API_DAPR_HTTP_PORT" "$PG"

# ---------------------------------------------------------------------------
head_ "0. which interpreter is serving"
# `/dapr/config` is the endpoint daprd itself calls to learn what this app
# hosts, so asking the app the same question is asking the sidecar's source of
# truth. The interpreter is read off the process, because a host that answers
# correctly under the wrong runtime is a void experiment.
host_pids="$(pgrep -f 'src/index.ts' 2>/dev/null | tr '\n' ' ')"
serving=""
for p in $host_pids; do
  cmd="$(ps -o command= -p "$p" 2>/dev/null)"
  # Only the process holding this stack's app port is ours; another worktree's
  # host matches the same pgrep pattern.
  if lsof -nP -p "$p" -iTCP:"$ACTORS_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    serving="$cmd"
    HOST_PID="$p"
    break
  fi
done
if [ -n "$serving" ]; then
  printf '  host pid %s: %s\n' "$HOST_PID" "$serving"
  case "$serving" in
    *bun*) RUNTIME_UNDER_TEST=bun ;;
    *node*) RUNTIME_UNDER_TEST=node ;;
    *) RUNTIME_UNDER_TEST=unknown ;;
  esac
  ok "serving on $ACTORS_PORT under: $RUNTIME_UNDER_TEST"
else
  bad "no process is listening on the actors app port $ACTORS_PORT"
  RUNTIME_UNDER_TEST=unknown
fi

# ---------------------------------------------------------------------------
head_ "1. all $EXPECTED_ACTOR_TYPES actor types registered"
config="$(curl -sS -m 10 -H "dapr-api-token: $APP_TOKEN" "http://127.0.0.1:$ACTORS_PORT/dapr/config")"
count="$(printf '%s' "$config" | python3 -c '
import json,sys
try:
    entities = json.load(sys.stdin).get("entities", [])
except Exception:
    entities = []
print(len(entities))
print(",".join(sorted(entities)))
')"
n="$(printf '%s\n' "$count" | head -1)"
types="$(printf '%s\n' "$count" | tail -1)"
if [ "$n" = "$EXPECTED_ACTOR_TYPES" ]; then
  ok "/dapr/config lists $n entities"
else
  bad "/dapr/config lists $n entities, expected $EXPECTED_ACTOR_TYPES"
fi
printf '       %s\n' "$types" | fold -s -w 100 | sed 's/^/       /'

# The sidecar's own view. If placement never learned the types, every actor call
# fails with `did not find address for actor` however well the app registered.
meta="$(curl -sS -m 10 -H "dapr-api-token: $DAPR_TOKEN" "http://127.0.0.1:$ACTORS_DAPR_HTTP_PORT/v1.0/metadata")"
meta_n="$(printf '%s' "$meta" | python3 -c '
import json,sys
d=json.load(sys.stdin)
actors=d.get("actors") or d.get("actorRuntime",{}).get("activeActors") or []
print(len(actors))
')"
if [ "$meta_n" = "$EXPECTED_ACTOR_TYPES" ]; then
  ok "the sidecar reports $meta_n hosted actor types"
else
  printf '  ..   sidecar metadata lists %s actor entries (it reports only types with active instances on some versions)\n' "$meta_n"
fi

# ---------------------------------------------------------------------------
head_ "2. an actor method across the sidecar hop, and a warm activation"
ping_id="acceptance-$(uuid)"
# Through the API's sidecar: the same URL services/api/src/dapr.ts builds, so
# this crosses placement and the remote-actor hop rather than staying local.
headers="$(invoke "$API_DAPR_HTTP_PORT" PingActor "$ping_id" ping \
  "[$(system_ctx),\"hello\"]")"
first="$(body_)"
status="$(printf '%s' "$headers" | awk 'NR==1{print $2}')"
if [ "$status" = "200" ] && printf '%s' "$first" | grep -q '"pong":true'; then
  ok "PingActor.ping through the API sidecar: HTTP 200"
  printf '       %s\n' "$first"
else
  bad "PingActor.ping through the API sidecar: HTTP $status $first"
fi

invoke "$ACTORS_DAPR_HTTP_PORT" PingActor "$ping_id" ping \
  "[$(system_ctx),\"again\"]" >/dev/null
second="$(body_)"
turns="$(printf '%s' "$second" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("turns"))' 2>/dev/null)"
if [ "$turns" = "2" ]; then
  ok "second call reports turns=2: the activation was reused, not reconstructed"
else
  bad "second call reports turns=$turns (expected 2) — activation is not being reused"
fi

# ---------------------------------------------------------------------------
head_ "3. a typed ActorError crosses as HTTP 200 + x-daprerrorresponseheader"
# OutboxActor.drain is system/admin only (§1.6), so a user ctx is refused with
# ForbiddenError — a *typed* error, which the envelope must reshape.
headers="$(invoke "$ACTORS_DAPR_HTTP_PORT" OutboxActor singleton drain \
  "[$(user_ctx "$(uuid)")]")"
err_body="$(body_)"
err_status="$(printf '%s' "$headers" | awk 'NR==1{print $2}')"
has_header="$(printf '%s' "$headers" | grep -ci 'x-daprerrorresponseheader')"
if [ "$err_status" = "200" ] && [ "$has_header" -ge 1 ] \
   && printf '%s' "$err_body" | grep -q '"code":"FORBIDDEN"'; then
  ok "HTTP 200 + header + {\"code\":\"FORBIDDEN\"}"
  printf '       %s\n' "$(printf '%s' "$headers" | grep -i 'x-daprerrorresponseheader' | tr -d '\r')"
  printf '       %s\n' "$err_body"
else
  bad "typed error came back as HTTP $err_status, header=$has_header, body=$err_body"
fi

# ---------------------------------------------------------------------------
head_ "4. a Scheduler-backed reminder fires"
# One-shot, armed from inside an actor turn, 12 s out. One-shot on purpose: a
# periodic reminder re-registered on activation proves nothing, because
# activation happens on the way to the first firing.
job="$(uuid)"; viewer="$(uuid)"
CLEANUP_JOB="$job"
invoke "$ACTORS_DAPR_HTTP_PORT" ProbeJobActor "$job" armRestartProbe \
  "[$(user_ctx "$viewer"),12]" >/dev/null
arm_body="$(body_)"
if printf '%s' "$arm_body" | grep -q 'armedBootId'; then
  ok "armRestartProbe accepted: $(printf '%s' "$arm_body" | cut -c1-160)"
else
  bad "armRestartProbe failed: $arm_body"
fi

printf '       waiting up to 45 s for the reminder to land...\n'
fired=""
for _ in $(seq 1 45); do
  sleep 1
  fired="$(q "select coalesce(cursor->'value'->>'firedBootId','') from jobs where id='$job'")"
  [ -n "$fired" ] && break
done
armed="$(q "select coalesce(cursor->'value'->>'armedBootId','') from jobs where id='$job'")"
fired_at="$(q "select coalesce(cursor->'value'->>'firedAt','') from jobs where id='$job'")"
if [ -n "$fired" ]; then
  ok "reminder fired: firedAt=$fired_at"
  printf '       armedBootId=%s\n       firedBootId=%s\n' "$armed" "$fired"
  if [ "$armed" = "$fired" ]; then
    printf '       (same boot id: fired in the process that armed it, as expected for a 12 s reminder)\n'
  else
    printf '       (DIFFERENT boot id: it outlived the process that armed it)\n'
  fi
else
  bad "REMINDER NEVER FIRED — Dapr Scheduler reminders are not reaching this host"
fi

# ---------------------------------------------------------------------------
head_ "5. the outbox drains (the 2 s keep-alive reminder)"
tag="acceptance-$(uuid)"
CLEANUP_TAG="$tag"
q "insert into outbox (target_actor, target_id, method, payload)
   values ('PingActor','acceptance-outbox','ping', jsonb_build_object('tag','$tag'))" >/dev/null
started=$(python3 -c 'import time;print(int(time.time()*1000))')
state=""
for _ in $(seq 1 40); do
  sleep 0.5
  state="$(q "select status from outbox where payload->>'tag'='$tag'")"
  [ "$state" = "delivered" ] && break
  [ "$state" = "dead" ] && break
done
elapsed=$(( $(python3 -c 'import time;print(int(time.time()*1000))') - started ))
if [ "$state" = "delivered" ]; then
  ok "row delivered in ${elapsed} ms (drain reminder period is 2 s)"
  q "select 'attempts=' || attempts || ' last_error=' || coalesce(last_error,'none')
     from outbox where payload->>'tag'='$tag'" | sed 's/^/       /'
elif [ "$state" = "dead" ]; then
  # Dead is not "the drain is not running" — the drain ran, and gave up. Say
  # which way, because the two remedies have nothing in common.
  last_error="$(q "select coalesce(last_error, '') from outbox where payload->>'tag'='$tag'")"
  case "$last_error" in
    *"not in OUTBOX_TARGETS"*)
      bad "the drainer REFUSED PingActor.ping as an undeclared target after ${elapsed} ms." \
        "The host under test predates its probe declaration in" \
        "services/actors/src/lib/outbox-targets.ts — restart it on the current tree: $last_error" ;;
    *)
      bad "outbox row dead-lettered after ${elapsed} ms — the drain runs but delivery failed: $last_error" ;;
  esac
else
  attempts="$(q "select attempts from outbox where payload->>'tag'='$tag'")"
  if [ "${attempts:-0}" -gt 0 ]; then
    bad "outbox row is '${state:-pending}' after ${elapsed} ms and ${attempts} attempt(s) —" \
      "the drain runs but delivery keeps failing:" \
      "$(q "select coalesce(last_error, '') from outbox where payload->>'tag'='$tag'")"
  else
    bad "outbox row ended as '${state:-pending}' after ${elapsed} ms, never attempted — the drain is not running"
  fi
fi

# ---------------------------------------------------------------------------
head_ "6. Postgres under concurrent load, through pg"
before_backends="$(q "select count(*) from pg_stat_activity where datname=current_database()")"
load_start=$(python3 -c 'import time;print(int(time.time()*1000))')
load_out="$(DAPR_API_TOKEN="$DAPR_TOKEN" python3 - "$ACTORS_DAPR_HTTP_PORT" <<'PY'
import json, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

port = sys.argv[1]
kinds = ["wine_style", "wine_variety", "beer_style", "spirit_type", "country",
         "sake_type", "sake_category", "tea_category", "coffee_cultivar",
         "sake_rice_variety"]
ctx = {"viewerId": None, "kind": "system", "requestId": "acceptance-load"}


def one(i):
    kind = kinds[i % len(kinds)]
    url = f"http://127.0.0.1:{port}/v1.0/actors/ReferenceDataActor/{kind}/method/all"
    request = urllib.request.Request(
        url,
        data=json.dumps([ctx]).encode(),
        headers={
            "content-type": "application/json",
            "dapr-api-token": os.environ.get("DAPR_API_TOKEN", "cellar-dev-dapr-api-token"),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if "x-daprerrorresponseheader" in {k.lower() for k in response.headers}:
                return ("typed-error", response.read(200).decode())
            rows = json.loads(response.read())
            return ("ok", len(rows))
    except Exception as error:  # noqa: BLE001
        return ("error", str(error)[:120])


with ThreadPoolExecutor(max_workers=32) as pool:
    results = list(pool.map(one, range(300)))

okc = sum(1 for kind, _ in results if kind == "ok")
rows = sum(value for kind, value in results if kind == "ok")
bad = [value for kind, value in results if kind != "ok"][:3]
print(f"{okc} {rows} {bad}")
PY
)"
load_ms=$(( $(python3 -c 'import time;print(int(time.time()*1000))') - load_start ))
load_ok="$(printf '%s' "$load_out" | awk '{print $1}')"
load_rows="$(printf '%s' "$load_out" | awk '{print $2}')"
after_backends="$(q "select count(*) from pg_stat_activity where datname=current_database()")"
if [ "$load_ok" = "300" ]; then
  ok "300/300 concurrent ReferenceDataActor.all in ${load_ms} ms, $load_rows rows read"
  printf '       pg backends before=%s after=%s (node-postgres pool max is 10)\n' \
    "$before_backends" "$after_backends"
else
  bad "only $load_ok/300 reference reads succeeded: $load_out"
fi

# ---------------------------------------------------------------------------
head_ "7. better-auth on /api/auth/*"
jwks="$(curl -sS -m 10 -w '\n%{http_code}' "http://127.0.0.1:$ACTORS_PORT/api/auth/jwks")"
jwks_status="$(printf '%s' "$jwks" | tail -1)"
if [ "$jwks_status" = "200" ] && printf '%s' "$jwks" | grep -q '"keys"'; then
  ok "GET /api/auth/jwks: 200 with a keys array"
  printf '       %s\n' "$(printf '%s' "$jwks" | head -1 | cut -c1-140)"
else
  bad "GET /api/auth/jwks: HTTP $jwks_status"
fi

# A rejected sign-in is the interesting one: it proves the POST **body** reached
# better-auth's handler. If Dapr's body-parser had won the ordering race in
# src/auth/mount.ts, this would fail as a malformed/empty body rather than as
# bad credentials — which is a different message, and the reason this asserts on
# the shape of the failure rather than just on "not 200".
signin="$(curl -sS -m 10 -w '\n%{http_code}' -X POST \
  "http://127.0.0.1:$ACTORS_PORT/api/auth/sign-in/email" \
  -H 'content-type: application/json' \
  --data '{"email":"acceptance-nobody@example.invalid","password":"wrong-password-on-purpose"}')"
signin_status="$(printf '%s' "$signin" | tail -1)"
signin_body="$(printf '%s' "$signin" | head -1)"
case "$signin_status" in
  401|403|400)
    if printf '%s' "$signin_body" | grep -qi 'invalid\|credential\|email\|password'; then
      ok "POST /api/auth/sign-in/email: HTTP $signin_status, rejected on credentials"
      printf '       %s\n' "$(printf '%s' "$signin_body" | cut -c1-140)"
    else
      bad "HTTP $signin_status but the body does not look like a credential rejection: $signin_body"
    fi
    ;;
  *) bad "POST /api/auth/sign-in/email: HTTP $signin_status $signin_body" ;;
esac

# ---------------------------------------------------------------------------
if [ "$WITH_SHUTDOWN" -eq 1 ]; then
  head_ "8. SIGTERM shuts the host down gracefully (DESTRUCTIVE)"
  # `src/index.ts` installs `process.on("SIGTERM")` to stop the DaprServer and
  # then `closeActorDb()` — the pool that every actor shares. The distinction
  # this asserts is between the handler running and the runtime's *default*
  # SIGTERM action, which also makes the process disappear and would look
  # identical from the outside. The log line is what tells them apart, so this
  # proof needs the app's stdout and says so rather than guessing.
  if [ -z "$APP_LOG" ] || [ ! -f "$APP_LOG" ]; then
    bad "--with-shutdown needs --log <the dapr run log>; got '${APP_LOG:-none}'"
  elif [ -z "${HOST_PID:-}" ]; then
    bad "no host pid was found in proof 0"
  else
    before_lines="$(wc -l < "$APP_LOG")"
    kill -TERM "$HOST_PID"
    gone=0
    for _ in $(seq 1 30); do
      sleep 0.5
      kill -0 "$HOST_PID" 2>/dev/null || { gone=1; break; }
    done
    sleep 1
    shutdown_line="$(tail -n +"$before_lines" "$APP_LOG" | grep -m1 'SIGTERM received, stopping' || true)"
    if [ "$gone" -eq 1 ] && [ -n "$shutdown_line" ]; then
      ok "the host logged its handler and exited"
      printf '       %s\n' "$shutdown_line"
    elif [ "$gone" -eq 1 ]; then
      bad "the process exited but never logged '[actors] SIGTERM received, stopping' — the handler did not run"
    else
      bad "the host was still alive 15 s after SIGTERM"
    fi
    # A pool closed by closeActorDb() leaves no backend behind.
    left="$(q "select count(*) from pg_stat_activity where datname=current_database() and pid <> pg_backend_pid()")"
    printf '       postgres backends left behind: %s\n' "$left"
  fi
fi

printf '\n#### %s: %s passed, %s failed (runtime under test: %s)\n\n' \
  "$([ "$FAIL" -eq 0 ] && echo PASS || echo FAIL)" "$PASS" "$FAIL" \
  "$RUNTIME_UNDER_TEST"
exit "$FAIL"
