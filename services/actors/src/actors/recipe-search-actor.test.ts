/**
 * `RecipeSearchActor` — C1 (§2.3).
 *
 * Reads `recipes` and `recipe_vectors` directly and writes nothing; B6's
 * `RecipeActor` remains their single writer.
 */
import type { Ctx, RecipeSearchInput } from "@cellar-assistant/contracts";
import {
  ConflictError,
  ForbiddenError,
  recipeSearchActorId,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type { EmbedQuery } from "../lib/embedding-client.ts";
import { hnswScans, steerToIndexScans } from "../lib/hnsw-testing.ts";
import {
  blendedVector,
  seedFriendship,
  seedRecipe,
  seedRecipeVector,
  unitVector,
} from "../lib/search-testing.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import {
  mergeHybridRecipes,
  RecipeSearchActor,
} from "./recipe-search-actor.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string | null): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

const newActor = (
  input: RecipeSearchInput,
  db: DbOrTx,
  viewerId: string | null,
  embed: EmbedQuery = async () => unitVector(0),
): RecipeSearchActor =>
  new RecipeSearchActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(recipeSearchActorId(input, viewerId)),
    db,
    embed,
  );

describe.skipIf(skip)("RecipeSearchActor (§2.3)", () => {
  afterAll(closeTestDb);

  describe("lexical half (today's `SearchRecipesQuery`)", () => {
    it("matches name, description and type, exact name first", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        await seedRecipe(db, { name: "Negroni Sbagliato" });
        await seedRecipe(db, { name: "Negroni" });
        await seedRecipe(db, {
          name: "Boulevardier",
          description: "A negroni with whiskey",
        });
        await seedRecipe(db, { name: "Old Fashioned" });

        const input: RecipeSearchInput = { term: "negroni" };
        const hits = await newActor(input, db, viewer).all(
          userCtx(viewer),
          input,
        );
        expect(hits[0]?.name).toBe("Negroni");
        expect(hits.map((h) => h.name).sort()).toEqual([
          "Boulevardier",
          "Negroni",
          "Negroni Sbagliato",
        ]);
        expect(hits.every((hit) => hit.distance === null)).toBe(true);
      });
    });

    it("filters by recipe type", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        await seedRecipe(db, { name: "Negroni", type: "cocktail" });
        await seedRecipe(db, { name: "Negroni Cake", type: "food" });

        const input: RecipeSearchInput = { term: "negroni", type: "food" };
        const hits = await newActor(input, db, viewer).all(
          userCtx(viewer),
          input,
        );
        expect(hits.map((h) => h.name)).toEqual(["Negroni Cake"]);
      });
    });
  });

  describe("hybrid, for universal search (X12 / D9)", () => {
    const seedBar = async (db: DbOrTx) => {
      const negroni = await seedRecipe(db, { name: "Negroni" });
      const boulevardier = await seedRecipe(db, {
        name: "Boulevardier",
        description: "A negroni with whiskey",
      });
      const americano = await seedRecipe(db, { name: "Americano" });
      const mojito = await seedRecipe(db, { name: "Mojito" });
      const cake = await seedRecipe(db, {
        name: "Chocolate Cake",
        type: "food",
      });
      await seedRecipeVector(db, negroni, blendedVector(0, 1, 0.9));
      await seedRecipeVector(db, boulevardier, blendedVector(0, 1, 0.1));
      await seedRecipeVector(db, americano, blendedVector(0, 1, 0.2));
      await seedRecipeVector(db, mojito, blendedVector(0, 1, 0.3));
      await seedRecipeVector(db, cake, blendedVector(0, 1, 0.9));
    };

    it("lists name matches first, then the near ones within the gap", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        await seedBar(db);
        const input: RecipeSearchInput = { term: "negroni", hybrid: true };
        const hits = await newActor(input, db, viewer).all(
          userCtx(viewer),
          input,
        );
        // Negroni by name (its vector is far); Boulevardier and Americano by
        // meaning; Mojito is 0.097 past the nearest, the cake past 0.45.
        expect(hits.map((h) => h.name)).toEqual([
          "Negroni",
          "Boulevardier",
          "Americano",
        ]);
        expect(hits[0]?.distance).toBeNull();
      });
    });

    it("answers with the names alone when the term cannot be embedded (D25)", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        await seedBar(db);
        const input: RecipeSearchInput = { term: "negroni", hybrid: true };
        const unconfigured: EmbedQuery = async () => {
          throw new ConflictError("no embedding provider", "AI_UNCONFIGURED");
        };
        const hits = await newActor(input, db, viewer, unconfigured).all(
          userCtx(viewer),
          input,
        );
        expect(hits.map((h) => h.name)).toEqual(["Negroni"]);
      });
    });

    it("joins the key only when set", () => {
      expect(
        recipeSearchActorId({ term: "negroni", hybrid: false }, null),
      ).toBe(recipeSearchActorId({ term: "negroni" }, null));
      expect(
        recipeSearchActorId({ term: "negroni", hybrid: true }, null),
      ).not.toBe(recipeSearchActorId({ term: "negroni" }, null));
    });

    it("merges without repeating a recipe both halves found", () => {
      const hit = (recipeId: string, distance: number | null) => ({
        recipeId,
        name: recipeId,
        description: null,
        type: "cocktail",
        recipeGroupId: null,
        distance,
      });
      expect(
        mergeHybridRecipes(
          [hit("negroni", null)],
          [hit("negroni", 0.1), hit("americano", 0.12), hit("mojito", 0.2)],
          10,
        ).map((h) => h.recipeId),
      ).toEqual(["negroni", "americano"]);
      expect(
        mergeHybridRecipes(
          [hit("a", null), hit("b", null)],
          [hit("c", 0.1)],
          2,
        ),
      ).toHaveLength(2);
    });
  });

  describe("semantic half (today's `SemanticRecipeSearchQuery`)", () => {
    it("ranks by cosine distance and cuts at maxDistance", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const exact = await seedRecipe(db, { name: "Exact" });
        const near = await seedRecipe(db, { name: "Near" });
        const far = await seedRecipe(db, { name: "Far" });
        await seedRecipeVector(db, exact, unitVector(0));
        await seedRecipeVector(db, near, blendedVector(0, 1, 1 / 3));
        await seedRecipeVector(db, far, unitVector(1));

        const input: RecipeSearchInput = { semanticQuery: "bitter and red" };
        const hits = await newActor(input, db, viewer).all(
          userCtx(viewer),
          input,
        );
        // maxDistance defaults to 0.8, so `Far` (distance 1) is cut.
        expect(hits.map((h) => h.name)).toEqual(["Exact", "Near"]);
        expect(hits[0]?.distance).toBeCloseTo(0, 3);
        expect(hits[1]?.distance).toBeCloseTo(1 - Math.cos(Math.PI / 6), 3);
        // Strictly increasing, not merely "both present".
        expect(hits[0]?.distance ?? 0).toBeLessThan(
          hits[1]?.distance ?? Number.POSITIVE_INFINITY,
        );
      });
    });

    it("combines the two halves: `_ilike` narrows, the vector ranks", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const a = await seedRecipe(db, { name: "Negroni Classic" });
        const b = await seedRecipe(db, { name: "Negroni Bianco" });
        const other = await seedRecipe(db, { name: "Margarita" });
        await seedRecipeVector(db, a, blendedVector(0, 1, 1 / 3));
        await seedRecipeVector(db, b, unitVector(0));
        await seedRecipeVector(db, other, unitVector(0));

        const input: RecipeSearchInput = {
          term: "negroni",
          semanticQuery: "bitter",
        };
        const hits = await newActor(input, db, viewer).all(
          userCtx(viewer),
          input,
        );
        expect(hits.map((h) => h.name)).toEqual([
          "Negroni Bianco",
          "Negroni Classic",
        ]);
      });
    });
  });

  describe("served by recipe_vectors' HNSW index (../lib/hnsw.ts)", () => {
    const INDEX = "idx_recipe_vectors_hnsw_cosine";

    it("uses the cosine HNSW index and returns the exact answer through it", async () => {
      await withTestDb(async (db) => {
        const { rows } = await db.execute<{ n: number }>(
          sql`select count(*)::int as n from pg_indexes
              where schemaname = 'public' and indexname = ${INDEX}
                and indexdef like '%halfvec_cosine_ops%'`,
        );
        expect(rows[0]?.n).toBe(1);

        const viewer = await seedUser(db);
        const exact = await seedRecipe(db, { name: "Exact", type: "food" });
        const near = await seedRecipe(db, { name: "Near", type: "food" });
        const far = await seedRecipe(db, { name: "Far", type: "food" });
        await seedRecipeVector(db, exact, unitVector(0));
        await seedRecipeVector(db, near, blendedVector(0, 1, 1 / 3));
        await seedRecipeVector(db, far, unitVector(1));
        // Food crowds the neighbourhood; the one cocktail is farther than all
        // of it, so only a filter inside the iterative scan finds it.
        for (const [index, name] of ["F1", "F2", "F3"].entries()) {
          const food = await seedRecipe(db, { name, type: "food" });
          await seedRecipeVector(db, food, blendedVector(0, 1, index / 20));
        }
        const cocktail = await seedRecipe(db, {
          name: "Lone Cocktail",
          type: "cocktail",
        });
        await seedRecipeVector(db, cocktail, blendedVector(0, 1, 1 / 2));
        await steerToIndexScans(db);

        const before = await hnswScans(db, INDEX);
        const input: RecipeSearchInput = { semanticQuery: "bitter" };
        const hits = await newActor(input, db, viewer).all(
          userCtx(viewer),
          input,
        );
        // `Far` (distance 1) is past the 0.8 cutoff, applied after the scan.
        expect(hits.map((h) => h.name)).toEqual([
          "Exact",
          "F1",
          "F2",
          "F3",
          "Near",
          "Lone Cocktail",
        ]);
        // The old `min(distance) … GROUP BY … HAVING` shape cannot be served
        // by this index under any setting, so this stays at `before` for it.
        expect(await hnswScans(db, INDEX)).toBeGreaterThan(before);

        const cocktails: RecipeSearchInput = {
          semanticQuery: "bitter",
          type: "cocktail",
        };
        expect(
          (
            await newActor(cocktails, db, viewer).all(
              userCtx(viewer),
              cocktails,
            )
          ).map((h) => h.name),
        ).toEqual(["Lone Cocktail"]);
      });
    });
  });

  it("pages one result set without re-querying or re-embedding (§1.5)", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      for (const [index, name] of ["A", "B", "C", "D"].entries()) {
        const id = await seedRecipe(db, { name });
        await seedRecipeVector(db, id, blendedVector(0, 1, index / 20));
      }
      const input: RecipeSearchInput = { semanticQuery: "anything" };
      const embed = vi.fn<EmbedQuery>(async () => unitVector(0));
      const actor = newActor(input, db, viewer, embed);
      const ctx = userCtx(viewer);

      const first = await actor.results(ctx, input, { first: 2, after: null });
      const second = await actor.results(ctx, input, {
        first: 2,
        after: first.entries.at(-1)?.cursor ?? null,
      });
      expect(first.entries.map((e) => e.node.name)).toEqual(["A", "B"]);
      expect(second.entries.map((e) => e.node.name)).toEqual(["C", "D"]);
      expect(actor.searchRuns).toBe(1);
      expect(embed).toHaveBeenCalledTimes(1);
    });
  });

  it("shows the same catalog to owner, friend and stranger; refuses anonymous", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const friend = await seedUser(db);
      const stranger = await seedUser(db);
      await seedFriendship(db, owner, friend);
      await seedRecipe(db, { name: "Shared Recipe", createdById: owner });

      const input: RecipeSearchInput = { term: "shared" };
      const seen = [];
      for (const viewer of [owner, friend, stranger]) {
        seen.push(
          await newActor(input, db, viewer).all(userCtx(viewer), input),
        );
      }
      expect(seen[0]).toEqual(seen[1]);
      expect(seen[1]).toEqual(seen[2]);
      expect(seen[0]?.[0]?.name).toBe("Shared Recipe");

      await expect(
        newActor(input, db, null).all(userCtx(null), input),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
