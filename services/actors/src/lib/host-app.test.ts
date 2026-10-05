/**
 * `./host-app.ts`: the actor host's router is case-sensitive and strict, and
 * a non-canonical path is refused before anything reads it. The whole chain,
 * SDK included, is driven by `./actor-host-bypass.test.ts`; this file pins the
 * pieces.
 */
import express from "express";
import { describe, expect, it } from "vitest";
import {
  assertHardenedRouting,
  createHostApp,
  hardenRouting,
  nonCanonicalPath,
  unhardenedRoutes,
} from "./host-app.ts";

describe("nonCanonicalPath", () => {
  it.each([
    "/",
    "/actors/PingActor/x/method/ping",
    "/actors/ItemActor/sake:3f2b/method/get",
    "/dapr/config",
    "/healthz",
    "/api/auth/callback/google",
    // Percent-encoding inside a segment is data, not structure: Express never
    // splits on it, and a barcode or brand-name actor id may contain it.
    "/actors/BarcodeActor/a%2Fb/method/get",
    "/actors/CellarActor/c%3A1/method/rename",
    "/actors/Ping%41ctor/x/method/ping",
    // A dot that is part of a segment is not a dot segment.
    "/actors/BrandRegistryActor/st.%20george/method/resolve",
    "/api/auth/.well-known",
  ])("%s is canonical", (path) => {
    expect(nonCanonicalPath(path)).toBeNull();
  });

  it.each([
    ["//actors/PingActor/x/method/ping", "empty-segment"],
    ["/actors//PingActor/x/method/ping", "empty-segment"],
    ["/actors/PingActor/x/method//ping", "empty-segment"],
    ["/actors/PingActor/x/method/ping/", "empty-segment"],
    ["/dapr/config/", "empty-segment"],
    ["/api/auth/jwks/", "empty-segment"],
    ["actors/PingActor/x/method/ping", "empty-segment"],
    ["/./actors/PingActor/x/method/ping", "dot-segment"],
    ["/actors/./PingActor/x/method/ping", "dot-segment"],
    ["/actors/PingActor/./method/ping", "dot-segment"],
    ["/actors/PingActor/x/method/..", "dot-segment"],
    ["/foo/../actors/PingActor/x/method/ping", "dot-segment"],
    ["/api/auth/../../actors/PingActor/x/method/ping", "dot-segment"],
    ["/api/auth/%2e%2e/%2E%2E/actors/PingActor/x/method/ping", "dot-segment"],
    ["/actors/PingActor/%2e/method/ping", "dot-segment"],
    ["/actors\\PingActor\\x\\method\\ping", "backslash"],
    ["/actors/PingActor/x/method/%E0%A4%A", "malformed-encoding"],
  ])("%s is refused (%s)", (path, reason) => {
    expect(nonCanonicalPath(path)).toBe(reason);
  });
});

describe("hardenRouting", () => {
  it("refuses an app whose router already exists, since Express would ignore it", () => {
    const app = express();
    app.get("/healthz", (_req, res) => res.send("ok"));
    expect(() => hardenRouting(app)).toThrow(/router already exists/);
  });

  it("builds every route case-sensitive and strict", () => {
    const app = createHostApp();
    app.put("/actors/:actorTypeName/:actorId/method/:methodName", () => {});
    app.get("/dapr/config", () => {});
    expect(unhardenedRoutes(app)).toEqual([]);
    expect(() => assertHardenedRouting(app)).not.toThrow();
  });
});

describe("assertHardenedRouting", () => {
  it("names every route on a default Express app (negative control)", () => {
    const app = express();
    app.put("/actors/:actorTypeName/:actorId/method/:methodName", () => {});
    app.get("/dapr/config", () => {});
    const problems = unhardenedRoutes(app);
    expect(problems).toEqual([
      "(router) case-insensitive",
      "(router) not strict",
      "/actors/:actorTypeName/:actorId/method/:methodName case-insensitive",
      "/actors/:actorTypeName/:actorId/method/:methodName accepts a trailing slash",
      "/dapr/config case-insensitive",
      "/dapr/config accepts a trailing slash",
    ]);
    expect(() => assertHardenedRouting(app)).toThrow(/not hardened/);
  });

  it("refuses an app with nothing registered — there is nothing to check yet", () => {
    expect(() => assertHardenedRouting(express())).toThrow(/no router/);
  });

  it("catches settings applied after the router was created, which Express ignores", () => {
    const app = express();
    app.use((_req, _res, next) => next());
    app.set("case sensitive routing", true);
    app.set("strict routing", true);
    app.get("/dapr/config", () => {});
    expect(unhardenedRoutes(app)).toContain("/dapr/config case-insensitive");
  });
});
