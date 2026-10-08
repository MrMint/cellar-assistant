# The cutover runbook (E1)

Takes a production Nhost dump to a database the new stack can serve, unattended,
in one command. Migration plan §6 E1; run by §6 E4 step 3.

```bash
# The source. There is NO default: preflight and dump refuse to run until
# exactly one of SRC_DSN / SRC_CONTAINER is named.
export SRC_DSN='postgres://…'             # the Nhost project (read-only use)
# The target's real password — infra/.env.prod's POSTGRES_PASSWORD on Loki.
# Read it from the file rather than typing it into shell history.
export DST_PASSWORD="$(sed -n 's/^POSTGRES_PASSWORD=//p' infra/.env.prod)"
export NODE_BIN=/path/to/node-24.14.0/bin  # only if `node` on PATH is not .nvmrc's
# Where `files` reads the objects: Nhost Cloud's Storage API. Both values are
# in the Nhost dashboard; neither has a default. Type the secret, don't paste
# it onto a command line (see "Reading the objects" below).
export SOURCE_MODE=storage-api
export SOURCE_STORAGE_URL=https://<subdomain>.storage.<region>.nhost.run/v1
read -rs SOURCE_ADMIN_SECRET && export SOURCE_ADMIN_SECRET
# Where `files` writes them: ALL FIVE, or the run refuses to start (the defaults
# are the local stack's MinIO). Plus TARGET_S3_USE_SSL=true for TLS.
export TARGET_S3_ENDPOINT=… TARGET_S3_PORT=… TARGET_S3_ACCESS_KEY=… TARGET_S3_SECRET_KEY=… TARGET_S3_BUCKET=…
export FILES_RUNNER=host                   # both stores are routable from the cutover host

scripts/cutover/cutover.sh preflight      # days before: read-only against the source,
                                          # then checks this host (Node, target login,
                                          # and the files path: both DBs, the storage
                                          # API + admin secret, the target bucket)
scripts/cutover/cutover.sh all            # the cutover itself
scripts/cutover/cutover.sh all --from files   # resume a part-finished run (no SRC_* needed)
# Recommended: copy the objects BEFORE the freeze, so the in-window `files` is
# mostly local skips — "Files: two modes, and the two-step cutover" below.

# A local rehearsal names a legacy Nhost Postgres you brought up yourself
# (`docker ps`). None exists on the dev machine since 2026-10-05; the schema
# path needs none (`DUMP=…/nhost-schema.sql`, packages/db/transform/README.md).
SRC_CONTAINER=<worktree>-postgres-1 scripts/cutover/cutover.sh all
```

**Six things that used to go wrong silently, and now stop the run before phase 1:**

- **The source.** `SRC_CONTAINER` used to default to `epic-burnell-4b4be9-postgres-1`
  and was checked *before* `SRC_DSN`, so `SRC_DSN=… cutover.sh preflight` read the
  local legacy database on the one Mac where that container exists — plausible
  output, wrong database. Now neither-set and both-set are refused, and every
  source phase prints which source it is reading (DSN redacted). `SRC_CONTAINER=""
  SRC_DSN=…`, the older documented form, still works.
- **The target password.** Every `dst()` call goes through `docker exec` and the
  container's local socket, which `pg_hba` trusts — so `restore` and `transform-a`
  succeed with *any* `DST_PASSWORD`, and the first TCP login (`files`, then
  `users`, `baseline`) is where a wrong one surfaces, mid-freeze. `preflight`, and
  any run that includes `files`/`users`/`baseline`, now log in over TCP with
  `TARGET_DSN` first, using the same driver and host `node` those phases use.
- **Node.** `users` (and `files` under `FILES_RUNNER=host`) run `migrate-*.ts`
  through Node's own type stripping. The run now checks the `node` it will use
  against `.nvmrc` — and that it is not Bun answering to `node` — before it starts.
- **The object stores.** `SOURCE_S3_*` / `TARGET_S3_*` default to the two *local*
  MinIOs, and nothing looked at them before `files` ran. (Under
  `SOURCE_MODE=storage-api` the source is not an S3 store and only the five
  `TARGET_S3_*` count; the storage API's own checks are in "Reading the objects".) Now a run that includes
  `files` (and `preflight`) refuses any of the ten that was left to its default
  unless the run is a declared rehearsal (`SRC_CONTAINER` set, or
  `CUTOVER_REHEARSAL=1` — the latter is how a rehearsal *resume* says so), refuses
  a local endpoint alongside a real `SRC_DSN` however it was spelled, and then
  **reaches everything `files` will reach, from where `files` will run**: logs in
  to its two databases and asks each store whether its bucket exists, reading
  nothing (`migrate-files.ts --preflight`). Under `FILES_RUNNER=docker` that is a throwaway container on
  `FILES_NETWORKS` using the `*_INTERNAL` DSNs — the compose-network `pg_hba`
  path the host-side TCP check cannot exercise. The docker runner also forwards
  `*_S3_USE_SSL` / `*_S3_REGION` now; it used to drop them, so a TLS endpoint
  spoke plain HTTP under `docker` only.
- **The rows source.** An overridden `ROWS_SOURCE_DSN` is announced and logged in
  to before phase 1, and under `FILES_RUNNER=docker` overriding it without
  `ROWS_SOURCE_DSN_INTERNAL` is refused: `files` would have read the target
  while `users` read the override.
- **The host's own programs.** Every program the selected phases run on the
  host — `docker` for anything that reads the source or `docker exec`s the
  target, `bunx` plus `diff`/`comm`/`awk`/`sed` for `baseline`, `join`/`sort`/
  `diff` for `smoke` — is looked up before anything else, the logins included,
  and the run names each missing one with the phase that needs it. Postgres's
  clients are not on that list: `psql`/`pg_dump`/`pg_restore` always run in a
  container. The Loki rehearsal (2026-10-04) found a host without `bunx` would
  have reached `baseline` — phase 10 of 12, inside the freeze — before dying.

A standalone `preflight` may run days ahead on a machine that is not the cutover
host; there, a target that does not answer at all is a **warning** ("NOT
CHECKED"), and preflight must be re-run on the cutover host before the freeze.
Everywhere else — a wrong password, a missing database, `pg` not installed, or no
answer in a run that goes on to use the target — it is fatal. The files path
follows the same rule: a wrong key or a missing bucket is fatal anywhere; nothing
answering is a warning only in a standalone preflight.

Files here:

| File | What it is |
|---|---|
| `cutover.sh` | The orchestrator. Twelve phases, each timed; `--from` resumes. `migrate` was called `lane`; the old name is still accepted, including by `--from`. |
| `preflight.sql` | Read-only questions for production. Nothing here writes. |
| `rowcounts.sql` | Exact `schema.table \| count` for every table, both sides. |
| `smoke.sql` | Post-transform assertions; every one `RAISE`s on failure. |
| `normalize-schema.sed` | Erases the documented `pull` hand-edits so a pulled schema and the committed baseline can be compared byte for byte. |
| `sort-table-columns.awk` | Sorts each table's column entries after `normalize-schema.sed`, so the comparison is of a table's columns, not their physical order (production's differs; see below). |
| `rehearse-files.sh` | Seeds a synthetic file corpus so a rehearsal exercises the object copy, which local data cannot. (`SOURCE_MODE=s3`: it seeds a scratch bucket in the stack's own MinIO. The storage-api path is exercised by `migrate-files.test.ts` / `migrate-files.live.test.ts` instead.) |
| `compare-rowcounts.sh` | `smoke`'s surviving-table comparison (`join` of the two row-count snapshots), on its own so it can be tested under GNU coreutils. Both inputs are sorted on field 1 under `LC_ALL=C`, and `join` runs under the same collation — see its header for why a whole-line `sort` failed every Linux host. |
| `test/host-guards.sh` | The three Loki findings, pinned: `SRC_DSN=… cutover.sh preflight` and `dump` with the **default** `PG_CLIENT_IMAGE` actually run psql/pg_dump and leave no container behind; `compare-rowcounts.sh` under GNU join (in a Debian container, so a Mac proves it too) with `public.outbox` beside `public.outbox_dead_letter_acks`; a PATH without `bunx` is refused before phase 1, naming it. Runs in stack-ci's services/actors leg beside `files-phase.sh`, same `CUT_TEST_PG_*` defaults. |
| `test/files-phase.sh` | The real `cutover.sh` on scratch databases and buckets: `files` in every mode (storage-api against a stub of hasura-storage, s3, rows-only, the docker runner), its refusals, and `dump`/`restore` of a custom-format archive including a truncated one. Asserts every case; runs in stack-ci's services/actors leg. Locally: `bun run stack:up`, then run it, or point `CUT_TEST_*` at another Postgres/MinIO pair (its header). |

## Files: two modes, and the two-step cutover

`09`, `10` and `12` repoint six foreign keys onto `public.files` and abort if
any referenced file has no row there. Production has **2,313 such references**
(2026-09-28 backup: `item_image` 648, onboarding front 608 / back 576,
`place_google_photos` 481), so "no files phase" is not an option on real data —
which is why `SKIP_FILES=1` is gone: it left `public.files` empty and only ever
worked on the schema-only dump. Setting it now stops the run before phase 1 with
a pointer here.

| `FILES_MODE` | Writes | Needs | Use it for |
|---|---|---|---|
| `full` (default) | every uploaded row **and** its object, verified; a row only after its object landed | the rows source, the files source (`SOURCE_MODE`), the target bucket | the cutover |
| `rows-only` | every uploaded row, **no object**; contacts no object store at all | the two databases only | a rehearsal on production data without its objects; the schema-only rehearsal; the in-freeze half of the fallback below |

A rows-only row promises less than a full one: it means "this file existed at
the source", not "these bytes are in the target". **Until a `full` run has
finished, every image 404s.** So every row it writes carries a marker,
`metadata.cutoverRowsOnly = true` (`ROWS_ONLY_MARKER` in
`services/actors/scripts/migrate-files-core.ts`), merged onto the source's own
`metadata` (NULL for all 2,331 production rows, 2026-09-28 backup; an array or
scalar there is refused rather than rewritten). Only rows-only writes it. A
later `full` run does **not** treat a marked row as a commit marker, even with
a same-size object behind it: it re-verifies that object locally against
Nhost's MD5 (a read of the target copy, no download), and copies it when there
is no usable MD5 or it does not match — then removes the marker (`rows …
confirmed=N`). So a row **without** the marker means "these bytes were
verified", whichever mode wrote it. A file whose object turns out to be missing
at the source keeps its row, **keeps its marker**, and is listed as
`missing_at_source` and `unconfirmed`; that run of `migrate-files.ts` still
exits 0 (as it does for a missing object with no row), so `cutover.sh`'s `files`
phase counts marked rows after a `full` run and **dies if any remain**, and
`smoke` under `FILES_MODE=full` refuses the same way (under `rows-only` it
prints the count instead). `verified_at` is set either way — not NULL — because
`MaintenanceActor`'s orphan reaper deletes old unreferenced rows whose
`verified_at` is NULL, and `FileActor` reads NULL as "upload not confirmed"; the
marker, not `verified_at`, says the bytes are unverified. `metadata` is
exposed by the GraphQL `File.metadata` field, so a client could see the key
between a rows-only run and the full run that clears it — a window that only
exists before the flip. Outside a declared rehearsal `rows-only` says all of
this on the terminal before phase 1.

**Budget the object copy at 10–15 minutes for production** — 2,331 objects,
4,639,679,178 bytes (4.32 GiB), mean ~2 MB, max 4.6 MB, all single-part MD5
ETags (2026-09-28 backup). The older "4–8 objects/second" figure was a *count*
estimate from 3.9 ms loopback objects; at ~2 MB each the bytes are no longer
negligible (4.3 GiB at 10 MB/s is 7.5 minutes before any per-request latency).
Neither figure has been measured against the real Nhost Storage API.

**Recommended: copy the objects before the freeze, then let the in-window run
skip them.**

1. **Days or hours before the freeze, site still live:** on the cutover host,
   with the production target and `FILES_MODE=full` (the default),
   `cutover.sh preflight dump restore transform-a files`. This copies every
   object uploaded so far into the production bucket (the 10–15 minutes) while
   nobody is waiting. The rows it writes are scratch: the in-window `restore`
   resets the database. The objects stay.
2. **In the freeze:** `cutover.sh all`, still `FILES_MODE=full`. `files` finds
   each object already in the bucket with no row, re-verifies it **locally**
   against the MD5 Nhost recorded (a read of the target copy, no download),
   gives it its row — counted `skipped_present` — and copies only what was
   uploaded since step 1. That is the "mostly skips" run. Its cost is reading
   4.3 GiB back from the local MinIO once, not fetching it over the internet.

**Fallback:** run step 2 as `FILES_MODE=rows-only cutover.sh all` (the rows in
milliseconds), then, still inside the freeze and before the flip, `cutover.sh
files` with `FILES_MODE=full`. `storage.files` survives the transform (`15`
leaves it), so that run still has its rows source. Do not flip until it has
exited 0 — it refuses while any row still carries the rows-only marker.
**This is no longer faster than step 2 as written.** It used to promise that
every object from step 1 was "a size check only — no read at all", because a
row plus a same-size object was trusted; that was the defect the marker fixes
(a stale or wrong object of the right size behind a rows-only row was skipped
unread). Every marked row's object is now re-verified by the same local MD5
read as step 2, so the fallback only moves the rows ahead of the transforms;
it does not shorten the object half.

## Reading the objects: `SOURCE_MODE`

`files` copies each uploaded `storage.files` row's object into the target MinIO
under **key = the file's id**, and only then inserts its `files` row. The *rows*
always come from `ROWS_SOURCE_DSN` (the restored dump); `SOURCE_MODE` picks where
the *bytes* come from:

| `SOURCE_MODE` | Reads | Use it for |
|---|---|---|
| `s3` (default) | `SOURCE_S3_*` — Nhost's object store over the S3 protocol | Local rehearsals: the legacy stack's MinIO has S3 keys. |
| `storage-api` | `GET <SOURCE_STORAGE_URL>/files/<id>` with `x-hasura-admin-secret: <SOURCE_ADMIN_SECRET>` | **Production.** Nhost Cloud hands a project no raw S3 credentials; its Storage API is the supported way to read an object. |

**What you must provide for production, in your own shell** (both from the Nhost
dashboard for the project being cut over; the script never defaults either):

- `SOURCE_STORAGE_URL` — the project's storage URL, ending in `/v1`:
  `https://<subdomain>.storage.<region>.nhost.run/v1`. The script refuses one
  without `/v1`, with credentials, a query or a fragment in it; and outside a
  declared rehearsal it refuses plain `http://` and any local-looking host
  (`localhost`, `127.*`, a host with no dot, `*.localhost`, the Nhost CLI's
  `local.*.nhost.run`).
- `SOURCE_ADMIN_SECRET` — the project's **admin secret** (Hasura's). Set it with
  `read -rs SOURCE_ADMIN_SECRET && export SOURCE_ADMIN_SECRET`, not on a command
  line or in a file in the repo. It is sent only as a request header, only to
  `SOURCE_STORAGE_URL`'s origin (a redirect is refused, not followed, because
  `fetch` would carry the header to the new host); the docker runner forwards it
  by *name*, so it never appears in `docker create`'s argv; every line
  `migrate-files.ts` prints goes through a redactor; and the script refuses to
  start if the secret is under 8 characters or appears inside a value it prints.

**What was verified, and against what.** The API's behaviour is read from
hasura-storage's own source, `nhost/nhost` tag `storage@0.15.0` (commit
`6a5f6c97`) — the version `nhost/nhost.toml` pins for this project — and cited
line by line in `services/actors/scripts/migrate-files-core.ts`'s module doc.
In short: `GET /files/{id}` streams the object (200; `Content-Length` is the
object's, `Etag` and `Content-Type` are the metadata's; presigned URLs are a
separate route, never a redirect); `HEAD /files/{id}` answers from metadata
alone; a wrong admin secret is **403** (Hasura `access-denied`); an unknown id is
**404**; `is_uploaded = false` is 403 "file is not uploaded"; and — the one that
matters most — **a row whose object is gone is a 500, not a 404**, so it is
retried and then counted `failed`, not `missing`. Nhost's documentation
(`docs.nhost.io`, Storage → File operations) shows the same route with a bearer
token; it does not document admin-secret downloads, which is why the source was
read instead.

**How a copy is accepted** (both modes — one engine): streamed, never buffered
whole (`TARGET_S3_PART_SIZE_MB`, default 16, bounds memory per upload), through
an MD5 + SHA-256 meter; the source's declared length, the bytes received and
`storage.files.size` must agree (`size-mismatch`); the MD5 must equal
`storage.files.etag` when that is a single-part ETag, which is all
hasura-storage writes (`hash-mismatch`); and what landed must match — by the
upload's own MD5 ETag, or by reading it back. A rejected object is removed from
the target, and its row is not inserted.

**Resuming.** The `files` row is the commit marker — a row *without*
`metadata.cutoverRowsOnly`. A rerun skips every id with such a row and an object
of the right size **without contacting the source** or reading the object; an
object with no row (a run killed between upload and insert, or a copy made
before `restore` reset the database), or behind a rows-only row that still
carries the marker, is re-verified *locally* against Nhost's MD5 and given its
row (or has its marker removed), and copied again only if that fails. So `cutover.sh all
--from files` after any interruption picks up where it stopped — and a copy run
days *before* the freeze turns the in-window run into local reads for
everything already copied.

**Concurrency and failure.** `FILES_CONCURRENCY` (8) objects at once. 429, 5xx,
dropped connections and bodies that stall for `FILES_STALL_TIMEOUT_MS` (60 s)
are retried with full-jitter exponential backoff (`FILES_RETRY_BASE_MS` 500,
`FILES_RETRY_MAX_MS` 30 000, `Retry-After` honoured) up to `FILES_MAX_ATTEMPTS`
(6). A **404 is reported and the run goes on**, up to `FILES_MAX_MISSING` (10):
past that it stops scheduling, because that many missing objects is what a
`SOURCE_STORAGE_URL` naming a different project looks like. A refused secret
stops it at once. A progress line prints every `FILES_PROGRESS_MS` (5 s), and the
summary counts `copied`, `skipped_present`, `missing_at_source`,
`size_mismatch`, `hash_mismatch`, `failed` and total bytes.

| `migrate-files.ts` exit | Meaning | `cutover.sh` |
|---|---|---|
| 0 | every row copied or already present; missing objects (≤ the threshold) listed, their rows not migrated | continues — `09`/`10`/`12` still abort, by name, if any *referenced* file is among the missing |
| 1 | something `failed` or mismatched | stops; rerun `--from files` |
| 3 | stopped at `FILES_MAX_MISSING` | stops; check `SOURCE_STORAGE_URL` |
| 4 | the source refused the credentials | stops; fix the secret/keys |

**Preflight reads no object bytes.** `migrate-files.ts --preflight` (what
`preflight`, and every run that includes `files`, calls) sends two `HEAD`s: one
for a random id — **404 proves the admin secret is accepted**, 403 that it is
not — and one for a real uploaded file, whose `200` and `Content-Length` must
match `storage.files.size`, proving the rows and the URL are the same project.
The real file comes from the source database in a `preflight` run, else from the
restored copy.

Tested: `services/actors/scripts/migrate-files.test.ts` (the engine against a
stub of the semantics above — 200/404/403/429-then-200/500/size and hash
mismatches/a stalled and a 12 MiB streamed body/a redirect/the concurrency
bound; rows-only and its marker, and a full run after it that re-copies a
same-size wrong object, re-verifies a right one without downloading it, clears
the marker, and reports a row it could not confirm; runs everywhere), `migrate-files.live.test.ts` (the CLI, into a real MinIO scratch
bucket and scratch databases: byte-identical, key = id, a 24 MiB multipart
upload, idempotent rerun, resume after `kill -9`, `--rows-only` with every
object-store variable made unusable and the marker on every row, then a full
run over a same-size stale object that ends byte-identical with no marker left, the secret absent from every captured
stdout/stderr; it skips without the stack's MinIO on 9100 unless
`FILES_S3_LIVE_REQUIRED=1`, which stack-ci sets), and `test/files-phase.sh`
(the same paths through `cutover.sh` itself). stack-ci's services/actors leg
starts MinIO for the last two. Not tested: a real Nhost Cloud project — see
"Still unverifiable locally", 3.

## The order, and why it is not `run.sh`

`packages/db/transform/run.sh` applies every numbered file straight through.
That is right for a schema-only dump and wrong for data, in two places:

```
01 … 08  →  migrate-files.ts  →  09 … 13  →  migrate-users.ts  →  14 … 99  →  db:migrate
```

`db:migrate` (the `migrate` phase, `packages/db/src/migrate/`) replaced the old
`lane` phase. It adopts the freshly transformed database onto the migration
ledger `cellar_meta.schema_migrations` — records the baseline, re-applies the
five idempotent ex-lane migrations, probes the five the frozen transform already
produces — and then applies every migration after the transform horizon. So the
production database leaves the cutover with a complete ledger, and every later
schema change reaches it by the same command; `smoke` checks `db:migrate
--status` reports nothing pending. `restore` drops `cellar_meta` with the other
schemas it resets.

- **Read the barcode NOTICE `db:migrate` prints.** `20260928185314_canonical_barcode_codes`
  rewrites every stored barcode to its canonical form (GTIN-14 for a retail code with a valid check
  digit; `docs/architecture/actor-keys.md`, "BarcodeActor") and merges codes that collapse together.
  It reports what it is about to do on one line, which `db:migrate` now prints (it did not print
  notices before):
  `NOTICE: canonical_barcode_codes: <n> barcodes rows; <n> to rewrite; <n> merged away into <n>
  surviving codes; <n> opaque (kept as stored); <n> item links to repoint`. On the 2026-09-28
  production-backup rehearsal it said **399 rows; 372 to rewrite; 0 merged; 27 opaque; 403 item
  links**, taking 62 ms. The CHECK added by the next migration took 4 ms. A non-zero *merged* count
  is expected to be small and needs no action: the merged row keeps the type of the most-linked
  spelling, and every item follows it. Nothing is dropped. What users will notice is that item
  pages now show barcodes as 14 digits (`00081240050376` where they saw `081240050376`).
- **`migrate-files.ts` between `08` and `09`.** `09`, `10` and `12` repoint six
  foreign keys from `storage.files` onto `public.files`. `ADD CONSTRAINT`
  validates, so on production rows it fails unless the file rows are already
  there. All three abort first with their own guard, naming the script.
  **Demonstrated, not assumed:** `rehearse-files.sh prove-order` plants one
  `item_image` row and runs `09` early; it aborts with
  `1 referenced file id(s) are missing from public.files`.
- **`migrate-users.ts` between `13` and `14`** (X2's note). `14` aborts if any
  `public.*` row references a user id not yet in `"user"`; `15` aborts if any
  `auth.users` row has no `"user"` row.

Both scripts are idempotent, so any phase can be re-run for free.

**Neither seed step runs.** `bun run db:seed` and `migrate-users.ts` both claim
`test@test.com` and the ids agree only because the seed pins them. A production
cutover runs neither `nhost up --apply-seeds` nor `bun run db:seed`. (Confirmed in
the rehearsal: run the cutover first and `db:seed` afterwards reports
`already-exists … id already` for both accounts, so the collision is real and
currently benign. It would not be benign against a production `test@test.com`.)

**Rows come from the restored copy, not from live Nhost.** `ROWS_SOURCE_DSN`
defaults to the target. The dump is the frozen truth of the freeze window;
reading users out of it cannot pick up a registration made after the dump, which
is the one thing that would make `14` or `15` abort mid-cutover. `auth` and
`storage` are both still standing at the points where they are read. Object
*bytes* still come from the real Nhost store — only the metadata is read locally.

**The Nhost database is never written to by this runbook.** Every source connection is opened
`default_transaction_read_only = on`, and the transform builds a new database
from a dump. This is what keeps `07`'s 173 constraint renames safe (no live
Hasura ever sees a renamed constraint) and E4's rollback — point Vercel back at
Nhost — available right up to the moment the frontend flips. Confirmed still
true: nothing in this runbook opens a writable connection to the source, and
`pg_dump` runs under the same read-only guard.

That is a claim about this script, not about the repository. **Nhost Cloud
redeploys production from `main`** — migrations, metadata and `functions/` — so a
merge of this branch to `main` would change the rollback target without this
script ever running. E4's runbook gates that before any merge; see
`docs/architecture/e4-decisions.md` decision 15.

## The baseline check is three questions, not one

`drizzle-kit check` and `drizzle-kit generate` **never open the database**; both
compare files to files. The check E1 actually needs is the middle one:

1. `drizzle-kit check` — are the committed snapshots a consistent chain?
2. `drizzle-kit pull` into the work area, then diff the generated schema against
   `packages/db/src/schema/tables.ts` through `normalize-schema.sed`, which
   erases exactly the four hand-edits `packages/db/README.md` documents
   (`custom-types` import, the three `customType` columns, `outbox.seq`'s
   `mode`, and the `gin_trgm_ops` opclass) and nothing else. An empty diff is
   the real statement that the transformed database *is* the Drizzle baseline.
   Both sides then go through `sort-table-columns.awk`, which sorts the column
   entries inside each `pgTable` block. `pull` emits columns in `attnum` order,
   and production's Nhost added one column in a different position from the
   local database `nhost-schema.sql` was dumped from: on the 2026-09-28
   production backup `tier_lists.is_editing_locked` is column 9 of 12, not 12,
   and that alone failed this step. Every column's definition, and everything
   outside the column block, is still compared exactly.
3. `drizzle-kit generate` — does `tables.ts` match the latest snapshot? A diff
   here is repo drift that predates the cutover; it fails the run unless
   `ALLOW_SNAPSHOT_DRIFT=1`.

## Environment

| Variable | Default | Notes |
|---|---|---|
| `SRC_DSN` | — (**no default**) | The Nhost project, reached with `PG_CLIENT_IMAGE`. Name exactly one of `SRC_DSN` / `SRC_CONTAINER` for `preflight` and `dump`; both or neither is refused. Other phases never read it. |
| `PG_CLIENT_IMAGE` | `nhost/postgres:18.4-20260610-1` | Where the `SRC_DSN` path's `psql` and `pg_dump` come from (`docker run --network host`). Its clients are 18.4; it must be **≥ the source server's major version** (production's Nhost is 18.4). Its ENTRYPOINT is `/bin/init.sh`, which ignores arguments and boots a server, so every run of it names the client with `--entrypoint` — without that, the 2026-10-04 Loki rehearsal started a Postgres server on the host network instead of psql (it died only because 5432 was taken). An override needs no particular entrypoint for the same reason. |
| `SRC_CONTAINER` | — (**no default**) | A local legacy container to `docker exec` into — rehearsals only. `SRC_USER` / `SRC_DB` (`postgres` / `local`) apply to this path only. |
| `DST_CONTAINER` / `DST_DB` | `cellar-stack-postgres-1` / `cellar` | `cellar_test*` is never touched. |
| `DST_USER` / `DST_PASSWORD` | `cellar` / `cellar` | The development defaults. On Loki, `infra/.env.prod`'s `POSTGRES_USER` / `POSTGRES_PASSWORD`. `dst()` never proves these (local socket, `trust`); the TCP check does. |
| `DST_HOST_PORT` | `5433` | Where the target is published on this host — `infra/.env.prod`'s `POSTGRES_PORT` on Loki. |
| `TARGET_DSN` | built from `DST_*` | What `files`/`users`/`baseline` log in with over TCP, and what the TCP check tests. Overrides `DST_USER`/`DST_PASSWORD`/`DST_HOST_PORT`/`DST_DB` for those phases. |
| `NODE_BIN` | this Mac's fnm path for 24.14.0 | Prepended to `PATH`. Whatever `node` results is checked against `.nvmrc` before a phase that runs host `node`. |
| `WORK` | `$TMPDIR/cellar-cutover` | Dump, logs, row counts, diffs, `timings.tsv`. **The dump holds every production row, including `admin.credentials`' private key (dropped from the target by `migrate`, not from the dump): delete `$WORK` once the 24-hour watch is over.** |
| `DUMP` | `$WORK/nhost-full.dump` | A `pg_dump -Fc` archive, restored with `pg_restore -j`. A plain SQL file (e.g. `packages/db/transform/nhost-schema.sql`) still restores, through one psql; `restore` tells them apart by the archive's `PGDMP` magic. |
| `DUMP_COMPRESS` | `lz4` | `pg_dump --compress`. See "Dump and restore". |
| `RESTORE_JOBS` | `8` | `pg_restore -j`: parallel workers, each one backend on the target. |
| `EXCLUDE_DATA` | `hdb_catalog.*` | `01` drops that schema whole. Add `auth.refresh_tokens` if production's is large. |
| `FILES_RUNNER` | `docker` | `host` in production, where both object stores are routable. |
| `SOURCE_MODE` | `s3` | `storage-api` reads the objects from Nhost's Storage API (production); `s3` from `SOURCE_S3_*` (rehearsals). See "Reading the objects". |
| `SOURCE_STORAGE_URL` | — (**no default**) | `storage-api` only. `https://<subdomain>.storage.<region>.nhost.run/v1`, from the Nhost dashboard. |
| `SOURCE_ADMIN_SECRET` | — (**no default**) | `storage-api` only. The project's admin secret, exported in the operator's shell (`read -rs`). Never printed, never in argv. |
| `SOURCE_S3_*` / `TARGET_S3_*` | the two local stacks | Addressed by **container name**: both compose projects call their store `minio`. **Set all ten for production under `SOURCE_MODE=s3`; the five `TARGET_S3_*` under `storage-api`** — the defaults are the local legacy MinIO and the local stack's. A run with `files` (and `preflight`) refuses a defaulted one outside a declared rehearsal, then checks the buckets exist with those keys, from the runner `files` uses. |
| `FILES_CONCURRENCY` / `FILES_MAX_ATTEMPTS` / `FILES_MAX_MISSING` | `8` / `6` / `10` | See "Reading the objects". Also `FILES_RETRY_BASE_MS`, `FILES_RETRY_MAX_MS`, `FILES_STALL_TIMEOUT_MS`, `FILES_HEADER_TIMEOUT_MS`, `FILES_PROGRESS_MS`, `TARGET_S3_PART_SIZE_MB`; all forwarded to the docker runner when set. |
| `*_S3_USE_SSL` / `*_S3_REGION` | `false` / `us-east-1` (`migrate-files.ts`'s own) | Forwarded to the docker runner when set. |
| `CUTOVER_REHEARSAL` | `0` | `1` declares a rehearsal, allowing the local object-store defaults. Implied by `SRC_CONTAINER`; needed for a rehearsal resume (`--from files`) that names no source. |
| `FILES_MODE` | `full` | `rows-only`: the `files` rows and no objects, each marked `metadata.cutoverRowsOnly` ("Files: two modes"). The schema-only rehearsal from the checked-in dump uses it too. Under `full`, `files` and `smoke` refuse while any row still carries that marker. |
| `SKIP_FILES` | — | **Refused.** Any value but `0` stops the run before phase 1: an empty `public.files` makes `09`/`10`/`12` abort on real data. Use `FILES_MODE=rows-only`. |
| `ROWS_SOURCE_DSN` | the target | See above. An override is announced and logged in to before phase 1. |
| `ROWS_SOURCE_DSN_INTERNAL` | `TARGET_DSN_INTERNAL` | The same database from the compose network, for `FILES_RUNNER=docker`. Overriding `ROWS_SOURCE_DSN` without this under the docker runner is refused. |
| `ALLOW_SNAPSHOT_DRIFT` | `0` | See the known drift below. |

## Dump and restore

`dump` writes a custom-format archive (`pg_dump -Fc --compress=lz4`) to
`$DUMP.partial` and renames it only when pg_dump exited 0. `restore` then, in
this order, **before it touches the target**: reads the archive's table of
contents with the target's own `pg_restore` (a newer pg_dump major, or a file
that is not an archive, fails here) and prints the versions it was dumped from
and by; and reads every data block to `/dev/null` — the custom format's
completion marker, since a truncated archive has an intact table of contents
and would otherwise restore *partially and silently* (the plain format's
`-- PostgreSQL database dump complete` line did this job before). Only then does
it reset the schemas and run `pg_restore -j $RESTORE_JOBS --exit-on-error`.
`pg_restore` runs in a throwaway container from the target's own image, in the
target's network namespace, with `$WORK` mounted read-only — so its version is
the target server's, and nothing is copied into the target container first.

Measured on the 2026-09-28 production backup (3.6 GB of plain SQL; `places`,
7.17M rows, is ~99% of it), same machine, same source, **alternating runs under
the same load** — the load average was 18–33 on 14 cores throughout, so the
absolute numbers are inflated and only the comparison is meaningful:

| | round 1 | round 2 |
|---|---|---|
| plain SQL through one psql (the old `restore`) | 190 s | 252 s |
| custom lz4, `docker cp` in + `pg_restore -j 8` | 145 s (17 s of it the copy) | 155 s (38 s) |
| custom lz4, sidecar mount + `pg_restore -j 8` (what `restore` does) | 131 s | 114 s |

Dump side: plain 20–70 s (load-dependent), `-Fc -Z0` 35 s / 3.6 GB,
`--compress=lz4` 36–38 s / 1.9 GB, `--compress=zstd` 25 s / 1.2 GB (its restore
was slower, 194 s, and was not repeated), gzip — pg_dump's default — the slow
one. The read-through check took 2–6 s. `places`' own COPY cannot be split
across workers; what `-j` buys is every other table, and every index build,
running beside it.

## Rehearsals

Two full runs against the local Nhost database as a stand-in dump source
(24 MB; `public` 10 MB, `hdb_catalog` 1.4 MB, `auth` 496 kB).

| Phase | Rehearsal 1 (no objects) | Rehearsal 2 (300 objects, 19 MiB) |
|---|---|---|
| preflight | 0s | 0s |
| dump | 1s | 0s |
| restore | 0s | 1s |
| transform-a (`01`–`08`) | 1s | 0s |
| files | 1s (0 rows) | 1s (300 rows, 300 objects) |
| transform-b (`09`–`13`) | 0s | 1s |
| users | 0s | 0s |
| transform-c (`14`–`99`) | 0s | 0s |
| lane (now `migrate`) | 1s | 0s |
| baseline | 2s | 3s |
| smoke | 0s | 0s |
| **total** | **6s** | **7s** (+2s seeding) |

Both ended with `SURVIVING tables whose count changed` empty: every table that
outlives the transform kept every row.

### From the production backup (2026-09-28)

The real Nhost backup (pg_dump custom archive, from 18.4) restored into a
stand-in source container, then `cutover.sh all` **unmodified** into a fresh
target database, on this Mac, loopback, no network. `FILES_MODE=rows-only`
because no object store holds production's objects locally; every other phase
ran for real. The first run (RehearsalDb) used `SKIP_FILES=1` plus a
hand-written rows stand-in and the plain-SQL restore; the second is this tree.

| Phase | 1st: `94050d51` + WIP, plain SQL | 2nd: `f398f8fd`, clean, custom + `-j 8` |
|---|---|---|
| preflight | 1 s | 2 s |
| dump | 20 s (3.4 GB plain) | 41 s (1.8 GB lz4) |
| restore | 248 s | 154 s (incl. the end-to-end read) |
| transform-a (`01`–`08`) | 1 s | 1 s |
| files | skipped + stand-in | 2 s — `rows-only`: 2,331 rows, 4,639,679,178 bytes, 0 objects |
| transform-b (`09`–`13`) | 0 s | 1 s |
| users | 1 s | 0 s — 20 users, 24 accounts |
| transform-c (`14`–`99`) | 3 s | 5 s |
| migrate | 1 s | 1 s — 19 applied, 6 adopted, 25 recorded |
| baseline | 2 s (failed first: column order, fixed `5d50e838`) | 4 s |
| smoke | 1 s | 1 s — §12: `admin.credentials` gone |
| **total** | **~280 s** + files | **212 s** |

The second run's load average was 24–30 on 14 cores (other agents' suites), so
its absolute times are inflated; the restore comparison under equal load is in
"Dump and restore". Both runs: every surviving table kept every row;
`canonical_barcode_codes` reported 399 rows / 372 rewritten / 0 merged / 27
opaque / 403 links. The second run's `smoke.txt` contains no `@`.

**Do not extrapolate the totals.** The local database is 24 MB and there is no
network between any two components. What the rehearsals do establish is the
*shape* of the cost:

- **`dump` and `restore` are linear in database size** and are the two phases
  that grow with the row count. Nothing else in the run reads a whole table
  except `04`'s enum retypes and `14`'s 31 constraint validations.
- **`files` is linear in the object *count*, not the byte count.** Measured
  when it was **strictly sequential**: **1500 objects copied in 5.9 s** against a
  loopback MinIO — 3.9 ms each, about four sequential round trips per object.
  At an internet RTT of 30–60 ms to a remote object store that was **4–8
  objects/second**: ~10k files ≈ 20–40 minutes, ~100k files ≈ 4–7 hours. It now
  runs `FILES_CONCURRENCY` (8) objects at once, which divides that by up to 8
  if the source does not throttle (a 429 is retried, and slows it) — **not
  re-measured against a remote source**, so budget from the sequential figure
  and treat the concurrency as margin. **Get the object count from preflight §6
  and budget the outage from it.** It can also run *before* the freeze for
  everything already uploaded: the in-window run then re-verifies those locally
  (a target read, not a download) and copies only the delta. For production's
  actual 2,331 objects / 4.3 GiB, see "Files: two modes": bytes matter at ~2 MB
  per object, and the budget is 10–15 minutes.
- **`baseline` is a fixed ~2–3 s** (two drizzle-kit passes over 68 tables).

### On Loki, the production host (2026-10-04)

The first rehearsal on Linux, on the host the cutover will run on. **These
numbers are from the Loki rehearsal report, not re-measured here:** total
**~486 s on 4 cores**; `restore` **381 s**, `dump` **57 s**; the full
storage-api `files` copy **251 s** for **2,331 objects / 4.3 GiB** (~17 MiB/s),
`confirmed=2331 unconfirmed=0`, `missing_at_source 0`; a rerun of `files`
**1 s**. The Mac's 2026-09-28 run (14 cores, under load) restored in 154 s;
Loki took 381 s for the same phase, so budget the window from Loki's figures,
not the Mac's.

It also found three bugs that no macOS run could have, all fixed and pinned by
`test/host-guards.sh`:

- **`PG_CLIENT_IMAGE` ran a server, not psql.** Its entrypoint ignores
  arguments (see "Environment"); both `SRC_DSN` paths now pass `--entrypoint`.
- **`smoke` exited 1 on every Linux host.** A whole-line `sort` fed `join`,
  and GNU join refuses `public.outbox` after `public.outbox_dead_letter_acks`
  ("is not sorted"); BSD join passes silently. Now `compare-rowcounts.sh`.
- **A missing `bunx` surfaced at phase 10.** Now checked before phase 1, with
  every other host program the selected phases need.

### Verified in the rehearsals

- End-to-end unattended, exit 0, twice.
- **Row counts:** every surviving table identical source → target. The only
  differences are intentional: 12 reference tables converted to enums, 2 bespoke
  job tables and 4 phantom result tables dropped, `auth.*` gone, and `files` /
  `jobs` / `outbox` / `user` / `session` / `account` / `verification` / `jwks`
  new.
- **Object keys preserved exactly.** 300 rows, `key <> id::text` count 0, and an
  independent SHA-256 check of 50 sampled objects: all byte-identical between
  source and target buckets.
- **Idempotency:** re-running `files` reports `copied=0 already_present=300`
  (the counter is now spelled `skipped_present`);
  re-running `users` reports `changed 0`; re-running `01`–`16` and the lane on an
  already-transformed database is a no-op, and `baseline` + `smoke` still pass
  afterwards.
- **Ordering guards fire.** `09` aborts when the file rows are missing.
- **31 foreign keys** repointed onto `"user"`, renamed as they moved; 33 total
  foreign keys into `"user"` afterwards (the 31 plus `session` and `account`),
  matching X2.
- **No foreign key leaves `public`,** so `schemaFilter: ["public"]` is correct.

### Fixed while rehearsing

`08_item_favorites_missing_uniques.sql` was **not re-runnable** — its two
`ALTER TABLE … ADD CONSTRAINT` statements have no `IF NOT EXISTS` form, so a
second pass died with `relation "item_favorites_user_id_sake_id_key" already
exists`. That contradicted the lane's own "applying a second time is a no-op"
contract and turned `--from transform-a` into "restore from the dump again".
Both statements are now guarded on `pg_constraint`.

## Pre-cutover checks — the local answers, and what production must still be asked

`cutover.sh preflight` answers all of these. Local answers below are from the
Nhost development database, which has **two users, no social logins, no files
and no places**, so most of them are structurally valid and evidentially empty.

| Check | Local answer | Still to ask production |
|---|---|---|
| `email_verified = false` | **0 of 2** | The real count, for the record; it gates nothing. Those users **cannot OAuth-link** after cutover: A6 kept `requireLocalEmailVerified: true` with no trusted providers, which is correct — relaxing either enables pre-registration account hijacking. There is no policy to decide at any count: Nhost refuses them sign-in altogether today, so the cutover *gives* them password sign-in (`docs/architecture/e4-decisions.md` decision 2). |
| `auth.user_providers` inventory | **0 rows** | Which provider ids exist. better-auth is configured with `google`, `facebook`, `discord` only (`services/actors/src/auth/auth.ts`). `windowslive` / `azuread` rows migrate and are counted, but those users cannot OAuth in until a provider is configured. Social migration is proven only against a synthetic source. |
| `"user"` / `account` before-and-after | 0 → 2 users, 0 → 2 accounts (both `credential`) | Same counts against real volume. |
| `account_provider_account_key` collisions | not exercised (no social rows) | `2b` counts duplicate `(provider_id, provider_user_id)` in the source, and the `users` phase reports **source provider rows that produced no `account` row** — which is exactly what the unique index swallowing a collision looks like. Must be zero. |
| File migration at volume | 0 real objects; **1500 synthetic objects proven** (S3 mode); the storage-api mode proven against a stub of hasura-storage 0.15.0's semantics | **Answered from the 2026-09-28 backup:** 2,331 uploaded, 4,639,679,178 bytes, all single-part MD5 ETags, 2,313 references. Still to do: one real Nhost Cloud → MinIO copy under `SOURCE_MODE=storage-api` — `cutover.sh preflight` with the real `SOURCE_STORAGE_URL` + `SOURCE_ADMIN_SECRET` proves reach, secret and project (HEADs only); step 1 of the two-step cutover proves the rest. |
| `lc_monetary` for `05` | **`C`** locally — note the transform README says `en_US.utf8`; it is not | Production's setting. `C` and `en_US.UTF-8` are both exact. `lossy_casts` was 0, but on 0 priced rows. |
| Enum drift (`04`) | **none** — all 12 types and 13 columns cast | The same query against production rows. (The plan and the transform README both said "fourteen columns"; the spec in `04` has **13** — `permission_type` covers two of them. Both are corrected now.) |
| Tea countries with no `country` row (`18`, preflight **4b**) | **none** — 0 tea rows in the local Nhost database (`18`'s header, 2026-09-19) | Must be empty. `18` adds `teas.country → country(value)` and validates it in `transform-c`, **during the freeze**; one production tea whose country is not a `country.value` (`'Japan'` vs `'JAPAN'`, the shape `11` found on sakes) aborts the phase. A row here is a data decision for daylight — map it to the value `case_insensitive_match` suggests, or null it — not a schema change. Added in `dd8c4649`. |
| Duplicate sake/tea favourites (`08`) | **none** | If production trips this, `08` aborts by design. That is a decision point, not a bug: a duplicate favourite is meaningless data but it is still the user's, and deleting rows silently during a cutover is how data loss goes unnoticed. Decide it in daylight, before the freeze. |
| `admin.credentials` (§9) | **0 rows**, columns `id text`, `credentials jsonb` | **Answered from the 2026-09-28 backup: 1 row** — `google_gcp_service_account`, a whole GCP service-account JSON with its `private_key`. Migration `20260928194604_drop_admin_credentials` drops the table (and the then-empty `admin` schema) in `migrate`, before the flip; `smoke` §12 fails if it survives. **The key must still be rotated in GCP**: it is in every Nhost backup and in this runbook's `$WORK` dump. |
| Constraint-name budget | no derived `…_user_id_fkey` over 63 bytes; **31** FKs into `auth.users` | A different count means an Nhost migration added or removed one. `14` handles it generically, but say so in the PR. |
| `item_onboardings.status` (3c) | 13 rows, all `COMPLETED` | The full distribution. Anything outside `START`/`COMPLETED`/`CONFIRMED`/`FAILED` is a value a CHECK would reject. |
| `item_reviews.text` (3d) | 3 rows, 1 non-null, `json_typeof` = **`string`**, **0** would change under `jsonb` | The same, at volume. Note the column holds a JSON *string*, not an object — matching `packages/contracts/src/onboarding.ts`'s note that it crosses the wire as a JSON string. |

## Decisions E1 owns

**`friend_request_status = 'ACCEPTED'` survives.** Nothing writes it any more —
B6 deletes the request on acceptance, matching today's behaviour — but removing
an enum label is not a catalog-only change: Postgres has no `DROP VALUE`, so it
means recreating the type and retyping `friend_requests.status`, a table rewrite
during the outage window, plus coordinated edits in `04`, the Pothos enum and
gql.tada. The payoff is one unreachable label. It also **cannot** be removed if
any historical row still holds it, which is why preflight `3b` counts them. Keep
the label; revisit only if the count is 0 and someone wants the tidy-up for its
own sake.

**`item_reviews.text` stays `json`, and `item_onboardings.status` stays
unconstrained — recorded, not tightened.** Both are B2 findings and both are
real, but the fix belongs to B2, not here:

- A `CHECK` constraint and a column type are both **introspected into
  `tables.ts`**, so tightening either changes the Drizzle baseline. §7 reserves
  baseline changes to the B/C/A7 workstreams, and E1 changing the schema *and*
  being the workstream that validates it is the wrong arrangement.
- The allowed status set is `ItemOnboardingActor`'s contract
  (`ONBOARDING_STATUSES`: `START`, `COMPLETED`, `CONFIRMED`, `FAILED`), not
  E1's, and a constraint is only as good as that list.
- `json` → `jsonb` normalises whitespace, drops duplicate keys and loses key
  order, and rewrites the table. Nothing indexes the column and Drizzle hands
  back a parsed value either way, so the change buys storage and indexing
  headroom, not behaviour.

Preflight `3c` and `3d` therefore produce the evidence B2 needs: the distinct
`status` values production actually holds, and the count of `item_reviews.text`
values that would change under `jsonb` normalisation. With both at hand it is a
one-file change in the transform plus a re-pull, in the workstream that owns it.

**The `updated_at` triggers now share one function.** B6 asked whether the
`update_updated_at_column()` triggers should live alongside
`set_current_timestamp_updated_at`. Measured against the transformed database:
there were **eight** distinct functions of this shape
(`set_current_timestamp_updated_at`, `trigger_set_updated_at`,
`update_updated_at_column`, `update_item_image_updated_at` and four
`update_*_vectors_updated_at`), every one of them byte-identical —
`NEW.updated_at = now(); RETURN NEW;` — every trigger `BEFORE UPDATE`, and
**no table carrying more than one**. This file used to conclude "keep them";
that was superseded on 2026-09-28, because eight names for one behaviour had
already misled `ItemActor` into stamping sakes and teas by hand.
`packages/db/migrations/20260928181546_one_updated_at_trigger_function`
re-points the nine outliers at `set_current_timestamp_updated_at` (same trigger
names, same timing) and drops the other seven functions — nine statements in
`migrate`, not 32 during the window. The property B6 cared about —
`updated_at` is server-authoritative and an `UPDATE` cannot move it backwards —
holds on all 31 tables, and `services/actors/src/lib/updated-at-triggers.test.ts`
now proves each trigger fires and names the nine `updated_at` tables that are
stamped by their writer instead.

**The `storage` schema survives the cutover; `admin.credentials` does not.**
`15` deliberately leaves `storage` standing: it is the only remaining copy of
Nhost's file metadata until the migration has been verified against production
rows, and nothing in `public` references it; drop it in a follow-up after E4's
24-hour watch. This paragraph used to keep `admin.credentials` too, "once
preflight §7 has shown it empty in production". Production's is not empty: it
holds a live GCP service-account private key (above), and nothing in the new
stack reads it — X1 moved GCP credentials into the environment, and the only
mentions under `services/` and `packages/` are comments saying it is not
ported. So migration `20260928194604_drop_admin_credentials` drops it during
`migrate`, before the database serves anything. A migration, not a transform
edit: the transform is frozen at `TRANSFORM_HORIZON` (e4-decisions.md decision
16), and every database takes the same migration (`IF EXISTS`: most have no
`admin` at all).

## Two things that used to abort the `baseline` phase mid-freeze

Both are fixed; both are recorded because the failure mode is the same and it is
the worst one this runbook has — the site is already frozen when `baseline` runs,
and `die` leaves it that way.

1. **Indexes the source might not have had** (E4 decision 1). `baseline`'s step
   2 is `drizzle-kit pull` diffed against `tables.ts`, so a source missing any of
   A1's five indexes produced a non-empty diff. Only one of the five was
   recreated by the transform. `packages/db/transform/17_target_indexes.sql` now
   creates every index `tables.ts` declares on a transform-built table,
   idempotently (145 when this was fixed; `13bcca04` added two, and the one on
   the lane-created `outbox_dead_letter_acks` comes from its own migration) —
   see that directory's README for the measurement and the freeze-window build
   times. `transform-c`'s range is `14`–`99` so a new numbered file cannot be
   silently skipped here while `run.sh`, which globs, applies it.

2. **The pull config lived outside the repo.** `baseline` wrote
   `drizzle.pull.config.ts` into `$WORK` (`${TMPDIR}/cellar-cutover`), and
   drizzle-kit resolves the config's own `import ... from "drizzle-kit"` relative
   to the *config's* directory — so it failed with `Cannot find module
   'drizzle-kit'`, for a reason with nothing to do with the database. It is now
   written into `packages/db` and removed on both the success and failure paths,
   with `out` still absolute into `$WORK` so a pull can never overwrite the
   committed baseline. Passing `--url`/`--out` on the command line instead is not
   an option: `drizzle-kit pull` rc.4 ignores them and reports only `dialect` as
   provided.

## Known drift — fixed; do not set `ALLOW_SNAPSHOT_DRIFT=1` for it

This section used to say that `drizzle-kit generate` proposes one migration
against the repo:

```sql
ALTER TABLE "place_menu_items" DROP CONSTRAINT "place_menu_items_detected_item_type_check",
  ADD CONSTRAINT "place_menu_items_detected_item_type_check" CHECK (detected_item_type = ANY (ARRAY[…8 values…]));
```

and that the cutover therefore needed `ALLOW_SNAPSHOT_DRIFT=1`. `tables.ts`,
`16_widen_menu_item_detected_type.sql` and the database carried the
**eight**-value form while the then-latest snapshot
(`packages/db/migrations/20260910003756_.../snapshot.json`) carried the
**five**-value one, because B8b widened the constraint without recording a
snapshot. That snapshot has since been recorded:
`packages/db/migrations/20260910040517_b8b_widen_menu_item_type`, already
present at `4e067928`, carries the eight values, and so does every later
snapshot (migration plan §6, E1's outcome, records the fix). It was repo drift,
not transform drift — phase 2 of the baseline check passed throughout.

The flag is not a targeted waiver. It makes step 3 of the baseline check
non-fatal for *every* drift, so setting it on this section's old advice would
hide whatever drift is actually there on the day.

## Still unverifiable locally

The real output of a rehearsal is the list of things it could not prove.

1. **Anything about volume.** 2 users, 1 item, 2 cellars, 0 places, 0 files, 0
   menu prices. `04`'s enum retypes, `08`'s unique-index builds, `14`'s 31
   constraint validations and `05`'s `money` rewrite have all run against
   essentially empty tables. `04` also **drops and re-adds** the generated
   `item_favorites.type` column, which rewrites that table; on a large one that
   is not free.
2. **Social login migration.** Zero `auth.user_providers` rows here. The code
   path, the derived-id scheme and the `ON CONFLICT (provider_id, account_id)`
   behaviour are proven only against synthetic input.
3. **The real object-store pair.** The 1500-object copy ran MinIO → MinIO on
   loopback, and Nhost Cloud offers no raw S3 credentials to repeat it against
   production — so production uses `SOURCE_MODE=storage-api` (Nhost's Storage
   API + the admin secret; "Reading the objects"). That mode is proven against a
   stub implementing hasura-storage `storage@0.15.0`'s route, status codes and
   headers *as read from its source*, and into a real MinIO — **not against a
   real Nhost Cloud project**. Still untested: its latency and rate limits
   (a 429 is handled, its frequency is unknown), whether a CDN in front of it
   changes any header, and whether it serves any object as a 500 (a row whose
   object is gone). `cutover.sh preflight` with the production URL and secret
   answers the first question cheaply (metadata-only HEADs); a `files` run
   before the freeze, into the production MinIO, answers the rest and makes
   the in-window run mostly local. A8 established `key = id` by reading
   `nhost/nhost`'s storage service source, not by reading a production object;
   the storage API addresses files by that same id.
4. **`lc_monetary` and price fidelity.** 0 priced rows locally, so `05`'s cast
   has never converted a value.
5. **Enum drift and the `08` abort** are proven as *mechanisms* and never as
   *outcomes*: no production value has ever been offered to either.
6. **The dump itself.** A local `docker exec pg_dump` is not a Nhost-cloud dump.
   Network interruption, a `pg_dump` version older than the server, and
   role/extension differences are all untested. What guards a truncated file is
   `restore`'s end-to-end read of the archive before the target is reset
   ("Dump and restore"); `test/files-phase.sh` truncates one and checks the
   target is untouched.
7. **`item_onboardings.status` and `item_reviews.text` distributions** — the
   evidence B2 needs is a query away, but only against production.
8. **Behaviour.** This runbook proves the database's *shape*. That it *serves*
   is E2's Playwright suite — run against the **rehearsal** database, before the
   freeze, and never against production: it signs in as the seeded test
   accounts and writes data (`docs/architecture/e4-decisions.md` decision 13).
   On the production database E4 step 5 runs `cutover.sh smoke`,
   `deploy-loki.md §5`'s off-LAN checks, and one manual sign-in as a real account.
