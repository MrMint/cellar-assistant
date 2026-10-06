/**
 * `MapActor` — C2's acceptance (migration plan §6 "C2", §2.4, §1.5, §1.3).
 *
 * > Accept: a `tier_list_ids` filter for a private tier list the viewer can't
 * > see returns nothing (closes the current hole); the map projection contains
 * > no field the map doesn't render.
 *
 * Four things, in order:
 *
 *  1. **the projection is genuinely reduced** — asserted as an exact field set,
 *     not as "it responded";
 *  2. **tier-list privacy holds on the map path**, over owner / friend /
 *     stranger on all three privacies, through C1's gate;
 *  3. **authorization runs per turn on a warm activation** (§1.5, the rule C1
 *     added after an anonymous request got a full result set back);
 *  4. **the projection is a paging buffer, not a read cache** (§1.3, the rule
 *     B6 added after a stale cached aggregate answered a live question wrongly).
 */
import type {
  Ctx,
  MapBrowseInput,
  MapEntry,
} from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  isMapCluster,
  pageArgs,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  seedFriendship,
  seedPlace,
  seedTierList,
  seedTierListPlace,
  seedVisit,
} from "../lib/search-testing.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "../lib/testing.ts";
import { MapActor } from "./map-actor.ts";

const { skip } = await resolveTestDatabase();

const userCtx = (viewerId: string | null): Ctx => ({
  viewerId,
  kind: "user",
  requestId: "r",
});

/** A ~1km box: below the SQL's 2km "never cluster" zoom, so rows are places. */
const BOUNDS = {
  west: -83.01,
  south: 39.99,
  east: -82.99,
  north: 40.01,
} as const;

const newActor = (viewerId: string, db: DbOrTx) =>
  activate(createActor(MapActor, viewerId, db));

/** C1's `place-search-sql.test.ts` scenario, reused so the two agree. */
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
    rating: 4.5,
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

const browseAll = (
  db: DbOrTx,
  viewerId: string,
  input: Partial<MapBrowseInput> = {},
) =>
  newActor(viewerId, db).then((actor) =>
    actor.all(userCtx(viewerId), { bounds: BOUNDS, ...input }),
  );

const names = (entries: readonly MapEntry[]): string[] =>
  entries
    .flatMap((entry) => (entry.kind === "place" ? [entry.name] : []))
    .sort();

describe.skipIf(skip)("MapActor", () => {
  afterAll(closeTestDb);

  /* -------------------------------------------------------------------- */
  /* 1. The projection is reduced                                          */
  /* -------------------------------------------------------------------- */

  describe("the projection contains no field the map does not render", () => {
    /**
     * `search_places_adaptive_cluster` returns 27 columns. These nine are the
     * ones `transformToGeoJSON`, `calculateOverallQuality` and
     * `calculateItemTypeMatches` read for a browse marker; everything else is
     * either the place drawer's (fetched by id) or read by nothing.
     */
    const PLACE_FIELDS = [
      "categories",
      "confidence",
      "isVerified",
      "kind",
      "location",
      "name",
      "placeId",
      "primaryCategory",
      "rating",
    ];

    it("returns exactly the nine place fields, and no more", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PUBLIC");
        const entries = await browseAll(db, s.owner);
        const place = entries.find((entry) => entry.kind === "place");
        expect(place).toBeDefined();
        expect(Object.keys(place ?? {}).sort()).toEqual(PLACE_FIELDS);
      });
    });

    it("drops the fifteen columns the browse path never renders", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PUBLIC");
        const [place] = await browseAll(db, s.owner);
        // The drawer's block (`PlaceActor.get`), plus the three clustering
        // diagnostics no component reads at all.
        for (const dropped of [
          "street_address",
          "streetAddress",
          "locality",
          "region",
          "postcode",
          "country_code",
          "phone",
          "website",
          "email",
          "hours",
          "price_level",
          "priceLevel",
          "review_count",
          "reviewCount",
          "cluster_bounds",
          "viewport_area_km2",
          "density_per_km2",
          "clustering_applied",
        ]) {
          expect(place).not.toHaveProperty(dropped);
        }
      });
    });

    it("carries the fields the marker's icon, colour and size are computed from", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PUBLIC");
        const entries = await browseAll(db, s.owner);
        const bar = entries.find(
          (entry) => entry.kind === "place" && entry.name === "Secret Wine Bar",
        );
        expect(bar).toMatchObject({
          kind: "place",
          placeId: s.listed,
          name: "Secret Wine Bar",
          primaryCategory: "bar",
          categories: ["bar"],
          rating: 4.5,
          confidence: 0.9,
          isVerified: false,
        });
        // `location` is decoded EWKB, not the hex string the SQL returns.
        expect(bar?.kind === "place" ? bar.location?.lng : null).toBeCloseTo(
          -83.0,
          6,
        );
        expect(bar?.kind === "place" ? bar.location?.lat : null).toBeCloseTo(
          40.0,
          6,
        );
      });
    });

    it("shapes a cluster as a position and a count and nothing else", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        // A wide viewport (> 5km) drops the clustering threshold to 20; 25
        // places inside one small area cross it.
        for (let i = 0; i < 25; i += 1) {
          await seedPlace(db, {
            name: `Bar ${i}`,
            lng: -83.0 + i * 0.00001,
            lat: 40.0 + i * 0.00001,
          });
        }
        const entries = await browseAll(db, owner, {
          bounds: { west: -83.5, south: 39.5, east: -82.5, north: 40.5 },
        });
        const cluster = entries.find(isMapCluster);
        expect(cluster).toBeDefined();
        expect(Object.keys(cluster ?? {}).sort()).toEqual([
          "center",
          "clusterId",
          "count",
          "kind",
        ]);
        expect(cluster?.count).toBeGreaterThan(1);
      });
    });
  });

  /* -------------------------------------------------------------------- */
  /* 2. Tier-list visibility on the map path (target-stack §7)             */
  /* -------------------------------------------------------------------- */

  describe("tier-list privacy is enforced on the map (target-stack §7)", () => {
    it("the raw SQL still leaks — so the next test is not vacuous", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PRIVATE");
        // Exactly what `performStandardSearch` does today: the client's
        // `tierListIds` go straight into a SECURITY INVOKER function that reads
        // `tier_list_items` without knowing who is asking. A test file may name
        // the function (`place-search-sql.test.ts`'s fence excludes tests);
        // `MapActor` may not, which is the point.
        const { rows } = await db.execute<{ name: string }>(sql`
          select name from public.search_places_adaptive_cluster(
            ${BOUNDS.west}::float8, ${BOUNDS.south}::float8,
            ${BOUNDS.east}::float8, ${BOUNDS.north}::float8,
            null::text[], null::float8, null::text, null::uuid, 500::int,
            ${`{${s.tierListId}}`}::uuid[]
          )
        `);
        expect(rows.map((row) => row.name)).toEqual(["Secret Wine Bar"]);
      });
    });

    it("PRIVATE: the owner sees it; friend and stranger get nothing", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PRIVATE");
        const filter = { tierListIds: [s.tierListId] };
        expect(names(await browseAll(db, s.owner, filter))).toEqual([
          "Secret Wine Bar",
        ]);
        expect(names(await browseAll(db, s.friend, filter))).toEqual([]);
        expect(names(await browseAll(db, s.stranger, filter))).toEqual([]);
      });
    });

    it("FRIENDS: owner and friend see it; stranger gets nothing", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "FRIENDS");
        const filter = { tierListIds: [s.tierListId] };
        expect(names(await browseAll(db, s.owner, filter))).toEqual([
          "Secret Wine Bar",
        ]);
        expect(names(await browseAll(db, s.friend, filter))).toEqual([
          "Secret Wine Bar",
        ]);
        expect(names(await browseAll(db, s.stranger, filter))).toEqual([]);
      });
    });

    it("PUBLIC: all three see it", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PUBLIC");
        const filter = { tierListIds: [s.tierListId] };
        for (const viewer of [s.owner, s.friend, s.stranger]) {
          expect(names(await browseAll(db, viewer, filter))).toEqual([
            "Secret Wine Bar",
          ]);
        }
      });
    });

    it("a denied filter returns nothing — it does not widen to the viewport", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PRIVATE");
        // The trap: the SQL reads a NULL `tier_list_ids` as *no filter*, so
        // reducing a denied filter to NULL would hand back strictly more than
        // was asked for.
        expect(
          names(
            await browseAll(db, s.stranger, { tierListIds: [s.tierListId] }),
          ),
        ).toEqual([]);
        expect(names(await browseAll(db, s.stranger))).toEqual([
          "Public Coffee Shop",
          "Secret Wine Bar",
        ]);
      });
    });

    it("reduces a mixed request to the visible ids", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PRIVATE");
        const ownList = await seedTierList(db, {
          createdById: s.stranger,
          privacy: "PRIVATE",
        });
        await seedTierListPlace(db, ownList, s.unlisted);
        expect(
          names(
            await browseAll(db, s.stranger, {
              tierListIds: [s.tierListId, ownList],
            }),
          ),
        ).toEqual(["Public Coffee Shop"]);
      });
    });

    it("re-checks tier-list visibility on a warm activation (regression)", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PUBLIC");
        const input: MapBrowseInput = {
          bounds: BOUNDS,
          tierListIds: [s.tierListId],
        };
        const actor = await newActor(s.stranger, db);
        expect(names(await actor.all(userCtx(s.stranger), input))).toEqual([
          "Secret Wine Bar",
        ]);

        // The list goes PRIVATE between two turns. Because `authorize` runs
        // before the held projection, the very next turn stops answering —
        // rather than serving the warm one for the rest of the idle window.
        await db.execute(sql`
          update public.tier_lists set privacy = 'PRIVATE'::permission_type
          where id = ${s.tierListId}::uuid
        `);
        expect(names(await actor.all(userCtx(s.stranger), input))).toEqual([]);
      });
    });

    it("the visit filter reads the viewer's own interactions", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PUBLIC");
        await seedVisit(db, s.owner, s.listed, true);
        expect(
          names(await browseAll(db, s.owner, { visitStatus: "visited" })),
        ).toEqual(["Secret Wine Bar"]);
        expect(
          names(await browseAll(db, s.stranger, { visitStatus: "visited" })),
        ).toEqual([]);
      });
    });
  });

  /* -------------------------------------------------------------------- */
  /* 3. Authorization, every turn                                          */
  /* -------------------------------------------------------------------- */

  describe("authorization runs per turn, before the projection (§1.5)", () => {
    it("refuses a viewer addressing another viewer's actor", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PUBLIC");
        // Keyed by viewer is an *address*, not a credential: nothing in Dapr
        // stops this call being made.
        const actor = await newActor(s.owner, db);
        await expect(
          actor.all(userCtx(s.stranger), { bounds: BOUNDS }),
        ).rejects.toThrow(ForbiddenError);
      });
    });

    it("refuses an anonymous caller on a *warm* activation (regression)", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PUBLIC");
        const input: MapBrowseInput = { bounds: BOUNDS };
        const actor = await newActor(s.owner, db);

        expect(await actor.all(userCtx(s.owner), input)).toHaveLength(2);
        expect(actor.projectionRuns).toBe(1);

        // C1's bug, in this shape: with the check inside the query, a warm
        // activation would have served this from the buffer.
        await expect(actor.all(userCtx(null), input)).rejects.toThrow(
          ForbiddenError,
        );
        // …and a second page for the legitimate viewer still works.
        const page = await actor.browse(userCtx(s.owner), input, pageArgs());
        expect(page.entries).toHaveLength(2);
      });
    });

    it("refuses a nonsense viewport rather than clustering nonsense", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PUBLIC");
        const actor = await newActor(s.owner, db);
        for (const bounds of [
          { west: 1, south: 1, east: 1, north: 2 },
          { west: 1, south: 2, east: 2, north: 1 },
          { west: -300, south: 1, east: 2, north: 2 },
        ]) {
          await expect(actor.all(userCtx(s.owner), { bounds })).rejects.toThrow(
            ValidationError,
          );
        }
        await expect(
          actor.all(userCtx(s.owner), { bounds: BOUNDS, limit: 5000 }),
        ).rejects.toThrow(ValidationError);
      });
    });
  });

  /* -------------------------------------------------------------------- */
  /* 4. The projection is a paging buffer, not a read cache (§1.3)         */
  /* -------------------------------------------------------------------- */

  describe("the held projection is a paging buffer (§1.3)", () => {
    it("pages one browse without re-querying", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PUBLIC");
        const actor = await newActor(s.owner, db);
        const input: MapBrowseInput = { bounds: BOUNDS };

        const first = await actor.browse(userCtx(s.owner), input, {
          first: 1,
          after: null,
        });
        expect(first.entries).toHaveLength(1);
        expect(first.hasNextPage).toBe(true);
        expect(actor.projectionRuns).toBe(1);

        const second = await actor.browse(userCtx(s.owner), input, {
          first: 1,
          after: first.entries[0]?.cursor ?? null,
        });
        expect(second.entries).toHaveLength(1);
        expect(actor.projectionRuns).toBe(1);
      });
    });

    it("re-reads on a fresh request rather than trusting the buffer", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PUBLIC");
        const actor = await newActor(s.owner, db);
        const input: MapBrowseInput = { bounds: BOUNDS };
        expect(await actor.all(userCtx(s.owner), input)).toHaveLength(2);
        expect(actor.projectionRuns).toBe(1);

        // B6's failure mode: `places` belongs to `PlaceActor`, so a view actor
        // may not hold it across a fresh read (§1.3). A place added by another
        // actor must appear on the very next browse.
        await seedPlace(db, { name: "New Bar", lng: -83.002, lat: 40.002 });
        expect(await actor.all(userCtx(s.owner), input)).toHaveLength(3);
        expect(actor.projectionRuns).toBe(2);
      });
    });

    it("re-queries when a continuation page is for a different viewport", async () => {
      await withTestDb(async (db) => {
        const s = await scenario(db, "PUBLIC");
        const actor = await newActor(s.owner, db);
        const first = await actor.browse(
          userCtx(s.owner),
          { bounds: BOUNDS },
          { first: 1, after: null },
        );
        expect(actor.projectionRuns).toBe(1);
        await actor.browse(
          userCtx(s.owner),
          { bounds: BOUNDS, minRating: 4 },
          { first: 1, after: first.entries[0]?.cursor ?? null },
        );
        expect(actor.projectionRuns).toBe(2);
      });
    });
  });
});
