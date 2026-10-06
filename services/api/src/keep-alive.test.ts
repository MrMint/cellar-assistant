/**
 * The API outlasts the idle connections of whatever sits in front of it.
 * Why, and what was measured: `API_KEEP_ALIVE_TIMEOUT_MS` in `yoga.ts`.
 */
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import {
  API_KEEP_ALIVE_TIMEOUT_MS,
  type ApiYoga,
  createApiServer,
} from "./yoga.ts";

/**
 * The longest upstream idle timeout of any proxy that has sat in front of the
 * API: Caddy's `reverse_proxy` default (2m). Its successor, the host's
 * nginx-proxy, keeps upstream connections for nginx's default
 * `keepalive_timeout` of 60s (the template sets `keepalive` and no timeout),
 * so holding above 2m covers both.
 */
const PROXY_UPSTREAM_IDLE_MS = 2 * 60_000;

describe("the API server's idle keep-alive connections", () => {
  it("are held longer than the edge proxy holds its end", () => {
    const server = createApiServer((() => undefined) as unknown as ApiYoga);
    expect(server.keepAliveTimeout).toBe(API_KEEP_ALIVE_TIMEOUT_MS);
    expect(API_KEEP_ALIVE_TIMEOUT_MS).toBeGreaterThan(PROXY_UPSTREAM_IDLE_MS);
  });

  it("would not be under the runtime's default", () => {
    // The reason the setting exists: left alone, the server closes first.
    expect(createServer().keepAliveTimeout).toBeLessThan(
      PROXY_UPSTREAM_IDLE_MS,
    );
  });
});
