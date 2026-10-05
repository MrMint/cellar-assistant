/**
 * The four ported search functions, and the only module allowed to call them.
 *
 * A3b put `search_places_hybrid`, `search_places_adaptive_cluster`,
 * `search_category_vectors` and `find_duplicate_places` into the hand-written
 * SQL lane (`packages/db/migrations/20260909043234_hand_written_sql_lane`) with
 * their bodies unchanged. Two of the four read `tier_list_items` with no
 * visibility check — `target-stack.md` §7's live hole — and C1 closes it by
 * sanitising the argument before the call (`tier-list-visibility.ts`).
 *
 * That fix is only worth anything if it cannot be routed around, so this module
 * is the choke point: `place-search-sql.test.ts` parses every file under
 * `services/actors/src` and asserts that no other one so much as names those
 * functions. C2's `MapActor` calls `searchPlacesAdaptiveCluster` here and
 * inherits the gate; it does not get to write its own SQL.
 *
 * ## Weights
 *
 * §2.3 asks for `search_places_hybrid` to be called "with every weight passed
 * as an argument from TypeScript so there is one source of truth". A3b's port
 * deliberately did **not** parameterise them, and its migration says so, so
 * today the weights exist in two places: `PLACE_SEARCH_WEIGHTS` in
 * `@cellar-assistant/contracts` (the source of truth this module asserts
 * against) and the literals in the SQL body. `assertWeightsMatchSql` reads the
 * function's source out of `pg_get_functiondef` and fails if they have drifted
 * — which turns "one source of truth" from a claim into a test, without a
 * migration that rewrites 200 lines of ported PL/pgSQL. The parameterisation
 * itself is what §9 defers to "when a ranking change is needed"; see the C1
 * report.
 *
 * ## Types
 *
 * Every function returns `RETURNS TABLE(...)`, so `db.execute` gives back plain
 * rows. `numeric` arrives as a string and `geography` as EWKB hex, so both are
 * converted here rather than in four different actors.
 */
import type { Ctx, LngLat } from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "./db.ts";
import type { TierListFilter } from "./tier-list-visibility.ts";

/* -------------------------------------------------------------------------- */
/* Row shapes                                                                  */
/* -------------------------------------------------------------------------- */

export type HybridPlaceRow = {
  readonly id: string;
  readonly name: string;
  readonly location: unknown;
  readonly primary_category: string | null;
  readonly categories: readonly string[] | null;
  readonly street_address: string | null;
  readonly locality: string | null;
  readonly region: string | null;
  readonly price_level: number | null;
  readonly rating: string | number | null;
  readonly is_verified: boolean | null;
  readonly text_rank: string | number;
  readonly trigram_similarity: string | number;
  readonly category_score: string | number;
  readonly combined_score: string | number;
};

/**
 * `search_places_adaptive_cluster`'s `RETURNS TABLE`, verbatim — pinned by
 * `place-search-sql.test.ts` against `pg_get_functiondef` so this cannot drift
 * from the deployed function again (migration-plan C1b). It shares the place
 * columns with {@link HybridPlaceRow} but **not** that type's four ranking
 * scores (`text_rank`, `trigram_similarity`, `category_score`,
 * `combined_score`) — `search_places_adaptive_cluster` returns no such
 * columns — and adds the contact/address/cluster columns it does return.
 */
export type ClusteredPlaceRow = Omit<
  HybridPlaceRow,
  "text_rank" | "trigram_similarity" | "category_score" | "combined_score"
> & {
  readonly is_cluster: boolean | null;
  readonly cluster_id: number | null;
  readonly cluster_count: number | null;
  readonly cluster_center: unknown;
  readonly cluster_bounds: unknown;
  readonly confidence: string | number | null;
  readonly postcode: string | null;
  readonly country_code: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly email: string | null;
  readonly hours: unknown;
  readonly review_count: number | null;
  readonly viewport_area_km2: number | null;
  readonly density_per_km2: number | null;
  readonly clustering_applied: boolean | null;
};

export type CategoryVectorRow = {
  readonly id: number;
  readonly label: string;
  readonly label_type: string | null;
  readonly associated_categories: readonly string[] | null;
  readonly distance: string | number;
};

export type DuplicatePlaceRow = {
  readonly id: string;
  readonly name: string;
  readonly primary_category: string | null;
  readonly location: unknown;
  readonly street_address: string | null;
  readonly locality: string | null;
  readonly similarity: string | number;
  readonly distance_m: string | number;
};

/* -------------------------------------------------------------------------- */
/* Arguments                                                                   */
/* -------------------------------------------------------------------------- */

export type Bounds = {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
};

export type HybridArgs = {
  readonly searchQuery: string;
  readonly matchedCategories: readonly string[];
  readonly categoryScores: readonly number[];
  readonly bounds: Bounds | null;
  readonly minRating: number | null;
  readonly resultLimit: number;
  /** Already through `resolveTierListFilter` — never a raw client array. */
  readonly tierListFilter: TierListFilter;
  readonly filterCategories: readonly string[];
};

export type AdaptiveClusterArgs = {
  readonly bounds: Bounds;
  readonly categoryFilter: readonly string[];
  readonly minRating: number | null;
  readonly visitStatusFilter: "visited" | "unvisited" | null;
  /**
   * The user whose `user_place_interactions` the visit filter reads. **Always
   * `ctx.viewerId`** — the old server action passed it from the request, which
   * is the same shape as §7's `item_scores` reviewer-list hole even though the
   * table it reads is per-user by construction. `searchPlacesAdaptiveCluster`
   * derives it from `ctx` and does not accept it as an argument.
   */
  readonly resultLimit: number;
  readonly tierListFilter: TierListFilter;
};

/* -------------------------------------------------------------------------- */
/* The calls                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Postgres array *literals*, always as one string parameter.
 *
 * Drizzle's `sql` template flattens a JS array into one placeholder per
 * element, so `${["bar"]}::text[]` reaches Postgres as the scalar `'bar'` and
 * fails with `malformed array literal`. Every array argument below is built as
 * a `{…}` literal for that reason. Ids are uuids and categories come from a
 * closed set, but the quoting is still done properly — a category containing a
 * comma would otherwise silently become two.
 */
const uuidArray = (ids: readonly string[]) =>
  sql`${`{${ids.join(",")}}`}::uuid[]`;

const quote = (value: string): string =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const textArray = (values: readonly string[]) =>
  values.length === 0
    ? sql`null::text[]`
    : sql`${`{${values.map(quote).join(",")}}`}::text[]`;

const floatArray = (values: readonly number[]) =>
  values.length === 0
    ? sql`null::float8[]`
    : sql`${`{${values.join(",")}}`}::float8[]`;

export const searchPlacesHybrid = async (
  db: DbOrTx,
  args: HybridArgs,
): Promise<readonly HybridPlaceRow[]> => {
  if (args.tierListFilter.kind === "empty") return [];
  const tierListIds =
    args.tierListFilter.kind === "filter"
      ? uuidArray(args.tierListFilter.ids)
      : sql`null::uuid[]`;

  const { rows } = await db.execute<HybridPlaceRow>(sql`
    select * from public.search_places_hybrid(
      ${args.searchQuery},
      ${textArray(args.matchedCategories)},
      ${floatArray(args.categoryScores)},
      ${args.bounds?.west ?? null}::float8,
      ${args.bounds?.south ?? null}::float8,
      ${args.bounds?.east ?? null}::float8,
      ${args.bounds?.north ?? null}::float8,
      ${args.minRating}::float8,
      ${args.resultLimit}::int,
      ${tierListIds},
      ${textArray(args.filterCategories)}
    )
  `);
  return rows;
};

/**
 * The map path — `target-stack.md` §7's named gap, closed.
 *
 * Two things this wrapper does that the SQL cannot: it takes the tier-list ids
 * only after `resolveTierListFilter` has reduced them to what `ctx` may see,
 * and it takes `filter_user_id` from `ctx.viewerId` rather than from the
 * caller. The second is not in §7's list but is the same shape of bug: the old
 * `performStandardSearch` passed `userId` as a query variable, so a client
 * could ask "which of *these* places has Bob visited".
 */
export const searchPlacesAdaptiveCluster = async (
  db: DbOrTx,
  ctx: Ctx,
  args: AdaptiveClusterArgs,
): Promise<readonly ClusteredPlaceRow[]> => {
  if (args.tierListFilter.kind === "empty") return [];
  const tierListIds =
    args.tierListFilter.kind === "filter"
      ? uuidArray(args.tierListFilter.ids)
      : sql`null::uuid[]`;

  // A visit filter without a viewer is meaningless, and passing `NULL` would
  // silently drop it — the same trap the tier-list filter has.
  const visitStatus =
    args.visitStatusFilter !== null && ctx.viewerId !== null
      ? args.visitStatusFilter
      : null;
  const filterUserId = visitStatus === null ? null : ctx.viewerId;
  if (args.visitStatusFilter !== null && visitStatus === null) return [];

  const { rows } = await db.execute<ClusteredPlaceRow>(sql`
    select * from public.search_places_adaptive_cluster(
      ${args.bounds.west}::float8,
      ${args.bounds.south}::float8,
      ${args.bounds.east}::float8,
      ${args.bounds.north}::float8,
      ${textArray(args.categoryFilter)},
      ${args.minRating}::float8,
      ${visitStatus}::text,
      ${filterUserId}::uuid,
      ${args.resultLimit}::int,
      ${tierListIds}
    )
  `);
  return rows;
};

export const searchCategoryVectors = async (
  db: DbOrTx,
  args: {
    readonly vectorLiteral: string;
    readonly maxDistance: number;
    readonly resultLimit: number;
  },
): Promise<readonly CategoryVectorRow[]> => {
  const { rows } = await db.execute<CategoryVectorRow>(sql`
    select * from public.search_category_vectors(
      ${args.vectorLiteral}::halfvec,
      ${args.maxDistance}::float8,
      ${args.resultLimit}::int
    )
  `);
  return rows;
};

export const findDuplicatePlaces = async (
  db: DbOrTx,
  args: {
    readonly name: string;
    readonly location: LngLat;
    readonly radiusMeters: number;
    readonly minSimilarity: number;
    readonly resultLimit: number;
  },
): Promise<readonly DuplicatePlaceRow[]> => {
  const { rows } = await db.execute<DuplicatePlaceRow>(sql`
    select * from public.find_duplicate_places(
      ${args.name},
      ${args.location.lat}::float8,
      ${args.location.lng}::float8,
      ${args.radiusMeters}::float8,
      ${args.minSimilarity}::float8,
      ${args.resultLimit}::int
    )
  `);
  return rows;
};

/* -------------------------------------------------------------------------- */
/* Conversions                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `geography(Point,4326)` comes back as EWKB hex from a `RETURNS TABLE`
 * function — `packages/db`'s `geography` custom type only decodes columns
 * selected through Drizzle's schema, and these rows are not. Little-endian
 * point, SRID present: `0101000020E6100000` then two float64s.
 */
export const decodePoint = (value: unknown): LngLat | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && "lng" in value && "lat" in value) {
    return value as LngLat;
  }
  if (typeof value !== "string" || value.length < 50) return null;
  const bytes = Buffer.from(value, "hex");
  if (bytes.length < 25) return null;
  const littleEndian = bytes.readUInt8(0) === 1;
  const lng = littleEndian ? bytes.readDoubleLE(9) : bytes.readDoubleBE(9);
  const lat = littleEndian ? bytes.readDoubleLE(17) : bytes.readDoubleBE(17);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
};

/** `numeric` crosses the wire as a string; `float8` as a number. */
export const num = (
  value: string | number | null | undefined,
): number | null =>
  value === null || value === undefined ? null : Number(value);
