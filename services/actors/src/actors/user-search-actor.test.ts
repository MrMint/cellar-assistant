/**
 * `UserSearchActor` — C1 (§2.3), §1.5's **third** identity-sensitive surface.
 *
 * "Owner / friend / stranger" reads differently here than for an aggregate:
 * the question is not whether a viewer may see a row, but *which* rows a viewer
 * gets — and the answer differs per viewer by construction. So the three-viewer
 * matrix is expressed as: a friend never appears in your results, a stranger
 * always does, and you never appear in your own.
 */
import type { Ctx, UserSearchInput } from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  userSearchActorId,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type { ProfileFields, ProfileStore } from "../lib/profile-store.ts";
import { seedFriendship } from "../lib/search-testing.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { UserSearchActor } from "./user-search-actor.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string | null): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

/**
 * The `auth_dev` half, in memory. `ProfileStore.search` is the seam precisely
 * because better-auth's `user` table is in another database (A6), so a test
 * running inside one rolled-back transaction on the *main* database cannot
 * reach it — the same reasoning B4 recorded.
 */
const fakeProfiles = (): ProfileStore & { put(f: ProfileFields): void } => {
  const rows = new Map<string, ProfileFields>();
  return {
    put: (fields) => rows.set(fields.id, fields),
    load: async (ids) =>
      new Map(
        ids
          .map((id) => rows.get(id))
          .filter((row): row is ProfileFields => row !== undefined)
          .map((row) => [row.id, row]),
      ),
    update: async () => null,
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
  };
};

const newActor = (
  input: UserSearchInput,
  db: DbOrTx,
  viewerId: string | null,
  profiles: ProfileStore,
): UserSearchActor =>
  new UserSearchActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(userSearchActorId(input, viewerId)),
    db,
    profiles,
  );

const seedRequest = async (db: DbOrTx, from: string, to: string) => {
  await db.execute(sql`
    insert into public.friend_requests (user_id, friend_id, status)
    values (${from}::uuid, ${to}::uuid, 'PENDING'::friend_request_status)
  `);
};

/** Five "Al…" people, so the exclusion set is bigger than the limit if applied late. */
const scenario = async (db: DbOrTx) => {
  const profiles = fakeProfiles();
  const viewer = await seedUser(db, { displayName: "Alice" });
  const friend = await seedUser(db, { displayName: "Alfred" });
  const requested = await seedUser(db, { displayName: "Alma" });
  const requester = await seedUser(db, { displayName: "Alonzo" });
  const stranger = await seedUser(db, { displayName: "Alberta" });

  for (const [id, displayName] of [
    [viewer, "Alice"],
    [friend, "Alfred"],
    [requested, "Alma"],
    [requester, "Alonzo"],
    [stranger, "Alberta"],
  ] as const) {
    profiles.put({
      id,
      displayName,
      avatarUrl: null,
      locale: "en",
      email: `${displayName.toLowerCase()}@example.test`,
    });
  }

  await seedFriendship(db, viewer, friend);
  await seedRequest(db, viewer, requested); // viewer asked them
  await seedRequest(db, requester, viewer); // they asked viewer

  return { profiles, viewer, friend, requested, requester, stranger };
};

describe.skipIf(skip)("UserSearchActor (§2.3, §1.5)", () => {
  afterAll(closeTestDb);

  it("excludes self, friends and open requests in both directions", async () => {
    await withTestDb(async (db) => {
      const s = await scenario(db);
      const input: UserSearchInput = { term: "al" };
      const hits = await newActor(input, db, s.viewer, s.profiles).all(
        userCtx(s.viewer),
        input,
      );
      expect(hits.map((hit) => hit.displayName)).toEqual(["Alberta"]);
      expect(hits[0]?.userId).toBe(s.stranger);
    });
  });

  it("gives two viewers different answers — hence the viewer in the key", async () => {
    await withTestDb(async (db) => {
      const s = await scenario(db);
      const input: UserSearchInput = { term: "al" };

      const forViewer = await newActor(input, db, s.viewer, s.profiles).all(
        userCtx(s.viewer),
        input,
      );
      const forStranger = await newActor(input, db, s.stranger, s.profiles).all(
        userCtx(s.stranger),
        input,
      );

      expect(forViewer.map((h) => h.displayName)).toEqual(["Alberta"]);
      // The stranger has no friendships and no requests, so they see everyone
      // but themselves — a strictly different answer to the same word.
      expect(forStranger.map((h) => h.displayName)).toEqual([
        "Alfred",
        "Alice",
        "Alma",
        "Alonzo",
      ]);
      expect(userSearchActorId(input, s.viewer)).not.toBe(
        userSearchActorId(input, s.stranger),
      );
    });
  });

  it("excludes before the limit, not after", async () => {
    await withTestDb(async (db) => {
      const s = await scenario(db);
      // `limit: 1` with a late filter would return "Alberta" only by luck;
      // with an early one it is the only candidate and always comes back.
      const input: UserSearchInput = { term: "al", limit: 1 };
      const hits = await newActor(input, db, s.viewer, s.profiles).all(
        userCtx(s.viewer),
        input,
      );
      expect(hits.map((h) => h.displayName)).toEqual(["Alberta"]);
    });
  });

  it("pages one result set without re-querying (§1.5)", async () => {
    await withTestDb(async (db) => {
      const s = await scenario(db);
      const input: UserSearchInput = { term: "al" };
      const actor = newActor(input, db, s.stranger, s.profiles);
      const ctx = userCtx(s.stranger);

      const first = await actor.results(ctx, input, { first: 2, after: null });
      const second = await actor.results(ctx, input, {
        first: 2,
        after: first.entries.at(-1)?.cursor ?? null,
      });

      expect(first.entries.map((e) => e.node.displayName)).toEqual([
        "Alfred",
        "Alice",
      ]);
      expect(second.entries.map((e) => e.node.displayName)).toEqual([
        "Alma",
        "Alonzo",
      ]);
      expect(actor.searchRuns).toBe(1);
    });
  });

  it("refuses an anonymous caller and an empty term", async () => {
    await withTestDb(async (db) => {
      const s = await scenario(db);
      const input: UserSearchInput = { term: "al" };
      await expect(
        newActor(input, db, null, s.profiles).all(userCtx(null), input),
      ).rejects.toThrow(ForbiddenError);

      const empty: UserSearchInput = { term: "   " };
      await expect(
        newActor(empty, db, s.viewer, s.profiles).all(userCtx(s.viewer), empty),
      ).rejects.toThrow(ValidationError);
    });
  });
});
