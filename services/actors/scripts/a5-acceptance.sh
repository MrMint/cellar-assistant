#!/usr/bin/env bash
# A5's three acceptance criteria, against the running compose stack.
#
#   services/actors/scripts/a5-acceptance.sh kill        # outbox survives a SIGKILL
#   services/actors/scripts/a5-acceptance.sh deadletter  # 10 attempts -> dead, in Loki
#   services/actors/scripts/a5-acceptance.sh reminder    # reminder survives a restart
#   services/actors/scripts/a5-acceptance.sh all
#
# Everything the unit tests can prove, they prove (`vitest run` in services/actors).
# What is left needs a real host, a real sidecar and a real scheduler: a process
# dying between a commit and a delivery, and a reminder outliving the process
# that registered it. That is what this script is for.
#
# Requires: `bun run stack:up`, a transformed database, and ACTORS_PROBE_ALLOW_KILL=1
# in the actors container (the dev compose sets it).
#
# Every job and outbox row a test creates is deleted when the script exits.
#
# `kill` and `reminder` both restart the SHARED actors container (the first by
# killing its own host so compose restarts it, the second with `docker compose
# restart actors actors-dapr`). A restart reloads the bind-mounted worktree
# from disk, so it publishes every agent's uncommitted `services/actors` edits
# at once (AGENTS.md, "Worktrees"). Run them only when nobody else is mid-edit
# or mid-suite against `cellar-stack`. `deadletter` restarts nothing.
#
# Output: one `PASS: a5 <test>` / `FAIL: a5 <test>` line per test, then a
# `SUMMARY` line. `all` runs every test even when one fails. Exit status is the
# number of failed tests.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE="$ROOT/infra/docker-compose.yml"
dc() { docker compose -f "$COMPOSE" "$@"; }
psql_() { dc exec -T postgres psql -U "${POSTGRES_USER:-cellar}" -d "${POSTGRES_DB:-cellar}" "$@"; }
q() { psql_ -At -c "$1"; }

# Ids this run created, deleted on exit whatever happened. A dead-lettered
# harness row in particular must not outlive the run: the retention sweep
# never deletes `dead` rows, so it would sit in MaintenanceActor's dead-letter
# report and page as a new dead letter.
CLEANUP_IDS=""
cleanup() {
  for id in $CLEANUP_IDS; do
    q "delete from outbox where target_id = '$id'" >/dev/null 2>&1 || true
    q "delete from jobs where id = '$id'" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

# Invoke an actor method through the actors sidecar. Run from the *api*
# container, which shares the network but not the fate of the actor host — the
# kill test deliberately destroys the process it is talking to.
invoke() {
  dc exec -T api node -e '
    const [type, id, method, args] = process.argv.slice(1);
    (async () => {
      const url = `http://actors-dapr:3502/v1.0/actors/${type}/${id}/method/${method}`;
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // The sidecar API token this container was started with.
            "dapr-api-token": process.env.DAPR_API_TOKEN ?? "",
          },
          body: args,
          signal: AbortSignal.timeout(20000),
        });
        console.log(`HTTP ${r.status} ${(await r.text()).slice(0, 400)}`);
      } catch (e) {
        console.log(`no response (${e.message}) — expected if the host was killed`);
      }
    })();
  ' "$1" "$2" "$3" "$4"
}

# Loki, inside otel-lgtm (3100 is not published to the host).
#
# NOTE the query shape. Loki 3.x puts OTLP *resource* attributes in the index
# (`service_name`) and every OTLP *log-record* attribute in structured metadata,
# so `event.name` is NOT selectable inside `{...}`: it is filtered after the pipe.
# `{service_name="actors", event_name="outbox.dead_letter"}` matches nothing and
# looks exactly like "the event was never emitted".
loki() {
  dc exec -T otel-lgtm curl -s -G 'http://localhost:3100/loki/api/v1/query_range' \
    --data-urlencode "query=$1" --data-urlencode 'limit=20' \
    --data-urlencode "start=$(( $(date +%s) - 1800 ))000000000"
}

user_ctx() { printf '{"viewerId":"%s","kind":"user","requestId":"a5-acceptance"}' "$1"; }

uuid() { python3 -c 'import uuid;print(uuid.uuid4())'; }

# ---------------------------------------------------------------------------
kill_test() {
  local job viewer
  job="$(uuid)"; viewer="$(uuid)"
  CLEANUP_IDS="$CLEANUP_IDS $job"
  echo "== kill before delivery: job $job"

  local before
  before="$(docker inspect -f 'startedAt={{.State.StartedAt}}' "$(dc ps -q actors)")"
  echo "-- ProbeJobActor.start(batches=3, killAfterStart) — the host kills itself"
  invoke ProbeJobActor "$job" start "[$(user_ctx "$viewer"), {\"batches\":3,\"killAfterStart\":true}]"

  echo "-- committed before the kill (domain row + outbox row, one transaction):"
  q "select 'job', id, kind, status, cursor::text from jobs where id = '$job'"
  q "select 'outbox', id, target_actor, method, payload::text, status
       from outbox where target_id = '$job'"
  echo "-- the host (was: $before):"
  docker inspect -f 'startedAt={{.State.StartedAt}} running={{.State.Running}}' \
    "$(dc ps -q actors)"

  echo "-- waiting for compose to restart it and the outbox to deliver..."
  for _ in $(seq 1 60); do
    [ "$(q "select status from jobs where id = '$job'")" = "completed" ] && break
    sleep 2
  done

  echo "-- after restart:"
  local after
  after="$(docker inspect -f 'startedAt={{.State.StartedAt}}' "$(dc ps -q actors)")"
  docker inspect -f 'startedAt={{.State.StartedAt}} running={{.State.Running}}' \
    "$(dc ps -q actors)"
  q "select 'job', status, processed, total, cursor::text from jobs where id = '$job'"
  q "select 'outbox', payload::text, status, attempts from outbox
       where target_id = '$job' order by created_at"
  # Both halves: the host really died (a new start time), and the batch that
  # was only in the outbox at that moment was delivered afterwards.
  if [ "$after" = "$before" ]; then
    echo "  the actors container never restarted — the kill did not land"
    echo "  (is ACTORS_PROBE_ALLOW_KILL=1 set in the actors container?)"
    return 1
  fi
  if [ "$(q "select status from jobs where id = '$job'")" != "completed" ]; then
    echo "  the job did not complete after the restart"
    return 1
  fi
}

# ---------------------------------------------------------------------------
dead_letter_test() {
  local row target attempts status
  # A uuid that names no `jobs` row. The id doubles as the Loki filter below.
  target="$(uuid)"
  CLEANUP_IDS="$CLEANUP_IDS $target"
  echo "== dead-letter after 10 attempts: ProbeJobActor/$target.runBatch"
  # A *declared* outbox target that fails *retriably*. `ProbeJobActor.runBatch`
  # is in OUTBOX_TARGETS (a JobActor subclass), and on an id with no job row
  # `requireJob()` throws NOT_FOUND — not VALIDATION, so not permanent — on
  # every attempt: a real delivery across the sidecar, answered immediately.
  #
  # This used to target `PingActor.noSuchMethod`. Since the allow-list, an
  # undeclared pair is refused on attempt 1 and never retried, so that row
  # died at attempts=1 and the ladder this test exists to show never ran.
  row="$(q "insert into outbox (target_actor, target_id, method)
            values ('ProbeJobActor', '$target', 'runBatch') returning id" | head -1)"
  echo "-- outbox row $row targets ProbeJobActor.runBatch on a job that does not exist"

  # Ten real delivery attempts. `run_after` is reset between them so the test
  # does not sit out the real backoff (2s, 4s … 512s ≈ 17 minutes); nothing
  # about the attempt counting is touched, and it is unit-tested separately.
  for attempt in $(seq 1 10); do
    q "update outbox set run_after = now() where id = '$row' and status = 'pending'" >/dev/null
    attempts=0
    for _ in $(seq 1 30); do
      attempts="$(q "select attempts from outbox where id = '$row'")"; attempts="${attempts:-0}"
      [ "$attempts" -ge "$attempt" ] && break
      sleep 1
    done
    printf 'attempt %2d -> %s\n' "$attempt" \
      "$(q "select 'status=' || status || ' attempts=' || attempts ||
                   ' next_in=' || round(extract(epoch from run_after - now()))::text || 's'
            from outbox where id = '$row'")"
    if [ "$attempts" -lt "$attempt" ]; then
      echo "  FAIL: attempt $attempt never happened within 30 s (attempts=$attempts) —"
      echo "        the drain is not running, or not reaching this row."
      return 1
    fi
    status="$(q "select status from outbox where id = '$row'")"
    if [ "$status" = "dead" ] && [ "$attempts" -lt 10 ]; then
      echo "  FAIL: dead on attempt $attempts, not 10 — the failure was treated as"
      echo "        permanent, so the retry ladder was never exercised:"
      q "select '        ' || coalesce(last_error, '') from outbox where id = '$row'"
      echo "        ('not in OUTBOX_TARGETS' means the host predates this harness's"
      echo "        target choice; restart it on the current tree.)"
      return 1
    fi
  done

  echo "-- final row:"
  q "select 'attempts=' || attempts || ' status=' || status || ' error=' || left(last_error, 60)
     from outbox where id = '$row'"
  if [ "$(q "select status || '/' || attempts from outbox where id = '$row'")" != "dead/10" ]; then
    echo "  FAIL: expected dead/10"
    return 1
  fi
  echo "  dead after 10 attempts"
  echo '-- Grafana/Loki: {service_name="actors"} | event_name="outbox.dead_letter"'
  # The event is half of the criterion ("dead, in Loki"), so it is asserted,
  # not just printed. The OTLP export is batched, so give ingestion a moment.
  local shown=0
  for _ in $(seq 1 15); do
    shown="$(loki "{service_name=\"actors\"} | event_name=\"outbox.dead_letter\" | outbox_target_id=\"$target\"" |
      python3 -c 'import json,sys
n = 0
try:
    result = json.load(sys.stdin)["data"]["result"]
except Exception as error:
    print("   (Loki query failed: %s)" % error, file=sys.stderr)
    result = []
for stream in result:
    labels = {k: v for k, v in stream["stream"].items() if k.startswith(("outbox", "event", "severity_text"))}
    for _, line in stream["values"]:
        n += 1
        print("  ", line, file=sys.stderr)
        print("   ", labels, file=sys.stderr)
print(n)')"
    [ "${shown:-0}" -gt 0 ] && break
    sleep 2
  done
  echo "-- and the retry line for attempt 9:"
  loki "{service_name=\"actors\"} | event_name=\"outbox.retry\" | outbox_target_id=\"$target\"" |
    python3 -c 'import json,sys
try:
    result = json.load(sys.stdin)["data"]["result"]
except Exception:
    result = []
for stream in result:
    if stream["stream"].get("outbox_attempts") == "9":
        for _, line in stream["values"]:
            print("  ", line)
            print("   ", {k: v for k, v in stream["stream"].items() if k.startswith("outbox")})'
  if [ "${shown:-0}" -eq 0 ]; then
    echo "  no outbox.dead_letter event for $target reached Loki within 30 s"
    return 1
  fi
}

# ---------------------------------------------------------------------------
reminder_test() {
  local job viewer due
  job="$(uuid)"; viewer="$(uuid)"; due="${1:-90}"
  CLEANUP_IDS="$CLEANUP_IDS $job"
  echo "== reminder durability: one-shot reminder +${due}s on job $job"

  invoke ProbeJobActor "$job" armRestartProbe "[$(user_ctx "$viewer"), $due]"
  echo "-- armed (note armedBootId):"
  q "select cursor::text from jobs where id = '$job'"

  echo "-- docker compose restart actors actors-dapr"
  dc restart actors actors-dapr
  dc ps --format '{{.Service}} {{.Status}}' | grep -E '^actors'

  echo "-- waiting for the reminder to fire in the *new* process..."
  for _ in $(seq 1 $(( due + 60 ))); do
    [ "$(q "select cursor::jsonb -> 'value' ->> 'firedBootId' from jobs where id = '$job'")" != "" ] && break
    sleep 1
  done

  echo "-- after restart (armedBootId != firedBootId is the proof):"
  q "select jsonb_pretty(cursor::jsonb -> 'value') from jobs where id = '$job'"
  local armed fired
  armed="$(q "select coalesce(cursor::jsonb -> 'value' ->> 'armedBootId', '') from jobs where id = '$job'")"
  fired="$(q "select coalesce(cursor::jsonb -> 'value' ->> 'firedBootId', '') from jobs where id = '$job'")"
  if [ -z "$armed" ]; then
    echo "  the probe was never armed"
    return 1
  fi
  if [ -z "$fired" ]; then
    echo "  the reminder never fired within $(( due + 60 )) s of the restart"
    return 1
  fi
  if [ "$armed" = "$fired" ]; then
    echo "  it fired in the process that armed it — the restart did not happen"
    echo "  between arming and firing, so this proves nothing about durability"
    return 1
  fi
}

# ---------------------------------------------------------------------------
PASSED=""
FAILED=""
run() { # run NAME FUNCTION [ARGS...] — one PASS/FAIL line per test
  local name="$1"; shift
  if "$@"; then
    echo "PASS: a5 $name"
    PASSED="$PASSED $name"
  else
    echo "FAIL: a5 $name"
    FAILED="$FAILED $name"
  fi
}

case "${1:-all}" in
  kill) run kill kill_test ;;
  deadletter) run deadletter dead_letter_test ;;
  reminder) run reminder reminder_test "${2:-90}" ;;
  all)
    run kill kill_test; echo
    run deadletter dead_letter_test; echo
    run reminder reminder_test "${2:-90}"
    ;;
  *) echo "usage: $0 {kill|deadletter|reminder|all}" >&2; exit 2 ;;
esac

failures="$(printf '%s' "$FAILED" | wc -w | tr -d ' ')"
echo
echo "SUMMARY a5: passed:${PASSED:- none}; failed:${FAILED:- none}"
exit "$failures"

