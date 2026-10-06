/**
 * W4 security F3: every request this Next server makes to the actor host
 * carries the proxy secret, the browser passthrough also carries the browser's
 * address, and neither can come from — or go to — the browser.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { proxyAuthRequest } from "./auth-proxy.ts";
import {
  CLIENT_IP_HEADER,
  clientIpFrom,
  PROXY_SECRET_HEADER,
  proxySecretHeaders,
} from "./proxy-secret.ts";
import { fetchApiToken } from "./token.ts";

const SECRET = "proxy-secret-for-this-test-only-000000000000";

const saved = {
  AUTH_PROXY_SECRET: process.env.AUTH_PROXY_SECRET,
  VERCEL: process.env.VERCEL,
  AUTH_CLIENT_IP_HEADER: process.env.AUTH_CLIENT_IP_HEADER,
};
afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const capture = () => {
  let seen: Headers | undefined;
  const fetchImpl = async (_url: string, init: RequestInit) => {
    seen = new Headers(init.headers);
    return Response.json({ token: "jwt" });
  };
  return { fetchImpl, seen: () => seen ?? new Headers() };
};

test("proxySecretHeaders sends the secret when set, and nothing when not", () => {
  assert.deepEqual(proxySecretHeaders({ AUTH_PROXY_SECRET: SECRET }), {
    [PROXY_SECRET_HEADER]: SECRET,
  });
  assert.deepEqual(proxySecretHeaders({}), {});
  assert.deepEqual(proxySecretHeaders({ AUTH_PROXY_SECRET: "" }), {});
});

test("on Vercel the client address is x-real-ip, which Vercel overwrites", () => {
  const headers = new Headers({
    "x-real-ip": "203.0.113.9",
    "x-forwarded-for": "192.0.2.1",
  });
  assert.equal(clientIpFrom(headers, { VERCEL: "1" }), "203.0.113.9");
});

test("off Vercel no header is trusted unless one is named", () => {
  const headers = new Headers({
    "x-real-ip": "203.0.113.9",
    "x-forwarded-for": "192.0.2.1",
    "cf-connecting-ip": "198.51.100.4",
  });
  assert.equal(clientIpFrom(headers, {}), null);
  assert.equal(
    clientIpFrom(headers, { AUTH_CLIENT_IP_HEADER: "CF-Connecting-IP" }),
    "198.51.100.4",
  );
});

test("the browser passthrough sends the secret and the browser's address", async () => {
  process.env.AUTH_PROXY_SECRET = SECRET;
  process.env.VERCEL = "1";
  const { fetchImpl, seen } = capture();
  await proxyAuthRequest(
    new Request("https://app.example/api/auth/sign-in/email", {
      method: "POST",
      headers: { "x-real-ip": "203.0.113.9" },
      body: "{}",
    }),
    fetchImpl,
  );
  assert.equal(seen().get(PROXY_SECRET_HEADER), SECRET);
  assert.equal(seen().get(CLIENT_IP_HEADER), "203.0.113.9");
});

test("a browser cannot supply either header through the passthrough", async () => {
  delete process.env.AUTH_PROXY_SECRET;
  delete process.env.VERCEL;
  const { fetchImpl, seen } = capture();
  await proxyAuthRequest(
    new Request("https://app.example/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        [PROXY_SECRET_HEADER]: "guessed",
        [CLIENT_IP_HEADER]: "10.9.8.7",
      },
      body: "{}",
    }),
    fetchImpl,
  );
  assert.equal(seen().get(PROXY_SECRET_HEADER), null);
  assert.equal(seen().get(CLIENT_IP_HEADER), null);
});

test("the server-side token exchange sends the secret", async () => {
  process.env.AUTH_PROXY_SECRET = SECRET;
  const { fetchImpl, seen } = capture();
  await fetchApiToken({
    authOrigin: "http://actors.test",
    cookieHeader: "better-auth.session_token=s",
    fetchImpl,
  });
  assert.equal(seen().get(PROXY_SECRET_HEADER), SECRET);
});

/* ------------------------------------------------------------------------ *
 * AUTH_PROXY_SECRET never reaches a browser bundle.
 *
 * Next inlines only `NEXT_PUBLIC_*` variables and whatever `next.config`'s
 * `env` lists, so those are the two ways out; and a `"use client"` module that
 * imported `proxy-secret.ts` would put its code (not the value, which would
 * read as undefined) in the bundle — a design error worth failing on anyway.
 * ------------------------------------------------------------------------ */

const CLIENT_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const SRC = join(CLIENT_ROOT, "src");

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx|mjs|js)$/.test(name) ? [path] : [];
  });

test("no NEXT_PUBLIC_ spelling of the secret, and next.config does not inline it", () => {
  const files = [
    ...walk(SRC),
    join(CLIENT_ROOT, "next.config.mjs"),
    join(CLIENT_ROOT, "Dockerfile"),
  ];
  const offenders = files.filter((file) =>
    /NEXT_PUBLIC_[A-Z_]*PROXY_SECRET/.test(readFileSync(file, "utf8")),
  );
  assert.deepEqual(offenders, []);
  const config = readFileSync(join(CLIENT_ROOT, "next.config.mjs"), "utf8");
  const envBlock = /\benv:\s*\{([^}]*)\}/.exec(config)?.[1] ?? "";
  assert.ok(
    envBlock !== "",
    "next.config.mjs's env block moved; re-point this test",
  );
  assert.ok(!envBlock.includes("AUTH_PROXY_SECRET"));
  // The Dockerfile builds the bundle; a build ARG would bake the value in.
  assert.ok(
    !/ARG\s+AUTH_PROXY_SECRET/.test(
      readFileSync(join(CLIENT_ROOT, "Dockerfile"), "utf8"),
    ),
  );
});

const resolveImport = (from: string, spec: string): string | undefined => {
  const base = spec.startsWith("@/")
    ? join(SRC, spec.slice(2))
    : resolve(dirname(from), spec);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not this one
    }
  }
  return undefined;
};

const IMPORT =
  /(?:import|export)[^"'`]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

test('no "use client" module can reach proxy-secret.ts', () => {
  const target = join(SRC, "lib/api/proxy-secret.ts");
  const files = walk(SRC).filter((f) => !/\.test\.tsx?$/.test(f));
  const clientRoots = files.filter((f) =>
    /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(
      readFileSync(f, "utf8"),
    ),
  );
  assert.ok(clientRoots.length > 10, "found no client modules — scan broken");

  const reached = new Set<string>();
  const stack = [...clientRoots];
  while (stack.length > 0) {
    const file = stack.pop();
    if (file === undefined || reached.has(file)) continue;
    reached.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) {
      // `import type` is erased at compile time: it puts nothing in a bundle.
      if (/^(?:import|export)\s+type\b/.test(match[0])) continue;
      const spec = match[1] ?? match[2] ?? "";
      if (!spec.startsWith(".") && !spec.startsWith("@/")) continue;
      const next = resolveImport(file, spec);
      if (next !== undefined) stack.push(next);
    }
  }
  assert.ok(
    reached.has(join(SRC, "lib/api/auth-client.ts")),
    "the walk does not reach a known client import — scan broken",
  );
  assert.ok(!reached.has(target), "a client module imports proxy-secret.ts");
});
