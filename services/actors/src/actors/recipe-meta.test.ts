/**
 * X14's data step against real Postgres: `recipe_ingredients.role` / `kind` /
 * `quantity_text` / `brand_mentioned` through `RecipeActor.setIngredients`,
 * the read-time inference for rows that predate them, and the backfill —
 * `MaintenanceActor.backfillRecipeMeta` enqueueing, `RecipeActor.
 * backfillIngredientMeta` and `RecipeGroupActor.backfillBaseSpirit`
 * delivering.
 */
import { randomUUID } from "node:crypto";
import {
  ForbiddenError,
  pageArgs,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { MaintenanceActor } from "./maintenance-actor.ts";
import { RecipeActor } from "./recipe-actor.ts";
import { RecipeGroupActor } from "./recipe-group-actor.ts";

const { skip } = await resolveTestDatabase();

const SYSTEM = systemCtx("x14-backfill-test");
const page = pageArgs({ first: 50 });

const recipeActor = (id: string, db: DbOrTx) =>
  activate(
    new RecipeActor(
      new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
      new ActorId(id),
      db,
      async () => {
        throw new Error("no ItemActor in this test");
      },
      async () => {
        throw new Error("no EmbeddingActor in this test");
      },
    ),
  );

const seedGroup = async (db: DbOrTx, createdById: string): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.recipe_groups (id, name, category, created_by_id)
    values (${id}::uuid, ${`Group ${id}`}, 'cocktail', ${createdById}::uuid)
  `);
  return id;
};

const seedRecipe = async (
  db: DbOrTx,
  createdById: string,
  groupId: string | null = null,
): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.recipes (id, name, type, created_by_id, recipe_group_id)
    values (${id}::uuid, 'Negroni', 'cocktail', ${createdById}::uuid,
            ${groupId}::uuid)
  `);
  return id;
};

const seedGeneric = async (db: DbOrTx, name: string): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.generic_items (id, name, category, item_type)
    values (${id}::uuid, ${name}, ${`x14-${id}`}, 'ingredient')
  `);
  return id;
};

/** A pre-X14 row: no role, no kind, no printed text. */
const seedLegacyLine = async (
  db: DbOrTx,
  recipeId: string,
  name: string,
  quantity: number | null,
): Promise<string> => {
  const genericId = await seedGeneric(db, name);
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into public.recipe_ingredients (recipe_id, generic_item_id, quantity, unit)
    values (${recipeId}::uuid, ${genericId}::uuid, ${quantity}, 'oz')
    returning id
  `);
  return rows[0]?.id ?? "";
};

const storedMeta = async (db: DbOrTx, recipeId: string) => {
  const { rows } = await db.execute<{
    kind: string | null;
    role: string | null;
    name: string;
  }>(sql`
    select ri.kind, ri.role, gi.name from public.recipe_ingredients ri
    join public.generic_items gi on gi.id = ri.generic_item_id
    where ri.recipe_id = ${recipeId}::uuid order by gi.name
  `);
  return rows;
};

afterAll(closeTestDb);

describe.skipIf(skip)("RecipeActor — X14 ingredient fields", () => {
  it("stores role, kind, the printed amount and the brand, and reads them back", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const recipeId = await seedRecipe(db, owner);
      const campari = await seedGeneric(db, "Campari");
      const actor = await recipeActor(recipeId, db);
      const written = await actor.setIngredients(userCtx(owner, "r"), {
        ingredients: [
          {
            ref: { type: "GENERIC", id: campari },
            quantity: 0.75,
            unit: "oz",
            role: "modifier",
            kind: "red_bitter",
            quantityText: "  3/4 oz ",
            brandMentioned: "Campari",
          },
        ],
      });
      expect(written[0]).toMatchObject({
        role: "modifier",
        kind: "red_bitter",
        quantityText: "3/4 oz",
        brandMentioned: "Campari",
      });
    });
  });

  it("refuses a kind outside the vocabulary and a role outside the check", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const recipeId = await seedRecipe(db, owner);
      const gin = await seedGeneric(db, "Gin");
      const actor = await recipeActor(recipeId, db);
      for (const bad of [
        { kind: "gin_ish" as "gin" },
        { role: "hero" as "base" },
        { quantityText: "x".repeat(81) },
      ]) {
        await expect(
          actor.setIngredients(userCtx(owner, "r"), {
            ingredients: [{ ref: { type: "GENERIC", id: gin }, ...bad }],
          }),
        ).rejects.toBeInstanceOf(ValidationError);
      }
    });
  });

  it("infers kind and role on read for rows written before the columns", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const recipeId = await seedRecipe(db, owner);
      await seedLegacyLine(db, recipeId, "Gin", 1);
      await seedLegacyLine(db, recipeId, "Campari", 1);
      await seedLegacyLine(db, recipeId, "Orange peel", null);
      await seedLegacyLine(db, recipeId, "Crème de violette", 0.25);
      const actor = await recipeActor(recipeId, db);
      const read = await actor.ingredients(userCtx(owner, "r"), page);
      const byKind = read.entries.map((entry) => [
        entry.node.kind,
        entry.node.role,
      ]);
      expect(byKind).toContainEqual(["gin", "base"]);
      expect(byKind).toContainEqual(["red_bitter", "modifier"]);
      expect(byKind).toContainEqual(["orange", "garnish"]);
      expect(byKind).toContainEqual([null, null]);
      // Nothing was written by reading.
      expect(
        (await storedMeta(db, recipeId)).every((row) => row.kind === null),
      ).toBe(true);
    });
  });
});

describe.skipIf(skip)("the X14 backfill", () => {
  it("persists inferred kind/role into null cells only, and is idempotent", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const recipeId = await seedRecipe(db, owner);
      await seedLegacyLine(db, recipeId, "Gin", 1);
      const campari = await seedLegacyLine(db, recipeId, "Campari", 1);
      await seedLegacyLine(db, recipeId, "Crème de violette", 0.25);
      // An author's stored role stands.
      await db.execute(sql`
        update public.recipe_ingredients set role = 'other'
        where id = ${campari}::uuid
      `);
      const actor = await recipeActor(recipeId, db);

      await expect(
        actor.backfillIngredientMeta(userCtx(owner, "r")),
      ).rejects.toBeInstanceOf(ForbiddenError);

      const first = await actor.backfillIngredientMeta(SYSTEM);
      expect(first).toEqual({ recipeId, updated: 2, unplaced: 1 });
      expect(await storedMeta(db, recipeId)).toEqual([
        { kind: "red_bitter", role: "other", name: "Campari" },
        { kind: null, role: null, name: "Crème de violette" },
        { kind: "gin", role: "base", name: "Gin" },
      ]);
      const again = await actor.backfillIngredientMeta(SYSTEM);
      expect(again.updated).toBe(0);
    });
  });

  it("writes a group's base spirit from its member, only while it is null", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const groupId = await seedGroup(db, owner);
      const recipeId = await seedRecipe(db, owner, groupId);
      await seedLegacyLine(db, recipeId, "Campari", 1);
      await seedLegacyLine(db, recipeId, "London dry gin", 1.5);
      const group = await activate(createActor(RecipeGroupActor, groupId, db));

      await expect(
        group.backfillBaseSpirit(userCtx(owner, "r")),
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(await group.backfillBaseSpirit(SYSTEM)).toEqual({
        groupId,
        baseSpirit: "gin",
        written: true,
      });
      expect(await group.backfillBaseSpirit(SYSTEM)).toEqual({
        groupId,
        baseSpirit: "gin",
        written: false,
      });
    });
  });

  it("MaintenanceActor enqueues one delivery per recipe and group that needs one", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const groupId = await seedGroup(db, owner);
      const legacy = await seedRecipe(db, owner, groupId);
      await seedLegacyLine(db, legacy, "Gin", 1);
      const done = await seedRecipe(db, owner);
      const doneLine = await seedLegacyLine(db, done, "Gin", 1);
      await db.execute(sql`
        update public.recipe_ingredients set kind = 'gin', role = 'base'
        where id = ${doneLine}::uuid
      `);

      const maintenance = await activate(
        createActor(MaintenanceActor, "singleton", db),
      );
      await expect(
        maintenance.backfillRecipeMeta(userCtx(owner, "r")),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        maintenance.backfillRecipeMeta(SYSTEM, { limit: 0 }),
      ).rejects.toBeInstanceOf(ValidationError);

      const scheduled = await maintenance.backfillRecipeMeta(SYSTEM, {
        limit: 5_000,
      });
      expect(scheduled.recipes).toBeGreaterThanOrEqual(1);
      expect(scheduled.groups).toBeGreaterThanOrEqual(1);

      const { rows } = await db.execute<{
        target_actor: string;
        target_id: string;
        method: string;
      }>(sql`
        select target_actor, target_id, method from public.outbox
        where target_id in (${legacy}, ${done}, ${groupId})
      `);
      expect(
        rows.map((row) => [row.target_actor, row.method, row.target_id]),
      ).toEqual(
        expect.arrayContaining([
          ["RecipeActor", "backfillIngredientMeta", legacy],
          ["RecipeGroupActor", "backfillBaseSpirit", groupId],
        ]),
      );
      expect(rows.some((row) => row.target_id === done)).toBe(false);
    });
  });

  /**
   * An ingredient nothing can place keeps a null kind for ever, so a scan of
   * "still null" from the start would hand back the same first batch on
   * every run. The keyset walks past it, and food is never selected.
   */
  it("walks recipes by cursor past ones nothing can place, cocktails only", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      // Ids at the top of the keyspace, so the walk below sees only these.
      const floor = "fffffff0-0000-4000-8000-000000000000";
      const high = () => `fffffff0-${randomUUID().slice(9)}`;
      const seed = async (type: "cocktail" | "food"): Promise<string> => {
        const id = high();
        await db.execute(sql`
          insert into public.recipes (id, name, type, created_by_id)
          values (${id}::uuid, 'Unplaceable', ${type}, ${owner}::uuid)
        `);
        await seedLegacyLine(db, id, "Falernum", 1);
        return id;
      };
      const cocktails = [await seed("cocktail"), await seed("cocktail")].sort();
      const food = await seed("food");

      const maintenance = await activate(
        createActor(MaintenanceActor, "singleton", db),
      );
      const cursors: (string | null)[] = [];
      let after: string | null = floor;
      for (let turn = 0; turn < 5 && after !== null; turn += 1) {
        const scheduled = await maintenance.backfillRecipeMeta(SYSTEM, {
          limit: 1,
          afterRecipe: after,
          afterGroup: floor,
        });
        after = scheduled.nextAfterRecipe;
        cursors.push(after);
      }
      // One recipe a turn, then a short page ends the walk — not the same
      // unplaceable recipe again and again.
      expect(cursors).toEqual([cocktails[0], cocktails[1], null]);

      const { rows } = await db.execute<{ target_id: string }>(sql`
        select target_id from public.outbox
        where method = 'backfillIngredientMeta'
          and target_id in (${cocktails[0]}, ${cocktails[1]}, ${food})
      `);
      expect(rows.map((row) => row.target_id).sort()).toEqual(cocktails);

      await expect(
        maintenance.backfillRecipeMeta(SYSTEM, { afterRecipe: "nope" }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});
