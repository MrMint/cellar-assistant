/**
 * `VectorReembedJobActor` — the walk that makes a model change (and the
 * cutover) actually re-embed the stored vectors.
 *
 * What is worth proving beyond "it called regenerateVector":
 *
 *  - **it visits exactly the rows another embedding made** — a migrated
 *    legacy row (no recorded model) and one an older model made — and never
 *    one the configured model already made;
 *  - **end to end, a visited row stops being stale**: with the real
 *    `ItemActor`/`RecipeActor` behind the seam, a second run finds nothing;
 *  - **a budget refusal stops the chain without skipping the row** it was
 *    refused on, and any other failure is counted rather than wedging it.
 */
import { randomUUID } from "node:crypto";
import type { ItemRef } from "@cellar-assistant/contracts";
import {
  actorMethodTimeout,
  adminCtx,
  BudgetExceededError,
  ConflictError,
  ForbiddenError,
  itemActorId,
  NotFoundError,
  userCtx,
  VectorReembedJobActorDescriptor,
} from "@cellar-assistant/contracts";
import { jobs } from "@cellar-assistant/db";
import { eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type { EmbedDocument } from "../lib/embedding-client.ts";
import {
  seedItemVector,
  seedRecipe,
  seedRecipeVector,
  seedWine,
} from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  testDelivery,
  withTestDb,
} from "../lib/testing.ts";
import { setEmbeddingModel } from "../lib/vectors.ts";
import { ItemActor } from "./item-actor.ts";
import { BATCH_BUDGET_MARGIN_MS } from "./job-actor/index.ts";
import { RecipeActor } from "./recipe-actor.ts";
import type { VectorRegenerator } from "./vector-reembed-job-actor.ts";
import {
  reembedTables,
  VECTOR_REEMBED_WORST_CASE_MS,
  VectorReembedJobActor,
} from "./vector-reembed-job-actor.ts";

const MODEL = "vertex-ai:gemini-embedding-2@768/RETRIEVAL_DOCUMENT";
const OLD_MODEL = "vertex-ai:text-embedding-005@768/RETRIEVAL_DOCUMENT";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

const unit = (at: number): number[] =>
  Array.from({ length: 768 }, (_, i) => (i === at ? 1 : 0));

const jobActor = (db: DbOrTx, id: string, regenerate: VectorRegenerator) =>
  activate(
    new VectorReembedJobActor(daprClient(), new ActorId(id), db, regenerate),
  );

/** Records what was asked, answering "embedded" unless told otherwise. */
const recording = (
  answer: (key: string) => Error | null = () => null,
): { regenerate: VectorRegenerator; calls: string[] } => {
  const calls: string[] = [];
  const reply = async (key: string) => {
    calls.push(key);
    const error = answer(key);
    if (error !== null) throw error;
    return { skipped: false };
  };
  return {
    calls,
    regenerate: {
      item: (_ctx, ref) => reply(itemActorId(ref)),
      recipe: (_ctx, recipeId) => reply(`recipe:${recipeId}`),
    },
  };
};

const setModelOf = async (
  db: DbOrTx,
  table: "item_vectors" | "recipe_vectors",
  model: string | null,
  where: ReturnType<typeof sql>,
) => {
  await db.execute(sql`
    update ${sql.identifier(table)} set embedding_model = ${model} where ${where}
  `);
};

/** Run batches until the job says done; returns the job row. */
const runToEnd = async (
  actor: VectorReembedJobActor,
  jobId: string,
  db: DbOrTx,
) => {
  for (let batch = 0; batch < 50; batch += 1) {
    const result = await actor.runBatch(testDelivery(`${jobId}:${batch}`), {
      batch,
    });
    if (!result.ran || result.done) break;
  }
  const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (row === undefined) throw new Error("no job row");
  return row;
};

/** Two wines — one legacy, one an older model's — one current, one legacy recipe. */
const seedVectors = async (db: DbOrTx) => {
  const owner = await seedUser(db);
  const legacy = await seedWine(db, owner, "Legacy Wine");
  const older = await seedWine(db, owner, "Older Wine");
  const current = await seedWine(db, owner, "Current Wine");
  for (const [ref, at] of [
    [legacy, 1],
    [older, 2],
    [current, 3],
  ] as const) {
    await seedItemVector(db, ref, unit(at));
  }
  await setModelOf(
    db,
    "item_vectors",
    OLD_MODEL,
    sql`wine_id = ${older.id}::uuid`,
  );
  await setModelOf(
    db,
    "item_vectors",
    MODEL,
    sql`wine_id = ${current.id}::uuid`,
  );
  const recipeId = await seedRecipe(db, { name: "Legacy Negroni" });
  await seedRecipeVector(db, recipeId, unit(4));
  return { owner, legacy, older, current, recipeId };
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("VectorReembedJobActor", () => {
  afterAll(closeTestDb);
  afterEach(() => setEmbeddingModel(null));

  it("is admin-only to start, and refuses to start with no model to converge on", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db);
      const { regenerate } = recording();
      const actor = await jobActor(db, randomUUID(), regenerate);
      await expect(actor.start(userCtx(admin, "r"), {})).rejects.toThrow(
        ForbiddenError,
      );
      // AI_PROVIDER unset: nothing to re-embed with.
      await expect(actor.start(adminCtx(admin, "r"), {})).rejects.toThrow(
        ConflictError,
      );
    });
  });

  it("validates the tables it is asked to walk", () => {
    expect(reembedTables(undefined)).toEqual([
      "item_vectors",
      "recipe_vectors",
    ]);
    expect(reembedTables(["recipe_vectors", "item_vectors"])).toEqual([
      "item_vectors",
      "recipe_vectors",
    ]);
    expect(() => reembedTables(["place_vectors"])).toThrow(/place_vectors/);
    expect(() => reembedTables([])).toThrow(/non-empty/);
  });

  it("declares a runBatch timeout that holds one worst-case vector", () => {
    expect(
      actorMethodTimeout(VectorReembedJobActorDescriptor, "runBatch") -
        BATCH_BUDGET_MARGIN_MS,
    ).toBeGreaterThanOrEqual(VECTOR_REEMBED_WORST_CASE_MS);
  });

  it("visits exactly the vectors another embedding made — legacy and older — items first, then recipes", async () => {
    await withTestDb(async (db) => {
      const { owner, legacy, older, recipeId } = await seedVectors(db);
      setEmbeddingModel({ key: MODEL, acceptsImages: false });
      const { regenerate, calls } = recording();
      const jobId = randomUUID();
      const actor = await jobActor(db, jobId, regenerate);
      await actor.start(adminCtx(owner, "r"), {});

      const done = await runToEnd(actor, jobId, db);
      expect(calls).toEqual([
        itemActorId(legacy),
        itemActorId(older),
        `recipe:${recipeId}`,
      ]);
      expect(done.status).toBe("completed");
      expect(done.processed).toBe(3);
      expect(done.cursor).toMatchObject({
        value: {
          table: "recipe_vectors",
          model: MODEL,
          reembedded: 3,
          failed: 0,
        },
      });
    });
  });

  /**
   * End to end: the real `regenerateVector` behind the seam records the
   * configured model, so the rows drop out of the walk — a second job finds
   * nothing to do. This is the property the cutover depends on.
   */
  it("leaves nothing stale: a second run after the first visits no row", async () => {
    await withTestDb(async (db) => {
      const { owner } = await seedVectors(db);
      setEmbeddingModel({ key: MODEL, acceptsImages: false });
      const embed: EmbedDocument = async () => ({
        vector: unit(9),
        model: MODEL,
      });
      const inProcess: VectorRegenerator = {
        item: async (ctx, ref: ItemRef) =>
          (
            await activate(
              new ItemActor(
                daprClient(),
                new ActorId(itemActorId(ref)),
                db,
                async () => {
                  throw new Error("no FileActor in this test");
                },
                embed,
              ),
            )
          ).regenerateVector(ctx),
        recipe: async (ctx, recipeId) =>
          (
            await activate(
              new RecipeActor(
                daprClient(),
                new ActorId(recipeId),
                db,
                async () => {
                  throw new Error("no ItemActor in this test");
                },
                embed,
              ),
            )
          ).regenerateVector(ctx),
      };

      const firstId = randomUUID();
      const first = await jobActor(db, firstId, inProcess);
      await first.start(adminCtx(owner, "r"), {});
      expect((await runToEnd(first, firstId, db)).cursor).toMatchObject({
        value: { reembedded: 3, skipped: 0, failed: 0 },
      });

      const { rows } = await db.execute<{ stale: string }>(sql`
        select (select count(*) from public.item_vectors
                 where embedding_model is distinct from ${MODEL})
             + (select count(*) from public.recipe_vectors
                 where embedding_model is distinct from ${MODEL}) as stale
      `);
      expect(Number(rows[0]?.stale)).toBe(0);

      const { regenerate, calls } = recording();
      const secondId = randomUUID();
      const second = await jobActor(db, secondId, regenerate);
      await second.start(adminCtx(owner, "r"), {});
      expect((await runToEnd(second, secondId, db)).status).toBe("completed");
      expect(calls).toEqual([]);
    });
  });

  it("stops on a budget refusal without counting — or skipping past — the refused row", async () => {
    await withTestDb(async (db) => {
      const { owner, legacy, older } = await seedVectors(db);
      setEmbeddingModel({ key: MODEL, acceptsImages: false });
      const refused = itemActorId(older);
      const { regenerate, calls } = recording((key) =>
        key === refused
          ? new BudgetExceededError("ai_model/embedding refused: cap")
          : null,
      );
      const jobId = randomUUID();
      const actor = await jobActor(db, jobId, regenerate);
      await actor.start(adminCtx(owner, "r"), {});
      // Before any batch there is no cursor to report.
      expect(await actor.progress(adminCtx(owner, "r"))).toMatchObject({
        job: { id: jobId, status: "running" },
        cursor: null,
      });
      const done = await runToEnd(actor, jobId, db);

      expect(calls).toEqual([itemActorId(legacy), refused]);
      expect(done.status).toBe("completed");
      // `completed` is all `get` can say; `progress` says how it ended —
      // what `scripts/operator.ts reembed` exits 3 on.
      expect((await actor.get(adminCtx(owner, "r"))).status).toBe("completed");
      expect(await actor.progress(adminCtx(owner, "r"))).toMatchObject({
        job: { id: jobId, status: "completed" },
        cursor: { reembedded: 1, stopped: "ai_model/embedding refused: cap" },
      });
      // The job's reader rule, as `get`: a stranger is told it does not exist.
      const stranger = await seedUser(db);
      await expect(actor.progress(userCtx(stranger, "r"))).rejects.toThrow(
        NotFoundError,
      );
      const [legacyVector] = (
        await db.execute<{ id: number }>(sql`
          select id from public.item_vectors where wine_id = ${legacy.id}::uuid
        `)
      ).rows;
      expect(done.cursor).toMatchObject({
        value: {
          table: "item_vectors",
          lastId: Number(legacyVector?.id),
          reembedded: 1,
          failed: 0,
          stopped: "ai_model/embedding refused: cap",
        },
      });
    });
  });

  it("counts any other per-row failure and walks on", async () => {
    await withTestDb(async (db) => {
      const { owner, legacy, older, recipeId } = await seedVectors(db);
      setEmbeddingModel({ key: MODEL, acceptsImages: false });
      const { regenerate, calls } = recording((key) =>
        key === itemActorId(legacy) ? new Error("EmbeddingActor down") : null,
      );
      const jobId = randomUUID();
      const actor = await jobActor(db, jobId, regenerate);
      await actor.start(adminCtx(owner, "r"), {});
      const done = await runToEnd(actor, jobId, db);
      expect(calls).toEqual([
        itemActorId(legacy),
        itemActorId(older),
        `recipe:${recipeId}`,
      ]);
      expect(done.cursor).toMatchObject({
        value: { reembedded: 2, failed: 1 },
      });
    });
  });
});
