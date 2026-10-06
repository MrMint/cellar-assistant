/**
 * The Drizzle handle better-auth writes through.
 *
 * X2: **the same database and the same pool as every actor.** A6 opened a
 * second `pg.Pool` against a second database (`auth_dev`) because A3 was still
 * rebuilding `packages/db` and the two schemas could not share one; that is
 * over. `AUTH_DATABASE_URL` now points at the main database, and in the actor
 * host `createAuth` is handed `actorDb()` directly, so better-auth's statements
 * and an actor's statements come out of one pool with one connection budget.
 *
 * `makeAuthDb` remains for the tests, which point better-auth at a throwaway
 * `auth_test_*` database that no actor is using (`./testing.ts`). It builds the
 * handle with `createDb` from `@cellar-assistant/db` rather than a bare
 * `drizzle()` so that the table objects, the operators and the client are all
 * from *one* copy of drizzle-orm — see `packages/db/src/orm.ts` for why mixing
 * two copies is a page-long type error.
 */
import { createDb, type Db } from "@cellar-assistant/db";
import type { Pool } from "pg";

export type AuthDb = Db;

export const makeAuthDb = (
  connectionString: string,
): { pool: Pool; db: Db } => {
  const db = createDb(connectionString);
  return { pool: db.$client as Pool, db };
};
