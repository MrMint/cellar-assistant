/**
 * No actor route may take the host down.
 *
 * ## The crash this exists for
 *
 * One request with a malformed id — `item(type: SAKE, id: "not-a-uuid")` —
 * brought the whole actor host down, ten minutes after it was answered:
 *
 * 1. daprd routes `ItemActor/sake:not-a-uuid` to this host and records it as
 *    active in *its own* table.
 * 2. The SDK activates it: `ActorManager.activateActor` awaits
 *    `onActivateInternal()` and only then adds the actor to *its* map. The
 *    activation's query threw, so the SDK never recorded it. The caller got a
 *    500 and moved on.
 * 3. At `ACTOR_IDLE_TIMEOUT` (10m) daprd deactivates what it believes is idle:
 *    `DELETE /actors/ItemActor/sake:not-a-uuid`.
 * 4. `ActorManager.deactivateActor` throws `ACTOR_NOT_ACTIVATED` for an actor
 *    it does not hold, and `HTTPServerActor.handlerDeactivate` has no `catch`.
 *    It is an `async` Express 4 handler, and Express 4 ignores the promise a
 *    handler returns, so the rejection is unhandled — and an unhandled
 *    rejection exits Bun, taking every in-flight turn of every actor with it.
 *
 * Measured from the live stack: the `actor.unexpected_error` line at
 * 21:22:30.56 and the crash at 21:32:30.56, and daprd's own
 * `Failed to halt actor ItemActor||sake:not-a-uuid: Delete …: EOF`.
 *
 * The same `DELETE` reaches the SDK without any failed activation, too. The
 * earlier `singleton` crash was daprd's "halt all actors during placement
 * disconnection" sending `DELETE /actors/OutboxActor/singleton` for an actor
 * the SDK no longer held. So "daprd deactivates an actor this process does not
 * hold" is a normal event of the protocol, not an edge case of one bug.
 *
 * `handlerTimer` and `handlerReminder` have the same shape — `async`, no
 * `catch` — so a reminder whose activation or body throws took the host down
 * the same way, immediately rather than ten minutes later.
 *
 * ## What this does
 *
 * - **Settles every handler the SDK registers.** {@link installActorRouteGuard}
 *   runs the SDK's route registration (`server.actor.init()`) with the app's
 *   route methods wrapped, so each handler the SDK hands them is wrapped too: a
 *   rejected promise becomes `next(error)` instead of a process exit. The host
 *   is on Express 5 now, which does that natively, so this half is belt and
 *   braces — and must hand the rejection on exactly once (see `settled`).
 *   Only the Express routing API on our own `app` is touched; nothing inside
 *   `@dapr/dapr` is patched.
 * - **Makes deactivation idempotent.** A `DELETE` for an actor this process
 *   does not hold answers `200`: there is nothing to deactivate, which is what
 *   daprd asked for. It is logged as `actor.deactivate_unheld` (INFO), so a
 *   burst of them — each one an activation that failed, or a placement event —
 *   is still visible.
 * - **Answers everything else with a 500** and the opaque envelope body, and
 *   reports it as `actor.unexpected_error` without the message or the id
 *   (`./actor-error-envelope.ts`).
 * - **Reports what it passes on.** An error it leaves to Express's default
 *   handler — a body parser's 4xx, a non-actor route's failure — is logged
 *   as `http.request_failed` first ({@link unhandledRequestErrorHandler}),
 *   so no failure this host answers goes unattributed.
 *
 * The id itself is also kept out of SQL now (`EntityActorBase.keyShape` in
 * `./actor-base.ts`), so a malformed id no longer fails an activation at all.
 * This file is the layer that holds when something else does.
 */
import type {
  ErrorRequestHandler,
  Express,
  NextFunction,
  Request,
  Response,
} from "express";
import {
  describeActorRoute,
  OPAQUE_ERROR_BODY,
  reportUnexpectedActorError,
} from "./actor-error-envelope.ts";
import { emit, errorAttributes } from "./telemetry.ts";

/** The `app.<method>(path, ...handlers)` registrars the SDK's servers use. */
const ROUTE_METHODS = ["get", "post", "put", "delete", "patch", "all"] as const;

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
type Registrar = (
  this: Express,
  path: unknown,
  ...handlers: unknown[]
) => unknown;

/**
 * A promise rejected with something that is not an `Error`. Wrapped because
 * Express reads a falsy `next()` argument as "carry on" and the strings
 * `"route"` / `"router"` as routing instructions — a handler rejecting with
 * `undefined` must not silently fall through to the next route.
 */
export class NonErrorRejection extends Error {
  constructor() {
    super("a route handler rejected with a value that is not an Error");
    this.name = "NonErrorRejection";
  }
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null)?.then === "function";

/**
 * `handler`, with a rejected promise routed to `next` exactly once.
 *
 * It returns nothing, on purpose. Express 5's router settles a handler's
 * returned promise itself (`next(err)` on rejection), so handing the promise
 * back as well called `next` twice: the second error ran the handlers behind
 * the one that answered — a spurious `http.request_failed` — and ended in
 * Express's own final handler, which destroys the socket of a response
 * already sent. daprd's app channel then lost a pooled connection per failed
 * call (`./app-channel-connections.ts` for why that matters).
 */
const settled = (handler: Handler): Handler =>
  function settledHandler(this: unknown, req, res, next): undefined {
    const result = handler.call(this, req, res, next);
    if (isThenable(result)) {
      result.then(undefined, (reason: unknown) => {
        next(reason instanceof Error ? reason : new NonErrorRejection());
      });
    }
  };

const guardHandlers = (handlers: readonly unknown[]): unknown[] =>
  handlers.map((handler) => {
    if (Array.isArray(handler)) return guardHandlers(handler);
    // Four parameters is how Express recognises an error handler; wrapping
    // one in a three-parameter function would demote it to a route handler.
    if (typeof handler === "function" && handler.length < 4) {
      return settled(handler as Handler);
    }
    return handler;
  });

/**
 * Run `register` with every route it adds to `app` settled.
 *
 * The app's registrars are swapped for the duration and restored afterwards,
 * whatever `register` does. `app.get(name)` with no handler is Express's
 * settings getter, not a route, and passes straight through.
 */
export const guardRoutesRegisteredDuring = async <T>(
  app: Express,
  register: () => Promise<T>,
): Promise<T> => {
  const target = app as unknown as Record<string, Registrar>;
  const saved = ROUTE_METHODS.map(
    (method) => [method, Object.getOwnPropertyDescriptor(app, method)] as const,
  );
  for (const method of ROUTE_METHODS) {
    const original = target[method];
    if (typeof original !== "function") continue;
    target[method] = function guardedRegistrar(path, ...handlers) {
      if (handlers.length === 0) return original.call(this, path);
      return original.call(this, path, ...guardHandlers(handlers));
    };
  }
  try {
    return await register();
  } finally {
    for (const [method, descriptor] of saved) {
      if (descriptor === undefined) delete target[method];
      else Object.defineProperty(app, method, descriptor);
    }
  }
};

/**
 * The SDK's refusal to deactivate an actor it does not hold:
 * `new Error(JSON.stringify({ error: "ACTOR_NOT_ACTIVATED", … }))` in
 * `ActorManager.deactivateActor` (`@dapr/dapr` 3.18.0). Pinned by
 * `actor-route-guard.test.ts` against the real SDK, so a release that changes
 * the wording fails there rather than here.
 */
export const isNotActivated = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown } | null;
    return parsed?.error === "ACTOR_NOT_ACTIVATED";
  } catch {
    return false;
  }
};

const clientErrorStatus = (error: unknown): number | null => {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && status >= 400 && status < 500
    ? status
    : null;
};

/**
 * The last word on an error from an actor route. Installed after the routes,
 * because Express only hands an error to handlers registered after the layer
 * that raised it.
 *
 * Non-actor routes (better-auth, health) and client errors raised by the body
 * parsers (a 400 or 413 with its own status) go on to Express's default
 * handling, exactly as before this existed.
 */
export const actorRouteErrorHandler: ErrorRequestHandler = (
  error: unknown,
  req,
  res,
  next,
) => {
  const route = describeActorRoute(req.method, req.path);
  if (
    res.headersSent ||
    route.kind === "other" ||
    clientErrorStatus(error) !== null
  ) {
    next(error);
    return;
  }

  if (route.kind === "deactivate" && isNotActivated(error)) {
    emit({
      name: "actor.deactivate_unheld",
      severity: "INFO",
      message: `${route.template}: nothing to deactivate, this host does not hold it`,
      attributes: { "actor.type": route.actorType },
    });
    res.status(200).end();
    return;
  }

  reportUnexpectedActorError(req, error);
  res.status(500).json(OPAQUE_ERROR_BODY);
};

/**
 * An error route as a log attribute: an actor route's id-less template, a
 * fixed prefix for the host's other routes, `other` for anything else. Never
 * the path itself — better-auth's include tokens, and an actor route's
 * includes the id.
 */
export const requestRouteClass = (method: string, path: string): string => {
  const route = describeActorRoute(method, path);
  if (route.kind !== "other") return route.template;
  if (path === "/healthz") return "/healthz";
  if (path.startsWith("/api/auth/")) return "/api/auth/*";
  if (path.startsWith("/dapr/")) return "/dapr/*";
  return "other";
};

/** The status Express's own final handler would answer an error with. */
const finalStatus = (error: unknown): number => {
  const carrier = error as { status?: unknown; statusCode?: unknown } | null;
  const status = carrier?.status ?? carrier?.statusCode;
  return typeof status === "number" && status >= 400 && status < 600
    ? status
    : 500;
};

/**
 * Behind {@link actorRouteErrorHandler}: every error it passes on — a client
 * error from a body parser, an error after the headers went, anything on a
 * non-actor route — used to reach Express's default handler, which answered
 * it with no event at all. This reports it first, as `http.request_failed`, and
 * then passes it on unchanged to {@link finalErrorHandler}, which answers it.
 *
 * Reported: every 5xx (ERROR), and any error on an actor route (WARN for a
 * 4xx), because daprd hands its caller *any* non-200 from this host as a 500
 * (`ERR_ACTOR_INVOKE_METHOD`) — a 413 from the body parser is a 500 in
 * `services/api`, and was attributable to nothing. A 4xx on a non-actor
 * route is a client's malformed request, answered as one, and not reported.
 */
export const unhandledRequestErrorHandler: ErrorRequestHandler = (
  error: unknown,
  req,
  _res,
  next,
) => {
  const status = finalStatus(error);
  const route = requestRouteClass(req.method, req.path);
  const actorRoute = describeActorRoute(req.method, req.path).kind !== "other";
  if (status >= 500 || actorRoute) {
    const attributes = errorAttributes(error);
    emit({
      name: "http.request_failed",
      severity: status >= 500 ? "ERROR" : "WARN",
      message: `${route}: ${status} ${attributes["error.name"]}`,
      attributes: { "http.route": route, "http.status": status, ...attributes },
    });
  }
  next(error);
};

/**
 * The last error handler on the app, so Express's own never answers.
 *
 * Express's `finalhandler` (4 and 5) writes an HTML page, and outside
 * `NODE_ENV=production` that page is `err.stack` — measured on the shared
 * lane (`NODE_ENV` unset): `POST /healthz` with a malformed JSON body answered
 * `SyntaxError: … at parse (/workspace/node_modules/.bun/body-parser@1.20.8/…)`,
 * the whole stack and the filesystem layout. Production is mitigated today
 * (the image sets `NODE_ENV=production`; the edge proxies only `/api/auth/*`),
 * but that is two facts elsewhere holding up a property of this process.
 *
 * So every error that gets this far is answered here, as JSON with a status
 * and a code and nothing else: the status Express would have used, `INTERNAL`
 * for a 5xx and `BAD_REQUEST` for a 4xx. Never a message, never a stack, on
 * any route. A response already under way cannot be re-answered; that one
 * goes to Express, which closes the connection without writing a body.
 */
export const finalErrorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const status = finalStatus(error);
  res
    .status(status)
    .json(status >= 500 ? OPAQUE_ERROR_BODY : { code: "BAD_REQUEST" });
};

/**
 * Register the SDK's actor routes through `init` with every handler settled,
 * then append the error handlers behind them. One call, so the two halves
 * cannot be installed in the wrong order:
 *
 * ```ts
 * await installActorRouteGuard(app, () => server.actor.init());
 * ```
 */
export const installActorRouteGuard = async (
  app: Express,
  init: () => Promise<void>,
): Promise<void> => {
  await guardRoutesRegisteredDuring(app, init);
  app.use(actorRouteErrorHandler);
  app.use(unhandledRequestErrorHandler);
  app.use(finalErrorHandler);
};
