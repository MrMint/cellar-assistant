#!/usr/bin/env bash
# E1 · Cutover: a production Nhost dump -> the database the new stack expects.
#
#   SRC_DSN=postgres://… scripts/cutover/cutover.sh preflight   # read-only
#   SRC_DSN=postgres://… scripts/cutover/cutover.sh all         # unattended
#   scripts/cutover/cutover.sh all --from transform-a   # a resume: no SRC_*
#   scripts/cutover/cutover.sh <phase> ...   # one or more named phases
#
# `preflight` and `dump` read the source and need exactly one of SRC_DSN /
# SRC_CONTAINER — there is no default (see "source" below). Local rehearsal:
# SRC_CONTAINER=<worktree>-postgres-1.
#
# Phases, in the only order that works:
#
#   preflight     read-only questions for the source; snapshots row counts;
#                 then checks THIS host: Node vs .nvmrc, target login over TCP
#   dump          pg_dump the source, WITH DATA, custom format (read-only on Nhost)
#   restore       read the archive end to end, THEN reset the target schemas
#                 and load it with parallel pg_restore
#   transform-a   00-08   drop Hasura, enums, money, new tables, renames
#   files         services/actors/scripts/migrate-files.ts   (rows + objects;
#                 SOURCE_MODE=s3, or storage-api for Nhost Cloud;
#                 FILES_MODE=rows-only: the rows, no objects)
#   transform-b   09-13   repoint the six file FKs, create better-auth's tables
#   users         services/actors/scripts/migrate-users.ts
#   transform-c   14-99   repoint the 31 user FKs, drop `auth`, widen a check,
#                         create every target index (`17`)
#   migrate       db:migrate: adopt the transformed database onto the
#                 migration ledger, then apply every later migration
#                 (packages/db/src/migrate/; was `lane`, still accepted)
#   baseline      drizzle-kit check + generate: the diff must be empty
#   smoke         smoke.sql + a row-count diff against the source snapshot,
#                 and `db:migrate --status` must report nothing pending;
#                 under FILES_MODE=full, no `files` row may still carry the
#                 rows-only marker
#   report        the timings table
#
# The three ranges are `00-08`, `09-13` and `14-99`, which between them cover
# every two-digit prefix: a new numbered transform file is picked up by
# `transform-c` without editing this script. That is deliberate. The previous
# upper bound was `16`, so `17_target_indexes.sql` would have been applied by
# `run.sh` (which globs) and silently skipped here — a file that exists and
# never runs, which is the shape of the bug `17` was written to remove. A new
# file that must run *earlier* than `transform-c` has to be numbered into the
# range that runs it; the ordering constraints are the two below.
#
# WHY THE SPLIT. `packages/db/transform/run.sh` runs them all straight through.
# That is right for a schema-only dump and wrong for data, twice over:
#
#   * `09`, `10` and `12` repoint six foreign keys from `storage.files` onto
#     `public.files`. On production rows `ADD CONSTRAINT` fails unless the file
#     rows are already in `public.files` — so `migrate-files.ts` runs between
#     `08` and `09`. All three files guard this and abort naming the script.
#   * `14` aborts if any `public.*` row references a user id not yet in `"user"`,
#     and `15` aborts if any `auth.users` row has no `"user"` row — so
#     `migrate-users.ts` runs between `13` and `14` (X2's note).
#
# Both node scripts are idempotent, so a phase can be re-run for free.
#
# NEITHER SEED STEP RUNS HERE. `bun run db:seed` and `migrate-users.ts` both claim
# `test@test.com`; the ids agree only because the seed pins them. A production
# cutover runs neither `nhost up --apply-seeds` nor `bun run db:seed`.
#
# THE SOURCE IS NEVER WRITTEN TO. Every source connection is opened with
# `default_transaction_read_only = on`, and the transform builds a *new*
# database from a dump. That is what keeps `07`'s 173 constraint renames safe
# and E4's rollback — point Vercel back at Nhost — available right up to the
# moment the frontend flips.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TRANSFORM="$ROOT/packages/db/transform"

# ---------------------------------------------------------------- source
# Either a container to `docker exec` into (local rehearsal) or a DSN reached
# with a throwaway psql/pg_dump container (a real Nhost project). Name EXACTLY
# ONE — `resolve_source` refuses neither and refuses both.
#
# THERE IS NO DEFAULT, deliberately. SRC_CONTAINER used to default to
# `epic-burnell-4b4be9-postgres-1` and was checked before SRC_DSN, so
# `SRC_DSN=… cutover.sh preflight` — the obvious production invocation —
# silently read the local legacy database on the one Mac where that container
# exists: plausible output (two users, no files), the wrong database, and a
# preflight answer recorded against production that production never gave.
# Local rehearsal now says `SRC_CONTAINER=<worktree>-postgres-1` out loud.
# `SRC_CONTAINER="" SRC_DSN=…` (the older documented form) still works: an
# empty value counts as unset.
SRC_CONTAINER="${SRC_CONTAINER:-}"
SRC_USER="${SRC_USER:-postgres}"
SRC_DB="${SRC_DB:-local}"
SRC_DSN="${SRC_DSN:-}"
# The image used for the DSN path. Must be >= the source server's major version
# (its pg_dump/psql are 18.4; production's Nhost is 18.4, so equal).
#
# EVERY `docker run` of it names its program with `--entrypoint`, never as a
# trailing command. This image's ENTRYPOINT is `/bin/init.sh`, which ignores
# its arguments and boots a Postgres SERVER — so `docker run --network host
# "$PG_CLIENT_IMAGE" psql …` started a server on the host's network instead of
# running psql. Found by the 2026-10-04 rehearsal on Loki, where it died only
# because 5432 was already taken; on a host with 5432 free it would have sat
# there serving an empty database. An image whose entrypoint passes through
# (the official `postgres`'s docker-entrypoint.sh) is unaffected either way.
PG_CLIENT_IMAGE="${PG_CLIENT_IMAGE:-nhost/postgres:18.4-20260610-1}"

# ---------------------------------------------------------------- target
DST_CONTAINER="${DST_CONTAINER:-cellar-stack-postgres-1}"
DST_USER="${DST_USER:-cellar}"
# The development default. On Loki it is infra/.env.prod's POSTGRES_PASSWORD,
# and a wrong value here is INVISIBLE to every `dst()` call: those go through
# `docker exec` and the container's local socket, which pg_hba trusts, so
# dump/restore/transform-a all succeed with any password at all. The first
# client that logs in over TCP — `files` (either runner), `users`, `baseline`
# — is where it would fail, mid-freeze. `check_target_tcp` logs in over TCP
# before any phase runs instead.
DST_PASSWORD="${DST_PASSWORD:-cellar}"
DST_DB="${DST_DB:-cellar}"
DST_HOST_PORT="${DST_HOST_PORT:-5433}"
# How the *node scripts* reach the target: they run outside the container.
TARGET_DSN="${TARGET_DSN:-postgres://${DST_USER}:${DST_PASSWORD}@localhost:${DST_HOST_PORT}/${DST_DB}}"
# The same database addressed from inside a container on the compose network.
TARGET_DSN_INTERNAL="${TARGET_DSN_INTERNAL:-postgres://${DST_USER}:${DST_PASSWORD}@${DST_CONTAINER}:5432/${DST_DB}}"

# ---------------------------------------------------------------- work area
WORK="${WORK:-${TMPDIR:-/tmp}/cellar-cutover}"
# A custom-format archive (`pg_dump -Fc`), restored by `pg_restore -j`. A plain
# SQL file still restores (`DUMP=packages/db/transform/nhost-schema.sql`, the
# schema-only rehearsal): `restore` tells them apart by the archive's magic.
#
# WHY NOT PLAIN SQL ANY MORE. `restore` piped the plain dump through one psql:
# every table's COPY, then every index build, one after another. On the
# 2026-09-28 production backup that was 248 s of a ~280 s database path, with
# `places` (7.17M rows) ~99% of the data. Measured on the same machine, same
# source, alternating runs under the same load (scripts/cutover/README.md,
# "Timings"): plain psql 190 s; custom + `pg_restore -j 8` 131 s. The COPY of
# `places` itself cannot be split; its indexes, and every other table, run
# beside it.
DUMP="${DUMP:-$WORK/nhost-full.dump}"
# lz4: dumps as fast as uncompressed (35-38 s vs 35 s) at half the size
# (1.9 GB vs 3.6 GB). gzip is pg_dump's default and is the slow one.
DUMP_COMPRESS="${DUMP_COMPRESS:-lz4}"
# pg_restore workers. Each is one backend on the target during `restore`.
RESTORE_JOBS="${RESTORE_JOBS:-8}"
TIMINGS="$WORK/timings.tsv"
mkdir -p "$WORK"

# `hdb_catalog` is dropped whole by `01`, so its event log — usually the largest
# table in a Hasura database — is dumped as an empty shell. Its *schema* still
# comes across, because `01` finds event triggers by "the function lives in
# hdb_catalog". Add `--exclude-table-data=auth.refresh_tokens` here too if
# production's is large: `15` drops the schema and better-auth issues its own
# sessions, so those rows have no future.
EXCLUDE_DATA=("--exclude-table-data=hdb_catalog.*")

# ---------------------------------------------------------------- S3 / MinIO
# WHICH OF THE TEN THE CALLER SET, captured before the defaults below fill them
# in. The defaults are the two LOCAL stacks — the legacy Nhost MinIO and the
# shared lane's — so a production run that forgot one would copy objects to or
# from a laptop's MinIO, or fail at `files` with the site frozen.
# `check_files_config` refuses a defaulted one unless the run is a declared
# rehearsal (SRC_CONTAINER set, or CUTOVER_REHEARSAL=1).
S3_VARS="SOURCE_S3_ENDPOINT SOURCE_S3_PORT SOURCE_S3_ACCESS_KEY SOURCE_S3_SECRET_KEY SOURCE_S3_BUCKET TARGET_S3_ENDPOINT TARGET_S3_PORT TARGET_S3_ACCESS_KEY TARGET_S3_SECRET_KEY TARGET_S3_BUCKET"
S3_DEFAULTED=""
for _v in $S3_VARS; do [ -n "${!_v:-}" ] || S3_DEFAULTED="$S3_DEFAULTED $_v"; done
unset _v
LOCAL_S3_ENDPOINTS="epic-burnell-4b4be9-minio-1 cellar-stack-minio-1 minio localhost 127.0.0.1"
# Defaults are the two local stacks, addressed by CONTAINER NAME rather than by
# the compose service alias: both projects call their object store `minio`, so a
# runner joined to both networks would resolve `minio` to two addresses and pick
# one at random. Container names are unique across networks.
export SOURCE_S3_ENDPOINT="${SOURCE_S3_ENDPOINT:-epic-burnell-4b4be9-minio-1}"
export SOURCE_S3_PORT="${SOURCE_S3_PORT:-9000}"
export SOURCE_S3_ACCESS_KEY="${SOURCE_S3_ACCESS_KEY:-minioaccesskey123123}"
export SOURCE_S3_SECRET_KEY="${SOURCE_S3_SECRET_KEY:-minioaccesskey123123}"
export SOURCE_S3_BUCKET="${SOURCE_S3_BUCKET:-nhost}"
export TARGET_S3_ENDPOINT="${TARGET_S3_ENDPOINT:-cellar-stack-minio-1}"
export TARGET_S3_PORT="${TARGET_S3_PORT:-9000}"
export TARGET_S3_ACCESS_KEY="${TARGET_S3_ACCESS_KEY:-cellar}"
export TARGET_S3_SECRET_KEY="${TARGET_S3_SECRET_KEY:-cellar-dev-secret}"
export TARGET_S3_BUCKET="${TARGET_S3_BUCKET:-cellar-files}"

# `host` runs migrate-files.ts on this machine; `docker` runs it in a throwaway
# container joined to every network in FILES_NETWORKS. Locally the two MinIOs
# are on separate docker networks and Nhost's publishes no host port, so
# `docker` is the only path that reaches both. In production both endpoints are
# routable from the cutover host and `host` is right.
FILES_RUNNER="${FILES_RUNNER:-docker}"
# migrate-files.ts also reads these four, with defaults of its own (no TLS,
# us-east-1). The docker runner used to drop them, so a TLS endpoint worked
# under `host` and silently spoke plain HTTP under `docker`. Forwarded only
# when set (`-e NAME`), so the script's defaults still apply otherwise.
S3_OPTIONAL_VARS="SOURCE_S3_USE_SSL SOURCE_S3_REGION TARGET_S3_USE_SSL TARGET_S3_REGION"
FILES_NETWORKS="${FILES_NETWORKS:-epic-burnell-4b4be9_default cellar-stack_default}"
NODE_IMAGE="${NODE_IMAGE:-node:24-bookworm-slim}"

# ---------------------------------------------------------------- files SOURCE
# Where `files` reads the object BYTES from (rows always come from
# ROWS_SOURCE_DSN, below). `s3`: SOURCE_S3_* above — the local legacy MinIO a
# rehearsal copies from. `storage-api`: Nhost's Storage HTTP API
# (GET <SOURCE_STORAGE_URL>/files/<id>) with the project's admin secret — what
# a Nhost Cloud project actually offers, because it hands out no raw S3
# credentials. Neither SOURCE_STORAGE_URL nor SOURCE_ADMIN_SECRET has a default,
# and the secret is never printed or put on a command line here: the docker
# runner forwards it by NAME (`-e SOURCE_ADMIN_SECRET`), so it is not in
# docker's argv, and migrate-files.ts redacts it from every line it prints.
# Cited semantics: services/actors/scripts/migrate-files-core.ts.
export SOURCE_MODE="${SOURCE_MODE:-s3}"
# Hosts that are this machine or a local stack. A storage-api run outside a
# declared rehearsal refuses any of them, any host with no dot (a container
# name), and the Nhost CLI's own local domains.
LOCAL_STORAGE_HOSTS="localhost 127.0.0.1 ::1 0.0.0.0 host.docker.internal"
# Forwarded to the docker runner by name, only when set — so the secret stays
# out of `docker create`'s argv, and the script's own defaults apply otherwise.
FILES_PASS_VARS="SOURCE_MODE SOURCE_STORAGE_URL SOURCE_ADMIN_SECRET CHECK_STORAGE_FILE_ID CHECK_STORAGE_FILE_SIZE FILES_CONCURRENCY FILES_MAX_ATTEMPTS FILES_RETRY_BASE_MS FILES_RETRY_MAX_MS FILES_STALL_TIMEOUT_MS FILES_HEADER_TIMEOUT_MS FILES_MAX_MISSING FILES_PROGRESS_MS TARGET_S3_PART_SIZE_MB"

# ---------------------------------------------------------------- files MODE
# `full` (the default): every uploaded `storage.files` row AND its object,
# verified; a row is written only after its object landed. `rows-only`: the
# rows, no object store contacted at all (`migrate-files.ts --rows-only`) —
# for a rehearsal with production data and no object store, and for the
# in-freeze half of a two-step cutover. `09`, `10` and `12` need the rows
# either way: they abort on any file reference with no `public.files` row, so
# "no files at all" is not an option on real data (it is what `SKIP_FILES=1`
# used to be, and why it is refused below). A later `FILES_MODE=full` run
# copies every object behind rows-only rows. README: "Files: two modes".
FILES_MODE="${FILES_MODE:-full}"
# The `files.metadata` key a rows-only row carries until a full run has
# verified its object — `ROWS_ONLY_MARKER` in migrate-files-core.ts, which is
# the source of truth (test/files-phase.sh asserts the two agree). A full
# `files` run, and `smoke` under FILES_MODE=full, refuse while any row has it.
ROWS_ONLY_MARKER=cutoverRowsOnly

# Where migrate-users.ts and migrate-files.ts read their rows from. The default
# is the RESTORED COPY, not live Nhost: the dump is the frozen truth of the
# freeze window, so reading users and file metadata out of it cannot pick up a
# registration that happened after the dump — which is exactly what would make
# `14` or `15` abort. `auth` and `storage` are both still standing at the points
# where they are read. Point this at a live Nhost DSN only to take a later
# snapshot deliberately.
#
# Overriding it is checked, not trusted (`check_files_config`, `main`): the
# override is logged in to before any phase runs, and under FILES_RUNNER=docker
# overriding ROWS_SOURCE_DSN alone is refused — `files` would read
# ROWS_SOURCE_DSN_INTERNAL, which still defaults to the target, while `users`
# read the override: two phases, two different databases, one run.
ROWS_SOURCE_OVERRIDDEN=0
[ -n "${ROWS_SOURCE_DSN:-}" ] && ROWS_SOURCE_OVERRIDDEN=1
ROWS_SOURCE_INTERNAL_OVERRIDDEN=0
[ -n "${ROWS_SOURCE_DSN_INTERNAL:-}" ] && ROWS_SOURCE_INTERNAL_OVERRIDDEN=1
ROWS_SOURCE_DSN="${ROWS_SOURCE_DSN:-$TARGET_DSN}"
ROWS_SOURCE_DSN_INTERNAL="${ROWS_SOURCE_DSN_INTERNAL:-$TARGET_DSN_INTERNAL}"

# `fnm use` does nothing in a non-interactive shell. The default is where fnm
# puts .nvmrc's version on the Mac this was written on; on any other host set
# NODE_BIN, or have the right `node` first on PATH. Whatever `node` this
# resolves to is checked against .nvmrc (`check_node`) before a phase that
# runs host `node` starts — it is not trusted because the path looks right.
export PATH="${NODE_BIN:-$HOME/.local/share/fnm/node-versions/v24.14.0/installation/bin}:$PATH"
export CI=true

# ---------------------------------------------------------------- helpers
c_bold=$'\033[1m'; c_dim=$'\033[2m'; c_red=$'\033[31m'; c_off=$'\033[0m'
say()  { printf '%s==> %s%s\n' "$c_bold" "$*" "$c_off"; }
note() { printf '%s    %s%s\n' "$c_dim" "$*" "$c_off"; }
die()  { printf '%s!!! %s%s\n' "$c_red" "$*" "$c_off" >&2; exit 1; }
redact() { printf '%s' "$1" | sed 's#//[^@/]*@#//***@#'; }

# Decide which source `preflight` and `dump` read, or refuse. Sets SRC_KIND
# (`container` | `dsn`) and SRC_LABEL (safe to print: the DSN is redacted).
# Called by `main` before any phase runs whenever the list contains a phase
# that reads the source, so an ambiguous or missing source costs nothing.
SRC_KIND=""; SRC_LABEL=""
# Set by `main` from the phase list: 1 when this run will use the target.
RUN_USES_TARGET=0
resolve_source() {
  if [ -n "$SRC_CONTAINER" ] && [ -n "$SRC_DSN" ]; then
    die "both SRC_CONTAINER ('$SRC_CONTAINER') and SRC_DSN ($(redact "$SRC_DSN")) are set. Name exactly one source: unset the other (or set it to \"\")."
  elif [ -n "$SRC_DSN" ]; then
    SRC_KIND=dsn;       SRC_LABEL="DSN $(redact "$SRC_DSN") via $PG_CLIENT_IMAGE"
  elif [ -n "$SRC_CONTAINER" ]; then
    SRC_KIND=container; SRC_LABEL="container $SRC_CONTAINER (db $SRC_DB, user $SRC_USER)"
  else
    die "no source named, and there is no default. The Nhost project: SRC_DSN='postgres://…'. A local rehearsal: SRC_CONTAINER=<worktree>-postgres-1 (\`docker ps\`)."
  fi
}

# Every source connection is read-only. PGOPTIONS reaches pg_dump too.
src_psql() {
  [ -n "$SRC_KIND" ] || resolve_source
  if [ "$SRC_KIND" = container ]; then
    docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' \
      "$SRC_CONTAINER" psql -U "$SRC_USER" -d "$SRC_DB" -v ON_ERROR_STOP=1 "$@"
  else
    docker run --rm -i --network host -e PGOPTIONS='-c default_transaction_read_only=on' \
      --entrypoint psql "$PG_CLIENT_IMAGE" "$SRC_DSN" -v ON_ERROR_STOP=1 "$@"
  fi
}

# The host `node` that `users` (and `files` under FILES_RUNNER=host) runs
# migrate-*.ts with must be .nvmrc's: those are `.ts` files run through Node's
# own type stripping. Two ways to be wrong, both checked: a different Node,
# and Bun answering to `node` — scripts/check-node-version.mjs deliberately
# exits 0 under Bun, so it cannot catch that case by itself. Returns non-zero
# with the reason on stderr; the caller decides whether that is fatal.
check_node() {
  local where rt
  if ! where="$(command -v node)"; then
    printf '%s!!! no node on PATH. Set NODE_BIN to the bin directory of Node %s (.nvmrc).%s\n' \
      "$c_red" "$(cat "$ROOT/.nvmrc")" "$c_off" >&2
    return 1
  fi
  rt="$(node -p 'process.versions.bun ? "bun " + process.versions.bun : "node " + process.versions.node')" || return 1
  case "$rt" in
    bun*)
      printf '%s!!! the node on PATH (%s) is %s, not Node. Set NODE_BIN.%s\n' "$c_red" "$where" "$rt" "$c_off" >&2
      return 1 ;;
  esac
  if ! node "$ROOT/scripts/check-node-version.mjs" > /dev/null 2>&1; then
    printf '%s!!! %s is %s; .nvmrc wants %s. Set NODE_BIN.%s\n' \
      "$c_red" "$where" "$rt" "$(cat "$ROOT/.nvmrc")" "$c_off" >&2
    return 1
  fi
  note "node: $where ($rt) matches .nvmrc"
}

# Log in to the target over TCP with TARGET_DSN — the same connection string,
# the same `pg` driver and the same host `node` the migrate-*.ts scripts use —
# and read back who we are. This is the check that `dst()` can never be: see
# DST_PASSWORD. It proves the password for TARGET_DSN_INTERNAL too (same role),
# though not that pg_hba admits the compose network, which only `files` under
# FILES_RUNNER=docker exercises.
#
# Returns 0 logged in, 2 nothing answered at that address (refused, unknown
# host, timeout), 1 anything else — a wrong password, a missing database, or
# `pg` not installed. Only 2 is ever downgraded to a warning, and only by a
# standalone `preflight`, which may run days ahead on a machine that is not
# the cutover host.
check_target_tcp() { check_dsn_tcp "$TARGET_DSN"; }

# The same login, for any DSN — `ROWS_SOURCE_DSN` when it is overridden.
check_dsn_tcp() {
  # The program is JavaScript with its own template literals: single quotes
  # are what keep bash from expanding them.
  # shellcheck disable=SC2016
  ( cd "$ROOT/services/actors" \
    && CUTOVER_TARGET_DSN="$1" node --input-type=module -e '
      let pg;
      try { pg = (await import("pg")).default; }
      catch (e) {
        console.error(`cannot load "pg" from services/actors (${e.code ?? e.message}): run \`bun install\` first; migrate-*.ts need it too`);
        process.exit(1);
      }
      const c = new pg.Client({
        connectionString: process.env.CUTOVER_TARGET_DSN,
        connectionTimeoutMillis: 5000,
      });
      try {
        await c.connect();
        const { rows } = await c.query(
          "SELECT current_user AS u, current_database() AS d, current_setting(\x27server_version\x27) AS v",
        );
        console.log(`logged in over TCP as ${rows[0].u} to ${rows[0].d} (PostgreSQL ${rows[0].v})`);
        await c.end();
      } catch (e) {
        const unreachable = ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EHOSTUNREACH"]
          .includes(e.code) || /timeout/i.test(e.message);
        // A refused `localhost` is an AggregateError (IPv4 and IPv6) whose own
        // message is empty; the per-address errors carry the detail.
        const detail = e.message || (e.errors ?? []).map((x) => x.message).join("; ");
        console.error(`${e.code ? e.code + ": " : ""}${detail}`);
        process.exit(unreachable ? 2 : 1);
      }
    ' )
}

# Is this run a declared rehearsal? A local legacy source (SRC_CONTAINER is
# rehearsal-only by construction), or CUTOVER_REHEARSAL=1 said out loud — the
# latter is how a rehearsal *resume* (`--from files`, no SRC_*) says so.
is_rehearsal() { [ -n "$SRC_CONTAINER" ] || [ "${CUTOVER_REHEARSAL:-0}" = "1" ]; }

# The host part of a URL: scheme, userinfo, port and path stripped; an IPv6
# literal loses its brackets. Enough to classify it, not to parse URLs in general.
url_host() {
  local h="${1#*://}"
  h="${h%%/*}"; h="${h##*@}"
  case "$h" in
    \[*\]*) h="${h#[}"; h="${h%%]*}" ;;
    *) h="${h%%:*}" ;;
  esac
  printf '%s' "$h" | tr '[:upper:]' '[:lower:]'
}

# Is this storage URL this machine, a local stack, or the Nhost CLI's local
# domain (`local.storage.nhost.run`, `local.storage.local.nhost.run`)? A host
# with no dot is a container name.
is_local_storage_url() {
  local h ep
  h="$(url_host "$1")"
  for ep in $LOCAL_STORAGE_HOSTS; do [ "$h" = "$ep" ] && return 0; done
  case "$h" in
    *.localhost|local.*.nhost.run|*.local.nhost.run|127.*|10.*|192.168.*) return 0 ;;
    *.*) return 1 ;;
    *) return 0 ;;
  esac
}

# SOURCE_MODE=storage-api's own configuration. Both values come from the Nhost
# dashboard and are set in the operator's shell; neither has a default. The
# secret is tested for presence only — never echoed, never passed as an
# argument. Outside a declared rehearsal a local URL is refused, and so is
# plain http: it would put the admin secret on the wire in clear.
check_storage_api_config() {
  local bad=0
  if [ -z "${SOURCE_STORAGE_URL:-}" ]; then
    printf '%s!!! SOURCE_MODE=storage-api needs SOURCE_STORAGE_URL: https://<subdomain>.storage.<region>.nhost.run/v1 (Nhost dashboard)%s\n' "$c_red" "$c_off" >&2
    bad=1
  fi
  if [ -z "${SOURCE_ADMIN_SECRET:-}" ]; then
    printf '%s!!! SOURCE_MODE=storage-api needs SOURCE_ADMIN_SECRET, the project admin secret (Nhost dashboard).%s\n' "$c_red" "$c_off" >&2
    printf '%s    Export it in your own shell (read -rs SOURCE_ADMIN_SECRET; export SOURCE_ADMIN_SECRET), never on a command line.%s\n' "$c_red" "$c_off" >&2
    bad=1
  fi
  if [ -n "${SOURCE_STORAGE_URL:-}" ] && ! is_rehearsal; then
    if is_local_storage_url "$SOURCE_STORAGE_URL"; then
      printf '%s!!! SOURCE_STORAGE_URL=%s is a local storage API, and this is not a declared rehearsal%s\n' "$c_red" "$SOURCE_STORAGE_URL" "$c_off" >&2
      printf '%s    (SRC_CONTAINER=… or CUTOVER_REHEARSAL=1 declares one).%s\n' "$c_red" "$c_off" >&2
      bad=1
    fi
    case "$SOURCE_STORAGE_URL" in
      https://*) ;;
      *) printf '%s!!! SOURCE_STORAGE_URL must be https outside a rehearsal: the admin secret travels in a header%s\n' "$c_red" "$c_off" >&2
         bad=1 ;;
    esac
  fi
  [ "$bad" = "0" ] && note "files source: storage API $SOURCE_STORAGE_URL (admin secret set; not shown)"
  return "$bad"
}

# Run services/actors/scripts/migrate-files.ts with `files`' environment, from
# where `files` runs, passing "$@" to it; returns its exit status. Under
# FILES_RUNNER=docker that is a throwaway container on FILES_NETWORKS using the
# *_INTERNAL DSNs. The S3 variables go by value (as they always have); every
# FILES_PASS_VARS name goes by NAME, so docker copies it from this environment
# and the admin secret never appears in docker's argv.
run_migrate_files() {
  local rc=0 cid net v args
  case "$FILES_RUNNER" in
    host)
      ( cd "$ROOT/services/actors" \
        && SOURCE_DATABASE_URL="$ROWS_SOURCE_DSN" TARGET_DATABASE_URL="$TARGET_DSN" \
           node scripts/migrate-files.ts "$@" ) || rc=$?
      ;;
    docker)
      [ -n "${FILES_NETWORKS// /}" ] || { printf '%s!!! FILES_NETWORKS is empty%s\n' "$c_red" "$c_off" >&2; return 1; }
      args=(-e "SOURCE_DATABASE_URL=$ROWS_SOURCE_DSN_INTERNAL" -e "TARGET_DATABASE_URL=$TARGET_DSN_INTERNAL")
      for v in $S3_VARS; do args=("${args[@]}" -e "$v=${!v}"); done
      for v in $S3_OPTIONAL_VARS $FILES_PASS_VARS; do args=("${args[@]}" -e "$v"); done
      # `docker run` takes one --network; the rest are connected before start.
      # `host.docker.internal` is this host from inside the container: Docker
      # Desktop defines it, Linux Docker does not unless asked (`host-gateway`),
      # and a rehearsal's local storage API is reached through it.
      cid="$(docker create --rm "${args[@]}" --add-host=host.docker.internal:host-gateway \
               -v "$ROOT:/workspace" -w /workspace/services/actors \
               --entrypoint node "$NODE_IMAGE" scripts/migrate-files.ts "$@")" || return 1
      for net in $FILES_NETWORKS; do
        docker network connect "$net" "$cid" > /dev/null \
          || { docker rm -f "$cid" > /dev/null 2>&1; printf '%s!!! cannot join network %s%s\n' "$c_red" "$net" "$c_off" >&2; return 1; }
      done
      docker start -a "$cid" || rc=$?
      ;;
    *) return 1 ;;
  esac
  return "$rc"
}

# The `files` phase's configuration, checked without touching anything: every
# reason it would copy from or to the wrong place, or read its rows from a
# different database than `users` does. Prints each problem; returns non-zero
# if there is one. Under FILES_MODE=rows-only no object store is used, so only
# the runner and the rows source are checked.
check_files_config() {
  local bad=0
  case "$FILES_RUNNER" in
    host|docker) ;;
    *) printf '%s!!! FILES_RUNNER must be host or docker, not %s%s\n' "$c_red" "$FILES_RUNNER" "$c_off" >&2
       bad=1 ;;
  esac
  if [ "$FILES_MODE" = full ]; then
    check_object_store_config || bad=1
  elif is_rehearsal; then
    note "FILES_MODE=rows-only: the files rows, NO objects (rehearsal)"
  else
    say "FILES_MODE=rows-only: this run writes the files rows and copies NO object."
    note "Every image would 404 until a FILES_MODE=full run of \`files\` has copied them."
    note "That run must finish before the flip (README, \"Files: two modes\")."
  fi
  check_rows_source_config || bad=1
  return "$bad"
}

# FILES_MODE=full's object stores: the source (SOURCE_MODE) and the target.
check_object_store_config() {
  local bad=0 v ep
  local defaulted="$S3_DEFAULTED" endpoints="SOURCE_S3_ENDPOINT TARGET_S3_ENDPOINT" want="all ten SOURCE_S3_* / TARGET_S3_*"
  case "$SOURCE_MODE" in
    s3) ;;
    storage-api)
      # The source is not an S3 endpoint at all, so only the target's five count.
      defaulted=""
      for v in $S3_DEFAULTED; do case "$v" in TARGET_*) defaulted="$defaulted $v" ;; esac; done
      endpoints="TARGET_S3_ENDPOINT"; want="all five TARGET_S3_*"
      check_storage_api_config || bad=1 ;;
    *) printf '%s!!! SOURCE_MODE must be s3 or storage-api, not %s%s\n' "$c_red" "$SOURCE_MODE" "$c_off" >&2
       bad=1 ;;
  esac
  if [ -n "${defaulted// /}" ]; then
    if is_rehearsal; then
      note "rehearsal: object-store defaults in use for: ${defaulted}"
    else
      printf '%s!!! not set, so defaulted to a LOCAL MinIO: %s%s\n' "$c_red" "$defaulted" "$c_off" >&2
      printf '%s    Set %s for production (scripts/cutover/README.md, Environment),%s\n' "$c_red" "$want" "$c_off" >&2
      printf '%s    or declare a rehearsal with SRC_CONTAINER=… or CUTOVER_REHEARSAL=1.%s\n' "$c_red" "$c_off" >&2
      bad=1
    fi
  fi
  # A production source with a local object store is wrong however it was
  # spelled — set explicitly to the default container name is still a laptop.
  if [ -n "$SRC_DSN" ] && ! is_rehearsal; then
    for v in $endpoints; do
      for ep in $LOCAL_S3_ENDPOINTS; do
        if [ "${!v}" = "$ep" ]; then
          printf '%s!!! %s=%s is a local object store, but SRC_DSN names a real source%s\n' "$c_red" "$v" "$ep" "$c_off" >&2
          bad=1
        fi
      done
    done
  fi
  return "$bad"
}

# Where `files` and `users` read their rows: the same database, or refuse.
check_rows_source_config() {
  local bad=0
  if [ "$ROWS_SOURCE_OVERRIDDEN" = "1" ] && [ "$ROWS_SOURCE_DSN" != "$TARGET_DSN" ]; then
    say "ROWS: migrate-files/migrate-users will read rows from $(redact "$ROWS_SOURCE_DSN"), NOT the restored copy"
    note "(the default reads the dump's frozen copy; see ROWS_SOURCE_DSN in the README)"
    if [ "$FILES_RUNNER" = docker ] && [ "$ROWS_SOURCE_INTERNAL_OVERRIDDEN" = "0" ]; then
      printf '%s!!! ROWS_SOURCE_DSN is overridden but ROWS_SOURCE_DSN_INTERNAL is not: under FILES_RUNNER=docker,%s\n' "$c_red" "$c_off" >&2
      printf '%s    files would read %s while users reads %s. Set both, or neither.%s\n' \
        "$c_red" "$(redact "$ROWS_SOURCE_DSN_INTERNAL")" "$(redact "$ROWS_SOURCE_DSN")" "$c_off" >&2
      bad=1
    fi
  fi
  return "$bad"
}

# Reach everything `files` will reach, FROM WHERE `files` will run, and read
# nothing: `migrate-files.ts --preflight` logs in to its two databases, asks the
# target store whether its bucket exists, and asks the source — `bucketExists`
# under SOURCE_MODE=s3; under storage-api two metadata-only HEADs, one for a
# random id (a 404 proves the admin secret is accepted, a 403 that it is not)
# and one for a real uploaded file (a 200 of the right size proves the rows and
# the storage URL are the same project). No object body is read either way.
#
# The real file comes from the SOURCE database when this run reads it
# (`preflight`), else from the rows source once `restore` has loaded it.
#
# Returns 0 all answered, 2 something did not answer at all (a standalone
# preflight may downgrade that to a warning, exactly like check_target_tcp),
# 1 anything else: a refused login, a wrong key or secret, a missing bucket.
check_files_reach() {
  local known="" rc=0
  if [ "$FILES_MODE" = rows-only ]; then
    run_migrate_files --preflight --rows-only || rc=$?
    return "$rc"
  fi
  if [ "$SOURCE_MODE" = storage-api ] && [ -n "$SRC_KIND" ]; then
    known="$(src_psql -At -F'|' -c "SELECT id, coalesce(size::text, '') FROM storage.files WHERE is_uploaded ORDER BY created_at, id LIMIT 1" 2>/dev/null)" || known=""
  fi
  if [ -n "$known" ]; then
    ( export CHECK_STORAGE_FILE_ID="${known%%|*}" CHECK_STORAGE_FILE_SIZE="${known#*|}"
      run_migrate_files --preflight ) || rc=$?
  else
    run_migrate_files --preflight || rc=$?
  fi
  return "$rc"
}

dst() {
  docker exec -i -e PGPASSWORD="$DST_PASSWORD" "$DST_CONTAINER" \
    psql -U "$DST_USER" -d "$DST_DB" -v ON_ERROR_STOP=1 "$@"
}

# Is $DUMP a pg_dump custom-format archive (vs a plain SQL script)?
is_custom_archive() { [ "$(head -c 5 "$DUMP")" = "PGDMP" ]; }

# `pg_restore "$@" <the archive>`, run BESIDE the target: a throwaway
# container from the target's own image — so pg_restore is the target
# server's version, exactly as `dst`'s psql is — sharing the target's network
# namespace (127.0.0.1:5432 is the target), with the archive's directory
# mounted read-only. Not `docker cp` into the target: copying 1.9 GB in first
# cost 17-44 s in the measurements, and a mount costs nothing. The password
# goes by name (`-e PGPASSWORD`), so it is not in docker's argv. The program
# is named with `--entrypoint`, as for PG_CLIENT_IMAGE: the target's image is
# whatever DST_CONTAINER runs, and one whose entrypoint ignores its arguments
# would boot a second server here instead of running pg_restore.
dst_pg_restore() {
  local dir base image
  dir="$(cd "$(dirname "$DUMP")" && pwd)"; base="$(basename "$DUMP")"
  image="$(docker inspect -f '{{.Config.Image}}' "$DST_CONTAINER")" || return 1
  ( export PGPASSWORD="$DST_PASSWORD"
    docker run --rm --network "container:$DST_CONTAINER" -e PGPASSWORD \
      -v "$dir:/cutover-dump:ro" --entrypoint pg_restore "$image" "$@" "/cutover-dump/$base" )
}

# Apply the numbered transform files whose two-digit prefix falls in [$1, $2].
apply_range() {
  local lo hi f n
  lo=$((10#$1)); hi=$((10#$2))
  for f in "$TRANSFORM"/[0-9][0-9]_*.sql; do
    n="$(basename "$f")"; n=$((10#${n:0:2}))
    if [ "$n" -ge "$lo" ] && [ "$n" -le "$hi" ]; then
      say "$(basename "$f")"
      dst -q < "$f"
    fi
  done
}

# --- timing -----------------------------------------------------------------
phase_start=0
begin()  { phase_start=$(date +%s); printf '\n%s##### %s %s\n' "$c_bold" "$1" "$c_off"; }
finish() {
  local secs=$(( $(date +%s) - phase_start ))
  printf '%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$1" "$secs" >> "$TIMINGS"
  note "phase '$1' took ${secs}s"
}
fn_for()   { printf 'phase_%s' "$(printf '%s' "$1" | tr - _)"; }
run_phase() { begin "$1"; "$(fn_for "$1")"; finish "$1"; }

# ---------------------------------------------------------------- phases

phase_preflight() {
  say "read-only checks against the SOURCE — nothing is written"
  say "source: $SRC_LABEL"
  src_psql -f - < "$HERE/preflight.sql" 2>&1 | tee "$WORK/preflight.txt"
  say "source row-count snapshot -> $WORK/rowcounts-source.txt"
  src_psql -At -F'|' -f - < "$HERE/rowcounts.sql" > "$WORK/rowcounts-source.txt"
  # `smoke` diffs the target against this snapshot, so which database it came
  # from is part of the artefact. `dump` compares against it.
  printf '%s\n' "$SRC_LABEL" > "$WORK/rowcounts-source.from"
  note "$(wc -l < "$WORK/rowcounts-source.txt" | tr -d ' ') tables counted"

  # Everything below is about THIS machine rather than the source, and it is
  # here so that it fails days before the freeze instead of at phase 5 of 12.
  # It runs after the source questions so their output is kept either way.
  say "cutover-host checks (Node, target login over TCP, the files path)"
  local failed=0 rc=0 frc=0
  check_node || failed=1
  check_target_tcp || rc=$?
  case "$rc" in
    0) note "target: $(redact "$TARGET_DSN")" ;;
    2) if [ "$RUN_USES_TARGET" = "1" ]; then
         printf '%s!!! target %s is not answering%s\n' "$c_red" "$(redact "$TARGET_DSN")" "$c_off" >&2
         failed=1
       else
         say "WARNING: target $(redact "$TARGET_DSN") NOT CHECKED — nothing answered there."
         note "Fine days ahead on a machine that is not the cutover host. Not fine on the"
         note "cutover host: re-run preflight there, with the production DST_*, before"
         note "the freeze is announced."
       fi ;;
    *) printf '%s!!! target login over TCP failed: %s. Check DST_PASSWORD / DST_USER / DST_HOST_PORT (or TARGET_DSN).%s\n' \
         "$c_red" "$(redact "$TARGET_DSN")" "$c_off" >&2
       failed=1 ;;
  esac
  # The `files` phase's two databases and two object stores, reached the way
  # `files` will reach them. Same severity rule as the target: a wrong key or
  # a missing bucket is fatal anywhere; nothing answering is only a warning in a
  # standalone preflight run days ahead, off the cutover host.
  check_files_config || failed=1
  check_files_reach || frc=$?
  case "$frc" in
    0) if [ "$FILES_MODE" = rows-only ]; then
         note "files path (rows-only): both databases answer (runner: $FILES_RUNNER)"
       else
         note "files path: both databases, the source ($SOURCE_MODE) and the target bucket answer (runner: $FILES_RUNNER)"
       fi ;;
    2) if [ "$RUN_USES_TARGET" = "1" ]; then
         failed=1
       else
         say "WARNING: the files path is NOT CHECKED — something above did not answer."
         note "Re-run preflight on the cutover host, with the production files source"
         note "(SOURCE_STORAGE_URL + SOURCE_ADMIN_SECRET, or SOURCE_S3_*) and TARGET_S3_*,"
         note "before the freeze is announced."
       fi ;;
    *) failed=1 ;;
  esac
  [ "$failed" = "0" ] || die "preflight: cutover-host checks failed (above). The source answers are in $WORK/preflight.txt."
}

phase_dump() {
  say "pg_dump WITH DATA -> $DUMP"
  say "source: $SRC_LABEL"
  note "data excluded for: ${EXCLUDE_DATA[*]}"
  if [ -s "$WORK/rowcounts-source.from" ] \
     && [ "$(cat "$WORK/rowcounts-source.from")" != "$SRC_LABEL" ]; then
    say "WARNING: the row-count snapshot in $WORK was taken from a DIFFERENT source:"
    note "$(cat "$WORK/rowcounts-source.from")"
    note "\`smoke\`'s row-count diff will compare against the wrong database. Run"
    note "\`preflight dump\` together so the snapshot and the dump agree."
  fi
  # `pgbouncer` is Nhost connection-pooler bookkeeping and owns nothing the app
  # touches; everything else comes across so the transform has the real
  # artifacts to drop.
  #
  # To `$DUMP.partial`, renamed only when pg_dump exited 0 — so a `$DUMP` that
  # exists is one pg_dump finished. What the plain format's completion marker
  # used to prove beyond that (every byte arrived) `restore` proves by reading
  # the archive end to end before it touches the target. Written through
  # stdout, so the archive carries no data offsets; `pg_restore -j` reads such
  # an archive in parallel regardless (measured on production data, 18.1).
  local fmt=(--format=custom "--compress=$DUMP_COMPRESS")
  rm -f "$DUMP.partial"
  if [ "$SRC_KIND" = container ]; then
    docker exec -e PGOPTIONS='-c default_transaction_read_only=on' "$SRC_CONTAINER" \
      pg_dump -U "$SRC_USER" -d "$SRC_DB" "${fmt[@]}" \
      --no-owner --no-privileges --no-comments -N pgbouncer \
      "${EXCLUDE_DATA[@]}" > "$DUMP.partial" \
      || die "pg_dump failed (above); $DUMP was not written"
  else
    docker run --rm --network host -e PGOPTIONS='-c default_transaction_read_only=on' \
      --entrypoint pg_dump "$PG_CLIENT_IMAGE" "$SRC_DSN" "${fmt[@]}" \
      --no-owner --no-privileges --no-comments -N pgbouncer \
      "${EXCLUDE_DATA[@]}" > "$DUMP.partial" \
      || die "pg_dump failed (above); $DUMP was not written"
  fi
  mv -f "$DUMP.partial" "$DUMP"
  note "$(du -h "$DUMP" | cut -f1) written (custom format, $DUMP_COMPRESS)"
}

phase_restore() {
  [ -s "$DUMP" ] || die "no dump at $DUMP — run the 'dump' phase first"
  local custom=0 toc
  # Every check that can refuse runs BEFORE the reset below: a restore that
  # dies half-way leaves an empty target, and inside the freeze that is the
  # expensive way to learn the archive was bad.
  if is_custom_archive; then
    custom=1
    say "check $DUMP end to end before the target is touched"
    toc="$(dst_pg_restore -l)" \
      || die "pg_restore (the target's own) cannot read $DUMP's table of contents — not an archive, or written by a newer pg_dump than the target's major. The target was not touched."
    note "$(printf '%s\n' "$toc" | sed -n 's/^;[[:space:]]*\(Dumped .*version: .*\)$/\1/p' | paste -sd ';' -)"
    note "target pg_restore: $(dst_pg_restore --version 2>/dev/null | head -1 || true)"
    # A truncated archive restores *partially* and silently: the TOC is
    # intact, the data behind it is not. Reading every data block to /dev/null
    # is the custom format's completion marker. 2-6 s on production's archive.
    dst_pg_restore -f /dev/null > /dev/null \
      || die "$DUMP does not read to the end — it is truncated or corrupt. Re-run \`dump\`. The target was not touched."
  else
    # A plain SQL script (DUMP=…sql): pg_dump ends every successful run with
    # this line, so its absence means the file is truncated.
    tail -n 5 "$DUMP" | grep -q 'PostgreSQL database dump complete' \
      || die "$DUMP does not end with pg_dump's completion marker — it is truncated. The target was not touched."
  fi
  say "reset $DST_CONTAINER/$DST_DB (only the schemas the dump recreates)"
  # Identical to run.sh. `drizzle` is drizzle-kit's own bookkeeping schema and
  # has to go, or the next `pull --init` refuses with "database already has
  # migrations set". Any other database in this container is untouched — which
  # matters here, because `cellar_test*` belongs to the vitest suites.
  # `cellar_meta` is the migration ledger: it must go with the schema it
  # describes, or `migrate` would trust a ledger older than the restored data.
  dst -q -c "DROP SCHEMA IF EXISTS admin, auth, cellar_meta, drizzle, hdb_catalog, storage CASCADE;" \
         -c "DROP SCHEMA IF EXISTS public CASCADE;" \
         -c "CREATE SCHEMA public;" > /dev/null
  if [ "$custom" = 1 ]; then
    say "pg_restore -j $RESTORE_JOBS"
    dst_pg_restore -h 127.0.0.1 -p 5432 -U "$DST_USER" -d "$DST_DB" -j "$RESTORE_JOBS" \
      --exit-on-error --no-owner --no-privileges \
      || die "pg_restore failed (above); the target is part-restored. Fix the cause and re-run from \`restore\` (it resets the target first)."
  else
    say "restore (plain SQL, one psql)"
    dst -q < "$DUMP" > /dev/null
  fi
  note "$(dst -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'") public relations restored"
}

phase_transform_a() { apply_range 00 08; }
phase_transform_b() { apply_range 09 13; }
# Open-ended on purpose: see "The three ranges" in the header. `17` must be the
# last numbered file applied — it indexes tables `06` and `13` create.
phase_transform_c() { apply_range 14 99; }

phase_files() {
  local pending rc=0
  pending="$(dst -At -c "SELECT count(*) FROM storage.files WHERE is_uploaded")"
  if [ "$FILES_MODE" = rows-only ]; then
    say "migrate-files.ts --rows-only: $pending uploaded row(s) in storage.files; NO objects"
    run_migrate_files --rows-only || die "files (rows-only): migrate-files.ts exited $? (above)"
    say "files rows: $(dst -At -c 'SELECT count(*) FROM files'), $(marked_rows) carrying metadata.$ROWS_ONLY_MARKER (no verified object)"
    note "objects NOT copied. A FILES_MODE=full \`cutover.sh files\` copies them; until it has, every image 404s."
    return
  fi
  say "migrate-files.ts (SOURCE_MODE=$SOURCE_MODE): $pending uploaded row(s) in storage.files"
  if [ "$pending" = "0" ]; then
    note "nothing to copy — the OBJECT path is not exercised by this run"
  fi
  # Exit codes are migrate-files.ts's own (its module doc). Every one of them
  # is safe to resume from: the script skips what it already verified.
  run_migrate_files || rc=$?
  case "$rc" in
    0) ;;
    1) die "files: some objects failed or did not match (listed above). Rerun \`cutover.sh all --from files\`: verified objects are skipped, the rest retried." ;;
    3) die "files: stopped — too many objects missing at the source (FILES_MAX_MISSING). Check SOURCE_STORAGE_URL names the project the dump came from, then rerun --from files." ;;
    4) die "files: the source refused the credentials (SOURCE_ADMIN_SECRET / SOURCE_S3_*). Fix them and rerun --from files." ;;
    *) die "files: migrate-files.ts exited $rc" ;;
  esac
  say "files rows: $(dst -At -c 'SELECT count(*) FROM files')"
  require_no_marked_rows "files"
}

# How many `files` rows still carry the rows-only marker: written by a
# rows-only run, their object never verified by a full one.
marked_rows() { dst -At -c "SELECT count(*) FROM files WHERE metadata ? '$ROWS_ONLY_MARKER'"; }

# A full run exits 0 with objects missing at the source (within
# FILES_MAX_MISSING). Without a rows-only run first, those have no row and
# `09`/`10`/`12` stop on any that is referenced; after one, they DO have a row
# — still marked — and nothing downstream would notice. This is what notices.
require_no_marked_rows() {
  local n
  n="$(marked_rows)" || die "$1: could not count rows carrying metadata.$ROWS_ONLY_MARKER"
  if [ "$n" != "0" ]; then
    die "$1: $n files row(s) still carry metadata.$ROWS_ONLY_MARKER — written by FILES_MODE=rows-only, their objects never verified. Rerun \`cutover.sh files\` (FILES_MODE=full; or \`all --from files\`). If the ids migrate-files.ts listed as 'unconfirmed' are also 'missing-at-source', no rerun will fix them: their bytes exist nowhere, and they must be resolved before any flip."
  fi
  note "no files row carries metadata.$ROWS_ONLY_MARKER: every row's object was verified"
}

phase_users() {
  say "migrate-users.ts (rows from $(redact "$ROWS_SOURCE_DSN"))"
  local before after
  before="$(dst -At -c 'SELECT count(*) FROM "user"')"
  SOURCE_DATABASE_URL="$ROWS_SOURCE_DSN" AUTH_DATABASE_URL="$TARGET_DSN" \
    node "$ROOT/services/actors/scripts/migrate-users.ts"
  after="$(dst -At -c 'SELECT count(*) FROM "user"')"
  say "\"user\" rows: $before -> $after"
  # X2 asked for before/after counts on `"user"` and `account`, and for the
  # `account_provider_account_key` collision behaviour against real OAuth rows.
  dst -c "SELECT (SELECT count(*) FROM auth.users)          AS source_auth_users,
                 (SELECT count(*) FROM \"user\")            AS target_user,
                 (SELECT count(*) FROM auth.user_providers) AS source_providers,
                 (SELECT count(*) FROM account WHERE provider_id <> 'credential') AS target_social,
                 (SELECT count(*) FROM account WHERE provider_id =  'credential') AS target_credential;"
  dst -c "SELECT provider_id, count(*) FROM account GROUP BY 1 ORDER BY 2 DESC;"
  # A source provider row that produced no account row is one the unique index
  # swallowed. This must be empty; if it is not, two Nhost identities collapsed
  # into one better-auth account and the second user lost their social login.
  dst -c "SELECT p.provider_id, count(*) AS source_rows_with_no_account
            FROM auth.user_providers p
           WHERE NOT EXISTS (SELECT 1 FROM account a
                              WHERE a.provider_id = p.provider_id
                                AND a.account_id  = p.provider_user_id)
           GROUP BY 1;"
}

# The migration ledger (packages/db/src/migrate/, `db:migrate`): adopt the
# freshly transformed database — record the baseline, re-apply the idempotent
# migrations (the old lane: `02` drops the four search functions and only they
# put them back), probe the ones the transform mirrors — then apply every
# migration after the transform horizon. It is the same command a developer's
# database and the test template take, so the production ledger starts
# complete and every later schema change reaches production the same way.
#
# It used to be `lane`: a grep for the "Hand-written SQL lane" marker, with
# every other migration trusted to have a hand-written mirror in transform/.
phase_migrate() {
  node "$ROOT/packages/db/src/migrate/cli.ts" --url "$TARGET_DSN"
}
# The old name, so a runbook line or a `--from lane` written before the ledger
# still does the right thing. `main` maps it before the phase list is built.
phase_lane() { phase_migrate; }

phase_baseline() {
  # THREE different questions, and only the second one is about the transform.
  #
  #   1. `drizzle-kit check`    — are the committed snapshots a consistent chain?
  #   2. pull + normalized diff — does the TRANSFORMED DATABASE match the
  #      committed `tables.ts`? This is the one E1 needs, and neither `check`
  #      nor `generate` answers it: both compare files to files and never open
  #      the database.
  #   3. `drizzle-kit generate` — does `tables.ts` match the latest snapshot?
  #      A diff here is repo drift that predates the cutover.
  local pulled before after new_dirs d pull_config pull_rc
  say "1/3 drizzle-kit check (snapshot chain)"
  ( cd "$ROOT/packages/db" && DATABASE_URL="$TARGET_DSN" bunx drizzle-kit check ) \
    2>&1 | tee "$WORK/baseline-check.txt"

  say "2/3 drizzle-kit pull against the transformed database, then diff"
  pulled="$WORK/pull"
  rm -rf "$pulled"; mkdir -p "$pulled"
  # A config of its own so the pull lands in the work area and cannot overwrite
  # the committed baseline. `out` is absolute, so it still writes to $WORK.
  #
  # The file itself has to live INSIDE packages/db, not in $WORK. drizzle-kit
  # imports the config, and the config's own `import ... from "drizzle-kit"`
  # resolves relative to the CONFIG's directory, not to the cwd — so a config in
  # $WORK (`${TMPDIR}/cellar-cutover` by default, outside the repo) dies with
  # `Cannot find module 'drizzle-kit'` and takes the phase down with it. That is
  # this phase aborting with the site already frozen, for a reason that has
  # nothing to do with the database. Measured under bun 1.4.2 / drizzle-kit rc.4;
  # `--url`/`--out` on the command line are not an escape, `pull` ignores them
  # and reports only `dialect` as provided.
  pull_config="$ROOT/packages/db/drizzle.pull.cutover.config.ts"
  cat > "$pull_config" <<'EOF'
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/tables.ts",
  out: process.env.PULL_OUT ?? "./migrations",
  schemaFilter: ["public"],
  extensionsFilters: ["postgis"],
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
EOF
  # `pull` is not read-only: it creates `drizzle.__drizzle_migrations` in the
  # target. Expected — the `restore` phase drops the `drizzle` schema.
  #
  # The exit status is captured rather than `||`-chained so the config can be
  # removed on both paths: `die` exits the shell, and a temporary config left in
  # `packages/db` is one `git add .` away from being committed.
  pull_rc=0
  ( cd "$ROOT/packages/db" \
    && PULL_OUT="$pulled" DATABASE_URL="$TARGET_DSN" \
       bunx drizzle-kit pull --config="$pull_config" ) \
    > "$WORK/baseline-pull.txt" 2>&1 || pull_rc=$?
  rm -f "$pull_config"
  [ "$pull_rc" -eq 0 ] || { cat "$WORK/baseline-pull.txt"; die "drizzle-kit pull failed"; }
  [ -f "$pulled/schema.ts" ] || die "pull produced no schema.ts (see $WORK/baseline-pull.txt)"
  # `sort-table-columns.awk` compares each table's column SET, not its physical
  # order: production's Nhost added `tier_lists.is_editing_locked` in a
  # different position from the local database the baseline was pulled from,
  # and this step failed on the 2026-09-28 production backup for that alone.
  # See the awk file's header.
  if ! diff -u \
        <(sed -f "$HERE/normalize-schema.sed" "$ROOT/packages/db/src/schema/tables.ts" \
            | awk -f "$HERE/sort-table-columns.awk") \
        <(sed -f "$HERE/normalize-schema.sed" "$pulled/schema.ts" \
            | awk -f "$HERE/sort-table-columns.awk") \
        > "$WORK/baseline-schema.diff"; then
    head -80 "$WORK/baseline-schema.diff"
    die "the transformed database does not match packages/db/src/schema/tables.ts (full diff: $WORK/baseline-schema.diff)"
  fi
  note "transformed database == Drizzle baseline (modulo the documented hand-edits)"

  say "3/3 drizzle-kit generate (tables.ts vs the latest snapshot)"
  before="$(ls "$ROOT/packages/db/migrations")"
  ( cd "$ROOT/packages/db" && DATABASE_URL="$TARGET_DSN" bunx drizzle-kit generate ) \
    2>&1 | tee "$WORK/baseline-generate.txt"
  after="$(ls "$ROOT/packages/db/migrations")"
  # `generate` WRITES a migration when it finds a diff, so the directory it did
  # or did not create is a more honest answer than parsing its stdout.
  # `comm` needs both sides sorted under its own collation. `ls` and `comm`
  # read the same locale, so they agreed — but only by coincidence, and the
  # `|| true` below would turn a GNU "not in sorted order" refusal into "no
  # drift". Pinned to C on both sides, like compare-rowcounts.sh.
  new_dirs="$(LC_ALL=C comm -13 <(printf '%s\n' "$before" | LC_ALL=C sort) \
                                <(printf '%s\n' "$after" | LC_ALL=C sort) || true)"
  if [ -n "$new_dirs" ]; then
    printf '%s\n' "$new_dirs" | while IFS= read -r d; do
      [ -n "$d" ] || continue
      say "SNAPSHOT DRIFT — generate wrote $d:"
      head -40 "$ROOT/packages/db/migrations/$d/migration.sql" 2>/dev/null
      rm -rf "$ROOT/packages/db/migrations/$d"
    done
    if [ "${ALLOW_SNAPSHOT_DRIFT:-0}" = "1" ]; then
      note "ALLOW_SNAPSHOT_DRIFT=1 — recorded above, not fatal"
    else
      die "packages/db/src/schema/tables.ts and the latest snapshot disagree. This is repo drift, not transform drift: the owning workstream must commit the migration \`drizzle-kit generate\` proposes. Re-run with ALLOW_SNAPSHOT_DRIFT=1 to continue."
    fi
  else
    note "snapshot chain matches tables.ts"
  fi
}

phase_smoke() {
  # First, and cheap: a files row still carrying the rows-only marker points
  # at bytes nobody verified. Under FILES_MODE=full that is a refusal; a
  # rows-only run (a rehearsal, or step 2 of the fallback) is told again.
  say "rows-only files rows (metadata.$ROWS_ONLY_MARKER)"
  if [ "$FILES_MODE" = full ]; then
    require_no_marked_rows "smoke"
  else
    say "FILES_MODE=rows-only: $(marked_rows) files row(s) have no verified object. Do not flip until a FILES_MODE=full \`cutover.sh files\` exits 0."
  fi
  say "smoke.sql"
  dst -f - < "$HERE/smoke.sql" 2>&1 | tee "$WORK/smoke.txt"
  # Read-only. Exit 3 is "pending", 1 a refusal (a changed migration, an
  # out-of-order one, a half-applied one) — either way the database is not the
  # schema this tree describes.
  say "migration ledger"
  node "$ROOT/packages/db/src/migrate/cli.ts" --url "$TARGET_DSN" --status \
    || die "db:migrate --status: the target's migration ledger does not match this tree (above)"
  say "target row-count snapshot -> $WORK/rowcounts-target.txt"
  dst -At -F'|' -f - < "$HERE/rowcounts.sql" > "$WORK/rowcounts-target.txt"
  if [ -s "$WORK/rowcounts-source.txt" ]; then
    say "row-count diff (source -> target); intentional drops are expected here"
    if [ -s "$WORK/rowcounts-source.from" ]; then
      note "source snapshot: $(cat "$WORK/rowcounts-source.from"), taken $(date -r "$WORK/rowcounts-source.txt" '+%F %T %Z')"
    fi
    diff <(sort "$WORK/rowcounts-source.txt") <(sort "$WORK/rowcounts-target.txt") \
      > "$WORK/rowcounts.diff" || true
    cat "$WORK/rowcounts.diff"
    say "SURVIVING tables whose count changed — these are the ones to explain"
    # Its own script, because `join` needs a field-1 sort under one pinned
    # collation and a whole-line `sort` failed every Linux host (its header).
    bash "$HERE/compare-rowcounts.sh" "$WORK/rowcounts-source.txt" "$WORK/rowcounts-target.txt"
    note "(nothing listed above = every surviving table kept every row)"
  else
    note "no source snapshot; run the 'preflight' phase to make one"
  fi
}

phase_report() {
  say "timings"
  awk -F'\t' '{ printf "  %-14s %6ds\n", $2, $3; total += $3 }
              END { printf "  %-14s %6ds\n", "TOTAL", total }' "$TIMINGS"
  note "artefacts in $WORK"
}

# ---------------------------------------------------------------- driver
# Space-separated, not an array: bash 3.2 (macOS) errors on an empty array
# under `set -u`, and this script has to run unattended.
ALL="preflight dump restore transform-a files transform-b users transform-c migrate baseline smoke report"

usage() {
  printf 'usage: %s {all|<phase>...} [--from <phase>]\n\nphases: %s\n' \
    "$(basename "$0")" "$ALL" >&2
  exit 2
}

main() {
  local phases="" from="" p seen trimmed started
  while [ $# -gt 0 ]; do
    case "$1" in
      --from) from="${2:-}"; shift 2 ;;
      -h|--help) usage ;;
      all) phases="$phases $ALL"; shift ;;
      -*) usage ;;
      *) phases="$phases $1"; shift ;;
    esac
  done
  [ -n "$phases" ] || usage

  # SKIP_FILES=1 left public.files empty, which `09`/`10`/`12` reject on any
  # real data (production has ~2,300 file references) — it only ever worked on
  # the schema-only dump. Refused by name rather than ignored, so a runbook
  # line that still says it fails before anything runs.
  if [ -n "${SKIP_FILES:-}" ] && [ "${SKIP_FILES}" != "0" ]; then
    die "SKIP_FILES is gone: an empty public.files makes 09/10/12 abort on real data. Use FILES_MODE=rows-only (the files rows, no objects — it works on the schema-only dump too), or unset it for the full copy."
  fi
  case "$FILES_MODE" in
    full|rows-only) ;;
    *) die "FILES_MODE must be full or rows-only, not '$FILES_MODE'" ;;
  esac

  # `lane` was renamed `migrate` when the ledger replaced it. Map the old name
  # rather than refuse it: `--from lane` from a runbook printed before the
  # rename must still resume at the right place.
  [ "$from" = "lane" ] && from=migrate
  local mapped=""
  for p in $phases; do
    if [ "$p" = lane ]; then mapped="$mapped migrate"; else mapped="$mapped $p"; fi
  done
  phases="$mapped"

  if [ -n "$from" ]; then
    seen=0; trimmed=""
    for p in $phases; do
      [ "$p" = "$from" ] && seen=1
      [ "$seen" = "1" ] && trimmed="$trimmed $p"
    done
    [ -n "$trimmed" ] || die "--from '$from' is not in the phase list"
    phases="$trimmed"
  fi

  for p in $phases; do
    declare -F "$(fn_for "$p")" > /dev/null || die "unknown phase '$p'"
  done

  # What this run will touch, decided from the phase list alone — so a resume
  # (`--from files`) needs no source variables, and a run that will need host
  # `node` or a TCP login finds out it cannot have one BEFORE phase 1, not
  # half-way through with the site frozen.
  local reads_source=0 needs_node=0 needs_tcp=0 runs_files=0 reads_rows=0
  RUN_USES_TARGET=0
  # Every host program a phase runs, as `tool:phase` pairs. Postgres's own
  # clients are NOT here: psql/pg_dump/pg_restore always run in a container.
  # `node` is not either — check_node below asks more of it than presence.
  local tools="" t missing=""
  for p in $phases; do
    case "$p" in
      preflight|dump|restore|transform-a|transform-b|transform-c|files|users)
        tools="$tools docker:$p" ;;
      # drizzle-kit, three times, through bunx; then a normalized diff.
      baseline) tools="$tools bunx:$p diff:$p comm:$p awk:$p sed:$p" ;;
      smoke)    tools="$tools docker:$p diff:$p join:$p sort:$p awk:$p" ;;
      report)   tools="$tools awk:$p" ;;
    esac
  done
  for t in $tools; do
    case "$missing" in *" ${t%%:*} ("*) continue ;; esac  # named once, first phase
    command -v "${t%%:*}" > /dev/null 2>&1 || missing="$missing ${t%%:*} (${t#*:})"
  done
  # Before anything else, the source and the target logins included: a host
  # without bunx used to get through preflight..smoke's checks and die at
  # `baseline`, phase 10 of 12, with the site frozen (2026-10-04, Loki).
  [ -z "$missing" ] \
    || die "missing on PATH, needed by this run:$missing. Install them (bunx comes with bun, packageManager's version) before any phase runs; nothing has run."
  for p in $phases; do
    case "$p" in
      preflight|dump) reads_source=1 ;;
      restore|transform-a|transform-b|transform-c) RUN_USES_TARGET=1 ;;
      files)    RUN_USES_TARGET=1; needs_tcp=1; runs_files=1; reads_rows=1
                if [ "$FILES_RUNNER" = host ]; then needs_node=1; fi ;;
      users)    RUN_USES_TARGET=1; needs_tcp=1; needs_node=1; reads_rows=1 ;;
      # db:migrate is host node + pg over TCP, in the phase and in smoke's
      # read-only ledger check alike.
      migrate|smoke) RUN_USES_TARGET=1; needs_tcp=1; needs_node=1 ;;
      baseline) RUN_USES_TARGET=1; needs_tcp=1 ;;
    esac
  done
  if [ "$reads_source" = "1" ]; then resolve_source; fi
  if [ "$needs_node" = "1" ]; then
    check_node || die "this run starts host \`node\` (users, migrate, smoke, or files under FILES_RUNNER=host); fix Node before any phase runs"
  fi
  if [ "$needs_tcp" = "1" ]; then
    check_target_tcp \
      || die "cannot log in to the target over TCP as $(redact "$TARGET_DSN"); files/users/migrate/baseline would fail there mid-run. Check DST_PASSWORD / DST_USER / DST_HOST_PORT (or TARGET_DSN)."
  fi
  # An overridden rows source is logged in to like the target is: `users` reads
  # it with host node, and a wrong one is otherwise found mid-freeze.
  if [ "$reads_rows" = "1" ] && [ "$ROWS_SOURCE_OVERRIDDEN" = "1" ] \
     && [ "$ROWS_SOURCE_DSN" != "$TARGET_DSN" ]; then
    check_dsn_tcp "$ROWS_SOURCE_DSN" \
      || die "cannot log in to ROWS_SOURCE_DSN over TCP as $(redact "$ROWS_SOURCE_DSN"); files/users read their rows there."
  fi
  # Everything `files` touches, before phase 1 rather than at phase 5 with the
  # site frozen: its configuration, then both databases and both buckets from
  # where it will run. `preflight` runs the same pair itself, with a softer
  # rule for "nothing answered" when it runs alone.
  if [ "$runs_files" = "1" ]; then
    check_files_config || die "the files phase is misconfigured (above); nothing has run"
    check_files_reach || die "the files phase cannot reach its databases/object stores (above); nothing has run"
  elif [ "$reads_rows" = "1" ]; then
    check_rows_source_config || die "the rows source is misconfigured (above); nothing has run"
  fi

  : > "$TIMINGS"
  started=$(date +%s)
  for p in $phases; do run_phase "$p"; done
  printf '\n%s##### cutover finished in %ss %s\n' "$c_bold" "$(( $(date +%s) - started ))" "$c_off"
}

main "$@"
