/**
 * `OutboxActor` against a real Postgres, with delivery stubbed.
 *
 * Everything except the network hop is exercised for real: the claim, the
 * status machine, the attempt accounting, the backoff schedule, the reclaim
 * sweep. The one thing faked is `deliver`, because a real sidecar would add a
 * second process to a test whose subject is a table.
 *
 * The two acceptance criteria that *cannot* be tested here — a kill before
 * delivery, and a reminder surviving a restart — need a real host and are run
 * on the compose stack; `scripts/a5-acceptance.sh` is that harness.
 */
import {
  actorMethodMeta,
  adminCtx,
  ConflictError,
  ForbiddenError,
  PlaceActorDescriptor,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { cellars, outbox } from "@cellar-assistant/db";
import { eq, gt, inArray, sql } from "@cellar-assistant/db/orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { ActorBase } from "../lib/actor-base.ts";
import { isWellFormedCtx } from "../lib/actor-method-allowlist.ts";
import { aiRequestTimeoutMs } from "../lib/ai/config.ts";
import type { DbOrTx } from "../lib/db.ts";
import {
  enqueueOutbox,
  enqueueOutboxOnce,
  insertCompensations,
} from "../lib/outbox.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import {
  activate,
  closeTestDb,
  createActor,
  insertOutboxRowForTest,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import {
  BACKOFF_CAP_MS,
  backoffMs,
  type ClaimedRow,
  DEFAULT_DELIVERY_TIMEOUT_MS,
  declaredDeliveryTimeoutMs,
  deliveryArgs,
  deliveryTimeoutMs,
  drainDeadlineMs,
  HEARTBEAT_INTERVAL_MS,
  isPermanentFailure,
  MAX_ATTEMPTS,
  MAX_DELIVERY_TIMEOUT_MS,
  MAX_DRAIN_DEADLINE_MS,
  OUTBOX_ACTOR_ID,
  OutboxActor,
  outboxBacklog,
  pairDeliveryTimeoutMs,
  RECLAIM_AFTER_MS,
} from "./outbox-actor.ts";

/**
 * §1.4's rule, as a class: a domain write and the outbox row that follows from
 * it, in one transaction. This is the shape every B workstream writes.
 */
class DemoWritingActor extends ActorBase {
  static readonly category = "entity" as const;

  async createCellar(ownerId: string, name: string, explode = false) {
    return this.tx(async (tx) => {
      const [row] = await tx
        .insert(cellars)
        .values({ name, createdById: ownerId, privacy: "PRIVATE" })
        .returning({ id: cellars.id });
      if (row === undefined) throw new Error("no cellar row");
      // A *declared* pair (`OUTBOX_TARGETS`), because the drainer now refuses
      // anything else — see "the allow-list" below. Which pair a fixture names
      // has never mattered here (`deliver` is stubbed); that it is a real one
      // now does.
      const outboxId = await enqueueOutbox(
        tx,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: row.id,
        },
      );
      if (explode) throw new Error("boom, after both writes");
      return { cellarId: row.id, outboxId };
    });
  }
}

/**
 * `OutboxActor` with the network hop replaced — `invoke`, below `deliver`, so
 * every delivery still builds its arguments with the real `deliveryArgs`.
 */
class StubbedOutboxActor extends OutboxActor {
  readonly delivered: ClaimedRow[] = [];
  /** What each delivery handed the sidecar: `[ctx, payload]`. */
  readonly sent: (readonly unknown[])[] = [];
  /** The timeout each delivery handed the sidecar, keyed `Actor.method`. */
  readonly timeouts: [string, number][] = [];
  failure: Error | null = null;
  /** Makes a delivery take long enough to blow the drain deadline. */
  slowMs = 0;
  /**
   * Runs *inside* the delivery, before it succeeds or fails — i.e. in exactly
   * the window where a host stalls and the reclaim sweep takes its row away.
   */
  during: (() => Promise<void>) | null = null;

  protected override async deliver(row: ClaimedRow): Promise<void> {
    this.delivered.push(row);
    await super.deliver(row);
  }

  protected override async invoke(
    targetActor: string,
    _targetId: string,
    method: string,
    args: readonly unknown[],
    timeoutMs: number,
  ): Promise<void> {
    this.sent.push(args);
    this.timeouts.push([`${targetActor}.${method}`, timeoutMs]);
    if (this.slowMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.slowMs));
    }
    if (this.during !== null) await this.during();
    if (this.failure !== null) throw this.failure;
  }
}

const drainer = (db: DbOrTx) =>
  activate(createActor(StubbedOutboxActor, OUTBOX_ACTOR_ID, db));

const rowById = async (db: DbOrTx, id: string) => {
  const [row] = await db.select().from(outbox).where(eq(outbox.id, id));
  if (row === undefined) throw new Error(`outbox row ${id} vanished`);
  return row;
};

/** Pretend the backoff has elapsed, so the next drain sees the row as due. */
const makeDue = async (db: DbOrTx, id: string): Promise<void> => {
  await db.execute(sql`update outbox set run_after = now() where id = ${id}`);
};

/**
 * The highest `seq` in `outbox` right now.
 *
 * `outbox` is a real table in a database other suites — and the running compose
 * stack — commit to, so "no row with this method exists" is not a statement a
 * test can make: it will one day meet somebody else's committed row and fail
 * for a reason that has nothing to do with it. Anchoring on `seq` scopes the
 * assertion to *this* test's own writes, which is what it always meant.
 */
const outboxHighWater = async (db: DbOrTx): Promise<bigint> => {
  // `outbox.seq` is `bigserial`, so it arrives as a string and is compared as
  // a bigint — never coerced to `number`, which would silently lose precision.
  const [row] = await db
    .select({ seq: sql<string>`coalesce(max(${outbox.seq}), 0)::text` })
    .from(outbox);
  return BigInt(row?.seq ?? "0");
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("outbox (§1.4)", () => {
  afterAll(closeTestDb);

  it("commits a domain row and its outbox row in one transaction", async () => {
    await withTestDb(async (db) => {
      const ownerId = await seedUser(db);
      const actor = createActor(DemoWritingActor, "demo", db);

      const { cellarId, outboxId } = await actor.createCellar(ownerId, "Both");

      const [cellar] = await db
        .select({ id: cellars.id })
        .from(cellars)
        .where(eq(cellars.id, cellarId));
      const entry = await rowById(db, outboxId);
      expect(cellar?.id).toBe(cellarId);
      expect(entry.targetActor).toBe("ItemActor");
      expect(entry.targetId).toBe(cellarId);
      expect(entry.method).toBe("regenerateVector");
      expect(entry.status).toBe("pending");
      expect(entry.attempts).toBe(0);
    });
  });

  it("loses both if the transaction fails: no orphan intent, no silent work", async () => {
    await withTestDb(async (db) => {
      const ownerId = await seedUser(db);
      const actor = createActor(DemoWritingActor, "demo", db);
      const before = await outboxHighWater(db);

      await expect(
        actor.createCellar(ownerId, "Neither", true),
      ).rejects.toThrow(/boom/);

      const orphans = await db
        .select({ id: outbox.id })
        .from(outbox)
        .where(gt(outbox.seq, before));
      const written = await db
        .select({ id: cellars.id })
        .from(cellars)
        .where(eq(cellars.name, "Neither"));
      expect(orphans).toEqual([]);
      expect(written).toEqual([]);
    });
  });

  /**
   * A7b. §1.4 always claimed the outbox "drains rows in order"; until `seq` it
   * did not, and the reason is worth spelling out because it is *not* the
   * `ORDER BY`.
   *
   * A5 ordered the claim's subquery by `(run_after, created_at, id)`. Every row
   * written by one transaction shares `created_at` (transaction-*start* time),
   * so the tie fell through to a random v4 uuid. But that subquery only chose
   * *which* rows were claimed: `UPDATE … WHERE id IN (SELECT … ORDER BY …)
   * RETURNING` emits rows in the order the update walks the **heap**, not the
   * order the subquery asked for. Measured against this database: with ids
   * deliberately assigned in reverse, the old claim still returned insertion
   * order — its `ORDER BY` had no effect on delivery order at all.
   *
   * Heap order equals insertion order only while a table has never been
   * updated, and every outbox row is updated the moment it is claimed, retried
   * or reclaimed. The rewrite below is that state, and it is where the old
   * claim came apart: it delivered every odd row before every even one. Revert
   * `#claim` to A5's single `UPDATE … RETURNING` and this fails on the first
   * run, deterministically.
   */
  it("drains rows written in one transaction in insertion order (seq)", async () => {
    await withTestDb(async (db) => {
      const targets = Array.from({ length: 24 }, (_, n) => `step-${n}`);
      const ids: string[] = [];
      for (const targetId of targets) {
        // `db` *is* the transaction (`withTestDb`), so this is the §1.4 shape:
        // several outbox rows committed by one write.
        ids.push(
          await enqueueOutbox(
            db,
            OUTBOX_TARGETS["ItemActor.regenerateVector"],
            {
              targetId,
              // A declared pair; the probe is identified by `target_id` below,
              // not by a made-up method name the allow-list would refuse.
            },
          ),
        );
      }

      const rows = await db
        .select({ createdAt: outbox.createdAt, seq: outbox.seq })
        .from(outbox)
        .where(inArray(outbox.id, ids));
      // The precondition that made the old key arbitrary, asserted rather than
      // assumed: every row shares one `created_at`.
      expect(new Set(rows.map((r) => r.createdAt.getTime())).size).toBe(1);
      // …and the column that replaces it does not tie.
      expect(new Set(rows.map((r) => r.seq)).size).toBe(targets.length);

      // Give half the rows the heap position a claimed-and-retried row has.
      await db.execute(sql`
        update outbox set payload = payload
        where target_id like 'step-%'
          and (split_part(target_id, '-', 2))::int % 2 = 0
      `);

      const actor = await drainer(db);
      const result = await actor.drain(adminCtx("admin-1", "ordering"));

      expect(result.claimed).toBe(targets.length);
      expect(actor.delivered.map((r) => r.targetId)).toEqual(targets);
    });
  });

  it("delivers due rows and marks them delivered", async () => {
    await withTestDb(async (db) => {
      const first = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-1",
          payload: { reason: "create", itemType: "WINE", itemId: "1" },
        },
      );
      const second = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-2",
        },
      );

      const actor = await drainer(db);
      const result = await actor.drain(adminCtx("admin-1", "req"));

      expect(result.claimed).toBe(2);
      expect(result.delivered).toBe(2);
      expect(actor.delivered.map((r) => r.targetId)).toEqual([
        "item-1",
        "item-2",
      ]);
      expect(actor.delivered[0]?.payload).toEqual({
        reason: "create",
        itemType: "WINE",
        itemId: "1",
      });
      expect((await rowById(db, first)).status).toBe("delivered");
      expect((await rowById(db, second)).status).toBe("delivered");
    });
  });

  it("leaves a row scheduled for later alone (run_after, §1.4)", async () => {
    await withTestDb(async (db) => {
      const later = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["MaintenanceActor.reapOrphanFiles"],
        {
          targetId: "singleton",
          delayMs: 86_400_000,
        },
      );

      const actor = await drainer(db);
      const result = await actor.drain(adminCtx("admin-1", "req"));

      expect(result.claimed).toBe(0);
      expect(actor.delivered).toEqual([]);
      expect((await rowById(db, later)).status).toBe("pending");
    });
  });

  it("retries a failure with backoff and records the error", async () => {
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-1",
        },
      );

      const actor = await drainer(db);
      actor.failure = new Error("target said no");
      const result = await actor.drain(adminCtx("admin-1", "req"));

      expect(result).toMatchObject({ delivered: 0, retried: 1, dead: 0 });
      const row = await rowById(db, id);
      expect(row.status).toBe("pending");
      expect(row.attempts).toBe(1);
      expect(row.lastError).toContain("target said no");
      // 2s of backoff: due in the future, but not far.
      const delay = row.runAfter.getTime() - Date.now();
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(backoffMs(1) + 1_000);
    });
  });

  it("dead-letters on the tenth attempt, not the ninth (§2.7)", async () => {
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "poison",
        },
      );
      const actor = await drainer(db);
      actor.failure = new Error("still broken");

      const seen: { attempt: number; status: string }[] = [];
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        await makeDue(db, id); // the backoff has "elapsed"
        await actor.drain(adminCtx("admin-1", `req-${attempt}`));
        const row = await rowById(db, id);
        seen.push({ attempt: row.attempts, status: row.status });
      }

      expect(
        seen.slice(0, MAX_ATTEMPTS - 1).every((s) => s.status === "pending"),
      ).toBe(true);
      expect(seen.at(-1)).toEqual({ attempt: MAX_ATTEMPTS, status: "dead" });
      // A dead row is never picked up again.
      await makeDue(db, id);
      expect((await actor.drain(adminCtx("admin-1", "after"))).claimed).toBe(0);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Permanent failures: the convention `lib/ai/image-mime.ts` already states  */
  /* ---------------------------------------------------------------------- */

  it("dead-letters a VALIDATION failure on the FIRST attempt, not the tenth", async () => {
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "unfixable",
        },
      );
      const actor = await drainer(db);
      // What `lib/ai/http.ts` now raises for a provider 400, and what
      // `requireImageMime` has always raised for bytes that are not an image.
      actor.failure = new ValidationError("that is not an image");

      await actor.drain(adminCtx("admin-1", "req-1"));

      const row = await rowById(db, id);
      expect(row.status).toBe("dead");
      expect(row.attempts).toBe(1);
      expect(row.lastError).toContain("not an image");

      // And it stays dead: no further attempt is ever made.
      await makeDue(db, id);
      expect((await actor.drain(adminCtx("admin-1", "after"))).claimed).toBe(0);
    });
  });

  it("still retries a CONFLICT — the classification is narrow on purpose", async () => {
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["MenuScanActor.process"],
        {
          targetId: "not-yet",
        },
      );
      const actor = await drainer(db);
      // `FileActor`'s real one: the PUT has not landed *yet*. Retrying is the
      // whole point, so this must NOT be treated as permanent.
      actor.failure = new ConflictError("file abc is not verified yet");

      await actor.drain(adminCtx("admin-1", "req-1"));

      const row = await rowById(db, id);
      expect(row.status).toBe("pending");
      expect(row.attempts).toBe(1);
    });
  });

  it("classifies only VALIDATION as permanent", () => {
    expect(isPermanentFailure(new ValidationError("x"))).toBe(true);
    // Every other typed error is reachable transiently — see the doc comment
    // on `isPermanentFailure` for the case behind each one.
    expect(isPermanentFailure(new ConflictError("x"))).toBe(false);
    expect(isPermanentFailure(new ForbiddenError("x"))).toBe(false);
    // An opaque failure (a crash, a `SidecarError`) is retried, not buried.
    expect(isPermanentFailure(new Error("kaboom"))).toBe(false);
    expect(isPermanentFailure("kaboom")).toBe(false);
  });

  it("dead-letters a row targeting the outbox itself (reentrancy, §8.5)", async () => {
    await withTestDb(async (db) => {
      const id = await insertOutboxRowForTest(db, {
        targetActor: "OutboxActor",
        targetId: OUTBOX_ACTOR_ID,
        method: "drain",
      });
      const actor = await drainer(db);

      const result = await actor.drain(adminCtx("admin-1", "req"));

      expect(result.dead).toBe(1);
      expect(actor.delivered).toEqual([]);
      const row = await rowById(db, id);
      expect(row.status).toBe("dead");
      expect(row.lastError).toContain("reentrancy");
    });
  });

  /**
   * The allow-list (§1.6, `services/actors/src/lib/outbox-targets.ts`).
   *
   * The static half — `outbox-targets.test.ts` — fences every enqueue site
   * written in the source. This is the half that sees the *row*: a pair
   * assembled at runtime, a row left by an older deploy, a row inserted by
   * anything else holding the Postgres credential. Those cannot be caught by
   * any scan of `services/actors`, and until this check they were invoked with
   * `systemCtx` — which `bypassesPolicy` opens every owner gate for.
   */
  describe("the allow-list", () => {
    it("refuses a row naming an undeclared method, and never invokes it", async () => {
      await withTestDb(async (db) => {
        const id = await insertOutboxRowForTest(db, {
          targetActor: "ItemActor",
          // `ItemActor.delete` is a real method and is *not* a declared outbox
          // target. That is the interesting case: a reachable, destructive
          // method one row away from running with policy off.
          targetId: "item-1",
          method: "delete",
        });
        const actor = await drainer(db);

        const result = await actor.drain(adminCtx("admin-1", "req"));

        expect(result.dead).toBe(1);
        expect(result.delivered).toBe(0);
        // Not "failed at the far end" — never called at all.
        expect(actor.delivered).toEqual([]);
        const row = await rowById(db, id);
        expect(row.status).toBe("dead");
        expect(row.lastError).toContain("not in OUTBOX_TARGETS");
      });
    });

    it("refuses a row naming an actor that is not a declared target", async () => {
      await withTestDb(async (db) => {
        const id = await insertOutboxRowForTest(db, {
          targetActor: "EmbeddingActor",
          targetId: "cellar-1",
          method: "regenerateVector",
        });
        const actor = await drainer(db);

        await actor.drain(adminCtx("admin-1", "req"));

        expect(actor.delivered).toEqual([]);
        expect((await rowById(db, id)).status).toBe("dead");
      });
    });

    it("dead-letters on attempt 1 rather than retrying for seventeen minutes", async () => {
      await withTestDb(async (db) => {
        const id = await insertOutboxRowForTest(db, {
          targetActor: "ItemActor",
          targetId: "item-1",
          method: "delete",
        });
        const actor = await drainer(db);
        await actor.drain(adminCtx("admin-1", "req"));

        const row = await rowById(db, id);
        // One attempt charged, terminal. A refused capability re-knocking nine
        // more times is nine more chances and nine identical log lines.
        expect(row.attempts).toBe(1);
        expect(row.status).toBe("dead");

        // …and a second drain does not pick it up again.
        const second = await actor.drain(adminCtx("admin-1", "req2"));
        expect(second.claimed).toBe(0);
      });
    });

    it("still delivers every declared pair", async () => {
      await withTestDb(async (db) => {
        const ids = await Promise.all([
          enqueueOutbox(db, OUTBOX_TARGETS["ItemActor.regenerateVector"], {
            targetId: "item-1",
          }),
          enqueueOutbox(
            db,
            OUTBOX_TARGETS["MaintenanceActor.reapOrphanFiles"],
            {
              targetId: "singleton",
            },
          ),
          // The pair no static scan can resolve: `JobActor.scheduleBatch`
          // names `this.getActorType()`. The registry declares all six
          // subclasses, so the runtime check is what actually validates it.
          enqueueOutbox(db, OUTBOX_TARGETS["MenuMatchJobActor.runBatch"], {
            targetId: "job-1",
          }),
        ]);
        const actor = await drainer(db);

        const result = await actor.drain(adminCtx("admin-1", "req"));

        expect(result).toMatchObject({ delivered: ids.length, dead: 0 });
      });
    });
  });

  it("reclaims a row left in `delivering` by a host that died", async () => {
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-1",
        },
      );
      await db.execute(sql`
        update outbox
        set status = 'delivering', updated_at = now() - interval '30 minutes'
        where id = ${id}
      `);

      const actor = await drainer(db);
      const result = await actor.drain(adminCtx("admin-1", "req"));

      // Reclaimed, charged an attempt, and delivered again in the same drain
      // only after its backoff — so this pass just re-queues it.
      expect(result.reclaimed).toBe(1);
      const row = await rowById(db, id);
      expect(row.status).toBe("pending");
      expect(row.attempts).toBe(1);
      expect(row.lastError).toContain("never completed");
    });
  });

  it("leaves a row that is still being delivered alone", async () => {
    // The other side of the sweep, and the one nothing asserted: the test
    // above ages its row by 30 minutes, so it proves only that a *stale* claim
    // is taken. Deleting `updated_at < now() - RECLAIM_AFTER` entirely left
    // all 28 tests here green — and the sweep runs first in every drain, so
    // without the window every live delivery is reclaimed underneath itself
    // on the next drainer's pass, charged an attempt it never earned, and
    // dead-lettered after ten of them.
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-1",
        },
      );
      await db.execute(sql`
        update outbox
        set status = 'delivering', claim_token = gen_random_uuid(),
            updated_at = now()
        where id = ${id}
      `);
      expect(RECLAIM_AFTER_MS).toBeGreaterThan(60_000);

      const actor = await drainer(db);
      const result = await actor.drain(adminCtx("admin-1", "req"));

      expect(result.reclaimed).toBe(0);
      const row = await rowById(db, id);
      expect(row.status).toBe("delivering");
      expect(row.attempts).toBe(0);
      expect(row.lastError).toBeNull();
    });
  });

  // LOW-3: the loop had no try/finally, so one outcome write that threw
  // abandoned the rest of the claimed batch to the reclaim sweep, which
  // charges an attempt for a delivery that never happened.
  it("releases the rows it never reached when an outcome write throws, uncharged", async () => {
    await withTestDb(async (db) => {
      const ids: string[] = [];
      for (const n of [1, 2, 3]) {
        ids.push(
          await enqueueOutbox(
            db,
            OUTBOX_TARGETS["ItemActor.regenerateVector"],
            {
              targetId: `item-broken-write-${n}`,
            },
          ),
        );
      }
      // The third row is on its last attempt: charged by a reclaim it would
      // be dead-lettered without ever being tried a tenth time.
      await db
        .update(outbox)
        .set({ attempts: MAX_ATTEMPTS - 1 })
        .where(eq(outbox.id, ids[2] ?? ""));

      class BrokenWriteOutboxActor extends StubbedOutboxActor {
        breakNextTx = false;
        protected override async tx<T>(
          fn: (tx: DbOrTx) => Promise<T>,
        ): Promise<T> {
          if (this.breakNextTx) {
            this.breakNextTx = false;
            throw new Error("connection terminated unexpectedly");
          }
          return super.tx(fn);
        }
      }
      const actor = await activate(
        createActor(BrokenWriteOutboxActor, OUTBOX_ACTOR_ID, db),
      );
      // Inside the first delivery: the write recording its success breaks.
      actor.during = async () => {
        actor.breakNextTx = true;
        actor.during = null;
      };

      await expect(actor.drain(adminCtx("admin-1", "req"))).rejects.toThrow(
        /connection terminated/,
      );
      expect(actor.delivered.map((row) => row.id)).toEqual([ids[0]]);

      const rows = await Promise.all(ids.map((id) => rowById(db, id)));
      expect(
        rows.map((r) => [r.status, r.attempts, r.claimToken === null]),
      ).toEqual([
        // Attempted: left for the sweep, which is right to charge it.
        ["delivering", 0, false],
        // Never reached: pending again, nothing charged, claim cleared.
        ["pending", 0, true],
        ["pending", MAX_ATTEMPTS - 1, true],
      ]);

      // And the next drain does try them.
      actor.delivered.length = 0;
      await actor.drain(adminCtx("admin-1", "req"));
      expect(actor.delivered.map((row) => row.id)).toEqual([ids[1], ids[2]]);
    });
  });

  it("releases claimed-but-unattempted rows when the drain runs out of time", async () => {
    await withTestDb(async (db) => {
      const ids = await Promise.all(
        [1, 2, 3].map((n) =>
          enqueueOutbox(db, OUTBOX_TARGETS["ItemActor.regenerateVector"], {
            targetId: `item-${n}`,
          }),
        ),
      );
      const actor = await drainer(db);
      actor.slowMs = 5;
      process.env.OUTBOX_DRAIN_DEADLINE_MS = "1";
      try {
        const result = await actor.drain(adminCtx("admin-1", "req"));

        expect(result.claimed).toBe(3);
        expect(result.delivered).toBe(1);
        expect(result.released).toBe(2);
      } finally {
        delete process.env.OUTBOX_DRAIN_DEADLINE_MS;
      }

      // The two it never got to are pending again — and, crucially, were not
      // charged an attempt for a delivery that never happened.
      const rows = await Promise.all(ids.map((id) => rowById(db, id)));
      expect(rows.map((r) => `${r.status}/${r.attempts}`)).toEqual([
        "delivered/0",
        "pending/0",
        "pending/0",
      ]);
    });
  });

  it("dead-letters a reclaimed row that has exhausted its attempts", async () => {
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-1",
        },
      );
      await db.execute(sql`
        update outbox
        set status = 'delivering',
            attempts = ${MAX_ATTEMPTS - 1},
            updated_at = now() - interval '30 minutes'
        where id = ${id}
      `);

      const actor = await drainer(db);
      await actor.drain(adminCtx("admin-1", "req"));

      const row = await rowById(db, id);
      expect(row.status).toBe("dead");
      expect(row.attempts).toBe(MAX_ATTEMPTS);
    });
  });

  it("refuses a drain from a user ctx (§1.6)", async () => {
    await withTestDb(async (db) => {
      const actor = await drainer(db);
      await expect(
        actor.drain(userCtx("someone", "req")),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Compensations: a dead letter tells its owner, in the same statement          */
/* -------------------------------------------------------------------------- */

describe.skipIf(skip)("outbox: declared compensations (onDead)", () => {
  /** A `ProbeJobActor.runBatch` row — a pair that declares `onDead`. */
  const runBatchRow = async (db: DbOrTx, attempts: number) => {
    const owner = await seedUser(db);
    const jobId = crypto.randomUUID();
    const id = await enqueueOutbox(
      db,
      OUTBOX_TARGETS["ProbeJobActor.runBatch"],
      {
        targetId: jobId,
        payload: { batch: 3 },
      },
      { attributeTo: userCtx(owner, "r") },
    );
    await db.update(outbox).set({ attempts }).where(eq(outbox.id, id));
    return { id, jobId, owner };
  };

  const compensationsFor = async (db: DbOrTx, deadId: string) =>
    db
      .select()
      .from(outbox)
      .where(sql`${outbox.payload}->>'deadOutboxId' = ${deadId}`);

  // Killed only by a distant recipe-photo test until now: a retryable
  // failure short of the last attempt is not a death, and must tell the job
  // nothing — `markFailed` on a batch the outbox is still retrying would fail
  // a job that is about to succeed.
  it("writes nothing for a failure the outbox will still retry", async () => {
    await withTestDb(async (db) => {
      const { id } = await runBatchRow(db, MAX_ATTEMPTS - 2);
      const actor = await drainer(db);
      actor.failure = new ConflictError("batch exploded, retryably");

      const result = await actor.drain(adminCtx("admin-1", "req"));
      expect(result).toMatchObject({ retried: 1, dead: 0, compensated: 0 });
      expect((await rowById(db, id)).status).toBe("pending");
      expect(await compensationsFor(db, id)).toEqual([]);
    });
  });

  it("enqueues the onDead row in the statement that dead-letters on attempts", async () => {
    await withTestDb(async (db) => {
      const { id, jobId, owner } = await runBatchRow(db, MAX_ATTEMPTS - 1);
      const actor = await drainer(db);
      actor.failure = new ConflictError("batch exploded");

      const result = await actor.drain(adminCtx("admin-1", "req"));
      expect(result).toMatchObject({ dead: 1, compensated: 1 });
      expect((await rowById(db, id)).status).toBe("dead");

      const [comp, ...more] = await compensationsFor(db, id);
      expect(more).toEqual([]);
      expect(comp).toMatchObject({
        targetActor: "ProbeJobActor",
        targetId: jobId,
        method: "markFailed",
        status: "pending",
        attempts: 0,
        payload: {
          deadOutboxId: id,
          deadMethod: "runBatch",
          reason: "attempts",
          deadPayload: { batch: 3 },
        },
        // Attributed to whoever the dead row was.
        attributedTo: owner,
      });
    });
  });

  it("says `permanent` for a failure no retry can clear, on attempt 1", async () => {
    await withTestDb(async (db) => {
      const { id } = await runBatchRow(db, 0);
      const actor = await drainer(db);
      actor.failure = new ValidationError("frozen payload");
      await actor.drain(adminCtx("admin-1", "req"));
      const [comp] = await compensationsFor(db, id);
      expect(comp?.payload).toMatchObject({ reason: "permanent" });
    });
  });

  it("compensates on the reclaim path, where the target never heard", async () => {
    await withTestDb(async (db) => {
      const { id, jobId } = await runBatchRow(db, MAX_ATTEMPTS - 1);
      await db.execute(sql`
        update outbox set status = 'delivering', claim_token = gen_random_uuid(),
          updated_at = now() - interval '30 minutes'
        where id = ${id}
      `);
      const actor = await drainer(db);
      const result = await actor.drain(adminCtx("admin-1", "req"));

      expect(result.reclaimed).toBe(1);
      expect(result.compensated).toBe(1);
      expect((await rowById(db, id)).status).toBe("dead");
      const [comp] = await compensationsFor(db, id);
      expect(comp).toMatchObject({
        targetId: jobId,
        method: "markFailed",
        payload: { reason: "reclaim", deadMethod: "runBatch" },
      });
      // The dead row itself was never delivered; the compensation was, in the
      // same drain, because it was written before the claim.
      expect(actor.delivered.map((r) => r.method)).toEqual(["markFailed"]);
      const [ctx] = actor.sent[0] as [{ delivery?: { outboxId: string } }];
      expect(ctx.delivery?.outboxId).toBe(comp?.id);
    });
  });

  it("writes nothing for a pair that declares no onDead", async () => {
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-1",
        },
      );
      await db
        .update(outbox)
        .set({ attempts: MAX_ATTEMPTS - 1 })
        .where(eq(outbox.id, id));
      const actor = await drainer(db);
      actor.failure = new ConflictError("no");
      const result = await actor.drain(adminCtx("admin-1", "req"));
      expect(result).toMatchObject({ dead: 1, compensated: 0 });
      expect(await compensationsFor(db, id)).toEqual([]);
    });
  });

  it("never compensates a compensation: a dead markFailed is only reported", async () => {
    await withTestDb(async (db) => {
      const { id } = await runBatchRow(db, MAX_ATTEMPTS - 1);
      const actor = await drainer(db);
      actor.failure = new ConflictError("still broken");
      await actor.drain(adminCtx("admin-1", "req"));
      const [comp] = await compensationsFor(db, id);
      if (comp === undefined) throw new Error("no compensation");

      await db
        .update(outbox)
        .set({ attempts: MAX_ATTEMPTS - 1, runAfter: sql`now()` })
        .where(eq(outbox.id, comp.id));
      const result = await actor.drain(adminCtx("admin-1", "req2"));
      expect(result).toMatchObject({ dead: 1, compensated: 0 });
      expect((await rowById(db, comp.id)).status).toBe("dead");
      expect(await compensationsFor(db, comp.id)).toEqual([]);
    });
  });

  it("is idempotent on deadOutboxId, so the backfill can be run again", async () => {
    // The backfill (target-stack.md §6.4) is this very insert over rows that
    // died before compensations existed. Run it twice: one row.
    await withTestDb(async (db) => {
      const { id } = await runBatchRow(db, MAX_ATTEMPTS);
      await db.update(outbox).set({ status: "dead" }).where(eq(outbox.id, id));
      const backfill = () =>
        db.execute(sql`
          with reclaimed as (
            select id, target_actor, target_id, method, payload, status,
                   case when last_error like 'reclaimed:%' then 'reclaim'
                        else 'attempts' end as dead_reason
            from outbox where id = ${id} and status = 'dead'
          )
          ${insertCompensations("reclaimed")}
        `);
      expect((await backfill()).rows).toHaveLength(1);
      expect((await backfill()).rows).toHaveLength(0);
      expect(await compensationsFor(db, id)).toHaveLength(1);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Liveness: the drain reminder's heartbeat                                     */
/* -------------------------------------------------------------------------- */

describe.skipIf(skip)("outbox: heartbeat", () => {
  const heartbeats = (lines: string[]) =>
    lines.filter((line) => line.startsWith("[outbox.heartbeat]"));

  const captureLog = () => {
    const lines: string[] = [];
    const spy = vi
      .spyOn(console, "log")
      .mockImplementation((line: unknown) => lines.push(String(line)));
    return { lines, restore: () => spy.mockRestore() };
  };

  it("measures the backlog on the database's clock", async () => {
    await withTestDb(async (db) => {
      const before = await outboxBacklog(db);
      const due = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-1",
        },
      );
      await db.execute(
        sql`update outbox set run_after = now() - interval '120 seconds' where id = ${due}`,
      );
      await enqueueOutbox(db, OUTBOX_TARGETS["ItemActor.regenerateVector"], {
        targetId: "item-2",
        delayMs: 3_600_000,
      });
      const stuck = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-3",
        },
      );
      await db.execute(
        sql`update outbox set status = 'delivering' where id = ${stuck}`,
      );

      // A host an hour behind changes nothing: the age is `now() - run_after`.
      vi.useFakeTimers({ toFake: ["Date"] });
      let after: Awaited<ReturnType<typeof outboxBacklog>>;
      try {
        vi.setSystemTime(new Date(Date.now() - 60 * 60 * 1000));
        after = await outboxBacklog(db);
      } finally {
        vi.useRealTimers();
      }
      expect(after.pending - before.pending).toBeGreaterThanOrEqual(2);
      expect(after.due - before.due).toBeGreaterThanOrEqual(1);
      expect(after.delivering - before.delivering).toBeGreaterThanOrEqual(1);
      expect(after.oldestDueAgeS).toBeGreaterThanOrEqual(120);
      expect(after.oldestDueAgeS).toBeLessThan(3_600);
    });
  });

  it("beats from the drain reminder, at most once per interval", async () => {
    await withTestDb(async (db) => {
      const actor = await drainer(db);
      const log = captureLog();
      try {
        await actor.receiveReminder("");
        await actor.receiveReminder("");
        expect(heartbeats(log.lines)).toHaveLength(1);
        expect(heartbeats(log.lines)[0]).toMatch(
          /"outbox\.oldest_due_age_s":\d+/,
        );

        vi.useFakeTimers({ toFake: ["Date"] });
        try {
          vi.setSystemTime(new Date(Date.now() + HEARTBEAT_INTERVAL_MS + 1));
          await actor.receiveReminder("");
        } finally {
          vi.useRealTimers();
        }
        expect(heartbeats(log.lines)).toHaveLength(2);
      } finally {
        log.restore();
      }
    });
  });

  it("stays silent when the drain fails, which is what the dead-man's rule pages on", async () => {
    class BrokenDrain extends StubbedOutboxActor {
      override async drain(): Promise<never> {
        throw new Error("database unreachable");
      }
    }
    await withTestDb(async (db) => {
      const actor = await activate(
        createActor(BrokenDrain, OUTBOX_ACTOR_ID, db),
      );
      const log = captureLog();
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await actor.receiveReminder("");
        expect(heartbeats(log.lines)).toEqual([]);
        expect(errors).toHaveBeenCalledWith(
          expect.stringContaining("[outbox.drain_failed]"),
        );
      } finally {
        log.restore();
        errors.mockRestore();
      }
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Finding B: an outcome is only recorded by the claim that earned it           */
/* -------------------------------------------------------------------------- */

/**
 * Both faces of the same defect, driven through the real code rather than
 * asserted about it. `StubbedOutboxActor.during` is the stall: it runs inside
 * `deliver`, which is precisely the window in which the reclaim sweep can take
 * the row away and a second drainer can finish the work.
 *
 * The stall itself is simulated by moving the *row* back ten minutes rather
 * than the clock forward — the same device as "reclaims a row left in
 * `delivering` by a host that died" above. What the guard actually compares is
 * `claim_token`, which the reclaim nulls and the second claim replaces, so the
 * aging step is invisible to it either way.
 */
describe.skipIf(skip)("outbox: a claim reclaimed underneath a delivery", () => {
  /** The stall, the reclaim, and a second drainer finishing the row. */
  const reclaimAndRedeliver = async (
    db: DbOrTx,
    id: string,
    second: StubbedOutboxActor,
  ): Promise<void> => {
    await db.execute(sql`
      update outbox set updated_at = now() - interval '30 minutes'
      where id = ${id}
    `);
    await second.drain(adminCtx("admin-2", "reclaim"));
    await makeDue(db, id);
    await second.drain(adminCtx("admin-2", "redeliver"));
  };

  it("refuses a late success: a delivered row is not resurrected", async () => {
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-1",
        },
      );
      const stalled = await drainer(db);
      const fresh = await drainer(db);
      stalled.during = async () => {
        await reclaimAndRedeliver(db, id, fresh);
        // The second drainer got there first and the row is finished.
        expect((await rowById(db, id)).status).toBe("delivered");
      };

      // The stalled host now returns, successfully, far too late.
      const result = await stalled.drain(adminCtx("admin-1", "late"));

      expect(result.lostClaim).toBe(1);
      expect(result.delivered).toBe(0);
      const row = await rowById(db, id);
      expect(row.status).toBe("delivered");
      expect(row.claimToken).toBeNull();
    });
  });

  it("refuses a late failure: the reclaim's attempt charge survives", async () => {
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-1",
        },
      );
      const stalled = await drainer(db);
      const fresh = await drainer(db);
      fresh.failure = new Error("the second deliverer failed too");
      stalled.during = async () => {
        await reclaimAndRedeliver(db, id, fresh);
        // One attempt from the reclaim, one from the second delivery.
        expect((await rowById(db, id)).attempts).toBe(2);
      };
      stalled.failure = new Error("the first deliverer failed, very late");

      const result = await stalled.drain(adminCtx("admin-1", "late"));

      expect(result.lostClaim).toBe(1);
      expect(result.retried).toBe(0);
      const row = await rowById(db, id);
      // Before the guard this wrote `attempts = <snapshot> + 1` = 1, taking the
      // counter *backwards* from 2. Repeat that and `attempts` never reaches
      // MAX_ATTEMPTS, so a poison row retries forever and never dead-letters.
      expect(row.attempts).toBe(2);
      expect(row.lastError).toContain("second deliverer");
    });
  });

  /* ------------------------------------------------------------------ */
  /* The token, as the load-bearing half                                 */
  /* ------------------------------------------------------------------ */

  /**
   * The two tests above prove the *outcome* — `lostClaim`, and the reclaim's
   * attempt charge surviving — but they cannot prove *which clause* produced
   * it. In both, the second drainer runs to completion, so by the time the
   * stalled write lands the row is `delivered` and the `status = 'delivering'`
   * half of `#claimHeld` already refuses it on its own. Hand-mutation
   * confirms: delete `eq(outbox.claimToken, row.claimToken)` from
   * `#claimHeld`, or `and claim_token = …` from `#fail`'s `WHERE`, and all 28
   * tests in this file stay green. The token — the whole of commit
   * `13bcca04` — is never the clause doing the work.
   *
   * `#claimHeld`'s own docblock names the state that separates them: "`status
   * = 'delivering'` alone still matches a row some *other* drainer has since
   * re-claimed". That is this block. The row is reclaimed **and claimed again**
   * and is in flight under a new token when the stalled host returns, so
   * `status` matches and only the token can refuse the write.
   */
  /** Reclaim the row and hand it to another drainer that is *still* delivering. */
  const reclaimAndHoldElsewhere = async (
    db: DbOrTx,
    id: string,
  ): Promise<string> => {
    // The reclaim sweep: charges an attempt and releases the row. Spelled in
    // SQL rather than driven through `drain`, because the second drainer must
    // still be *holding* the row when this returns, and a real drain always
    // finishes what it claims.
    await db.execute(sql`
      update outbox
      set status = 'pending', attempts = attempts + 1, claim_token = null,
          run_after = now(), updated_at = now()
      where id = ${id}
    `);
    // …and the next drainer claims it, exactly as `#claim` does: `delivering`,
    // a fresh token, `updated_at = now()` so the sweep will not take it back.
    const claimed = await db.execute<{ claim_token: string }>(sql`
      update outbox
      set status = 'delivering', claim_token = gen_random_uuid(),
          updated_at = now()
      where id = ${id}
      returning claim_token
    `);
    const token = claimed.rows[0]?.claim_token;
    if (token === undefined) throw new Error("second claim wrote nothing");
    return token;
  };

  it("refuses a late success while another drainer still holds the row", async () => {
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-1",
        },
      );
      const stalled = await drainer(db);
      let heldBy = "";
      stalled.during = async () => {
        heldBy = await reclaimAndHoldElsewhere(db, id);
      };

      // The stalled host returns successfully, far too late.
      const result = await stalled.drain(adminCtx("admin-1", "late"));

      expect(result.lostClaim).toBe(1);
      expect(result.delivered).toBe(0);
      const row = await rowById(db, id);
      // Without the token this write matched — `delivering` was true — and
      // marked a delivery that is *still running* as finished, so the second
      // drainer's own outcome would then be the one refused.
      expect(row.status).toBe("delivering");
      expect(row.claimToken).toBe(heldBy);
      expect(row.attempts).toBe(1);
    });
  });

  it("refuses a late failure while another drainer still holds the row", async () => {
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-1",
        },
      );
      const stalled = await drainer(db);
      let heldBy = "";
      stalled.during = async () => {
        heldBy = await reclaimAndHoldElsewhere(db, id);
      };
      stalled.failure = new Error("the first deliverer failed, very late");

      const result = await stalled.drain(adminCtx("admin-1", "late"));

      expect(result.lostClaim).toBe(1);
      expect(result.retried).toBe(0);
      const row = await rowById(db, id);
      // Without the token in `#fail`'s WHERE this write took a row that is
      // in flight back to `pending`, charged it a second attempt and cleared
      // the live claim — a third delivery of the same work.
      expect(row.status).toBe("delivering");
      expect(row.claimToken).toBe(heldBy);
      expect(row.attempts).toBe(1);
      // Nothing at all was written: the refusal is total, not partial.
      expect(row.lastError).toBeNull();
    });
  });

  it("charges attempts relative to the row, not to the claim-time snapshot", async () => {
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-1",
        },
      );
      const actor = await drainer(db);
      actor.failure = new Error("broken");
      // A concurrent charge landing between the claim and the failure: the
      // statement must add to what the row holds, not overwrite it with 1.
      actor.during = async () => {
        await db.execute(
          sql`update outbox set attempts = attempts + 3 where id = ${id}`,
        );
      };

      await actor.drain(adminCtx("admin-1", "req"));

      expect((await rowById(db, id)).attempts).toBe(4);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Finding C: the database's clock, not the host's                              */
/* -------------------------------------------------------------------------- */

describe.skipIf(skip)("outbox: clocks", () => {
  it("schedules the retry on the database's clock, not the host's", async () => {
    await withTestDb(async (db) => {
      const id = await enqueueOutbox(
        db,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: "item-1",
        },
      );
      const actor = await drainer(db);
      actor.failure = new Error("broken");

      // Only `Date` is faked; timers keep running, so the driver is unaffected.
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        // A host whose clock is an hour behind the database's. The old code
        // wrote `new Date(Date.now() + backoffMs(1))`, which lands an hour in
        // the *database's* past: the row is due again on the very next claim
        // and the whole backoff ladder collapses into a hot loop.
        vi.setSystemTime(new Date(Date.now() - 60 * 60 * 1000));
        await actor.drain(adminCtx("admin-1", "req"));
      } finally {
        vi.useRealTimers();
      }

      const { rows } = await db.execute<{ due_in_ms: string }>(sql`
        select extract(epoch from (run_after - now())) * 1000 as due_in_ms
        from outbox where id = ${id}
      `);
      const dueInMs = Number(rows[0]?.due_in_ms ?? 0);
      expect(dueInMs).toBeGreaterThan(0);
      expect(dueInMs).toBeLessThanOrEqual(backoffMs(1));
    });
  });

  it("schedules a delayed enqueue on the database's clock, not the host's", async () => {
    await withTestDb(async (db) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      let id: string;
      try {
        vi.setSystemTime(new Date(Date.now() - 60 * 60 * 1000));
        id = await enqueueOutbox(
          db,
          OUTBOX_TARGETS["MaintenanceActor.reapOrphanFiles"],
          {
            targetId: "singleton",
            delayMs: 120_000,
          },
        );
      } finally {
        vi.useRealTimers();
      }
      const { rows } = await db.execute<{ due_in_ms: string }>(sql`
        select extract(epoch from (run_after - now())) * 1000 as due_in_ms
        from outbox where id = ${id}
      `);
      const dueInMs = Number(rows[0]?.due_in_ms ?? 0);
      expect(dueInMs).toBeGreaterThan(110_000);
      expect(dueInMs).toBeLessThanOrEqual(120_000);
      await expect(
        enqueueOutbox(db, OUTBOX_TARGETS["MaintenanceActor.reapOrphanFiles"], {
          targetId: "singleton",
          delayMs: -1,
        }),
      ).rejects.toThrow(/delayMs/);
    });
  });

  it("bounds OUTBOX_DELIVERY_TIMEOUT_MS below RECLAIM_AFTER", () => {
    // `envInt` used to take any positive integer, with no ceiling and no
    // relationship to RECLAIM_AFTER — so a timeout above it had the reclaim
    // sweep take rows back from deliveries that were still running, on every
    // single delivery.
    expect(MAX_DELIVERY_TIMEOUT_MS).toBeLessThan(RECLAIM_AFTER_MS);
    expect(MAX_DRAIN_DEADLINE_MS).toBeLessThan(RECLAIM_AFTER_MS);
    // The two together are one worst-case turn: the deadline, then one last
    // delivery running to its timeout. That sum must not reach RECLAIM_AFTER.
    expect(MAX_DELIVERY_TIMEOUT_MS + MAX_DRAIN_DEADLINE_MS).toBeLessThanOrEqual(
      RECLAIM_AFTER_MS,
    );

    process.env.OUTBOX_DELIVERY_TIMEOUT_MS = String(RECLAIM_AFTER_MS * 10);
    process.env.OUTBOX_DRAIN_DEADLINE_MS = String(RECLAIM_AFTER_MS * 10);
    try {
      expect(deliveryTimeoutMs()).toBe(MAX_DELIVERY_TIMEOUT_MS);
      expect(drainDeadlineMs()).toBe(MAX_DRAIN_DEADLINE_MS);
    } finally {
      delete process.env.OUTBOX_DELIVERY_TIMEOUT_MS;
      delete process.env.OUTBOX_DRAIN_DEADLINE_MS;
    }
  });

  /*
   * MED-2: the drainer waited `deliveryTimeoutMs()` for every row, whatever
   * the target's descriptor declared. A job's `runBatch` nests 90s and 120s
   * calls; aborted at 30s, it was charged an attempt and retried while the
   * first turn went on to commit — a duplicate at best, a dead-lettered job
   * that had been progressing at worst.
   */
  describe("waits for each pair as long as its descriptor declares", () => {
    const env = { ...process.env };
    afterEach(() => {
      process.env = { ...env };
    });
    const plain = () => {
      delete process.env.AI_PROVIDER;
      delete process.env.OUTBOX_DELIVERY_TIMEOUT_MS;
    };

    it("raises the bound to a longer declared timeout, and only raises it", () => {
      plain();
      expect(deliveryTimeoutMs()).toBe(DEFAULT_DELIVERY_TIMEOUT_MS);
      expect(pairDeliveryTimeoutMs("PlaceRefreshJobActor", "runBatch")).toBe(
        120_000,
      );
      expect(pairDeliveryTimeoutMs("OvertureReloadJobActor", "runBatch")).toBe(
        300_000,
      );
      // The system half of a user's enrichment: the same Google path as
      // `refreshFromSource`, so the same bound — it was 30s, the queue's.
      expect(pairDeliveryTimeoutMs("PlaceActor", "enrichFromGoogle")).toBe(
        actorMethodMeta(PlaceActorDescriptor, "refreshFromSource")?.timeoutMs,
      );
      expect(pairDeliveryTimeoutMs("PlaceActor", "enrichFromGoogle")).toBe(
        90_000,
      );
      // An entity method that declares one: an embedding with its images.
      expect(pairDeliveryTimeoutMs("ItemActor", "regenerateVector")).toBe(
        100_000,
      );
      // Declares nothing (the 15s request-path default): the queue's bound.
      expect(pairDeliveryTimeoutMs("ItemActor", "setBarcode")).toBe(
        DEFAULT_DELIVERY_TIMEOUT_MS,
      );
      // Not a declared pair (the drainer refuses it anyway): the queue's bound.
      expect(pairDeliveryTimeoutMs("PlaceActor", "refreshFromSource")).toBe(
        DEFAULT_DELIVERY_TIMEOUT_MS,
      );
    });

    it("never grants a declaration more than half the reclaim window", () => {
      plain();
      const greedy = {
        actorType: "Greedy",
        category: "entity",
        methods: { slow: { timeoutMs: RECLAIM_AFTER_MS * 10 } },
      } as const;
      expect(declaredDeliveryTimeoutMs(greedy, "slow")).toBe(
        MAX_DELIVERY_TIMEOUT_MS,
      );
    });

    it("keeps the model-call floor when it is the longer of the two", () => {
      process.env.AI_PROVIDER = "ollama";
      process.env.AI_REQUEST_TIMEOUT_MS = "120000";
      delete process.env.OUTBOX_DELIVERY_TIMEOUT_MS;
      expect(pairDeliveryTimeoutMs("PlaceRefreshJobActor", "runBatch")).toBe(
        deliveryTimeoutMs(),
      );
      expect(deliveryTimeoutMs()).toBeGreaterThan(120_000);
    });

    it("no declared outbox pair asks for longer than the reclaim sweep allows", () => {
      // The ceiling in pairDeliveryTimeoutMs would clamp it silently, and the
      // job's own BatchBudget — sized from the declaration — would then plan
      // for a delivery the drainer does not grant.
      const over = Object.values(OUTBOX_TARGETS)
        .map((pair) => ({
          key: pair.key,
          timeoutMs:
            actorMethodMeta(pair.descriptor, pair.method)?.timeoutMs ?? 0,
        }))
        .filter(({ timeoutMs }) => timeoutMs > MAX_DELIVERY_TIMEOUT_MS);
      expect(over).toEqual([]);
    });

    it.skipIf(skip)("hands the sidecar each row's own timeout", async () => {
      plain();
      await withTestDb(async (db) => {
        await enqueueOutbox(
          db,
          OUTBOX_TARGETS["PlaceRefreshJobActor.runBatch"],
          { targetId: "job-slow", payload: { batch: 0 } },
        );
        await enqueueOutbox(db, OUTBOX_TARGETS["ItemActor.regenerateVector"], {
          targetId: "item-fast",
        });
        const actor = await drainer(db);
        await actor.drain(adminCtx("admin-1", "req"));
        expect(actor.timeouts).toEqual(
          expect.arrayContaining([
            ["PlaceRefreshJobActor.runBatch", 120_000],
            ["ItemActor.regenerateVector", 100_000],
          ]),
        );
      });
    });
  });

  /*
   * The mirror of the block above, and the one the compose stack caught.
   *
   * These assert the *property* — "a delivery outlives the model call it is
   * waiting on" — rather than the numbers that currently satisfy it, so
   * retuning either knob keeps them green and reintroducing the inversion does
   * not. Measured before the floor existed, against `gemma3:4b`:
   * `TierListActor.generateInsights` for one tier list was aborted at exactly
   * 30.0s, aborted again at exactly 30.0s, and only its third delivery wrote
   * `insights_generated_at` — three model calls for one answer, because a
   * delivery that gives up first throws the turn's work away.
   */
  describe("floors OUTBOX_DELIVERY_TIMEOUT_MS above the model call", () => {
    const env = { ...process.env };
    afterEach(() => {
      process.env = { ...env };
    });

    it("outlives AI_REQUEST_TIMEOUT_MS when a provider is configured", () => {
      process.env.AI_PROVIDER = "ollama";
      process.env.AI_REQUEST_TIMEOUT_MS = "120000";

      // The value that shipped: the default, which is four times too short.
      delete process.env.OUTBOX_DELIVERY_TIMEOUT_MS;
      expect(DEFAULT_DELIVERY_TIMEOUT_MS).toBeLessThan(aiRequestTimeoutMs());
      expect(deliveryTimeoutMs()).toBeGreaterThan(aiRequestTimeoutMs());

      // And an operator who sets one that is too short is raised, not obeyed.
      process.env.OUTBOX_DELIVERY_TIMEOUT_MS = "1000";
      expect(deliveryTimeoutMs()).toBeGreaterThan(aiRequestTimeoutMs());
    });

    it("leaves the bound alone when no delivery can call a model", () => {
      // `AI_PROVIDER` unset is a supported state, not a broken one: every seam
      // throws before it reaches a provider, so nothing a delivery does can be
      // slow for this reason and the queue keeps its short bound.
      delete process.env.AI_PROVIDER;
      process.env.OUTBOX_DELIVERY_TIMEOUT_MS = "1000";
      expect(deliveryTimeoutMs()).toBe(1_000);
    });

    it("never buys the floor at the reclaim sweep's expense", () => {
      // The ceiling wins: an AI timeout longer than half the reclaim window
      // cannot push a delivery into the sweep that would take its row away.
      process.env.AI_PROVIDER = "ollama";
      process.env.AI_REQUEST_TIMEOUT_MS = String(RECLAIM_AFTER_MS * 10);
      delete process.env.OUTBOX_DELIVERY_TIMEOUT_MS;
      expect(deliveryTimeoutMs()).toBe(MAX_DELIVERY_TIMEOUT_MS);
      expect(deliveryTimeoutMs() + MAX_DRAIN_DEADLINE_MS).toBeLessThanOrEqual(
        RECLAIM_AFTER_MS,
      );
    });

    it("survives an AI config it cannot read", () => {
      // `installAI()` fails the boot over both of these, so the queue never
      // gets a vote — but if it is running anyway, the safe answer to "might a
      // delivery call a model" is yes.
      process.env.AI_PROVIDER = "vertex";
      process.env.AI_REQUEST_TIMEOUT_MS = "soon";
      delete process.env.OUTBOX_DELIVERY_TIMEOUT_MS;
      expect(deliveryTimeoutMs()).toBeGreaterThan(DEFAULT_DELIVERY_TIMEOUT_MS);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Retention                                                                    */
/* -------------------------------------------------------------------------- */

describe.skipIf(skip)("outbox: retention", () => {
  it("deletes old delivered rows and keeps everything else", async () => {
    await withTestDb(async (db) => {
      const seed = async (status: string) => {
        const id = await enqueueOutbox(
          db,
          OUTBOX_TARGETS["ItemActor.regenerateVector"],
          {
            targetId: `retention-${status}`,
          },
        );
        await db.execute(sql`
          update outbox
          set status = ${status}, updated_at = now() - interval '400 days'
          where id = ${id}
        `);
        return id;
      };
      const delivered = await seed("delivered");
      const dead = await seed("dead");
      const pending = await seed("pending");

      const actor = await drainer(db);
      const result = await actor.drain(adminCtx("admin-1", "req"));

      expect(result.reaped).toBeGreaterThanOrEqual(1);
      await expect(rowById(db, delivered)).rejects.toThrow("vanished");
      // `dead` is the dead-letter report's only input — this system's only
      // alarm on the outbox — and `pending` is live work. Neither is history.
      expect((await rowById(db, dead)).status).toBe("dead");
      expect(await rowById(db, pending)).toBeDefined();
    });
  });

  it("sweeps at most once an hour per activation", async () => {
    await withTestDb(async (db) => {
      const actor = await drainer(db);
      await actor.drain(adminCtx("admin-1", "first"));
      // The second drain 2s later must not re-run the DELETE: the sweep is
      // throttled per activation, because it runs inside a drain turn.
      const again = await actor.drain(adminCtx("admin-1", "second"));
      expect(again.reaped).toBe(0);
    });
  });
});

describe("deliveryArgs — the one place a delivery is minted", () => {
  const ROW = "0e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";

  it("invokes the target with a viewerless system ctx carrying the delivery, then the payload", () => {
    const payload = { reason: "created" };
    const [ctx, passed] = deliveryArgs({ id: ROW, attempts: 0, payload });
    expect(ctx).toEqual({
      viewerId: null,
      kind: "system",
      requestId: `outbox:${ROW}`,
      delivery: { outboxId: ROW, attempt: 1, final: false },
      causedBy: ROW,
    });
    expect(passed).toBe(payload);
    // What the wire boundary will be handed: accepted as it stands.
    expect(isWellFormedCtx(ctx)).toBe(true);
  });

  it("numbers attempts from 1, and marks the one #fail dead-letters as final", () => {
    const at = (attempts: number) =>
      deliveryArgs({ id: ROW, attempts, payload: {} })[0].delivery;
    expect(at(0)).toEqual({ outboxId: ROW, attempt: 1, final: false });
    expect(at(MAX_ATTEMPTS - 2)?.final).toBe(false);
    expect(at(MAX_ATTEMPTS - 1)).toEqual({
      outboxId: ROW,
      attempt: MAX_ATTEMPTS,
      final: true,
    });
  });

  it("is what the drainer actually sends — deliver() calls the sidecar with it", async () => {
    // `deliver` itself, not a stand-in for it: only the sidecar hop below it
    // is replaced, so this is the real ctx-building line.
    const sent: unknown[][] = [];
    class Recording extends OutboxActor {
      protected override async invoke(
        targetActor: string,
        targetId: string,
        method: string,
        args: readonly unknown[],
      ): Promise<void> {
        sent.push([targetActor, targetId, method, args]);
      }
      async deliverForTest(row: ClaimedRow): Promise<void> {
        await this.deliver(row);
      }
    }
    const actor = createActor(Recording, OUTBOX_ACTOR_ID, {} as DbOrTx);
    const row: ClaimedRow = {
      id: ROW,
      targetActor: "ItemActor",
      targetId: "i-1",
      method: "regenerateVector",
      payload: { reason: "x" },
      attempts: 3,
      claimToken: "t",
    };
    await actor.deliverForTest(row);
    expect(sent).toEqual([
      ["ItemActor", "i-1", "regenerateVector", deliveryArgs(row)],
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* enqueueOutboxOnce — one live row per (actor, id, method)                     */
/* -------------------------------------------------------------------------- */

describe.skipIf(skip)("enqueueOutboxOnce", () => {
  const REAP = OUTBOX_TARGETS["MaintenanceActor.reapOrphanFiles"];
  const REPORT = OUTBOX_TARGETS["MaintenanceActor.reportDeadLetters"];

  it("keys the guard on the method too, not just the actor and id", async () => {
    await withTestDb(async (db) => {
      const targetId = `once-${crypto.randomUUID()}`;
      expect(await enqueueOutboxOnce(db, REAP, { targetId })).not.toBeNull();
      expect(await enqueueOutboxOnce(db, REAP, { targetId })).toBeNull();
      // Same actor, same id, another method: a different piece of work.
      expect(await enqueueOutboxOnce(db, REPORT, { targetId })).not.toBeNull();
      // Same actor and method, another id: also different.
      expect(
        await enqueueOutboxOnce(db, REAP, { targetId: `${targetId}-b` }),
      ).not.toBeNull();
    });
  });

  it("counts a delivering row only when asked, and never the excluded one", async () => {
    await withTestDb(async (db) => {
      const targetId = `once-${crypto.randomUUID()}`;
      const inFlight = await enqueueOutboxOnce(db, REAP, { targetId });
      if (inFlight === null) throw new Error("no first row");
      await db
        .update(outbox)
        .set({ status: "delivering" })
        .where(eq(outbox.id, inFlight));

      const live = { includeDelivering: true } as const;
      // The in-flight row satisfies a self-arming chain...
      expect(await enqueueOutboxOnce(db, REAP, { targetId }, live)).toBeNull();
      // ...unless it is the very delivery making the call.
      const next = await enqueueOutboxOnce(
        db,
        REAP,
        { targetId },
        { ...live, excludeRowId: inFlight },
      );
      expect(next).not.toBeNull();
      expect(next).not.toBe(inFlight);
      // By default only `pending` counts: `next` is pending now, so this is
      // satisfied — delete it and the in-flight row alone no longer is.
      expect(await enqueueOutboxOnce(db, REAP, { targetId })).toBeNull();
      await db.delete(outbox).where(eq(outbox.id, next ?? ""));
      expect(await enqueueOutboxOnce(db, REAP, { targetId })).not.toBeNull();
    });
  });
});

describe("outbox helpers", () => {
  it("dead-letters at ten attempts — §2.7's number, pinned rather than derived", () => {
    // Every other test here is written relative to MAX_ATTEMPTS, so it held
    // the *relationship* and not the value: 11 passed them all. The header's
    // state diagram and the runbook both say ten.
    expect(MAX_ATTEMPTS).toBe(10);
  });

  it("doubles the backoff and caps it", () => {
    expect([1, 2, 3, 4, 5].map(backoffMs)).toEqual([
      2_000, 4_000, 8_000, 16_000, 32_000,
    ]);
    expect(backoffMs(9)).toBe(512_000);
    expect(backoffMs(20)).toBe(BACKOFF_CAP_MS);
  });
});
