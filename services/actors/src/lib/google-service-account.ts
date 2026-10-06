/**
 * Two-legged Google service-account OAuth — RFC 7523, over `fetch`.
 *
 * A signed JWT and one form POST. `node:crypto` signs RS256 out of the box,
 * which is why there is no `google-auth-library` here: `lib/ai/http.ts` argues
 * the general case (`services/actors` has no build step, so every dependency is
 * a real `node_modules` resolution at run time, and an injectable transport is
 * what lets a test prove a failure *propagates*).
 *
 * ## This is a second copy, and that is a known debt
 *
 * `lib/ai/vertex-ai.ts` has the same flow inlined, minted for the Vertex
 * provider. C4b needed it for BigQuery and deliberately did **not** refactor
 * `vertex-ai.ts` onto this module: that file is pinned by X1's
 * `no-silent-fallback.test.ts` and `providers.test.ts` and is being touched by
 * other workstreams. Hoisting the Vertex copy onto this one is a C4c-shaped
 * follow-up — the helper is here, at the shared path, ready for it.
 */
import { createSign } from "node:crypto";
import { ConflictError, ValidationError } from "@cellar-assistant/contracts";

/** The four fields of a service-account key that are actually signed with. */
export type ServiceAccountKey = {
  readonly type?: string;
  readonly project_id: string;
  readonly client_email: string;
  readonly private_key: string;
  readonly token_uri?: string;
};

/** The transport, injectable so no test ever reaches Google. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}>;

export const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
export const CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";

/** Refresh this long before the token actually expires. */
const RENEW_MARGIN_MS = 60_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A service-account key from JSON text, or a `ValidationError` naming what is
 * missing. Never returns a partially-filled key: a key that cannot sign is a
 * misconfiguration, and the honest moment to say so is boot.
 */
export const parseServiceAccountKey = (
  json: string,
  what: string,
): ServiceAccountKey => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new ValidationError(
      `${what} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!isRecord(parsed)) {
    throw new ValidationError(`${what} must be a JSON object`);
  }
  const missing = (
    ["project_id", "client_email", "private_key"] as const
  ).filter(
    (field) => typeof parsed[field] !== "string" || parsed[field] === "",
  );
  if (missing.length > 0) {
    throw new ValidationError(
      `${what} is missing ${missing.join(", ")}. A service-account key needs ` +
        "project_id, client_email and private_key.",
    );
  }
  return {
    type: typeof parsed.type === "string" ? parsed.type : undefined,
    project_id: parsed.project_id as string,
    client_email: parsed.client_email as string,
    private_key: parsed.private_key as string,
    token_uri:
      typeof parsed.token_uri === "string" ? parsed.token_uri : undefined,
  };
};

const base64url = (input: Buffer | string): string =>
  Buffer.from(input).toString("base64url");

/** RFC 7523 §2.1: a self-signed assertion, exchanged for an access token. */
export const signAssertion = (
  key: ServiceAccountKey,
  scope: string,
  nowSeconds: number,
): string => {
  const tokenUri = key.token_uri ?? DEFAULT_TOKEN_URI;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope,
      aud: tokenUri,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  let signature: string;
  try {
    signature = signer.sign(key.private_key, "base64url");
  } catch (error) {
    throw new ConflictError(
      `the service-account key for ${key.client_email} could not sign an ` +
        "assertion (is `private_key` a complete PEM, with its newlines " +
        `intact?): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return `${signingInput}.${signature}`;
};

export type TokenMinterOptions = {
  readonly key: ServiceAccountKey;
  readonly scope?: string;
  readonly timeoutMs: number;
  readonly fetchImpl: FetchLike;
  readonly now?: () => number;
};

type CachedToken = { readonly token: string; readonly expiresAtMs: number };

/**
 * An access-token supplier that caches until a minute before expiry.
 *
 * Every failure throws `ConflictError` — a deployment-state problem, so the
 * outbox retries rather than dead-lettering on the first attempt, and nothing
 * anywhere returns a plausible-looking answer instead.
 */
export const accessTokenMinter = (
  options: TokenMinterOptions,
): (() => Promise<string>) => {
  const {
    key,
    scope = CLOUD_PLATFORM_SCOPE,
    timeoutMs,
    fetchImpl,
    now = Date.now,
  } = options;
  let cached: CachedToken | null = null;

  return async (): Promise<string> => {
    const at = now();
    if (cached !== null && cached.expiresAtMs - RENEW_MARGIN_MS > at) {
      return cached.token;
    }
    const tokenUri = key.token_uri ?? DEFAULT_TOKEN_URI;
    const form = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signAssertion(key, scope, Math.floor(at / 1000)),
    }).toString();

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await fetchImpl(tokenUri, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ConflictError(
        `could not reach the Google token endpoint ${tokenUri}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const text = await response.text();
    if (!response.ok) {
      throw new ConflictError(
        `Google token exchange failed (${response.status}): ${text.slice(0, 500)}`,
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ConflictError(
        "Google token exchange returned a body that is not JSON",
      );
    }
    if (!isRecord(body) || typeof body.access_token !== "string") {
      throw new ConflictError("Google token exchange returned no access_token");
    }
    const expiresIn =
      typeof body.expires_in === "number" ? body.expires_in : 3600;
    cached = {
      token: body.access_token,
      expiresAtMs: at + expiresIn * 1000,
    };
    return cached.token;
  };
};
