/**
 * `MapActor(viewerId)` — C2 (migration plan §2.4).
 *
 * > | `MapActor(viewerId)` | `/map` viewport browse | calls
 * > `search_places_adaptive_cluster` with tier-list and visit filters;
 * > **tier-list visibility enforced here** (not enforced today); returns a
 * > reduced projection (id, lat/lng, name, category, rating, cluster flags) |
 *
 * This replaces `performStandardSearch` in
 * `src/app/(authenticated)/map/actions.ts`: one GraphQL call to the
 * `searchPlacesAdaptiveCluster` root field, 27 columns wide, with the client's
 * `tierListIds` and its own `userId` passed straight through as query
 * variables.
 *
 * ## It does not call the SQL — it goes through C1's gate
 *
 * `target-stack.md` §7's map hole is that `search_places_adaptive_cluster` is
 * `SECURITY INVOKER` and reads `tier_list_items` with no visibility check, so
 * knowing a private tier list's id is enough to get its places back. C1 closed
 * it by sanitising the *argument* (`lib/tier-list-visibility.ts`) behind a
 * single call site (`lib/place-search-sql.ts`), and left a static fence:
 * `place-search-sql.test.ts` asserts that no other module under
 * `services/actors/src` so much as names either tier-list-reading function.
 *
 * So this actor calls `searchPlacesAdaptiveCluster(db, ctx, …)` and inherits
 * the gate. It does not get to write its own SQL, and the fence test fails —
 * correctly — if a later change tries. The same wrapper takes `filter_user_id`
 * from `ctx.viewerId` rather than from the request, which closes the second
 * half of the same bug: today's client passes `userId` as a query variable, so
 * it can ask "which of these places has *Bob* visited".
 *
 * ## The filter is re-resolved every turn, and a denied filter is not a null one
 *
 * `authorize` (in `ViewActorBase`, before the held projection) re-runs
 * `resolveTierListFilter` on every call. Two reasons, both load-bearing:
 *
 *  - a tier list that goes PRIVATE between two pages stops answering at once,
 *    rather than at the end of the idle window;
 *  - the SQL treats `tier_list_ids IS NULL` as *no tier-list filter at all*, so
 *    reducing a denied filter to `NULL` would silently widen "these 12 places"
 *    to "every place in the viewport". A filter the viewer may not see is
 *    `"empty"` — an empty page, decided fresh each turn and never held.
 *
 * ## What the projection contains, and why it is smaller than it looks
 *
 * `MapPlace` keeps nine fields out of 27 and `MapCluster` keeps three. The
 * justification is in `packages/contracts/src/views.ts`: every kept field is
 * read by `transformToGeoJSON` or by one of the two scoring functions that
 * decide a marker's icon, colour, size and opacity. The address and contact
 * block belongs to the place drawer, which fetches the place by id; the three
 * clustering diagnostics (`viewport_area_km2`, `density_per_km2`,
 * `clustering_applied`) are read by nothing in the frontend at all.
 *
 * The marker-relevance normalisation stays a rendering decision in D5, exactly
 * as `PlaceSearchActor` left it — which is why `rating`, `confidence`,
 * `isVerified` and `categories` are in the projection rather than a
 * server-computed score.
 */
import type {
  ActorCategory,
  Ctx,
  MapActorInterface,
  MapBrowseInput,
  MapEntry,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  MAP_RESULT_CAP,
  MapActorDescriptor,
  searchHash,
  ValidationError,
} from "@cellar-assistant/contracts";
import { requireSignedIn } from "../lib/guards.ts";
import {
  type ClusteredPlaceRow,
  decodePoint,
  num,
  searchPlacesAdaptiveCluster,
} from "../lib/place-search-sql.ts";
import { resolveTierListFilter } from "../lib/tier-list-visibility.ts";
import { ViewActorBase } from "../lib/view-actor-base.ts";

export class MapActor
  extends ViewActorBase<MapBrowseInput, MapEntry>
  implements MapActorInterface
{
  static readonly category: ActorCategory = MapActorDescriptor.category;

  /** §2.4's `browse`, paged (§1.5: there is no unbounded read). */
  async browse(
    ctx: Ctx,
    input: MapBrowseInput,
    page: PageArgs,
  ): Promise<Page<MapEntry>> {
    return this.pageOf(ctx, input, page);
  }

  /**
   * The whole capped viewport in one call — what the map itself wants, since a
   * marker layer draws every feature at once. Still bounded: the SQL caps at
   * `MAP_RESULT_CAP` and `requireLimit` refuses anything larger.
   */
  async all(ctx: Ctx, input: MapBrowseInput): Promise<readonly MapEntry[]> {
    return this.allOf(ctx, input);
  }

  protected projectionKey(input: MapBrowseInput): string {
    return searchHash({
      kind: "map-browse",
      bounds: input.bounds,
      categories: input.categories ?? [],
      minRating: input.minRating ?? null,
      visitStatus: input.visitStatus ?? null,
      tierListIds: input.tierListIds ?? [],
      limit: input.limit ?? MAP_RESULT_CAP,
    });
  }

  /**
   * **Every turn**, before the held projection (§1.5).
   *
   * `ViewActorBase` has already refused any caller whose `ctx.viewerId` is not
   * this actor's id, so this adds the rules that depend on the *input*.
   */
  protected override async authorize(
    ctx: Ctx,
    input: MapBrowseInput,
  ): Promise<"allow" | "empty"> {
    requireSignedIn(ctx, "browse the map");
    requireBounds(input.bounds);
    requireLimit(input.limit ?? MAP_RESULT_CAP);
    // A visit filter with nobody to filter by is an empty answer, never an
    // unfiltered one — the same trap the tier-list filter has.
    if (input.visitStatus != null && ctx.viewerId === null) return "empty";
    const filter = await resolveTierListFilter(this.db, ctx, input.tierListIds);
    return filter.kind === "empty" ? "empty" : "allow";
  }

  protected async project(
    ctx: Ctx,
    input: MapBrowseInput,
  ): Promise<readonly MapEntry[]> {
    // `authorize` has already turned an all-invisible filter into an empty
    // answer; this is the call whose *ids* reach the SQL. Re-resolved rather
    // than carried over, because a `TierListFilter` is derived from rows this
    // actor does not own and must not cache (§1.3).
    const tierListFilter = await resolveTierListFilter(
      this.db,
      ctx,
      input.tierListIds,
    );
    if (tierListFilter.kind === "empty") return [];

    const rows = await searchPlacesAdaptiveCluster(this.db, ctx, {
      bounds: input.bounds,
      categoryFilter: input.categories ?? [],
      minRating: input.minRating ?? null,
      visitStatusFilter: input.visitStatus ?? null,
      resultLimit: requireLimit(input.limit ?? MAP_RESULT_CAP),
      tierListFilter,
    });

    return rows.map(toMapEntry);
  }
}

/**
 * One row → one marker. The `is_cluster` branch is the SQL's own: a clustered
 * row carries `cluster_id`/`cluster_count`/`cluster_center` and leaves the
 * place columns null, and a place row the reverse.
 */
const toMapEntry = (row: ClusteredPlaceRow): MapEntry =>
  row.is_cluster === true
    ? {
        kind: "cluster",
        clusterId: row.cluster_id ?? 0,
        count: row.cluster_count ?? 0,
        center: decodePoint(row.cluster_center),
      }
    : {
        kind: "place",
        placeId: row.id,
        name: row.name,
        location: decodePoint(row.location),
        primaryCategory: row.primary_category,
        categories: row.categories ?? [],
        rating: num(row.rating),
        confidence: num(row.confidence),
        isVerified: row.is_verified,
      };

/**
 * A viewport has to be a real box. `search_places_adaptive_cluster` derives its
 * clustering thresholds from the viewport's area and largest dimension, so a
 * degenerate or inverted box does not fail — it silently picks a nonsense
 * clustering regime, which is worse.
 */
const requireBounds = (bounds: MapBrowseInput["bounds"]): void => {
  const finite = [bounds.west, bounds.south, bounds.east, bounds.north].every(
    (value) => Number.isFinite(value),
  );
  if (!finite) {
    throw new ValidationError("map bounds must be four finite numbers");
  }
  if (bounds.west >= bounds.east || bounds.south >= bounds.north) {
    throw new ValidationError(
      `map bounds must satisfy west < east and south < north, got ` +
        `[${bounds.west}, ${bounds.south}, ${bounds.east}, ${bounds.north}]`,
    );
  }
  if (
    bounds.west < -180 ||
    bounds.east > 180 ||
    bounds.south < -90 ||
    bounds.north > 90
  ) {
    throw new ValidationError("map bounds must lie within WGS-84 limits");
  }
};

const requireLimit = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > MAP_RESULT_CAP) {
    throw new ValidationError(
      `limit must be an integer in [1, ${MAP_RESULT_CAP}], got ${value}`,
    );
  }
  return value;
};
