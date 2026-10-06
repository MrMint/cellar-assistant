/**
 * The GraphQL server and the HTTP handler in front of it, with nothing that
 * runs at import time. `index.ts` wires these to the real context factory and
 * a port; the telemetry wiring tests wire them to stubs.
 */
import { createServer, type Server } from "node:http";
import { GraphQLError } from "graphql";
import type { Plugin, YogaInitialContext } from "graphql-yoga";
import { createYoga, maskError } from "graphql-yoga";
import { config } from "./config.ts";
import type { ApiContext } from "./context.ts";
import { asActorError, isMaskedError } from "./error-class.ts";
import { reportLimitRefused } from "./events.ts";
import { MAX_BODY_BYTES } from "./limits.ts";
import { requestIdFor, sanitizeRequestId } from "./request-id.ts";
import { schema } from "./schema/index.ts";
import { redactingYogaLogger, reportMasked } from "./telemetry-plugin.ts";

export type ApiYogaOptions = {
  readonly context: (
    initial: YogaInitialContext,
  ) => Promise<ApiContext> | ApiContext;
  /**
   * Passed in rather than listed here, so that the production list stays in
   * `index.ts`, where `limits.test.ts` asserts `useQueryCostLimits()` is in it.
   * Both of the plugins it installs must stay *here*, in `plugins`: Yoga
   * appends its own masking plugin after every user plugin, and
   * `useTelemetry()` has to read errors before they are masked.
   */
  readonly plugins: readonly Plugin[];
};

export const createApiYoga = ({ context, plugins }: ApiYogaOptions) =>
  createYoga({
    schema,
    graphqlEndpoint: "/graphql",
    /**
     * A context factory that throws something unexpected fails before any
     * operation executes, so the telemetry plugin never sees it. It is reported
     * here, where the request (and so its id) is still in hand; the logger
     * below then knows not to report it again.
     */
    context: async (initial) => {
      try {
        return await context(initial);
      } catch (error) {
        if (isMaskedError(error)) {
          reportMasked({
            requestId: requestIdFor(initial.request),
            operationName: initial.params?.operationName,
            error,
          });
        }
        throw error;
      }
    },
    /**
     * Never Yoga's default, which prints every masked error's message and
     * stack to stderr — for an actor failure, the actor id and daprd's body.
     * See `redactingYogaLogger`; `yoga-logging.test.ts` holds it.
     */
    logging: redactingYogaLogger,
    landingPage: false,
    /** Opt-in, and off by default. See `config.graphiql` for why not `NODE_ENV`. */
    graphiql: config.graphiql,
    /** An explicit allowlist, empty by default. See `config.cors`. */
    cors: config.cors,
    plugins: [...plugins],
    maskedErrors: {
      /**
       * Yoga masks anything a resolver did not deliberately raise, which is the
       * right default — a Dapr URL or a Postgres message must never reach a
       * client. The one addition: an `ActorError` *is* deliberate, so it keeps
       * its message and gains a machine-readable `code`.
       *
       * Fields that declare `errors: {}` never get here; the errors plugin has
       * already turned those into union members (§8.3).
       *
       * **A7c (6): the unwrap is load-bearing.** graphql-js wraps anything a
       * resolver throws in a `GraphQLError` and hangs the original off
       * `originalError`, so `isActorError(error)` was false for every error
       * raised *by a resolver* — including the page-size cap, which is thrown by
       * `pageArgs` in this very process. Every one of them reached the client as
       * `INTERNAL_SERVER_ERROR` with the message replaced by "Unexpected error",
       * which is how a plain "you asked for 197 rows, the cap is 100" became
       * unreadable. Only errors arriving straight from the Dapr envelope were
       * ever matched.
       *
       * `isMaskedError` in `error-class.ts` is the same decision stated as a
       * predicate. The telemetry plugin logs exactly what this masks.
       */
      maskError: (error, message, isDev) => {
        const actorError = asActorError(error);
        if (actorError !== null) {
          return new GraphQLError(actorError.message, {
            // Keep the location the wrapper carried, so a client can still tell
            // *which* field of a ten-alias document failed.
            nodes: error instanceof GraphQLError ? error.nodes : undefined,
            path: error instanceof GraphQLError ? error.path : undefined,
            extensions: { code: actorError.code, reason: actorError.reason },
          });
        }
        return maskError(error, message, isDev);
      },
    },
  });

export type ApiYoga = ReturnType<typeof createApiYoga>;

/**
 * The body cap, refused before Yoga is handed the request.
 *
 * This is the earliest of the five limits in `limits.ts` and the only one that
 * can run before the bytes are buffered — `maxTokens` bounds the *parse*, but
 * a parse only starts once a whole body exists in memory.
 *
 * **It reads `Content-Length`, which is a declaration, not a measurement.** A
 * request that sends no length and streams a chunked body walks past this, and
 * closing that properly means counting bytes off the socket before Yoga's
 * adapter attaches its own reader — a race that loses request bodies when it is
 * got wrong, which is a worse failure than the one it fixes. Every real client
 * declares a length: `services/client`'s proxy sends a string body through
 * `fetch`, which sets the header itself (that is why `proxy.ts` excludes
 * `content-length` from the headers it forwards). The residual belongs at the
 * edge, where a body limit is one line of ingress config and no race at all.
 */
const overBodyLimit = (declared: string | undefined): number | null => {
  if (declared === undefined) return null;
  const length = Number(declared);
  return Number.isFinite(length) && length > MAX_BODY_BYTES ? length : null;
};

/**
 * How long the server holds an idle keep-alive connection: longer than any
 * client in front of it holds one, so the client is always the side that
 * closes. The runtime default (5s; Bun acts on it at ~6s) is shorter than
 * the edge's upstream pool — Caddy's 2m when this was measured, nginx-proxy's
 * `keepalive` with nginx's default 60s `keepalive_timeout` now — so the proxy
 * could reuse a connection in the instant this server closed it, and neither
 * replays a `POST` — a 502 for a GraphQL request that never arrived. Measured on
 * `cellar-stack`, 2026-09-28: a pooled client reusing a connection after a
 * 5.2–6s pause got `ECONNRESET` from :3001. The actor host had the same
 * defect behind daprd, where it was the intermittent untraced 500
 * (`services/actors/src/lib/app-channel-connections.ts`).
 */
export const API_KEEP_ALIVE_TIMEOUT_MS = 5 * 60_000;

/** `/healthz`, the body cap, then Yoga. */
export const createApiServer = (yoga: ApiYoga): Server => {
  const server = createApiRequestServer(yoga);
  server.keepAliveTimeout = API_KEEP_ALIVE_TIMEOUT_MS;
  return server;
};

const createApiRequestServer = (yoga: ApiYoga): Server =>
  createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    // The parsed number, not the raw header: what a client sent is its to
    // choose, and nothing it chose should be echoed into a response body.
    const declaredBytes = overBodyLimit(req.headers["content-length"]);
    if (declaredBytes !== null) {
      // Yoga never sees this request, so the telemetry plugin cannot report
      // it. The operation name is in the body this process declines to read.
      reportLimitRefused({
        requestId: sanitizeRequestId(req.headers["x-request-id"]),
        code: "REQUEST_TOO_LARGE",
        operationName: undefined,
      });
      res.writeHead(413, {
        "content-type": "application/json",
        connection: "close",
      });
      // GraphQL-over-HTTP error shape, so a client parses this the same way it
      // parses every other refusal rather than choking on a bare status.
      res.end(
        JSON.stringify({
          errors: [
            {
              message:
                `Request body is ${declaredBytes} bytes; the limit is ${MAX_BODY_BYTES}. ` +
                "A GraphQL document does not legitimately reach this size.",
              extensions: { code: "REQUEST_TOO_LARGE" },
            },
          ],
        }),
        // Tear the socket down once the refusal is flushed, rather than draining
        // a body this process has already declined to read.
        () => req.destroy(),
      );
      return;
    }
    void yoga(req, res);
  });
