/**
 * The `JobActor` base (§2.6): the `jobs` row, the progress cursor, the cancel
 * check, and the outbox row that carries the chain forward.
 *
 * `DemoJobActor` lives here rather than in `src/actors/` for the reason A4's
 * `DemoCellarActor` does: C4 owns the real job actors and this file must not
 * pre-empt them. It is, however, exactly the shape they should have.
 */

import { randomUUID } from "node:crypto";
import type { Ctx } from "@cellar-assistant/contracts";
import {
  actorMethodTimeout,
  adminCtx,
  anonymousCtx,
  ForbiddenError,
  NotFoundError,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { jobs, outbox } from "@cellar-assistant/db";
import { and, eq } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "../../lib/db.ts";
import {
  activate,
  closeTestDb,
  createActor,
  deliveryCtx,
  refusalOf,
  resolveTestDatabase,
  testDelivery,
  withTestDb,
} from "../../lib/testing.ts";
import { MAX_ATTEMPTS } from "../outbox-actor.ts";
import { ProbeJobActorDescriptor } from "../probe-job-actor-descriptor.ts";
import {
  BATCH_BUDGET_MARGIN_MS,
  type BatchInput,
  type BatchOutcome,
  createBatchBudget,
  JobActor,
} from "./index.ts";

/**
 * `DemoJobActor` and `OtherJobActor` are not registered with Dapr, so the
 * outbox allow-list has no `runBatch` handle for either and `scheduleBatch`
 * would refuse to enqueue for them. Extend the lookup — and only the lookup —
 * with one for each, so what is under test is the base class's own machinery.
 * The rows they write name `DemoJobActor`, which no drainer here delivers.
 */
vi.mock("../../lib/outbox-targets.ts", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../lib/outbox-targets.ts")>();
  const template = original.OUTBOX_TARGETS["ProbeJobActor.runBatch"];
  return {
    ...original,
    jobRunBatchTarget: (actorType: string) =>
      actorType === "DemoJobActor" || actorType === "OtherJobActor"
        ? { ...template, key: `${actorType}.runBatch`, actorType }
        : original.jobRunBatchTarget(actorType),
  };
});

type DemoCursor = { readonly at: number };
type DemoPayload = {
  readonly batches: number;
  readonly failAt?: number;
  /** What the failing batch throws: retryable by default. */
  readonly failWith?: "transient" | "validation";
};

/** Refuse an anonymous caller — the rule `start` used to hard-code. */
const signedIn = (ctx: Ctx): void => {
  if (ctx.kind === "user" && ctx.viewerId === null) {
    throw new ForbiddenError("a demo job needs a user");
  }
};

class DemoJobActor extends JobActor<DemoCursor, DemoPayload> {
  protected readonly kind = "demo-job";
  readonly seen: BatchInput<DemoCursor, DemoPayload>[] = [];

  protected authorizeStart(ctx: Ctx): void {
    signedIn(ctx);
  }

  protected async processBatch(
    _ctx: Ctx,
    input: BatchInput<DemoCursor, DemoPayload>,
  ): Promise<BatchOutcome<DemoCursor>> {
    this.seen.push(input);
    if (input.payload.failAt === input.batch) {
      if (input.payload.failWith === "validation") {
        throw new ValidationError(`batch ${input.batch} can never succeed`);
      }
      throw new Error(`batch ${input.batch} exploded`);
    }
    const at = (input.cursor?.at ?? 0) + 1;
    return {
      cursor: { at },
      processed: 10,
      total: input.payload.batches * 10,
      done: at >= input.payload.batches,
    };
  }
}

/** A second kind, to prove a job id is only valid for the actor that owns it. */
class OtherJobActor extends JobActor<DemoCursor, DemoPayload> {
  protected readonly kind = "other-job";
  protected authorizeStart(ctx: Ctx): void {
    signedIn(ctx);
  }
  protected async processBatch(): Promise<BatchOutcome<DemoCursor>> {
    return { cursor: null, processed: 0, done: true };
  }
}

/**
 * **A compile-time test.** `authorizeStart` is abstract so that no job actor
 * can inherit an open `start` — `MenuMatchJobActor` did, and any signed-in
 * user could start it. If a default ever creeps back into the base class,
 * this class stops being an error and the unused directive fails `tsc`.
 */
// @ts-expect-error — a job actor that does not say who may start it must not compile.
class _NoStartRule extends JobActor<DemoCursor, DemoPayload> {
  protected readonly kind = "no-start-rule";
  protected async processBatch(): Promise<BatchOutcome<DemoCursor>> {
    return { cursor: null, processed: 0, done: true };
  }
}
void _NoStartRule;

/**
 * Put this job's scheduling row into the state a drainer leaves it in while
 * delivering attempt `attempts + 1`, and return that delivery's ctx.
 */
const deliveringAttempt = async (
  db: DbOrTx,
  jobId: string,
  attempts: number,
  status: "delivering" | "pending" = "delivering",
): Promise<Ctx> => {
  const [row] = await db
    .select({ id: outbox.id })
    .from(outbox)
    .where(and(eq(outbox.targetId, jobId), eq(outbox.method, "runBatch")));
  if (row === undefined) throw new Error(`no runBatch row for ${jobId}`);
  await db
    .update(outbox)
    .set({ status, attempts, claimToken: randomUUID() })
    .where(eq(outbox.id, row.id));
  return deliveryCtx(row.id, attempts);
};

const jobActor = (db: DbOrTx, id: string) =>
  activate(createActor(DemoJobActor, id, db));

const scheduled = async (db: DbOrTx, jobId: string) =>
  db
    .select()
    .from(outbox)
    .where(and(eq(outbox.targetId, jobId), eq(outbox.method, "runBatch")));

const jobRow = async (db: DbOrTx, id: string) => {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (row === undefined) throw new Error(`job ${id} not found`);
  return row;
};

const OWNER = randomUUID();
const STRANGER = randomUUID();

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("JobActor (§2.6)", () => {
  afterAll(closeTestDb);

  it("commits the job row and the first batch's outbox row together", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);

      await actor.start(userCtx(OWNER, "req"), { batches: 3 });

      const job = await jobRow(db, id);
      expect(job.kind).toBe("demo-job");
      expect(job.status).toBe("running");
      expect(job.createdBy).toBe(OWNER);
      expect(job.cursor).toEqual({ batch: 0, value: null });

      const rows = await scheduled(db, id);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.targetActor).toBe("DemoJobActor");
      expect(rows[0]?.payload).toEqual({ batch: 0 });
      expect(rows[0]?.status).toBe("pending");
    });
  });

  it("runs a batch, advances the cursor and schedules the next", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 3 });

      const result = await actor.runBatch(testDelivery(id), {
        batch: 0,
      });

      expect(result).toEqual({ ran: true, processed: 10, done: false });
      const job = await jobRow(db, id);
      expect(job.cursor).toEqual({ batch: 1, value: { at: 1 } });
      expect(job.processed).toBe(10);
      expect(job.total).toBe(30);
      expect(job.status).toBe("running");
      expect(await scheduled(db, id)).toHaveLength(2);
    });
  });

  // `scheduleBatch` attributes every batch's row to the ctx that caused it.
  // Dropping that survived every test: rows went out `attributed_to = null`,
  // and BudgetActor then booked every job-driven model call to nobody.
  it("attributes batch 0's row to the starter, and batch 1's through the chain", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 3 });

      const [first] = await scheduled(db, id);
      if (first === undefined) throw new Error("no batch-0 row");
      expect(first.attributedTo).toBe(OWNER);

      // Delivered the way the outbox delivers it: a viewerless system ctx
      // whose causedBy is that row, so attribution has to follow the chain.
      await actor.runBatch(deliveryCtx(first.id), { batch: 0 });
      const next = (await scheduled(db, id)).find((row) => row.id !== first.id);
      expect(next?.payload).toEqual({ batch: 1 });
      expect(next?.attributedTo).toBe(OWNER);
    });
  });

  it("hands processBatch a budget sized to its own runBatch timeout", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 3 });
      const before = Date.now();
      await actor.runBatch(testDelivery(id), { batch: 0 });
      const after = Date.now();
      // DemoJobActor borrows ProbeJobActor's handle (the mock above), so its
      // runBatch timeout is the one that descriptor declares.
      const timeout = actorMethodTimeout(ProbeJobActorDescriptor, "runBatch");
      const deadline = actor.seen[0]?.budget.deadline ?? 0;
      expect(deadline).toBeGreaterThanOrEqual(
        before + timeout - BATCH_BUDGET_MARGIN_MS,
      );
      expect(deadline).toBeLessThanOrEqual(
        after + timeout - BATCH_BUDGET_MARGIN_MS,
      );
    });
  });

  it("completes on the last batch and schedules nothing further", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 2 });

      await actor.runBatch(systemCtx("s"), { batch: 0 });
      const last = await actor.runBatch(systemCtx("s"), { batch: 1 });

      expect(last).toEqual({ ran: true, processed: 10, done: true });
      const job = await jobRow(db, id);
      expect(job.status).toBe("completed");
      expect(job.processed).toBe(20);
      expect(job.finishedAt).not.toBeNull();
      expect(await scheduled(db, id)).toHaveLength(2); // batch 0 and batch 1
    });
  });

  it("drops a re-delivered batch instead of running it twice (§8.4)", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 3 });
      await actor.runBatch(systemCtx("s"), { batch: 0 });

      const again = await actor.runBatch(systemCtx("s"), { batch: 0 });

      expect(again).toEqual({ ran: false, reason: "duplicate" });
      expect(actor.seen.map((s) => s.batch)).toEqual([0]);
      expect((await jobRow(db, id)).processed).toBe(10);
    });
  });

  it("records the error and lets the outbox own the retry", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 3, failAt: 0 });

      // Attempt 9 of 10: the outbox will deliver this row once more.
      const delivery = await deliveringAttempt(db, id, MAX_ATTEMPTS - 2);
      await expect(actor.runBatch(delivery, { batch: 0 })).rejects.toThrow(
        /batch 0 exploded/,
      );

      const job = await jobRow(db, id);
      expect(job.attempts).toBe(1);
      expect(job.lastError).toContain("batch 0 exploded");
      // The cursor did not move, so the retry re-runs the same batch.
      expect(job.cursor).toEqual({ batch: 0, value: null });
      expect(job.status).toBe("running");
      expect(job.finishedAt).toBeNull();
    });
  });

  /* ---- D3: a job whose batch the outbox gives up on is `failed` ---------- */

  it("fails the job on the outbox's last attempt, and a redelivery finds it terminal", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 3, failAt: 0 });

      // Attempt 10 of 10: `OutboxActor.#fail` will dead-letter this row.
      const delivery = await deliveringAttempt(db, id, MAX_ATTEMPTS - 1);
      await expect(actor.runBatch(delivery, { batch: 0 })).rejects.toThrow(
        /batch 0 exploded/,
      );

      const job = await jobRow(db, id);
      expect(job.status).toBe("failed");
      expect(job.finishedAt).not.toBeNull();
      expect(job.lastError).toContain("batch 0 exploded");
      expect((await actor.get(userCtx(OWNER, "r"))).status).toBe("failed");

      // An operator requeue, or a reclaim race, delivers it again: nothing runs.
      expect(await actor.runBatch(delivery, { batch: 0 })).toEqual({
        ran: false,
        reason: "terminal",
      });
      expect(actor.seen).toHaveLength(1);
    });
  });

  it("fails the job on the first attempt when no retry can clear the failure", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), {
        batches: 3,
        failAt: 0,
        failWith: "validation",
      });

      // Attempt 1: `isPermanentFailure` dead-letters a VALIDATION at once.
      const delivery = await deliveringAttempt(db, id, 0);
      await expect(
        actor.runBatch(delivery, { batch: 0 }),
      ).rejects.toBeInstanceOf(ValidationError);

      const job = await jobRow(db, id);
      expect(job.status).toBe("failed");
      expect(job.attempts).toBe(1);
      expect(job.finishedAt).not.toBeNull();
    });
  });

  it("does not fail the job when the reclaim sweep has already taken the row back", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 3, failAt: 0 });

      // The count says "last", but the row is `pending` again: a later
      // delivery is coming, and it — not this stale turn — decides.
      const delivery = await deliveringAttempt(
        db,
        id,
        MAX_ATTEMPTS - 1,
        "pending",
      );
      await expect(actor.runBatch(delivery, { batch: 0 })).rejects.toThrow(
        /batch 0 exploded/,
      );
      expect((await jobRow(db, id)).status).toBe("running");
    });
  });

  it("fails the job when the failing turn was not an outbox delivery at all", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 3, failAt: 0 });

      // No outbox row stands behind this turn, so nothing will retry it.
      await expect(
        actor.runBatch(systemCtx("forced-by-hand"), { batch: 0 }),
      ).rejects.toThrow(/batch 0 exploded/);
      expect((await jobRow(db, id)).status).toBe("failed");
    });
  });

  it("returns JobDto from start, get and cancel: no cursor, no payload, ISO timestamps", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      const started = await actor.start(userCtx(OWNER, "req"), {
        batches: 3,
      });
      const read = await actor.get(userCtx(OWNER, "r"));
      const cancelled = await actor.cancel(userCtx(OWNER, "r"));

      for (const dto of [started, read, cancelled]) {
        expect(dto).not.toHaveProperty("cursor");
        expect(dto).not.toHaveProperty("payload");
        expect(typeof dto.createdAt).toBe("string");
        expect(new Date(dto.createdAt).toISOString()).toBe(dto.createdAt);
        expect(dto.id).toBe(id);
      }
      expect(typeof started.startedAt).toBe("string");
      expect(cancelled.cancelRequested).toBe(true);
    });
  });

  it("stops at the next batch when cancellation is requested", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 5 });
      await actor.runBatch(systemCtx("s"), { batch: 0 });

      await actor.cancel(userCtx(OWNER, "req"));
      const after = await actor.runBatch(systemCtx("s"), { batch: 1 });

      expect(after).toEqual({ ran: false, reason: "cancelled" });
      const job = await jobRow(db, id);
      expect(job.status).toBe("cancelled");
      expect(job.finishedAt).not.toBeNull();
      // Batch 1's row was scheduled before the cancel; batch 2 never was.
      expect(await scheduled(db, id)).toHaveLength(2);
      expect(actor.seen.map((s) => s.batch)).toEqual([0]);
    });
  });

  it("is idempotent on start: a re-delivery starts no second chain", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 3 });

      await actor.start(userCtx(OWNER, "req"), { batches: 3 });

      expect(await scheduled(db, id)).toHaveLength(1);
    });
  });

  /* ---- §1.6: owner, stranger, admin/system on every viewer-dependent method */

  it("shows a job to its owner, an admin and system", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 1 });

      expect((await actor.get(userCtx(OWNER, "r"))).id).toBe(id);
      expect((await actor.get(adminCtx("root", "r"))).id).toBe(id);
      expect((await actor.get(systemCtx("r"))).id).toBe(id);
    });
  });

  it("hides a job from a stranger and from anonymous", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 1 });

      await expect(actor.get(userCtx(STRANGER, "r"))).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(actor.get(anonymousCtx("r"))).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(actor.cancel(userCtx(STRANGER, "r"))).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect((await jobRow(db, id)).cancelRequested).toBe(false);
    });
  });

  it("refuses runBatch to anything but system (§1.6)", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 1 });

      await expect(
        actor.runBatch(userCtx(OWNER, "r"), { batch: 0 }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.runBatch(adminCtx("root", "r"), { batch: 0 }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("refuses to start a job for an anonymous caller", async () => {
    await withTestDb(async (db) => {
      const actor = await jobActor(db, randomUUID());
      await expect(
        actor.start(anonymousCtx("r"), { batches: 1 }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  it("refuses to run a job belonging to another kind", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      await (await jobActor(db, id)).start(userCtx(OWNER, "req"), {
        batches: 1,
      });

      const wrong = await activate(createActor(OtherJobActor, id, db));
      await expect(wrong.get(adminCtx("root", "r"))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  it("reports an unknown job id as not found", async () => {
    await withTestDb(async (db) => {
      const actor = await jobActor(db, randomUUID());
      await expect(actor.get(adminCtx("root", "r"))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  /**
   * E5b. `get` promises "anyone else is told it does not exist, because
   * knowing a job id is running is itself information", and until this test
   * the three ways it says so were three different sentences — the wrong-kind
   * one naming *another user's job kind*, from a check that runs before the
   * owner check and is reachable through `recipePhotoJob(jobId:)`.
   *
   * Asserted as an equality between the arms rather than against a literal:
   * a change that moves all three stays green, one that moves a single arm
   * does not, which is the only property that matters here.
   */
  it("says absent, wrong-kind and not-yours in one indistinguishable way", async () => {
    await withTestDb(async (db) => {
      const ownedId = randomUUID();
      await (await jobActor(db, ownedId)).start(userCtx(OWNER, "req"), {
        batches: 1,
      });

      const refusal = async (
        read: () => Promise<unknown>,
        key: string,
      ): Promise<string> =>
        await read().then(
          () => "resolved",
          (error: Error) =>
            `${error.name}: ${error.message.replace(key, "<id>")}`,
        );

      // Every arm is read through the *same* actor class, because that is what
      // a caller controls: `recipePhotoJob(jobId:)` always addresses
      // `RecipePhotoJobActor` and varies only the id.
      //
      // 1 · no row at all — `requireAggregate()`'s own arm.
      const absentId = randomUUID();
      const absent = await jobActor(db, absentId);
      // 2 · a real row of another subclass's kind, read by its own owner, so
      //     only the kind check can refuse.
      const otherKindId = randomUUID();
      await (await activate(createActor(OtherJobActor, otherKindId, db))).start(
        userCtx(OWNER, "req"),
        { batches: 1 },
      );
      const wrongKind = await jobActor(db, otherKindId);
      // 3 · the right row, the right kind, the wrong viewer.
      const notYours = await jobActor(db, ownedId);

      const arms = [
        await refusal(() => absent.get(adminCtx("root", "r")), absentId),
        await refusal(() => wrongKind.get(userCtx(OWNER, "r")), otherKindId),
        await refusal(() => notYours.get(userCtx(STRANGER, "r")), ownedId),
      ];
      expect(arms[0]).not.toBe("resolved");
      expect(new Set(arms).size).toBe(1);
      // And `cancel`, which carries the same check on the write path.
      expect(
        await refusal(() => notYours.cancel(userCtx(STRANGER, "r")), ownedId),
      ).toBe(arms[0]);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Concealment: somebody else's job and no job answer alike                    */
/* -------------------------------------------------------------------------- */

/**
 * "Knowing a job id is running is itself information" (`get`'s doc), so every
 * method a stranger can reach answers a real job and a made-up id with the
 * same `{ code, message }` — and so does a real job addressed through the
 * wrong job actor type.
 */
describe.skipIf(skip)("JobActor concealment", () => {
  afterAll(closeTestDb);

  const CALLS: readonly [
    string,
    string,
    (actor: JobActor<DemoCursor, DemoPayload>, ctx: Ctx) => Promise<unknown>,
  ][] = [
    ["get", "NOT_FOUND", (actor, ctx) => actor.get(ctx)],
    ["cancel", "NOT_FOUND", (actor, ctx) => actor.cancel(ctx)],
    ["runBatch", "FORBIDDEN", (actor, ctx) => actor.runBatch(ctx, {})],
  ];

  it.each(CALLS)("%s", async (_method, code, call) => {
    await withTestDb(async (db) => {
      const real = randomUUID();
      await (await jobActor(db, real)).start(userCtx(OWNER, "r-owner"), {
        batches: 2,
      });
      const absent = randomUUID();
      const stranger = userCtx(STRANGER, "r-stranger");

      const hidden = await refusalOf(
        async () => call(await jobActor(db, real), stranger),
        real,
      );
      const missing = await refusalOf(
        async () => call(await jobActor(db, absent), stranger),
        absent,
      );
      expect(hidden).toEqual(missing);
      expect(hidden.code).toBe(code);

      // The owner's own job, through the wrong actor type: also absent.
      const wrongKind = await refusalOf(
        async () =>
          call(
            await activate(createActor(OtherJobActor, real, db)),
            userCtx(OWNER, "r-owner"),
          ),
        real,
      );
      const wrongKindAbsent = await refusalOf(
        async () =>
          call(
            await activate(createActor(OtherJobActor, absent, db)),
            userCtx(OWNER, "r-owner"),
          ),
        absent,
      );
      expect(wrongKind).toEqual(wrongKindAbsent);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* markFailed — the compensation every runBatch declares as onDead             */
/* -------------------------------------------------------------------------- */

describe.skipIf(skip)("JobActor.markFailed", () => {
  afterAll(closeTestDb);

  const notice = (
    batch: number,
    reason: "attempts" | "permanent" | "reclaim" = "reclaim",
  ) => ({
    deadOutboxId: randomUUID(),
    deadMethod: "runBatch",
    reason,
    deadPayload: { batch },
  });

  it("fails a running job waiting on the dead batch, and says why", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 3 });

      expect(await actor.markFailed(testDelivery("c1"), notice(0))).toEqual({
        compensated: true,
      });
      const job = await jobRow(db, id);
      expect(job.status).toBe("failed");
      expect(job.finishedAt).not.toBeNull();
      expect(job.lastError).toContain("gave up on batch 0 (reclaim)");
      // …and the chain's own redelivery now finds it terminal.
      expect(await actor.runBatch(testDelivery("b0"), { batch: 0 })).toEqual({
        ran: false,
        reason: "terminal",
      });
    });
  });

  it("keeps the error a failing turn recorded", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 3, failAt: 0 });
      await expect(
        actor.runBatch(testDelivery("b0"), { batch: 0 }),
      ).rejects.toThrow(/exploded/);
      await actor.markFailed(testDelivery("c1"), notice(0, "attempts"));
      expect((await jobRow(db, id)).lastError).toContain("batch 0 exploded");
    });
  });

  it("is a no-op on a terminal job, a job past the dead batch, and no job", async () => {
    await withTestDb(async (db) => {
      const done = randomUUID();
      const finished = await jobActor(db, done);
      await finished.start(userCtx(OWNER, "req"), { batches: 1 });
      await finished.runBatch(testDelivery("d0"), { batch: 0 });
      expect((await jobRow(db, done)).status).toBe("completed");
      expect(await finished.markFailed(testDelivery("c"), notice(0))).toEqual({
        compensated: false,
        reason: "terminal",
      });
      expect((await jobRow(db, done)).status).toBe("completed");

      const moving = randomUUID();
      const moved = await jobActor(db, moving);
      await moved.start(userCtx(OWNER, "req"), { batches: 3 });
      await moved.runBatch(testDelivery("m0"), { batch: 0 });
      // A row for batch 0 died, but the chain is on batch 1: nothing ended.
      expect(await moved.markFailed(testDelivery("c"), notice(0))).toEqual({
        compensated: false,
        reason: "stale",
      });
      expect((await jobRow(db, moving)).status).toBe("running");

      const nobody = await jobActor(db, randomUUID());
      expect(await nobody.markFailed(testDelivery("c"), notice(0))).toEqual({
        compensated: false,
        reason: "absent",
      });
    });
  });

  it("is the outbox's alone: anyone else is refused, admins included", async () => {
    await withTestDb(async (db) => {
      const id = randomUUID();
      const actor = await jobActor(db, id);
      await actor.start(userCtx(OWNER, "req"), { batches: 3 });
      for (const ctx of [
        userCtx(OWNER, "r"),
        adminCtx(randomUUID(), "r"),
        anonymousCtx("r"),
      ]) {
        await expect(actor.markFailed(ctx, notice(0))).rejects.toBeInstanceOf(
          ForbiddenError,
        );
      }
      await expect(
        actor.markFailed(testDelivery("c"), {
          ...notice(0),
          reason: "bored" as "reclaim",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect((await jobRow(db, id)).status).toBe("running");
    });
  });
});

describe("createBatchBudget", () => {
  const clocked = (timeoutMs: number) => {
    const clock = { now: 1_000_000 };
    return { clock, budget: createBatchBudget(timeoutMs, () => clock.now) };
  };

  it("sets the deadline at the timeout, less the turn's margin", () => {
    const { budget } = clocked(120_000);
    expect(budget.deadline).toBe(1_000_000 + 120_000 - BATCH_BUDGET_MARGIN_MS);
  });

  it("starts an item only while its worst case still ends before the deadline", () => {
    const { clock, budget } = clocked(120_000); // deadline at +115s
    expect(budget.mayStart(90_000)).toBe(true); // first: always
    clock.now += 25_000; // +25s: 25 + 90 = 115, exactly on the deadline
    expect(budget.mayStart(90_000)).toBe(true);
    clock.now += 1; // one millisecond later it no longer fits
    expect(budget.mayStart(90_000)).toBe(false);
    expect(budget.mayStart(1_000)).toBe(true); // a cheaper item still does
  });

  it("always starts the first item, even one that cannot fit, and nothing after it", () => {
    const { clock, budget } = clocked(10_000); // deadline at +5s
    expect(budget.mayStart(90_000)).toBe(true);
    clock.now += 1;
    expect(budget.mayStart(90_000)).toBe(false);
    expect(budget.mayStart(90_000)).toBe(false);
  });

  it("refuses the second item at once when the first has already overrun", () => {
    const { clock, budget } = clocked(120_000);
    expect(budget.mayStart(90_000)).toBe(true);
    clock.now += 200_000;
    expect(budget.mayStart(0)).toBe(false);
  });
});
