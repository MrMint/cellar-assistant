/**
 * `UserActor.counts` — the Me hub's four numbers (X18). Each is pinned to the
 * meaning `UserCountsDto` gives it, against rows that would inflate it if the
 * rule were looser: a finished bottle, a friend's cellar, a log about someone
 * else, a place only saved, a place under review that is not yours.
 */
import type { Ctx } from "@cellar-assistant/contracts";
import { ForbiddenError } from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  seedCellar,
  seedCellarItem,
  seedCheckIn,
  seedPlace,
  seedTierList,
  seedVisit,
  seedWine,
} from "../lib/search-testing.ts";
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

afterAll(closeTestDb);

describe.skipIf(skip)("UserActor.counts (X18)", () => {
  it("is all zeros for a new account", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const actor = await actorOf(me, db);
      expect(await actor.counts(userCtx(me))).toEqual({
        bottles: 0,
        logs: 0,
        places: 0,
        tierLists: 0,
      });
    });
  });

  it("counts only what is the viewer's own, by each count's rule", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const friend = await seedUser(db);
      const wine = await seedWine(db, me);

      // Bottles: two in my cellar, one in a cellar I co-own; a finished one
      // and one in a friend's cellar do not count.
      const mine = await seedCellar(db, { createdById: me });
      const coOwned = await seedCellar(db, {
        createdById: friend,
        coOwnerIds: [me],
      });
      const theirs = await seedCellar(db, {
        createdById: friend,
        privacy: "PUBLIC",
      });
      await seedCellarItem(db, mine, me, wine);
      await seedCellarItem(db, mine, me, wine);
      await seedCellarItem(db, coOwned, friend, wine);
      const finished = await seedCellarItem(db, mine, me, wine);
      await db.execute(sql`
        update public.cellar_items set empty_at = now()
        where id = ${finished}::uuid
      `);
      await seedCellarItem(db, theirs, friend, wine);

      // Logs: entries about me — including one a friend wrote for me — but
      // not one I wrote about the friend.
      const bar = await seedPlace(db, { name: "Bar", lng: 0, lat: 0 });
      const loggedAt = await seedCheckIn(db, { userId: me, item: wine });
      await db.execute(sql`
        update public.check_ins set place_id = ${bar}::uuid
        where id = ${loggedAt}::uuid
      `);
      await seedCheckIn(db, { userId: me, item: wine, createdById: friend });
      await seedCheckIn(db, { userId: friend, item: wine, createdById: me });

      // Places: visited (the logged bar again, counted once), plus one I
      // only saved, and someone else's place under review that I visited.
      const visited = await seedPlace(db, { name: "Shop", lng: 1, lat: 1 });
      const saved = await seedPlace(db, { name: "Later", lng: 2, lat: 2 });
      const hidden = await seedPlace(db, {
        name: "Pending",
        lng: 3,
        lat: 3,
        reviewStatus: "pending",
        createdBy: friend,
      });
      await seedVisit(db, me, bar, true);
      await seedVisit(db, me, visited, true);
      await seedVisit(db, me, saved, false);
      await seedVisit(db, me, hidden, true);

      // Tier lists: mine, whatever the privacy; not a friend's.
      await seedTierList(db, { createdById: me, privacy: "PRIVATE" });
      await seedTierList(db, { createdById: me, privacy: "PUBLIC" });
      await seedTierList(db, { createdById: friend, privacy: "PUBLIC" });

      const actor = await actorOf(me, db);
      expect(await actor.counts(userCtx(me))).toEqual({
        bottles: 3,
        logs: 2,
        places: 2,
        tierLists: 2,
      });
    });
  });

  it("refuses anyone but the user it is keyed by", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const other = await seedUser(db);
      const actor = await actorOf(me, db);
      await expect(actor.counts(userCtx(other))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(actor.counts(userCtx(null))).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });
});
