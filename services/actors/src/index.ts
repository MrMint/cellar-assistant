import { DaprServer } from "@dapr/dapr";
import { ACTOR_REGISTRY } from "./actors/registry.ts";
import {
  AUTH_BASE_PATH,
  createAppWithAuth,
  createAuth,
  readAuthConfig,
} from "./auth/index.ts";
import { boot } from "./boot.ts";
import { config } from "./config.ts";
import { installActorErrorEnvelope } from "./lib/actor-error-envelope.ts";
import { installActorMethodAllowlist } from "./lib/actor-method-allowlist.ts";
import { installActorRouteGuard } from "./lib/actor-route-guard.ts";
import { holdIdleConnections } from "./lib/app-channel-connections.ts";
import { bootPreflight } from "./lib/boot-preflight.ts";
import { installDaprAppTokenCheck } from "./lib/dapr-app-token.ts";
import { actorDb, closeActorDb } from "./lib/db.ts";
import { assertHardenedRouting } from "./lib/host-app.ts";
import { installProcessGuards } from "./lib/process-guard.ts";
import { registerReminder } from "./lib/sidecar.ts";
import { emit, errorAttributes } from "./lib/telemetry.ts";

// First, before anything that can reject: an unhandled rejection is reported
// and the host keeps running; an uncaught exception is reported, flushed to the
// collector, and the host exits 1. Both runtimes would otherwise exit on
// either, silently as far as Grafana is concerned — and an exit on a rejection
// is what turned one malformed actor id into a host crash. The reasoning for
// treating the two differently is in `src/lib/process-guard.ts`.
installProcessGuards();

// A6: better-auth owns `/api/auth/*` on this same HTTP server. The Express app
// is created here and handed to DaprServer so the auth routes sit *in front of*
// Dapr's body-parser middleware — see `src/auth/mount.ts`. It is also where
// routing is made case-sensitive and strict, before the first route exists
// (`src/lib/host-app.ts`): Express fixes both when the router is created.
//
// X2: `actorDb()` is passed in, so better-auth writes its five tables through
// the same pool and the same database as every actor. It used to open a second
// pool against a second database (`auth_dev`); there is one of each now.
const authConfig = readAuthConfig();
// One line at boot, so "which password mode is this host on" is answerable
// from `docker logs` without exec'ing in (`src/auth/config.ts`).
console.info(`[auth] AUTH_PASSWORD_MODE=${authConfig.passwordMode}`);
const { auth } = createAuth(authConfig, actorDb());
const app = createAppWithAuth(auth);

// `pg`'s pool re-emits an error on an *idle* client (Postgres restarting,
// failing over, or killing the connection) as an `error` event on the pool,
// and an `error` event with no listener is thrown — an uncaught exception,
// which exits the host. The pool has already dropped that client by then
// (`pg-pool` `makeIdleListener`), so there is nothing to do but say so.
actorDb().$client.on("error", (error) => {
  emit({
    name: "db.idle_client_error",
    severity: "WARN",
    message: `an idle pooled connection failed and was dropped: ${error.name}`,
    attributes: errorAttributes(error),
  });
});

// Refuse to start, and say why in the log, on a database this build's
// migrations have not all reached (a deploy that skipped db:migrate used to
// boot fine and fail at query time, turns later), or — under
// NODE_ENV=production — on a sidecar token or MinIO password that is the
// development default infra/docker-compose.yml publishes. Before anything is
// registered or served. See `src/lib/boot-preflight.ts`.
await bootPreflight(actorDb(), process.env);

// daprd's app channel pools keep-alive connections for 90s and never replays
// a failed actor `PUT`. A server that closes an idle connection sooner, on its
// own timer (the runtime default: 5s), races every reuse of it, and a lost
// race is a 500 (`ERR_ACTOR_INVOKE_METHOD … EOF`) this host never sees. So
// the server `boot()` starts holds an idle connection for 5m, and daprd is
// always the side that closes. Before `boot()`, which is what listens. See
// `src/lib/app-channel-connections.ts`.
holdIdleConnections(app);

// A7b (§8.3): the same ordering trick, for the same reason. This has to sit
// ahead of the actor routes `server.actor.init()` registers below, so it can
// reshape a thrown `ActorError` into the `{ code, message }` envelope
// `services/api/src/dapr.ts` parses. See `src/lib/actor-error-envelope.ts`.
installActorErrorEnvelope(app);

// Only this app's own sidecar may call the actor routes: daprd sends
// `APP_API_TOKEN` as `dapr-api-token`, and nothing else on the network knows
// it. First of the gates, so an unauthenticated caller learns nothing — not
// even which method names exist. Deny-by-default: every path but
// `/api/auth/*` and `/healthz` needs the token, so no spelling of an actor
// route — `/ACTORS/…`, a trailing slash — gets past it by not looking like
// one. It holds against the rest of the compose network only in that sense:
// anything there can still reach the port, and it is refused without the
// token. `src/lib/actor-host-bypass.test.ts` drives every known spelling
// through this whole chain. See `src/lib/dapr-app-token.ts`.
installDaprAppTokenCheck(app, config.appApiToken);

// Dapr dispatches a method route to *any* function-valued property of the
// actor — `tx`, `setAggregate`, a test counter — and a timer route to any
// method its body names. Refuse, before a body is parsed or an actor
// activated, every name the registry's descriptors do not declare — on the
// raw path, and again on the parameters the router extracted (`app.param`).
// Same position and reason as the envelope. See
// `src/lib/actor-method-allowlist.ts`.
installActorMethodAllowlist(app, ACTOR_REGISTRY);

const server = new DaprServer({
  serverHost: config.appHost,
  serverPort: config.appPort,
  serverHttp: app,
  clientOptions: {
    daprHost: config.daprHost,
    daprPort: config.daprPort,
    actor: {
      actorIdleTimeout: config.actorIdleTimeout,
      actorScanInterval: config.actorScanInterval,
      drainOngoingCallTimeout: config.drainOngoingCallTimeout,
      drainRebalancedActors: true,
      // §8.5: reentrancy stays off. Dapr deadlocks an actor called back within
      // its own turn; the outbox is the escape hatch.
      reentrancy: { enabled: false },
    },
  },
});

// The SDK's actor routes are `async` Express 4 handlers, and three of them —
// deactivate, timer, reminder — have no `catch`: a throw there was an
// unhandled rejection, and an exit. The one that bit was the idle-timeout
// `DELETE` for an actor whose activation had failed ten minutes earlier.
// Registering through the guard settles every handler and puts an error
// handler behind them, so a deactivation of an actor this host does not hold
// is a 200 and anything else is a 500. See `src/lib/actor-route-guard.ts`.
await installActorRouteGuard(app, () => server.actor.init());

// Every route on the app — better-auth's and the SDK's, now all registered —
// must match case-sensitively and without a trailing slash, or the gates above
// and the router disagree about what a path names. `createAppWithAuth` builds
// the app that way; this refuses to serve one that is not. See
// `src/lib/host-app.ts`.
assertHardenedRouting(app);

// Everything between "an app exists" and "serving", in the order it must
// happen: AI and Overture installed (a set-but-incomplete configuration throws
// here, before any actor is registered or the server starts), every actor in
// `src/actors/registry.ts` registered, the server started, and every declared
// keep-alive reminder armed — not awaited, it retries until the sidecar's
// actor subsystem is up. What each step is for, and what went wrong when one
// was missing: `src/boot.ts`. `src/boot.test.ts` runs it.
const { registered, keepAlives } = await boot(server, { registerReminder });
void keepAlives;

console.log(
  `[actors] listening on ${config.appHost}:${config.appPort}; registered: ${registered.join(", ")}`,
);
console.log(`[actors] better-auth mounted at ${AUTH_BASE_PATH}/*`);

// Exits whatever happens. It used to rely on a failed `server.stop()` being an
// unhandled rejection, and so a crash, and so an exit; the process guard above
// no longer exits on a rejection, so a shutdown has to finish on its own.
const shutdown = async (signal: string): Promise<void> => {
  console.log(`[actors] ${signal} received, stopping`);
  let code = 0;
  try {
    await server.stop();
  } catch (error) {
    code = 1;
    emit({
      name: "process.shutdown_failed",
      severity: "ERROR",
      message: `server.stop() failed on ${signal}; exiting anyway`,
      attributes: errorAttributes(error),
    });
  }
  // One pool for the whole process (§1.5) — better-auth's included, since X2.
  await closeActorDb().catch(() => undefined);
  process.exit(code);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
