/**
 * `ItemSearchActor` — C1 (§2.3).
 *
 * Three of C1's five acceptance criteria are proved here:
 *
 *  - **ranking order is asserted, not just row counts** — the item vector
 *    search places three items at *known* cosine distances (0, 0.293, 1) and
 *    asserts the exact sequence, plus the distances themselves;
 *  - **one activation, one query, many pages** — two differently-paged calls
 *    return the same result set and `searchRuns` stays at 1;
 *  - **the viewer is not in this actor's key**, so owner, friend and stranger
 *    get identical rows (§1.6's catalog case) while an anonymous caller is
 *    refused.
 */
import type { Ctx, ItemSearchInput } from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  itemSearchActorId,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type { EmbedQuery } from "../lib/embedding-client.ts";
import { hnswScans, steerToIndexScans } from "../lib/hnsw-testing.ts";
import {
  blendedVector,
  seedBeer,
  seedFriendship,
  seedItemVector,
  seedWine,
  unitVector,
} from "../lib/search-testing.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { ItemSearchActor } from "./item-search-actor.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string, requestId = "r"): Ctx => ({
  viewerId,
  kind: "user",
  requestId,
});

const newActor = (
  input: ItemSearchInput,
  db: DbOrTx,
  viewerId: string | null,
  embed: EmbedQuery = async () => unitVector(0),
): ItemSearchActor =>
  new ItemSearchActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(itemSearchActorId(input, viewerId)),
    db,
    embed,
  );

/**
 * `hits[0]!.score` reads better but trips biome's `noNonNullAssertion`,
 * and the repo's style forbids `!`. This fails the test with a useful
 * message instead of a `TypeError` when the row is not there.
 */
const at = <T>(rows: readonly T[], index: number): T => {
  const row = rows[index];
  if (row === undefined) {
    throw new Error(
      `expected a result at index ${index}, got ${rows.length} rows`,
    );
  }
  return row;
};

describe.skipIf(skip)("ItemSearchActor (§2.3)", () => {
  afterAll(closeTestDb);

  /* ------------------------------------------------------------------ */
  /* Ranking                                                             */
  /* ------------------------------------------------------------------ */

  describe("ranking order (C1 acceptance)", () => {
    it("orders by cosine distance, with the exact distances the vectors imply", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        // Axis 0 is the query. `blendedVector(0, 1, 1/3)` sits 30° off it, so
        // its cosine distance is 1 - cos(30°) ≈ 0.13397; axis 1 is orthogonal,
        // distance exactly 1. Three known, strictly increasing distances.
        const exact = await seedWine(db, owner, "Exact");
        const near = await seedWine(db, owner, "Near");
        const far = await seedWine(db, owner, "Far");
        await seedItemVector(db, exact, unitVector(0));
        await seedItemVector(db, near, blendedVector(0, 1, 1 / 3));
        await seedItemVector(db, far, unitVector(1));

        const input: ItemSearchInput = { text: "pinot noir" };
        const actor = newActor(input, db, owner);
        const hits = await actor.all(userCtx(owner), input);

        expect(hits.map((hit) => hit.name)).toEqual(["Exact", "Near", "Far"]);
        expect(hits[0]?.distance).toBeCloseTo(0, 3);
        expect(hits[1]?.distance).toBeCloseTo(1 - Math.cos(Math.PI / 6), 3);
        expect(hits[2]?.distance).toBeCloseTo(1, 3);
        // Strictly increasing — the property a ranking claim actually needs.
        expect(at(hits, 0).distance).toBeLessThan(at(hits, 1).distance);
        expect(at(hits, 1).distance).toBeLessThan(at(hits, 2).distance);
      });
    });

    it("breaks a distance tie by name, so paging by offset is stable", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        // Identical vectors: distance ties exactly. Without the name tie-break
        // the two rows could swap between turns and an offset cursor would
        // skip or repeat one. (`now()` is constant inside `withTestDb`, so
        // `created_at` cannot be the tie-break either — B1's harness note.)
        for (const name of ["Beta", "Alpha", "Gamma"]) {
          const wine = await seedWine(db, owner, name);
          await seedItemVector(db, wine, unitVector(0));
        }
        const input: ItemSearchInput = { text: "anything" };
        const actor = newActor(input, db, owner);
        expect(
          (await actor.all(userCtx(owner), input)).map((hit) => hit.name),
        ).toEqual(["Alpha", "Beta", "Gamma"]);
      });
    });

    it("drops rows beyond maxDistance", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const near = await seedWine(db, owner, "Near");
        const far = await seedWine(db, owner, "Far");
        await seedItemVector(db, near, unitVector(0));
        await seedItemVector(db, far, unitVector(1));

        const input: ItemSearchInput = { text: "q", maxDistance: 0.5 };
        const actor = newActor(input, db, owner);
        expect(
          (await actor.all(userCtx(owner), input)).map((hit) => hit.name),
        ).toEqual(["Near"]);
      });
    });

    it("filters by item type across the six tables", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const wine = await seedWine(db, owner, "A Wine");
        const beer = await seedBeer(db, owner, "A Beer");
        await seedItemVector(db, wine, unitVector(0));
        await seedItemVector(db, beer, unitVector(0));

        const all: ItemSearchInput = { text: "q" };
        expect(
          (await newActor(all, db, owner).all(userCtx(owner), all)).map(
            (hit) => hit.type,
          ),
        ).toEqual(["BEER", "WINE"]);

        const beersOnly: ItemSearchInput = { text: "q", itemTypes: ["BEER"] };
        const hits = await newActor(beersOnly, db, owner).all(
          userCtx(owner),
          beersOnly,
        );
        expect(hits).toEqual([
          { type: "BEER", id: beer.id, name: "A Beer", distance: 0 },
        ]);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* The HNSW index path                                                 */
  /* ------------------------------------------------------------------ */

  describe("served by item_vectors' HNSW index (../lib/hnsw.ts)", () => {
    const INDEX = "item_vectors_vector_hnsw_idx";

    it("uses the cosine HNSW index once the cheap plans are taken away", async () => {
      await withTestDb(async (db) => {
        const { rows } = await db.execute<{ n: number }>(
          sql`select count(*)::int as n from pg_indexes
              where schemaname = 'public' and indexname = ${INDEX}
                and indexdef like '%halfvec_cosine_ops%'`,
        );
        expect(rows[0]?.n).toBe(1);

        const owner = await seedUser(db);
        const wine = await seedWine(db, owner, "Indexed");
        await seedItemVector(db, wine, unitVector(0));
        await steerToIndexScans(db);

        const before = await hnswScans(db, INDEX);
        const input: ItemSearchInput = { text: "q" };
        const hits = await newActor(input, db, owner).all(
          userCtx(owner),
          input,
        );
        expect(hits.map((hit) => hit.name)).toEqual(["Indexed"]);
        // The old `DISTINCT ON (<six columns>) … ORDER BY <six columns>,
        // distance` shape cannot be served by this index under any setting,
        // so this stays at `before` for it.
        expect(await hnswScans(db, INDEX)).toBeGreaterThan(before);
      });
    });

    it("returns the exact ranked, type-filtered answer through the index", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        // Wines crowd the query's neighbourhood; the one beer is farther
        // than every wine, so a filter applied after the LIMIT would lose it
        // and the iterative scan must keep going to find it.
        for (const [index, name] of ["W1", "W2", "W3", "W4"].entries()) {
          const wine = await seedWine(db, owner, name);
          await seedItemVector(db, wine, blendedVector(0, 1, index / 20));
        }
        const exact = await seedWine(db, owner, "Exact");
        const near = await seedWine(db, owner, "Near");
        const far = await seedWine(db, owner, "Far");
        await seedItemVector(db, exact, unitVector(0));
        await seedItemVector(db, near, blendedVector(0, 1, 1 / 3));
        await seedItemVector(db, far, unitVector(1));
        const beer = await seedBeer(db, owner, "Lone Beer");
        await seedItemVector(db, beer, blendedVector(0, 1, 1 / 2));
        await steerToIndexScans(db);

        const all: ItemSearchInput = { text: "q" };
        expect(
          (await newActor(all, db, owner).all(userCtx(owner), all)).map(
            (hit) => hit.name,
          ),
        ).toEqual([
          "Exact",
          "W1",
          "W2",
          "W3",
          "W4",
          "Near",
          "Lone Beer",
          "Far",
        ]);

        const beers: ItemSearchInput = { text: "q", itemTypes: ["BEER"] };
        const hits = await newActor(beers, db, owner).all(
          userCtx(owner),
          beers,
        );
        expect(hits.map((hit) => hit.name)).toEqual(["Lone Beer"]);
        expect(at(hits, 0).distance).toBeCloseTo(1 - Math.cos(Math.PI / 4), 3);

        const capped: ItemSearchInput = { text: "q", limit: 2 };
        expect(
          (await newActor(capped, db, owner).all(userCtx(owner), capped)).map(
            (hit) => hit.name,
          ),
        ).toEqual(["Exact", "W1"]);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* §1.5 keying and caching                                             */
  /* ------------------------------------------------------------------ */

  describe("one activation runs the query once and pages it (§1.5)", () => {
    it("returns the same set for two different pagination requests, querying once", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        for (const [index, name] of ["A", "B", "C", "D", "E"].entries()) {
          const wine = await seedWine(db, owner, name);
          await seedItemVector(db, wine, blendedVector(0, 1, index / 10));
        }

        const input: ItemSearchInput = { text: "pinot noir" };
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
        const third = await actor.results(ctx, input, {
          first: 5,
          after: null,
        });

        expect(first.entries.map((e) => e.node.name)).toEqual(["A", "B"]);
        expect(second.entries.map((e) => e.node.name)).toEqual(["C", "D"]);
        // The 5-at-once page is the concatenation of the paged reads: one
        // result set, sliced three ways.
        expect(third.entries.map((e) => e.node.name)).toEqual([
          "A",
          "B",
          "C",
          "D",
          "E",
        ]);
        expect(actor.searchRuns).toBe(1);
        expect(embed).toHaveBeenCalledTimes(1);
      });
    });

    it("refuses an input that does not hash to its own id", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const actor = newActor({ text: "pinot noir" }, db, owner);
        await expect(
          actor.all(userCtx(owner), { text: "chardonnay" }),
        ).rejects.toThrow(ValidationError);
        expect(actor.searchRuns).toBe(0);
      });
    });

    it("is addressed identically for two viewers — the key has no viewer", async () => {
      await withTestDb(async (db) => {
        const a = await seedUser(db);
        const b = await seedUser(db);
        const input: ItemSearchInput = { text: "pinot noir" };
        expect(itemSearchActorId(input, a)).toBe(itemSearchActorId(input, b));
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* §1.6 three viewers                                                  */
  /* ------------------------------------------------------------------ */

  describe("owner / friend / stranger (§1.6 catalog case)", () => {
    it("returns identical rows to all three, and refuses an anonymous caller", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, owner, friend);
        const wine = await seedWine(db, owner, "Shared Catalog Wine");
        await seedItemVector(db, wine, unitVector(0));

        const input: ItemSearchInput = { text: "q" };
        const seen = [];
        for (const viewer of [owner, friend, stranger]) {
          const actor = newActor(input, db, viewer);
          seen.push(await actor.all(userCtx(viewer), input));
        }
        expect(seen[0]).toEqual(seen[1]);
        expect(seen[1]).toEqual(seen[2]);
        expect(seen[0]?.[0]?.name).toBe("Shared Catalog Wine");

        const anonymous = newActor(input, db, null);
        await expect(
          anonymous.all(
            { viewerId: null, kind: "user", requestId: "r" },
            input,
          ),
        ).rejects.toThrow(ForbiddenError);
      });
    });

    it("refuses an anonymous caller on a *warm* activation (regression)", async () => {
      // Found on the compose stack, not in a unit test: with the visibility
      // check inside `runSearch`, the first call authorised and cached and
      // every later call was served from the cache with no check at all — an
      // anonymous request got a full result set back. `SearchActorBase` now
      // runs `authorize` before the cache, on every turn.
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const wine = await seedWine(db, owner, "Warm Cache Wine");
        await seedItemVector(db, wine, unitVector(0));

        const input: ItemSearchInput = { text: "q" };
        // The key has no viewer, so the owner and an anonymous caller address
        // *the same activation* — which is exactly the dangerous case.
        const actor = newActor(input, db, null);
        expect(await actor.all(userCtx(owner), input)).toHaveLength(1);
        expect(actor.searchRuns).toBe(1);

        await expect(
          actor.all({ viewerId: null, kind: "user", requestId: "r" }, input),
        ).rejects.toThrow(ForbiddenError);
        // …and the warm result set is still there for the caller who may see it.
        expect(await actor.all(userCtx(owner), input)).toHaveLength(1);
        expect(actor.searchRuns).toBe(1);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* Input shape                                                         */
  /* ------------------------------------------------------------------ */

  describe("text or vector, never both", () => {
    it("takes a caller-supplied vector without embedding (the image path)", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const wine = await seedWine(db, owner, "By Image");
        await seedItemVector(db, wine, unitVector(3));

        const input: ItemSearchInput = { vector: unitVector(3) };
        const embed = vi.fn<EmbedQuery>(async () => unitVector(0));
        const actor = newActor(input, db, owner, embed);
        const hits = await actor.all(userCtx(owner), input);

        expect(hits.map((h) => h.name)).toEqual(["By Image"]);
        expect(embed).not.toHaveBeenCalled();
      });
    });

    it("refuses neither, and refuses both", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        for (const input of [
          {} as ItemSearchInput,
          { text: "q", vector: unitVector(0) } as ItemSearchInput,
        ]) {
          const actor = newActor(input, db, owner);
          await expect(actor.all(userCtx(owner), input)).rejects.toThrow(
            ValidationError,
          );
        }
      });
    });
  });
});
