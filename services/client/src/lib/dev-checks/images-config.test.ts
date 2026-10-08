/**
 * `images` in `next.config.mjs` (`imagesConfig`), checked against the real
 * module: the file host's `remotePatterns` entry is derived from the same
 * build variables as the CSP, and `dangerouslyAllowLocalIP` can only be on
 * for a lane whose file host is loopback.
 *
 * Why it needs a test: a missing or wrong pattern is invisible until an image
 * loads — the optimizer answers 400 "url parameter is not allowed" and every
 * card shows a broken image, while typecheck, biome and the markup tests (which
 * do not run the optimizer) all stay green.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fileImagePattern, imagesConfig } from "../../../next.config.mjs";

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

const withEnv = (env: Partial<Record<(typeof ENV_KEYS)[number], string>>) => {
  for (const key of ENV_KEYS) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

type Pattern = {
  protocol?: string;
  hostname: string;
  port?: string;
  pathname?: string;
};
const patterns = (): Pattern[] => imagesConfig().remotePatterns as Pattern[];
const hosts = () =>
  patterns().map((p) => `${p.protocol}://${p.hostname}:${p.port ?? "*"}`);

test("production: PUBLIC_FILES_HOST becomes exactly one https pattern on the default port", () => {
  withEnv({ NODE_ENV: "production", PUBLIC_FILES_HOST: "files.example.com" });
  const file = patterns().filter((p) => p.hostname === "files.example.com");
  assert.deepEqual(file, [
    {
      protocol: "https",
      hostname: "files.example.com",
      port: "",
      pathname: "/**",
    },
  ]);
  // No loopback entry can reach a production build.
  assert.ok(
    !hosts().some((h) => /localhost|127\.0\.0\.1/.test(h)),
    hosts().join(" "),
  );
  assert.equal(imagesConfig().dangerouslyAllowLocalIP, false);
});

test("production: FILES_S3_PUBLIC_URL is the fallback spelling, port kept", () => {
  withEnv({
    NODE_ENV: "production",
    FILES_S3_PUBLIC_URL: "https://files.example.com:8443",
  });
  assert.ok(
    patterns().some(
      (p) => p.hostname === "files.example.com" && p.port === "8443",
    ),
  );
});

test("production with no file host: no file pattern, and the avatars stay", () => {
  withEnv({ NODE_ENV: "production" });
  assert.deepEqual(
    patterns().map((p) => p.hostname),
    [
      "s.gravatar.com",
      "cdn.discordapp.com",
      "platform-lookaside.fbsbx.com",
      "graph.facebook.com",
      "lh3.googleusercontent.com",
    ],
  );
});

test("a malformed host is dropped, never turned into a wildcard", () => {
  withEnv({ NODE_ENV: "production", PUBLIC_FILES_HOST: "files example.com" });
  assert.ok(!patterns().some((p) => p.hostname.includes("*")));
  assert.ok(!patterns().some((p) => p.hostname.includes("files")));
});

test("the cellar-stack container: a production build on loopback may fetch local IPs", () => {
  // infra/docker-compose.yml builds the client with this and nothing else.
  withEnv({
    NODE_ENV: "production",
    FILES_S3_PUBLIC_URL: "http://localhost:9100",
  });
  assert.deepEqual(
    patterns().find((p) => p.hostname === "localhost"),
    { protocol: "http", hostname: "localhost", port: "9100", pathname: "/**" },
  );
  assert.equal(imagesConfig().dangerouslyAllowLocalIP, true);
});

test("a production build with a real file host never allows local IPs", () => {
  withEnv({
    NODE_ENV: "production",
    FILES_S3_PUBLIC_URL: "https://files.example.com",
  });
  assert.equal(imagesConfig().dangerouslyAllowLocalIP, false);
});

test("development: MinIO's published port on both loopback names, local IPs allowed", () => {
  withEnv({ NODE_ENV: "development", MINIO_PORT: "9137" });
  const local = patterns().filter((p) => p.port === "9137");
  assert.deepEqual(
    local.map((p) => `${p.protocol}://${p.hostname}`),
    ["http://localhost", "http://127.0.0.1"],
  );
  assert.equal(imagesConfig().dangerouslyAllowLocalIP, true);
});

test("cache, format and sizes are production's, minimumCacheTTL is the read-URL window", () => {
  const config = imagesConfig();
  assert.deepEqual(config.formats, ["image/webp"]);
  assert.deepEqual(config.imageSizes, [200, 400, 500]);
  assert.deepEqual(config.deviceSizes, [400, 500, 828, 1080]);
  // = DEFAULT_READ_URL_WINDOW_SECONDS in services/actors/src/lib/s3-presign.ts.
  assert.equal(config.minimumCacheTTL, 518400);
});

test("fileImagePattern: scheme, host and port of an origin, any path", () => {
  assert.deepEqual(fileImagePattern("http://127.0.0.1:9100"), {
    protocol: "http",
    hostname: "127.0.0.1",
    port: "9100",
    pathname: "/**",
  });
  assert.deepEqual(fileImagePattern("https://files.example.com"), {
    protocol: "https",
    hostname: "files.example.com",
    port: "",
    pathname: "/**",
  });
});
