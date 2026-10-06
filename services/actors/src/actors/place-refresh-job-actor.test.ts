/**
 * `PlaceRefreshJobActor` — C4's staleness walk (§2.6, §8.4).
 *
 * What this suite is for, beyond "it refreshed something":
 *
 *  - **the chain is driven by outbox rows, one per batch**, and the assertions
 *    on those rows are scoped to *this* job's id. An auditor caught B8's suite
 *    asserting a global `outbox` row count and going flaky against the shared
 *    database; nothing here counts a row it did not create.
 *  - **a redelivery does not double any effect.** `runBatch` is called twice
 *    with the same batch number and the refresher records every call it gets.
 *  - **a crash mid-chain resumes.** The actor is thrown away between batches
 *    and rebuilt from the persisted cursor, which is exactly what a restarted
 *    host does.
 *  - **cancel stops it at the next batch**, per §2.6.
 *  - **nothing reaches a live service.** The refresher is injected; the
 *    production default is a sidecar hop and is never constructed here.
 */
import { randomUUID } from "node:crypto";
import type {
  Ctx,
  EnrichFromGoogleResult,
  ReserveInput,
} from "@cellar-assistant/contracts";
import {
  actorMethodTimeout,
  adminCtx,
  BUDGET_ACTOR_ID,
  ForbiddenError,
  PLACE_REFRESH_BATCH_SIZE,
  PlaceRefreshJobActorDescriptor,
  userCtx,
} from "@cellar-assistant/contracts";
import { apiUsageLog, files, jobs, outbox, places } from "@cellar-assistant/db";
import { and, eq, inArray, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { BudgetReserver } from "../lib/budget-reservers.ts";
import type { DbOrTx } from "../lib/db.ts";
import type { GooglePlacesClient } from "../lib/google-places.ts";
import { GOOGLE_PLACES_SERVICE } from "../lib/google-places.ts";
import {
  activate,
  closeTestDb,
  createActor,
  deliveryCtx,
  resolveTestDatabase,
  seedUser,
  testDelivery,
  withTestDb,
} from "../lib/testing.ts";
import { BudgetActor } from "./budget-actor.ts";
import {
  BATCH_BUDGET_MARGIN_MS,
  type BatchBudget,
  createBatchBudget,
} from "./job-actor/index.ts";
import { PlaceActor } from "./place-actor.ts";
import type { PlaceRefresher } from "./place-refresh-job-actor.ts";
import {
  PLACE_REFRESH_WORST_CASE_MS,
  PlaceRefreshJobActor,
  refreshBatchSize,
  stalenessCutoff,
} from "./place-refresh-job-actor.ts";

const SAN_FRANCISCO = sql`ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography`;

const seedPlace = async (
  db: DbOrTx,
  overrides: { name?: string; lastSyncAt?: Date | null } = {},
): Promise<string> => {
  const [row] = await db
    .insert(places)
    .values({
      name: overrides.name ?? `Stale Bar ${randomUUID().slice(0, 8)}`,
      categories: ["wine_bar"],
      location: SAN_FRANCISCO,
      source: "user",
      lastSyncAt: overrides.lastSyncAt ?? null,
    })
    .returning({ id: places.id });
  if (row === undefined) throw new Error("seedPlace: no row");
  return row.id;
};

/** Records every call; answers `enriched` unless told otherwise. */
const recordingRefresher = (
  answer: (placeId: string) => EnrichFromGoogleResult["status"] = () =>
    "enriched",
): { refresh: PlaceRefresher; calls: string[] } => {
  const calls: string[] = [];
  const refresh: PlaceRefresher = async (_ctx, placeId) => {
    calls.push(placeId);
    // The real `refreshFromSource` stamps `last_sync_at`; the fake cannot
    // (only `PlaceActor` writes `places`), so the walk relies on `id >`.
    return {
      placeId,
      status: answer(placeId),
      enrichment: null,
      photos: [],
      collision: null,
      reason:
        answer(placeId) === "budget_denied"
          ? "BudgetActor refused the google_places spend: daily cap reached"
          : "fake",
    };
  };
  return { refresh, calls };
};

/**
 * The harness's `createActor` takes three constructor arguments; this actor
 * needs a fourth, so it is built directly — B8's `menu-match-job-actor.test.ts`
 * does the same for the same reason. The `DaprClient` opens no connection.
 */
const jobActor = (db: DbOrTx, id: string, refresh: PlaceRefresher) =>
  activate(
    new PlaceRefreshJobActor(
      new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
      new ActorId(id),
      db,
      refresh,
    ),
  );

/**
 * A `PlaceRefreshJobActor` whose delivery-time budget runs on a clock the test
 * moves — from inside the refresher, which is where a slow place spends it.
 * `timeoutMs` defaults to what the descriptor declares, i.e. production's.
 */
class ClockedRefreshJobActor extends PlaceRefreshJobActor {
  clock = { now: 0 };
  timeoutMs = actorMethodTimeout(PlaceRefreshJobActorDescriptor, "runBatch");
  protected override batchBudget(): BatchBudget {
    return createBatchBudget(this.timeoutMs, () => this.clock.now);
  }
  // The registered type, so `scheduleBatch` finds the real `runBatch` handle.
  override getActorType(): string {
    return PlaceRefreshJobActorDescriptor.actorType;
  }
}

/** A refresher that records every call and spends `costMs` of the clock. */
const slowRefresher = (clock: { now: number }, costMs: number) => {
  const recorder = recordingRefresher();
  const refresh: PlaceRefresher = async (ctx, placeId, input) => {
    clock.now += costMs;
    return recorder.refresh(ctx, placeId, input);
  };
  return { refresh, calls: recorder.calls };
};

const clockedJobActor = async (db: DbOrTx, id: string, costMs: number) => {
  const clock = { now: 0 };
  const { refresh, calls } = slowRefresher(clock, costMs);
  const actor = new ClockedRefreshJobActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(id),
    db,
    refresh,
  );
  actor.clock = clock;
  return { actor: await activate(actor), calls, clock };
};

const outboxFor = async (db: DbOrTx, jobId: string) =>
  db
    .select()
    .from(outbox)
    .where(and(eq(outbox.targetId, jobId), eq(outbox.method, "runBatch")));

const jobRow = async (db: DbOrTx, id: string) => {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (row === undefined) throw new Error(`job ${id} not found`);
  return row;
};

const delivery = (jobId: string): Ctx => testDelivery(jobId);

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("PlaceRefreshJobActor (§2.6)", () => {
  afterAll(closeTestDb);

  it("is admin-only to start: it spends against the google budget", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const { refresh } = recordingRefresher();
      const actor = await jobActor(db, randomUUID(), refresh);
      await expect(actor.start(userCtx(user, "req"), {})).rejects.toThrow(
        ForbiddenError,
      );
    });
  });

  it("refuses a payload that names a user (target-stack §7)", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const { refresh } = recordingRefresher();
      const actor = await jobActor(db, randomUUID(), refresh);
      await expect(
        // biome-ignore lint/suspicious/noExplicitAny: the point is the bad shape
        actor.start(adminCtx(admin, "req"), { userId: admin } as any),
      ).rejects.toThrow(/may not carry `userId`/);
    });
  });

  it("chains batches through its cursor, one outbox row each", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const jobId = randomUUID();
      const ids = [
        await seedPlace(db),
        await seedPlace(db),
        await seedPlace(db),
      ].sort();
      const { refresh, calls } = recordingRefresher();
      const actor = await jobActor(db, jobId, refresh);

      await actor.start(adminCtx(admin, "req"), {
        batchSize: 2,
        placeIds: ids,
      });

      // Scoped to this job's rows only — never a global outbox count.
      expect(await outboxFor(db, jobId)).toHaveLength(1);

      const first = await actor.runBatch(delivery(jobId), { batch: 0 });
      expect(first).toEqual({ ran: true, processed: 2, done: false });
      expect(calls).toEqual(ids.slice(0, 2));

      const afterFirst = await jobRow(db, jobId);
      expect(afterFirst.cursor).toEqual({
        batch: 1,
        value: {
          lastPlaceId: ids[1],
          refreshed: 2,
          skipped: 0,
          failed: 0,
        },
      });
      const scheduled = await outboxFor(db, jobId);
      expect(scheduled).toHaveLength(2);
      expect(scheduled.map((row) => row.payload)).toContainEqual({ batch: 1 });

      const second = await actor.runBatch(delivery(jobId), { batch: 1 });
      expect(second).toEqual({ ran: true, processed: 1, done: true });
      expect(calls).toEqual(ids);
      expect((await jobRow(db, jobId)).status).toBe("completed");
      // The last batch schedules nothing: the chain ends.
      expect(await outboxFor(db, jobId)).toHaveLength(2);
    });
  });

  it("does not double any effect when a batch is redelivered", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const jobId = randomUUID();
      const ids = [await seedPlace(db), await seedPlace(db)].sort();
      const { refresh, calls } = recordingRefresher();
      const actor = await jobActor(db, jobId, refresh);
      await actor.start(adminCtx(admin, "req"), {
        batchSize: 1,
        placeIds: ids,
      });

      await actor.runBatch(delivery(jobId), { batch: 0 });
      expect(calls).toEqual([ids[0]]);

      // At-least-once: the same row arrives again.
      const again = await actor.runBatch(delivery(jobId), { batch: 0 });
      expect(again).toEqual({ ran: false, reason: "duplicate" });
      expect(calls).toEqual([ids[0]]);

      const row = await jobRow(db, jobId);
      expect(row.processed).toBe(1);
      const value = (row.cursor as { value: { refreshed: number } }).value;
      expect(value.refreshed).toBe(1);
      // One row for batch 0, one for batch 1. The redelivery scheduled nothing.
      expect(await outboxFor(db, jobId)).toHaveLength(2);
    });
  });

  it("resumes from the persisted cursor after the host dies mid-chain", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const jobId = randomUUID();
      const ids = [
        await seedPlace(db),
        await seedPlace(db),
        await seedPlace(db),
      ].sort();
      const { refresh, calls } = recordingRefresher();

      const before = await jobActor(db, jobId, refresh);
      await before.start(adminCtx(admin, "req"), {
        batchSize: 1,
        placeIds: ids,
      });
      await before.runBatch(delivery(jobId), { batch: 0 });
      await before.runBatch(delivery(jobId), { batch: 1 });
      expect(calls).toEqual(ids.slice(0, 2));

      // The host dies. A fresh activation knows nothing but the `jobs` row.
      const after = await jobActor(db, jobId, refresh);
      const resumed = await after.runBatch(delivery(jobId), { batch: 2 });

      expect(resumed).toEqual({ ran: true, processed: 1, done: false });
      // It restarted neither the walk nor the two places already done.
      expect(calls).toEqual(ids);
    });
  });

  it("honours a cancel request at the top of the next batch", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const jobId = randomUUID();
      const ids = [
        await seedPlace(db),
        await seedPlace(db),
        await seedPlace(db),
      ].sort();
      const { refresh, calls } = recordingRefresher();
      const actor = await jobActor(db, jobId, refresh);
      await actor.start(adminCtx(admin, "req"), {
        batchSize: 1,
        placeIds: ids,
      });

      await actor.runBatch(delivery(jobId), { batch: 0 });
      expect(calls).toHaveLength(1);

      await actor.cancel(adminCtx(admin, "req"));

      const stopped = await actor.runBatch(delivery(jobId), { batch: 1 });
      expect(stopped).toEqual({ ran: false, reason: "cancelled" });
      expect(calls).toHaveLength(1);
      expect((await jobRow(db, jobId)).status).toBe("cancelled");
      // Nothing further was scheduled.
      expect(await outboxFor(db, jobId)).toHaveLength(2);
    });
  });

  it("counts a per-place failure instead of wedging the chain", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const jobId = randomUUID();
      const ids = [await seedPlace(db), await seedPlace(db)].sort();
      const calls: string[] = [];
      const refresh: PlaceRefresher = async (_ctx, placeId) => {
        calls.push(placeId);
        if (placeId === ids[0]) throw new Error("google said no");
        return {
          placeId,
          status: "enriched",
          enrichment: null,
          photos: [],
          collision: null,
          reason: "fake",
        };
      };
      const actor = await jobActor(db, jobId, refresh);
      await actor.start(adminCtx(admin, "req"), {
        batchSize: 5,
        placeIds: ids,
      });

      const result = await actor.runBatch(delivery(jobId), { batch: 0 });
      expect(result).toEqual({ ran: true, processed: 2, done: true });
      expect(calls).toEqual(ids);
      const value = (
        (await jobRow(db, jobId)).cursor as {
          value: { failed: number; refreshed: number };
        }
      ).value;
      expect(value).toMatchObject({ failed: 1, refreshed: 1 });
    });
  });

  it("stops the chain when the budget is exhausted", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const jobId = randomUUID();
      const ids = [
        await seedPlace(db),
        await seedPlace(db),
        await seedPlace(db),
      ].sort();
      const { refresh, calls } = recordingRefresher((placeId) =>
        placeId === ids[0] ? "enriched" : "budget_denied",
      );
      const actor = await jobActor(db, jobId, refresh);
      await actor.start(adminCtx(admin, "req"), {
        batchSize: 5,
        placeIds: ids,
      });

      const result = await actor.runBatch(delivery(jobId), { batch: 0 });
      expect(result).toMatchObject({ ran: true, done: true });
      // It stopped at the first denial rather than spending two more.
      expect(calls).toEqual(ids.slice(0, 2));
      const value = (
        (await jobRow(db, jobId)).cursor as {
          value: { stopped?: string | null };
        }
      ).value;
      expect(value.stopped).toContain("BudgetActor");
      expect((await jobRow(db, jobId)).status).toBe("completed");
    });
  });

  /*
   * The delivery-time budget (`BatchBudget`). A batch is waited on for the
   * `runBatch` timeout its descriptor declares, and one place can take up to
   * `refreshFromSource`'s 90s — so a batch of ten slow places used to outrun
   * its own delivery, be aborted, charged an attempt, and retried behind a
   * turn that then committed anyway.
   */
  describe("inside its own delivery timeout", () => {
    it("declares a runBatch timeout that holds one worst-case place", () => {
      // Otherwise the first place — which always starts — could itself
      // outrun the delivery, and the budget would bound nothing.
      expect(
        actorMethodTimeout(PlaceRefreshJobActorDescriptor, "runBatch") -
          BATCH_BUDGET_MARGIN_MS,
      ).toBeGreaterThanOrEqual(PLACE_REFRESH_WORST_CASE_MS);
      expect(PLACE_REFRESH_WORST_CASE_MS).toBe(90_000);
    });

    it("stops starting places when the next one's worst case would not fit, and resumes exactly there", async () => {
      await withTestDb(async (db) => {
        const admin = await seedUser(db);
        const jobId = randomUUID();
        const ids = (
          await Promise.all(Array.from({ length: 7 }, () => seedPlace(db)))
        ).sort();
        // 10s a place against a 120s delivery: the deadline is 115s, and a
        // place may start only while 90s more still fits — at 0s, 10s and
        // 20s, not at 30s. Three places a batch, whatever `batchSize` says.
        const { actor, calls } = await clockedJobActor(db, jobId, 10_000);
        await actor.start(adminCtx(admin, "req"), {
          batchSize: 10,
          placeIds: ids,
        });

        const first = await actor.runBatch(delivery(jobId), { batch: 0 });
        expect(first).toEqual({ ran: true, processed: 3, done: false });
        expect(calls).toEqual(ids.slice(0, 3));
        expect((await jobRow(db, jobId)).cursor).toEqual({
          batch: 1,
          value: {
            lastPlaceId: ids[2],
            refreshed: 3,
            skipped: 0,
            failed: 0,
          },
        });
        // Cut short is not finished: the next batch is scheduled.
        expect(
          (await outboxFor(db, jobId)).map((row) => row.payload),
        ).toContainEqual({ batch: 1 });

        expect(await actor.runBatch(delivery(jobId), { batch: 1 })).toEqual({
          ran: true,
          processed: 3,
          done: false,
        });
        expect(await actor.runBatch(delivery(jobId), { batch: 2 })).toEqual({
          ran: true,
          processed: 1,
          done: true,
        });

        // Every place exactly once, in order: none skipped at a cut, none
        // refreshed twice across one.
        expect(calls).toEqual(ids);
        const done = await jobRow(db, jobId);
        expect(done.status).toBe("completed");
        expect(done.processed).toBe(7);
      });
    });

    it("always starts the first place, even one whose worst case outruns the whole budget — then stops", async () => {
      await withTestDb(async (db) => {
        const admin = await seedUser(db);
        const jobId = randomUUID();
        const ids = [await seedPlace(db), await seedPlace(db)].sort();
        const { actor, calls } = await clockedJobActor(db, jobId, 1);
        // A budget smaller than one place's 90s worst case: 10s - 5s margin.
        actor.timeoutMs = 10_000;
        expect(actor.timeoutMs - BATCH_BUDGET_MARGIN_MS).toBeLessThan(
          PLACE_REFRESH_WORST_CASE_MS,
        );
        await actor.start(adminCtx(admin, "req"), {
          batchSize: 10,
          placeIds: ids,
        });

        // One place per batch: a batch that could not start one would make
        // no progress, and the chain would reschedule it for ever.
        expect(await actor.runBatch(delivery(jobId), { batch: 0 })).toEqual({
          ran: true,
          processed: 1,
          done: false,
        });
        expect(calls).toEqual([ids[0]]);
        // The last place is again a first place; the page ran out before
        // the budget did, so this one finishes the walk.
        expect(await actor.runBatch(delivery(jobId), { batch: 1 })).toEqual({
          ran: true,
          processed: 1,
          done: true,
        });
        expect(calls).toEqual(ids);
      });
    });
  });

  it("selects only places past the staleness cutoff", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const jobId = randomUUID();
      const fresh = await seedPlace(db, { lastSyncAt: new Date() });
      const stale = await seedPlace(db, {
        lastSyncAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      });
      const never = await seedPlace(db, { lastSyncAt: null });
      const { refresh, calls } = recordingRefresher();
      const actor = await jobActor(db, jobId, refresh);
      await actor.start(adminCtx(admin, "req"), {
        batchSize: 10,
        placeIds: [fresh, stale, never],
      });

      await actor.runBatch(delivery(jobId), { batch: 0 });
      expect(calls.sort()).toEqual([never, stale].sort());
      expect(calls).not.toContain(fresh);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* The budget, through the real PlaceActor                                     */
/* -------------------------------------------------------------------------- */

/**
 * The batch hands **one delivery ctx** to every place it refreshes. While
 * `BudgetActor` keyed a missing `reservationId` on that delivery's row id,
 * place 1's details call wrote a usage row and places 2..10 replayed it —
 * one row per endpoint for the whole batch. The recording refresher above
 * cannot see that (it never reaches a budget), so this one runs the real
 * `PlaceActor.refreshFromSource` in-process against the real `BudgetActor`
 * and counts `api_usage_log` rows against the calls Google received.
 */
describe.skipIf(skip)("PlaceRefreshJobActor → PlaceActor → BudgetActor", () => {
  afterAll(closeTestDb);

  it("a ten-place batch records a usage row per paid call, per place", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const budget = await activate(
        createActor(BudgetActor, BUDGET_ACTOR_ID, db),
      );
      for (const endpoint of ["text_search", "place_details", "photo"]) {
        await budget.setBudget(adminCtx(admin, "setup"), {
          kind: { service: GOOGLE_PLACES_SERVICE, endpoint },
          monthlyBudgetCents: 1_000_000,
          freeTierMonthlyRequests: 0,
          isEnabled: true,
        });
      }
      const asked: ReserveInput[] = [];
      const reserve: BudgetReserver = async (ctx, input) => {
        asked.push(input);
        return budget.reserve(ctx, input);
      };

      let paidCalls = 0;
      const google: GooglePlacesClient = {
        autocomplete: async () => null,
        nearbySearch: async () => null,
        textSearch: async () => {
          paidCalls += 1;
          return { googlePlaceId: `ChIJ_${randomUUID()}` };
        },
        details: async (googlePlaceId) => {
          paidCalls += 1;
          return {
            googlePlaceId,
            name: "Google's name",
            formattedAddress: null,
            rating: null,
            userRatingsTotal: null,
            priceLevel: null,
            website: null,
            phone: null,
            openingHours: null,
            types: [],
            businessStatus: null,
            editorialSummary: null,
            photos: [0, 1, 2].map((i) => ({
              name: `places/${googlePlaceId}/photos/p${i}`,
            })),
            attributions: [],
          };
        },
        photo: async () => {
          paidCalls += 1;
          return { bytes: new Uint8Array([1]), contentType: "image/jpeg" };
        },
      };
      const refresh: PlaceRefresher = async (ctx, placeId, input) => {
        const place = await activate(
          new PlaceActor(
            new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
            new ActorId(placeId),
            db,
            google,
            reserve,
            async () => {
              const [file] = await db
                .insert(files)
                .values({ key: `place-photo/${randomUUID()}` })
                .returning({ id: files.id });
              if (file === undefined) throw new Error("no file row");
              return { fileId: file.id };
            },
          ),
        );
        return place.refreshFromSource(ctx, input);
      };

      const ids: string[] = [];
      for (let i = 0; i < PLACE_REFRESH_BATCH_SIZE; i += 1) {
        ids.push(await seedPlace(db));
      }
      const jobId = randomUUID();
      // The delivery-time budget on a clock that never moves, so this test is
      // about usage rows and nothing else: on the wall clock a loaded machine
      // could run ten places past the budget and the batch would, correctly,
      // stop early.
      const actor = await activate(
        new ClockedRefreshJobActor(
          new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
          new ActorId(jobId),
          db,
          refresh,
        ),
      );
      await actor.start(adminCtx(admin, "req"), {
        placeIds: ids,
        maxPhotos: 3,
      });
      // The real scheduling row, so the ctx is the delivery it would be.
      const [scheduled] = await outboxFor(db, jobId);
      const rowId = scheduled?.id ?? "";

      const result = await actor.runBatch(deliveryCtx(rowId), {
        batch: 0,
      });
      expect(result).toMatchObject({ ran: true, processed: ids.length });

      const rows = await db
        .select({
          entityId: apiUsageLog.entityId,
          endpoint: apiUsageLog.endpoint,
          metadata: apiUsageLog.metadata,
        })
        .from(apiUsageLog)
        .where(inArray(apiUsageLog.entityId, ids));

      // text search + details + three photos, for each of the ten places.
      expect(paidCalls).toBe(ids.length * 5);
      expect(rows).toHaveLength(paidCalls);
      for (const id of ids) {
        const mine = rows.filter((row) => row.entityId === id);
        expect(mine.map((row) => row.endpoint).sort()).toEqual([
          "photo",
          "photo",
          "photo",
          "place_details",
          "text_search",
        ]);
      }
      const keys = rows.map(
        (row) => (row.metadata as { reservationId?: string }).reservationId,
      );
      expect(new Set(keys).size).toBe(rows.length);
      expect(asked).toHaveLength(rows.length);
      // One delivery, recorded on every row as attribution.
      expect(
        rows.every(
          (row) =>
            (row.metadata as { outboxRowId?: string }).outboxRowId === rowId,
        ),
      ).toBe(true);
    });
    // Fifty-five serial transactions (a BudgetActor reservation per paid call,
    // a file row per photo, each place's writes) against real Postgres: 0.5s
    // on an idle machine, 1-3.5s measured at load average 30-45 on 14 cores,
    // and past vitest's 5s default at higher load. Nothing in it waits on a
    // timer, so the bound is for the work, not for a sleep.
  }, 20_000);
});

describe("PlaceRefreshJobActor input clamps", () => {
  it("clamps the batch size and rejects nonsense", () => {
    expect(refreshBatchSize(undefined)).toBe(10);
    expect(refreshBatchSize(1_000)).toBe(50);
    expect(() => refreshBatchSize(0)).toThrow(/positive integer/);
    expect(() => refreshBatchSize(2.5)).toThrow(/positive integer/);
  });

  it("defaults the staleness cutoff to 30 days", () => {
    const now = Date.parse("2026-09-09T00:00:00Z");
    expect(stalenessCutoff(undefined, now).toISOString()).toBe(
      "2026-08-10T00:00:00.000Z",
    );
    expect(() => stalenessCutoff(-1)).toThrow(/zero or more/);
  });
});
