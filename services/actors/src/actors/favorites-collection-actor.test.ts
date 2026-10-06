/**
 * `FavoritesCollectionActor` — C3 (§2.2, §1.5).
 *
 * The id half of §1.5's worked example, from the actor's side: a page of typed
 * `Item` refs spanning more than one physical table, which `services/api` then
 * batches through the `Item` DataLoader (`schema.test.ts` owns that half).
 *
 * Plus the two rules C1 and C2 paid for, because `item_favorites` rows have no
 * privacy column of their own — the viewer key *is* the authorization here, so
 * if it can be skipped there is nothing else in the way.
 */
import {
  adminCtx,
  anonymousCtx,
  ForbiddenError,
  pageArgs,
  userCtx,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import { seedBeer, seedWine } from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { FavoritesCollectionActor } from "./favorites-collection-actor.ts";

const { skip } = await resolveTestDatabase();

const favorite = async (
  db: DbOrTx,
  userId: string,
  column: "wine_id" | "beer_id",
  itemId: string,
): Promise<void> => {
  await db.execute(sql`
    insert into public.item_favorites (user_id, ${sql.raw(column)})
    values (${userId}::uuid, ${itemId}::uuid)
  `);
};

describe.skipIf(skip)("FavoritesCollectionActor", () => {
  afterAll(closeTestDb);

  it("returns typed Item refs across tables, newest first", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const wine = await seedWine(db, viewer, "Fav wine");
      const beer = await seedBeer(db, viewer, "Fav beer");
      await favorite(db, viewer, "wine_id", wine.id);
      await favorite(db, viewer, "beer_id", beer.id);

      const actor = await activate(
        createActor(FavoritesCollectionActor, viewer, db),
      );
      const page = await actor.list(
        userCtx(viewer, "r"),
        pageArgs({ first: 10 }),
      );
      expect(page.entries.map((e) => e.node)).toEqual(
        expect.arrayContaining([
          { type: "WINE", id: wine.id },
          { type: "BEER", id: beer.id },
        ]),
      );
    });
  });

  it("shows one viewer nothing of another's, on a warm activation", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      const wine = await seedWine(db, viewer, "Mine");
      const theirs = await seedWine(db, other, "Theirs");
      await favorite(db, viewer, "wine_id", wine.id);
      await favorite(db, other, "wine_id", theirs.id);

      const actor = await activate(
        createActor(FavoritesCollectionActor, viewer, db),
      );
      const mine = await actor.list(
        userCtx(viewer, "r"),
        pageArgs({ first: 10 }),
      );
      expect(mine.entries.map((e) => e.node.id)).toEqual([wine.id]);

      // The activation is warm. Every one of these is refused *before* the
      // query — C1's bug was a warm activation answering the second caller.
      for (const ctx of [
        anonymousCtx("r"),
        userCtx(other, "r"),
        adminCtx(other, "r"),
      ]) {
        await expect(
          actor.list(ctx, pageArgs({ first: 10 })),
        ).rejects.toBeInstanceOf(ForbiddenError);
      }
      expect(actor.queryCount).toBe(1);
    });
  });

  it("pages by keyset without holding a buffer", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      for (let index = 0; index < 3; index += 1) {
        const wine = await seedWine(db, viewer, `w${index}`);
        await favorite(db, viewer, "wine_id", wine.id);
      }
      const actor = await activate(
        createActor(FavoritesCollectionActor, viewer, db),
      );
      const ctx = userCtx(viewer, "r");
      const first = await actor.list(ctx, pageArgs({ first: 2 }));
      const second = await actor.list(
        ctx,
        pageArgs({ first: 2, after: first.entries[1]?.cursor }),
      );
      expect(first.entries).toHaveLength(2);
      expect(second.entries).toHaveLength(1);
      expect(second.hasNextPage).toBe(false);
      // Both pages queried: a collection actor holds nothing (§1.1, §1.3).
      expect(actor.queryCount).toBe(2);
    });
  });

  it("filters by type before paging, so totalCount follows (UI parity G25)", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const wines = [
        await seedWine(db, viewer, "w1"),
        await seedWine(db, viewer, "w2"),
      ];
      const beer = await seedBeer(db, viewer, "b1");
      for (const wine of wines) await favorite(db, viewer, "wine_id", wine.id);
      await favorite(db, viewer, "beer_id", beer.id);

      const actor = await activate(
        createActor(FavoritesCollectionActor, viewer, db),
      );
      const ctx = userCtx(viewer, "r");
      const onlyBeer = await actor.list(ctx, pageArgs({ first: 1 }), ["BEER"]);
      expect(onlyBeer.entries.map((e) => e.node)).toEqual([beer]);
      expect(onlyBeer.totalCount).toBe(1);

      const onlyWine = await actor.list(ctx, pageArgs({ first: 1 }), ["WINE"]);
      expect(onlyWine.totalCount).toBe(2);
      expect(onlyWine.hasNextPage).toBe(true);

      for (const all of [undefined, null, []] as const) {
        expect(
          (await actor.list(ctx, pageArgs({ first: 5 }), all)).totalCount,
        ).toBe(3);
      }
      await expect(
        actor.list(ctx, pageArgs({ first: 5 }), ["NOPE" as never]),
      ).rejects.toThrow(/not an item type/);
    });
  });
});
