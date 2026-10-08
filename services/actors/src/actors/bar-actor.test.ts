/**
 * `BarActor` — X14 against real Postgres: whose bottles count, how a bottle is
 * read, What can I make (G29), "Cocktails with this", and the viewer-key gate.
 *
 * Recipes are seeded **without** stored kinds or roles on purpose for most of
 * these: the screen has to be right before the backfill runs, so the scan's
 * own inference (`inferIngredientMeta` over the referenced names) is what is
 * under test. One recipe stores a kind that contradicts its name, to prove a
 * stored value wins.
 */
import { randomUUID } from "node:crypto";
import type { Ctx, ItemRef } from "@cellar-assistant/contracts";
import { ForbiddenError, ValidationError } from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  seedCellar,
  seedCellarItem,
  seedRecipe,
} from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { BarActor } from "./bar-actor.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string | null): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

const barOf = (viewerId: string, db: DbOrTx) =>
  activate(createActor(BarActor, viewerId, db));

const seedSpirit = async (
  db: DbOrTx,
  createdById: string,
  name: string,
  spiritType: string,
): Promise<ItemRef> => {
  const onboardingId = randomUUID();
  await db.execute(sql`
    insert into public.item_onboardings (id, user_id, item_type)
    values (${onboardingId}::uuid, ${createdById}::uuid, 'SPIRIT')
  `);
  await db.execute(sql`
    insert into public.spirit_type (value) values (${spiritType})
    on conflict do nothing
  `);
  const id = randomUUID();
  await db.execute(sql`
    insert into public.spirits (id, name, created_by_id, type, item_onboarding_id)
    values (${id}::uuid, ${name}, ${createdById}::uuid, ${spiritType},
            ${onboardingId}::uuid)
  `);
  return { type: "SPIRIT", id };
};

const seedGeneric = async (db: DbOrTx, name: string): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.generic_items (id, name, category, item_type)
    values (${id}::uuid, ${name}, ${`x14-${id}`}, 'ingredient')
  `);
  return id;
};

type Line = {
  readonly generic?: string;
  readonly item?: ItemRef;
  readonly quantity?: number;
  readonly unit?: string;
  readonly optional?: boolean;
  readonly kind?: string;
};

const seedCocktail = async (
  db: DbOrTx,
  name: string,
  lines: readonly Line[],
  groupId: string | null = null,
): Promise<string> => {
  const recipeId = await seedRecipe(db, { name, type: "cocktail" });
  if (groupId !== null) {
    await db.execute(sql`
      update public.recipes set recipe_group_id = ${groupId}::uuid
      where id = ${recipeId}::uuid
    `);
  }
  for (const line of lines) {
    const genericId =
      line.generic === undefined ? null : await seedGeneric(db, line.generic);
    await db.execute(sql`
      insert into public.recipe_ingredients
        (recipe_id, generic_item_id, spirit_id, quantity, unit, is_optional, kind)
      values (${recipeId}::uuid, ${genericId}::uuid,
              ${line.item?.id ?? null}::uuid, ${line.quantity ?? null},
              ${line.unit ?? null}, ${line.optional ?? false},
              ${line.kind ?? null})
    `);
  }
  return recipeId;
};

const seedGroup = async (db: DbOrTx, name: string): Promise<string> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.recipe_groups (id, name, category)
    values (${id}::uuid, ${name}, 'cocktail')
  `);
  return id;
};

const openBottle = async (db: DbOrTx, cellarItemId: string, left: number) => {
  await db.execute(sql`
    update public.cellar_items
    set open_at = now(), percentage_remaining = ${left}
    where id = ${cellarItemId}::uuid
  `);
};

afterAll(closeTestDb);

describe.skipIf(skip)("BarActor (X14)", () => {
  it("reads only the viewer's own and co-owned cellars, unfinished bottles only", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const friend = await seedUser(db);
      const mine = await seedCellar(db, { createdById: me });
      const coOwned = await seedCellar(db, {
        createdById: friend,
        coOwnerIds: [me],
      });
      const friends = await seedCellar(db, {
        createdById: friend,
        privacy: "PUBLIC",
      });
      const bourbon = await seedSpirit(db, me, "Buffalo Trace", "BOURBON");
      const rye = await seedSpirit(db, me, "Rittenhouse Rye", "WHISKEY");
      const gin = await seedSpirit(db, friend, "Tanqueray", "GIN");
      const vodka = await seedSpirit(db, me, "Tito's", "VODKA");

      const open = await seedCellarItem(db, mine, me, bourbon);
      await openBottle(db, open, 40);
      await seedCellarItem(db, coOwned, friend, rye);
      await seedCellarItem(db, friends, friend, gin);
      const finished = await seedCellarItem(db, mine, me, vodka);
      await db.execute(sql`
        update public.cellar_items set empty_at = now() where id = ${finished}::uuid
      `);
      await db.execute(sql`
        insert into public.bar_pantry_items (user_id, kind) values
          (${me}::uuid, 'lime'), (${me}::uuid, 'not_a_kind_any_more')
      `);

      const inventory = await (await barOf(me, db)).inventory(userCtx(me));
      expect(inventory.pantry).toEqual(["lime"]);
      expect(
        inventory.bottles.map((b) => [b.name, b.kind, b.opened]).sort(),
      ).toEqual([
        ["Buffalo Trace", "bourbon", true],
        ["Rittenhouse Rye", "rye", false],
      ]);
    });
  });

  it("refuses another viewer's bar, and an anonymous one", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const other = await seedUser(db);
      const bar = await barOf(me, db);
      await expect(bar.inventory(userCtx(other))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(bar.inventory(userCtx(null))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(
        bar.whatCanIMake(userCtx(me), { limit: 0 }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it("sorts cocktails into Make now and One bottle away, one per group", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const cellar = await seedCellar(db, { createdById: me });
      const bourbon = await seedSpirit(db, me, "Buffalo Trace", "BOURBON");
      await seedCellarItem(db, cellar, me, bourbon);
      await db.execute(sql`
        insert into public.bar_pantry_items (user_id, kind) values
          (${me}::uuid, 'aromatic_bitters'), (${me}::uuid, 'sweet_vermouth'),
          (${me}::uuid, 'lemon'), (${me}::uuid, 'simple_syrup')
      `);

      const manhattans = await seedGroup(db, "Manhattan");
      // Two versions: the rye one is a swap, the bourbon one is exact.
      const ryeManhattan = await seedCocktail(
        db,
        "Rye Manhattan",
        [
          { generic: "Rye whiskey", quantity: 2, unit: "oz" },
          { generic: "Sweet vermouth", quantity: 1, unit: "oz" },
          { generic: "Angostura bitters", quantity: 2, unit: "dashes" },
        ],
        manhattans,
      );
      const bourbonManhattan = await seedCocktail(
        db,
        "Bourbon Manhattan",
        [
          { item: bourbon, quantity: 2, unit: "oz" },
          { generic: "Sweet vermouth", quantity: 1, unit: "oz" },
          { generic: "Angostura bitters", quantity: 2, unit: "dashes" },
          { generic: "Cocktail cherry garnish" },
        ],
        manhattans,
      );
      const whiskeySour = await seedCocktail(db, "Whiskey Sour", [
        { generic: "Bourbon", quantity: 2, unit: "oz" },
        { generic: "Lemon juice", quantity: 0.75, unit: "oz" },
        { generic: "Simple syrup", quantity: 0.75, unit: "oz" },
        { generic: "Egg white", optional: true },
      ]);
      const boulevardier = await seedCocktail(db, "Boulevardier", [
        { generic: "Bourbon", quantity: 1.25, unit: "oz" },
        { generic: "Campari", quantity: 1, unit: "oz" },
        { generic: "Sweet vermouth", quantity: 1, unit: "oz" },
      ]);
      const negroni = await seedCocktail(db, "Negroni", [
        { generic: "Gin", quantity: 1, unit: "oz" },
        { generic: "Campari", quantity: 1, unit: "oz" },
        { generic: "Sweet vermouth", quantity: 1, unit: "oz" },
      ]);
      // A stored kind wins over the name: this "Bourbon" line is stored as
      // mezcal, so the drink is one bottle away, not makeable.
      const stored = await seedCocktail(db, "Stored kind", [
        { generic: "Bourbon", quantity: 2, unit: "oz", kind: "mezcal" },
        { generic: "Lemon juice", quantity: 1, unit: "oz" },
      ]);

      // Nothing required — only a garnish — is nothing to vouch for, so it
      // is in neither section rather than a vacuous "Make now".
      const garnishOnly = await seedCocktail(db, "Garnish only", [
        { generic: "Lemon twist" },
      ]);

      const answer = await (await barOf(me, db)).whatCanIMake(userCtx(me), {
        limit: 50,
      });
      const makeNow = answer.makeNow.map((m) => m.recipeId);
      const oneAway = answer.oneAway.map((m) => m.recipeId);

      expect(makeNow).toContain(whiskeySour);
      // One per group, and the closer version wins: exact beats a swap.
      expect(makeNow).toContain(bourbonManhattan);
      expect(makeNow).not.toContain(ryeManhattan);
      expect(oneAway).toContain(boulevardier);
      expect(oneAway).toContain(stored);
      expect(makeNow).not.toContain(negroni);
      expect(oneAway).not.toContain(negroni);
      expect(makeNow).not.toContain(garnishOnly);
      expect(oneAway).not.toContain(garnishOnly);

      const sour = answer.makeNow.find((m) => m.recipeId === whiskeySour);
      expect(sour?.makeability).toMatchObject({
        status: "MAKE_NOW",
        substituteCount: 0,
        requiredCount: 3,
      });
      const boul = answer.oneAway.find((m) => m.recipeId === boulevardier);
      expect(boul?.makeability.missing).toEqual(["Campari"]);
      expect(boul?.makeability.missingKinds).toEqual(["red_bitter"]);
      expect(answer.bottleCount).toBe(1);
      expect(answer.pantryCount).toBe(4);
      expect(answer.scanned).toBeGreaterThanOrEqual(6);
    });
  });

  it("lists cocktails with this bottle's kind, and says Use it up for an open one", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const cellar = await seedCellar(db, { createdById: me });
      const bourbon = await seedSpirit(db, me, "Elijah Craig", "BOURBON");
      const unopened = await seedSpirit(db, me, "Four Roses", "BOURBON");
      const bottle = await seedCellarItem(db, cellar, me, bourbon);
      await openBottle(db, bottle, 30);
      await seedCellarItem(db, cellar, me, unopened);

      const oldFashioned = await seedCocktail(db, "Old Fashioned", [
        { generic: "Bourbon", quantity: 2, unit: "oz" },
        { generic: "Sugar cube" },
        { generic: "Angostura bitters", quantity: 2, unit: "dashes" },
      ]);
      const anyWhiskey = await seedCocktail(db, "Whisky Highball", [
        { generic: "Whisky", quantity: 2, unit: "oz" },
        { generic: "Soda water", quantity: 4, unit: "oz" },
      ]);
      const gimlet = await seedCocktail(db, "Gimlet", [
        { generic: "Gin", quantity: 2, unit: "oz" },
        { generic: "Lime juice", quantity: 0.75, unit: "oz" },
      ]);

      const bar = await barOf(me, db);
      const forOpen = await bar.cocktailsFor(userCtx(me), bourbon);
      const ids = forOpen.recipes.map((r) => r.recipeId);
      expect(forOpen.kind).toBe("bourbon");
      expect(forOpen.useItUp).toBe(true);
      expect(ids).toContain(oldFashioned);
      expect(ids).toContain(anyWhiskey);
      expect(ids).not.toContain(gimlet);

      const forUnopened = await bar.cocktailsFor(userCtx(me), unopened);
      expect(forUnopened.useItUp).toBe(false);

      await expect(
        bar.cocktailsFor(userCtx(me), { type: "SPIRIT", id: randomUUID() }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
