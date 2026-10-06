/**
 * A8 · Nhost `storage.files` → `files`, and the objects themselves from
 * Nhost into the stack's own MinIO, **with object keys preserved exactly**
 * (target-stack §4's migration constraint — a changed key 404s in a way that
 * looks like an application bug, because `files.id` is a foreign key
 * throughout the schema).
 *
 * Two ways to read the objects, chosen by `SOURCE_MODE`:
 *
 *   # s3 (the default): Nhost's object store over the S3 protocol. Needs raw
 *   # S3 credentials — the local legacy stack's MinIO has them; Nhost Cloud
 *   # does not hand them out.
 *   SOURCE_MODE=s3 \
 *   SOURCE_S3_ENDPOINT=<nhost-minio-container-name> SOURCE_S3_PORT=9000 \
 *   SOURCE_S3_ACCESS_KEY=... SOURCE_S3_SECRET_KEY=... SOURCE_S3_BUCKET=nhost \
 *
 *   # storage-api: Nhost's Storage HTTP API (hasura-storage), authenticated
 *   # with the project's admin secret. What a Nhost Cloud project offers.
 *   SOURCE_MODE=storage-api \
 *   SOURCE_STORAGE_URL=https://<subdomain>.storage.<region>.nhost.run/v1 \
 *   SOURCE_ADMIN_SECRET=...   # env only; never printed (see below)
 *
 *   # either way:
 *   SOURCE_DATABASE_URL=postgres://…/local      # rows: storage.files
 *   TARGET_DATABASE_URL=postgres://cellar:…/cellar
 *   TARGET_S3_ENDPOINT=… TARGET_S3_PORT=9000 \
 *   TARGET_S3_ACCESS_KEY=... TARGET_S3_SECRET_KEY=... TARGET_S3_BUCKET=cellar-files \
 *   node scripts/migrate-files.ts [--dry-run | --preflight] [--rows-only]
 *
 * `--rows-only` writes the `files` rows and copies no object: it needs only
 * the two database URLs (and `TARGET_S3_BUCKET`, for the rows' `bucket`), and
 * contacts no object store. It is what a rehearsal without the objects, and
 * the in-freeze half of a two-step cutover, run — `cutover.sh`'s
 * `FILES_MODE=rows-only`. Each row it writes carries
 * `metadata.cutoverRowsOnly = true` (`ROWS_ONLY_MARKER`): "no verified object
 * behind this row yet". A later run without `--rows-only` re-verifies or
 * copies the object behind every marked row and clears the marker. See
 * `insertRowsOnly` in `migrate-files-core.ts` for what a row does and does not
 * promise in this mode.
 *
 * `scripts/cutover/cutover.sh`'s `files` phase runs this, and its preflight
 * runs `--preflight`; `scripts/cutover/README.md` documents both modes. The
 * storage-api semantics this relies on — route, auth, status codes, headers —
 * are cited against hasura-storage's source in `migrate-files-core.ts`.
 *
 * ## What "the object key" is
 *
 * Verified 2026-09-08 against `nhost/nhost`'s `services/storage` source
 * (`storage/s3.go`'s `PutFile`, called from `controller/upload_files.go` as
 * `PutFile(ctx, fileContent, file.ID, contentType)`): the S3 key for a row is
 * its `id`, joined with `S3_ROOT_FOLDER` (empty in this project — confirmed via
 * `docker inspect` on the Nhost storage container). So `key = id` exactly, and
 * every logical `storage.buckets` row shares Nhost's one physical `S3_BUCKET`
 * ("nhost" here) rather than mapping to a same-named S3 bucket — `bucket_id` is
 * a Postgres-level policy grouping, not a storage-level one. The storage API
 * addresses a file by that same id (`GET /v1/files/{id}`), so both modes read
 * "the object for row X" by X's id and write it under key = X's id.
 *
 * This script therefore migrates every row into **one** bucket
 * (`TARGET_S3_BUCKET`, `cellar-files` by default) under key = the file's own
 * id (as text) — which also means keeping `files.id` identical to
 * `storage.files.id` is what makes "every migrated key resolves" true by
 * construction.
 *
 * ## Verification, idempotency, resumption
 *
 * Only `is_uploaded = true` rows are migrated — an incomplete upload has
 * nothing to copy. Each object is streamed (never buffered whole: the target
 * client's part size bounds memory per upload, `TARGET_S3_PART_SIZE_MB`)
 * through a counter and an MD5 + SHA-256 hasher, and is accepted only if:
 *
 *   - the source's declared length, the bytes received and `storage.files.size`
 *     agree (`size-mismatch` otherwise — nothing is written, or what was
 *     written is removed);
 *   - the received bytes' MD5 equals `storage.files.etag` when that is a
 *     single-part S3 ETag, which is all hasura-storage writes (`hash-mismatch`);
 *   - what landed in the target has the same size, and the same bytes — by the
 *     upload's own MD5 ETag, or by reading it back and comparing SHA-256.
 *
 * Only then is the `files` row inserted (`ON CONFLICT (id) DO NOTHING`). **The
 * row is the commit marker** — an unmarked one: a rerun skips any id that has
 * a row without `ROWS_ONLY_MARKER` *and* an object of the right size
 * (`skipped-present`), without contacting the source. An object with no row —
 * a run that died between the upload and the insert — or behind a row that
 * still carries the marker (written by `--rows-only`, with no object) is
 * re-verified locally against Nhost's MD5 and then given its row (or has its
 * marker cleared), or copied again when there is no usable MD5 or it does not
 * match. So an interrupted run is resumed by running it again, and a
 * `--rows-only` run followed by a full one ends with every row it could verify
 * unmarked. The summary counts those (`rows … confirmed=N`) and the ones still
 * marked (`unconfirmed=N`, listed by id): an object missing at the source, a
 * failure, a mismatch, or a stopped run leaves them marked.
 *
 * Migrated rows are marked `verified_at = now()` at migration time — in
 * `--rows-only` too: they are known-good, already-served production files,
 * not provisional upload targets, so `MaintenanceActor`'s orphan reaper
 * (`maintenance-actor.ts`), which deletes old unreferenced rows with a NULL
 * `verified_at`, must never see them as candidates. Whether a row's *bytes*
 * were verified is the marker's job, not `verified_at`'s.
 *
 * ## Failure handling
 *
 * `FILES_CONCURRENCY` objects at once (8). 429, 5xx, dropped connections and
 * bodies that stall for `FILES_STALL_TIMEOUT_MS` are retried with full-jitter
 * exponential backoff (`FILES_RETRY_BASE_MS`, `FILES_RETRY_MAX_MS`, honouring
 * `Retry-After`) up to `FILES_MAX_ATTEMPTS` (6) times, then counted `failed`.
 * A 404 is `missing-at-source` — reported, and the run goes on — until more
 * than `FILES_MAX_MISSING` (10) are missing, when it stops scheduling new
 * objects: that many missing is what a SOURCE_STORAGE_URL naming another
 * project looks like. A rejected credential stops the run at once.
 *
 * Exit status: 0 every row copied or already present (missing objects within
 * the threshold are listed, and their rows are not inserted); 1 any `failed`
 * or mismatch — rerun, it resumes; 3 stopped at the missing threshold; 4 the
 * source refused the credentials. Rows still carrying the rows-only marker add
 * no exit code of their own: every way one survives a full run is already one
 * of the above, except an object missing at the source, which exits 0 with a
 * WARNING naming the unconfirmed count. `cutover.sh`'s `files` phase refuses
 * that state itself, by counting marked rows after the run.
 *
 * ## Never written to, never printed
 *
 * The rows connection is opened `default_transaction_read_only = on`, the same
 * guard `migrate-users.ts` uses, and the source store is only ever read
 * (`statObject`/`getObject`, or `GET`/`HEAD`). This script must never write to
 * Nhost.
 *
 * `SOURCE_ADMIN_SECRET` is read from the environment only and sent only as the
 * `x-hasura-admin-secret` header to `SOURCE_STORAGE_URL`'s origin (redirects
 * are refused, not followed). Every line this script prints is passed through
 * a redactor first, and it refuses to start if the secret is short enough to
 * be mangled by redaction or appears in a value it prints.
 */

import { Client as MinioClient } from "minio";
import { Client, Pool } from "pg";
import {
  assertSecretSafe,
  formatBytes,
  insertRowsOnly,
  makeRedactor,
  minioTarget,
  type ObjectSource,
  parseStorageUrl,
  pgRowSink,
  probeStorageApi,
  ROWS_ONLY_MARKER,
  runCopy,
  SOURCE_FILES,
  type SourceFile,
  type StorageApiOptions,
  s3Source,
  storageApiSource,
} from "./migrate-files-core.ts";

const env = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
};

const envOptional = (name: string, fallback: string): string =>
  process.env[name] ?? fallback;

const envInt = (name: string, fallback: number, min: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${String(min)}`);
  }
  return value;
};

const MODES = ["s3", "storage-api"] as const;
type Mode = (typeof MODES)[number];

const secretsToRedact = (): string[] =>
  [
    process.env.SOURCE_ADMIN_SECRET,
    process.env.SOURCE_S3_SECRET_KEY,
    process.env.TARGET_S3_SECRET_KEY,
  ].filter((s): s is string => s !== undefined && s.length >= 8);

const redact = makeRedactor(secretsToRedact());
const out = (line: string): void => {
  process.stdout.write(`${redact(line)}\n`);
};
const err = (line: string): void => {
  process.stderr.write(`${redact(line)}\n`);
};

const readMode = (): Mode => {
  const raw = envOptional("SOURCE_MODE", "s3");
  const mode = MODES.find((m) => m === raw);
  if (mode === undefined) {
    throw new Error(`SOURCE_MODE must be one of ${MODES.join(", ")}`);
  }
  return mode;
};

const minio = (side: "SOURCE" | "TARGET", partSizeMb?: number) =>
  new MinioClient({
    endPoint: env(`${side}_S3_ENDPOINT`),
    port: Number(envOptional(`${side}_S3_PORT`, "9000")),
    useSSL: envOptional(`${side}_S3_USE_SSL`, "false") === "true",
    region: envOptional(`${side}_S3_REGION`, "us-east-1"),
    accessKey: env(`${side}_S3_ACCESS_KEY`),
    secretKey: env(`${side}_S3_SECRET_KEY`),
    ...(partSizeMb === undefined ? {} : { partSize: partSizeMb * 1024 * 1024 }),
  });

const storageApiOptions = (): StorageApiOptions => {
  const rawUrl = env("SOURCE_STORAGE_URL");
  const adminSecret = env("SOURCE_ADMIN_SECRET");
  assertSecretSafe("SOURCE_ADMIN_SECRET", adminSecret, {
    SOURCE_STORAGE_URL: rawUrl,
    TARGET_S3_ENDPOINT: process.env.TARGET_S3_ENDPOINT,
    TARGET_S3_BUCKET: process.env.TARGET_S3_BUCKET,
  });
  return {
    baseUrl: parseStorageUrl(rawUrl),
    adminSecret,
    headerTimeoutMs: envInt("FILES_HEADER_TIMEOUT_MS", 60_000, 1),
  };
};

const openSource = (mode: Mode): ObjectSource =>
  mode === "s3"
    ? s3Source(minio("SOURCE"), envOptional("SOURCE_S3_BUCKET", "nhost"))
    : storageApiSource(storageApiOptions());

const readRows = async (sourceUrl: string): Promise<SourceFile[]> => {
  const source = new Client({ connectionString: sourceUrl });
  await source.connect();
  try {
    // Belt and braces: Nhost is read-only to this script (both services).
    await source.query("SET default_transaction_read_only = on");
    return (await source.query<SourceFile>(SOURCE_FILES)).rows;
  } finally {
    await source.end();
  }
};

// ---------------------------------------------------------------- preflight

const UNREACHABLE = [
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ECONNRESET",
];

const within = <T>(p: Promise<T>, what: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            Object.assign(new Error(`${what}: no answer in 10s`), {
              code: "ETIMEDOUT",
            }),
          ),
        10_000,
      ).unref(),
    ),
  ]);

/**
 * Reach everything the copy will reach and read nothing: both databases, the
 * target bucket, and the source — `bucketExists` for s3, two metadata-only
 * `HEAD`s for storage-api (`probeStorageApi`). Exit 0 all answered, 2 something
 * did not answer at all, 1 anything else (a refused login, a wrong secret or
 * key, a missing bucket). `cutover.sh`'s `check_files_reach` relies on these
 * three codes.
 *
 * `mode` null is `--rows-only`: the two databases and nothing else, because
 * that run touches no object store.
 */
const preflight = async (mode: Mode | null): Promise<number> => {
  let unreachable = false;
  let failed = false;
  const report = (label: string, error: unknown) => {
    const e = error as { code?: unknown; message?: string; errors?: Error[] };
    const detail =
      e.message ||
      (e.errors ?? []).map((x) => x.message).join("; ") ||
      String(error);
    const code = typeof e.code === "string" ? e.code : undefined;
    err(`FAIL ${label}: ${code === undefined ? "" : `${code}: `}${detail}`);
    if (
      (code !== undefined && UNREACHABLE.includes(code)) ||
      /timeout|no answer/i.test(detail)
    ) {
      unreachable = true;
    } else {
      failed = true;
    }
  };

  let known: { id: string; size: number | null } | null = null;
  const pinned = process.env.CHECK_STORAGE_FILE_ID;
  if (pinned !== undefined && pinned !== "") {
    const size = process.env.CHECK_STORAGE_FILE_SIZE;
    known = {
      id: pinned,
      size: size === undefined || size === "" ? null : Number(size),
    };
  }

  for (const [label, url, read] of [
    [
      "rows source",
      env(
        "SOURCE_DATABASE_URL",
        "postgres://postgres:postgres@localhost:5432/local",
      ),
      true,
    ],
    [
      "target",
      env(
        "TARGET_DATABASE_URL",
        "postgres://cellar:cellar@localhost:5433/cellar",
      ),
      false,
    ],
  ] as const) {
    const c = new Client({
      connectionString: url,
      connectionTimeoutMillis: 5000,
    });
    try {
      await c.connect();
      await c.query("SET default_transaction_read_only = on");
      const { rows } = await c.query<{ u: string; d: string }>(
        "SELECT current_user AS u, current_database() AS d",
      );
      out(
        `ok   ${label} database: logged in as ${rows[0]?.u ?? "?"} to ${rows[0]?.d ?? "?"}`,
      );
      if (read) {
        try {
          const first = await c.query<{
            id: string;
            size: number | null;
            n: string;
          }>(
            `SELECT f.id::text AS id, f.size,
                    (SELECT count(*) FROM storage.files WHERE is_uploaded)::text AS n
               FROM storage.files f WHERE f.is_uploaded
              ORDER BY f.created_at, f.id LIMIT 1`,
          );
          const row = first.rows[0];
          out(
            `ok   rows source: ${row?.n ?? "0"} uploaded row(s) in storage.files`,
          );
          if (known === null && row !== undefined) {
            known = { id: row.id, size: row.size };
          }
        } catch (error) {
          if ((error as { code?: unknown }).code === "42P01") {
            out(
              "note rows source: no storage.files yet (expected before `restore`)",
            );
          } else {
            report("rows source storage.files", error);
          }
        }
      }
    } catch (error) {
      report(`${label} database`, error);
    } finally {
      await c.end().catch(() => {});
    }
  }

  const bucketCheck = async (side: "SOURCE" | "TARGET") => {
    const bucket = env(
      `${side}_S3_BUCKET`,
      side === "SOURCE" ? "nhost" : "cellar-files",
    );
    const where = `${env(`${side}_S3_ENDPOINT`)}:${envOptional(`${side}_S3_PORT`, "9000")}`;
    const name = `${side.toLowerCase()} object store`;
    try {
      if (await within(minio(side).bucketExists(bucket), name)) {
        out(`ok   ${name}: bucket ${bucket} at ${where}`);
      } else {
        err(`FAIL ${name}: no bucket ${bucket} at ${where}`);
        failed = true;
      }
    } catch (error) {
      report(`${name} (${where})`, error);
    }
  };

  if (mode === null) {
    out("note --rows-only: no object store is contacted, so none is checked");
    return failed ? 1 : unreachable ? 2 : 0;
  }
  if (mode === "s3") {
    await bucketCheck("SOURCE");
  } else {
    for (const r of await probeStorageApi(storageApiOptions(), known)) {
      (r.ok ? out : err)(r.line);
      if (!r.ok) {
        if (r.unreachable) unreachable = true;
        else failed = true;
      }
    }
  }
  await bucketCheck("TARGET");
  return failed ? 1 : unreachable ? 2 : 0;
};

// ---------------------------------------------------------------- main

const main = async (): Promise<number> => {
  const dryRun = process.argv.includes("--dry-run");
  const rowsOnly = process.argv.includes("--rows-only");
  // --rows-only reads no object, so SOURCE_MODE and its settings do not apply.
  const mode = rowsOnly ? null : readMode();
  if (mode === "storage-api") storageApiOptions(); // refuse early, before any I/O

  if (process.argv.includes("--preflight")) return preflight(mode);
  if (mode === null) return rowsOnlyRun(dryRun);

  const sourceUrl = env(
    "SOURCE_DATABASE_URL",
    "postgres://postgres:postgres@localhost:5432/local",
  );
  const targetUrl = env(
    "TARGET_DATABASE_URL",
    "postgres://cellar:cellar@localhost:5433/cellar",
  );
  const targetBucket = envOptional("TARGET_S3_BUCKET", "cellar-files");
  const targetClient = minio("TARGET", envInt("TARGET_S3_PART_SIZE_MB", 16, 5));
  const target = minioTarget(targetClient, targetBucket);

  const rows = await readRows(sourceUrl);
  const skipped: { id: string; reason: string }[] = [];
  const migratable = rows.filter((r) => {
    if (!r.is_uploaded) {
      skipped.push({ id: r.id, reason: "is_uploaded = false" });
      return false;
    }
    return true;
  });

  const source = openSource(mode);
  out(`source    ${source.label}`);
  out(`target    ${target.label}`);

  if (dryRun) {
    // Reads the target (read-only) to say what a real run would do; never
    // contacts the source's objects.
    const pool = new Pool({
      connectionString: targetUrl,
      max: 1,
      options: "-c default_transaction_read_only=on",
    });
    try {
      const sink = pgRowSink(pool, targetBucket);
      const existing = await sink.existingIds();
      const marked = await sink.markedIds();
      let present = 0;
      let unrowed = 0;
      let toCopy = 0;
      let bytesToCopy = 0;
      for (const r of migratable) {
        const stat = await target.stat(r.id);
        const sized =
          stat !== null && (r.size === null || stat.size === r.size);
        if (sized && existing.has(r.id) && !marked.has(r.id)) present += 1;
        else if (sized) unrowed += 1;
        else {
          toCopy += 1;
          bytesToCopy += r.size ?? 0;
        }
      }
      out(
        `[dry-run] ${String(migratable.length)} uploaded row(s): ` +
          `${String(present)} already present, ${String(unrowed)} present without a row ` +
          `(re-verified, or copied), ${String(toCopy)} to copy (${formatBytes(bytesToCopy)}); ` +
          `${String(skipped.length)} skipped; ` +
          `${String(marked.size)} rows-only row(s) to verify (${ROWS_ONLY_MARKER})`,
      );
      for (const s of skipped) out(`  skip ${s.id}: ${s.reason}`);
    } finally {
      await pool.end();
    }
    return 0;
  }

  const concurrency = envInt("FILES_CONCURRENCY", 8, 1);
  const pool = new Pool({
    connectionString: targetUrl,
    max: Math.min(concurrency, 4),
  });
  let summary: Awaited<ReturnType<typeof runCopy>>;
  try {
    summary = await runCopy({
      rows: migratable,
      source,
      target,
      sink: pgRowSink(pool, targetBucket),
      targetBucket,
      concurrency,
      maxAttempts: envInt("FILES_MAX_ATTEMPTS", 6, 1),
      retryBaseMs: envInt("FILES_RETRY_BASE_MS", 500, 0),
      retryMaxMs: envInt("FILES_RETRY_MAX_MS", 30_000, 0),
      stallTimeoutMs: envInt("FILES_STALL_TIMEOUT_MS", 60_000, 1),
      maxMissing: envInt("FILES_MAX_MISSING", 10, 0),
      progressEveryMs: envInt("FILES_PROGRESS_MS", 5000, 1),
      log: out,
    });
  } finally {
    await pool.end();
  }

  const c = summary.counts;
  out(
    `rows      inserted=${String(summary.rowsInserted)} unchanged=${String(summary.rowsUnchanged)}` +
      ` confirmed=${String(summary.rowsConfirmed)} unconfirmed=${String(summary.rowsUnconfirmed.length)}`,
  );
  out(
    `objects   copied=${String(c.copied)} skipped_present=${String(c["skipped-present"])}` +
      ` missing_at_source=${String(c["missing-at-source"])}` +
      ` size_mismatch=${String(c["size-mismatch"])} hash_mismatch=${String(c["hash-mismatch"])}` +
      ` failed=${String(c.failed)} (of ${String(summary.total)}; retries=${String(summary.retries)})`,
  );
  out(
    `bytes     copied=${String(summary.bytesCopied)} (${formatBytes(summary.bytesCopied)})` +
      ` already_present=${String(summary.bytesPresent)} (${formatBytes(summary.bytesPresent)})`,
  );
  out(`skipped   ${String(skipped.length)} (is_uploaded = false)`);
  for (const s of skipped) out(`  ${s.id}: ${s.reason}`);
  for (const p of summary.problems) out(`  ${p.kind} ${p.id}: ${p.detail}`);
  for (const id of summary.rowsUnconfirmed) {
    out(`  unconfirmed ${id}: still ${ROWS_ONLY_MARKER} — no verified object`);
  }
  if (summary.rowsUnconfirmed.length > 0) {
    err(
      `WARNING: ${String(summary.rowsUnconfirmed.length)} rows-only row(s) still carry ${ROWS_ONLY_MARKER}: ` +
        "their objects are not verified in the target (listed above)",
    );
  }
  if (summary.aborted !== null) {
    err(`STOPPED EARLY: ${summary.aborted.detail}`);
    const attempted = Object.values(c).reduce((a, b) => a + b, 0);
    err(
      `  ${String(summary.total - attempted)} row(s) not attempted; fix the cause and rerun (it resumes)`,
    );
    return summary.aborted.reason === "source-auth" ? 4 : 3;
  }
  if (c.failed + c["size-mismatch"] + c["hash-mismatch"] > 0) {
    err(
      "NOT COMPLETE: failed or mismatched objects above; rerun to retry them (copied ones are skipped)",
    );
    return 1;
  }
  if (c["missing-at-source"] > 0) {
    err(
      `WARNING: ${String(c["missing-at-source"])} object(s) missing at the source; their rows were not migrated`,
    );
  }
  return 0;
};

/** `--rows-only`: the rows, no object store. See `insertRowsOnly`. */
const rowsOnlyRun = async (dryRun: boolean): Promise<number> => {
  const rows = await readRows(
    env(
      "SOURCE_DATABASE_URL",
      "postgres://postgres:postgres@localhost:5432/local",
    ),
  );
  const targetBucket = envOptional("TARGET_S3_BUCKET", "cellar-files");
  const pool = new Pool({
    connectionString: env(
      "TARGET_DATABASE_URL",
      "postgres://cellar:cellar@localhost:5433/cellar",
    ),
    max: 1,
    ...(dryRun ? { options: "-c default_transaction_read_only=on" } : {}),
  });
  try {
    const sink = pgRowSink(pool, targetBucket);
    if (dryRun) {
      const existing = await sink.existingIds();
      const uploaded = rows.filter((r) => r.is_uploaded);
      const toInsert = uploaded.filter((r) => !existing.has(r.id)).length;
      out(
        `[dry-run] --rows-only: ${String(uploaded.length)} uploaded row(s), ` +
          `${String(toInsert)} to insert into files (bucket ${targetBucket}), ` +
          `${String(rows.length - uploaded.length)} skipped (is_uploaded = false)`,
      );
      return 0;
    }
    const summary = await insertRowsOnly(rows, sink, targetBucket);
    const bytes = rows
      .filter((r) => r.is_uploaded)
      .reduce((n, r) => n + (r.size ?? 0), 0);
    out(
      `rows      inserted=${String(summary.inserted)} unchanged=${String(summary.unchanged)}` +
        ` (of ${String(summary.total)} uploaded; ${String(bytes)} bytes, ${formatBytes(bytes)}; bucket ${targetBucket})`,
    );
    out(`skipped   ${String(summary.skipped.length)} (is_uploaded = false)`);
    out(
      "objects   NOT COPIED (--rows-only): every row above points at an object that is " +
        "not in the target yet. Run migrate-files.ts without --rows-only before anything serves these files.",
    );
    out(
      `marker    rows written here carry metadata.${ROWS_ONLY_MARKER} = true until a full run verifies their objects`,
    );
    return 0;
  } finally {
    await pool.end();
  }
};

process.on("uncaughtException", (error) => {
  err(
    `migrate-files: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  process.exit(1);
});

try {
  process.exitCode = await main();
} catch (error) {
  err(
    `migrate-files: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
