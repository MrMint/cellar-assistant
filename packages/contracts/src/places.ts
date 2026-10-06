/**
 * The `Place` aggregate (migration plan §2.1 `PlaceActor`, `PlaceCreationActor`;
 * workstream B5).
 *
 * `PlaceActor(placeId)` owns eight tables — `places`,
 * `place_google_enrichments`, `place_google_photos`, `place_menus`,
 * `place_menu_items`, `place_brands`, `place_vectors`, `menu_item_recipes` —
 * and `PlaceCreationActor()` is the singleton that serializes user creation in
 * front of it, exactly as `BrandRegistryActor` fronts `BrandActor` (§1.2:
 * "registry actors hold a lock and call the entity actor's create; they do not
 * insert").
 *
 * **These DTOs are the wire shape, not the row shape.** `timestamptz` columns
 * cross as ISO-8601 strings, `numeric` columns cross as `number` (they are
 * ratings and confidences, not money — the one `money` column in this
 * aggregate was converted to `numeric(10,2)` by A3's transform and is a price),
 * and `jsonb` crosses as a plain object, because `services/api` has no Drizzle and
 * no database.
 *
 * ## `location` is `{ lng, lat }`, both ways
 *
 * `places.location` is `geography(Point,4326)`, wrapped by A3b's `geography`
 * custom type (`packages/db/src/schema/custom-types.ts`), which decodes EWKB
 * to `{ lng, lat }` on read and emits `POINT(lng lat)` on write. That is the
 * only shape this contract knows: no GeoJSON, no `[lng, lat]` tuple, no WKT.
 * The old server action passed GeoJSON (`{ type: "Point", coordinates: [...] }`)
 * because Hasura's `geography` scalar took it; nothing here does.
 *
 * ## Visibility: catalog data, signed-in only
 *
 * §2.1 gives `PlaceActor` no `Visibility:` line, the same absence B3 resolved
 * for `BrandActor`. Today's Hasura grant is `filter: {}` for role `user` —
 * every signed-in user may read every place, including user-created ones —
 * with no anonymous role at all. B3's rule for catalog aggregates ("any
 * signed-in viewer; anonymous refused") reproduces that exactly, so it is what
 * `PlaceActor` uses. There is no privacy column on `places` and no owner
 * branch to add one.
 *
 * ## `googlePlaceId` is server-owned, and is absent from every input here
 *
 * `target-stack.md` §7 records the live gap: today's `places` insert
 * permission lists `google_place_id` among the columns a `user` may set, so a
 * client can claim any Google place id it likes — including one that belongs
 * to somebody else's row, or one that is simply wrong, which then silently
 * poisons every later enrichment. `CreatePlaceInput` below therefore has no
 * such field, and no method on `PlaceActorInterface` accepts one from a
 * request: the binding is written **only** by `enrichFromGoogle` and
 * `refreshFromSource`, from what Google itself returned. See
 * `GoogleBindingCollision` for what happens when the id Google returns is
 * already bound to a different place — which is routine, not exceptional.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { ItemType } from "./items.ts";
import type { ScannedItemType } from "./menu-scans.ts";
import { SCANNED_ITEM_TYPES } from "./menu-scans.ts";
import type { Page, PageArgs } from "./page.ts";

/* -------------------------------------------------------------------------- */
/* Geography                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A WGS-84 point, in the exact shape A3b's `geography` custom type reads and
 * writes. Longitude first, matching PostGIS's own `POINT(x y)` ordering — the
 * field names exist so nobody has to remember that.
 */
export type LngLat = { readonly lng: number; readonly lat: number };

export const isLngLat = (value: unknown): value is LngLat => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { lng?: unknown; lat?: unknown };
  return (
    typeof candidate.lng === "number" &&
    Number.isFinite(candidate.lng) &&
    candidate.lng >= -180 &&
    candidate.lng <= 180 &&
    typeof candidate.lat === "number" &&
    Number.isFinite(candidate.lat) &&
    candidate.lat >= -90 &&
    candidate.lat <= 90
  );
};

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                 */
/* -------------------------------------------------------------------------- */

export type PlaceDto = {
  readonly id: string;
  readonly name: string;
  readonly displayName: string | null;
  readonly categories: readonly string[];
  /** `categories[1]`, a generated column. `null` only if `categories` is empty. */
  readonly primaryCategory: string | null;
  readonly location: LngLat;
  readonly streetAddress: string | null;
  readonly locality: string | null;
  readonly region: string | null;
  readonly postcode: string | null;
  readonly countryCode: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly email: string | null;
  readonly hours: Record<string, unknown> | null;
  readonly priceLevel: number | null;
  readonly rating: number | null;
  readonly reviewCount: number | null;
  readonly confidence: number | null;
  readonly description: string | null;
  readonly source: string;
  readonly overtureId: string | null;
  /**
   * Server-owned (module doc). Present on the read side because the map and
   * the place page both link out to Google; **never** settable from input.
   */
  readonly googlePlaceId: string | null;
  readonly isVerified: boolean;
  readonly isActive: boolean;
  readonly accessCount: number;
  readonly lastAccessedAt: string | null;
  readonly createdById: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly lastSyncAt: string | null;
};

export type PlaceEnrichmentDto = {
  readonly placeId: string;
  readonly googlePlaceId: string;
  readonly googleName: string | null;
  readonly googleFormattedAddress: string | null;
  readonly googleRating: number | null;
  readonly googleUserRatingsTotal: number | null;
  readonly googlePriceLevel: number | null;
  readonly googleWebsite: string | null;
  readonly googlePhone: string | null;
  readonly googleOpeningHours: Record<string, unknown> | null;
  readonly googleTypes: readonly string[];
  readonly googleBusinessStatus: string | null;
  readonly googleEditorialSummary: string | null;
  readonly attributions: readonly Record<string, unknown>[];
  /** `place_google_enrichments_resolved_via_check`, verbatim. */
  readonly resolvedVia: GoogleResolvedVia;
  readonly detailsFetchedAt: string | null;
  readonly photosFetchedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export const GOOGLE_RESOLVED_VIA = [
  "nearby_search",
  "autocomplete",
  "text_search",
] as const;
export type GoogleResolvedVia = (typeof GOOGLE_RESOLVED_VIA)[number];

export const isGoogleResolvedVia = (
  value: string,
): value is GoogleResolvedVia =>
  (GOOGLE_RESOLVED_VIA as readonly string[]).includes(value);

export type PlacePhotoDto = {
  readonly id: string;
  readonly placeId: string;
  readonly googlePhotoName: string;
  /** `FileActor`'s id. `null` when the upload failed and only the ref is known. */
  readonly fileId: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly attributions: readonly Record<string, unknown>[];
  readonly displayOrder: number;
  readonly createdAt: string;
};

export type PlaceMenuDto = {
  readonly id: string;
  readonly placeId: string;
  readonly menuType: string | null;
  readonly source: string;
  readonly sourceUrl: string | null;
  readonly discoveryMethod: string | null;
  readonly confidenceScore: number | null;
  readonly version: number | null;
  readonly isCurrent: boolean;
  readonly menuData: Record<string, unknown>;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly createdById: string | null;
  readonly verifiedById: string | null;
  readonly discoveredAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

/**
 * `place_menu_items.detected_item_type` — a `text` column under a CHECK, not
 * the `item_type` enum.
 *
 * Before B8b (migration plan) this allowed only `wine|beer|spirit|coffee|
 * unknown` — narrower than `ScannedItemType`, what the vision pass can
 * actually call a line — so `MenuScanActor` wrote `unknown` for a detected
 * `sake`, `tea` or `cocktail` and hid the real value in
 * `extracted_attributes.scanItemType` (a key
 * `20260928182317_place_menu_items_scan_columns` backfilled into this column
 * and removed). B8b widened the constraint to match
 * `ScannedItemType` exactly, so there is no narrower set to declare here any
 * more: `MenuItemType` **is** `ScannedItemType`. See `MatchableMenuItemType`
 * below for the (still narrower) set of types `place_menu_items` can record a
 * *match* for: widening this column added no FK columns by itself, but
 * `20260928043553_place_menu_items_sake_tea_matches` (`e5d19b69`) later added
 * `sake_id` and `tea_id`, so every item type is matchable and only a cocktail,
 * which has no FK here, is not.
 */
export const MENU_ITEM_TYPES = SCANNED_ITEM_TYPES;
export type MenuItemType = ScannedItemType;

export const isMenuItemType = (value: string): value is MenuItemType =>
  (MENU_ITEM_TYPES as readonly string[]).includes(value);

export type PlaceMenuItemDto = {
  readonly id: string;
  readonly placeId: string;
  /** Exactly one of these two is set (`check_menu_or_scan_source`). */
  readonly placeMenuId: string | null;
  readonly menuScanId: string | null;
  readonly name: string;
  readonly description: string | null;
  /** `numeric(10,2)` — A3's `05_money_to_numeric.sql` converted the old `money`. */
  readonly price: number | null;
  readonly menuCategory: string | null;
  readonly detectedItemType: MenuItemType | null;
  readonly confidenceScore: number | null;
  readonly extractedAttributes: Record<string, unknown> | null;
  /**
   * The matched catalog item, when one has been agreed. `null` while
   * unmatched. At most one of the six FK columns is ever set
   * (`check_single_item_type`), so this collapses them.
   */
  readonly matchedItem: MenuItemMatch | null;
  readonly matchVerifiedById: string | null;
  readonly matchVerifiedAt: string | null;
  readonly isAvailable: boolean;
  readonly seasonal: boolean;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

/**
 * The `detected_item_type` values `place_menu_items` can record a *match* for:
 * the six item types, one FK column each (`check_single_item_type`). Until
 * `20260928043553_place_menu_items_sake_tea_matches` the table had columns for
 * wine, beer, spirit and coffee only, so an accepted sake or tea suggestion
 * was recorded on `item_match_suggestions` and went no further.
 *
 * A cocktail is not an item: **B8c** routes an accepted recipe match to
 * `menu_item_recipes` via `linkMenuItemRecipe` instead.
 */
export type MatchableMenuItemType = Lowercase<ItemType>;

/**
 * An item type in its match spelling. `toLowerCase()` is typed `string`, so
 * this is the one place the narrowing is asserted.
 */
export const matchableMenuItemType = (type: ItemType): MatchableMenuItemType =>
  type.toLowerCase() as MatchableMenuItemType;

/** The six matchable columns on `place_menu_items`, collapsed. */
export type MenuItemMatch = {
  readonly type: MatchableMenuItemType;
  readonly id: string;
};

/**
 * One row of `menu_item_recipes` — the join that gives an accepted **cocktail**
 * match a home (B8c). `place_menu_items` has an FK column per item type (see
 * `MatchableMenuItemType`) and none for a recipe, so a recipe acceptance
 * cannot be recorded there; this table is where it lands instead.
 */
export type MenuItemRecipeDto = {
  readonly id: string;
  readonly menuItemId: string;
  readonly recipeId: string;
  readonly createdAt: string | null;
};

export type PlaceBrandDto = {
  readonly id: string;
  readonly placeId: string;
  readonly brandId: string;
  readonly relationshipType: PlaceBrandRelationship;
  readonly createdAt: string | null;
};

/** `place_brands_relationship_type_check`, verbatim. */
export const PLACE_BRAND_RELATIONSHIPS = [
  "owned_by",
  "affiliated_with",
  "serves",
] as const;
export type PlaceBrandRelationship = (typeof PLACE_BRAND_RELATIONSHIPS)[number];

export const isPlaceBrandRelationship = (
  value: string,
): value is PlaceBrandRelationship =>
  (PLACE_BRAND_RELATIONSHIPS as readonly string[]).includes(value);

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What creates a place. **No `googlePlaceId`** — see the module doc; that is
 * the fix for `target-stack.md` §7's second live gap, and the absence is
 * load-bearing rather than an omission.
 *
 * `source`, `isVerified` and `createdById` are absent for the same reason:
 * today's Hasura permission `set`s all three server-side, and a client that
 * could choose them could mint a `source: "overture"`, `is_verified: true`
 * row indistinguishable from imported reference data.
 */
export type CreatePlaceInput = {
  readonly name: string;
  readonly categories: readonly string[];
  readonly location: LngLat;
  readonly streetAddress?: string | null;
  readonly locality?: string | null;
  readonly region?: string | null;
  readonly postcode?: string | null;
  /** Two letters; the actor upper-cases and validates the shape. */
  readonly countryCode?: string | null;
  readonly phone?: string | null;
  readonly website?: string | null;
  readonly email?: string | null;
  readonly description?: string | null;
  /**
   * `0..1`, set by `PlaceCreationActor` from the AI review's adjustment. A
   * caller may not pick its own confidence.
   */
  readonly confidence?: number | null;
};

/**
 * `PlaceCreationActor.createPlace`'s input: the user's fields, plus the id the
 * caller mints. Same provisional-id pattern as `CellarActor`/`TierListActor`.
 */
export type CreateUserPlaceInput = CreatePlaceInput & {
  /** §8.4's idempotency key for the creation, and the new row's primary key. */
  readonly placeId?: string;
};

export type EnrichFromGoogleInput = {
  /**
   * When the caller already knows the Google id (autocomplete or nearby
   * search picked it), how it learned it. Omitted ⇒ the actor resolves the
   * id itself by text search and records `"text_search"`.
   *
   * This is **not** a user-writable binding: the id still has to survive the
   * collision check below, and a client that supplies a wrong-but-unclaimed
   * id gets an enrichment row that `refreshFromSource` will later correct —
   * it can never overwrite another place's binding.
   */
  readonly googlePlaceId?: string;
  readonly resolvedVia?: GoogleResolvedVia;
  /** Cap on photos to fetch and store. Defaults to 3, as the old function did. */
  readonly maxPhotos?: number;
  /** Skip the freshness check and re-fetch. Admin/system only. */
  readonly force?: boolean;
};

/**
 * What `enrichFromGoogle` reports when the id Google returned is already bound
 * to a **different** place row.
 *
 * Both unique indexes (`idx_places_google_place_id`, partial on non-null, and
 * `unique_google_place_id` on `place_google_enrichments`) make the binding
 * 1:1. Two place rows resolving to one Google id therefore means the two rows
 * are duplicates of each other — which is *routine* for a database that lets
 * users add places near ones Overture already imported, and is a merge
 * question for C1's duplicate search, not something an enrichment turn may
 * decide. So the actor writes nothing, and says whose it is.
 */
export type GoogleBindingCollision = {
  readonly googlePlaceId: string;
  /** The place that already holds this binding. Never `this` place. */
  readonly boundToPlaceId: string;
};

export type EnrichFromGoogleResult = {
  readonly placeId: string;
  /**
   * - `queued` — a **user** asked; the work is an outbox row now (§8.5:
   *   enrichment is eight external round-trips and is not one of the two
   *   named request-driven long operations). Everything below except `fresh`
   *   is only ever returned by the system turn. `enrichment` is null, except
   *   for a photo-only resume (fresh details whose photo loop never finished,
   *   e.g. a migrated row with `photosFetchedAt` null), where it is attached.
   * - `enriched` — details fetched and written.
   * - `fresh` — an enrichment newer than the TTL already exists; nothing done.
   *   The one status both halves return: a user call inside the window gets
   *   it synchronously, with `enrichment` attached and nothing queued,
   *   because the queued turn would have returned it and written nothing.
   * - `unresolved` — Google had no match for this place.
   * - `collision` — see `GoogleBindingCollision`; `collision` is set.
   * - `budget_denied` — `BudgetActor` refused the spend.
   */
  readonly status:
    | "queued"
    | "enriched"
    | "fresh"
    | "unresolved"
    | "collision"
    | "budget_denied";
  readonly enrichment: PlaceEnrichmentDto | null;
  readonly photos: readonly PlacePhotoDto[];
  readonly collision: GoogleBindingCollision | null;
  /** One phrase, for logs and for the GraphQL field's `reason`. */
  readonly reason: string;
};

/** One extracted menu line, as `MenuScanActor` hands it over (B8 fills this in). */
export type ScannedMenuItemInput = {
  readonly name: string;
  readonly description?: string | null;
  readonly price?: number | null;
  readonly menuCategory?: string | null;
  readonly detectedItemType?: MenuItemType | null;
  readonly confidenceScore?: number | null;
  readonly extractedAttributes?: Record<string, unknown> | null;
  /**
   * The AI-normalised name the matcher searches with
   * (`place_menu_items.search_name`); blank or absent means "search with
   * `name`".
   */
  readonly searchName?: string | null;
};

/**
 * `addMenuFromScan`'s payload. `Record<string, unknown>`-compatible by
 * construction: it crosses the outbox, where §8.4 (and B4's finding) require a
 * payload object rather than a bare id.
 */
export type AddMenuFromScanInput = {
  readonly menuScanId: string;
  readonly items: readonly ScannedMenuItemInput[];
};

export type AddMenuFromScanResult = {
  readonly placeId: string;
  readonly menuScanId: string;
  readonly created: number;
  /** True when this scan's items were already present (a redelivery). */
  readonly alreadyApplied: boolean;
};

export type VerifyMenuItemMatchInput = {
  readonly menuItemId: string;
  /** `null` clears the match (a rejection), which is a verification too. */
  readonly match: MenuItemMatch | null;
};

export type LinkMenuItemRecipeInput = {
  readonly menuItemId: string;
  readonly recipeId: string;
};

export type LinkMenuItemRecipeResult = {
  readonly link: MenuItemRecipeDto;
  /**
   * False when the pair was already linked — a redelivered outbox row, or the
   * owner accepting the same suggestion twice. §8.4: the unique constraint is
   * the idempotency, so a repeat is a no-op returning the row already there.
   */
  readonly created: boolean;
};

export type LinkBrandInput = {
  readonly brandId: string;
  readonly relationshipType: PlaceBrandRelationship;
};

export type RefreshFromSourceInput = {
  /** Defaults to the Google refresh path — the only source implemented. */
  readonly maxPhotos?: number;
};

export type RecordedAccess = {
  readonly placeId: string;
  readonly accessCount: number;
  readonly lastAccessedAt: string;
};

/* -------------------------------------------------------------------------- */
/* The actors                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `PlaceActor(placeId)` — entity actor, owned by **B5** (§2.1).
 *
 * Reads are signed-in-only catalog reads (module doc). Writes split three
 * ways, which is *not* an owner/co-owner split like `CellarActor`'s:
 *
 *   - `create` — `PlaceCreationActor` only (§2.1's own parenthesis).
 *   - `addMenuFromScan`, `refreshFromSource`, `linkMenuItemRecipe` — `system`
 *     only; they are delivered, never called from a request.
 *   - `enrichFromGoogle`, `linkBrand`, `recordAccess` — any signed-in user.
 *     That matches today's reality (`enrichPlaceFromGoogle` and
 *     `matchMenuItems` are reachable by any authenticated client) with the
 *     spend now gated by `BudgetActor` rather than by nothing.
 *   - `verifyMenuItemMatch` — **the owner of the scan that produced the menu
 *     line** (plus `system`/`admin`, which is how an accepted suggestion is
 *     delivered). It was in the bullet above, on the same "today's reality"
 *     grounds; that reality was Hasura's `filter: {}` update permission on
 *     `place_menu_items`, and carrying it forward let a signed-in stranger
 *     stamp a match onto another user's scanned menu. `BarcodeActor.linkItem`
 *     closed the identical inherited grant on `barcodes`; see the method in
 *     `place-actor.ts` for the full argument.
 */
export type PlaceActorInterface = {
  get(ctx: Ctx): Promise<PlaceDto>;
  enrichment(ctx: Ctx): Promise<PlaceEnrichmentDto | null>;
  photos(ctx: Ctx): Promise<readonly PlacePhotoDto[]>;
  menus(ctx: Ctx): Promise<readonly PlaceMenuDto[]>;
  brands(ctx: Ctx): Promise<readonly PlaceBrandDto[]>;
  /** Paged: a scanned menu can be hundreds of lines (§1.5, no unbounded read). */
  menuItems(ctx: Ctx, page: PageArgs): Promise<Page<PlaceMenuItemDto>>;

  /** Called only by `PlaceCreationActor` (§2.1) — never from a resolver. */
  create(
    ctx: Ctx,
    input: CreatePlaceInput & { readonly createdById: string },
  ): Promise<PlaceDto>;

  /**
   * Details (and up to `maxPhotos` photos) from Google, charged through
   * `BudgetActor` and stored through `FileActor` — §8.5 lists both as
   * sanctioned synchronous edges from an entity actor.
   *
   * §8.4: naturally idempotent. The freshness check (30 days, as today) makes
   * a redelivery a no-op returning `status: "fresh"`, and the enrichment row
   * is keyed by `place_id` so a re-run overwrites rather than duplicating.
   */
  enrichFromGoogle(
    ctx: Ctx,
    input?: EnrichFromGoogleInput,
  ): Promise<EnrichFromGoogleResult>;

  /**
   * `system`, called by `MenuScanActor` (§2.1). §8.4: idempotent on
   * `input.menuScanId` — every row it writes carries that id, so a
   * redelivery finds them and returns `alreadyApplied`.
   */
  addMenuFromScan(
    ctx: Ctx,
    input: AddMenuFromScanInput,
  ): Promise<AddMenuFromScanResult>;

  /**
   * The scan owner agreeing (or disagreeing) with an AI menu-item match — the
   * principal `actOnMenuScanSuggestion`'s SDL already names ("Scan owner
   * only"), since that acceptance is delivered here. `system`/`admin` passes
   * too: `MenuScanActor.actOnSuggestion` authorized the outbox row before
   * writing it, so the delivery is a consequence, not a second decision.
   */
  verifyMenuItemMatch(
    ctx: Ctx,
    input: VerifyMenuItemMatchInput,
  ): Promise<PlaceMenuItemDto>;

  /**
   * `system`, delivered by the outbox from `MenuScanActor.actOnSuggestion`
   * (B8c). The home for an accepted **cocktail** match: `place_menu_items` has
   * no FK column for a recipe, so the acceptance lands in `menu_item_recipes`,
   * which §3 already gives to `PlaceActor`.
   *
   * Not a request-callable method. The acceptance was authorized once, by
   * `MenuScanActor`'s owner check; re-exposing the write to any signed-in
   * viewer would let a stranger staple any recipe to any menu item, and §8.5's
   * closed edge set gains nothing here — the hop is the outbox, exactly as
   * `verifyMenuItemMatch`'s is.
   *
   * §8.4: naturally idempotent on `menu_item_recipes_menu_item_id_recipe_id_key`.
   * A redelivery returns the existing row with `created: false`.
   */
  linkMenuItemRecipe(
    ctx: Ctx,
    input: LinkMenuItemRecipeInput,
  ): Promise<LinkMenuItemRecipeResult>;

  /** Idempotent on `place_brands_place_id_brand_id_key`. */
  linkBrand(ctx: Ctx, input: LinkBrandInput): Promise<PlaceBrandDto>;

  /**
   * Bumps `access_count` / `last_accessed_at`. Any signed-in viewer; the
   * counter is per *place*, not per viewer — `user_place_interactions` is
   * `UserActor`'s table and is not touched here (§1.2, single writer).
   */
  recordAccess(ctx: Ctx): Promise<RecordedAccess>;
};

/**
 * `PlaceActor`'s one method no request may name: the Overture bulk page,
 * called by `OvertureReloadJobActor` at {@link PLACE_BULK_ACTOR_ID} (C4b).
 */
export type InternalPlaceActorInterface = {
  bulkUpsertFromOverture(
    ctx: Ctx,
    input: BulkUpsertFromOvertureInput,
  ): Promise<BulkUpsertFromOvertureResult>;
  /**
   * `system`, called by C4's `PlaceRefreshJobActor` (§2.1). Re-runs the
   * Google path ignoring the freshness window and stamps `last_sync_at`.
   */
  refreshFromSource(
    ctx: Ctx,
    input?: RefreshFromSourceInput,
  ): Promise<EnrichFromGoogleResult>;
};

export const PlaceActorDescriptor: ActorDescriptor<
  PlaceActorInterface,
  InternalPlaceActorInterface
> = {
  actorType: "PlaceActor",
  category: "entity",
  methods: {
    get: {},
    enrichment: {},
    photos: {},
    menus: {},
    brands: {},
    menuItems: {},
    // Called by `PlaceCreationActor.createPlace` inside its own 120s budget.
    create: { timeoutMs: 120_000 },
    // The system half is the same Google path as `refreshFromSource` (up to
    // eight round-trips, `#enrich`), delivered by the outbox — which honours a
    // declared bound, so this is how long that delivery may run. The request
    // half only enqueues, but it shares the actor's turn lock: a click that
    // lands while the system half is running waits for it, and the API now
    // waits with it (up to 90s) rather than giving up at the 15s default on a
    // turn that may still run and enqueue once the lock frees.
    enrichFromGoogle: { timeoutMs: 90_000 },
    addMenuFromScan: {},
    verifyMenuItemMatch: {},
    linkMenuItemRecipe: {},
    linkBrand: {},
    recordAccess: {},
  },
  internalMethods: {
    // Up to eight Google round-trips in one turn (`PlaceRefreshJobActor`).
    // The batch size keeps the *job's* turn short, not this.
    refreshFromSource: { timeoutMs: 90_000 },
    // One Overture page — up to `OVERTURE_RELOAD_MAX_BATCH_SIZE` rows in a
    // single statement.
    bulkUpsertFromOverture: { timeoutMs: 120_000 },
  },
};

/* -------------------------------------------------------------------------- */
/* PlaceCreationActor                                                          */
/* -------------------------------------------------------------------------- */

/**
 * `PlaceCreationActor`'s key **is** the creator's viewer id (Wave 6; it was a
 * global singleton). Keying by creator serialises one user's own submissions
 * — which is what makes the per-user rate limit exact, and confines an AI
 * review's wait to the user who asked for it — while different users' creations
 * run in parallel. The cross-user duplicate race is closed in the database,
 * under geocell advisory locks inside `PlaceActor.create`, not by this key;
 * `docs/architecture/actor-keys.md` has the design.
 *
 * Trivial, and still a function for the reason `mapActorId` is: `services/api`
 * must not build an actor id by hand, and the actor asserts
 * `this.key === ctx.viewerId`. An anonymous viewer has no creation actor to
 * address, so the argument is non-nullable and the refusal happens in the
 * resolver, before addressing.
 */
export const placeCreationActorId = (viewerId: string): string => viewerId;

/** Today's limit, preserved: 25 places per user per 24 hours. */
export const PLACE_RATE_LIMIT_PER_DAY = 25;
export const PLACE_RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A nearby place the duplicate check found. Ids only — §1.5's registry rule. */
export type DuplicateCandidate = {
  readonly placeId: string;
  readonly name: string;
  /** `0..1`, trigram similarity on the compacted name. */
  readonly similarity: number;
  readonly distanceMeters: number;
};

/**
 * What the AI review returns — the same six fields `functions/reviewUserPlace`
 * answered with, so a `CreateUserPlaceResult` reads as it always did.
 *
 * (This used to say the shape mirrored that function's `ReviewResult`
 * "one-for-one, so porting the prompt is a move, not a rewrite". The *type* is
 * the same six fields; the port was not a move. Two things had to change, and
 * both are about what a model is allowed not to say — see
 * `PLACE_REVIEW_SCHEMA` in `services/actors/src/lib/ai/prompts.ts`. The old output
 * schema marked five of the six `required`, which a provider compiles into the
 * sampler's grammar, so the model could not decline to write an
 * `enrichedDescription` for a venue it knew nothing about — and that field is
 * persisted as `places.description`. And the old handler answered *any*
 * failure with `{approved: true, confidence_adjustment: 0, flags: []}`, an
 * approval nobody made. Here `approved` is the only required field and a
 * failure throws, which `PlaceCreationActor` records as `review: null`.)
 */
export type PlaceReview = {
  readonly approved: boolean;
  /** Clamped to `[-0.3, 0.3]` by the actor before it is applied. */
  readonly confidenceAdjustment: number;
  /**
   * Written into `places.description` when the submitter left theirs blank, so
   * this field carries the whole fabrication risk. Optional on purpose: "I have
   * nothing to add beyond what they told me" is a real answer.
   */
  readonly enrichedDescription?: string | null;
  readonly suggestedCategories?: readonly string[];
  readonly rejectionReason?: string | null;
  readonly flags: readonly string[];
};

export type CreateUserPlaceResult = {
  readonly place: PlaceDto;
  /** Non-empty when the check found near-misses it did not consider blocking. */
  readonly nearbyDuplicates: readonly DuplicateCandidate[];
  readonly review: PlaceReview | null;
};

/**
 * `PlaceCreationActor(viewerId)` — registry (§2.1), entity category and no
 * owned table, exactly like `BrandRegistryActor`; keyed by
 * {@link placeCreationActorId}.
 *
 * §8.5 names this one of the two request-driven long operations (the user is
 * waiting on the AI review), so the API's actor-invocation timeout for
 * `createPlace` is 120s. Under the old singleton key every user queued behind
 * every other user's review; keyed by creator, a review only ever blocks the
 * user who asked for it. §2.1's other escape hatch — key by geohash cell — was
 * considered and rejected (`docs/architecture/actor-keys.md`).
 */
export type PlaceCreationActorInterface = {
  createPlace(
    ctx: Ctx,
    input: CreateUserPlaceInput,
  ): Promise<CreateUserPlaceResult>;
  /**
   * The duplicate check on its own, for the create form's live feedback.
   * Read-only, and it is *not* a search actor: C1 owns `DuplicatePlaceSearchActor`
   * and this method will delegate to it once that exists.
   */
  findDuplicates(
    ctx: Ctx,
    input: {
      readonly name: string;
      readonly location: LngLat;
      readonly radiusMeters?: number;
    },
  ): Promise<readonly DuplicateCandidate[]>;
};

export const PlaceCreationActorDescriptor: ActorDescriptor<PlaceCreationActorInterface> =
  {
    actorType: "PlaceCreationActor",
    category: "entity",
    methods: {
      // §8.5: the other request-driven exception — a synchronous LLM review.
      // `createPlace`, not `create`: the stale spelling left it on the 15s
      // default from 4e067928, and the API gave up on a review the actor went
      // on to commit. Keyed by the interface, a misspelling no longer compiles.
      createPlace: { timeoutMs: 120_000, modelBacked: true },
      findDuplicates: {},
    },
  };

/* -------------------------------------------------------------------------- */
/* C4b — the Overture bulk reload                                              */
/* -------------------------------------------------------------------------- */

/**
 * The reserved `PlaceActor` key that carries bulk Overture writes (C4b).
 *
 * `PlaceActor` is keyed by a place id, and a bulk reload has no single place.
 * §8.5 forbids a job fanning out thousands of synchronous calls, so the reload
 * makes **one** `job → entity` hop per batch, at this key. Deliberately not a
 * uuid — `BUDGET_ACTOR_ID` sets the precedent, and a non-uuid key can never
 * collide with a real `places.id`, so this activation holds no aggregate and
 * every other `PlaceActor` method on it fails `NotFound` before doing anything.
 */
export const PLACE_BULK_ACTOR_ID = "overture-bulk";

/**
 * One Overture place, normalized and ready to write.
 *
 * The column set is exactly what the Overture source knows. Everything else on
 * `places` belongs to somebody else and the bulk path never writes it:
 * `google_place_id`, `rating`, `review_count`, `price_level`, `hours` and
 * `email` are Google's (`enrichFromGoogle`), `description`, `is_verified` and
 * `created_by` are a user's, and `last_sync_at` is `PlaceRefreshJobActor`'s
 * staleness marker — stamping it here would silently tell the Google refresh
 * job that every place it walks is fresh.
 */
export type OverturePlaceInput = {
  readonly overtureId: string;
  readonly name: string;
  /** Non-empty: the column is `NOT NULL` and `primary_category` is `[1]`. */
  readonly categories: readonly string[];
  readonly location: LngLat;
  /** `places_confidence_check`: 0..1, or null. */
  readonly confidence: number | null;
  readonly streetAddress: string | null;
  readonly locality: string | null;
  readonly region: string | null;
  readonly postcode: string | null;
  /** Two upper-case letters, or null (`char(2)`). */
  readonly countryCode: string | null;
  readonly phone: string | null;
  readonly website: string | null;
};

export type BulkUpsertFromOvertureInput = {
  readonly places: readonly OverturePlaceInput[];
};

/**
 * What one bulk batch did. The four counts partition `received` minus the
 * duplicates the payload itself carried.
 */
export type BulkUpsertFromOvertureResult = {
  /** Rows handed in, after collapsing repeats of one `overture_id`. */
  readonly received: number;
  readonly inserted: number;
  readonly updated: number;
  /** Already present, `source = 'overture'`, and every column already agreed. */
  readonly unchanged: number;
  /** Present but `source != 'overture'` — a user's place, left untouched. */
  readonly skipped: number;
  /** Repeats of one `overture_id` within the payload, collapsed to the last. */
  readonly duplicatesCollapsed: number;
};
