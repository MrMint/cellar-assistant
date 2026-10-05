/**
 * The API process. **Phase 5a: this runs on Bun.**
 *
 * `package.json`'s `start` is `bun src/index.ts`; `start:node` is
 * `node src/index.ts` and is kept working on purpose, so a latency or memory
 * change can be attributed to the runtime without reverting a commit. Both
 * execute this TypeScript directly — Bun transpiles, Node 24 type-strips — and
 * neither needs a build step. The Node lane is present inside the production
 * image too (`services/api/Dockerfile`).
 *
 * Which one you actually got is `process.versions.bun`: a string under Bun,
 * `undefined` under Node. Do **not** read `process.versions.node` to decide —
 * Bun reports a synthetic Node version there (26.3.0 under bun 1.4.2), so a
 * Node-version check passes under Bun for a reason that has nothing to do with
 * Node. The `api.boot` event below records the runtime for that reason.
 *
 * Two differences between the runtimes that this service is exposed to, both
 * checked when it moved:
 *
 *   - **Bun auto-loads `.env`.** Measured under bun 1.4.2: it reads `.env`
 *     from the process working directory **only** — it does *not* walk up to
 *     the workspace root, so a repo-root `.env` is invisible here — while Node
 *     24 reads none without `--env-file`. So `services/api/.env` is now live
 *     configuration that used to be inert. It does not exist and should not:
 *     a `DATABASE_URL` in it would stop this process booting via
 *     `assertNoDatabaseCredentials()` (the assertion working, but a new way to
 *     trip it), and anything else in it would apply on the Bun lane and not
 *     the Node one, which would make the A/B lie. A real environment variable
 *     still wins over the file (measured), so compose and the dapr
 *     run-template keep the last word where they set a value at all.
 *   - **`node:http` is an emulation, not the native server.** `createServer`
 *     (in `yoga.ts`) is Bun's Node-compat layer rather than `Bun.serve`. That is
 *     deliberate: it keeps one code path for both runtimes, keeps `/healthz`
 *     ahead of Yoga, and keeps this file runnable under Node. Yoga's
 *     `req`/`res` adapter is the part that has to hold, and it does (see the
 *     four probes in the phase-5a report).
 */
import type { AddressInfo } from "node:net";
import {
  assertAuthIdentityCoherence,
  assertNoDatabaseCredentials,
  config,
} from "./config.ts";
import { buildApiContext } from "./context.ts";
import { reportBoot } from "./events.ts";
import { useQueryCostLimits } from "./limits.ts";
import { useTelemetry } from "./telemetry-plugin.ts";
import { createApiServer, createApiYoga } from "./yoga.ts";

assertNoDatabaseCredentials();
// E3 · iss/aud must equal services/actors' BETTER_AUTH_URL, or nothing verifies.
assertAuthIdentityCoherence();

const yoga = createApiYoga({
  context: ({ request }) => buildApiContext(request),
  plugins: [
    /**
     * Depth, breadth, complexity, model-spend and parser-token limits, every
     * one of them calibrated against the client's own documents. See
     * `limits.ts` — it carries the measurements and the headroom for each
     * number.
     */
    useQueryCostLimits(),
    /**
     * Unexpected errors and limit refusals, as events (`events.ts`). The
     * boot test in `telemetry-wiring.test.ts` runs this file and proves both
     * reach the collector.
     */
    useTelemetry(),
  ],
});
const server = createApiServer(yoga);

/**
 * `process.versions.bun`, not `process.versions.node` — see the runtime note at
 * the top of this file. Reported on every boot so a log line from an A/B run
 * says which runtime produced it.
 */
const runtime = (): string => {
  const bun = process.versions.bun;
  return bun === undefined
    ? `node ${process.versions.node}`
    : `bun ${bun} (node-compat ${process.versions.node})`;
};

/** How many browser origins may call this directly. 0, the default, means none. */
const corsOriginCount = (): number => {
  if (config.cors === false) return 0;
  const { origin } = config.cors;
  if (Array.isArray(origin)) return origin.length;
  return origin === undefined ? 0 : 1;
};

server.listen(config.appPort, config.appHost, () => {
  // The bound port, not the configured one: `APP_PORT=0` asks for any free
  // port, which is how `telemetry-wiring.test.ts` boots this file.
  const { port } = server.address() as AddressInfo;
  reportBoot({
    url: `http://${config.appHost}:${port}/graphql`,
    runtime: runtime(),
    sidecar: `${config.daprHost}:${config.daprPort}`,
    jwksUrl: config.auth.jwksUrl,
    issuer: config.auth.issuer,
    graphiql: config.graphiql,
    corsOrigins: corsOriginCount(),
  });
});

const shutdown = (signal: string): void => {
  console.log(`[api] ${signal} received, stopping`);
  server.close(() => process.exit(0));
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
