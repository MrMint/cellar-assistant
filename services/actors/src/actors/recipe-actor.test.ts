/**
 * `RecipeActor` against a real Postgres (B6).
 *
 * What this file is built to prove:
 *
 *   1. **the `recipe_reviews` authorization gap is closed** — `target-stack.md`
 *      §7 records that `recipe_reviews` has no permissions in Hasura metadata
 *      at all, so there was no rule, only an absence. The rule B6 chose (insert
 *      = any signed-in, update/delete = author) is asserted from all three
 *      viewpoints, including the one that matters: the *recipe's creator* is
 *      not the author of someone else's review and may not touch it;
 *   2. **every viewer-dependent method has its owner / friend / stranger
 *      case**, plus the anonymous case the catalog rule refuses;
 *   3. **`recipe_ingredients` referencing a generic item goes through
 *      `ItemActor`** — the seam is called, the row appears, and a failing seam
 *      leaves `generic_items` untouched, which is the behavioural half of what
 *      `packages/db/src/writers.test.ts` proves statically;
 *   4. the vector is outbox-driven and enqueued only on a real content change,
 *      and its freshness check watches the owning *group* as well as the
 *      recipe — without which every regeneration caused by a canonical change
 *      would be a silent no-op;
 *   5. `ingredientCount` on the DTO, which is what replaces the
 *      `recipe_summary` view (§6 B6).
 */

import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  moduleSpecifiers,
  PROGRAM_TIMEOUT_MS,
  type Project,
  sourceFileAt,
} from "@cellar-assistant/analysis";
import {
  adminCtx,
  anonymousCtx,
  ConflictError,
  ForbiddenError,
  GENERIC_ITEM_KINDS,
  NotFoundError,
  pageArgs,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { genericItems, outbox, recipeVectors } from "@cellar-assistant/db";
import { eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { actorsProject } from "../lib/analysis-testing.ts";
import type { DbOrTx } from "../lib/db.ts";
import type { EmbedDocument } from "../lib/embedding-client.ts";
import { sidecarTargetsOf } from "../lib/sidecar-targets.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  testDelivery,
  withTestDb,
} from "../lib/testing.ts";
import { NO_IMAGES, setEmbeddingModel } from "../lib/vectors.ts";
import { ItemActor } from "./item-actor.ts";
import type { EnsureGenericItem } from "./recipe-actor.ts";
import { RecipeActor } from "./recipe-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

const page = pageArgs({ first: 50 });

const noEmbed: EmbedDocument = async () => {
  throw new Error("no EmbeddingActor in this test");
};

/** 768 dimensions, the size `recipe_vectors.vector` declares. */
const fakeEmbed =
  (calls: string[] = [], model: string | null = null): EmbedDocument =>
  async (_ctx, { text }) => {
    calls.push(text);
    return {
      vector: Array.from({ length: 768 }, (_value, index) => (index % 7) / 7),
      model,
    };
  };

const noGenericItems: EnsureGenericItem = async () => {
  throw new Error("no ItemActor in this test");
};

/**
 * The production seam is a Dapr hop to `ItemActor(generic:<id>).createGeneric`.
 * Here it is a real, in-process `ItemActor` sharing the test's transaction —
 * the shape `brand-registry-actor.test.ts` uses for `BrandActor.create`. That
 * matters: this is not a stub that pretends, it is the actual single writer of
 * `generic_items` doing the actual write.
 */
const inProcessGenericItems = (
  db: DbOrTx,
  calls: string[],
): EnsureGenericItem => {
  return async (ctx, genericItemId, input) => {
    calls.push(`${input.name}/${input.category}`);
    const actor = await activate(
      new ItemActor(
        daprClient(),
        new ActorId(`generic:${genericItemId}`),
        db,
        async () => {
          throw new Error("no FileActor in this test");
        },
        async () => {
          throw new Error("no EmbeddingActor in this test");
        },
      ),
    );
    return await actor.createGeneric(ctx, input);
  };
};

const newRecipeActor = (
  id: string,
  db: DbOrTx,
  ensureGenericItem: EnsureGenericItem = noGenericItems,
  embed: EmbedDocument = noEmbed,
): RecipeActor =>
  new RecipeActor(daprClient(), new ActorId(id), db, ensureGenericItem, embed);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const seedFriendship = async (
  db: DbOrTx,
  userId: string,
  friendId: string,
): Promise<void> => {
  await db.execute(sql`
    insert into public.friends (user_id, friend_id)
    values (${userId}::uuid, ${friendId}::uuid) on conflict do nothing
  `);
};

const seedRecipe = async (
  db: DbOrTx,
  options: {
    createdById: string | null;
    name?: string;
    type?: "cocktail" | "food";
    recipeGroupId?: string | null;
    createdAt?: string;
  },
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.recipes (id, name, type, created_by_id, recipe_group_id, created_at, updated_at)
    values (
      ${id}::uuid, ${options.name ?? "Test Recipe"}, ${options.type ?? "cocktail"},
      ${options.createdById}::uuid, ${options.recipeGroupId ?? null}::uuid,
      coalesce(${options.createdAt ?? null}::timestamptz, now()),
      coalesce(${options.createdAt ?? null}::timestamptz, now())
    )
  `);
  return id;
};

const seedRecipeGroup = async (
  db: DbOrTx,
  options: { createdById: string; name?: string; updatedAt?: string },
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.recipe_groups (id, name, category, created_by_id, updated_at)
    values (${id}::uuid, ${options.name ?? "Test Group"}, 'cocktail',
            ${options.createdById}::uuid,
            coalesce(${options.updatedAt ?? null}::timestamptz, now()))
  `);
  return id;
};

/** The cheapest real `ItemRef`-shaped seed (mirrors `tier-list-actor.test.ts`). */
const seedWine = async (
  db: DbOrTx,
  createdById: string,
  name = "Test Wine",
): Promise<string> => {
  await db.execute(
    sql`insert into public.wine_style (value) values ('RED') on conflict do nothing`,
  );
  const onboardingId = randomUUID();
  await db.execute(sql`
    insert into public.item_onboardings (id, user_id, item_type)
    values (${onboardingId}::uuid, ${createdById}::uuid, 'WINE')
  `);
  const id = randomUUID();
  await db.execute(sql`
    insert into public.wines (id, name, created_by_id, vintage, style, item_onboarding_id)
    values (${id}::uuid, ${name}, ${createdById}::uuid, '2020-01-01', 'RED',
            ${onboardingId}::uuid)
  `);
  return id;
};

const outboxRowsFor = async (
  db: DbOrTx,
  targetId: string,
): Promise<{ method: string; payload: unknown }[]> => {
  const rows = await db
    .select({
      method: outbox.method,
      payload: outbox.payload,
      targetActor: outbox.targetActor,
    })
    .from(outbox)
    .where(eq(outbox.targetId, targetId));
  return rows.map((row) => ({ method: row.method, payload: row.payload }));
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("RecipeActor", () => {
  afterAll(closeTestDb);

  /* ---------------------------------------------------------------------- */
  /* Reads: the catalog rule, from four viewpoints                           */
  /* ---------------------------------------------------------------------- */

  describe("visibility (catalog: any signed-in viewer, anonymous refused)", () => {
    it("serves get/ingredients/instructions/reviews/score to owner, friend and stranger alike", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, owner, friend);

        const recipeId = await seedRecipe(db, { createdById: owner });
        const actor = await activate(newRecipeActor(recipeId, db));

        for (const [label, viewer] of [
          ["owner", owner],
          ["friend", friend],
          ["stranger", stranger],
        ] as const) {
          const ctx = userCtx(viewer, `r-${label}`);
          expect((await actor.get(ctx)).id, label).toBe(recipeId);
          expect((await actor.ingredients(ctx, page)).totalCount, label).toBe(
            0,
          );
          expect((await actor.instructions(ctx, page)).totalCount, label).toBe(
            0,
          );
          expect((await actor.reviews(ctx, page)).totalCount, label).toBe(0);
          expect((await actor.score(ctx)).count, label).toBe(0);
        }
      });
    });

    it("refuses an anonymous viewer", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const actor = await activate(newRecipeActor(recipeId, db));
        const anon = anonymousCtx("r-anon");

        await expect(actor.get(anon)).rejects.toThrow(ForbiddenError);
        await expect(actor.ingredients(anon, page)).rejects.toThrow(
          ForbiddenError,
        );
        await expect(actor.reviews(anon, page)).rejects.toThrow(ForbiddenError);
      });
    });

    it("is NotFound for an id with no row", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const actor = await activate(newRecipeActor(randomUUID(), db));
        await expect(actor.get(userCtx(viewer, "r"))).rejects.toThrow(
          NotFoundError,
        );
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* create / update                                                         */
  /* ---------------------------------------------------------------------- */

  describe("create", () => {
    it("is idempotent on the actor id and enqueues exactly one regenerateVector", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const recipeId = randomUUID();
        const ctx = userCtx(owner, "r-create");
        const actor = await activate(newRecipeActor(recipeId, db));

        const first = await actor.create(ctx, {
          name: "  Negroni  ",
          type: "cocktail",
        });
        const second = await actor.create(ctx, {
          name: "Something else",
          type: "food",
        });

        expect(first.id).toBe(recipeId);
        expect(first.name).toBe("Negroni");
        expect(second).toEqual(first);
        expect(await outboxRowsFor(db, recipeId)).toEqual([
          { method: "regenerateVector", payload: { reason: "create" } },
        ]);
      });
    });

    it("refuses an anonymous creator and a non-uuid id", async () => {
      await withTestDb(async (db) => {
        const anon = await activate(newRecipeActor(randomUUID(), db));
        await expect(
          anon.create(anonymousCtx("r"), { name: "x", type: "food" }),
        ).rejects.toThrow(ForbiddenError);

        const owner = await seedUser(db);
        const bad = await activate(newRecipeActor("not-a-uuid", db));
        // The caller gate runs first: anonymous is `Forbidden` whatever id
        // it names, never `Validation` about the key.
        await expect(
          bad.create(anonymousCtx("r"), { name: "x", type: "food" }),
        ).rejects.toThrow(ForbiddenError);
        await expect(
          bad.create(userCtx(owner, "r"), { name: "x", type: "food" }),
        ).rejects.toThrow(ValidationError);
      });
    });
  });

  describe("update (creator only)", () => {
    it("refuses a friend and a stranger, allows the creator and an admin", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, owner, friend);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const actor = await activate(newRecipeActor(recipeId, db));

        await expect(
          actor.update(userCtx(friend, "r"), { name: "Friend's edit" }),
        ).rejects.toThrow(ForbiddenError);
        await expect(
          actor.update(userCtx(stranger, "r"), { name: "Stranger's edit" }),
        ).rejects.toThrow(ForbiddenError);

        expect(
          (await actor.update(userCtx(owner, "r"), { name: "Mine" })).name,
        ).toBe("Mine");
        expect(
          (await actor.update(adminCtx(stranger, "r"), { name: "Admin's" }))
            .name,
        ).toBe("Admin's");
      });
    });

    it("refuses everyone but an admin when the creator row is gone (created_by_id is nullable)", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const recipeId = await seedRecipe(db, { createdById: null });
        const actor = await activate(newRecipeActor(recipeId, db));

        await expect(
          actor.update(userCtx(viewer, "r"), { name: "x" }),
        ).rejects.toThrow(ForbiddenError);
        expect(
          (await actor.update(adminCtx(viewer, "r"), { name: "x" })).name,
        ).toBe("x");
      });
    });

    it("enqueues on an embedding-relevant change and not on an image-only one", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const ctx = userCtx(owner, "r");
        const recipeId = await seedRecipe(db, {
          createdById: owner,
          name: "Negroni",
        });
        const actor = await activate(newRecipeActor(recipeId, db));

        await actor.update(ctx, { imageUrl: "https://example.test/a.png" });
        expect(await outboxRowsFor(db, recipeId)).toEqual([]);

        // A same-value rewrite is not a change (B2's rule).
        await actor.update(ctx, { name: "Negroni" });
        expect(await outboxRowsFor(db, recipeId)).toEqual([]);

        await actor.update(ctx, { name: "Boulevardier" });
        expect(await outboxRowsFor(db, recipeId)).toEqual([
          { method: "regenerateVector", payload: { reason: "update" } },
        ]);
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Ingredients — the generic-item containment proof                        */
  /* ---------------------------------------------------------------------- */

  describe("setIngredients", () => {
    it("is creator only", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, owner, friend);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const wineId = await seedWine(db, owner);
        const actor = await activate(newRecipeActor(recipeId, db));
        const input = {
          ingredients: [{ ref: { type: "WINE" as const, id: wineId } }],
        };

        await expect(
          actor.setIngredients(userCtx(friend, "r"), input),
        ).rejects.toThrow(ForbiddenError);
        await expect(
          actor.setIngredients(userCtx(stranger, "r"), input),
        ).rejects.toThrow(ForbiddenError);
        expect(
          (await actor.setIngredients(userCtx(owner, "r"), input)).length,
        ).toBe(1);
      });
    });

    it("creates a generic ingredient through ItemActor, never by writing generic_items itself", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const ctx = userCtx(owner, "r");
        const recipeId = await seedRecipe(db, { createdById: owner });
        const calls: string[] = [];
        const actor = await activate(
          newRecipeActor(recipeId, db, inProcessGenericItems(db, calls)),
        );

        const written = await actor.setIngredients(ctx, {
          ingredients: [
            {
              newGenericItem: {
                name: "Campari",
                category: "liqueur",
                kind: "spirit",
              },
              quantity: 30,
              unit: "ml",
            },
          ],
        });

        // The seam was the only path to the row.
        expect(calls).toEqual(["Campari/liqueur"]);
        expect(written).toHaveLength(1);
        const ingredient = written[0];
        if (ingredient === undefined) throw new Error("no ingredient");
        expect(ingredient.ref.type).toBe("GENERIC");
        expect(ingredient.quantity).toBe(30);

        const rows = await db
          .select({ id: genericItems.id, name: genericItems.name })
          .from(genericItems)
          .where(eq(genericItems.id, ingredient.ref.id));
        expect(rows).toEqual([{ id: ingredient.ref.id, name: "Campari" }]);
      });
    });

    it("refuses an unknown generic kind, naming every kind it accepts — sake and tea included", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const calls: string[] = [];
        const actor = await activate(
          newRecipeActor(recipeId, db, inProcessGenericItems(db, calls)),
        );
        const refusal = actor.setIngredients(userCtx(owner, "r"), {
          ingredients: [
            {
              newGenericItem: {
                name: "Mystery",
                category: "other",
                kind: "mead" as never,
              },
            },
          ],
        });
        await expect(refusal).rejects.toThrow(ValidationError);
        // The list is `GENERIC_ITEM_KINDS`, not a hand-written copy that went
        // stale when sake and tea were added.
        await expect(refusal).rejects.toThrow(
          `one of ${GENERIC_ITEM_KINDS.join("|")}, got mead`,
        );
        expect(calls).toEqual([]);
      });
    });

    it("writes no generic_items row at all when the ItemActor call fails", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const before = await db
          .select({ id: genericItems.id })
          .from(genericItems);
        const actor = await activate(
          newRecipeActor(recipeId, db, async () => {
            throw new ConflictError("ItemActor is down");
          }),
        );

        await expect(
          actor.setIngredients(userCtx(owner, "r"), {
            ingredients: [
              {
                newGenericItem: {
                  name: "Nonexistent Thing",
                  category: "nonexistent",
                  kind: "ingredient",
                },
              },
            ],
          }),
        ).rejects.toThrow(ConflictError);

        const after = await db
          .select({ id: genericItems.id })
          .from(genericItems);
        expect(after.length).toBe(before.length);
      });
    });

    it("finds an existing generic item by (name, category) instead of creating a second", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const ctx = userCtx(owner, "r");
        const recipeId = await seedRecipe(db, { createdById: owner });
        const calls: string[] = [];
        const actor = await activate(
          newRecipeActor(recipeId, db, inProcessGenericItems(db, calls)),
        );
        const ingredients = {
          ingredients: [
            {
              newGenericItem: {
                name: "Sweet Vermouth",
                category: "fortified wine",
                kind: "wine" as const,
              },
            },
            // The same generic item twice in one call resolves once.
            {
              newGenericItem: {
                name: "Sweet Vermouth",
                category: "fortified wine",
                kind: "wine" as const,
              },
              isOptional: true,
            },
          ],
        };

        const first = await actor.setIngredients(ctx, ingredients);
        expect(calls).toEqual(["Sweet Vermouth/fortified wine"]);
        expect(new Set(first.map((row) => row.ref.id)).size).toBe(1);

        // A second call reuses the row and never reaches `ItemActor`.
        await actor.setIngredients(ctx, ingredients);
        expect(calls).toEqual(["Sweet Vermouth/fortified wine"]);
      });
    });

    it("replaces the whole list, counts it on the DTO, and refuses a malformed ingredient", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const ctx = userCtx(owner, "r");
        const recipeId = await seedRecipe(db, { createdById: owner });
        const wineId = await seedWine(db, owner, "Vermouth");
        const otherWineId = await seedWine(db, owner, "Gin-ish Wine");
        const actor = await activate(newRecipeActor(recipeId, db));

        await actor.setIngredients(ctx, {
          ingredients: [
            { ref: { type: "WINE", id: wineId } },
            { ref: { type: "WINE", id: otherWineId } },
          ],
        });
        // §6 B6: `recipe_summary` replaced by `ingredientCount` on the type.
        expect((await actor.get(ctx)).ingredientCount).toBe(2);

        await actor.setIngredients(ctx, {
          ingredients: [{ ref: { type: "WINE", id: wineId } }],
        });
        expect((await actor.get(ctx)).ingredientCount).toBe(1);

        await expect(
          actor.setIngredients(ctx, {
            ingredients: [
              {
                ref: { type: "WINE", id: wineId },
                newGenericItem: {
                  name: "Both",
                  category: "wrong",
                  kind: "ingredient",
                },
              },
            ],
          }),
        ).rejects.toThrow(ValidationError);

        await actor.setIngredients(ctx, { ingredients: [] });
        expect((await actor.get(ctx)).ingredientCount).toBe(0);
      });
    });

    it("enqueues a regeneration only when the ingredient set actually changed", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const ctx = userCtx(owner, "r");
        const recipeId = await seedRecipe(db, { createdById: owner });
        const wineId = await seedWine(db, owner);
        const actor = await activate(newRecipeActor(recipeId, db));
        const same = {
          ingredients: [{ ref: { type: "WINE" as const, id: wineId } }],
        };

        await actor.setIngredients(ctx, same);
        expect(await outboxRowsFor(db, recipeId)).toEqual([
          { method: "regenerateVector", payload: { reason: "setIngredients" } },
        ]);

        // Same content, new row ids — the signature is over content.
        await actor.setIngredients(ctx, same);
        expect(await outboxRowsFor(db, recipeId)).toHaveLength(1);
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Instructions                                                            */
  /* ---------------------------------------------------------------------- */

  describe("setInstructions", () => {
    it("is creator only, numbers steps 1..n, and replaces the list", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, owner, friend);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const actor = await activate(newRecipeActor(recipeId, db));
        const input = {
          instructions: [
            {
              instructionText: "Stir with ice",
              instructionType: "mix" as const,
            },
            { instructionText: "Garnish", instructionType: "garnish" as const },
          ],
        };

        await expect(
          actor.setInstructions(userCtx(friend, "r"), input),
        ).rejects.toThrow(ForbiddenError);
        await expect(
          actor.setInstructions(userCtx(stranger, "r"), input),
        ).rejects.toThrow(ForbiddenError);

        const written = await actor.setInstructions(userCtx(owner, "r"), input);
        expect(written.map((row) => row.stepNumber)).toEqual([1, 2]);
        expect(written.map((row) => row.instructionType)).toEqual([
          "mix",
          "garnish",
        ]);

        const shortened = await actor.setInstructions(userCtx(owner, "r"), {
          instructions: [{ instructionText: "Stir with ice" }],
        });
        expect(shortened.map((row) => row.stepNumber)).toEqual([1]);
        expect(shortened[0]?.instructionType).toBeNull();
      });
    });

    it("refuses an instruction type the pgEnum cannot hold", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const actor = await activate(newRecipeActor(recipeId, db));
        await expect(
          actor.setInstructions(userCtx(owner, "r"), {
            instructions: [
              {
                instructionText: "x",
                instructionType: "flambé" as never,
              },
            ],
          }),
        ).rejects.toThrow(ValidationError);
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Reviews — target-stack §7's `recipe_reviews` gap                        */
  /* ---------------------------------------------------------------------- */

  describe("reviews (the rule chosen for a table that had none)", () => {
    it("lets any signed-in user review, and refuses an anonymous one", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, owner, friend);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const actor = await activate(newRecipeActor(recipeId, db));

        for (const viewer of [owner, friend, stranger]) {
          const review = await actor.addReview(userCtx(viewer, "r"), {
            score: 4,
            text: "good",
          });
          expect(review.userId).toBe(viewer);
        }
        await expect(
          actor.addReview(anonymousCtx("r"), { score: 4 }),
        ).rejects.toThrow(ForbiddenError);

        expect((await actor.score(userCtx(owner, "r"))).count).toBe(3);
        expect((await actor.score(userCtx(owner, "r"))).average).toBe(4);
      });
    });

    it("is idempotent on reviewId and refuses a second review from one person", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const ctx = userCtx(owner, "r");
        const recipeId = await seedRecipe(db, { createdById: owner });
        const actor = await activate(newRecipeActor(recipeId, db));
        const reviewId = randomUUID();

        const first = await actor.addReview(ctx, { reviewId, score: 5 });
        const again = await actor.addReview(ctx, { reviewId, score: 1 });
        expect(again).toEqual(first);

        // `recipe_reviews_unique_user_recipe` is a database fact.
        await expect(actor.addReview(ctx, { score: 2 })).rejects.toThrow(
          ConflictError,
        );
      });
    });

    /**
     * Postgres answers ids in lowercase; an id that arrives as an argument
     * need not be. Each of these compared the argument with `===` against a
     * row, so an uppercase copy of a real id missed it: a second `addReview`
     * was no longer idempotent (it tried a second insert), and update/delete
     * said "not on this recipe".
     */
    it("reads an uppercase review id as the same review (lib/uuid.ts canonicalises it)", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const ctx = userCtx(owner, "r");
        const recipeId = await seedRecipe(db, { createdById: owner });
        const actor = await activate(newRecipeActor(recipeId, db));
        const reviewId = randomUUID();
        const upper = reviewId.toUpperCase();

        const first = await actor.addReview(ctx, { reviewId: upper, score: 5 });
        expect(first.id).toBe(reviewId);
        await expect(
          actor.addReview(ctx, { reviewId: upper, score: 1 }),
        ).resolves.toEqual(first);
        await expect(
          actor.updateReview(ctx, upper, { score: 4 }),
        ).resolves.toMatchObject({ id: reviewId, score: 4 });
        await expect(actor.deleteReview(ctx, upper)).resolves.toMatchObject({
          id: reviewId,
        });
      });
    });

    it("refuses a score the check constraint would refuse", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const actor = await activate(newRecipeActor(recipeId, db));
        await expect(
          actor.addReview(userCtx(owner, "r"), { score: 3.7 }),
        ).rejects.toThrow(ValidationError);
      });
    });

    /**
     * The acceptance criterion, stated as directly as it can be: the author
     * may edit and delete; the recipe's own creator, a friend of the author,
     * and a stranger may not. Before B6 there was no rule here at all.
     */
    it("author only for update and delete — the recipe's creator included", async () => {
      await withTestDb(async (db) => {
        const recipeOwner = await seedUser(db);
        const author = await seedUser(db);
        const friendOfAuthor = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, author, friendOfAuthor);

        const recipeId = await seedRecipe(db, { createdById: recipeOwner });
        const actor = await activate(newRecipeActor(recipeId, db));
        const review = await actor.addReview(userCtx(author, "r"), {
          score: 4,
          text: "mine",
        });

        for (const [label, viewer] of [
          ["the recipe's creator", recipeOwner],
          ["a friend of the author", friendOfAuthor],
          ["a stranger", stranger],
        ] as const) {
          await expect(
            actor.updateReview(userCtx(viewer, "r"), review.id, { score: 1 }),
            label,
          ).rejects.toThrow(ForbiddenError);
          await expect(
            actor.deleteReview(userCtx(viewer, "r"), review.id),
            label,
          ).rejects.toThrow(ForbiddenError);
        }
        await expect(
          actor.updateReview(anonymousCtx("r"), review.id, { score: 1 }),
        ).rejects.toThrow(ForbiddenError);

        // Nothing above changed the row.
        expect(
          (await actor.reviews(userCtx(stranger, "r"), page)).entries[0]?.node,
        ).toMatchObject({ score: 4, text: "mine" });

        const updated = await actor.updateReview(
          userCtx(author, "r"),
          review.id,
          { score: 2.5, text: "changed my mind" },
        );
        expect(updated.score).toBe(2.5);
        expect(
          await actor.deleteReview(userCtx(author, "r"), review.id),
        ).toEqual({ id: review.id });
        expect(
          (await actor.reviews(userCtx(author, "r"), page)).totalCount,
        ).toBe(0);
      });
    });

    it("is NotFound for a review that is not on this recipe", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const actor = await activate(newRecipeActor(recipeId, db));
        await expect(
          actor.updateReview(userCtx(owner, "r"), randomUUID(), { score: 1 }),
        ).rejects.toThrow(NotFoundError);
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* regenerateVector                                                        */
  /* ---------------------------------------------------------------------- */

  describe("regenerateVector (system, outbox)", () => {
    it("refuses a request-driven caller", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const actor = await activate(newRecipeActor(recipeId, db));
        await expect(
          actor.regenerateVector(userCtx(owner, "r")),
        ).rejects.toThrow(ForbiddenError);
      });
    });

    it("writes one vector, then skips a redelivery without calling the model", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const recipeId = await seedRecipe(db, {
          createdById: owner,
          name: "Negroni",
        });
        const embedded: string[] = [];
        const actor = await activate(
          newRecipeActor(recipeId, db, noGenericItems, fakeEmbed(embedded)),
        );

        const first = await actor.regenerateVector(testDelivery("1"));
        expect(first.skipped).toBe(false);
        const second = await actor.regenerateVector(testDelivery("1"));
        expect(second.skipped).toBe(true);

        expect(embedded).toHaveLength(1);
        expect(embedded[0]).toContain("Negroni");
        const rows = await db
          .select({ id: recipeVectors.id })
          .from(recipeVectors)
          .where(eq(recipeVectors.recipeId, recipeId));
        expect(rows).toHaveLength(1);
      });
    });

    it("re-embeds a vector nothing recorded (a migrated legacy row), recording the model and no images", async () => {
      await withTestDb(async (db) => {
        const MODEL = "vertex-ai:gemini-embedding-2@768/RETRIEVAL_DOCUMENT";
        const owner = await seedUser(db);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const embedded: string[] = [];
        const fresh = () =>
          activate(
            newRecipeActor(
              recipeId,
              db,
              noGenericItems,
              fakeEmbed(embedded, MODEL),
            ),
          );
        setEmbeddingModel({ key: MODEL, acceptsImages: true });
        try {
          await (await fresh()).regenerateVector(testDelivery("a"));
          await db.execute(sql`
            update public.recipe_vectors
            set embedding_model = null, embedding_images = null
            where recipe_id = ${recipeId}::uuid
          `);
          await expect(
            (await fresh()).regenerateVector(testDelivery("b")),
          ).resolves.toMatchObject({
            skipped: false,
            reason: "embedding changed",
          });
          await expect(
            (await fresh()).regenerateVector(testDelivery("c")),
          ).resolves.toMatchObject({ skipped: true });
          expect(embedded).toHaveLength(2);
          const rows = await db
            .select({
              model: recipeVectors.embeddingModel,
              images: recipeVectors.embeddingImages,
            })
            .from(recipeVectors)
            .where(eq(recipeVectors.recipeId, recipeId));
          // No image source for a recipe, even under a model that takes them.
          expect(rows).toEqual([{ model: MODEL, images: NO_IMAGES }]);
        } finally {
          setEmbeddingModel(null);
        }
      });
    });

    it("two activations that both saw no vector upsert one row (recipe_vectors_one_per_recipe)", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const first = await activate(
          newRecipeActor(recipeId, db, noGenericItems, fakeEmbed()),
        );
        const second = await activate(
          newRecipeActor(recipeId, db, noGenericItems, fakeEmbed()),
        );
        await first.regenerateVector(testDelivery("a"));
        await expect(
          second.regenerateVector(testDelivery("b")),
        ).resolves.toMatchObject({ skipped: false });
        const rows = await db
          .select({ id: recipeVectors.id })
          .from(recipeVectors)
          .where(eq(recipeVectors.recipeId, recipeId));
        expect(rows).toHaveLength(1);
      });
    });

    it("stamps the vector with the database clock on the update path, trigger or no trigger", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const recipeId = await seedRecipe(db, { createdById: owner });
        await (
          await activate(
            newRecipeActor(recipeId, db, noGenericItems, fakeEmbed()),
          )
        ).regenerateVector(testDelivery("a"));

        // Disables the legacy `update_recipe_vectors_updated_at` trigger for
        // this transaction only.
        await db.execute(sql`set local session_replication_role = replica`);
        await db.execute(sql`
          update public.recipe_vectors set updated_at = now() - interval '1 day'
          where recipe_id = ${recipeId}::uuid
        `);
        await db.execute(sql`
          update public.recipes set updated_at = now() - interval '1 hour'
          where id = ${recipeId}::uuid
        `);
        await expect(
          (
            await activate(
              newRecipeActor(recipeId, db, noGenericItems, fakeEmbed()),
            )
          ).regenerateVector(testDelivery("b")),
        ).resolves.toMatchObject({ skipped: false });

        const { rows } = await db.execute<{ same: boolean }>(sql`
          select updated_at = now() as same from public.recipe_vectors
          where recipe_id = ${recipeId}::uuid
        `);
        expect(rows).toEqual([{ same: true }]);
      });
    });

    /**
     * The reason the freshness check reads `recipe_groups.updated_at` too: a
     * canonical change rewrites the group's name and touches no `recipes` row,
     * so a recipe-only comparison would skip every regeneration it causes.
     */
    it("regenerates when only the owning group changed", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const groupId = await seedRecipeGroup(db, {
          createdById: owner,
          name: "Negroni",
          updatedAt: "2026-01-01T00:00:00Z",
        });
        const recipeId = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
          createdAt: "2026-01-01T00:00:00Z",
        });
        // A vector newer than both the recipe and the group. Inserted
        // directly rather than generated-then-aged, because every one of these
        // tables carries a `BEFORE UPDATE … update_updated_at_column()`
        // trigger that rewrites `updated_at` to `now()` — so an `UPDATE`
        // cannot move a timestamp backwards, and inside `withTestDb`'s single
        // transaction `now()` is constant (B1's harness note).
        await db.execute(sql`
          insert into public.recipe_vectors (recipe_id, vector, embedding_text, created_at, updated_at)
          values (
            ${recipeId}::uuid,
            ('[' || array_to_string(array_fill(0.1::real, ARRAY[768]), ',') || ']')::halfvec,
            'stale', '2026-01-02T00:00:00Z'::timestamptz, '2026-01-02T00:00:00Z'::timestamptz
          )
        `);

        const embedded: string[] = [];
        // One activation for the whole test: the point is that the *same*
        // actor instance sees the group change. An earlier draft re-activated
        // between the two calls and passed while the group was cached on the
        // aggregate — which is exactly the bug the running stack then showed.
        const actor = await activate(
          newRecipeActor(recipeId, db, noGenericItems, fakeEmbed(embedded)),
        );
        expect((await actor.regenerateVector(testDelivery("1"))).skipped).toBe(
          true,
        );
        expect(embedded).toEqual([]);

        // The group's name is what a canonical change rewrites, and it is part
        // of every member recipe's embedding text. No `recipes` row is
        // touched, so a recipe-only freshness check would skip this forever.
        await db.execute(sql`
          update public.recipe_groups
             set name = 'Negroni Sbagliato'
           where id = ${groupId}::uuid
        `);
        const after = await actor.regenerateVector(testDelivery("2"));
        expect(after.skipped).toBe(false);
        expect(embedded.at(-1)).toContain("Negroni Sbagliato");
      });
    });

    it("embeds ingredient and instruction content, not just the header", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const ctx = userCtx(owner, "r");
        const recipeId = await seedRecipe(db, { createdById: owner });
        const embedded: string[] = [];
        const calls: string[] = [];
        const actor = await activate(
          newRecipeActor(
            recipeId,
            db,
            inProcessGenericItems(db, calls),
            fakeEmbed(embedded),
          ),
        );

        await actor.setIngredients(ctx, {
          ingredients: [
            {
              newGenericItem: {
                name: "Campari",
                category: "liqueur",
                kind: "spirit",
              },
            },
          ],
        });
        await actor.setInstructions(ctx, {
          instructions: [{ instructionText: "Stir with ice" }],
        });
        await actor.regenerateVector(testDelivery("1"));

        const text = embedded[0] ?? "";
        expect(text).toContain("Campari");
        expect(text).toContain("Stir with ice");
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* A7d item 6: the ingredient order is defined                              */
  /* ---------------------------------------------------------------------- */

  describe("ingredient order (A7d item 6)", () => {
    /**
     * The defect was not "sorted by the wrong column" — it was that the sort
     * had no content. `created_at asc, id asc` looks stable, but
     * `setIngredients` re-inserts the whole list in one `INSERT` and `now()`
     * is transaction-stable, so every row shared a `created_at` and the order
     * fell through to `id asc` over a fresh `randomUUID()` per row.
     *
     * So the test that matters is the one the old code would fail: set the
     * same ingredients twice and require the *same* order both times, plus
     * required-before-optional regardless of name.
     */
    it("is required first, then alphabetical, and survives a re-set", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const ctx = userCtx(owner, "r");
        const recipeId = await seedRecipe(db, { createdById: owner });

        // Names chosen so alphabetical and insertion order disagree, and so
        // the optional one sorts *first* alphabetically — an ordering that
        // ignored `is_optional` would put it at the top.
        const aardvark = await seedWine(db, owner, "aardvark gin");
        const zebra = await seedWine(db, owner, "zebra rum");
        const mango = await seedWine(db, owner, "mango syrup");

        const input = {
          ingredients: [
            { ref: { type: "WINE" as const, id: zebra } },
            { ref: { type: "WINE" as const, id: aardvark }, isOptional: true },
            { ref: { type: "WINE" as const, id: mango } },
          ],
        };

        const actor = await activate(newRecipeActor(recipeId, db));
        await actor.setIngredients(ctx, input);

        const names = async (): Promise<string[]> => {
          const listed = await actor.ingredients(ctx, page);
          const ids = listed.entries.map((entry) => entry.node.ref?.id ?? "");
          const { rows } = await db.execute<{ id: string; name: string }>(sql`
            select id::text as id, name from public.wines
            where id = any(${sql.raw(
              `'{${[zebra, aardvark, mango].join(",")}}'::uuid[]`,
            )})
          `);
          const byId = new Map(rows.map((row) => [row.id, row.name]));
          return ids.map((id) => byId.get(id) ?? "?");
        };

        // Required (mango, zebra) alphabetically, then the optional aardvark —
        // which is alphabetically first and must still come last.
        expect(await names()).toEqual([
          "mango syrup",
          "zebra rum",
          "aardvark gin",
        ]);

        // Re-setting mints new row ids. The old `id asc` tiebreak would
        // reshuffle here; a defined order must not.
        await actor.setIngredients(ctx, {
          ingredients: [
            { ref: { type: "WINE" as const, id: mango } },
            { ref: { type: "WINE" as const, id: aardvark }, isOptional: true },
            { ref: { type: "WINE" as const, id: zebra } },
          ],
        });
        expect(await names()).toEqual([
          "mango syrup",
          "zebra rum",
          "aardvark gin",
        ]);
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* A7d item 7: delete                                                       */
  /* ---------------------------------------------------------------------- */

  describe("delete (A7d item 7)", () => {
    it("is creator only, and refuses a friend, a stranger and anonymous", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, owner, friend);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const actor = await activate(newRecipeActor(recipeId, db));

        await expect(actor.delete(anonymousCtx("r"))).rejects.toBeInstanceOf(
          ForbiddenError,
        );
        await expect(actor.delete(userCtx(friend, "r"))).rejects.toBeInstanceOf(
          ForbiddenError,
        );
        await expect(
          actor.delete(userCtx(stranger, "r")),
        ).rejects.toBeInstanceOf(ForbiddenError);

        expect(await actor.delete(userCtx(owner, "r"))).toEqual({
          id: recipeId,
        });
      });
    });

    it("cascades its children and makes the activation read as gone", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const ctx = userCtx(owner, "r");
        const recipeId = await seedRecipe(db, { createdById: owner });
        const wineId = await seedWine(db, owner);
        const actor = await activate(newRecipeActor(recipeId, db));
        await actor.setIngredients(ctx, {
          ingredients: [{ ref: { type: "WINE" as const, id: wineId } }],
        });
        await actor.setInstructions(ctx, {
          instructions: [{ instructionText: "stir" }],
        });
        await actor.addReview(ctx, { score: 5, text: "good" });

        await actor.delete(ctx);

        const remaining = async (table: string): Promise<number> => {
          const { rows } = await db.execute<{ n: string }>(sql`
            select count(*) as n from ${sql.raw(`public.${table}`)}
            where recipe_id = ${recipeId}::uuid
          `);
          return Number(rows[0]?.n ?? 0);
        };
        expect(await remaining("recipe_ingredients")).toBe(0);
        expect(await remaining("recipe_instructions")).toBe(0);
        expect(await remaining("recipe_reviews")).toBe(0);

        const { rows } = await db.execute<{ n: string }>(sql`
          select count(*) as n from public.recipes
          where id = ${recipeId}::uuid
        `);
        expect(Number(rows[0]?.n ?? 0)).toBe(0);

        // The activation outlives the row, and Dapr routes the next call here.
        await expect(actor.get(ctx)).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    it("clears a sibling's canonical pointer instead of hitting the self-FK", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const doomed = await seedRecipe(db, { createdById: owner });
        const pointer = await seedRecipe(db, { createdById: owner });
        // `recipes_canonical_recipe_id_recipes_id_fkey` has no ON DELETE, so
        // without the in-transaction clear this delete raises a raw FK
        // violation — a 500 rather than a typed error.
        await db.execute(sql`
          update public.recipes set canonical_recipe_id = ${doomed}::uuid
          where id = ${pointer}::uuid
        `);

        const actor = await activate(newRecipeActor(doomed, db));
        await actor.delete(userCtx(owner, "r"));

        const { rows } = await db.execute<{ canonical: string | null }>(sql`
          select canonical_recipe_id::text as canonical from public.recipes
          where id = ${pointer}::uuid
        `);
        expect(rows[0]?.canonical).toBeNull();
      });
    });

    it("hands the canonical recompute to the outbox, and only when grouped", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const groupId = await seedRecipeGroup(db, { createdById: owner });
        const grouped = await seedRecipe(db, {
          createdById: owner,
          recipeGroupId: groupId,
        });
        const loose = await seedRecipe(db, { createdById: owner });

        await (await activate(newRecipeActor(grouped, db))).delete(
          userCtx(owner, "r"),
        );
        // §8.5 has no RecipeActor → RecipeGroupActor edge, so this is an
        // outbox row and not a synchronous call. The static call-graph test
        // below is the other half of that claim.
        expect(await outboxRowsFor(db, groupId)).toEqual([
          {
            method: "recomputeCanonical",
            payload: { reason: "member deleted", recipeId: grouped },
          },
        ]);

        await (await activate(newRecipeActor(loose, db))).delete(
          userCtx(owner, "r"),
        );
        // An ungrouped recipe has no group to tell. No row, not a row with a
        // null target.
        expect(await outboxRowsFor(db, loose)).toEqual([]);
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* A7d item 8: machine-readable reasons                                     */
  /* ---------------------------------------------------------------------- */

  describe("error reasons (A7d item 8)", () => {
    it("names REVIEW_ALREADY_EXISTS and NOT_REVIEW_AUTHOR", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const other = await seedUser(db);
        const recipeId = await seedRecipe(db, { createdById: owner });
        const actor = await activate(newRecipeActor(recipeId, db));

        const mine = await actor.addReview(userCtx(owner, "r"), { score: 4 });
        await expect(
          actor.addReview(userCtx(owner, "r"), { score: 5 }),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          reason: "REVIEW_ALREADY_EXISTS",
        });

        await expect(
          actor.updateReview(userCtx(other, "r"), mine.id, { score: 1 }),
        ).rejects.toMatchObject({
          code: "FORBIDDEN",
          reason: "NOT_REVIEW_AUTHOR",
        });
        await expect(
          actor.deleteReview(userCtx(other, "r"), mine.id),
        ).rejects.toMatchObject({
          code: "FORBIDDEN",
          reason: "NOT_REVIEW_AUTHOR",
        });
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Static: §8.5's call graph, pinned                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * `lib/no-external-calls.test.ts` does this for `ItemActor` and `UserActor`;
   * B4 kept its own copy inside its actor's test file rather than editing the
   * shared one, and this follows that precedent (another agent is editing the
   * shared file concurrently).
   *
   * The list is two entries long on purpose. `ItemActor` is a **sixth**
   * synchronous entity→entity edge, beyond the five §8.5 names — see this
   * actor's module doc for why it is taken. Pinning it here is what stops a
   * seventh appearing without anyone deciding to add one.
   */
  describe("§8.5 call graph (static)", () => {
    // The host's program, built once under a timeout sized for CPU rather
    // than inside whichever test reaches it first (PROGRAM_TIMEOUT_MS says
    // why).
    let project: Project;
    beforeAll(() => {
      project = actorsProject();
    }, PROGRAM_TIMEOUT_MS);

    const source = (): ts.SourceFile =>
      sourceFileAt(
        project,
        fileURLToPath(new URL("./recipe-actor.ts", import.meta.url)),
      );

    const identifiers = (
      file: ts.SourceFile,
      wanted: Set<string>,
    ): string[] => {
      const hits: string[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && wanted.has(node.text))
          hits.push(node.text);
        ts.forEachChild(node, visit);
      };
      visit(file);
      return hits;
    };

    it("calls no HTTP client and no AI SDK of its own", async () => {
      expect(
        identifiers(
          source(),
          new Set([
            "fetch",
            "XMLHttpRequest",
            "generateContent",
            "generateEmbeddings",
            "createAIProvider",
          ]),
        ),
      ).toEqual([]);
    });

    it("reaches exactly ItemActor and EmbeddingActor through the sidecar", async () => {
      const file = source();
      // `ItemActor` directly; `EmbeddingActor` through the one shared adapter,
      // which is pinned too so the edge cannot grow a second target there.
      expect(sidecarTargetsOf(file)).toEqual(["ItemActor"]);
      expect(moduleSpecifiers(file)).toContain("../lib/embedding-client.ts");
      const client = sourceFileAt(
        project,
        fileURLToPath(new URL("../lib/embedding-client.ts", import.meta.url)),
      );
      // Two call sites there — `embed` for a phrase, `embedDocument` for a
      // stored row — and one target between them.
      expect(new Set(sidecarTargetsOf(client))).toEqual(
        new Set(["EmbeddingActor"]),
      );
    });
  });
});
