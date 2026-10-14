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
  it("sets a Love idempotently, answers states in a batch, and lists newest first", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const first = await seedRecipe(db, { name: "Negroni" });
      const second = await seedRecipe(db, { name: "Daiquiri" });
      const actor = await actorOf(me, db);
      const ctx = userCtx(me);

      expect(await actor.setRecipeLove(ctx, first, true)).toEqual({
        recipeId: first,
        loved: true,
        changed: true,
      });
      // The retry of a request whose answer was lost: still loved. This was
      // `toggleRecipeLove`, and the retry took the Love back.
      expect(await actor.setRecipeLove(ctx, first, true)).toEqual({
        recipeId: first,
        loved: true,
        changed: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await actor.setRecipeLove(ctx, second, true);
      expect(
        await actor.recipeLoveStates(ctx, [first, second, randomUUID()]),
      ).toEqual([first, second]);
      // An uppercase id is the same recipe.
      expect(
        await actor.recipeLoveStates(ctx, [first.toUpperCase()]),
      ).toHaveLength(1);
      const loved = await actor.lovedRecipes(ctx, pageArgs({ first: 10 }));
      expect(loved.entries.map((entry) => entry.node)).toEqual([second, first]);

      expect(await actor.setRecipeLove(ctx, first, false)).toEqual({
        recipeId: first,
        loved: false,
        changed: true,
      });
      expect(await actor.setRecipeLove(ctx, first, false)).toEqual({
        recipeId: first,
        loved: false,
        changed: false,
      });
      expect(await actor.recipeLoveStates(ctx, [first])).toEqual([]);
    });
  });

  it("leaves a since-deleted recipe out of the list rather than a dead id", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const kept = await seedRecipe(db, { name: "Martinez" });
      const gone = await seedRecipe(db, { name: "Bijou" });
      const actor = await actorOf(me, db);
      const ctx = userCtx(me);
      await actor.setRecipeLove(ctx, kept, true);
      await actor.setRecipeLove(ctx, gone, true);
      // Deleted by its author: the Love goes with it by cascade, behind this
      // actor's cached aggregate.
      await db.execute(
        sql`delete from public.recipes where id = ${gone}::uuid`,
      );
      const loved = await actor.lovedRecipes(ctx, pageArgs({ first: 10 }));
      expect(loved.entries.map((entry) => entry.node)).toEqual([kept]);
    });
  });

  it("refuses a recipe that does not exist, and another user's actor", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const other = await seedUser(db);
      const recipe = await seedRecipe(db, { name: "Sazerac" });
      const actor = await actorOf(me, db);
      await expect(
        actor.setRecipeLove(userCtx(me), randomUUID(), true),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        actor.setRecipeLove(userCtx(other), recipe, true),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.setRecipeLove(userCtx(me), recipe, "on" as never),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.recipeLoveStates(userCtx(other), [recipe]),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});

describe.skipIf(skip)("UserActor — recipe privacy (X15 / D22)", () => {
  it("Love and Want to try on a recipe you may not see are 'not found', exactly like a missing one", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const author = await seedUser(db);
      const secret = await seedRecipe(db, {
        name: "Secret Sour",
        createdById: author,
        privacy: "PRIVATE",
      });
      const draft = await seedRecipe(db, {
        name: "Read off a photo",
        createdById: author,
        privacy: "PUBLIC",
        isDraft: true,
      });
      const actor = await actorOf(me, db);
      const ctx = userCtx(me);
      for (const id of [secret, draft, randomUUID()]) {
        await expect(actor.setRecipeLove(ctx, id, true)).rejects.toBeInstanceOf(
          NotFoundError,
        );
        await expect(
          actor.setWantToTry(ctx, { kind: "RECIPE", recipeId: id }, true),
        ).rejects.toBeInstanceOf(NotFoundError);
      }
      // The author may Love their own private draft.
      const authors = await actorOf(author, db);
      expect(
        (await authors.setRecipeLove(userCtx(author), draft, true)).loved,
      ).toBe(true);
    });
  });

  it("a recipe made private since it was loved or saved drops out of both lists", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const author = await seedUser(db);
      const kept = await seedRecipe(db, {
        name: "Martinez",
        createdById: author,
      });
      const hidden = await seedRecipe(db, {
        name: "Bijou",
        createdById: author,
      });
      const actor = await actorOf(me, db);
      const ctx = userCtx(me);
      await actor.setRecipeLove(ctx, kept, true);
      await actor.setRecipeLove(ctx, hidden, true);
      await actor.setWantToTry(ctx, { kind: "RECIPE", recipeId: kept }, true);
      await actor.setWantToTry(ctx, { kind: "RECIPE", recipeId: hidden }, true);

      await db.execute(sql`
        update public.recipes set privacy = 'PRIVATE' where id = ${hidden}::uuid
      `);
      const loved = await actor.lovedRecipes(ctx, pageArgs({ first: 10 }));
      expect(loved.entries.map((entry) => entry.node)).toEqual([kept]);
      const saved = await actor.wantToTry(ctx, pageArgs({ first: 10 }));
      expect(saved.entries.map((entry) => entry.node.target)).toEqual([
        { kind: "RECIPE", recipeId: kept },
      ]);
    });
  });

  it("myRecipes lists your own recipes, drafts apart, and nobody else's", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const other = await seedUser(db);
      const mine = await seedRecipe(db, {
        name: "Mine",
        createdById: me,
        privacy: "PRIVATE",
      });
      const myDraft = await seedRecipe(db, {
        name: "My draft",
        createdById: me,
        privacy: "PRIVATE",
        isDraft: true,
      });
      await seedRecipe(db, { name: "Theirs", createdById: other });
      const actor = await actorOf(me, db);
      const ctx = userCtx(me);
      const ids = async (drafts?: boolean | null) =>
        (await actor.myRecipes(ctx, pageArgs({ first: 10 }), drafts)).entries
          .map((entry) => entry.node)
          .sort();
      expect(await ids()).toEqual([mine, myDraft].sort());
      expect(await ids(true)).toEqual([myDraft]);
      expect(await ids(false)).toEqual([mine]);
      await expect(
        actor.myRecipes(userCtx(other), pageArgs({ first: 10 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
