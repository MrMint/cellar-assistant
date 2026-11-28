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
  seedCellar,
  seedCellarItem,
  seedCheckIn,
  seedItemOfType,
  seedItemReview,
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

  /**
   * Backdate the rows `where` picks in `table` to `at`, with the
   * `updated_at` trigger off for the statement so the stamp holds.
   */
  const stamp = async (
    db: DbOrTx,
    table: "item_reviews" | "cellar_items",
    where: ReturnType<typeof sql>,
    at: { created: string; updated?: string },
  ) => {
    await db.execute(sql`set local session_replication_role = replica`);
    await db.execute(sql`
      update public.${sql.identifier(table)}
      set created_at = ${at.created}::timestamptz,
          updated_at = ${at.updated ?? at.created}::timestamptz
      where ${where}
    `);
    await db.execute(sql`set local session_replication_role = origin`);
  };

  it("totals the viewer's check-ins, ratings and bottles added, never a co-owner's (L4)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const coOwner = await seedUser(db);
      const [wine, beer, sake] = await Promise.all([
        seedItem(db, "WINE", owner, { name: "Totals wine" }),
        seedItem(db, "BEER", owner, { name: "Totals beer" }),
        seedItem(db, "SAKE", owner, { name: "Totals sake" }),
      ]);
      // Two logs in October (one in LA's October only), one in September.
      await seedCheckIn(db, {
        userId: owner,
        item: wine,
        createdAt: "2026-10-03T12:00:00Z",
      });
      await seedCheckIn(db, {
        userId: owner,
        item: wine,
        createdAt: "2026-10-20T12:00:00Z",
      });
      await seedCheckIn(db, {
        userId: owner,
        item: beer,
        createdAt: "2026-09-20T12:00:00Z",
      });
      // Another person's log of the same item is not the owner's.
      await seedCheckIn(db, {
        userId: coOwner,
        item: wine,
        createdAt: "2026-10-04T12:00:00Z",
      });

      // Ratings: one made in October, one made in August and changed in
      // October (both count), one made and left in August (does not), and a
      // co-owner's October rating (does not).
      for (const [ref, score] of [
        [wine, 4],
        [beer, 3],
        [sake, 5],
      ] as const) {
        await seedItemReview(db, owner, ref, score);
      }
      await seedItemReview(db, coOwner, wine, 2);
      await stamp(
        db,
        "item_reviews",
        sql`user_id = ${owner}::uuid and wine_id = ${wine.id}::uuid`,
        { created: "2026-10-05T12:00:00Z" },
      );
      await stamp(
        db,
        "item_reviews",
        sql`user_id = ${owner}::uuid and beer_id = ${beer.id}::uuid`,
        { created: "2026-08-05T12:00:00Z", updated: "2026-10-06T12:00:00Z" },
      );
      await stamp(
        db,
        "item_reviews",
        sql`user_id = ${owner}::uuid and sake_id = ${sake.id}::uuid`,
        { created: "2026-08-07T12:00:00Z" },
      );
      await stamp(db, "item_reviews", sql`user_id = ${coOwner}::uuid`, {
        created: "2026-10-05T12:00:00Z",
      });

      // Bottles: the owner adds two to a cellar they co-own and one to their
      // own; the co-owner adds three to the shared cellar in the same month.
      const theirs = await seedCellar(db, {
        createdById: coOwner,
        coOwnerIds: [owner],
      });
      const own = await seedCellar(db, { createdById: owner });
      const mine = [
        await seedCellarItem(db, theirs, owner, wine),
        await seedCellarItem(db, theirs, owner, beer),
        await seedCellarItem(db, own, owner, sake),
      ];
      for (let i = 0; i < 3; i++)
        await seedCellarItem(db, theirs, coOwner, wine);
      await stamp(
        db,
        "cellar_items",
        sql`cellar_id in (${theirs}::uuid, ${own}::uuid)`,
        { created: "2026-10-10T12:00:00Z" },
      );
      await stamp(db, "cellar_items", sql`id = ${mine[2] ?? ""}::uuid`, {
        created: "2026-11-02T12:00:00Z",
      });

      const actor = await recapOf(owner, db);
      const october = await actor.recap(userCtx(owner), { period: "2026-10" });
      expect(october.totals).toEqual({
        checkIns: 2,
        ratings: 2,
        bottlesAdded: 2,
      });
      const august = await actor.recap(userCtx(owner), { period: "2026-08" });
      expect(august.totals).toEqual({
        checkIns: 0,
        ratings: 2,
        bottlesAdded: 0,
      });
      const year = await actor.recap(userCtx(owner), { period: "2026" });
      expect(year.totals).toEqual({ checkIns: 3, ratings: 3, bottlesAdded: 3 });
      // The co-owner's own recap counts their own additions and nothing of the owner's.
      const theirsRecap = await (await recapOf(coOwner, db)).recap(
        userCtx(coOwner),
        { period: "2026-10" },
      );
      expect(theirsRecap.totals).toEqual({
        checkIns: 1,
        ratings: 1,
        bottlesAdded: 3,
      });
    });
  });

  it("lists the periods with any activity, newest first, in the viewer's zone", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const wine = await seedItem(db, "WINE", owner, { name: "Periods wine" });
      const beer = await seedItem(db, "BEER", owner, { name: "Periods beer" });
      // 23:30 on 31 December 2025 in Los Angeles is 2026 in UTC.
      await seedCheckIn(db, {
        userId: owner,
        item: wine,
        createdAt: "2026-01-01T07:30:00Z",
      });
      await seedItemReview(db, owner, beer, 4);
      await stamp(db, "item_reviews", sql`user_id = ${owner}::uuid`, {
        created: "2026-03-05T12:00:00Z",
        updated: "2026-07-05T12:00:00Z",
      });
      const cellar = await seedCellar(db, { createdById: owner });
      await seedCellarItem(db, cellar, owner, wine);
      await stamp(db, "cellar_items", sql`cellar_id = ${cellar}::uuid`, {
        created: "2024-05-05T12:00:00Z",
      });
      // A recipe log the owner may no longer see does not open a period.
      const hidden = await seedRecipe(db, {
        name: "Hidden sling",
        createdById: other,
        privacy: "PRIVATE",
      });
      await seedRecipeLog(db, owner, hidden, "2023-02-02T12:00:00Z");
      // Another person's activity is not the owner's.
      await seedCheckIn(db, {
        userId: other,
        item: wine,
        createdAt: "2022-02-02T12:00:00Z",
      });
      const otherCellar = await seedCellar(db, {
        createdById: other,
        coOwnerIds: [owner],
      });
      await seedCellarItem(db, otherCellar, other, beer);
      await stamp(db, "cellar_items", sql`cellar_id = ${otherCellar}::uuid`, {
        created: "2021-05-05T12:00:00Z",
      });

      const actor = await recapOf(owner, db);
      expect(await actor.periods(userCtx(owner), { kind: "MONTH" })).toEqual([
        "2026-07",
        "2026-03",
        "2026-01",
        "2024-05",
      ]);
      expect(
        await actor.periods(userCtx(owner), {
          kind: "MONTH",
          timeZone: "America/Los_Angeles",
        }),
      ).toEqual(["2026-07", "2026-03", "2025-12", "2024-05"]);
      expect(await actor.periods(userCtx(owner), { kind: "YEAR" })).toEqual([
        "2026",
        "2024",
      ]);
      expect(
        await actor.periods(userCtx(owner), {
          kind: "YEAR",
          timeZone: "America/Los_Angeles",
        }),
      ).toEqual(["2026", "2025", "2024"]);
    });
  });

  it("refuses another viewer, a bad kind and a bad zone for periods", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const actor = await recapOf(owner, db);
      await expect(
        actor.periods(userCtx(other), { kind: "MONTH" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.periods(userCtx(null), { kind: "MONTH" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.periods(userCtx(owner), { kind: "WEEK" as "MONTH" }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.periods(userCtx(owner), { kind: "YEAR", timeZone: "Not/AZone" }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(await actor.periods(userCtx(owner), { kind: "YEAR" })).toEqual([]);
    });
  });
});
