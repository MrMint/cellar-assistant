const env = (name: string, fallback: string): string =>
  process.env[name] ?? fallback;

export const config = {
  /** Port the actor host listens on; the sidecar's `--app-port`. */
  appPort: env("APP_PORT", "3002"),
  appHost: env("APP_HOST", "0.0.0.0"),
  /** The sidecar this process talks to. */
  daprHost: env("DAPR_HOST", "127.0.0.1"),
  daprPort: env("DAPR_HTTP_PORT", "3502"),
  /**
   * The sidecar's API token, presented on every call to it (`dapr-api-token`).
   * Dapr's own name: daprd reads the same variable to decide whether to
   * require one, and `@dapr/dapr`'s client reads it for the SDK's calls
   * (`Settings.getDefaultApiToken`). Empty means the sidecar requires none.
   * `docs/architecture/target-stack.md`, "Dapr API tokens".
   */
  daprApiToken: env("DAPR_API_TOKEN", ""),
  /**
   * What the sidecar presents to *this* app on every call it makes to it —
   * Dapr's `APP_API_TOKEN`, which daprd sends as `dapr-api-token`. The actor
   * routes refuse a call without it (`src/lib/dapr-app-token.ts`), so only the
   * sidecar can reach them. Empty disables the check (and says so at boot).
   */
  appApiToken: env("APP_API_TOKEN", ""),
  /**
   * §8.5: idle timeout is a runtime option, not a per-actor decision. 10 minutes
   * suits entity actors; search actors (5m) and `GeocodeActor` (24h) will need
   * this revisited when they exist.
   */
  actorIdleTimeout: env("ACTOR_IDLE_TIMEOUT", "10m"),
  actorScanInterval: env("ACTOR_SCAN_INTERVAL", "30s"),
  // Must stay below the placement dissemination timeout (30s) or daprd clamps
  // it and warns on every start.
  drainOngoingCallTimeout: env("ACTOR_DRAIN_TIMEOUT", "20s"),
} as const;

/**
 * TODO(A3/A4): `DATABASE_URL` is read here and nowhere else. `services/api` must
 * never be given one — that separation is the point of the two processes.
 */
export const databaseUrl = (): string | undefined => process.env.DATABASE_URL;
