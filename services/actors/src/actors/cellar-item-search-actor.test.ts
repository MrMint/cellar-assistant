/**
 * `CellarItemSearchActor` — C1 (§2.3), §1.5's **first** identity-sensitive
 * surface.
 *
 * Two things this file exists to prove:
 *
 *  - **owner / friend / stranger** over all three privacies, because the answer
 *    is the contents of one cellar;
 *  - **the viewer really is in the key**, so a stranger cannot be served an
 *    owner's cached result set by addressing the owner's activation.
 */
import type { CellarItemSearchInput, Ctx } from "@cellar-assistant/contracts";
import {
  cellarItemSearchActorId,
  ForbiddenError,
  NotFoundError,
  pageArgs,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type { EmbedQuery } from "../lib/embedding-client.ts";
import {
  blendedVector,
  seedCellar,
  seedCellarItem,
  seedFriendship,
  seedItemVector,
  seedWine,
  unitVector,
} from "../lib/search-testing.ts";
import {
  closeTestDb,
  refusalOf,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { CellarItemSearchActor } from "./cellar-item-search-actor.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string | null): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

const newActor = (
  input: CellarItemSearchInput,
  db: DbOrTx,
  viewerId: string | null,
  embed: EmbedQuery = async () => unitVector(0),
): CellarItemSearchActor =>
  new CellarItemSearchActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(cellarItemSearchActorId(input, viewerId)),
    db,
    embed,
  );

/** Owner, friend, stranger, and a cellar at `privacy` holding three wines. */
const scenario = async (
  db: DbOrTx,
  privacy: "PUBLIC" | "FRIENDS" | "PRIVATE",
) => {
  const owner = await seedUser(db);
  const friend = await seedUser(db);
  const stranger = await seedUser(db);
  await seedFriendship(db, owner, friend);
  const cellarId = await seedCellar(db, { createdById: owner, privacy });

  const exact = await seedWine(db, owner, "Exact");
  const near = await seedWine(db, owner, "Near");
  const unembedded = await seedWine(db, owner, "Unembedded");
  await seedItemVector(db, exact, unitVector(0));
  await seedItemVector(db, near, blendedVector(0, 1, 1 / 3));

  const ids = {
    exact: await seedCellarItem(db, cellarId, owner, exact),
    near: await seedCellarItem(db, cellarId, owner, near),
    unembedded: await seedCellarItem(db, cellarId, owner, unembedded),
  };
  return { owner, friend, stranger, cellarId, ids };
};

describe.skipIf(skip)("CellarItemSearchActor (§2.3, §1.5)", () => {
  afterAll(closeTestDb);

  describe("owner / friend / stranger (§1.6)", () => {
    it("PRIVATE: owner sees it, friend and stranger get NotFound", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, cellarId } = await scenario(
          db,
          "PRIVATE",
        );
        const input: CellarItemSearchInput = { cellarId, query: "oaky" };

        expect(
          await newActor(input, db, owner).all(userCtx(owner), input),
        ).toHaveLength(3);
        for (const viewer of [friend, stranger]) {
          await expect(
            newActor(input, db, viewer).all(userCtx(viewer), input),
          ).rejects.toThrow(NotFoundError);
        }
      });
    });

    it("FRIENDS: owner and friend see it, stranger gets NotFound", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, cellarId } = await scenario(
          db,
          "FRIENDS",
        );
        const input: CellarItemSearchInput = { cellarId, query: "oaky" };

        for (const viewer of [owner, friend]) {
          expect(
            await newActor(input, db, viewer).all(userCtx(viewer), input),
          ).toHaveLength(3);
        }
        await expect(
          newActor(input, db, stranger).all(userCtx(stranger), input),
        ).rejects.toThrow(NotFoundError);
      });
    });

    it("PUBLIC: all three see it; anonymous is refused before any read", async () => {
      await withTestDb(async (db) => {
        const { owner, friend, stranger, cellarId } = await scenario(
          db,
          "PUBLIC",
        );
        const input: CellarItemSearchInput = { cellarId, query: "oaky" };
        for (const viewer of [owner, friend, stranger]) {
          expect(
            await newActor(input, db, viewer).all(userCtx(viewer), input),
          ).toHaveLength(3);
        }
        await expect(
          newActor(input, db, null).all(userCtx(null), input),
        ).rejects.toThrow(ForbiddenError);
      });
    });

    it("a stranger cannot reach the owner's activation by addressing its key", async () => {
      await withTestDb(async (db) => {
        const { owner, stranger, cellarId } = await scenario(db, "PRIVATE");
        const input: CellarItemSearchInput = { cellarId, query: "oaky" };

        // The owner's key and the stranger's key are different ids, so Dapr
        // routes them to different activations — that is the mechanism. And if
        // a stranger *does* address the owner's id, the key check refuses the
        // call before a single row is read.
        const ownerKey = cellarItemSearchActorId(input, owner);
        expect(cellarItemSearchActorId(input, stranger)).not.toBe(ownerKey);

        const impostor = new CellarItemSearchActor(
          new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
          new ActorId(ownerKey),
          db,
          async () => unitVector(0),
        );
        await expect(impostor.all(userCtx(stranger), input)).rejects.toThrow(
          ValidationError,
        );
        expect(impostor.searchRuns).toBe(0);
      });
    });
  });

  describe("ordering", () => {
    it("orders by cosine distance with un-embedded items last", async () => {
      await withTestDb(async (db) => {
        const { owner, cellarId, ids } = await scenario(db, "PRIVATE");
        const input: CellarItemSearchInput = { cellarId, query: "oaky" };
        const hits = await newActor(input, db, owner).all(
          userCtx(owner),
          input,
        );

        expect(hits.map((hit) => hit.cellarItemId)).toEqual([
          ids.exact,
          ids.near,
          ids.unembedded,
        ]);
        expect(hits[0]?.distance).toBeCloseTo(0, 3);
        expect(hits[1]?.distance).toBeCloseTo(1 - Math.cos(Math.PI / 6), 3);
        expect(hits[2]?.distance).toBeNull();
      });
    });

    it("agrees with CellarActor.items(semanticQuery) on the same fixture", async () => {
      // The overlap §2.3 does not call out. Two implementations of one
      // ordering have to agree or one of them is wrong.
      const { CellarActor } = await import("./cellar-actor.ts");
      await withTestDb(async (db) => {
        const { owner, cellarId, ids } = await scenario(db, "PRIVATE");
        const input: CellarItemSearchInput = { cellarId, query: "oaky" };

        const viaSearch = await newActor(input, db, owner).all(
          userCtx(owner),
          input,
        );
        const cellar = new CellarActor(
          new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
          new ActorId(cellarId),
          db,
          async () => unitVector(0),
        );
        await cellar.onActivate();
        const viaCellar = await cellar.items(userCtx(owner), {
          page: { first: 20, after: null },
          semanticQuery: "oaky",
        });

        expect(viaSearch.map((hit) => hit.cellarItemId)).toEqual(
          viaCellar.entries.map((entry) => entry.node.id),
        );
        expect(viaSearch.map((hit) => hit.cellarItemId)).toEqual([
          ids.exact,
          ids.near,
          ids.unembedded,
        ]);
      });
    });
  });

  describe("§1.5 caching", () => {
    it("re-checks cellar visibility on a warm activation (regression)", async () => {
      // The same class of bug as `item-search-actor.test.ts`'s warm-cache
      // case, and worse here: the cached page *is* a private cellar's
      // contents. `authorize` runs before the cache on every turn, so a
      // cellar that goes PRIVATE mid-window stops answering at once.
      await withTestDb(async (db) => {
        const { owner, friend, cellarId } = await scenario(db, "FRIENDS");
        const input: CellarItemSearchInput = { cellarId, query: "oaky" };
        const actor = newActor(input, db, friend);
        const ctx = userCtx(friend);

        expect(await actor.all(ctx, input)).toHaveLength(3);
        expect(actor.searchRuns).toBe(1);

        await db.execute(
          sql`update public.cellars set privacy = 'PRIVATE'::permission_type
              where id = ${cellarId}::uuid`,
        );
        await expect(actor.all(ctx, input)).rejects.toThrow(NotFoundError);
        // The owner's own activation is unaffected.
        expect(
          await newActor(input, db, owner).all(userCtx(owner), input),
        ).toHaveLength(3);
      });
    });

    it("embeds and queries once across two pages", async () => {
      await withTestDb(async (db) => {
        const { owner, cellarId, ids } = await scenario(db, "PRIVATE");
        const input: CellarItemSearchInput = { cellarId, query: "oaky" };
        const embed = vi.fn<EmbedQuery>(async () => unitVector(0));
        const actor = newActor(input, db, owner, embed);
        const ctx = userCtx(owner);

        const first = await actor.results(ctx, input, {
          first: 2,
          after: null,
        });
        const second = await actor.results(ctx, input, {
          first: 2,
          after: first.entries.at(-1)?.cursor ?? null,
        });

        expect(first.entries.map((e) => e.node.cellarItemId)).toEqual([
          ids.exact,
          ids.near,
        ]);
        expect(second.entries.map((e) => e.node.cellarItemId)).toEqual([
          ids.unembedded,
        ]);
        expect(actor.searchRuns).toBe(1);
        expect(embed).toHaveBeenCalledTimes(1);
      });
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Concealment: a stranger's private cellar and no cellar answer alike         */
/* -------------------------------------------------------------------------- */

/**
 * The cellar this search is scoped to is `CellarActor`'s row, so a stranger
 * must be told about a PRIVATE one exactly what `CellarActor` tells them about
 * an id that names nothing — the same `{ code, message }`, in `CellarActor`'s
 * words. It used to say `cellar <id> has no row` here and
 * `CellarActor(<id>) has no row` there.
 */
describe.skipIf(skip)("CellarItemSearchActor concealment", () => {
  afterAll(closeTestDb);

  const CALLS: readonly [
    string,
    (
      actor: CellarItemSearchActor,
      ctx: Ctx,
      input: CellarItemSearchInput,
    ) => Promise<unknown>,
  ][] = [
    [
      "results",
      (actor, ctx, input) => actor.results(ctx, input, pageArgs({ first: 5 })),
    ],
    ["all", (actor, ctx, input) => actor.all(ctx, input)],
  ];

  it.each(CALLS)("%s", async (_method, call) => {
    await withTestDb(async (db) => {
      const { stranger, cellarId } = await scenario(db, "PRIVATE");
      const absent = crypto.randomUUID();
      const run = (id: string) => {
        const input: CellarItemSearchInput = { cellarId: id, query: "oaky" };
        return refusalOf(
          () => call(newActor(input, db, stranger), userCtx(stranger), input),
          id,
        );
      };

      const hidden = await run(cellarId);
      expect(hidden).toEqual(await run(absent));
      expect(hidden).toEqual({
        code: "NOT_FOUND",
        message: "CellarActor(<id>) has no row",
      });
    });
  });
});
