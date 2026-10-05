import type {
  ActorClient,
  ActorInvoker,
  Ctx,
} from "@cellar-assistant/contracts";
import { makeActorClient } from "@cellar-assistant/contracts";
import { GraphQLError } from "graphql";
import type { JwtVerifier, ViewerClaims } from "./auth/jwt.ts";
import { createJwtVerifier, InvalidTokenError } from "./auth/jwt.ts";
import { config } from "./config.ts";
import { invokeActor } from "./dapr.ts";
import { reportAuthRejected } from "./events.ts";
import { requestIdFor } from "./request-id.ts";

/**
 * What every resolver is handed (§8.2). There is no database here and never
 * will be: the only way out of this process is `actor(...)`.
 */
export type ApiContext = {
  /** Passed to every actor method. Built from the verified JWT; never `system`. */
  readonly ctx: Ctx;
  /** The token's claims, for `me`. `null` when the request is anonymous. */
  readonly viewer: ViewerClaims | null;
  /** Typed actor proxies with `ctx` already bound. */
  readonly actor: ActorClient;
};

export type ContextDeps = {
  readonly verify: JwtVerifier;
  readonly invoke: ActorInvoker;
};

/* -------------------------------------------------------------------------- */
/* Actor ids                                                                  */
/* -------------------------------------------------------------------------- */

const UUID_SHAPED_ID =
  /^((?:[A-Za-z]+:)?)([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})$/;

/**
 * Actors keyed by free text rather than a row id, and canonicalised by their
 * own key function instead of here. `BarcodeActor`'s key is
 * `barcodeActorId(code)` (`packages/contracts/src/barcodes.ts`), which
 * upper-cases a text code — so lowercasing a uuid-shaped one here would turn a
 * canonical key into one the actor refuses.
 */
const TEXT_KEYED_ACTORS: ReadonlySet<string> = new Set(["BarcodeActor"]);

/**
 * An actor id with its uuid spelled the way Postgres spells it: `3F2B…` →
 * `3f2b…`, `SAKE:3F2B…` → `sake:3f2b…`. Anything that is not uuid-shaped
 * (a malformed id included) passes through untouched, for the actor to refuse.
 *
 * Postgres reads every casing of a uuid as the same row; Dapr routes on the
 * raw id, so each casing would be its own activation with its own cache — two
 * writers for one aggregate. `services/actors` refuses a non-canonical key as
 * absent (`EntityActorBase.keyShape`), so a client that sends `3F2B…` for a
 * row it can see would get `NotFoundError`. This keeps that a hand-built-id
 * problem rather than a client-casing one: the id is canonical before the hop.
 * Only the actor id is touched, not the arguments.
 */
export const canonicalActorId = (
  actorType: string,
  actorId: string,
): string => {
  if (TEXT_KEYED_ACTORS.has(actorType)) return actorId;
  const match = UUID_SHAPED_ID.exec(actorId);
  if (match === null) return actorId;
  return `${(match[1] ?? "").toLowerCase()}${(match[2] ?? "").toLowerCase()}`;
};

const canonicalizing =
  (invoke: ActorInvoker): ActorInvoker =>
  (descriptor, actorId, method, ...args) =>
    invoke(
      descriptor,
      canonicalActorId(descriptor.actorType, actorId),
      method,
      ...args,
    );

/* -------------------------------------------------------------------------- */
/* The factory                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The refusal for a token that could not be *checked*, as opposed to one that
 * is bad: the key set is unreachable (`jwks_unavailable`). A 401 here told
 * every signed-in client its session was dead during what is our outage —
 * `services/client`'s `authExchange` answers a 401 or `UNAUTHENTICATED` by
 * sending the viewer to `/sign-in`, out of whatever they were doing. A 503
 * with its own code is retryable and signs nobody out.
 */
const authUnavailable = (): GraphQLError =>
  new GraphQLError("Authentication is temporarily unavailable", {
    extensions: {
      code: "AUTH_UNAVAILABLE",
      http: { status: 503, headers: { "retry-after": "5" } },
    },
  });

export const makeContextFactory = ({ verify, invoke }: ContextDeps) => {
  const invokeCanonical = canonicalizing(invoke);
  return async (request: Request): Promise<ApiContext> => {
    // Sanitised, not verbatim: it becomes `ctx.requestId`, which is
    // correlation only (no actor derives a key from it since 12e00c72), but
    // it lands on every log line. See `request-id.ts`.
    const requestId = requestIdFor(request);

    let verified: Awaited<ReturnType<JwtVerifier>>;
    try {
      verified = await verify(request.headers.get("authorization"), requestId);
    } catch (cause) {
      if (cause instanceof InvalidTokenError) {
        reportAuthRejected({
          requestId,
          reason: cause.reason,
          errorName: cause.causeName,
          claim: cause.claim,
        });
        if (cause.reason === "jwks_unavailable") throw authUnavailable();
        throw new GraphQLError("Invalid or expired token", {
          extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
        });
      }
      throw cause;
    }

    return {
      ctx: verified.ctx,
      viewer: verified.viewer,
      // `makeActorClient` asserts the ctx is not `system` (§1.6).
      actor: makeActorClient(invokeCanonical, verified.ctx),
    };
  };
};

/** The production wiring. Tests build their own with `makeContextFactory`. */
export const buildApiContext = makeContextFactory({
  verify: createJwtVerifier(config.auth),
  invoke: invokeActor,
});
