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
  NO_AI_CAPABILITIES,
  NotFoundError,
  PROFILE_NOT_SHARED,
  pageArgs,
  parseInviteToken,
  systemCtx,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import {
  files,
  friendInvites,
  friendRequests,
  friends,
  itemFavorites,
  outbox,
  places,
  recipes,
  teas,
  userPlaceInteractions,
  wantToTry,
} from "@cellar-assistant/db";
import { and, eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import { setAiCapabilities } from "../lib/ai/capabilities.ts";
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
    count: async ({ term, excludeIds }) => {
      const excluded = new Set(excludeIds);
      return [...rows.values()].filter(
        (row) =>
          !excluded.has(row.id) &&
          row.displayName.toLowerCase().includes(term.toLowerCase()),
      ).length;
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
        ...(patch.avatarFileId === undefined
          ? {}
          : { avatarFileId: patch.avatarFileId }),
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
    avatarFileId: null,
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

const seedRecipe = async (db: DbOrTx, createdById: string): Promise<string> => {
  const [row] = await db
    .insert(recipes)
    // X15: PUBLIC, the pre-D22 catalog these tests describe.
    .values({
      name: `Recipe ${Date.now()}`,
      type: "cocktail",
      createdById,
      privacy: "PUBLIC",
    })
    .returning({ id: recipes.id });
  if (row === undefined) throw new Error("seedRecipe: no row");
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

/** A uuid no `user` row has — `crypto.randomUUID`, without the import. */
const randomUUIDLike = (): string => globalThis.crypto.randomUUID();

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

  describe("no account-existence oracle (leftovers 5, L6, L41)", () => {
    /** What a refused turn says: the class, the code and the exact bytes. */
    const refusal = async (turn: () => Promise<unknown>) => {
      try {
        await turn();
      } catch (error) {
        return {
          name: (error as Error).constructor.name,
          code: (error as { code?: unknown }).code,
          message: (error as Error).message,
        };
      }
      throw new Error("the turn was not refused");
    };
    const expected = {
      name: "NotFoundError",
      code: "NOT_FOUND",
      message: PROFILE_NOT_SHARED,
    };

    it("answers a missing id and a malformed id with the same error, naming neither", async () => {
      await withUserDb(async (db) => {
        const viewer = await seedPerson(db, "Viewer");
        const ctx = userCtx(viewer, "r");
        const missingId = "00000000-0000-4000-8000-00000000abcd";
        const missing = await userActor(missingId, db);
        const malformed = await userActor("not-a-uuid", db);

        const viaMissing = await refusal(() => missing.getProfile(ctx));
        const viaMalformed = await refusal(() => malformed.getProfile(ctx));
        expect(viaMissing).toEqual(expected);
        expect(viaMalformed).toEqual(viaMissing);
        // Dapr runs the pre-turn guard first; a malformed key is refused
        // there, and in the same bytes.
        expect(await refusal(() => malformed.onActorMethodPre())).toEqual(
          expected,
        );
        expect(viaMissing.message).not.toContain(missingId);
      });
    });

    it("answers an existing user's profile to any signed-in viewer (nobody is hidden yet)", async () => {
      await withUserDb(async (db) => {
        const viewer = await seedPerson(db, "Viewer");
        const other = await seedPerson(db, "Other");
        const profile = await (await userActor(other, db)).getProfile(
          userCtx(viewer, "r"),
        );
        expect(profile).toMatchObject({ id: other, displayName: "Other" });
      });
    });

    it("refuses an anonymous viewer the same way whether or not the id names someone", async () => {
      await withUserDb(async (db) => {
        const other = await seedPerson(db, "Other");
        const anon = anonymousCtx("r");
        const existing = await refusal(async () =>
          (await userActor(other, db)).getProfile(anon),
        );
        const missing = await refusal(async () =>
          (
            await userActor("00000000-0000-4000-8000-00000000abce", db)
          ).getProfile(anon),
        );
        expect(existing.name).toBe("ForbiddenError");
        expect(missing).toEqual(existing);
      });
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

  describe("friend invites (X17)", () => {
    const secretOf = (token: string): string =>
      parseInviteToken(token)?.secret ?? "";

    it("mints one invite on first use, returns it again, and is self only", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const actor = await userActor(alice, db);

        expect(await actor.friendInvite(userCtx(alice, "r"))).toBeNull();
        const first = await actor.ensureFriendInvite(userCtx(alice, "r"));
        const again = await actor.ensureFriendInvite(userCtx(alice, "r"));
        expect(again.token).toBe(first.token);
        expect(parseInviteToken(first.token)?.inviterId).toBe(alice);
        expect((await actor.friendInvite(userCtx(alice, "r")))?.token).toBe(
          first.token,
        );

        for (const ctx of [userCtx(bob, "r"), anonymousCtx("r")]) {
          await expect(actor.friendInvite(ctx)).rejects.toThrow(ForbiddenError);
          await expect(actor.ensureFriendInvite(ctx)).rejects.toThrow(
            ForbiddenError,
          );
          await expect(actor.resetFriendInvite(ctx)).rejects.toThrow(
            ForbiddenError,
          );
        }
      });
    });

    it("previews to anyone holding the link, and says where they stand", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const carol = await seedPerson(db, "Carol");
        await befriend(db, alice, carol);
        const actor = await userActor(alice, db);
        const { token } = await actor.ensureFriendInvite(userCtx(alice, "r"));
        const secret = secretOf(token);

        const statusFor = async (ctx: Ctx) =>
          (await (await userActor(alice, db)).previewFriendInvite(ctx, secret))
            .status;
        expect(await statusFor(anonymousCtx("r"))).toBe("SIGNED_OUT");
        expect(await statusFor(userCtx(alice, "r"))).toBe("OWN_INVITE");
        expect(await statusFor(userCtx(bob, "r"))).toBe("CAN_ACCEPT");
        expect(await statusFor(userCtx(carol, "r"))).toBe("ALREADY_FRIENDS");

        const preview = await actor.previewFriendInvite(
          anonymousCtx("r"),
          secret,
        );
        expect(preview).toEqual({
          inviterId: alice,
          inviterDisplayName: "Alice",
          inviterAvatarUrl: null,
          status: "SIGNED_OUT",
        });
        expect(JSON.stringify(preview)).not.toContain("@example.test");
      });
    });

    it("a wrong or rotated secret answers exactly as a user who does not exist", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const actor = await userActor(alice, db);
        const { token } = await actor.ensureFriendInvite(userCtx(alice, "r"));
        const old = secretOf(token);
        const fresh = await actor.resetFriendInvite(userCtx(alice, "r"));
        expect(fresh.token).not.toBe(token);

        const message = async (id: string, secret: string) => {
          try {
            await (await userActor(id, db)).previewFriendInvite(
              anonymousCtx("r"),
              secret,
            );
          } catch (error) {
            expect(error).toBeInstanceOf(NotFoundError);
            return (error as Error).message.replaceAll(id, "<id>");
          }
          throw new Error("expected NotFound");
        };
        const missingUser = await message(randomUUIDLike(), old);
        expect(await message(alice, old)).toBe(missingUser);
        expect(await message(alice, "not-a-secret")).toBe(missingUser);
        await expect(
          actor.previewFriendInvite(anonymousCtx("r"), secretOf(fresh.token)),
        ).resolves.toMatchObject({ inviterId: alice });
      });
    });

    it("accepting makes both friends rows — one now, one through the outbox", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const { token } = await (await userActor(alice, db)).ensureFriendInvite(
          userCtx(alice, "r"),
        );
        // Bob had already asked; the invite settles that too.
        await (await userActor(bob, db)).sendFriendRequest(
          userCtx(bob, "r"),
          alice,
        );

        const input = parseInviteToken(token);
        if (input === null) throw new Error("bad token");
        const accepted = await (await userActor(bob, db)).acceptFriendInvite(
          userCtx(bob, "r"),
          input,
        );
        expect(accepted).toEqual({ friendId: alice, becameFriends: true });
        expect(await friendPairs(db, [alice, bob])).toEqual(["u2→u1"]);
        expect(
          await db
            .select()
            .from(friendRequests)
            .where(eq(friendRequests.userId, bob)),
        ).toEqual([]);

        const result = await (await drainer(db)).drain(systemCtx("drain"));
        expect(result).toMatchObject({ delivered: 1, dead: 0 });
        expect(await friendPairs(db, [alice, bob])).toEqual(["u1→u2", "u2→u1"]);

        // Idempotent: a second accept writes nothing.
        const again = await (await userActor(bob, db)).acceptFriendInvite(
          userCtx(bob, "r2"),
          input,
        );
        expect(again).toEqual({ friendId: alice, becameFriends: false });
        expect(
          (
            await (
              await userActor(alice, db)
            ).previewFriendInvite(userCtx(bob, "r"), input.secret)
          ).status,
        ).toBe("ALREADY_FRIENDS");
      });
    });

    it("refuses anonymous, a rotated link, and your own link", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const aliceActor = await userActor(alice, db);
        const { token } = await aliceActor.ensureFriendInvite(
          userCtx(alice, "r"),
        );
        const input = parseInviteToken(token);
        if (input === null) throw new Error("bad token");

        await expect(
          (await userActor(bob, db)).acceptFriendInvite(
            anonymousCtx("r"),
            input,
          ),
        ).rejects.toThrow(ForbiddenError);
        await expect(
          aliceActor.acceptFriendInvite(userCtx(alice, "r"), input),
        ).rejects.toThrow(ValidationError);

        await aliceActor.resetFriendInvite(userCtx(alice, "r"));
        await expect(
          (await userActor(bob, db)).acceptFriendInvite(
            userCtx(bob, "r"),
            input,
          ),
        ).rejects.toThrow(NotFoundError);
        expect(await friendPairs(db, [alice, bob])).toEqual([]);
        expect(
          await db
            .select()
            .from(friendInvites)
            .where(eq(friendInvites.userId, alice)),
        ).toHaveLength(1);
      });
    });
  });

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

    /**
     * **F-31 (FR-11): a late removal cannot undo a later friendship.** Alice
     * removes Bob, and the mirror sits in the outbox. Before it is delivered
     * they re-friend: Alice asks, Bob accepts, which writes `friends(bob,
     * alice)` at once. The removal then lands on Bob and, unconditionally,
     * deleted that new row, leaving the new friendship half-made.
     *
     * The test database runs every test in one transaction, so `now()` ties
     * everywhere; the removal's row is backdated a minute to model it having
     * been queued before the re-friending, as it is on a real clock.
     */
    it("a queued removal delivered after a re-friend leaves the new friendship", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        await befriend(db, alice, bob);
        await (await userActor(alice, db)).removeFriend(
          userCtx(alice, "r"),
          bob,
        );
        await db
          .update(outbox)
          .set({ createdAt: sql`now() - interval '1 minute'` })
          .where(
            and(
              eq(outbox.method, "removeFriendOtherSide"),
              eq(outbox.targetId, bob),
            ),
          );

        const request = await (await userActor(alice, db)).sendFriendRequest(
          userCtx(alice, "r2"),
          bob,
        );
        await (await userActor(bob, db)).acceptFriendRequest(
          userCtx(bob, "r2"),
          request.id,
        );
        expect(await friendPairs(db, [alice, bob])).toEqual(["u2→u1"]);

        // Delivers the late removal (seq first), then confirmFriendship.
        const outboxActor = await drainer(db);
        await outboxActor.drain(systemCtx("d"));
        expect(outboxActor.delivered.map((row) => row.method)).toEqual([
          "removeFriendOtherSide",
          "confirmFriendship",
        ]);
        expect(await friendPairs(db, [alice, bob])).toEqual(["u1→u2", "u2→u1"]);
      });
    });

    it("a removal still deletes a friend row that predates it (the backstop)", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        await befriend(db, alice, bob);
        await (await userActor(alice, db)).removeFriend(
          userCtx(alice, "r"),
          bob,
        );
        // A legacy half-state: Bob's row survived, from before the removal.
        await db.insert(friends).values({
          userId: bob,
          friendId: alice,
          createdAt: sql`now() - interval '1 hour'`,
        });

        const outboxActor = await drainer(db);
        await outboxActor.drain(systemCtx("d"));
        expect(outboxActor.results).toEqual([true]);
        expect(await friendPairs(db, [alice, bob])).toEqual([]);
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

    it("answers the process's AI capabilities to its owner only (N07)", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const actor = await userActor(alice, db);
        const installed = {
          ...NO_AI_CAPABILITIES,
          semanticSearch: true,
          labelRead: true,
        };
        setAiCapabilities(installed);
        try {
          expect(await actor.aiCapabilities(userCtx(alice, "r"))).toEqual(
            installed,
          );
          await expect(
            actor.aiCapabilities(userCtx(bob, "r")),
          ).rejects.toBeInstanceOf(ForbiddenError);
        } finally {
          setAiCapabilities(NO_AI_CAPABILITIES);
        }
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

  describe("profile picture (SV-D, MC-avatar)", () => {
    const seedFile = async (
      db: DbOrTx,
      uploadedBy: string,
      kind: string,
      verified = true,
    ): Promise<string> => {
      const [row] = await db
        .insert(files)
        .values({
          key: `${kind}/${crypto.randomUUID()}`,
          uploadedBy,
          mimeType: "image/png",
          metadata: { kind },
          verifiedAt: verified ? new Date() : null,
        })
        .returning({ id: files.id });
      if (row === undefined) throw new Error("seeding a file returned no row");
      return row.id;
    };

    it("sets only a verified avatar upload of the viewer's own", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        await befriend(db, alice, bob);
        const actor = await userActor(alice, db);
        const ctx = userCtx(alice, "r");

        const bobs = await seedFile(db, bob, "avatar");
        const wrongKind = await seedFile(db, alice, "item-image");
        const unverified = await seedFile(db, alice, "avatar", false);
        const own = await seedFile(db, alice, "avatar");

        // Another person's file is not Alice's to name — answered as missing,
        // so the call cannot be used to learn that the file exists.
        await expect(actor.setAvatar(ctx, { fileId: bobs })).rejects.toThrow(
          NotFoundError,
        );
        await expect(
          actor.setAvatar(ctx, { fileId: crypto.randomUUID() }),
        ).rejects.toThrow(NotFoundError);
        await expect(
          actor.setAvatar(ctx, { fileId: wrongKind }),
        ).rejects.toThrow(ValidationError);
        await expect(
          actor.setAvatar(ctx, { fileId: unverified }),
        ).rejects.toThrow(ConflictError);
        await expect(
          actor.setAvatar(ctx, { fileId: "not-a-uuid" }),
        ).rejects.toThrow(ValidationError);
        // Someone else may not set Alice's picture, even with her own file.
        await expect(
          actor.setAvatar(userCtx(bob, "r"), { fileId: own }),
        ).rejects.toThrow(ForbiddenError);
        await expect(actor.removeAvatar(userCtx(bob, "r"))).rejects.toThrow(
          ForbiddenError,
        );
        expect((await actor.getProfile(ctx)).avatarFileId).toBeNull();

        expect(await actor.setAvatar(ctx, { fileId: own })).toMatchObject({
          avatarFileId: own,
        });
        expect((await actor.getProfile(userCtx(bob, "r"))).avatarFileId).toBe(
          own,
        );
      });
    });

    it("removes the picture and falls back to user.image", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const actor = await userActor(alice, db);
        const ctx = userCtx(alice, "r");
        await actor.updateProfile(ctx, {
          avatarUrl: "https://example.test/oauth.png",
        });
        const own = await seedFile(db, alice, "avatar");
        await actor.setAvatar(ctx, { fileId: own });

        const removed = await actor.removeAvatar(ctx);
        expect(removed).toMatchObject({
          avatarFileId: null,
          avatarUrl: "https://example.test/oauth.png",
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
    it("sets on and off idempotently, and nobody else can read or mutate them", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const carol = await seedPerson(db, "Carol");
        await befriend(db, alice, bob);
        const teaId = await seedTea(db, alice);
        const ref = { type: "TEA", id: teaId } as const;

        const actor = await userActor(alice, db);
        expect(await actor.setFavorite(userCtx(alice, "r"), ref, true)).toEqual(
          { ref, favorited: true, changed: true },
        );
        // A retried request (its first answer lost) lands on the same state:
        // it used to be a toggle, and a retry un-favourited.
        expect(await actor.setFavorite(userCtx(alice, "r"), ref, true)).toEqual(
          { ref, favorited: true, changed: false },
        );
        expect(
          nodes(await actor.favorites(userCtx(alice, "r"), firstPage)),
        ).toEqual([ref]);
        expect(
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(itemFavorites)
            .where(eq(itemFavorites.userId, alice)),
        ).toEqual([{ n: 1 }]);

        expect(
          await actor.setFavorite(userCtx(alice, "r"), ref, false),
        ).toEqual({ ref, favorited: false, changed: true });
        expect(
          await actor.setFavorite(userCtx(alice, "r"), ref, false),
        ).toEqual({ ref, favorited: false, changed: false });
        expect(
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(itemFavorites)
            .where(eq(itemFavorites.userId, alice)),
        ).toEqual([{ n: 0 }]);
        await actor.setFavorite(userCtx(alice, "r"), ref, true);

        // friend, stranger, anonymous — read and write alike.
        for (const viewer of [
          userCtx(bob, "r"),
          userCtx(carol, "r"),
          anonymousCtx("r"),
        ]) {
          await expect(actor.favorites(viewer, firstPage)).rejects.toThrow(
            ForbiddenError,
          );
          for (const favorited of [true, false]) {
            await expect(
              actor.setFavorite(viewer, ref, favorited),
            ).rejects.toThrow(ForbiddenError);
          }
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
        await actor.setFavorite(
          userCtx(alice, "r"),
          { type: "TEA", id: favorited },
          true,
        );

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
            await theirs.setFavorite(
              userCtx(person, "r"),
              { type: "TEA", id },
              true,
            );
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
        await (await userActor(bob, db)).setFavorite(
          userCtx(bob, "r"),
          { type: "TEA", id: popular },
          false,
        );
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
          actor.setFavorite(
            userCtx(alice, "r"),
            { type: "TEA", id: "00000000-0000-4000-8000-00000000dead" },
            true,
          ),
        ).rejects.toThrow(NotFoundError);
        // Un-favouriting something never favourited is already done: no
        // existence check, nothing to refuse.
        await expect(
          actor.setFavorite(
            userCtx(alice, "r"),
            { type: "TEA", id: "00000000-0000-4000-8000-00000000dead" },
            false,
          ),
        ).resolves.toMatchObject({ favorited: false, changed: false });
        await expect(
          actor.setFavorite(
            userCtx(alice, "r"),
            {
              type: "COCKTAIL" as never,
              id: "00000000-0000-4000-8000-00000000dead",
            },
            true,
          ),
        ).rejects.toThrow(ValidationError);
        await expect(
          actor.setFavorite(
            userCtx(alice, "r"),
            { type: "TEA", id: "00000000-0000-4000-8000-00000000dead" },
            "yes" as never,
          ),
        ).rejects.toThrow(ValidationError);
      });
    });

    /**
     * Review W4 #3. The uuid check is case-insensitive and Postgres reads both
     * spellings as one row, but the set's lookup is `===` against the
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
          await actor.setFavorite(
            userCtx(alice, "r"),
            { type: "TEA", id: teaId },
            true,
          ),
        ).toMatchObject({ favorited: true });
        expect(
          await actor.favoriteStates(userCtx(alice, "r"), [upper]),
        ).toEqual([`tea:${teaId}`]);
        // The answer names the canonical id, not the spelling it was given.
        expect(
          await actor.setFavorite(userCtx(alice, "r"), upper, false),
        ).toEqual({
          ref: { type: "TEA", id: teaId },
          favorited: false,
          changed: true,
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

  /* ---------------------------------------------------------------------- */
  /* X08 — Want to try                                                       */
  /* ---------------------------------------------------------------------- */

  describe("want to try (X08) — items, recipes and places on one list", () => {
    it("sets and clears each kind idempotently, newest first", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const teaId = await seedTea(db, alice);
        const recipeId = await seedRecipe(db, alice);
        const placeId = await seedPlace(db);
        const actor = await userActor(alice, db);
        const ctx = userCtx(alice, "r");
        const tea = { kind: "ITEM", item: { type: "TEA", id: teaId } } as const;
        const recipe = { kind: "RECIPE", recipeId } as const;
        const place = { kind: "PLACE", placeId } as const;

        expect(await actor.setWantToTry(ctx, tea, true)).toEqual({
          target: tea,
          wantToTry: true,
          changed: true,
        });
        // A repeat is a no-op that says so, not a toggle and not a 23505.
        expect(await actor.setWantToTry(ctx, tea, true)).toEqual({
          target: tea,
          wantToTry: true,
          changed: false,
        });
        await actor.setWantToTry(ctx, recipe, true);
        expect(await actor.setWantToTry(ctx, place, true)).toMatchObject({
          wantToTry: true,
          changed: true,
        });

        const all = nodes(await actor.wantToTry(ctx, firstPage));
        expect(all.map((entry) => entry.target.kind).sort()).toEqual([
          "ITEM",
          "PLACE",
          "RECIPE",
        ]);
        for (let i = 1; i < all.length; i += 1) {
          expect(
            Date.parse(all[i - 1]?.savedAt ?? "") >=
              Date.parse(all[i]?.savedAt ?? ""),
          ).toBe(true);
        }
        expect(
          nodes(await actor.wantToTry(ctx, firstPage, ["RECIPE"])),
        ).toEqual([{ target: recipe, savedAt: expect.any(String) }]);
        expect(
          nodes(await actor.wantToTry(ctx, firstPage, ["PLACE", "ITEM"])),
        ).toHaveLength(2);

        // The place half lives on the interaction row (D11), not a new table.
        const [interaction] = await db
          .select()
          .from(userPlaceInteractions)
          .where(eq(userPlaceInteractions.userId, alice));
        expect(interaction?.wantToVisit).toBe(true);
        expect(
          await db
            .select({ n: sql<number>`count(*)::int` })
            .from(wantToTry)
            .where(eq(wantToTry.userId, alice)),
        ).toEqual([{ n: 2 }]);

        for (const target of [tea, recipe, place]) {
          expect(await actor.setWantToTry(ctx, target, false)).toMatchObject({
            wantToTry: false,
            changed: true,
          });
          expect(await actor.setWantToTry(ctx, target, false)).toMatchObject({
            wantToTry: false,
            changed: false,
          });
        }
        expect(nodes(await actor.wantToTry(ctx, firstPage))).toEqual([]);
      });
    });

    it("the list drops a recipe its author deleted under a live activation", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const kept = await seedRecipe(db, bob);
        const doomed = await seedRecipe(db, bob);
        const actor = await userActor(alice, db);
        const ctx = userCtx(alice, "r");
        await actor.setWantToTry(ctx, { kind: "RECIPE", recipeId: kept }, true);
        await actor.setWantToTry(
          ctx,
          { kind: "RECIPE", recipeId: doomed },
          true,
        );

        // `RecipeActor.delete`'s statement: the wish goes by cascade, behind
        // this activation's back — nothing reloads Alice's actor.
        await db.delete(recipes).where(eq(recipes.id, doomed));

        expect(nodes(await actor.wantToTry(ctx, firstPage))).toEqual([
          {
            target: { kind: "RECIPE", recipeId: kept },
            savedAt: expect.any(String),
          },
        ]);
        expect((await actor.wantToTry(ctx, firstPage)).totalCount).toBe(1);
      });
    });

    it("deletes: a saved item RESTRICTs like item_favorites; a recipe still cascades, through its own index", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const teaId = await seedTea(db, alice);
        const actor = await userActor(alice, db);
        const ctx = userCtx(alice, "r");
        await actor.setWantToTry(
          ctx,
          { kind: "ITEM", item: { type: "TEA", id: teaId } },
          true,
        );

        // In a savepoint: the refused statement must not poison the harness's
        // transaction for the assertions after it.
        const refused = await db
          .transaction(async (sp) => {
            await sp.execute(sql`delete from public.teas where id = ${teaId}`);
          })
          .then(
            () => null,
            (error: unknown) =>
              (error as { cause?: { code?: string; constraint?: string } })
                .cause ?? (error as { code?: string; constraint?: string }),
          );
        // 23001 restrict_violation — RESTRICT, not NO ACTION's 23503.
        expect(refused).toMatchObject({
          code: "23001",
          constraint: "want_to_try_tea_id_teas_id_fkey",
        });
        expect(
          nodes(await actor.wantToTry(ctx, firstPage)).map(
            (entry) => entry.target.kind,
          ),
        ).toEqual(["ITEM"]);

        // The catalog, for what the statement above cannot show: every rule,
        // and the index the recipe cascade reads.
        const rules = await db.execute<{ column: string; rule: string }>(sql`
          select a.attname as column, c.confdeltype::text as rule
          from pg_constraint c
          join pg_attribute a
            on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
          where c.conrelid = 'public.want_to_try'::regclass and c.contype = 'f'
          order by a.attname
        `);
        expect(
          Object.fromEntries(rules.rows.map((row) => [row.column, row.rule])),
        ).toEqual({
          beer_id: "r",
          coffee_id: "r",
          recipe_id: "c",
          sake_id: "r",
          spirit_id: "r",
          tea_id: "r",
          user_id: "r",
          wine_id: "r",
        });
        const index = await db.execute<{ indexdef: string }>(sql`
          select indexdef from pg_indexes
          where schemaname = 'public' and indexname = 'idx_want_to_try_recipe_id'
        `);
        expect(index.rows[0]?.indexdef).toMatch(
          /\(recipe_id\) WHERE \(recipe_id IS NOT NULL\)/,
        );
      });
    });

    it("X27: the list drops a saved place that went under review — for everyone but its creator", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const placeId = await seedPlace(db);
        const place = { kind: "PLACE", placeId } as const;
        const alices = await userActor(alice, db);
        const bobs = await userActor(bob, db);
        await alices.setWantToTry(userCtx(alice, "r"), place, true);
        await bobs.setWantToTry(userCtx(bob, "r"), place, true);

        // Out of reach for Bob from here on; the interaction row stays.
        await db
          .update(places)
          .set({ reviewStatus: "pending", createdBy: alice })
          .where(eq(places.id, placeId));

        const bobsList = await bobs.wantToTry(userCtx(bob, "r"), firstPage);
        expect(nodes(bobsList)).toEqual([]);
        expect(bobsList.totalCount).toBe(0);
        expect(
          nodes(await alices.wantToTry(userCtx(alice, "r"), firstPage)),
        ).toEqual([{ target: place, savedAt: expect.any(String) }]);
      });
    });

    it("wantToTryStates answers a page in one call, in canonical spelling", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const saved = await seedTea(db, alice);
        const notSaved = await seedTea(db, alice);
        const recipeId = await seedRecipe(db, alice);
        const placeId = await seedPlace(db);
        const actor = await userActor(alice, db);
        const ctx = userCtx(alice, "r");
        // Saved with an upper-case id: the row must still be found below.
        await actor.setWantToTry(
          ctx,
          { kind: "ITEM", item: { type: "TEA", id: saved.toUpperCase() } },
          true,
        );
        await actor.setWantToTry(ctx, { kind: "PLACE", placeId }, true);

        expect(
          await actor.wantToTryStates(ctx, [
            { kind: "ITEM", item: { type: "TEA", id: notSaved } },
            { kind: "ITEM", item: { type: "TEA", id: saved } },
            { kind: "RECIPE", recipeId },
            { kind: "PLACE", placeId: placeId.toUpperCase() },
            { kind: "ITEM", item: { type: "TEA", id: saved } },
          ]),
        ).toEqual([`tea:${saved}`, `place:${placeId}`]);
        expect(await actor.wantToTryStates(ctx, [])).toEqual([]);
        await expect(
          actor.wantToTryStates(ctx, [
            { kind: "ITEM", item: { type: "TEA", id: "nope" } },
          ]),
        ).rejects.toThrow(ValidationError);
      });
    });

    it("is owner-only, validates its input and refuses what does not exist", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        await befriend(db, alice, bob);
        const teaId = await seedTea(db, alice);
        const actor = await userActor(alice, db);
        const ctx = userCtx(alice, "r");
        const tea = { kind: "ITEM", item: { type: "TEA", id: teaId } } as const;
        await actor.setWantToTry(ctx, tea, true);

        // A wish list is not friends-visible, and nobody else may edit it.
        for (const viewer of [userCtx(bob, "r"), anonymousCtx("r")]) {
          await expect(actor.wantToTry(viewer, firstPage)).rejects.toThrow(
            ForbiddenError,
          );
          await expect(actor.wantToTryStates(viewer, [tea])).rejects.toThrow(
            ForbiddenError,
          );
          await expect(actor.setWantToTry(viewer, tea, false)).rejects.toThrow(
            ForbiddenError,
          );
        }
        expect(nodes(await actor.wantToTry(ctx, firstPage))).toHaveLength(1);

        const missing = "00000000-0000-4000-8000-00000000dead";
        await expect(
          actor.setWantToTry(
            ctx,
            { kind: "ITEM", item: { type: "WINE", id: missing } },
            true,
          ),
        ).rejects.toThrow(NotFoundError);
        await expect(
          actor.setWantToTry(ctx, { kind: "RECIPE", recipeId: missing }, true),
        ).rejects.toThrow(NotFoundError);
        await expect(
          actor.setWantToTry(ctx, { kind: "PLACE", placeId: missing }, true),
        ).rejects.toThrow(NotFoundError);
        await expect(
          actor.setWantToTry(
            ctx,
            { kind: "BOTTLE" } as unknown as typeof tea,
            true,
          ),
        ).rejects.toThrow(ValidationError);
        await expect(
          actor.setWantToTry(ctx, tea, "yes" as unknown as boolean),
        ).rejects.toThrow(ValidationError);
        await expect(
          actor.wantToTry(ctx, firstPage, ["BOTTLE"] as never),
        ).rejects.toThrow(ValidationError);
      });
    });

    it("the first visit takes a place off the list; a later save sticks", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const placeId = await seedPlace(db);
        const actor = await userActor(alice, db);
        const ctx = userCtx(alice, "r");
        const place = { kind: "PLACE", placeId } as const;

        await actor.setWantToTry(ctx, place, true);
        await actor.recordPlaceInteraction(ctx, { placeId, isVisited: true });
        expect(await actor.wantToTryStates(ctx, [place])).toEqual([]);

        // Saving it again after you have been is a deliberate "go back".
        await actor.setWantToTry(ctx, place, true);
        await actor.recordPlaceInteraction(ctx, { placeId, isVisited: true });
        expect(await actor.wantToTryStates(ctx, [place])).toEqual([
          `place:${placeId}`,
        ]);

        // And a visit that says what it wants about the list is obeyed.
        await actor.recordPlaceInteraction(ctx, { placeId, isVisited: false });
        const visited = await actor.recordPlaceInteraction(ctx, {
          placeId,
          isVisited: true,
          wantToVisit: true,
        });
        expect(visited.wantToVisit).toBe(true);
      });
    });
  });

  describe("place interactions are owner-only and count visits server-side", () => {
    it("X27: a place under review can be saved by its creator; to anyone else it is the NotFound an unknown id gets", async () => {
      await withUserDb(async (db) => {
        const alice = await seedPerson(db, "Alice");
        const bob = await seedPerson(db, "Bob");
        const placeId = await seedPlace(db);
        await db
          .update(places)
          .set({ reviewStatus: "pending", createdBy: alice })
          .where(eq(places.id, placeId));

        const saved = await (await userActor(alice, db)).recordPlaceInteraction(
          userCtx(alice, "r"),
          { placeId, wantToVisit: true },
        );
        expect(saved.wantToVisit).toBe(true);

        const bobs = await userActor(bob, db);
        const hidden = await bobs
          .recordPlaceInteraction(userCtx(bob, "r"), {
            placeId,
            wantToVisit: true,
          })
          .catch((error: unknown) => error);
        const absentId = crypto.randomUUID();
        const absent = await bobs
          .recordPlaceInteraction(userCtx(bob, "r"), {
            placeId: absentId,
            wantToVisit: true,
          })
          .catch((error: unknown) => error);
        expect(hidden).toBeInstanceOf(NotFoundError);
        expect(String((hidden as Error).message).replace(placeId, "<id>")).toBe(
          String((absent as Error).message).replace(absentId, "<id>"),
        );
      });
    });

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
        // X08/D11: the first visit takes the place off "Want to try" — the
        // one flag the visited transition changes; the rest are preserved.
        expect(visited.wantToVisit).toBe(false);
        expect(visited.isFavorite).toBe(false);

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
/* Brew prefs — ux-c L08                                                       */
/* -------------------------------------------------------------------------- */

describe("brew prefs (ux-c L08) — the viewer's own, nobody else's", () => {
  it("sets, reads back, updates and clears a tea's overrides", async () => {
    await withUserDb(async (db) => {
      const alice = await seedPerson(db, "Alice");
      const teaId = await seedTea(db, alice);
      const actor = await userActor(alice, db);
      const ctx = userCtx(alice, "r");
      const item = { type: "TEA", id: teaId } as const;

      expect(await actor.brewPrefs(ctx, item)).toBeNull();
      expect(
        await actor.setBrewPrefs(ctx, {
          item,
          waterTempC: 90,
          steepSeconds: null,
          doseGrams: null,
          waterMl: null,
        }),
      ).toMatchObject({ item, waterTempC: 90, steepSeconds: null });
      await actor.setBrewPrefs(ctx, {
        item,
        waterTempC: 85,
        steepSeconds: 50,
        doseGrams: 5,
        waterMl: null,
      });
      expect(await actor.brewPrefs(ctx, item)).toMatchObject({
        waterTempC: 85,
        steepSeconds: 50,
        doseGrams: 5,
        waterMl: null,
      });
      // All four cleared is back to typical: no row.
      expect(
        await actor.setBrewPrefs(ctx, {
          item,
          waterTempC: null,
          steepSeconds: null,
          doseGrams: null,
          waterMl: null,
        }),
      ).toBeNull();
      expect(await actor.brewPrefs(ctx, item)).toBeNull();
    });
  });

  it("answers another user's prefs exactly like a missing item", async () => {
    await withUserDb(async (db) => {
      const alice = await seedPerson(db, "Alice");
      const bob = await seedPerson(db, "Bob");
      const teaId = await seedTea(db, alice);
      const missingId = "00000000-0000-4000-8000-00000000beef";
      const aliceActor = await userActor(alice, db);
      const aliceCtx = userCtx(alice, "r");
      const bobCtx = userCtx(bob, "r");
      const tea = { type: "TEA", id: teaId } as const;
      await aliceActor.setBrewPrefs(aliceCtx, {
        item: tea,
        waterTempC: 90,
        steepSeconds: null,
        doseGrams: null,
        waterMl: null,
      });

      const refusal = async (run: () => Promise<unknown>) => {
        const caught = await run().then(
          () => null,
          (error: unknown) => error,
        );
        expect(caught).toBeInstanceOf(NotFoundError);
        return (caught as Error).message.replace(/[0-9a-f-]{36}/g, "<id>");
      };
      // Bob, on Alice's actor: reading and writing her prefs.
      const othersRead = await refusal(() => aliceActor.brewPrefs(bobCtx, tea));
      const othersWrite = await refusal(() =>
        aliceActor.setBrewPrefs(bobCtx, {
          item: tea,
          waterTempC: 20,
          steepSeconds: null,
          doseGrams: null,
          waterMl: null,
        }),
      );
      // Alice, on her own actor, naming a tea that does not exist.
      const missing = await refusal(() =>
        aliceActor.brewPrefs(aliceCtx, { type: "TEA", id: missingId }),
      );
      expect(othersRead).toBe(missing);
      expect(othersWrite).toBe(missing);
      // And Alice's row is untouched by Bob's attempt.
      expect(await aliceActor.brewPrefs(aliceCtx, tea)).toMatchObject({
        waterTempC: 90,
      });
    });
  });

  it("takes any dose and water above zero, as the contract and DB do (CB-2)", async () => {
    await withUserDb(async (db) => {
      const alice = await seedPerson(db, "Alice");
      const teaId = await seedTea(db, alice);
      const actor = await userActor(alice, db);
      const ctx = userCtx(alice, "r");
      const saved = await actor.setBrewPrefs(ctx, {
        item: { type: "TEA", id: teaId },
        waterTempC: null,
        steepSeconds: null,
        doseGrams: 0.05,
        waterMl: 0.5,
      });
      expect(saved?.doseGrams).toBeCloseTo(0.05);
      expect(saved?.waterMl).toBeCloseTo(0.5);
    });
  });

  it("refuses out-of-range numbers and non-brew item types", async () => {
    await withUserDb(async (db) => {
      const alice = await seedPerson(db, "Alice");
      const teaId = await seedTea(db, alice);
      const actor = await userActor(alice, db);
      const ctx = userCtx(alice, "r");
      const base = {
        item: { type: "TEA", id: teaId },
        waterTempC: null,
        steepSeconds: null,
        doseGrams: null,
        waterMl: null,
      } as const;
      await expect(
        actor.setBrewPrefs(ctx, { ...base, waterTempC: 101 }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.setBrewPrefs(ctx, { ...base, steepSeconds: 0 }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.setBrewPrefs(ctx, { ...base, doseGrams: 0 }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.setBrewPrefs(ctx, { ...base, waterMl: -1 }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        actor.brewPrefs(ctx, { type: "WINE", id: teaId }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });
});

describe.skipIf(skip)(
  "account settings (H-119 / FR-21): the owner's only",
  () => {
    afterAll(closeTestDb);

    it("reads PRIVATE with no row, and the owner can set it", async () => {
      await withTestDb(async (db) => {
        const alice = await seedUser(db);
        const actor = await userActor(alice, db);
        const ctx = userCtx(alice, "r");
        expect(await actor.settings(ctx)).toEqual({
          defaultCellarPrivacy: "PRIVATE",
        });
        expect(
          await actor.setDefaultCellarPrivacy(ctx, { privacy: "FRIENDS" }),
        ).toEqual({ defaultCellarPrivacy: "FRIENDS" });
        expect(
          await actor.setDefaultCellarPrivacy(ctx, { privacy: "PUBLIC" }),
        ).toEqual({ defaultCellarPrivacy: "PUBLIC" });
        expect((await actor.settings(ctx)).defaultCellarPrivacy).toBe("PUBLIC");
      });
    });

    it("a stranger or a friend can neither read nor write it", async () => {
      await withTestDb(async (db) => {
        const alice = await seedUser(db);
        const bob = await seedUser(db);
        const actor = await userActor(alice, db);
        await actor.setDefaultCellarPrivacy(userCtx(alice, "r"), {
          privacy: "FRIENDS",
        });
        await expect(actor.settings(userCtx(bob, "r"))).rejects.toThrow(
          ForbiddenError,
        );
        await expect(
          actor.setDefaultCellarPrivacy(userCtx(bob, "r"), {
            privacy: "PUBLIC",
          }),
        ).rejects.toThrow(ForbiddenError);
        await expect(actor.settings(anonymousCtx("r"))).rejects.toThrow(
          ForbiddenError,
        );
        expect(
          (await actor.settings(userCtx(alice, "r"))).defaultCellarPrivacy,
        ).toBe("FRIENDS");
      });
    });

    it("refuses a value that is not a privacy", async () => {
      await withTestDb(async (db) => {
        const alice = await seedUser(db);
        const actor = await userActor(alice, db);
        await expect(
          actor.setDefaultCellarPrivacy(userCtx(alice, "r"), {
            privacy: "EVERYONE" as never,
          }),
        ).rejects.toThrow(ValidationError);
      });
    });
  },
);

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
      // Pure: a module-local registry `installAI` fills at boot (N07); its
      // only import is the contracts package.
      "../lib/ai/capabilities.ts",
      // X18: `cellarOwnedBySql`, a SQL fragment for the Me hub's counts —
      // guarded import by import in `no-external-calls.test.ts`.
      "../lib/cellar-ownership.ts",
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
      // X15: `visibleRecipeIds`, one SQL read of `recipes` — guarded import
      // by import in `no-external-calls.test.ts`.
      "../lib/recipe-visibility.ts",
      // X27: `placeIsVisible`, a Drizzle read of `places` — guarded import by
      // import in `no-external-calls.test.ts`.
      "../lib/unshared-places.ts",
      // Pure: validates a uuid and returns its canonical (lowercase) spelling.
      "../lib/uuid.ts",
      // Pure: the display-name rule (a regex, `node:crypto` for a handle).
      // Guarded import by import in `no-external-calls.test.ts`.
      "../auth/display-name.ts",
      // X17: `randomBytes` for an invite secret, `timingSafeEqual` to check
      // one. Local CPU only — no socket.
      "node:crypto",
    ]);
    expect(
      specifiers.filter((s) => s !== undefined && !allowed.has(s)),
    ).toEqual([]);
  });
});
