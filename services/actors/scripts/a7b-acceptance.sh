#!/usr/bin/env bash
# A7b's acceptance criteria, against the running compose stack.
#
#   services/actors/scripts/a7b-acceptance.sh envelope   # typed error crosses the sidecar
#   services/actors/scripts/a7b-acceptance.sh opaque     # an unexpected throw does not
#   services/actors/scripts/a7b-acceptance.sh ordering   # the outbox drains in insertion order
#   services/actors/scripts/a7b-acceptance.sh all        # all three, whatever fails
#
# Everything the unit tests can prove, they prove: `src/lib/actor-error-envelope.test.ts`
# for the envelope's shape, `src/actors/outbox-actor.test.ts` for the claim's
# ordering. What is left needs the real thing — daprd deciding whether to fold
# the response into ERR_ACTOR_INVOKE_METHOD, across the api sidecar's remote hop
# — and that is what this script is for. It calls `invokeActor` from
# `services/api/src/dapr.ts` itself, so what it asserts is what a resolver gets.
#
# Requires: `bun run stack:up`, a transformed database, and an actors host
# built from a tree whose outbox allow-list declares `PingActor.ping` as a
# probe target (the `ordering` test says so if it does not).
#
# Output: one `PASS: a7b <test>` / `FAIL: a7b <test>` line per test, then a
# `SUMMARY` line naming every test that ran. `all` runs every test even when
# an earlier one fails — it used to stop at the first failure (`set -e`), so a
# run that printed one PASS and died could be read as a green run of three.
# Exit status is the number of failed tests.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE="$ROOT/infra/docker-compose.yml"
dc() { docker compose -f "$COMPOSE" "$@"; }
psql_() { dc exec -T postgres psql -U "${POSTGRES_USER:-cellar}" -d "${POSTGRES_DB:-cellar}" "$@"; }
q() { psql_ -At -c "$1"; }

# The viewer every test's ctx names. It must be a canonical lower-case uuid:
# the actor host's method allow-list (`isWellFormedCtx` in
# services/actors/src/lib/actor-method-allowlist.ts) refuses any other viewer id
# with its own `ForbiddenError` before the method runs, so a ctx like
# `{ viewerId: "a7b" }` never reaches the check a test means to exercise. No
# user row has this id, and none of the calls below reads one.
VIEWER="0a7b0000-0000-4000-8000-000000000a7b"

ORDERING_BATCH=""
cleanup() {
  if [ -n "$ORDERING_BATCH" ]; then
    q "delete from outbox where target_id = '$ORDERING_BATCH'" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# Run a node snippet inside the api container, where `services/api/src/dapr.ts`
# lives and DAPR_HOST points at that app's own sidecar. Extra arguments reach
# the snippet as `process.argv[1..]`.
api_node() {
  local code="$1"; shift
  dc exec -T -w /workspace/services/api api node --input-type=module -e "$code" "$@"
}

# ---------------------------------------------------------------------------
# `OutboxActor.drain` refuses a `user` ctx with `ForbiddenError` (§1.6). It is
# the one domain error reachable from a bare invocation without seeding a row,
# and the assertion is about the wire, not about the outbox. The message check
# is what proves it was `drain`'s own refusal and not the method allow-list's
# ("… is not a well-formed ctx"), which is also a `ForbiddenError`.
envelope_test() {
  echo "== a typed ActorError reaches a resolver as itself"
  api_node '
import { invokeActor } from "./src/dapr.ts";
import { ForbiddenError, isActorError } from "@cellar-assistant/contracts";

const descriptor = { actorType: "OutboxActor" };
const ctx = { viewerId: process.argv[1], kind: "user", requestId: "a7b-acceptance" };

try {
  await invokeActor(descriptor, "singleton", "drain", ctx);
  console.log("  the call succeeded; it was supposed to be refused");
  process.exit(1);
} catch (error) {
  const ok =
    error instanceof ForbiddenError &&
    isActorError(error) &&
    error.code === "FORBIDDEN" &&
    error.message.includes("system/admin only");
  console.log("  constructor :", error.constructor.name);
  console.log("  instanceof  :", error instanceof ForbiddenError);
  console.log("  code        :", error.code);
  console.log("  message     :", error.message);
  // plugin-errors matches on the class, so this is the property that decides
  // whether the field resolves to `ForbiddenError` or to an opaque error.
  process.exit(ok ? 0 : 1);
}
' "$VIEWER"
}

# ---------------------------------------------------------------------------
# An unexpected throw: a bug, not a domain error, raised inside a real actor
# method after every fence in front of it has passed.
#
# The trigger is `PingActor.ping(ctx, { toString: null })`. `ping` interpolates
# its message into a template string; an object whose `toString` is not
# callable and whose inherited `valueOf` returns the object itself has no
# primitive value, so the interpolation throws a `TypeError` ("Cannot convert
# object to primitive value"). JSON can carry that argument, `ping` is a
# declared method and the ctx is well formed, so the method allow-list and the
# ctx guard both let it through and the throw happens in the method body.
# `PingActor` holds no database handle and no actor state, so the call has no
# side effect beyond an in-memory turn counter. No probe code was added for it.
#
# This used to call `OutboxActor.drain` with no ctx and rely on
# `bypassesPolicy(undefined)` throwing. Since the ctx guard
# (`guardDeclaredMethods`), a missing ctx is refused with a typed
# `ForbiddenError` before the body runs, so that trigger could no longer
# produce an unexpected throw at all.
#
# Two halves: the caller sees an opaque `ActorInvocationError` that names none
# of the error's details, and the host logs `[actor.unexpected_error]` with the
# error class and this call's request id.
opaque_test() {
  local rid found=""
  rid="a7b-opaque-$(python3 -c 'import uuid;print(uuid.uuid4().hex[:16])')"
  echo "== an unexpected throw stays opaque (request id $rid)"
  if ! api_node '
import { ActorInvocationError, invokeActor } from "./src/dapr.ts";
import { PingActorDescriptor, isActorError } from "@cellar-assistant/contracts";

const [viewerId, requestId] = process.argv.slice(1);
const ctx = { viewerId, kind: "user", requestId };

try {
  // `${message}` on this object throws a TypeError inside PingActor.ping.
  await invokeActor(PingActorDescriptor, "a7b-opaque", "ping", ctx, { toString: null });
  console.log("  the call succeeded; it was supposed to throw inside the actor");
  process.exit(1);
} catch (error) {
  const leaks = [
    "Cannot convert",
    "primitive value",
    "TypeError",
    "toString",
    "at ",           // a stack frame
    "/workspace",    // a source path
    "ping-actor",
  ].filter((needle) => (error.message ?? "").includes(needle));

  const ok =
    error instanceof ActorInvocationError && !isActorError(error) && leaks.length === 0;
  console.log("  constructor :", error.constructor.name);
  console.log("  typed       :", isActorError(error));
  console.log("  status      :", error.status);
  console.log("  message     :", error.message);
  console.log("  leaks       :", leaks.length === 0 ? "none" : leaks.join(", "));
  process.exit(ok ? 0 : 1);
}
' "$VIEWER" "$rid"; then
    echo "  the caller-side assertions failed (see above)"
    return 1
  fi

  echo "-- and the real error is still on the host, where it belongs:"
  # The console line is written before the response goes out, but `docker
  # logs` can lag a moment behind it.
  for _ in 1 2 3 4 5; do
    found="$(dc logs actors --since 120s 2>&1 \
      | grep -F "[actor.unexpected_error]" \
      | grep -F "\"request.id\":\"$rid\"" | tail -1 || true)"
    [ -n "$found" ] && break
    sleep 1
  done
  if [ -z "$found" ]; then
    echo "  no [actor.unexpected_error] line carries request id $rid"
    return 1
  fi
  echo "  $found"
  case "$found" in
    *'"error.name":"TypeError"'*) return 0 ;;
    *) echo "  the logged error is not the TypeError this test provoked"; return 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# Ten rows, one transaction, delivered by the real drainer to a real actor.
# Every row shares `created_at`, so only `seq` can order them; `updated_at` is
# stamped per delivery by `#deliverOne`, so it records the order they actually
# went out in.
#
# The target is `PingActor.ping`, the outbox's one declared operational probe
# (services/actors/src/lib/outbox-targets.ts). It used to be undeclared, and this test
# kept *passing*: every row was refused on attempt 1, a refusal stamps
# `updated_at` exactly like a delivery does, so the rows "went out" in `seq`
# order and the order check compared two orders of ten refusals — while the
# wait loop, which only breaks when all ten are `delivered`, timed out
# silently. So now it FAILS unless all ten were actually delivered, and it
# refuses to compare orders a timestamp tie could have decided (the `seq`
# tiebreak would otherwise paper over one).
ordering_test() {
  local batch undelivered distinct verdict
  batch="a7b-$(python3 -c 'import uuid;print(uuid.uuid4())')"
  echo "== the outbox drains one transaction's rows in insertion order: $batch"
  # Whatever happens below, the ten rows go (the EXIT trap): a refused or
  # stuck row left here would sit in the dead-letter report, since dead rows
  # are never reaped.
  ORDERING_BATCH="$batch"

  if ! q "begin;
     insert into outbox (target_actor, target_id, method, payload)
     select 'PingActor', '$batch', 'ping',
            jsonb_build_object('step', n)
     from generate_series(0, 9) as n;
     commit;" >/dev/null; then
    echo "  could not enqueue the ten rows"
    return 1
  fi

  echo "-- enqueued (one transaction: created_at ties, seq does not):"
  q "select 'created_at values: ' || count(distinct created_at) ||
            ', seq values: ' || count(distinct seq)
     from outbox where target_id = '$batch'"

  echo "-- waiting for the drain (reminder fires every 2s)..."
  undelivered=10
  for _ in $(seq 1 30); do
    undelivered="$(q "select count(*) from outbox where target_id = '$batch' and status <> 'delivered'")"
    [ "$undelivered" = "0" ] && break
    sleep 1
  done
  if [ "$undelivered" != "0" ]; then
    echo "  $undelivered of 10 rows were not delivered within 30 s — the order"
    echo "  check below would be comparing refusals or nothing. Row states:"
    q "select '    ' || status || ' attempts=' || attempts || ' ' || coalesce(left(last_error, 160), '')
       from outbox where target_id = '$batch' and status <> 'delivered'
       order by seq limit 3"
    echo "  ('not in OUTBOX_TARGETS' means the host predates PingActor.ping's"
    echo "  probe declaration: restart it on the current tree.)"
    return 1
  fi

  distinct="$(q "select count(distinct updated_at) from outbox where target_id = '$batch'")"
  if [ "$distinct" != "10" ]; then
    echo "  only $distinct distinct delivery timestamps for 10 rows — the order"
    echo "  cannot be read off updated_at without a tiebreak deciding it."
    return 1
  fi

  echo "-- enqueued order vs delivered order:"
  q "select 'enqueued : ' || string_agg(payload->>'step', ' ' order by seq)
     from outbox where target_id = '$batch'"
  q "select 'delivered: ' || string_agg(payload->>'step', ' ' order by updated_at)
     from outbox where target_id = '$batch'"
  verdict="$(q "select string_agg(payload->>'step', ' ' order by seq) =
                       string_agg(payload->>'step', ' ' order by updated_at)
                from outbox where target_id = '$batch'")"
  if [ "$verdict" != "t" ]; then
    echo "  delivered out of insertion order"
    return 1
  fi
}

# ---------------------------------------------------------------------------
PASSED=""
FAILED=""
run() { # run NAME — one PASS/FAIL line per test, whatever the test printed
  local name="$1"
  if "${name}_test"; then
    echo "PASS: a7b $name"
    PASSED="$PASSED $name"
  else
    echo "FAIL: a7b $name"
    FAILED="$FAILED $name"
  fi
}

case "${1:-all}" in
  envelope|opaque|ordering) run "$1" ;;
  all) run envelope; echo; run opaque; echo; run ordering ;;
  *) echo "usage: $0 [envelope|opaque|ordering|all]" >&2; exit 2 ;;
esac

failures="$(printf '%s' "$FAILED" | wc -w | tr -d ' ')"
echo
echo "SUMMARY a7b: passed:${PASSED:- none}; failed:${FAILED:- none}"
exit "$failures"
