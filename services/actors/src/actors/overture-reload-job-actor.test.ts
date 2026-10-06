/**
 * `OvertureReloadJobActor` — C4b's acceptance (§2.6, §8.4, §8.5).
 *
 * The four properties the workstream is judged on, each with its own test:
 *
 *  - **idempotent** — running the same reload twice writes nothing the second
 *    time. Not "produces no duplicates": *zero rows touched*, `updated_at`
 *    included, which the `IS DISTINCT FROM` guard in
 *    `PlaceActor.bulkUpsertFromOverture` is what buys;
 *  - **resumable** — the actor is thrown away mid-chain and rebuilt from the
 *    persisted cursor, exactly as a restarted host does. Nothing is
 *    reprocessed and nothing is skipped;
 *  - **a malformed row does not poison its batch** — the good rows around it
 *    still land, it is counted, and the cursor still walks past it;
 *  - **non-destructive** — a place a *user* created keeps its row and every one
 *    of its columns, even when the reload carries its `overture_id`.
 *
 * Plus the one C4b's statement names explicitly: **it refuses to start
 * unconfigured**, and leaves no `jobs` row behind when it does.
 *
 * The upserter is the real `PlaceActor` running in-process on this test's own
 * transaction — `place-creation-actor.test.ts`'s `inProcessCreator` exactly —
 * so every assertion below is against rows Postgres actually holds. The
 * *source* is a fake; `lib/overture.test.ts` covers the BigQuery client, and
 * nothing in either file reaches the network.
 */
import { randomUUID } from "node:crypto";
import type { Ctx } from "@cellar-assistant/contracts";
import {
  actorMethodTimeout,
  adminCtx,
  ConflictError,
  ForbiddenError,
  OvertureReloadJobActorDescriptor,
  PLACE_BULK_ACTOR_ID,
  PlaceActorDescriptor,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { jobs, outbox, places } from "@cellar-assistant/db";
import { and, eq, inArray, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type {
  OvertureBatch,
  OverturePlaceSource,
  OvertureSourceRow,
} from "../lib/overture.ts";
import {
  MAX_OVERTURE_TIMEOUT_MS,
  OVERTURE_BATCH_MARGIN_MS,
} from "../lib/overture.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  testDelivery,
  withTestDb,
} from "../lib/testing.ts";
import { BATCH_BUDGET_MARGIN_MS } from "./job-actor/index.ts";
import type {
  OvertureSourceResolver,
  OvertureUpserter,
} from "./overture-reload-job-actor.ts";
import { OvertureReloadJobActor } from "./overture-reload-job-actor.ts";
import { PlaceActor } from "./place-actor.ts";

const daprClient = () =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

/**
 * The production seam, wired in-process: one `PlaceActor` at the reserved bulk
 * key, sharing this test's transaction. §8.5's `job → entity` edge with the
 * sidecar taken out.
 */
const inProcessUpserter =
  (db: DbOrTx, calls: number[] = []): OvertureUpserter =>
  async (ctx, input) => {
    calls.push(input.places.length);
    const actor = await activate(
      new PlaceActor(daprClient(), new ActorId(PLACE_BULK_ACTOR_ID), db),
    );
    return actor.bulkUpsertFromOverture(ctx, input);
  };

/* -------------------------------------------------------------------------- */
/* A fake source: a fixed table of rows, walked by keyset like the real one     */
/* -------------------------------------------------------------------------- */

const row = (
  id: string,
  overrides: Partial<Record<string, unknown>> = {},
): OvertureSourceRow => ({
  overture_id: id,
  name: `Place ${id}`,
  primary_category: "wine_bar",
  categories: ["wine_bar"],
  confidence: "0.9",
  latitude: "37.7749",
  longitude: "-122.4194",
  address_freeform: "1 Market St",
  address_locality: "San Francisco",
  address_region: "CA",
  address_postcode: "94105",
  address_country: "US",
  phone: null,
  website: null,
  ...overrides,
});

type FakeSource = OverturePlaceSource & {
  readonly pages: OvertureBatch[];
  readonly fetches: { after: string | null; limit: number }[];
};

/** Keyset over an in-memory table, ordered by `overture_id`, like BigQuery. */
const fakeSource = (rows: readonly OvertureSourceRow[]): FakeSource => {
  const sorted = [...rows].sort((a, b) =>
    String(a.overture_id) < String(b.overture_id) ? -1 : 1,
  );
  const pages: OvertureBatch[] = [];
  const fetches: { after: string | null; limit: number }[] = [];
  return {
    name: "fake:overture",
    pages,
    fetches,
    async fetchBatch({ after, limit }) {
      fetches.push({ after, limit });
      const start =
        after === null
          ? 0
          : sorted.findIndex((r) => String(r.overture_id) > after);
      const slice = start === -1 ? [] : sorted.slice(start, start + limit);
      const last = slice.at(-1);
      const batch: OvertureBatch = {
        rows: slice,
        lastId: last === undefined ? null : String(last.overture_id),
        hasMore: slice.length === limit,
      };
      pages.push(batch);
      return batch;
    },
  };
};

const resolver =
  (source: OverturePlaceSource | null): OvertureSourceResolver =>
  () =>
    source;

const jobActor = (
  db: DbOrTx,
  id: string,
  source: OverturePlaceSource | null,
  upsert?: OvertureUpserter,
) =>
  activate(
    new OvertureReloadJobActor(
      daprClient(),
      new ActorId(id),
      db,
      upsert ?? inProcessUpserter(db),
      resolver(source),
    ),
  );

const delivery = (jobId: string): Ctx => testDelivery(jobId);

/** Drive the whole chain the way `OutboxActor` would, one batch per turn. */
const runToCompletion = async (
  db: DbOrTx,
  jobId: string,
  source: OverturePlaceSource,
  options: { rebuildEachBatch?: boolean; maxTurns?: number } = {},
): Promise<number> => {
  const maxTurns = options.maxTurns ?? 25;
  let actor = await jobActor(db, jobId, source);
  for (let turn = 0; turn < maxTurns; turn += 1) {
    const result = await actor.runBatch(delivery(jobId));
    if (!result.ran || result.done) return turn + 1;
    // A restarted host is a fresh activation reading the persisted cursor.
    if (options.rebuildEachBatch === true) {
      actor = await jobActor(db, jobId, source);
    }
  }
  throw new Error(`chain did not finish in ${maxTurns} turns`);
};

const placeRows = async (db: DbOrTx, ids: readonly string[]) =>
  db
    .select({
      overtureId: places.overtureId,
      name: places.name,
      source: places.source,
      isActive: places.isActive,
      updatedAt: places.updatedAt,
      firstCachedReason: places.firstCachedReason,
    })
    .from(places)
    .where(inArray(places.overtureId, [...ids]))
    .orderBy(places.overtureId);

const cursorOf = async (db: DbOrTx, jobId: string) => {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (job === undefined) throw new Error(`job ${jobId} not found`);
  return job;
};

/** A distinctive id prefix per test, so nothing collides in a shared table. */
const ids = (n: number): string[] => {
  const prefix = randomUUID().slice(0, 8);
  return Array.from(
    { length: n },
    (_, i) => `${prefix}-${String(i).padStart(3, "0")}`,
  );
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("OvertureReloadJobActor (C4b)", () => {
  afterAll(closeTestDb);

  /* ---------------------------------------------------------------------- */
  /* Refusing to start                                                       */
  /* ---------------------------------------------------------------------- */

  it("refuses to start with no source installed, and leaves no job row", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const id = randomUUID();
      const actor = await jobActor(db, id, null);

      await expect(actor.start(adminCtx(admin, "req"), {})).rejects.toThrow(
        ConflictError,
      );
      const rows = await db.select().from(jobs).where(eq(jobs.id, id));
      expect(rows).toEqual([]);
    });
  });

  it("is admin-only to start", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const actor = await jobActor(db, randomUUID(), fakeSource([]));
      await expect(actor.start(userCtx(user, "req"), {})).rejects.toThrow(
        ForbiddenError,
      );
    });
  });

  it("refuses a payload that names a user (target-stack §7)", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const actor = await jobActor(db, randomUUID(), fakeSource([]));
      await expect(
        actor.start(adminCtx(admin, "req"), {
          userId: admin,
        } as unknown as Record<string, never>),
      ).rejects.toThrow(ValidationError);
    });
  });

  it("schedules its first batch in the same transaction as the job row", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const id = randomUUID();
      const actor = await jobActor(db, id, fakeSource([]));
      await actor.start(adminCtx(admin, "req"), {});

      const scheduled = await db
        .select()
        .from(outbox)
        .where(and(eq(outbox.targetId, id), eq(outbox.method, "runBatch")));
      expect(scheduled).toHaveLength(1);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* The walk                                                                */
  /* ---------------------------------------------------------------------- */

  it("loads every source row across a chain of batches", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const keys = ids(7);
      const source = fakeSource(keys.map((k) => row(k)));
      const jobId = randomUUID();

      const actor = await jobActor(db, jobId, source);
      await actor.start(adminCtx(admin, "req"), { batchSize: 3 });
      await runToCompletion(db, jobId, source);

      const rows = await placeRows(db, keys);
      expect(rows.map((r) => r.overtureId)).toEqual(keys);
      expect(rows.every((r) => r.source === "overture")).toBe(true);
      expect(
        rows.every((r) => r.firstCachedReason === "overture_bulk_reload"),
      ).toBe(true);

      const job = await cursorOf(db, jobId);
      expect(job.status).toBe("completed");
      expect(job.processed).toBe(7);
      const cursor = job.cursor as {
        value: { inserted: number; fetched: number };
      };
      expect(cursor.value.inserted).toBe(7);
      expect(cursor.value.fetched).toBe(7);
      // 3 + 3 + 1: the last page is short, so the chain stops without an
      // extra empty fetch.
      expect(source.fetches.map((f) => f.limit)).toEqual([3, 3, 3]);
    });
  });

  it("honours maxPlaces and stops mid-table", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const keys = ids(10);
      const source = fakeSource(keys.map((k) => row(k)));
      const jobId = randomUUID();

      const actor = await jobActor(db, jobId, source);
      await actor.start(adminCtx(admin, "req"), { batchSize: 4, maxPlaces: 6 });
      await runToCompletion(db, jobId, source);

      const rows = await placeRows(db, keys);
      expect(rows).toHaveLength(6);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Idempotency (§8.4)                                                      */
  /* ---------------------------------------------------------------------- */

  it("running the same reload twice writes nothing the second time", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const keys = ids(5);
      const source = fakeSource(keys.map((k) => row(k)));

      const first = randomUUID();
      await (await jobActor(db, first, source)).start(adminCtx(admin, "a"), {
        batchSize: 2,
      });
      await runToCompletion(db, first, source);
      const before = await placeRows(db, keys);

      const second = randomUUID();
      await (await jobActor(db, second, source)).start(adminCtx(admin, "b"), {
        batchSize: 2,
      });
      await runToCompletion(db, second, source);
      const after = await placeRows(db, keys);

      // Byte-for-byte, `updated_at` included: the DO UPDATE's IS DISTINCT FROM
      // guard means the statement matched five rows and wrote none of them.
      expect(after).toEqual(before);

      const job = await cursorOf(db, second);
      const cursor = job.cursor as {
        value: { inserted: number; updated: number; unchanged: number };
      };
      expect(cursor.value).toMatchObject({
        inserted: 0,
        updated: 0,
        unchanged: 5,
      });
    });
  });

  it("updates only the rows whose source values actually changed", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const keys = ids(3);
      const first = fakeSource(keys.map((k) => row(k)));
      const jobA = randomUUID();
      await (await jobActor(db, jobA, first)).start(adminCtx(admin, "a"), {});
      await runToCompletion(db, jobA, first);

      const renamed = fakeSource([
        row(keys[0] ?? "", { name: "Renamed" }),
        row(keys[1] ?? ""),
        row(keys[2] ?? ""),
      ]);
      const jobB = randomUUID();
      await (await jobActor(db, jobB, renamed)).start(adminCtx(admin, "b"), {});
      await runToCompletion(db, jobB, renamed);

      const rows = await placeRows(db, keys);
      expect(rows[0]?.name).toBe("Renamed");
      const cursor = (await cursorOf(db, jobB)).cursor as {
        value: { updated: number; unchanged: number };
      };
      expect(cursor.value).toMatchObject({ updated: 1, unchanged: 2 });
    });
  });

  it("drops an at-least-once redelivery of a batch already processed", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const keys = ids(4);
      const source = fakeSource(keys.map((k) => row(k)));
      const jobId = randomUUID();
      const sizes: number[] = [];
      const actor = await jobActor(
        db,
        jobId,
        source,
        inProcessUpserter(db, sizes),
      );

      await actor.start(adminCtx(admin, "req"), { batchSize: 2 });
      await actor.runBatch(delivery(jobId), { batch: 0 });
      const replay = await actor.runBatch(delivery(jobId), { batch: 0 });

      expect(replay).toEqual({ ran: false, reason: "duplicate" });
      expect(sizes).toEqual([2]);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Resumability                                                            */
  /* ---------------------------------------------------------------------- */

  it("resumes from the persisted cursor after the host is thrown away", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const keys = ids(9);
      const source = fakeSource(keys.map((k) => row(k)));
      const jobId = randomUUID();

      await (await jobActor(db, jobId, source)).start(adminCtx(admin, "req"), {
        batchSize: 2,
      });
      // Every batch runs on a brand-new activation, which is what a restarted
      // actor host is: nothing survives but the `jobs` row.
      await runToCompletion(db, jobId, source, { rebuildEachBatch: true });

      const rows = await placeRows(db, keys);
      expect(rows.map((r) => r.overtureId)).toEqual(keys);

      // Every fetch asked for a strictly later cursor: nothing was re-read and
      // nothing fell between two batches.
      const cursors = source.fetches.map((f) => f.after);
      expect(cursors[0]).toBeNull();
      for (let i = 1; i < cursors.length; i += 1) {
        expect(String(cursors[i])).toBe(keys[i * 2 - 1]);
      }
      expect((await cursorOf(db, jobId)).processed).toBe(9);
    });
  });

  it("replays the same page after a failed batch, and the replay is a no-op", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const keys = ids(4);
      const source = fakeSource(keys.map((k) => row(k)));
      const jobId = randomUUID();

      // The upsert commits, then the turn dies before the cursor advances —
      // the one crash window the two-actor transaction boundary leaves open.
      let explode = true;
      const flaky: OvertureUpserter = async (ctx, input) => {
        const result = await inProcessUpserter(db)(ctx, input);
        if (explode) {
          explode = false;
          throw new Error("host died after the upsert committed");
        }
        return result;
      };

      const actor = await jobActor(db, jobId, source, flaky);
      await actor.start(adminCtx(admin, "req"), { batchSize: 2 });
      await expect(actor.runBatch(delivery(jobId))).rejects.toThrow(
        "host died",
      );

      const afterCrash = await placeRows(db, keys.slice(0, 2));
      expect(afterCrash).toHaveLength(2);
      expect((await cursorOf(db, jobId)).processed).toBe(0);

      await runToCompletion(db, jobId, source);

      // The replayed page changed nothing, and the whole table still landed.
      expect(await placeRows(db, keys.slice(0, 2))).toEqual(afterCrash);
      expect(await placeRows(db, keys)).toHaveLength(4);
      const cursor = (await cursorOf(db, jobId)).cursor as {
        value: { inserted: number; unchanged: number };
      };
      expect(cursor.value).toMatchObject({ inserted: 2, unchanged: 2 });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Malformed rows                                                          */
  /* ---------------------------------------------------------------------- */

  it("a malformed row does not poison its batch and does not stall the walk", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const keys = ids(4);
      const source = fakeSource([
        row(keys[0] ?? ""),
        // `name: null` and a latitude the old code would have turned into NaN.
        row(keys[1] ?? "", { name: null }),
        row(keys[2] ?? "", { latitude: "not a number" }),
        row(keys[3] ?? ""),
      ]);
      const jobId = randomUUID();

      await (await jobActor(db, jobId, source)).start(adminCtx(admin, "req"), {
        batchSize: 2,
      });
      await runToCompletion(db, jobId, source);

      const rows = await placeRows(db, keys);
      expect(rows.map((r) => r.overtureId)).toEqual([keys[0], keys[3]]);

      const job = await cursorOf(db, jobId);
      expect(job.status).toBe("completed");
      const cursor = job.cursor as {
        value: { rejected: number; inserted: number; fetched: number };
      };
      expect(cursor.value).toMatchObject({
        rejected: 2,
        inserted: 2,
        fetched: 4,
      });
    });
  });

  it("a whole page of rejects still advances the cursor", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const keys = ids(4);
      const source = fakeSource([
        row(keys[0] ?? "", { name: "" }),
        row(keys[1] ?? "", { name: "" }),
        row(keys[2] ?? ""),
        row(keys[3] ?? ""),
      ]);
      const jobId = randomUUID();

      await (await jobActor(db, jobId, source)).start(adminCtx(admin, "req"), {
        batchSize: 2,
      });
      await runToCompletion(db, jobId, source);

      expect(source.fetches.map((f) => f.after)).toEqual([
        null,
        keys[1],
        keys[3],
      ]);
      expect(await placeRows(db, keys)).toHaveLength(2);
    });
  });

  it("stops the chain once maxRejected is exceeded", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const keys = ids(6);
      const source = fakeSource(keys.map((k) => row(k, { name: null })));
      const jobId = randomUUID();

      await (await jobActor(db, jobId, source)).start(adminCtx(admin, "req"), {
        batchSize: 2,
        maxRejected: 1,
      });
      await runToCompletion(db, jobId, source);

      const job = await cursorOf(db, jobId);
      expect(job.status).toBe("completed");
      const cursor = job.cursor as { value: { stopped?: string | null } };
      expect(cursor.value.stopped).toContain("over the 1 allowed");
      // It gave up after the first page rather than grinding the whole table.
      expect(source.fetches).toHaveLength(1);
    });
  });

  it("fails loudly when the source returns rows but no keyset key", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const jobId = randomUUID();
      const broken: OverturePlaceSource = {
        name: "broken",
        fetchBatch: async () => ({
          rows: [row("x")],
          lastId: null,
          hasMore: true,
        }),
      };
      const actor = await jobActor(db, jobId, broken);
      await actor.start(adminCtx(admin, "req"), {});
      await expect(actor.runBatch(delivery(jobId))).rejects.toThrow(
        /cannot produce a keyset key/,
      );
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Non-destructive                                                         */
  /* ---------------------------------------------------------------------- */

  it("never overwrites a place a user created, even on an overture_id match", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const [key] = ids(1);
      if (key === undefined) throw new Error("no key");

      const [mine] = await db
        .insert(places)
        .values({
          name: "My Secret Bar",
          categories: ["wine_bar"],
          location: { lng: -1, lat: 1 },
          overtureId: key,
          source: "user",
          createdBy: admin,
          isVerified: true,
          description: "mine",
        })
        .returning({ id: places.id, updatedAt: places.updatedAt });
      if (mine === undefined) throw new Error("seed failed");

      const source = fakeSource([row(key, { name: "Overture Name" })]);
      const jobId = randomUUID();
      await (await jobActor(db, jobId, source)).start(
        adminCtx(admin, "req"),
        {},
      );
      await runToCompletion(db, jobId, source);

      const [after] = await db
        .select()
        .from(places)
        .where(eq(places.id, mine.id));
      expect(after?.name).toBe("My Secret Bar");
      expect(after?.source).toBe("user");
      expect(after?.isVerified).toBe(true);
      expect(after?.description).toBe("mine");
      expect(after?.updatedAt).toEqual(mine.updatedAt);

      const cursor = (await cursorOf(db, jobId)).cursor as {
        value: { skipped: number; inserted: number };
      };
      expect(cursor.value).toMatchObject({ skipped: 1, inserted: 0 });
    });
  });

  it("leaves last_sync_at alone, so the Google refresh still sees the place as stale", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const [key] = ids(1);
      if (key === undefined) throw new Error("no key");
      const source = fakeSource([row(key)]);
      const jobId = randomUUID();

      await (await jobActor(db, jobId, source)).start(
        adminCtx(admin, "req"),
        {},
      );
      await runToCompletion(db, jobId, source);

      const [created] = await db
        .select({ id: places.id, lastSyncAt: places.lastSyncAt })
        .from(places)
        .where(eq(places.overtureId, key));
      expect(created?.lastSyncAt).toBeNull();

      // And a second pass over an already-enriched place does not clear it.
      await db
        .update(places)
        .set({ lastSyncAt: sql`now()` })
        .where(eq(places.overtureId, key));
      const renamed = fakeSource([row(key, { name: "Changed" })]);
      const second = randomUUID();
      await (await jobActor(db, second, renamed)).start(
        adminCtx(admin, "b"),
        {},
      );
      await runToCompletion(db, second, renamed);

      const [after] = await db
        .select({ name: places.name, lastSyncAt: places.lastSyncAt })
        .from(places)
        .where(eq(places.overtureId, key));
      expect(after?.name).toBe("Changed");
      expect(after?.lastSyncAt).not.toBeNull();
    });
  });

  /* ---------------------------------------------------------------------- */
  /* The bulk key                                                            */
  /* ---------------------------------------------------------------------- */

  it("PlaceActor.bulkUpsertFromOverture runs only at the reserved key", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(
        new PlaceActor(daprClient(), new ActorId(randomUUID()), db),
      );
      await expect(
        actor.bulkUpsertFromOverture(systemCtx("t"), { places: [] }),
      ).rejects.toThrow(ValidationError);
    });
  });

  it("PlaceActor.bulkUpsertFromOverture is not reachable from a request", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const actor = await activate(
        new PlaceActor(daprClient(), new ActorId(PLACE_BULK_ACTOR_ID), db),
      );
      await expect(
        actor.bulkUpsertFromOverture(userCtx(user, "req"), { places: [] }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  it("collapses a repeated overture_id inside one page instead of erroring", async () => {
    await withTestDb(async (db) => {
      const [key] = ids(1);
      if (key === undefined) throw new Error("no key");
      const actor = await activate(
        new PlaceActor(daprClient(), new ActorId(PLACE_BULK_ACTOR_ID), db),
      );
      const place = {
        overtureId: key,
        name: "First",
        categories: ["wine_bar"],
        location: { lng: -122.4, lat: 37.7 },
        confidence: 0.5,
        streetAddress: null,
        locality: null,
        region: null,
        postcode: null,
        countryCode: null,
        phone: null,
        website: null,
      };
      // Postgres raises 21000 ("ON CONFLICT DO UPDATE command cannot affect row
      // a second time") if both reach the statement.
      const result = await actor.bulkUpsertFromOverture(systemCtx("t"), {
        places: [place, { ...place, name: "Second" }],
      });
      expect(result).toMatchObject({
        received: 1,
        inserted: 1,
        duplicatesCollapsed: 1,
      });
      const [stored] = await db
        .select({ name: places.name })
        .from(places)
        .where(eq(places.overtureId, key));
      expect(stored?.name).toBe("Second");
    });
  });
});

describe("OvertureReloadJobActor's delivery timeout", () => {
  it("holds one BigQuery page and one bulk upsert, which is all a batch does", () => {
    // A batch is one `fetchBatch` (bounded by OVERTURE_TIMEOUT_MS) and one
    // `bulkUpsertFromOverture`. The outbox waits for `runBatch` as long as the
    // descriptor says; if that were the 15s default, every slow page was
    // aborted, retried and duplicated. Checked at the *largest* page timeout
    // `readOvertureConfig` accepts, not the 120s default: the env var had no
    // ceiling, so any value past ~175s outran the delivery.
    expect(
      actorMethodTimeout(OvertureReloadJobActorDescriptor, "runBatch") -
        BATCH_BUDGET_MARGIN_MS,
    ).toBeGreaterThanOrEqual(
      MAX_OVERTURE_TIMEOUT_MS +
        actorMethodTimeout(PlaceActorDescriptor, "bulkUpsertFromOverture"),
    );
    // The ceiling restates the job framework's margin rather than importing
    // it (lib/overture.ts says why), so it must not drift from it.
    expect(OVERTURE_BATCH_MARGIN_MS).toBe(BATCH_BUDGET_MARGIN_MS);
  });
});
