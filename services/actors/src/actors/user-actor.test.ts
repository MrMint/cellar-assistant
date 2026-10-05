/**
 * `UserActor` against a real Postgres, with a real `OutboxActor` in the loop.
 *
 * The subject of this file is the **two-sided friendship**, so the outbox is
 * not stubbed out of the picture the way `outbox-actor.test.ts` stubs the
 * network: `RoutingOutboxActor` below replaces only the sidecar hop, and
 * reconstructs what the sidecar would do — `method(testDelivery("<id>"),
 * payload)` on a freshly activated actor of the named type. Everything else is
 * real: the claim, the ordering, the attempt accounting, both actors'
 * transactions, and both `friends` rows.
 *
 * The one thing faked is the **profile store** (`../lib/profile-store.ts`),
 * because profile fields live in better-auth's `user` table in a *different
 * database* (A6, `../auth/README.md`) and the harness runs inside one
 * rolled-back transaction on the main one.
 */
import { readFileSync } from "node:fs";
import type {
  ActorError,
  Ctx,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  adminCtx,
  anonymousCtx,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  pageArgs,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import {
  friendRequests,
  friends,
  itemFavorites,
  outbox,
  places,
  teas,
  userPlaceInteractions,
} from "@cellar-assistant/db";
import { and, eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type { ProfileFields, ProfileStore } from "../lib/profile-store.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import type { ClaimedRow } from "./outbox-actor.ts";
import { OUTBOX_ACTOR_ID, OutboxActor } from "./outbox-actor.ts";
import { UserActor } from "./user-actor.ts";

/* -------------------------------------------------------------------------- */
/* Harness                                                                     */
/* -------------------------------------------------------------------------- */

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

/** An in-memory stand-in for better-auth's `user` table. */
const fakeProfiles = (): ProfileStore & {
  put(fields: ProfileFields): void;
} => {
  const rows = new Map<string, ProfileFields>();
  return {
    put: (fields) => {
      rows.set(fields.id, fields);
    },
    load: async (ids) =>
      new Map(
        ids
          .map((id) => rows.get(id))
          .filter((row): row is ProfileFields => row !== undefined)
          .map((row) => [row.id, row]),
      ),
    // C1 added `search` to `ProfileStore` for `UserSearchActor`; nothing in
    // B4 calls it, so the fake answers honestly and minimally.
    search: async ({ term, excludeIds, limit }) => {
      const excluded = new Set(excludeIds);
      return [...rows.values()]
        .filter(
          (row) =>
            !excluded.has(row.id) &&
            row.displayName.toLowerCase().includes(term.toLowerCase()),
        )
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .slice(0, limit);
    },
    update: async (id, patch) => {
      const current = rows.get(id);
      if (current === undefined) return null;
      const next: ProfileFields = {
        ...current,
        ...(patch.displayName === undefined
          ? {}
          : { displayName: patch.displayName }),
        ...(patch.avatarUrl === undefined
          ? {}
          : { avatarUrl: patch.avatarUrl }),
        ...(patch.locale === undefined ? {} : { locale: patch.locale }),
      };
      rows.set(id, next);
      return next;
    },
  };
};

const profiles = fakeProfiles();

const newUserActor = (id: string, db: DbOrTx): UserActor =>
  new UserActor(daprClient(), new ActorId(id), db, profiles);

const userActor = async (id: string, db: DbOrTx): Promise<UserActor> =>
  activate(newUserActor(id, db));

/**
 * `OutboxActor` with **only** the sidecar hop replaced.
 *
 * This is deliberately not a stub that records and returns: it constructs the
 * target actor and invokes the named method with the same `(systemCtx, payload)`
 * pair `invokeActorMethod` would send, so a payload shape or a policy guard that
 * would fail in production fails here too.
 */
class RoutingOutboxActor extends OutboxActor {
  readonly delivered: ClaimedRow[] = [];
  readonly results: unknown[] = [];

  protected override async deliver(row: ClaimedRow): Promise<void> {
    this.delivered.push(row);
    await super.deliver(row);
  }

  /** The sidecar hop only: `args` are the drainer's own `deliveryArgs`. */
  protected override async invoke(
    targetActor: string,
    targetId: string,
    methodName: string,
    args: readonly unknown[],
  ): Promise<void> {
    if (targetActor !== "UserActor") {
      throw new Error(`no route for ${targetActor}`);
    }
    const actor = await userActor(targetId, this.db);
    const method = (actor as unknown as Record<string, unknown>)[methodName];
    if (typeof method !== "function") {
      throw new Error(`UserActor has no method ${methodName}`);
    }
    this.results.push(
      await (method as (...a: readonly unknown[]) => Promise<unknown>).apply(
        actor,
        [...args],
      ),
    );
  }
}

const drainer = async (db: DbOrTx): Promise<RoutingOutboxActor> =>
  activate(createActor(RoutingOutboxActor, OUTBOX_ACTOR_ID, db));

/** A user with a profile row in the fake store, so friend lists render. */
const seedPerson = async (db: DbOrTx, name: string): Promise<string> => {
  const id = await seedUser(db, { displayName: name });
  profiles.put({
    id,
    displayName: name,
    avatarUrl: null,
    locale: "en",
    email: `${name.toLowerCase()}-${id.slice(0, 8)}@example.test`,
  });
  return id;
};

const seedTea = async (db: DbOrTx, createdById: string): Promise<string> => {
  const [row] = await db
    .insert(teas)
    .values({ name: `Tea ${Date.now()}`, createdById })
    .returning({ id: teas.id });
  if (row === undefined) throw new Error("seedTea: no row");
  return row.id;
};

const seedPlace = async (db: DbOrTx): Promise<string> => {
  const [row] = await db
    .insert(places)
    .values({
      name: `Place ${Date.now()}`,
      categories: ["bar"],
      location: { lng: -122.4194, lat: 37.7749 },
    })
    .returning({ id: places.id });
  if (row === undefined) throw new Error("seedPlace: no row");
  return row.id;
};

/** Every `friends` row touching either user, as readable pairs. */
const friendPairs = async (
  db: DbOrTx,
  ids: readonly string[],
): Promise<string[]> => {
  const label = new Map(ids.map((id, index) => [id, `u${index + 1}`]));
  const rows = await db.select().from(friends);
  return rows
    .filter((row) => label.has(row.userId) && label.has(row.friendId))
    .map((row) => `${label.get(row.userId)}→${label.get(row.friendId)}`)
    .sort();
};

/**
 * Park everything already pending in `outbox`.
 *
 * The compose stack's own actor host drains this same table, and other suites
 * leave rows behind, so a test that asserts `claimed: 1` has to start from a
 * quiet queue. Everything here is rolled back, so parking costs nothing — and
 * it is done *inside* the test transaction, so the running host never sees it.
 */
const quiesceOutbox = async (db: DbOrTx): Promise<void> => {
  await db
    .update(outbox)
    .set({ status: "delivered" })
    .where(eq(outbox.status, "pending"));
};

/** `withTestDb`, with the queue quiesced first. */
const withUserDb = <T>(fn: (db: DbOrTx) => Promise<T>): Promise<T> =>
  withTestDb(async (db) => {
    await quiesceOutbox(db);
    return fn(db);
  });

const nodes = <T>(page: Page<T>): T[] => page.entries.map((e) => e.node);
const firstPage: PageArgs = pageArgs({ first: 20 });

/** The whole two-sided handshake, for tests whose subject is what comes after. */
const befriend = async (db: DbOrTx, a: string, b: string): Promise<void> => {
  const request = await (await userActor(a, db)).sendFriendRequest(
    userCtx(a, "r"),
    b,
  );
  await (await userActor(b, db)).acceptFriendRequest(
    userCtx(b, "r"),
    request.id,
  );
  await (await drainer(db)).drain(systemCtx("drain"));
};

const { skip } = await resolveTestDatabase();

/* -------------------------------------------------------------------------- */

describe.skipIf(skip)("UserActor (B4)", () => {
  afterAll(closeTestDb);

  it("is an entity actor per §8.3", () => {
    expect(UserActor.category).toBe("entity");
  });

  it("is NotFound for a user id that has no row", async () => {
    await withUserDb(async (db) => {
      const actor = await userActor("00000000-0000-4000-8000-000000000000", db);
      await expect(actor.getProfile(adminCtx("a", "r"))).rejects.toThrow(
        NotFoundError,
      );
      // Dapr will activate an actor for any id at all, including nonsense.
      const junk = await userActor("not-a-uuid", db);
      await expect(junk.getProfile(adminCtx("a", "r"))).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  /* ---------------------------------------------------------------------- */
  /* §1.7 — friend acceptance across two actors                             */
  /* ---------------------------------------------------------------------- */

  describe("friend acceptance is two idempotent calls (§1.7)", () => {
    it("produces both friends rows through the outbox, one side per actor", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");

        const request = await (await userActor(alice, db)).sendFriendRequest(
          userCtx(alice, "r1"),
          bob,
        );
        expect(request).toMatchObject({
          requesterId: alice,
          recipientId: bob,
          status: "PENDING",
          direction: "OUTGOING",
        });

        // --- step 1: the recipient's actor, and ONLY its own row -----------
        const accepted = await (await userActor(bob, db)).acceptFriendRequest(
          userCtx(bob, "r2"),
          request.id,
        );

        expect(accepted.friendRowInserted).toBe(true);
        expect(await friendPairs(db, [alice, bob])).toEqual(["u2→u1"]);

        // The request row is untouched: `friend_requests.user_id` is Alice, so
        // only Alice's actor may write it (§1.2, §3).
        const stillOpen = await db
          .select()
          .from(friendRequests)
          .where(eq(friendRequests.id, request.id));
        expect(stillOpen).toHaveLength(1);

        // …and the follow-up is an outbox row, in the same transaction.
        const [queued] = await db
          .select()
          .from(outbox)
          .where(eq(outbox.id, accepted.outboxRowId));
        expect(queued).toMatchObject({
          targetActor: "UserActor",
          targetId: alice,
          method: "confirmFriendship",
          status: "pending",
          payload: { friendId: bob, requestId: request.id },
        });

        // --- step 2: the outbox delivers to the requester's actor ----------
        const outboxActor = await drainer(db);
        const result = await outboxActor.drain(systemCtx("drain-1"));

        expect(result).toMatchObject({ claimed: 1, delivered: 1, dead: 0 });
        expect(outboxActor.results[0]).toEqual({
          friendRowInserted: true,
          requestClosed: true,
          outboxRowId: accepted.outboxRowId,
        });

        expect(await friendPairs(db, [alice, bob])).toEqual(["u1→u2", "u2→u1"]);
        expect(
          await db
            .select()
            .from(friendRequests)
            .where(eq(friendRequests.id, request.id)),
        ).toEqual([]);

        // Both actors now agree, which is what every visibility rule reads.
        expect(
          nodes(
            await (await userActor(alice, db)).friends(
              userCtx(alice, "r"),
              firstPage,
            ),
          ),
        ).toMatchObject([{ profile: { id: bob, displayName: "Bob" } }]);
        expect(
          nodes(
            await (await userActor(bob, db)).friends(
              userCtx(bob, "r"),
              firstPage,
            ),
          ),
        ).toMatchObject([{ profile: { id: alice, displayName: "Alice" } }]);
      });
    });

    it("leaves exactly one row when confirmFriendship is delivered twice", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");

        const request = await (await userActor(alice, db)).sendFriendRequest(
          userCtx(alice, "r1"),
          bob,
        );
        const accepted = await (await userActor(bob, db)).acceptFriendRequest(
          userCtx(bob, "r2"),
          request.id,
        );

        const first = await drainer(db);
        await first.drain(systemCtx("drain-1"));
        expect(first.results[0]).toMatchObject({
          friendRowInserted: true,
          requestClosed: true,
        });

        // Redelivery. This is precisely the at-least-once case §1.4 warns
        // about: a drainer that died after invoking but before recording the
        // outcome leaves the row claimable again.
        await db
          .update(outbox)
          .set({ status: "pending", runAfter: new Date(0) })
          .where(eq(outbox.id, accepted.outboxRowId));

        const second = await drainer(db);
        const result = await second.drain(systemCtx("drain-2"));

        expect(result).toMatchObject({ claimed: 1, delivered: 1 });
        expect(second.results[0]).toEqual({
          friendRowInserted: false,
          requestClosed: false,
          outboxRowId: accepted.outboxRowId,
        });
        expect(await friendPairs(db, [alice, bob])).toEqual(["u1→u2", "u2→u1"]);
        expect(
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(friends)
            .where(and(eq(friends.userId, alice), eq(friends.friendId, bob))),
        ).toEqual([{ n: 1 }]);
      });
    });

    it("completes when the outbox call fails once and is retried (B4 acceptance)", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const request = await (await userActor(alice, db)).sendFriendRequest(
          userCtx(alice, "r1"),
          bob,
        );
        const accepted = await (await userActor(bob, db)).acceptFriendRequest(
          userCtx(bob, "r2"),
          request.id,
        );

        class FailsOnce extends RoutingOutboxActor {
          failuresLeft = 1;
          protected override async deliver(row: ClaimedRow): Promise<void> {
            if (this.failuresLeft > 0) {
              this.failuresLeft -= 1;
              throw new Error("transient: sidecar refused the invocation");
            }
            await super.deliver(row);
          }
        }

        const flaky = await activate(
          createActor(FailsOnce, OUTBOX_ACTOR_ID, db),
        );
        expect(await flaky.drain(systemCtx("d1"))).toMatchObject({
          delivered: 0,
          retried: 1,
          dead: 0,
        });
        // Alice's row is still absent: the failure did not half-apply anything.
        expect(await friendPairs(db, [alice, bob])).toEqual(["u2→u1"]);

        // The retry is scheduled with backoff (§1.4); step over it.
        await db
          .update(outbox)
          .set({ runAfter: new Date(0) })
          .where(eq(outbox.id, accepted.outboxRowId));

        expect(await flaky.drain(systemCtx("d2"))).toMatchObject({
          delivered: 1,
        });
        expect(await friendPairs(db, [alice, bob])).toEqual(["u1→u2", "u2→u1"]);
      });
    });

    it("refuses confirmFriendship from a request ctx (§1.6)", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const actor = await userActor(alice, db);
        await expect(
          actor.confirmFriendship(userCtx(alice, "r"), { friendId: bob }),
        ).rejects.toThrow(ForbiddenError);
        await expect(
          actor.confirmFriendship(userCtx(bob, "r"), { friendId: bob }),
        ).rejects.toThrow(ForbiddenError);
        expect(await friendPairs(db, [alice, bob])).toEqual([]);
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* sendFriendRequest — the three rejections                                */
  /* ---------------------------------------------------------------------- */

  describe("sendFriendRequest rejections", () => {
    it("refuses yourself, an existing friend, and a pending recipient", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const carol = await seedPerson(db, "Carol");

        // (1) yourself — malformed input, not a state conflict.
        await expect(
          (await userActor(alice, db)).sendFriendRequest(
            userCtx(alice, "r"),
            alice,
          ),
        ).rejects.toThrow(ValidationError);

        // (2) an existing friend.
        await befriend(db, alice, bob);
        await expect(
          (await userActor(alice, db)).sendFriendRequest(
            userCtx(alice, "r"),
            bob,
          ),
        ).rejects.toThrow(ConflictError);
        // …and from the other side too, which is a different row set.
        await expect(
          (await userActor(bob, db)).sendFriendRequest(
            userCtx(bob, "r"),
            alice,
          ),
        ).rejects.toThrow(ConflictError);

        // (3) a recipient who already has a pending request from me.
        await (await userActor(alice, db)).sendFriendRequest(
          userCtx(alice, "r"),
          carol,
        );
        await expect(
          (await userActor(alice, db)).sendFriendRequest(
            userCtx(alice, "r"),
            carol,
          ),
        ).rejects.toThrow(ConflictError);
        // …and the mirror: Carol may not counter-request while mine is open.
        await expect(
          (await userActor(carol, db)).sendFriendRequest(
            userCtx(carol, "r"),
            alice,
          ),
        ).rejects.toThrow(ConflictError);

        expect(
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(friendRequests),
        ).toEqual([{ n: 1 }]);
      });
    });

    it("refuses an unknown user and a non-uuid", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const actor = await userActor(alice, db);
        await expect(
          actor.sendFriendRequest(
            userCtx(alice, "r"),
            "00000000-0000-4000-8000-00000000dead",
          ),
        ).rejects.toThrow(NotFoundError);
        await expect(
          actor.sendFriendRequest(userCtx(alice, "r"), "nope"),
        ).rejects.toThrow(ValidationError);
      });
    });

    it("cannot be sent on another user's behalf (owner/friend/stranger)", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const carol = await seedPerson(db, "Carol");
        await befriend(db, alice, bob);

        const alices = await userActor(alice, db);
        // friend
        await expect(
          alices.sendFriendRequest(userCtx(bob, "r"), carol),
        ).rejects.toThrow(ForbiddenError);
        // stranger
        await expect(
          alices.sendFriendRequest(userCtx(carol, "r"), bob),
        ).rejects.toThrow(ForbiddenError);
        // anonymous
        await expect(
          alices.sendFriendRequest(anonymousCtx("r"), carol),
        ).rejects.toThrow(ForbiddenError);
        // owner
        await expect(
          alices.sendFriendRequest(userCtx(alice, "r"), carol),
        ).resolves.toMatchObject({ recipientId: carol });
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* reject / remove                                                         */
  /* ---------------------------------------------------------------------- */

  describe("rejecting and removing", () => {
    it("lets the requester cancel their own request in one turn", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const request = await (await userActor(alice, db)).sendFriendRequest(
          userCtx(alice, "r"),
          bob,
        );

        const deleted = await (await userActor(alice, db)).rejectFriendRequest(
          userCtx(alice, "r"),
          request.id,
        );

        expect(deleted).toBe(true);
        expect(await db.select().from(friendRequests)).toEqual([]);
        // Nothing queued: the requester owns the row, so there is no other
        // side to ask.
        expect(
          await db
            .select()
            .from(outbox)
            .where(eq(outbox.method, "withdrawFriendRequest")),
        ).toEqual([]);
      });
    });

    it("routes a recipient's decline through the outbox", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const request = await (await userActor(alice, db)).sendFriendRequest(
          userCtx(alice, "r"),
          bob,
        );

        const deletedHere = await (
          await userActor(bob, db)
        ).rejectFriendRequest(userCtx(bob, "r"), request.id);

        // The recipient may not write `friend_requests.user_id = alice`.
        expect(deletedHere).toBe(false);
        expect(await db.select().from(friendRequests)).toHaveLength(1);

        const outboxActor = await drainer(db);
        expect(await outboxActor.drain(systemCtx("d"))).toMatchObject({
          delivered: 1,
        });
        expect(outboxActor.delivered[0]).toMatchObject({
          targetId: alice,
          method: "withdrawFriendRequest",
        });
        expect(await db.select().from(friendRequests)).toEqual([]);

        // Redelivery is a no-op. Scoped to this fixture's target for the same
        // reason as `removeFriendOtherSide` below: shared database.
        await db
          .update(outbox)
          .set({ status: "pending", runAfter: new Date(0) })
          .where(
            and(
              eq(outbox.method, "withdrawFriendRequest"),
              eq(outbox.targetId, alice),
            ),
          );
        const again = await drainer(db);
        await again.drain(systemCtx("d2"));
        expect(again.results).toEqual([false]);
      });
    });

    /**
     * **E2d, the read-your-own-writes acceptance.** This test used to assert
     * the opposite — `["u2→u1"]`, one row surviving until the outbox ran — and
     * it was right about the code and wrong about the requirement.
     *
     * `isFriend` matches *either* direction on purpose, so that surviving row
     * kept every read path in the system answering "friends" for as long as
     * delivery took (measured against the running stack at 1.5–1.9s, and
     * forever if `removeFriendOtherSide` dead-letters — target-stack's
     * fail-open note). The caller's own immediate reload is the case the
     * browser suite kept flaking on.
     *
     * So: zero rows before this call returns. The outbox row still goes out,
     * and what it now does is reload the *other* activation — see the next
     * assertion, and `removeFriendOtherSide`'s own doc comment.
     */
    it("removeFriend removes both rows in its own transaction (E2d: read-your-own-writes)", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        await befriend(db, alice, bob);
        expect(await friendPairs(db, [alice, bob])).toEqual(["u1→u2", "u2→u1"]);

        const alices = await userActor(alice, db);
        const removed = await alices.removeFriend(userCtx(alice, "r"), bob);
        expect(removed).toBe(true);

        // Both directions, before anything is drained. This is the assertion
        // the defect was about.
        expect(await friendPairs(db, [alice, bob])).toEqual([]);

        // …and the viewer's own next read agrees, which is what the UI does
        // the instant the mutation resolves.
        expect(
          nodes(await alices.friends(userCtx(alice, "r"), firstPage)),
        ).toEqual([]);

        // The mirror still travels, and is now a cache invalidation rather
        // than the delete that makes the removal true: it finds nothing left
        // to delete and says so.
        const outboxActor = await drainer(db);
        await outboxActor.drain(systemCtx("d"));
        expect(outboxActor.delivered[0]).toMatchObject({
          targetId: bob,
          method: "removeFriendOtherSide",
        });
        expect(outboxActor.results).toEqual([false]);
        expect(await friendPairs(db, [alice, bob])).toEqual([]);

        // …and a redelivery removes nothing further. Scoped to *this* fixture's
        // target: `outbox` is a real table in a shared database and other
        // suites (and the running stack) leave committed rows behind, so a
        // method-wide `UPDATE` resurrects somebody else's.
        await db
          .update(outbox)
          .set({ status: "pending", runAfter: new Date(0) })
          .where(
            and(
              eq(outbox.method, "removeFriendOtherSide"),
              eq(outbox.targetId, bob),
            ),
          );
        const again = await drainer(db);
        await again.drain(systemCtx("d2"));
        expect(again.results).toEqual([false]);
        expect(await friendPairs(db, [alice, bob])).toEqual([]);
      });
    });

    /**
     * **The fail-open hazard, closed** — target-stack §4's note that "a
     * dead-lettered `removeFriendOtherSide` leaves an unfriended person with
     * FRIENDS-visible access".
     *
     * Nothing is drained in this test *on purpose*: that models the outbox row
     * never being delivered at all. Before E2d, `friends(bob, alice)` survived,
     * `isFriend` matched it, and Bob kept a friend's view of Alice forever.
     * Now the access is gone the moment the mutation returns, so the delivery
     * that used to be load-bearing for security is load-bearing only for a
     * cache.
     *
     * Owner / friend / stranger on one viewer-dependent method: Alice may
     * always read her own list, Carol (still a friend) may, and Bob — who was
     * one until a moment ago — may not.
     */
    it("an undelivered removeFriendOtherSide no longer leaves FRIENDS access open", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const carol = await seedPerson(db, "Carol");
        const stranger = await seedPerson(db, "Stranger");
        await befriend(db, alice, bob);
        await befriend(db, alice, carol);

        // Bob can read Alice's friend list while they are friends.
        expect(
          nodes(
            await (await userActor(alice, db)).friends(
              userCtx(bob, "r-bob"),
              firstPage,
            ),
          ),
        ).toHaveLength(2);

        await (await userActor(alice, db)).removeFriend(
          userCtx(alice, "r"),
          bob,
        );

        // No drain. A fresh activation, so nothing is answering from a cache
        // this call happens to have invalidated.
        const alices = await userActor(alice, db);
        expect(
          nodes(await alices.friends(userCtx(alice, "r-owner"), firstPage)),
        ).toHaveLength(1);
        expect(
          nodes(await alices.friends(userCtx(carol, "r-friend"), firstPage)),
        ).toHaveLength(1);
        for (const outsider of [bob, stranger]) {
          await expect(
            alices.friends(userCtx(outsider, `r-${outsider}`), firstPage),
          ).rejects.toBeInstanceOf(ForbiddenError);
        }
      });
    });

    it("refuses to remove someone who is not a friend", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        await expect(
          (await userActor(alice, db)).removeFriend(userCtx(alice, "r"), bob),
        ).rejects.toThrow(NotFoundError);
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* A request id is not a capability                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * `services/api` always routes `acceptFriendRequest` / `rejectFriendRequest`
   * to the **viewer's own** actor, with the request id as a plain argument. So
   * the recipient check inside the method is the only thing standing between
   * a third party who has learned a request id and somebody else's
   * friendship: without it Carol, accepting Alice→Bob's request on her own
   * actor, inserts `friends(carol, alice)` and enqueues `confirmFriendship` to
   * Alice — whose actor then writes `friends(alice, carol)`, and Carol can see
   * Alice's FRIENDS-privacy cellars and tier lists without Alice ever having
   * agreed. Every accept/reject test above calls as the recipient or the
   * requester, so none of them noticed the check going missing (W4 mutant F2,
   * F4).
   */
  describe("a third party cannot act on someone else's request", () => {
    const outboxRowsFor = (db: DbOrTx, targetId: string) =>
      db.select().from(outbox).where(eq(outbox.targetId, targetId));

    it("refuses Carol accepting Alice→Bob's request, and writes nothing", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const carol = await seedPerson(db, "Carol");
        const request = await (await userActor(alice, db)).sendFriendRequest(
          userCtx(alice, "r"),
          bob,
        );

        await expect(
          (await userActor(carol, db)).acceptFriendRequest(
            userCtx(carol, "r"),
            request.id,
          ),
        ).rejects.toThrow(NotFoundError);

        expect(await friendPairs(db, [alice, bob, carol])).toEqual([]);
        expect(await outboxRowsFor(db, alice)).toEqual([]);
        // The request is untouched, and still Bob's to answer.
        expect(await db.select().from(friendRequests)).toHaveLength(1);
      });
    });

    it("refuses the requester accepting their own request, too", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const request = await (await userActor(alice, db)).sendFriendRequest(
          userCtx(alice, "r"),
          bob,
        );

        await expect(
          (await userActor(alice, db)).acceptFriendRequest(
            userCtx(alice, "r"),
            request.id,
          ),
        ).rejects.toThrow(NotFoundError);
        expect(await friendPairs(db, [alice, bob])).toEqual([]);
        expect(await outboxRowsFor(db, alice)).toEqual([]);
      });
    });

    it("refuses Carol rejecting Alice→Bob's request, and enqueues nothing", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const carol = await seedPerson(db, "Carol");
        const request = await (await userActor(alice, db)).sendFriendRequest(
          userCtx(alice, "r"),
          bob,
        );

        await expect(
          (await userActor(carol, db)).rejectFriendRequest(
            userCtx(carol, "r"),
            request.id,
          ),
        ).rejects.toThrow(NotFoundError);

        expect(await outboxRowsFor(db, alice)).toEqual([]);
        expect(await db.select().from(friendRequests)).toHaveLength(1);
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* The other side of a friendship is another actor KEY's row               */
  /* ---------------------------------------------------------------------- */

  /**
   * The regression tests for D8's bug, in B6's and B10's shape: **within one
   * activation**, a change made by a different `UserActor` *key* must be
   * visible.
   *
   * `friends(bob, alice)` and `friend_requests(bob, alice)` pass the
   * table-level single-writer rule — `UserActor` is the sole writer class of
   * both tables — but they are written by `UserActor(bob)`, not by
   * `UserActor(alice)`. Caching them in Alice's aggregate is therefore the same
   * staleness `RecipeGroupActor` and `BarcodeActor` had, one granularity down:
   * nothing in Alice's turn invalidates them, and `reload()` after her own
   * write faithfully re-reads a row that is about to disappear.
   *
   * Everything below happens on ONE activation on purpose, and the other side
   * is written by the other actor directly — never back through the actor under
   * test.
   */
  describe("rows another UserActor key writes are read fresh, not cached", () => {
    it("stops believing in a friendship the moment both rows are gone", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        await befriend(db, alice, bob);

        // ONE activation, held across everything that follows.
        const alices = await userActor(alice, db);
        expect(
          nodes(await alices.friends(userCtx(alice, "r"), firstPage)),
        ).toHaveLength(1);

        // Alice drops the friendship. Since E2d both rows go in this
        // transaction, so there is no "genuinely still friends" interval left
        // for the reload below to read.
        expect(await alices.removeFriend(userCtx(alice, "r"), bob)).toBe(true);
        expect(await friendPairs(db, [alice, bob])).toEqual([]);

        // Draining changes nothing here — the delete already happened. What it
        // is for is Bob's activation, whose `ownFriends` cache is now the only
        // stale copy in the system.
        const outboxActor = await drainer(db);
        await outboxActor.drain(systemCtx("d"));
        expect(await friendPairs(db, [alice, bob])).toEqual([]);

        // The database says zero rows, so this actor must too — indefinitely,
        // not "once it happens to reactivate". Before the fix `friendRows` was
        // cached from `loadAggregate` in both directions, so `reload()` inside
        // `removeFriend` put `friends(bob, alice)` straight back and Alice kept
        // believing in it forever.
        expect(
          nodes(await alices.friends(userCtx(alice, "r"), firstPage)),
        ).toEqual([]);

        // …which is exactly what D8 hit: the friend list said none and
        // `sendFriendRequest` still said "you are already friends".
        await expect(
          alices.sendFriendRequest(userCtx(alice, "r"), bob),
        ).resolves.toMatchObject({ recipientId: bob, status: "PENDING" });
      });
    });

    it("sees a friendship the other side completed after this activation", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");

        // Activated while there is no friendship at all.
        const alices = await userActor(alice, db);
        expect(
          nodes(await alices.friends(userCtx(alice, "r"), firstPage)),
        ).toEqual([]);

        // Bob's actor writes `friends(bob, alice)` — B4's deliberately
        // two-directional read means Alice is a friend from that row alone,
        // before the outbox delivers her own half.
        const request = await alices.sendFriendRequest(
          userCtx(alice, "r"),
          bob,
        );
        await (await userActor(bob, db)).acceptFriendRequest(
          userCtx(bob, "r"),
          request.id,
        );
        expect(await friendPairs(db, [alice, bob])).toEqual(["u2→u1"]);

        // Same activation, no reload() in the test.
        expect(
          nodes(await alices.friends(userCtx(alice, "r"), firstPage)),
        ).toMatchObject([{ profile: { id: bob } }]);
        await expect(
          alices.sendFriendRequest(userCtx(alice, "r"), bob),
        ).rejects.toMatchObject({ reason: "ALREADY_FRIENDS" });
      });
    });

    it("drops an incoming request the sender withdrew mid-activation", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const request = await (await userActor(bob, db)).sendFriendRequest(
          userCtx(bob, "r"),
          alice,
        );

        // ONE activation, started while Bob's request is open.
        const alices = await userActor(alice, db);
        expect(
          nodes(
            await alices.friendRequests(
              userCtx(alice, "r"),
              "INCOMING",
              firstPage,
            ),
          ),
        ).toMatchObject([{ requesterId: bob, direction: "INCOMING" }]);

        // Bob cancels his own row. `friend_requests.user_id` is Bob, so this is
        // a write by another actor KEY — Alice has nothing to invalidate on.
        expect(
          await (await userActor(bob, db)).rejectFriendRequest(
            userCtx(bob, "r"),
            request.id,
          ),
        ).toBe(true);
        expect(await db.select().from(friendRequests)).toEqual([]);

        // Same activation. Before the fix Alice listed a request that no longer
        // existed, and `sendFriendRequest` refused with "bob has already sent
        // you a friend request" forever.
        expect(
          nodes(
            await alices.friendRequests(
              userCtx(alice, "r"),
              "INCOMING",
              firstPage,
            ),
          ),
        ).toEqual([]);
        await expect(
          alices.sendFriendRequest(userCtx(alice, "r"), bob),
        ).resolves.toMatchObject({ recipientId: bob });
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* The typed discriminator (D8)                                            */
  /* ---------------------------------------------------------------------- */

  /**
   * All four `sendFriendRequest` rejections share one `code` between them —
   * three `CONFLICT`s and a `VALIDATION` — so a client that wants to offer
   * "Accept their request" instead of "Send request" was substring-matching the
   * English message. `reason` is what it switches on instead.
   */
  it("discriminates sendFriendRequest's four rejections by `reason`", async () => {
    await withUserDb(async (db) => {
      const alice = await seedPerson(db, "Alice");
      const bob = await seedPerson(db, "Bob");
      const carol = await seedPerson(db, "Carol");
      const dave = await seedPerson(db, "Dave");
      await befriend(db, alice, bob);
      await (await userActor(alice, db)).sendFriendRequest(
        userCtx(alice, "r"),
        carol,
      );
      await (await userActor(dave, db)).sendFriendRequest(
        userCtx(dave, "r"),
        alice,
      );

      const rejection = async (target: string) => {
        try {
          await (await userActor(alice, db)).sendFriendRequest(
            userCtx(alice, "r"),
            target,
          );
        } catch (error) {
          const typed = error as ActorError;
          return { code: typed.code, reason: typed.reason };
        }
        throw new Error(`sendFriendRequest(${target}) did not reject`);
      };

      expect(await rejection(alice)).toEqual({
        code: "VALIDATION",
        reason: "CANNOT_FRIEND_SELF",
      });
      expect(await rejection(bob)).toEqual({
        code: "CONFLICT",
        reason: "ALREADY_FRIENDS",
      });
      expect(await rejection(carol)).toEqual({
        code: "CONFLICT",
        reason: "FRIEND_REQUEST_ALREADY_SENT",
      });
      expect(await rejection(dave)).toEqual({
        code: "CONFLICT",
        reason: "FRIEND_REQUEST_ALREADY_RECEIVED",
      });

      // Postgres reads an uppercase uuid as the same row, so an uppercase
      // copy must meet every one of the same four checks. It used to pass all
      // of them — the self check compared strings — and insert.
      expect(await rejection(alice.toUpperCase())).toEqual({
        code: "VALIDATION",
        reason: "CANNOT_FRIEND_SELF",
      });
      expect(await rejection(bob.toUpperCase())).toEqual({
        code: "CONFLICT",
        reason: "ALREADY_FRIENDS",
      });
      expect(await rejection(carol.toUpperCase())).toEqual({
        code: "CONFLICT",
        reason: "FRIEND_REQUEST_ALREADY_SENT",
      });
      expect(await rejection(dave.toUpperCase())).toEqual({
        code: "CONFLICT",
        reason: "FRIEND_REQUEST_ALREADY_RECEIVED",
      });
      // Nothing was inserted by any of the four: the two seeded requests only.
      const requests = await db
        .select({
          userId: friendRequests.userId,
          friendId: friendRequests.friendId,
        })
        .from(friendRequests);
      expect(requests.map((r) => `${r.userId}->${r.friendId}`).sort()).toEqual(
        [`${alice}->${carol}`, `${dave}->${alice}`].sort(),
      );

      // Errors that need no discriminator still carry none — `reason` is
      // additive, so a client may not assume every failure has one.
      expect(await rejection("00000000-0000-4000-8000-00000000dead")).toEqual({
        code: "NOT_FOUND",
        reason: null,
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Viewer-dependent reads: owner / friend / stranger (§1.6)                */
  /* ---------------------------------------------------------------------- */

  describe("getProfile — owner, friend, stranger", () => {
    it("shows everyone the profile and only the owner the email", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const carol = await seedPerson(db, "Carol");
        await befriend(db, alice, bob);
        const actor = await userActor(alice, db);

        const owner = await actor.getProfile(userCtx(alice, "r"));
        expect(owner).toMatchObject({ id: alice, displayName: "Alice" });
        expect(owner.email).not.toBeNull();

        const friend = await actor.getProfile(userCtx(bob, "r"));
        expect(friend).toMatchObject({ displayName: "Alice", email: null });

        const stranger = await actor.getProfile(userCtx(carol, "r"));
        expect(stranger).toMatchObject({ displayName: "Alice", email: null });

        // An admin bypasses (§1.6) — `isOwner` covers admin and system.
        expect(
          (await actor.getProfile(adminCtx("root", "r"))).email,
        ).not.toBeNull();

        // Anonymous is not "any signed-in user".
        await expect(actor.getProfile(anonymousCtx("r"))).rejects.toThrow(
          ForbiddenError,
        );
      });
    });

    it("lets only the owner update a profile", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const carol = await seedPerson(db, "Carol");
        await befriend(db, alice, bob);
        const actor = await userActor(alice, db);

        for (const viewer of [bob, carol]) {
          await expect(
            actor.updateProfile(userCtx(viewer, "r"), {
              displayName: "Mallory",
            }),
          ).rejects.toThrow(ForbiddenError);
        }
        await expect(
          actor.updateProfile(userCtx(alice, "r"), { displayName: "  " }),
        ).rejects.toThrow(ValidationError);
        // W4 security F2: a display name is public and an address is not.
        for (const displayName of [
          "alice@example.com",
          "Alice <alice@example.com>",
        ]) {
          await expect(
            actor.updateProfile(userCtx(alice, "r"), { displayName }),
          ).rejects.toThrow(/must not be an email address/);
        }
        await expect(
          actor.updateProfile(userCtx(alice, "r"), {
            avatarUrl: "javascript:x",
          }),
        ).rejects.toThrow(ValidationError);
        await expect(
          actor.updateProfile(userCtx(alice, "r"), { locale: "english" }),
        ).rejects.toThrow(ValidationError);

        const updated = await actor.updateProfile(userCtx(alice, "r"), {
          displayName: "Alice B",
          avatarUrl: "https://example.test/a.png",
        });
        expect(updated).toMatchObject({
          displayName: "Alice B",
          avatarUrl: "https://example.test/a.png",
        });
      });
    });
  });

  describe("friends list — owner, friend, stranger", () => {
    it("is visible to the owner and their friends, and to nobody else", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const carol = await seedPerson(db, "Carol");
        await befriend(db, alice, bob);
        const actor = await userActor(alice, db);

        expect(
          nodes(await actor.friends(userCtx(alice, "r"), firstPage)),
        ).toHaveLength(1);
        expect(
          nodes(await actor.friends(userCtx(bob, "r"), firstPage)),
        ).toHaveLength(1);
        await expect(
          actor.friends(userCtx(carol, "r"), firstPage),
        ).rejects.toThrow(ForbiddenError);
        await expect(
          actor.friends(anonymousCtx("r"), firstPage),
        ).rejects.toThrow(ForbiddenError);
      });
    });

    it("keeps friend requests to the owner alone", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const carol = await seedPerson(db, "Carol");
        await befriend(db, alice, bob);
        await (await userActor(alice, db)).sendFriendRequest(
          userCtx(alice, "r"),
          carol,
        );

        const actor = await userActor(alice, db);
        expect(
          nodes(
            await actor.friendRequests(
              userCtx(alice, "r"),
              "OUTGOING",
              firstPage,
            ),
          ),
        ).toMatchObject([{ recipientId: carol, direction: "OUTGOING" }]);
        // Even a friend cannot read the inbox.
        await expect(
          actor.friendRequests(userCtx(bob, "r"), "OUTGOING", firstPage),
        ).rejects.toThrow(ForbiddenError);
        await expect(
          actor.friendRequests(userCtx(carol, "r"), "INCOMING", firstPage),
        ).rejects.toThrow(ForbiddenError);

        // Carol sees the same row as INCOMING on her own actor.
        expect(
          nodes(
            await (await userActor(carol, db)).friendRequests(
              userCtx(carol, "r"),
              "INCOMING",
              firstPage,
            ),
          ),
        ).toMatchObject([{ requesterId: alice, direction: "INCOMING" }]);
      });
    });

    /**
     * The reason `loadAggregate` reads both directions. Between step 1 and
     * step 2 of §1.7 only the recipient's row exists, and a friend list or an
     * `isFriend` that looked at one direction would report "not friends" for
     * as long as the outbox took.
     */
    it("reads a half-delivered acceptance as friends from both sides", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const request = await (await userActor(alice, db)).sendFriendRequest(
          userCtx(alice, "r"),
          bob,
        );
        await (await userActor(bob, db)).acceptFriendRequest(
          userCtx(bob, "r"),
          request.id,
        );
        // Deliberately no drain: only `friends(bob, alice)` exists.
        expect(await friendPairs(db, [alice, bob])).toEqual(["u2→u1"]);

        const alices = await userActor(alice, db);
        expect(
          nodes(await alices.friends(userCtx(alice, "r"), firstPage)),
        ).toMatchObject([{ profile: { id: bob } }]);
        // …and Bob can already read Alice's friend list, because the policy
        // question "are these two friends" is answered by either row.
        expect(
          nodes(await alices.friends(userCtx(bob, "r"), firstPage)),
        ).toHaveLength(1);
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Favorites                                                               */
  /* ---------------------------------------------------------------------- */

  describe("favorites are owner-only", () => {
    it("toggles on and off, and nobody else can read or mutate them", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const carol = await seedPerson(db, "Carol");
        await befriend(db, alice, bob);
        const teaId = await seedTea(db, alice);
        const ref = { type: "TEA", id: teaId } as const;

        const actor = await userActor(alice, db);
        expect(await actor.toggleFavorite(userCtx(alice, "r"), ref)).toEqual({
          ref,
          favorited: true,
        });
        expect(
          nodes(await actor.favorites(userCtx(alice, "r"), firstPage)),
        ).toEqual([ref]);

        // A second toggle removes it — and `item_favorites` has no unique
        // constraint for sake or tea, so this is the actor's own guard.
        expect(await actor.toggleFavorite(userCtx(alice, "r"), ref)).toEqual({
          ref,
          favorited: false,
        });
        expect(
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(itemFavorites)
            .where(eq(itemFavorites.userId, alice)),
        ).toEqual([{ n: 0 }]);
        await actor.toggleFavorite(userCtx(alice, "r"), ref);

        // friend, stranger, anonymous — read and write alike.
        for (const viewer of [
          userCtx(bob, "r"),
          userCtx(carol, "r"),
          anonymousCtx("r"),
        ]) {
          await expect(actor.favorites(viewer, firstPage)).rejects.toThrow(
            ForbiddenError,
          );
          await expect(actor.toggleFavorite(viewer, ref)).rejects.toThrow(
            ForbiddenError,
          );
        }
        // Nothing the refused calls did leaked through.
        expect(
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(itemFavorites)
            .where(eq(itemFavorites.userId, alice)),
        ).toEqual([{ n: 1 }]);
      });
    });

    /**
     * A7c (7). `Item.isFavorite` draws one star per card, so the answer has to
     * come back for a whole page in one call — see `favoriteStates`' own doc
     * for why N calls would be N *serial* turns.
     */
    it("favoriteStates answers a whole page in one call, and stays owner-only", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const favorited = await seedTea(db, alice);
        const notFavorited = await seedTea(db, alice);
        const actor = await userActor(alice, db);
        await actor.toggleFavorite(userCtx(alice, "r"), {
          type: "TEA",
          id: favorited,
        });

        expect(
          await actor.favoriteStates(userCtx(alice, "r"), [
            { type: "TEA", id: notFavorited },
            { type: "TEA", id: favorited },
          ]),
        ).toEqual([`tea:${favorited}`]);

        // An item that does not exist is simply not favourited — this is a
        // read, so it must not 404 the page it is drawn on.
        expect(
          await actor.favoriteStates(userCtx(alice, "r"), [
            { type: "WINE", id: "00000000-0000-4000-8000-00000000dead" },
          ]),
        ).toEqual([]);

        expect(await actor.favoriteStates(userCtx(alice, "r"), [])).toEqual([]);

        for (const viewer of [userCtx(bob, "r"), anonymousCtx("r")]) {
          await expect(
            actor.favoriteStates(viewer, [{ type: "TEA", id: favorited }]),
          ).rejects.toThrow(ForbiddenError);
        }
        await expect(
          actor.favoriteStates(userCtx(alice, "r"), [
            { type: "COCKTAIL" as never, id: favorited },
          ]),
        ).rejects.toThrow(ValidationError);
      });
    });

    /**
     * UI parity G6. The count spans every user's favourites — rows this actor
     * does not cache — so it must be read fresh, and a page must cost one call.
     */
    it("favoriteCounts counts every user's favourites, aligned to refs, fresh", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const carol = await seedPerson(db, "Carol");
        const popular = await seedTea(db, alice);
        const once = await seedTea(db, alice);
        const never = await seedTea(db, alice);
        const actor = await userActor(alice, db);

        for (const [person, ids] of [
          [alice, [popular]],
          [bob, [popular, once]],
          [carol, [popular]],
        ] as const) {
          const theirs = await userActor(person, db);
          for (const id of ids) {
            await theirs.toggleFavorite(userCtx(person, "r"), {
              type: "TEA",
              id,
            });
          }
        }

        const refs = [
          { type: "TEA" as const, id: never },
          { type: "TEA" as const, id: popular.toUpperCase() },
          { type: "TEA" as const, id: once },
          { type: "WINE" as const, id: "00000000-0000-4000-8000-00000000dead" },
        ];
        expect(await actor.favoriteCounts(userCtx(alice, "r"), refs)).toEqual([
          0, 3, 1, 0,
        ]);

        // Fresh, not cached: Bob's un-favourite shows up on Alice's very
        // next call, though her activation never reloaded.
        await (await userActor(bob, db)).toggleFavorite(userCtx(bob, "r"), {
          type: "TEA",
          id: popular,
        });
        expect(
          await actor.favoriteCounts(userCtx(alice, "r"), [
            { type: "TEA", id: popular },
          ]),
        ).toEqual([2]);

        expect(await actor.favoriteCounts(userCtx(alice, "r"), [])).toEqual([]);
        for (const viewer of [userCtx(bob, "r"), anonymousCtx("r")]) {
          await expect(
            actor.favoriteCounts(viewer, [{ type: "TEA", id: popular }]),
          ).rejects.toThrow(ForbiddenError);
        }
        await expect(
          actor.favoriteCounts(userCtx(alice, "r"), [
            { type: "COCKTAIL" as never, id: popular },
          ]),
        ).rejects.toThrow(ValidationError);
      });
    });

    it("refuses an unknown item and a bad ref", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const actor = await userActor(alice, db);
        await expect(
          actor.toggleFavorite(userCtx(alice, "r"), {
            type: "TEA",
            id: "00000000-0000-4000-8000-00000000dead",
          }),
        ).rejects.toThrow(NotFoundError);
        await expect(
          actor.toggleFavorite(userCtx(alice, "r"), {
            type: "COCKTAIL" as never,
            id: "00000000-0000-4000-8000-00000000dead",
          }),
        ).rejects.toThrow(ValidationError);
      });
    });

    /**
     * Review W4 #3. The uuid check is case-insensitive and Postgres reads both
     * spellings as one row, but the toggle's lookup is `===` against the
     * cached (lowercase) rows: an uppercase id used to miss the existing
     * favourite, fall through to the insert, and fail as a raw 23505 on
     * `item_favorites_user_id_tea_id_key` instead of un-favouriting.
     */
    it("treats an uppercase item id as the same item", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const teaId = await seedTea(db, alice);
        const upper = { type: "TEA", id: teaId.toUpperCase() } as const;
        const actor = await userActor(alice, db);

        expect(
          await actor.toggleFavorite(userCtx(alice, "r"), {
            type: "TEA",
            id: teaId,
          }),
        ).toMatchObject({ favorited: true });
        expect(
          await actor.favoriteStates(userCtx(alice, "r"), [upper]),
        ).toEqual([`tea:${teaId}`]);
        // The answer names the canonical id, not the spelling it was given.
        expect(await actor.toggleFavorite(userCtx(alice, "r"), upper)).toEqual({
          ref: { type: "TEA", id: teaId },
          favorited: false,
        });
        expect(
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(itemFavorites)
            .where(eq(itemFavorites.userId, alice)),
        ).toEqual([{ n: 0 }]);
      });
    });
  });

  describe("client-supplied ids are compared in their canonical spelling", () => {
    it("removes a friend named by an uppercase id, and targets the canonical key", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        await befriend(db, alice, bob);

        expect(
          await (await userActor(alice, db)).removeFriend(
            userCtx(alice, "r"),
            bob.toUpperCase(),
          ),
        ).toBe(true);
        expect(await friendPairs(db, [alice, bob])).toEqual([]);
        // `targetId` is an actor key: it has to be the lowercase one, or the
        // delivery activates a second `UserActor` for the same user.
        const queued = await db
          .select({ targetId: outbox.targetId })
          .from(outbox)
          .where(
            and(
              eq(outbox.method, "removeFriendOtherSide"),
              eq(outbox.status, "pending"),
            ),
          );
        expect(queued).toEqual([{ targetId: bob }]);
      });
    });

    it("accepts a request named by an uppercase id", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const request = await (await userActor(alice, db)).sendFriendRequest(
          userCtx(alice, "r"),
          bob,
        );
        const accepted = await (await userActor(bob, db)).acceptFriendRequest(
          userCtx(bob, "r"),
          request.id.toUpperCase(),
        );
        expect(accepted).toMatchObject({
          requestId: request.id,
          friendId: alice,
          friendRowInserted: true,
        });
      });
    });

    it("finds a place interaction named by an uppercase place id", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const placeId = await seedPlace(db);
        const actor = await userActor(alice, db);
        await actor.recordPlaceInteraction(userCtx(alice, "r"), {
          placeId: placeId.toUpperCase(),
          isVisited: true,
        });
        expect(
          await actor.placeInteraction(
            userCtx(alice, "r"),
            placeId.toUpperCase(),
          ),
        ).toMatchObject({ placeId, visitCount: 1 });
      });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Place interactions                                                      */
  /* ---------------------------------------------------------------------- */

  describe("place interactions are owner-only and count visits server-side", () => {
    it("computes visit_count from the visited transition, never from input", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const placeId = await seedPlace(db);
        const actor = await userActor(alice, db);
        const ctx = userCtx(alice, "r");

        const saved = await actor.recordPlaceInteraction(ctx, {
          placeId,
          wantToVisit: true,
        });
        expect(saved).toMatchObject({
          placeId,
          wantToVisit: true,
          isVisited: false,
          visitCount: 0,
          lastVisitedAt: null,
        });

        const visited = await actor.recordPlaceInteraction(ctx, {
          placeId,
          isVisited: true,
        });
        expect(visited.visitCount).toBe(1);
        expect(visited.lastVisitedAt).not.toBeNull();
        // Fields not named in the input are preserved, not reset.
        expect(visited.wantToVisit).toBe(true);

        // Idempotent: saying "visited" again is not a second visit.
        expect(
          (
            await actor.recordPlaceInteraction(ctx, {
              placeId,
              isVisited: true,
            })
          ).visitCount,
        ).toBe(1);
        // Un-visiting keeps the history…
        expect(
          (
            await actor.recordPlaceInteraction(ctx, {
              placeId,
              isVisited: false,
            })
          ).visitCount,
        ).toBe(1);
        // …and re-visiting counts again.
        expect(
          (
            await actor.recordPlaceInteraction(ctx, {
              placeId,
              isVisited: true,
            })
          ).visitCount,
        ).toBe(2);

        // §2.1: the client cannot supply the count. There is no input field to
        // supply it *with* — this is the type-level proof, and the row proves
        // the runtime half.
        await actor.recordPlaceInteraction(
          {
            ...ctx,
          } as Ctx,
          {
            placeId,
            // Cast through `unknown`: there is no `visitCount` field to set, and
            // that is exactly the point — this proves the runtime ignores it too.
            ...({ visitCount: 9_999 } as unknown as Record<string, never>),
          },
        );
        const [row] = await db
          .select()
          .from(userPlaceInteractions)
          .where(eq(userPlaceInteractions.userId, alice));
        expect(row?.visitCount).toBe(2);

        expect(await actor.placeInteraction(ctx, placeId)).toMatchObject({
          visitCount: 2,
        });
        expect(
          nodes(await actor.placeInteractions(ctx, firstPage)),
        ).toHaveLength(1);
      });
    });

    it("refuses another user's interactions, friend or stranger", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const carol = await seedPerson(db, "Carol");
        await befriend(db, alice, bob);
        const placeId = await seedPlace(db);
        const actor = await userActor(alice, db);
        await actor.recordPlaceInteraction(userCtx(alice, "r"), {
          placeId,
          isVisited: true,
          rating: 5,
          notes: "private",
        });

        for (const viewer of [
          userCtx(bob, "r"),
          userCtx(carol, "r"),
          anonymousCtx("r"),
        ]) {
          await expect(
            actor.placeInteractions(viewer, firstPage),
          ).rejects.toThrow(ForbiddenError);
          await expect(actor.placeInteraction(viewer, placeId)).rejects.toThrow(
            ForbiddenError,
          );
          await expect(
            actor.recordPlaceInteraction(viewer, { placeId, rating: 1 }),
          ).rejects.toThrow(ForbiddenError);
        }

        const [row] = await db
          .select()
          .from(userPlaceInteractions)
          .where(eq(userPlaceInteractions.userId, alice));
        expect(row).toMatchObject({ rating: 5, notes: "private" });
        // …and no row was created for anybody else.
        expect(
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(userPlaceInteractions),
        ).toEqual([{ n: 1 }]);
      });
    });

    it("placeInteractionsFor (UI parity G16) answers a page of places from memory, owner only", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        await befriend(db, alice, bob);
        const rated = await seedPlace(db);
        const saved = await seedPlace(db);
        const untouched = await seedPlace(db);
        const actor = await userActor(alice, db);
        const ctx = userCtx(alice, "r");
        await actor.recordPlaceInteraction(ctx, {
          placeId: rated,
          isVisited: true,
          rating: 4,
        });
        await actor.recordPlaceInteraction(ctx, {
          placeId: saved,
          isFavorite: true,
        });

        const answer = await actor.placeInteractionsFor(ctx, [
          untouched,
          saved,
          rated.toUpperCase(),
          saved,
        ]);
        // The matching subset, in the order asked, each place once; a place
        // never touched is absent rather than null.
        expect(answer.map((row) => row.placeId)).toEqual([saved, rated]);
        expect(answer[1]).toMatchObject({ rating: 4, isVisited: true });
        expect(await actor.placeInteractionsFor(ctx, [])).toEqual([]);

        // Where you have been is not friends-visible.
        for (const viewer of [userCtx(bob, "r"), anonymousCtx("r")]) {
          await expect(
            actor.placeInteractionsFor(viewer, [rated]),
          ).rejects.toThrow(ForbiddenError);
        }
        await expect(
          actor.placeInteractionsFor(ctx, ["not-a-uuid"]),
        ).rejects.toThrow(ValidationError);
        await expect(
          actor.placeInteractionsFor(
            ctx,
            Array.from({ length: 101 }, () => crypto.randomUUID()),
          ),
        ).rejects.toThrow(ValidationError);
      });
    });

    it("validates rating and place existence", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const placeId = await seedPlace(db);
        const actor = await userActor(alice, db);
        const ctx = userCtx(alice, "r");
        await expect(
          actor.recordPlaceInteraction(ctx, { placeId, rating: 9 }),
        ).rejects.toThrow(ValidationError);
        await expect(
          actor.recordPlaceInteraction(ctx, {
            placeId: "00000000-0000-4000-8000-00000000dead",
          }),
        ).rejects.toThrow(NotFoundError);
      });
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Static guard — §2.1's "no AI or external call inside a UserActor turn"      */
/* -------------------------------------------------------------------------- */

describe("UserActor makes no external call (§2.1, B4 acceptance)", () => {
  const source = readFileSync(
    new URL("./user-actor.ts", import.meta.url),
    "utf8",
  );
  // Comments quote the rule, so they would trip a naive grep.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("never calls fetch, the sidecar, or an AI provider", () => {
    for (const forbidden of [
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bnode:https?\b/,
      /invokeActorMethod/,
      /\binternal\s*\(/,
      /registerReminder/,
      /generateContent|generateEmbeddings/,
    ]) {
      expect(
        forbidden.test(code),
        `${forbidden} appears in user-actor.ts`,
      ).toBe(false);
    }
  });

  /**
   * The import list is the durable half: a `fetch` can arrive through any
   * dependency, so the rule is enforced on what this module is allowed to
   * depend on rather than on what it happens to call today.
   */
  it("imports only the database, contracts, policy and its own lib", () => {
    const specifiers = [...code.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    const allowed = new Set([
      "@cellar-assistant/contracts",
      "@cellar-assistant/db",
      "@cellar-assistant/db/orm",
      "@cellar-assistant/policy",
      "@dapr/dapr",
      "../lib/actor-base.ts",
      "../lib/db.ts",
      "../lib/delivery.ts",
      "../lib/guards.ts",
      // Pure: the item arcs and tables, derived from the Drizzle schema. Both
      // are guarded import by import in `no-external-calls.test.ts`.
      "../lib/item-arcs.ts",
      "../lib/item-bindings.ts",
      "../lib/outbox.ts",
      "../lib/outbox-targets.ts",
      "../lib/profile-store.ts",
      // Pure: validates a uuid and returns its canonical (lowercase) spelling.
      "../lib/uuid.ts",
      // Pure: the display-name rule (a regex, `node:crypto` for a handle).
      // Guarded import by import in `no-external-calls.test.ts`.
      "../auth/display-name.ts",
    ]);
    expect(
      specifiers.filter((s) => s !== undefined && !allowed.has(s)),
    ).toEqual([]);
  });
});
