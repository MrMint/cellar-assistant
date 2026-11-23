/**
 * `packages/db/migrations/*_ux_c_seams` (ux-c M1), run for real: every CHECK
 * the migration adds or widens rejects what it should and admits what it
 * should. Each rejection runs in its own savepoint so the next one sees a
 * live transaction, and asserts the constraint by name: a row refused for
 * some other reason (a missing NOT NULL, a foreign key) would otherwise pass.
 */
import { randomUUID } from "node:crypto";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "./db.ts";
import {
  seedCellar,
  seedCellarItem,
  seedItemOfType,
  seedRecipe,
} from "./search-testing.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "./testing.ts";

const { skip } = await resolveTestDatabase();

/** The pg error text of `error` and its causes, joined. */
const errorText = (error: unknown): string => {
  const parts: string[] = [];
  let current: unknown = error;
  while (current !== undefined && current !== null && parts.length < 5) {
    parts.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join(" | ");
};

/** Runs `statement` in a savepoint; resolves to the error text, or null. */
const attempt = async (db: DbOrTx, statement: SQL): Promise<string | null> => {
  try {
    await db.transaction(async (sp) => {
      await sp.execute(statement);
    });
    return null;
  } catch (error) {
    return errorText(error);
  }
};

const expectRejected = async (
  db: DbOrTx,
  statement: SQL,
  constraint: string,
): Promise<void> => {
  const error = await attempt(db, statement);
  expect(error, `expected ${constraint} to reject`).not.toBeNull();
  expect(error).toContain(`"${constraint}"`);
};

const expectAccepted = async (db: DbOrTx, statement: SQL): Promise<void> => {
  expect(await attempt(db, statement)).toBeNull();
};

describe.skipIf(skip)("ux_c_seams migration", () => {
  afterAll(closeTestDb);

  it("check_ins_one_item: exactly one of the six item columns or recipe_id", async () => {
    await withTestDb(async (db) => {
      const userId = await seedUser(db);
      const tea = await seedItemOfType(db, "TEA", userId);
      const recipeId = await seedRecipe(db, {
        name: "Seams sour",
        createdById: userId,
      });
      const checkIn = (teaId: string | null, recipe: string | null) => sql`
        insert into public.check_ins
          (user_id, created_by_id, group_id, tea_id, recipe_id)
        values (${userId}::uuid, ${userId}::uuid, ${randomUUID()}::uuid,
                ${teaId}::uuid, ${recipe}::uuid)
      `;

      await expectRejected(db, checkIn(null, null), "check_ins_one_item");
      await expectRejected(db, checkIn(tea.id, recipeId), "check_ins_one_item");
      await expectAccepted(db, checkIn(null, recipeId));
      await expectAccepted(db, checkIn(tea.id, null));
    });
  });

  it("item_brew_prefs: one target, one row per person and item, positive settings", async () => {
    await withTestDb(async (db) => {
      const userId = await seedUser(db);
      const tea = await seedItemOfType(db, "TEA", userId);
      const coffee = await seedItemOfType(db, "COFFEE", userId);
      const pref = (
        teaId: string | null,
        coffeeId: string | null,
        values: {
          temp?: number | null;
          steep?: number | null;
          dose?: number | null;
          water?: number | null;
        } = {},
      ) => sql`
        insert into public.item_brew_prefs
          (user_id, tea_id, coffee_id, water_temp_c, steep_seconds,
           dose_grams, water_ml)
        values (${userId}::uuid, ${teaId}::uuid, ${coffeeId}::uuid,
                ${values.temp ?? null}::smallint, ${values.steep ?? null}::integer,
                ${values.dose ?? null}::real, ${values.water ?? null}::real)
      `;

      await expectRejected(
        db,
        pref(tea.id, coffee.id),
        "item_brew_prefs_one_target",
      );
      await expectRejected(db, pref(null, null), "item_brew_prefs_one_target");
      await expectRejected(
        db,
        pref(tea.id, null, { temp: 0 }),
        "item_brew_prefs_water_temp_c_range",
      );
      await expectRejected(
        db,
        pref(tea.id, null, { temp: 101 }),
        "item_brew_prefs_water_temp_c_range",
      );
      await expectRejected(
        db,
        pref(tea.id, null, { steep: 0 }),
        "item_brew_prefs_steep_seconds_positive",
      );
      await expectRejected(
        db,
        pref(tea.id, null, { dose: 0 }),
        "item_brew_prefs_dose_grams_positive",
      );
      await expectRejected(
        db,
        pref(tea.id, null, { water: -1 }),
        "item_brew_prefs_water_ml_positive",
      );

      await expectAccepted(
        db,
        pref(tea.id, null, { temp: 85, steep: 180, dose: 3, water: 250 }),
      );
      await expectAccepted(db, pref(null, coffee.id));
      await expectRejected(
        db,
        pref(tea.id, null),
        "item_brew_prefs_user_id_tea_id_key",
      );

      // updated_at is stamped by the shared trigger, not by the writer.
      await db.execute(sql`
        update public.item_brew_prefs set updated_at = '2000-01-01'
        where tea_id = ${tea.id}::uuid
      `);
      const { rows } = await db.execute<{ fresh: boolean }>(sql`
        select updated_at > '2001-01-01' as fresh from public.item_brew_prefs
        where tea_id = ${tea.id}::uuid
      `);
      expect(rows[0]?.fresh).toBe(true);
    });
  });

  it("cellar_items: drink window order, price with currency, location length", async () => {
    await withTestDb(async (db) => {
      const userId = await seedUser(db);
      const wine = await seedItemOfType(db, "WINE", userId);
      const cellarId = await seedCellar(db, { createdById: userId });
      const itemId = await seedCellarItem(db, cellarId, userId, wine);
      const set = (fragment: SQL) => sql`
        update public.cellar_items set ${fragment} where id = ${itemId}::uuid
      `;

      await expectRejected(
        db,
        set(sql`drink_from = '2030-01-01', drink_until = '2029-12-31'`),
        "cellar_items_drink_window",
      );
      await expectAccepted(
        db,
        set(sql`drink_from = '2030-01-01', drink_until = '2030-01-01'`),
      );
      await expectAccepted(
        db,
        set(sql`drink_from = '2035-01-01', drink_until = null`),
      );

      await expectRejected(
        db,
        set(sql`price_amount = 42.5, price_currency = null`),
        "cellar_items_price_currency_with_amount",
      );
      await expectRejected(
        db,
        set(sql`price_amount = null, price_currency = 'USD'`),
        "cellar_items_price_currency_with_amount",
      );
      await expectRejected(
        db,
        set(sql`price_amount = -1, price_currency = 'USD'`),
        "cellar_items_price_amount_nonnegative",
      );
      await expectAccepted(
        db,
        set(sql`price_amount = 42.5, price_currency = 'USD'`),
      );

      await expectRejected(
        db,
        set(sql`location = ${"x".repeat(81)}`),
        "cellar_items_location_length",
      );
      await expectAccepted(db, set(sql`location = ${"x".repeat(80)}`));
    });
  });
});
