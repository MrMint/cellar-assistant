/**
 * `AiJobsCollectionActor` — X10's job tray and inbox. One case per kind of
 * work and per status, the windows that keep stale rows out, the typed
 * failure (N07) instead of the stored message, and the C3 rule: the viewer's
 * own rows only, and no other caller.
 */
import { randomUUID } from "node:crypto";
import {
  AI_JOB_KINDS,
  ForbiddenError,
  NO_AI_CAPABILITIES,
  RECIPE_PHOTO_JOB_KIND,
  userCtx,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { setAiCapabilities } from "../lib/ai/capabilities.ts";
import type { DbOrTx } from "../lib/db.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import {
  seedPlace,
  seedTierList,
  seedTierListPlace,
} from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { AiJobsCollectionActor } from "./ai-jobs-collection-actor.ts";
import { menuMatchJobId } from "./menu-scan-actor.ts";

const { skip } = await resolveTestDatabase();

const ago = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const seedOnboarding = async (
  db: DbOrTx,
  userId: string,
  status: string,
  minutesAgo: number,
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.item_onboardings
      (id, user_id, item_type, status, created_at, updated_at)
    values (${id}::uuid, ${userId}::uuid, 'WINE', ${status},
            ${ago(minutesAgo)}::timestamptz, ${ago(minutesAgo)}::timestamptz)
  `);
  return id;
};

const seedScan = async (
  db: DbOrTx,
  userId: string,
  input: {
    status: string;
    minutesAgo: number;
    error?: string;
    placeId?: string;
    detected?: number;
  },
): Promise<string> => {
  const file = randomUUID();
  await db.execute(sql`
    insert into public.files (id, key) values (${file}::uuid, ${`menus/${file}.jpg`})
  `);
  const id = randomUUID();
  const at = ago(input.minutesAgo);
  await db.execute(sql`
    insert into public.menu_scans
      (id, user_id, original_image_id, processing_status, processing_error,
       place_id, items_detected, scanned_at, created_at, processed_at, updated_at)
    values (${id}::uuid, ${userId}::uuid, ${file}::uuid, ${input.status},
            ${input.error ?? null}, ${input.placeId ?? null}::uuid,
            ${input.detected ?? 0}, ${at}::timestamptz, ${at}::timestamptz,
            ${at}::timestamptz, ${at}::timestamptz)
  `);
  return id;
};

const seedRecipeJob = async (
  db: DbOrTx,
  userId: string,
  status: string,
  minutesAgo: number,
  lastError: string | null = null,
): Promise<{ id: string; recipeId: string }> => {
  const id = randomUUID();
  const recipeId = randomUUID();
  const at = ago(minutesAgo);
  await db.execute(sql`
    insert into public.jobs
      (id, kind, status, created_by, cursor, last_error, created_at, updated_at,
       finished_at)
    values (${id}::uuid, ${RECIPE_PHOTO_JOB_KIND}, ${status}, ${userId}::uuid,
            ${JSON.stringify({ stage: "done", recipeId, extraction: { name: "Paper Plane" } })}::jsonb,
            ${lastError}, ${at}::timestamptz, ${at}::timestamptz,
            ${status === "completed" || status === "failed" ? at : null}::timestamptz)
  `);
  return { id, recipeId };
};

const seedListWithInsights = async (
  db: DbOrTx,
  userId: string,
  columns: {
    requested?: number;
    generated?: number;
    failed?: number;
    failure?: string;
    insights?: boolean;
  },
): Promise<string> => {
  const list = await seedTierList(db, {
    createdById: userId,
    name: "Reds, ranked",
  });
  for (let i = 0; i < 3; i += 1) {
    const place = await seedPlace(db, { name: `P${i}`, lng: 0, lat: 0 });
    await seedTierListPlace(db, list, place, 3, i);
  }
  const at = (minutes: number | undefined) =>
    minutes === undefined ? null : ago(minutes);
  await db.execute(sql`
    update public.tier_lists set
      ai_insights = ${columns.insights ? JSON.stringify({ summary: "x" }) : null}::jsonb,
      insights_requested_at = ${at(columns.requested)}::timestamptz,
      insights_generated_at = ${at(columns.generated)}::timestamptz,
      insights_failed_at = ${at(columns.failed)}::timestamptz,
      insights_failure = ${columns.failure ?? null}
    where id = ${list}::uuid
  `);
  return list;
};

const listFor = async (db: DbOrTx, viewer: string) => {
  const actor = await activate(createActor(AiJobsCollectionActor, viewer, db));
  return await actor.list(userCtx(viewer, "r"));
};

describe.skipIf(skip)("AiJobsCollectionActor", () => {
  afterAll(closeTestDb);
  afterEach(() => setAiCapabilities(NO_AI_CAPABILITIES));

  it("label reads: START while recent is RUNNING, COMPLETED is a READY draft, closed and stale ones are not listed", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const reading = await seedOnboarding(db, viewer, "START", 2);
      const draft = await seedOnboarding(db, viewer, "COMPLETED", 60);
      await seedOnboarding(db, viewer, "START", 60); // abandoned
      await seedOnboarding(db, viewer, "CONFIRMED", 5);
      await seedOnboarding(db, viewer, "MATCHED", 5);
      await seedOnboarding(db, viewer, "FAILED", 5);
      await seedOnboarding(db, viewer, "COMPLETED", 5 * 24 * 60); // old

      const jobs = await listFor(db, viewer);
      expect(jobs.map((j) => [j.id, j.status])).toEqual([
        [`LABEL_READ:${reading}`, "RUNNING"],
        [`LABEL_READ:${draft}`, "READY"],
      ]);
      expect(jobs[0]?.itemType).toBe("WINE");
      expect(jobs[0]?.finishedAt).toBeNull();
      expect(jobs[1]?.finishedAt).not.toBeNull();
    });
  });

  it("menu scans: running, read (with its place and line count) and failed with N07's typed reason, never the message", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const place = await seedPlace(db, {
        name: "Cork & Barrel",
        lng: 0,
        lat: 0,
      });
      const running = await seedScan(db, viewer, {
        status: "processing",
        minutesAgo: 1,
      });
      const read = await seedScan(db, viewer, {
        status: "completed",
        minutesAgo: 10,
        placeId: place,
        detected: 8,
      });
      const failed = await seedScan(db, viewer, {
        status: "failed",
        minutesAgo: 20,
        error: "BUDGET_EXCEEDED[USER_CAP]: daily allowance spent for user x",
      });
      await seedScan(db, viewer, {
        status: "pending",
        minutesAgo: 2 * 24 * 60,
      }); // stuck, not running

      const jobs = await listFor(db, viewer);
      const byId = new Map(jobs.map((j) => [j.subjectId, j]));
      expect([...byId.keys()].sort()).toEqual([running, read, failed].sort());
      expect(byId.get(running)?.status).toBe("RUNNING");
      expect(byId.get(read)).toMatchObject({
        status: "READY",
        placeId: place,
        placeName: "Cork & Barrel",
        count: 8,
      });
      expect(byId.get(failed)).toMatchObject({
        status: "FAILED",
        failureCode: "BUDGET_EXCEEDED",
        failureReason: "USER_CAP",
      });
      expect(JSON.stringify(jobs)).not.toContain("daily allowance");
    });
  });

  it("menu scans: extracted but still matching (N06a) is RUNNING, not READY", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const place = await seedPlace(db, { name: "Old Mill", lng: 0, lat: 0 });
      const extracted = (minutesAgo: number) =>
        seedScan(db, viewer, {
          status: "completed",
          minutesAgo,
          placeId: place,
          detected: 4,
        });
      const matchJob = async (scan: string, status: string) => {
        await db.execute(sql`
          insert into public.jobs (id, kind, status, created_by)
          values (${menuMatchJobId(scan)}::uuid, 'menu-match', ${status},
                  ${viewer}::uuid)
        `);
      };
      const outboxRow = async (
        target: keyof typeof OUTBOX_TARGETS,
        targetId: string,
        status: string,
      ) => {
        const { actorType, method } = OUTBOX_TARGETS[target];
        await db.execute(sql`
          insert into public.outbox (target_actor, target_id, method, status)
          values (${actorType}, ${targetId}, ${method}, ${status})
        `);
      };

      const jobRunning = await extracted(1);
      await matchJob(jobRunning, "running");
      const jobDone = await extracted(2);
      await matchJob(jobDone, "completed");
      const queued = await extracted(3);
      await outboxRow("MenuScanActor.match", queued, "pending");
      const starting = await extracted(4);
      await outboxRow(
        "MenuMatchJobActor.start",
        menuMatchJobId(starting),
        "delivering",
      );
      const deadLetter = await extracted(5);
      await outboxRow("MenuScanActor.match", deadLetter, "dead");
      // A scan with no place files nothing, so there is nothing to match.
      const placeless = await seedScan(db, viewer, {
        status: "completed",
        minutesAgo: 6,
        detected: 4,
      });
      await outboxRow("MenuScanActor.match", placeless, "pending");

      const status = new Map(
        (await listFor(db, viewer)).map((j) => [j.subjectId, j.status]),
      );
      expect(Object.fromEntries(status)).toEqual({
        [jobRunning]: "RUNNING",
        [jobDone]: "READY",
        [queued]: "RUNNING",
        [starting]: "RUNNING",
        [deadLetter]: "READY",
        [placeless]: "READY",
      });
    });
  });

  it("menu scans: a place under review someone else created is not named", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      const hidden = await seedPlace(db, {
        name: "Someone's pending bar",
        lng: 0,
        lat: 0,
        reviewStatus: "pending",
        createdBy: other,
      });
      const scan = await seedScan(db, viewer, {
        status: "completed",
        minutesAgo: 5,
        placeId: hidden,
      });
      const [job] = await listFor(db, viewer);
      expect(job?.subjectId).toBe(scan);
      expect(job?.placeName).toBeNull();
      expect(job?.placeId).toBeNull();
    });
  });

  it("recipe photos: the recipe only once the chain completed", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const running = await seedRecipeJob(db, viewer, "running", 1);
      const done = await seedRecipeJob(db, viewer, "completed", 5);
      await seedRecipeJob(db, viewer, "cancelled", 5);
      const jobs = await listFor(db, viewer);
      const byId = new Map(jobs.map((j) => [j.subjectId, j]));
      expect(byId.get(running.id)).toMatchObject({
        status: "RUNNING",
        recipeId: null,
      });
      expect(byId.get(done.id)).toMatchObject({
        status: "READY",
        recipeId: done.recipeId,
        recipeName: "Paper Plane",
      });
      expect(byId.size).toBe(2);
    });
  });

  it("tier-list insights: N07's PENDING is RUNNING, READY and FAILED settle, and nothing runs without a provider", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      setAiCapabilities({ ...NO_AI_CAPABILITIES, tierListInsights: true });
      const pending = await seedListWithInsights(db, viewer, {
        requested: 1,
      });
      const ready = await seedListWithInsights(db, viewer, {
        requested: 30,
        generated: 20,
        insights: true,
      });
      const failed = await seedListWithInsights(db, viewer, {
        requested: 30,
        failed: 25,
        failure: "BUDGET_EXCEEDED[SERVICE_BUDGET]: monthly budget",
      });
      const jobs = await listFor(db, viewer);
      const byId = new Map(jobs.map((j) => [j.subjectId, j]));
      expect(byId.get(pending)).toMatchObject({
        status: "RUNNING",
        tierListName: "Reds, ranked",
      });
      expect(byId.get(ready)?.status).toBe("READY");
      expect(byId.get(failed)).toMatchObject({
        status: "FAILED",
        failureCode: "BUDGET_EXCEEDED",
        failureReason: "SERVICE_BUDGET",
      });

      setAiCapabilities(NO_AI_CAPABILITIES);
      const without = await listFor(db, viewer);
      expect(without.find((j) => j.subjectId === pending)).toBeUndefined();
    });
  });

  it("lists the viewer's own work only, newest first, and refuses another caller", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      await seedOnboarding(db, other, "COMPLETED", 1);
      await seedScan(db, other, { status: "processing", minutesAgo: 1 });
      const older = await seedOnboarding(db, viewer, "COMPLETED", 30);
      const newer = await seedScan(db, viewer, {
        status: "completed",
        minutesAgo: 3,
      });
      const jobs = await listFor(db, viewer);
      expect(jobs.map((j) => j.subjectId)).toEqual([newer, older]);
      for (const j of jobs) expect(AI_JOB_KINDS).toContain(j.kind);

      const actor = await activate(
        createActor(AiJobsCollectionActor, viewer, db),
      );
      await expect(actor.list(userCtx(other, "r"))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });
});
