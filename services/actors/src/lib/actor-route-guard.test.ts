/**
 * The actor routes cannot take the host down — driven through the real SDK.
 *
 * Each test sends what daprd sends, over HTTP, to an Express app wired the
 * way `src/index.ts` wires the real one: `installActorErrorEnvelope`, then a
 * real `DaprServer` handed that app, then `installActorRouteGuard` around the
 * SDK's own `server.actor.init()`. The handlers answering are
 * `HTTPServerActor`'s, the actor map is `ActorManager`'s. Nothing of the
 * guard's is mocked, and no sidecar is involved: `server.start()` is never
 * called, because it waits for one, and the app listens on its own.
 *
 * A crash would show up here as an unhandled rejection, which vitest reports
 * as a failed run, and as a request that never gets an answer, which each
 * `fetch` below bounds with a timeout. The last block shows, with the guard
 * left out against the same SDK, what Express 5 answers on its own.
 */
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  type ActorCategory,
  DAPR_ERROR_RESPONSE_HEADER,
} from "@cellar-assistant/contracts";
import {
  AbstractActor,
  type ActorId,
  type DaprClient,
  DaprServer,
} from "@dapr/dapr";
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
import { EntityActorBase } from "./actor-base.ts";
import {
  installActorErrorEnvelope,
  OPAQUE_ERROR_BODY,
} from "./actor-error-envelope.ts";
import {
  guardRoutesRegisteredDuring,
  installActorRouteGuard,
  isNotActivated,
} from "./actor-route-guard.ts";
import type { DbOrTx } from "./db.ts";

/* -------------------------------------------------------------------------- */
/* Two actors                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What `ItemActor("sake:not-a-uuid")` threw on activation before its key was
 * checked: a `DrizzleQueryError` whose message is the SQL and the client's
 * value, around the `pg` error carrying SQLSTATE 22P02.
 */
const activationFailure = (): Error =>
  Object.assign(
    new Error(
      'Failed query: select "id", "name" from "sakes" where "sakes"."id" = $1\nparams: not-a-uuid',
    ),
    {
      name: "DrizzleQueryError",
      cause: Object.assign(
        new Error('invalid input syntax for type uuid: "not-a-uuid"'),
        { name: "DatabaseError", code: "22P02" },
      ),
    },
  );

class NeverActivatesActor extends AbstractActor {
  override async onActivate(): Promise<void> {
    throw activationFailure();
  }

  async get(): Promise<string> {
    return "unreachable";
  }
}

class HealthyActor extends AbstractActor {
  async ping(): Promise<string> {
    return "pong";
  }

  override async receiveReminder(_data: string): Promise<void> {
    throw new Error("the reminder body failed for secret-customer@example.com");
  }
}

/**
 * A uuid-keyed entity actor whose database fails the test if touched — the
 * `ItemActor` case after the fix, with the SQL taken out of the picture: a
 * key that cannot name a row must never get as far as asking.
 */
class UuidKeyedActor extends EntityActorBase<{ readonly id: string }> {
  static override readonly category: ActorCategory = "entity";

  constructor(client: DaprClient, id: ActorId) {
    super(
      client,
      id,
      new Proxy(
        {},
        {
          get() {
            throw new Error("SQL reached");
          },
        },
      ) as DbOrTx,
    );
  }

  protected async loadAggregate(): Promise<{ readonly id: string } | null> {
    throw new Error("loadAggregate reached");
  }

  async get(): Promise<{ readonly id: string }> {
    return this.requireAggregate();
  }
}

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

type Listening = { base: string; close: () => Promise<void> };

const listen = async (app: Express): Promise<Listening> => {
  const server: Server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
};

/**
 * `src/index.ts` minus better-auth: the envelope ahead of the SDK, the SDK's
 * routes registered through the guard (or, for the control, without it).
 */
const actorHost = async ({
  guarded,
}: {
  guarded: boolean;
}): Promise<Listening> => {
  const app = express();
  installActorErrorEnvelope(app);
  const server = new DaprServer({
    serverHost: "127.0.0.1",
    serverPort: "0",
    serverHttp: app,
    clientOptions: { daprHost: "127.0.0.1", daprPort: "3500" },
  });
  if (guarded) await installActorRouteGuard(app, () => server.actor.init());
  else await server.actor.init();
  // `ActorRuntime` is a process-wide singleton; registering twice is a no-op.
  await server.actor.registerActor(NeverActivatesActor);
  await server.actor.registerActor(HealthyActor);
  await server.actor.registerActor(UuidKeyedActor);
  return listen(app);
};

/** What daprd sends, bounded so a handler that never answers fails the test. */
const send = (
  base: string,
  method: "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Response> =>
  fetch(`${base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(3_000),
  });

type Line = { name: string; text: string; attributes: Record<string, unknown> };

let lines: Line[] = [];

/** `[event.name] message {attributes}`, then any stack frames on later lines. */
const record = (...args: unknown[]): void => {
  const text = args.map(String).join(" ");
  const head = text.split("\n", 1)[0] ?? "";
  const match = /^\[([a-z_.]+)\] (.*?)(?: (\{.*\}))?$/.exec(head);
  if (match === null) return;
  lines.push({
    name: match[1] ?? "",
    text,
    attributes: match[3] === undefined ? {} : JSON.parse(match[3]),
  });
};

const events = (name: string): Line[] =>
  lines.filter((line) => line.name === name);

/* -------------------------------------------------------------------------- */

describe("installActorRouteGuard, through the SDK's own HTTP handlers", () => {
  let host: Listening;
  const env = {
    server: process.env.DAPR_SERVER_PORT,
    client: process.env.DAPR_CLIENT_PORT,
  };

  beforeAll(async () => {
    host = await actorHost({ guarded: true });
  });

  afterAll(async () => {
    await host.close();
    // `new DaprServer` writes both into the environment.
    process.env.DAPR_SERVER_PORT = env.server;
    process.env.DAPR_CLIENT_PORT = env.client;
  });

  beforeEach(() => {
    lines = [];
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    vi.spyOn(console, "log").mockImplementation(record);
    vi.spyOn(console, "warn").mockImplementation(record);
    vi.spyOn(console, "error").mockImplementation(record);
    return () => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    };
  });

  it("answers a DELETE for an actor it never activated with a 200", async () => {
    // daprd's idle-timeout deactivation, for an id no call ever reached.
    const response = await send(
      host.base,
      "DELETE",
      "/actors/NeverActivatesActor/sake:never-seen",
    );

    expect(response.status).toBe(200);
    expect(events("actor.deactivate_unheld")).toHaveLength(1);
    expect(events("actor.deactivate_unheld")[0]?.attributes).toEqual({
      "actor.type": "NeverActivatesActor",
    });
    expect(lines.map((line) => line.text).join("\n")).not.toContain(
      "never-seen",
    );
  });

  it("survives the exact sequence that took the host down", async () => {
    // 1. A call whose activation throws: the SDK catches this one itself, and
    //    the envelope turns it into the opaque 500.
    const call = await send(
      host.base,
      "PUT",
      "/actors/NeverActivatesActor/sake:not-a-uuid/method/get",
      [{ viewerId: null, kind: "anonymous", requestId: "req-crash-1" }],
    );
    expect(call.status).toBe(500);
    expect(await call.json()).toEqual(OPAQUE_ERROR_BODY);

    // 2. Ten minutes later daprd deactivates it. The SDK never recorded the
    //    activation, so `deactivateActor` throws ACTOR_NOT_ACTIVATED — which,
    //    unguarded, was an unhandled rejection and a process exit.
    const deactivate = await send(
      host.base,
      "DELETE",
      "/actors/NeverActivatesActor/sake:not-a-uuid",
    );
    expect(deactivate.status).toBe(200);

    // 3. And the host is still serving.
    const ping = await send(
      host.base,
      "PUT",
      "/actors/HealthyActor/h-after-crash/method/ping",
      [{ viewerId: null, kind: "anonymous", requestId: "req-crash-2" }],
    );
    expect(ping.status).toBe(200);
    expect(await ping.text()).toBe("pong");
  });

  it("reports the failed activation by class, code and route — not the SQL, not the id", async () => {
    await send(
      host.base,
      "PUT",
      "/actors/NeverActivatesActor/sake:not-a-uuid/method/get",
      [{ viewerId: null, kind: "anonymous", requestId: "req-telemetry" }],
    );

    const [event] = events("actor.unexpected_error");
    expect(event?.attributes).toEqual({
      "actor.route": "/actors/NeverActivatesActor/:id/method/get",
      "actor.route_kind": "method",
      "actor.type": "NeverActivatesActor",
      "actor.method": "get",
      "error.name": "DrizzleQueryError",
      "error.code": "22P02",
      "error.cause": "DatabaseError",
      "request.id": "req-telemetry",
    });
    // The console line is the durable copy of the event; nothing the client
    // sent, and nothing of the query, is in it.
    for (const secret of [
      "not-a-uuid",
      "Failed query",
      "select",
      "sakes",
      "params",
      "invalid input syntax",
    ]) {
      expect(event?.text).not.toContain(secret);
    }
  });

  it("reports a body parser's refusal on an actor route, which daprd turns into a 500", async () => {
    // The SDK's JSON parser caps a body at 4 MiB and answers 413 through
    // Express's default handler — which daprd hands its caller as a 500
    // (`ERR_ACTOR_INVOKE_METHOD`) that used to be attributable to nothing.
    const response = await fetch(
      `${host.base}/actors/HealthyActor/secret-id/method/get`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([{ requestId: "r" }, "x".repeat(5 * 1024 * 1024)]),
        signal: AbortSignal.timeout(5_000),
      },
    );
    expect(response.status).toBe(413);

    const [event] = events("http.request_failed");
    expect(event?.attributes).toEqual({
      "http.route": "/actors/HealthyActor/:id/method/get",
      "http.status": 413,
      "error.name": "PayloadTooLargeError",
    });
    expect(event?.text).not.toContain("secret-id");
    expect(events("actor.unexpected_error")).toEqual([]);
  });

  it("answers a reminder whose body throws with a 500, and keeps the actor", async () => {
    const ping = await send(
      host.base,
      "PUT",
      "/actors/HealthyActor/h-reminded/method/ping",
      [{ viewerId: null, kind: "anonymous", requestId: "r" }],
    );
    expect(ping.status).toBe(200);

    const reminder = await send(
      host.base,
      "PUT",
      "/actors/HealthyActor/h-reminded/method/remind/drain",
      { data: "", dueTime: "2s", period: "2s" },
    );
    expect(reminder.status).toBe(500);
    const [event] = events("actor.unexpected_error");
    expect(event?.attributes).toMatchObject({
      "actor.route": "/actors/HealthyActor/:id/method/remind/drain",
      "actor.route_kind": "reminder",
      "error.name": "Error",
    });
    expect(event?.text).not.toContain("secret-customer@example.com");

    const again = await send(
      host.base,
      "PUT",
      "/actors/HealthyActor/h-reminded/method/ping",
      [{ viewerId: null, kind: "anonymous", requestId: "r" }],
    );
    expect(again.status).toBe(200);
  });

  it("answers a reminder on an actor whose activation throws with a 500", async () => {
    const reminder = await send(
      host.base,
      "PUT",
      "/actors/NeverActivatesActor/sake:reminded/method/remind/drain",
      { data: "", dueTime: "2s", period: "2s" },
    );
    expect(reminder.status).toBe(500);
    expect(await reminder.json()).toEqual(OPAQUE_ERROR_BODY);
  });

  it("answers a malformed entity key with a typed NOT_FOUND, and no failed activation", async () => {
    // What `item(type: SAKE, id: "not-a-uuid")` reaches now. The activation
    // succeeds with no row and no query; the turn is refused before `get` runs.
    const call = await send(
      host.base,
      "PUT",
      "/actors/UuidKeyedActor/not-a-uuid/method/get",
      [{ viewerId: null, kind: "anonymous", requestId: "req-malformed" }],
    );
    expect(call.status).toBe(200);
    expect(call.headers.get(DAPR_ERROR_RESPONSE_HEADER)).toBe("1");
    expect(await call.json()).toEqual({
      code: "NOT_FOUND",
      message: "UuidKeyedActor(not-a-uuid) has no row",
    });
    expect(events("actor.unexpected_error")).toHaveLength(0);

    // The SDK holds it — the activation did not fail — so the idle-timeout
    // DELETE is an ordinary deactivation, not the "not held" branch.
    const deactivate = await send(
      host.base,
      "DELETE",
      "/actors/UuidKeyedActor/not-a-uuid",
    );
    expect(deactivate.status).toBe(200);
    expect(events("actor.deactivate_unheld")).toHaveLength(0);
  });

  it("still deactivates an actor it does hold, and only once", async () => {
    await send(host.base, "PUT", "/actors/HealthyActor/h-held/method/ping", [
      { viewerId: null, kind: "anonymous", requestId: "r" },
    ]);

    const first = await send(
      host.base,
      "DELETE",
      "/actors/HealthyActor/h-held",
    );
    expect(first.status).toBe(200);
    // A real deactivation: not the "not held" branch.
    expect(events("actor.deactivate_unheld")).toHaveLength(0);

    // The SDK let go of it, so a repeat (daprd halting twice across a
    // placement flap) is the harmless branch — the `singleton` crash.
    const second = await send(
      host.base,
      "DELETE",
      "/actors/HealthyActor/h-held",
    );
    expect(second.status).toBe(200);
    expect(events("actor.deactivate_unheld")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("the pieces", () => {
  it("recognises only the SDK's ACTOR_NOT_ACTIVATED refusal", () => {
    expect(
      isNotActivated(
        new Error(
          JSON.stringify({
            error: "ACTOR_NOT_ACTIVATED",
            errorMsg: "The actor x was not activated",
          }),
        ),
      ),
    ).toBe(true);
    expect(isNotActivated(new Error("ACTOR_NOT_ACTIVATED"))).toBe(false);
    expect(isNotActivated(new Error(JSON.stringify({ error: "OTHER" })))).toBe(
      false,
    );
    expect(isNotActivated("ACTOR_NOT_ACTIVATED")).toBe(false);
  });

  it("restores the app's registrars and leaves app.get(setting) a getter", async () => {
    const app = express();
    const before = app.put;
    app.set("probe", "value");
    await guardRoutesRegisteredDuring(app, async () => {
      expect(app.put).not.toBe(before);
      expect(app.get("probe")).toBe("value");
    });
    expect(app.put).toBe(before);
    expect(app.get("probe")).toBe("value");
  });

  it("reports a non-actor route's 500 by route class, never its path, and leaves the answer alone", async () => {
    const app = express();
    app.get("/api/auth/reset-password/:token", () => {
      throw new TypeError("the message is not logged");
    });
    app.post("/api/auth/sign-in/email", express.json(), (_req, res) => {
      res.status(200).end();
    });
    await installActorRouteGuard(app, async () => {});
    const listening = await listen(app);
    const seen: Line[] = [];
    try {
      vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
      vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
        lines = [];
        record(...args);
        seen.push(...lines);
      });
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});

      const failed = await fetch(
        `${listening.base}/api/auth/reset-password/tok-SECRET`,
        { signal: AbortSignal.timeout(3_000) },
      );
      // Same status as ever; `finalErrorHandler` answers it, as JSON.
      expect(failed.status).toBe(500);
      expect(await failed.json()).toEqual({ code: "INTERNAL" });

      // A client's malformed body on a non-actor route is its 400, not ours.
      const malformed = await fetch(
        `${listening.base}/api/auth/sign-in/email`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{nope",
          signal: AbortSignal.timeout(3_000),
        },
      );
      expect(malformed.status).toBe(400);
      expect(await malformed.json()).toEqual({ code: "BAD_REQUEST" });

      const reported = seen.filter(
        (line) => line.name === "http.request_failed",
      );
      expect(reported.map((line) => line.attributes)).toEqual([
        {
          "http.route": "/api/auth/*",
          "http.status": 500,
          "error.name": "TypeError",
        },
      ]);
      expect(reported[0]?.text).not.toContain("tok-SECRET");
      expect(reported[0]?.text).not.toContain("not logged");
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      await listening.close();
    }
  });

  // Express 4's finalhandler writes `err.stack` whenever NODE_ENV is not
  // `production` — every lane but the image. Measured on the shared stack:
  // `POST /healthz` with `{bad` answered the body-parser's stack and paths.
  it("never writes a stack, a message or HTML, on any route, whatever NODE_ENV says", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const app = express();
    app.post("/healthz", express.json(), (_req, res) => {
      res.status(200).end();
    });
    app.get("/boom", () => {
      throw new Error("secret-sql: select * from users");
    });
    await installActorRouteGuard(app, async () => {});
    const listening = await listen(app);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const answers = [
        await fetch(`${listening.base}/healthz`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{bad",
          signal: AbortSignal.timeout(3_000),
        }),
        await fetch(`${listening.base}/boom`, {
          signal: AbortSignal.timeout(3_000),
        }),
      ];
      const seen = await Promise.all(
        answers.map(async (response) => ({
          status: response.status,
          type: response.headers.get("content-type"),
          body: await response.text(),
        })),
      );
      expect(
        seen.map(({ status, body }) => [status, JSON.parse(body)]),
      ).toEqual([
        [400, { code: "BAD_REQUEST" }],
        [500, { code: "INTERNAL" }],
      ]);
      for (const { type, body } of seen) {
        expect(type).toContain("application/json");
        expect(body).not.toMatch(/at |node_modules|SyntaxError|secret-sql/);
      }
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      await listening.close();
    }
  });

  it("routes a handler that rejects with a non-Error to the error handler, not the next route", async () => {
    const app = express();
    await installActorRouteGuard(app, async () => {
      app.put("/actors/T/:id/method/m", () => Promise.reject(undefined));
    });
    app.put("/actors/T/:id/method/m", (_req, res) => {
      res.status(200).send("fell through");
    });
    const listening = await listen(app);
    try {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await send(
        listening.base,
        "PUT",
        "/actors/T/x/method/m",
      );
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("fell through");
    } finally {
      vi.restoreAllMocks();
      await listening.close();
    }
  });

  // Express 5's router settles a returned promise itself. A guard that also
  // returned it called `next(error)` twice: the second ran the handlers behind
  // the one that answered and reached Express's final handler, which destroys
  // the socket of a response already sent — one lost daprd connection per
  // failed call. Measured before the fix: neither request reused the socket,
  // and every failure was also reported as `http.request_failed`.
  it("hands a rejection on once: one report, and the connection is kept", async () => {
    const app = express();
    await installActorRouteGuard(app, async () => {
      app.put("/actors/T/:id/method/m", async () => {
        throw new Error("boom");
      });
    });
    const listening = await listen(app);
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const errors: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    const request = () =>
      new Promise<{ status: number; reused: boolean }>((resolve, reject) => {
        const req = http.request(
          `${listening.base}/actors/T/x/method/m`,
          { method: "PUT", agent },
          (res) => {
            res.resume();
            res.on("end", () =>
              resolve({
                status: res.statusCode ?? 0,
                reused: req.reusedSocket,
              }),
            );
          },
        );
        req.on("error", reject);
        req.end();
      });
    try {
      const first = await request();
      const second = await request();
      expect(first.status).toBe(500);
      expect(second).toEqual({ status: 500, reused: true });
      expect(
        errors.filter((args) =>
          String(args[0]).includes("http.request_failed"),
        ),
      ).toEqual([]);
    } finally {
      agent.destroy();
      vi.restoreAllMocks();
      await listening.close();
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("control: the same SDK without the guard", () => {
  /**
   * The hazard, pinned. Should `@dapr/dapr` ever catch its own deactivation
   * error, this goes red — and the guard's deactivation branch is worth
   * re-reading rather than deleting blind, since daprd still sends the DELETE.
   *
   * Under Express 4 the SDK's rejection was unhandled — no answer, and a
   * process exit. Express 5's router settles a returned promise itself, so
   * the crash is gone without the guard; what is left is Express's default
   * answer, a `500` (an HTML page, `err.stack` outside production), where
   * daprd asked for a deactivation there is nothing to do for. The guard
   * still owns the `200` and the opaque body.
   *
   * vitest treats any unhandled rejection as a failed run; so its listeners
   * step aside for the length of this one request and a local one records
   * what arrives instead, so a regression to "unhandled" is named here.
   */
  it("answers the DELETE with Express's own 500, not the 200 daprd needs", async () => {
    const host = await actorHost({ guarded: false });
    const saved = process.listeners("unhandledRejection");
    process.removeAllListeners("unhandledRejection");
    const unhandled: unknown[] = [];
    const record = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", record);
    try {
      const outcome = await send(
        host.base,
        "DELETE",
        "/actors/NeverActivatesActor/sake:control",
      ).then(
        (response) => `status ${response.status}`,
        () => "no answer",
      );
      expect(outcome).toBe("status 500");
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", record);
      for (const listener of saved) {
        process.on("unhandledRejection", listener as (reason: unknown) => void);
      }
      await host.close();
    }
  });
});
