/**
 * `Query.mapBrowse` — C2's `MapActor`, given a door (A7f).
 *
 * ## Why this file did not exist until now
 *
 * A7 wrote the API skeleton before C2 built `MapActor`, and nothing came back
 * to wire it in. The visible consequence on `/map` was that `placeSearch` was
 * the *only* viewport field in the schema and its `query: String!` is
 * required — so the map had **no unfiltered browse and no clusters at all**.
 * Panning to a city and seeing what is there was unexpressible. That is D5's
 * single biggest gap and this field is the whole of the fix.
 *
 * `mapBrowse` is the browse; `placeSearch` stays the *search*. They are two
 * different questions ("what is in this box" vs "where is the thing I typed")
 * backed by two different SQL functions (`search_places_adaptive_cluster` vs
 * `search_places_hybrid`), and only the browse clusters.
 *
 * ## The projection is exactly C2's, and it is not widened here
 *
 * `MapPlace` is nine fields and `MapCluster` is three, and
 * `packages/contracts/src/views.ts` justifies each one against a renderer:
 * `primaryCategory` picks the marker glyph, `categories` (plural — it is the
 * whole array, not the primary repeated) drives `calculateItemTypeMatches`,
 * and `rating`/`confidence`/`isVerified` are the three inputs to
 * `calculateOverallQuality`, which decides a marker's size and opacity.
 *
 * The 18 columns the SQL also returns are deliberately absent. The address and
 * contact block belongs to the place drawer, which fetches by id through
 * `Query.place`; the three clustering diagnostics (`viewport_area_km2`,
 * `density_per_km2`, `clustering_applied`) are read by nothing. There is
 * therefore no `place: Place` link on `MapPlace` either — a marker layer draws
 * 500 features and must not be able to trigger 500 entity loads.
 *
 * ## Whose map it is, is not an argument
 *
 * A view actor is keyed by viewer id, and §1.5/C2's rule is that **the key is
 * an address, not a credential**: `ViewActorBase#requireViewerKey` refuses any
 * call whose `ctx.viewerId` is not the actor's own id, on every turn, before
 * the projection — including an `admin`, because §1.6's bypass is about seeing
 * rows a policy would hide, not about becoming somebody else.
 *
 * This resolver is the other half. It addresses `mapActorId(viewerId)` and
 * there is **no argument anywhere on this field from which a viewer could be
 * taken** — no `userId`, no `asUser`, no `filterUserId`. The visit filter reads
 * the viewer's own `user_place_interactions` and nobody else's, which closes
 * the half of target-stack §7 where today's client passes `userId` as a query
 * variable and can ask "which of these has *Bob* visited". An anonymous
 * request is refused here, before addressing, because `mapActorId` has no
 * meaningful argument to take.
 *
 * `tierListIds` *is* accepted from the client, for the same reason
 * `place-search.ts` accepts it: the client is allowed to ask, and the actor
 * decides. `resolveTierListFilter` reduces the ids to the ones the viewer may
 * see before any of them reach SQL, and a filter that resolves to nothing
 * returns an empty page rather than silently widening to the whole viewport.
 */
import type {
  MapCluster,
  MapEntry,
  MapPlace,
} from "@cellar-assistant/contracts";
import {
  ForbiddenError,
  isMapCluster,
  MAP_RESULT_CAP,
  MapActorDescriptor,
  mapActorId,
} from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { LngLatType } from "./place.ts";
import { MapBoundsInput, VisitStatusEnum } from "./place-search.ts";

/* -------------------------------------------------------------------------- */
/* The two marker shapes                                                       */
/* -------------------------------------------------------------------------- */

const MapPlaceType = builder.objectRef<MapPlace>("MapPlace").implement({
  description:
    "One place marker. Nine fields, every one of them read by the marker " +
    "renderer (§2.4); the address and contact block lives on `Place` and is " +
    "fetched by id when the drawer opens.",
  fields: (t) => ({
    id: t.exposeID("placeId", {
      description: "`places.id`. Pass to `place(id:)` for the full row.",
    }),
    name: t.exposeString("name"),
    location: t.field({
      type: LngLatType,
      nullable: true,
      description: "Null for a place with no geometry; skip it when drawing.",
      resolve: (place) => place.location,
    }),
    primaryCategory: t.exposeString("primaryCategory", {
      nullable: true,
      description: "Picks the marker glyph.",
    }),
    categories: t.exposeStringList("categories", {
      description:
        "The whole `places.categories` array — the marker's colour is a " +
        "match against the viewer's item types, not a single category.",
    }),
    rating: t.float({ nullable: true, resolve: (place) => place.rating }),
    confidence: t.float({
      nullable: true,
      description: "Marker-quality input, with `rating` and `isVerified`.",
      resolve: (place) => place.confidence,
    }),
    isVerified: t.boolean({
      nullable: true,
      resolve: (place) => place.isVerified,
    }),
  }),
});

const MapClusterType = builder.objectRef<MapCluster>("MapCluster").implement({
  description:
    "One cluster bubble: a position and a count. The SQL's three clustering " +
    "diagnostics are not exposed — nothing renders them.",
  fields: (t) => ({
    clusterId: t.exposeInt("clusterId"),
    count: t.exposeInt("count", {
      description: "Places collapsed into this bubble.",
    }),
    center: t.field({
      type: LngLatType,
      nullable: true,
      resolve: (cluster) => cluster.center,
    }),
  }),
});

/**
 * A union, not an interface: the two shapes share no field, and a union is
 * also what keeps `plugin-errors` usable on any field that returns this —
 * `directResult: true` cannot wrap a field returning an interface.
 */
const MapEntryUnion = builder.unionType("MapEntry", {
  types: [MapPlaceType, MapClusterType],
  description:
    "A marker or a cluster bubble. Which one you get is the SQL's adaptive " +
    "decision, taken from the viewport's area and density — the same viewport " +
    "returns places when zoomed in and clusters when zoomed out.",
  resolveType: (entry) =>
    isMapCluster(entry as MapEntry) ? "MapCluster" : "MapPlace",
});

const MapEntryConnection = builder.connectionObject(
  { type: MapEntryUnion, name: "MapEntryConnection" },
  { name: "MapEntryEdge" },
);

/* -------------------------------------------------------------------------- */
/* Query.mapBrowse                                                             */
/* -------------------------------------------------------------------------- */

builder.queryField("mapBrowse", (t) =>
  t.field({
    type: MapEntryConnection,
    description:
      "Browse a map viewport (MapActor) — the unfiltered counterpart to " +
      "`placeSearch`, whose `query` is required. Returns `MapPlace` markers " +
      "or `MapCluster` bubbles depending on how many places the box holds. " +
      "Signed-in only, and always the viewer's own map: the visit filter " +
      "reads the viewer's interactions and there is no argument for whose. " +
      "A `tierListIds` filter is reduced to the lists the viewer may actually " +
      "see, and returns nothing if none of them are.",
    // A7e — an error union, for the reason `pagination.ts` records.
    errors: {},
    args: {
      ...t.arg.connectionArgs(),
      bounds: t.arg({ type: MapBoundsInput, required: true }),
      categories: t.arg.stringList({
        required: false,
        description: "`places.categories` values, already mapped from types.",
      }),
      minRating: t.arg.float({ required: false }),
      visitStatus: t.arg({ type: VisitStatusEnum, required: false }),
      tierListIds: t.arg.idList({ required: false }),
      limit: t.arg.int({
        required: false,
        description:
          `How many features the actor holds, at most ${MAP_RESULT_CAP}. Not ` +
          "pagination: `first`/`after` page that set.",
      }),
    },
    resolve: async (_root, args, context) => {
      const viewerId = context.ctx.viewerId;
      // Before addressing, because `mapActorId` takes a viewer id and an
      // anonymous request has none to give. The actor refuses this too
      // (`ViewActorBase#requireViewerKey`); this is the nicer message.
      if (viewerId === null) {
        throw new ForbiddenError("sign in to browse the map");
      }
      const input = {
        bounds: {
          west: args.bounds.west,
          south: args.bounds.south,
          east: args.bounds.east,
          north: args.bounds.north,
        },
        categories: args.categories ?? null,
        minRating: args.minRating ?? null,
        visitStatus: args.visitStatus ?? null,
        tierListIds: args.tierListIds?.map(String) ?? null,
        limit: args.limit ?? null,
      };
      return connectionFromPage(
        // Keyed by the viewer and by nothing else. There is no argument that
        // could reach this call site (§2.4, §7).
        await context
          .actor(MapActorDescriptor, mapActorId(viewerId))
          .browse(input, toPageArgs(args)),
      );
    },
  }),
);
