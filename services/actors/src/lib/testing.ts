/**
 * The in-memory actor harness (A4).
 *
 * Actors are plain classes. Everything Dapr adds — placement, activation,
 * turn-based concurrency, the HTTP dispatch — is *hosting*, not behaviour, so
 * domain logic can be driven by constructing the class and calling the method.
 * No sidecar, no `docker compose up dapr`, no HTTP.
 *
 * What is **not** faked is Postgres. §1.3 makes the database the only truth, so
 * a test against a stub database tests nothing. Every test here runs against
 * the real transformed schema, inside a transaction that is always rolled back.
 *
 * ## Getting the database
 *
 * The suite owns its database. `vitest.config.ts` runs
 * `packages/db/transform/test-db.sh` before any test file loads; that builds
 * `cellar_test_template` the way a development database is built (a schema-only
 * dump of Nhost, the numbered transform files, the hand-written SQL lane, then
 * the ten reference tables from `scripts/reference-data.json`) and recreates
 * `cellar_test` from it as a template clone. `ACTORS_TEST_DATABASE_URL` defaults
 * to that database.
 *
 * It used to default to `cellar`, the development database, and that was the
 * bug: rolling every test back isolates the tests from *each other*, but a row
 * another process **commits** is visible inside a test's transaction. Three
 * separate rounds of false failures came from it, and the assertions that broke
 * are the ones that cannot be scoped — `ReferenceDataActor`'s ordering test
 * deletes the whole `wine_style` table to prove Postgres does the ordering, and
 * `RankingsActor` asserts exact aggregate counts. A red suite everyone assumes
 * is contamination is how a real regression ships unnoticed.
 *
 * `drizzle-kit migrate` **cannot** replay the introspected baseline — its SQL
 * sits inside a `/* … *\/` block and the runner splits on the statement
 * breakpoint before stripping comments, handing Postgres an unterminated
 * comment (see `packages/db/README.md`). The transform is the only build.
 *
 * ```bash
 * bun run stack:up                         # postgres on 5433
 * packages/db/transform/test-db.sh         # what vitest runs for you
 * packages/db/transform/test-db.sh --rebuild   # after an Nhost migration
 * ```
 *
 * ## Writing an actor test
 *
 * ```ts
 * const { skip } = await resolveTestDatabase();
 *
 * describe.skipIf(skip)("CellarActor", () => {
 *   afterAll(closeTestDb);
 *
 *   it("hides a PRIVATE cellar from a stranger", async () => {
 *     await withTestDb(async (db) => {
 *       const owner = await seedUser(db);
 *       const id = await seedCellar(db, { createdById: owner, privacy: "PRIVATE" });
 *       const actor = await activate(createActor(CellarActor, id, db));
 *       await expect(actor.get(userCtx(stranger, "r"))).rejects.toThrow(NotFoundError);
 *     });
 *   });
 * });
 * ```
 */
import type { Ctx } from "@cellar-assistant/contracts";
import { ActorError } from "@cellar-assistant/contracts";
import type { Db } from "@cellar-assistant/db";
import { createDb, outbox } from "@cellar-assistant/db";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { deliveryArgs } from "../actors/outbox-actor.ts";
import type { ActorBase } from "./actor-base.ts";
import type { DbOrTx } from "./db.ts";
import { isCanonicalUuid } from "./delivery.ts";
import { derivedUuid } from "./derived-uuid.ts";

/**
 * The stack's Postgres (`infra/docker-compose.yml`), holding the transformed
 * baseline. Not Nhost's, which is on 5432 and is read-only reference.
 *
 * The database name is deliberately **not** `cellar`: see the header. A URL
 * whose database name starts with `cellar_test` is one the test run owns and
 * `test-db.sh` will drop and recreate; any other name is assumed to be built and
 * managed by whoever set the variable, and is left alone.
 */
export const testDatabaseUrl = (): string =>
  process.env.ACTORS_TEST_DATABASE_URL ??
  "postgres://cellar:cellar@localhost:5433/cellar_test";

/** The database name in `url`, or `undefined` if it names none. */
export const testDatabaseName = (
  url = testDatabaseUrl(),
): string | undefined => {
  const name = new URL(url).pathname.replace(/^\//, "");
  return name === "" ? undefined : name;
};

let db: Db | undefined;

/** The shared pool. One per test file; close it in `afterAll`. */
export const testDb = (): Db => {
  db ??= createDb(testDatabaseUrl());
  return db;
};

export const closeTestDb = async (): Promise<void> => {
  if (db === undefined) return;
  const client = db.$client;
  db = undefined;
  await client.end();
};

const SETUP = [
  "  bun run stack:up",
  "  packages/db/transform/test-db.sh",
  "",
  "`drizzle-kit migrate` cannot replay the introspected baseline; the",
  "transform is how a development database is built (packages/db/README.md).",
  "vitest.config.ts runs test-db.sh for you, so reaching this message usually",
  "means Docker or the compose stack is down. Set ACTORS_TEST_DATABASE_URL to",
  "point somewhere else if you meant to.",
].join("\n");

/**
 * Decide, once per test file, whether the database is usable.
 *
 * Unreachable or un-transformed is **always a failure**: a silently skipped
 * suite is how a test stops being evidence, and a green check that ran fewer
 * tests than it claims is worse than no check at all. There used to be an
 * `ACTORS_TEST_DB_OPTIONAL=1` escape hatch that turned this into a skip —
 * CI set it because it could not build the database yet, which hid 589
 * database-backed tests behind a passing suite (X4). CI now builds a real
 * database (see `.github/workflows/stack-ci.yaml` and
 * `packages/db/transform/README.md`'s checked-in baseline), so there is no
 * longer a legitimate reason for this to skip anywhere: the return type keeps
 * the `{ skip, reason }` shape the 47 call sites already destructure, but
 * `skip` is now always `false` when this resolves at all — it never resolves
 * `true`.
 */
export const resolveTestDatabase = async (): Promise<{
  skip: boolean;
  reason: string | null;
}> => {
  let reason: string | null = null;
  try {
    const probe = createDb(testDatabaseUrl());
    try {
      await probe.execute(sql`select 1 from public.cellars limit 0`);
    } finally {
      await probe.$client.end();
    }
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
  }

  if (reason === null) return { skip: false, reason: null };

  throw new Error(
    `No transformed database at ${testDatabaseUrl()}: ${reason}\n\n${SETUP}`,
  );
};

/**
 * Run `fn` inside a transaction that is **always** rolled back.
 *
 * This is the isolation mechanism: no truncation, no per-test database, no
 * ordering constraints between test files. The handle `fn` receives is a
 * transaction, and an actor given it opens savepoints rather than real
 * transactions — so `ActorBase.tx()` behaves identically and commits nothing.
 */
export const withTestDb = async <T>(
  fn: (db: DbOrTx) => Promise<T>,
): Promise<T> => {
  const rollback = Symbol("harness rollback");
  let result: T | undefined;
  let captured = false;
  try {
    await testDb().transaction(async (tx) => {
      result = await fn(tx);
      captured = true;
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  if (!captured) throw new Error("withTestDb: callback did not complete");
  return result as T;
};

/**
 * Construct an actor as a plain class.
 *
 * The `DaprClient` opens no connection when constructed, and nothing in an
 * actor built on `ActorBase` reaches the sidecar: the state manager is
 * forbidden (§1.3) and cross-actor calls go through the outbox (§8.5). If a
 * test ever hangs here, an actor is calling the sidecar and that is the bug.
 */
export const createActor = <TActor extends ActorBase>(
  Actor: new (client: DaprClient, id: ActorId, db: DbOrTx) => TActor,
  id: string,
  actorDb: DbOrTx,
): TActor =>
  new Actor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(id),
    actorDb,
  );

/** Run the activation hook, as Dapr would before the first method call. */
export const activate = async <TActor extends ActorBase>(
  actor: TActor,
): Promise<TActor> => {
  await actor.onActivate();
  return actor;
};

/* -------------------------------------------------------------------------- */
/* Concealment                                                                 */
/* -------------------------------------------------------------------------- */

/** What a caller is told when refused: the wire envelope's two fields. */
export type Refusal = { readonly code: string; readonly message: string };

/**
 * The `{ code, message }` `call` is refused with, every occurrence of `id`
 * replaced by `<id>` — so a refusal about a real row and one about an id that
 * names nothing can be compared byte for byte, which is the only comparison
 * that proves neither is an existence oracle (`services/api` hands the
 * message to the client verbatim). Throws if `call` resolves, or rejects with
 * anything but a typed `ActorError`.
 */
export const refusalOf = async (
  call: () => Promise<unknown>,
  id: string,
): Promise<Refusal> => {
  try {
    await call();
  } catch (error) {
    if (!(error instanceof ActorError)) throw error;
    return { code: error.code, message: error.message.replaceAll(id, "<id>") };
  }
  throw new Error("expected a refusal; the call resolved");
};

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

let seq = 0;
const unique = (): string => {
  seq += 1;
  return `${Date.now().toString(36)}-${seq}`;
};

/**
 * A user row, for the 31 application tables with a foreign key to the identity
 * table.
 *
 * That table is better-auth's `user` since X2 — one identity row, in this
 * database, written here by the harness the same way better-auth writes it. It
 * used to be `auth.users`, which also meant seeding an `auth.roles` row first
 * because `default_role` was a foreign key into a table the schema-only dump
 * left empty. Both of those are gone: the promise the old comment made ("when
 * that FK is repointed, this helper changes and nothing that calls it has to")
 * is what this edit is.
 *
 * No `account` row is created. Nothing an actor does looks at credentials —
 * sign-in is `services/actors/src/auth`'s, and it has its own scratch databases.
 */
export const seedUser = async (
  tx: DbOrTx,
  overrides: { id?: string; displayName?: string; email?: string } = {},
): Promise<string> => {
  const suffix = unique();
  const displayName = overrides.displayName ?? `Test ${suffix}`;
  const email = overrides.email ?? `test-${suffix}@example.test`;
  const rows = await tx.execute<{ id: string }>(sql`
    insert into "user" (id, name, email, locale)
    values (
      coalesce(${overrides.id ?? null}::uuid, gen_random_uuid()),
      ${displayName}, ${email}, 'en'
    )
    returning id
  `);
  const id = rows.rows[0]?.id;
  if (id === undefined) throw new Error("seedUser: no id returned");
  return id;
};

/* -------------------------------------------------------------------------- */
/* Deliveries                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The ctx `OutboxActor` delivers row `outboxId` with on the attempt after
 * `attempts` failures — built by the drainer's own `deliveryArgs`, so a test
 * standing in for the outbox hands its target exactly what production would.
 * `outboxId` must be a canonical uuid (`isWellFormedDelivery`), and need not
 * name a real row unless the code under test reads it.
 */
export const deliveryCtx = (outboxId: string, attempts = 0): Ctx =>
  deliveryArgs({ id: outboxId, attempts, payload: undefined })[0];

/**
 * {@link deliveryCtx} for a test that names its delivery with a label
 * (`"row-1"`, `"b0"`) rather than a uuid: the same label is the same
 * delivery, so a redelivery is `testDelivery("row-1")` twice. A label that is
 * already a canonical uuid is used as the row id unchanged.
 */
export const testDelivery = (label: string, attempts = 0): Ctx =>
  deliveryCtx(
    isCanonicalUuid(label) ? label : derivedUuid("test-outbox-row", label),
    attempts,
  );

/**
 * `ctx` — a user's, an admin's, an anonymous request's — **claiming** to be
 * delivery `outboxId`: the old `x-request-id: outbox:<uuid>` spoof, restated
 * for the field that replaced the prefix. The wire boundary refuses this shape
 * (`isWellFormedCtx`); a test uses it to prove the in-process readers
 * (`deliveryOf`, `causedByOf`) refuse it too.
 */
export const claimingDelivery = (ctx: Ctx, outboxId: string): Ctx => {
  const claimed = deliveryCtx(outboxId);
  return {
    ...ctx,
    ...(claimed.delivery === undefined ? {} : { delivery: claimed.delivery }),
    causedBy: outboxId,
  };
};

/**
 * Writes an `outbox` row for **any** pair, declared or not, with none of
 * `enqueueOutbox`'s typing — for tests of the drainer's own refusals, of
 * probes and of compensations, which the typed handles in
 * `./outbox-targets.ts` (correctly) cannot name. Test-only: the writers scan
 * and the outbox allow-list scan both skip `*testing.ts`, and a production
 * module that imported this would be importing the test harness.
 */
export const insertOutboxRowForTest = async (
  db: DbOrTx,
  row: {
    readonly targetActor: string;
    readonly targetId: string;
    readonly method: string;
    readonly payload?: unknown;
    readonly delayMs?: number;
  },
): Promise<string> => {
  const [inserted] = await db
    .insert(outbox)
    .values({
      targetActor: row.targetActor,
      targetId: row.targetId,
      method: row.method,
      payload: row.payload ?? {},
      runAfter:
        row.delayMs === undefined
          ? sql`now()`
          : sql`now() + make_interval(secs => ${row.delayMs / 1000}::double precision)`,
    })
    .returning({ id: outbox.id });
  if (inserted === undefined) throw new Error("insertOutboxRowForTest: no row");
  return inserted.id;
};
