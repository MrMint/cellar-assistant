import { describe, expect, it } from "vitest";
import {
  assertAuthIdentityCoherence,
  assertNoDatabaseCredentials,
  daprApiTokenFrom,
  PUBLISHED_DEV_DAPR_API_TOKEN,
} from "./config.ts";

/** A7 acceptance: "the API process has no database connection string." */
describe("no database credentials in services/api", () => {
  it("passes on a clean environment", () => {
    expect(() => assertNoDatabaseCredentials({})).not.toThrow();
  });

  it.each([
    "DATABASE_URL",
    "AUTH_DATABASE_URL",
    "PGHOST",
    "PGPASSWORD",
    "POSTGRES_PASSWORD",
  ])("throws when %s reaches services/api", (name) => {
    expect(() =>
      assertNoDatabaseCredentials({ [name]: "postgres://x/y" }),
    ).toThrow(/must not hold database credentials/);
  });

  it("ignores an empty value, which is how compose passes an unset var", () => {
    expect(() =>
      assertNoDatabaseCredentials({ DATABASE_URL: "" }),
    ).not.toThrow();
  });
});

/**
 * E3 · the identity triple. `services/actors` stamps `iss`/`aud` with
 * `BETTER_AUTH_URL` verbatim (`services/actors/src/auth/auth.ts` hands the jwt
 * plugin `issuer: config.baseUrl, audience: config.baseUrl`), so these two
 * processes agree by string equality or not at all.
 */
describe("auth identity coherence", () => {
  const production = {
    NODE_ENV: "production",
    AUTH_ISSUER: "https://cellar.example.com",
    BETTER_AUTH_URL: "https://cellar.example.com",
    AUTH_JWKS_URL: "http://actors:3002/api/auth/jwks",
  } satisfies NodeJS.ProcessEnv;

  it("accepts a coherent production environment", () => {
    expect(() => assertAuthIdentityCoherence(production)).not.toThrow();
  });

  it("accepts an empty environment, which is how a dev checkout starts", () => {
    expect(() => assertAuthIdentityCoherence({})).not.toThrow();
  });

  it("accepts the dev compose shape, where both are the actors port", () => {
    expect(() =>
      assertAuthIdentityCoherence({
        AUTH_ISSUER: "http://localhost:3002",
        BETTER_AUTH_URL: "http://localhost:3002",
        AUTH_JWKS_URL: "http://actors:3002/api/auth/jwks",
      }),
    ).not.toThrow();
  });

  it("throws when BETTER_AUTH_URL moved to the public origin and AUTH_ISSUER did not", () => {
    expect(() =>
      assertAuthIdentityCoherence({
        ...production,
        AUTH_ISSUER: "http://localhost:3002",
      }),
    ).toThrow(/AUTH_ISSUER .* must equal BETTER_AUTH_URL/);
  });

  it("treats a trailing slash as a divergence, because jose compares strings", () => {
    expect(() =>
      assertAuthIdentityCoherence({
        ...production,
        AUTH_ISSUER: "https://cellar.example.com/",
      }),
    ).toThrow(/must equal BETTER_AUTH_URL/);
  });

  it("throws when AUTH_ISSUER is unset but BETTER_AUTH_URL is known", () => {
    expect(() =>
      assertAuthIdentityCoherence({
        BETTER_AUTH_URL: "https://cellar.example.com",
      }),
    ).toThrow(/AUTH_ISSUER is unset/);
  });

  it("throws when AUTH_AUDIENCE disagrees with the issuer", () => {
    expect(() =>
      assertAuthIdentityCoherence({
        ...production,
        AUTH_AUDIENCE: "https://api.example.com",
      }),
    ).toThrow(/AUTH_AUDIENCE .* must equal AUTH_ISSUER/);
  });

  it("accepts AUTH_AUDIENCE when it repeats the issuer", () => {
    expect(() =>
      assertAuthIdentityCoherence({
        ...production,
        AUTH_AUDIENCE: "https://cellar.example.com",
      }),
    ).not.toThrow();
  });

  it("throws in production when AUTH_ISSUER is left at its default", () => {
    expect(() =>
      assertAuthIdentityCoherence({
        NODE_ENV: "production",
        AUTH_JWKS_URL: "http://actors:3002/api/auth/jwks",
      }),
    ).toThrow(/AUTH_ISSUER must be set explicitly in production/);
  });

  it.each(["http://cellar.example.com", "https://localhost:3002"])(
    "throws in production for a non-public issuer (%s)",
    (issuer) => {
      expect(() =>
        assertAuthIdentityCoherence({
          NODE_ENV: "production",
          AUTH_ISSUER: issuer,
          AUTH_JWKS_URL: "http://actors:3002/api/auth/jwks",
        }),
      ).toThrow(/must be a public https origin in production/);
    },
  );

  it("throws in production when AUTH_JWKS_URL would point the container at itself", () => {
    expect(() =>
      assertAuthIdentityCoherence({
        NODE_ENV: "production",
        AUTH_ISSUER: "https://cellar.example.com",
        BETTER_AUTH_URL: "https://cellar.example.com",
      }),
    ).toThrow(/AUTH_JWKS_URL must be set explicitly in production/);
  });

  it("throws when AUTH_JWKS_URL names an origin instead of the key set", () => {
    expect(() =>
      assertAuthIdentityCoherence({
        ...production,
        AUTH_JWKS_URL: "http://actors:3002",
      }),
    ).toThrow(/must end at better-auth's key set/);
  });

  it("throws when AUTH_ISSUER is not an absolute URL", () => {
    expect(() =>
      assertAuthIdentityCoherence({ AUTH_ISSUER: "cellar.example.com" }),
    ).toThrow(/must be an absolute URL/);
  });
});

/**
 * F7 (W4 security review): nothing refused the published development token.
 * `config` is built at import, so this is the process's boot check.
 */
describe("the Dapr API token in production", () => {
  it("refuses the published development value", () => {
    expect(() =>
      daprApiTokenFrom({
        NODE_ENV: "production",
        DAPR_API_TOKEN: PUBLISHED_DEV_DAPR_API_TOKEN,
      }),
    ).toThrow(/published value/);
  });

  it("refuses an empty token", () => {
    expect(() =>
      daprApiTokenFrom({ NODE_ENV: "production", DAPR_API_TOKEN: "" }),
    ).toThrow(/required in production/);
    expect(() => daprApiTokenFrom({ NODE_ENV: "production" })).toThrow(
      /required in production/,
    );
  });

  it("accepts a real token in production", () => {
    expect(
      daprApiTokenFrom({ NODE_ENV: "production", DAPR_API_TOKEN: "s3cr3t" }),
    ).toBe("s3cr3t");
  });

  it("accepts anything, including nothing, outside production", () => {
    expect(daprApiTokenFrom({})).toBe("");
    expect(
      daprApiTokenFrom({ DAPR_API_TOKEN: PUBLISHED_DEV_DAPR_API_TOKEN }),
    ).toBe(PUBLISHED_DEV_DAPR_API_TOKEN);
  });

  it("is the literal infra/docker-compose.yml publishes", async () => {
    const { readFile } = await import("node:fs/promises");
    const compose = await readFile(
      new URL("../../../infra/docker-compose.yml", import.meta.url),
      "utf8",
    );
    expect(compose).toContain(
      `DAPR_API_TOKEN: \${DAPR_API_TOKEN:-${PUBLISHED_DEV_DAPR_API_TOKEN}}`,
    );
  });
});
