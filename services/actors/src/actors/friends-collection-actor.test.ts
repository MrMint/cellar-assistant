/**
 * `FriendsCollectionActor` — C3 (§2.2, §1.5, §1.7).
 *
 * Three things worth pinning: the both-directions read that B4's outcome note
 * requires does **not** list a friend twice once both rows exist; a friendship
 * mid-handshake (only one row written, the outbox not yet delivered) is already
 * visible from both sides; and request direction is computed relative to the
 * viewer rather than stored.
 */
import {
  type ActivityFilter,
  ForbiddenError,
  type FriendsFeedFilter,
  pageArgs,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { canSeeCellar, canSeeTierList } from "@cellar-assistant/policy";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  seedCellar,
  seedCellarItem,
  seedCheckIn,
  seedFriendship,
  seedItemReview,
  seedPlace,
  seedTierList,
  seedTierListPlace,
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

const seedRequest = async (
  db: DbOrTx,
  requesterId: string,
  recipientId: string,
): Promise<string> => {
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into public.friend_requests (user_id, friend_id, status)
    values (${requesterId}::uuid, ${recipientId}::uuid, 'PENDING')
    returning id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("no request id");
  return id;
};

const friendsOf = async (db: DbOrTx, viewerId: string) => {
  const actor = await activate(
    createActor(FriendsCollectionActor, viewerId, db),
  );
  const page = await actor.friends(
    userCtx(viewerId, "r"),
    pageArgs({ first: 50 }),
  );
  return page.entries.map((entry) => entry.node);
};

describe.skipIf(skip)("FriendsCollectionActor", () => {
  afterAll(closeTestDb);

  it("lists a settled friendship once, from both sides", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const bob = await seedUser(db);
      // §1.7's steady state: both rows exist.
      await seedFriendship(db, alice, bob);
      await seedFriendship(db, bob, alice);

      const forAlice = await friendsOf(db, alice);
      const forBob = await friendsOf(db, bob);
      expect(forAlice.map((f) => f.userId)).toEqual([bob]);
      expect(forBob.map((f) => f.userId)).toEqual([alice]);
      expect(forAlice[0]?.since).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  it("shows a friendship mid-handshake from both sides (B4)", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const bob = await seedUser(db);
      // Only the recipient's row is written until the outbox delivers
      // `confirmFriendship`; a one-directional read would drop Bob for Alice.
      await seedFriendship(db, alice, bob);
      expect((await friendsOf(db, alice)).map((f) => f.userId)).toEqual([bob]);
      expect((await friendsOf(db, bob)).map((f) => f.userId)).toEqual([alice]);
    });
  });

  it("computes request direction relative to the viewer", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const bob = await seedUser(db);
      const carol = await seedUser(db);
      const outgoing = await seedRequest(db, alice, bob);
      const incoming = await seedRequest(db, carol, alice);

      const actor = await activate(
        createActor(FriendsCollectionActor, alice, db),
      );
      const ctx = userCtx(alice, "r");
      const out = await actor.requests(
        ctx,
        "OUTGOING",
        pageArgs({ first: 20 }),
      );
      const inc = await actor.requests(
        ctx,
        "INCOMING",
        pageArgs({ first: 20 }),
      );
      const all = await actor.requests(ctx, "ALL", pageArgs({ first: 20 }));

      expect(out.entries.map((e) => e.node.id)).toEqual([outgoing]);
      expect(out.entries[0]?.node).toMatchObject({
        direction: "OUTGOING",
        otherUserId: bob,
        status: "PENDING",
      });
      expect(inc.entries.map((e) => e.node.id)).toEqual([incoming]);
      expect(inc.entries[0]?.node).toMatchObject({
        direction: "INCOMING",
        otherUserId: carol,
      });
      expect(all.entries.map((e) => e.node.id).sort()).toEqual(
        [outgoing, incoming].sort(),
      );
    });
  });

  it("refuses a caller who is not the viewer it is keyed by", async () => {
    await withTestDb(async (db) => {
      const alice = await seedUser(db);
      const bob = await seedUser(db);
      await seedFriendship(db, alice, bob);
      const actor = await activate(
        createActor(FriendsCollectionActor, alice, db),
      );
      await actor.friends(userCtx(alice, "r"), pageArgs({ first: 5 }));
      await expect(
        actor.friends(userCtx(bob, "r"), pageArgs({ first: 5 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        actor.requests(userCtx(bob, "r"), "ALL", pageArgs({ first: 5 })),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  /**
   * UI parity G31. The old feed trusted a client-built `$userIds` and read a
   * friend's PRIVATE tier list (name included). Whose activity, and which
   * rows, are decided here — these pin each kind against its policy function.
   */
  describe("recentActivity", () => {
    const ALL: ActivityFilter = { kinds: [], limit: 6 };

    const activityOf = async (
      db: DbOrTx,
      viewerId: string,
      filter: ActivityFilter = ALL,
    ) => {
      const actor = await activate(
        createActor(FriendsCollectionActor, viewerId, db),
      );
      const entries = await actor.recentActivity(
        userCtx(viewerId, "r"),
        filter,
      );
      return { actor, entries };
    };

    /** Rows in one transaction share `now()`; give each its own instant. */
    const stamp = async (
      db: DbOrTx,
      table: "item_reviews" | "tier_list_items" | "cellar_items",
      where: ReturnType<typeof sql>,
      minutesAgo: number,
    ) => {
      await db.execute(sql`
        update ${sql.identifier("public")}.${sql.identifier(table)}
        set created_at = now() - make_interval(mins => ${minutesAgo})
        where ${where}
      `);
    };

    it("X27: a friend ranking their own place under review is not in the viewer's feed — and is in the friend's own", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db);
        await seedFriendship(db, viewer, friend);
        const pending = await seedPlace(db, {
          name: "Friend's pending bar",
          lng: 0,
          lat: 0,
          reviewStatus: "pending",
          createdBy: friend,
        });
        const list = await seedTierList(db, {
          createdById: friend,
          privacy: "PUBLIC",
        });
        await seedTierListPlace(db, list, pending);

        const { entries } = await activityOf(db, viewer);
        expect(entries.map((e) => e.placeId)).not.toContain(pending);
        const own = await activityOf(db, friend);
        expect(own.entries.map((e) => e.placeId)).toContain(pending);
      });
    });

    it("CHECKED_IN (X02): the viewer's and friends' logs, one entry per occasion, a stranger's never", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, viewer, friend);
        const wine = await seedWine(db, viewer, "Logged");

        // A table's round the friend logged for themself and the viewer: one
        // occasion, two rows — it must appear once.
        const round = await seedCheckIn(db, { userId: friend, item: wine });
        await seedCheckIn(db, {
          userId: viewer,
          item: wine,
          createdById: friend,
          groupId: round,
        });
        const mine = await seedCheckIn(db, { userId: viewer, item: wine });
        const theirs = await seedCheckIn(db, { userId: stranger, item: wine });

        const { entries } = await activityOf(db, viewer, {
          kinds: ["CHECKED_IN"],
          limit: 6,
        });
        const ids = entries.map((e) => e.id);
        expect(ids.sort()).toEqual([round, mine].sort());
        expect(ids).not.toContain(theirs);
        const roundEntry = entries.find((e) => e.id === round);
        expect(roundEntry?.kind).toBe("CHECKED_IN");
        expect(roundEntry?.userId).toBe(friend);
        expect(roundEntry?.checkIn?.companionIds).toEqual([viewer]);
        expect(roundEntry?.item).toEqual(wine);
      });
    });

    it("CHECKED_IN (X02 x X27): a friend's log at their own place under review names no place", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db);
        await seedFriendship(db, viewer, friend);
        const wine = await seedWine(db, friend, "Logged at a pending bar");
        const pending = await seedPlace(db, {
          name: "Friend's pending bar",
          lng: 0,
          lat: 0,
          reviewStatus: "pending",
          createdBy: friend,
        });
        const id = await seedCheckIn(db, { userId: friend, item: wine });
        await db.execute(
          sql`update public.check_ins set place_id = ${pending}::uuid where id = ${id}::uuid`,
        );

        const { entries } = await activityOf(db, viewer, {
          kinds: ["CHECKED_IN"],
          limit: 6,
        });
        const entry = entries.find((e) => e.id === id);
        expect(entry?.checkIn).toBeDefined();
        expect(entry?.checkIn?.placeId).toBeNull();
        const own = await activityOf(db, friend, {
          kinds: ["CHECKED_IN"],
          limit: 6,
        });
        expect(own.entries.find((e) => e.id === id)?.checkIn?.placeId).toBe(
          pending,
        );
      });
    });

    it("tier-list entries: the viewer's and friends' lists exactly as canSeeTierList admits them", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, viewer, friend);
        const place = await seedPlace(db, { name: "P", lng: 0, lat: 0 });

        const friendLists = {
          PRIVATE: await seedTierList(db, {
            createdById: friend,
            privacy: "PRIVATE",
            name: "friend secret list",
          }),
          FRIENDS: await seedTierList(db, {
            createdById: friend,
            privacy: "FRIENDS",
          }),
          PUBLIC: await seedTierList(db, {
            createdById: friend,
            privacy: "PUBLIC",
          }),
        } as const;
        const ownPrivate = await seedTierList(db, {
          createdById: viewer,
          privacy: "PRIVATE",
        });
        const strangerPublic = await seedTierList(db, {
          createdById: stranger,
          privacy: "PUBLIC",
        });
        for (const id of [...Object.values(friendLists), ownPrivate]) {
          await seedTierListPlace(db, id, place);
        }
        await seedTierListPlace(db, strangerPublic, place);

        const { actor, entries } = await activityOf(db, viewer);
        const listIds = entries.map((e) => e.tierListItem?.tierListId);
        for (const privacy of ["PRIVATE", "FRIENDS", "PUBLIC"] as const) {
          const policy = canSeeTierList(userCtx(viewer, "r"), {
            createdById: friend,
            privacy,
            viewerIsFriendOfCreator: true,
          });
          expect(listIds.includes(friendLists[privacy]), privacy).toBe(policy);
        }
        expect(listIds).toContain(ownPrivate);
        // A stranger's PUBLIC list is visible, but not their activity.
        expect(listIds).not.toContain(strangerPublic);
        for (const entry of entries) {
          expect(entry.kind).toBe("TIER_LISTED");
          expect(entry.placeId).toBe(place);
          expect(entry.item).toBeNull();
          expect(entry.rank).toBe(1);
        }
        // One authorised turn, however many kinds.
        expect(actor.queryCount).toBe(1);

        // The friend's own view of the same rows is untouched by any of this.
        const fromFriend = await activityOf(db, friend);
        expect(
          fromFriend.entries.map((e) => e.tierListItem?.tierListId),
        ).toContain(friendLists.PRIVATE);
      });
    });

    it("reviews: the viewer's and friends', never a stranger's, newest first and capped per kind", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        // The other direction: friendships are read both ways.
        await seedFriendship(db, friend, viewer);
        const wine = await seedWine(db, viewer);
        await seedItemReview(db, viewer, wine, 4);
        await seedItemReview(db, friend, wine, 3.5);
        await seedItemReview(db, stranger, wine, 2);
        await stamp(db, "item_reviews", sql`user_id = ${viewer}::uuid`, 30);
        await stamp(db, "item_reviews", sql`user_id = ${friend}::uuid`, 10);

        const { entries } = await activityOf(db, viewer);
        expect(entries.map((e) => [e.kind, e.userId, e.review?.score])).toEqual(
          [
            ["REVIEWED", friend, 3.5],
            ["REVIEWED", viewer, 4],
          ],
        );
        expect(entries[0]?.item).toEqual(wine);
        expect(entries[0]?.review?.itemType).toBe("WINE");

        const capped = await activityOf(db, viewer, {
          kinds: ["REVIEWED"],
          limit: 1,
        });
        expect(capped.entries.map((e) => e.userId)).toEqual([friend]);
      });
    });

    it("bottles: added by the viewer or a friend, in a cellar canSeeCellar admits", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, viewer, friend);
        const wine = await seedWine(db, viewer);

        const friendCellars = {
          PRIVATE: await seedCellar(db, {
            createdById: friend,
            privacy: "PRIVATE",
          }),
          FRIENDS: await seedCellar(db, {
            createdById: friend,
            privacy: "FRIENDS",
          }),
          PUBLIC: await seedCellar(db, {
            createdById: friend,
            privacy: "PUBLIC",
          }),
        } as const;
        for (const cellar of Object.values(friendCellars)) {
          await seedCellarItem(db, cellar, friend, wine);
        }
        // The viewer co-owns a stranger's PRIVATE cellar: their own adds show,
        // the stranger's do not (not a friend).
        const shared = await seedCellar(db, {
          createdById: stranger,
          privacy: "PRIVATE",
          coOwnerIds: [viewer],
        });
        const mine = await seedCellarItem(db, shared, viewer, wine);
        await seedCellarItem(db, shared, stranger, wine);

        const { entries } = await activityOf(db, viewer, {
          kinds: ["ADDED"],
          limit: 6,
        });
        const cellarIds = entries.map((e) => e.cellarId);
        for (const privacy of ["PRIVATE", "FRIENDS", "PUBLIC"] as const) {
          const policy = canSeeCellar(userCtx(viewer, "r"), {
            createdById: friend,
            privacy,
            coOwnerIds: [],
            viewerIsFriendOfCreator: true,
          });
          expect(cellarIds.includes(friendCellars[privacy]), privacy).toBe(
            policy,
          );
        }
        expect(entries.filter((e) => e.cellarId === shared)).toEqual([
          expect.objectContaining({
            kind: "ADDED",
            userId: viewer,
            cellarItemId: mine,
            item: wine,
          }),
        ]);
      });
    });

    it("merges the kinds newest first, filters by kind and ranks within the list", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const wine = await seedWine(db, viewer);
        const cellar = await seedCellar(db, { createdById: viewer });
        await seedCellarItem(db, cellar, viewer, wine);
        await seedItemReview(db, viewer, wine, 5);
        const list = await seedTierList(db, { createdById: viewer });
        const top = await seedPlace(db, { name: "Top", lng: 0, lat: 0 });
        const next = await seedPlace(db, { name: "Next", lng: 0, lat: 0 });
        const lower = await seedPlace(db, { name: "Lower", lng: 0, lat: 0 });
        await seedTierListPlace(db, list, top, 5, 0);
        await seedTierListPlace(db, list, next, 5, 1);
        await seedTierListPlace(db, list, lower, 2, 0);
        await stamp(db, "cellar_items", sql`true`, 50);
        await stamp(db, "item_reviews", sql`true`, 40);
        await stamp(db, "tier_list_items", sql`place_id = ${top}::uuid`, 30);
        await stamp(db, "tier_list_items", sql`place_id = ${next}::uuid`, 20);
        await stamp(db, "tier_list_items", sql`place_id = ${lower}::uuid`, 10);

        const { entries } = await activityOf(db, viewer);
        expect(entries.map((e) => [e.kind, e.placeId, e.rank])).toEqual([
          ["TIER_LISTED", lower, 3],
          ["TIER_LISTED", next, 2],
          ["TIER_LISTED", top, 1],
          ["REVIEWED", null, null],
          ["ADDED", null, null],
        ]);

        const onlyTwo = await activityOf(db, viewer, {
          kinds: ["ADDED", "REVIEWED"],
          limit: 6,
        });
        expect(onlyTwo.entries.map((e) => e.kind)).toEqual([
          "REVIEWED",
          "ADDED",
        ]);
      });
    });

    it("refuses a malformed filter and another viewer's key before reading", async () => {
      await withTestDb(async (db) => {
        const alice = await seedUser(db);
        const bob = await seedUser(db);
        const actor = await activate(
          createActor(FriendsCollectionActor, alice, db),
        );
        const ctx = userCtx(alice, "r");
        for (const bad of [
          { kinds: ["SHARED"], limit: 6 },
          { kinds: [], limit: 0 },
          { kinds: [], limit: 21 },
          { kinds: [], limit: 2.5 },
          { limit: 6 },
        ]) {
          await expect(
            actor.recentActivity(ctx, bad as unknown as ActivityFilter),
            JSON.stringify(bad),
          ).rejects.toBeInstanceOf(ValidationError);
        }
        await expect(
          actor.recentActivity(userCtx(bob, "r"), ALL),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(actor.queryCount).toBe(0);
      });
    });
  });

  /**
   * X10: Home's Friends section. Friends only, every kind's rule kept, and
   * paged for real — a cursor names one point in the merged order, so no
   * page skips or repeats a row however the kinds interleave.
   */
  describe("friendsFeed", () => {
    const feedPage = async (
      actor: FriendsCollectionActor,
      viewer: string,
      first: number,
      after: string | null = null,
      kinds: FriendsFeedFilter["kinds"] = [],
    ) =>
      await actor.friendsFeed(
        userCtx(viewer, "r"),
        { kinds },
        pageArgs({ first, after }),
      );

    it("lists friends' activity, never the viewer's own or a stranger's", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, viewer, friend);
        const wine = await seedWine(db, viewer, "Feed wine");
        await seedItemReview(db, friend, wine, 4);
        await seedItemReview(db, viewer, wine, 3);
        await seedItemReview(db, stranger, wine, 2);
        const actor = await activate(
          createActor(FriendsCollectionActor, viewer, db),
        );
        const page = await feedPage(actor, viewer, 10);
        expect(page.entries.map((e) => e.node.userId)).toEqual([friend]);
        expect(page.hasNextPage).toBe(false);
      });
    });

    it("keeps canSeeTierList and canSeeCellar: a friend's PRIVATE list or cellar never reaches the feed", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db);
        await seedFriendship(db, viewer, friend);
        const place = await seedPlace(db, { name: "P", lng: 0, lat: 0 });
        const wine = await seedWine(db, friend, "Feed privacy wine");
        type Privacy = "PRIVATE" | "FRIENDS" | "PUBLIC";
        const lists = {} as Record<Privacy, string>;
        const cellars = {} as Record<Privacy, string>;
        for (const privacy of ["PRIVATE", "FRIENDS", "PUBLIC"] as const) {
          const list = await seedTierList(db, {
            createdById: friend,
            privacy,
          });
          await seedTierListPlace(db, list, place);
          lists[privacy] = list;
          const cellar = await seedCellar(db, {
            createdById: friend,
            privacy,
          });
          await seedCellarItem(db, cellar, friend, wine);
          cellars[privacy] = cellar;
        }
        const actor = await activate(
          createActor(FriendsCollectionActor, viewer, db),
        );
        const { entries } = await feedPage(actor, viewer, 20);
        const listIds = entries.map((e) => e.node.tierListItem?.tierListId);
        const cellarIds = entries.map((e) => e.node.cellarId);
        for (const privacy of ["PRIVATE", "FRIENDS", "PUBLIC"] as const) {
          const ctx = userCtx(viewer, "r");
          expect(listIds.includes(lists[privacy]), `list ${privacy}`).toBe(
            canSeeTierList(ctx, {
              createdById: friend,
              privacy,
              viewerIsFriendOfCreator: true,
            }),
          );
          expect(
            cellarIds.includes(cellars[privacy]),
            `cellar ${privacy}`,
          ).toBe(
            canSeeCellar(ctx, {
              createdById: friend,
              privacy,
              coOwnerIds: [],
              viewerIsFriendOfCreator: true,
            }),
          );
        }
        // The two PRIVATE rows exist; the feed just never names them.
        expect(listIds).not.toContain(lists.PRIVATE);
        expect(cellarIds).not.toContain(cellars.PRIVATE);
      });
    });

    it("is empty without friends, and refuses another viewer", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const other = await seedUser(db);
        const actor = await activate(
          createActor(FriendsCollectionActor, viewer, db),
        );
        expect((await feedPage(actor, viewer, 5)).entries).toEqual([]);
        await expect(
          actor.friendsFeed(
            userCtx(other, "r"),
            { kinds: [] },
            pageArgs({ first: 5 }),
          ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
          actor.friendsFeed(
            userCtx(viewer, "r"),
            { kinds: ["SHARED"] } as unknown as FriendsFeedFilter,
            pageArgs({ first: 5 }),
          ),
        ).rejects.toBeInstanceOf(ValidationError);
        await expect(
          feedPage(actor, viewer, 5, "offset:3"),
        ).rejects.toBeInstanceOf(ValidationError);
      });
    });

    it("walks every row exactly once across pages, kinds interleaved and tied", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db);
        await seedFriendship(db, viewer, friend);
        const cellar = await seedCellar(db, {
          createdById: friend,
          privacy: "FRIENDS",
        });
        const wines = [];
        for (let i = 0; i < 4; i += 1) {
          wines.push(await seedWine(db, friend, `Paged ${i}`));
        }
        // Two kinds at the very same instant, and two rows of one kind at
        // another, so the cursor has to break ties on kind and on id.
        const tied = "2026-10-01T12:00:00.000Z";
        const tiedPair = "2026-10-01T11:00:00.000Z";
        for (const [i, wine] of wines.entries()) {
          await seedCellarItem(db, cellar, friend, wine);
          await seedCheckIn(db, {
            userId: friend,
            item: wine,
            createdAt: i < 2 ? tiedPair : `2026-10-0${2 + i}T09:00:00.000Z`,
          });
        }
        await db.execute(sql`
          update public.cellar_items set created_at = ${tied}::timestamptz
          where cellar_id = ${cellar}::uuid
        `);
        const firstWine = wines[0];
        if (firstWine === undefined) throw new Error("no wine seeded");
        await seedCheckIn(db, {
          userId: friend,
          item: firstWine,
          createdAt: tied,
        });

        const actor = await activate(
          createActor(FriendsCollectionActor, viewer, db),
        );
        const everything = await feedPage(actor, viewer, 50);
        const all = everything.entries.map(
          (e) => `${e.node.kind}:${e.node.id}`,
        );
        expect(all).toHaveLength(9);

        const walked: string[] = [];
        let after: string | null = null;
        for (let pages = 0; pages < 20; pages += 1) {
          const page = await feedPage(actor, viewer, 2, after);
          walked.push(
            ...page.entries.map((e) => `${e.node.kind}:${e.node.id}`),
          );
          if (!page.hasNextPage) break;
          after = page.entries.at(-1)?.cursor ?? null;
        }
        expect(walked).toEqual(all);
        // Newest first, ties by kind A→Z.
        const ats = everything.entries.map((e) => e.node.occurredAt);
        expect([...ats].sort().reverse()).toEqual(ats);
      });
    });

    it("keeps the kind filter across pages", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        const friend = await seedUser(db);
        await seedFriendship(db, viewer, friend);
        const wine = await seedWine(db, friend, "Only logs");
        await seedItemReview(db, friend, wine, 4);
        await seedCheckIn(db, { userId: friend, item: wine });
        const actor = await activate(
          createActor(FriendsCollectionActor, viewer, db),
        );
        const page = await feedPage(actor, viewer, 5, null, ["CHECKED_IN"]);
        expect(page.entries.map((e) => e.node.kind)).toEqual(["CHECKED_IN"]);
      });
    });
  });
});
