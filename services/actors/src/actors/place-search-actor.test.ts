/**
 * `PlaceSearchActor` — C1 (§2.3).
 *
 * Two of C1's acceptance criteria land here:
 *
 *  - **ranking order asserted for the hybrid place search** — three places are
 *    seeded whose relative `combined_score` is determined by the ported
 *    formula, and the test names the expected sequence, not a row count;
 *  - **the viewer is in the key only when the search is viewer-scoped** — the
 *    conditional case §2.3 and §1.5 disagree about.
 *
 * `places` and `category_vectors` are empty in this development database, so
 * every fixture here is built by `lib/search-testing.ts`. A3b's differential
 * test of these functions was functional only; this is the first ranking
 * evidence for `search_places_hybrid` in the new stack.
 */
import type { Ctx, PlaceSearchInput } from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  PLACE_SEARCH_WEIGHTS,
  placeSearchActorId,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import type { EmbedQuery } from "../lib/embedding-client.ts";
import {
  blendedVector,
  seedCategoryVector,
  seedFriendship,
  seedPlace,
  seedTierList,
  seedTierListPlace,
  seedVisit,
  unitVector,
} from "../lib/search-testing.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  testDb,
  withTestDb,
} from "../lib/testing.ts";
import { PlaceSearchActor } from "./place-search-actor.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string | null): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

const newActor = (
  input: PlaceSearchInput,
  db: DbOrTx,
  viewerId: string | null,
  embed: EmbedQuery = async () => unitVector(0),
): PlaceSearchActor =>
  new PlaceSearchActor(
    new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" }),
    new ActorId(placeSearchActorId(input, viewerId)),
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

describe.skipIf(skip)("PlaceSearchActor (§2.3)", () => {
  afterAll(closeTestDb);

  /* ------------------------------------------------------------------ */
  /* Ranking                                                             */
  /* ------------------------------------------------------------------ */

  describe("hybrid ranking order (C1 acceptance)", () => {
    it("ranks by category score when the text and trigram terms tie", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        // `search_places_hybrid` scores
        //   text_rank × 0.35 + trigram × 0.25 + category × 0.40
        //   (+ a quadratic name boost above trigram 0.5).
        // All three names contain the query word in the same position and are
        // the same shape, so the first two terms tie and the *category* term
        // is the only discriminator — which is what makes the expected order
        // derivable rather than observed.
        await seedPlace(db, {
          name: "Vino Alpha",
          lng: -83,
          lat: 40,
          primaryCategory: "wine_bar",
        });
        await seedPlace(db, {
          name: "Vino Bravo",
          lng: -83,
          lat: 40,
          primaryCategory: "pub",
        });
        await seedPlace(db, {
          name: "Vino Delta",
          lng: -83,
          lat: 40,
          primaryCategory: "cafe",
        });

        // Query vector is axis 0. "wine bar" sits on it (distance 0, weighted
        // similarity 1.0); "pub" sits 0.35 away (weighted ≈ 0.68); "cafe" has
        // no vector at all, so it scores 0.
        await seedCategoryVector(db, {
          label: "wine bar",
          associatedCategories: ["wine_bar"],
          vector: unitVector(0),
        });
        await seedCategoryVector(db, {
          label: "pub",
          associatedCategories: ["pub"],
          vector: blendedVector(0, 1, Math.acos(0.65) / (Math.PI / 2)),
        });

        const input: PlaceSearchInput = { query: "Vino" };
        const hits = await newActor(input, db, viewer).all(
          userCtx(viewer),
          input,
        );

        expect(hits.map((hit) => hit.name)).toEqual([
          "Vino Alpha",
          "Vino Bravo",
          "Vino Delta",
        ]);
        // Strictly decreasing — the property the ordering claim rests on.
        expect(at(hits, 0).combinedScore).toBeGreaterThan(
          at(hits, 1).combinedScore,
        );
        expect(at(hits, 1).combinedScore).toBeGreaterThan(
          at(hits, 2).combinedScore,
        );
        // The three category scores are the reason, and they are the values
        // the ported formula implies: 1.0 (capped after the 1.15 primary
        // boost), ≈0.78, and 0.
        expect(at(hits, 0).categoryScore).toBeCloseTo(1, 3);
        expect(at(hits, 1).categoryScore).toBeCloseTo(0.7827, 2);
        expect(at(hits, 2).categoryScore).toBe(0);
        // …while the two terms that are supposed to tie, do.
        expect(at(hits, 0).trigramSimilarity).toBeCloseTo(
          at(hits, 2).trigramSimilarity,
          6,
        );
        expect(at(hits, 0).textRank).toBeCloseTo(at(hits, 2).textRank, 6);
        // And the gap between adjacent scores is 0.40 × the category gap.
        expect(
          at(hits, 0).combinedScore - at(hits, 1).combinedScore,
        ).toBeCloseTo(
          0.4 * (at(hits, 0).categoryScore - at(hits, 1).categoryScore),
          5,
        );
      });
    });

    it("respects the viewport and the rating floor", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        await seedPlace(db, {
          name: "Vino Near",
          lng: -83,
          lat: 40,
          rating: 4.5,
        });
        await seedPlace(db, { name: "Vino Far", lng: 0, lat: 0, rating: 4.5 });
        await seedPlace(db, {
          name: "Vino Poor",
          lng: -83,
          lat: 40,
          rating: 1,
        });

        const input: PlaceSearchInput = {
          query: "Vino",
          bounds: { west: -83.1, south: 39.9, east: -82.9, north: 40.1 },
          minRating: 4,
        };
        const hits = await newActor(input, db, viewer).all(
          userCtx(viewer),
          input,
        );
        expect(hits.map((h) => h.name)).toEqual(["Vino Near"]);
      });
    });

    it("decodes the geography column into { lng, lat }", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        await seedPlace(db, { name: "Vino", lng: -83.001, lat: 39.999 });
        const input: PlaceSearchInput = { query: "Vino" };
        const [hit] = await newActor(input, db, viewer).all(
          userCtx(viewer),
          input,
        );
        expect(hit?.location?.lng).toBeCloseTo(-83.001, 6);
        expect(hit?.location?.lat).toBeCloseTo(39.999, 6);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* The weights §2.3 wants a single source of truth for                 */
  /* ------------------------------------------------------------------ */

  describe("weights (§2.3)", () => {
    it("the deployed SQL still uses the weights `PLACE_SEARCH_WEIGHTS` declares", async () => {
      // A3b ported the body with the weights inline and recorded that it did.
      // Until the SQL takes them as arguments (§9's deferred rewrite), this is
      // what "one source of truth" can be enforced as.
      const { rows } = await testDb().execute<{ def: string }>(sql`
        select pg_get_functiondef('public.search_places_hybrid(
          text, text[], double precision[], double precision, double precision,
          double precision, double precision, double precision, integer,
          uuid[], text[])'::regprocedure) as def
      `);
      const def = rows[0]?.def ?? "";
      // Each pair is [the declared constant, the literal as the SQL spells it].
      // `0.4` and `0.40` are the same number and different text, so the
      // rendering is pinned here rather than guessed with `toFixed`.
      const inSql: readonly [number, string][] = [
        [PLACE_SEARCH_WEIGHTS.textRank, "* 0.35 +"],
        [PLACE_SEARCH_WEIGHTS.trigram, "* 0.25 +"],
        [PLACE_SEARCH_WEIGHTS.category, "* 0.40 +"],
        [PLACE_SEARCH_WEIGHTS.nameBoost, "* 0.5"],
        [PLACE_SEARCH_WEIGHTS.nameBoostThreshold, ">= 0.5"],
        [PLACE_SEARCH_WEIGHTS.primaryCategoryBoost, "THEN 1.15"],
      ];
      for (const [declared, literal] of inSql) {
        // The literal really is this number…
        expect(Number(literal.replace(/[^0-9.]/g, ""))).toBe(declared);
        // …and it really is still in the deployed function body.
        expect(def).toContain(literal);
      }
    });
  });

  /* ------------------------------------------------------------------ */
  /* §7's gap, from the actor's side                                     */
  /* ------------------------------------------------------------------ */

  describe("tier-list privacy (target-stack §7)", () => {
    const withTierList = async (
      db: DbOrTx,
      privacy: "PUBLIC" | "FRIENDS" | "PRIVATE",
    ) => {
      const owner = await seedUser(db);
      const friend = await seedUser(db);
      const stranger = await seedUser(db);
      await seedFriendship(db, owner, friend);
      const place = await seedPlace(db, { name: "Vino", lng: -83, lat: 40 });
      const tierListId = await seedTierList(db, {
        createdById: owner,
        privacy,
      });
      await seedTierListPlace(db, tierListId, place);
      return { owner, friend, stranger, tierListId };
    };

    it("PRIVATE: only the owner's search returns the tier list's places", async () => {
      await withTestDb(async (db) => {
        const s = await withTierList(db, "PRIVATE");
        const input: PlaceSearchInput = {
          query: "Vino",
          tierListIds: [s.tierListId],
        };
        expect(
          (await newActor(input, db, s.owner).all(userCtx(s.owner), input)).map(
            (h) => h.name,
          ),
        ).toEqual(["Vino"]);
        for (const viewer of [s.friend, s.stranger]) {
          expect(
            await newActor(input, db, viewer).all(userCtx(viewer), input),
          ).toEqual([]);
        }
      });
    });

    it("FRIENDS: the friend gets it, the stranger does not", async () => {
      await withTestDb(async (db) => {
        const s = await withTierList(db, "FRIENDS");
        const input: PlaceSearchInput = {
          query: "Vino",
          tierListIds: [s.tierListId],
        };
        for (const viewer of [s.owner, s.friend]) {
          expect(
            (await newActor(input, db, viewer).all(userCtx(viewer), input)).map(
              (h) => h.name,
            ),
          ).toEqual(["Vino"]);
        }
        expect(
          await newActor(input, db, s.stranger).all(userCtx(s.stranger), input),
        ).toEqual([]);
      });
    });

    it("re-checks tier-list visibility on a warm activation (regression)", async () => {
      await withTestDb(async (db) => {
        const s = await withTierList(db, "PUBLIC");
        const input: PlaceSearchInput = {
          query: "Vino",
          tierListIds: [s.tierListId],
        };
        const actor = newActor(input, db, s.stranger);
        const ctx = userCtx(s.stranger);

        expect((await actor.all(ctx, input)).map((h) => h.name)).toEqual([
          "Vino",
        ]);
        // The list goes private between two pages. Because `authorize` runs
        // before the cache, the very next turn answers empty rather than
        // serving the warm result set for the rest of the idle window.
        await db.execute(
          sql`update public.tier_lists set privacy = 'PRIVATE'::permission_type
              where id = ${s.tierListId}::uuid`,
        );
        expect(await actor.all(ctx, input)).toEqual([]);
      });
    });

    it("never embeds for a denied filter", async () => {
      await withTestDb(async (db) => {
        const s = await withTierList(db, "PRIVATE");
        const input: PlaceSearchInput = {
          query: "Vino",
          tierListIds: [s.tierListId],
        };
        const embed = vi.fn<EmbedQuery>(async () => unitVector(0));
        expect(
          await newActor(input, db, s.stranger, embed).all(
            userCtx(s.stranger),
            input,
          ),
        ).toEqual([]);
        expect(embed).not.toHaveBeenCalled();
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* §1.5 keying                                                         */
  /* ------------------------------------------------------------------ */

  describe("the viewer is in the key only when the search is viewer-scoped", () => {
    it("shares one activation for an unfiltered search", async () => {
      const a = "11111111-1111-4111-8111-111111111111";
      const b = "22222222-2222-4222-8222-222222222222";
      const input: PlaceSearchInput = { query: "wine bar" };
      expect(placeSearchActorId(input, a)).toBe(placeSearchActorId(input, b));
    });

    it("splits activations for a tier-list-filtered or visit-filtered search", () => {
      const a = "11111111-1111-4111-8111-111111111111";
      const b = "22222222-2222-4222-8222-222222222222";
      const tier = "33333333-3333-4333-8333-333333333333";
      for (const input of [
        { query: "wine bar", tierListIds: [tier] },
        { query: "wine bar", visitStatus: "visited" as const },
      ] satisfies PlaceSearchInput[]) {
        expect(placeSearchActorId(input, a)).not.toBe(
          placeSearchActorId(input, b),
        );
      }
    });

    it("filters by the viewer's own visits, not a supplied id", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const stranger = await seedUser(db);
        const place = await seedPlace(db, { name: "Vino", lng: -83, lat: 40 });
        await seedVisit(db, owner, place, true);

        const input: PlaceSearchInput = {
          query: "Vino",
          visitStatus: "visited",
        };
        expect(
          (await newActor(input, db, owner).all(userCtx(owner), input)).map(
            (h) => h.name,
          ),
        ).toEqual(["Vino"]);
        expect(
          await newActor(input, db, stranger).all(userCtx(stranger), input),
        ).toEqual([]);
      });
    });

    it("pages one result set without re-querying or re-embedding", async () => {
      await withTestDb(async (db) => {
        const viewer = await seedUser(db);
        for (const name of ["Vino Alpha", "Vino Beta", "Vino Gamma"]) {
          await seedPlace(db, { name, lng: -83, lat: 40 });
        }
        const input: PlaceSearchInput = { query: "Vino" };
        const embed = vi.fn<EmbedQuery>(async () => unitVector(0));
        const actor = newActor(input, db, viewer, embed);
        const ctx = userCtx(viewer);

        const first = await actor.results(ctx, input, {
          first: 2,
          after: null,
        });
        const second = await actor.results(ctx, input, {
          first: 2,
          after: first.entries.at(-1)?.cursor ?? null,
        });
        const whole = await actor.all(ctx, input);

        expect(first.entries).toHaveLength(2);
        expect([
          ...first.entries.map((e) => e.node.name),
          ...second.entries.map((e) => e.node.name),
        ]).toEqual(whole.map((hit) => hit.name));
        expect(actor.searchRuns).toBe(1);
        expect(embed).toHaveBeenCalledTimes(1);
      });
    });
  });

  it("refuses an anonymous caller", async () => {
    await withTestDb(async (db) => {
      const input: PlaceSearchInput = { query: "Vino" };
      await expect(
        newActor(input, db, null).all(userCtx(null), input),
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
