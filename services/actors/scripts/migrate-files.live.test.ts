/**
 * `scripts/migrate-files.ts --` the real CLI, as an operator runs it — in
 * `SOURCE_MODE=storage-api` against the stub Storage API
 * (`migrate-files-stub.ts`), writing to a **real MinIO** and a real Postgres.
 * The engine's edge cases are `migrate-files.test.ts`; this file proves the
 * wiring: env parsing, streaming into MinIO (multipart included), the `files`
 * rows, exit codes, `--dry-run`, `--preflight`, resuming after `kill -9`, and
 * that the admin secret never reaches stdout or stderr.
 *
 * Everything it creates is its own and is removed afterwards: a scratch bucket
 * `filesapi-test-<random>` in the shared stack's MinIO (never `cellar-files`),
 * and two `filesapi_test_*` scratch databases carrying this run's suffix.
 *
 * It skips itself unless that MinIO answers on `localhost:9100`
 * (`bun run stack:up`) — the same gate `src/lib/s3-presign.live.test.ts` uses,
 * so a CI leg without MinIO skips fast. `FILES_S3_LIVE_REQUIRED=1` turns the
 * skip into a failure, for a run that means to prove this path.
 *
 * The child runs under `process.execPath` (Bun, under this suite's
 * `bun run --bun vitest`). Set `MIGRATE_FILES_TEST_RUNTIME=<path to node>` to
 * run it under the Node the cutover itself uses. It has to be a path: under
 * `bun run --bun`, a bare `node` on `PATH` is Bun's own shim (measured: it
 * lives in a `bun-node-<hash>` temp directory and reports
 * `process.versions.bun`). The override is checked to really be Node 24+.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client as MinioClient } from "minio";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scratchDatabaseName, scratchUrl } from "../src/auth/testing.ts";
import {
  md5Etag,
  type Stub,
  type StubFile,
  startStub,
} from "./migrate-files-stub.ts";

const HOST = process.env.FILES_S3_LIVE_ENDPOINT ?? "localhost";
const PORT = process.env.FILES_S3_LIVE_PORT ?? "9100";
const ACCESS = process.env.MINIO_ROOT_USER ?? "cellar";
const SECRET_KEY = process.env.MINIO_ROOT_PASSWORD ?? "cellar-dev-secret";

const reachable = async (): Promise<boolean> => {
  try {
    const r = await fetch(`http://${HOST}:${PORT}/minio/health/live`, {
      signal: AbortSignal.timeout(1500),
    });
    return r.ok;
  } catch {
    return false;
  }
};
const up = await reachable();
if (!up && process.env.FILES_S3_LIVE_REQUIRED === "1") {
  throw new Error(`FILES_S3_LIVE_REQUIRED=1 but no MinIO on ${HOST}:${PORT}`);
}

const SCRIPT = fileURLToPath(new URL("./migrate-files.ts", import.meta.url));
const RUNTIME = (() => {
  const wanted = process.env.MIGRATE_FILES_TEST_RUNTIME;
  if (wanted === undefined || wanted === "") return process.execPath;
  const probe = execFileSync(wanted, [
    "-p",
    "process.versions.bun ? 'bun' : process.versions.node",
  ])
    .toString()
    .trim();
  if (probe === "bun" || Number(probe.split(".")[0]) < 24) {
    throw new Error(
      `MIGRATE_FILES_TEST_RUNTIME=${wanted} is ${probe}, not Node >= 24 (.nvmrc)`,
    );
  }
  return wanted;
})();
const ADMIN_SECRET = `live-admin-secret-${randomUUID()}`;

const FILES_DDL = (() => {
  const sql = readFileSync(
    fileURLToPath(
      new URL(
        "../../../packages/db/transform/06_new_tables.sql",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const table = /CREATE TABLE IF NOT EXISTS public\.files \([\s\S]*?\n\);/.exec(
    sql,
  );
  const index =
    /CREATE UNIQUE INDEX IF NOT EXISTS files_bucket_key_idx[\s\S]*?;/.exec(sql);
  if (table === null || index === null) {
    throw new Error(
      "06_new_tables.sql no longer has the files table this test reads",
    );
  }
  return `${table[0]}\n${index[0]}`;
})();

/** Nhost's `storage.files`, as `transform/nhost-schema.sql` has it. */
const STORAGE_DDL = `
CREATE SCHEMA storage;
CREATE TABLE storage.files (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  bucket_id text DEFAULT 'default' NOT NULL,
  name text, size integer, mime_type text, etag text,
  is_uploaded boolean DEFAULT false,
  uploaded_by_user_id uuid, metadata jsonb
);`;

const sql = async <T extends Record<string, unknown>>(
  url: string,
  text: string,
  values: unknown[] = [],
): Promise<T[]> => {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query<T>(text, values)).rows;
  } finally {
    await c.end();
  }
};

const s3 = new MinioClient({
  endPoint: HOST,
  port: Number(PORT),
  useSSL: false,
  accessKey: ACCESS,
  secretKey: SECRET_KEY,
});

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

type World = {
  stub: Stub;
  bucket: string;
  srcUrl: string;
  dstUrl: string;
  bodies: Map<string, Buffer>;
  outputs: string[];
  run(
    args?: string[],
    env?: Record<string, string>,
    onSpawn?: (kill: () => void) => void,
  ): Promise<{ code: number | null; stdout: string; stderr: string }>;
  addRow(
    id: string,
    body: Buffer,
    over?: { is_uploaded?: boolean; size?: number },
  ): Promise<void>;
  objectKeys(): Promise<string[]>;
  object(id: string): Promise<Buffer>;
  dispose(): Promise<void>;
};

const makeWorld = async (tag: string): Promise<World> => {
  const stub = await startStub(ADMIN_SECRET);
  const bucket = `filesapi-test-${randomUUID().slice(0, 8)}`;
  await s3.makeBucket(bucket);
  const dbs = [
    scratchDatabaseName(`filesapi_test_${tag}_src`),
    scratchDatabaseName(`filesapi_test_${tag}_dst`),
  ] as const;
  for (const db of dbs) {
    await sql(
      scratchUrl("postgres"),
      `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`,
    );
    await sql(scratchUrl("postgres"), `CREATE DATABASE "${db}"`);
  }
  const srcUrl = scratchUrl(dbs[0]);
  const dstUrl = scratchUrl(dbs[1]);
  await sql(srcUrl, STORAGE_DDL);
  await sql(dstUrl, FILES_DDL);
  const bodies = new Map<string, Buffer>();
  const outputs: string[] = [];

  const world: World = {
    stub,
    bucket,
    srcUrl,
    dstUrl,
    bodies,
    outputs,
    run: (args = [], env = {}, onSpawn) =>
      new Promise((resolve, reject) => {
        const child = spawn(RUNTIME, [SCRIPT, ...args], {
          env: {
            ...process.env,
            SOURCE_MODE: "storage-api",
            SOURCE_STORAGE_URL: stub.url,
            SOURCE_ADMIN_SECRET: ADMIN_SECRET,
            SOURCE_DATABASE_URL: srcUrl,
            TARGET_DATABASE_URL: dstUrl,
            TARGET_S3_ENDPOINT: HOST,
            TARGET_S3_PORT: PORT,
            TARGET_S3_ACCESS_KEY: ACCESS,
            TARGET_S3_SECRET_KEY: SECRET_KEY,
            TARGET_S3_BUCKET: bucket,
            TARGET_S3_PART_SIZE_MB: "5",
            FILES_CONCURRENCY: "3",
            FILES_RETRY_BASE_MS: "10",
            FILES_RETRY_MAX_MS: "50",
            FILES_PROGRESS_MS: "50",
            ...env,
          },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d: Buffer) => {
          stdout += d.toString();
        });
        child.stderr.on("data", (d: Buffer) => {
          stderr += d.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => {
          outputs.push(stdout, stderr);
          resolve({ code, stdout, stderr });
        });
        onSpawn?.(() => child.kill("SIGKILL"));
      }),
    async addRow(id, body, over = {}) {
      bodies.set(id, body);
      await sql(
        srcUrl,
        `INSERT INTO storage.files (id, name, size, mime_type, etag, is_uploaded, metadata)
         VALUES ($1, $2, $3, 'image/jpeg', $4, $5, '{"k":1}')`,
        [
          id,
          `${id}.jpg`,
          over.size ?? body.length,
          md5Etag(body),
          over.is_uploaded ?? true,
        ],
      );
    },
    async objectKeys() {
      const keys: string[] = [];
      for await (const o of s3.listObjectsV2(bucket, "", true)) {
        const name = (o as { name?: string }).name;
        if (name !== undefined) keys.push(name);
      }
      return keys.sort();
    },
    async object(id) {
      const chunks: Buffer[] = [];
      for await (const c of await s3.getObject(bucket, id))
        chunks.push(c as Buffer);
      return Buffer.concat(chunks);
    },
    async dispose() {
      await stub.close();
      const keys = await world.objectKeys().catch(() => []);
      if (keys.length > 0) await s3.removeObjects(bucket, keys);
      await s3.removeBucket(bucket).catch(() => {});
      for (const db of dbs) {
        await sql(
          scratchUrl("postgres"),
          `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`,
        );
      }
    },
  };
  return world;
};

const gets = (w: World, ids: string[]) =>
  ids.map((i) => w.stub.gets.get(i) ?? 0);

describe.skipIf(!up)(
  "migrate-files.ts, SOURCE_MODE=storage-api, into a real MinIO",
  () => {
    let w: World;
    const ok: string[] = [];
    const throttled = randomUUID();
    const missing = randomUUID();
    const mismatched = randomUUID();
    const notUploaded = randomUUID();
    const large = randomUUID();

    beforeAll(async () => {
      w = await makeWorld("main");
      for (let i = 0; i < 6; i += 1) {
        const fid = randomUUID();
        const body = randomBytes(1000 + i * 7000);
        ok.push(fid);
        w.stub.files.set(fid, { body, chunkBytes: 4096, chunkDelayMs: 5 });
        await w.addRow(fid, body);
      }
      // 24 MiB, well over the 5 MiB part size: a multipart upload, whose ETag is
      // not an MD5, so "what landed" is proven by reading it back.
      const big = randomBytes(24 * 1024 * 1024);
      ok.push(large);
      w.stub.files.set(large, { body: big, chunkBytes: 256 * 1024 });
      await w.addRow(large, big);
      const t = randomBytes(5000);
      ok.push(throttled);
      w.stub.files.set(throttled, { body: t, throttle: 2, retryAfter: "0" });
      await w.addRow(throttled, t);
      await w.addRow(missing, randomBytes(100)); // a row, no object at the source
      const m = randomBytes(4000);
      w.stub.files.set(mismatched, {
        body: m,
        declaredLength: 3999,
      } satisfies StubFile);
      await w.addRow(mismatched, m);
      await w.addRow(notUploaded, randomBytes(10), { is_uploaded: false });
    }, 120_000);

    afterAll(async () => {
      await w?.dispose();
    }, 60_000);

    it("--preflight reads metadata only, and tells a good secret from a bad one and from no answer", async () => {
      const good = await w.run(["--preflight"]);
      expect(good.code).toBe(0);
      expect(good.stdout).toMatch(
        /ok {3}source storage API: .* accepts the admin secret/,
      );
      expect(good.stdout).toMatch(
        /ok {3}source storage API: known file .* -> 200/,
      );
      expect(good.stdout).toMatch(
        /ok {3}target object store: bucket filesapi-test-/,
      );
      expect(w.stub.gets.size).toBe(0);

      const bad = await w.run(["--preflight"], {
        SOURCE_ADMIN_SECRET: "definitely-wrong-secret",
      });
      expect(bad.code).toBe(1);
      expect(bad.stderr).toMatch(/refused the admin secret: HTTP 403/);

      const gone = await w.run(["--preflight"], {
        SOURCE_STORAGE_URL: "http://127.0.0.1:1/v1",
        FILES_HEADER_TIMEOUT_MS: "2000",
      });
      expect(gone.code).toBe(2);
    }, 60_000);

    it("--dry-run writes nothing and fetches nothing", async () => {
      const r = await w.run(["--dry-run"]);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain(
        "[dry-run] 10 uploaded row(s): 0 already present, 0 present without a row",
      );
      expect(r.stdout).toContain("10 to copy");
      expect(await w.objectKeys()).toEqual([]);
      expect(await sql(w.dstUrl, "SELECT 1 FROM files")).toEqual([]);
      expect(w.stub.gets.size).toBe(0);
    }, 60_000);

    it("copies byte-identically under key = id; counts the 404 and the mismatch without stopping", async () => {
      const r = await w.run();
      expect(r.stdout).toContain(
        "objects   copied=8 skipped_present=0 missing_at_source=1 size_mismatch=1 hash_mismatch=0 failed=0",
      );
      expect(r.stdout).toMatch(/^progress {2}\d+\/10 /m);
      expect(r.code).toBe(1); // the mismatch is not complete; rerun resumes
      expect(r.stdout).toContain(
        `missing-at-source ${missing}: HTTP 404 (file not found)`,
      );
      expect(r.stdout).toContain(
        `size-mismatch ${mismatched}: source sends 3999 bytes`,
      );

      expect(await w.objectKeys()).toEqual([...ok].sort());
      for (const fid of ok) {
        expect(sha256(await w.object(fid))).toBe(
          sha256(w.bodies.get(fid) ?? Buffer.alloc(0)),
        );
      }
      const rows = await sql<{
        id: string;
        key: string;
        bucket: string;
        size: number;
        v: boolean;
      }>(
        w.dstUrl,
        "SELECT id::text, key, bucket, size, verified_at IS NOT NULL AS v FROM files ORDER BY id",
      );
      expect(rows.map((x) => x.id)).toEqual([...ok].sort());
      for (const x of rows) {
        expect(x.key).toBe(x.id);
        expect(x.bucket).toBe(w.bucket);
        expect(x.v).toBe(true);
      }
      expect(w.stub.maxInFlight).toBeLessThanOrEqual(3);
      expect(w.stub.gets.get(throttled)).toBe(3);
    }, 120_000);

    it("a rerun resumes: copies only what was not done, and fetches nothing already verified", async () => {
      const before = gets(w, ok);
      const file = w.stub.files.get(mismatched);
      if (file !== undefined) file.declaredLength = undefined; // the source is fixed
      const second = await w.run();
      expect(second.stdout).toContain(
        "objects   copied=1 skipped_present=8 missing_at_source=1 size_mismatch=0 hash_mismatch=0 failed=0",
      );
      expect(second.code).toBe(0);
      expect(second.stderr).toContain(
        "WARNING: 1 object(s) missing at the source",
      );
      expect(gets(w, ok)).toEqual(before);

      const third = await w.run();
      expect(third.stdout).toContain(
        "objects   copied=0 skipped_present=9 missing_at_source=1 size_mismatch=0 hash_mismatch=0 failed=0",
      );
      expect(third.stdout).toContain("rows      inserted=0 unchanged=9");
      expect(gets(w, ok)).toEqual(before);
    }, 120_000);

    it("never prints the admin secret, and refuses to run when it would", async () => {
      const leaky = await w.run([], {
        SOURCE_STORAGE_URL: `${w.stub.url}?s=${ADMIN_SECRET}`,
      });
      expect(leaky.code).toBe(1);
      expect(leaky.stderr).toContain("appears inside SOURCE_STORAGE_URL");
      const short = await w.run([], { SOURCE_ADMIN_SECRET: "abc" });
      expect(short.code).toBe(1);
      expect(short.stderr).toContain("shorter than 8 characters");

      // Every run in this file, stdout and stderr both.
      expect(w.outputs.length).toBeGreaterThanOrEqual(16);
      for (const text of w.outputs) expect(text).not.toContain(ADMIN_SECRET);
      // …and it was really used, not merely absent.
      expect(w.stub.secretsSeen.has(ADMIN_SECRET)).toBe(true);
    }, 60_000);
  },
);

describe.skipIf(!up)("migrate-files.ts after kill -9", () => {
  let w: World;
  const ids: string[] = [];
  let release: () => void = () => {};
  const held = randomUUID();

  beforeAll(async () => {
    w = await makeWorld("resume");
    for (let i = 0; i < 8; i += 1) {
      const fid = randomUUID();
      const body = randomBytes(20_000);
      ids.push(fid);
      w.stub.files.set(fid, { body, chunkBytes: 2048, chunkDelayMs: 2 });
      await w.addRow(fid, body);
    }
    const body = randomBytes(9000);
    w.stub.files.set(held, {
      body,
      hold: new Promise<void>((r) => {
        release = r;
      }),
    });
    await w.addRow(held, body);
  }, 60_000);

  afterAll(async () => {
    release();
    await w?.dispose();
  }, 60_000);

  it("picks up where the killed run stopped", async () => {
    const first = await w.run([], { FILES_CONCURRENCY: "2" }, (kill) => {
      // Kill once every other object has its row: the held one is mid-request.
      const poll = setInterval(() => {
        void sql<{ n: string }>(
          w.dstUrl,
          "SELECT count(*)::text AS n FROM files",
        ).then((r) => {
          if (r[0]?.n === String(ids.length)) {
            clearInterval(poll);
            kill();
          }
        });
      }, 50);
    });
    expect(first.code).toBeNull(); // killed, not exited
    expect(first.stdout).not.toContain("objects   copied=");
    expect(
      await sql(w.dstUrl, "SELECT 1 FROM files WHERE id = $1", [held]),
    ).toEqual([]);

    release();
    const before = gets(w, ids);
    const second = await w.run();
    expect(second.code).toBe(0);
    expect(second.stdout).toContain(
      "objects   copied=1 skipped_present=8 missing_at_source=0 size_mismatch=0 hash_mismatch=0 failed=0",
    );
    expect(gets(w, ids)).toEqual(before);
    expect(before.every((n) => n === 1)).toBe(true);
    expect(sha256(await w.object(held))).toBe(
      sha256(w.bodies.get(held) ?? Buffer.alloc(0)),
    );
    for (const text of w.outputs) expect(text).not.toContain(ADMIN_SECRET);
  }, 120_000);
});

describe.skipIf(!up)(
  "migrate-files.ts, SOURCE_MODE=s3 (the local-rehearsal path), same engine",
  () => {
    let w: World;
    const sourceBucket = `filesapi-test-src-${randomUUID().slice(0, 8)}`;
    const ids: string[] = [];
    const absent = randomUUID();
    const s3env = () => ({
      SOURCE_MODE: "s3",
      SOURCE_STORAGE_URL: "",
      SOURCE_ADMIN_SECRET: "",
      SOURCE_S3_ENDPOINT: HOST,
      SOURCE_S3_PORT: PORT,
      SOURCE_S3_ACCESS_KEY: ACCESS,
      SOURCE_S3_SECRET_KEY: SECRET_KEY,
      SOURCE_S3_BUCKET: sourceBucket,
    });

    beforeAll(async () => {
      w = await makeWorld("s3");
      await s3.makeBucket(sourceBucket);
      for (let i = 0; i < 5; i += 1) {
        const fid = randomUUID();
        const body = randomBytes(3000 + i);
        ids.push(fid);
        await s3.putObject(sourceBucket, fid, body, body.length);
        await w.addRow(fid, body);
      }
      await w.addRow(absent, randomBytes(10)); // a row whose object is not there
    }, 60_000);

    afterAll(async () => {
      const keys: string[] = [];
      for await (const o of s3.listObjectsV2(sourceBucket, "", true)) {
        const name = (o as { name?: string }).name;
        if (name !== undefined) keys.push(name);
      }
      if (keys.length > 0) await s3.removeObjects(sourceBucket, keys);
      await s3.removeBucket(sourceBucket).catch(() => {});
      await w?.dispose();
    }, 60_000);

    it("copies byte-identically, counts the absent object, and a rerun copies nothing", async () => {
      const first = await w.run([], s3env());
      expect(first.stdout).toContain(
        "objects   copied=5 skipped_present=0 missing_at_source=1 size_mismatch=0 hash_mismatch=0 failed=0",
      );
      expect(first.code).toBe(0);
      expect(await w.objectKeys()).toEqual([...ids].sort());
      for (const fid of ids) {
        expect(sha256(await w.object(fid))).toBe(
          sha256(w.bodies.get(fid) ?? Buffer.alloc(0)),
        );
      }
      const second = await w.run([], s3env());
      expect(second.stdout).toContain(
        "objects   copied=0 skipped_present=5 missing_at_source=1",
      );
      const pre = await w.run(["--preflight"], s3env());
      expect(pre.code).toBe(0);
      expect(pre.stdout).toContain(
        `ok   source object store: bucket ${sourceBucket}`,
      );
    }, 60_000);
  },
);

describe.skipIf(!up)(
  "migrate-files.ts --rows-only (FILES_MODE=rows-only), then a full run",
  () => {
    let w: World;
    const ids: string[] = [];
    const notUploaded = randomUUID();
    // Everything the object path needs, made unusable: --rows-only must not
    // read any of it.
    const noObjectStore = {
      SOURCE_MODE: "not-a-mode",
      SOURCE_STORAGE_URL: "",
      SOURCE_ADMIN_SECRET: "",
      TARGET_S3_ENDPOINT: "",
      TARGET_S3_ACCESS_KEY: "",
      TARGET_S3_SECRET_KEY: "",
    };

    beforeAll(async () => {
      w = await makeWorld("rows");
      for (let i = 0; i < 4; i += 1) {
        const fid = randomUUID();
        const body = randomBytes(2000 + i);
        ids.push(fid);
        w.stub.files.set(fid, { body });
        await w.addRow(fid, body);
      }
      await w.addRow(notUploaded, randomBytes(10), { is_uploaded: false });
    }, 60_000);

    afterAll(async () => {
      await w?.dispose();
    }, 60_000);

    it("--preflight --rows-only checks the two databases and no object store", async () => {
      const r = await w.run(["--preflight", "--rows-only"], noObjectStore);
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/ok {3}rows source database/);
      expect(r.stdout).toMatch(/ok {3}target database/);
      expect(`${r.stdout}${r.stderr}`).not.toMatch(
        /(source|target) object store:|storage API:/,
      );
      expect(r.stdout).toContain("no object store is contacted");
      expect(w.stub.heads).toBe(0);
    }, 30_000);

    it("writes every uploaded row, copies nothing, contacts no store, and is idempotent", async () => {
      const first = await w.run(["--rows-only"], noObjectStore);
      expect(first.code).toBe(0);
      expect(first.stdout).toContain("rows      inserted=4 unchanged=0");
      expect(first.stdout).toContain("skipped   1 (is_uploaded = false)");
      expect(first.stdout).toContain("NOT COPIED");
      expect(await w.objectKeys()).toEqual([]);
      expect(gets(w, ids)).toEqual([0, 0, 0, 0]);
      const rows = await sql<{ id: string; bucket: string; key: string }>(
        w.dstUrl,
        "SELECT id::text AS id, bucket, key FROM files WHERE verified_at IS NOT NULL ORDER BY id",
      );
      expect(rows).toEqual(
        [...ids].sort().map((id) => ({ id, bucket: w.bucket, key: id })),
      );
      // Every row carries the rows-only marker, merged onto the source's own
      // metadata ({"k":1}, addRow's) rather than replacing it.
      const meta = await sql<{ id: string; metadata: unknown }>(
        w.dstUrl,
        "SELECT id::text AS id, metadata FROM files ORDER BY id",
      );
      expect(meta).toEqual(
        [...ids]
          .sort()
          .map((id) => ({ id, metadata: { k: 1, cutoverRowsOnly: true } })),
      );
      const again = await w.run(["--rows-only"], noObjectStore);
      expect(again.code).toBe(0);
      expect(again.stdout).toContain("rows      inserted=0 unchanged=4");
    }, 60_000);

    it("a full run afterwards copies every object behind those rows — a same-size stale one included — and clears the marker", async () => {
      // A stale object of exactly the right size behind one rows-only row: the
      // row must not be taken as the commit marker for it.
      const stale = ids[0] ?? "";
      const size = w.bodies.get(stale)?.length ?? 0;
      await s3.putObject(w.bucket, stale, randomBytes(size), size);
      const dry = await w.run(["--dry-run"]);
      expect(dry.stdout).toContain(
        "4 rows-only row(s) to verify (cutoverRowsOnly)",
      );
      const full = await w.run();
      expect(full.code).toBe(0);
      expect(full.stdout).toContain(
        "rows      inserted=0 unchanged=4 confirmed=4 unconfirmed=0",
      );
      expect(full.stdout).toContain(
        "objects   copied=4 skipped_present=0 missing_at_source=0",
      );
      expect(await w.objectKeys()).toEqual([...ids].sort());
      for (const fid of ids) {
        expect(sha256(await w.object(fid))).toBe(
          sha256(w.bodies.get(fid) ?? Buffer.alloc(0)),
        );
      }
      const meta = await sql<{ id: string; metadata: unknown }>(
        w.dstUrl,
        "SELECT id::text AS id, metadata FROM files ORDER BY id",
      );
      expect(meta).toEqual(
        [...ids].sort().map((id) => ({ id, metadata: { k: 1 } })),
      );
      // Now ordinary verified rows: a rerun is the fast path again.
      const rerun = await w.run();
      expect(rerun.stdout).toContain(
        "rows      inserted=0 unchanged=4 confirmed=0 unconfirmed=0",
      );
      expect(rerun.stdout).toContain("objects   copied=0 skipped_present=4");
    }, 60_000);
  },
);
