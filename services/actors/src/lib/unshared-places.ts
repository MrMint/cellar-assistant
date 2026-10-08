/**
 * A viewer's own unshared places — the creator-only half of every place read
 * (X27 / D28).
 *
 * `20261008214724_search_functions_shared_places_only` made the three shared
 * place functions (`search_places_hybrid`, `search_places_adaptive_cluster`,
 * `find_duplicate_places`) return `approved` rows only, for everybody alike:
 * there is still no per-viewer logic in SQL (§1.6). A `pending` or `rejected`
 * place is its creator's alone, so the creator's map, search and duplicate
 * check add theirs back from here — with the viewer id taken from `ctx` by
 * the caller, never from an argument a request could steer.
 *
 * Every query below is anchored on `created_by = $viewer AND review_status <>
 * 'approved'`, which `places_unshared_by_creator_idx` (partial) answers
 * directly; the set is small by construction (25 creations a day).
 *
 * `placeVisibleTo` is the same rule as a Drizzle predicate, for the reads that
 * join `places` from somewhere else (a tier list's entries, a brand's places)
 * and must drop a row the viewer cannot see rather than surface it.
 */
import type {
  Ctx,
  DuplicateCandidate,
  LngLat,
  PlaceReviewStatus,
} from "@cellar-assistant/contracts";
import { isPlaceReviewStatus } from "@cellar-assistant/contracts";
import {
  places,
  tierListItems,
  userPlaceInteractions,
} from "@cellar-assistant/db";
import {
  and,
  desc,
  eq,
  inArray,
  ne,
  or,
  type SQL,
  sql,
} from "@cellar-assistant/db/orm";
import { bypassesPolicy } from "@cellar-assistant/policy";
import type { DbOrTx } from "./db.ts";

/** `places.review_status = 'approved'`. */
export const placeIsShared = (): SQL => eq(places.reviewStatus, "approved");

/**
 * The visibility rule as a predicate on `places`: shared, or the viewer's own.
 * A null viewer (system work, or nobody) sees shared rows only — callers that
 * bypass policy do not filter at all, so this is never asked for them.
 */
export const placeVisibleTo = (viewerId: string | null): SQL =>
  viewerId === null
    ? placeIsShared()
    : (or(placeIsShared(), eq(places.createdBy, viewerId)) as SQL);

/**
 * For raw-SQL reads that carry a place id from some other table — a tier-list
 * entry, a brand link: the row passes when its place column is null (not a
 * place row at all), or names a place `ctx` may see. `system`/`admin` see
 * everything; an anonymous viewer sees shared places only.
 *
 * A row this drops is dropped silently, never reported: a ranked list, a feed
 * or a brand page that said "one entry hidden" would be the oracle.
 */
export const placeRefVisibleSql = (ctx: Ctx, placeId: SQL): SQL =>
  placeRefVisibleToSql(
    bypassesPolicy(ctx) ? "everything" : ctx.viewerId,
    placeId,
  );

/**
 * {@link placeRefVisibleSql} for a caller that has already resolved who is
 * asking (a `VisibilityScope`): `"everything"` for `system`/`admin`, a viewer
 * id, or `null` for nobody.
 */
export const placeRefVisibleToSql = (
  viewer: string | null | "everything",
  placeId: SQL,
): SQL => {
  if (viewer === "everything") return sql`true`;
  const own =
    viewer === null ? sql`` : sql` or vp.created_by = ${viewer}::uuid`;
  return sql`(${placeId} is null or exists (
    select 1 from public.places vp
    where vp.id = ${placeId} and (vp.review_status = 'approved'${own})
  ))`;
};

/**
 * Which of `placeIds` `ctx` may *not* see — for a read that already holds the
 * ids in memory (a tier list's cached items). Empty for `system`/`admin`.
 */
export const hiddenPlaceIds = async (
  db: DbOrTx,
  ctx: Ctx,
  placeIds: readonly string[],
): Promise<ReadonlySet<string>> => {
  if (bypassesPolicy(ctx) || placeIds.length === 0) return new Set();
  const viewer = ctx.viewerId;
  const rows = await db
    .select({ id: places.id })
    .from(places)
    .where(
      and(
        inArray(places.id, [...new Set(placeIds)]),
        ne(places.reviewStatus, "approved"),
        viewer === null
          ? undefined
          : sql`${places.createdBy} is distinct from ${viewer}::uuid`,
      ),
    );
  return new Set(rows.map((row) => row.id));
};

/**
 * Whether `placeId` names a place `ctx` may see. False for an unknown id and
 * for somebody else's unshared place alike — the one answer a write that
 * takes a caller's place id (a tier-list entry, a saved place) must give.
 */
export const placeIsVisible = async (
  db: DbOrTx,
  ctx: Ctx,
  placeId: string,
): Promise<boolean> => {
  const [row] = await db
    .select({ id: places.id })
    .from(places)
    .where(
      bypassesPolicy(ctx)
        ? eq(places.id, placeId)
        : and(eq(places.id, placeId), placeVisibleTo(ctx.viewerId)),
    )
    .limit(1);
  return row !== undefined;
};

/** `created_by = viewer AND review_status <> 'approved' AND is_active`. */
const ownUnshared = (viewerId: string): SQL =>
  and(
    eq(places.createdBy, viewerId),
    ne(places.reviewStatus, "approved"),
    eq(places.isActive, true),
  ) as SQL;

const reviewStatusOf = (value: string): PlaceReviewStatus =>
  isPlaceReviewStatus(value) ? value : "pending";

/* -------------------------------------------------------------------------- */
/* Duplicates                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The viewer's own unshared places that `find_duplicate_places` would have
 * matched — same trigram similarity on the name, same radius, same floor, same
 * order — so a creator re-submitting a place they already saved is told so,
 * while nobody else learns it exists.
 */
export const ownUnsharedDuplicates = async (
  db: DbOrTx,
  viewerId: string,
  args: {
    readonly name: string;
    readonly location: LngLat;
    readonly radiusMeters: number;
    readonly minSimilarity: number;
    readonly limit: number;
  },
): Promise<readonly DuplicateCandidate[]> => {
  const point = sql`ST_SetSRID(ST_MakePoint(${args.location.lng}::float8, ${args.location.lat}::float8), 4326)::geography`;
  const similarity = sql<number>`similarity(${places.name}, ${args.name})`;
  const distance = sql<number>`ST_Distance(${places.location}, ${point})`;
  const rows = await db
    .select({
      id: places.id,
      name: places.name,
      similarity,
      distance,
    })
    .from(places)
    .where(
      and(
        ownUnshared(viewerId),
        sql`ST_DWithin(${places.location}, ${point}, ${args.radiusMeters}::float8)`,
        sql`${similarity} >= ${args.minSimilarity}::float8`,
      ),
    )
    .orderBy(desc(similarity), distance)
    .limit(args.limit);
  return rows.map((row) => ({
    placeId: row.id,
    name: row.name,
    similarity: Number(row.similarity),
    distanceMeters: Number(row.distance),
  }));
};

/* -------------------------------------------------------------------------- */
/* The map                                                                     */
/* -------------------------------------------------------------------------- */

export type UnsharedMapRow = {
  readonly id: string;
  readonly name: string;
  readonly location: LngLat;
  readonly primaryCategory: string | null;
  readonly categories: readonly string[];
  readonly rating: number | null;
  readonly confidence: number | null;
  readonly isVerified: boolean;
  readonly reviewStatus: PlaceReviewStatus;
};

/** How many of the viewer's own unshared places one viewport adds, at most. */
export const UNSHARED_MAP_LIMIT = 50;

const textArrayParam = (values: readonly string[]): SQL =>
  sql`${`{${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`}::text[]`;

/**
 * The viewer's own unshared places inside `bounds`, with the same filters the
 * map applied to the shared ones: categories (any overlap — the map's own
 * `primary_category = ANY(...)` is narrower, but a creator's place drawn under
 * a filter it partly matches is the less surprising mistake), a tier-list set
 * already narrowed by `resolveTierListFilter`, and the viewer's visit status.
 *
 * Never clustered: these are drawn as their own markers so "Under review"
 * stays visible at any zoom.
 */
export const ownUnsharedInBounds = async (
  db: DbOrTx,
  viewerId: string,
  args: {
    readonly bounds: {
      readonly west: number;
      readonly south: number;
      readonly east: number;
      readonly north: number;
    };
    readonly categories: readonly string[];
    readonly minRating: number | null;
    /** `null` = no tier-list filter; an array is an already-sanitised filter. */
    readonly tierListIds: readonly string[] | null;
    readonly visitStatus: "visited" | "unvisited" | null;
    readonly limit: number;
  },
): Promise<readonly UnsharedMapRow[]> => {
  const { west, south, east, north } = args.bounds;
  const filters: SQL[] = [
    ownUnshared(viewerId),
    sql`${places.location} && ST_MakeEnvelope(${west}::float8, ${south}::float8, ${east}::float8, ${north}::float8, 4326)::geography`,
  ];
  if (args.categories.length > 0) {
    filters.push(
      sql`${places.categories} && ${textArrayParam(args.categories)}`,
    );
  }
  if (args.minRating !== null) {
    filters.push(sql`${places.rating} >= ${args.minRating}::float8`);
  }
  if (args.tierListIds !== null) {
    if (args.tierListIds.length === 0) return [];
    filters.push(
      inArray(
        places.id,
        db
          .select({ id: sql<string>`${tierListItems.placeId}` })
          .from(tierListItems)
          .where(inArray(tierListItems.tierListId, [...args.tierListIds])),
      ),
    );
  }
  if (args.visitStatus !== null) {
    const visited = db
      .select({ id: userPlaceInteractions.placeId })
      .from(userPlaceInteractions)
      .where(
        and(
          eq(userPlaceInteractions.userId, viewerId),
          eq(userPlaceInteractions.isVisited, true),
        ),
      );
    filters.push(
      args.visitStatus === "visited"
        ? inArray(places.id, visited)
        : sql`${places.id} not in ${visited}`,
    );
  }

  const rows = await db
    .select({
      id: places.id,
      name: places.name,
      location: places.location,
      primaryCategory: places.primaryCategory,
      categories: places.categories,
      rating: places.rating,
      confidence: places.confidence,
      isVerified: places.isVerified,
      reviewStatus: places.reviewStatus,
    })
    .from(places)
    .where(and(...filters))
    .orderBy(desc(places.createdAt), places.id)
    .limit(Math.min(args.limit, UNSHARED_MAP_LIMIT));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    location: row.location,
    primaryCategory: row.primaryCategory,
    categories: row.categories,
    rating: row.rating === null ? null : Number(row.rating),
    confidence: row.confidence === null ? null : Number(row.confidence),
    isVerified: row.isVerified ?? false,
    reviewStatus: reviewStatusOf(row.reviewStatus),
  }));
};

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

export type UnsharedSearchRow = UnsharedMapRow & {
  readonly priceLevel: number | null;
  readonly streetAddress: string | null;
  readonly locality: string | null;
  readonly region: string | null;
  /** `word_similarity(query, name)`, 0..1 — the hit's whole score. */
  readonly similarity: number;
};

/** The floor `search_places_hybrid`'s trigram layer uses (`<%`'s default). */
export const UNSHARED_SEARCH_MIN_SIMILARITY = 0.6;

/**
 * The viewer's own unshared places whose *name* matches `query` — a substring,
 * or a word similarity at the trigram layer's `<%` threshold. Only the name:
 * a place nobody else can see has no category-vector signal worth borrowing,
 * and its creator searching for it is searching for what they called it.
 */
export const ownUnsharedMatching = async (
  db: DbOrTx,
  viewerId: string,
  args: {
    readonly query: string;
    readonly bounds: {
      readonly west: number;
      readonly south: number;
      readonly east: number;
      readonly north: number;
    } | null;
    readonly filterCategories: readonly string[];
    readonly minRating: number | null;
    readonly tierListIds: readonly string[] | null;
    readonly limit: number;
  },
): Promise<readonly UnsharedSearchRow[]> => {
  const query = args.query.trim();
  if (query === "") return [];
  const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`);
  const similarity = sql<number>`word_similarity(${query}, ${places.name})`;
  const filters: SQL[] = [
    ownUnshared(viewerId),
    or(
      sql`${places.name} ilike ${`%${escaped}%`}`,
      sql`${similarity} >= ${UNSHARED_SEARCH_MIN_SIMILARITY}::float8`,
    ) as SQL,
  ];
  if (args.bounds !== null) {
    const { west, south, east, north } = args.bounds;
    filters.push(
      sql`${places.location} && ST_MakeEnvelope(${west}::float8, ${south}::float8, ${east}::float8, ${north}::float8, 4326)::geography`,
    );
  }
  if (args.filterCategories.length > 0) {
    filters.push(
      sql`${places.categories} && ${textArrayParam(args.filterCategories)}`,
    );
  }
  if (args.minRating !== null) {
    filters.push(sql`${places.rating} >= ${args.minRating}::float8`);
  }
  if (args.tierListIds !== null) {
    if (args.tierListIds.length === 0) return [];
    filters.push(
      inArray(
        places.id,
        db
          .select({ id: sql<string>`${tierListItems.placeId}` })
          .from(tierListItems)
          .where(inArray(tierListItems.tierListId, [...args.tierListIds])),
      ),
    );
  }
  const rows = await db
    .select({
      id: places.id,
      name: places.name,
      location: places.location,
      primaryCategory: places.primaryCategory,
      categories: places.categories,
      rating: places.rating,
      confidence: places.confidence,
      isVerified: places.isVerified,
      reviewStatus: places.reviewStatus,
      priceLevel: places.priceLevel,
      streetAddress: places.streetAddress,
      locality: places.locality,
      region: places.region,
      similarity,
    })
    .from(places)
    .where(and(...filters))
    .orderBy(desc(similarity), places.id)
    .limit(Math.min(args.limit, UNSHARED_MAP_LIMIT));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    location: row.location,
    primaryCategory: row.primaryCategory,
    categories: row.categories,
    rating: row.rating === null ? null : Number(row.rating),
    confidence: row.confidence === null ? null : Number(row.confidence),
    isVerified: row.isVerified ?? false,
    reviewStatus: reviewStatusOf(row.reviewStatus),
    priceLevel: row.priceLevel,
    streetAddress: row.streetAddress,
    locality: row.locality,
    region: row.region,
    // A substring match on a short query can have a low word similarity; it
    // is still a name the creator typed, so it is never scored below the
    // similarity floor the shared trigram layer would have admitted it at.
    similarity: Math.max(
      Number(row.similarity),
      UNSHARED_SEARCH_MIN_SIMILARITY,
    ),
  }));
};
