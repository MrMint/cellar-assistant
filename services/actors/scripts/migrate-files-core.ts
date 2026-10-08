/**
 * The copy engine behind `migrate-files.ts`: two ways to read Nhost's objects
 * (`s3` and `storage-api`), one way to write them (the stack's MinIO), and one
 * loop that does the copying, verifying, retrying and counting for both.
 *
 * Split out of the script so the loop can be driven by a test without a child
 * process; the script itself only parses the environment and prints.
 *
 * ## The storage-api source, and what it was verified against
 *
 * Nhost Cloud's managed storage gives a project no raw S3 credentials. What it
 * does give is its Storage HTTP API (hasura-storage). Everything below was read
 * from `nhost/nhost` at tag `storage@0.15.0` (commit `6a5f6c97`) — the version
 * `82450ad1:nhost/nhost.toml`'s `[storage]` pins for this project — in
 * `services/storage/`:
 *
 * - **Route and base URL.** `GET /files/{id}` under the server
 *   `https://{subdomain}.storage.{region}.nhost.run/v1`
 *   (`controller/openapi.yaml`, `servers` and `paths./files/{id}.get`). So
 *   `SOURCE_STORAGE_URL` ends in `/v1` and the file URL is `<that>/files/<id>`.
 * - **Auth.** `middleware/headers.go`'s `SessionHeadersFromContext` forwards every
 *   `X-Hasura-*` request header to Hasura for the metadata lookup, and
 *   `controller/get_file_metadata_headers.go`'s `getFileMetadata` runs that lookup
 *   with those headers — so `x-hasura-admin-secret` makes the lookup an admin one.
 *   A wrong secret is Hasura's `access-denied`, which `metadata/hasura.go`'s
 *   `parseGraphqlError` turns into **403** "you are not authorized".
 * - **The body is streamed, not redirected.** `controller/get_file.go`'s
 *   `GetFile` reads the object from S3 (`storage/s3.go`'s `GetFile`) and returns
 *   it as the response body with status 200. Presigned URLs are a *separate*
 *   route (`/files/{id}/presignedurl`), never a redirect from this one. This
 *   script still refuses to follow any 3xx: `fetch` keeps custom headers across
 *   a cross-origin redirect, and the admin secret must never reach another host.
 * - **Headers on 200.** `Content-Type` = the metadata `mimeType`, `Etag` = the
 *   metadata `etag`, `Content-Length` = the S3 object's own length,
 *   `Accept-Ranges: bytes` (`getFileResponse`). No `Range` is sent here, and no
 *   `w`/`h`/`q`/`b`/`f` query parameter — any of those would transform the image.
 * - **404** means the metadata row was not found (`hasura.go`'s `GetFileByID`
 *   returns `ErrFileNotFound` when Hasura answers null) — deleted since the dump,
 *   or the wrong project. **A row whose S3 object is gone is a 500**, not a 404:
 *   `s3.go`'s `GetFile` wraps the S3 error in `InternalServerError` ("an internal
 *   server error occurred"). So that case is retried and then counted `failed`,
 *   with the status in the detail — it cannot be told apart from a transient 500
 *   by the response alone.
 * - **403 "file is not uploaded"** is `is_uploaded = false` *live*
 *   (`getFileMetadata`'s `checkIsUploaded`): a per-file failure, not an auth one.
 * - **`HEAD /files/{id}`** (`getFileMetadataHeaders`) answers from metadata only
 *   — it never touches S3 unless an image parameter is given — with
 *   `Content-Length` = the metadata size. That is what `--preflight` uses.
 * - **`storage.files.etag`** is the S3 `PutObject` ETag (`controller/upload_files.go`
 *   stores what `s3.go`'s `PutFile` returns): the quoted MD5 of the bytes for a
 *   single-part PUT, which is all hasura-storage ever does. When it has that
 *   shape it is compared with the MD5 of the bytes actually received.
 */
import { createHash, randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import type { Client as MinioClient } from "minio";
import type { Pool } from "pg";

export type SourceFile = {
  id: string;
  bucket_id: string;
  name: string | null;
  size: number | null;
  mime_type: string | null;
  etag: string | null;
  uploaded_by_user_id: string | null;
  metadata: unknown;
  is_uploaded: boolean;
  created_at: Date;
  updated_at: Date;
};

export const SOURCE_FILES = `
  SELECT id::text,
         bucket_id,
         name,
         size,
         mime_type,
         etag,
         uploaded_by_user_id::text,
         metadata,
         is_uploaded,
         created_at,
         updated_at
    FROM storage.files
   ORDER BY created_at, id
`;

const INSERT_FILE = `
  INSERT INTO files (
    id, bucket, key, size, mime_type, etag, uploaded_by, verified_at,
    metadata, created_at, updated_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  ON CONFLICT (id) DO NOTHING
  RETURNING (xmax = 0) AS inserted
`;

// ---------------------------------------------------------------- errors

/** Worth another attempt: 429, 5xx, a dropped connection, a stalled body. */
export class RetryableError extends Error {
  retryAfterMs: number | null = null;
}

/** The source refused our credentials. Fatal for the whole run. */
export class SourceAuthError extends Error {}

/** A per-file failure that another attempt cannot change. */
export class PermanentError extends Error {}

const describe = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const code = (error as { code?: unknown }).code;
  const cause = (error as { cause?: unknown }).cause;
  const causeText =
    cause instanceof Error
      ? ` (${(cause as { code?: unknown }).code ?? ""}${
          (cause as { code?: unknown }).code === undefined ? "" : ": "
        }${cause.message})`
      : "";
  const prefix = typeof code === "string" ? `${code}: ` : "";
  return `${prefix}${error.message}${causeText}`;
};

// ---------------------------------------------------------------- secrets

/**
 * Replaces every occurrence of each secret with `***`. Secrets shorter than 8
 * characters are refused up front (`assertSecretSafe`), so this never has to
 * choose between leaking a short secret and mangling ordinary words.
 */
export const makeRedactor =
  (secrets: readonly string[]) =>
  (text: string): string => {
    let out = text;
    for (const secret of secrets) {
      if (secret.length > 0) out = out.split(secret).join("***");
    }
    return out;
  };

export const MIN_SECRET_LENGTH = 8;

/**
 * Throws — without the secret in the message — if the secret could end up
 * printed: too short to redact safely, spanning lines, or embedded in a value
 * this script prints verbatim (the storage URL, the target endpoint/bucket).
 */
export const assertSecretSafe = (
  name: string,
  secret: string,
  printed: Record<string, string | undefined>,
): void => {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} is shorter than ${String(MIN_SECRET_LENGTH)} characters; refusing to run, ` +
        "because it could not be redacted from output without mangling it",
    );
  }
  if (/[\r\n]/.test(secret)) {
    throw new Error(`${name} contains a line break; refusing to run`);
  }
  for (const [label, value] of Object.entries(printed)) {
    if (value?.includes(secret)) {
      throw new Error(
        `${name} appears inside ${label}, which this script prints; refusing to run`,
      );
    }
  }
};

// ---------------------------------------------------------------- sources

export type SourceObject = {
  body: Readable;
  /** What the source says the body's length is, if it says. */
  contentLength: number | null;
};

export type OpenResult =
  | { kind: "ok"; object: SourceObject }
  | { kind: "missing"; detail: string };

export interface ObjectSource {
  /** Safe to print: carries no credential. */
  readonly label: string;
  open(id: string, signal: AbortSignal): Promise<OpenResult>;
}

const parseLength = (value: string | null): number | null => {
  if (value === null || !/^\d+$/.test(value)) return null;
  return Number(value);
};

/** `Retry-After`, as delay-seconds or an HTTP-date. Null when absent/garbled. */
export const parseRetryAfter = (
  value: string | null,
  now = Date.now(),
): number | null => {
  if (value === null) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
};

/**
 * `SOURCE_STORAGE_URL`, checked: http(s), no userinfo/query/fragment, and a path
 * ending in `/v1` — Nhost's own base-URL shape. A URL without `/v1` would 404
 * every file, which reads as "every object is missing" rather than as a typo.
 */
export const parseStorageUrl = (raw: string): URL => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("SOURCE_STORAGE_URL is not a URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("SOURCE_STORAGE_URL must be http(s)");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("SOURCE_STORAGE_URL must not carry credentials");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error("SOURCE_STORAGE_URL must not carry a query or fragment");
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith("/v1")) {
    throw new Error(
      "SOURCE_STORAGE_URL must end in /v1 — https://<subdomain>.storage.<region>.nhost.run/v1",
    );
  }
  url.pathname = path;
  return url;
};

const fileUrl = (base: URL, id: string): string =>
  `${base.origin}${base.pathname}/files/${encodeURIComponent(id)}`;

export type StorageApiOptions = {
  baseUrl: URL;
  adminSecret: string;
  /** Headers must arrive within this; the body has its own stall timer. */
  headerTimeoutMs: number;
  fetchImpl?: typeof fetch;
};

const drain = async (response: Response): Promise<void> => {
  await response.body?.cancel().catch(() => {});
};

/**
 * One request to the Storage API with the admin secret, never following a
 * redirect. `signal` aborts it; headers must arrive within `headerTimeoutMs`.
 */
const storageRequest = async (
  options: StorageApiOptions,
  method: "GET" | "HEAD",
  id: string,
  signal: AbortSignal,
): Promise<Response> => {
  const doFetch = options.fetchImpl ?? fetch;
  const headerTimer = new AbortController();
  const timer = setTimeout(() => headerTimer.abort(), options.headerTimeoutMs);
  try {
    return await doFetch(fileUrl(options.baseUrl, id), {
      method,
      headers: { "x-hasura-admin-secret": options.adminSecret },
      redirect: "manual",
      signal: AbortSignal.any([signal, headerTimer.signal]),
    });
  } catch (error) {
    const why = headerTimer.signal.aborted
      ? `no response headers in ${String(options.headerTimeoutMs)}ms`
      : describe(error);
    throw new RetryableError(`${method} ${id}: ${why}`);
  } finally {
    clearTimeout(timer);
  }
};

export const storageApiSource = (options: StorageApiOptions): ObjectSource => ({
  label: `storage-api ${options.baseUrl.origin}${options.baseUrl.pathname}`,
  async open(id, signal) {
    const response = await storageRequest(options, "GET", id, signal);
    const xError = response.headers.get("x-error") ?? "";
    const status = response.status;
    if (status === 200) {
      if (response.body === null) {
        throw new RetryableError(`GET ${id}: 200 with no body`);
      }
      return {
        kind: "ok",
        object: {
          body: Readable.fromWeb(
            response.body as unknown as NodeWebReadableStream<Uint8Array>,
          ),
          contentLength: parseLength(response.headers.get("content-length")),
        },
      };
    }
    await drain(response);
    const detail = `HTTP ${String(status)}${xError === "" ? "" : ` (${xError})`}`;
    if (status === 404) return { kind: "missing", detail };
    if (status === 429 || status >= 500) {
      const error = new RetryableError(`GET ${id}: ${detail}`);
      error.retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      throw error;
    }
    if (status >= 300 && status < 400) {
      throw new PermanentError(
        `GET ${id}: ${detail} redirect refused — the admin secret is only ever sent to ${options.baseUrl.origin}`,
      );
    }
    if (status === 403 && /not uploaded/i.test(xError)) {
      throw new PermanentError(`GET ${id}: ${detail}`);
    }
    if (status === 401 || status === 403) {
      throw new SourceAuthError(
        `the storage API refused the admin secret: ${detail}`,
      );
    }
    throw new PermanentError(`GET ${id}: ${detail}`);
  },
});

const S3_MISSING = new Set(["NotFound", "NoSuchKey"]);
const S3_AUTH = new Set([
  "AccessDenied",
  "InvalidAccessKeyId",
  "SignatureDoesNotMatch",
]);

const s3Code = (error: unknown): string | undefined => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
};

export const s3Source = (
  client: MinioClient,
  bucket: string,
): ObjectSource => ({
  label: `s3 bucket ${bucket}`,
  async open(id) {
    let size: number;
    try {
      size = (await client.statObject(bucket, id)).size;
    } catch (error) {
      const code = s3Code(error);
      if (code !== undefined && S3_MISSING.has(code)) {
        return { kind: "missing", detail: code };
      }
      if (code !== undefined && S3_AUTH.has(code)) {
        throw new SourceAuthError(
          `the source object store refused the credentials: ${code}`,
        );
      }
      throw new RetryableError(`stat ${id}: ${describe(error)}`);
    }
    try {
      return {
        kind: "ok",
        object: {
          body: await client.getObject(bucket, id),
          contentLength: size,
        },
      };
    } catch (error) {
      throw new RetryableError(`get ${id}: ${describe(error)}`);
    }
  },
});

// ---------------------------------------------------------------- target

export type TargetStat = { size: number; etag: string };

export interface ObjectTarget {
  readonly label: string;
  stat(key: string): Promise<TargetStat | null>;
  put(
    key: string,
    body: Readable,
    size: number | null,
    contentType: string | null,
  ): Promise<{ etag: string }>;
  read(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

export const minioTarget = (
  client: MinioClient,
  bucket: string,
): ObjectTarget => ({
  label: `bucket ${bucket}`,
  async stat(key) {
    try {
      const s = await client.statObject(bucket, key);
      return { size: s.size, etag: s.etag };
    } catch (error) {
      const code = s3Code(error);
      if (code !== undefined && S3_MISSING.has(code)) return null;
      throw error;
    }
  },
  async put(key, body, size, contentType) {
    const meta = contentType === null ? {} : { "Content-Type": contentType };
    const info =
      size === null
        ? await client.putObject(bucket, key, body, undefined, meta)
        : await client.putObject(bucket, key, body, size, meta);
    return { etag: info.etag };
  },
  read: (key) => client.getObject(bucket, key),
  async remove(key) {
    await client.removeObject(bucket, key);
  },
});

// ---------------------------------------------------------------- rows

/**
 * The `files.metadata` key a `--rows-only` insert stamps (`true`), and the only
 * writer of it. A row that carries it was written WITHOUT its object: it means
 * "this file existed at the source", not "these bytes are in the target". A
 * full run treats such a row as no commit marker at all — it re-verifies the
 * object behind it (or copies it) and then removes the key, so a `files` row
 * without it means "bytes verified" again. `cutover.sh`'s `files` and `smoke`
 * phases count rows still carrying it.
 *
 * Why a metadata key and not `verified_at IS NULL`: `MaintenanceActor`'s orphan
 * reaper deletes unreferenced rows with a NULL `verified_at` past a cutoff, and
 * every migrated row is old; and `FileActor.verify` gives NULL its own meaning
 * (an upload whose PUT has not been confirmed). So `verified_at` stays set.
 *
 * `metadata` is exposed through the GraphQL `File.metadata` field, so a client
 * could see this key between a rows-only run and the full run that clears it —
 * a window that only exists inside a cutover, before the flip.
 */
export const ROWS_ONLY_MARKER = "cutoverRowsOnly";

/** How a row is being written: after its object was verified, or without one. */
export type InsertMode = "verified" | "rows-only";

/**
 * Source metadata with the rows-only marker merged on; nothing else changed.
 * NULL becomes `{}` first, exactly as a full run's insert does, so clearing the
 * marker later leaves the row as a full run would have written it. A JSON
 * array or scalar cannot carry a key without being rewritten, so it is refused
 * rather than wrapped (the 2026-09-28 production backup has none: all 2,331
 * `storage.files.metadata` are NULL).
 */
export const withRowsOnlyMarker = (
  id: string,
  metadata: unknown,
): Record<string, unknown> => {
  if (metadata === null || metadata === undefined) {
    return { [ROWS_ONLY_MARKER]: true };
  }
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error(
      `storage.files ${id}: metadata is a JSON ${Array.isArray(metadata) ? "array" : typeof metadata}, ` +
        `not an object, so --rows-only cannot mark it (${ROWS_ONLY_MARKER}); copy it with a full run`,
    );
  }
  if (ROWS_ONLY_MARKER in metadata) {
    throw new Error(
      `storage.files ${id}: metadata already has a ${ROWS_ONLY_MARKER} key; refusing to overwrite it`,
    );
  }
  return { ...(metadata as Record<string, unknown>), [ROWS_ONLY_MARKER]: true };
};

export interface RowSink {
  /** Ids already in the target's `files`, for this bucket. */
  existingIds(): Promise<Set<string>>;
  /** Those of them that still carry `ROWS_ONLY_MARKER` (no verified object). */
  markedIds(): Promise<Set<string>>;
  /**
   * Returns true when a row was inserted, false when it was already there. A
   * `rows-only` insert stamps `ROWS_ONLY_MARKER`; a `verified` one never does.
   */
  insert(row: SourceFile, bucket: string, mode: InsertMode): Promise<boolean>;
  /** Removes `ROWS_ONLY_MARKER` from a row whose object is now verified. */
  clearMarker(id: string): Promise<void>;
}

export const pgRowSink = (pool: Pool, bucket: string): RowSink => ({
  async existingIds() {
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id::text AS id FROM files WHERE bucket = $1",
      [bucket],
    );
    return new Set(rows.map((r) => r.id));
  },
  async markedIds() {
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id::text AS id FROM files WHERE bucket = $1 AND metadata ? $2",
      [bucket, ROWS_ONLY_MARKER],
    );
    return new Set(rows.map((r) => r.id));
  },
  async insert(row, targetBucket, mode) {
    const result = await pool.query<{ inserted: boolean }>(INSERT_FILE, [
      row.id,
      targetBucket,
      row.id,
      row.size,
      row.mime_type,
      row.etag,
      row.uploaded_by_user_id,
      // verified_at: known-good already-served files (migrate-files.ts's doc).
      // Set in rows-only mode too — see ROWS_ONLY_MARKER for why.
      new Date(),
      mode === "rows-only"
        ? withRowsOnlyMarker(row.id, row.metadata)
        : (row.metadata ?? {}),
      row.created_at,
      row.updated_at,
    ]);
    return result.rows[0]?.inserted === true;
  },
  async clearMarker(id) {
    await pool.query(
      "UPDATE files SET metadata = metadata - $2 WHERE id = $1 AND bucket = $3",
      [id, ROWS_ONLY_MARKER, bucket],
    );
  },
});

// ---------------------------------------------------------------- rows only

export type RowsOnlySummary = {
  /** Uploaded rows considered. */
  total: number;
  inserted: number;
  unchanged: number;
  /** `is_uploaded = false`: never migrated, in either mode. */
  skipped: string[];
};

/**
 * `--rows-only` (`cutover.sh`'s `FILES_MODE=rows-only`): write the `files` row
 * for every uploaded `storage.files` row — the same `INSERT_FILE`, through the
 * same `RowSink`, as a full run, but stamped with `ROWS_ONLY_MARKER` — and
 * copy NO object and contact no object store at all.
 *
 * What it is for: `09`, `10` and `12` repoint six foreign keys onto
 * `public.files` and abort if a referenced row is not there, so a rehearsal
 * without the objects (production data, no object store at hand) still needs
 * the rows; and a two-step cutover writes the rows inside the freeze and
 * copies the objects outside it. A later full run finds these rows, sees no
 * object behind them (`alreadyThere` checks the object, not just the row) and
 * copies them, or re-verifies what is there: a marked row is not treated as a
 * commit marker (`alreadyThere`), even when an object of the right size sits
 * behind it — that object could be anything.
 *
 * What it gives up: a full run inserts a row only after its object was
 * verified, so an unmarked row means "these bytes are in the target". A marked
 * one means only "this file existed at the source". Until a full run has
 * finished, a row can point at nothing, and one whose object turns out to be
 * missing at the source stays pointing at nothing and stays marked (a full run
 * lists it as `missing-at-source` and counts it in `rowsUnconfirmed`).
 * `verified_at` is still set, as a full run sets it, so `MaintenanceActor`'s
 * orphan reaper never touches these rows; the marker, not `verified_at`, is
 * what says the bytes are unverified (`ROWS_ONLY_MARKER`). A row that already
 * exists unmarked (a full run got there first) is left alone, unmarked.
 */
export const insertRowsOnly = async (
  rows: readonly SourceFile[],
  sink: RowSink,
  bucket: string,
): Promise<RowsOnlySummary> => {
  const summary: RowsOnlySummary = {
    total: 0,
    inserted: 0,
    unchanged: 0,
    skipped: [],
  };
  const existing = await sink.existingIds();
  for (const row of rows) {
    if (!row.is_uploaded) {
      summary.skipped.push(row.id);
      continue;
    }
    summary.total += 1;
    if (
      existing.has(row.id) ||
      !(await sink.insert(row, bucket, "rows-only"))
    ) {
      summary.unchanged += 1;
    } else {
      summary.inserted += 1;
    }
    existing.add(row.id);
  }
  return summary;
};

// ---------------------------------------------------------------- hashing

/** The MD5 an S3 ETag stands for, when it is a single-part one. */
export const md5FromEtag = (etag: string | null): string | null => {
  if (etag === null) return null;
  const bare = etag.replace(/^"|"$/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(bare) ? bare : null;
};

type Meter = {
  stream: Transform;
  bytes(): number;
  md5(): string;
  sha256(): string;
  stop(): void;
};

/**
 * A pass-through that counts and hashes every byte, and calls `onStall` if no
 * byte arrives for `stallMs` — measured from creation, so a source that sends
 * headers and then nothing is caught too.
 */
const meter = (stallMs: number, onStall: () => void): Meter => {
  let bytes = 0;
  const md5 = createHash("md5");
  const sha = createHash("sha256");
  let timer: NodeJS.Timeout | undefined;
  const kick = () => {
    clearTimeout(timer);
    timer = setTimeout(onStall, stallMs);
  };
  const stop = () => clearTimeout(timer);
  kick();
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      md5.update(chunk);
      sha.update(chunk);
      kick();
      callback(null, chunk);
    },
    flush(callback) {
      stop();
      callback();
    },
    destroy(error, callback) {
      stop();
      callback(error);
    },
  });
  let md5Hex: string | null = null;
  let shaHex: string | null = null;
  return {
    stream,
    bytes: () => bytes,
    md5: () => {
      md5Hex ??= md5.digest("hex");
      return md5Hex;
    },
    sha256: () => {
      shaHex ??= sha.digest("hex");
      return shaHex;
    },
    stop,
  };
};

const hashStream = async (
  body: Readable,
  algorithm: "md5" | "sha256",
): Promise<{ hex: string; bytes: number }> => {
  const hash = createHash(algorithm);
  let bytes = 0;
  for await (const chunk of body) {
    const buf = chunk as Buffer;
    bytes += buf.length;
    hash.update(buf);
  }
  return { hex: hash.digest("hex"), bytes };
};

// ---------------------------------------------------------------- engine

export const OUTCOME_KINDS = [
  "copied",
  "skipped-present",
  "missing-at-source",
  "size-mismatch",
  "hash-mismatch",
  "failed",
] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export type Outcome = { id: string; kind: OutcomeKind; detail: string };

export type EngineOptions = {
  rows: readonly SourceFile[];
  source: ObjectSource;
  target: ObjectTarget;
  sink: RowSink;
  targetBucket: string;
  concurrency: number;
  maxAttempts: number;
  retryBaseMs: number;
  retryMaxMs: number;
  stallTimeoutMs: number;
  /** Stop scheduling new objects once more than this many are missing. */
  maxMissing: number;
  progressEveryMs: number;
  log: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
};

export type Summary = {
  total: number;
  counts: Record<OutcomeKind, number>;
  rowsInserted: number;
  rowsUnchanged: number;
  /** Rows-only rows whose object this run verified, and whose marker it cleared. */
  rowsConfirmed: number;
  /**
   * Rows that still carry `ROWS_ONLY_MARKER` when the run ends — missing at the
   * source, failed, mismatched, or never attempted. Their bytes are unverified.
   */
  rowsUnconfirmed: string[];
  bytesCopied: number;
  bytesPresent: number;
  problems: Outcome[];
  /** Why the run stopped early, or null if every row was attempted. */
  aborted: {
    reason: "missing-threshold" | "source-auth";
    detail: string;
  } | null;
  maxInFlight: number;
  retries: number;
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Full-jitter exponential backoff, or the server's `Retry-After` if longer. */
export const backoffMs = (
  attempt: number,
  baseMs: number,
  maxMs: number,
  retryAfterMs: number | null,
  random = Math.random,
): number => {
  const ceiling = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
  const jittered = ceiling / 2 + random() * (ceiling / 2);
  return Math.max(jittered, Math.min(retryAfterMs ?? 0, 120_000));
};

export const formatBytes = (n: number): string => {
  if (n < 1024) return `${String(n)} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit] ?? "TiB"}`;
};

export const runCopy = async (options: EngineOptions): Promise<Summary> => {
  const sleep = options.sleep ?? defaultSleep;
  const { source, target, sink, targetBucket } = options;
  const counts = Object.fromEntries(OUTCOME_KINDS.map((k) => [k, 0])) as Record<
    OutcomeKind,
    number
  >;
  const summary: Summary = {
    total: options.rows.length,
    counts,
    rowsInserted: 0,
    rowsUnchanged: 0,
    rowsConfirmed: 0,
    rowsUnconfirmed: [],
    bytesCopied: 0,
    bytesPresent: 0,
    problems: [],
    aborted: null,
    maxInFlight: 0,
    retries: 0,
  };
  const existing = await sink.existingIds();
  // Rows-only rows: a row, but no verified object behind it (ROWS_ONLY_MARKER).
  const marked = await sink.markedIds();
  let inFlight = 0;
  let next = 0;
  const started = Date.now();

  const progress = () => {
    const done = OUTCOME_KINDS.reduce((n, k) => n + counts[k], 0);
    const secs = Math.max(1, (Date.now() - started) / 1000);
    options.log(
      `progress  ${String(done)}/${String(summary.total)}` +
        ` copied=${String(counts.copied)} skipped_present=${String(counts["skipped-present"])}` +
        ` missing=${String(counts["missing-at-source"])}` +
        ` mismatch=${String(counts["size-mismatch"] + counts["hash-mismatch"])}` +
        ` failed=${String(counts.failed)}` +
        ` bytes=${formatBytes(summary.bytesCopied)}` +
        ` (${formatBytes(summary.bytesCopied / secs)}/s)`,
    );
  };
  const ticker = setInterval(progress, options.progressEveryMs);
  ticker.unref();

  const record = async (row: SourceFile, outcome: Outcome, bytes: number) => {
    counts[outcome.kind] += 1;
    if (outcome.kind === "copied" || outcome.kind === "skipped-present") {
      if (outcome.kind === "copied") summary.bytesCopied += bytes;
      else summary.bytesPresent += bytes;
      if (existing.has(row.id)) {
        summary.rowsUnchanged += 1;
        if (marked.has(row.id)) {
          // The object behind a rows-only row is now verified: the row means
          // "bytes verified" again, like any other unmarked row.
          await sink.clearMarker(row.id);
          marked.delete(row.id);
          summary.rowsConfirmed += 1;
        }
      } else if (await sink.insert(row, targetBucket, "verified")) {
        summary.rowsInserted += 1;
        existing.add(row.id);
      } else {
        summary.rowsUnchanged += 1;
        existing.add(row.id);
      }
    } else {
      summary.problems.push(outcome);
      if (
        outcome.kind === "missing-at-source" &&
        counts["missing-at-source"] > options.maxMissing &&
        summary.aborted === null
      ) {
        summary.aborted = {
          reason: "missing-threshold",
          detail:
            `${String(counts["missing-at-source"])} objects missing at the source, over ` +
            `FILES_MAX_MISSING=${String(options.maxMissing)} — a wrong SOURCE_STORAGE_URL ` +
            "(another project) looks exactly like this",
        };
      }
    }
  };

  /** Is what is already at the target this row's bytes? */
  const alreadyThere = async (row: SourceFile): Promise<number | null> => {
    const stat = await target.stat(row.id);
    if (stat === null) return null;
    if (row.size !== null && stat.size !== row.size) return null;
    // A full run writes a `files` row only after its object was verified, so
    // an UNMARKED row + matching size is the commit marker of an earlier
    // verified copy. A `--rows-only` row (ROWS_ONLY_MARKER) is not: it was
    // written with no object at all, so a same-size object behind it proves
    // nothing about its bytes, and falls through to the re-verify below.
    if (existing.has(row.id) && !marked.has(row.id)) return stat.size;
    // An object with no verified row: an earlier run died between the upload
    // and the insert, or the row came from --rows-only. Re-verify it locally
    // against Nhost's own MD5, when there is one, rather than downloading it
    // again; with no usable MD5, or a mismatch, it is copied (copyOnce
    // verifies and replaces it).
    const want = md5FromEtag(row.etag);
    if (want === null) return null;
    const got = await hashStream(await target.read(row.id), "md5");
    return got.hex === want && got.bytes === stat.size ? stat.size : null;
  };

  const copyOnce = async (
    row: SourceFile,
  ): Promise<{ outcome: Outcome; bytes: number }> => {
    const id = row.id;
    const abort = new AbortController();
    const opened = await source.open(id, abort.signal);
    if (opened.kind === "missing") {
      return {
        outcome: { id, kind: "missing-at-source", detail: opened.detail },
        bytes: 0,
      };
    }
    const { body, contentLength } = opened.object;
    if (
      row.size !== null &&
      contentLength !== null &&
      contentLength !== row.size
    ) {
      body.destroy();
      abort.abort();
      return {
        outcome: {
          id,
          kind: "size-mismatch",
          detail: `source sends ${String(contentLength)} bytes; storage.files.size is ${String(row.size)}`,
        },
        bytes: 0,
      };
    }
    const m = meter(options.stallTimeoutMs, () => {
      const stalled = new RetryableError(
        `${id}: no bytes for ${String(options.stallTimeoutMs)}ms`,
      );
      abort.abort();
      // The meter first: destroying a web-stream-backed body waits on the
      // reader's cancel, which a stalled connection may never settle.
      m.stream.destroy(stalled);
      body.destroy(stalled);
    });
    body.on("error", (error) => {
      m.stream.destroy(
        error instanceof RetryableError
          ? error
          : new RetryableError(`${id}: source body: ${describe(error)}`),
      );
    });
    body.pipe(m.stream);
    let put: { etag: string };
    try {
      put = await target.put(
        id,
        m.stream,
        contentLength ?? row.size,
        row.mime_type,
      );
    } catch (error) {
      body.destroy();
      abort.abort();
      // A source body that failed mid-stream arrives here as the error the
      // meter was destroyed with; anything else is the target's, and a
      // dropped connection to it is as worth retrying as one to the source.
      if (error instanceof RetryableError || error instanceof PermanentError) {
        throw error;
      }
      throw new RetryableError(`upload ${id}: ${describe(error)}`);
    } finally {
      m.stop();
    }
    const bytes = m.bytes();
    const discard = async (kind: OutcomeKind, detail: string) => {
      // Ours to delete: the target is the new stack's store, and a wrong
      // object left there would read as "present" to the next run.
      await target.remove(id).catch(() => {});
      return { outcome: { id, kind, detail }, bytes: 0 };
    };
    const expected = row.size ?? contentLength;
    if (expected !== null && bytes !== expected) {
      return discard(
        "size-mismatch",
        `received ${String(bytes)} bytes; expected ${String(expected)}`,
      );
    }
    const nhostMd5 = md5FromEtag(row.etag);
    if (nhostMd5 !== null && nhostMd5 !== m.md5()) {
      return discard(
        "hash-mismatch",
        `received bytes hash to md5 ${m.md5()}; storage.files.etag says ${nhostMd5}`,
      );
    }
    // What landed: size, then bytes — by the upload's own MD5 ETag when it is
    // a single-part one, otherwise by reading it back.
    const landed = await target.stat(id);
    if (landed === null || landed.size !== bytes) {
      return discard(
        "size-mismatch",
        `target holds ${String(landed?.size ?? "nothing")} bytes after writing ${String(bytes)}`,
      );
    }
    const putMd5 = md5FromEtag(put.etag);
    if (putMd5 === null || putMd5 !== m.md5()) {
      const back = await hashStream(await target.read(id), "sha256");
      if (back.hex !== m.sha256()) {
        return discard(
          "hash-mismatch",
          `target read-back sha256 ${back.hex} != streamed ${m.sha256()}`,
        );
      }
    }
    return { outcome: { id, kind: "copied", detail: "" }, bytes };
  };

  const migrateOne = async (
    row: SourceFile,
  ): Promise<{ outcome: Outcome; bytes: number }> => {
    const id = row.id;
    try {
      const present = await alreadyThere(row);
      if (present !== null) {
        return {
          outcome: { id, kind: "skipped-present", detail: "" },
          bytes: present,
        };
      }
    } catch (error) {
      return {
        outcome: {
          id,
          kind: "failed",
          detail: `target check: ${describe(error)}`,
        },
        bytes: 0,
      };
    }
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await copyOnce(row);
      } catch (error) {
        if (error instanceof SourceAuthError) throw error;
        const retryable = error instanceof RetryableError;
        if (!retryable || attempt >= options.maxAttempts) {
          return {
            outcome: {
              id,
              kind: "failed",
              detail: `${retryable ? `after ${String(attempt)} attempts: ` : ""}${describe(error)}`,
            },
            bytes: 0,
          };
        }
        summary.retries += 1;
        await sleep(
          backoffMs(
            attempt,
            options.retryBaseMs,
            options.retryMaxMs,
            error.retryAfterMs,
          ),
        );
      }
    }
  };

  const worker = async () => {
    while (summary.aborted === null && next < options.rows.length) {
      const row = options.rows[next];
      next += 1;
      if (row === undefined) break;
      inFlight += 1;
      summary.maxInFlight = Math.max(summary.maxInFlight, inFlight);
      try {
        const { outcome, bytes } = await migrateOne(row);
        await record(row, outcome, bytes);
      } catch (error) {
        if (error instanceof SourceAuthError) {
          summary.aborted ??= {
            reason: "source-auth",
            detail: error.message,
          };
          counts.failed += 1;
          summary.problems.push({
            id: row.id,
            kind: "failed",
            detail: error.message,
          });
        } else {
          throw error;
        }
      } finally {
        inFlight -= 1;
      }
    }
  };

  try {
    await Promise.all(
      Array.from(
        {
          length: Math.max(
            1,
            Math.min(options.concurrency, options.rows.length),
          ),
        },
        worker,
      ),
    );
  } finally {
    clearInterval(ticker);
  }
  summary.rowsUnconfirmed = [...marked].sort();
  progress();
  return summary;
};

// ---------------------------------------------------------------- preflight

export type ProbeResult = { ok: boolean; unreachable: boolean; line: string };

/**
 * Proves the storage URL answers and the admin secret is accepted, reading no
 * object bytes: two `HEAD`s, which hasura-storage answers from metadata alone.
 *
 * 1. A random id: an accepted admin secret gets Hasura's null → **404**; a
 *    rejected one gets `access-denied` → **403**. Needs no known file.
 * 2. A known uploaded id, when there is one: **200**, and its `Content-Length`
 *    (the metadata size) should equal `storage.files.size` — which proves this
 *    is the project the rows came from, not merely *a* project.
 */
export const probeStorageApi = async (
  options: StorageApiOptions,
  known: { id: string; size: number | null } | null,
): Promise<ProbeResult[]> => {
  const results: ProbeResult[] = [];
  const where = `${options.baseUrl.origin}${options.baseUrl.pathname}`;
  const head = async (id: string): Promise<Response | ProbeResult> => {
    try {
      const response = await storageRequest(
        options,
        "HEAD",
        id,
        new AbortController().signal,
      );
      await drain(response);
      return response;
    } catch (error) {
      return {
        ok: false,
        unreachable: true,
        line: `FAIL source storage API (${where}): ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  };
  const status = (r: Response) =>
    `HTTP ${String(r.status)}${r.headers.get("x-error") === null ? "" : ` (${String(r.headers.get("x-error"))})`}`;

  const random = await head(randomUUID());
  if (!(random instanceof Response)) return [random];
  if (random.status === 404) {
    results.push({
      ok: true,
      unreachable: false,
      line: `ok   source storage API: ${where} answers and accepts the admin secret (unknown id -> 404)`,
    });
  } else {
    results.push({
      ok: false,
      unreachable: false,
      line:
        random.status === 401 || random.status === 403
          ? `FAIL source storage API: ${where} refused the admin secret: ${status(random)}`
          : `FAIL source storage API: ${where} answered an unknown id with ${status(random)}, not 404 — is this a Nhost storage /v1 URL?`,
    });
    return results;
  }
  if (known === null) {
    results.push({
      ok: true,
      unreachable: false,
      line: "note source storage API: no uploaded file id to probe; only the secret was checked",
    });
    return results;
  }
  const hit = await head(known.id);
  if (!(hit instanceof Response)) return [...results, hit];
  const length = parseLength(hit.headers.get("content-length"));
  if (hit.status !== 200) {
    results.push({
      ok: false,
      unreachable: false,
      line:
        `FAIL source storage API: known file ${known.id} -> ${status(hit)}` +
        (hit.status === 404
          ? " — the rows came from a different project than SOURCE_STORAGE_URL"
          : ""),
    });
  } else if (known.size !== null && length !== known.size) {
    results.push({
      ok: false,
      unreachable: false,
      line: `FAIL source storage API: known file ${known.id} is ${String(length)} bytes there, ${String(known.size)} in storage.files`,
    });
  } else {
    results.push({
      ok: true,
      unreachable: false,
      line: `ok   source storage API: known file ${known.id} -> 200, ${String(length)} bytes (metadata only; no body read)`,
    });
  }
  return results;
};
