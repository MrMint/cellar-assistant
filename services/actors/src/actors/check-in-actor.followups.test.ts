/**
 * `CheckInActor` — the drink-log follow-ups that came with X03 (the Pour
 * sheet), against a real Postgres:
 *
 *   1. a log can be backdated (`drankAt`), and re-dated after the fact;
 *   2. who was there can be changed after logging (`setCompanions`);
 *   3. a removed log comes back with Undo — the same ids and dates
 *      (`restore`, through `check_in_trash`).
 */
import { randomUUID } from "node:crypto";
import type { ItemRef } from "@cellar-assistant/contracts";
import {
  ConflictError,
  DRINK_LOG_RESTORE_WINDOW_MS,
  ForbiddenError,
  NotFoundError,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { checkIns, checkInTrash } from "@cellar-assistant/db";
import { asc, eq, sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  seedCellar,
  seedCellarItem,
  seedFriendship,
  seedPlace,
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
import { CheckInActor } from "./check-in-actor.ts";

const { skip } = await resolveTestDatabase();

const actorFor = (db: DbOrTx, id: string = randomUUID()) =>
  activate(createActor(CheckInActor, id, db));

const scenario = async (db: DbOrTx) => {
  const drinker = await seedUser(db);
  const friend = await seedUser(db);
  const otherFriend = await seedUser(db);
  const stranger = await seedUser(db);
  await seedFriendship(db, drinker, friend);
  await seedFriendship(db, drinker, otherFriend);
  const wine: ItemRef = await seedWine(db, drinker, "Follow-up Red");
  return { drinker, friend, otherFriend, stranger, wine };
};

const occasion = (db: DbOrTx, groupId: string) =>
  db
    .select({
      id: checkIns.id,
      userId: checkIns.userId,
      createdAt: checkIns.createdAt,
      cellarItemId: checkIns.cellarItemId,
      placeId: checkIns.placeId,
      note: checkIns.note,
    })
    .from(checkIns)
    .where(eq(checkIns.groupId, groupId))
    .orderBy(asc(checkIns.id));

describe.skipIf(skip)("CheckInActor follow-ups (X03)", () => {
  afterAll(closeTestDb);

  describe("drankAt — backdating", () => {
    it("dates every row of the occasion when it was drunk", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, wine } = await scenario(db);
        const id = randomUUID();
        const drankAt = "2026-06-12T19:30:00.000Z";
        const logged = await (await actorFor(db, id)).log(
          userCtx(drinker, "r"),
          { item: wine, companionIds: [friend], drankAt },
        );
        expect(logged.entry.createdAt).toBe(drankAt);
        const rows = await occasion(db, id);
        expect(rows).toHaveLength(2);
        for (const row of rows) {
          expect(row.createdAt.toISOString()).toBe(drankAt);
        }
      });
    });

    it("refuses the future, the distant past and a non-instant", async () => {
      await withTestDb(async (db) => {
        const { drinker, wine } = await scenario(db);
        const ctx = userCtx(drinker, "r");
        const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
        for (const drankAt of [tomorrow, "1850-01-01T00:00:00Z", "last week"]) {
          await expect(
            (await actorFor(db)).log(ctx, { item: wine, drankAt }),
          ).rejects.toBeInstanceOf(ValidationError);
        }
        // A clock a minute fast is still "now".
        const skewed = new Date(Date.now() + 60_000).toISOString();
        await expect(
          (await actorFor(db)).log(ctx, { item: wine, drankAt: skewed }),
        ).resolves.toBeDefined();
      });
    });

    it("re-dates the occasion: the untouched companion rows move with it", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, otherFriend, wine } = await scenario(db);
        const id = randomUUID();
        const logged = await (await actorFor(db, id)).log(
          userCtx(drinker, "r"),
          { item: wine, companionIds: [friend, otherFriend] },
        );
        const friendRow =
          logged.rows.find((row) => row.userId === friend)?.id ?? "";
        await (await actorFor(db, friendRow)).update(userCtx(friend, "r"), {
          note: "mine",
        });

        const drankAt = "2026-09-01T20:00:00.000Z";
        const updated = await (await actorFor(db, id)).update(
          userCtx(drinker, "r"),
          { drankAt },
        );
        expect(updated.createdAt).toBe(drankAt);
        const rows = await occasion(db, id);
        const at = (userId: string) =>
          rows.find((row) => row.userId === userId)?.createdAt.toISOString();
        expect(at(drinker)).toBe(drankAt);
        expect(at(otherFriend)).toBe(drankAt);
        // The friend's own entry is theirs: its date is theirs to change.
        expect(at(friend)).not.toBe(drankAt);
      });
    });
  });

  describe("setCompanions — who was there, after the fact", () => {
    it("adds a friend into the same occasion and drops one", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, otherFriend, wine } = await scenario(db);
        const cellarId = await seedCellar(db, { createdById: drinker });
        const cellarItemId = await seedCellarItem(db, cellarId, drinker, wine);
        const placeId = await seedPlace(db, {
          name: "The Table",
          lat: 30.27,
          lng: -97.74,
        });
        const id = randomUUID();
        const drankAt = "2026-08-08T18:00:00.000Z";
        await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
          bottle: { cellarId, cellarItemId },
          placeId,
          companionIds: [friend],
          drankAt,
        });

        const entry = await (await actorFor(db, id)).setCompanions(
          userCtx(drinker, "r"),
          { companionIds: [otherFriend] },
        );
        expect(entry.companionIds).toEqual([otherFriend]);
        const rows = await occasion(db, id);
        expect(rows.map((row) => row.userId).sort()).toEqual(
          [drinker, otherFriend].sort(),
        );
        const added = rows.find((row) => row.userId === otherFriend);
        // The occasion's own details, not the moment of the edit.
        expect(added).toMatchObject({ cellarItemId, placeId, note: null });
        expect(added?.createdAt.toISOString()).toBe(drankAt);
      });
    });

    it("an empty set is just you; the same set writes nothing", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, wine } = await scenario(db);
        const id = randomUUID();
        await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
          item: wine,
          companionIds: [friend],
        });
        const same = await (await actorFor(db, id)).setCompanions(
          userCtx(drinker, "r"),
          { companionIds: [friend, drinker] },
        );
        expect(same.companionIds).toEqual([friend]);
        const alone = await (await actorFor(db, id)).setCompanions(
          userCtx(drinker, "r"),
          { companionIds: [] },
        );
        expect(alone.companionIds).toEqual([]);
        expect(await occasion(db, id)).toHaveLength(1);
      });
    });

    it("friends only; a companion who made their entry theirs stays", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, stranger, wine } = await scenario(db);
        const id = randomUUID();
        const logged = await (await actorFor(db, id)).log(
          userCtx(drinker, "r"),
          { item: wine, companionIds: [friend] },
        );
        await expect(
          (await actorFor(db, id)).setCompanions(userCtx(drinker, "r"), {
            companionIds: [friend, stranger],
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);

        const friendRow = logged.rows[1]?.id ?? "";
        await (await actorFor(db, friendRow)).update(userCtx(friend, "r"), {
          score: 4,
        });
        await expect(
          (await actorFor(db, id)).setCompanions(userCtx(drinker, "r"), {
            companionIds: [],
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await occasion(db, id)).toHaveLength(2);
      });
    });

    it("someone already at the table stays without being a friend any more; a newcomer must be one", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, otherFriend, stranger, wine } =
          await scenario(db);
        const id = randomUUID();
        await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
          item: wine,
          companionIds: [friend],
        });
        // Unfriended since: the old log still names them.
        await db.execute(
          sql`delete from public.friends where (user_id = ${drinker}::uuid and friend_id = ${friend}::uuid) or (user_id = ${friend}::uuid and friend_id = ${drinker}::uuid)`,
        );
        const entry = await (await actorFor(db, id)).setCompanions(
          userCtx(drinker, "r"),
          { companionIds: [friend, otherFriend] },
        );
        expect([...entry.companionIds].sort()).toEqual(
          [friend, otherFriend].sort(),
        );
        await expect(
          (await actorFor(db, id)).setCompanions(userCtx(drinker, "r"), {
            companionIds: [friend, otherFriend, stranger],
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(await occasion(db, id)).toHaveLength(3);
      });
    });

    it("only the person who logged it: a companion is refused, a stranger told it is absent", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, otherFriend, stranger, wine } =
          await scenario(db);
        const id = randomUUID();
        const logged = await (await actorFor(db, id)).log(
          userCtx(drinker, "r"),
          { item: wine, companionIds: [friend] },
        );
        const friendRow = logged.rows[1]?.id ?? "";
        await expect(
          (await actorFor(db, friendRow)).setCompanions(userCtx(friend, "r"), {
            companionIds: [otherFriend],
          }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
          (await actorFor(db, id)).setCompanions(userCtx(stranger, "r"), {
            companionIds: [],
          }),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });
  });

  describe("restore — Undo of a delete", () => {
    it("puts back the same rows: ids, dates, companions", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, wine } = await scenario(db);
        const id = randomUUID();
        const drankAt = "2026-07-04T21:15:00.000Z";
        await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
          item: wine,
          companionIds: [friend],
          score: 4.5,
          note: "fireworks",
          drankAt,
        });
        const before = await occasion(db, id);
        const removed = await (await actorFor(db, id)).remove(
          userCtx(drinker, "r"),
        );
        expect(await occasion(db, id)).toEqual([]);

        const restored = await (await actorFor(db, id)).restore(
          userCtx(drinker, "r"),
        );
        expect([...restored.ids].sort()).toEqual([...removed.ids].sort());
        expect(restored.ids[0]).toBe(id);
        expect(restored.entry).toMatchObject({
          id,
          score: 4.5,
          note: "fireworks",
          createdAt: drankAt,
          companionIds: [friend],
        });
        expect(await occasion(db, id)).toEqual(before);
        const trash = await db
          .select()
          .from(checkInTrash)
          .where(eq(checkInTrash.removalId, id));
        expect(trash).toEqual([]);

        // Once is all: there is nothing left to undo.
        await expect(
          (await actorFor(db, id)).restore(userCtx(drinker, "r")),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    it("is the remover's alone, and only within the window", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, wine } = await scenario(db);
        const id = randomUUID();
        await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
          item: wine,
        });
        await (await actorFor(db, id)).remove(userCtx(drinker, "r"));
        await expect(
          (await actorFor(db, id)).restore(userCtx(friend, "r")),
        ).rejects.toBeInstanceOf(NotFoundError);

        const stale = new Date(Date.now() - DRINK_LOG_RESTORE_WINDOW_MS - 1000);
        await db.execute(sql`
          update public.check_in_trash set removed_at = ${stale.toISOString()}::timestamptz
          where removal_id = ${id}::uuid
        `);
        await expect(
          (await actorFor(db, id)).restore(userCtx(drinker, "r")),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    it("a bottle removed meanwhile comes back as no bottle; the log survives it", async () => {
      await withTestDb(async (db) => {
        const { drinker, wine } = await scenario(db);
        const cellarId = await seedCellar(db, { createdById: drinker });
        const cellarItemId = await seedCellarItem(db, cellarId, drinker, wine);
        const id = randomUUID();
        await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
          bottle: { cellarId, cellarItemId },
        });
        await (await actorFor(db, id)).remove(userCtx(drinker, "r"));
        await db.execute(
          sql`delete from public.cellar_items where id = ${cellarItemId}::uuid`,
        );
        const restored = await (await actorFor(db, id)).restore(
          userCtx(drinker, "r"),
        );
        expect(restored.entry.item).toEqual(wine);
        const [row] = await occasion(db, id);
        expect(row?.cellarItemId).toBeNull();
      });
    });

    it("the drink itself gone meanwhile is a Conflict, not a database error", async () => {
      await withTestDb(async (db) => {
        const { drinker, wine } = await scenario(db);
        const id = randomUUID();
        await (await actorFor(db, id)).log(userCtx(drinker, "r"), {
          item: wine,
        });
        await (await actorFor(db, id)).remove(userCtx(drinker, "r"));
        await db.execute(
          sql`delete from public.wines where id = ${wine.id}::uuid`,
        );
        await expect(
          (await actorFor(db, id)).restore(userCtx(drinker, "r")),
        ).rejects.toBeInstanceOf(ConflictError);
      });
    });

    it("a companion removing their own row can put it back", async () => {
      await withTestDb(async (db) => {
        const { drinker, friend, wine } = await scenario(db);
        const id = randomUUID();
        const logged = await (await actorFor(db, id)).log(
          userCtx(drinker, "r"),
          { item: wine, companionIds: [friend] },
        );
        const friendRow = logged.rows[1]?.id ?? "";
        await (await actorFor(db, friendRow)).remove(userCtx(friend, "r"));
        const restored = await (await actorFor(db, friendRow)).restore(
          userCtx(friend, "r"),
        );
        expect(restored.ids).toEqual([friendRow]);
        expect(restored.entry).toMatchObject({
          userId: friend,
          createdById: drinker,
        });
      });
    });
  });
});
