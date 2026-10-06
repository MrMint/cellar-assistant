/**
 * Where the Next server reaches the new stack.
 *
 * Every value here is **server-only**: none is `NEXT_PUBLIC_`, because the
 * browser never learns these origins. It talks to same-origin proxy paths
 * (`endpoints.ts`) and the Next server does the rest. That is not only
 * defence in depth — `next.config.mjs` sets `connect-src 'self' …`, so a
 * browser fetch straight to `localhost:3001` would be blocked by CSP.
 *
 * Defaults match `infra/docker-compose.yml`'s host port mapping, so local
 * development needs no `.env.local` entries at all.
 */

const origin = (name: string, fallback: string): string => {
  const value = process.env[name];
  const raw = value === undefined || value === "" ? fallback : value;
  // A trailing slash here produces `//api/auth/...` downstream, which some
  // routers treat as a different path. Normalise once, at the edge.
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
};

/**
 * Where this Next server forwards `/api/auth/*` — the origin of `services/actors`
 * as *this process* reaches it (A6).
 *
 * **Corrected by E3.** This is not the same value as the actors app's own
 * `BETTER_AUTH_URL`, and treating them as one is a production footgun. They
 * coincide in development only because both are `http://localhost:3002`:
 *
 *   - `BETTER_AUTH_URL` is the origin better-auth *presents to the world* — the
 *     public Next origin, i.e. this app's own address. It is what OAuth
 *     redirect URIs, the JWT `iss`/`aud` and the `__Secure-` cookie prefix are
 *     built from.
 *   - `BETTER_AUTH_ORIGIN`, below, is where this server sends the proxied
 *     request — the Loki edge host (`https://loki.example.com`).
 *
 * Set this to the public Next origin in production and the proxy forwards to
 * itself. See `docs/architecture/deploy-loki.md` §2.5.
 */
export const authOrigin = (): string =>
  origin("BETTER_AUTH_ORIGIN", "http://localhost:3002");

/** `services/api`'s GraphQL endpoint. */
export const graphqlApiUrl = (): string =>
  origin("GRAPHQL_API_URL", "http://localhost:3001/graphql");
