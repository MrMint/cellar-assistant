/**
 * The actor host outlasts its sidecar's idle connections, so daprd is always
 * the side that closes them.
 *
 * ## The 500 this exists for
 *
 * daprd reaches this host over a pool of keep-alive HTTP/1.1 connections (its
 * "app channel"). Go's `net/http` client, which that pool is, keeps up to 64
 * of them idle and closes one after **90s** idle (measured on `cellar-stack`,
 * daprd 1.18.3: 58 idle connections held from +11s to +88s after a burst,
 * gone by +93s) — and it does not read the `Keep-Alive: timeout=5` hint a
 * server sends. This host's `node:http` server — Bun's compat layer, the same
 * default as Node's — closed every connection idle for `keepAliveTimeout`
 * (5s; Bun acts on it at ~6s). So the server was always the side that closed,
 * on a timer the client could not see.
 *
 * That is the classic keep-alive race. When a request arrives in the instant
 * the server is closing the connection daprd picked for it, Go writes the
 * request, reads EOF (or a reset), and — because an actor call is a `PUT`,
 * which Go will not replay — fails it. daprd answers its caller
 *
 * ```json
 * {"errorCode":"ERR_ACTOR_INVOKE_METHOD","message":"error invoke actor method:
 *  rpc error: code = Internal desc = error invoke actor method:
 *  Put \"http://actors:3002/actors/CellarActor/<id>/method/get\": EOF"}
 * ```
 *
 * with a 500, and this host logs nothing, because the request never reached
 * it. The 64 idle connections from one burst all go idle together and are all
 * closed on the same timer tick, so a fan-out resolver (`myCellars` → up to
 * 100 `CellarActor.get`) that lands on that tick loses several calls in the
 * same millisecond: exactly the e2e failure of 2026-09-28 (three
 * `CellarActor.get: status 500` at 03:02:16.762–.765Z, nothing on the actor
 * side). Reproduced against the shared lane by sweeping the gap between two
 * 100-call bursts across the close tick, with daprd's CPU throttled to widen
 * its window for noticing the close: 50 failures in 4 200 calls, every one
 * that body; 0 with this in place.
 *
 * ## What this does
 *
 * {@link holdIdleConnections} makes the server `DaprServer` listens with hold
 * an idle connection for {@link APP_CHANNEL_KEEP_ALIVE_TIMEOUT_MS} — longer
 * than any client that reaches it holds one — so the client is always the
 * side that closes. That is the rule for any server behind a pooling client:
 * its idle timeout must outlast the client's. The clients, and theirs:
 *
 * - **daprd** — 90s, measured above; at most 64 idle connections.
 * - **The edge**, for `/api/auth/*` in production — the host's nginx-proxy,
 *   whose upstream `keepalive` uses nginx's default 60s `keepalive_timeout`.
 *   Its predecessor, Caddy (2m), had the same race with the 5s default, on
 *   sign-in `POST`s.
 * - **`services/api`'s JWKS fetch** — Bun's pool, which does read the hint.
 *
 * Port 3002 is not published in production (`infra/docker-compose.prod.yml`);
 * the containers on the host's `bridge` network can reach it, but none of them
 * pools connections to it, so that list is closed. A client with a longer idle timeout would reopen
 * the race; raise this rather than lower theirs. It stays finite so a client
 * that never closes cannot hold sockets forever, and `headersTimeout` and
 * `requestTimeout` are untouched, so a connection that opens and never
 * finishes a request is still reaped.
 *
 * `DaprServer` creates the server inside `server.start()` with Express's
 * `app.listen`, and exposes no hook before it listens. So, like
 * `./actor-route-guard.ts`, this touches only our own `app` object: its
 * `listen` is replaced by Express's own two lines with one setting added.
 * Nothing inside `@dapr/dapr` is patched.
 */
import { createServer, type Server } from "node:http";
import type { Express } from "express";

/**
 * 5 minutes: above daprd's 90s and the edge's 60s, with room. Bun honours it
 * past `headersTimeout` (60s) — measured, an idle connection still open at
 * 130s — and advertises it as `Keep-Alive: timeout=300`.
 */
export const APP_CHANNEL_KEEP_ALIVE_TIMEOUT_MS = 5 * 60_000;

/** The longest idle timeout of any client listed above: daprd's 90s. */
export const LONGEST_CLIENT_IDLE_MS = 90_000;

/** Apply the app channel's connection policy to `server`. */
export const configureAppChannelServer = (server: Server): Server => {
  server.keepAliveTimeout = APP_CHANNEL_KEEP_ALIVE_TIMEOUT_MS;
  return server;
};

type Listen = (...args: unknown[]) => Server;

/**
 * Make `app.listen` create a server that outlasts its clients' idle connections. Must run
 * before `server.start()` (inside `boot()`), which is what calls it.
 *
 * Express 4's `app.listen` is `http.createServer(this)` then
 * `server.listen(...arguments)`; this is the same, with the policy applied
 * before the first connection can arrive.
 */
export const holdIdleConnections = (app: Express): void => {
  const listen: Listen = function listen(this: Express, ...args) {
    const server = configureAppChannelServer(createServer(this));
    return server.listen(...(args as Parameters<Server["listen"]>));
  };
  (app as unknown as { listen: Listen }).listen = listen;
};
