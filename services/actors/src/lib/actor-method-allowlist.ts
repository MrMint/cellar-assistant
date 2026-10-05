/**
 * The actor host's wire boundary: only declared methods, only with a
 * well-formed `ctx`.
 *
 * ## What Dapr would otherwise dispatch
 *
 * `ActorManager.callActorMethod` (`@dapr/dapr` 3.18.0) checks exactly one
 * thing about the method a `PUT /actors/<type>/<id>/method/<name>` names:
 * `typeof actor[name] === "function"`. TypeScript's `protected` and `#private`
 * are compile-time only for the former and invisible for the latter, so that
 * test admits every inherited helper too — `tx` (a write transaction on the
 * actor's handle), `writeJob`, `processBatch`, `setAggregate`, `reload`,
 * `onActivate`, the test counters — with arguments the caller chooses. The
 * timer route is wider still: `fireTimer` calls whatever method the request
 * body names as its `callback`.
 *
 * Anything that can reach a sidecar can send those requests. Dapr's API
 * tokens (`docs/architecture/target-stack.md`, "Dapr API tokens") narrow
 * *who* that is; this narrows *what* they can do, and keeps holding if a token
 * leaks.
 *
 * ## The two halves
 *
 * 1. **{@link installActorMethodAllowlist}** — an Express middleware in front
 *    of the SDK's routes (and its body parsers), so a refused call never
 *    parses a body and never activates an actor. A method route passes only
 *    when the name is in the actor type's descriptor tables (`methods` and
 *    `internalMethods`, exhaustive by type — `packages/contracts`'
 *    `ActorDescriptor`). The reminder route passes for any registered type
 *    (the SDK always calls `receiveReminder`; the caller cannot pick the
 *    method). The timer route never passes: no actor here registers a timer,
 *    and it is the one route whose method comes from the request body.
 *
 *    It is enforced **twice, from two sources**. Once on the raw path, before
 *    any parser ({@link refusalFor}) — and fail-closed: any path under
 *    `/actors` in *any* case that is not exactly one of the SDK's shapes, for
 *    *any* method, is refused rather than waved on as "not an actor route".
 *    That is the bug it used to have: `/ACTORS/…` and `…/method/tx/` were
 *    "not actor routes" to it and actor routes to Express, so an undeclared
 *    method got through (`./host-app.ts`). And once on the parameters the
 *    router *actually extracted* for whichever route it dispatched to
 *    ({@link refusalForParams}, via `app.param`), so the decision is made on
 *    the very values the SDK is about to use, however the path was spelled.
 * 2. **{@link guardDeclaredMethods}** — at registry time, each declared
 *    method is wrapped so its first argument must be a well-formed `Ctx`
 *    before the body runs. Every policy check in the codebase reads
 *    `ctx.viewerId === null` for "anonymous", and a `{}` ctx answers
 *    `undefined`, which is not `null` — so it read as a signed-in viewer named
 *    `undefined`, and as neither `system` nor `admin`.
 */
import type {
  ActorCategory,
  AnyActorDescriptor,
  Ctx,
} from "@cellar-assistant/contracts";
import { declaredMethods, ForbiddenError } from "@cellar-assistant/contracts";
import type { Express, NextFunction, Request, Response } from "express";
import {
  describeActorRoute,
  OPAQUE_ERROR_BODY,
} from "./actor-error-envelope.ts";
import { isCanonicalUuid, isWellFormedDelivery } from "./delivery.ts";
import { emit } from "./telemetry.ts";

/* -------------------------------------------------------------------------- */
/* ctx                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Exactly the three shapes `packages/contracts`' constructors produce:
 * `userCtx`/`anonymousCtx` (`user`, a viewer or `null`), `adminCtx` (`admin`,
 * always a viewer) and `systemCtx` (`system`, never a viewer), each with a
 * string `requestId`. A viewer id must be a canonical, lower-case uuid —
 * what `user.id` holds: better-auth mints them with `randomUUID()` and
 * migrated users keep their Postgres `uuid`s. It used to be any non-empty
 * string, so `userCtx("anything")` crossed the wire as a signed-in viewer
 * nobody is, and an upper-case spelling of a real id — the same row to
 * Postgres — was a stranger to every owner check, which compare as strings.
 *
 * `delivery` and `causedBy` are accepted on `system` only, and only in the
 * shape `OutboxActor` mints (`./delivery.ts`).
 */
export const isWellFormedCtx = (value: unknown): value is Ctx => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const { kind, viewerId, requestId, delivery, causedBy } = value as Record<
    string,
    unknown
  >;
  if (typeof requestId !== "string") return false;
  const viewer = isCanonicalUuid(viewerId);
  // A delivery identity and its attribution exist only on the system ctx
  // `OutboxActor` delivers with (`./delivery.ts`); on any other kind they are
  // a caller claiming to be the outbox.
  const noDelivery = delivery === undefined && causedBy === undefined;
  switch (kind) {
    case "user":
      return (viewer || viewerId === null) && noDelivery;
    case "admin":
      return viewer && noDelivery;
    case "system":
      return (
        viewerId === null &&
        (delivery === undefined || isWellFormedDelivery(delivery)) &&
        (causedBy === undefined || isCanonicalUuid(causedBy))
      );
    default:
      return false;
  }
};

const GUARDED = Symbol("actor-method-allowlist.guarded");

type Method = ((this: unknown, ...args: unknown[]) => unknown) & {
  [GUARDED]?: true;
};

/**
 * Wrap every method `descriptor` declares, on `actorClass.prototype`, so it
 * refuses a malformed `ctx` with `Forbidden` before running.
 *
 * The wrapper is an own property of the concrete class's prototype, so an
 * inherited method (`JobActor.get`) is wrapped per subclass and the base
 * prototype is left alone. Idempotent. Throws at registration if the class
 * has no function under a declared name — `entry`'s types already rule that
 * out, so reaching it means a descriptor and a class disagree at runtime.
 */
export const guardDeclaredMethods = (
  actorClass: { readonly prototype: object; readonly name: string },
  descriptor: AnyActorDescriptor,
): void => {
  const prototype = actorClass.prototype as Record<string, unknown>;
  const names = declaredMethods(descriptor);
  // Every name first, so a mismatched pairing wraps nothing at all.
  const missing = names.filter((name) => typeof prototype[name] !== "function");
  if (missing.length > 0) {
    throw new Error(
      `${actorClass.name} declares ${missing.join(", ")} in ` +
        `${descriptor.actorType}'s descriptor but has no such method`,
    );
  }
  for (const name of names) {
    const original = prototype[name];
    if ((original as Method)[GUARDED] === true) continue;
    const where = `${descriptor.actorType}.${name}`;
    // A rejected promise rather than a synchronous throw: every declared
    // method is `async` (`ActorMethod` returns a promise), so a caller that
    // chains `.catch` on one must see the refusal there too.
    const guarded: Method = function (this: unknown, ...args: unknown[]) {
      if (!isWellFormedCtx(args[0])) {
        return Promise.reject(
          new ForbiddenError(
            `${where} refused: its first argument is not a well-formed ctx`,
          ),
        );
      }
      return (original as Method).apply(this, args);
    };
    guarded[GUARDED] = true;
    Object.defineProperty(prototype, name, {
      value: guarded,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
};

/* -------------------------------------------------------------------------- */
/* Routes                                                                      */
/* -------------------------------------------------------------------------- */

/** What the allow-list needs from a registry entry. */
export type AllowlistEntry = {
  readonly descriptor: AnyActorDescriptor & {
    readonly category: ActorCategory;
  };
};

/** Actor type → every method name it declares. */
export type MethodAllowlist = ReadonlyMap<string, ReadonlySet<string>>;

export const methodAllowlist = (
  entries: readonly AllowlistEntry[],
): MethodAllowlist =>
  new Map(
    entries.map(({ descriptor }) => [
      descriptor.actorType,
      new Set(declaredMethods(descriptor)),
    ]),
  );

export type Refusal =
  | "undeclared-method"
  | "unknown-actor-type"
  | "timer"
  | "malformed-route";

/**
 * The SDK's actor routes, exactly as `HTTPServerActor.init` spells them
 * (`@dapr/dapr` 3.18.0), and the only method each answers. Anything else under
 * `/actors` is refused.
 */
const METHOD_ROUTE = /^\/actors\/([^/]+)\/[^/]+\/method\/([^/]+)$/;
const SUB_ROUTE = /^\/actors\/([^/]+)\/[^/]+\/method\/(remind|timer)\/([^/]+)$/;
const DEACTIVATE_ROUTE = /^\/actors\/([^/]+)\/[^/]+$/;

/** `/actors`, in any case, as a whole first segment. */
const UNDER_ACTORS = /^\/actors(?:\/|$)/i;

/** One segment, decoded the way Express decodes a route parameter. */
const decoded = (segment: string | undefined): string | null => {
  try {
    return decodeURIComponent(segment ?? "");
  } catch {
    return null;
  }
};

/**
 * Why a request was refused, or `null` to let it through — on the raw path,
 * before any parser runs.
 *
 * Fail-closed: a path whose first segment is `actors` in any case is refused
 * unless it is, byte for byte, one of the SDK's shapes for this method —
 * `PUT …/method/<declared>`, `PUT …/method/remind/<name>`, or
 * `DELETE /actors/<type>/<id>` — for a registered actor type. So a spelling
 * the router might accept and this might not recognise is a refusal, never a
 * pass. Paths outside `/actors` are the token check's business
 * (`./dapr-app-token.ts`).
 */
export const refusalFor = (
  allowlist: MethodAllowlist,
  method: string,
  path: string,
): Refusal | null => {
  if (!UNDER_ACTORS.test(path)) return null;
  if (method === "DELETE") {
    const match = DEACTIVATE_ROUTE.exec(path);
    if (match === null) return "malformed-route";
    const actorType = decoded(match[1]);
    if (actorType === null) return "malformed-route";
    return allowlist.has(actorType) ? null : "unknown-actor-type";
  }
  if (method !== "PUT") return "malformed-route";
  const sub = SUB_ROUTE.exec(path);
  if (sub !== null) {
    if (sub[2] === "timer") return "timer";
    const actorType = decoded(sub[1]);
    if (actorType === null) return "malformed-route";
    return allowlist.has(actorType) ? null : "unknown-actor-type";
  }
  const match = METHOD_ROUTE.exec(path);
  if (match === null) return "malformed-route";
  const actorType = decoded(match[1]);
  const name = decoded(match[2]);
  // Malformed percent-encoding names nothing that could be declared.
  if (actorType === null || name === null) return "undeclared-method";
  const declared = allowlist.get(actorType);
  if (declared === undefined) return "unknown-actor-type";
  return declared.has(name) ? null : "undeclared-method";
};

/**
 * The same decision, on the parameters Express extracted for the route it is
 * dispatching to — `req.params` of the SDK's own routes, decoded by the
 * router. `null` when the request may go on.
 *
 * - `actorTypeName` (every actor route): must be registered.
 * - `methodName` (the method route): must be declared for that type.
 * - `timerName` (the timer route): always refused.
 * - `reminderName` (the reminder route): any; the SDK picks the method.
 */
export const refusalForParams = (
  allowlist: MethodAllowlist,
  param: string,
  params: Readonly<Record<string, string | undefined>>,
): Refusal | null => {
  const declared = allowlist.get(params.actorTypeName ?? "");
  switch (param) {
    case "actorTypeName":
      return declared === undefined ? "unknown-actor-type" : null;
    case "methodName":
      if (declared === undefined) return "unknown-actor-type";
      return declared.has(params.methodName ?? "") ? null : "undeclared-method";
    case "timerName":
      return "timer";
    default:
      return null;
  }
};

/** The route parameters `refusalForParams` decides on. */
export const GUARDED_PARAMS = [
  "actorTypeName",
  "methodName",
  "timerName",
] as const;

const refuse = (
  req: Request,
  res: Response,
  refusal: Refusal,
  source: "path" | "params",
): void => {
  const route = describeActorRoute(req.method, req.path);
  emit({
    name: "actor.undeclared_route",
    severity: "WARN",
    message: `${route.template}: refused (${refusal})`,
    attributes: {
      "actor.route": route.template,
      "actor.route_kind": route.kind,
      "actor.type": route.actorType,
      "actor.method": route.name,
      "actor.refusal": refusal,
      "actor.refusal_source": source,
    },
  });
  res.status(404).json(OPAQUE_ERROR_BODY);
};

/**
 * Refuse, before any body is read or any actor activated, an actor route the
 * registry does not declare. Answered `404` with the same opaque body as any
 * other failure the caller is not told about (`{"code":"INTERNAL"}`), and
 * reported as `actor.undeclared_route` (WARN) with the id-less route template.
 */
export const actorMethodAllowlistMiddleware =
  (allowlist: MethodAllowlist) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const refusal = refusalFor(allowlist, req.method, req.path);
    if (refusal === null) {
      next();
      return;
    }
    refuse(req, res, refusal, "path");
  };

/**
 * An `app.param` callback: Express calls it with the decoded value of `param`
 * on any route that declares it, after routing and before the route's
 * handlers — so on the SDK's actor routes, whatever the path's spelling.
 */
export const actorParamGuard =
  (allowlist: MethodAllowlist, param: string) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const refusal = refusalForParams(allowlist, param, req.params);
    if (refusal === null) {
      next();
      return;
    }
    refuse(req, res, refusal, "params");
  };

/**
 * Install on the actor host's Express app. Must run before `new DaprServer`,
 * which registers its body parsers on the same app, and before
 * `server.actor.init()` registers the routes — Express matches in order. The
 * `app.param` half applies whenever it is installed; it is here so both halves
 * go in together.
 */
export const installActorMethodAllowlist = (
  app: Express,
  entries: readonly AllowlistEntry[],
): void => {
  const allowlist = methodAllowlist(entries);
  app.use(actorMethodAllowlistMiddleware(allowlist));
  // `app.param` applies to every route on the app that declares the
  // parameter, including the ones `server.actor.init()` registers later.
  for (const param of GUARDED_PARAMS) {
    app.param(param, actorParamGuard(allowlist, param));
  }
};
