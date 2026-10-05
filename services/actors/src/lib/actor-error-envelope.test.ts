/**
 * The envelope, driven the way the Dapr SDK drives it (A7b).
 *
 * `HTTPServerActor.handlerMethod` catches, sets a status and calls
 * `res.send(err)` with the *`Error` object itself*. That is the whole contract
 * this file exercises: a fake `req`/`res` pair, `shapeActorErrors` installed on
 * it, then `res.send(error)` — no HTTP server, no sidecar.
 *
 * The sidecar half (`X-Daprerrorresponseheader` surviving both hops, and
 * `services/api` raising a typed error from it) needs real daprd and is
 * `scripts/a7b-acceptance.sh`.
 */
import {
  ConflictError,
  DAPR_ERROR_RESPONSE_HEADER,
  ForbiddenError,
  NotFoundError,
  parseActorErrorPayload,
} from "@cellar-assistant/contracts";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeActorRoute,
  OPAQUE_ERROR_BODY,
  requestIdOf,
  shapeActorErrors,
} from "./actor-error-envelope.ts";

type Sent = {
  status: number;
  headers: Record<string, string>;
  /** Whatever finally reached Express's real `send`. */
  body: unknown;
};

/** Enough of Express's `res` for the three methods the envelope touches. */
const harness = (
  path: string,
  method = "PUT",
): { req: Request; res: Response; sent: Sent } => {
  const sent: Sent = { status: 200, headers: {}, body: undefined };
  const fake = {
    statusCode: 200,
    status: (code: number) => {
      sent.status = code;
      return fake;
    },
    setHeader: (name: string, value: string) => {
      sent.headers[name.toLowerCase()] = value;
      return fake;
    },
    // Express's own `json` sets the content type and then routes through
    // `send`, which is exactly why the envelope has to restore `send` first.
    json: (value: unknown) => {
      sent.headers["content-type"] = "application/json; charset=utf-8";
      return (res.send as (v: unknown) => unknown)(JSON.stringify(value));
    },
    send: (value: unknown) => {
      sent.body = value;
      return fake;
    },
  };
  const res = fake as unknown as Response;
  const req = { method, path } as Request;
  return { req, res, sent };
};

const METHOD_ROUTE = "/actors/CellarActor/c-1/method/rename";

describe("actor error envelope (A7b, §8.3)", () => {
  it("sends a typed error as { code, message } with the Dapr error header", () => {
    const { req, res, sent } = harness(METHOD_ROUTE);
    shapeActorErrors(req, res);

    res.send(new ForbiddenError("CellarActor(c-1): not an owner") as never);

    // 200 is the protocol, not a mistake: daprd's HTTP transport folds any
    // non-200 into ERR_ACTOR_INVOKE_METHOD *before* it looks at the header.
    expect(sent.status).toBe(200);
    expect(sent.headers[DAPR_ERROR_RESPONSE_HEADER]).toBe("1");
    expect(JSON.parse(sent.body as string)).toEqual({
      code: "FORBIDDEN",
      message: "CellarActor(c-1): not an owner",
    });
  });

  it.each([
    "/ACTORS/CellarActor/c-1/method/rename",
    "/Actors/CellarActor/c-1/METHOD/rename",
    "/actors/CellarActor/c-1/method/rename/",
  ])("sanitises %s too: any spelling Express 4 could route to the method handler", (path) => {
    const { req, res, sent } = harness(path);
    shapeActorErrors(req, res);
    res.send(
      Object.assign(new Error("select secret"), {
        detail: "Key (owner)=(u-1)",
      }) as never,
    );
    expect(sent.status).toBe(500);
    expect(JSON.parse(sent.body as string)).toEqual(OPAQUE_ERROR_BODY);
  });

  it("keeps the message, which JSON.stringify(error) silently dropped", () => {
    // The bug this replaces: `message` is non-enumerable on `Error`, so the
    // SDK's `res.send(err)` shipped `{"code":"NOT_FOUND","name":"…"}`.
    expect(JSON.parse(JSON.stringify(new NotFoundError("gone")))).not.toContain(
      "message",
    );

    const { req, res, sent } = harness(METHOD_ROUTE);
    shapeActorErrors(req, res);
    res.send(new NotFoundError("gone") as never);

    expect(JSON.parse(sent.body as string)).toEqual({
      code: "NOT_FOUND",
      message: "gone",
    });
  });

  /**
   * D8's discriminator. `reason` is additive: it appears only when the error
   * carries one, so a reader that predates the field sees the same body.
   */
  it("carries `reason` when there is one, and omits the field when there is not", () => {
    const withReason = harness(METHOD_ROUTE);
    shapeActorErrors(withReason.req, withReason.res);
    withReason.res.send(
      new ConflictError(
        "you are already friends with u-2",
        "ALREADY_FRIENDS",
      ) as never,
    );
    expect(JSON.parse(withReason.sent.body as string)).toEqual({
      code: "CONFLICT",
      message: "you are already friends with u-2",
      reason: "ALREADY_FRIENDS",
    });

    // …and it survives the hop, reconstructed onto the same class.
    const rebuilt = parseActorErrorPayload(withReason.sent.body as string);
    expect(rebuilt).toBeInstanceOf(ConflictError);
    expect(rebuilt?.reason).toBe("ALREADY_FRIENDS");

    const without = harness(METHOD_ROUTE);
    shapeActorErrors(without.req, without.res);
    without.res.send(new ForbiddenError("not an owner") as never);
    expect(JSON.parse(without.sent.body as string)).toEqual({
      code: "FORBIDDEN",
      message: "not an owner",
    });
    expect(parseActorErrorPayload(without.sent.body as string)?.reason).toBe(
      null,
    );
  });

  /**
   * A newer host may send a `reason` this build has never heard of. It is
   * dropped rather than carried through: a client switching on the enum must
   * never be handed a value outside it, and `code` is unchanged either way.
   */
  it("drops a `reason` it does not recognise, keeping the code", () => {
    const rebuilt = parseActorErrorPayload(
      '{"code":"CONFLICT","message":"x","reason":"FROM_A_LATER_RELEASE"}',
    );
    expect(rebuilt).toBeInstanceOf(ConflictError);
    expect(rebuilt?.reason).toBeNull();
  });

  it("leaks nothing from an unexpected throw", () => {
    // Shaped like a `pg` DatabaseError: its diagnostic fields are assigned, so
    // they are own *enumerable* properties and `JSON.stringify` shipped them —
    // `detail`, `where` and `internalQuery` are fragments of the failing SQL.
    const dbError = Object.assign(
      new Error(
        'duplicate key value violates unique constraint "cellars_pkey"',
      ),
      {
        code: "23505",
        detail: "Key (id)=(3f2b…) already exists.",
        table: "cellars",
        where: "PL/pgSQL function audit() line 12",
      },
    );

    const { req, res, sent } = harness(METHOD_ROUTE);
    shapeActorErrors(req, res);
    res.send(dbError as never);

    expect(sent.status).toBe(500);
    // No passthrough header: the sidecar wraps it as it always has and
    // `services/api` raises its opaque `ActorInvocationError`.
    expect(sent.headers[DAPR_ERROR_RESPONSE_HEADER]).toBeUndefined();
    expect(JSON.parse(sent.body as string)).toEqual(OPAQUE_ERROR_BODY);

    const wire = sent.body as string;
    for (const secret of [
      "duplicate key",
      "cellars_pkey",
      "23505",
      "already exists",
      "audit()",
      "stack",
    ]) {
      expect(wire).not.toContain(secret);
    }
  });

  it("passes a successful result through untouched", () => {
    const { req, res, sent } = harness(METHOD_ROUTE);
    shapeActorErrors(req, res);

    res.send({ pong: true } as never);

    expect(sent.status).toBe(200);
    expect(sent.headers[DAPR_ERROR_RESPONSE_HEADER]).toBeUndefined();
    expect(sent.body).toEqual({ pong: true });
  });

  it("leaves the reminder and timer routes alone", () => {
    // Those carry a different Dapr header (`X-Daprremindercancel`) and have no
    // caller to be told anything; `OutboxActor.receiveReminder` never throws.
    for (const path of [
      "/actors/OutboxActor/singleton/method/remind/drain",
      "/actors/OutboxActor/singleton/method/timer/tick",
    ]) {
      const { req, res, sent } = harness(path);
      shapeActorErrors(req, res);
      const error = new ForbiddenError("nope");
      res.send(error as never);
      expect(sent.body).toBe(error);
      expect(sent.headers[DAPR_ERROR_RESPONSE_HEADER]).toBeUndefined();
    }
  });

  it("leaves better-auth and every other route alone", () => {
    const { req, res, sent } = harness("/api/auth/sign-in/email", "POST");
    shapeActorErrors(req, res);
    const error = new ForbiddenError("nope");
    res.send(error as never);
    expect(sent.body).toBe(error);
  });
});

/* -------------------------------------------------------------------------- */

describe("actor.unexpected_error: what the event may say", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  /**
   * The line that shipped to Loki before this: the whole failing statement and
   * `params: not-a-uuid` in `message`, the id in `actor.route`.
   *
   *   [actor.unexpected_error] /actors/ItemActor/sake:not-a-uuid/method/get:
   *   DrizzleQueryError: Failed query: select "id", … from "sakes" where
   *   "sakes"."id" = $1 params: not-a-uuid
   */
  it("carries the class, the SQLSTATE and the id-less route — not the query, not the id", () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
    const printed: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      printed.push(String(line));
    });

    const { req, res } = harness(
      "/actors/ItemActor/sake:not-a-uuid/method/get",
    );
    (req as { body: unknown }).body = [
      { viewerId: "u-1", kind: "user", requestId: "req-7f3a" },
    ];
    shapeActorErrors(req, res);
    res.send(
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
      ) as never,
    );

    expect(printed).toHaveLength(1);
    const [head = ""] = (printed[0] ?? "").split("\n");
    expect(head).toBe(
      "[actor.unexpected_error] /actors/ItemActor/:id/method/get: DrizzleQueryError (22P02) " +
        JSON.stringify({
          "actor.route": "/actors/ItemActor/:id/method/get",
          "actor.route_kind": "method",
          "actor.type": "ItemActor",
          "actor.method": "get",
          "error.name": "DrizzleQueryError",
          "error.code": "22P02",
          "error.cause": "DatabaseError",
          "request.id": "req-7f3a",
        }),
    );
    // Not in the exported line, and not in the stack frames printed after it.
    for (const secret of [
      "not-a-uuid",
      "Failed query",
      "sakes",
      "params",
      "invalid input syntax",
      "u-1",
    ]) {
      expect(printed[0]).not.toContain(secret);
    }
  });

  it("describes each SDK route without its id", () => {
    expect(
      describeActorRoute("PUT", "/actors/CellarActor/c%3A1/method/rename"),
    ).toEqual({
      kind: "method",
      actorType: "CellarActor",
      name: "rename",
      template: "/actors/CellarActor/:id/method/rename",
    });
    expect(
      describeActorRoute(
        "PUT",
        "/actors/OutboxActor/singleton/method/remind/drain",
      ).template,
    ).toBe("/actors/OutboxActor/:id/method/remind/drain");
    expect(
      describeActorRoute("PUT", "/actors/T/x/method/timer/tick").kind,
    ).toBe("timer");
    expect(describeActorRoute("DELETE", "/actors/ItemActor/sake:x")).toEqual({
      kind: "deactivate",
      actorType: "ItemActor",
      name: "-",
      template: "/actors/ItemActor/:id",
    });
    expect(describeActorRoute("POST", "/api/auth/sign-in/email").kind).toBe(
      "other",
    );
    // As leniently as Express 4's default routing reads a path, so a report
    // or a sanitised body never depends on the spelling; the template is
    // always the SDK's own lower case.
    expect(
      describeActorRoute("PUT", "/ACTORS/CellarActor/x/METHOD/get/"),
    ).toEqual({
      kind: "method",
      actorType: "CellarActor",
      name: "get",
      template: "/actors/CellarActor/:id/method/get",
    });
    expect(
      describeActorRoute("PUT", "/Actors/T/x/method/TIMER/tick").kind,
    ).toBe("timer");
    expect(describeActorRoute("DELETE", "/ACTORS/ItemActor/x/").kind).toBe(
      "deactivate",
    );
    // A segment that is not a name is replaced, not echoed.
    expect(
      describeActorRoute("PUT", "/actors/<script>/x/method/a%20b").template,
    ).toBe("/actors/invalid/:id/method/invalid");
  });

  it("takes a request id only in a shape it can join on", () => {
    expect(requestIdOf([{ requestId: "req-1" }])).toBe("req-1");
    expect(requestIdOf([{ requestId: "outbox:3f2b7a52-9f0a" }])).toBe(
      "outbox:3f2b7a52-9f0a",
    );
    expect(requestIdOf([{ requestId: "alice@example.com" }])).toBeNull();
    expect(requestIdOf([{ requestId: "a\nforged line" }])).toBeNull();
    expect(requestIdOf(undefined)).toBeNull();
    expect(requestIdOf("text body")).toBeNull();
  });
});
