/**
 * `./dapr-app-token.ts`: the actor routes answer only the caller holding the
 * app API token — which, in a stack configured with one, is only this app's
 * sidecar. Driven through a real Express app, with a stand-in for the SDK.
 */
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUTH_BASE_PATH } from "../auth/mount.ts";
import {
  daprAppTokenMiddleware,
  PUBLIC_AUTH_PREFIX,
  requiresAppToken,
} from "./dapr-app-token.ts";

const serve = async (expected: string) => {
  const reached: string[] = [];
  const app = express();
  app.use(daprAppTokenMiddleware(expected));
  app.all("/{*splat}", (req, res) => {
    reached.push(`${req.method} ${req.path}`);
    res.status(200).json({ ok: true });
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, reached, close: () => server.close() };
};

describe("the app API token", () => {
  let stack: Awaited<ReturnType<typeof serve>>;
  beforeAll(async () => {
    stack = await serve("app-secret");
  });
  afterAll(() => stack.close());

  const call = (path: string, token?: string, method = "PUT") =>
    fetch(`${stack.base}${path}`, {
      method,
      headers: token === undefined ? {} : { "dapr-api-token": token },
    });

  it("refuses an actor method call with no token, 401 and UNAUTHENTICATED", async () => {
    stack.reached.length = 0;
    const response = await call("/actors/OutboxActor/singleton/method/drain");
    expect(response.status).toBe(401);
    // Not an `ActorErrorCode`, so no caller parses it as a typed failure.
    expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
    expect(stack.reached).toEqual([]);
  });

  it("refuses the wrong token, including one that differs only in length", async () => {
    for (const token of ["app-secreT", "app-secret-longer", ""]) {
      const response = await call("/actors/CellarActor/x/method/get", token);
      expect(response.status, token).toBe(401);
    }
  });

  it("refuses the sidecar's config and deactivation routes too", async () => {
    expect((await call("/dapr/config", undefined, "GET")).status).toBe(401);
    expect(
      (await call("/actors/CellarActor/x", undefined, "DELETE")).status,
    ).toBe(401);
  });

  it("lets the sidecar through", async () => {
    stack.reached.length = 0;
    const response = await call(
      "/actors/OutboxActor/singleton/method/drain",
      "app-secret",
    );
    expect(response.status).toBe(200);
    expect(stack.reached).toEqual([
      "PUT /actors/OutboxActor/singleton/method/drain",
    ]);
  });

  it("leaves better-auth and the health check alone", async () => {
    expect((await call("/api/auth/jwks", undefined, "GET")).status).toBe(200);
    expect((await call("/healthz", undefined, "GET")).status).toBe(200);
  });
});

describe("with no token configured", () => {
  it("does not check (the boot log says so)", async () => {
    const stack = await serve("");
    try {
      const response = await fetch(
        `${stack.base}/actors/CellarActor/x/method/get`,
        { method: "PUT" },
      );
      expect(response.status).toBe(200);
    } finally {
      stack.close();
    }
  });
});

describe("requiresAppToken: deny by default", () => {
  it.each([
    ["PUT", "/actors/A/1/method/m"],
    ["DELETE", "/actors/A/1"],
    ["GET", "/dapr/config"],
    ["GET", "/dapr/subscribe"],
    // Every spelling Express 4 would route to the same handlers by default.
    ["PUT", "/ACTORS/A/1/method/m"],
    ["PUT", "/Actors/A/1/method/m"],
    ["PUT", "/actors/A/1/method/m/"],
    ["DELETE", "/ACTORS/A/1"],
    ["GET", "/DAPR/config"],
    ["GET", "/dapr/config/"],
    // And everything that is no route at all.
    ["GET", "/"],
    ["GET", "/actorsx"],
    ["GET", "/HEALTHZ"],
    ["PUT", "/healthz"],
    ["GET", "/API/AUTH/jwks"],
    ["GET", "/api/authx"],
    ["GET", "/api/auth"],
  ])("%s %s needs the token", (method, path) => {
    expect(requiresAppToken(method, path)).toBe(true);
  });

  it.each([
    ["GET", "/healthz"],
    ["HEAD", "/healthz"],
    ["GET", "/api/auth/jwks"],
    ["POST", "/api/auth/sign-in/email"],
    ["GET", "/api/auth/callback/google"],
  ])("%s %s does not", (method, path) => {
    expect(requiresAppToken(method, path)).toBe(false);
  });

  it("spells better-auth's mount the way better-auth is mounted", () => {
    expect(PUBLIC_AUTH_PREFIX).toBe(`${AUTH_BASE_PATH}/`);
  });
});
