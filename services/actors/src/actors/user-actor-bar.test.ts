/**
 * `UserActor`'s X14 half: the Bar pantry toggles (D23) and recipe Love (D9).
 * Both are rows where `user_id` is the actor's own user, so both are cached on
 * the aggregate and every write reloads it.
 */
import { randomUUID } from "node:crypto";
import type { Ctx } from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  NotFoundError,
  pageArgs,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import { seedRecipe } from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { UserActor } from "./user-actor.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string | null): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

const actorOf = (userId: string, db: DbOrTx) =>
  activate(createActor(UserActor, userId, db));

const pantryRows = async (db: DbOrTx, userId: string): Promise<string[]> => {
  const { rows } = await db.execute<{ kind: string }>(sql`
    select kind from public.bar_pantry_items where user_id = ${userId}::uuid
    order by kind
  `);
  return rows.map((row) => row.kind);
};

afterAll(closeTestDb);

describe.skipIf(skip)("UserActor — Bar pantry (D23)", () => {
  it("turns toggles on and off, idempotently, in pantry order", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const actor = await actorOf(me, db);
      const ctx = userCtx(me);

      expect(await actor.barPantry(ctx)).toEqual([]);
      expect(
        await actor.setBarPantryItem(ctx, { kind: "simple_syrup", have: true }),
      ).toEqual({ kind: "simple_syrup", have: true });
      await actor.setBarPantryItem(ctx, { kind: "lime", have: true });
      // Again: a no-op, not a primary-key violation.
      await actor.setBarPantryItem(ctx, { kind: "lime", have: true });
      // Screen order (citrus before syrups), not insertion order.
      expect(await actor.barPantry(ctx)).toEqual(["lime", "simple_syrup"]);
      expect(await pantryRows(db, me)).toEqual(["lime", "simple_syrup"]);

      await actor.setBarPantryItem(ctx, { kind: "lime", have: false });
      await actor.setBarPantryItem(ctx, { kind: "lime", have: false });
      expect(await actor.barPantry(ctx)).toEqual(["simple_syrup"]);
    });
  });

  it("refuses kinds that are not toggles, and other users", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const other = await seedUser(db);
      const actor = await actorOf(me, db);
      await expect(
        actor.setBarPantryItem(userCtx(me), { kind: "bourbon", have: true }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.setBarPantryItem(userCtx(me), {
          kind: "made_up" as "lime",
          have: true,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.setBarPantryItem(userCtx(other), { kind: "lime", have: true }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(actor.barPantry(userCtx(other))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });
});

describe.skipIf(skip)("UserActor — recipe Love (D9)", () => {
  it("toggles a Love, answers states in a batch, and lists newest first", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const first = await seedRecipe(db, { name: "Negroni" });
      const second = await seedRecipe(db, { name: "Daiquiri" });
      const actor = await actorOf(me, db);
      const ctx = userCtx(me);

      expect(await actor.toggleRecipeLove(ctx, first)).toEqual({
        recipeId: first,
        loved: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await actor.toggleRecipeLove(ctx, second);
      expect(
        await actor.recipeLoveStates(ctx, [first, second, randomUUID()]),
      ).toEqual([first, second]);
      // An uppercase id is the same recipe.
      expect(
        await actor.recipeLoveStates(ctx, [first.toUpperCase()]),
      ).toHaveLength(1);
      const loved = await actor.lovedRecipes(ctx, pageArgs({ first: 10 }));
      expect(loved.entries.map((entry) => entry.node)).toEqual([second, first]);

      expect(await actor.toggleRecipeLove(ctx, first)).toEqual({
        recipeId: first,
        loved: false,
      });
      expect(await actor.recipeLoveStates(ctx, [first])).toEqual([]);
    });
  });

  it("refuses a recipe that does not exist, and another user's actor", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const other = await seedUser(db);
      const recipe = await seedRecipe(db, { name: "Sazerac" });
      const actor = await actorOf(me, db);
      await expect(
        actor.toggleRecipeLove(userCtx(me), randomUUID()),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        actor.toggleRecipeLove(userCtx(other), recipe),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.recipeLoveStates(userCtx(other), [recipe]),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
