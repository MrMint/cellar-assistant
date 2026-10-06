/**
 * `Place`'s GraphQL surface — B5 (migration plan §2.1, §8.3).
 *
 * ## This file *extends* B7's `Place`; it does not declare a second one
 *
 * `tier-list.ts` declared a one-field `Place` stub because `TierListItem.place`
 * needed a type to point at and `PlaceActor` did not exist yet, with the
 * instruction to extend it here rather than replace it. So `PlaceStubType` is
 * imported and grown with `builder.objectFields(...)` — the same move B4 makes
 * on `Viewer` — and `index.ts` imports this module *after* `tier-list.ts`,
 * because the ref has to exist before fields can be added to it.
 *
 * The consequence is that `Place`'s backing type stays `{ id: string }`, which
 * `PlaceDto` structurally satisfies. `loadPlace` below bridges the two: given a
 * full DTO (what `Query.place` and every mutation return) it uses it directly;
 * given a bare stub (what `TierListItem.place` produces) it fetches through
 * `PlaceActor.get` and memoizes the promise on the request context, so a tier
 * list of 50 places asking for four fields each is 50 actor calls, not 200.
 *
 * A real DataLoader would make it *one* batched call, and that is what
 * `builder.loadableObject` gives `Brand` and `Item`. It is not available here:
 * the loader has to be declared when the ref is created, and this ref was
 * created in `tier-list.ts` as a plain object. Converting it is a change to
 * B7's file for a batching win that only matters once tier lists of places are
 * rendered at scale; the memo is the honest interim, and the swap — declare
 * `Place` with `builder.loadableObjectRef` in `tier-list.ts`, implement it
 * here — is mechanical when someone wants it.
 *
 * ## `googlePlaceId` is readable and unwritable
 *
 * It is on `Place` because the place page and the map both link out to Google.
 * It is on **no** input in this file, and `CreatePlaceInput` in
 * `@cellar-assistant/contracts` has no such field, so there is no path from a
 * GraphQL document to that column — `target-stack.md` §7's live gap, closed.
 * The only writer is `PlaceActor.enrichFromGoogle`, from what Google returned.
 *
 * ## `createPlace` goes through the registry, and there is no `enrichPlace`
 * ## shortcut past the budget
 *
 * `Mutation.createPlace` addresses `PlaceCreationActor`, never `PlaceActor` —
 * §2.1 says `PlaceActor.create` is "called only by `PlaceCreationActor`", and a
 * field that called it directly would skip the rate limit, the duplicate check
 * and the AI review. This mirrors `brand.ts`, which exposes `resolveBrand` and
 * deliberately no `createBrand`.
 */
import { randomUUID } from "node:crypto";
import type {
  CreateUserPlaceInput as CreateUserPlaceInputType,
  DuplicateCandidate,
  DuplicatePlaceHit,
  EnrichFromGoogleResult,
  GoogleBindingCollision,
  LngLat,
  MatchableMenuItemType,
  MenuItemMatch,
  MenuItemType,
  Page,
  PlaceBrandDto,
  PlaceBrandRelationship,
  PlaceDto,
  PlaceEnrichmentDto,
  PlaceMenuDto,
  PlaceMenuItemDto,
  PlacePhotoDto,
  PlaceReview,
  RecordedAccess,
} from "@cellar-assistant/contracts";
import {
  BrandLinksCollectionActorDescriptor,
  brandLinksCollectionActorId,
  DUPLICATE_SEARCH_MAX_RADIUS_M,
  DUPLICATE_SEARCH_MIN_SIMILARITY,
  DUPLICATE_SEARCH_RADIUS_M,
  DUPLICATE_SEARCH_RESULT_CAP,
  DuplicatePlaceSearchActorDescriptor,
  duplicatePlaceSearchActorId,
  FileActorDescriptor,
  ForbiddenError,
  GOOGLE_RESOLVED_VIA,
  MENU_ITEM_TYPES,
  mapPage,
  offsetPage,
  PLACE_BRAND_RELATIONSHIPS,
  PlaceActorDescriptor,
  PlaceCreationActorDescriptor,
  placeCreationActorId,
} from "@cellar-assistant/contracts";
import type { ApiContext } from "../context.ts";
import { Brand } from "./brand.ts";
import { builder } from "./builder.ts";
import { FileType } from "./file.ts";
import { connectionFromPage, toPageArgs } from "./pagination.ts";
import { type PatchPolicy, patch, present } from "./patch.ts";
import { PlaceStubType } from "./tier-list.ts";

/* -------------------------------------------------------------------------- */
/* Loading a Place behind the stub                                             */
/* -------------------------------------------------------------------------- */

type PlaceStub = { readonly id: string };

/** Per-request memo, so N fields on one `Place` are one `PlaceActor.get`. */
const inFlight = new WeakMap<ApiContext, Map<string, Promise<PlaceDto>>>();

const isLoaded = (parent: PlaceStub): parent is PlaceDto => "name" in parent;

const loadPlace = (
  parent: PlaceStub,
  context: ApiContext,
): PlaceDto | Promise<PlaceDto> => {
  if (isLoaded(parent)) return parent;
  let byId = inFlight.get(context);
  if (byId === undefined) {
    byId = new Map();
    inFlight.set(context, byId);
  }
  const cached = byId.get(parent.id);
  if (cached !== undefined) return cached;
  const pending = context.actor(PlaceActorDescriptor, parent.id).get();
  byId.set(parent.id, pending);
  return pending;
};

/** One `Place` field, resolved through `loadPlace`. */
const via =
  <TKey extends keyof PlaceDto>(key: TKey) =>
  async (
    parent: PlaceStub,
    _args: unknown,
    context: ApiContext,
  ): Promise<PlaceDto[TKey]> =>
    (await loadPlace(parent, context))[key];

/* -------------------------------------------------------------------------- */
/* Enums and leaf types                                                        */
/* -------------------------------------------------------------------------- */

const GoogleResolvedViaEnum = builder.enumType("GoogleResolvedVia", {
  description: "`place_google_enrichments_resolved_via_check`, verbatim.",
  values: GOOGLE_RESOLVED_VIA,
});

const MenuItemTypeEnum = builder.enumType("MenuItemType", {
  description:
    "`place_menu_items.detected_item_type` — a CHECK-constrained `text` " +
    "column, not the `item_type` enum. Everything a menu vision pass can " +
    "call a line (B8b widened the constraint to match). Every item type — " +
    "`wine`, `beer`, `spirit`, `coffee`, `sake`, `tea` — can be a *matched* " +
    "item, one FK column each; `cocktail` and `unknown` cannot, since a " +
    "cocktail matches a recipe (`menu_item_recipes`), not an item.",
  values: MENU_ITEM_TYPES,
});

const PlaceBrandRelationshipEnum = builder.enumType("PlaceBrandRelationship", {
  description: "`place_brands_relationship_type_check`, verbatim.",
  values: PLACE_BRAND_RELATIONSHIPS,
});

const EnrichmentStatusEnum = builder.enumType("PlaceEnrichmentStatus", {
  description:
    "How an enrichment turn ended. A request-driven call returns QUEUED — " +
    "eight external round-trips are not a user's turn (§8.5) — or FRESH, " +
    "synchronously, when Google's details for the place are under 30 days " +
    "old and the queued turn would have done nothing.",
  values: [
    "QUEUED",
    "ENRICHED",
    "FRESH",
    "UNRESOLVED",
    "COLLISION",
    "BUDGET_DENIED",
  ] as const,
});

/**
 * `places.location` is `geography(Point,4326)` and crosses as `{ lng, lat }` in
 * both directions — no GeoJSON, no `[lng, lat]` tuple, no WKT. See the
 * contracts module doc; the field names exist so nobody has to remember
 * PostGIS's `POINT(x y)` ordering.
 */
/** Exported for C1's `place-search.ts`, which returns the same points. */
export const LngLatType = builder.objectRef<LngLat>("LngLat").implement({
  description: "A WGS-84 point. Longitude first, matching PostGIS.",
  fields: (t) => ({
    lng: t.exposeFloat("lng"),
    lat: t.exposeFloat("lat"),
  }),
});

/** Exported for C1's `place-search.ts`: one input type, not two. */
export const LngLatInput = builder.inputType("LngLatInput", {
  description: "A WGS-84 point: lng in -180..180, lat in -90..90.",
  fields: (t) => ({
    lng: t.float({ required: true }),
    lat: t.float({ required: true }),
  }),
});

/* -------------------------------------------------------------------------- */
/* Child object types                                                          */
/* -------------------------------------------------------------------------- */

const PlaceEnrichmentType = builder
  .objectRef<PlaceEnrichmentDto>("PlaceEnrichment")
  .implement({
    description:
      "What Google said about this place, cached. Refreshed at most every " +
      "30 days; `PlaceActor.refreshFromSource` forces it.",
    fields: (t) => ({
      placeId: t.exposeID("placeId"),
      googlePlaceId: t.exposeString("googlePlaceId"),
      googleName: t.exposeString("googleName", { nullable: true }),
      googleFormattedAddress: t.exposeString("googleFormattedAddress", {
        nullable: true,
      }),
      googleRating: t.exposeFloat("googleRating", { nullable: true }),
      googleUserRatingsTotal: t.exposeInt("googleUserRatingsTotal", {
        nullable: true,
      }),
      googlePriceLevel: t.exposeInt("googlePriceLevel", { nullable: true }),
      googleWebsite: t.exposeString("googleWebsite", { nullable: true }),
      googlePhone: t.exposeString("googlePhone", { nullable: true }),
      googleOpeningHours: t.field({
        type: "JSON",
        nullable: true,
        resolve: (row) => row.googleOpeningHours,
      }),
      googleTypes: t.exposeStringList("googleTypes"),
      googleBusinessStatus: t.exposeString("googleBusinessStatus", {
        nullable: true,
      }),
      googleEditorialSummary: t.exposeString("googleEditorialSummary", {
        nullable: true,
      }),
      attributions: t.field({
        type: "JSON",
        description:
          "Google's required attribution blocks. Render them: the Places " +
          "terms require it wherever this data is shown.",
        resolve: (row) => row.attributions,
      }),
      resolvedVia: t.field({
        type: GoogleResolvedViaEnum,
        resolve: (row) => row.resolvedVia,
      }),
      detailsFetchedAt: t.expose("detailsFetchedAt", {
        type: "DateTime",
        nullable: true,
      }),
      photosFetchedAt: t.expose("photosFetchedAt", {
        type: "DateTime",
        nullable: true,
      }),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
      updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    }),
  });

const PlacePhotoType = builder
  .objectRef<PlacePhotoDto>("PlacePhoto")
  .implement({
    description: "One Google photo, downloaded and stored through FileActor.",
    fields: (t) => ({
      id: t.exposeID("id"),
      placeId: t.exposeID("placeId"),
      googlePhotoName: t.exposeString("googlePhotoName"),
      fileId: t.exposeID("fileId", {
        nullable: true,
        description:
          "`FileActor`'s id — null when only the Google reference is known.",
      }),
      /**
       * A7h: the mirror of `ItemImage.file` (`item.ts`), and for the same
       * reason — without it a `fileId` is a dead end and place photos are
       * undisplayable. `FileActor.#requireReader` (`file-actor.ts`) already
       * allows a read of any file a `place_google_photos` row references, so
       * this resolves for any viewer who can see the place; no authorization
       * moves to make it work.
       *
       * **Nullable, unlike `ItemImage.file`.** Two independent reasons, and
       * both matter:
       *
       *  1. `fileId` itself is nullable — `place_google_photos.storage_file_id`
       *     is a nullable column, and `10_place_file_fk_repoint.sql` migrates
       *     rows written by the Nhost lane, where a photo could be recorded
       *     without its bytes ever being mirrored.
       *  2. `File.url` throws `ConflictError` on an unverified file. Nullable
       *     here means such a throw nulls *this one photo* rather than the
       *     whole `photos` connection — the failure mode `items.ts` has to
       *     reason carefully about because `ItemImage.file` is `File!`.
       *
       * No batching, deliberately: `ItemImage.file` has none either (it is a
       * plain `context.actor(...).get()`), so this is one actor call per photo
       * — which is what its description tells the client.
       */
      file: t.field({
        type: FileType,
        nullable: true,
        description:
          "The mirrored object. Select `file { url }` to render it — one " +
          "actor call per photo, so ask for it only on the photos you draw. " +
          "Null when the row carries only the Google reference.",
        resolve: (photo, _args, context) =>
          photo.fileId === null
            ? null
            : context.actor(FileActorDescriptor, photo.fileId).get(),
      }),
      width: t.exposeInt("width", { nullable: true }),
      height: t.exposeInt("height", { nullable: true }),
      attributions: t.field({
        type: "JSON",
        resolve: (row) => row.attributions,
      }),
      displayOrder: t.exposeInt("displayOrder"),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
    }),
  });

const PlaceMenuType = builder.objectRef<PlaceMenuDto>("PlaceMenu").implement({
  description: "A menu attached to a place, current or superseded.",
  fields: (t) => ({
    id: t.exposeID("id"),
    placeId: t.exposeID("placeId"),
    menuType: t.exposeString("menuType", { nullable: true }),
    source: t.exposeString("source"),
    sourceUrl: t.exposeString("sourceUrl", { nullable: true }),
    discoveryMethod: t.exposeString("discoveryMethod", { nullable: true }),
    confidenceScore: t.exposeFloat("confidenceScore", { nullable: true }),
    version: t.exposeInt("version", { nullable: true }),
    isCurrent: t.exposeBoolean("isCurrent"),
    menuData: t.field({ type: "JSON", resolve: (row) => row.menuData }),
    validFrom: t.expose("validFrom", { type: "DateTime", nullable: true }),
    validUntil: t.expose("validUntil", { type: "DateTime", nullable: true }),
    createdById: t.exposeID("createdById", { nullable: true }),
    verifiedById: t.exposeID("verifiedById", { nullable: true }),
    discoveredAt: t.expose("discoveredAt", {
      type: "DateTime",
      nullable: true,
    }),
    createdAt: t.expose("createdAt", { type: "DateTime", nullable: true }),
    updatedAt: t.expose("updatedAt", { type: "DateTime", nullable: true }),
  }),
});

export const MenuItemMatchType = builder
  .objectRef<MenuItemMatch>("MenuItemMatch")
  .implement({
    description:
      "The catalog item a menu line was matched to. At most one of the six " +
      "FK columns on `place_menu_items` is ever set, so this collapses them.",
    fields: (t) => ({
      type: t.field({
        type: MenuItemTypeEnum,
        resolve: (match) => match.type as MenuItemType,
      }),
      id: t.exposeID("id"),
    }),
  });

export const PlaceMenuItemType = builder
  .objectRef<PlaceMenuItemDto>("PlaceMenuItem")
  .implement({
    description: "One line from a menu, matched or not.",
    fields: (t) => ({
      id: t.exposeID("id"),
      placeId: t.exposeID("placeId"),
      placeMenuId: t.exposeID("placeMenuId", { nullable: true }),
      menuScanId: t.exposeID("menuScanId", { nullable: true }),
      name: t.exposeString("name"),
      description: t.exposeString("description", { nullable: true }),
      price: t.exposeFloat("price", { nullable: true }),
      menuCategory: t.exposeString("menuCategory", { nullable: true }),
      detectedItemType: t.field({
        type: MenuItemTypeEnum,
        nullable: true,
        resolve: (row) => row.detectedItemType,
      }),
      confidenceScore: t.exposeFloat("confidenceScore", { nullable: true }),
      extractedAttributes: t.field({
        type: "JSON",
        nullable: true,
        resolve: (row) => row.extractedAttributes,
      }),
      matchedItem: t.field({
        type: MenuItemMatchType,
        nullable: true,
        resolve: (row) => row.matchedItem,
      }),
      matchVerifiedById: t.exposeID("matchVerifiedById", { nullable: true }),
      matchVerifiedAt: t.expose("matchVerifiedAt", {
        type: "DateTime",
        nullable: true,
      }),
      isAvailable: t.exposeBoolean("isAvailable"),
      seasonal: t.exposeBoolean("seasonal"),
      createdAt: t.expose("createdAt", { type: "DateTime", nullable: true }),
      updatedAt: t.expose("updatedAt", { type: "DateTime", nullable: true }),
    }),
  });

export const PlaceMenuItemConnection = builder.connectionObject(
  { type: PlaceMenuItemType, name: "PlaceMenuItemConnection" },
  { name: "PlaceMenuItemEdge" },
);

const PlaceBrandType = builder
  .objectRef<PlaceBrandDto>("PlaceBrand")
  .implement({
    description: "A brand this place owns, is affiliated with, or serves.",
    fields: (t) => ({
      id: t.exposeID("id"),
      placeId: t.exposeID("placeId"),
      brandId: t.exposeID("brandId"),
      relationshipType: t.field({
        type: PlaceBrandRelationshipEnum,
        resolve: (row) => row.relationshipType,
      }),
      createdAt: t.expose("createdAt", { type: "DateTime", nullable: true }),
      /**
       * A7g. `Brand.places` returns these rows, and a bare `placeId` would
       * leave the client doing exactly the second round trip per row that
       * D4 complained about for `parentBrand`.
       *
       * Free to add: `Place`'s backing type is `{ id: string }` (module doc),
       * so this is the same one-liner `duplicatePlaces`' candidate field uses,
       * and the memo below resolves any further field.
       */
      place: t.field({
        type: PlaceStubType,
        description:
          "The place itself, so a list of links needs no second query.",
        resolve: (row) => ({ id: row.placeId }),
      }),
    }),
  });

/**
 * §1.5/§8.3: *every* list read is a connection, including the ones an actor
 * hands back whole. `PlaceActor.photos`, `.menus` and `.brands` return arrays
 * — they are naturally small — so the page is cut here with `offsetPage`
 * rather than in the actor, exactly as B7 does for `ReorderBandPayload.items`.
 * The rule is enforced by `schema.test.ts`, not by convention.
 */
const PlacePhotoConnection = builder.connectionObject(
  { type: PlacePhotoType, name: "PlacePhotoConnection" },
  { name: "PlacePhotoEdge" },
);

const PlaceMenuConnection = builder.connectionObject(
  { type: PlaceMenuType, name: "PlaceMenuConnection" },
  { name: "PlaceMenuEdge" },
);

const PlaceBrandConnection = builder.connectionObject(
  { type: PlaceBrandType, name: "PlaceBrandConnection" },
  { name: "PlaceBrandEdge" },
);

/**
 * **`Brand.places` — A7g, declared from here for the same reason
 * `Brand.items` is declared from `item.ts`.**
 *
 * `brand.ts` cannot import this module (it would be a cycle through
 * `item.ts`), and this module already grows another module's ref the same way
 * (`PlaceStubType`, from `tier-list.ts`). `index.ts` imports `brand.ts` long
 * before `place.ts`, so the ref exists.
 *
 * It returns the **links**, not the places, and that is not an oversight:
 * the interesting part of a `place_brands` row is the relationship —
 * `owned_by` / `affiliated_with` / `serves` — which lives on the link and has
 * nowhere else to go. `PlaceBrand.place` above carries the place itself, so
 * one query still draws the list.
 *
 * `BrandLinksCollectionActor`, not `PlaceActor`: `place_brands` is
 * `PlaceActor`'s table, so a reverse read belongs to a collection actor
 * (§1.1, "reads any table", no cache) rather than to a new synchronous
 * §8.5 edge from `BrandActor`.
 */
builder.objectFields(Brand, (t) => ({
  places: t.field({
    type: PlaceBrandConnection,
    description:
      "Places that own, are affiliated with, or serve this brand — the " +
      "reverse of `Place.brands`. Ordered by relationship, so an owner " +
      "sorts above a stockist. Catalog data: any signed-in viewer.",
    args: t.arg.connectionArgs(),
    resolve: async (brand, args, context) => {
      const filter = { brandId: brand.id };
      return connectionFromPage(
        await context
          .actor(
            BrandLinksCollectionActorDescriptor,
            brandLinksCollectionActorId(filter),
          )
          .places(filter, toPageArgs(args)),
      );
    },
  }),
}));

/* -------------------------------------------------------------------------- */
/* The Place stub, grown                                                       */
/* -------------------------------------------------------------------------- */

builder.objectFields(PlaceStubType, (t) => ({
  name: t.string({ resolve: via("name") }),
  displayName: t.string({ nullable: true, resolve: via("displayName") }),
  categories: t.stringList({ resolve: via("categories") }),
  primaryCategory: t.string({
    nullable: true,
    description: "`categories[1]`, a generated column.",
    resolve: via("primaryCategory"),
  }),
  location: t.field({ type: LngLatType, resolve: via("location") }),
  streetAddress: t.string({ nullable: true, resolve: via("streetAddress") }),
  locality: t.string({ nullable: true, resolve: via("locality") }),
  region: t.string({ nullable: true, resolve: via("region") }),
  postcode: t.string({ nullable: true, resolve: via("postcode") }),
  countryCode: t.string({ nullable: true, resolve: via("countryCode") }),
  phone: t.string({ nullable: true, resolve: via("phone") }),
  website: t.string({ nullable: true, resolve: via("website") }),
  email: t.string({ nullable: true, resolve: via("email") }),
  hours: t.field({ type: "JSON", nullable: true, resolve: via("hours") }),
  priceLevel: t.int({ nullable: true, resolve: via("priceLevel") }),
  rating: t.float({ nullable: true, resolve: via("rating") }),
  reviewCount: t.int({ nullable: true, resolve: via("reviewCount") }),
  confidence: t.float({
    nullable: true,
    description:
      "0..1. Set by `PlaceCreationActor` from the AI review; a caller may " +
      "never choose its own.",
    resolve: via("confidence"),
  }),
  description: t.string({ nullable: true, resolve: via("description") }),
  source: t.string({
    description:
      "`'overture'` for imported reference data, `'user'` for a " +
      "place someone added. Server-set at creation.",
    resolve: via("source"),
  }),
  overtureId: t.string({ nullable: true, resolve: via("overtureId") }),
  googlePlaceId: t.string({
    nullable: true,
    description:
      "Server-owned: written only by enrichment, from what Google itself " +
      "returned, and settable from no input anywhere in this schema.",
    resolve: via("googlePlaceId"),
  }),
  isVerified: t.boolean({ resolve: via("isVerified") }),
  isActive: t.boolean({ resolve: via("isActive") }),
  accessCount: t.int({ resolve: via("accessCount") }),
  lastAccessedAt: t.field({
    type: "DateTime",
    nullable: true,
    resolve: via("lastAccessedAt"),
  }),
  createdById: t.id({ nullable: true, resolve: via("createdById") }),
  createdAt: t.field({
    type: "DateTime",
    nullable: true,
    resolve: via("createdAt"),
  }),
  updatedAt: t.field({
    type: "DateTime",
    nullable: true,
    resolve: via("updatedAt"),
  }),
  lastSyncAt: t.field({
    type: "DateTime",
    nullable: true,
    resolve: via("lastSyncAt"),
  }),

  enrichment: t.field({
    type: PlaceEnrichmentType,
    nullable: true,
    description: "Null until this place has been enriched from Google.",
    resolve: (place, _args, context) =>
      context.actor(PlaceActorDescriptor, place.id).enrichment(),
  }),
  photos: t.field({
    type: PlacePhotoConnection,
    description: "Stored Google photos, in display order.",
    args: t.arg.connectionArgs(),
    resolve: async (place, args, context) =>
      connectionFromPage(
        offsetPage(
          await context.actor(PlaceActorDescriptor, place.id).photos(),
          toPageArgs(args),
        ),
      ),
  }),
  menus: t.field({
    type: PlaceMenuConnection,
    description: "Current menu first.",
    args: t.arg.connectionArgs(),
    resolve: async (place, args, context) =>
      connectionFromPage(
        offsetPage(
          await context.actor(PlaceActorDescriptor, place.id).menus(),
          toPageArgs(args),
        ),
      ),
  }),
  brands: t.field({
    type: PlaceBrandConnection,
    args: t.arg.connectionArgs(),
    resolve: async (place, args, context) =>
      connectionFromPage(
        offsetPage(
          await context.actor(PlaceActorDescriptor, place.id).brands(),
          toPageArgs(args),
        ),
      ),
  }),
  menuItems: t.field({
    type: PlaceMenuItemConnection,
    description:
      "Paged — a scanned menu can be hundreds of lines (§1.5: no unbounded " +
      "child read).",
    args: t.arg.connectionArgs(),
    resolve: async (place, args, context) =>
      connectionFromPage(
        await context
          .actor(PlaceActorDescriptor, place.id)
          .menuItems(toPageArgs(args)),
      ),
  }),
}));

/* -------------------------------------------------------------------------- */
/* Command payloads                                                            */
/* -------------------------------------------------------------------------- */

const DuplicateCandidateType = builder
  .objectRef<DuplicateCandidate>("DuplicatePlaceCandidate")
  .implement({
    description:
      "A nearby place with a similar name. Ids only — a registry returns ids " +
      "and lets the caller fetch through `Query.place` (§1.5).",
    fields: (t) => ({
      placeId: t.exposeID("placeId"),
      name: t.exposeString("name"),
      similarity: t.exposeFloat("similarity", {
        description: "0..1, trigram similarity on the name.",
      }),
      distanceMeters: t.exposeFloat("distanceMeters"),
      place: t.field({
        type: PlaceStubType,
        description: "The candidate itself, for showing the user what exists.",
        resolve: (candidate) => ({ id: candidate.placeId }),
      }),
    }),
  });

const PlaceReviewType = builder
  .objectRef<PlaceReview>("PlaceReview")
  .implement({
    description:
      "What the AI review said. Null on `CreatePlacePayload` when no review " +
      "ran — an unconfigured or failing model degrades to no review rather " +
      "than to a fabricated approval.",
    fields: (t) => ({
      approved: t.exposeBoolean("approved"),
      confidenceAdjustment: t.exposeFloat("confidenceAdjustment", {
        description: "Clamped to -0.3..0.3 before it is applied.",
      }),
      enrichedDescription: t.exposeString("enrichedDescription", {
        nullable: true,
      }),
      suggestedCategories: t.exposeStringList("suggestedCategories", {
        nullable: true,
      }),
      rejectionReason: t.exposeString("rejectionReason", { nullable: true }),
      flags: t.exposeStringList("flags"),
    }),
  });

const DuplicatePlaceConnection = builder.connectionObject(
  { type: DuplicateCandidateType, name: "DuplicatePlaceConnection" },
  { name: "DuplicatePlaceEdge" },
);

type CreatePlacePayload = {
  readonly place: PlaceDto;
  readonly nearbyDuplicates: readonly DuplicateCandidate[];
  readonly review: PlaceReview | null;
};

const CreatePlacePayloadType = builder
  .objectRef<CreatePlacePayload>("CreatePlacePayload")
  .implement({
    description:
      "The created place, plus what the checks found. A *blocking* duplicate " +
      "is a ConflictError instead; these are the near-misses that were " +
      "allowed through and are worth showing the user.",
    fields: (t) => ({
      place: t.field({ type: PlaceStubType, resolve: (p) => p.place }),
      nearbyDuplicates: t.field({
        type: DuplicatePlaceConnection,
        args: t.arg.connectionArgs(),
        resolve: (payload, args) =>
          connectionFromPage(
            offsetPage(payload.nearbyDuplicates, toPageArgs(args)),
          ),
      }),
      review: t.field({
        type: PlaceReviewType,
        nullable: true,
        resolve: (p) => p.review,
      }),
    }),
  });

const GoogleBindingCollisionType = builder
  .objectRef<GoogleBindingCollision>("GoogleBindingCollision")
  .implement({
    description:
      "The Google id this place resolved to is already bound to a different " +
      "place row, which means the two rows are duplicates of one venue. " +
      "Routine, not exceptional — merging them is a duplicate-search " +
      "decision, so enrichment writes nothing and says whose it is.",
    fields: (t) => ({
      googlePlaceId: t.exposeString("googlePlaceId"),
      boundToPlaceId: t.exposeID("boundToPlaceId"),
      boundTo: t.field({
        type: PlaceStubType,
        resolve: (collision) => ({ id: collision.boundToPlaceId }),
      }),
    }),
  });

const EnrichPlacePayloadType = builder
  .objectRef<EnrichFromGoogleResult>("EnrichPlacePayload")
  .implement({
    description:
      "How the enrichment turn ended. A user's call returns QUEUED — the " +
      "work is an outbox row by the time this resolves — unless the place's " +
      "Google details are under 30 days old: then it returns FRESH with " +
      "`enrichment` (and its `detailsFetchedAt`) attached, and queues " +
      "nothing, because the queued turn would have skipped Google anyway.",
    fields: (t) => ({
      placeId: t.exposeID("placeId"),
      place: t.field({
        type: PlaceStubType,
        resolve: (result) => ({ id: result.placeId }),
      }),
      status: t.field({
        type: EnrichmentStatusEnum,
        resolve: (result) =>
          result.status.toUpperCase() as
            | "QUEUED"
            | "ENRICHED"
            | "FRESH"
            | "UNRESOLVED"
            | "COLLISION"
            | "BUDGET_DENIED",
      }),
      reason: t.exposeString("reason"),
      enrichment: t.field({
        type: PlaceEnrichmentType,
        nullable: true,
        resolve: (result) => result.enrichment,
      }),
      photos: t.field({
        type: PlacePhotoConnection,
        args: t.arg.connectionArgs(),
        resolve: (result, args) =>
          connectionFromPage(offsetPage(result.photos, toPageArgs(args))),
      }),
      collision: t.field({
        type: GoogleBindingCollisionType,
        nullable: true,
        resolve: (result) => result.collision,
      }),
    }),
  });

const RecordedAccessType = builder
  .objectRef<RecordedAccess>("RecordedPlaceAccess")
  .implement({
    description: "The place's own counters after a visit was recorded.",
    fields: (t) => ({
      placeId: t.exposeID("placeId"),
      place: t.field({
        type: PlaceStubType,
        resolve: (recorded) => ({ id: recorded.placeId }),
      }),
      accessCount: t.exposeInt("accessCount"),
      lastAccessedAt: t.expose("lastAccessedAt", { type: "DateTime" }),
    }),
  });

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

const CreatePlaceInput = builder.inputType("CreatePlaceInput", {
  description:
    "Everything a user may choose about a new place. Note what is absent and " +
    "cannot be added: `googlePlaceId`, `source`, `isVerified` and " +
    "`confidence` are all server-set (module doc).",
  fields: (t) => ({
    name: t.string({ required: true, description: "2–200 characters." }),
    categories: t.stringList({ required: true, description: "At least one." }),
    location: t.field({ type: LngLatInput, required: true }),
    streetAddress: t.string({ required: false }),
    locality: t.string({ required: false }),
    region: t.string({ required: false }),
    postcode: t.string({ required: false }),
    countryCode: t.string({ required: false, description: "Two letters." }),
    phone: t.string({ required: false }),
    website: t.string({
      required: false,
      description: "A bare host is accepted and gets an https:// prefix.",
    }),
    email: t.string({ required: false }),
    description: t.string({
      required: false,
      description: "Under 1000 chars.",
    }),
    placeId: t.id({
      required: false,
      description:
        "Mint it yourself to make a retried submit idempotent (§8.4); " +
        "otherwise the server does.",
    }),
  }),
});

const EnrichPlaceInput = builder.inputType("EnrichPlaceInput", {
  description:
    "`googlePlaceId` here is a *hint* from autocomplete or a nearby search, " +
    "not a binding: it still has to survive the collision check, and it can " +
    "never overwrite another place's binding.",
  fields: (t) => ({
    googlePlaceId: t.string({ required: false }),
    resolvedVia: t.field({ type: GoogleResolvedViaEnum, required: false }),
    maxPhotos: t.int({ required: false, description: "0–10, default 3." }),
  }),
});

const MenuItemMatchInput = builder.inputType("MenuItemMatchInput", {
  fields: (t) => ({
    type: t.field({ type: MenuItemTypeEnum, required: true }),
    id: t.id({ required: true }),
  }),
});

const LinkPlaceBrandInput = builder.inputType("LinkPlaceBrandInput", {
  fields: (t) => ({
    brandId: t.id({ required: true }),
    relationshipType: t.field({
      type: PlaceBrandRelationshipEnum,
      required: true,
    }),
  }),
});

const ENRICH_PLACE = {
  googlePlaceId: "keep",
  resolvedVia: "keep",
  maxPhotos: "keep",
} satisfies PatchPolicy<typeof EnrichPlaceInput.$inferInput>;

const toCreateInput = (input: {
  name: string;
  categories: string[];
  location: { lng: number; lat: number };
  streetAddress?: string | null;
  locality?: string | null;
  region?: string | null;
  postcode?: string | null;
  countryCode?: string | null;
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  description?: string | null;
  placeId?: string | null;
}): CreateUserPlaceInputType => ({
  name: input.name,
  categories: input.categories,
  location: { lng: input.location.lng, lat: input.location.lat },
  streetAddress: input.streetAddress ?? null,
  locality: input.locality ?? null,
  region: input.region ?? null,
  postcode: input.postcode ?? null,
  countryCode: input.countryCode ?? null,
  phone: input.phone ?? null,
  website: input.website ?? null,
  email: input.email ?? null,
  description: input.description ?? null,
  // Minted here when the client did not, so the mutation is retry-safe even
  // for a caller that did not think about idempotency.
  placeId: present(input.placeId) ? String(input.placeId) : randomUUID(),
});

/* -------------------------------------------------------------------------- */
/* Root fields                                                                 */
/* -------------------------------------------------------------------------- */

builder.queryField("place", (t) =>
  t.field({
    type: PlaceStubType,
    description:
      "One place by id (PlaceActor.get). Catalog data: any signed-in viewer " +
      "sees any place; an anonymous caller is refused.",
    errors: {},
    args: { id: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(PlaceActorDescriptor, String(args.id)).get(),
  }),
);

builder.queryField("duplicatePlaces", (t) =>
  t.field({
    type: DuplicatePlaceConnection,
    description:
      "Nearby places with a similar name — what the create form shows as you " +
      "type. A name under two characters returns nothing rather than matching " +
      "everything.\n\n" +
      "**C1 repointed this at `DuplicatePlaceSearchActor`.** §2.1 said " +
      '`PlaceCreationActor.findDuplicates` "will delegate to ' +
      '`DuplicatePlaceSearchActor` once that exists"; §8.5 forbids an entity ' +
      'actor calling a search actor synchronously and allows "resolver → any ' +
      "actor\", so the delegation happens here instead. The field's name, " +
      "arguments and shape are unchanged. `PlaceCreationActor` keeps its own " +
      "copy of the check for use inside the creation lock, which is what makes " +
      "that one sound.",
    errors: {},
    args: {
      ...t.arg.connectionArgs(),
      name: t.arg.string({ required: true }),
      location: t.arg({ type: LngLatInput, required: true }),
      /*
       * A7g documents all three bounds. D5 found them undocumented and said
       * why it matters: every one raises a proper typed error, but "a search
       * capped at five rows is not a search", and a client cannot know that
       * without being told. The numbers are interpolated from the constants
       * the actor enforces, so the prose cannot drift from the check.
       */
      radiusMeters: t.arg.float({
        required: false,
        description:
          `Default ${DUPLICATE_SEARCH_RADIUS_M}; must be greater than 0 and ` +
          `at most ${DUPLICATE_SEARCH_MAX_RADIUS_M} — a 5km "duplicate" is ` +
          "not one. Outside that range is a `VALIDATION` error.",
      }),
      minSimilarity: t.arg.float({
        required: false,
        description:
          `Default ${DUPLICATE_SEARCH_MIN_SIMILARITY}; must be within ` +
          "[0, 1]. Outside that range is a `VALIDATION` error.",
      }),
      limit: t.arg.int({
        required: false,
        description:
          "How many candidates the actor holds — 1 to " +
          `${DUPLICATE_SEARCH_RESULT_CAP} inclusive, which is both the ` +
          'default and the maximum. Deliberately small: this answers "someone ' +
          'else may already be here", not "search for a place" — use ' +
          "`placeSearch` for that. Not pagination: `first`/`after` page this " +
          "set and are not part of the actor's key.",
      }),
    },
    resolve: async (_root, args, context) => {
      const input = {
        name: args.name,
        location: { lng: args.location.lng, lat: args.location.lat },
        radiusMeters: args.radiusMeters ?? null,
        minSimilarity: args.minSimilarity ?? null,
        limit: args.limit ?? null,
      };
      const page: Page<DuplicatePlaceHit> = await context
        .actor(
          DuplicatePlaceSearchActorDescriptor,
          duplicatePlaceSearchActorId(input, context.ctx.viewerId),
        )
        .results(input, toPageArgs(args));
      // `DuplicatePlaceHit` is a superset of `DuplicateCandidate`; narrowing
      // here keeps `DuplicatePlaceCandidate`'s GraphQL shape exactly as B5
      // declared it, so repointing the resolver is not a schema change.
      //
      // Both locals are annotated deliberately: inside a `t.field` resolver the
      // argument object and the return type are inferred together, and an
      // unannotated intermediate collapses to `unknown` (the same expression
      // infers correctly outside the builder callback).
      const candidates: Page<DuplicateCandidate> = mapPage(
        page,
        (hit): DuplicateCandidate => ({
          placeId: hit.placeId,
          name: hit.name,
          similarity: hit.similarity,
          distanceMeters: hit.distanceMeters,
        }),
      );
      return connectionFromPage(candidates);
    },
  }),
);

builder.mutationField("createPlace", (t) =>
  t.field({
    type: CreatePlacePayloadType,
    description:
      "Rate limit, duplicate check, AI review, then PlaceActor.create — one " +
      "submission at a time per user (PlaceCreationActor, keyed by the " +
      "viewer), with the cross-user duplicate check re-run under database " +
      "locks inside PlaceActor.create. The only place-creation path a client " +
      "has; there is deliberately no mutation that reaches PlaceActor.create " +
      "directly.",
    errors: {},
    args: { input: t.arg({ type: CreatePlaceInput, required: true }) },
    resolve: (_root, args, context) => {
      const viewerId = context.ctx.viewerId;
      // Before addressing, because `placeCreationActorId` takes a viewer id
      // and an anonymous request has none. The actor refuses this too, with
      // the same words; the key is an address, never taken from an argument.
      if (viewerId === null) {
        throw new ForbiddenError(
          "sign in to create a place; a place is always created by a user, " +
            "so there is no system path through this actor",
        );
      }
      return context
        .actor(PlaceCreationActorDescriptor, placeCreationActorId(viewerId))
        .createPlace(toCreateInput(args.input));
    },
  }),
);

builder.mutationField("enrichPlaceFromGoogle", (t) =>
  t.field({
    type: EnrichPlacePayloadType,
    description:
      "Queues an enrichment. Returns QUEUED immediately — the details fetch " +
      "and up to `maxPhotos` downloads are eight external round-trips and " +
      "run on the outbox, charged through BudgetActor. Returns FRESH instead, " +
      "queueing nothing and spending nothing, when the place's Google " +
      "details are under 30 days old.",
    errors: {},
    args: {
      placeId: t.arg.id({ required: true }),
      input: t.arg({ type: EnrichPlaceInput, required: false }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(PlaceActorDescriptor, String(args.placeId))
        .enrichFromGoogle(patch(args.input ?? {}, ENRICH_PLACE)),
  }),
);

builder.mutationField("verifyMenuItemMatch", (t) =>
  t.field({
    type: PlaceMenuItemType,
    description:
      "Confirms or rejects an AI menu-item match. **Scan owner only** — the " +
      "same principal `actOnMenuScanSuggestion` requires, since that " +
      "mutation's acceptance is delivered here. `match: null` clears it — a " +
      "rejection is a verification and is stamped as one.",
    errors: {},
    args: {
      placeId: t.arg.id({ required: true }),
      menuItemId: t.arg.id({ required: true }),
      match: t.arg({ type: MenuItemMatchInput, required: false }),
    },
    resolve: (_root, args, context) =>
      context
        .actor(PlaceActorDescriptor, String(args.placeId))
        .verifyMenuItemMatch({
          menuItemId: String(args.menuItemId),
          match: present(args.match)
            ? {
                type: args.match.type as MatchableMenuItemType,
                id: String(args.match.id),
              }
            : null,
        }),
  }),
);

builder.mutationField("linkPlaceBrand", (t) =>
  t.field({
    type: PlaceBrandType,
    description:
      "Idempotent on (place, brand): a repeat link with a different " +
      "relationship updates it rather than conflicting.",
    errors: {},
    args: {
      placeId: t.arg.id({ required: true }),
      input: t.arg({ type: LinkPlaceBrandInput, required: true }),
    },
    resolve: (_root, args, context) =>
      context.actor(PlaceActorDescriptor, String(args.placeId)).linkBrand({
        brandId: String(args.input.brandId),
        relationshipType: args.input.relationshipType as PlaceBrandRelationship,
      }),
  }),
);

builder.mutationField("recordPlaceAccess", (t) =>
  t.field({
    type: RecordedAccessType,
    description:
      "Bumps the place's own visit counters. `user_place_interactions` is " +
      "UserActor's table and is not touched here (§1.2, single writer).",
    errors: {},
    args: { placeId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context.actor(PlaceActorDescriptor, String(args.placeId)).recordAccess(),
  }),
);
