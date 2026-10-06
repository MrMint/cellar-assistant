/**
 * JWKS verification and `ctx` construction (migration plan §8.2, A6/A7).
 *
 * A6 mounts better-auth inside `services/actors` and publishes an Ed25519 (EdDSA)
 * key set at `/api/auth/jwks`. Tokens live 900 seconds, carry the user id in
 * `sub`, and a `role` claim that better-auth's `definePayload` has already
 * collapsed to exactly `"admin"` or `"user"`.
 *
 * This module is the *only* place a request turns into a `Ctx`, and it is
 * structurally incapable of producing `kind: 'system'` (§1.6): `ctxFromClaims`
 * has two branches, `adminCtx` and `userCtx`, and `systemCtx` is not imported.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import { adminCtx, anonymousCtx, userCtx } from "@cellar-assistant/contracts";
import type { JWTVerifyGetKey } from "jose";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import type { AuthFailureReason } from "../events.ts";

export type ViewerClaims = {
  readonly id: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly role: "admin" | "user";
};

/**
 * Thrown for a token that is present but unusable. Never for its absence.
 *
 * `reason`, `causeName` and `claim` exist for telemetry (`auth.token_rejected`
 * in `events.ts`). They are all drawn from bounded vocabularies. The `message`
 * is not, because jose's messages can quote a claim value, so nothing logs it.
 *
 * One reason is not about the token at all: `jwks_unavailable` means the key
 * set could not be fetched, so the token was never checked. `context.ts`
 * answers that one with a 503, not the 401 every other reason gets — a 401
 * signs the client out, and the outage is ours.
 */
export class InvalidTokenError extends Error {
  readonly reason: AuthFailureReason;
  /** The class of the underlying failure, e.g. `JWTExpired`. */
  readonly causeName: string | null;
  /** For `claim_invalid`, the claim jose names: `iss`, `aud`, `nbf`. */
  readonly claim: string | null;

  constructor(
    message: string,
    reason: AuthFailureReason = "other",
    detail: { causeName?: string | null; claim?: string | null } = {},
  ) {
    super(message);
    this.name = "InvalidTokenError";
    this.reason = reason;
    this.causeName = detail.causeName ?? null;
    this.claim = detail.claim ?? null;
  }
}

/**
 * The key set could not be fetched or used. Raised by the wrapper around
 * `createRemoteJWKSet` below, and only there.
 *
 * jose's own classes cannot tell this apart from a bad token. A failed fetch
 * surfaces as the raw network error, and a non-200 as a bare `JOSEError`,
 * neither of which says "the problem is on our side". Wrapping the key lookup
 * is the one place that knows. Its only exits are a key, "no such kid", or
 * "could not get the key set at all".
 */
class JwksUnavailableError extends Error {
  readonly causeName: string;

  constructor(cause: unknown) {
    super("the JSON Web Key Set could not be fetched or used", { cause });
    this.name = "JwksUnavailableError";
    this.causeName =
      cause instanceof Error
        ? cause.name
        : typeof cause === "string"
          ? "string"
          : "unknown";
  }
}

/**
 * jose's failure, as one of `AUTH_FAILURE_REASONS`. Order matters only for
 * subclasses, and none of these classes subclasses another except through
 * `JOSEError`.
 */
export const authFailureReason = (cause: unknown): AuthFailureReason => {
  if (cause instanceof JwksUnavailableError) return "jwks_unavailable";
  if (cause instanceof errors.JWTExpired) return "expired";
  if (cause instanceof errors.JWSSignatureVerificationFailed) {
    return "bad_signature";
  }
  if (cause instanceof errors.JWKSNoMatchingKey) return "unknown_kid";
  if (cause instanceof errors.JWTClaimValidationFailed) return "claim_invalid";
  if (cause instanceof errors.JOSEAlgNotAllowed) return "alg_not_allowed";
  if (
    cause instanceof errors.JWSInvalid ||
    cause instanceof errors.JWTInvalid
  ) {
    return "malformed";
  }
  return "other";
};

export type JwtVerifierConfig = {
  readonly jwksUrl: string;
  readonly issuer: string;
  readonly audience: string;
};

export type VerifiedRequest = {
  readonly ctx: Ctx;
  readonly viewer: ViewerClaims | null;
};

/**
 * `role` is the only claim that can widen authority, so it is read
 * defensively: anything that is not exactly the string `"admin"` — including
 * `"system"`, an array, an object, or a missing claim — is a plain user.
 */
const roleFromClaims = (role: unknown): "admin" | "user" =>
  role === "admin" ? "admin" : "user";

export const claimsFromPayload = (payload: {
  sub?: string;
  [claim: string]: unknown;
}): ViewerClaims => {
  const subject = payload.sub;
  if (typeof subject !== "string" || subject === "") {
    throw new InvalidTokenError("token has no subject", "no_subject");
  }
  return {
    id: subject,
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified: payload.emailVerified === true,
    role: roleFromClaims(payload.role),
  };
};

/**
 * The two-branch mapping §1.6 depends on. There is no third branch, so no
 * request — whatever its token says — can act as the system.
 */
export const ctxFromClaims = (claims: ViewerClaims, requestId: string): Ctx =>
  claims.role === "admin"
    ? adminCtx(claims.id, requestId)
    : userCtx(claims.id, requestId);

const bearerToken = (header: string | null): string | null => {
  if (header === null) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
};

export type JwtVerifier = (
  authorization: string | null,
  requestId: string,
) => Promise<VerifiedRequest>;

/**
 * `createRemoteJWKSet` caches the key set and re-fetches only when a token
 * presents an unknown `kid`, with its own cooldown — so this is one HTTP call
 * at startup, not one per request.
 */
export const createJwtVerifier = (config: JwtVerifierConfig): JwtVerifier => {
  const remote = createRemoteJWKSet(new URL(config.jwksUrl), {
    cacheMaxAge: 10 * 60 * 1000,
    cooldownDuration: 30 * 1000,
  });
  /**
   * The same key set, with its infrastructure failures relabelled. jose only
   * calls this after it has checked the token's structure and its `alg`, so a
   * garbage token can never reach it and be miscounted as an outage.
   */
  const jwks: JWTVerifyGetKey = async (protectedHeader, token) => {
    try {
      return await remote(protectedHeader, token);
    } catch (cause) {
      if (
        cause instanceof errors.JWKSNoMatchingKey ||
        cause instanceof errors.JWKSMultipleMatchingKeys
      ) {
        throw cause;
      }
      throw new JwksUnavailableError(cause);
    }
  };

  return async (authorization, requestId) => {
    const token = bearerToken(authorization);
    if (token === null) {
      // No credentials is not an error: public reads are anonymous, and the
      // actors decide what an anonymous viewer may see.
      return { ctx: anonymousCtx(requestId), viewer: null };
    }

    let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
    try {
      ({ payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ["EdDSA"],
        // A6's tokens live 900s; a small tolerance covers container clock skew
        // without meaningfully extending that window.
        clockTolerance: 5,
      }));
    } catch (cause) {
      // A *present but bad* token is reported, not silently downgraded to
      // anonymous: a client with an expired token needs to know to refresh it.
      throw new InvalidTokenError(
        cause instanceof Error ? cause.message : "token verification failed",
        authFailureReason(cause),
        {
          causeName:
            cause instanceof JwksUnavailableError
              ? cause.causeName
              : cause instanceof Error
                ? cause.name
                : null,
          claim:
            cause instanceof errors.JWTClaimValidationFailed
              ? cause.claim
              : null,
        },
      );
    }

    const claims = claimsFromPayload(payload);
    return { ctx: ctxFromClaims(claims, requestId), viewer: claims };
  };
};
