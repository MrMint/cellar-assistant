/**
 * The wire boundary (`./actor-method-allowlist.ts`): which routes reach the
 * SDK, and which `ctx` reaches a method body — against the real registry, and
 * through a real Express app standing in for the SDK's routes.
 */
import type { AddressInfo } from "node:net";
import type { AnyActorDescriptor, Ctx } from "@cellar-assistant/contracts";
import {
  ActorError,
  adminCtx,
  anonymousCtx,
  declaredMethods,
  systemCtx,
  userCtx,
} from "@cellar-assistant/contracts";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACTOR_REGISTRY } from "../actors/registry.ts";
import {
  actorMethodAllowlistMiddleware,
  guardDeclaredMethods,
  isWellFormedCtx,
  methodAllowlist,
  refusalFor,
  refusalForParams,
} from "./actor-method-allowlist.ts";
import { CollectionActorBase } from "./collection-actor-base.ts";
import { SearchActorBase } from "./search-actor-base.ts";
import { ViewActorBase } from "./view-actor-base.ts";

const VIEWER = "00000000-0000-4000-8000-000000000001";

/* -------------------------------------------------------------------------- */
/* ctx                                                                         */
/* -------------------------------------------------------------------------- */

describe("isWellFormedCtx", () => {
  it.each([
    ["anonymous", anonymousCtx("r")],
    ["a user", userCtx(VIEWER, "r")],
    ["an admin", adminCtx(VIEWER, "r")],
    ["system", systemCtx("r")],
  ])("accepts %s, as the contracts constructors build it", (_what, ctx) => {
    expect(isWellFormedCtx(ctx)).toBe(true);
  });

  it.each([
    ["an empty object", {}],
    ["null", null],
    ["an array", [userCtx(VIEWER, "r")]],
    ["a missing viewerId", { kind: "user", requestId: "r" }],
    [
      "an undefined viewerId",
      { kind: "user", viewerId: undefined, requestId: "r" },
    ],
    ["an empty viewerId", { kind: "user", viewerId: "", requestId: "r" }],
    ["a numeric viewerId", { kind: "user", viewerId: 7, requestId: "r" }],
    [
      "a viewerId that is not a uuid",
      { kind: "user", viewerId: "user-1", requestId: "r" },
    ],
    [
      "an upper-case spelling of a uuid",
      {
        kind: "user",
        viewerId: "00000000-0000-4000-8000-00000000000A",
        requestId: "r",
      },
    ],
    [
      "an admin whose viewerId is not a uuid",
      { kind: "admin", viewerId: "root", requestId: "r" },
    ],
    [
      "a uuid with trailing text",
      { kind: "user", viewerId: `${VIEWER} `, requestId: "r" },
    ],
    ["an unknown kind", { kind: "root", viewerId: null, requestId: "r" }],
    [
      "an admin with no viewer",
      { kind: "admin", viewerId: null, requestId: "r" },
    ],
    [
      "a system ctx with a viewer",
      { kind: "system", viewerId: VIEWER, requestId: "r" },
    ],
    ["a missing requestId", { kind: "system", viewerId: null }],
  ])("refuses %s", (_what, value) => {
    expect(isWellFormedCtx(value)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* guardDeclaredMethods                                                        */
/* -------------------------------------------------------------------------- */

describe("guardDeclaredMethods", () => {
  class Base {
    reached = 0;
    async shared(_ctx: Ctx): Promise<string> {
      this.reached += 1;
      return "shared";
    }
  }
  class Guarded extends Base {
    async own(ctx: Ctx, _payload?: unknown): Promise<string | null> {
      this.reached += 1;
      return ctx.viewerId;
    }
    async helper(): Promise<string> {
      return "not declared";
    }
  }
  class Sibling extends Base {}
  const descriptor: AnyActorDescriptor = {
    actorType: "Guarded",
    category: "entity",
    methods: { own: {} },
    internalMethods: { shared: {} },
  };
  guardDeclaredMethods(Guarded, descriptor);
  guardDeclaredMethods(Guarded, descriptor); // idempotent

  const code = async (call: Promise<unknown>): Promise<string> => {
    try {
      await call;
      return "ok";
    } catch (error) {
      return error instanceof ActorError ? error.code : String(error);
    }
  };

  it("refuses a malformed ctx as a rejection, before the body runs", async () => {
    const actor = new Guarded();
    const refused = actor.own({} as Ctx);
    expect(refused).toBeInstanceOf(Promise);
    expect(await code(refused)).toBe("FORBIDDEN");
    expect(await code(actor.shared({ kind: "user" } as Ctx))).toBe("FORBIDDEN");
    expect(actor.reached).toBe(0);
  });

  it("passes a well-formed ctx through, public and internal alike", async () => {
    const actor = new Guarded();
    expect(await actor.own(userCtx(VIEWER, "r"))).toBe(VIEWER);
    expect(await actor.shared(systemCtx("r"))).toBe("shared");
    expect(actor.reached).toBe(2);
  });

  // Every test above calls with one argument, so a guard that looked at *any*
  // argument, or at the last one, passed them all. A real delivery is
  // `(ctx, payload)`, and a payload can be ctx-shaped: it is the caller's JSON.
  it("checks the first argument, and only the first, when there is a payload", async () => {
    const actor = new Guarded();
    expect(await code(actor.own({} as Ctx, userCtx(VIEWER, "r")))).toBe(
      "FORBIDDEN",
    );
    expect(await code(actor.own({} as Ctx, systemCtx("r")))).toBe("FORBIDDEN");
    expect(actor.reached).toBe(0);
    expect(await actor.own(userCtx(VIEWER, "r"), { junk: 1 })).toBe(VIEWER);
    expect(await actor.own(userCtx(VIEWER, "r"), {} as Ctx)).toBe(VIEWER);
    expect(actor.reached).toBe(2);
  });

  it("wraps an inherited method on the subclass, not on the base", async () => {
    expect(Object.hasOwn(Guarded.prototype, "shared")).toBe(true);
    expect(await code(new Sibling().shared({} as Ctx))).toBe("ok");
  });

  it("leaves undeclared methods alone — the route allow-list refuses those", async () => {
    expect(await new Guarded().helper()).toBe("not declared");
  });

  it("fails registration for a declared name the class does not have", () => {
    expect(() =>
      guardDeclaredMethods(Guarded, {
        actorType: "Guarded",
        category: "entity",
        methods: { missing: {} },
      }),
    ).toThrow(/has no such method/);
  });
});

describe("every registered actor's declared methods refuse a malformed ctx", () => {
  for (const { actorClass, descriptor } of ACTOR_REGISTRY) {
    it(descriptor.actorType, async () => {
      const prototype = actorClass.prototype as Record<
        string,
        (ctx: unknown) => Promise<unknown>
      >;
      for (const name of declaredMethods(descriptor)) {
        // `this` is a bare object: the guard must refuse before touching it.
        const call = prototype[name]?.call(Object.create(prototype), {});
        await expect(call, `${descriptor.actorType}.${name}`).rejects.toThrow(
          /not a well-formed ctx/,
        );
      }
    });
  }
});

/* -------------------------------------------------------------------------- */
/* Routes                                                                      */
/* -------------------------------------------------------------------------- */

const allowlist = methodAllowlist(ACTOR_REGISTRY);

/** Every function reachable on `actorClass`'s prototype chain below Object. */
const dispatchableNames = (actorClass: { prototype: object }): string[] => {
  const names = new Set<string>();
  for (
    let at: object | null = actorClass.prototype;
    at !== null && at !== Object.prototype;
    at = Object.getPrototypeOf(at)
  ) {
    for (const name of Object.getOwnPropertyNames(at)) {
      const property = Object.getOwnPropertyDescriptor(at, name);
      if (typeof property?.value === "function") names.add(name);
    }
  }
  return [...names];
};

describe("refusalFor, against the real registry", () => {
  it("lets every declared method of every actor through", () => {
    for (const { descriptor } of ACTOR_REGISTRY) {
      for (const name of declaredMethods(descriptor)) {
        expect(
          refusalFor(
            allowlist,
            "PUT",
            `/actors/${descriptor.actorType}/some-id/method/${name}`,
          ),
          `${descriptor.actorType}.${name}`,
        ).toBeNull();
      }
    }
  });

  it("refuses every other function Dapr would dispatch — tx, setAggregate, reload, …", () => {
    let refused = 0;
    for (const { actorClass, descriptor } of ACTOR_REGISTRY) {
      const declared = new Set(declaredMethods(descriptor));
      for (const name of dispatchableNames(actorClass)) {
        if (declared.has(name)) continue;
        refused += 1;
        expect(
          refusalFor(
            allowlist,
            "PUT",
            `/actors/${descriptor.actorType}/some-id/method/${name}`,
          ),
          `${descriptor.actorType}.${name}`,
        ).toBe("undeclared-method");
      }
    }
    // The canary: the prototype walk found the helpers it exists to refuse.
    expect(refused).toBeGreaterThan(100);
    const cellar = ACTOR_REGISTRY.find(
      ({ descriptor }) => descriptor.actorType === "CellarActor",
    );
    expect(dispatchableNames(cellar?.actorClass ?? Object)).toEqual(
      expect.arrayContaining(["tx", "reload", "setAggregate", "onActivate"]),
    );
  });

  it("keeps the test counters off the dispatchable surface entirely", () => {
    for (const [base, name] of [
      [CollectionActorBase, "queryCount"],
      [SearchActorBase, "searchRuns"],
      [ViewActorBase, "projectionRuns"],
    ] as const) {
      const property = Object.getOwnPropertyDescriptor(base.prototype, name);
      expect(typeof property?.get, name).toBe("function");
      expect(property?.value, name).toBeUndefined();
    }
  });

  it("refuses an unknown actor type, every timer, and nothing that is not a PUT", () => {
    expect(
      refusalFor(allowlist, "PUT", "/actors/NoSuchActor/x/method/get"),
    ).toBe("unknown-actor-type");
    expect(
      refusalFor(allowlist, "PUT", "/actors/CellarActor/x/method/timer/any"),
    ).toBe("timer");
    expect(
      refusalFor(
        allowlist,
        "PUT",
        "/actors/OutboxActor/singleton/method/remind/drain",
      ),
    ).toBeNull();
    expect(
      refusalFor(allowlist, "PUT", "/actors/NoSuchActor/x/method/remind/drain"),
    ).toBe("unknown-actor-type");
    expect(refusalFor(allowlist, "DELETE", "/actors/CellarActor/x")).toBeNull();
    expect(refusalFor(allowlist, "GET", "/dapr/config")).toBeNull();
    expect(refusalFor(allowlist, "POST", "/api/auth/sign-in/email")).toBeNull();
  });

  it("decodes the segments the way the SDK's router does", () => {
    expect(
      refusalFor(allowlist, "PUT", "/actors/CellarActor/x/method/%67et"),
    ).toBeNull();
    expect(
      refusalFor(allowlist, "PUT", "/actors/CellarActor/x/method/%E0%A4%A"),
    ).toBe("undeclared-method");
  });
});

describe("refusalFor fails closed on any spelling it does not recognise", () => {
  // Each of these is routed to an SDK handler by Express 4's default,
  // case-insensitive, non-strict routing. It used to read every one of them
  // as "not an actor route" and let it through.
  it.each([
    ["PUT", "/ACTORS/CellarActor/x/method/get"],
    ["PUT", "/Actors/CellarActor/x/method/tx"],
    ["PUT", "/actors/CellarActor/x/METHOD/get"],
    ["PUT", "/actors/CellarActor/x/method/tx/"],
    ["PUT", "/actors/CellarActor/x/method/get/"],
    ["PUT", "/actors/CellarActor/x/method/TIMER/t"],
    ["PUT", "/actors/CellarActor/x/method/Remind/r"],
    ["PUT", "/actors/CellarActor/x"],
    ["PUT", "/actors"],
    ["DELETE", "/ACTORS/CellarActor/x"],
    ["DELETE", "/actors/CellarActor/x/"],
    ["DELETE", "/actors/CellarActor/x/method/get"],
    ["POST", "/actors/CellarActor/x/method/get"],
    ["GET", "/actors/CellarActor/x/method/get"],
    ["PATCH", "/Actors/CellarActor/x"],
  ])("%s %s → malformed-route", (method, path) => {
    expect(refusalFor(allowlist, method, path)).toBe("malformed-route");
  });

  it("refuses a deactivation for a type this host does not register", () => {
    expect(refusalFor(allowlist, "DELETE", "/actors/NoSuchActor/x")).toBe(
      "unknown-actor-type",
    );
  });

  it("leaves paths outside /actors to the token check", () => {
    expect(refusalFor(allowlist, "PUT", "/actorsx/CellarActor")).toBeNull();
    expect(refusalFor(allowlist, "GET", "/DAPR/config")).toBeNull();
  });
});

describe("refusalForParams: the parameters the router extracted", () => {
  const params = (
    actorTypeName: string,
    extra: Record<string, string> = {},
  ) => ({
    actorTypeName,
    actorId: "x",
    ...extra,
  });

  it("admits a registered type and a declared method", () => {
    expect(
      refusalForParams(allowlist, "actorTypeName", params("CellarActor")),
    ).toBeNull();
    expect(
      refusalForParams(
        allowlist,
        "methodName",
        params("CellarActor", { methodName: "get" }),
      ),
    ).toBeNull();
    // `actorId` and `reminderName` decide nothing.
    expect(refusalForParams(allowlist, "actorId", params("X"))).toBeNull();
    expect(
      refusalForParams(
        allowlist,
        "reminderName",
        params("OutboxActor", { reminderName: "anything" }),
      ),
    ).toBeNull();
  });

  it("refuses an unknown type, an undeclared method and every timer", () => {
    expect(
      refusalForParams(allowlist, "actorTypeName", params("NoSuchActor")),
    ).toBe("unknown-actor-type");
    expect(
      refusalForParams(
        allowlist,
        "methodName",
        params("CellarActor", { methodName: "tx" }),
      ),
    ).toBe("undeclared-method");
    expect(
      refusalForParams(
        allowlist,
        "methodName",
        params("NoSuchActor", { methodName: "get" }),
      ),
    ).toBe("unknown-actor-type");
    expect(
      refusalForParams(
        allowlist,
        "timerName",
        params("CellarActor", { timerName: "get" }),
      ),
    ).toBe("timer");
  });
});

describe("the middleware, in front of a stand-in for the SDK's routes", () => {
  const reached: string[] = [];
  let base = "";
  let close = (): void => {};

  beforeAll(async () => {
    const app = express();
    app.use(actorMethodAllowlistMiddleware(allowlist));
    // What `new DaprServer` adds after it: a body parser, then the routes.
    app.use((req, _res, next) => {
      reached.push(`parser ${req.path}`);
      next();
    });
    app.use(express.json());
    app.all("/actors/{*splat}", (req, res) => {
      reached.push(`sdk ${req.method} ${req.path}`);
      res.status(200).json({ ok: true });
    });
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => close());

  const put = (path: string) =>
    fetch(`${base}${path}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        { kind: "system", viewerId: null, requestId: "x" },
      ]),
    });

  it("refuses an undeclared method with 404 and the opaque body, before any parser", async () => {
    reached.length = 0;
    const response = await put("/actors/CellarActor/some-id/method/tx");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "INTERNAL" });
    expect(reached).toEqual([]);
  });

  it("refuses a timer, whose method would come from the body", async () => {
    reached.length = 0;
    const response = await put("/actors/CellarActor/some-id/method/timer/t");
    expect(response.status).toBe(404);
    expect(reached).toEqual([]);
  });

  it("lets a declared method through to the SDK", async () => {
    reached.length = 0;
    const response = await put("/actors/CellarActor/some-id/method/get");
    expect(response.status).toBe(200);
    expect(reached).toEqual([
      "parser /actors/CellarActor/some-id/method/get",
      "sdk PUT /actors/CellarActor/some-id/method/get",
    ]);
  });
});
