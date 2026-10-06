import type { CORSOptions } from "graphql-yoga";

const env = (name: string, fallback: string): string =>
  process.env[name] ?? fallback;

/**
 * `services/actors` serves better-auth at `/api/auth/*` on port 3002 (A6). The API
 * never calls it per request — it verifies the 15-minute EdDSA tokens against
 * the JWKS below, and caches the key set in process.
 */
const authIssuer = env("AUTH_ISSUER", "http://localhost:3002");

/**
 * Origins allowed to call `/graphql` from a browser.
 *
 * **An allowlist, because the default was a mirror.** Yoga's built-in CORS
 * reflects whatever `Origin` it is sent: before this, `Origin:
 * https://evil.example` came back as `access-control-allow-origin:
 * https://evil.example` *together with* `access-control-allow-credentials:
 * true`, which is the combination the spec forbids for `*` precisely because it
 * authorises a cross-site read.
 *
 * That was not exploitable on the day it was found, and the honest reason is
 * worth writing down: this API authenticates from `Authorization` only and
 * never reads a cookie, so a cross-origin `fetch` with `credentials:
 * "include"` carries nothing to steal. It is a loaded footgun rather than a
 * live wound — it becomes a real one the first time anything here reads a
 * cookie, and that is a one-line change somebody will make without thinking
 * about this header.
 *
 * The default list is empty, and that is correct rather than lazy: **the
 * browser never talks to this service.** `services/client` reaches it through
 * its own Next route handler (`src/lib/api/proxy.ts`, mounted at
 * `/api/graphql`), which is a server-to-server `fetch` and does no preflight at
 * all. So there is no legitimate browser origin to allow, in any lane — the
 * containerised client on 3003 and a host `bun run dev` on 3000 both proxy.
 * Set `CORS_ALLOWED_ORIGINS` (comma-separated) if a browser client is ever
 * pointed straight at this port.
 */
const corsAllowedOrigins = env("CORS_ALLOWED_ORIGINS", "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin !== "");

/**
 * **`origin: []` does not mean "allow nothing" — it means "allow everything".**
 *
 * Measured against `@whatwg-node/server` 0.11.0, which is what Yoga's `cors`
 * option is implemented by. `getCORSHeadersByRequestAndOptions` opens with
 *
 * ```js
 * if (corsOptions.origin == null ||
 *     corsOptions.origin.length === 0 ||
 *     corsOptions.origin.includes('*')) {
 *   headers['Access-Control-Allow-Origin'] = currentOrigin;
 * ```
 *
 * so an empty allowlist takes the *same branch* as no configuration at all and
 * reflects whatever `Origin` arrived. An empty list is the obvious spelling of
 * "no browser may call this", and it is the one spelling that silently keeps
 * the defect. `false` is the spelling that means it: the plugin then returns no
 * CORS headers at all, while still answering the preflight with a bare 204, so
 * a browser fails the check instead of hanging.
 *
 * The same function is why `credentials: true` appeared without anyone asking
 * for it — it defaults to `true` for any origin that is not literally `*`.
 * Yoga's default `cors` of `{}` therefore produced *reflect the origin* **and**
 * *allow credentials* together, which is the pair the CORS spec refuses to let
 * you write as `*` precisely because it authorises a cross-site credentialed
 * read.
 */
const corsPolicy: CORSOptions =
  corsAllowedOrigins.length === 0
    ? false
    : {
        origin: corsAllowedOrigins,
        /**
         * Never true. Nothing here reads a cookie — `buildApiContext` reads
         * `Authorization` and nothing else — so there are no credentials to
         * carry, and the default would turn them on.
         */
        credentials: false,
        methods: ["POST", "OPTIONS"],
        allowedHeaders: ["content-type", "authorization", "x-request-id"],
      };

/**
 * The development lane's `DAPR_API_TOKEN` — published as the default in
 * `infra/docker-compose.yml`, so it authenticates nobody.
 */
export const PUBLISHED_DEV_DAPR_API_TOKEN = "cellar-dev-dapr-api-token";

/**
 * `DAPR_API_TOKEN`, refused in production when it is absent or the published
 * development value.
 *
 * Evaluated where `config` is built, which is at import — so a production
 * process holding the published token fails at boot, naming the variable,
 * rather than serving with it. The sidecar token is the one thing between
 * anything on the compose network and every actor method through daprd
 * (`docs/architecture/target-stack.md`, "Dapr API tokens"); a value that
 * anyone with the repository can read is no token. Empty is refused too: it
 * sends no header, and a sidecar that requires one answers every actor call
 * 401, which reads as an outage rather than a configuration error.
 *
 * Outside production the default stays empty and any value is accepted, which
 * is what the dev lane and the tests run on. The deploy's
 * `scripts/deploy/check-prod-config.mjs` refuses the same value before compose
 * starts; this is the rule held by the process that spends the value.
 */
export const daprApiTokenFrom = (environment: NodeJS.ProcessEnv): string => {
  const token = environment.DAPR_API_TOKEN ?? "";
  if (environment.NODE_ENV !== "production") return token;
  if (token === "") {
    throw new Error(
      "[dapr] DAPR_API_TOKEN is required in production. Without it services/api presents " +
        "no dapr-api-token and its sidecar refuses every actor invocation.",
    );
  }
  if (token === PUBLISHED_DEV_DAPR_API_TOKEN) {
    throw new Error(
      "[dapr] DAPR_API_TOKEN is the development lane's published value " +
        `(${JSON.stringify(PUBLISHED_DEV_DAPR_API_TOKEN)}, infra/docker-compose.yml) in production. ` +
        "Anything that can reach a sidecar could invoke every actor method with it. Generate a real one " +
        "(openssl rand -hex 32) and give the same value to both sidecars and both apps.",
    );
  }
  return token;
};

export const config = {
  appPort: Number(env("APP_PORT", "3001")),
  appHost: env("APP_HOST", "0.0.0.0"),
  daprHost: env("DAPR_HOST", "127.0.0.1"),
  daprPort: env("DAPR_HTTP_PORT", "3501"),
  /**
   * The sidecar's API token (Dapr's `DAPR_API_TOKEN`), presented as
   * `dapr-api-token` on every actor invocation. Empty sends none.
   * `docs/architecture/target-stack.md`, "Dapr API tokens".
   */
  daprApiToken: daprApiTokenFrom(process.env),
  auth: {
    /** Reachable from *this* process: `actors:3002` on compose, localhost off it. */
    jwksUrl: env("AUTH_JWKS_URL", "http://127.0.0.1:3002/api/auth/jwks"),
    /** A6 sets `iss` and `aud` to `BETTER_AUTH_URL`. */
    issuer: authIssuer,
    audience: env("AUTH_AUDIENCE", authIssuer),
  },
  cors: corsPolicy,
  /**
   * GraphiQL is **opt-in**, and was previously served to anyone who asked.
   * Measured before this landed: `GET /graphql` with `Accept: text/html`
   * returned 200 and the full Yoga IDE, unauthenticated, on a container
   * nothing had gated.
   *
   * Opt-in rather than `NODE_ENV !== "production"` because that test fails
   * open. Only `services/api/Dockerfile` sets `NODE_ENV=production`; the dev
   * compose lane runs a stock `node:24` image with it unset, so an
   * environment-sniffing gate leaves the IDE on in every lane that is not the
   * production image — including any deployment that forgets the variable. A
   * variable that must be *present* to enable the IDE cannot be forgotten into
   * the dangerous state.
   *
   * Introspection stays on, deliberately. `packages/schema/schema.graphql` is
   * committed to a public repository, so disabling it hides nothing from
   * anybody who can read the source and costs every legitimate tool its schema.
   * The amplifier worth removing is the hosted query console, not the type map.
   */
  graphiql: env("GRAPHIQL", "") === "1",
} as const;

/**
 * The API holds no database credentials (target-stack §1). This guard makes the
 * rule enforceable rather than aspirational: if a connection string ever reaches
 * this process, something has gone wrong in deployment.
 *
 * `AUTH_DATABASE_URL` is on the list because A6 introduced a second database
 * (better-auth's own) and it is just as much a credential as the first.
 */
export const assertNoDatabaseCredentials = (
  environment: NodeJS.ProcessEnv = process.env,
): void => {
  const leaked = [
    "DATABASE_URL",
    "AUTH_DATABASE_URL",
    "PGHOST",
    "PGPASSWORD",
    "POSTGRES_PASSWORD",
  ].filter((name) => (environment[name] ?? "") !== "");
  if (leaked.length > 0) {
    throw new Error(
      `services/api must not hold database credentials, but found: ${leaked.join(", ")}. ` +
        "Only services/actors connects to Postgres.",
    );
  }
};

/**
 * E3 · the identity triple moves together, or nothing verifies.
 *
 * `services/actors` stamps every token's `iss` **and** `aud` with the literal
 * `BETTER_AUTH_URL` string — read straight out of `services/actors/src/auth/auth.ts`,
 * where the `jwt` plugin is given `issuer: config.baseUrl, audience:
 * config.baseUrl`, and `config.baseUrl` is `process.env.BETTER_AUTH_URL`
 * verbatim (no trimming, no normalisation). `jose`'s `jwtVerify` compares both
 * by exact string equality. So `AUTH_ISSUER` and `AUTH_AUDIENCE` here are not
 * "roughly the auth origin" — they are the same *string*, down to a trailing
 * slash.
 *
 * The failure mode this exists to prevent (migration-plan.md, D1's production
 * landmine): in production `BETTER_AUTH_URL` becomes the public Next origin
 * while `AUTH_ISSUER` keeps its `http://localhost:3002` default. Every token
 * then fails verification with jose's `"unexpected \"iss\" claim value"`, which
 * reads like a broken key set rather than a missing environment variable, and
 * the whole app is dead on arrival.
 *
 * `BETTER_AUTH_URL` is passed to this process by `infra/docker-compose.prod.yml`
 * **only as the oracle for this assertion** — the API never reads it otherwise
 * (`config` above does not mention it), and it is a URL, not a credential, so it
 * does not belong on `assertNoDatabaseCredentials`' list. When it is absent the
 * comparison is simply skipped and the production checks below still apply.
 *
 * Same house pattern as `assertBareHostname` in
 * `services/actors/src/lib/s3-presign.ts`: a deployment mistake that would otherwise
 * surface as a misleading runtime error is turned into a startup error that
 * names the variable and the fix.
 */
const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
]);

const isLoopback = (url: URL): boolean =>
  LOOPBACK_HOSTNAMES.has(url.hostname.replace(/^\[|\]$/g, "")) ||
  url.hostname.endsWith(".localhost") ||
  url.hostname.startsWith("127.");

const absoluteUrl = (name: string, value: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `[auth] ${name} must be an absolute URL, but got ${JSON.stringify(value)}.`,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `[auth] ${name} must be an http(s) URL, but got ${JSON.stringify(value)}.`,
    );
  }
  return url;
};

export const assertAuthIdentityCoherence = (
  environment: NodeJS.ProcessEnv = process.env,
): void => {
  const read = (name: string): string | undefined => {
    const value = environment[name];
    return value === undefined || value === "" ? undefined : value;
  };

  // Both production Dockerfiles set `NODE_ENV=production`; the dev compose file
  // runs a stock `node:24` image and vitest sets `test`, so this is a reliable
  // "built image" signal rather than a guess about the host.
  const isProduction = environment.NODE_ENV === "production";
  const stamped = read("BETTER_AUTH_URL");
  const issuer = read("AUTH_ISSUER");
  const audience = read("AUTH_AUDIENCE");
  const jwksUrl = read("AUTH_JWKS_URL");

  if (issuer !== undefined) absoluteUrl("AUTH_ISSUER", issuer);

  if (stamped !== undefined && issuer === undefined) {
    throw new Error(
      `[auth] BETTER_AUTH_URL is ${JSON.stringify(stamped)} but AUTH_ISSUER is unset, so this process ` +
        'would verify tokens against the default "http://localhost:3002" and reject every one of them. ' +
        "Set AUTH_ISSUER to exactly the same string as BETTER_AUTH_URL.",
    );
  }

  if (stamped !== undefined && issuer !== undefined && stamped !== issuer) {
    throw new Error(
      `[auth] AUTH_ISSUER (${JSON.stringify(issuer)}) must equal BETTER_AUTH_URL (${JSON.stringify(stamped)}) exactly. ` +
        "services/actors stamps iss/aud with BETTER_AUTH_URL verbatim and jose compares them as strings, " +
        "so even a trailing slash makes every token fail verification.",
    );
  }

  const effectiveIssuer = issuer ?? stamped;
  if (
    audience !== undefined &&
    effectiveIssuer !== undefined &&
    audience !== effectiveIssuer
  ) {
    throw new Error(
      `[auth] AUTH_AUDIENCE (${JSON.stringify(audience)}) must equal AUTH_ISSUER (${JSON.stringify(effectiveIssuer)}). ` +
        "The jwt plugin in services/actors sets both claims to BETTER_AUTH_URL; there is no deployment in which they differ. " +
        "Leave AUTH_AUDIENCE unset to inherit AUTH_ISSUER.",
    );
  }

  if (isProduction) {
    if (issuer === undefined) {
      throw new Error(
        '[auth] AUTH_ISSUER must be set explicitly in production. Its default ("http://localhost:3002") ' +
          "is the development actors port, and every token would fail verification. " +
          "It must equal services/actors' BETTER_AUTH_URL, which in production is the public Next origin.",
      );
    }
    const issuerUrl = absoluteUrl("AUTH_ISSUER", issuer);
    if (issuerUrl.protocol !== "https:" || isLoopback(issuerUrl)) {
      throw new Error(
        `[auth] AUTH_ISSUER must be a public https origin in production, but got ${JSON.stringify(issuer)}. ` +
          "better-auth derives its __Secure- cookie prefix and its OAuth redirect URIs from the same value, " +
          "and neither works over http or against a loopback host.",
      );
    }
    if (jwksUrl === undefined) {
      throw new Error(
        '[auth] AUTH_JWKS_URL must be set explicitly in production. Its default ("http://127.0.0.1:3002/api/auth/jwks") ' +
          "points this container at itself, so the key set never loads and every authenticated request fails. " +
          'On the compose network it is "http://actors:3002/api/auth/jwks".',
      );
    }
  }

  if (jwksUrl !== undefined) {
    const parsed = absoluteUrl("AUTH_JWKS_URL", jwksUrl);
    // better-auth's jwt plugin serves the key set at `<basePath>/jwks`, and
    // `services/actors/src/auth/mount.ts` pins basePath to `/api/auth`. Pointing
    // this at an origin — the common paste error — yields a 404 that surfaces
    // much later as "token verification failed".
    if (!parsed.pathname.endsWith("/jwks")) {
      throw new Error(
        `[auth] AUTH_JWKS_URL must end at better-auth's key set, but got ${JSON.stringify(jwksUrl)}. ` +
          'Expected a path ending in "/jwks" (e.g. http://actors:3002/api/auth/jwks).',
      );
    }
  }
};
