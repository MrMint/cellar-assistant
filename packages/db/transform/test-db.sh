#!/usr/bin/env bash
# Give the test suites a database they own.
#
#   packages/db/transform/test-db.sh              build the template if stale, hand out a clean run db
#   packages/db/transform/test-db.sh --rebuild    force the template rebuild (re-dumps from Nhost)
#   TEST_DB=… packages/db/transform/test-db.sh --drop    drop one run database and stop
#
# No live Nhost container is needed for either, given the checked-in dump (X4):
#
#   DUMP="$PWD/packages/db/transform/nhost-schema.sql" \
#     packages/db/transform/test-db.sh --rebuild --no-dump
#
# ## Why this exists
#
# `services/actors`' harness rolls every test back, so tests never collide with each
# other. They *did* collide with whatever else was writing to `cellar` — an agent
# smoke-testing the frontend, `bun run db:seed`, a running actor host. A committed
# row is visible inside a test's transaction, so a global assertion
# (`ReferenceDataActor`'s ordering test deletes the whole `wine_style` table;
# `RankingsActor` asserts exact aggregate counts) fails through no fault of the
# code under test. Scoping each assertion treats the symptom and cannot fix the
# tests whose whole point is to be global.
#
# ## Template plus clone
#
# `run.sh` dumps from Nhost and replays the numbered transform files: seconds,
# and it needs the Nhost stack up. `CREATE DATABASE ... TEMPLATE` is a file copy
# — about a second — so the expensive build happens once into
# `cellar_test_template`, and every `vitest run` recreates `cellar_test` from it.
# That is what makes "each run starts from a known state" affordable.
#
# The template is rebuilt when its fingerprint (the transform files, this
# script, the reference data, the dump, and the Nhost migrations it was taken
# from) no longer matches the one recorded inside it.
#
# ## Concurrency
#
# Safe to run from two processes at once against the same Postgres. A session
# advisory lock on one namespace — "the `cellar_test*` databases on this
# server" — wraps the whole reap-fingerprint-check-build-clone, so the second
# run blocks, then finds the template current and skips straight to its clone.
# See "the mutex" below for why the check has to be inside the lock rather than
# in front of it, and why the key is a namespace rather than a database name.
#
# The lock makes the *build* safe. It cannot make a shared run database safe:
# once a run holds `cellar_test` and starts testing, it no longer holds the
# lock, so the next run's `DROP DATABASE ... WITH (FORCE)` will disconnect it
# mid-suite. Give each concurrent run its own `TEST_DB` and let them share one
# `TEMPLATE_DB` — which is what `services/actors`' `test-db-setup.ts` now does
# automatically. It drops that database again in its vitest teardown; the
# `--drop` mode above is how. A run killed by a signal never reaches its
# teardown, so `reap_abandoned_run_databases` below collects what is left.
#
# Three things are shared and all three are covered: the template, the run
# database, and — less obviously — the **dump file on disk**. See "the dump" for
# why the default path moved out of `$TMPDIR` and why the build reads a private
# copy of it.
#
# `drizzle-kit migrate` is deliberately not used: it cannot replay the
# introspected baseline — that migration's SQL sits inside a `/* … */` block and
# the runner splits on the statement breakpoint before stripping comments. See
# ../README.md.
set -euo pipefail

# `-` not `:-`: an explicitly empty DST_CONTAINER selects the TCP path below.
DST_CONTAINER="${DST_CONTAINER-cellar-stack-postgres-1}"
DST_USER="${DST_USER:-cellar}"
DST_PASSWORD="${DST_PASSWORD:-cellar}"

TEST_DB="${TEST_DB:-cellar_test}"
TEMPLATE_DB="${TEMPLATE_DB:-${TEST_DB}_template}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
REFERENCE_DATA="$REPO/services/actors/scripts/reference-data.json"
SEED="$REPO/services/actors/scripts/seed.ts"
MIGRATIONS="$HERE/../migrations"

# ------------------------------------------------------------------ the dump
#
# NOT UNDER `$TMPDIR`, and repo-relative on purpose. Both halves were measured
# defects, not style:
#
#   * `$TMPDIR` is not a constant. Turborepo 2.x runs every task in **strict**
#     env mode, and `TMPDIR` is not on its passthrough list — measured by
#     printing `env` from inside this script under `turbo run test` and again
#     from a shell: `TMPDIR=[<unset>]` versus
#     `TMPDIR=[/var/folders/…/T/]`. So `bun run test` resolved this to
#     `/tmp/cellar-nhost-schema.sql` and a direct run resolved it to the user's
#     private temp directory — two different files, with two different sha256s
#     on this machine at the time of writing. The fingerprint below hashes the
#     dump, so the two paths each saw the *other's* template as stale and
#     rebuilt it. Every alternation between `bun run test` and
#     `packages/db/transform/test-db.sh` paid for a full rebuild, and a rebuild
#     is the only window in which the shared template is broken.
#   * `$TMPDIR` is also per-user, not per-checkout, so every worktree on the
#     machine shared one dump file — and the Nhost container it is dumped *from*
#     is per-worktree (`run.sh`'s `SRC_CONTAINER`). One agent's dump therefore
#     invalidated every other agent's template. `node_modules/` is already
#     gitignored, already per-worktree, and already where build caches go.
#
# Exported, with `run.sh`'s default duplicated deliberately: the child then sees
# this value already set and computes nothing of its own, so parent and child
# cannot disagree about which file the dump is. The fingerprint below hashes it,
# which is only meaningful if it is the same bytes `run.sh` restores from — see
# `DUMP_PIN` for how that is made true rather than merely likely.
#
# `DUMP_IS_CALLERS` records that the path came from the environment. The
# documented `--rebuild --no-dump` recipe points `DUMP` at the *checked-in*
# `nhost-schema.sql`, and publishing a fresh dump back over a tracked file would
# be a rude surprise; the publish step below is skipped when this is 1.
DUMP_IS_CALLERS=0
if [[ -n "${DUMP:-}" ]]; then
  DUMP_IS_CALLERS=1
else
  # Only the default's directory is created. A caller-supplied path is the
  # caller's business, and creating *its* parent turns a typo into
  # "mkdir: /nonexistent: Read-only file system" from a line that has nothing to
  # do with what went wrong.
  DUMP="$REPO/node_modules/.cache/cellar-test-db/nhost-schema.sql"
  mkdir -p "$(dirname "$DUMP")"
fi
export DUMP

# Every migration, and the code that applies them. `run.sh` ends with
# `db:migrate` (`packages/db/src/migrate/`), which applies every migration under
# `$MIGRATIONS` the template's ledger does not have — so a new or changed
# migration, or a change to how they are applied, must invalidate the template
# even though no file under transform/ changed. This used to hash only the
# migrations carrying the "Hand-written SQL lane" marker, because those were the
# only ones `run.sh` applied; since the ledger, it applies all of them.
MIGRATE_SRC="$HERE/../src/migrate"

REBUILD=0
DROP_ONLY=0
# `bash 3.2` (macOS) treats an empty array as unbound under `set -u`, hence the
# `${a[@]+"${a[@]}"}` expansion at the call site.
NO_DUMP=()
for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=1 ;;
    # Reuse the dump at $DUMP instead of taking a new one. Handed straight to
    # `run.sh`; the Nhost stack does not have to be up, or to exist. Point
    # $DUMP at `nhost-schema.sql` for the committed one.
    --no-dump) NO_DUMP=(--no-dump) ;;
    # Drop $TEST_DB and stop. This is the other half of "one database per run":
    # the vitest teardown in `services/actors/src/lib/test-db-setup.ts` calls it
    # so a finished run does not leave a 24 MB database behind.
    --drop) DROP_ONLY=1 ;;
    *)
      echo "usage: test-db.sh [--rebuild] [--no-dump] | test-db.sh --drop" >&2
      exit 2
      ;;
  esac
done
[[ "${ACTORS_TEST_DB_REBUILD:-}" == "1" ]] && REBUILD=1

# A typo here drops a database. `cellar` holds a frontend agent's live data and,
# since X2, better-auth's five tables as well, so its name may never reach the
# `DROP DATABASE` below — hence a prefix, not a blocklist.
for name in "$TEST_DB" "$TEMPLATE_DB"; do
  if [[ "$name" != cellar_test* ]]; then
    echo "refusing to manage \"$name\": name must start with cellar_test" >&2
    exit 1
  fi
done

# Mirrors `run.sh`: `DST_CONTAINER=` (empty) reaches the target over TCP with a
# local psql, which is the only way to talk to a CI service container.
psql_db() {
  local db="$1"
  shift
  if [[ -n "$DST_CONTAINER" ]]; then
    docker exec -i -e PGPASSWORD="$DST_PASSWORD" "$DST_CONTAINER" \
      psql -U "$DST_USER" -d "$db" -v ON_ERROR_STOP=1 "$@"
  else
    PGPASSWORD="$DST_PASSWORD" psql -U "$DST_USER" -d "$db" -v ON_ERROR_STOP=1 "$@"
  fi
}

# `postgres` is the maintenance database: CREATE/DROP DATABASE cannot run from
# inside the database being dropped.
admin() { psql_db postgres "$@"; }

sha() { if command -v shasum > /dev/null; then shasum -a 256; else sha256sum; fi; }

# `--drop` takes NO LOCK, deliberately. The namespace lock below serialises
# *mutations of the shared* test databases; a run database is named after the
# process that made it and nothing else touches it, so dropping one contends
# with nobody. Taking the lock here would be worse than useless: teardown would
# then be able to block for TEST_DB_LOCK_WAIT behind somebody else's build,
# after a suite has already finished and printed its results.
#
# `WITH (FORCE)` because a vitest worker's pool may still be draining; the
# database is this run's own, and the `cellar_test` prefix guard above has
# already refused anything else.
#
# It drops everything carrying the SAME `_run_<pid>_<epoch>` suffix, not just
# `$TEST_DB`. The actors suite creates two families of scratch database with
# that tag — `cellar_test…` here and `auth_test…` in
# `services/actors/src/auth/testing.ts` — and one pattern match is the only
# version of this that cannot drift out of step with a list of names. The
# suffix is this run's own, so the pattern cannot reach another run; the
# `LIKE` is still bounded to the two known prefixes so a malformed `$TEST_DB`
# cannot widen it.
if [[ $DROP_ONLY -eq 1 ]]; then
  suffix=""
  [[ "$TEST_DB" =~ (_run_[0-9]+_[0-9]+)$ ]] && suffix="${BASH_REMATCH[1]}"
  admin -q -c "DROP DATABASE IF EXISTS \"$TEST_DB\" WITH (FORCE)" > /dev/null
  echo "==> dropped $TEST_DB"
  if [[ -n "$suffix" ]]; then
    # `read <&3`, not plain `read`. `admin` runs `docker exec -i`, which reads
    # the loop's STDIN and swallows every line the loop had not consumed yet —
    # so a plain `while read; do admin; done < <(…)` drops the first database
    # and then quietly ends. Measured: one of two scratch databases dropped,
    # exit 0, no complaint. Feeding `read` from a dedicated descriptor leaves
    # fd 0 to the child.
    extras="$(admin -At -c "SELECT datname FROM pg_database
                             WHERE (datname LIKE 'cellar\\_test%' OR datname LIKE 'auth\\_test%')
                               AND datname LIKE '%$suffix'
                             ORDER BY 1" 2> /dev/null || true)"
    while IFS= read -r extra <&3; do
      [[ -z "$extra" ]] && continue
      if admin -q -c "DROP DATABASE IF EXISTS \"$extra\" WITH (FORCE)" > /dev/null 2>&1; then
        echo "==> dropped $extra"
      else
        # Not fatal, and not silent either. `WITH (FORCE)` gives a backend a few
        # seconds to die; a worker that is slow to close its pool can outlast
        # that. The reaper collects it on a later build, but a teardown that
        # quietly failed is how a leak becomes invisible, so say it.
        echo "could not drop $extra; leaving it for the reaper" >&2
      fi
    done 3<<< "$extras"
  fi
  exit 0
fi

# ---------------------------------------------------------------- the mutex
#
# Two processes running this script against the same Postgres both try to build
# the same fixed-name template, and the loser dies inside `run.sh`'s reset with
#
#   duplicate key value violates unique constraint "pg_namespace_nspname_index"
#   Key (nspname)=(public)
#
# — two concurrent `DROP SCHEMA public` / `CREATE SCHEMA public` pairs on one
# database. It surfaces as a `globalSetup` failure before a single assertion
# runs, and it is a race, so it is intermittent: three agents ran the suite the
# same afternoon, two saw 921 pass and the third saw this.
#
# That capped concurrent agents at one. A Postgres **session** advisory lock,
# keyed on the template name, is the fix:
#
#   * It lives in the database, which is the resource actually being shared —
#     not in a lockfile on a filesystem that a CI container or another worktree
#     may not share.
#   * Postgres releases it when the connection drops, so a killed build cannot
#     wedge every later run. A lock table or a lockfile both need a staleness
#     story; this needs none.
#
# The **check and the build are both inside** it. A "is the template current?"
# test outside the lock and a build inside still races — it just loses less
# often, which is worse, not better. So the loser blocks, and when it wakes the
# template is built and its recorded fingerprint matches, so it skips the build
# and goes straight to the clone. The clone is in here too:
# `CREATE DATABASE ... TEMPLATE` refuses while another session is connected to
# the template, which is exactly what a concurrent build is.
#
# ONE NAMESPACE, NOT ONE LOCK PER DATABASE. The key is the constant below, not
# `$TEMPLATE_DB`, because there is more than one colliding pair and they do not
# all touch the same database:
#
#   * two suite setups building `cellar_test_template`;
#   * a suite setup racing somebody running this script by hand to rebuild
#     `cellar_test` — a different database and a different branch of this file.
#     This is the worse of the two, because the deliberate run is what someone
#     does *while trying to fix something else*.
#
# Three narrow locks would still interleave those. One namespace meaning "I am
# mutating the shared test databases" cannot. The cost is that two runs with
# genuinely independent names also serialise; a build is seconds and a clone is
# about one, so that is a good trade for never having to think about it again.
#
# The scope is already right without any name in the key: advisory locks are
# per-database and this one is taken on `postgres`, so it covers exactly the
# `cellar_test*` family on this one server — which is all this script will touch
# (the prefix guard above refuses anything else).
#
# `hashtext` is an internal function rather than a documented one. That is fine
# here because the *value* is irrelevant — every caller computes it on the same
# server, so they agree by construction, and nothing persists it.
LOCK_NAMESPACE="cellar_test_databases"
TEST_DB_LOCK_WAIT="${TEST_DB_LOCK_WAIT:-300}"
# The holder's own dead-man's switch. Postgres releases an advisory lock when
# the session ends, and the session ends when the psql below sees EOF — which
# needs this shell to run its trap. SIGKILL runs no trap, and then an orphaned
# `docker exec psql` sits on the lock until somebody notices, which is the one
# failure mode this design otherwise has no answer for. The holder is idle for
# the whole critical section by construction, so `idle_session_timeout` bounds
# it: Postgres terminates the session itself, and the lock goes with it.
#
# The margin is enormous on purpose. A full cold build here — fresh `pg_dump`
# from Nhost, restore, seventeen transform files, the lane migrations and the
# reference seed — was measured at 3.0s wall. 900s is 300 times that. If it
# ever *did* fire mid-build, the build would silently lose the lock, so the
# clone below re-asserts the lock is still held rather than assuming it.
TEST_DB_LOCK_MAX_HOLD="${TEST_DB_LOCK_MAX_HOLD:-900}"
LOCK_DIR=""
LOCK_TOKEN=""
LOCK_PID=""

# Closing fd 9 leaves the FIFO with no writer, so the psql holding the lock sees
# end of input and exits; Postgres then drops the session and its advisory lock.
# Called from an EXIT trap, so it runs on the failure paths too — including
# `exit 1` from the build and a `set -e` abort.
#
# Idempotent: the EXIT trap fires again after the signal traps below call this
# and then `exit`, and the release at the end of the critical section runs while
# the EXIT trap is still armed.
release_template_lock() {
  if [[ -n "$LOCK_DIR" ]]; then
    exec 9>&-
    if [[ -n "$LOCK_PID" ]]; then wait "$LOCK_PID" 2> /dev/null || true; fi
    rm -rf "$LOCK_DIR"
    LOCK_DIR=""
  fi
}

# Is this session still the lock holder?
#
# Cheap insurance against the only two ways the lock can vanish under a build
# that believes it holds it: `TEST_DB_LOCK_MAX_HOLD` firing, and somebody
# running `pg_terminate_backend` on what looked like a stuck session. Both turn
# a serialised build back into a concurrent one, and a concurrent one is
# precisely the thing that produces `pg_namespace_nspname_index` further down.
# Better to stop here and say so.
still_holding_lock() {
  [[ "$(admin -At -c "SELECT count(*) FROM pg_locks l
                        JOIN pg_stat_activity a USING (pid)
                       WHERE l.locktype = 'advisory' AND l.granted
                         AND a.application_name = '$LOCK_TOKEN'")" == "1" ]]
}

acquire_template_lock() {
  local waited=0 granted blockers
  LOCK_TOKEN="cellar-test-db-lock-$$-${RANDOM}"
  LOCK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cellar-test-db-lock.XXXXXX")"
  # EXIT alone is not enough. Bash does run an EXIT trap when a *handled* fatal
  # signal terminates it, but it then exits 0 — and this script is spawned by a
  # vitest `globalSetup` that has to be able to tell "killed" from "failed", so
  # the exit status has to carry the signal. `turbo run test` kills every
  # in-flight task the moment a sibling package's tests go red, which is the
  # common case by a wide margin, so these three are live code, not paranoia.
  trap release_template_lock EXIT
  trap 'release_template_lock; exit 130' INT
  trap 'release_template_lock; exit 143' TERM
  trap 'release_template_lock; exit 129' HUP
  mkfifo "$LOCK_DIR/fifo"

  # The reader is started first, but fd 9 is opened read-write anyway: opening a
  # FIFO write-only BLOCKS until a reader arrives, so if psql failed to start at
  # all the `exec` below would hang forever — the one outcome a test harness
  # must not have. `<>` never blocks. It also still yields EOF when closed,
  # because EOF depends on there being no *writer*, and fd 9 is the only one.
  psql_db postgres -At < "$LOCK_DIR/fifo" > "$LOCK_DIR/psql.log" 2>&1 &
  LOCK_PID=$!
  exec 9<> "$LOCK_DIR/fifo"
  printf '%s\n' \
    "SET application_name = '$LOCK_TOKEN';" \
    "SET idle_session_timeout = '${TEST_DB_LOCK_MAX_HOLD}s';" \
    "SELECT pg_advisory_lock(hashtext('$LOCK_NAMESPACE'));" >&9
  # Let the holder get as far as running them. Without this the first poll below
  # loses to psql's own startup and an uncontended run reports that it is
  # "waiting for the build lock", which is a lie that would teach people to
  # ignore the message.
  sleep 0.2

  # Acquisition is observed from a *separate* connection rather than by reading
  # the holder's stdout, which psql block-buffers into a file and would not
  # flush until it exits. `application_name` makes our own session
  # unambiguous — `granted` distinguishes holding the lock from queueing for it.
  while true; do
    if ! kill -0 "$LOCK_PID" 2> /dev/null; then
      echo "the session that should hold the shared test-database lock exited:" >&2
      cat "$LOCK_DIR/psql.log" >&2
      exit 1
    fi
    granted="$(admin -At -c "SELECT count(*) FROM pg_locks l
                               JOIN pg_stat_activity a USING (pid)
                              WHERE l.locktype = 'advisory' AND l.granted
                                AND a.application_name = '$LOCK_TOKEN'")"
    if [[ "$granted" == "1" ]]; then
      if [[ $waited -ge 2 ]]; then echo "==> acquired the shared test-database lock after ${waited}s"; fi
      return 0
    fi
    # Announced from 2s, not from the first miss: a docker-exec round trip plus
    # psql startup is not contention.
    if [[ $waited -eq 2 ]]; then
      echo "==> waiting for the shared test-database lock (another run is building $TEMPLATE_DB or $TEST_DB)"
    fi
    # Fail loudly rather than hang: a suite that hangs is worse than one that
    # fails, because nothing reports it.
    if [[ $waited -ge $TEST_DB_LOCK_WAIT ]]; then
      # Every granted advisory lock on this server, not just ones whose objid
      # matches: `pg_advisory_lock(hashtext(...))` widens an int4 to int8 and
      # pg_locks splits that across classid/objid, so an objid-only predicate is
      # subtly wrong for negative hashes. This script is the only thing here
      # that takes advisory locks at all, so the unfiltered list is both correct
      # and more informative — age is what tells an orphan from a slow build.
      blockers="$(admin -At -c "SELECT string_agg(
                                    a.application_name || ' (pid ' || a.pid
                                    || ', ' || a.state || ' for '
                                    || date_trunc('second', now() - a.state_change) || ')', ', ')
                                  FROM pg_locks l JOIN pg_stat_activity a USING (pid)
                                 WHERE l.locktype = 'advisory' AND l.granted" 2> /dev/null || true)"
      echo "gave up after ${TEST_DB_LOCK_WAIT}s waiting for the shared test-database lock." >&2
      echo "held by: ${blockers:-unknown}" >&2
      echo "A concurrent build of the cellar_test databases is the expected cause." >&2
      echo "RE-RUNNING IS THE FIRST THING TO TRY -- this is not a code defect." >&2
      echo "Raise TEST_DB_LOCK_WAIT if a build here legitimately takes longer." >&2
      # A build here is ~3s. A holder idle for minutes is an orphan, not a
      # build — a SIGKILLed run whose psql outlived it. It clears itself after
      # TEST_DB_LOCK_MAX_HOLD (${TEST_DB_LOCK_MAX_HOLD}s), and this is how to
      # not wait for that.
      echo "If the holder above has been idle for minutes it is an orphaned session; clear it with" >&2
      echo "  SELECT pg_terminate_backend(<pid>);" >&2
      exit 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
}

# `find`, not a glob: an unmatched glob under `set -u` is a literal string, and
# `cat` of it would fail the fingerprint rather than the build. Sorted, so the
# hash does not depend on directory order.
migration_files() {
  find "$MIGRATIONS" -name migration.sql -type f | LC_ALL=C sort
}

# What the template's contents depend on: the numbered transform files, the two
# scripts, the reference rows, every migration and the migrator that applies
# them — and whatever `run.sh` reads its schema *from*.
#
# That last input has two forms, and both are hashed when present rather than
# one being assumed:
#
#   * `$DUMP`, when it is already on disk. That is the exact input a
#     `--no-dump` build restores, including the checked-in `nhost-schema.sql`
#     (X4). It used not to be hashed at all, so editing or regenerating that
#     file left a stale template reporting itself current.
#   * `nhost/migrations`, when the directory still exists — the right proxy for
#     a build that takes a *fresh* dump, since `run.sh` dumps the schema those
#     migrations produced. It is `find`ed rather than `cat`ed directly because
#     it is scheduled for deletion after E4 (migration-plan §"nhost/ stays
#     until after E4"): when it goes, this contributes nothing, the fingerprint
#     changes exactly once, and nothing here breaks.
#
# Takes the dump's path as an argument rather than reading `$DUMP`, because the
# file that is hashed and the file that is restored have to be the same *bytes*,
# not merely the same name — see `DUMP_PIN` below.
fingerprint() {
  local dump="$1"
  {
    cat "$HERE"/[0-9][0-9]_*.sql "$HERE/run.sh" "${BASH_SOURCE[0]}" "$REFERENCE_DATA"
    migration_files | tr '\n' '\0' | xargs -0 cat
    cat "$MIGRATE_SRC/ledger.ts" "$MIGRATE_SRC/cli.ts"
    if [[ -f "$dump" ]]; then cat "$dump"; fi
    find "$REPO/nhost/migrations" -type f -print0 2> /dev/null | sort -z | xargs -0 cat 2> /dev/null
  } | sha | cut -c1-64
}

database_exists() {
  [[ "$(admin -At -c "SELECT 1 FROM pg_database WHERE datname = '$1'")" == "1" ]]
}

recorded_fingerprint() {
  psql_db "$TEMPLATE_DB" -At \
    -c "SELECT fingerprint FROM cellar_test_meta.build" 2> /dev/null || true
}

# ------------------------------------------------- reaping abandoned run dbs
#
# `test-db-setup.ts` gives each run its own `cellar_test…_run_<pid>_<epoch>`
# database — and `src/auth/testing.ts` tags its `auth_test…` scratch databases
# the same way — and drops them again in the vitest teardown. A run that is
# *killed* never reaches its teardown, and `turbo run test` kills the actors
# task every time another package's tests fail first, so the leak is routine
# rather than exotic: one was found here holding 24 MB, left by a run three
# hours dead.
#
# TELLING ABANDONED FROM IN-PROGRESS IS THE WHOLE JOB. A reaper that gets this
# wrong drops a live run's database mid-suite, which reads as 52 assertion
# failures and `database "…" does not exist`, and it would do it to *another
# agent's* run — the exact class of failure this file exists to end. So two
# independent conditions have to hold, and only their conjunction reaps:
#
#   1. the timestamp in the name is older than TEST_DB_RUN_TTL (default 2h,
#      against a suite that takes ~3 minutes);
#   2. nothing is connected to it right now.
#
# And the drop is deliberately **without** `WITH (FORCE)`: between (2) and the
# DROP there is a window, and if a connection appears in it the right outcome is
# for the drop to fail. A failure here is ignored; the next run tries again.
#
# The epoch in the name comes from the *client's* clock and `now()` from the
# server's. Both are this machine (the server is a container on it), and two
# hours of slack absorbs far more skew than that can produce.
TEST_DB_RUN_TTL="${TEST_DB_RUN_TTL:-7200}"

reap_abandoned_run_databases() {
  local victims victim
  victims="$(admin -At -c "
    SELECT d.datname
      FROM pg_database d
     WHERE d.datname ~ '^(cellar_test|auth_test).*_run_[0-9]+_[0-9]+\$'
       AND d.datname <> '$TEST_DB'
       AND d.datname <> '$TEMPLATE_DB'
       AND split_part(d.datname, '_', -1)::bigint
             < extract(epoch FROM now())::bigint - $TEST_DB_RUN_TTL
       AND NOT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.datname = d.datname)
     ORDER BY 1" 2> /dev/null || true)"
  # `read <&3` for the same reason as in `--drop` above: `admin` is a
  # `docker exec -i`, and on fd 0 it would eat the rest of the list.
  while IFS= read -r victim <&3; do
    [[ -z "$victim" ]] && continue
    if admin -q -c "DROP DATABASE IF EXISTS \"$victim\"" > /dev/null 2>&1; then
      echo "==> reaped abandoned run database $victim"
    fi
  done 3<<< "$victims"
}

# ---- critical section: the reap, the check, the build AND the clone ----------
#
# The fingerprint is computed **in here**, which it did not used to be. The old
# comment said the hash only reads files so it was safe outside — but one of the
# files it reads is `$DUMP`, and `run.sh` rewrites `$DUMP`. A `run.sh` building a
# development database (which this lock does not cover, and should not) could
# therefore swap the dump between the hash and the build, and the template would
# be recorded under the fingerprint of a file it was not built from. That is the
# "check outside the lock" bug in its subtlest form: not a missing lock, a hash
# of the wrong bytes. Hashing 290 KB costs about 3 ms; the argument for keeping
# it outside was never worth the hole.
acquire_template_lock
reap_abandoned_run_databases

# THE DUMP THIS INVOCATION USES, private to it. `$DUMP` is a shared cache — that
# is its whole point, since `--no-dump` and the fingerprint both want the same
# file to persist between runs — so it cannot also be the file a build reads
# while holding the lock. Copying it into the lock directory (`mktemp -d`, so
# per-invocation) pins the bytes: whatever else rewrites `$DUMP` from here on,
# this build restores, hashes and records one consistent snapshot.
DUMP_PIN="$LOCK_DIR/nhost-schema.sql"
if [[ -f "$DUMP" ]]; then cp "$DUMP" "$DUMP_PIN"; fi
if [[ ${#NO_DUMP[@]} -gt 0 && ! -f "$DUMP_PIN" ]]; then
  echo "--no-dump needs a dump at $DUMP, and there is none." >&2
  echo "Drop --no-dump to take a fresh one, or point DUMP at" >&2
  echo "  $HERE/nhost-schema.sql" >&2
  exit 1
fi

WANT="$(fingerprint "$DUMP_PIN")"

if [[ $REBUILD -eq 0 ]] && database_exists "$TEMPLATE_DB" &&
  [[ "$(recorded_fingerprint)" == "$WANT" ]]; then
  echo "==> template $TEMPLATE_DB is current ($WANT)"
else
  echo "==> building template $TEMPLATE_DB"
  # WITH (FORCE) so a psql left open on the template does not wedge the build.
  admin -q -c "DROP DATABASE IF EXISTS \"$TEST_DB\" WITH (FORCE)" \
    -c "DROP DATABASE IF EXISTS \"$TEMPLATE_DB\" WITH (FORCE)" \
    -c "CREATE DATABASE \"$TEMPLATE_DB\"" > /dev/null

  # The same build a development database gets — numbered transform files, then
  # `db:migrate` for every migration, both inside `run.sh`. The dump
  # carries citext, pg_trgm, pgcrypto, postgis and vector with it, so a database
  # created from `template1` ends up with the extensions too.
  #
  # `DUMP` is overridden to the pin for the child: without `--no-dump` the child
  # takes a fresh dump, and it writes it here, into this invocation's private
  # directory, rather than over the shared cache another process may be reading.
  DST_CONTAINER="$DST_CONTAINER" DST_USER="$DST_USER" \
    DST_PASSWORD="$DST_PASSWORD" DST_DB="$TEMPLATE_DB" DUMP="$DUMP_PIN" \
    "$HERE/run.sh" ${NO_DUMP[@]+"${NO_DUMP[@]}"}

  # …and the reference rows, from the same file and the same code path as
  # `bun run db:seed`. A schema-only dump carries none of them, and the ten
  # reference tables are foreign-key targets: without this a test that inserts a
  # wine has to invent its own `wine_style` row first.
  echo "==> reference data"
  # Every other step in this script reaches the target through
  # `psql_db` -> `docker exec "$DST_CONTAINER"`. This one cannot: `$SEED` is a
  # TypeScript entry point that needs node_modules, which the Postgres image
  # does not have, so it has to connect over TCP from the host.
  #
  # It used to hardcode `${PGPORT:-5433}` for that, which is the *shared*
  # stack's published port. Point `DST_CONTAINER` at a per-worktree stack and
  # the schema landed in the worktree's Postgres while these reference rows
  # landed in whatever happened to be listening on 5433 — and the fingerprint
  # below was then written as though the build had succeeded, so the mistake
  # was both silent and sticky. It showed up as 14 failures in
  # `rankings-actor.test.ts` complaining that `WHISKEY` is absent from
  # `spirit_type`, which names neither the port nor the database.
  #
  # So derive the port from the container we were actually told to use.
  seed_port="${PGPORT:-5433}"
  if [[ -n "$DST_CONTAINER" ]]; then
    mapped="$(docker port "$DST_CONTAINER" 5432/tcp 2>/dev/null | head -1)"
    if [[ -z "$mapped" ]]; then
      echo "could not read the published 5432 port of container '$DST_CONTAINER'" >&2
      exit 1
    fi
    seed_port="${mapped##*:}"
  fi
  DATABASE_URL="postgres://$DST_USER:$DST_PASSWORD@${PGHOST:-localhost}:${seed_port}/$TEMPLATE_DB" \
    node "$SEED" --reference-only

  # Recorded from a fingerprint taken AFTER the build, not the one taken before
  # it. Without `--no-dump` the child just replaced the pin with a fresh dump,
  # so `$WANT` describes the inputs as they were on the way in and this one
  # describes what the template was actually built from. Recording `$WANT` made
  # the very next run compute a hash of the new dump, disagree, and rebuild —
  # a wasted full rebuild after every `--rebuild`, converging only on the run
  # after that.
  WANT="$(fingerprint "$DUMP_PIN")"
  psql_db "$TEMPLATE_DB" -q \
    -c "CREATE SCHEMA cellar_test_meta" \
    -c "CREATE TABLE cellar_test_meta.build (fingerprint text primary key, built_at timestamptz not null default now())" \
    -c "INSERT INTO cellar_test_meta.build (fingerprint) VALUES ('$WANT')" > /dev/null

  # Publish the pin to the shared cache, so the next run finds it current
  # instead of re-dumping, and `--no-dump` has something to reuse. `mv` within
  # one filesystem is atomic, so a concurrent reader sees the whole old file or
  # the whole new one. Skipped when the caller named the path: the documented
  # `--rebuild --no-dump` recipe points DUMP at the checked-in
  # `nhost-schema.sql`, and that file is not ours to overwrite.
  if [[ $DUMP_IS_CALLERS -eq 0 && -f "$DUMP_PIN" ]]; then
    cp "$DUMP_PIN" "$DUMP.$$.partial" && mv -f "$DUMP.$$.partial" "$DUMP"
  fi
fi

# The lock can be lost without this shell noticing: `TEST_DB_LOCK_MAX_HOLD`
# firing, or somebody terminating the backend by hand. Either way the build
# above was not serialised after all, so say that rather than cloning a template
# that a second builder may be halfway through replacing.
if ! still_holding_lock; then
  echo "lost the shared test-database lock during the build." >&2
  echo "The template may have been rebuilt underneath this run, so it is not" >&2
  echo "safe to clone. RE-RUNNING IS THE FIRST THING TO TRY." >&2
  echo "Causes: idle_session_timeout (${TEST_DB_LOCK_MAX_HOLD}s) firing on a" >&2
  echo "build that really did take that long, or pg_terminate_backend." >&2
  exit 1
fi

echo "==> recreating $TEST_DB from $TEMPLATE_DB"
# CREATE DATABASE ... TEMPLATE refuses while anything is connected to the
# template, so this is inside the lock: a concurrent run's *build* is such a
# connection. The lock holder itself is connected to `postgres`, not to the
# template, so it does not block this.
admin -q -c "DROP DATABASE IF EXISTS \"$TEST_DB\" WITH (FORCE)" \
  -c "CREATE DATABASE \"$TEST_DB\" TEMPLATE \"$TEMPLATE_DB\"" > /dev/null

# ---- end of critical section ------------------------------------------------
# Released here rather than left to the EXIT trap so the next run gets in one
# query earlier. The trap still covers every failure path, and the release is
# idempotent.
release_template_lock

psql_db "$TEST_DB" -At -c "SELECT 'ready: $TEST_DB, public relations: ' || count(*) FROM information_schema.tables WHERE table_schema = 'public';"
