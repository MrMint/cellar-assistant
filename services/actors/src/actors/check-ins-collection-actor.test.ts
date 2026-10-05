/**
 * `CheckInsCollectionActor` — C3 (§2.2, §1.6).
 *
 * The acceptance criterion this file exists for: **author / friend-of-author /
 * stranger, decided by `canSeeCheckIn`**, which §1.6 settled as this surface's
 * rule and told C3 to leave alone. The test asserts the SQL predicate and the
 * policy function agree row by row, so the transcription cannot drift.
 *
 * It also pins the deliberate asymmetry with `CellarActor.checkIns`: a
 * friend-of-the-drinker sees the check-in *here*, on the item, and gets nothing
 * from the cellar-scoped surface for the same PRIVATE cellar (B1's oracle).
 */
import {
  adminCtx,
  anonymousCtx,
  ForbiddenError,
  pageArgs,
  userCtx,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { canSeeCheckIn } from "@cellar-assistant/policy";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  seedCellar,
  seedCellarItem,
  seedFriendship,
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
import { CheckInsCollectionActor } from "./check-ins-collection-actor.ts";

const { skip } = await resolveTestDatabase();

const seedCheckIn = async (
  db: DbOrTx,
  userId: string,
  cellarItemId: string,
): Promise<string> => {
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into public.check_ins (user_id, cellar_item_id)
    values (${userId}::uuid, ${cellarItemId}::uuid)
    returning id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("no check-in id");
  return id;
};

describe.skipIf(skip)("CheckInsCollectionActor", () => {
  afterAll(closeTestDb);

  it("uses canSeeCheckIn: author, friend-of-author, stranger", async () => {
    await withTestDb(async (db) => {
      const drinker = await seedUser(db);
      const friendOfDrinker = await seedUser(db);
      const stranger = await seedUser(db);
      await seedFriendship(db, drinker, friendOfDrinker);

      // A PRIVATE cellar belonging to someone else entirely, so the only way
      // to see the check-in is the author/friend-of-author branch.
      const cellarOwner = await seedUser(db);
      const wine = await seedWine(db, cellarOwner, "Chateau CheckIn");
      const cellarId = await seedCellar(db, {
        createdById: cellarOwner,
        privacy: "PRIVATE",
      });
      const cellarItemId = await seedCellarItem(
        db,
        cellarId,
        cellarOwner,
        wine,
      );
      const checkInId = await seedCheckIn(db, drinker, cellarItemId);

      const seenBy = async (viewerId: string): Promise<string[]> => {
        const actor = await activate(
          createActor(CheckInsCollectionActor, viewerId, db),
        );
        const page = await actor.list(
          userCtx(viewerId, "r"),
          wine,
          pageArgs({ first: 20 }),
        );
        return page.entries.map((entry) => entry.node.id);
      };

      const cases = [
        ["author", drinker, true],
        ["friend-of-author", friendOfDrinker, true],
        ["stranger", stranger, false],
      ] as const;

      for (const [label, viewerId, expected] of cases) {
        const ids = await seenBy(viewerId);
        expect(ids.includes(checkInId), label).toBe(expected);

        // …and the SQL agrees with the policy function it transcribes.
        const policy = canSeeCheckIn(userCtx(viewerId, "r"), {
          userId: drinker,
          cellar: {
            createdById: cellarOwner,
            privacy: "PRIVATE",
            coOwnerIds: [],
            viewerIsFriendOfCreator: false,
          },
          viewerIsFriendOfCheckInUser: viewerId === friendOfDrinker,
        });
        expect(policy, `${label} / policy`).toBe(expected);
      }
    });
  });

  it("also passes anyone who can see the cellar (co-owner branch)", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const coOwner = await seedUser(db);
      const drinker = await seedUser(db);
      const wine = await seedWine(db, owner, "Shared bottle");
      const cellarId = await seedCellar(db, {
        createdById: owner,
        privacy: "PRIVATE",
        coOwnerIds: [coOwner],
      });
      const cellarItemId = await seedCellarItem(db, cellarId, owner, wine);
      const checkInId = await seedCheckIn(db, drinker, cellarItemId);

      const actor = await activate(
        createActor(CheckInsCollectionActor, coOwner, db),
      );
      const page = await actor.list(
        userCtx(coOwner, "r"),
        wine,
        pageArgs({ first: 20 }),
      );
      // §1.6: "inside a cellar you can see, you see every check-in including a
      // co-owner's, friend or not. The cellar is the unit of sharing."
      expect(page.entries.map((e) => e.node.id)).toContain(checkInId);
      expect(page.entries[0]?.node.item).toEqual(wine);
    });
  });

  it("refuses an anonymous or mis-addressed caller on a warm activation", async () => {
    await withTestDb(async (db) => {
      const drinker = await seedUser(db);
      const wine = await seedWine(db, drinker, "Warm");
      const cellarId = await seedCellar(db, { createdById: drinker });
      const cellarItemId = await seedCellarItem(db, cellarId, drinker, wine);
      await seedCheckIn(db, drinker, cellarItemId);

      const actor = await activate(
        createActor(CheckInsCollectionActor, drinker, db),
      );
      const warm = await actor.list(
        userCtx(drinker, "r"),
        wine,
        pageArgs({ first: 5 }),
      );
      expect(warm.entries).toHaveLength(1);

      for (const ctx of [
        anonymousCtx("r"),
        userCtx(await seedUser(db), "r"),
        // An admin may not address somebody else's collection either (C2).
        adminCtx(await seedUser(db), "r"),
      ]) {
        await expect(
          actor.list(ctx, wine, pageArgs({ first: 5 })),
        ).rejects.toBeInstanceOf(ForbiddenError);
      }
      expect(actor.queryCount).toBe(1);
    });
  });
});
