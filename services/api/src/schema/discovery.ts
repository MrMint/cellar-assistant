/**
 * `/search`'s discovery section — UI parity G31, restored at the user's
 * request (`docs/architecture/ui-parity-decisions.md`).
 *
 * The old page (`82450ad1:src/app/(authenticated)/search/page.tsx`) rendered
 * two strips under the quick links, and both had a client-shaped hole:
 *
 * - **Recent Activity** asked Hasura for `item_reviews` and `tier_list_items`
 *   with `user_id _in $userIds`, `$userIds` assembled in the browser from the
 *   friend list. Any id could go in it, and the tier-list query had no privacy
 *   filter at all — a friend's PRIVATE list showed up, name and all.
 *   `Viewer.recentActivity` takes no user id: `FriendsCollectionActor` (keyed
 *   by the viewer, refusing any other caller) reads the viewer's own friend
 *   rows and applies `canSeeTierList` / `canSeeCellar` in its SQL. Every edge
 *   below then goes through an entity loader that applies its own rule again.
 * - **Nearby Places** called `searchMapPlaces({ bounds: ±0.018°, limit: 6 })`
 *   — `search_places_adaptive_cluster`, the same SQL `mapBrowse` runs — and
 *   sorted the six by distance in the browser, then fetched summaries.
 *   `Viewer.nearbyPlaces` is that, server-side: one `MapActor.browse` (the
 *   viewer's own map actor, as `mapBrowse` addresses it), clusters dropped,
 *   sorted by great-circle distance, each hit a `Place` for the summary
 *   fields.
 *
 * Both hang off `Viewer` because both are the viewer's own view and there is
 * no argument for whose.
 */
import type {
  ActivityEntryDto,
  MapPlace,
  PlaceDto,
} from "@cellar-assistant/contracts";
import {
  ACTIVITY_DEFAULT_LIMIT,
  ACTIVITY_KINDS,
  ACTIVITY_MAX_LIMIT,
  FriendsCollectionActorDescriptor,
  isMapCluster,
  itemActorId,
  MapActorDescriptor,
  mapActorId,
  offsetPage,
  pageArgs,
  ValidationError,
  viewerCollectionActorId,
} from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";
import { CellarType } from "./cellar.ts";
import { ItemInterface, ItemReviewType } from "./item.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { LngLatInput } from "./place.ts";
import { PlaceStubType, TierListItemType } from "./tier-list.ts";
import { UserProfileType } from "./user.ts";
import { Viewer } from "./viewer.ts";

/* -------------------------------------------------------------------------- */
/* Recent activity                                                             */
/* -------------------------------------------------------------------------- */

const ActivityKindEnum = builder.enumType("ActivityKind", {
  description:
    "What happened: a bottle ADDED to a cellar, an item REVIEWED, an entry " +
    "TIER_LISTED.",
  values: ACTIVITY_KINDS,
});

const ActivityEntryType = builder
  .objectRef<ActivityEntryDto>("ActivityEntry")
  .implement({
    description:
      "One row of the viewer's discovery feed — something the viewer or one " +
      "of their friends did. Exactly one of `review`, `tierListItem` and " +
      "`cellar` is set, by `kind`.",
    fields: (t) => ({
      id: t.id({
        description: "`<kind>:<source row id>` — unique across kinds.",
        resolve: (entry) => `${entry.kind}:${entry.id}`,
      }),
      kind: t.field({ type: ActivityKindEnum, resolve: (e) => e.kind }),
      occurredAt: t.expose("occurredAt", { type: "DateTime" }),
      userId: t.exposeID("userId"),
      user: t.field({
        type: UserProfileType,
        nullable: true,
        description:
          "Who did it, through the `UserProfile` loader — one " +
          "`UserActor.getProfile` per distinct person on the page.",
        resolve: (entry) => entry.userId,
      }),
      item: t.field({
        type: ItemInterface,
        nullable: true,
        description: "The item, through the shared loader. Null for a place.",
        resolve: (entry) =>
          entry.item === null ? null : itemActorId(entry.item),
      }),
      place: t.field({
        type: PlaceStubType,
        nullable: true,
        description: "The tier-listed place, for a TIER_LISTED place entry.",
        resolve: (entry) =>
          entry.placeId === null ? null : { id: entry.placeId },
      }),
      review: t.field({
        type: ItemReviewType,
        nullable: true,
        description: "The review, for REVIEWED.",
        resolve: (entry) => entry.review,
      }),
      tierListItem: t.field({
        type: TierListItemType,
        nullable: true,
        description:
          "The entry, for TIER_LISTED. Its `tierList` resolves through the " +
          "`TierList` loader, whose actor applies `canSeeTierList` again.",
        resolve: (entry) => entry.tierListItem,
      }),
      rank: t.int({
        nullable: true,
        description:
          "1-based place in its list — band high to low, then position — " +
          "for TIER_LISTED; the old feed's `#N in <list>`.",
        resolve: (entry) => entry.rank,
      }),
      cellar: t.field({
        type: CellarType,
        nullable: true,
        description:
          "The cellar the bottle went into, for ADDED, through the `Cellar` " +
          "loader (`canSeeCellar` again).",
        resolve: (entry) => entry.cellarId,
      }),
      cellarItemId: t.exposeID("cellarItemId", { nullable: true }),
    }),
  });

const ActivityEntryConnection = builder.connectionObject(
  { type: ActivityEntryType, name: "ActivityEntryConnection" },
  { name: "ActivityEntryEdge" },
);

builder.objectField(Viewer, "recentActivity", (t) =>
  t.field({
    type: ActivityEntryConnection,
    description:
      "The /search discovery feed (UI parity G31): the newest `limit` of each " +
      "requested kind done by you or a friend, merged newest first. Whose " +
      "activity is decided server-side from your own friend list — there is " +
      "no user-id argument — and a tier-list entry appears only from a list " +
      "you may see, a bottle only from a cellar you may see.",
    args: {
      ...t.arg.connectionArgs(),
      kinds: t.arg({
        type: [ActivityKindEnum],
        required: false,
        description: "Only these kinds; omitted or empty means all three.",
      }),
      limit: t.arg.int({
        required: false,
        description:
          `Rows held per kind, 1 to ${ACTIVITY_MAX_LIMIT} inclusive; ` +
          `defaults to ${ACTIVITY_DEFAULT_LIMIT}, the old feed's. Over the ` +
          "cap is a `VALIDATION` error. Not pagination: `first`/`after` page " +
          "the merged set.",
      }),
    },
    resolve: async (viewer, args, context) => {
      const entries = await context
        .actor(
          FriendsCollectionActorDescriptor,
          viewerCollectionActorId(viewer.id),
        )
        .recentActivity({
          kinds: args.kinds ?? [],
          limit: args.limit ?? ACTIVITY_DEFAULT_LIMIT,
        });
      return connectionFromPage(offsetPage(entries, toPageArgs(args)));
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* Nearby places                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The old strip's box: `NEARBY_RADIUS_DEG = 0.018`, "~2km radius in degrees
 * (rough approximation at mid-latitudes)", either side of the point.
 */
export const NEARBY_RADIUS_DEG = 0.018;
/** The old `searchMapPlaces({ …, limit: 6 })`, and the default here. */
export const NEARBY_DEFAULT_LIMIT = 6;
/** How many the actor may hold for this field. A strip, not a map. */
export const NEARBY_MAX_LIMIT = 20;

const EARTH_RADIUS_M = 6371e3;

/** Haversine — the old `formatDistance`'s formula, in metres. */
export const distanceMeters = (
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
): number => {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(to.lat - from.lat);
  const dLng = rad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(from.lat)) * Math.cos(rad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

type NearbyPlace = {
  readonly distanceMeters: number;
  /** A stub: `Place`'s fields resolve through `loadPlace`. */
  readonly place: Pick<PlaceDto, "id">;
};

const NearbyPlaceType = builder
  .objectRef<NearbyPlace>("NearbyPlace")
  .implement({
    description: "A place near the point you asked about, and how far it is.",
    fields: (t) => ({
      distanceMeters: t.exposeFloat("distanceMeters", {
        description: "Great-circle distance from the point, in metres.",
      }),
      place: t.field({
        type: PlaceStubType,
        description:
          "The place, through `PlaceActor.get` — one call per place on the " +
          "page. The strip's summary fields (`priceLevel`, `enrichment`, " +
          "`photos`) are each one more `PlaceActor` call per place.",
        resolve: (row) => row.place,
      }),
    }),
  });

const NearbyPlaceConnection = builder.connectionObject(
  { type: NearbyPlaceType, name: "NearbyPlaceConnection" },
  { name: "NearbyPlaceEdge" },
);

builder.objectField(Viewer, "nearbyPlaces", (t) =>
  t.field({
    type: NearbyPlaceConnection,
    description:
      "The /search Nearby Places strip: places in a ±0.018° box around " +
      "`location` (the old strip's ~2km), nearest first. The same browse " +
      "`mapBrowse` runs, on your own map actor; cluster bubbles are dropped, " +
      "as the old strip dropped them.",
    args: {
      ...t.arg.connectionArgs(),
      location: t.arg({ type: LngLatInput, required: true }),
      categories: t.arg.stringList({
        required: false,
        description: "`places.categories` values, already mapped from types.",
      }),
      limit: t.arg.int({
        required: false,
        description:
          `How many features the browse holds, 1 to ${NEARBY_MAX_LIMIT}; ` +
          `defaults to ${NEARBY_DEFAULT_LIMIT}, the old strip's. Taken ` +
          "before clusters are dropped and before the distance sort, as the " +
          "old strip's was. Over the cap is a `VALIDATION` error.",
      }),
    },
    resolve: async (viewer, args, context) => {
      const { lng, lat } = args.location;
      if (
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        lng < -180 ||
        lng > 180 ||
        lat < -90 ||
        lat > 90
      ) {
        throw new ValidationError("location must lie within WGS-84 limits");
      }
      const limit = args.limit ?? NEARBY_DEFAULT_LIMIT;
      if (!Number.isInteger(limit) || limit < 1 || limit > NEARBY_MAX_LIMIT) {
        throw new ValidationError(
          `limit must be an integer in [1, ${NEARBY_MAX_LIMIT}], got ${limit}`,
        );
      }
      const clamp = (value: number, min: number, max: number) =>
        Math.min(max, Math.max(min, value));
      const page = await context
        .actor(MapActorDescriptor, mapActorId(viewer.id))
        .browse(
          {
            bounds: {
              west: clamp(lng - NEARBY_RADIUS_DEG, -180, 180),
              south: clamp(lat - NEARBY_RADIUS_DEG, -90, 90),
              east: clamp(lng + NEARBY_RADIUS_DEG, -180, 180),
              north: clamp(lat + NEARBY_RADIUS_DEG, -90, 90),
            },
            categories: args.categories ?? null,
            minRating: null,
            visitStatus: null,
            tierListIds: null,
            limit,
          },
          pageArgs({ first: limit }),
        );
      const nearby = page.entries
        .map((entry) => entry.node)
        .filter(
          (
            node,
          ): node is MapPlace & { location: { lng: number; lat: number } } =>
            !isMapCluster(node) && node.location !== null,
        )
        .map(
          (node): NearbyPlace => ({
            distanceMeters: distanceMeters({ lng, lat }, node.location),
            place: { id: node.placeId },
          }),
        )
        .sort((a, b) => a.distanceMeters - b.distanceMeters);
      return connectionFromPage(offsetPage(nearby, toPageArgs(args)));
    },
  }),
);
