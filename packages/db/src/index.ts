/**
 * `@cellar-assistant/db` — the Drizzle schema, its RQB v2 relations, and the
 * one place a Postgres connection is opened.
 *
 * Only `services/actors` may call `createDb()`. `services/api` holds no database
 * credentials and must never import from this entry point (target-stack §1,
 * migration-plan §1.5).
 */

import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolConfig } from "pg";
import { relations } from "./schema/index.ts";

export * from "./schema/index.ts";
export * from "./writers.ts";

export type Db = ReturnType<typeof createDb>;

/**
 * Pool and session settings, and where every number comes from.
 *
 * This used to be `drizzle(connectionString, { relations })` — a bare
 * `pg.Pool`, so node-postgres' defaults: **`max: 10`** and
 * **`connectionTimeoutMillis: 0`, which means wait forever**. Those ten are
 * shared by every actor turn, the outbox drainer, and better-auth, which was
 * handed `actorDb()` directly by X2 ("one pool with one connection budget" —
 * `services/actors/src/auth/db.ts`). Under contention a turn blocked on
 * acquisition never came back on its own; the API's own 15s deadline fired
 * first and the failure was reported as `ERR_ACTOR_INVOKE_METHOD`, which reads
 * as a Dapr fault. Every value below exists to make that same failure say what
 * it is, and to bound it.
 *
 * Measured on `cellar-stack-postgres-1`, 2026-09-19 — `max_connections` 100,
 * `superuser_reserved_connections` 3, `reserved_connections` 0, so **97 usable**.
 *
 * - **`max: 20`.** Not a guess at load: the host's measured demand is single
 *   digit. `packages/e2e/playwright.config.ts` runs `workers: 1` with
 *   `fullyParallel: false`; `OutboxActor.#drainOnce` delivers its batch of 100
 *   one row at a time (`for … await`) and commits each `tx()` *before* the
 *   sidecar hop, so a delivery and the actor it wakes never hold two
 *   connections from a nested position; and nothing in `infra/` sets daprd's
 *   `--app-max-concurrency`, so there is no runtime cap to match either. 20 is
 *   headroom over that, chosen against the other side of the ledger: a full
 *   `@cellar-assistant/actors` run peaks at **27 client backends** on this same
 *   server (sampled at 1 Hz, 2026-09-19 — one `createDb` pool per test file
 *   plus `test-db.sh` on `cellar`), and 20 + 27 is under half of 97. The reason
 *   to move off 10 at all is better-auth: sign-in traffic and actor turns queue
 *   against each other in one budget of ten.
 * - **`connectionTimeoutMillis: 5_000`.** `services/api/src/dapr.ts` gives an
 *   ordinary actor call `DEFAULT_TIMEOUT_MS = 15_000`. A wait for a connection
 *   has to expire *inside* that window or the caller's `AbortSignal` fires
 *   first and pool exhaustion is reported as a Dapr invoke failure instead of
 *   `timeout exceeded when trying to connect`, which names the pool. 5s is a
 *   third of the budget, leaving 10s for the statement and the two sidecar
 *   hops. The two 120s calls (`ItemOnboardingActor.start`,
 *   `PlaceCreationActor.create`) are waiting on a model, not on a connection,
 *   so they get no larger share of this one.
 * - **`statement_timeout: 30_000`** (server-side; it is the server that holds
 *   the locks). It has to clear the slowest statement anything here legitimately
 *   issues, and the widest lane is the outbox's own
 *   `DEFAULT_DELIVERY_TIMEOUT_MS = 30_000` — bulk writes are bounded by that,
 *   the largest being the retention sweep's `RETENTION_BATCH = 5_000`. Set to
 *   the request lane's 15s instead and legitimate outbox work would be killed;
 *   at 30s a request-lane statement can outlive the 15s caller that abandoned
 *   it, which wastes a connection but is not wrong.
 * - **`idle_in_transaction_session_timeout: 60_000`.** This counts only time
 *   spent waiting on the *client*, so it is the "the client vanished mid
 *   transaction" guard, and the number only has to clear the longest legitimate
 *   gap between two statements in one transaction. `ActorBase.tx()` wraps
 *   database work and nothing else — `src/lib/no-external-calls.test.ts` is the
 *   fence — and in the harness a transaction spans a whole test, where vitest's
 *   default 5s `testTimeout` is never raised anywhere in this repo. 60s is 2x
 *   `statement_timeout`, which is as wide as this can be and still bound a
 *   failover.
 * - **`application_name`.** The point of the exercise: with it unset,
 *   `pg_stat_activity.application_name` is the empty string and a connection
 *   holding a lock cannot be attributed to anything. `PGAPPNAME` is honoured
 *   first because it is libpq's own variable and pg reads it when
 *   `application_name` is absent — setting the key unconditionally would
 *   silently take that override away from the test lane and from one-off
 *   scripts.
 * - **`keepAlive`.** `pg` 8.16.3 defaults it to `false`
 *   (`lib/client.js`: `keepAlive: c.keepAlive || false`), so a pooled socket to
 *   a primary that went away without an RST — the failover case — stays in the
 *   pool looking healthy and the next query blocks until the OS TCP timeout,
 *   which is orders of magnitude past any deadline above. 10s before the first
 *   probe is well inside `idleTimeoutMillis`, which stays at node-postgres'
 *   30_000: an idle client is dropped after 30s anyway, and that default was
 *   always the right one.
 *
 * Deliberately **not** set: `query_timeout`. It looks like the client-side twin
 * of `statement_timeout`, but when it fires `pg` neither cancels the statement
 * nor destroys the connection — `lib/client.js` replaces the query's callback
 * with a no-op, splices it out of the queue and calls `_pulseQueryQueue()`,
 * which dispatches the *next* query down the same socket while the server is
 * still executing the abandoned one. `keepAlive` covers the case it was wanted
 * for without that.
 *
 * The two `migrate:*` scripts build their own `pg.Pool` with `max: 1`
 * (`services/actors/scripts/migrate-{users,files}.ts`) and are deliberately not
 * routed through here.
 */
export const POOL_SETTINGS = {
  max: 20,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 60_000,
  application_name: process.env.PGAPPNAME ?? "cellar-actors",
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
} as const satisfies PoolConfig;

/**
 * Build the Drizzle client. `relations` is passed so Relational Queries v2
 * (`db.query.*`) is available; the schema itself is reachable through it.
 *
 * The object form of `connection` is what carries {@link POOL_SETTINGS}:
 * `drizzle(connectionString, …)` hands `new pg.Pool({ connectionString })` and
 * nothing else, so the string overload cannot express any of them.
 */
export const createDb = (connectionString: string) =>
  drizzle({
    connection: { connectionString, ...POOL_SETTINGS },
    relations,
  });
