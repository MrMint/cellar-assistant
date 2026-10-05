/**
 * The place-side search fields — C1 (§2.3: `PlaceSearchActor`,
 * `DuplicatePlaceSearchActor`, `GooglePlacesActor`, `GeocodeActor`).
 *
 * Imported after `place.ts`, because every hit here links to `Place` and reuses
 * its `LngLat` object and input types rather than declaring a second pair.
 *
 * ## `tierListIds` is accepted from the client, and that is safe
 *
 * `target-stack.md` §7 records that `search_places_adaptive_cluster` reads
 * `tier_list_items` in a `SECURITY INVOKER` function, so a client that knows a
 * private tier list's id gets its places today. C1 closes it in the actor
 * layer: `PlaceSearchActor` runs the ids through `resolveTierListFilter`
 * (`canSeeTierList`, the same rule `TierListActor` enforces) before they reach
 * the SQL, and a filter the viewer cannot see returns **nothing** rather than
 * silently widening to every place in the viewport. So the argument stays on
 * this field — the client is allowed to *ask*; it is the actor that decides.
 *
 * There is deliberately **no `filterUserId` argument** for the visit filter.
 * The old `performStandardSearch` passed the user id as a query variable; the
 * actor takes it from `ctx`.
 *
 * ## `Query.duplicatePlaces` is *not* here
 *
 * B5 already declared it, pointed at `PlaceCreationActor.findDuplicates`, and
 * §2.1 says that method "will delegate to `DuplicatePlaceSearchActor` once that
 * exists". C1 made the delegation at the **resolver** instead of actor-to-actor,
 * because §8.5 forbids an entity actor calling a search actor synchronously and
 * explicitly allows "resolver -> any actor". So the field stays in `place.ts`
 * with its name, its arguments and its connection type unchanged, and only its
 * backing actor moved. `PlaceCreationActor` keeps its own copy of the check for
 * use *inside* the creation lock, which is what makes that one sound.
 *
 * ## Google costs money, so its field says whether it spent any
 *
 * `googlePlaceSuggestions` returns `charged` and `reason` alongside the
 * suggestions rather than erroring when the budget denies: an exhausted
 * autocomplete budget should render as "no suggestions", which is what the
 * function it replaces did. `BudgetActor.reserveForSearch` is the only door it
 * has, and its allow-list is what keeps a signed-in user from charging
 * anything more expensive.
 */
import type {
  ForwardGeocodeResult,
  GooglePlaceSuggestion,
  GooglePlacesSearchResult,
  PlaceSearchHit,
  ReverseGeocodeResult,
} from "@cellar-assistant/contracts";
import {
  GeocodeActorDescriptor,
  GooglePlacesActorDescriptor,
  geocodeActorId,
  googlePlacesActorId,
  offsetPage,
  PLACE_SEARCH_RESULT_CAP,
  PlaceSearchActorDescriptor,
  placeSearchActorId,
} from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { LngLatInput, LngLatType } from "./place.ts";
import { PlaceStubType } from "./tier-list.ts";

/* -------------------------------------------------------------------------- */
/* Shared inputs                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Exported for `map.ts` (A7f), which filters the same viewport with the same
 * two inputs. One declaration, not two: a second `MapBoundsInput` would be a
 * duplicate GraphQL type name, and two enums for one `VisitStatusFilter` would
 * let the pair drift.
 */
export const MapBoundsInput = builder.inputType("MapBoundsInput", {
  description: "A WGS-84 viewport. All four corners or none.",
  fields: (t) => ({
    west: t.float({ required: true }),
    south: t.float({ required: true }),
    east: t.float({ required: true }),
    north: t.float({ required: true }),
  }),
});

export const VisitStatusEnum = builder.enumType("VisitStatusFilter", {
  description:
    "Filters against the *viewer's* `user_place_interactions`. There is no " +
    "argument for whose visits to read; it is always the viewer's.",
  values: { VISITED: { value: "visited" }, UNVISITED: { value: "unvisited" } },
});

/* -------------------------------------------------------------------------- */
/* Hybrid place search                                                         */
/* -------------------------------------------------------------------------- */

const PlaceSearchResult = builder
  .objectRef<PlaceSearchHit>("PlaceSearchResult")
  .implement({
    description:
      "One hybrid-search match. The four score fields are the ranking terms " +
      "`search_places_hybrid` computed, exposed so the map can explain why a " +
      "result is where it is.",
    fields: (t) => ({
      id: t.exposeID("placeId"),
      name: t.exposeString("name"),
      location: t.field({
        type: LngLatType,
        nullable: true,
        resolve: (hit) => hit.location,
      }),
      primaryCategory: t.exposeString("primaryCategory", { nullable: true }),
      categories: t.exposeStringList("categories"),
      rating: t.float({ nullable: true, resolve: (hit) => hit.rating }),
      priceLevel: t.int({ nullable: true, resolve: (hit) => hit.priceLevel }),
      streetAddress: t.exposeString("streetAddress", { nullable: true }),
      locality: t.exposeString("locality", { nullable: true }),
      region: t.exposeString("region", { nullable: true }),
      isVerified: t.boolean({
        nullable: true,
        resolve: (hit) => hit.isVerified,
      }),
      textRank: t.exposeFloat("textRank"),
      trigramSimilarity: t.exposeFloat("trigramSimilarity"),
      categoryScore: t.exposeFloat("categoryScore"),
      combinedScore: t.exposeFloat("combinedScore", {
        description: "What the results are ordered by, descending.",
      }),
      place: t.field({
        type: PlaceStubType,
        description: "The full place, if more than the projection is needed.",
        resolve: (hit) => ({ id: hit.placeId }),
      }),
    }),
  });

const PlaceSearchConnection = builder.connectionObject(
  { type: PlaceSearchResult, name: "PlaceSearchConnection" },
  { name: "PlaceSearchEdge" },
);

builder.queryField("placeSearch", (t) =>
  t.field({
    type: PlaceSearchConnection,
    description:
      "Hybrid place search (PlaceSearchActor): the query is embedded, matched " +
      "against `category_vectors`, and the categories and their scores are " +
      "passed to `search_places_hybrid` with the viewport and rating floor. " +
      "A `tierListIds` filter is reduced to the tier lists the viewer may " +
      "actually see, and returns nothing if none of them are.",
    // A7e — an error union, for the reason `pagination.ts` records.
    errors: {},
    args: {
      ...t.arg.connectionArgs(),
      query: t.arg.string({ required: true }),
      bounds: t.arg({ type: MapBoundsInput, required: false }),
      filterCategories: t.arg.stringList({ required: false }),
      minRating: t.arg.float({ required: false }),
      tierListIds: t.arg.idList({ required: false }),
      visitStatus: t.arg({ type: VisitStatusEnum, required: false }),
      limit: t.arg.int({
        required: false,
        description:
          `How many hits the actor holds — 1 to ${PLACE_SEARCH_RESULT_CAP} ` +
          "inclusive; over the cap is a `VALIDATION` error, not a silent " +
          "clamp (A7g). Not pagination: `first`/`after` page this set.",
      }),
    },
    resolve: async (_root, args, context) => {
      const input = {
        query: args.query,
        bounds: args.bounds ?? null,
        filterCategories: args.filterCategories ?? null,
        minRating: args.minRating ?? null,
        tierListIds: args.tierListIds?.map(String) ?? null,
        visitStatus: args.visitStatus ?? null,
        limit: args.limit ?? null,
      };
      return connectionFromPage(
        await context
          .actor(
            PlaceSearchActorDescriptor,
            placeSearchActorId(input, context.ctx.viewerId),
          )
          .results(input, toPageArgs(args)),
      );
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* Google Places                                                               */
/* -------------------------------------------------------------------------- */

const GooglePlaceSuggestionType = builder
  .objectRef<GooglePlaceSuggestion>("GooglePlaceSuggestion")
  .implement({
    fields: (t) => ({
      googlePlaceId: t.exposeID("googlePlaceId"),
      name: t.exposeString("name"),
      secondaryText: t.exposeString("secondaryText", { nullable: true }),
      types: t.exposeStringList("types"),
      location: t.field({
        type: LngLatType,
        nullable: true,
        description: "Present for nearby results; absent from autocomplete.",
        resolve: (suggestion) => suggestion.location,
      }),
    }),
  });

const GoogleSuggestionConnection = builder.connectionObject(
  { type: GooglePlaceSuggestionType, name: "GooglePlaceSuggestionConnection" },
  { name: "GooglePlaceSuggestionEdge" },
);

const GooglePlacesPayload = builder
  .objectRef<GooglePlacesSearchResult>("GooglePlacesPayload")
  .implement({
    fields: (t) => ({
      // A connection even though Google caps this at 20 (§8.3: "every list
      // field is a Relay connection"), and `schema.test.ts` enforces it. The
      // page is sliced in memory; the actor was charged once.
      suggestions: t.field({
        type: GoogleSuggestionConnection,
        args: t.arg.connectionArgs(),
        resolve: (payload, args) =>
          connectionFromPage(offsetPage(payload.suggestions, toPageArgs(args))),
      }),
      charged: t.exposeBoolean("charged", {
        description:
          "False when the API budget denied the call. `suggestions` is then " +
          "empty and nothing was spent — render it as 'no suggestions', not " +
          "as an error.",
      }),
      reason: t.exposeString("reason"),
    }),
  });

const GoogleSearchModeEnum = builder.enumType("GooglePlacesSearchMode", {
  values: {
    AUTOCOMPLETE: { value: "autocomplete" },
    NEARBY: { value: "nearby" },
  },
});

builder.queryField("googlePlaceSuggestions", (t) =>
  t.field({
    type: GooglePlacesPayload,
    description:
      "Google Places autocomplete or nearby search (GooglePlacesActor). Each " +
      "distinct query at a distinct point is charged once per activation, " +
      "not once per keystroke.",
    args: {
      mode: t.arg({ type: GoogleSearchModeEnum, required: true }),
      input: t.arg.string({
        required: false,
        description: "Required for AUTOCOMPLETE, ignored for NEARBY.",
      }),
      location: t.arg({ type: LngLatInput, required: true }),
      radiusMeters: t.arg.float({ required: false }),
      maxResults: t.arg.int({ required: false }),
    },
    resolve: async (_root, args, context) => {
      const input = {
        mode: args.mode,
        input: args.input ?? null,
        location: { lng: args.location.lng, lat: args.location.lat },
        radiusMeters: args.radiusMeters ?? null,
        maxResults: args.maxResults ?? null,
      };
      return context
        .actor(
          GooglePlacesActorDescriptor,
          googlePlacesActorId(input, context.ctx.viewerId),
        )
        .search(input);
    },
  }),
);

/* -------------------------------------------------------------------------- */
/* Geocoding                                                                   */
/* -------------------------------------------------------------------------- */

const GeocodeResultType = builder
  .objectRef<NonNullable<ForwardGeocodeResult>>("GeocodeResult")
  .implement({
    fields: (t) => ({
      latitude: t.exposeFloat("latitude"),
      longitude: t.exposeFloat("longitude"),
      displayName: t.exposeString("displayName"),
    }),
  });

const ReverseGeocodeResultType = builder
  .objectRef<NonNullable<ReverseGeocodeResult>>("ReverseGeocodeResult")
  .implement({
    fields: (t) => ({
      streetAddress: t.exposeString("streetAddress", { nullable: true }),
      locality: t.exposeString("locality", { nullable: true }),
      region: t.exposeString("region", { nullable: true }),
      postcode: t.exposeString("postcode", { nullable: true }),
      countryCode: t.exposeString("countryCode", { nullable: true }),
    }),
  });

builder.queryField("geocode", (t) =>
  t.field({
    type: GeocodeResultType,
    nullable: true,
    description:
      "Forward geocode one address (GeocodeActor). Null when the geocoder " +
      "has no specific-enough match — the map's address short-circuit falls " +
      "through to a place search on null, it does not show an error.",
    args: { query: t.arg.string({ required: true }) },
    resolve: (_root, args, context) => {
      const input = { mode: "forward" as const, query: args.query };
      return context
        .actor(
          GeocodeActorDescriptor,
          geocodeActorId(input, context.ctx.viewerId),
        )
        .forward(input);
    },
  }),
);

builder.queryField("reverseGeocode", (t) =>
  t.field({
    type: ReverseGeocodeResultType,
    nullable: true,
    description: "Address components for a coordinate (GeocodeActor).",
    args: { location: t.arg({ type: LngLatInput, required: true }) },
    resolve: (_root, args, context) => {
      const input = {
        mode: "reverse" as const,
        location: { lng: args.location.lng, lat: args.location.lat },
      };
      return context
        .actor(
          GeocodeActorDescriptor,
          geocodeActorId(input, context.ctx.viewerId),
        )
        .reverse(input);
    },
  }),
);
