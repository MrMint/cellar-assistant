/**
 * `FriendsCollectionActor`'s profile reads — X18's read-only friend profile.
 *
 * What is pinned:
 *
 * - **The gate.** `profile` answers a friend, and the *same* `NotFound`, with
 *   the same message, for a stranger, the viewer themself, an id that names
 *   nobody and a string that is no id — so the profile is never an oracle for
 *   whether an account exists (D24). The page reads re-check it on their own
 *   turn: a non-friend gets an empty page however the call is made.
 * - **Each section keeps its own rule.** A friend's PRIVATE tier list and
 *   PRIVATE cellar never appear; a cellar the friend co-owns appears only
 *   when the viewer could open it; logs are the friend's own entries, with
 *   what they said (`canSeeCheckInDetails`'s friend branch).
 */
import {
  adminCtx,
  NotFoundError,
  PROFILE_NOT_SHARED,
  pageArgs,
  userCtx,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  seedCellar,
  seedCheckIn,
  seedFriendship,
  seedPlace,
  seedTierList,
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
import { FriendsCollectionActor } from "./friends-collection-actor.ts";

const { skip } = await resolveTestDatabase();

const actorFor = async (db: DbOrTx, viewer: string) =>
  await activate(createActor(FriendsCollectionActor, viewer, db));

const FIRST = pageArgs({ first: 20 });

describe.skipIf(skip)("FriendsCollectionActor — friend profile (X18)", () => {
  afterAll(closeTestDb);

  it("opens a friend's profile, with when the friendship began", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const friend = await seedUser(db);
      await seedFriendship(db, viewer, friend);
      const actor = await actorFor(db, viewer);
      const profile = await actor.profile(userCtx(viewer, "r"), friend);
      expect(profile.userId).toBe(friend);
      expect(profile.since).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // Upper-case ids name the same person.
      const upper = await actor.profile(
        userCtx(viewer, "r"),
        friend.toUpperCase(),
      );
      expect(upper.userId).toBe(friend);
    });
  });

  it("answers one NotFound for a stranger, yourself, nobody and junk", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const stranger = await seedUser(db);
      const actor = await actorFor(db, viewer);
      const ctx = userCtx(viewer, "r");
      // One at a time: the test's transaction is a single connection.
      for (const id of [
        stranger,
        viewer,
        "00000000-0000-4000-8000-000000000000",
        "not-an-id",
      ]) {
        const refusal = await actor.profile(ctx, id).catch((e: unknown) => e);
        expect(refusal).toBeInstanceOf(NotFoundError);
        expect((refusal as Error).message).toBe(PROFILE_NOT_SHARED);
      }
    });
  });

  it("a pending request is not a friendship", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const other = await seedUser(db);
      await db.execute(sql`
        insert into public.friend_requests (user_id, friend_id, status)
        values (${viewer}::uuid, ${other}::uuid, 'PENDING')
      `);
      const actor = await actorFor(db, viewer);
      await expect(
        actor.profile(userCtx(viewer, "r"), other),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it("lists the friend's PUBLIC and FRIENDS tier lists, never a PRIVATE one or anyone else's", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const friend = await seedUser(db);
      const other = await seedUser(db);
      await seedFriendship(db, viewer, friend);
      const pub = await seedTierList(db, {
        createdById: friend,
        privacy: "PUBLIC",
      });
      const friendsOnly = await seedTierList(db, {
        createdById: friend,
        privacy: "FRIENDS",
      });
      await seedTierList(db, { createdById: friend, privacy: "PRIVATE" });
      await seedTierList(db, { createdById: other, privacy: "PUBLIC" });
      await seedTierList(db, { createdById: viewer, privacy: "PUBLIC" });

      const actor = await actorFor(db, viewer);
      const page = await actor.profileTierLists(
        userCtx(viewer, "r"),
        { profileOf: friend },
        FIRST,
      );
      expect(page.entries.map((e) => e.node).sort()).toEqual(
        [pub, friendsOnly].sort(),
      );
      expect(page.totalCount).toBe(2);
    });
  });

  it("holds an admin to what a friend shares: no PRIVATE list or cellar on the profile", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const friend = await seedUser(db);
      await seedFriendship(db, viewer, friend);
      const shared = await seedTierList(db, {
        createdById: friend,
        privacy: "FRIENDS",
      });
      await seedTierList(db, { createdById: friend, privacy: "PRIVATE" });
      const open = await seedCellar(db, {
        createdById: friend,
        privacy: "FRIENDS",
      });
      await seedCellar(db, { createdById: friend, privacy: "PRIVATE" });

      const actor = await actorFor(db, viewer);
      const ctx = adminCtx(viewer, "r");
      const filter = { profileOf: friend };
      const lists = await actor.profileTierLists(ctx, filter, FIRST);
      expect(lists.entries.map((e) => e.node)).toEqual([shared]);
      expect(lists.totalCount).toBe(1);
      const cellars = await actor.profileCellars(ctx, filter, FIRST);
      expect(cellars.entries.map((e) => e.node)).toEqual([open]);
    });
  });

  it("lists cellars the friend created or co-owns that the viewer may open", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const friend = await seedUser(db);
      const stranger = await seedUser(db);
      await seedFriendship(db, viewer, friend);
      const own = await seedCellar(db, {
        createdById: friend,
        privacy: "FRIENDS",
      });
      await seedCellar(db, { createdById: friend, privacy: "PRIVATE" });
      // Co-owned with a stranger: FRIENDS means the *creator's* friends, so
      // the viewer cannot open it and it is not listed.
      await seedCellar(db, {
        createdById: stranger,
        privacy: "FRIENDS",
        coOwnerIds: [friend],
      });
      const coOwnedPublic = await seedCellar(db, {
        createdById: stranger,
        privacy: "PUBLIC",
        coOwnerIds: [friend],
      });
      await seedCellar(db, { createdById: stranger, privacy: "PUBLIC" });

      const actor = await actorFor(db, viewer);
      const page = await actor.profileCellars(
        userCtx(viewer, "r"),
        { profileOf: friend },
        FIRST,
      );
      expect(page.entries.map((e) => e.node).sort()).toEqual(
        [own, coOwnedPublic].sort(),
      );
    });
  });

  it("lists the friend's own log entries, newest first, with what they said", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const friend = await seedUser(db);
      const other = await seedUser(db);
      await seedFriendship(db, viewer, friend);
      const wine = await seedWine(db, friend);
      const older = await seedCheckIn(db, {
        userId: friend,
        item: wine,
        createdAt: "2026-10-01T12:00:00Z",
      });
      const newer = await seedCheckIn(db, {
        userId: friend,
        item: wine,
        createdAt: "2026-10-05T12:00:00Z",
      });
      await db.execute(sql`
        update public.check_ins set score = 4.5, note = 'smoky'
        where id = ${newer}::uuid
      `);
      // Not about the friend: someone else's, and the viewer's own.
      await seedCheckIn(db, { userId: other, item: wine });
      await seedCheckIn(db, { userId: viewer, item: wine });

      const actor = await actorFor(db, viewer);
      const page = await actor.profileLogs(
        userCtx(viewer, "r"),
        { profileOf: friend },
        FIRST,
      );
      expect(page.entries.map((e) => e.node.id)).toEqual([newer, older]);
      expect(page.entries[0]?.node).toMatchObject({
        userId: friend,
        score: 4.5,
        note: "smoky",
        fromCellar: false,
      });
    });
  });

  it("names no place on a friend's log that is under review and not the viewer's", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const friend = await seedUser(db);
      await seedFriendship(db, viewer, friend);
      const wine = await seedWine(db, friend);
      const pending = await seedPlace(db, {
        name: "Friend's new bar",
        lng: 0,
        lat: 0,
        reviewStatus: "pending",
        createdBy: friend,
      });
      const entry = await seedCheckIn(db, { userId: friend, item: wine });
      await db.execute(sql`
        update public.check_ins set place_id = ${pending}::uuid
        where id = ${entry}::uuid
      `);
      const actor = await actorFor(db, viewer);
      const page = await actor.profileLogs(
        userCtx(viewer, "r"),
        { profileOf: friend },
        FIRST,
      );
      expect(page.entries[0]?.node.placeId).toBeNull();
    });
  });

  it("gives a non-friend empty pages, however the call is made", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const stranger = await seedUser(db);
      const wine = await seedWine(db, stranger);
      await seedTierList(db, { createdById: stranger, privacy: "PUBLIC" });
      await seedCellar(db, { createdById: stranger, privacy: "PUBLIC" });
      await seedCheckIn(db, { userId: stranger, item: wine });

      const actor = await actorFor(db, viewer);
      const ctx = userCtx(viewer, "r");
      const filter = { profileOf: stranger };
      for (const page of [
        await actor.profileTierLists(ctx, filter, FIRST),
        await actor.profileCellars(ctx, filter, FIRST),
        await actor.profileLogs(ctx, filter, FIRST),
      ]) {
        expect(page.entries).toEqual([]);
      }
      // Yourself, and junk, likewise.
      expect(
        (await actor.profileLogs(ctx, { profileOf: viewer }, FIRST)).entries,
      ).toEqual([]);
      expect(
        (await actor.profileTierLists(ctx, { profileOf: "x" }, FIRST)).entries,
      ).toEqual([]);
    });
  });

  it("pages a friend's log by cursor without repeating an entry", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      const friend = await seedUser(db);
      await seedFriendship(db, viewer, friend);
      const wine = await seedWine(db, friend);
      const ids: string[] = [];
      for (let day = 1; day <= 5; day += 1) {
        ids.push(
          await seedCheckIn(db, {
            userId: friend,
            item: wine,
            createdAt: `2026-10-0${day}T12:00:00Z`,
          }),
        );
      }
      const actor = await actorFor(db, viewer);
      const ctx = userCtx(viewer, "r");
      const filter = { profileOf: friend };
      const first = await actor.profileLogs(
        ctx,
        filter,
        pageArgs({ first: 2 }),
      );
      const second = await actor.profileLogs(
        ctx,
        filter,
        pageArgs({ first: 2, after: first.entries.at(-1)?.cursor ?? null }),
      );
      expect(first.totalCount).toBe(5);
      expect(
        [...first.entries, ...second.entries].map((e) => e.node.id),
      ).toEqual([ids[4], ids[3], ids[2], ids[1]]);
    });
  });
});
