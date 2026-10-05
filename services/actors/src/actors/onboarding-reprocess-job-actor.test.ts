/**
 * `OnboardingReprocessJobActor` — C4's `item_onboardings` walk (§2.6, §8.4).
 *
 * The two things worth proving beyond "it called reprocess":
 *
 *  - **the `(created_at, id)` keyset does not skip a tie.** The old
 *    `onboarding_reprocess_jobs.cursor` held `created_at` alone, so two rows
 *    sharing a timestamp across a batch boundary were silently dropped. The
 *    fixture below deliberately gives four rows *the same* `created_at` and
 *    walks them one per batch.
 *  - **the per-row `ctx` is the delivery's**, which is what makes a retried
 *    batch cheap: `ItemOnboardingActor.reprocess` keys idempotency on the
 *    outbox row id in `ctx.requestId`.
 *
 * Every outbox assertion is scoped to this job's id, never a global count.
 */
import { randomUUID } from "node:crypto";
import type { Ctx, ReprocessResult } from "@cellar-assistant/contracts";
import {
  actorMethodTimeout,
  adminCtx,
  ForbiddenError,
  OnboardingReprocessJobActorDescriptor,
  userCtx,
} from "@cellar-assistant/contracts";
import { files, itemOnboardings, jobs, outbox } from "@cellar-assistant/db";
import { and, eq } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  testDelivery,
  withTestDb,
} from "../lib/testing.ts";
import {
  BATCH_BUDGET_MARGIN_MS,
  type BatchBudget,
  createBatchBudget,
} from "./job-actor/index.ts";
import type { OnboardingReprocessor } from "./onboarding-reprocess-job-actor.ts";
import {
  ONBOARDING_REPROCESS_WORST_CASE_MS,
  OnboardingReprocessJobActor,
  reprocessBatchSize,
} from "./onboarding-reprocess-job-actor.ts";

/**
 * `item_onboardings.front_label_image_id` is a real FK to `public.files` (B2's
 * transform 09), and the walk's predicate requires one of the two image
 * columns — so a row with no file is a row the job correctly never sees, which
 * is what `withImage: false` is for.
 */
const seedOnboarding = async (
  db: DbOrTx,
  userId: string,
  overrides: {
    createdAt?: Date;
    itemType?: string;
    aiModel?: string | null;
    withImage?: boolean;
  } = {},
): Promise<string> => {
  let frontLabelImageId: string | null = null;
  if (overrides.withImage !== false) {
    const [file] = await db
      .insert(files)
      .values({
        key: `labels/${randomUUID()}.jpg`,
        verifiedAt: new Date(),
      })
      .returning({ id: files.id });
    frontLabelImageId = file?.id ?? null;
  }
  const id = randomUUID();
  await db.insert(itemOnboardings).values({
    id,
    userId,
    itemType: overrides.itemType ?? "WINE",
    status: "COMPLETED",
    aiModel: overrides.aiModel ?? "gemini-old",
    frontLabelImageId,
    ...(overrides.createdAt === undefined
      ? {}
      : { createdAt: overrides.createdAt }),
  });
  return id;
};

const recordingReprocessor = (
  answer: (id: string) => ReprocessResult | Error = () => ({
    onboardingId: "",
    reprocessed: true,
    reason: "re-extracted",
  }),
): {
  reprocess: OnboardingReprocessor;
  calls: { id: string; requestId: string }[];
} => {
  const calls: { id: string; requestId: string }[] = [];
  const reprocess: OnboardingReprocessor = async (ctx, id) => {
    calls.push({ id, requestId: ctx.requestId });
    const outcome = answer(id);
    if (outcome instanceof Error) throw outcome;
    return { ...outcome, onboardingId: id };
  };
  return { reprocess, calls };
};

const jobActor = (db: DbOrTx, id: string, reprocess: OnboardingReprocessor) =>
  activate(
    new OnboardingReprocessJobActor(
      new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
      new ActorId(id),
      db,
      reprocess,
    ),
  );

/**
 * The actor with its delivery-time budget on a clock the reprocessor moves,
 * `timeoutMs` defaulting to the descriptor's (production's) value.
 */
class ClockedReprocessJobActor extends OnboardingReprocessJobActor {
  clock = { now: 0 };
  timeoutMs = actorMethodTimeout(
    OnboardingReprocessJobActorDescriptor,
    "runBatch",
  );
  protected override batchBudget(): BatchBudget {
    return createBatchBudget(this.timeoutMs, () => this.clock.now);
  }
  // The registered type, so `scheduleBatch` finds the real `runBatch` handle.
  override getActorType(): string {
    return OnboardingReprocessJobActorDescriptor.actorType;
  }
}

const clockedJobActor = async (db: DbOrTx, id: string, costMs: number) => {
  const clock = { now: 0 };
  const recorder = recordingReprocessor();
  const actor = new ClockedReprocessJobActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(id),
    db,
    async (ctx, onboardingId, input) => {
      clock.now += costMs;
      return recorder.reprocess(ctx, onboardingId, input);
    },
  );
  actor.clock = clock;
  return { actor: await activate(actor), calls: recorder.calls };
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

const delivery = (rowId: string): Ctx => testDelivery(rowId);

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("OnboardingReprocessJobActor (§2.6)", () => {
  afterAll(closeTestDb);

  it("is admin-only to start", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const { reprocess } = recordingReprocessor();
      const actor = await jobActor(db, randomUUID(), reprocess);
      await expect(actor.start(userCtx(user, "req"), {})).rejects.toThrow(
        ForbiddenError,
      );
    });
  });

  it("refuses a payload that names a user (target-stack §7)", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const { reprocess } = recordingReprocessor();
      const actor = await jobActor(db, randomUUID(), reprocess);
      await expect(
        // biome-ignore lint/suspicious/noExplicitAny: the point is the bad shape
        actor.start(adminCtx(admin, "req"), { user_id: admin } as any),
      ).rejects.toThrow(/may not carry `user_id`/);
    });
  });

  describe("inside its own delivery timeout (BatchBudget)", () => {
    it("declares a runBatch timeout that holds one worst-case row", () => {
      expect(
        actorMethodTimeout(OnboardingReprocessJobActorDescriptor, "runBatch") -
          BATCH_BUDGET_MARGIN_MS,
      ).toBeGreaterThanOrEqual(ONBOARDING_REPROCESS_WORST_CASE_MS);
      expect(ONBOARDING_REPROCESS_WORST_CASE_MS).toBe(90_000);
    });

    it("stops starting rows when the next one's worst case would not fit, and resumes exactly there", async () => {
      await withTestDb(async (db) => {
        const admin = await seedUser(db);
        const owner = await seedUser(db);
        const jobId = randomUUID();
        // Shared created_at, so the resume goes through the (created_at, id)
        // tie-break the cursor has to get right.
        const sameInstant = new Date("2026-01-02T00:00:00.000Z");
        const ids = (
          await Promise.all(
            Array.from({ length: 5 }, () =>
              seedOnboarding(db, owner, { createdAt: sameInstant }),
            ),
          )
        ).sort();
        // 10s a row against a 120s delivery (deadline 115s, 90s worst case):
        // rows start at 0s, 10s and 20s, and not at 30s.
        const { actor, calls } = await clockedJobActor(db, jobId, 10_000);
        await actor.start(adminCtx(admin, "req"), {
          batchSize: 10,
          onboardingIds: ids,
        });

        expect(await actor.runBatch(delivery(jobId), { batch: 0 })).toEqual({
          ran: true,
          processed: 3,
          done: false,
        });
        expect(calls.map((call) => call.id)).toEqual(ids.slice(0, 3));
        expect(
          (await outboxFor(db, jobId)).map((row) => row.payload),
        ).toContainEqual({ batch: 1 });

        expect(await actor.runBatch(delivery(jobId), { batch: 1 })).toEqual({
          ran: true,
          processed: 2,
          done: true,
        });
        // Every row exactly once, in order.
        expect(calls.map((call) => call.id)).toEqual(ids);
        const done = await jobRow(db, jobId);
        expect(done.status).toBe("completed");
        expect(done.processed).toBe(5);
      });
    });

    it("always starts the first row, even one whose worst case outruns the whole budget — then stops", async () => {
      await withTestDb(async (db) => {
        const admin = await seedUser(db);
        const owner = await seedUser(db);
        const jobId = randomUUID();
        const ids = [
          await seedOnboarding(db, owner),
          await seedOnboarding(db, owner),
        ];
        const { actor, calls } = await clockedJobActor(db, jobId, 1);
        actor.timeoutMs = 10_000;
        expect(actor.timeoutMs - BATCH_BUDGET_MARGIN_MS).toBeLessThan(
          ONBOARDING_REPROCESS_WORST_CASE_MS,
        );
        await actor.start(adminCtx(admin, "req"), {
          batchSize: 10,
          onboardingIds: ids,
        });

        expect(await actor.runBatch(delivery(jobId), { batch: 0 })).toEqual({
          ran: true,
          processed: 1,
          done: false,
        });
        expect(calls).toHaveLength(1);
        expect(await actor.runBatch(delivery(jobId), { batch: 1 })).toEqual({
          ran: true,
          processed: 1,
          done: true,
        });
        expect(new Set(calls.map((call) => call.id))).toEqual(new Set(ids));
        expect(calls).toHaveLength(2);
      });
    });
  });

  it("walks rows that share a created_at without skipping any", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const owner = await seedUser(db);
      const jobId = randomUUID();
      // The tie the old `created_at`-only cursor lost rows to.
      const sameInstant = new Date("2026-01-01T00:00:00.000Z");
      const ids = [
        await seedOnboarding(db, owner, { createdAt: sameInstant }),
        await seedOnboarding(db, owner, { createdAt: sameInstant }),
        await seedOnboarding(db, owner, { createdAt: sameInstant }),
        await seedOnboarding(db, owner, { createdAt: sameInstant }),
      ].sort();
      const { reprocess, calls } = recordingReprocessor();
      const actor = await jobActor(db, jobId, reprocess);

      await actor.start(adminCtx(admin, "req"), {
        batchSize: 1,
        onboardingIds: ids,
      });

      for (let batch = 0; batch < 4; batch += 1) {
        const result = await actor.runBatch(delivery(jobId), { batch });
        expect(result).toMatchObject({ ran: true, processed: 1 });
      }
      // Four rows, one per batch, none skipped and none repeated.
      expect(calls.map((call) => call.id)).toEqual(ids);

      const final = await actor.runBatch(delivery(jobId), { batch: 4 });
      expect(final).toEqual({ ran: true, processed: 0, done: true });
      expect((await jobRow(db, jobId)).status).toBe("completed");
    });
  });

  it("passes the delivery's requestId through, so a retry is cheap", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const owner = await seedUser(db);
      const jobId = randomUUID();
      const ids = [
        await seedOnboarding(db, owner),
        await seedOnboarding(db, owner),
      ].sort();
      const { reprocess, calls } = recordingReprocessor();
      const actor = await jobActor(db, jobId, reprocess);
      await actor.start(adminCtx(admin, "req"), {
        batchSize: 5,
        onboardingIds: ids,
      });

      const rowId = randomUUID();
      await actor.runBatch(delivery(rowId), { batch: 0 });

      expect(calls).toHaveLength(2);
      for (const call of calls) {
        expect(call.requestId).toBe(`outbox:${rowId}`);
      }
    });
  });

  it("does not double any effect when a batch is redelivered", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const owner = await seedUser(db);
      const jobId = randomUUID();
      const ids = [
        await seedOnboarding(db, owner),
        await seedOnboarding(db, owner),
      ].sort();
      const { reprocess, calls } = recordingReprocessor();
      const actor = await jobActor(db, jobId, reprocess);
      await actor.start(adminCtx(admin, "req"), {
        batchSize: 1,
        onboardingIds: ids,
      });

      await actor.runBatch(delivery(jobId), { batch: 0 });
      const again = await actor.runBatch(delivery(jobId), { batch: 0 });

      expect(again).toEqual({ ran: false, reason: "duplicate" });
      expect(calls.map((call) => call.id)).toEqual([ids[0]]);
      expect((await jobRow(db, jobId)).processed).toBe(1);
      expect(await outboxFor(db, jobId)).toHaveLength(2);
    });
  });

  it("resumes from the persisted cursor after the host dies", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const owner = await seedUser(db);
      const jobId = randomUUID();
      const ids = [
        await seedOnboarding(db, owner),
        await seedOnboarding(db, owner),
        await seedOnboarding(db, owner),
      ].sort();
      const { reprocess, calls } = recordingReprocessor();

      const before = await jobActor(db, jobId, reprocess);
      await before.start(adminCtx(admin, "req"), {
        batchSize: 1,
        onboardingIds: ids,
      });
      await before.runBatch(delivery(jobId), { batch: 0 });

      const after = await jobActor(db, jobId, reprocess);
      await after.runBatch(delivery(jobId), { batch: 1 });

      expect(calls.map((call) => call.id)).toEqual(ids.slice(0, 2));
      const value = (
        (await jobRow(db, jobId)).cursor as {
          value: { lastOnboardingId: string; reprocessed: number };
        }
      ).value;
      expect(value.lastOnboardingId).toBe(ids[1]);
      expect(value.reprocessed).toBe(2);
    });
  });

  it("honours a cancel request at the top of the next batch", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const owner = await seedUser(db);
      const jobId = randomUUID();
      const ids = [
        await seedOnboarding(db, owner),
        await seedOnboarding(db, owner),
      ].sort();
      const { reprocess, calls } = recordingReprocessor();
      const actor = await jobActor(db, jobId, reprocess);
      await actor.start(adminCtx(admin, "req"), {
        batchSize: 1,
        onboardingIds: ids,
      });

      await actor.runBatch(delivery(jobId), { batch: 0 });
      await actor.cancel(adminCtx(admin, "req"));
      const stopped = await actor.runBatch(delivery(jobId), { batch: 1 });

      expect(stopped).toEqual({ ran: false, reason: "cancelled" });
      expect(calls).toHaveLength(1);
      expect((await jobRow(db, jobId)).status).toBe("cancelled");
    });
  });

  it("counts a poison row instead of looping on it forever", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const owner = await seedUser(db);
      const jobId = randomUUID();
      const ids = [
        await seedOnboarding(db, owner),
        await seedOnboarding(db, owner),
      ].sort();
      const { reprocess, calls } = recordingReprocessor((id) =>
        id === ids[0]
          ? new Error("the model refused")
          : { onboardingId: id, reprocessed: true, reason: "ok" },
      );
      const actor = await jobActor(db, jobId, reprocess);
      await actor.start(adminCtx(admin, "req"), {
        batchSize: 5,
        onboardingIds: ids,
      });

      const result = await actor.runBatch(delivery(jobId), { batch: 0 });

      expect(result).toEqual({ ran: true, processed: 2, done: true });
      expect(calls).toHaveLength(2);
      const value = (
        (await jobRow(db, jobId)).cursor as {
          value: { failed: number; reprocessed: number };
        }
      ).value;
      expect(value).toMatchObject({ failed: 1, reprocessed: 1 });
    });
  });

  it("never selects an onboarding with no label image", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const owner = await seedUser(db);
      const jobId = randomUUID();
      const withImage = await seedOnboarding(db, owner);
      const without = await seedOnboarding(db, owner, { withImage: false });
      const { reprocess, calls } = recordingReprocessor();
      const actor = await jobActor(db, jobId, reprocess);
      await actor.start(adminCtx(admin, "req"), {
        batchSize: 10,
        onboardingIds: [withImage, without],
      });

      await actor.runBatch(delivery(jobId), { batch: 0 });

      expect(calls.map((call) => call.id)).toEqual([withImage]);
    });
  });

  it("filters by ai_model, which is what the job is for", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const owner = await seedUser(db);
      const jobId = randomUUID();
      const old = await seedOnboarding(db, owner, { aiModel: "gemini-1.0" });
      const current = await seedOnboarding(db, owner, { aiModel: "gemini-3" });
      const { reprocess, calls } = recordingReprocessor();
      const actor = await jobActor(db, jobId, reprocess);
      await actor.start(adminCtx(admin, "req"), {
        batchSize: 10,
        aiModel: "gemini-1.0",
        onboardingIds: [old, current],
      });

      await actor.runBatch(delivery(jobId), { batch: 0 });

      expect(calls.map((call) => call.id)).toEqual([old]);
    });
  });
});

describe("OnboardingReprocessJobActor input clamps", () => {
  it("clamps the batch size", () => {
    expect(reprocessBatchSize(undefined)).toBe(5);
    expect(reprocessBatchSize(500)).toBe(25);
    expect(() => reprocessBatchSize(-1)).toThrow(/positive integer/);
  });
});
