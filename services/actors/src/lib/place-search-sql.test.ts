/**
 * **`target-stack.md` §7's live authorization hole, closed and proved.**
 *
 * > `search_places_adaptive_cluster` reads `tier_list_items` inside a
 * > `SECURITY INVOKER` function so tier-list privacy is not enforced on the map
 *
 * This file does three things, in order:
 *
 *  1. **Reproduces the hole** by calling the ported SQL function directly with
 *     a private tier list's id, as `performStandardSearch` does today, and
 *     asserting that a stranger gets the owner's places back. Without this the
 *     rest of the file proves nothing: a test that only shows the fixed path
 *     returning empty cannot distinguish "the gate works" from "the fixture is
 *     wrong".
 *  2. **Closes it** through `searchPlacesAdaptiveCluster`, over the full
 *     owner / friend / stranger matrix on all three privacies.
 *  3. **Keeps it closed** with a static assertion that no other module in
 *     `services/actors/src` names either tier-list-reading SQL function — so C2's
 *     `MapActor`, and anything after it, cannot route around the gate.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Ctx } from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "./db.ts";
import type { ClusteredPlaceRow } from "./place-search-sql.ts";
import {
  decodePoint,
  searchPlacesAdaptiveCluster,
  searchPlacesHybrid,
} from "./place-search-sql.ts";
import {
  seedFriendship,
  seedPlace,
  seedTierList,
  seedTierListPlace,
  seedVisit,
} from "./search-testing.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "./testing.ts";
import {
  resolveTierListFilter,
  visibleTierListIds,
} from "./tier-list-visibility.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string | null): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

/** A ~1km box around the fixture places: below the 2km "never cluster" zoom. */
const BOUNDS = {
  west: -83.01,
  south: 39.99,
  east: -82.99,
  north: 40.01,
} as const;

/**
 * Owner, friend, stranger; a tier list at `privacy` holding one place, and a
 * second place that is *not* on any tier list so an unfiltered search has
 * something else to return.
 */
const scenario = async (
  db: DbOrTx,
  privacy: "PUBLIC" | "FRIENDS" | "PRIVATE",
) => {
  const owner = await seedUser(db);
  const friend = await seedUser(db);
  const stranger = await seedUser(db);
  await seedFriendship(db, owner, friend);

  const listed = await seedPlace(db, {
    name: "Secret Wine Bar",
    lng: -83.0,
    lat: 40.0,
  });
  const unlisted = await seedPlace(db, {
    name: "Public Coffee Shop",
    lng: -83.001,
    lat: 40.001,
    primaryCategory: "coffee_shop",
  });

  const tierListId = await seedTierList(db, { createdById: owner, privacy });
  await seedTierListPlace(db, tierListId, listed);

  return { owner, friend, stranger, tierListId, listed, unlisted };
};

describe.skipIf(skip)(
  "the map path and tier-list privacy (target-stack §7)",
  () => {
    afterAll(closeTestDb);

    /* ------------------------------------------------------------------ */
    /* 1. The hole, reproduced                                             */
    /* ------------------------------------------------------------------ */

    describe("the ported SQL leaks on its own — this is the gap A3b recorded", () => {
      it("returns a PRIVATE tier list's places to a stranger who knows the id", async () => {
        await withTestDb(async (db) => {
          const s = await scenario(db, "PRIVATE");
          // Exactly what `performStandardSearch` does today: the client's
          // `tierListIds` go straight into the function.
          const { rows } = await db.execute<{ id: string; name: string }>(sql`
          select id, name from public.search_places_adaptive_cluster(
            ${BOUNDS.west}::float8, ${BOUNDS.south}::float8,
            ${BOUNDS.east}::float8, ${BOUNDS.north}::float8,
            null::text[], null::float8, null::text, null::uuid, 500::int,
            ${`{${s.tierListId}}`}::uuid[]
          )
        `);
          expect(rows.map((row) => row.name)).toEqual(["Secret Wine Bar"]);
        });
      });
    });

    /* ------------------------------------------------------------------ */
    /* 2. The gate                                                         */
    /* ------------------------------------------------------------------ */

    describe("`searchPlacesAdaptiveCluster` enforces `canSeeTierList`", () => {
      const names = (rows: readonly { readonly name: string }[]) =>
        rows.map((row) => row.name);

      const run = async (db: DbOrTx, ctx: Ctx, tierListId: string) =>
        searchPlacesAdaptiveCluster(db, ctx, {
          bounds: BOUNDS,
          categoryFilter: [],
          minRating: null,
          visitStatusFilter: null,
          resultLimit: 500,
          tierListFilter: await resolveTierListFilter(db, ctx, [tierListId]),
        });

      it("PRIVATE: the owner sees it; friend and stranger get nothing", async () => {
        await withTestDb(async (db) => {
          const s = await scenario(db, "PRIVATE");
          expect(names(await run(db, userCtx(s.owner), s.tierListId))).toEqual([
            "Secret Wine Bar",
          ]);
          expect(names(await run(db, userCtx(s.friend), s.tierListId))).toEqual(
            [],
          );
          expect(
            names(await run(db, userCtx(s.stranger), s.tierListId)),
          ).toEqual([]);
        });
      });

      it("FRIENDS: owner and friend see it; stranger gets nothing", async () => {
        await withTestDb(async (db) => {
          const s = await scenario(db, "FRIENDS");
          expect(names(await run(db, userCtx(s.owner), s.tierListId))).toEqual([
            "Secret Wine Bar",
          ]);
          expect(names(await run(db, userCtx(s.friend), s.tierListId))).toEqual(
            ["Secret Wine Bar"],
          );
          expect(
            names(await run(db, userCtx(s.stranger), s.tierListId)),
          ).toEqual([]);
        });
      });

      it("PUBLIC: all three see it", async () => {
        await withTestDb(async (db) => {
          const s = await scenario(db, "PUBLIC");
          for (const viewer of [s.owner, s.friend, s.stranger]) {
            expect(names(await run(db, userCtx(viewer), s.tierListId))).toEqual(
              ["Secret Wine Bar"],
            );
          }
        });
      });

      it("an invisible filter returns nothing — it does not silently widen", async () => {
        await withTestDb(async (db) => {
          const s = await scenario(db, "PRIVATE");
          // The trap: reducing the filter to NULL would return *both* places —
          // strictly more than the viewer asked for, from a denied filter.
          const denied = names(
            await run(db, userCtx(s.stranger), s.tierListId),
          );
          expect(denied).toEqual([]);

          const unfiltered = await searchPlacesAdaptiveCluster(
            db,
            userCtx(s.stranger),
            {
              bounds: BOUNDS,
              categoryFilter: [],
              minRating: null,
              visitStatusFilter: null,
              resultLimit: 500,
              tierListFilter: { kind: "none" },
            },
          );
          expect(names(unfiltered).sort()).toEqual([
            "Public Coffee Shop",
            "Secret Wine Bar",
          ]);
        });
      });

      it("filters a mixed request down to the visible ids", async () => {
        await withTestDb(async (db) => {
          const s = await scenario(db, "PRIVATE");
          const publicList = await seedTierList(db, {
            createdById: s.stranger,
            privacy: "PUBLIC",
          });
          await seedTierListPlace(db, publicList, s.unlisted);

          const ctx = userCtx(s.stranger);
          const filter = await resolveTierListFilter(db, ctx, [
            s.tierListId,
            publicList,
          ]);
          expect(filter).toEqual({ kind: "filter", ids: [publicList] });

          const rows = await searchPlacesAdaptiveCluster(db, ctx, {
            bounds: BOUNDS,
            categoryFilter: [],
            minRating: null,
            visitStatusFilter: null,
            resultLimit: 500,
            tierListFilter: filter,
          });
          expect(rows.map((row) => row.name)).toEqual(["Public Coffee Shop"]);
        });
      });

      it("the visit filter reads the *viewer's* interactions, never a supplied id", async () => {
        await withTestDb(async (db) => {
          const s = await scenario(db, "PUBLIC");
          await seedVisit(db, s.owner, s.listed, true);

          // The owner has visited one place; the stranger has visited nothing.
          // `filter_user_id` is taken from ctx, so the same arguments give the
          // two viewers different — and correct — answers.
          const forOwner = await searchPlacesAdaptiveCluster(
            db,
            userCtx(s.owner),
            {
              bounds: BOUNDS,
              categoryFilter: [],
              minRating: null,
              visitStatusFilter: "visited",
              resultLimit: 500,
              tierListFilter: { kind: "none" },
            },
          );
          const forStranger = await searchPlacesAdaptiveCluster(
            db,
            userCtx(s.stranger),
            {
              bounds: BOUNDS,
              categoryFilter: [],
              minRating: null,
              visitStatusFilter: "visited",
              resultLimit: 500,
              tierListFilter: { kind: "none" },
            },
          );
          expect(forOwner.map((r) => r.name)).toEqual(["Secret Wine Bar"]);
          expect(forStranger.map((r) => r.name)).toEqual([]);
        });
      });
    });

    describe("`searchPlacesHybrid` has the same hole and the same gate", () => {
      it("refuses a stranger's private tier-list filter", async () => {
        await withTestDb(async (db) => {
          const s = await scenario(db, "PRIVATE");
          const ctx = userCtx(s.stranger);

          const leaked = await db.execute<{ name: string }>(sql`
          select name from public.search_places_hybrid(
            'wine', null::text[], null::float8[],
            null::float8, null::float8, null::float8, null::float8,
            null::float8, 50::int, ${`{${s.tierListId}}`}::uuid[], null::text[]
          )
        `);
          expect(leaked.rows.map((r) => r.name)).toEqual(["Secret Wine Bar"]);

          const gated = await searchPlacesHybrid(db, {
            searchQuery: "wine",
            matchedCategories: [],
            categoryScores: [],
            bounds: null,
            minRating: null,
            resultLimit: 50,
            tierListFilter: await resolveTierListFilter(db, ctx, [
              s.tierListId,
            ]),
            filterCategories: [],
          });
          expect(gated).toEqual([]);
        });
      });
    });

    describe("`visibleTierListIds`", () => {
      it("drops ids that do not exist, indistinguishably from private ones", async () => {
        await withTestDb(async (db) => {
          const s = await scenario(db, "PRIVATE");
          const missing = "99999999-9999-4999-8999-999999999999";
          expect(
            await visibleTierListIds(db, userCtx(s.stranger), [
              s.tierListId,
              missing,
            ]),
          ).toEqual([]);
        });
      });

      it("an admin ctx bypasses the policy (§1.6)", async () => {
        await withTestDb(async (db) => {
          const s = await scenario(db, "PRIVATE");
          expect(
            await visibleTierListIds(
              db,
              { viewerId: s.stranger, kind: "admin", requestId: "r" },
              [s.tierListId],
            ),
          ).toEqual([s.tierListId]);
        });
      });
    });

    /* ------------------------------------------------------------------ */
    /* 3. The gate cannot be routed around                                 */
    /* ------------------------------------------------------------------ */

    describe("nothing else in services/actors calls the tier-list-reading SQL", () => {
      it("names `search_places_adaptive_cluster` and `search_places_hybrid` in one module only", () => {
        // `fileURLToPath(new URL(".."))` keeps a trailing slash; drop it so the
        // paths `walk` builds have exactly one separator.
        const root = fileURLToPath(new URL("..", import.meta.url)).replace(
          /\/$/,
          "",
        );
        const files: string[] = [];
        const walk = (dir: string): void => {
          for (const entry of readdirSync(dir)) {
            const path = `${dir}/${entry}`;
            if (statSync(path).isDirectory()) walk(path);
            else if (path.endsWith(".ts")) files.push(path);
          }
        };
        walk(root);

        const offenders = files
          .filter(
            (path) =>
              path !== `${root}/lib/place-search-sql.ts` &&
              // Test files are excluded, on `system-ctx.test.ts`'s precedent:
              // calling the raw function is how *this* file demonstrates the
              // gap, and how `place-search-actor.test.ts` reads the deployed
              // body back with `pg_get_functiondef`. The fence is about
              // production modules.
              !path.endsWith(".test.ts"),
          )
          .filter((path) => {
            const source = readFileSync(path, "utf8");
            return (
              source.includes("search_places_adaptive_cluster(") ||
              source.includes("search_places_hybrid(")
            );
          })
          .map((path) => path.slice(root.length));

        expect(
          offenders,
          [
            "",
            "A module outside `lib/place-search-sql.ts` calls a SQL function that",
            "reads `tier_list_items`. Both are SECURITY INVOKER and enforce no",
            "visibility of their own (target-stack.md §7); the only safe call is",
            "the wrapper, which takes a `TierListFilter` that has already been",
            "through `resolveTierListFilter`. Call that instead.",
            "",
          ].join("\n"),
        ).toEqual([]);
      });
    });

    describe("decodePoint", () => {
      it("decodes the EWKB a RETURNS TABLE geography column produces", async () => {
        await withTestDb(async (db) => {
          const s = await scenario(db, "PUBLIC");
          const rows = await searchPlacesAdaptiveCluster(db, userCtx(s.owner), {
            bounds: BOUNDS,
            categoryFilter: [],
            minRating: null,
            visitStatusFilter: null,
            resultLimit: 500,
            tierListFilter: { kind: "none" },
          });
          const bar = rows.find((row) => row.name === "Secret Wine Bar");
          const point = decodePoint(bar?.location);
          expect(point?.lng).toBeCloseTo(-83.0, 6);
          expect(point?.lat).toBeCloseTo(40.0, 6);
        });
      });
    });

    /* ------------------------------------------------------------------ */
    /* C1b — `ClusteredPlaceRow` must match the deployed function          */
    /* ------------------------------------------------------------------ */

    describe("`ClusteredPlaceRow` (C1b)", () => {
      /**
       * `satisfies Record<keyof ClusteredPlaceRow, true>` forces this object's
       * key set to be *exactly* `ClusteredPlaceRow`'s — add, remove or rename a
       * field on the type and this literal fails to typecheck. Combined with
       * the runtime assertion below (the deployed function's actual
       * `RETURNS TABLE` columns, read via `pg_get_functiondef`, not eyeballed
       * from the migration source), a drift in *either* direction — the type
       * or the SQL — fails this test.
       */
      const clusteredPlaceRowKeys = {
        id: true,
        name: true,
        location: true,
        primary_category: true,
        categories: true,
        street_address: true,
        locality: true,
        region: true,
        price_level: true,
        rating: true,
        is_verified: true,
        is_cluster: true,
        cluster_id: true,
        cluster_count: true,
        cluster_center: true,
        cluster_bounds: true,
        confidence: true,
        postcode: true,
        country_code: true,
        phone: true,
        website: true,
        email: true,
        hours: true,
        review_count: true,
        viewport_area_km2: true,
        density_per_km2: true,
        clustering_applied: true,
      } satisfies Record<keyof ClusteredPlaceRow, true>;

      it("has exactly the columns `search_places_adaptive_cluster` returns", async () => {
        await withTestDb(async (db) => {
          // The regprocedure signature is the parameter *types* only (no
          // names, no defaults) — this is the same call `DROP FUNCTION IF
          // EXISTS` in the hand-written SQL lane spells out, so it stays valid
          // across a `CREATE OR REPLACE` that only touches the body.
          const { rows } = await db.execute<{ def: string }>(sql`
            select pg_get_functiondef(
              'public.search_places_adaptive_cluster(double precision, double precision, double precision, double precision, text[], double precision, text, uuid, integer, uuid[])'::regprocedure
            ) as def
          `);
          const def = rows[0]?.def ?? "";

          const match = /RETURNS TABLE\(([^)]*)\)/.exec(def);
          if (!match?.[1]) {
            throw new Error(
              "could not find a RETURNS TABLE(...) clause in pg_get_functiondef's output — has search_places_adaptive_cluster stopped returning a table?",
            );
          }
          // Every fragment is `column_name type…` (types are never
          // comma-bearing here — `double precision`, `text[]`, `character`,
          // `geography`, `numeric`, `jsonb` — so a plain top-level split is
          // safe); the column name is the first token.
          const actualColumns = match[1]
            .split(",")
            .map((fragment) => fragment.trim().split(/\s+/)[0])
            .filter((name): name is string => !!name);

          expect(new Set(actualColumns)).toEqual(
            new Set(Object.keys(clusteredPlaceRowKeys)),
          );
          // Guards against the split producing duplicates/empties that would
          // make the Set comparison above pass for the wrong reason.
          expect(actualColumns).toHaveLength(
            Object.keys(clusteredPlaceRowKeys).length,
          );
        });
      });
    });
  },
);
