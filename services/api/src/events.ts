/**
 * Every event this process emits: names, attributes and severities, in one
 * place — the data half is `events-catalog.ts`, which every emit here is
 * typed over and which `services/actors/src/lib/events.test.ts` checks the
 * API's Grafana rules against. `README.md` lists the same catalogue for
 * whoever writes the queries. Keep the two in step.
 *
 * Query any of them the way you query the actors' events, with `event_name`
 * **after** the pipe (see the header of `telemetry.ts`):
 *
 * ```logql
 * {service_name="api"} | event_name="auth.token_rejected" | auth_reason="jwks_unavailable"
 * ```
 *
 * ## What may go in an attribute
 *
 * Only values from a bounded set that a client cannot fill with anything it
 * likes. In practice:
 *
 * - **Class names and codes.** `error.name` is the thrown object's class
 *   (`ActorInvocationError`, `TypeError`), never its message. An actor's
 *   message can quote user input back, and a JWT library's message can quote
 *   a claim.
 * - **Schema names.** `graphql.field` is the field's name in the schema, taken
 *   from the AST node rather than the response path, so a client alias does
 *   not reach it. `graphql.operation_name` is client-chosen, but it is a
 *   GraphQL `Name` (`[_A-Za-z][_0-9A-Za-z]*`) and is cut to 64 characters.
 * - **The request id**, which `request-id.ts` has already sanitised.
 *
 * No variables, no tokens, no header values, no actor ids. An actor id can be
 * a barcode or a search term.
 *
 * ## Volume
 *
 * Only failures are logged. There is no per-request success line. Most of
 * those failures, though, are ones a client can trigger at will: a garbage
 * token, an over-deep query, an id that makes an actor throw. So every event
 * except `api.boot` passes through a **throttle**: at most
 * {@link THROTTLE_MAX_PER_WINDOW} per {@link THROTTLE_WINDOW_MS} for each
 * `(event, class)` pair, where the class is the reason, code or error name.
 * One noisy class therefore cannot hide another. Drops are counted, not lost.
 * The first event of a class after its window rolls over is preceded by one
 * `telemetry.suppressed` carrying the count. Add that event's
 * `telemetry_suppressed` values when you need true totals.
 */
import { readFileSync } from "node:fs";
import type { API_EVENTS, ApiEventName } from "./events-catalog.ts";
import { emit, type Severity } from "./telemetry.ts";

export { API_EVENTS, type ApiEventName } from "./events-catalog.ts";

/**
 * Short names for the catalog's keys (`./events-catalog.ts`), which is the
 * one list of what this process emits. `satisfies` keeps every value a
 * catalogued name.
 */
export const EVENT = {
  boot: "api.boot",
  unexpectedError: "graphql.unexpected_error",
  authRejected: "auth.token_rejected",
  limitRefused: "graphql.limit_refused",
  actorInvocationFailed: "actor.invocation_failed",
  suppressed: "telemetry.suppressed",
} as const satisfies Record<string, ApiEventName>;

type CatalogSeverity<N extends ApiEventName> =
  (typeof API_EVENTS)[N]["severity"][number];
type CatalogAttribute<N extends ApiEventName> =
  (typeof API_EVENTS)[N]["attributes"][number];

/** An event as the catalog allows it: its name, its severities, its keys. */
type CatalogedEvent<N extends ApiEventName> = {
  readonly name: N;
  readonly severity: CatalogSeverity<N>;
  readonly message: string;
  readonly attributes?: Readonly<
    Partial<Record<CatalogAttribute<N>, string | number | boolean>>
  >;
};

/**
 * `emit`, admitting only a catalogued event. Every emit in this file goes
 * through it. (Handing `event.severity` to `emit` is also what holds the
 * catalog's restated severity union to `telemetry.ts`' `Severity`.)
 */
const emitCataloged = <N extends ApiEventName>(
  event: CatalogedEvent<N>,
): void => {
  emit({
    name: event.name,
    severity: event.severity,
    message: event.message,
    ...(event.attributes === undefined
      ? {}
      : {
          attributes: Object.fromEntries(
            Object.entries(event.attributes).filter(
              (entry): entry is [string, string | number | boolean] =>
                entry[1] !== undefined,
            ),
          ),
        }),
  });
};

/* -------------------------------------------------------------------------- */
/* Sanitising                                                                 */
/* -------------------------------------------------------------------------- */

const MAX_NAME_LENGTH = 64;

/** A class name, claim name or code, or `fallback` if it does not look like one. */
export const boundedName = (value: unknown, fallback = "unknown"): string =>
  typeof value === "string" && /^[A-Za-z0-9_.$-]{1,64}$/.test(value)
    ? value
    : fallback;

const GRAPHQL_NAME = /^[_A-Za-z][_0-9A-Za-z]*$/;

/**
 * A GraphQL operation name as a log attribute: `anonymous` when there is none,
 * `invalid` when what arrived is not a GraphQL `Name` at all.
 */
export const operationNameAttribute = (value: unknown): string => {
  if (value === undefined || value === null || value === "") {
    return "anonymous";
  }
  if (typeof value !== "string" || !GRAPHQL_NAME.test(value)) return "invalid";
  return value.slice(0, MAX_NAME_LENGTH);
};

/* -------------------------------------------------------------------------- */
/* The throttle                                                               */
/* -------------------------------------------------------------------------- */

export const THROTTLE_WINDOW_MS = 60_000;
export const THROTTLE_MAX_PER_WINDOW = 50;
/**
 * The classes are bounded (reasons, limit codes, error class names, actor
 * methods), so the map is too. This cap is a backstop in case that ever stops
 * being true. Clearing is safe: the worst it can do is let one extra window
 * through.
 */
const THROTTLE_MAX_KEYS = 512;

type Bucket = { windowStart: number; count: number; suppressed: number };

export type Admission = {
  readonly admitted: boolean;
  /** Events of this key dropped since the last one that was admitted. */
  readonly suppressedBefore: number;
};

export const createThrottle = ({
  windowMs = THROTTLE_WINDOW_MS,
  maxPerWindow = THROTTLE_MAX_PER_WINDOW,
  // A closure, not `Date.now` itself, so fake timers installed after this
  // module loads still move it.
  now = () => Date.now(),
}: {
  windowMs?: number;
  maxPerWindow?: number;
  now?: () => number;
} = {}) => {
  const buckets = new Map<string, Bucket>();
  return {
    admit(key: string): Admission {
      const at = now();
      const bucket = buckets.get(key);
      if (bucket === undefined) {
        if (buckets.size >= THROTTLE_MAX_KEYS) buckets.clear();
        buckets.set(key, { windowStart: at, count: 1, suppressed: 0 });
        return { admitted: true, suppressedBefore: 0 };
      }
      if (at - bucket.windowStart >= windowMs) {
        const suppressedBefore = bucket.suppressed;
        bucket.windowStart = at;
        bucket.count = 1;
        bucket.suppressed = 0;
        return { admitted: true, suppressedBefore };
      }
      if (bucket.count < maxPerWindow) {
        bucket.count += 1;
        return { admitted: true, suppressedBefore: 0 };
      }
      bucket.suppressed += 1;
      return { admitted: false, suppressedBefore: 0 };
    },
    reset(): void {
      buckets.clear();
    },
  };
};

const throttle = createThrottle();

/** Forget every window. For tests, so one test's events cannot throttle the next. */
export const resetEventThrottle = (): void => throttle.reset();

const emitThrottled = <N extends ApiEventName>(
  eventClass: string,
  event: CatalogedEvent<N>,
): void => {
  const { admitted, suppressedBefore } = throttle.admit(
    `${event.name}\u0000${eventClass}`,
  );
  if (suppressedBefore > 0) {
    emitCataloged({
      name: EVENT.suppressed,
      severity: "WARN",
      message: `${suppressedBefore} ${event.name} (${eventClass}) events were dropped by the throttle`,
      attributes: {
        "telemetry.event": event.name,
        "telemetry.class": eventClass,
        "telemetry.suppressed": suppressedBefore,
        "telemetry.window_ms": THROTTLE_WINDOW_MS,
      },
    });
  }
  if (admitted) emitCataloged(event);
};

/* -------------------------------------------------------------------------- */
/* api.boot                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The release version, from the repo root's `package.json`. release-please
 * bumps that one; `services/api/package.json` stays at `0.0.0`.
 *
 * The production image copies the root manifest to `/workspace/package.json`
 * for exactly this read (`services/api/Dockerfile`, runtime stage); before it
 * did, this was `unknown` there. `unknown` now means the file is missing or
 * its `version` is not a plain name.
 */
const releaseVersion = (): string => {
  try {
    const manifest = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { version?: unknown };
    return boundedName(manifest.version);
  } catch {
    return "unknown";
  }
};

export type BootSummary = {
  readonly url: string;
  readonly runtime: string;
  readonly sidecar: string;
  readonly jwksUrl: string;
  readonly issuer: string;
  readonly graphiql: boolean;
  readonly corsOrigins: number;
};

/**
 * Once per process, unthrottled. The attributes are configuration: nothing
 * secret (the JWKS URL and the issuer are public by construction) and nothing
 * per request. `auth.issuer` is here because an issuer that does not match
 * what `services/actors` stamps looks, from the verifier's side, like a
 * broken key set. A dashboard showing both answers that question.
 */
export const reportBoot = (summary: BootSummary): void => {
  emitCataloged({
    name: EVENT.boot,
    severity: "INFO",
    message:
      `graphql on ${summary.url} on ${summary.runtime} ` +
      `(sidecar ${summary.sidecar}, jwks ${summary.jwksUrl})`,
    attributes: {
      "api.version": releaseVersion(),
      "api.runtime": summary.runtime,
      "api.graphiql": summary.graphiql,
      "api.cors_origins": summary.corsOrigins,
      "api.otlp": true,
      "auth.issuer": summary.issuer,
      "auth.jwks_url": summary.jwksUrl,
      "dapr.sidecar": summary.sidecar,
    },
  });
};

/* -------------------------------------------------------------------------- */
/* graphql.unexpected_error                                                   */
/* -------------------------------------------------------------------------- */

export type UnexpectedError = {
  /** The innermost thrown object's class name. */
  readonly errorName: string;
  /** The schema field that failed, or `unknown`. */
  readonly field: string;
};

/**
 * Every error the masker turns into "Unexpected error.". One event per
 * `(class, field)` in a result, with a count, rather than one per error: a
 * list of 100 items whose resolver fails the same way is one fault, not 100.
 */
export const reportUnexpectedErrors = ({
  requestId,
  operationName,
  operationType,
  errors,
}: {
  requestId: string;
  operationName: unknown;
  operationType: string;
  errors: readonly UnexpectedError[];
}): void => {
  const operation = operationNameAttribute(operationName);
  const groups = new Map<string, UnexpectedError & { count: number }>();
  for (const error of errors) {
    const errorName = boundedName(error.errorName);
    const field = boundedName(error.field);
    const key = `${errorName}\u0000${field}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { errorName, field, count: 1 });
    else group.count += 1;
  }
  for (const { errorName, field, count } of groups.values()) {
    emitThrottled(errorName, {
      name: EVENT.unexpectedError,
      severity: "ERROR",
      message: `${operationType} ${operation}: ${errorName} at ${field}`,
      attributes: {
        "request.id": requestId,
        "graphql.operation_name": operation,
        "graphql.operation_type": boundedName(operationType),
        "graphql.field": field,
        "error.name": errorName,
        "error.count": count,
      },
    });
  }
};

/* -------------------------------------------------------------------------- */
/* auth.token_rejected                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Why a presented token was refused. `auth/jwt.ts` classifies; this is the
 * vocabulary. Absence of a token is not a rejection and is never logged.
 */
export const AUTH_FAILURE_REASONS = [
  /** `exp` is past, beyond the 5s tolerance. Routine: the client refreshes. */
  "expired",
  /** A key with this `kid` exists and the signature does not verify under it. */
  "bad_signature",
  /** No key in the published set has this `kid`, even after a refetch. */
  "unknown_kid",
  /**
   * The key set could not be fetched or used: network error, timeout, non-200
   * or unparseable body. **Every authenticated request fails while this
   * lasts**, so it is the one reason logged at ERROR.
   */
  "jwks_unavailable",
  /** `iss`, `aud` or `nbf` did not match. `auth.claim` says which. */
  "claim_invalid",
  /** Not a compact JWS, or its payload is not a JWT. */
  "malformed",
  /** `alg` is anything but EdDSA. */
  "alg_not_allowed",
  /** Verified, but `sub` is missing or empty. */
  "no_subject",
  "other",
] as const;

export type AuthFailureReason = (typeof AUTH_FAILURE_REASONS)[number];

const AUTH_SEVERITY: Record<AuthFailureReason, Severity> = {
  expired: "INFO",
  bad_signature: "WARN",
  unknown_kid: "WARN",
  jwks_unavailable: "ERROR",
  claim_invalid: "WARN",
  malformed: "WARN",
  alg_not_allowed: "WARN",
  no_subject: "WARN",
  other: "WARN",
};

export const reportAuthRejected = ({
  requestId,
  reason,
  errorName,
  claim,
}: {
  requestId: string;
  reason: AuthFailureReason;
  errorName: string | null;
  claim: string | null;
}): void => {
  const claimName = claim === null ? null : boundedName(claim);
  emitThrottled(reason, {
    name: EVENT.authRejected,
    severity: AUTH_SEVERITY[reason],
    message: `token rejected: ${reason}${claimName === null ? "" : ` (${claimName})`}`,
    attributes: {
      "request.id": requestId,
      "auth.reason": reason,
      "error.name": boundedName(errorName),
      ...(claimName === null ? {} : { "auth.claim": claimName }),
    },
  });
};

/* -------------------------------------------------------------------------- */
/* graphql.limit_refused                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One event per distinct limit an operation broke. The cost rule reports every
 * limit at once, so one document can produce several of these, each with its
 * own `limit.code`.
 */
export const reportLimitRefused = ({
  requestId,
  code,
  operationName,
}: {
  requestId: string;
  code: string;
  operationName: unknown;
}): void => {
  const limit = boundedName(code);
  const operation = operationNameAttribute(operationName);
  emitThrottled(limit, {
    name: EVENT.limitRefused,
    severity: "WARN",
    message: `${operation}: refused by ${limit}`,
    attributes: {
      "request.id": requestId,
      "limit.code": limit,
      "graphql.operation_name": operation,
    },
  });
};

/* -------------------------------------------------------------------------- */
/* actor.invocation_failed                                                    */
/* -------------------------------------------------------------------------- */

/**
 * - `status`: the sidecar answered, but with a failure that is not a typed
 *   actor error: a 500 from the actor host, `ERR_ACTOR_INVOKE_METHOD`, a
 *   placement failure. `http.status` says which status, and
 *   {@link classifySidecarFailure} says which of those it was.
 * - `timeout`: no answer within `timeoutFor` — the method's `timeoutMs` on its
 *   descriptor, else 15s; 120s for the two AI calls,
 *   `ItemOnboardingActor.start` and `PlaceCreationActor.createPlace`.
 * - `network`: the sidecar was unreachable, or the body stream broke.
 */
export type InvocationFailureKind = "status" | "timeout" | "network";

/**
 * What a `status` failure's body says went wrong, as a closed set — the body
 * itself is never logged (daprd quotes the actor id in it, and an id can be a
 * barcode, a search term or an address).
 *
 * - `app_error`: the actor host answered, with a non-2xx status that daprd
 *   reports as `error from actor service: (NNN)`; `actor.app_status` is that
 *   status. A 500 here is the host's opaque `{"code":"INTERNAL"}`, and the
 *   host logged it as `actor.unexpected_error` under the same `request.id`.
 * - `app_channel_closed`: daprd lost the connection to the actor host
 *   mid-call — `EOF`, a reset, a broken pipe. The request never reached the
 *   host, which logged nothing. The keep-alive race of 2026-09-28
 *   (`services/actors/src/lib/app-channel-connections.ts`) looked like this.
 * - `app_unreachable`: daprd could not connect to the actor host at all.
 * - `method_not_found`: the host refused the method (its allow-list's 404,
 *   logged there as `actor.undeclared_route`).
 * - `placement`: daprd could not find a host for the actor.
 * - `deadline`: a deadline inside Dapr expired before the host answered.
 * - `unrecognised`: none of the above, including a body that is not daprd's.
 */
export type SidecarFailureCause =
  | "app_error"
  | "app_channel_closed"
  | "app_unreachable"
  | "method_not_found"
  | "placement"
  | "deadline"
  | "unrecognised";

export type SidecarFailureClass = {
  /** daprd's `errorCode` (`ERR_ACTOR_INVOKE_METHOD`, …), or `none`. */
  readonly daprErrorCode: string;
  readonly cause: SidecarFailureCause;
  /** The actor host's own status, when daprd reported one. */
  readonly appStatus?: number;
};

const DAPR_ERROR_CODE = /^ERR_[A-Z0-9_]{1,60}$/;

/**
 * Checked in order; the first match wins. Only these fixed phrases are ever
 * looked for, so nothing from the body but the category leaves this function
 * (and `actor.app_status`, which is three digits).
 */
const CAUSES: readonly (readonly [SidecarFailureCause, RegExp])[] = [
  ["app_error", /error from actor service: \(\d{3}\)/],
  ["method_not_found", /actor method not found/],
  [
    "app_channel_closed",
    /: EOF\b|connection reset by peer|broken pipe|server closed idle connection|unexpected EOF/,
  ],
  ["app_unreachable", /connection refused|no such host|dial tcp/],
  [
    "placement",
    /did not find address for actor|failed to lookup actor|placement/i,
  ],
  ["deadline", /context deadline exceeded|DeadlineExceeded/],
];

/** Classify a failed sidecar response's body. Never returns any of its text. */
export const classifySidecarFailure = (body: string): SidecarFailureClass => {
  let message = "";
  let daprErrorCode = "none";
  try {
    const parsed = JSON.parse(body) as {
      errorCode?: unknown;
      message?: unknown;
    } | null;
    if (typeof parsed?.errorCode === "string") {
      daprErrorCode = DAPR_ERROR_CODE.test(parsed.errorCode)
        ? parsed.errorCode
        : "invalid";
    }
    if (typeof parsed?.message === "string") message = parsed.message;
  } catch {
    // Not daprd's JSON: nothing to classify by.
  }
  const cause =
    CAUSES.find(([, pattern]) => pattern.test(message))?.[0] ?? "unrecognised";
  const status = /error from actor service: \((\d{3})\)/.exec(message)?.[1];
  return {
    daprErrorCode,
    cause,
    ...(cause === "app_error" && status !== undefined
      ? { appStatus: Number(status) }
      : {}),
  };
};

/**
 * Upstream failures only. A typed `ActorError` (`NOT_FOUND`, `FORBIDDEN`, and
 * the rest) is a domain answer and is never logged here.
 *
 * The actor id is left out. For an entity actor it is the key, and a key can
 * be a barcode, a search term or an address. So is the sidecar's body, which
 * quotes it: a `status` failure carries {@link classifySidecarFailure}'s
 * bounded reading of it instead.
 */
export const reportActorInvocationFailed = ({
  requestId,
  actorType,
  method,
  kind,
  status,
  body,
}: {
  requestId: string;
  actorType: string;
  method: string;
  kind: InvocationFailureKind;
  status?: number;
  /** The failed response's body, for a `status` failure. Classified, never logged. */
  body?: string;
}): void => {
  const type = boundedName(actorType);
  const name = boundedName(method);
  const failure = body === undefined ? null : classifySidecarFailure(body);
  const detail =
    (status === undefined ? "" : ` ${status}`) +
    (failure === null ? "" : ` ${failure.daprErrorCode}/${failure.cause}`);
  emitThrottled(
    `${type}.${name}:${kind}${failure === null ? "" : `:${failure.cause}`}`,
    {
      name: EVENT.actorInvocationFailed,
      severity: "ERROR",
      message: `${type}.${name}: ${kind}${detail}`,
      attributes: {
        "request.id": requestId,
        "actor.type": type,
        "actor.method": name,
        "failure.kind": kind,
        ...(status === undefined ? {} : { "http.status": status }),
        ...(failure === null
          ? {}
          : {
              "dapr.error_code": failure.daprErrorCode,
              "failure.cause": failure.cause,
              ...(failure.appStatus === undefined
                ? {}
                : { "actor.app_status": failure.appStatus }),
            }),
      },
    },
  );
};
