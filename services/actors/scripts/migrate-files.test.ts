/**
 * `migrate-files-core.ts`'s copy engine and storage-api source, against the
 * stub Storage API (`migrate-files-stub.ts`) and an in-memory target. Needs no
 * MinIO and no database, so it runs everywhere the suite does — CI included.
 * The real-MinIO, real-Postgres, real-CLI half is `migrate-files.live.test.ts`.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSecretSafe,
  backoffMs,
  type EngineOptions,
  insertRowsOnly,
  makeRedactor,
  md5FromEtag,
  type ObjectTarget,
  parseRetryAfter,
  parseStorageUrl,
  probeStorageApi,
  ROWS_ONLY_MARKER,
  type RowSink,
  runCopy,
  type SourceFile,
  storageApiSource,
  withRowsOnlyMarker,
} from "./migrate-files-core.ts";
import {
  md5Etag,
  type Stub,
  type StubFile,
  startStub,
} from "./migrate-files-stub.ts";

const SECRET = `test-admin-secret-${randomUUID()}`;

const memoryTarget = () => {
  const objects = new Map<
    string,
    { body: Buffer; contentType: string | null }
  >();
  const target: ObjectTarget & {
    objects: typeof objects;
    reads: number;
    removes: string[];
  } = {
    label: "memory",
    objects,
    reads: 0,
    removes: [],
    async stat(key) {
      const o = objects.get(key);
      return o === undefined
        ? null
        : { size: o.body.length, etag: md5Etag(o.body) };
    },
    async put(key, body, _size, contentType) {
      const chunks: Buffer[] = [];
      for await (const c of body) chunks.push(c as Buffer);
      const buf = Buffer.concat(chunks);
      objects.set(key, { body: buf, contentType });
      return { etag: md5Etag(buf) };
    },
    async read(key) {
      target.reads += 1;
      return Readable.from([objects.get(key)?.body ?? Buffer.alloc(0)]);
    },
    async remove(key) {
      target.removes.push(key);
      objects.delete(key);
    },
  };
  return target;
};

/** `files` in memory: id -> metadata, written the way `pgRowSink` writes it. */
const memorySink = () => {
  const rows = new Set<string>();
  const metadata = new Map<string, Record<string, unknown>>();
  const isMarked = (id: string) => ROWS_ONLY_MARKER in (metadata.get(id) ?? {});
  const sink: RowSink & {
    rows: Set<string>;
    metadata: typeof metadata;
    isMarked: typeof isMarked;
    cleared: string[];
  } = {
    rows,
    metadata,
    isMarked,
    cleared: [],
    existingIds: async () => new Set(rows),
    markedIds: async () => new Set([...rows].filter(isMarked)),
    async insert(row, _bucket, mode) {
      if (rows.has(row.id)) return false;
      rows.add(row.id);
      metadata.set(
        row.id,
        mode === "rows-only"
          ? withRowsOnlyMarker(row.id, row.metadata)
          : ((row.metadata ?? {}) as Record<string, unknown>),
      );
      return true;
    },
    async clearMarker(id) {
      sink.cleared.push(id);
      const { [ROWS_ONLY_MARKER]: _gone, ...rest } = metadata.get(id) ?? {};
      metadata.set(id, rest);
    },
  };
  return sink;
};

const row = (
  id: string,
  body: Buffer,
  over: Partial<SourceFile> = {},
): SourceFile => ({
  id,
  bucket_id: "default",
  name: `${id}.bin`,
  size: body.length,
  mime_type: "image/png",
  etag: md5Etag(body),
  uploaded_by_user_id: null,
  metadata: {},
  is_uploaded: true,
  created_at: new Date(0),
  updated_at: new Date(0),
  ...over,
});

let stub: Stub | undefined;
afterEach(async () => {
  await stub?.close();
  stub = undefined;
});

const setup = async (
  files: Record<string, StubFile>,
  rowOverrides: Record<string, Partial<SourceFile>> = {},
) => {
  stub = await startStub(SECRET);
  for (const [id, f] of Object.entries(files)) stub.files.set(id, f);
  const rows = Object.entries(files).map(([id, f]) =>
    row(id, f.body, rowOverrides[id]),
  );
  return { stub, rows };
};

const engine = (
  s: Stub,
  rows: SourceFile[],
  target = memoryTarget(),
  sink = memorySink(),
  over: Partial<EngineOptions> = {},
) => {
  const sleeps: number[] = [];
  const lines: string[] = [];
  const options: EngineOptions = {
    rows,
    source: storageApiSource({
      baseUrl: parseStorageUrl(s.url),
      adminSecret: SECRET,
      headerTimeoutMs: 5000,
    }),
    target,
    sink,
    targetBucket: "cellar-files",
    concurrency: 4,
    maxAttempts: 4,
    retryBaseMs: 1,
    retryMaxMs: 5,
    stallTimeoutMs: 2000,
    maxMissing: 10,
    progressEveryMs: 60_000,
    log: (l) => lines.push(l),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...over,
  };
  return { options, target, sink, sleeps, lines, run: () => runCopy(options) };
};

const id = () => randomUUID();

describe("storage-api copy engine", () => {
  it("copies byte-identically, under key = the file's id, with the row's type", async () => {
    const a = id();
    const b = id();
    const bodyA = randomBytes(70_000);
    const bodyB = randomBytes(3);
    const { stub: s, rows } = await setup({
      [a]: { body: bodyA, chunkBytes: 4096 },
      [b]: { body: bodyB },
    });
    const e = engine(s, rows);
    const summary = await e.run();
    expect(summary.counts.copied).toBe(2);
    expect(summary.bytesCopied).toBe(bodyA.length + bodyB.length);
    expect([...e.target.objects.keys()].sort()).toEqual([a, b].sort());
    expect(e.target.objects.get(a)?.body.equals(bodyA)).toBe(true);
    expect(e.target.objects.get(b)?.body.equals(bodyB)).toBe(true);
    expect(e.target.objects.get(a)?.contentType).toBe("image/png");
    expect([...e.sink.rows].sort()).toEqual([a, b].sort());
    expect(s.secretsSeen).toEqual(new Set([SECRET]));
  });

  it("a rerun copies nothing and never contacts the source", async () => {
    const ids = [id(), id(), id()];
    const { stub: s, rows } = await setup(
      Object.fromEntries(ids.map((i) => [i, { body: randomBytes(1000) }])),
    );
    const target = memoryTarget();
    const sink = memorySink();
    await engine(s, rows, target, sink).run();
    const getsBefore = [...s.gets.values()].reduce((a, b) => a + b, 0);
    const second = await engine(s, rows, target, sink).run();
    expect(second.counts.copied).toBe(0);
    expect(second.counts["skipped-present"]).toBe(3);
    expect(second.rowsUnchanged).toBe(3);
    expect([...s.gets.values()].reduce((a, b) => a + b, 0)).toBe(getsBefore);
    // An unmarked row + a same-size object is the commit marker: not even the
    // target copy is read back.
    expect(target.reads).toBe(0);
    expect(second.rowsConfirmed).toBe(0);
    expect(second.rowsUnconfirmed).toEqual([]);
  });

  it("an object with no row (died before the insert) is re-verified locally, not re-downloaded", async () => {
    const a = id();
    const body = randomBytes(5000);
    const { stub: s, rows } = await setup({ [a]: { body } });
    const target = memoryTarget();
    target.objects.set(a, { body, contentType: "image/png" });
    const sink = memorySink();
    const summary = await engine(s, rows, target, sink).run();
    expect(summary.counts["skipped-present"]).toBe(1);
    expect(summary.rowsInserted).toBe(1);
    expect(s.gets.get(a) ?? 0).toBe(0);
    expect(target.reads).toBe(1);
  });

  it("an object with no row and the wrong bytes is copied again", async () => {
    const a = id();
    const body = randomBytes(5000);
    const { stub: s, rows } = await setup({ [a]: { body } });
    const target = memoryTarget();
    target.objects.set(a, { body: randomBytes(5000), contentType: null });
    const summary = await engine(s, rows, target).run();
    expect(summary.counts.copied).toBe(1);
    expect(target.objects.get(a)?.body.equals(body)).toBe(true);
  });

  it("counts a 404 as missing-at-source and goes on", async () => {
    const present = id();
    const gone = id();
    const { stub: s } = await setup({ [present]: { body: randomBytes(10) } });
    const rows = [
      row(gone, randomBytes(10)),
      row(present, s.files.get(present)?.body ?? Buffer.alloc(0)),
    ];
    const e = engine(s, rows);
    const summary = await e.run();
    expect(summary.counts["missing-at-source"]).toBe(1);
    expect(summary.counts.copied).toBe(1);
    expect(summary.problems).toEqual([
      {
        id: gone,
        kind: "missing-at-source",
        detail: "HTTP 404 (file not found)",
      },
    ]);
    expect(e.sink.rows.has(gone)).toBe(false);
    expect(summary.aborted).toBeNull();
  });

  it("stops scheduling once missing objects pass FILES_MAX_MISSING", async () => {
    const { stub: s } = await setup({});
    const rows = Array.from({ length: 20 }, () => row(id(), randomBytes(4)));
    const summary = await engine(s, rows, memoryTarget(), memorySink(), {
      concurrency: 1,
      maxMissing: 2,
    }).run();
    expect(summary.aborted?.reason).toBe("missing-threshold");
    expect(summary.counts["missing-at-source"]).toBe(3);
  });

  it("retries a 429 (honouring Retry-After) and then copies", async () => {
    const a = id();
    const body = randomBytes(2048);
    const { stub: s, rows } = await setup({
      [a]: { body, throttle: 2, retryAfter: "3" },
    });
    const e = engine(s, rows);
    const summary = await e.run();
    expect(summary.counts.copied).toBe(1);
    expect(summary.retries).toBe(2);
    expect(s.gets.get(a)).toBe(3);
    // Retry-After: 3 → at least 3000ms, although retryMaxMs is 5.
    expect(e.sleeps.every((ms) => ms >= 3000)).toBe(true);
    expect(e.target.objects.get(a)?.body.equals(body)).toBe(true);
  });

  it("a persistent 500 (hasura-storage's answer for a row whose object is gone) fails after maxAttempts", async () => {
    const a = id();
    const { stub: s, rows } = await setup({
      [a]: { body: randomBytes(10), status: 500 },
    });
    const summary = await engine(s, rows).run();
    expect(summary.counts.failed).toBe(1);
    expect(s.gets.get(a)).toBe(4);
    expect(summary.problems[0]?.detail).toMatch(
      /after 4 attempts: .*HTTP 500 \(an internal server error occurred\)/,
    );
  });

  it("a declared length that disagrees with storage.files.size is a size-mismatch, and writes nothing", async () => {
    const a = id();
    const body = randomBytes(1000);
    const { stub: s, rows } = await setup({
      [a]: { body, declaredLength: 999 },
    });
    const e = engine(s, rows);
    const summary = await e.run();
    expect(summary.counts["size-mismatch"]).toBe(1);
    expect(summary.problems[0]?.detail).toBe(
      "source sends 999 bytes; storage.files.size is 1000",
    );
    expect(e.target.objects.size).toBe(0);
    expect(e.sink.rows.size).toBe(0);
  });

  it("bytes whose MD5 disagrees with storage.files.etag are a hash-mismatch, and are removed", async () => {
    const a = id();
    const body = randomBytes(1000);
    const { stub: s, rows } = await setup(
      { [a]: { body } },
      { [a]: { etag: md5Etag(randomBytes(1000)) } },
    );
    const e = engine(s, rows);
    const summary = await e.run();
    expect(summary.counts["hash-mismatch"]).toBe(1);
    expect(e.target.removes).toEqual([a]);
    expect(e.target.objects.size).toBe(0);
    expect(e.sink.rows.size).toBe(0);
  });

  it("what landed is read back: a target that stores other bytes is a hash-mismatch", async () => {
    const a = id();
    const body = randomBytes(4000);
    const { stub: s, rows } = await setup({ [a]: { body } });
    const target = memoryTarget();
    const honest = target.put.bind(target);
    // Same length, one byte flipped, and a multipart-style ETag — so neither
    // the size check nor the upload's own ETag can catch it; only a read-back.
    target.put = async (key, stream, size, contentType) => {
      await honest(key, stream, size, contentType);
      const stored = target.objects.get(key);
      if (stored !== undefined) stored.body[0] = (stored.body[0] ?? 0) ^ 0xff;
      return { etag: '"0123456789abcdef0123456789abcdef-2"' };
    };
    const e = engine(s, rows, target);
    const summary = await e.run();
    expect(summary.counts["hash-mismatch"]).toBe(1);
    expect(summary.problems[0]?.detail).toMatch(/target read-back sha256/);
    expect(target.objects.size).toBe(0);
    expect(e.sink.rows.size).toBe(0);
  });

  it("never exceeds the concurrency bound", async () => {
    const files = Object.fromEntries(
      Array.from({ length: 24 }, () => [
        id(),
        { body: randomBytes(20_000), chunkBytes: 2000, chunkDelayMs: 2 },
      ]),
    );
    const { stub: s, rows } = await setup(files);
    const summary = await engine(s, rows, memoryTarget(), memorySink(), {
      concurrency: 3,
    }).run();
    expect(summary.counts.copied).toBe(24);
    expect(summary.maxInFlight).toBe(3);
    expect(s.maxInFlight).toBeLessThanOrEqual(3);
    expect(s.maxInFlight).toBeGreaterThan(1);
  });

  it("a body that stalls is abandoned and retried", async () => {
    const a = id();
    const body = randomBytes(10_000);
    const { stub: s, rows } = await setup({
      [a]: { body, stallFirstAfterBytes: 100 },
    });
    const e = engine(s, rows, memoryTarget(), memorySink(), {
      stallTimeoutMs: 200,
    });
    const summary = await e.run();
    expect(summary.counts.copied).toBe(1);
    expect(summary.retries).toBe(1);
    expect(s.gets.get(a)).toBe(2);
    expect(e.target.objects.get(a)?.body.equals(body)).toBe(true);
  });

  it("refuses a redirect, so the secret never reaches another host", async () => {
    const elsewhere = await startStub("some-other-secret-000");
    try {
      const a = id();
      elsewhere.files.set(a, { body: randomBytes(10) });
      const { stub: s, rows } = await setup({
        [a]: {
          body: randomBytes(10),
          redirectTo: `${elsewhere.url}/files/${a}`,
        },
      });
      const summary = await engine(s, rows).run();
      expect(summary.counts.failed).toBe(1);
      expect(summary.problems[0]?.detail).toMatch(/302.*redirect refused/);
      expect(elsewhere.gets.size).toBe(0);
      expect(elsewhere.secretsSeen.size).toBe(0);
    } finally {
      await elsewhere.close();
    }
  });

  it("a rejected admin secret stops the run at once", async () => {
    const { stub: s } = await setup({});
    const rows = Array.from({ length: 10 }, () => row(id(), randomBytes(4)));
    for (const r of rows) s.files.set(r.id, { body: randomBytes(4) });
    const e = engine(s, rows, memoryTarget(), memorySink(), { concurrency: 1 });
    e.options.source = storageApiSource({
      baseUrl: parseStorageUrl(s.url),
      adminSecret: "wrong-secret-0000",
      headerTimeoutMs: 5000,
    });
    const summary = await e.run();
    expect(summary.aborted?.reason).toBe("source-auth");
    expect(summary.counts.failed).toBe(1);
    expect(summary.aborted?.detail).toContain(
      "HTTP 403 (you are not authorized)",
    );
  });

  it("streams a large body through without truncation", async () => {
    const a = id();
    const body = randomBytes(12 * 1024 * 1024);
    const { stub: s, rows } = await setup({
      [a]: { body, chunkBytes: 256 * 1024 },
    });
    const e = engine(s, rows);
    const summary = await e.run();
    expect(summary.counts.copied).toBe(1);
    const got = e.target.objects.get(a)?.body ?? Buffer.alloc(0);
    expect(createHash("sha256").update(got).digest("hex")).toBe(
      createHash("sha256").update(body).digest("hex"),
    );
  });
});

describe("rows-only (FILES_MODE=rows-only)", () => {
  it("writes a row per uploaded file, skips the rest, and is idempotent", async () => {
    const [a, b, c] = [id(), id(), id()];
    const rows = [
      row(a, randomBytes(10)),
      row(b, randomBytes(20), { is_uploaded: false }),
      row(c, randomBytes(30)),
    ];
    const sink = memorySink();
    const first = await insertRowsOnly(rows, sink, "cellar-files");
    expect(first).toEqual({
      total: 2,
      inserted: 2,
      unchanged: 0,
      skipped: [b],
    });
    expect([...sink.rows].sort()).toEqual([a, c].sort());
    const again = await insertRowsOnly(rows, sink, "cellar-files");
    expect(again).toEqual({
      total: 2,
      inserted: 0,
      unchanged: 2,
      skipped: [b],
    });
  });

  it("stamps metadata.cutoverRowsOnly on the rows it writes, merged onto the source metadata", async () => {
    const [a, b] = [id(), id()];
    const sink = memorySink();
    await insertRowsOnly(
      [
        row(a, randomBytes(10), { metadata: { k: 1 } }),
        row(b, randomBytes(10), { metadata: null }),
      ],
      sink,
      "cellar-files",
    );
    expect(ROWS_ONLY_MARKER).toBe("cutoverRowsOnly");
    expect(sink.metadata.get(a)).toEqual({ k: 1, cutoverRowsOnly: true });
    expect(sink.metadata.get(b)).toEqual({ cutoverRowsOnly: true });
    expect(await sink.markedIds()).toEqual(new Set([a, b]));
  });

  it("never marks a row a full run already verified", async () => {
    const a = id();
    const body = randomBytes(100);
    const { stub: s, rows } = await setup({ [a]: { body } });
    const sink = memorySink();
    await engine(s, rows, memoryTarget(), sink).run();
    expect(sink.isMarked(a)).toBe(false);
    const again = await insertRowsOnly(rows, sink, "cellar-files");
    expect(again.unchanged).toBe(1);
    expect(sink.isMarked(a)).toBe(false);
  });

  it("withRowsOnlyMarker refuses metadata it cannot merge into", () => {
    expect(() => withRowsOnlyMarker("x", [1, 2])).toThrow(/JSON array/);
    expect(() => withRowsOnlyMarker("x", "s")).toThrow(/JSON string/);
    expect(() =>
      withRowsOnlyMarker("x", { [ROWS_ONLY_MARKER]: false }),
    ).toThrow(/already has/);
  });

  it("a full run afterwards still copies every object: a row alone is not the commit marker", async () => {
    const ids = [id(), id(), id()];
    const bodies = new Map(ids.map((i) => [i, randomBytes(5000)]));
    const { stub: s, rows } = await setup(
      Object.fromEntries(
        ids.map((i) => [i, { body: bodies.get(i) ?? Buffer.alloc(0) }]),
      ),
    );
    const sink = memorySink();
    await insertRowsOnly(rows, sink, "cellar-files");
    expect(sink.rows.size).toBe(3);
    const e = engine(s, rows, memoryTarget(), sink);
    const summary = await e.run();
    expect(summary.counts.copied).toBe(3);
    expect(summary.counts["skipped-present"]).toBe(0);
    expect(summary.rowsUnchanged).toBe(3);
    expect(summary.rowsInserted).toBe(0);
    expect(summary.rowsConfirmed).toBe(3);
    expect(summary.rowsUnconfirmed).toEqual([]);
    for (const i of ids) {
      expect(
        e.target.objects.get(i)?.body.equals(bodies.get(i) ?? Buffer.alloc(1)),
      ).toBe(true);
      expect(sink.isMarked(i)).toBe(false);
    }
  });

  it("a SAME-SIZE WRONG object behind a rows-only row is not skipped: it is re-copied, and the marker cleared", async () => {
    const a = id();
    const body = randomBytes(5000);
    const { stub: s, rows } = await setup({ [a]: { body } });
    const sink = memorySink();
    await insertRowsOnly(rows, sink, "cellar-files");
    const target = memoryTarget();
    // A stale object: the right size, not these bytes.
    target.objects.set(a, { body: randomBytes(5000), contentType: null });
    const summary = await engine(s, rows, target, sink).run();
    expect(summary.counts["skipped-present"]).toBe(0);
    expect(summary.counts.copied).toBe(1);
    expect(s.gets.get(a)).toBe(1);
    expect(target.objects.get(a)?.body.equals(body)).toBe(true);
    expect(sink.isMarked(a)).toBe(false);
    expect(summary.rowsConfirmed).toBe(1);
    expect(summary.rowsUnconfirmed).toEqual([]);
  });

  it("the RIGHT object behind a rows-only row is re-verified by MD5, not re-downloaded, and the marker cleared", async () => {
    const a = id();
    const body = randomBytes(5000);
    const { stub: s, rows } = await setup({ [a]: { body } });
    const sink = memorySink();
    await insertRowsOnly(rows, sink, "cellar-files");
    const target = memoryTarget();
    target.objects.set(a, { body, contentType: "image/png" });
    const summary = await engine(s, rows, target, sink).run();
    expect(summary.counts["skipped-present"]).toBe(1);
    expect(summary.counts.copied).toBe(0);
    expect(s.gets.get(a) ?? 0).toBe(0); // the source was never opened for it
    expect(target.reads).toBe(1); // the target copy was hashed instead
    expect(sink.cleared).toEqual([a]);
    expect(sink.isMarked(a)).toBe(false);
    expect(summary.rowsConfirmed).toBe(1);
    // …and from then on it is an ordinary verified row: the fast path.
    const again = await engine(s, rows, target, sink).run();
    expect(again.counts["skipped-present"]).toBe(1);
    expect(target.reads).toBe(1);
    expect(again.rowsConfirmed).toBe(0);
  });

  it("a rows-only row with no usable MD5 is copied, not trusted on size", async () => {
    const a = id();
    const body = randomBytes(5000);
    const { stub: s, rows } = await setup(
      { [a]: { body } },
      { [a]: { etag: '"0123456789abcdef0123456789abcdef-2"' } },
    );
    const sink = memorySink();
    await insertRowsOnly(rows, sink, "cellar-files");
    const target = memoryTarget();
    target.objects.set(a, { body: randomBytes(5000), contentType: null });
    const summary = await engine(s, rows, target, sink).run();
    expect(summary.counts.copied).toBe(1);
    expect(target.objects.get(a)?.body.equals(body)).toBe(true);
    expect(sink.isMarked(a)).toBe(false);
  });

  it("a rows-only row whose object is missing at the source stays marked, and is reported", async () => {
    const present = id();
    const gone = id();
    const { stub: s } = await setup({ [present]: { body: randomBytes(10) } });
    const rows = [
      row(gone, randomBytes(10)),
      row(present, s.files.get(present)?.body ?? Buffer.alloc(0)),
    ];
    const sink = memorySink();
    await insertRowsOnly(rows, sink, "cellar-files");
    const summary = await engine(s, rows, memoryTarget(), sink).run();
    expect(summary.counts["missing-at-source"]).toBe(1);
    expect(summary.counts.copied).toBe(1);
    expect(summary.rowsConfirmed).toBe(1);
    expect(summary.rowsUnconfirmed).toEqual([gone]);
    expect(sink.isMarked(gone)).toBe(true);
    expect(sink.isMarked(present)).toBe(false);
  });
});

describe("probeStorageApi (preflight: no object bytes read)", () => {
  it("accepts a good secret and a known file of the right size, with HEADs only", async () => {
    const a = id();
    const { stub: s } = await setup({ [a]: { body: randomBytes(321) } });
    const results = await probeStorageApi(
      {
        baseUrl: parseStorageUrl(s.url),
        adminSecret: SECRET,
        headerTimeoutMs: 5000,
      },
      { id: a, size: 321 },
    );
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(s.heads).toBe(2);
    expect(s.gets.size).toBe(0);
  });

  it("names a rejected secret", async () => {
    const { stub: s } = await setup({});
    const [r] = await probeStorageApi(
      {
        baseUrl: parseStorageUrl(s.url),
        adminSecret: "nope-nope-nope",
        headerTimeoutMs: 5000,
      },
      null,
    );
    expect(r?.ok).toBe(false);
    expect(r?.line).toMatch(/refused the admin secret: HTTP 403/);
  });

  it("flags a known id the project does not have (rows from another project)", async () => {
    const { stub: s } = await setup({});
    const results = await probeStorageApi(
      {
        baseUrl: parseStorageUrl(s.url),
        adminSecret: SECRET,
        headerTimeoutMs: 5000,
      },
      { id: id(), size: 1 },
    );
    expect(results[1]?.ok).toBe(false);
    expect(results[1]?.line).toMatch(/different project/);
  });

  it("reports an unreachable URL as unreachable", async () => {
    const s = await startStub(SECRET);
    const url = s.url;
    await s.close();
    const [r] = await probeStorageApi(
      {
        baseUrl: parseStorageUrl(url),
        adminSecret: SECRET,
        headerTimeoutMs: 2000,
      },
      null,
    );
    expect(r).toMatchObject({ ok: false, unreachable: true });
  });
});

describe("guards", () => {
  it("parseStorageUrl wants Nhost's /v1 base and no credentials", () => {
    expect(
      parseStorageUrl("https://abc.storage.eu-central-1.nhost.run/v1/").href,
    ).toBe("https://abc.storage.eu-central-1.nhost.run/v1");
    expect(() =>
      parseStorageUrl("https://abc.storage.eu-central-1.nhost.run"),
    ).toThrow(/\/v1/);
    expect(() =>
      parseStorageUrl("https://u:p@abc.storage.x.nhost.run/v1"),
    ).toThrow(/credentials/);
    expect(() =>
      parseStorageUrl("https://abc.storage.x.nhost.run/v1?s=1"),
    ).toThrow(/query/);
  });

  it("assertSecretSafe refuses secrets that could be printed, without printing them", () => {
    const secret = "abcdefgh-123";
    for (const [s, printed] of [
      ["x7q", {}],
      [secret, { SOURCE_STORAGE_URL: `https://x/v1/${secret}` }],
      [`${secret}\n`, {}],
    ] as const) {
      let message = "";
      try {
        assertSecretSafe("SOURCE_ADMIN_SECRET", s, printed);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/refusing to run/);
      expect(message).not.toContain(s.trim());
    }
    expect(() =>
      assertSecretSafe("X", secret, { A: "https://ok/v1" }),
    ).not.toThrow();
  });

  it("makeRedactor removes every occurrence", () => {
    expect(
      makeRedactor(["s3cr3t-value"])("a s3cr3t-value b s3cr3t-value"),
    ).toBe("a *** b ***");
  });

  it("md5FromEtag only trusts single-part ETags", () => {
    expect(md5FromEtag('"0123456789abcdef0123456789ABCDEF"')).toBe(
      "0123456789abcdef0123456789abcdef",
    );
    expect(md5FromEtag('"0123456789abcdef0123456789abcdef-3"')).toBeNull();
    expect(md5FromEtag(null)).toBeNull();
  });

  it("backoff grows, is capped, and yields to a longer Retry-After", () => {
    expect(backoffMs(1, 100, 1000, null, () => 1)).toBe(100);
    expect(backoffMs(3, 100, 1000, null, () => 1)).toBe(400);
    expect(backoffMs(10, 100, 1000, null, () => 1)).toBe(1000);
    expect(backoffMs(10, 100, 1000, null, () => 0)).toBe(500);
    expect(backoffMs(1, 100, 1000, 7000, () => 1)).toBe(7000);
    expect(parseRetryAfter("2")).toBe(2000);
    expect(
      parseRetryAfter(
        "Wed, 21 Oct 2015 07:28:00 GMT",
        Date.parse("Wed, 21 Oct 2015 07:27:00 GMT"),
      ),
    ).toBe(60_000);
  });
});
