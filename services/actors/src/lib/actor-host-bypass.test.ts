/**
 * Every known spelling of an actor or Dapr route, through the actor host's
 * whole chain — `src/index.ts`'s order, the real `DaprServer` and its real
 * routes — with and without the sidecar's token.
 *
 * ## The bypass this pins
 *
 * Express 4 routes case-insensitively and ignores a trailing slash by default;
 * the token check and the allow-list read the path case-sensitively. Against
 * the shared stack, 2026-09-28, `PUT /ACTORS/PingActor/x/method/ping` answered
 * 200 with no token, `PUT /Actors/…/method/getActorId` reached a method no
 * descriptor declares, and a forged `ctx` read another user's private cellar.
 * `./host-app.ts` has the rest.
 *
 * ## How
 *
 * Raw `node:http` requests, not `fetch`: a WHATWG URL resolves `/./` and
 * `/../` before sending, and those are among the spellings under test. What
 * reached an actor is recorded by the actor itself, so "refused" means the
 * method body never ran, not just that a status code looked right.
 *
 * Three hosts. **Assembled** is `src/index.ts`'s chain on `createAppWithAuth`.
 * **Unhardened** is the same gates on a default Express app — routing
 * case-insensitive and lax, no canonical-path gate — to show the token check
 * and the allow-list hold without the routing fix. **Params only** is nothing
 * but the router-derived half of the allow-list, on a default app, to show
 * that half holds on its own.
 */
import { request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DAPR_API_TOKEN_HEADER } from "@cellar-assistant/contracts";
import { AbstractActor, DaprServer } from "@dapr/dapr";
import express, { type Express } from "express";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AuthInstance } from "../auth/auth.ts";
import { AUTH_BASE_PATH, createAppWithAuth } from "../auth/mount.ts";
import { installActorErrorEnvelope } from "./actor-error-envelope.ts";
import {
  type AllowlistEntry,
  actorParamGuard,
  GUARDED_PARAMS,
  installActorMethodAllowlist,
  methodAllowlist,
} from "./actor-method-allowlist.ts";
import { installActorRouteGuard } from "./actor-route-guard.ts";
import {
  installDaprAppTokenCheck,
  PUBLIC_AUTH_PREFIX,
} from "./dapr-app-token.ts";
import { assertHardenedRouting } from "./host-app.ts";

const TOKEN = "bypass-test-token";

/** Every method body that runs, by name. */
const reached: string[] = [];

class PingActor extends AbstractActor {
  async ping(): Promise<string> {
    reached.push("ping");
    return "pong";
  }

  /** Dispatchable to the SDK (a function on the actor), declared nowhere. */
  async secret(): Promise<string> {
    reached.push("secret");
    return "leaked";
  }
}

const ENTRIES: readonly AllowlistEntry[] = [
  {
    descriptor: {
      actorType: "PingActor",
      category: "entity",
      methods: { ping: {} },
      internalMethods: {},
    },
  },
];

/** What better-auth answers with, minus better-auth (as `mount.test.ts`). */
const stubAuth = (): AuthInstance =>
  ({
    handler: async (): Promise<Response> =>
      new Response(JSON.stringify({ auth: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  }) as unknown as AuthInstance;

type Host = { port: number; close: () => Promise<void> };

const listen = async (app: Express): Promise<Host> => {
  const server: Server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
};

const withSdk = async (app: Express): Promise<void> => {
  const server = new DaprServer({
    serverHost: "127.0.0.1",
    serverPort: "0",
    serverHttp: app,
    clientOptions: { daprHost: "127.0.0.1", daprPort: "3500" },
  });
  await installActorRouteGuard(app, () => server.actor.init());
  // `ActorRuntime` is a process-wide singleton; registering twice is a no-op.
  await server.actor.registerActor(PingActor);
};

/** `src/index.ts`, minus the database, the process guards and `boot()`. */
const assembledHost = async (): Promise<Host> => {
  const app = createAppWithAuth(stubAuth());
  installActorErrorEnvelope(app);
  installDaprAppTokenCheck(app, TOKEN);
  installActorMethodAllowlist(app, ENTRIES);
  await withSdk(app);
  assertHardenedRouting(app);
  return listen(app);
};

/** The same gates on Express's defaults: no routing fix, no path gate. */
const unhardenedHost = async (): Promise<Host> => {
  const app = express();
  app.all(`${AUTH_BASE_PATH}/*`, (_req, res) => {
    res.json({ auth: true });
  });
  installActorErrorEnvelope(app);
  installDaprAppTokenCheck(app, TOKEN);
  installActorMethodAllowlist(app, ENTRIES);
  await withSdk(app);
  return listen(app);
};

/** Only the router-derived half of the allow-list, on Express's defaults. */
const paramsOnlyHost = async (): Promise<Host> => {
  const app = express();
  const allowlist = methodAllowlist(ENTRIES);
  for (const param of GUARDED_PARAMS) {
    app.param(param, actorParamGuard(allowlist, param));
  }
  await withSdk(app);
  return listen(app);
};

type Answer = { status: number; body: string };

/** One request, with the path sent byte for byte as given. */
const send = (
  host: Host,
  method: string,
  path: string,
  token?: string,
): Promise<Answer> =>
  new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port: host.port,
        method,
        path,
        headers: {
          "content-type": "application/json",
          ...(token === undefined ? {} : { [DAPR_API_TOKEN_HEADER]: token }),
        },
        timeout: 3_000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`${method} ${path} hung`)));
    req.end(
      method === "PUT"
        ? JSON.stringify([{ kind: "system", viewerId: null, requestId: "r" }])
        : undefined,
    );
  });

const env = {
  server: process.env.DAPR_SERVER_PORT,
  client: process.env.DAPR_CLIENT_PORT,
};

beforeEach(() => {
  reached.length = 0;
  vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  return () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  };
});

afterAll(() => {
  // `new DaprServer` writes both into the environment.
  process.env.DAPR_SERVER_PORT = env.server;
  process.env.DAPR_CLIENT_PORT = env.client;
});

/**
 * `[method, path, status with no token, status with the token]`, against the
 * assembled host. 400 is the canonical-path gate, 401 the token check, 404 the
 * allow-list (or no route at all).
 */
const ASSEMBLED: ReadonlyArray<readonly [string, string, number, number]> = [
  // The reported bypass, and its relatives.
  ["PUT", "/ACTORS/PingActor/x/method/ping", 401, 404],
  ["PUT", "/Actors/PingActor/x/method/getActorId", 401, 404],
  ["PUT", "/Actors/PingActor/x/method/secret", 401, 404],
  ["PUT", "/actors/PingActor/x/METHOD/secret", 401, 404],
  ["PUT", "/aCtOrS/PingActor/x/method/ping", 401, 404],
  ["PUT", "http://evil.example/ACTORS/PingActor/x/method/ping", 401, 404],
  // Undeclared methods, spelled canonically.
  ["PUT", "/actors/PingActor/x/method/secret", 401, 404],
  ["PUT", "/actors/PingActor/x/method/getActorId", 401, 404],
  ["PUT", "/actors/PingActor/x/method/secre%74", 401, 404],
  ["PUT", "/actors/PingActor/x/method/ping%2F", 401, 404],
  ["PUT", "/actors/PingActor/x/method/ping;x", 401, 404],
  ["PUT", "/actors/NoSuchActor/x/method/ping", 401, 404],
  // Trailing slashes (Express's default ignores one).
  ["PUT", "/actors/PingActor/x/method/secret/", 400, 400],
  ["PUT", "/actors/PingActor/x/method/ping/", 400, 400],
  ["DELETE", "/actors/PingActor/x/", 400, 400],
  ["GET", "/dapr/config/", 400, 400],
  // Empty segments.
  ["PUT", "//actors/PingActor/x/method/ping", 400, 400],
  ["PUT", "/actors//PingActor/x/method/ping", 400, 400],
  ["PUT", "/actors/PingActor/x/method//secret", 400, 400],
  // Dot segments, raw and encoded.
  ["PUT", "/./actors/PingActor/x/method/ping", 400, 400],
  ["PUT", "/actors/PingActor/./method/ping", 400, 400],
  ["PUT", "/foo/../actors/PingActor/x/method/ping", 400, 400],
  ["PUT", "/api/auth/../../actors/PingActor/x/method/secret", 400, 400],
  ["PUT", "/api/auth/%2e%2e/%2e%2e/actors/PingActor/x/method/secret", 400, 400],
  // Encoded separators and backslashes.
  ["PUT", "/actors%2FPingActor/x/method/secret", 401, 404],
  ["PUT", "/actors/PingActor/x%2Fmethod%2Fsecret", 401, 404],
  ["PUT", "/actors\\PingActor\\x\\method\\secret", 400, 400],
  // Timers never pass, however spelled.
  ["PUT", "/actors/PingActor/x/method/timer/secret", 401, 404],
  ["PUT", "/actors/PingActor/x/method/TIMER/secret", 401, 404],
  // Every other route the SDK registers, and every other method.
  ["DELETE", "/ACTORS/PingActor/x", 401, 404],
  ["DELETE", "/actors/NoSuchActor/x", 401, 404],
  ["POST", "/actors/PingActor/x/method/ping", 401, 404],
  ["GET", "/actors/PingActor/x/method/ping", 401, 404],
  ["GET", "/DAPR/config", 401, 404],
  ["GET", "/Dapr/Config", 401, 404],
  ["HEAD", "/DAPR/config", 401, 404],
  ["GET", "/dapr/subscribe", 401, 404],
  ["GET", "/HEALTHZ", 401, 404],
  ["GET", "/API/AUTH/jwks", 401, 404],
  ["GET", "/", 401, 404],
];

describe("the assembled actor host", () => {
  let host: Host;
  beforeAll(async () => {
    host = await assembledHost();
  });
  afterAll(() => host.close());

  it.each(
    ASSEMBLED,
  )("%s %s → %i without the token, %i with it", async (method, path, bare, withToken) => {
    const refused = await send(host, method, path);
    expect(refused.status, "without the token").toBe(bare);
    const tokened = await send(host, method, path, TOKEN);
    expect(tokened.status, "with the token").toBe(withToken);
    expect(reached, "a method body ran").toEqual([]);
  });

  it("says why it refused: UNAUTHENTICATED, not the opaque INTERNAL", async () => {
    const answer = await send(host, "PUT", "/actors/PingActor/x/method/ping");
    expect(answer.status).toBe(401);
    expect(JSON.parse(answer.body)).toEqual({ code: "UNAUTHENTICATED" });
    const bad = await send(host, "PUT", "/actors/PingActor/x/method/ping/");
    expect(JSON.parse(bad.body)).toEqual({ code: "NON_CANONICAL_PATH" });
  });

  it("still serves the sidecar: the declared method, config, deactivation, health", async () => {
    const ping = await send(
      host,
      "PUT",
      "/actors/PingActor/x/method/ping",
      TOKEN,
    );
    expect(ping.status).toBe(200);
    expect(ping.body).toBe("pong");
    // Percent-encoding the router decodes to the same names is the same call.
    const encoded = await send(
      host,
      "PUT",
      "/actors/Ping%41ctor/x/method/pin%67",
      TOKEN,
    );
    expect(encoded.status).toBe(200);
    // A free-text id may carry an encoded `/`; it is still one segment.
    const slashId = await send(
      host,
      "PUT",
      "/actors/PingActor/a%2Fb/method/ping",
      TOKEN,
    );
    expect(slashId.status).toBe(200);
    expect(reached).toEqual(["ping", "ping", "ping"]);

    const config = await send(host, "GET", "/dapr/config", TOKEN);
    expect(config.status).toBe(200);
    expect(JSON.parse(config.body).entities).toContain("PingActor");
    const deactivate = await send(
      host,
      "DELETE",
      "/actors/PingActor/never-activated",
      TOKEN,
    );
    expect(deactivate.status).toBe(200);
    expect((await send(host, "GET", "/healthz", TOKEN)).status).toBe(200);
  });

  it("keeps better-auth and the health check public, and nothing else", async () => {
    expect(PUBLIC_AUTH_PREFIX).toBe(`${AUTH_BASE_PATH}/`);
    expect((await send(host, "GET", "/api/auth/jwks")).status).toBe(200);
    expect((await send(host, "POST", "/api/auth/sign-in/email")).status).toBe(
      200,
    );
    expect((await send(host, "GET", "/healthz")).status).toBe(200);
    expect((await send(host, "HEAD", "/healthz")).status).toBe(200);
    expect((await send(host, "PUT", "/healthz")).status).toBe(401);
    expect((await send(host, "GET", "/dapr/config")).status).toBe(401);
    expect((await send(host, "DELETE", "/actors/PingActor/x")).status).toBe(
      401,
    );
  });
});

describe("the same gates on Express's default routing (no routing fix)", () => {
  let host: Host;
  beforeAll(async () => {
    host = await unhardenedHost();
  });
  afterAll(() => host.close());

  // Every one of these is routed to an SDK handler by a default Express app
  // (measured: `scratchpad` probe, 2026-09-28).
  it.each([
    ["PUT", "/ACTORS/PingActor/x/method/ping"],
    ["PUT", "/Actors/PingActor/x/method/getActorId"],
    ["PUT", "/Actors/PingActor/x/method/secret"],
    ["PUT", "/actors/PingActor/x/METHOD/secret"],
    ["PUT", "/actors/PingActor/x/method/secret/"],
    ["PUT", "/actors/PingActor/x/method/TIMER/secret"],
    ["PUT", "/actors/PingActor/x/method/Remind/r"],
    ["DELETE", "/ACTORS/PingActor/x"],
    ["DELETE", "/actors/PingActor/x/"],
    ["GET", "/DAPR/config"],
    ["GET", "/dapr/config/"],
  ])("%s %s is refused without the token, and by the allow-list with it", async (method, path) => {
    expect((await send(host, method, path)).status).toBe(401);
    const tokened = await send(host, method, path, TOKEN);
    if (path.toLowerCase().startsWith("/actors")) {
      expect(tokened.status).toBe(404);
    }
    expect(reached).toEqual([]);
  });
});

describe("the router-derived half of the allow-list, alone", () => {
  let host: Host;
  beforeAll(async () => {
    host = await paramsOnlyHost();
  });
  afterAll(() => host.close());

  it.each([
    "/actors/PingActor/x/method/secret",
    "/ACTORS/PingActor/x/method/secret",
    "/Actors/PingActor/x/method/getActorId",
    "/actors/PingActor/x/method/secret/",
    "/actors/PingActor/x/method/secre%74",
    "/actors/PingActor/x/method/timer/secret",
    "/actors/PingActor/x/method/TIMER/secret",
    "/actors/NoSuchActor/x/method/ping",
  ])("refuses PUT %s on the parameters the router extracted", async (path) => {
    expect((await send(host, "PUT", path)).status).toBe(404);
    expect(reached).toEqual([]);
  });

  it("lets a declared method through, however the router was willing to spell it", async () => {
    // This half judges names, not spellings; the path half and the routing
    // fix refuse the spelling. What matters here is the method that runs.
    expect(
      (await send(host, "PUT", "/actors/PingActor/x/method/ping")).status,
    ).toBe(200);
    expect(
      (await send(host, "PUT", "/ACTORS/PingActor/x/method/ping")).status,
    ).toBe(200);
    expect(reached).toEqual(["ping", "ping"]);
  });
});
