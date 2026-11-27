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
    count: async ({ term, excludeIds }) => {
      const excluded = new Set(excludeIds);
      return [...rows.values()].filter(
        (row) =>
          !excluded.has(row.id) &&
          row.displayName.toLowerCase().includes(term.toLowerCase()),
      ).length;
    },
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
      avatarFileId: null,
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

  describe("everyone, for universal search's People (X12)", () => {
    it("finds friends and requests too, connected first, each with its relation", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const input: UserSearchInput = { term: "al", includeConnected: true };
        const hits = await newActor(input, db, s.viewer, s.profiles).all(
          userCtx(s.viewer),
          input,
        );
        expect(hits.map((hit) => [hit.displayName, hit.relation])).toEqual([
          ["Alfred", "FRIEND"],
          ["Alonzo", "REQUEST_RECEIVED"],
          ["Alma", "REQUEST_SENT"],
          ["Alberta", "NONE"],
        ]);
      });
    });

    it("never returns the viewer, and fills the limit with strangers after", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const input: UserSearchInput = {
          term: "al",
          includeConnected: true,
          limit: 2,
        };
        const hits = await newActor(input, db, s.viewer, s.profiles).all(
          userCtx(s.viewer),
          input,
        );
        expect(hits.map((hit) => hit.displayName)).toEqual([
          "Alfred",
          "Alonzo",
        ]);
        const wide: UserSearchInput = { term: "ali", includeConnected: true };
        const self = await newActor(wide, db, s.viewer, s.profiles).all(
          userCtx(s.viewer),
          wide,
        );
        expect(self).toEqual([]);
      });
    });

    it("matches connected people by the same rule as the store", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const input: UserSearchInput = { term: "FRED", includeConnected: true };
        const hits = await newActor(input, db, s.viewer, s.profiles).all(
          userCtx(s.viewer),
          input,
        );
        expect(hits.map((hit) => hit.userId)).toEqual([s.friend]);
      });
    });

    it("re-reads relations every turn rather than holding a stale answer", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db);
        const input: UserSearchInput = {
          term: "alberta",
          includeConnected: true,
        };
        const actor = newActor(input, db, s.viewer, s.profiles);
        const ctx = userCtx(s.viewer);
        const before = await actor.all(ctx, input);
        expect(before.map((hit) => hit.relation)).toEqual(["NONE"]);

        await seedRequest(db, s.viewer, s.stranger);
        const after = await actor.all(ctx, input);
        expect(after.map((hit) => hit.relation)).toEqual(["REQUEST_SENT"]);
        expect(actor.searchRuns).toBe(2);
      });
    });

    it("joins the key only when set", () => {
      const viewer = crypto.randomUUID();
      expect(
        userSearchActorId({ term: "al", includeConnected: false }, viewer),
      ).toBe(userSearchActorId({ term: "al" }, viewer));
      expect(
        userSearchActorId({ term: "al", includeConnected: true }, viewer),
      ).not.toBe(userSearchActorId({ term: "al" }, viewer));
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

  it("MC-search: a people section's total is exact past the cap, in both modes", async () => {
    await withTestDb(async (db) => {
      const s = await scenario(db);
      const ctx = userCtx(s.stranger);
      const plain: UserSearchInput = { term: "al" };
      const full = await newActor(plain, db, s.stranger, s.profiles).results(
        ctx,
        plain,
        { first: 100, after: null },
      );
      const matches = full.entries.length;
      expect(full.totalCount).toBe(matches);
      expect(full.totalIsLowerBound).toBe(false);

      for (const includeConnected of [false, true]) {
        const capped: UserSearchInput = {
          term: "al",
          limit: 1,
          ...(includeConnected ? { includeConnected } : {}),
        };
        const page = await newActor(capped, db, s.stranger, s.profiles).results(
          ctx,
          capped,
          { first: 10, after: null },
        );
        expect(page.entries).toHaveLength(1);
        // Lexical: counted before the cap, so the whole count, not 1.
        expect(page.totalCount).toBe(matches);
        expect(page.totalIsLowerBound).toBe(false);
      }
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

  it("answers nobody by that name with the same empty set in both modes, and an existing person with a hit (leftovers 5)", async () => {
    await withTestDb(async (db) => {
      const s = await scenario(db);
      for (const includeConnected of [false, true]) {
        const nobody: UserSearchInput = {
          term: "Zebedee",
          ...(includeConnected ? { includeConnected } : {}),
        };
        expect(
          await newActor(nobody, db, s.viewer, s.profiles).all(
            userCtx(s.viewer),
            nobody,
          ),
        ).toEqual([]);
        const someone: UserSearchInput = {
          term: "Alberta",
          ...(includeConnected ? { includeConnected } : {}),
        };
        const hits = await newActor(someone, db, s.viewer, s.profiles).all(
          userCtx(s.viewer),
          someone,
        );
        expect(hits.map((hit) => hit.userId)).toEqual([s.stranger]);
      }
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
