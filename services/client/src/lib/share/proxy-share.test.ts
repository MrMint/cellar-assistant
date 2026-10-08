/**
 * X17 and D19 through the real `src/proxy.ts`, not its helpers: what a
 * signed-out request for a shared URL gets (a rewrite, never a redirect, and
 * the address bar keeps the canonical URL), what stays gated, and the path a
 * cookie-bearing request is stamped with for `getServerUser()`'s returnTo.
 *
 * Lives under `src/lib/` because the client suite runs `src/lib/` (see
 * `lib/api/proxy-session-check.test.ts`, which drives the proxy the same way).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../../proxy.ts";
import { SESSION_CHECKED_COOKIE } from "../api/session-check.ts";
import { REQUEST_PATH_HEADER } from "../auth/request-path.ts";

const ID = "0b9b2c8e-7a51-4f3e-9d4c-2f1a6e8b3c7d";
const ORIGIN = "http://localhost:3000";

const get = (path: string, headers: Record<string, string> = {}) =>
  proxy(new NextRequest(`${ORIGIN}${path}`, { headers }));

const rewriteOf = (response: Response) =>
  response.headers.get("x-middleware-rewrite");

describe("signed out", () => {
  test("a shareable URL is rewritten to its public page, query and all", async () => {
    for (const [path, target] of [
      [`/tier-lists/${ID}`, `/share/tier-lists/${ID}`],
      [`/recipes/${ID}`, `/share/recipes/${ID}`],
      [`/wines/${ID}`, `/share/items/wines/${ID}`],
      [`/teas/${ID}`, `/share/items/teas/${ID}`],
    ] as const) {
      const response = await get(`${path}?utm=chat`);
      assert.equal(response.headers.get("location"), null, path);
      assert.equal(rewriteOf(response), `${ORIGIN}${target}?utm=chat`, path);
    }
  });

  test("anything else still goes to sign-in, carrying where it was going", async () => {
    for (const path of [
      `/tier-lists/${ID}/edit`,
      "/tier-lists/not-a-uuid",
      `/cellars/${ID}`,
      `/brands/${ID}`,
    ]) {
      const response = await get(path);
      assert.equal(rewriteOf(response), null, path);
      const location = new URL(response.headers.get("location") ?? "");
      assert.equal(location.pathname, "/sign-in", path);
      assert.equal(location.searchParams.get("returnTo"), path, path);
    }
  });

  test("/share and /invite are public outright", async () => {
    for (const path of [
      `/share/tier-lists/${ID}`,
      `/share/tier-lists/${ID}/opengraph-image`,
      `/invite/${"A".repeat(44)}`,
    ]) {
      const response = await get(path);
      assert.equal(response.headers.get("location"), null, path);
      assert.equal(rewriteOf(response), null, path);
    }
  });
});

describe("with a session cookie", () => {
  const cookie = `better-auth.session_token=abc.def; ${SESSION_CHECKED_COOKIE}=1`;

  test("a shareable URL is the real page, not rewritten", async () => {
    const response = await get(`/tier-lists/${ID}`, { cookie });
    assert.equal(rewriteOf(response), null);
    assert.equal(response.headers.get("location"), null);
  });

  test("the request is stamped with its own path, over a forged one", async () => {
    const response = await get(`/tier-lists/${ID}?tab=board`, {
      cookie,
      [REQUEST_PATH_HEADER]: "https://evil.example/",
    });
    assert.equal(
      response.headers.get(`x-middleware-request-${REQUEST_PATH_HEADER}`),
      `/tier-lists/${ID}?tab=board`,
    );
    assert.match(
      response.headers.get("x-middleware-override-headers") ?? "",
      new RegExp(REQUEST_PATH_HEADER),
    );
  });
});
