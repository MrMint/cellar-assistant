/**
 * `BrandSearchActor` — C1 (§2.3).
 */
import type { BrandSearchInput, Ctx } from "@cellar-assistant/contracts";
import {
  brandSearchActorId,
  ForbiddenError,
} from "@cellar-assistant/contracts";
import { brands } from "@cellar-assistant/db";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import { seedFriendship } from "../lib/search-testing.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { BrandSearchActor, escapeLike } from "./brand-search-actor.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string | null): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

const newActor = (
  input: BrandSearchInput,
  db: DbOrTx,
  viewerId: string | null,
): BrandSearchActor =>
  new BrandSearchActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(brandSearchActorId(input, viewerId)),
    db,
  );

const seedBrands = async (db: DbOrTx, names: readonly string[]) => {
  await db.insert(brands).values(names.map((name) => ({ name })));
};

describe.skipIf(skip)("BrandSearchActor (§2.3)", () => {
  afterAll(closeTestDb);

  it("ranks an exact match first, then the shortest containing name", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      await seedBrands(db, [
        "Krug Grande Cuvée",
        "Krug",
        "Krug Clos du Mesnil",
      ]);
      const input: BrandSearchInput = { term: "krug" };
      const hits = await newActor(input, db, viewer).all(
        userCtx(viewer),
        input,
      );
      expect(hits.map((hit) => hit.name)).toEqual([
        "Krug",
        "Krug Grande Cuvée",
        "Krug Clos du Mesnil",
      ]);
    });
  });

  it("matches case-insensitively anywhere in the name", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      await seedBrands(db, ["Domaine de la Romanée", "Château Margaux"]);
      const input: BrandSearchInput = { term: "ROMANÉE" };
      const hits = await newActor(input, db, viewer).all(
        userCtx(viewer),
        input,
      );
      expect(hits.map((h) => h.name)).toEqual(["Domaine de la Romanée"]);
    });
  });

  it("treats `%` as a character, not as a wildcard", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      await seedBrands(db, ["Fifty Percent", "100% Agave Co"]);
      // Unescaped this pattern would match both rows — today's brands list
      // page has exactly that bug. Here it matches only the literal `%`.
      const input: BrandSearchInput = { term: "%" };
      const hits = await newActor(input, db, viewer).all(
        userCtx(viewer),
        input,
      );
      expect(hits.map((h) => h.name)).toEqual(["100% Agave Co"]);
      expect(escapeLike("100%_x")).toBe("100\\%\\_x");
    });
  });

  it("pages one result set without re-querying (§1.5)", async () => {
    await withTestDb(async (db) => {
      const viewer = await seedUser(db);
      await seedBrands(db, ["Aa", "Ab", "Ac", "Ad"]);
      const input: BrandSearchInput = { term: "a" };
      const actor = newActor(input, db, viewer);
      const ctx = userCtx(viewer);

      const first = await actor.results(ctx, input, { first: 2, after: null });
      const second = await actor.results(ctx, input, {
        first: 2,
        after: first.entries.at(-1)?.cursor ?? null,
      });

      expect(first.entries.map((e) => e.node.name)).toEqual(["Aa", "Ab"]);
      expect(second.entries.map((e) => e.node.name)).toEqual(["Ac", "Ad"]);
      expect(actor.searchRuns).toBe(1);
    });
  });

  it("shows the same catalog to owner, friend and stranger; refuses anonymous", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const friend = await seedUser(db);
      const stranger = await seedUser(db);
      await seedFriendship(db, owner, friend);
      await seedBrands(db, ["Shared Brand"]);

      const input: BrandSearchInput = { term: "shared" };
      const seen = [];
      for (const viewer of [owner, friend, stranger]) {
        seen.push(
          await newActor(input, db, viewer).all(userCtx(viewer), input),
        );
      }
      expect(seen[0]).toEqual(seen[1]);
      expect(seen[1]).toEqual(seen[2]);

      await expect(
        newActor(input, db, null).all(userCtx(null), input),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
