import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertPublicAuthOrigins,
  assertSecretNotPublished,
  OAUTH_PROVIDER_IDS,
  oauthRedirectUris,
  PUBLISHED_SECRET_SHA256,
} from "./config.ts";
import { AUTH_BASE_PATH } from "./mount.ts";

/**
 * E3 · `BETTER_AUTH_URL` is the one value four separate behaviours hang off
 * (OAuth redirect URIs, `iss`/`aud`, the `__Secure-` cookie prefix, the
 * implicitly trusted origin). These pin the deployment mistakes that would
 * otherwise surface as "token verification failed" or "redirect_uri_mismatch".
 */
describe("public auth origins", () => {
  const production = {
    NODE_ENV: "production",
    BETTER_AUTH_URL: "https://cellar.example.com",
  } satisfies NodeJS.ProcessEnv;

  it("accepts a coherent production environment", () => {
    expect(() => assertPublicAuthOrigins(production)).not.toThrow();
  });

  it("accepts the development defaults, which set neither variable", () => {
    expect(() => assertPublicAuthOrigins({})).not.toThrow();
  });

  it("accepts the dev compose shape", () => {
    expect(() =>
      assertPublicAuthOrigins({
        BETTER_AUTH_URL: "http://localhost:3002",
        AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
      }),
    ).not.toThrow();
  });

  it("throws in production when BETTER_AUTH_URL is left at its default", () => {
    expect(() => assertPublicAuthOrigins({ NODE_ENV: "production" })).toThrow(
      /BETTER_AUTH_URL must be set explicitly in production/,
    );
  });

  it.each([
    "http://cellar.example.com",
    "https://localhost:3002",
  ])("throws in production for a non-public base URL (%s)", (baseUrl) => {
    expect(() =>
      assertPublicAuthOrigins({
        NODE_ENV: "production",
        BETTER_AUTH_URL: baseUrl,
      }),
    ).toThrow(/must be the public https origin in production/);
  });

  it("rejects a base URL carrying a path, which suppresses better-auth's base path", () => {
    expect(() =>
      assertPublicAuthOrigins({
        ...production,
        BETTER_AUTH_URL: "https://cellar.example.com/auth",
      }),
    ).toThrow(/must be a bare origin/);
  });

  it("rejects a trailing slash, which services/api would have to repeat verbatim", () => {
    expect(() =>
      assertPublicAuthOrigins({
        ...production,
        BETTER_AUTH_URL: "https://cellar.example.com/",
      }),
    ).toThrow(/must not end in a slash/);
  });

  it("rejects a loopback entry left in AUTH_TRUSTED_ORIGINS in production", () => {
    expect(() =>
      assertPublicAuthOrigins({
        ...production,
        AUTH_TRUSTED_ORIGINS:
          "https://cellar.example.com,http://localhost:3000",
      }),
    ).toThrow(/contains the loopback origin/);
  });

  it("accepts extra public origins, such as a Vercel preview deployment", () => {
    expect(() =>
      assertPublicAuthOrigins({
        ...production,
        AUTH_TRUSTED_ORIGINS: "https://cellar-git-preview.vercel.app",
      }),
    ).not.toThrow();
  });

  it("rejects a trusted origin that is not an absolute URL", () => {
    expect(() =>
      assertPublicAuthOrigins({
        ...production,
        AUTH_TRUSTED_ORIGINS: "cellar.example.com",
      }),
    ).toThrow(/must be an absolute URL/);
  });
});

describe("OAuth redirect URIs", () => {
  it("are the base URL plus better-auth's base path and provider id", () => {
    expect(oauthRedirectUris("https://cellar.example.com")).toEqual({
      google: "https://cellar.example.com/api/auth/callback/google",
      facebook: "https://cellar.example.com/api/auth/callback/facebook",
      discord: "https://cellar.example.com/api/auth/callback/discord",
    });
  });

  it("use the same base path the auth routes are mounted on", () => {
    for (const id of OAUTH_PROVIDER_IDS) {
      expect(oauthRedirectUris("https://x.test")[id]).toBe(
        `https://x.test${AUTH_BASE_PATH}/callback/${id}`,
      );
    }
  });
});

/**
 * E5b · the actor host refuses to start on the `BETTER_AUTH_SECRET` that was
 * committed to `infra/.env.example`.
 *
 * The published value is deliberately **not** in this file. It is matched by
 * SHA-256 precisely so that the fix does not re-commit what it removes, and
 * these tests exercise the mechanism against a digest they compute themselves.
 * What is pinned about the real constant is its shape — a typo there would
 * silently disable the check, and nothing else would notice.
 */
describe("the published BETTER_AUTH_SECRET (E5b)", () => {
  const digestOf = (value: string): string =>
    createHash("sha256").update(value, "utf8").digest("hex");

  it("refuses a secret whose digest is on the list", () => {
    expect(() =>
      assertSecretNotPublished("pretend-this-was-committed", [
        digestOf("pretend-this-was-committed"),
      ]),
    ).toThrow(/committed to infra\/\.env\.example/);
  });

  it("tells the operator to rotate the jwks rows, not just the secret", () => {
    expect(() => assertSecretNotPublished("x", [digestOf("x")])).toThrow(
      /`jwks` table/,
    );
  });

  it("accepts a freshly generated secret", () => {
    expect(() =>
      assertSecretNotPublished(randomBytes(32).toString("base64")),
    ).not.toThrow();
  });

  it("matches the whole value, not a prefix or a trimmed form", () => {
    const digests = [digestOf("secret")];
    for (const near of ["secret ", " secret", "secre", "secretX", "SECRET"]) {
      expect(() => assertSecretNotPublished(near, digests)).not.toThrow();
    }
  });

  it("pins the published digest's shape, so a typo cannot disable the check", () => {
    expect(PUBLISHED_SECRET_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });
});
