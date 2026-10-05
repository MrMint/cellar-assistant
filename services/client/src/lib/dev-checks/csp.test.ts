/**
 * E3c · the Content-Security-Policy invariants, checked against the real
 * `next.config.mjs` rather than a copy of it.
 *
 * Two failures this guards against, both of which are invisible to `tsc`,
 * `biome` and every e2e run that does not upload a file:
 *
 *  1. **The file host falls out of `connect-src`.** Uploads PUT straight at a
 *     presigned MinIO URL on `PUBLIC_FILES_HOST` and the SigV4 signature
 *     covers the `Host` header, so the request cannot be proxied onto this
 *     origin (`services/actors/src/lib/s3-presign.ts`). Drop the entry and every
 *     upload is blocked by the browser with no network request at all —
 *     while `img-src`'s `https:` keeps *displaying* existing images, so the
 *     app looks healthy. That asymmetry is why this needs a test.
 *  2. **Someone fixes (1) by widening the policy.** `connect-src *`, or a bare
 *     `https:`, makes the upload work and simultaneously turns any XSS into an
 *     exfiltration channel. The second half of this file refuses that shape.
 *
 * It imports the config module and calls `headers()` per case, because the
 * policy is built inside `headers()` from `process.env` — the same read Next
 * performs at build time.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import nextConfig from "../../../next.config.mjs";

const ENV_KEYS = [
  "NODE_ENV",
  "PUBLIC_FILES_HOST",
  "FILES_S3_PUBLIC_URL",
  "MINIO_PORT",
] as const;

const saved = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** Replace the CSP-relevant environment wholesale, so no case leaks into another. */
const withEnv = (env: Partial<Record<(typeof ENV_KEYS)[number], string>>) => {
  for (const key of ENV_KEYS) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

const policy = async (): Promise<string> => {
  const groups = await nextConfig.headers();
  const header = groups
    .flatMap(
      (group: { headers: { key: string; value: string }[] }) => group.headers,
    )
    .find(({ key }: { key: string }) => key === "Content-Security-Policy");
  assert.ok(header, "next.config.mjs sends no Content-Security-Policy header");
  return header.value;
};

/** The source list of one directive, e.g. `connect-src` → `["'self'", …]`. */
const sources = async (directive: string): Promise<string[]> => {
  const found = (await policy())
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === directive || part.startsWith(`${directive} `));
  assert.ok(found, `CSP has no ${directive} directive`);
  return found.split(/\s+/).slice(1);
};

test("production: PUBLIC_FILES_HOST becomes a connect-src origin", async () => {
  withEnv({ NODE_ENV: "production", PUBLIC_FILES_HOST: "files.example.com" });
  const connect = await sources("connect-src");

  assert.ok(
    connect.includes("https://files.example.com"),
    `The presigned-upload host is missing from connect-src, so every browser PUT
to a presigned URL will be blocked. Got: ${connect.join(" ")}`,
  );
  assert.ok(connect.includes("'self'"), "connect-src dropped 'self'");
  // Loopback is a development-only affordance and must never ship.
  assert.deepEqual(
    connect.filter((source) => source.includes("localhost")),
    [],
    "a production policy is carrying localhost origins",
  );
});

test("production: FILES_S3_PUBLIC_URL is accepted as the other spelling", async () => {
  withEnv({
    NODE_ENV: "production",
    FILES_S3_PUBLIC_URL: "https://files.example.com",
  });
  assert.ok(
    (await sources("connect-src")).includes("https://files.example.com"),
  );
});

test("production: a value carrying a path or a stray `;` is dropped, not emitted", async () => {
  withEnv({
    NODE_ENV: "production",
    PUBLIC_FILES_HOST: "files.example.com/bucket; script-src *",
  });
  const csp = await policy();

  assert.equal(
    csp.split(";").filter((part) => part.trim().startsWith("script-src"))
      .length,
    1,
    "an environment value injected a second script-src directive",
  );
  assert.ok(
    !csp.includes("files.example.com/bucket"),
    "a non-origin value reached the policy verbatim",
  );
});

test("production: an unset file host warns rather than silently shipping", async () => {
  withEnv({ NODE_ENV: "production" });
  const original = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(" "));
  };
  try {
    await policy();
  } finally {
    console.warn = original;
  }
  assert.ok(
    warnings.some((line) => line.includes("PUBLIC_FILES_HOST")),
    "a production build with no file host produced no warning",
  );
});

test("development: MinIO's published host port is reachable", async () => {
  withEnv({ NODE_ENV: "development" });
  const connect = await sources("connect-src");
  assert.ok(
    connect.includes("http://localhost:9100"),
    `local MinIO (infra/docker-compose.yml MINIO_PORT, default 9100) is missing.
Got: ${connect.join(" ")}`,
  );
});

test("development: MINIO_PORT moves the loopback origin", async () => {
  withEnv({ NODE_ENV: "development", MINIO_PORT: "9200" });
  assert.ok((await sources("connect-src")).includes("http://localhost:9200"));
});

/**
 * The anti-widening half. Every source must be a keyword, a scheme that only
 * names local bytes (`data:`, `blob:`), or a concrete origin — optionally with
 * a single leading `*.` wildcard label, which is how the existing map-tile and
 * Google entries are written.
 */
const CONCRETE_ORIGIN = /^https?:\/\/(\*\.)?[a-z0-9.-]+(:\d+)?$/i;
const KEYWORDS = new Set([
  "'self'",
  "'none'",
  "'unsafe-inline'",
  "'unsafe-eval'",
  "data:",
  "blob:",
]);

test("connect-src is never widened to a wildcard or a bare scheme", async () => {
  for (const env of [
    { NODE_ENV: "production", PUBLIC_FILES_HOST: "files.example.com" },
    { NODE_ENV: "development" },
  ] as const) {
    withEnv(env);
    for (const source of await sources("connect-src")) {
      assert.ok(
        KEYWORDS.has(source) || CONCRETE_ORIGIN.test(source),
        `connect-src source ${JSON.stringify(source)} is not a concrete origin.
A wildcard or a bare scheme here makes any XSS an exfiltration channel — name
the host instead, derived from the deploy's own environment variables.`,
      );
    }
  }
});

test("default-src and form-action stay locked to this origin", async () => {
  withEnv({ NODE_ENV: "production", PUBLIC_FILES_HOST: "files.example.com" });
  assert.deepEqual(await sources("default-src"), ["'self'"]);
  assert.deepEqual(await sources("form-action"), ["'self'"]);
  assert.deepEqual(await sources("frame-ancestors"), ["'none'"]);
});
