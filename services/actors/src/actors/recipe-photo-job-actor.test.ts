/**
 * `RecipePhotoJobActor` — C4 (§2.6), and the death of target-stack §7's
 * client-supplied `userId`.
 *
 * The IDOR is the reason this suite exists, so it is proved three ways and
 * each way fails on its own:
 *
 *  1. **runtime** — a payload naming a user is refused by `start` *and* by
 *     `processBatch`, so neither a request nor a hand-written outbox row can
 *     smuggle one in;
 *  2. **behaviour** — the writer records the `Ctx` it is called with, and the
 *     recipe is created as the user who *started* the job even when the
 *     payload screams a different id;
 *  3. **static** — the module is parsed and asserted to contain no `.userId`
 *     access at all. That is the assertion that fails if a later change
 *     re-adds one, which is what "there is a test that fails if someone
 *     reintroduces a client-supplied user id" means.
 *
 * Plus the §2.6 acceptance list: the chain is outbox-driven, a redelivery
 * doubles nothing, a crash resumes from the cursor, cancel stops it, and the
 * AI seam's default throws. No test touches the network.
 */
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  PROGRAM_TIMEOUT_MS,
  type Project,
  sourceFileAt,
} from "@cellar-assistant/analysis";
import type {
  Ctx,
  ExtractedRecipe,
  ItemSearchHit,
  ItemSearchInput,
  RecipeIngredientInput,
  RecipePhotoJobActorInterface,
} from "@cellar-assistant/contracts";
import {
  adminCtx,
  anonymousCtx,
  ConflictError,
  ForbiddenError,
  ITEM_TYPES,
  NotFoundError,
  RECIPE_PHOTO_STAGES,
  systemCtx,
  userCtx,
} from "@cellar-assistant/contracts";
import { files, friends, jobs, outbox } from "@cellar-assistant/db";
import { and, eq, sql } from "@cellar-assistant/db/orm";
import { isOwner } from "@cellar-assistant/policy";
import { ActorId, DaprClient } from "@dapr/dapr";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  RECIPE_INGREDIENT_ITEM_TYPES,
  RECIPE_PHOTO_SCHEMA,
} from "../lib/ai/prompts.ts";
import { actorsProject } from "../lib/analysis-testing.ts";
import type { DbOrTx } from "../lib/db.ts";
import { derivedUuid } from "../lib/derived-uuid.ts";
import type { VerifyFile } from "../lib/file-verification.ts";
import type {
  RecipePhotoExtraction,
  RecipePhotoExtractor,
} from "../lib/recipe-photo-ai.ts";
import { unconfiguredRecipePhotoExtractor } from "../lib/recipe-photo-ai.ts";
import type {
  IngredientSearcher,
  RecipeWriter,
} from "../lib/recipe-photo-matching.ts";
import {
  declaredItemType,
  genericFallback,
  INGREDIENT_MATCH_MAX_DISTANCE,
  ingredientItemTypes,
  ingredientSearchInput,
  ingredientSearchText,
  normaliseInstructionType,
  pickIngredientMatch,
} from "../lib/recipe-photo-matching.ts";
import { sidecarTargetsOf } from "../lib/sidecar-targets.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  testDelivery,
  withTestDb,
} from "../lib/testing.ts";
import { MAX_ATTEMPTS, OUTBOX_ACTOR_ID, OutboxActor } from "./outbox-actor.ts";
import {
  RECIPE_ID_NAMESPACE,
  RecipePhotoJobActor,
} from "./recipe-photo-job-actor.ts";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const EXTRACTION: ExtractedRecipe = {
  name: "Old Fashioned",
  type: "cocktail",
  description: "Sugar, bitters, whiskey.",
  difficultyLevel: 2,
  prepTimeMinutes: 4,
  servingSize: 1,
  groupName: "  Old   Fashioned  ",
  groupCategory: "cocktail",
  ingredients: [
    {
      name: "rye whiskey",
      quantity: 2,
      unit: "oz",
      itemType: "spirit",
      brandName: "Rittenhouse",
    },
    { name: "simple syrup", quantity: 0.25, unit: "oz", category: "syrup" },
  ],
  instructions: [
    { instructionText: "Stir with ice.", instructionType: "STIR" },
    { instructionText: "Garnish with orange.", instructionType: "FINISH" },
  ],
  confidence: 0.9,
};

/** A photo whose bytes landed — `verified_at` stamped, as `FileActor.verify` leaves it. */
const seedFile = async (
  db: DbOrTx,
  uploadedBy: string | null = null,
): Promise<string> => {
  const [row] = await db
    .insert(files)
    .values({
      key: `recipes/${randomUUID()}.jpg`,
      uploadedBy,
      verifiedAt: new Date(),
    })
    .returning({ id: files.id });
  if (row === undefined) throw new Error("seedFile: no row");
  return row.id;
};

/**
 * What `createUploadTarget` leaves behind before any bytes move: a real row, a
 * real FK target, and nothing in the bucket. This is the id an attacker has.
 */
const seedUnverifiedFile = async (
  db: DbOrTx,
  uploadedBy: string | null = null,
): Promise<string> => {
  const [row] = await db
    .insert(files)
    .values({ key: `recipes/${randomUUID()}.jpg`, uploadedBy })
    .returning({ id: files.id });
  if (row === undefined) throw new Error("seedUnverifiedFile: no row");
  return row.id;
};

/**
 * `FileActor.verify` without a sidecar (E2e), modelling **both** of its checks
 * rather than only the one E2d needed.
 *
 * `menu-scan-actor.test.ts`'s stub reproduces the `verified_at` half, because
 * unverified bytes were that defect. Here the authorization half is a
 * demonstrated hole too — a signed-in user could name another user's file id —
 * so this stub also runs `FileActor`'s `#requireUploaderOrBypass`, i.e.
 * `isOwner(ctx, files.uploaded_by)`. Reading the real row rather than answering
 * a constant is the point: `seedFile` decides, so a test passes because its
 * fixture is right and not because the fake always says yes.
 */
const dbVerifyFile =
  (db: DbOrTx): VerifyFile =>
  async (ctx, fileId) => {
    const [row] = await db
      .select({ verifiedAt: files.verifiedAt, uploadedBy: files.uploadedBy })
      .from(files)
      .where(eq(files.id, fileId));
    if (row === undefined) throw new NotFoundError(`file ${fileId} not found`);
    if (!isOwner(ctx, row.uploadedBy)) {
      throw new ForbiddenError(`file ${fileId} is not yours`);
    }
    return { id: fileId, verifiedAt: row.verifiedAt?.toISOString() ?? null };
  };

type WriterCall = {
  method: keyof RecipeWriter;
  ctx: Ctx;
  id: string;
  input: unknown;
};

const recordingWriter = (): {
  write: RecipeWriter;
  calls: WriterCall[];
} => {
  const calls: WriterCall[] = [];
  const write: RecipeWriter = {
    createGroup: async (ctx, id, input) => {
      calls.push({ method: "createGroup", ctx, id, input });
      return {
        id,
        name: (input as { name: string }).name,
        category: "cocktail",
        description: null,
        baseSpirit: null,
        tags: null,
        imageUrl: null,
        canonicalRecipeId: null,
        createdById: ctx.viewerId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // biome-ignore lint/suspicious/noExplicitAny: DTO stand-in for a fake
      } as any;
    },
    createRecipe: async (ctx, id, input) => {
      calls.push({ method: "createRecipe", ctx, id, input });
      // biome-ignore lint/suspicious/noExplicitAny: DTO stand-in for a fake
      return { id, createdById: ctx.viewerId } as any;
    },
    setIngredients: async (ctx, id, input) => {
      calls.push({ method: "setIngredients", ctx, id, input });
      return [];
    },
    setInstructions: async (ctx, id, input) => {
      calls.push({ method: "setInstructions", ctx, id, input });
      return [];
    },
  };
  return { write, calls };
};

const countingExtractor = (): {
  extract: RecipePhotoExtractor;
  calls: Ctx[];
} => {
  const calls: Ctx[] = [];
  const extract: RecipePhotoExtractor = async (
    ctx,
  ): Promise<RecipePhotoExtraction> => {
    calls.push(ctx);
    return { recipe: EXTRACTION, model: "fake-vision-1" };
  };
  return { extract, calls };
};

const noHits: IngredientSearcher = async () => [];

const searcherFor = (
  hits: (input: ItemSearchInput) => readonly ItemSearchHit[],
): { search: IngredientSearcher; inputs: ItemSearchInput[] } => {
  const inputs: ItemSearchInput[] = [];
  const search: IngredientSearcher = async (_ctx, input) => {
    inputs.push(input);
    return hits(input);
  };
  return { search, inputs };
};

const jobActor = (
  db: DbOrTx,
  id: string,
  extract: RecipePhotoExtractor,
  search: IngredientSearcher,
  write: RecipeWriter,
  verifyFile: VerifyFile = dbVerifyFile(db),
) =>
  activate(
    new RecipePhotoJobActor(
      new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
      new ActorId(id),
      db,
      extract,
      search,
      write,
      verifyFile,
    ),
  );

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

/** Run the whole chain, one batch per stage. */
const runToCompletion = async (
  actor: RecipePhotoJobActor,
  jobId: string,
): Promise<void> => {
  for (let batch = 0; batch < RECIPE_PHOTO_STAGES.length; batch += 1) {
    await actor.runBatch(delivery(jobId), { batch });
  }
};

const { skip } = await resolveTestDatabase();

/* -------------------------------------------------------------------------- */
/* The IDOR                                                                    */
/* -------------------------------------------------------------------------- */

describe.skipIf(skip)("RecipePhotoJobActor — target-stack §7 IDOR", () => {
  afterAll(closeTestDb);

  it("refuses a payload that names a user, at start", async () => {
    await withTestDb(async (db) => {
      const attacker = await seedUser(db);
      const victim = await seedUser(db);
      const fileId = await seedFile(db, attacker);
      const { extract } = countingExtractor();
      const { write } = recordingWriter();
      const actor = await jobActor(db, randomUUID(), extract, noHits, write);

      // The exact shape the old action accepted, and the type now forbids.
      // biome-ignore lint/suspicious/noExplicitAny: the bad shape is the point
      const attack = { fileId, userId: victim } as any;

      await expect(
        actor.start(userCtx(attacker, "req"), attack),
      ).rejects.toThrow(/may not carry `userId`/);
    });
  });

  it("refuses a payload that names a user, at delivery too", async () => {
    await withTestDb(async (db) => {
      const attacker = await seedUser(db);
      const victim = await seedUser(db);
      const fileId = await seedFile(db, attacker);
      const jobId = randomUUID();
      const { extract, calls } = countingExtractor();
      const { write } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write);
      await actor.start(userCtx(attacker, "req"), { fileId });

      // Someone edits the committed `jobs.payload` by hand — the outbox row is
      // data, and a job's payload is read back from the database every batch.
      await db
        .update(jobs)
        .set({ payload: { fileId, userId: victim } })
        .where(eq(jobs.id, jobId));
      await activate(actor);

      await expect(
        actor.runBatch(delivery(jobId), { batch: 0 }),
      ).rejects.toThrow(/may not carry `userId`/);
      expect(calls).toHaveLength(0);
    });
  });

  it("creates the recipe as the job's owner, never as anyone named", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const victim = await seedUser(db);
      const fileId = await seedFile(db, owner);
      const jobId = randomUUID();
      const { extract, calls: extractions } = countingExtractor();
      const { write, calls } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write);

      await actor.start(userCtx(owner, "req"), { fileId });
      await runToCompletion(actor, jobId);

      // Every actor call in the chain — group, recipe, ingredients,
      // instructions — was made as the *starter*, and `victim` appears nowhere.
      expect(calls.map((call) => call.method)).toEqual([
        "createGroup",
        "createRecipe",
        "setIngredients",
        "setInstructions",
      ]);
      for (const call of calls) {
        expect(call.ctx.viewerId).toBe(owner);
        expect(call.ctx.kind).toBe("user");
        expect(call.ctx.viewerId).not.toBe(victim);
      }
      // Even the AI call runs as the owner, not as `system`.
      expect(extractions[0]?.viewerId).toBe(owner);
      expect(extractions[0]?.kind).toBe("user");
      expect((await jobRow(db, jobId)).createdBy).toBe(owner);
    });
  });

  it("will not start for an anonymous caller", async () => {
    await withTestDb(async (db) => {
      const fileId = await seedFile(db);
      const { extract } = countingExtractor();
      const { write } = recordingWriter();
      const actor = await jobActor(db, randomUUID(), extract, noHits, write);
      await expect(
        actor.start(anonymousCtx("req"), { fileId }),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  it("refuses to run a job whose owner is gone", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db, owner);
      const jobId = randomUUID();
      const { extract } = countingExtractor();
      const { write } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write);
      await actor.start(userCtx(owner, "req"), { fileId });

      await db.update(jobs).set({ createdBy: null }).where(eq(jobs.id, jobId));
      await activate(actor);

      await expect(
        actor.runBatch(delivery(jobId), { batch: 0 }),
      ).rejects.toThrow(/has no owner/);
    });
  });

  it("is not reachable from a request: runBatch is system-only", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db, owner);
      const jobId = randomUUID();
      const { extract } = countingExtractor();
      const { write } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write);
      await actor.start(userCtx(owner, "req"), { fileId });

      await expect(
        actor.runBatch(userCtx(owner, "req"), { batch: 0 }),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* The file ids                                                                */
/* -------------------------------------------------------------------------- */

/**
 * "Never trust the client's done" (target-stack §4), third instance — E2e.
 *
 * E2d closed this on `MenuScanActor.create` and `ItemActor.attachImage` and
 * missed here, where it is widest: this method takes a **list** of caller-
 * supplied ids as well as a single one, and its own input type advertises that
 * it carries "nothing about who owns the result".
 *
 * Both halves of `FileActor.verify` are asserted, because both were open:
 * `verified_at` (bytes that never arrived) and uploader (somebody else's
 * photo). Reproduced against the running stack before the fix —
 * `startRecipePhotoJob` answered `RUNNING` for an unverified id *and* for
 * another user's verified id, where `createMenuScan` answered `ConflictError`
 * and `ForbiddenError` for the same two.
 */
describe.skipIf(skip)("RecipePhotoJobActor — file verification (§4)", () => {
  afterAll(closeTestDb);

  it("refuses an unverified fileId, and commits no job", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedUnverifiedFile(db, owner);
      const jobId = randomUUID();
      const { extract, calls } = countingExtractor();
      const { write } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write);

      await expect(
        actor.start(userCtx(owner, "req"), { fileId }),
      ).rejects.toThrow(ConflictError);

      // Before the insert, not after: the point is that no job row and no
      // outbox row exist for a photo whose bytes never arrived.
      expect(await db.select().from(jobs).where(eq(jobs.id, jobId))).toEqual(
        [],
      );
      expect(await outboxFor(db, jobId)).toEqual([]);
      expect(calls).toHaveLength(0);
    });
  });

  it("refuses an unverified id inside additionalFileIds", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      // The single id is fine; only the second page never uploaded.
      const fileId = await seedFile(db, owner);
      const unverified = await seedUnverifiedFile(db, owner);
      const jobId = randomUUID();
      const { extract } = countingExtractor();
      const { write } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write);

      await expect(
        actor.start(userCtx(owner, "req"), {
          fileId,
          additionalFileIds: [unverified],
        }),
      ).rejects.toThrow(ConflictError);
      expect(await db.select().from(jobs).where(eq(jobs.id, jobId))).toEqual(
        [],
      );
    });
  });

  it("checks every element, not just the first", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db, owner);
      const good = await seedFile(db, owner);
      const bad = await seedUnverifiedFile(db, owner);
      const jobId = randomUUID();
      const { extract } = countingExtractor();
      const { write } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write);

      // The bad id is last, so a loop that stops early would let this through.
      await expect(
        actor.start(userCtx(owner, "req"), {
          fileId,
          additionalFileIds: [good, good, bad],
        }),
      ).rejects.toThrow(ConflictError);
    });
  });

  it("starts when every file is verified", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db, owner);
      const second = await seedFile(db, owner);
      const jobId = randomUUID();
      const { extract } = countingExtractor();
      const { write } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write);

      const job = await actor.start(userCtx(owner, "req"), {
        fileId,
        additionalFileIds: [second],
      });

      expect(job.status).toBe("running");
      expect(await outboxFor(db, jobId)).toHaveLength(1);
    });
  });

  it("verifies each distinct id once, and the payload keeps what was sent", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db, owner);
      const second = await seedFile(db, owner);
      const jobId = randomUUID();
      const seen: string[] = [];
      const counting: VerifyFile = async (ctx, id) => {
        seen.push(id);
        return dbVerifyFile(db)(ctx, id);
      };
      const { extract } = countingExtractor();
      const { write } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write, counting);

      await actor.start(userCtx(owner, "req"), {
        fileId,
        // A caller who repeats ids pays for one hop each, not five.
        additionalFileIds: [second, second, fileId],
      });

      expect(seen).toEqual([fileId, second]);
      // Deduplication is for the loop; `jobs.payload` is what the caller sent.
      const row = await jobRow(db, jobId);
      expect(
        (row.payload as { additionalFileIds: string[] }).additionalFileIds,
      ).toEqual([second, second, fileId]);
    });
  });

  it("bounds the list rather than making one turn pay for it", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db, owner);
      const jobId = randomUUID();
      const seen: string[] = [];
      const counting: VerifyFile = async (ctx, id) => {
        seen.push(id);
        return dbVerifyFile(db)(ctx, id);
      };
      const { extract } = countingExtractor();
      const { write } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write, counting);

      await expect(
        actor.start(userCtx(owner, "req"), {
          fileId,
          additionalFileIds: Array.from({ length: 11 }, () => randomUUID()),
        }),
      ).rejects.toThrow(/at most 10 ids, got 11/);

      // Refused on length alone — a long list must not buy eleven sidecar hops.
      expect(seen).toEqual([]);
    });
  });

  it("refuses a file id that has no row at all", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const actor = await jobActor(
        db,
        randomUUID(),
        countingExtractor().extract,
        noHits,
        recordingWriter().write,
      );

      await expect(
        actor.start(userCtx(owner, "req"), { fileId: randomUUID() }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  /**
   * The half E2d's stub did not model. `FileActor.verify` is uploader-only
   * (`#requireUploaderOrBypass`), *not* the wider `#requireReader` that lets a
   * public item image be displayed — so friendship buys nothing here, and a
   * stranger and a friend are refused identically. Asserted because "a friend
   * may see your cellar" makes the opposite a reasonable thing to assume.
   */
  it("refuses another user's file — owner yes, friend no, stranger no", async () => {
    await withTestDb(async (db) => {
      const uploader = await seedUser(db);
      const friend = await seedUser(db);
      const stranger = await seedUser(db);
      await db.insert(friends).values([
        { userId: uploader, friendId: friend },
        { userId: friend, friendId: uploader },
      ]);
      const fileId = await seedFile(db, uploader);
      const { extract } = countingExtractor();
      const { write } = recordingWriter();

      const startAs = async (viewer: string): Promise<unknown> => {
        const actor = await jobActor(db, randomUUID(), extract, noHits, write);
        return actor.start(userCtx(viewer, "req"), { fileId });
      };

      await expect(startAs(uploader)).resolves.toMatchObject({
        status: "running",
      });
      await expect(startAs(friend)).rejects.toThrow(ForbiddenError);
      await expect(startAs(stranger)).rejects.toThrow(ForbiddenError);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* The chain                                                                   */
/* -------------------------------------------------------------------------- */

describe.skipIf(skip)("RecipePhotoJobActor — the stage chain (§2.6)", () => {
  afterAll(closeTestDb);

  it("walks one stage per outbox-delivered batch", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db, owner);
      const jobId = randomUUID();
      const { extract } = countingExtractor();
      const { write, calls } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write);

      await actor.start(userCtx(owner, "req"), { fileId });
      expect(await outboxFor(db, jobId)).toHaveLength(1);

      const stages: string[] = [];
      for (let batch = 0; batch < RECIPE_PHOTO_STAGES.length; batch += 1) {
        const before = await jobRow(db, jobId);
        stages.push(
          (before.cursor as { value: { stage?: string } | null }).value
            ?.stage ?? "extract",
        );
        await actor.runBatch(delivery(jobId), { batch });
      }

      expect(stages).toEqual([...RECIPE_PHOTO_STAGES]);
      expect((await jobRow(db, jobId)).status).toBe("completed");
      // One scheduling row per stage transition, plus the first — and none
      // after the last stage. Scoped to this job, never a global count.
      expect(await outboxFor(db, jobId)).toHaveLength(
        RECIPE_PHOTO_STAGES.length,
      );
      expect(calls.map((call) => call.id)).toContain(
        derivedUuid(RECIPE_ID_NAMESPACE, jobId),
      );
    });
  });

  it("does not ask the model twice when a batch is redelivered", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db, owner);
      const jobId = randomUUID();
      const { extract, calls: extractions } = countingExtractor();
      const { write, calls } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write);
      await actor.start(userCtx(owner, "req"), { fileId });

      await actor.runBatch(delivery(jobId), { batch: 0 });
      const again = await actor.runBatch(delivery(jobId), { batch: 0 });

      expect(again).toEqual({ ran: false, reason: "duplicate" });
      expect(extractions).toHaveLength(1);
      expect(calls).toHaveLength(0);
      expect(await outboxFor(db, jobId)).toHaveLength(2);
    });
  });

  it("resumes at the next stage after the host dies mid-chain", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db, owner);
      const jobId = randomUUID();
      const { extract, calls: extractions } = countingExtractor();
      const { write, calls } = recordingWriter();

      const before = await jobActor(db, jobId, extract, noHits, write);
      await before.start(userCtx(owner, "req"), { fileId });
      await before.runBatch(delivery(jobId), { batch: 0 }); // extract
      await before.runBatch(delivery(jobId), { batch: 1 }); // group

      // The host dies. Everything a new activation knows is in `jobs`.
      const after = await jobActor(db, jobId, extract, noHits, write);
      await after.runBatch(delivery(jobId), { batch: 2 }); // recipe

      // It restarted at `recipe`, not at `extract`: one model call, ever.
      expect(extractions).toHaveLength(1);
      expect(calls.map((call) => call.method)).toEqual([
        "createGroup",
        "createRecipe",
      ]);
      const value = (
        (await jobRow(db, jobId)).cursor as { value: { stage: string } }
      ).value;
      expect(value.stage).toBe("ingredients");
    });
  });

  it("honours a cancel request at the top of the next stage", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db, owner);
      const jobId = randomUUID();
      const { extract, calls: extractions } = countingExtractor();
      const { write, calls } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write);
      await actor.start(userCtx(owner, "req"), { fileId });

      await actor.runBatch(delivery(jobId), { batch: 0 });
      await actor.cancel(userCtx(owner, "req"));
      const stopped = await actor.runBatch(delivery(jobId), { batch: 1 });

      expect(stopped).toEqual({ ran: false, reason: "cancelled" });
      expect(extractions).toHaveLength(1);
      expect(calls).toHaveLength(0);
      expect((await jobRow(db, jobId)).status).toBe("cancelled");
    });
  });

  it("reports progress to its owner and to nobody else", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const fileId = await seedFile(db, owner);
      const jobId = randomUUID();
      const { extract } = countingExtractor();
      const { write } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write);
      await actor.start(userCtx(owner, "req"), { fileId });
      await actor.runBatch(delivery(jobId), { batch: 0 });

      const progress = await actor.result(userCtx(owner, "req"));
      expect(progress).toMatchObject({
        jobId,
        recipeId: derivedUuid(RECIPE_ID_NAMESPACE, jobId),
        stage: "group",
        done: false,
      });
      // The class, not the wording. `JobActor` deliberately spells all three
      // of its refusals — absent row, wrong kind, not yours — the same way
      // (E5b), so a regex on the message is a test of the spelling rather
      // than of the rule.
      await expect(
        actor.result(userCtx(stranger, "req")),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it("matches an ingredient to a real item, and invents nothing else", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db, owner);
      const jobId = randomUUID();
      const spiritId = randomUUID();
      const { search, inputs } = searcherFor((input) =>
        (input.text ?? "").toLowerCase().includes("rye")
          ? [
              {
                type: "SPIRIT",
                id: spiritId,
                name: "Rittenhouse Rye",
                distance: 0.1,
              },
            ]
          : [],
      );
      const { extract } = countingExtractor();
      const { write, calls } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, search, write);

      await actor.start(userCtx(owner, "req"), { fileId });
      await runToCompletion(actor, jobId);

      // The brand sharpened the search text; the item type narrowed the search.
      expect(inputs[0]).toMatchObject({
        text: "Rittenhouse rye whiskey",
        itemTypes: ["SPIRIT"],
      });
      const ingredientsCall = calls.find(
        (call) => call.method === "setIngredients",
      );
      if (ingredientsCall === undefined) {
        throw new Error("setIngredients was never called");
      }
      const written = (
        ingredientsCall.input as {
          ingredients: readonly RecipeIngredientInput[];
        }
      ).ingredients;
      expect(written[0]).toMatchObject({
        ref: { type: "SPIRIT", id: spiritId },
        quantity: 2,
        unit: "oz",
      });
      // The unmatched one becomes a generic item, created by `ItemActor`
      // through `RecipeActor.setIngredients` — never inserted here.
      expect(written[1]).toMatchObject({
        newGenericItem: { name: "simple syrup", category: "syrup" },
      });
      expect(written[1]?.ref).toBeUndefined();
    });
  });

  it("normalises the instruction verbs the check constraint refuses", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const fileId = await seedFile(db, owner);
      const jobId = randomUUID();
      const { extract } = countingExtractor();
      const { write, calls } = recordingWriter();
      const actor = await jobActor(db, jobId, extract, noHits, write);
      await actor.start(userCtx(owner, "req"), { fileId });
      await runToCompletion(actor, jobId);

      const call = calls.find((entry) => entry.method === "setInstructions");
      if (call === undefined) {
        throw new Error("setInstructions was never called");
      }
      expect(
        (call.input as { instructions: { instructionType: string }[] })
          .instructions,
      ).toEqual([
        {
          instructionText: "Stir with ice.",
          instructionType: "mix",
          equipmentNeeded: null,
          timeMinutes: null,
        },
        {
          instructionText: "Garnish with orange.",
          instructionType: "garnish",
          equipmentNeeded: null,
          timeMinutes: null,
        },
      ]);
    });
  });
});

/* -------------------------------------------------------------------------- */
/* D3: the job reaches `failed` when — and only when — the outbox gives up     */
/* -------------------------------------------------------------------------- */

/**
 * The real drainer, with its network hop replaced by an in-process call to
 * the job actor under test — so the outbox's decision (retry, or dead) and
 * the job's (running, or failed) are made by their own code, side by side,
 * from the same failure. The page polls `status`, and `FAILED` is the only
 * thing that ends a poll of a job that will never complete.
 */
class InProcessDrainer extends OutboxActor {
  target: RecipePhotoJobActor | null = null;
  readonly invoked: string[] = [];
  protected override async invoke(
    _targetActor: string,
    _targetId: string,
    method: string,
    args: readonly unknown[],
  ): Promise<void> {
    if (this.target === null) throw new Error("no target");
    this.invoked.push(method);
    // The drainer's own `deliveryArgs`, as the sidecar would carry them, to
    // whichever method the row names — `runBatch`, or its `onDead`.
    const call = (this.target as unknown as Record<string, unknown>)[method];
    if (typeof call !== "function") throw new Error(`no method ${method}`);
    await (call as (...a: readonly unknown[]) => Promise<unknown>).apply(
      this.target,
      [...args],
    );
  }
}

const drainOnce = async (db: DbOrTx, drainer: InProcessDrainer, n: number) => {
  // The backoff has "elapsed".
  await db.execute(
    sql`update public.outbox set run_after = now() where status = 'pending'`,
  );
  await drainer.drain(adminCtx(randomUUID(), `drain-${n}`));
};

/**
 * **Compile-time:** the class keeps the promise `services/api` is typed
 * against. `get`, `start` and `cancel` used to return the raw `jobs` row —
 * `Date`s, `payload`, `cursor` — while `RecipePhotoJobActorInterface` said
 * `JobDto`, and nothing compared the two. If they drift again, this stops
 * compiling.
 */
const _keepsTheInterface = (
  actor: RecipePhotoJobActor,
): RecipePhotoJobActorInterface => actor;
void _keepsTheInterface;

describe.skipIf(skip)(
  "RecipePhotoJobActor — a job the outbox gives up on is failed (D3)",
  () => {
    afterAll(closeTestDb);

    it("stays running while the outbox retries, and fails on the attempt it dead-letters", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const fileId = await seedFile(db, owner);
        const jobId = randomUUID();
        const { write } = recordingWriter();
        let extractions = 0;
        const actor = await jobActor(
          db,
          jobId,
          async () => {
            extractions += 1;
            throw new ConflictError("vision provider answered 503");
          },
          noHits,
          write,
        );
        await actor.start(userCtx(owner, "req"), { fileId });
        const drainer = await activate(
          createActor(InProcessDrainer, OUTBOX_ACTOR_ID, db),
        );
        drainer.target = actor;
        const [row] = await outboxFor(db, jobId);
        const rowId = row?.id ?? "";

        const seen: { outbox: string; job: string }[] = [];
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
          await drainOnce(db, drainer, attempt);
          const [now] = await db
            .select()
            .from(outbox)
            .where(eq(outbox.id, rowId));
          seen.push({
            outbox: now?.status ?? "missing",
            job: (await jobRow(db, jobId)).status,
          });
        }

        expect(extractions).toBe(MAX_ATTEMPTS);
        // Nine retries: the row is pending and the job is running, every time.
        expect(
          seen
            .slice(0, MAX_ATTEMPTS - 1)
            .every((s) => s.outbox === "pending" && s.job === "running"),
        ).toBe(true);
        // The tenth: dead, and failed — in the same turn.
        expect(seen.at(-1)).toEqual({ outbox: "dead", job: "failed" });
        const job = await actor.get(userCtx(owner, "poll"));
        expect(job.finishedAt).not.toBeNull();
        expect(job.lastError).toContain("503");
        expect((await actor.result(userCtx(owner, "poll"))).done).toBe(false);
      });
    });

    it("fails the job when the host died mid-batch on the last attempt (the reclaim path)", async () => {
      // The one path `runBatch` cannot see: the reclaim sweep dead-letters the
      // row without invoking anything. The drainer's compensation
      // (`onDead: "markFailed"`) is what tells the job — and it used to stay
      // `running`, polled forever.
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const fileId = await seedFile(db, owner);
        const jobId = randomUUID();
        const { write } = recordingWriter();
        let extractions = 0;
        const actor = await jobActor(
          db,
          jobId,
          async () => {
            extractions += 1;
            return { recipe: EXTRACTION, model: "fake-vision-1" };
          },
          noHits,
          write,
        );
        await actor.start(userCtx(owner, "req"), { fileId });
        const [row] = await outboxFor(db, jobId);
        const rowId = row?.id ?? "";
        // Attempt 10 was claimed, and the host died before it returned.
        await db.execute(sql`
          update public.outbox
          set status = 'delivering', attempts = ${MAX_ATTEMPTS - 1},
              claim_token = gen_random_uuid(),
              updated_at = now() - interval '30 minutes'
          where id = ${rowId}
        `);

        const drainer = await activate(
          createActor(InProcessDrainer, OUTBOX_ACTOR_ID, db),
        );
        drainer.target = actor;
        await drainOnce(db, drainer, 1);

        const [dead] = await db
          .select()
          .from(outbox)
          .where(eq(outbox.id, rowId));
        expect(dead?.status).toBe("dead");
        // runBatch never ran; the compensation did, in the same drain.
        expect(extractions).toBe(0);
        expect(drainer.invoked).toEqual(["markFailed"]);
        const job = await actor.get(userCtx(owner, "poll"));
        expect(job.status).toBe("failed");
        expect(job.finishedAt).not.toBeNull();
        expect(job.lastError).toContain("reclaim");
      });
    });

    it("fails on the first attempt when the stored extraction's type is not one recipes accept", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const fileId = await seedFile(db, owner);
        const jobId = randomUUID();
        const { write } = recordingWriter();
        const actor = await jobActor(
          db,
          jobId,
          // What an extraction written before `RECIPE_PHOTO_SCHEMA` constrained
          // `type` can still hold in `jobs.cursor` (`recipeTypeOf`'s doc).
          async () => ({
            recipe: { ...EXTRACTION, type: "groupName" },
            model: "fake-vision-1",
          }),
          noHits,
          write,
        );
        await actor.start(userCtx(owner, "req"), { fileId });
        const drainer = await activate(
          createActor(InProcessDrainer, OUTBOX_ACTOR_ID, db),
        );
        drainer.target = actor;

        // extract, group: fine. recipe: `recipeTypeOf` refuses.
        for (let n = 1; n <= 3; n += 1) await drainOnce(db, drainer, n);

        const rows = await outboxFor(db, jobId);
        const dead = rows.filter((r) => r.status === "dead");
        expect(dead).toHaveLength(1);
        expect(dead[0]?.attempts).toBe(1);
        expect(dead[0]?.payload).toEqual({ batch: 2 });
        const job = await jobRow(db, jobId);
        expect(job.status).toBe("failed");
        expect(job.lastError).toContain("recipes_type_check");
      });
    });

    it("start hands back a JobDto: no payload or cursor crosses the sidecar", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const fileId = await seedFile(db, owner);
        const jobId = randomUUID();
        const { extract } = countingExtractor();
        const { write } = recordingWriter();
        const actor = await jobActor(db, jobId, extract, noHits, write);

        const started = await actor.start(userCtx(owner, "req"), { fileId });
        expect(started).not.toHaveProperty("payload");
        expect(started).not.toHaveProperty("cursor");
        expect(typeof started.createdAt).toBe("string");
        const read = await actor.get(userCtx(owner, "poll"));
        expect(Object.keys(read).sort()).toEqual(
          [
            "attempts",
            "cancelRequested",
            "createdAt",
            "createdBy",
            "finishedAt",
            "id",
            "kind",
            "lastError",
            "processed",
            "startedAt",
            "status",
            "total",
            "updatedAt",
          ].sort(),
        );
      });
    });
  },
);

/* -------------------------------------------------------------------------- */
/* Pure decisions and the unconfigured seam                                    */
/* -------------------------------------------------------------------------- */

describe("recipe-photo routing", () => {
  it("puts the brand in front of the name, once", () => {
    expect(
      ingredientSearchText({ name: "rye whiskey", brandName: "Rittenhouse" }),
    ).toBe("Rittenhouse rye whiskey");
    // Already there: no duplication.
    expect(
      ingredientSearchText({
        name: "Rittenhouse rye",
        brandName: "Rittenhouse",
      }),
    ).toBe("Rittenhouse rye");
    expect(ingredientSearchText({ name: " mint " })).toBe("mint");
  });

  it("takes the closest hit inside the threshold and no other", () => {
    const hit = (distance: number): ItemSearchHit => ({
      type: "SPIRIT",
      id: randomUUID(),
      name: "x",
      distance,
    });
    const near = hit(0.1);
    expect(pickIngredientMatch([hit(0.3), near])).toBe(near);
    expect(
      pickIngredientMatch([hit(INGREDIENT_MATCH_MAX_DISTANCE + 0.01)]),
    ).toBeNull();
    expect(pickIngredientMatch([])).toBeNull();
  });

  it("falls back to a generic item with a legal kind", () => {
    expect(genericFallback({ name: "simple syrup" })).toMatchObject({
      name: "simple syrup",
      kind: "ingredient",
      category: "ingredient",
    });
    expect(
      genericFallback({ name: "gin", itemType: "spirit", category: "gin" }),
    ).toMatchObject({ kind: "spirit", category: "gin" });
    // `sake` is a `generic_items.item_type` too, since 20260928043100.
    expect(genericFallback({ name: "sake", itemType: "sake" })).toMatchObject({
      kind: "sake",
    });
  });

  /*
   * What the model is actually asked for, read out of the schema it is sent
   * rather than typed again here. These tests used to pass on
   * `itemType: "spirit"` while the prompt asked for `'spirits'`, which the
   * matcher did not recognise, so all six requested values widened the search
   * to every table. Reading the description is what keeps a fixture and the
   * prompt from drifting apart again.
   */
  const promptedItemTypes = (): string[] => {
    const itemType =
      RECIPE_PHOTO_SCHEMA.properties?.ingredients?.items?.properties?.itemType;
    return [...(itemType?.description ?? "").matchAll(/'([^']+)'/g)].map(
      (match) => match[1] ?? "",
    );
  };

  /** The plural table names the prompt asked for until the matcher took both. */
  const TABLE_NAMES = [
    "wines",
    "spirits",
    "beers",
    "coffees",
    "sakes",
    "teas",
  ] as const;

  it("the prompt asks for one spelling of each of the six item types", () => {
    const prompted = promptedItemTypes();
    expect(prompted).toEqual([...RECIPE_INGREDIENT_ITEM_TYPES]);
    expect(prompted.map((value) => value.toUpperCase()).sort()).toEqual(
      [...ITEM_TYPES].sort(),
    );
  });

  it("narrows the search on every itemType the prompt asks for", () => {
    const prompted = promptedItemTypes();
    expect(prompted).toHaveLength(6);
    for (const itemType of prompted) {
      const ingredient = { name: "bourbon", itemType };
      const expected = [itemType.toUpperCase()];
      expect(ingredientItemTypes(ingredient), itemType).toEqual(expected);
      expect(ingredientSearchInput(ingredient).itemTypes, itemType).toEqual(
        expected,
      );
    }
  });

  it("narrows on the plural table names too, in any case", () => {
    for (const itemType of TABLE_NAMES) {
      const expected = itemType.slice(0, -1).toUpperCase();
      expect(declaredItemType(itemType), itemType).toBe(expected);
      expect(declaredItemType(` ${itemType.toUpperCase()} `), itemType).toBe(
        expected,
      );
      expect(
        ingredientSearchInput({ name: "bourbon", itemType }).itemTypes,
        itemType,
      ).toEqual([expected]);
    }
  });

  it("widens to all six on anything that is not one of them", () => {
    // `[]` is what `ItemSearchActor` reads as "every type".
    for (const itemType of [
      "gin",
      "whiskies",
      "ingredient",
      "teass",
      "s",
      "",
      null,
      undefined,
    ]) {
      expect(declaredItemType(itemType), String(itemType)).toBeNull();
      expect(
        ingredientItemTypes({ name: "x", itemType }),
        String(itemType),
      ).toEqual([]);
    }
  });

  it("files a generic fallback the same way whichever spelling came back", () => {
    const prompted = promptedItemTypes();
    for (const plural of TABLE_NAMES) {
      const singular = plural.slice(0, -1);
      expect(prompted).toContain(singular);
      expect(genericFallback({ name: "x", itemType: plural })).toEqual(
        genericFallback({ name: "x", itemType: singular }),
      );
    }
    // Every item type is also a `generic_items.item_type` kind, keeps it, and
    // defaults the category to it when the model gave none.
    expect(
      genericFallback({ name: "bourbon", itemType: "spirits" }),
    ).toMatchObject({ kind: "spirit", category: "spirit" });
    expect(
      genericFallback({ name: "red wine", itemType: "wine" }),
    ).toMatchObject({ kind: "wine", category: "wine" });
    // `sake` and `tea` were not, until 20260928043100 widened the constraint;
    // they now keep their kind in either spelling like the other four.
    expect(genericFallback({ name: "x", itemType: "teas" }).kind).toBe("tea");
    expect(genericFallback({ name: "x", itemType: "sake" }).kind).toBe("sake");
    expect(genericFallback({ name: "x", itemType: "ingredient" }).kind).toBe(
      "ingredient",
    );
  });

  it("maps every instruction verb into the six the constraint allows", () => {
    expect(normaliseInstructionType("SHAKE")).toBe("mix");
    expect(normaliseInstructionType("muddle")).toBe("prep");
    expect(normaliseInstructionType("FINISH")).toBe("garnish");
    expect(normaliseInstructionType("teleport")).toBe("mix");
    expect(normaliseInstructionType(null)).toBe("mix");
  });

  it("throws loudly when no vision provider is configured", async () => {
    await expect(
      unconfiguredRecipePhotoExtractor(systemCtx("r"), {
        jobId: randomUUID(),
        fileId: randomUUID(),
        additionalFileIds: [],
        notes: null,
      }),
    ).rejects.toThrow(/no AI provider is configured to read a recipe photo/);
  });
});

/* -------------------------------------------------------------------------- */
/* The static fence                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The host's program, for the static fences below: built once, under a
 * timeout sized for CPU rather than inside whichever test reaches it first
 * (PROGRAM_TIMEOUT_MS says why).
 */
let project: Project;
beforeAll(() => {
  project = actorsProject();
}, PROGRAM_TIMEOUT_MS);

/**
 * Parsed, not grepped: the module doc quotes `userId` a dozen times explaining
 * what it removed, and a regex would report every one of them. What must not
 * exist is a *property access* named `userId` — which is the only shape the
 * old bug could come back in, since a payload arriving from the outbox is an
 * object.
 */
const sourceOf = (file: string): ts.SourceFile =>
  sourceFileAt(project, fileURLToPath(new URL(file, import.meta.url)));

const propertyReads = (source: ts.SourceFile): string[] => {
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      names.push(`${node.expression.getText(source)}.${node.name.text}`);
    }
    if (ts.isElementAccessExpression(node)) {
      const argument = node.argumentExpression;
      if (ts.isStringLiteralLike(argument)) {
        names.push(`${node.expression.getText(source)}[${argument.text}]`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
};

describe("target-stack §7: no client-supplied user id (static)", () => {
  it("never reads a user id off anything but the jobs row", () => {
    const source = sourceOf("./recipe-photo-job-actor.ts");
    const reads = propertyReads(source);

    /**
     * Two reads are legitimate and everything else is the bug:
     *
     *  - `ctx.viewerId` — the *verified* viewer, which is what `start` writes
     *    into `jobs.created_by`. It comes from the token, not the payload;
     *  - `job.createdBy` — reading that column back.
     *
     * Anything else named like a user is a caller naming one.
     */
    const ALLOWED = new Set(["ctx.viewerId", "job.createdBy"]);
    const forbidden = reads.filter(
      (read) =>
        !ALLOWED.has(read) &&
        /\.(userId|user_id|viewerId|viewer_id|createdBy|created_by|ownerId|owner_id)$|\[(userId|user_id)\]$/.test(
          read,
        ),
    );
    expect(
      forbidden,
      [
        "",
        "`recipe-photo-job-actor.ts` read a user id off an object:",
        `  ${forbidden.join("\n  ")}`,
        "",
        "target-stack.md §7: `processRecipePhoto` took a client-supplied",
        "`userId` and that is the IDOR C4 closed. A job's principal is",
        "`jobs.created_by`, written by `JobActor.start` from `ctx.viewerId`,",
        "and read back by `#ownerContext`. Nothing else may name a user.",
        "",
      ].join("\n"),
    ).toEqual([]);

    // And the one legitimate source is present and is the jobs row.
    expect(reads).toContain("job.createdBy");
  });

  it("declares a payload type that cannot carry a user id", () => {
    // Compile-time half of the same fence: `bun run typecheck` fails if
    // `RecipePhotoJobPayload` ever stops forbidding these keys.
    const payload = {
      fileId: "00000000-0000-4000-8000-000000000000",
      // @ts-expect-error — `userId` is `never` on every job payload (§7).
      userId: "someone-else",
    } satisfies Partial<
      import("@cellar-assistant/contracts").RecipePhotoJobPayload
    >;
    expect(payload.fileId).toBeDefined();
  });
});

/* -------------------------------------------------------------------------- */
/* §8.5: what a C4 job actor is allowed to reach                               */
/* -------------------------------------------------------------------------- */

/** Every actor type a module reaches through the sidecar, sorted. */
const sidecarTargetsSorted = (source: ts.SourceFile): string[] =>
  sidecarTargetsOf(source).sort();

/**
 * §8.5's sanctioned edge for a job is `job → entity / registry / search`, and
 * nothing else. Pinning the target list is what stops a later change quietly
 * adding an edge — the same fence B8 put around `MenuMatchJobActor`, extended
 * to C4's three. A job actor whose seams live in `lib/` is checked there,
 * because that is where its `internal(ctx)(…)` calls are.
 */
describe("§8.5: C4's job actors reach only entity and search actors", () => {
  it("pins every sidecar target the three job actors can reach", () => {
    expect({
      placeRefresh: sidecarTargetsSorted(
        sourceOf("./place-refresh-job-actor.ts"),
      ),
      onboardingReprocess: sidecarTargetsSorted(
        sourceOf("./onboarding-reprocess-job-actor.ts"),
      ),
      // The recipe-photo job's hops live in its matching module.
      recipePhoto: sidecarTargetsSorted(
        sourceOf("./recipe-photo-job-actor.ts"),
      ),
      recipePhotoSeams: sidecarTargetsSorted(
        sourceOf("../lib/recipe-photo-matching.ts"),
      ),
      // E2e's file check is a third seam module, pinned here for the same
      // reason `no-external-calls.ts` pins it: moving an actor call one module
      // out must not move it out of this fence's sight.
      recipePhotoVerify: sidecarTargetsSorted(
        sourceOf("../lib/file-verification.ts"),
      ),
    }).toEqual({
      // entity
      placeRefresh: ["PlaceActor"],
      // entity
      onboardingReprocess: ["ItemOnboardingActor"],
      // the actor itself reaches nothing directly
      recipePhoto: [],
      // search + entity, which is exactly why this is a job (§8.5)
      recipePhotoSeams: [
        "ItemSearchActor",
        "RecipeActor",
        "RecipeActor",
        "RecipeActor",
        "RecipeGroupActor",
      ],
      // entity — §8.5's `job → entity`, the same edge `MenuScanActor` uses to
      // ask whether the bytes arrived. Not a new *entity → entity* edge: §8.5's
      // set of those is closed and this does not touch it.
      recipePhotoVerify: ["FileActor"],
    });
  });

  it("no C4 job actor constructs a system ctx of its own", () => {
    // `lib/system-ctx.test.ts` enforces this repo-wide; asserted here too
    // because a job actor is precisely the module most tempted to.
    for (const file of [
      "./place-refresh-job-actor.ts",
      "./onboarding-reprocess-job-actor.ts",
      "./recipe-photo-job-actor.ts",
    ]) {
      const text = sourceOf(file).getFullText();
      expect(text).not.toContain("systemCtx(");
    }
  });
});
