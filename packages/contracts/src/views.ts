/**
 * View actors (migration plan §2.4; workstream C2).
 *
 * The sixth actor category, and the only one invented for a *screen* rather
 * than for a piece of the domain. Two of them:
 *
 * | Actor | Serves |
 * |---|---|
 * | `MapActor(viewerId)` | `/map` viewport browse |
 * | `RankingsActor(viewerId)` | `/rankings` |
 *
 * Both write nothing (§1.1), both are keyed by the viewer, and both return a
 * projection shaped like the screen instead of like a table.
 *
 * ## Keyed by the viewer is not the same as authorized
 *
 * The key is an *address*, not a credential — nothing about Dapr stops one
 * viewer's request being routed to `MapActor(someone-else)`. So the actor id
 * being a user id buys exactly one thing: cache isolation. Every turn still
 * checks `ctx` (§1.5, added after C1 shipped a warm activation that served an
 * anonymous caller), and `ViewActorBase` in `services/actors` refuses any call
 * whose `ctx.viewerId` is not the actor's own id.
 *
 * ## What a view actor may hold between turns
 *
 * §1.1's table says "screen-shaped projection", and §1.3 (added by B6 after it
 * failed in production) says an actor may cache only the tables it *writes*. A
 * view actor writes nothing, so those two rules only agree under one reading:
 * the projection is a **paging buffer**, not a read cache. A fresh request
 * always re-queries; the held projection is reused only to continue a page-walk
 * the same activation started, which is what makes an offset cursor mean
 * anything at all (`page.ts`). See `services/actors/src/lib/view-actor-base.ts`.
 *
 * ## The two live authorization gaps this file is shaped around
 *
 * `target-stack.md` §7 names both:
 *
 *  1. `search_places_adaptive_cluster` reads `tier_list_items` in a
 *     `SECURITY INVOKER` function, so tier-list privacy is not enforced on the
 *     map. Closed by C1 in `lib/tier-list-visibility.ts` +
 *     `lib/place-search-sql.ts`; `MapActor` inherits that gate and is
 *     statically forbidden from calling the SQL itself.
 *  2. The `item_scores` native query takes the reviewer list from the client,
 *     so any user can compute rankings over any reviewer set. Closed here, in
 *     the *contract*: `RankingsInput` has no uuid-array field. The client names
 *     a `RankingScope`; the ids are resolved inside the actor from `ctx` and
 *     the viewer's own `friends` rows. There is nothing to smuggle.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { ItemRef, ItemType } from "./items.ts";
import type { Page, PageArgs } from "./page.ts";
import type { LngLat } from "./places.ts";
import type { MapBounds, VisitStatusFilter } from "./search.ts";

/* -------------------------------------------------------------------------- */
/* MapActor                                                                    */
/* -------------------------------------------------------------------------- */

/** `search_places_adaptive_cluster`'s own `result_limit` default. */
export const MAP_RESULT_CAP = 500;

/**
 * What `/map` asks for when it browses a viewport.
 *
 * `tierListIds` are the ids **as the client supplied them**, exactly like
 * `PlaceSearchInput.tierListIds`: the actor reduces them to what the viewer may
 * see before any of them reach SQL. There is deliberately no `filterUserId` —
 * the visit filter reads `ctx.viewerId`'s interactions and nobody else's, which
 * is the second half of the map gap (`lib/place-search-sql.ts`).
 */
export type MapBrowseInput = {
  readonly bounds: MapBounds;
  /** `places.categories` values, already mapped from item types by the client. */
  readonly categories?: readonly string[] | null;
  readonly minRating?: number | null;
  readonly visitStatus?: VisitStatusFilter | null;
  readonly tierListIds?: readonly string[] | null;
  readonly limit?: number | null;
};

/**
 * One marker.
 *
 * **This is the reduced projection §2.4 asks for, and every field earns its
 * place in a renderer.** `search_places_adaptive_cluster` returns 27 columns;
 * the browse path renders nine of them:
 *
 * - `placeId`, `name`, `location` — the feature's id, label and geometry;
 * - `primaryCategory` — `categoryToIcon()`, the marker's glyph;
 * - `categories` — `calculateItemTypeMatches()`, the marker's colour;
 * - `rating`, `confidence`, `isVerified` — `calculateOverallQuality()`, the
 *   marker's size and opacity.
 *
 * Everything else the SQL returns is dropped: `street_address`, `locality`,
 * `region`, `postcode`, `country_code`, `phone`, `website`, `email`, `hours`,
 * `price_level`, `review_count`, `cluster_bounds`, `viewport_area_km2`,
 * `density_per_km2`, `clustering_applied`. The address and contact block is
 * read by the place drawer, which fetches the place by id (`PlaceActor.get`);
 * the three clustering diagnostics are read by nothing at all.
 */
export type MapPlace = {
  readonly kind: "place";
  readonly placeId: string;
  readonly name: string;
  readonly location: LngLat | null;
  readonly primaryCategory: string | null;
  readonly categories: readonly string[];
  readonly rating: number | null;
  readonly confidence: number | null;
  readonly isVerified: boolean | null;
};

/** One cluster bubble: a position and a count, and nothing else is drawn. */
export type MapCluster = {
  readonly kind: "cluster";
  readonly clusterId: number;
  readonly count: number;
  readonly center: LngLat | null;
};

export type MapEntry = MapPlace | MapCluster;

export const isMapCluster = (entry: MapEntry): entry is MapCluster =>
  entry.kind === "cluster";

export type MapActorInterface = {
  browse(
    ctx: Ctx,
    input: MapBrowseInput,
    page: PageArgs,
  ): Promise<Page<MapEntry>>;
  all(ctx: Ctx, input: MapBrowseInput): Promise<readonly MapEntry[]>;
};

export const MapActorDescriptor: ActorDescriptor<MapActorInterface> = {
  actorType: "MapActor",
  category: "view",
  methods: {
    browse: {},
    all: {},
  },
};

/* -------------------------------------------------------------------------- */
/* RankingsActor                                                               */
/* -------------------------------------------------------------------------- */

/** `item_scores`' `limit: 200`, preserved (§2.4 "top 200 by score then count"). */
export const RANKINGS_RESULT_CAP = 200;

/**
 * Who the average is taken over. **The whole of the fix for §7's `item_scores`
 * hole is that this is an enum and not an array of user ids.**
 *
 * The four values are exactly the four states `RankingsFilter` can be in today
 * (a two-button toggle group), so nothing the UI can express is lost:
 *
 * | Toggles | Scope |
 * |---|---|
 * | neither | `EVERYONE` |
 * | "Your Scores" | `ME` |
 * | "Friends Scores" | `FRIENDS` |
 * | both | `ME_AND_FRIENDS` |
 *
 * One behaviour deliberately does **not** carry over. Today the client builds
 * a reviewer array and an *empty* array means "no filter", so choosing
 * "Friends Scores" with no friends silently returns the global rankings —
 * a denied filter widening the answer, the same trap `resolveTierListFilter`
 * guards on the map. `FRIENDS` with no friends returns nothing.
 */
export const RANKING_SCOPES = [
  "EVERYONE",
  "ME",
  "FRIENDS",
  "ME_AND_FRIENDS",
] as const;

export type RankingScope = (typeof RANKING_SCOPES)[number];

export const isRankingScope = (value: string): value is RankingScope =>
  (RANKING_SCOPES as readonly string[]).includes(value);

export type RankingsInput = {
  readonly scope: RankingScope;
  /** `where: { type: { _in: … } }` on the old query. Null/empty = every type. */
  readonly types?: readonly ItemType[] | null;
};

/**
 * One ranked item: a typed `Item` ref plus the two aggregates.
 *
 * §2.2/Q4's rule — ids for owned lists, projections for high-cardinality
 * catalog lists — cuts this way round: the *ranking* is the projection, and the
 * item behind it is an id that Pothos dataloads through `ItemActor`. The old
 * query inlined name, vintage, brand, images, favourite count and "have I
 * reviewed this" per row through six fragments; none of that is ranking data.
 */
export type RankingEntry = {
  readonly item: ItemRef;
  /** `AVG(score)`. `item_reviews.score` is a half-star scale, 0.5–5. */
  readonly score: number;
  /** `COUNT(*)`. */
  readonly reviewCount: number;
};

export type RankingsActorInterface = {
  results(
    ctx: Ctx,
    input: RankingsInput,
    page: PageArgs,
  ): Promise<Page<RankingEntry>>;
  all(ctx: Ctx, input: RankingsInput): Promise<readonly RankingEntry[]>;
};

export const RankingsActorDescriptor: ActorDescriptor<RankingsActorInterface> =
  {
    actorType: "RankingsActor",
    category: "view",
    methods: {
      results: {},
      all: {},
    },
  };

/* -------------------------------------------------------------------------- */
/* Keys                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A view actor's id **is** the viewer id (§1.1 "keyed by: viewer id").
 *
 * Trivial, and deliberately still a function: `services/api` must not concatenate
 * an actor id by hand, and having one builder is what lets the actor assert
 * `this.key === ctx.viewerId` without the two sides drifting. An anonymous
 * viewer has no view actor to address at all, which is why the argument is
 * non-nullable — the refusal happens in the resolver, before addressing.
 */
export const mapActorId = (viewerId: string): string => viewerId;
export const rankingsActorId = (viewerId: string): string => viewerId;
