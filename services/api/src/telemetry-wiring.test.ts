/**
 * Each event class, fired from the code that is supposed to fire it, exactly
 * once, and carrying nothing a client typed.
 *
 * Everything runs through the real Yoga server (`createApiYoga`, with the same
 * two plugins `index.ts` installs), the real context factory, the real JWT
 * verifier and the real `invokeActor`. Only `fetch` is stubbed, and it plays
 * three parts by URL: the OTLP collector (whose bodies are captured and
 * decoded), better-auth's JWKS endpoint, and the Dapr sidecar.
 *
 * The first block is different: it boots `index.ts` itself as a child process
 * against a real HTTP collector. That is the only way to prove `api.boot` is
 * emitted, and that the *production* plugin list, not just this file's copy of
 * it, reports.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import {
  anonymousCtx,
  DAPR_ERROR_RESPONSE_HEADER,
} from "@cellar-assistant/contracts";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { JwtVerifier } from "./auth/jwt.ts";
import { createJwtVerifier } from "./auth/jwt.ts";
import { config } from "./config.ts";
import { type ContextDeps, makeContextFactory } from "./context.ts";
import { invokeActor } from "./dapr.ts";
import {
  reportLimitRefused,
  resetEventThrottle,
  THROTTLE_MAX_PER_WINDOW,
  THROTTLE_WINDOW_MS,
} from "./events.ts";
import { MAX_BODY_BYTES, useQueryCostLimits } from "./limits.ts";
import { useTelemetry } from "./telemetry-plugin.ts";
import { stubSidecar } from "./testing.ts";
import { type ApiYoga, createApiServer, createApiYoga } from "./yoga.ts";

/* -------------------------------------------------------------------------- */
/* Decoding what reached the collector                                        */
/* -------------------------------------------------------------------------- */

type Scalar = string | number | boolean;

type Captured = {
  readonly service: string;
  readonly name: string;
  readonly severity: string;
  readonly message: string;
  readonly attributes: Readonly<Record<string, Scalar>>;
};

type OtlpValue = {
  stringValue?: string;
  intValue?: number;
  doubleValue?: number;
  boolValue?: boolean;
};
type OtlpAttribute = { key: string; value: OtlpValue };

const scalar = (value: OtlpValue): Scalar =>
  value.stringValue ??
  value.intValue ??
  value.doubleValue ??
  value.boolValue ??
  "";

const decode = (raw: string): Captured[] => {
  const body = JSON.parse(raw) as {
    resourceLogs: {
      resource: { attributes: OtlpAttribute[] };
      scopeLogs: {
        logRecords: {
          severityText: string;
          body: { stringValue: string };
          attributes: OtlpAttribute[];
        }[];
      }[];
    }[];
  };
  return body.resourceLogs.flatMap((resourceLog) => {
    const service = String(
      scalar(
        resourceLog.resource.attributes.find((a) => a.key === "service.name")
          ?.value ?? {},
      ),
    );
    return resourceLog.scopeLogs.flatMap((scopeLog) =>
      scopeLog.logRecords.map((record) => {
        const attributes: Record<string, Scalar> = {};
        for (const { key, value } of record.attributes) {
          attributes[key] = scalar(value);
        }
        const { "event.name": name, ...rest } = attributes;
        return {
          service,
          name: String(name),
          severity: record.severityText,
          message: record.body.stringValue,
          attributes: rest,
        };
      }),
    );
  });
};

/** Poll until `probe` returns something, or fail after `ms`. */
const waitFor = async <T>(
  probe: () => T | undefined | false,
  what: string,
  ms = 20_000,
): Promise<T> => {
  const deadline = Date.now() + ms;
  for (;;) {
    const found = probe();
    if (found !== undefined && found !== false) return found;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};

const realFetch = globalThis.fetch;

/** `{ f { f { … leaf } } }`, far past any plausible depth limit. */
const tooDeep = (levels = 60): string => {
  let body = "leaf";
  for (let level = 1; level < levels; level += 1) body = `f { ${body} }`;
  return `query Deep { ${body} }`;
};

/* -------------------------------------------------------------------------- */
/* api.boot, from index.ts itself                                             */
/* -------------------------------------------------------------------------- */

/**
 * A cold `bun src/index.ts` boots in about 150ms here. The generous bound is
 * for a loaded machine: AGENTS.md records a load average of 55 on 14 cores,
 * and vitest's 5s default would turn that into a failure that looks like a
 * missing event.
 */
const BOOT_TIMEOUT_MS = 30_000;

describe("api.boot (index.ts as a child process)", () => {
  let collector: Server;
  let child: ChildProcess | undefined;
  const received: Captured[] = [];
  let stderr = "";

  beforeAll(async () => {
    collector = createServer((request, response) => {
      let data = "";
      request.on("data", (chunk) => {
        data += chunk;
      });
      request.on("end", () => {
        if (request.url === "/v1/logs") received.push(...decode(data));
        response.writeHead(200);
        response.end();
      });
    });
    await new Promise<void>((resolve) =>
      collector.listen(0, "127.0.0.1", resolve),
    );
    const { port } = collector.address() as AddressInfo;

    child = spawn(process.execPath, ["src/index.ts"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      // A clean environment, so nothing from the developer's shell (a
      // BETTER_AUTH_URL, a DATABASE_URL) changes whether it boots.
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        NODE_ENV: "test",
        APP_PORT: "0",
        APP_HOST: "127.0.0.1",
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
  });

  afterAll(async () => {
    if (child !== undefined && child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    collector.close();
  });

  it(
    "emits api.boot exactly once, with the configuration summary",
    async () => {
      const boot = await waitFor(
        () => received.find((event) => event.name === "api.boot"),
        `api.boot (child stderr: ${stderr})`,
      );
      const rootVersion = (
        JSON.parse(
          readFileSync(
            new URL("../../../package.json", import.meta.url),
            "utf8",
          ),
        ) as { version: string }
      ).version;

      expect(boot.service).toBe("api");
      expect(boot.severity).toBe("INFO");
      expect(boot.message).toMatch(
        /^graphql on http:\/\/127\.0\.0\.1:\d+\/graphql on (bun|node) /,
      );
      expect(boot.attributes).toMatchObject({
        "api.version": rootVersion,
        "api.graphiql": false,
        "api.cors_origins": 0,
        "api.otlp": true,
        "auth.issuer": "http://localhost:3002",
        "auth.jwks_url": "http://127.0.0.1:3002/api/auth/jwks",
        "dapr.sidecar": "127.0.0.1:3501",
      });
      expect(String(boot.attributes["api.runtime"])).toMatch(/^(bun|node) /);
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    "reports through the production plugin list and context factory, and boots only once",
    async () => {
      const boot = await waitFor(
        () => received.find((event) => event.name === "api.boot"),
        "api.boot",
      );
      const url = /graphql on (\S+)/.exec(boot.message)?.[1] ?? "";

      await realFetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-boot-limit",
        },
        body: JSON.stringify({ query: tooDeep(), operationName: "Deep" }),
      });
      await realFetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-boot-auth",
          authorization: "Bearer not.a.token",
        },
        body: JSON.stringify({ query: "{ __typename }" }),
      });

      const limit = await waitFor(
        () =>
          received.find(
            (event) =>
              event.name === "graphql.limit_refused" &&
              event.attributes["request.id"] === "req-boot-limit",
          ),
        "graphql.limit_refused from the child",
      );
      const auth = await waitFor(
        () =>
          received.find(
            (event) =>
              event.name === "auth.token_rejected" &&
              event.attributes["request.id"] === "req-boot-auth",
          ),
        "auth.token_rejected from the child",
      );

      expect(limit.attributes["limit.code"]).toBe("QUERY_TOO_DEEP");
      expect(auth.attributes["auth.reason"]).toBe("malformed");
      expect(
        received.filter((event) => event.name === "api.boot"),
      ).toHaveLength(1);
    },
    BOOT_TIMEOUT_MS,
  );
});

/* -------------------------------------------------------------------------- */
/* In-process: every other class                                              */
/* -------------------------------------------------------------------------- */

const OTLP = "http://otel.test:4318";
const SIDECAR = `http://${config.daprHost}:${config.daprPort}/v1.0/actors/`;
const JWKS_URL = "http://jwks.test/api/auth/jwks";
const ISSUER = "http://localhost:3002";

type Responder = (
  url: string,
  init?: RequestInit,
) => Response | Promise<Response>;

let captured: Captured[];
let rawBodies: string[];
let responders: Map<string, Responder>;

const named = (name: string): Captured[] =>
  captured.filter((event) => event.name === name);

/** Everything that left for the collector, as one string, for leak checks. */
const shipped = (): string => rawBodies.join("\n");

const respond = (prefix: string, responder: Responder): void => {
  responders.set(prefix, responder);
};

const anonymous: JwtVerifier = async (_authorization, requestId) => ({
  ctx: anonymousCtx(requestId),
  viewer: null,
});

const yogaWith = (deps: ContextDeps): ApiYoga => {
  const build = makeContextFactory(deps);
  return createApiYoga({
    context: ({ request }) => build(request),
    plugins: [useQueryCostLimits(), useTelemetry()],
  });
};

const post = async (
  yoga: ApiYoga,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) => {
  const response = await yoga.fetch("http://api.test/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as {
      data?: Record<string, unknown> | null;
      errors?: { message: string; extensions?: Record<string, unknown> }[];
    },
  };
};

describe("in-process wiring", () => {
  beforeEach(() => {
    captured = [];
    rawBodies = [];
    responders = new Map();
    resetEventThrottle();
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", OTLP);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url === `${OTLP}/v1/logs`) {
          rawBodies.push(String(init?.body));
          captured.push(...decode(String(init?.body)));
          return new Response(null, { status: 200 });
        }
        for (const [prefix, responder] of responders) {
          if (url.startsWith(prefix)) return await responder(url, init);
        }
        throw new Error(`unexpected fetch in test: ${url}`);
      }),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /* ------------------------------------------------------------------------ */

  describe("graphql.unexpected_error", () => {
    it("fires once for an error the masker hides, with its class and field, not its message", async () => {
      const { invoke } = stubSidecar({
        "BarcodeActor.get": () => {
          throw new TypeError(
            "lookup failed for 4006381333931 on behalf of alice@example.com",
          );
        },
      });
      const yoga = yogaWith({ verify: anonymous, invoke });

      const { body } = await post(
        yoga,
        {
          query:
            "query Scan($code: String!) { barcode(code: $code) { __typename } }",
          variables: { code: "4006381333931" },
          operationName: "Scan",
        },
        { "x-request-id": "req-unexpected" },
      );

      expect(body.errors?.[0]?.message).toBe("Unexpected error.");
      expect(named("graphql.unexpected_error")).toEqual([
        {
          service: "api",
          name: "graphql.unexpected_error",
          severity: "ERROR",
          message: "query Scan: TypeError at barcode",
          attributes: {
            "request.id": "req-unexpected",
            "graphql.operation_name": "Scan",
            "graphql.operation_type": "query",
            "graphql.field": "barcode",
            "error.name": "TypeError",
            "error.count": 1,
          },
        },
      ]);
      expect(shipped()).not.toContain("4006381333931");
      expect(shipped()).not.toContain("alice@example.com");
    });

    it("stays silent for a typed domain error, which the client is told about", async () => {
      respond(
        SIDECAR,
        () =>
          new Response(
            '{"code":"NOT_FOUND","message":"no barcode 4006381333931"}',
            { status: 200, headers: { [DAPR_ERROR_RESPONSE_HEADER]: "1" } },
          ),
      );
      const yoga = yogaWith({ verify: anonymous, invoke: invokeActor });

      const { body } = await post(yoga, {
        query: '{ barcode(code: "4006381333931") { __typename } }',
      });

      expect(body.data?.barcode).toEqual({ __typename: "NotFoundError" });
      expect(captured).toEqual([]);
    });

    it("stays silent for a deliberate error that does reach result.errors", async () => {
      // The page-size cap: an ActorError thrown by `pageArgs` in this process,
      // on a field with no error union, so it arrives in `errors` unmasked.
      const { invoke } = stubSidecar({
        "BarcodeActor.get": () => ({ code: "x", type: null, items: [] }),
      });
      const yoga = yogaWith({ verify: anonymous, invoke });

      const { body } = await post(yoga, {
        query:
          '{ barcode(code: "x") { ... on Barcode { items(first: 5000) { totalCount } } } }',
      });

      expect(body.errors?.[0]?.extensions?.code).toBe("VALIDATION");
      expect(body.errors?.[0]?.message).toMatch(/at most/);
      expect(captured).toEqual([]);
    });
  });

  /* ------------------------------------------------------------------------ */

  describe("actor.invocation_failed", () => {
    const scan = {
      query:
        "query Scan($code: String!) { barcode(code: $code) { __typename } }",
      variables: { code: "4006381333931" },
      operationName: "Scan",
    };

    it("fires once for a non-envelope failure, and joins graphql.unexpected_error on the request id", async () => {
      respond(
        SIDECAR,
        () =>
          new Response(
            '{"errorCode":"ERR_ACTOR_INVOKE_METHOD","message":"error from actor service: (500) 4006381333931"}',
            { status: 500 },
          ),
      );
      const yoga = yogaWith({ verify: anonymous, invoke: invokeActor });

      await post(yoga, scan, { "x-request-id": "req-upstream" });

      expect(named("actor.invocation_failed")).toEqual([
        {
          service: "api",
          name: "actor.invocation_failed",
          severity: "ERROR",
          message:
            "BarcodeActor.get: status 500 ERR_ACTOR_INVOKE_METHOD/app_error",
          attributes: {
            "request.id": "req-upstream",
            "actor.type": "BarcodeActor",
            "actor.method": "get",
            "failure.kind": "status",
            "http.status": 500,
            "dapr.error_code": "ERR_ACTOR_INVOKE_METHOD",
            "failure.cause": "app_error",
            "actor.app_status": 500,
          },
        },
      ]);
      expect(named("graphql.unexpected_error")).toHaveLength(1);
      expect(named("graphql.unexpected_error")[0]?.attributes).toMatchObject({
        "request.id": "req-upstream",
        "error.name": "ActorInvocationError",
        "graphql.field": "barcode",
      });
      // Neither the actor id nor the sidecar's body, which quotes it — only
      // daprd's error code and the classification of the rest.
      expect(shipped()).not.toContain("4006381333931");
      expect(shipped()).not.toContain("error from actor service");
    });

    it("says a lost connection to the actor host is one, without the id daprd quotes", async () => {
      // The body daprd answered with in the keep-alive race of 2026-09-28,
      // when the actor host logged nothing at all.
      respond(
        SIDECAR,
        () =>
          new Response(
            JSON.stringify({
              errorCode: "ERR_ACTOR_INVOKE_METHOD",
              message:
                "error invoke actor method: rpc error: code = Internal desc = " +
                'error invoke actor method: Put "http://actors:3002/actors/BarcodeActor/4006381333931/method/get": EOF',
            }),
            { status: 500 },
          ),
      );
      const yoga = yogaWith({ verify: anonymous, invoke: invokeActor });

      await post(yoga, scan, { "x-request-id": "req-eof" });

      const events = named("actor.invocation_failed");
      expect(events).toHaveLength(1);
      expect(events[0]?.attributes).toEqual({
        "request.id": "req-eof",
        "actor.type": "BarcodeActor",
        "actor.method": "get",
        "failure.kind": "status",
        "http.status": 500,
        "dapr.error_code": "ERR_ACTOR_INVOKE_METHOD",
        "failure.cause": "app_channel_closed",
      });
      expect(shipped()).not.toContain("4006381333931");
      expect(shipped()).not.toContain("actors:3002");
    });

    it.each([
      ["network", () => new TypeError("fetch failed")],
      [
        "timeout",
        () => new DOMException("The operation timed out.", "TimeoutError"),
      ],
    ] as const)("classifies a thrown fetch as %s", async (kind, failure) => {
      respond(SIDECAR, () => {
        throw failure();
      });
      const yoga = yogaWith({ verify: anonymous, invoke: invokeActor });

      await post(yoga, scan, { "x-request-id": `req-${kind}` });

      const events = named("actor.invocation_failed");
      expect(events).toHaveLength(1);
      expect(events[0]?.attributes).toEqual({
        "request.id": `req-${kind}`,
        "actor.type": "BarcodeActor",
        "actor.method": "get",
        "failure.kind": kind,
      });
    });
  });

  /* ------------------------------------------------------------------------ */

  describe("auth.token_rejected", () => {
    let published: CryptoKey;
    let stranger: CryptoKey;
    let jwksBody = "";

    beforeAll(async () => {
      const one = await generateKeyPair("EdDSA", {
        crv: "Ed25519",
        extractable: true,
      });
      const two = await generateKeyPair("EdDSA", {
        crv: "Ed25519",
        extractable: true,
      });
      published = one.privateKey;
      stranger = two.privateKey;
      const jwk = await exportJWK(one.publicKey);
      jwksBody = JSON.stringify({
        keys: [{ ...jwk, alg: "EdDSA", kid: "k1" }],
      });
    });

    const sign = async (
      key: CryptoKey,
      kid: string,
      claims: Record<string, unknown>,
      options: { expiresIn?: string; issuer?: string } = {},
    ): Promise<string> =>
      await new SignJWT(claims)
        .setProtectedHeader({ alg: "EdDSA", kid })
        .setIssuedAt()
        .setIssuer(options.issuer ?? ISSUER)
        .setAudience(ISSUER)
        .setExpirationTime(options.expiresIn ?? "15m")
        .sign(key);

    const serveJwks = (): void =>
      respond(
        JWKS_URL,
        () =>
          new Response(jwksBody, {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      );

    /** A fresh verifier per test, so no test inherits another's key cache. */
    const yogaVerifying = (): ApiYoga =>
      yogaWith({
        verify: createJwtVerifier({
          jwksUrl: JWKS_URL,
          issuer: ISSUER,
          audience: ISSUER,
        }),
        invoke: stubSidecar({}).invoke,
      });

    const cases: readonly {
      reason: string;
      severity: string;
      token: () => Promise<string>;
      setup?: () => void;
      extra?: Record<string, Scalar>;
    }[] = [
      {
        reason: "expired",
        severity: "INFO",
        token: () => sign(published, "k1", { sub: "u" }, { expiresIn: "-60s" }),
        extra: { "error.name": "JWTExpired" },
      },
      {
        reason: "bad_signature",
        severity: "WARN",
        token: () => sign(stranger, "k1", { sub: "u" }),
        extra: { "error.name": "JWSSignatureVerificationFailed" },
      },
      {
        reason: "unknown_kid",
        severity: "WARN",
        token: () => sign(published, "k-unpublished", { sub: "u" }),
        extra: { "error.name": "JWKSNoMatchingKey" },
      },
      {
        reason: "jwks_unavailable",
        severity: "ERROR",
        token: () => sign(published, "k1", { sub: "u" }),
        setup: () =>
          respond(JWKS_URL, () => {
            throw new TypeError("fetch failed");
          }),
        extra: { "error.name": "TypeError" },
      },
      {
        reason: "claim_invalid",
        severity: "WARN",
        token: () =>
          sign(
            published,
            "k1",
            { sub: "u" },
            { issuer: "http://evil.example" },
          ),
        extra: {
          "error.name": "JWTClaimValidationFailed",
          "auth.claim": "iss",
        },
      },
      {
        reason: "malformed",
        severity: "WARN",
        token: async () => "not.a.token",
        extra: { "error.name": "JWSInvalid" },
      },
      {
        reason: "no_subject",
        severity: "WARN",
        token: () => sign(published, "k1", { email: "alice@example.com" }),
      },
    ];

    it.each(cases)("fires once for $reason, and never ships the token", async ({
      reason,
      severity,
      token,
      setup,
      extra,
    }) => {
      serveJwks();
      setup?.();
      const bearer = await token();
      const yoga = yogaVerifying();

      const { status, body } = await post(
        yoga,
        { query: "{ __typename }" },
        { authorization: `Bearer ${bearer}`, "x-request-id": `req-${reason}` },
      );

      // The key set being unreachable is our outage, not a bad token: a 503
      // the client can retry, rather than the 401 that signs it out
      // (`context.ts`, `authUnavailable`).
      const outage = reason === "jwks_unavailable";
      expect(status).toBe(outage ? 503 : 401);
      expect(body.errors?.[0]?.extensions?.code).toBe(
        outage ? "AUTH_UNAVAILABLE" : "UNAUTHENTICATED",
      );
      const events = named("auth.token_rejected");
      expect(events).toHaveLength(1);
      expect(events[0]?.severity).toBe(severity);
      expect(events[0]?.attributes).toMatchObject({
        "request.id": `req-${reason}`,
        "auth.reason": reason,
        ...extra,
      });
      expect(shipped()).not.toContain(bearer);
      expect(shipped()).not.toContain("alice@example.com");
    });

    it("stays silent for a request with no token, which is anonymous, not rejected", async () => {
      serveJwks();

      const { status } = await post(yogaVerifying(), {
        query: "{ __typename }",
      });

      expect(status).toBe(200);
      expect(captured).toEqual([]);
    });
  });

  /* ------------------------------------------------------------------------ */

  describe("graphql.limit_refused", () => {
    const yoga = (): ApiYoga =>
      yogaWith({ verify: anonymous, invoke: stubSidecar({}).invoke });

    it("fires once for a validation-time limit, named by its code", async () => {
      await post(
        yoga(),
        { query: tooDeep(), operationName: "Deep" },
        { "x-request-id": "req-deep" },
      );

      expect(named("graphql.limit_refused")).toEqual([
        {
          service: "api",
          name: "graphql.limit_refused",
          severity: "WARN",
          message: "Deep: refused by QUERY_TOO_DEEP",
          attributes: {
            "request.id": "req-deep",
            "limit.code": "QUERY_TOO_DEEP",
            "graphql.operation_name": "Deep",
          },
        },
      ]);
    });

    it("fires once for the parser's token bound, which carries no limit code of its own", async () => {
      await post(
        yoga(),
        { query: `{ ${"a ".repeat(10_000)} }` },
        { "x-request-id": "req-tokens" },
      );

      const events = named("graphql.limit_refused");
      expect(events).toHaveLength(1);
      expect(events[0]?.attributes["limit.code"]).toMatch(/^QUERY_TOO_/);
      expect(events[0]?.attributes["request.id"]).toBe("req-tokens");
    });

    it("fires once for the body cap, which Yoga never sees", async () => {
      const server = createApiServer(yoga());
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      const { port } = server.address() as AddressInfo;
      try {
        const response = await realFetch(`http://127.0.0.1:${port}/graphql`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-request-id": "req-body",
          },
          body: "x".repeat(MAX_BODY_BYTES + 1),
        }).catch(() => null);
        if (response !== null) expect(response.status).toBe(413);
      } finally {
        server.close();
      }

      expect(named("graphql.limit_refused")).toEqual([
        expect.objectContaining({
          attributes: {
            "request.id": "req-body",
            "limit.code": "REQUEST_TOO_LARGE",
            "graphql.operation_name": "anonymous",
          },
        }),
      ]);
    });

    it("stays silent for an ordinary validation error", async () => {
      await post(yoga(), { query: "{ noSuchField }" });

      expect(captured).toEqual([]);
    });
  });

  /* ------------------------------------------------------------------------ */

  describe("telemetry.suppressed", () => {
    it("caps a class per window, then reports the drop count once", () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const fire = (code: string) =>
        reportLimitRefused({ requestId: "r", code, operationName: "Deep" });

      for (let i = 0; i < THROTTLE_MAX_PER_WINDOW + 3; i += 1) {
        fire("QUERY_TOO_DEEP");
      }
      // Another class has its own window.
      fire("QUERY_TOO_WIDE");

      expect(
        named("graphql.limit_refused").filter(
          (event) => event.attributes["limit.code"] === "QUERY_TOO_DEEP",
        ),
      ).toHaveLength(THROTTLE_MAX_PER_WINDOW);
      expect(
        named("graphql.limit_refused").filter(
          (event) => event.attributes["limit.code"] === "QUERY_TOO_WIDE",
        ),
      ).toHaveLength(1);
      expect(named("telemetry.suppressed")).toEqual([]);

      vi.setSystemTime(Date.now() + THROTTLE_WINDOW_MS);
      captured = [];
      fire("QUERY_TOO_DEEP");

      expect(captured.map((event) => event.name)).toEqual([
        "telemetry.suppressed",
        "graphql.limit_refused",
      ]);
      expect(captured[0]).toMatchObject({
        severity: "WARN",
        attributes: {
          "telemetry.event": "graphql.limit_refused",
          "telemetry.class": "QUERY_TOO_DEEP",
          "telemetry.suppressed": 3,
          "telemetry.window_ms": THROTTLE_WINDOW_MS,
        },
      });
    });
  });
});
