/**
 * `RecapActor` — L04 against real Postgres: the viewer-key gate (another user
 * and anonymous are refused), period and time-zone validation, the month
 * boundary read in the viewer's zone, item breadth from item logs only, recipe
 * logs toward "recipes made" only, and a private recipe's name kept out.
 */
import { randomUUID } from "node:crypto";
import type { Ctx, ItemRef, ItemType } from "@cellar-assistant/contracts";
import { ForbiddenError, ValidationError } from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  seedCheckIn,
  seedItemOfType,
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
import { RecapActor } from "./recap-actor.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string | null): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

const recapOf = (viewerId: string, db: DbOrTx) =>
  activate(createActor(RecapActor, viewerId, db));

const seedItem = async (
  db: DbOrTx,
  type: ItemType,
  userId: string,
  fields: { name: string; region?: string },
): Promise<ItemRef> => {
  const ref = await seedItemOfType(db, type, userId, fields.name);
  if (fields.region !== undefined && type === "WINE") {
    await db.execute(sql`
      update public.wines set region = ${fields.region} where id = ${ref.id}::uuid
    `);
  }
  return ref;
};

const seedRecipeLog = async (
  db: DbOrTx,
  userId: string,
  recipeId: string,
  createdAt: string,
): Promise<void> => {
  const id = randomUUID();
  await db.execute(sql`
    insert into public.check_ins
      (id, user_id, created_by_id, group_id, recipe_id, created_at, updated_at)
    values (${id}::uuid, ${userId}::uuid, ${userId}::uuid, ${id}::uuid,
            ${recipeId}::uuid, ${createdAt}::timestamptz, ${createdAt}::timestamptz)
  `);
};

describe.skipIf(skip)("RecapActor", () => {
  afterAll(closeTestDb);

  it("serves only the viewer it is keyed by", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const actor = await recapOf(owner, db);
      await expect(
        actor.recap(userCtx(other), { period: "2026-10" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.recap(userCtx(null), { period: "2026-10" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(actor.stamps(userCtx(other))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(actor.stamps(userCtx(null))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  it("refuses a malformed period or time zone", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const actor = await recapOf(owner, db);
      for (const period of ["", "2026-13", "26-10", "2026-1", "last month"]) {
        await expect(
          actor.recap(userCtx(owner), { period }),
        ).rejects.toBeInstanceOf(ValidationError);
      }
      await expect(
        actor.recap(userCtx(owner), {
          period: "2026-10",
          timeZone: "Not/AZone",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it("reads the month in the viewer's zone, from their own log only", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const items: ItemRef[] = [];
      for (const [i, type] of (["WINE", "BEER", "SPIRIT"] as const).entries()) {
        items.push(await seedItem(db, type, owner, { name: `Recap ${i}` }));
      }
      // 23:30 on 31 October in Los Angeles is 06:30 on 1 November in UTC.
      const lateOctoberLA = "2026-11-01T06:30:00Z";
      for (const ref of items) {
        await seedCheckIn(db, {
          userId: owner,
          item: ref,
          createdAt: lateOctoberLA,
        });
      }
      // Another user's logs are not the owner's recap.
      for (const ref of items) {
        await seedCheckIn(db, {
          userId: other,
          item: ref,
          createdAt: "2026-10-10T12:00:00Z",
        });
      }
      const actor = await recapOf(owner, db);
      const la = await actor.recap(userCtx(owner), {
        period: "2026-10",
        timeZone: "America/Los_Angeles",
      });
      expect(la.period).toBe("2026-10");
      expect(la.cards.map((card) => card.kind)).toEqual([
        "NEW_TO_YOU",
        "TYPES",
        "STAMP",
      ]);
      expect([...(la.cards[0]?.chips ?? [])].sort()).toEqual([
        "Recap 0",
        "Recap 1",
        "Recap 2",
      ]);

      const utc = await actor.recap(userCtx(owner), { period: "2026-10" });
      expect(utc.timeZone).toBe("UTC");
      expect(utc.cards).toEqual([]);
      const november = await actor.recap(userCtx(owner), { period: "2026-11" });
      expect(november.cards.map((card) => card.kind)).toContain("NEW_TO_YOU");

      const year = await actor.recap(userCtx(owner), { period: "2026" });
      expect(year.stamps).toEqual([{ kind: "TYPES", count: 3, tier: 3 }]);
    });
  });

  it("counts only recipe logs whose recipe the viewer may see (FR-8), toward recipes made", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const author = await seedUser(db);
      const mine = await seedRecipe(db, {
        name: "My Negroni",
        createdById: owner,
        privacy: "PRIVATE",
      });
      const shared = await seedRecipe(db, { name: "House Sour" });
      const another = await seedRecipe(db, { name: "Last Word" });
      // A log of a recipe the owner may not see — say a companion row
      // written before FR-8, or a recipe made private since — counts nowhere.
      const hidden = await seedRecipe(db, {
        name: "Secret Sling",
        createdById: author,
        privacy: "PRIVATE",
      });
      for (const recipeId of [mine, shared, another, hidden]) {
        await seedRecipeLog(db, owner, recipeId, "2026-10-05T12:00:00Z");
      }
      const actor = await recapOf(owner, db);
      const recap = await actor.recap(userCtx(owner), { period: "2026-10" });
      expect(recap.cards.map((card) => card.kind)).toEqual([
        "RECIPES",
        "STAMP",
      ]);
      const recipes = recap.cards[0];
      expect(recipes?.count).toBe(3);
      expect([...(recipes?.chips ?? [])].sort()).toEqual([
        "House Sour",
        "Last Word",
        "My Negroni",
      ]);
      expect(await actor.stamps(userCtx(owner))).toEqual([
        { kind: "RECIPES", count: 3, tier: 3 },
      ]);
    });
  });

  it("all-time stamps count distinct regions across the whole log", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const regions = ["Jura", "Etna", "Wachau", "Saint-Julien", "Rioja"];
      for (const [i, region] of regions.entries()) {
        const ref = await seedItem(db, "WINE", owner, {
          name: `Region ${i}`,
          region,
        });
        // Twice each: a second log of the same bottle is not a second region.
        for (const day of ["01", "02"]) {
          await seedCheckIn(db, {
            userId: owner,
            item: ref,
            createdAt: `202${i}-03-${day}T12:00:00Z`,
          });
        }
      }
      const stamps = await (await recapOf(owner, db)).stamps(userCtx(owner));
      expect(stamps).toContainEqual({ kind: "REGIONS", count: 5, tier: 5 });
    });
  });
});
