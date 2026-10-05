/**
 * `MaintenanceActor` against a real Postgres.
 *
 * `reapOrphanFiles` only *enqueues* — see the class doc for why it cannot call
 * `FileActor` directly — so this file proves two things separately, then
 * chains them: (1) it enqueues exactly the right `outbox` rows, and (2)
 * draining those rows (a small stand-in for `OutboxActor.drain`, which is
 * itself tested in `outbox-actor.test.ts` and not re-tested here) really does
 * delete the files through the real `FileActor`.
 */
import {
  adminCtx,
  ForbiddenError,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { files, menuScans, outbox } from "@cellar-assistant/db";
import { and, eq, gt, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type { FilesBinding } from "../lib/files-binding.ts";
import {
  activate,
  closeTestDb,
  createActor,
  deliveryCtx,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { FileActor } from "./file-actor.ts";
import {
  DEAD_LETTER_ALARM,
  DEAD_LETTER_CLEAR,
  DEAD_LETTER_REGRESSION,
  DEAD_LETTER_REPORT_GROUPS,
  DEAD_LETTER_REPORT_INTERVAL_MS,
  type DeadLetterReport,
  deadLetterEvents,
  MAINTENANCE_ACTOR_TYPE,
  MaintenanceActor,
  REAP_INTERVAL_MS,
  REAP_ORPHAN_FILES,
  REPORT_DEAD_LETTERS,
  STUCK_DELIVERING_MS,
} from "./maintenance-actor.ts";
import {
  type ClaimedRow,
  OUTBOX_ACTOR_ID,
  OutboxActor,
} from "./outbox-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

let seq = 0;
const freshId = (): string => {
  seq += 1;
  return `20000000-0000-4000-8000-${seq.toString().padStart(12, "0")}`;
};

const HOUR_MS = 60 * 60 * 1000;

const seedFile = async (
  db: DbOrTx,
  input: {
    uploadedBy?: string | null;
    verifiedAt?: Date | null;
    createdAt?: Date;
  } = {},
): Promise<string> => {
  const id = freshId();
  const createdAt = input.createdAt ?? new Date();
  await db.insert(files).values({
    id,
    bucket: "cellar-files",
    key: `test/${id}`,
    uploadedBy: input.uploadedBy ?? null,
    verifiedAt: input.verifiedAt ?? null,
    createdAt,
    updatedAt: createdAt,
  });
  return id;
};

const fakeFilesBinding = (): FilesBinding => ({
  stat: async () => null,
  presignGetPublic: async () => "https://example.test/read",
  presignGetInternal: async () => "http://minio.example.test/read",
  readHead: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
  setMediaType: async () => undefined,
  delete: async () => undefined,
});

/**
 * Stands in for `OutboxActor.drain` just enough to prove `reapOrphanFiles`'s
 * enqueued rows are real, deliverable work — not a reimplementation of the
 * drainer (its claim/backoff/dead-letter machinery is `outbox-actor.test.ts`'s
 * job). Delivers every pending `FileActor.delete` row directly, in-process,
 * the same way `RealDeleteMaintenanceActor`-style tests elsewhere in this
 * codebase avoid a live sidecar.
 */
const drainFileDeletes = async (db: DbOrTx): Promise<string[]> => {
  const pending = await db
    .select()
    .from(outbox)
    .where(
      and(eq(outbox.targetActor, "FileActor"), eq(outbox.method, "delete")),
    );
  const delivered: string[] = [];
  for (const row of pending) {
    const fileActor = await activate(
      new FileActor(
        daprClient(),
        new ActorId(row.targetId),
        db,
        fakeFilesBinding(),
      ),
    );
    await fileActor.delete(systemCtx(`test-drain:${row.id}`));
    await db
      .update(outbox)
      .set({ status: "delivered" })
      .where(eq(outbox.id, row.id));
    delivered.push(row.targetId);
  }
  return delivered;
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("MaintenanceActor (A8)", () => {
  afterAll(closeTestDb);

  it("is a job-category actor per §2.6/§8.3", () => {
    expect(MaintenanceActor.category).toBe("job");
  });

  it("schedules a delete for unverified files older than 24h, and only those", async () => {
    await withTestDb(async (db) => {
      const orphan = await seedFile(db, {
        createdAt: new Date(Date.now() - 25 * HOUR_MS),
      });
      const tooFresh = await seedFile(db, {
        createdAt: new Date(Date.now() - HOUR_MS),
      });
      const verifiedButOld = await seedFile(db, {
        createdAt: new Date(Date.now() - 30 * HOUR_MS),
        verifiedAt: new Date(Date.now() - 29 * HOUR_MS),
      });

      const actor = await activate(
        createActor(MaintenanceActor, "singleton", db),
      );
      const result = await actor.reapOrphanFiles(systemCtx("test"));
      expect(result.scheduled).toEqual([orphan]);

      const deleteRows = await db
        .select({ targetId: outbox.targetId })
        .from(outbox)
        .where(
          and(eq(outbox.targetActor, "FileActor"), eq(outbox.method, "delete")),
        );
      expect(deleteRows.map((r) => r.targetId)).toEqual([orphan]);
      expect(deleteRows.map((r) => r.targetId)).not.toContain(tooFresh);
      expect(deleteRows.map((r) => r.targetId)).not.toContain(verifiedButOld);
    });
  });

  it("is system/admin only", async () => {
    await withTestDb(async (db) => {
      const uploaderId = await seedUser(db);
      const orphan = await seedFile(db, {
        createdAt: new Date(Date.now() - 25 * HOUR_MS),
      });
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-forbidden", db),
      );
      await expect(
        actor.reapOrphanFiles(userCtx(uploaderId, "r")),
      ).rejects.toBeInstanceOf(ForbiddenError);

      // No delete row for the orphan this call would have found, and no
      // reschedule row for this actor id — this is a shared dev database
      // (other suites' rows persist), so scope the check rather than assert
      // the whole table is empty.
      const deleteRows = await db
        .select()
        .from(outbox)
        .where(
          and(eq(outbox.targetActor, "FileActor"), eq(outbox.targetId, orphan)),
        );
      expect(deleteRows).toEqual([]);
      const rescheduleRows = await db
        .select()
        .from(outbox)
        .where(
          and(
            eq(outbox.targetActor, MAINTENANCE_ACTOR_TYPE),
            eq(outbox.targetId, "singleton-forbidden"),
          ),
        );
      expect(rescheduleRows).toEqual([]);
    });
  });

  it("reschedules itself ~24h out via an outbox row, even with nothing to reap", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-schedule", db),
      );
      const before = Date.now();
      const result = await actor.reapOrphanFiles(systemCtx("test"));
      expect(result.scheduled).toEqual([]);

      const rows = await db
        .select()
        .from(outbox)
        .where(
          and(
            eq(outbox.targetActor, MAINTENANCE_ACTOR_TYPE),
            eq(outbox.targetId, "singleton-schedule"),
            eq(outbox.method, REAP_ORPHAN_FILES),
          ),
        );
      expect(rows).toHaveLength(1);
      const runAfterMs = rows[0]?.runAfter?.getTime() ?? 0;
      // Generous slack for test wall-clock time, not for the scheduling logic.
      expect(runAfterMs).toBeGreaterThan(before + REAP_INTERVAL_MS - 60_000);
      expect(runAfterMs).toBeLessThan(before + REAP_INTERVAL_MS + 60_000);
    });
  });

  it("schedules the next cycle on the database's clock, not the host's", async () => {
    // `OutboxActor` decision 7. The re-arm used to write
    // `new Date(Date.now() + REAP_INTERVAL_MS)`: a host an hour behind the
    // database armed the 24h cycle 23h out by the database's reckoning.
    await withTestDb(async (db) => {
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-db-clock", db),
      );
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date(Date.now() - 60 * 60 * 1000));
        await actor.reapOrphanFiles(systemCtx("test"));
        await actor.reportDeadLetters(systemCtx("test"));
      } finally {
        vi.useRealTimers();
      }
      const { rows } = await db.execute<{ method: string; due_in_ms: string }>(
        sql`
          select method,
                 extract(epoch from (run_after - now())) * 1000 as due_in_ms
          from outbox
          where target_actor = ${MAINTENANCE_ACTOR_TYPE}
            and target_id = 'singleton-db-clock'
        `,
      );
      const due = new Map(rows.map((r) => [r.method, Number(r.due_in_ms)]));
      const slack = 60_000;
      expect(due.get(REAP_ORPHAN_FILES)).toBeGreaterThan(
        REAP_INTERVAL_MS - slack,
      );
      expect(due.get(REAP_ORPHAN_FILES)).toBeLessThanOrEqual(REAP_INTERVAL_MS);
      expect(due.get(REPORT_DEAD_LETTERS)).toBeGreaterThan(
        DEAD_LETTER_REPORT_INTERVAL_MS - slack,
      );
      expect(due.get(REPORT_DEAD_LETTERS)).toBeLessThanOrEqual(
        DEAD_LETTER_REPORT_INTERVAL_MS,
      );
    });
  });

  it("does not schedule the next cycle to run immediately", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-not-immediate", db),
      );
      await actor.reapOrphanFiles(systemCtx("test"));
      const due = await db
        .select()
        .from(outbox)
        .where(
          and(
            eq(outbox.targetActor, MAINTENANCE_ACTOR_TYPE),
            eq(outbox.targetId, "singleton-not-immediate"),
            gt(outbox.runAfter, new Date(Date.now() + HOUR_MS)),
          ),
        );
      expect(due).toHaveLength(1);
    });
  });

  it("schedules one delete per orphan when several are due", async () => {
    await withTestDb(async (db) => {
      const a = await seedFile(db, {
        createdAt: new Date(Date.now() - 25 * HOUR_MS),
      });
      const b = await seedFile(db, {
        createdAt: new Date(Date.now() - 48 * HOUR_MS),
      });

      const actor = await activate(
        createActor(MaintenanceActor, "singleton-multi", db),
      );
      const result = await actor.reapOrphanFiles(systemCtx("test"));
      expect(new Set(result.scheduled)).toEqual(new Set([a, b]));
    });
  });

  it("end to end: unverified targets older than 24h are actually deleted once drained", async () => {
    await withTestDb(async (db) => {
      const orphan = await seedFile(db, {
        createdAt: new Date(Date.now() - 25 * HOUR_MS),
      });
      const tooFresh = await seedFile(db, {
        createdAt: new Date(Date.now() - HOUR_MS),
      });

      const actor = await activate(
        createActor(MaintenanceActor, "singleton-e2e", db),
      );
      await actor.reapOrphanFiles(systemCtx("test"));

      const deleted = await drainFileDeletes(db);
      expect(deleted).toEqual([orphan]);

      const [orphanRow] = await db
        .select()
        .from(files)
        .where(eq(files.id, orphan));
      expect(orphanRow).toBeUndefined();

      const [freshRow] = await db
        .select()
        .from(files)
        .where(eq(files.id, tooFresh));
      expect(freshRow).toBeDefined();
    });
  });

  /* ---------------------------------------------------------------------- */
  /* At-least-once delivery: the two ways arming this actor could go wrong    */
  /* ---------------------------------------------------------------------- */

  it("does not reap an unverified file something is still attached to", async () => {
    await withTestDb(async (db) => {
      const userId = await seedUser(db);
      const attached = await seedFile(db, {
        uploadedBy: userId,
        createdAt: new Date(Date.now() - 30 * HOUR_MS),
      });
      const loose = await seedFile(db, {
        createdAt: new Date(Date.now() - 30 * HOUR_MS),
      });
      // §2.1 says an orphan is "never verified/**attached**". This one is
      // unverified but attached — a scan whose `verify` never ran, not an
      // orphan. Every FK into `files` is RESTRICT/NO ACTION, so scheduling a
      // delete for it produces a `DrizzleQueryError`, ten retries and a dead
      // letter: the reaper poisoning its own report.
      await db.insert(menuScans).values({
        userId,
        originalImageId: attached,
      });

      const actor = await activate(
        createActor(MaintenanceActor, "singleton-attached", db),
      );
      const result = await actor.reapOrphanFiles(systemCtx("test"));

      expect(result.scheduled).toContain(loose);
      expect(result.scheduled).not.toContain(attached);
    });
  });

  it("a redelivered reap does not fork the chain into two", async () => {
    await withTestDb(async (db) => {
      const actorId = "singleton-redelivered";
      // The row whose delivery *is* this call. `OutboxActor` commits
      // `delivering` before invoking, so it is sitting in the table, visible
      // to the very guard that decides whether to re-arm — which is why
      // `armCycle` has to exclude it by id.
      const [inflight] = await db
        .insert(outbox)
        .values({
          targetActor: MAINTENANCE_ACTOR_TYPE,
          targetId: actorId,
          method: REAP_ORPHAN_FILES,
          payload: {},
          status: "delivering",
        })
        .returning({ id: outbox.id });
      const rowId = inflight?.id ?? "";
      expect(rowId).not.toBe("");

      const actor = await activate(createActor(MaintenanceActor, actorId, db));
      const ctx = deliveryCtx(rowId);

      await actor.reapOrphanFiles(ctx); // first delivery: arms the next cycle
      await actor.reapOrphanFiles(ctx); // at-least-once: the SAME row, again

      const mine = await db
        .select()
        .from(outbox)
        .where(
          and(
            eq(outbox.targetActor, MAINTENANCE_ACTOR_TYPE),
            eq(outbox.targetId, actorId),
            eq(outbox.method, REAP_ORPHAN_FILES),
          ),
        );
      // One armed cycle, not two. Unconditional re-arming gave two here, and
      // each of those would have re-armed itself forever.
      expect(mine.filter((r) => r.status === "pending")).toHaveLength(1);
    });
  });

  it("a redelivered reap does not dead-letter on a file it already deleted", async () => {
    await withTestDb(async (db) => {
      const orphan = await seedFile(db, {
        createdAt: new Date(Date.now() - 25 * HOUR_MS),
      });
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-redelivered-files", db),
      );
      await actor.reapOrphanFiles(systemCtx("test"));
      expect(await drainFileDeletes(db)).toEqual([orphan]);

      // The row is gone. Now deliver that same `FileActor.delete` a second
      // time — which at-least-once delivery does not merely permit, it
      // guarantees. This must succeed: a throw here is a failed delivery, and
      // ten of those is a dead letter *manufactured by the reaper itself*,
      // inside the report the reaper exists to keep honest.
      const again = await activate(
        new FileActor(
          daprClient(),
          new ActorId(orphan),
          db,
          fakeFilesBinding(),
        ),
      );
      await expect(
        again.delete(systemCtx("redelivery")),
      ).resolves.toBeUndefined();
    });
  });

  it("the watchdog arms both chains, and arming an armed chain adds nothing", async () => {
    await withTestDb(async (db) => {
      const actorId = "singleton-watchdog";
      const actor = await activate(createActor(MaintenanceActor, actorId, db));

      await actor.receiveReminder(""); // boot
      await actor.receiveReminder(""); // an hour later, or another boot

      const mine = await db
        .select()
        .from(outbox)
        .where(
          and(
            eq(outbox.targetActor, MAINTENANCE_ACTOR_TYPE),
            eq(outbox.targetId, actorId),
          ),
        );
      expect(mine.filter((r) => r.method === REAP_ORPHAN_FILES)).toHaveLength(
        1,
      );
      expect(mine.filter((r) => r.method === REPORT_DEAD_LETTERS)).toHaveLength(
        1,
      );
    });
  });

  // The watchdog fires hourly, and it can fire while a cycle's own row is
  // being delivered. That in-flight row *is* the chain; without
  // `includeDelivering` the watchdog armed a second, immediate run beside it —
  // for the report, a duplicate set of alert events.
  it("the watchdog counts a cycle that is being delivered right now as armed", async () => {
    await withTestDb(async (db) => {
      const actorId = "singleton-watchdog-inflight";
      const actor = await activate(createActor(MaintenanceActor, actorId, db));
      await actor.receiveReminder("");
      await db
        .update(outbox)
        .set({ status: "delivering" })
        .where(
          and(
            eq(outbox.targetActor, MAINTENANCE_ACTOR_TYPE),
            eq(outbox.targetId, actorId),
          ),
        );

      await actor.receiveReminder("");

      const mine = await db
        .select()
        .from(outbox)
        .where(
          and(
            eq(outbox.targetActor, MAINTENANCE_ACTOR_TYPE),
            eq(outbox.targetId, actorId),
          ),
        );
      expect(mine.map((r) => `${r.method}/${r.status}`).sort()).toEqual(
        [
          `${REAP_ORPHAN_FILES}/delivering`,
          `${REPORT_DEAD_LETTERS}/delivering`,
        ].sort(),
      );
    });
  });

  it("rolls every test back: nothing survives withTestDb", async () => {
    const leaked = await withTestDb((db) => seedFile(db));
    const survivors = await withTestDb((db) =>
      db.select({ id: files.id }).from(files).where(eq(files.id, leaked)),
    );
    expect(survivors).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* C4: the dead-letter report                                                  */
/* -------------------------------------------------------------------------- */

/**
 * §2.6 asks `MaintenanceActor` for an "orphan-file reaper, dead-letter
 * report". A8 built the first; C4 added the second.
 *
 * **Every assertion here is scoped to a target actor name unique to its own
 * test.** The shared database has other suites' `outbox` rows in it, and an
 * auditor already caught B8 going flaky on a global row count — so this suite
 * never asserts a total it did not create, only the group belonging to its own
 * fixture.
 */
describe.skipIf(skip)("MaintenanceActor.reportDeadLetters (§2.6)", () => {
  afterAll(closeTestDb);

  const deadRow = async (
    db: DbOrTx,
    targetActor: string,
    overrides: {
      method?: string;
      status?: string;
      lastError?: string | null;
      updatedAt?: Date;
    } = {},
  ): Promise<string> => {
    const [row] = await db
      .insert(outbox)
      .values({
        targetActor,
        targetId: crypto.randomUUID(),
        method: overrides.method ?? "doThing",
        status: overrides.status ?? "dead",
        attempts: 10,
        lastError: overrides.lastError ?? "the tenth attempt also failed",
        ...(overrides.updatedAt === undefined
          ? {}
          : { updatedAt: overrides.updatedAt }),
      })
      .returning({ id: outbox.id });
    return row?.id ?? "";
  };

  it("is system/admin only", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-dl-auth", db),
      );
      await expect(
        actor.reportDeadLetters(userCtx(crypto.randomUUID(), "req")),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  it("groups dead rows by target and method", async () => {
    await withTestDb(async (db) => {
      const mine = `C4Probe-${crypto.randomUUID().slice(0, 8)}Actor`;
      await deadRow(db, mine, { method: "alpha" });
      await deadRow(db, mine, { method: "alpha" });
      await deadRow(db, mine, { method: "beta", lastError: "boom" });
      // A live row of the same shape must not be counted.
      await deadRow(db, mine, { method: "alpha", status: "pending" });

      const actor = await activate(
        createActor(MaintenanceActor, "singleton-dl-group", db),
      );
      const report = await actor.reportDeadLetters(systemCtx("test"));

      const ours = report.byTarget.filter((g) => g.targetActor === mine);
      expect(ours).toEqual([
        expect.objectContaining({
          targetActor: mine,
          method: "alpha",
          count: 2,
        }),
        expect.objectContaining({
          targetActor: mine,
          method: "beta",
          count: 1,
          lastError: "boom",
        }),
      ]);
    });
  });

  /**
   * `dead` used to be `byTarget.reduce(...)`, and `byTarget` is
   * `LIMIT DEAD_LETTER_REPORT_GROUPS` — so past 20 distinct pairs the only
   * outbox alarm in the system reported the total of its worst 20 and called
   * it the total. Worst when the backlog is widest, which is when it matters.
   *
   * Asserted as a delta, like every other total in this suite: the shared
   * database holds other suites' rows.
   */
  it("counts every dead row, not just the ones the report has room to name", async () => {
    await withTestDb(async (db) => {
      const mine = `C4Wide-${crypto.randomUUID().slice(0, 8)}Actor`;
      const extra = 5;
      const pairs = DEAD_LETTER_REPORT_GROUPS + extra;

      const actor = await activate(
        createActor(MaintenanceActor, "singleton-dl-wide", db),
      );
      const baseline = await actor.reportDeadLetters(systemCtx("test"));

      // One row each, on `pairs` distinct (target_actor, method) pairs — so
      // every one of them is outside the `LIMIT`'s reach the moment anything
      // else in the database has two.
      for (let i = 0; i < pairs; i += 1) {
        await deadRow(db, mine, { method: `m${i}` });
      }

      const report = await actor.reportDeadLetters(systemCtx("test"));
      expect(report.dead - baseline.dead).toBe(pairs);
      expect(report.targets - baseline.targets).toBe(pairs);
      // The list itself is still bounded; that was never the defect.
      expect(report.byTarget.length).toBeLessThanOrEqual(
        DEAD_LETTER_REPORT_GROUPS,
      );
      // And the two numbers now disagree, which is exactly the state the old
      // arithmetic could not represent.
      expect(report.targets).toBeGreaterThan(report.byTarget.length);
    });
  });

  it("counts rows stuck in `delivering` past the reclaim window", async () => {
    await withTestDb(async (db) => {
      const mine = `C4Stuck-${crypto.randomUUID().slice(0, 8)}Actor`;
      const before = (
        await activate(createActor(MaintenanceActor, "singleton-dl-base", db))
      ).reportDeadLetters(systemCtx("test"));
      const baseline = (await before).stuckDelivering;

      await deadRow(db, mine, {
        status: "delivering",
        updatedAt: new Date(Date.now() - STUCK_DELIVERING_MS - 60_000),
      });
      // Inside the window: the outbox's own sweep will get it.
      await deadRow(db, mine, { status: "delivering", updatedAt: new Date() });

      const actor = await activate(
        createActor(MaintenanceActor, "singleton-dl-stuck", db),
      );
      const report = await actor.reportDeadLetters(systemCtx("test"));

      // Scoped as a delta against this transaction's own baseline.
      expect(report.stuckDelivering - baseline).toBe(1);
    });
  });

  it("re-arms itself an hour out, in the same transaction", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-dl-rearm", db),
      );
      const at = Date.now();
      await actor.reportDeadLetters(systemCtx("test"));

      const scheduled = await db
        .select()
        .from(outbox)
        .where(
          and(
            eq(outbox.targetActor, MAINTENANCE_ACTOR_TYPE),
            eq(outbox.targetId, "singleton-dl-rearm"),
            eq(outbox.method, REPORT_DEAD_LETTERS),
          ),
        );
      expect(scheduled).toHaveLength(1);
      const runAfter = scheduled[0]?.runAfter.getTime() ?? 0;
      expect(runAfter).toBeGreaterThanOrEqual(
        at + DEAD_LETTER_REPORT_INTERVAL_MS - 5_000,
      );
      // A separate chain from the reap: this call scheduled no reap.
      const reaps = await db
        .select()
        .from(outbox)
        .where(
          and(
            eq(outbox.targetId, "singleton-dl-rearm"),
            eq(outbox.method, REAP_ORPHAN_FILES),
          ),
        );
      expect(reaps).toEqual([]);
    });
  });

  it("reports without fixing: it never re-drives a dead row", async () => {
    await withTestDb(async (db) => {
      const mine = `C4Intact-${crypto.randomUUID().slice(0, 8)}Actor`;
      await deadRow(db, mine);

      const actor = await activate(
        createActor(MaintenanceActor, "singleton-dl-intact", db),
      );
      await actor.reportDeadLetters(systemCtx("test"));

      const rows = await db
        .select()
        .from(outbox)
        .where(eq(outbox.targetActor, mine));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe("dead");
      expect(rows[0]?.attempts).toBe(10);
    });
  });

  /**
   * The wiring between the report and the pager. `deadLetterEvents` is tested
   * as a pure function below, and every Grafana rule in
   * `infra/grafana/provisioning/alerting/outbox-and-actor-alerts.yaml` routes
   * on the event *names* it produces — but nothing asserted that
   * `reportDeadLetters` actually emits them. Deleting the one `emit` line left
   * this whole file green (mutation audit, 2026-09-27), and in production the
   * first sign would have been the dead-man's switch firing on a healthy queue.
   *
   * `emit` writes `[<event name>] …` to the console before anything else, so
   * the console is where this listens. Compared against the policy's own
   * output rather than against fixed names, because the shared database holds
   * other suites' rows and so the exact report is not ours to predict.
   */
  it("emits exactly the events its own policy decides, on every run", async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    const spies = [
      vi.spyOn(console, "log").mockImplementation(capture),
      vi.spyOn(console, "warn").mockImplementation(capture),
      vi.spyOn(console, "error").mockImplementation(capture),
    ];
    const emitted = (): string[] =>
      lines.flatMap((line) => {
        const name = /^\[(maintenance\.dead_letter[a-z_]*)\]/.exec(line)?.[1];
        return name === undefined ? [] : [name];
      });
    try {
      await withTestDb(async (db) => {
        const mine = `C4Speaks-${crypto.randomUUID().slice(0, 8)}Actor`;
        await deadRow(db, mine);
        const actor = await activate(
          createActor(MaintenanceActor, "singleton-dl-speaks", db),
        );

        const first = await actor.reportDeadLetters(systemCtx("test"));
        expect(first.newDead).toBeGreaterThan(0);
        expect(emitted()).toEqual(deadLetterEvents(first).map((e) => e.name));
        expect(emitted()).toContain(DEAD_LETTER_ALARM);

        // Triaged, then the same pair dies again: the regression has to reach
        // the log too, first, since that is the event the page hangs off.
        await actor.acknowledgeDeadLetters(systemCtx("test"), {
          targetActor: mine,
          by: "ops",
        });
        await deadRow(db, mine);
        lines.length = 0;
        const again = await actor.reportDeadLetters(systemCtx("test"));
        const names = deadLetterEvents(again).map((e) => e.name);
        expect(names[0]).toBe(DEAD_LETTER_REGRESSION);
        expect(emitted()).toEqual(names);
      });
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  /**
   * The other half of "a regression is louder than a first failure": a first
   * failure must not *be* a regression. `regressed` is a set intersection —
   * pairs with new rows AND acknowledged ones — and dropping the second half
   * of it turns every new dead letter into a page.
   */
  it("does not call a pair nobody ever acknowledged a regression", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-dl-first", db),
      );
      const before = await actor.reportDeadLetters(systemCtx("test"));

      const mine = `C4First-${crypto.randomUUID().slice(0, 8)}Actor`;
      await deadRow(db, mine);
      await deadRow(db, mine);
      const after = await actor.reportDeadLetters(systemCtx("test"));

      expect(after.newTargets - before.newTargets).toBe(1);
      expect(after.regressed - before.regressed).toBe(0);
      expect(after.byTarget.find((g) => g.targetActor === mine)).toEqual(
        expect.objectContaining({
          count: 2,
          acknowledged: 0,
          regression: false,
        }),
      );
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Telling a new dead letter from one somebody has already looked at           */
/* -------------------------------------------------------------------------- */

/**
 * The alarm's *policy* — what it says, how loudly, and whether it says
 * anything at all — is a pure function of the report (`deadLetterEvents`), so
 * these run with no database at all.
 *
 * They are the tests for the claim that matters most about this change: that
 * a regression is **louder**, not quieter, than a first failure.
 */
const report = (over: Partial<DeadLetterReport> = {}): DeadLetterReport => ({
  dead: 0,
  acknowledged: 0,
  newDead: 0,
  stuckDelivering: 0,
  targets: 0,
  newTargets: 0,
  regressed: 0,
  byTarget: [],
  ...over,
});

const group = (over: Partial<DeadLetterReport["byTarget"][number]> = {}) => ({
  targetActor: "SomeActor",
  method: "doThing",
  count: 1,
  acknowledged: 0,
  redied: 0,
  regression: false,
  oldest: new Date(0).toISOString(),
  lastError: null,
  ...over,
});

describe("the dead-letter alarm's policy (deadLetterEvents)", () => {
  it("beats rather than falls silent when there is nothing new", () => {
    // A channel that only ever speaks on bad news is indistinguishable from a
    // broken one — and this actor spent its whole existence switched off
    // before anything scheduled it, reading "all clear" for that reason.
    const events = deadLetterEvents(
      report({ dead: 23, acknowledged: 23, targets: 4 }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe(DEAD_LETTER_CLEAR);
    expect(events[0]?.severity).toBe("INFO");
    // The standing backlog is still stated: acknowledged is not forgotten.
    expect(events[0]?.message).toContain("23");
    expect(events[0]?.attributes?.dead).toBe(23);
    expect(events[0]?.attributes?.new_dead).toBe(0);
  });

  it("says so when there is no backlog at all", () => {
    const events = deadLetterEvents(report());
    expect(events[0]?.name).toBe(DEAD_LETTER_CLEAR);
    expect(events[0]?.message).toBe("outbox clear: no dead-lettered rows");
  });

  it("raises an ERROR for rows nobody has acknowledged", () => {
    const events = deadLetterEvents(
      report({
        dead: 25,
        acknowledged: 23,
        newDead: 2,
        targets: 5,
        newTargets: 1,
        byTarget: [group({ count: 2 })],
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe(DEAD_LETTER_ALARM);
    expect(events[0]?.severity).toBe("ERROR");
    // The *new* count leads; the acknowledged backlog is context, not the alarm.
    expect(events[0]?.message).toContain("2 new dead-lettered row(s)");
    expect(events[0]?.message).toContain(
      "23 further row(s) already acknowledged",
    );
  });

  /**
   * The case the whole design exists for. A pair that was triaged and has
   * failed again must not merely reappear in the same event with a bigger
   * number — it gets its **own event name**, because a name is the only part
   * of an event an alert rule can route on, and first in the list, so a
   * truncated log keeps it.
   */
  it("gives a regression its own, louder event — first", () => {
    const events = deadLetterEvents(
      report({
        dead: 24,
        acknowledged: 23,
        newDead: 1,
        targets: 4,
        newTargets: 1,
        regressed: 1,
        byTarget: [
          group({
            targetActor: "MenuScanActor",
            method: "process",
            count: 1,
            acknowledged: 19,
            regression: true,
          }),
        ],
      }),
    );
    expect(events.map((e) => e.name)).toEqual([
      DEAD_LETTER_REGRESSION,
      DEAD_LETTER_ALARM,
    ]);
    expect(events[0]?.severity).toBe("ERROR");
    expect(events[0]?.message).toContain("REGRESSION");
    expect(events[0]?.message).toContain("MenuScanActor.process");
    expect(events[0]?.message).toContain("19 acknowledged before");
    expect(events[0]?.attributes?.regressed).toBe(1);
  });

  it("says when the regression is a requeued row dying again", () => {
    // The pair's only row: acknowledged once, requeued, dead again. Nothing
    // about it is "acknowledged before" any more — the line has to say what
    // actually happened, or an operator reads "0 acknowledged" and wonders
    // why it is a regression at all.
    const events = deadLetterEvents(
      report({
        dead: 1,
        newDead: 1,
        targets: 1,
        newTargets: 1,
        regressed: 1,
        byTarget: [group({ count: 1, redied: 1, regression: true })],
      }),
    );
    expect(events[0]?.name).toBe(DEAD_LETTER_REGRESSION);
    expect(events[0]?.message).toContain(
      "1 of the new dead again after being acknowledged and requeued",
    );
  });

  it("does not let an acknowledged backlog mute a stuck drainer", () => {
    // `stuckDelivering` is not acknowledgeable: there is nothing to triage,
    // only a sweep that is or is not running.
    const events = deadLetterEvents(
      report({ dead: 23, acknowledged: 23, stuckDelivering: 3 }),
    );
    expect(events[0]?.name).toBe(DEAD_LETTER_ALARM);
    expect(events[0]?.severity).toBe("ERROR");
    expect(events[0]?.message).toContain("3 stuck in 'delivering'");
  });
});

/* -------------------------------------------------------------------------- */

describe.skipIf(skip)("MaintenanceActor.acknowledgeDeadLetters", () => {
  afterAll(closeTestDb);

  const dead = async (
    db: DbOrTx,
    targetActor: string,
    method = "doThing",
    status = "dead",
  ): Promise<string> => {
    const [row] = await db
      .insert(outbox)
      .values({
        targetActor,
        targetId: crypto.randomUUID(),
        method,
        status,
        attempts: 10,
        lastError: "the tenth attempt also failed",
      })
      .returning({ id: outbox.id });
    return row?.id ?? "";
  };

  const acks = async (db: DbOrTx, ids: readonly string[]) =>
    (
      await db.execute<{
        outbox_id: string;
        acknowledged_by: string;
        note: string | null;
      }>(sql`
        select outbox_id, acknowledged_by, note
        from public.outbox_dead_letter_acks
        where outbox_id in (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      `)
    ).rows;

  it("is system/admin only", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-ack-auth", db),
      );
      await expect(
        actor.acknowledgeDeadLetters(userCtx(crypto.randomUUID(), "req"), {
          by: "someone",
        }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  it("refuses an acknowledgement that names nobody", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-ack-anon", db),
      );
      await expect(
        actor.acknowledgeDeadLetters(systemCtx("test"), { by: "   " }),
      ).rejects.toThrow(ValidationError);
      await expect(
        actor.acknowledgeDeadLetters(systemCtx("test"), {
          by: "ops",
          ids: ["not-a-uuid"],
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  /**
   * The headline: the alarm goes quiet on a population an operator has
   * triaged, **and the evidence is untouched**. `dead` still counts the rows,
   * the `outbox` rows keep their status, attempts and error.
   */
  it("takes acknowledged rows out of the alarm without deleting them", async () => {
    await withTestDb(async (db) => {
      const mine = `AckQuiet-${crypto.randomUUID().slice(0, 8)}Actor`;
      const first = await dead(db, mine);
      const second = await dead(db, mine);

      const actor = await activate(
        createActor(MaintenanceActor, "singleton-ack-quiet", db),
      );
      const before = await actor.reportDeadLetters(systemCtx("test"));
      expect(before.byTarget.some((g) => g.targetActor === mine)).toBe(true);

      const acked = await actor.acknowledgeDeadLetters(systemCtx("test"), {
        targetActor: mine,
        by: "ops",
        note: "fixed in abc1234",
      });
      expect(acked.acknowledged).toBe(2);
      expect(new Set(acked.ids)).toEqual(new Set([first, second]));

      const after = await actor.reportDeadLetters(systemCtx("test"));
      // Gone from the alarm...
      expect(after.newDead - before.newDead).toBe(-2);
      expect(after.byTarget.some((g) => g.targetActor === mine)).toBe(false);
      // ...but not from the evidence.
      expect(after.dead).toBe(before.dead);
      expect(after.acknowledged - before.acknowledged).toBe(2);
      expect(after.targets).toBe(before.targets);

      const rows = await db
        .select()
        .from(outbox)
        .where(eq(outbox.targetActor, mine));
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.status === "dead")).toBe(true);
      expect(rows.every((r) => r.attempts === 10)).toBe(true);

      const ledger = await acks(db, [first, second]);
      expect(ledger).toHaveLength(2);
      expect(ledger[0]?.acknowledged_by).toBe("ops");
      expect(ledger[0]?.note).toBe("fixed in abc1234");
    });
  });

  /**
   * **The regression case, and the reason acknowledgement is keyed on a row
   * rather than on a `(target_actor, method)` pair.** A pair-level mute would
   * suppress this — the most valuable thing the alarm can say.
   */
  it("fires again, and louder, when an acknowledged pair dies anew", async () => {
    await withTestDb(async (db) => {
      const mine = `AckRegress-${crypto.randomUUID().slice(0, 8)}Actor`;
      await dead(db, mine);
      await dead(db, mine);

      const actor = await activate(
        createActor(MaintenanceActor, "singleton-ack-regress", db),
      );
      await actor.acknowledgeDeadLetters(systemCtx("test"), {
        targetActor: mine,
        by: "ops",
      });
      const quiet = await actor.reportDeadLetters(systemCtx("test"));
      expect(quiet.byTarget.some((g) => g.targetActor === mine)).toBe(false);
      expect(deadLetterEvents(quiet).map((e) => e.name)).not.toContain(
        DEAD_LETTER_REGRESSION,
      );

      // The fixed bug regresses: a brand-new row of a pair somebody already
      // signed off on. No acknowledgement can have named this id.
      await dead(db, mine);

      const loud = await actor.reportDeadLetters(systemCtx("test"));
      expect(loud.newDead - quiet.newDead).toBe(1);
      expect(loud.regressed - quiet.regressed).toBe(1);
      const ours = loud.byTarget.find((g) => g.targetActor === mine);
      expect(ours).toEqual(
        expect.objectContaining({
          method: "doThing",
          count: 1,
          acknowledged: 2,
          regression: true,
        }),
      );
      const names = deadLetterEvents(loud).map((e) => e.name);
      expect(names[0]).toBe(DEAD_LETTER_REGRESSION);
    });
  });

  /**
   * The other shape a regression takes, and the one the ledger used to miss:
   * not a new row, but an acknowledged row **requeued and killed again under
   * the same id**. An acknowledgement that merely *exists* matched it, so the
   * report beat all-clear over a fix that had not held — `newDead=0,
   * regressed=0`, no page.
   *
   * The second death is written by the real drainer, not by a fixture,
   * because what this pins is a contract between two modules: `OutboxActor`
   * stamps `updated_at` on every transition into `dead`, and the report reads
   * that as the time of death. The target actor is undeclared, so the drainer
   * refuses it on attempt 1 through `#fail` — its ordinary death write — and
   * `deliver` never runs (it throws here rather than reach for a sidecar).
   *
   * `withTestDb` is one transaction, so `now()` is frozen for the whole test:
   * the first death and the acknowledgement are placed in the past explicitly,
   * which is where they would be in production.
   */
  it("does not let an acknowledgement survive a requeue: the next death pages", async () => {
    class NoSidecarOutboxActor extends OutboxActor {
      protected override async deliver(row: ClaimedRow): Promise<void> {
        throw new Error(`no sidecar in this test (${row.id})`);
      }
    }

    await withTestDb(async (db) => {
      const mine = `AckRequeue-${crypto.randomUUID().slice(0, 8)}Actor`;
      const [seeded] = await db
        .insert(outbox)
        .values({
          targetActor: mine,
          targetId: crypto.randomUUID(),
          method: "doThing",
          status: "dead",
          attempts: 10,
          lastError: "the first death",
          createdAt: new Date(Date.now() - 3 * HOUR_MS),
          updatedAt: new Date(Date.now() - 2 * HOUR_MS),
        })
        .returning({ id: outbox.id });
      const id = seeded?.id ?? "";

      const actor = await activate(
        createActor(MaintenanceActor, "singleton-ack-requeue", db),
      );
      await actor.acknowledgeDeadLetters(systemCtx("test"), {
        ids: [id],
        by: "ops",
        note: "fixed in abc1234",
      });
      // An hour ago: after the first death, before everything below.
      await db.execute(sql`
        update public.outbox_dead_letter_acks
        set acknowledged_at = now() - interval '1 hour'
        where outbox_id = ${id}::uuid
      `);
      const quiet = await actor.reportDeadLetters(systemCtx("test"));
      expect(quiet.byTarget.some((g) => g.targetActor === mine)).toBe(false);

      // The fix ships; an operator requeues the row — the one way out of
      // `dead` — and it keeps its id. Then the real drainer kills it again.
      await db
        .update(outbox)
        .set({ status: "pending", attempts: 0, runAfter: sql`now()` })
        .where(eq(outbox.id, id));
      const drainer = await activate(
        createActor(NoSidecarOutboxActor, OUTBOX_ACTOR_ID, db),
      );
      await drainer.drain(adminCtx("admin-1", "requeue-probe"));
      const [redead] = await db.select().from(outbox).where(eq(outbox.id, id));
      expect(redead?.status).toBe("dead");
      expect(redead?.lastError).toContain("not in OUTBOX_TARGETS");

      const loud = await actor.reportDeadLetters(systemCtx("test"));
      expect(loud.newDead - quiet.newDead).toBe(1);
      expect(loud.acknowledged - quiet.acknowledged).toBe(-1);
      expect(loud.regressed - quiet.regressed).toBe(1);
      expect(loud.byTarget.find((g) => g.targetActor === mine)).toEqual(
        expect.objectContaining({
          count: 1,
          acknowledged: 0,
          redied: 1,
          regression: true,
        }),
      );
      expect(deadLetterEvents(loud).map((e) => e.name)[0]).toBe(
        DEAD_LETTER_REGRESSION,
      );

      // And it can be acknowledged again — otherwise fixing it for real would
      // leave a page nothing can clear, because the stale acknowledgement
      // already holds the primary key.
      const again = await actor.acknowledgeDeadLetters(systemCtx("test"), {
        ids: [id],
        by: "ops-2",
        note: "the real fix",
      });
      expect(again.ids).toEqual([id]);
      expect(again.superseded).toEqual([id]);
      const ledger = await acks(db, [id]);
      expect(ledger[0]?.acknowledged_by).toBe("ops-2");
      expect(ledger[0]?.note).toBe("the real fix");

      const cleared = await actor.reportDeadLetters(systemCtx("test"));
      expect(cleared.newDead).toBe(quiet.newDead);
      expect(cleared.regressed).toBe(quiet.regressed);
      expect(cleared.byTarget.some((g) => g.targetActor === mine)).toBe(false);
    });
  });

  /**
   * The invariant that makes `{ by }` with no filter safe enough to use as a
   * backfill: an acknowledgement can only ever reach a row that has *already*
   * died. Pre-acknowledging a live row would let one call disable the alarm
   * for a failure that has not happened yet.
   */
  it("cannot reach a row that has not dead-lettered yet", async () => {
    await withTestDb(async (db) => {
      const mine = `AckLive-${crypto.randomUUID().slice(0, 8)}Actor`;
      const live = await dead(db, mine, "doThing", "pending");

      const actor = await activate(
        createActor(MaintenanceActor, "singleton-ack-live", db),
      );
      // The broadest call there is, and it still cannot touch this row.
      const swept = await actor.acknowledgeDeadLetters(systemCtx("test"), {
        by: "ops",
      });
      expect(swept.ids).not.toContain(live);
      expect(await acks(db, [live])).toEqual([]);

      const before = await actor.reportDeadLetters(systemCtx("test"));
      await db
        .update(outbox)
        .set({ status: "dead" })
        .where(eq(outbox.id, live));
      const after = await actor.reportDeadLetters(systemCtx("test"));

      expect(after.newDead - before.newDead).toBe(1);
      expect(after.byTarget.some((g) => g.targetActor === mine)).toBe(true);
    });
  });

  it("is idempotent, and the first author wins", async () => {
    await withTestDb(async (db) => {
      const mine = `AckTwice-${crypto.randomUUID().slice(0, 8)}Actor`;
      const row = await dead(db, mine);
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-ack-twice", db),
      );

      const first = await actor.acknowledgeDeadLetters(systemCtx("test"), {
        targetActor: mine,
        by: "ops",
        note: "the original decision",
      });
      const again = await actor.acknowledgeDeadLetters(systemCtx("test"), {
        targetActor: mine,
        by: "someone-else",
        note: "a re-run of the same rollout",
      });

      expect(first.acknowledged).toBe(1);
      expect(again.acknowledged).toBe(0);
      // A covering acknowledgement is never "superseded" by a re-run.
      expect(again.superseded).toEqual([]);
      const ledger = await acks(db, [row]);
      expect(ledger).toHaveLength(1);
      expect(ledger[0]?.acknowledged_by).toBe("ops");
      expect(ledger[0]?.note).toBe("the original decision");
    });
  });

  it("treats an empty `ids` as no rows, not as every row", async () => {
    await withTestDb(async (db) => {
      const mine = `AckEmpty-${crypto.randomUUID().slice(0, 8)}Actor`;
      const row = await dead(db, mine);
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-ack-empty", db),
      );
      const result = await actor.acknowledgeDeadLetters(systemCtx("test"), {
        ids: [],
        by: "ops",
      });
      expect(result.acknowledged).toBe(0);
      expect(await acks(db, [row])).toEqual([]);
    });
  });

  it("acknowledges one named row and leaves its siblings alone", async () => {
    await withTestDb(async (db) => {
      const mine = `AckOne-${crypto.randomUUID().slice(0, 8)}Actor`;
      const chosen = await dead(db, mine);
      const other = await dead(db, mine);
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-ack-one", db),
      );
      const result = await actor.acknowledgeDeadLetters(systemCtx("test"), {
        ids: [chosen],
        by: "ops",
      });
      expect(result.ids).toEqual([chosen]);

      const after = await actor.reportDeadLetters(systemCtx("test"));
      const ours = after.byTarget.find((g) => g.targetActor === mine);
      expect(ours).toEqual(
        expect.objectContaining({
          count: 1,
          acknowledged: 1,
          regression: true,
        }),
      );
      expect(await acks(db, [other])).toEqual([]);
    });
  });

  /**
   * Every filter narrows, and each is proved to on its own. Until these, every
   * test in this block acknowledged a pair that was alone in its transaction,
   * so `targetActor`, `method` and `before` could each be ignored outright and
   * the suite stayed green (mutation audit, 2026-09-27) — while in production
   * an ignored filter means one operator's triage of one pair silences the
   * alarm for every other dead row in the table.
   */
  it("acknowledges only the named actor", async () => {
    await withTestDb(async (db) => {
      const tag = crypto.randomUUID().slice(0, 8);
      const chosen = await dead(db, `AckActorA-${tag}Actor`);
      const bystander = await dead(db, `AckActorB-${tag}Actor`);
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-ack-actor", db),
      );

      const result = await actor.acknowledgeDeadLetters(systemCtx("test"), {
        targetActor: `AckActorA-${tag}Actor`,
        by: "ops",
      });

      expect(result.ids).toEqual([chosen]);
      expect(await acks(db, [bystander])).toEqual([]);
    });
  });

  it("acknowledges only the named method of that actor", async () => {
    await withTestDb(async (db) => {
      const mine = `AckMethod-${crypto.randomUUID().slice(0, 8)}Actor`;
      const chosen = await dead(db, mine, "alpha");
      const sibling = await dead(db, mine, "beta");
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-ack-method", db),
      );

      const result = await actor.acknowledgeDeadLetters(systemCtx("test"), {
        targetActor: mine,
        method: "alpha",
        by: "ops",
      });

      expect(result.ids).toEqual([chosen]);
      expect(await acks(db, [sibling])).toEqual([]);
    });
  });

  /**
   * `before` is how the 2026-09-20 backfill was scoped — pinned to the rollout
   * instant so that nothing which died *after* the fix could be swept into the
   * acknowledgement. Ignoring it would have silenced exactly the regression the
   * ledger exists to surface.
   */
  it("acknowledges only rows created before `before`", async () => {
    await withTestDb(async (db) => {
      const mine = `AckBefore-${crypto.randomUUID().slice(0, 8)}Actor`;
      const [old] = await db
        .insert(outbox)
        .values({
          targetActor: mine,
          targetId: crypto.randomUUID(),
          method: "doThing",
          status: "dead",
          attempts: 10,
          createdAt: new Date(Date.now() - 2 * HOUR_MS),
        })
        .returning({ id: outbox.id });
      const recent = await dead(db, mine);
      const actor = await activate(
        createActor(MaintenanceActor, "singleton-ack-before", db),
      );

      const result = await actor.acknowledgeDeadLetters(systemCtx("test"), {
        targetActor: mine,
        before: new Date(Date.now() - HOUR_MS).toISOString(),
        by: "ops",
      });

      expect(result.ids).toEqual([old?.id]);
      expect(await acks(db, [recent])).toEqual([]);
    });
  });
});
