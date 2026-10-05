/**
 * The one Postgres connection in the system.
 *
 * `services/actors` is the only process that may call `createDb()`; `services/api`
 * holds no credentials (§1.5, `packages/db/README.md`). Under Dapr the pool is
 * created once, lazily, on the first actor construction. Tests never touch it:
 * the harness passes a transaction into the actor's constructor instead.
 */
import { createDb, type Db } from "@cellar-assistant/db";
import { databaseUrl } from "../config.ts";

/**
 * A Drizzle transaction — what `db.transaction(cb)` hands `cb`.
 *
 * Derived from `Db` rather than imported so it tracks the schema and the
 * drizzle version automatically.
 */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * What an actor holds. A `Tx` supports the same `select` / `insert` / `update` /
 * `delete` / `query` surface as a `Db`, and its own `.transaction()` opens a
 * savepoint — so `ActorBase.tx()` needs no branch, and the test harness can
 * substitute a rolled-back transaction for the whole database.
 *
 * The one thing a `Tx` lacks is `$client`. Nothing in an actor should want it.
 */
export type DbOrTx = Db | Tx;

let pool: Db | undefined;

/**
 * The process-wide Drizzle instance. Called by `ActorBase`'s constructor
 * default; do not call it from an actor method.
 */
export const actorDb = (): Db => {
  if (pool !== undefined) return pool;
  const url = databaseUrl();
  if (url === undefined || url === "") {
    throw new Error(
      "DATABASE_URL is not set. `services/actors` is the only process that may " +
        "hold Postgres credentials; in tests, pass a Drizzle handle as the " +
        "third constructor argument (see src/lib/testing.ts) instead of " +
        "setting this.",
    );
  }
  pool = createDb(url);
  return pool;
};

/** Close the pool on shutdown. Safe to call when none was ever opened. */
export const closeActorDb = async (): Promise<void> => {
  if (pool === undefined) return;
  const client = pool.$client;
  pool = undefined;
  await client.end();
};
