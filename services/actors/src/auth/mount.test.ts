/**
 * The Express mount around better-auth — specifically, what it tells caches.
 *
 * Hermetic: `toNodeHandler` only ever calls `auth.handler(request)`, so a stub
 * with that one method is a complete `AuthInstance` for this purpose. No
 * Postgres, no keys, no network beyond a loopback listener on an ephemeral
 * port. A real listener rather than a mocked `res` because the claim is about
 * headers that reach the wire, and `setHeader`-before-`writeHead` merging is
 * exactly the behaviour a mock would paper over.
 */
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthInstance } from "./auth.ts";
import { AUTH_BASE_PATH, createAppWithAuth } from "./mount.ts";

/** What better-auth answers with, minus better-auth. */
const stubAuth = (headers: Record<string, string> = {}): AuthInstance =>
  ({
    handler: async (request: Request): Promise<Response> =>
      new Response(JSON.stringify({ path: new URL(request.url).pathname }), {
        status: 200,
        headers: { "content-type": "application/json", ...headers },
      }),
  }) as unknown as AuthInstance;

const listen = async (
  auth: AuthInstance,
): Promise<{ base: string; close: () => Promise<void> }> => {
  const server = createAppWithAuth(auth).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
};

describe("createAppWithAuth: cache headers (E5d)", () => {
  let server: Awaited<ReturnType<typeof listen>>;

  beforeAll(async () => {
    server = await listen(stubAuth());
  });
  afterAll(async () => {
    await server.close();
  });

  /*
   * `GET /api/auth/token` answers a session cookie with a bearer JWT, and it
   * was served with no `Cache-Control` and no `Expires` at all — measured
   * against the compose stack. A 200 with neither is the case RFC 9111 §4.2.2
   * lets a shared cache store on a heuristic lifetime of its own choosing, and
   * the body is a credential.
   *
   * That better-auth already sets these two headers on `/get-session` is why
   * this is an omission in its jwt plugin rather than a policy.
   */
  it("makes the JWT endpoint unstorable", async () => {
    const response = await fetch(`${server.base}${AUTH_BASE_PATH}/token`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("covers every session-bearing path under the base, not just /token", async () => {
    for (const path of [
      "/get-session",
      "/sign-in/email",
      "/sign-up/email",
      "/sign-out",
      "/callback/google",
    ]) {
      const response = await fetch(`${server.base}${AUTH_BASE_PATH}${path}`);
      expect(response.headers.get("cache-control"), `${path} is storable`).toBe(
        "no-store",
      );
    }
  });

  /**
   * The exception, and the reason this is a path check rather than a blanket
   * rule: `/jwks` is a public key set that `services/api` fetches to verify
   * every JWT. Caching it is the point, and `no-store` here would put a
   * round trip in front of every token verification.
   */
  it("leaves /jwks alone", async () => {
    const response = await fetch(`${server.base}${AUTH_BASE_PATH}/jwks`);
    expect(response.headers.get("cache-control")).toBeNull();
    expect(response.headers.get("pragma")).toBeNull();
  });

  it("does not fight an endpoint that sets its own", async () => {
    const own = await listen(
      stubAuth({ "cache-control": "no-store", pragma: "no-cache" }),
    );
    try {
      const response = await fetch(`${own.base}${AUTH_BASE_PATH}/get-session`);
      // One value, not "no-store, no-store": the handler's `setHeader`
      // replaces the middleware's rather than appending to it.
      expect(response.headers.get("cache-control")).toBe("no-store");
    } finally {
      await own.close();
    }
  });

  it("still routes the body through untouched", async () => {
    const response = await fetch(`${server.base}${AUTH_BASE_PATH}/token`);
    expect(await response.json()).toEqual({
      path: `${AUTH_BASE_PATH}/token`,
    });
  });
});
