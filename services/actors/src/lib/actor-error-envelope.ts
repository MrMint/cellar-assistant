/**
 * The actor host's error envelope (A7b, migration-plan §6 · §8.3).
 *
 * §8.3 says a mutation returns `<Command>Result`: the payload, or one of the
 * five typed errors. Pothos' `plugin-errors` matches a thrown error to its
 * GraphQL type by `instanceof`, and `services/api/src/dapr.ts` rebuilds the class
 * from a `{ code, message }` body (`parseActorErrorPayload`). Nothing produced
 * that body, so every domain error arrived as an opaque `ActorInvocationError`.
 * This is the producing half.
 *
 * ## Two things are in the way, and both are load-bearing
 *
 * 1. **The SDK serialises a thrown `Error` with `JSON.stringify`.**
 *    `HTTPServerActor.handlerMethod` catches, sets 500 and calls
 *    `res.send(err)`; Express JSON-encodes it. `message` and `stack` are
 *    non-enumerable on `Error`, so what actually crossed was *whatever own
 *    enumerable properties the error happened to carry*. For `ActorError` that
 *    is `{ code, name }` — the message silently dropped. For a `pg`
 *    `DatabaseError` it is `severity`, `detail`, `hint`, `where`,
 *    `internalQuery`, `table`, `column`, … fragments of the failing SQL, handed
 *    to the client. Both halves of that are fixed here.
 *
 * 2. **Dapr signals an actor failure with a header, not a status code.**
 *    `pkg/actors/targets/app/transport/http.Invoke` (daprd 1.18.3) checks the
 *    app's status *first*: anything that is not `200` becomes
 *    `{"errorCode":"ERR_ACTOR_INVOKE_METHOD","message":"error from actor
 *    service: (500) <the app's body>"}`, which is why a clean `{code,message}`
 *    body sent with a 500 still reaches `services/api` buried inside a string.
 *    Only *after* that check does it look for `X-Daprerrorresponseheader`, and
 *    the source says why: "the .NET SDK signals actor failure through a
 *    response header instead of a non-2xx status code". When the header is
 *    present the sidecar returns the host's status, content type, body **and
 *    the header** verbatim (`pkg/api/http/actors.go`, `onDirectActorMessage`),
 *    including across the remote sidecar hop (`pkg/actors/router`,
 *    `callRemoteActor`).
 *
 * So a typed failure leaves this host as **HTTP 200 plus the header**. That is
 * not a workaround, it is the protocol; the status code is the transport's, and
 * the header is the error. Both callers
 * (`services/api/src/dapr.ts`, `../lib/sidecar.ts`) treat a `200` carrying
 * `DAPR_ERROR_RESPONSE_HEADER` as a failure and never as a result.
 *
 * ## What crosses the wire
 *
 * A known `ActorError` — and only those — gets the typed envelope:
 *
 * ```http
 * HTTP/1.1 200 OK
 * content-type: application/json; charset=utf-8
 * x-daprerrorresponseheader: 1
 *
 * {"code":"FORBIDDEN","message":"CellarActor(…): not an owner"}
 * ```
 *
 * Anything else — a genuine bug, a database error, a failure in a dependency —
 * keeps the old path deliberately: **500, no header**, and a body with no
 * message, no stack and no vendor fields. The sidecar wraps it exactly as it
 * does today and `services/api` raises its opaque `ActorInvocationError`:
 *
 * ```http
 * HTTP/1.1 500 Internal Server Error
 * content-type: application/json; charset=utf-8
 *
 * {"code":"INTERNAL"}
 * ```
 *
 * The real error is not lost, it is just not the client's: it is emitted as
 * `actor.unexpected_error` (severity ERROR). That event carries the error's
 * class, its code (a SQLSTATE, for a database error) and the route **with the
 * actor id elided** — never the message, which for a failed query is the SQL
 * plus the parameter the client sent, and never the id, which is user input.
 * What joins it to the `services/api` side is `request.id`, read from the
 * `ctx` every method receives first. See {@link reportUnexpectedActorError}.
 *
 * ## Where it hooks
 *
 * `handlerMethod` catches its own errors, so an Express error-handling
 * middleware never fires. The response is intercepted instead: `res.send` is
 * wrapped for the actor-method route only, and reshapes the body when the SDK
 * hands it an `Error`. Registered on the app *before* `DaprServer` installs its
 * routes — the same ordering trick `src/auth/mount.ts` uses.
 *
 * Known gap: the SDK only sets 500 `if (err instanceof Error)`, so a thrown
 * non-`Error` (`throw "nope"`) still leaves as a 200 carrying the thrown value,
 * indistinguishable at this layer from a legitimate return. Nothing in this
 * codebase throws a non-`Error`; do not start.
 */
import type { ActorErrorPayload } from "@cellar-assistant/contracts";
import {
  DAPR_ERROR_RESPONSE_HEADER,
  isActorError,
} from "@cellar-assistant/contracts";
import type { Express, Request, Response } from "express";
import {
  boundedName,
  emit,
  errorAttributes,
  stackFrames,
} from "./telemetry.ts";

/**
 * The body for everything that is not one of the five. Deliberately not an
 * `ActorErrorCode`, so `parseActorErrorPayload` returns `null` and `services/api`
 * takes the `ActorInvocationError` branch it already has.
 */
export const OPAQUE_ERROR_BODY = { code: "INTERNAL" } as const;

/**
 * `PUT /actors/<type>/<id>/method/<name>`, excluding the timer and reminder
 * routes the SDK hangs off the same prefix. Those are fired by the scheduler,
 * not by a caller who could be told anything, and Dapr reads a *different*
 * header on them (`X-Daprremindercancel`).
 *
 * Case-insensitive, and a trailing slash allowed, on purpose: this decides
 * which responses are *sanitised*, so it must match at least everything the
 * router could send to the SDK's method handler. The host routes
 * case-sensitively and refuses a trailing slash (`./host-app.ts`), so today
 * the two readings coincide; if that ever regressed, a spelling the router
 * accepts would otherwise reach the SDK's `res.send(err)` unshaped — `pg`'s
 * `detail`, `where` and `table` fields and all.
 */
const ACTOR_METHOD_ROUTE =
  /^\/actors\/[^/]+\/[^/]+\/method\/(?!timer\/|remind\/)[^/]+\/?$/i;

const isActorMethodRequest = (req: Request): boolean =>
  req.method === "PUT" && ACTOR_METHOD_ROUTE.test(req.path);

/* -------------------------------------------------------------------------- */
/* Reporting what the client is not told                                      */
/* -------------------------------------------------------------------------- */

/** Which of the SDK's actor routes a request hit. */
export type ActorRouteKind =
  | "method"
  | "reminder"
  | "timer"
  | "deactivate"
  | "other";

export type ActorRoute = {
  readonly kind: ActorRouteKind;
  /** The actor type, or `invalid` when the segment is not a class name. */
  readonly actorType: string;
  /** The method, reminder or timer name; `-` for a deactivation. */
  readonly name: string;
  /**
   * The route with the actor id replaced by `:id` —
   * `/actors/ItemActor/:id/method/get`. Everything left in it is either a
   * literal of the SDK's routing table or a bounded name, so it may be logged.
   */
  readonly template: string;
};

/**
 * The SDK's five actor routes (`HTTPServerActor.init`, `@dapr/dapr` 3.18.0):
 * a method, a reminder and a timer (all `PUT`), and a deactivation (`DELETE`).
 * The id is the only segment a client chooses, and it is the one dropped.
 *
 * Read as leniently as Express 4 routes by default — any case, one trailing
 * slash — so every consumer that uses this to decide how to *report or
 * sanitise* a failure (`./actor-route-guard.ts`) covers at least what an
 * unhardened router would dispatch. The template is always spelled in the
 * SDK's own lower case. Nothing uses this to decide what to *let through*:
 * the allow-list parses strictly (`./actor-method-allowlist.ts`).
 */
export const describeActorRoute = (
  method: string,
  path: string,
): ActorRoute => {
  const match =
    /^\/actors\/([^/]+)\/[^/]+(?:\/method\/(?:(remind|timer)\/)?([^/]+))?\/?$/i.exec(
      path,
    );
  if (match === null) {
    return { kind: "other", actorType: "-", name: "-", template: "other" };
  }
  const actorType = boundedName(match[1], "invalid");
  const sub = match[2]?.toLowerCase();
  const rawName = match[3];
  if (rawName === undefined) {
    return method === "DELETE"
      ? {
          kind: "deactivate",
          actorType,
          name: "-",
          template: `/actors/${actorType}/:id`,
        }
      : { kind: "other", actorType, name: "-", template: "other" };
  }
  const name = boundedName(rawName, "invalid");
  const kind: ActorRouteKind =
    sub === "remind" ? "reminder" : sub === "timer" ? "timer" : "method";
  const infix = sub === undefined ? "" : `${sub}/`;
  return {
    kind,
    actorType,
    name,
    template: `/actors/${actorType}/:id/method/${infix}${name}`,
  };
};

/**
 * `ctx.requestId` from a method call's body, when it is safe to log.
 *
 * Every actor method takes `ctx` first (§8.2), and the SDK's body parser has
 * already turned the invocation's JSON into `[ctx, ...args]` by the time a
 * handler answers. The shape admits `services/api`'s sanitised ids
 * (`request-id.ts`: `[A-Za-z0-9_-]{1,64}`) and the outbox's `outbox:<uuid>`;
 * anything else is dropped rather than trimmed — a trimmed id would still look
 * like one and join nothing.
 */
export const requestIdOf = (body: unknown): string | null => {
  const ctx = Array.isArray(body) ? body[0] : body;
  const requestId = (ctx as { requestId?: unknown } | null)?.requestId;
  return typeof requestId === "string" &&
    /^[A-Za-z0-9_:-]{1,80}$/.test(requestId)
    ? requestId
    : null;
};

/**
 * `actor.unexpected_error`: an error on an actor route that no caller will be
 * told about. Class, code, cause class and the id-less route template; the
 * request id when there is one. The stack frames go to stdout only.
 */
export const reportUnexpectedActorError = (
  req: Pick<Request, "method" | "path" | "body">,
  error: unknown,
): void => {
  const route = describeActorRoute(req.method, req.path);
  const attributes = errorAttributes(error);
  const requestId = requestIdOf(req.body);
  const code =
    attributes["error.code"] === undefined
      ? ""
      : ` (${attributes["error.code"]})`;
  emit({
    name: "actor.unexpected_error",
    severity: "ERROR",
    message: `${route.template}: ${attributes["error.name"]}${code}`,
    attributes: {
      "actor.route": route.template,
      "actor.route_kind": route.kind,
      "actor.type": route.actorType,
      "actor.method": route.name,
      ...attributes,
      ...(requestId === null ? {} : { "request.id": requestId }),
    },
    localDetail: stackFrames(error),
  });
};

/**
 * `{ code, message }` for the five, `{ code: "INTERNAL" }` for everything else.
 *
 * `reason` rides along only when the error carries one, so the body a reader
 * that predates the field sees is byte-for-byte what it saw before.
 */
export const envelopeFor = (
  error: Error,
): ActorErrorPayload | typeof OPAQUE_ERROR_BODY =>
  isActorError(error)
    ? {
        code: error.code,
        message: error.message,
        ...(error.reason === null ? {} : { reason: error.reason }),
      }
    : OPAQUE_ERROR_BODY;

/**
 * Wrap `res.send` so an `Error` handed to it by the SDK leaves as an envelope.
 *
 * Exported for the unit test, which drives it with a fake request/response
 * rather than standing up an HTTP server and a sidecar.
 */
export const shapeActorErrors = (req: Request, res: Response): void => {
  if (!isActorMethodRequest(req)) return;
  const original = res.send.bind(res);
  res.send = ((body: unknown) => {
    if (!(body instanceof Error)) return original(body as never);
    // Restore first: `res.json` below routes back through `res.send`, and the
    // string it passes must reach Express, not this wrapper.
    res.send = original as Response["send"];

    if (isActorError(body)) {
      // 200 + header: Dapr's own signal for an application-level actor error.
      res.status(200);
      res.setHeader(DAPR_ERROR_RESPONSE_HEADER, "1");
    } else {
      reportUnexpectedActorError(req, body);
      res.status(500);
    }
    return res.json(envelopeFor(body));
  }) as Response["send"];
};

/**
 * Install the envelope on the actor host's Express app.
 *
 * Must run before `server.actor.init()` registers the actor routes — Express
 * matches in registration order.
 */
export const installActorErrorEnvelope = (app: Express): void => {
  app.use((req, res, next) => {
    shapeActorErrors(req, res);
    next();
  });
};
