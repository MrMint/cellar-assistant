# Backup and restore

**Status:** written by E3b, 2026-09-10. The mechanism below has been run for
real against this repo's own dev stack (§5 has the numbers); the nightly
schedule itself has not been installed anywhere — see §4.
**Audience:** whoever is on call when Loki's disk dies, or running the monthly
drill.

Two independent stores, two independent backups: `cellar` (Postgres — every
table in `packages/db/src/schema`, plus better-auth's five since X2) and the
`cellar-files` MinIO bucket (uploaded images — label photos, recipe photos).
Nothing else on Loki holds data that isn't reconstructible: the Dapr Scheduler
volume (`scheduler-data`) holds only in-flight reminders, and the actor state
store is `state.in-memory` by design (target-stack.md §6.4) — Postgres is the
only truth either of those ever points back to.

**The observability volume, `otel-lgtm-data`, is NOT backed up — deliberately.**
Since 2026-09-27 it holds everything `otel-lgtm` stores (Loki, Prometheus, Tempo,
Pyroscope and Grafana's database; `deploy-loki.md` §9.3), and nothing in
`scripts/backup/` touches it. What it holds is either reconstructible or
disposable:

- **Configuration is not in it.** Dashboards, alert rules, contact points,
  notification policies and data sources are provisioned from
  `infra/grafana/provisioning/` on every start, so a lost volume comes back with
  all of them.
- **Telemetry is short-lived by design** — 30 days of logs and metrics, 14 of
  traces — and is evidence about the system, not data of the product. The
  durable record of every outbox failure is the `outbox` table in Postgres,
  which *is* backed up.
- **Grafana's own state** — alert history, silences, annotations — is the one
  thing a restore would bring back and a rebuild cannot. It is small and
  low-stakes: an active silence is re-created in a minute.

What losing it costs, so nobody is surprised: telemetry history; alert state and
silences; the admin password as last rotated (a new database seeds from
`GRAFANA_ADMIN_PASSWORD` in `infra/.env.prod`, which is why §9.2 of
`deploy-loki.md` says to keep the two in step); and one spurious page from the
dead-letter reporter's dead-man's switch about five minutes after the empty
Loki starts, resolving at the next hourly report.

A copy taken with the container running would not be a consistent one
(Prometheus' TSDB, Loki's WAL and Grafana's SQLite are all mid-write); the
consistent way is the one used to migrate it — stop, `docker cp <container>:/data -`,
start (`deploy-loki.md` §9.3). If that trade ever changes, that is the command
to schedule.

---

## 1. What runs, when, where it lands

| | Postgres | MinIO |
|---|---|---|
| Script | `scripts/backup/pg-backup.sh` | `scripts/backup/minio-backup.sh` |
| What | `pg_dump -Fc` of the whole database | `mc mirror` of `cellar-files` |
| Where | `$BACKUP_ROOT` (default `~/cellar-assistant-backups/postgres`) | `$BACKUP_ROOT` (default `~/cellar-assistant-backups/minio`) |
| Shape | One file per run: `cellar-<UTC timestamp>.dump` + `.sha256` | One directory per run: `<UTC timestamp>/`, mirrored objects inside |
| Retention | `$RETENTION_DAYS`, default 14 | `$RETENTION_DAYS`, default 14 |
| Self-check | `pg_restore --list` must find at least one `TABLE DATA` entry, or the run fails before publishing the file | none beyond `mc mirror`'s own transfer errors |

**On Loki specifically:** `infra/docker-compose.prod.yml` publishes Postgres
and MinIO's S3 port on `127.0.0.1` — its own comment on the `postgres`
service says why: *"The backup job (`scripts/backup/`) and any psql session
run on this host; nothing off-box has any business here."* That is the
intended shape — a host-native `pg_dump`/`mc` over loopback, not a container
reaching across the compose network. Set `PG_CONTAINER=""` (pg-backup.sh /
pg-restore.sh) and `MC_MODE=host` (minio-backup.sh / minio-restore.sh) for
that path once `pg_dump`, `pg_restore` and `mc` are installed on Loki itself.

**`$BACKUP_ROOT`'s default is not "off-box."** It is *this host's* home
directory — a different volume from the Docker data directory in the common
case, which already survives `docker compose down` or a container crash, but
not a disk failure. Point `BACKUP_ROOT` at a second physical disk or a mounted
network share for real off-box protection: `BACKUP_ROOT=/mnt/backup-disk/...`.
Neither script uploads anywhere on its own — pairing the nightly run with an
`rclone`/`rsync` step to remote storage is the natural next hardening and is
not done here (no off-box target exists to test against from this
environment).

---

## 2. Restore — the drill and the real thing

Same two scripts either way; the drill differs only in the name you give the
target.

### Postgres

```bash
scripts/backup/pg-restore.sh --dump ~/cellar-assistant-backups/postgres/cellar-20260910T220519Z.dump \
  --target-db cellar_restore_drill
```

- `--target-db` **must** start with `cellar_restore_` — enforced by the
  script before anything destructive happens, the same shape as
  `packages/db/transform/test-db.sh`'s own `cellar_test*` guard. `cellar` and
  `cellar_test`/`cellar_test_template` cannot be named here even by typo.
- Pass `--drop-existing` to rebuild a target that already exists (the drill,
  run again a month later, reuses the same name).
- The restore happens **inside the same running Postgres server** the backup
  was taken from — a new database, not a new container. This is deliberate,
  not a shortcut: `infra/postgres`'s image already has postgis, pgvector,
  pg_trgm and pgcrypto installed, so the dump's own `CREATE EXTENSION`
  statements succeed with nothing extra to configure. A restore drill that
  spun up a bare `postgres:18` container to prove independence would instead
  spend its first minutes failing on `could not open extension control file
  "postgis.control"` — a lesson from CI's own attempt at this
  (`.github/workflows/stack-ci.yaml`'s "Build the actors test database" step
  names the same gap).
- Row counts, for comparing source against restored:
  ```bash
  scripts/backup/pg-restore.sh --target-db cellar_restore_drill --row-counts
  ```
- Tear down when done: `DROP DATABASE cellar_restore_drill` (or
  `--drop-existing` on the next run).

### MinIO

```bash
scripts/backup/minio-restore.sh \
  --source ~/cellar-assistant-backups/minio/20260910T220657Z \
  --target-bucket cellar-files-restore-drill
```

- `--target-bucket` **must** start with `cellar-files-restore-`, same
  reasoning as the database guard. The script creates the bucket; it never
  restores into one that already exists (`cellar-files` included).
- Tear down: the script prints the exact `mc rb --force` command for the
  bucket it just created.

---

## 3. What a real recovery looks like

1. Identify the most recent dump/snapshot under `$BACKUP_ROOT` (or the
   off-box mirror, once one exists).
2. Stop the app containers so nothing writes to the database mid-restore:
   `docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml \
   --env-file infra/.env.prod stop actors api`. Postgres and MinIO stay up —
   the restore scripts connect to them directly.
3. **Do not restore into `cellar` in place.** Restore into a freshly named
   database (anything starting with `cellar_restore_` — for a real incident,
   name it for what it is, e.g. `cellar_restore_20260910_incident`), verify
   row counts look sane for the incident (compare against the last known-good
   drill numbers in §5, or against application expectations), and only then
   promote it:
   ```sql
   ALTER DATABASE cellar RENAME TO cellar_pre_incident_<date>;
   ALTER DATABASE cellar_restore_<name> RENAME TO cellar;
   ```
   Keep `cellar_pre_incident_<date>` until the restored data is confirmed
   good in production, then drop it by hand.
4. Same shape for MinIO: restore into a throwaway bucket, spot-check a few
   known object keys, then either repoint `MINIO_BUCKET` at the restored
   bucket or `mc mirror` it over the real one (`mc mirror` is additive — it
   will not delete objects the real bucket still has that the backup does
   not, which is the right default for "restore what's missing" but means a
   restore following data corruption, not data loss, needs `mc mirror
   --overwrite` and a deliberate decision about which side wins).
5. `docker compose ... up -d actors api`.

---

## 4. Nightly schedule

**Not installed anywhere. Documented only — see below for why.**

The two scripts are meant to run nightly on Loki itself, against Loki's own
running Postgres/MinIO. This development sandbox is a different machine (a
Mac, not Loki — see this workstream's report for the full finding that Loki
is not reachable from here at all), so there is nothing to install *onto* for
real. Loki is Linux (per `docs/architecture/target-stack.md`), so **cron**,
not launchd, is the right mechanism once someone is actually on that box:

```cron
# /etc/cron.d/cellar-assistant-backup, or `crontab -e` for the deploying user
15 3 * * *  cd /path/to/cellar-assistant && BACKUP_ROOT=/mnt/backup-disk/cellar-assistant/postgres PG_CONTAINER="" scripts/backup/pg-backup.sh   >> /var/log/cellar-backup-postgres.log 2>&1
30 3 * * *  cd /path/to/cellar-assistant && BACKUP_ROOT=/mnt/backup-disk/cellar-assistant/minio    MC_MODE=host MC_ENDPOINT=http://127.0.0.1:9100 scripts/backup/minio-backup.sh >> /var/log/cellar-backup-minio.log 2>&1
```

(`PG_CONTAINER=""` and `MC_MODE=host` switch both scripts onto the
loopback-TCP path §1 describes as the intended one for Loki; staggering the
two jobs by 15 minutes is enough headroom for a 28 MB database and whatever
`cellar-files` holds by then.)

A systemd timer is the other reasonable choice on most Linux distributions and
is not written out here only because cron needs no systemd-unit boilerplate
for something this small; either works.

Installing this — writing to `/etc/cron.d` or a user's crontab — is a
persistent, host-level configuration change outside this git repository, on a
machine this session cannot reach and was not asked to provision. It is the
kind of action the safety rules governing this session route to "tell the
user, don't do it," not a gap in effort. Whoever does Loki's first real deploy
(`docs/architecture/deploy-loki.md`) should add one of the two crontab lines
above (with real paths) as part of that sitting.

---

## 5. The drill — run 2026-09-10

Both stores were restored for real, against this repo's own dev stack, into
throwaway targets. Trimmed 2026-09-19 to the results; the full command
transcript is in git history.

**Postgres.** `pg_dump -Fc` of `cellar` → restore into `cellar_restore_drill` →
compare per-table row counts across all 62 `public` tables. **`diff` of the two
count files was empty; 9,313 rows both sides.** The drill database was dropped
afterwards and `cellar`, `cellar_test` and `cellar_test_template` were confirmed
untouched.

**MinIO.** The real `cellar-files` bucket held 0 objects at the time, so the
drill seeded a separate bucket with a synthetic corpus (15 objects, 924 bytes,
including a `labels/` prefix to exercise nesting), mirrored it out and restored
it into a third bucket. **`mc diff` returned zero differences** — and `mc diff`
compares by key *and* ETag, so that is a content check, not a listing check.
`cellar-files` was confirmed still at 0 objects afterwards.

**What the drill proves and does not.** The whole cycle — backup, verify,
restore, verify, teardown — works end to end for both stores, with real integrity
checks (`pg_restore --list`'s TOC parse, `mc diff`'s ETag comparison) passing.
It says nothing about behaviour at production scale, on a database with real user
data, or under a partial-failure restore. **These numbers are one data point, not
a baseline to alarm on drift from.** Re-run monthly once real data exists on Loki.

---

## 6. Open follow-ups

- **Off-box target.** `BACKUP_ROOT` today means "a different directory on the
  same box." Point it at a second disk or a network share on Loki for real
  off-box protection (§1); this workstream had no such target reachable to
  test against.
- **Nightly schedule is documented, not installed** (§4) — do this as part of
  Loki's first real deploy.
- ~~**Alert routing has no delivery channel yet.**~~ **Done in `ace0d2fd`.**
  The rules no longer fall through to `grafana-default-email`:
  `infra/grafana/provisioning/alerting/contact-points-and-policies.yaml`
  provisions a `discord-ops` contact point as the root receiver, reading
  `$DISCORD_WEBHOOK_URL` from the Grafana container's environment. What
  remains is an operator step, not a build step: put the real webhook in
  `infra/.env.prod` on Loki. Delivery itself was proven end to end on
  2026-09-27 against a throwaway webhook sink, rule by rule
  (`deploy-loki.md` §9.7); your webhook is the one part only a real test
  message can prove.
