/**
 * The app channel's idle connections are closed by daprd, not by this host.
 *
 * The client below stands in for daprd **losing** the keep-alive race: it
 * sends a second request on a connection it has held idle, without having
 * noticed that the server closed it. That is what Go's pooled client does
 * when the close and the reuse land in the same instant, and it cannot replay
 * a `PUT`, so the actor call fails with `EOF` (`./app-channel-connections.ts`
 * has the measured incident). A raw socket makes the losing interleaving
 * deterministic instead of a timing coincidence.
 */
import { createServer, type Server } from "node:http";
import { connect } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import {
  APP_CHANNEL_KEEP_ALIVE_TIMEOUT_MS,
  configureAppChannelServer,
  holdIdleConnections,
  LONGEST_CLIENT_IDLE_MS,
} from "./app-channel-connections.ts";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections?.();
          server.close(() => resolve());
        }),
    ),
  );
});

const listening = (server: Server): Promise<number> =>
  new Promise((resolve) => {
    servers.push(server);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(
        typeof address === "object" && address !== null ? address.port : 0,
      );
    });
  });

const REQUEST =
  "PUT /actors/CellarActor/x/method/get HTTP/1.1\r\nHost: actors\r\n" +
  "Content-Type: application/json\r\nContent-Length: 2\r\n\r\n[]";

/**
 * One request, then `idleMs` of holding the connection without reading from
 * it, then a second request on the same connection. Resolves how many HTTP
 * responses came back on it: 2 if the server was still holding it, 1 if it
 * had closed it underneath the client.
 */
const reuseAfterIdle = (port: number, idleMs: number): Promise<number> =>
  new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    let received = "";
    let sentSecond = false;
    const responses = (): number => received.split("HTTP/1.1 ").length - 1;
    const finish = (): void => {
      socket.destroy();
      resolve(responses());
    };
    socket.on("error", () => undefined);
    socket.on("close", finish);
    socket.on("data", (chunk) => {
      received += chunk.toString("latin1");
      if (!sentSecond && responses() === 1) {
        sentSecond = true;
        setTimeout(() => {
          socket.write(REQUEST, () => undefined);
          setTimeout(finish, 1_000);
        }, idleMs);
      } else if (responses() === 2) {
        finish();
      }
    });
    socket.write(REQUEST);
  });

const answer = (_req: unknown, res: { end: (body: string) => void }): void =>
  res.end("[]");

describe("the app channel's idle connections", () => {
  it("are what the runtime's default server times out — the reason this exists", () => {
    // Bun's node:http, like Node's, defaults to closing a connection idle
    // for 5s. daprd holds one for 90s, so under the default the server
    // always closes first, on a timer the client cannot see.
    const server = createServer(answer);
    expect(server.keepAliveTimeout).toBeLessThan(LONGEST_CLIENT_IDLE_MS);
    expect(configureAppChannelServer(server).keepAliveTimeout).toBe(
      APP_CHANNEL_KEEP_ALIVE_TIMEOUT_MS,
    );
    expect(APP_CHANNEL_KEEP_ALIVE_TIMEOUT_MS).toBeGreaterThan(
      LONGEST_CLIENT_IDLE_MS,
    );
  });

  it("reproduces the lost race: a server that idles a connection out fails the reuse", async () => {
    // The same failure at a 300ms timeout instead of 5s, so it runs fast.
    const server = createServer(answer);
    server.keepAliveTimeout = 300;
    const port = await listening(server);
    expect(await reuseAfterIdle(port, 1_500)).toBe(1);
  });

  it("holdIdleConnections: app.listen's server answers a reuse after the runtime's default would have closed it", async () => {
    const app = express();
    app.put("/actors/:type/:id/method/:method", (_req, res) => {
      res.json([]);
    });
    holdIdleConnections(app);
    const held = await new Promise<{ server: Server; port: number }>(
      (resolve) => {
        const server = app.listen(0, "127.0.0.1", () => {
          const address = server.address();
          resolve({
            server,
            port:
              typeof address === "object" && address !== null
                ? address.port
                : 0,
          });
        });
      },
    );
    servers.push(held.server);
    expect(held.server.keepAliveTimeout).toBe(
      APP_CHANNEL_KEEP_ALIVE_TIMEOUT_MS,
    );

    // Side by side with an unconfigured server, across the default's
    // close: Bun acts on the 5s timeout at ~6s, so wait past both.
    const defaultPort = await listening(createServer(answer));
    const [withDefault, withHold] = await Promise.all([
      reuseAfterIdle(defaultPort, 6_500),
      reuseAfterIdle(held.port, 6_500),
    ]);
    expect(withDefault, "the runtime's default no longer times out").toBe(1);
    expect(withHold).toBe(2);
  }, 15_000);
});
