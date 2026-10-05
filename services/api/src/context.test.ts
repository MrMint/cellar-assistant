/**
 * The context factory, through the real Yoga server and the real resolvers.
 *
 * Three things `context.ts` decides for every request:
 *
 * - **A key set we cannot reach is our outage.** 503 and `AUTH_UNAVAILABLE`,
 *   not the 401 that makes `services/client` send the viewer to `/sign-in`.
 * - **An actor id's uuid is canonical before the hop.** `3F2B…` and `3f2b…`
 *   are one row to Postgres and two activations to Dapr.
 * - **A malformed id is the actor's to refuse, and comes back typed.** It
 *   crosses untouched; the actor host answers `NOT_FOUND` (`EntityActorBase.
 *   keyShape` in `services/actors`), and the client sees `NotFoundError` on
 *   the result union — not "Unexpected error.", which is what the same id
 *   produced while it reached Postgres and failed the activation.
 */
import {
  anonymousCtx,
  DAPR_ERROR_RESPONSE_HEADER,
} from "@cellar-assistant/contracts";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JwtVerifier } from "./auth/jwt.ts";
import { createJwtVerifier } from "./auth/jwt.ts";
import { config } from "./config.ts";
import {
  type ContextDeps,
  canonicalActorId,
  makeContextFactory,
} from "./context.ts";
import { invokeActor } from "./dapr.ts";
import { resetEventThrottle } from "./events.ts";
import { stubSidecar } from "./testing.ts";
import { type ApiYoga, createApiYoga } from "./yoga.ts";

const ISSUER = "http://localhost:3002";
const SIDECAR = `http://${config.daprHost}:${config.daprPort}/v1.0/actors/`;
const CANONICAL = "3f2b7a52-9f0a-4d8e-8f3e-2a1c5b6d7e8f";

const anonymous: JwtVerifier = async (_authorization, requestId) => ({
  ctx: anonymousCtx(requestId),
  viewer: null,
});

const yogaWith = (deps: ContextDeps): ApiYoga => {
  const build = makeContextFactory(deps);
  return createApiYoga({
    context: ({ request }) => build(request),
    plugins: [],
  });
};

const post = async (
  yoga: ApiYoga,
  query: string,
  headers: Record<string, string> = {},
) => {
  const response = await yoga.fetch("http://api.test/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ query }),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: (await response.json()) as {
      data?: Record<string, Record<string, unknown> | null> | null;
      errors?: { message: string; extensions?: Record<string, unknown> }[];
    },
  };
};

beforeEach(() => {
  resetEventThrottle();
  vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */

describe("a key set that cannot be fetched", () => {
  const signed = async (): Promise<string> => {
    const { privateKey } = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    });
    return new SignJWT({ sub: "u-1" })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(ISSUER)
      .setExpirationTime("5m")
      .sign(privateKey);
  };

  /** Nothing listens on port 1: a real connection failure, not a stub. */
  const unreachable = (): ApiYoga =>
    yogaWith({
      verify: createJwtVerifier({
        jwksUrl: "http://127.0.0.1:1/api/auth/jwks",
        issuer: ISSUER,
        audience: ISSUER,
      }),
      invoke: stubSidecar({}).invoke,
    });

  it("is a retryable 503, not a 401 that signs the viewer out", async () => {
    const { status, headers, body } = await post(
      unreachable(),
      "{ __typename }",
      { authorization: `Bearer ${await signed()}` },
    );

    expect(status).toBe(503);
    expect(headers.get("retry-after")).toBe("5");
    expect(body.errors?.[0]?.extensions?.code).toBe("AUTH_UNAVAILABLE");
    // The two things `services/client`'s authExchange reads as "signed out".
    expect(status).not.toBe(401);
    expect(body.errors?.[0]?.extensions?.code).not.toBe("UNAUTHENTICATED");
  });

  it("still answers a token that is bad on its face with a 401", async () => {
    // Malformed tokens are refused before the key set is consulted, so the
    // outage cannot relabel them.
    const { status, body } = await post(unreachable(), "{ __typename }", {
      authorization: "Bearer not.a.token",
    });
    expect(status).toBe(401);
    expect(body.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
  });

  it("verifies a published key after all, once the key set is reachable", async () => {
    const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    });
    const jwks = JSON.stringify({
      keys: [{ ...(await exportJWK(publicKey)), alg: "EdDSA", kid: "k1" }],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(jwks, { status: 200 })),
    );
    const token = await new SignJWT({ sub: "u-1" })
      .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(ISSUER)
      .setExpirationTime("5m")
      .sign(privateKey);

    const { status } = await post(
      yogaWith({
        verify: createJwtVerifier({
          jwksUrl: "http://jwks.test/api/auth/jwks",
          issuer: ISSUER,
          audience: ISSUER,
        }),
        invoke: stubSidecar({}).invoke,
      }),
      "{ __typename }",
      { authorization: `Bearer ${token}` },
    );
    expect(status).toBe(200);
  });
});

/* -------------------------------------------------------------------------- */

describe("canonicalActorId", () => {
  it("lowercases a uuid-shaped id, prefix and all", () => {
    expect(canonicalActorId("CellarActor", CANONICAL.toUpperCase())).toBe(
      CANONICAL,
    );
    expect(
      canonicalActorId("ItemActor", `SAKE:${CANONICAL.toUpperCase()}`),
    ).toBe(`sake:${CANONICAL}`);
  });

  it("leaves everything else alone, for the actor to judge", () => {
    for (const id of [
      "not-a-uuid",
      "sake:not-a-uuid",
      `{${CANONICAL}}`,
      "a".repeat(64),
      "wine_style",
    ]) {
      expect(canonicalActorId("CellarActor", id)).toBe(id);
    }
    // A barcode is the printed code, whatever it looks like.
    expect(canonicalActorId("BarcodeActor", CANONICAL.toUpperCase())).toBe(
      CANONICAL.toUpperCase(),
    );
  });

  it("is applied to every actor call a resolver makes", async () => {
    const { invoke, calls } = stubSidecar({
      "ItemActor.get": () => {
        throw new Error("stop here");
      },
      "CellarActor.get": () => {
        throw new Error("stop here");
      },
    });
    const yoga = yogaWith({ verify: anonymous, invoke });

    await post(
      yoga,
      `{ item(type: SAKE, id: "${CANONICAL.toUpperCase()}") { __typename } }`,
    );
    await post(
      yoga,
      `{ cellar(id: "${CANONICAL.toUpperCase()}") { __typename } }`,
    );

    expect(calls.map((call) => call.actorId)).toEqual([
      `sake:${CANONICAL}`,
      CANONICAL,
    ]);
  });
});

/* -------------------------------------------------------------------------- */

describe("a malformed id, through the real resolver and the real invoker", () => {
  /**
   * The sidecar, answering with the actor host's own bytes for a `NOT_FOUND`:
   * 200, `X-Daprerrorresponseheader`, `{ code, message }`
   * (`services/actors/src/lib/actor-error-envelope.ts`). That is what
   * `EntityActorBase.onActorMethodPre` now produces for a key that cannot
   * name a row; `services/actors/src/lib/entity-key-shape.test.ts` proves the
   * actor half for every entity actor.
   */
  const sidecarAnsweringNotFound = (): string[] => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : String(input);
        if (!url.startsWith(SIDECAR)) throw new Error(`unexpected: ${url}`);
        urls.push(url);
        const actor = decodeURIComponent(url.slice(SIDECAR.length)).split(
          "/method/",
        )[0];
        return new Response(
          JSON.stringify({
            code: "NOT_FOUND",
            message: `${actor?.replace("/", "(")}) has no row`,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              [DAPR_ERROR_RESPONSE_HEADER]: "1",
            },
          },
        );
      }),
    );
    return urls;
  };

  it("comes back as a typed NotFoundError on Query.cellar", async () => {
    const urls = sidecarAnsweringNotFound();
    const { status, body } = await post(
      yogaWith({ verify: anonymous, invoke: invokeActor }),
      `{ cellar(id: "not-a-uuid") { __typename ... on NotFoundError { message } } }`,
    );

    expect(status).toBe(200);
    expect(body.errors).toBeUndefined();
    expect(body.data?.cellar).toEqual({
      __typename: "NotFoundError",
      message: "CellarActor(not-a-uuid) has no row",
    });
    expect(urls).toEqual([`${SIDECAR}CellarActor/not-a-uuid/method/get`]);
  });

  it("comes back as a typed NotFoundError on Query.item, for the id that crashed the host", async () => {
    const urls = sidecarAnsweringNotFound();
    const { body } = await post(
      yogaWith({ verify: anonymous, invoke: invokeActor }),
      `{ item(type: SAKE, id: "not-a-uuid") { __typename ... on NotFoundError { message } } }`,
    );

    expect(body.errors).toBeUndefined();
    expect(body.data?.item).toEqual({
      __typename: "NotFoundError",
      message: "ItemActor(sake:not-a-uuid) has no row",
    });
    expect(urls).toEqual([
      `${SIDECAR}ItemActor/${encodeURIComponent("sake:not-a-uuid")}/method/get`,
    ]);
  });
});
