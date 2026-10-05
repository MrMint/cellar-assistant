/**
 * `FriendsCollectionActor` — C3 (§2.2, §1.5, §1.7).
 *
 * Three things worth pinning: the both-directions read that B4's outcome note
 * requires does **not** list a friend twice once both rows exist; a friendship
 * mid-handshake (only one row written, the outbox not yet delivered) is already
 * visible from both sides; and request direction is computed relative to the
 * viewer rather than stored.
 */
import { ForbiddenError, pageArgs, userCtx } from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import { seedFriendship } from "../lib/search-testing.ts";
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
});
