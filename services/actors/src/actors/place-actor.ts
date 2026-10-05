/**
 * `PlaceActor` — B5 (migration plan §2.1, §3, §8.5).
 *
 * > **`PlaceActor(placeId)`**
 * > - Owns: `places`, `place_google_enrichments`, `place_google_photos`,
 * >   `place_menus`, `place_menu_items`, `place_brands`, `place_vectors`,
 * >   `menu_item_recipes`.
 * > - Loads: the place, enrichment, photos, menus with items.
 * > - Methods: `get`, `create` (called only by `PlaceCreationActor`),
 * >   `enrichFromGoogle` (budget via `BudgetActor`, files via `FileActor`;
 * >   today 8 sequential admin round-trips), `addMenuFromScan` (system, called
 * >   by `MenuScanActor`), `verifyMenuItemMatch`, `linkBrand`,
 * >   `linkMenuItemRecipe` (system, B8c — the accepted-cocktail home),
 * >   `refreshFromSource` (system, called by `PlaceRefreshJobActor`),
 * >   `recordAccess`.
 *
 * ## Visibility: catalog data, signed in
 *
 * §2.1 gives this actor no `Visibility:` line, the same absence B3 resolved
 * for `BrandActor`. Today's Hasura select permission on `places` is
 * `filter: {}` for role `user` and there is no anonymous role, so every
 * signed-in viewer sees every place — owner, friend and stranger alike — and
 * only an anonymous caller is refused. `place_menus`, `place_menu_items`,
 * `place_google_enrichments` and `place_google_photos` carry the same grant.
 * The three-viewer tests exist anyway (§1.6: "for catalog data the stranger
 * case is 'any signed-in user'; the test still exists").
 *
 * ## `enrichFromGoogle` is outbox-driven when a user asks for it
 *
 * §8.5: "anything over a few seconds is outbox-driven, not request-driven",
 * and its two named exceptions are `ItemOnboardingActor.start` and
 * `PlaceCreationActor` — not this. Enrichment is eight sequential external
 * round-trips today (details, then a fetch and an upload per photo), so a
 * request-driven version would hold this activation, and therefore every
 * reader of this place, for the whole of it.
 *
 * So the method has two halves. Called with a *user* ctx it validates, writes
 * one `outbox` row targeting its own `enrichFromGoogle`, and returns
 * `status: "queued"` in that same transaction (§1.4). Called with the
 * `system` ctx `OutboxActor` constructs — or by an admin, the manual repair
 * path — it does the work. That split also resolves who may spend:
 * `BudgetActor.reserve` takes `system`/`admin` only, so a signed-in user can
 * never charge the budget directly, only cause a system turn that does.
 *
 * **This aggregate uses the outbox, unlike B1's `CellarActor`.** The row is
 * self-targeted, the way B7's `generateInsights` is.
 *
 * ## The `google_place_id` binding is server-owned, and collisions are routine
 *
 * `target-stack.md` §7 records the live gap: `google_place_id` is in today's
 * `places` insert permission, so any client can claim any Google id. Nothing
 * in this actor accepts one on a creation path — `CreatePlaceInput` has no
 * such field — and the only writes to `places.google_place_id` are the two
 * below, from what Google itself returned.
 *
 * Two unique indexes make the binding 1:1: `idx_places_google_place_id`
 * (partial, on non-null) and `unique_google_place_id` on
 * `place_google_enrichments`. A *cross-row* collision — this place resolving
 * to a Google id another place already holds — is therefore not a bug to
 * guard against but the expected outcome whenever two rows describe one real
 * venue, which is common in a database that lets users add places next to
 * Overture imports. `#googleBindingCollision` looks for it *before* writing,
 * and `enrichFromGoogle` returns `status: "collision"` naming the other place
 * instead of throwing: merging two duplicate places is C1's duplicate-search
 * territory, not something an enrichment turn may decide. The unique indexes
 * stay as the tripwire behind that check, and a violation that slips through
 * anyway (two enrichments racing on different places) is translated to
 * `ConflictError`, never a 500.
 *
 * ## Budget keys: one per paid Google call, and a retry is a new call
 *
 * Every `BudgetActor.reserve` here stands for exactly one Google call, made
 * immediately after it, and nothing between the two consults a cache —
 * `GooglePlacesClient` is a bare HTTP client; the activation cache that
 * `GooglePlacesActor` has is not on this path. So a key has to identify one
 * call *attempt*, and `#reservationId` builds it from (this turn, this place,
 * the endpoint, a per-call scope). The reasoning per site, which is the whole
 * of why no key is reused across deliveries:
 *
 *  - **`text_search`** (`#resolveGoogleId`) — reached only when no Google id
 *    is known: no hint, and `places.google_place_id` unbound. The id it finds
 *    is stored only when the details commit, so a retry that reaches this
 *    reservation searches again and must pay again.
 *  - **`place_details`** (`#enrich`) — on a non-forced delivery
 *    `#freshResult` runs *before* this reservation, so a redelivery after the
 *    details committed answers `fresh` and never reserves. That ordering, not
 *    a shared key, is why a redelivered enrichment is not charged twice. A
 *    retry that does reach the reservation (the details never committed, or
 *    `refreshFromSource` forcing past the window) fetches again and pays again.
 *  - **`photo`** (`#fetchPhotos`) — scoped by index and photo name, so every
 *    photo in the loop is its own row. A turn that fetched details downloads
 *    every wanted photo, so a retry that re-fetched details re-downloads and
 *    pays again. A redelivery that found the details fresh downloads only the
 *    photos with no stored row (next section), so a stored photo is never
 *    paid for twice that way — the store, not a key, is what prevents it.
 *
 * The turn component is a fresh uuid per `#enrich`, and deliberately **not**
 * the delivery's outbox row id, which is what `BudgetActor` used to default
 * to. That id is shared by every attempt at one delivery and — worse — by
 * every place in a `PlaceRefreshJobActor` batch, which hands one delivery ctx
 * to all ten; keyed on it, photos 2..n and places 2..10 replayed the first
 * reservation and recorded nothing. The row id still goes into the usage
 * row's `metadata.outboxRowId`, where it attributes instead of deduplicating.
 *
 * What this leaves is one over-count: a turn that reserved and then died
 * before its call was made is charged again by the retry, for a call that
 * happened once. That is the conservative direction for a cap. Reusing keys
 * across attempts would instead under-count every retry whose first attempt
 * did reach Google — the failure a reservation exists to prevent.
 *
 * ## A photo loop that dies is finished by the redelivery
 *
 * The details commit before the first photo is downloaded, so a turn that
 * dies inside the photo loop — the process goes, or a `BudgetActor` or
 * `FileActor` hop throws past the per-photo `catch` — leaves fresh details
 * and some of the photos. The outbox redelivers, and `#freshResult` used to
 * answer `fresh` right there: the remaining photos were never fetched until
 * the window ran out.
 *
 * So `#enrich` on a non-forced turn asks one more question when the details
 * are fresh: did *that* details fetch's photo loop finish?
 * `photos_fetched_at` is the marker — `#fetchPhotos` stamps it only when its
 * loop ran to the end, and the details commit leaves it older than
 * `details_fetched_at` until then. If the loop did not finish,
 * `#resumePhotos` downloads the wanted photos from the stored
 * `photo_references` that have no `place_google_photos` row, with a new turn
 * id for their keys, and answers `fresh` with the place's full photo set.
 * Google's details are not asked for again, and a photo that was stored is
 * not downloaded again. A loop that *finished* with a photo that failed is
 * finished — a broken photo is not re-bought by every turn in the window.
 *
 * Two edges, both deliberate:
 *
 *  - **The user half does not queue a photo-only resume.** It still answers
 *    `fresh` whenever the details are, which is the one place its "answers
 *    what the queued turn would have" claim is loose. Queueing would make the
 *    place page poll for a `detailsFetchedAt` a photo resume never moves —
 *    the three-minute wait `enrichFromGoogle`'s doc describes — and the
 *    redelivery is what finishes a crashed loop. If the outbox gave up on the
 *    row instead (it went `dead`), the operator remedy is an **admin**
 *    `enrichFromGoogle` without `force`: it takes this same resume path and
 *    pays only for the missing photos. `refreshFromSource`, or `force`, also
 *    works but buys the details and every photo again.
 *  - **A row with no marker and fresh details** — `photos_fetched_at` null,
 *    as a migrated row may be — is treated as unfinished, so the first
 *    non-forced system turn inside its window downloads its missing photos
 *    once, up to `maxPhotos`, and stamps it. That turn happens only on a
 *    redelivery or an admin call; the user half never queues one for it.
 *
 * ## What this actor is *not*
 *
 * No map projection and no search: those are C2's `MapActor` and C1's
 * `PlaceSearchActor` / `DuplicatePlaceSearchActor`. In particular this file
 * does not touch `search_places_adaptive_cluster`, whose `SECURITY INVOKER`
 * tier-list leak (`target-stack.md` §7) is C1's to fix now that B7's
 * `TierListActor` enforces `canSeeTierList` correctly. Adding a second path
 * around tier-list visibility here would give C1 two answers to converge.
 */
import { randomUUID } from "node:crypto";
import type {
  ActorCategory,
  AddMenuFromScanInput,
  AddMenuFromScanResult,
  BulkUpsertFromOvertureInput,
  BulkUpsertFromOvertureResult,
  CreatePlaceInput,
  Ctx,
  DuplicateCandidate,
  EnrichFromGoogleInput,
  EnrichFromGoogleResult,
  GoogleBindingCollision,
  GoogleResolvedVia,
  InternalPlaceActorInterface,
  ItemRef,
  ItemType,
  LinkBrandInput,
  LinkMenuItemRecipeInput,
  LinkMenuItemRecipeResult,
  LngLat,
  MenuItemMatch,
  MenuItemRecipeDto,
  MenuItemType,
  OverturePlaceInput,
  Page,
  PageArgs,
  PlaceActorInterface,
  PlaceBrandDto,
  PlaceBrandRelationship,
  PlaceDto,
  PlaceEnrichmentDto,
  PlaceMenuDto,
  PlaceMenuItemDto,
  PlacePhotoDto,
  RecordedAccess,
  RefreshFromSourceInput,
  ReserveInput,
  ScannedMenuItemInput,
  VerifyMenuItemMatchInput,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  FileActorDescriptor,
  ForbiddenError,
  isGoogleResolvedVia,
  isItemType,
  isLngLat,
  isMenuItemType,
  isPlaceBrandRelationship,
  NotFoundError,
  OVERTURE_RELOAD_MAX_BATCH_SIZE,
  offsetPage,
  PLACE_BULK_ACTOR_ID,
  PlaceActorDescriptor,
  ValidationError,
} from "@cellar-assistant/contracts";
import {
  menuItemRecipes,
  menuScans,
  placeBrands,
  placeGoogleEnrichments,
  placeGooglePhotos,
  placeMenuItems,
  placeMenus,
  places,
} from "@cellar-assistant/db";
import { and, eq, inArray, isNotNull, ne, sql } from "@cellar-assistant/db/orm";
import { bypassesPolicy, isOwner } from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import {
  EntityActorBase,
  isCanonicalUuid,
  type KeyShape,
} from "../lib/actor-base.ts";
import {
  ADVISORY_LOCK_NAMESPACE,
  advisoryLockKey,
  lockAll,
} from "../lib/advisory-locks.ts";
import {
  type BudgetReserver,
  daprBudgetReserver,
} from "../lib/budget-reservers.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { causedByOf } from "../lib/delivery.ts";
import { derivedUuid } from "../lib/derived-uuid.ts";
import { geocellsWithin } from "../lib/geocell.ts";
import type {
  GooglePhotoRef,
  GooglePlacesClient,
} from "../lib/google-places.ts";
import {
  API_COST_CENTS,
  GOOGLE_PLACES_SERVICE,
  type GoogleEndpoint,
  googlePlacesClient,
} from "../lib/google-places.ts";
import { requirePrivileged, requireSignedIn } from "../lib/guards.ts";
import { internal } from "../lib/internal-client.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { enqueueOutbox } from "../lib/outbox.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import {
  menuItemRowToDto,
  type PlaceMenuItemRow,
} from "../lib/place-menu-items.ts";
import { isUuid, requireUuid } from "../lib/uuid.ts";

/** The actor *type* as registered with Dapr — the outbox row's target. */
export const PLACE_ACTOR_TYPE = "PlaceActor";

/** As today's `enrichPlaceFromGoogle`: an enrichment under 30 days is fresh. */
export const ENRICHMENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Today's default in `enrichPlaceFromGoogle`, preserved. */
export const DEFAULT_MAX_PHOTOS = 3;
const MAX_MAX_PHOTOS = 10;

/** `places.first_cached_reason` for a row the bulk reload created (C4b). */
export const OVERTURE_BULK_REASON = "overture_bulk_reload";

/**
 * The `DO UPDATE … WHERE` of the bulk upsert, and the two properties C4b's
 * acceptance rests on.
 *
 * 1. **`source = 'overture'`** — a conflicting row a *user* created (or a
 *    merged one) is left exactly as it is. Reference data may not eat a user's
 *    place, and the old loader's `update_columns` list happily did.
 * 2. **row-wise `IS DISTINCT FROM`** — a page whose values already match
 *    updates nothing at all, so re-running a completed reload writes zero rows
 *    and does not even move `updated_at`. That is what makes "running the same
 *    reload twice is a no-op" a *measurable* claim rather than a hopeful one,
 *    and it is what makes a replayed batch after a crash free.
 *
 * `location` is compared through `::text` (PostGIS hex EWKB) because
 * `geography`'s own `=` is an index operator, not a value comparison; the text
 * form is exact and total.
 */
const OVERTURE_ROW_CHANGED = sql`
  ${places.source} = 'overture'
  and (
    ${places.name}, ${places.displayName}, ${places.categories},
    ${places.confidence}, ${places.location}::text, ${places.streetAddress},
    ${places.locality}, ${places.region}, ${places.postcode},
    ${places.countryCode}, ${places.phone}, ${places.website}
  ) is distinct from (
    excluded.name, excluded.display_name, excluded.categories,
    excluded.confidence, excluded.location::text, excluded.street_address,
    excluded.locality, excluded.region, excluded.postcode,
    excluded.country_code, excluded.phone, excluded.website
  )
`;

type PlaceRow = typeof places.$inferSelect;
type EnrichmentRow = typeof placeGoogleEnrichments.$inferSelect;
type PhotoRow = typeof placeGooglePhotos.$inferSelect;
type MenuRow = typeof placeMenus.$inferSelect;
type MenuItemRow = PlaceMenuItemRow;
type PlaceBrandRow = typeof placeBrands.$inferSelect;
type MenuItemRecipeRow = typeof menuItemRecipes.$inferSelect;

export type PlaceAggregate = {
  readonly place: PlaceRow;
  readonly enrichment: EnrichmentRow | null;
  readonly photos: readonly PhotoRow[];
  readonly menus: readonly MenuRow[];
  readonly menuItems: readonly MenuItemRow[];
  readonly brands: readonly PlaceBrandRow[];
};

/* -------------------------------------------------------------------------- */
/* Injected seams (§8.5: entity → BudgetActor, FileActor)                      */
/* -------------------------------------------------------------------------- */

/**
 * Storing one downloaded photo: `FileActor.createUploadTarget` → PUT the bytes
 * → `FileActor.verify`. Injected as one operation rather than three because
 * that is the unit `enrichFromGoogle` either completes or skips, and because a
 * fake for it is then a one-liner.
 */
export type PlacePhotoStore = (
  ctx: Ctx,
  input: {
    readonly bytes: Uint8Array;
    readonly contentType: string;
  },
) => Promise<{ readonly fileId: string }>;

export const daprPlacePhotoStore =
  (): PlacePhotoStore => async (ctx, input) => {
    const fileId = randomUUID();
    const file = internal(ctx)(FileActorDescriptor, fileId);
    const target = await file.createUploadTarget({
      kind: "place-photo",
      contentType: input.contentType,
    });

    const put = await fetch(target.uploadUrl, {
      method: "PUT",
      headers: { "content-type": input.contentType },
      body: input.bytes,
    });
    if (!put.ok) {
      throw new ConflictError(
        `uploading a place photo failed with ${put.status}`,
      );
    }
    await file.verify();
    return { fileId };
  };

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

/** The refusal for a method the outbox or a job delivers (admin: the repair path). */
const deliveredOnly = (method: string): string =>
  `PlaceActor.${method} is delivered by the outbox or a job; a request ` +
  "may never call it directly";

/** Drizzle maps `numeric` to `string`; every one of them here is a number. */
const num = (value: string | number | null): number | null => {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const iso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

const requiredIso = (value: Date): string => value.toISOString();

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asRecordArray = (value: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null,
      )
    : [];

/**
 * `place_menu_items`' item arc (`../lib/item-arcs.ts`). A match names its type
 * in lower case (`MatchableMenuItemType`, the `detected_item_type` spelling);
 * these two convert at the boundary.
 */
const MENU_ITEMS = ARCS.placeMenuItems;

const itemTypeOfMatch = (type: string): ItemType | null => {
  const upper = type.toUpperCase();
  return type === upper.toLowerCase() && isItemType(upper) ? upper : null;
};

export const placeRowToDto = (row: PlaceRow): PlaceDto => ({
  id: row.id,
  name: row.name,
  displayName: row.displayName,
  categories: row.categories,
  primaryCategory: row.primaryCategory,
  location: row.location,
  streetAddress: row.streetAddress,
  locality: row.locality,
  region: row.region,
  postcode: row.postcode,
  countryCode: row.countryCode,
  phone: row.phone,
  website: row.website,
  email: row.email,
  hours: asRecord(row.hours),
  priceLevel: row.priceLevel,
  rating: num(row.rating),
  reviewCount: row.reviewCount,
  confidence: num(row.confidence),
  description: row.description,
  source: row.source,
  overtureId: row.overtureId,
  googlePlaceId: row.googlePlaceId,
  isVerified: row.isVerified ?? false,
  isActive: row.isActive ?? true,
  accessCount: row.accessCount ?? 0,
  lastAccessedAt: iso(row.lastAccessedAt),
  createdById: row.createdBy,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  lastSyncAt: iso(row.lastSyncAt),
});

const enrichmentRowToDto = (row: EnrichmentRow): PlaceEnrichmentDto => ({
  placeId: row.placeId,
  googlePlaceId: row.googlePlaceId,
  googleName: row.googleName,
  googleFormattedAddress: row.googleFormattedAddress,
  googleRating: row.googleRating,
  googleUserRatingsTotal: row.googleUserRatingsTotal,
  googlePriceLevel: row.googlePriceLevel,
  googleWebsite: row.googleWebsite,
  googlePhone: row.googlePhone,
  googleOpeningHours: asRecord(row.googleOpeningHours),
  googleTypes: row.googleTypes ?? [],
  googleBusinessStatus: row.googleBusinessStatus,
  googleEditorialSummary: row.googleEditorialSummary,
  attributions: asRecordArray(row.attributions),
  resolvedVia: isGoogleResolvedVia(row.resolvedVia)
    ? row.resolvedVia
    : "text_search",
  detailsFetchedAt: iso(row.detailsFetchedAt),
  photosFetchedAt: iso(row.photosFetchedAt),
  createdAt: requiredIso(row.createdAt),
  updatedAt: requiredIso(row.updatedAt),
});

const photoRowToDto = (row: PhotoRow): PlacePhotoDto => ({
  id: row.id,
  placeId: row.placeId,
  googlePhotoName: row.googlePhotoName,
  fileId: row.storageFileId,
  width: row.width,
  height: row.height,
  attributions: asRecordArray(row.attributions),
  displayOrder: row.displayOrder,
  createdAt: requiredIso(row.createdAt),
});

const menuRowToDto = (row: MenuRow): PlaceMenuDto => ({
  id: row.id,
  placeId: row.placeId,
  menuType: row.menuType,
  source: row.source,
  sourceUrl: row.sourceUrl,
  discoveryMethod: row.discoveryMethod,
  confidenceScore: num(row.confidenceScore),
  version: row.version,
  isCurrent: row.isCurrent ?? false,
  menuData: asRecord(row.menuData) ?? {},
  validFrom: iso(row.validFrom),
  validUntil: iso(row.validUntil),
  createdById: row.createdBy,
  verifiedById: row.verifiedBy,
  discoveredAt: iso(row.discoveredAt),
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const placeBrandRowToDto = (row: PlaceBrandRow): PlaceBrandDto => ({
  id: row.id,
  placeId: row.placeId,
  brandId: row.brandId,
  relationshipType: row.relationshipType as PlaceBrandRelationship,
  createdAt: iso(row.createdAt),
});

const menuItemRecipeRowToDto = (row: MenuItemRecipeRow): MenuItemRecipeDto => ({
  id: row.id,
  menuItemId: row.menuItemId,
  recipeId: row.recipeId,
  createdAt: iso(row.createdAt),
});

/**
 * Drizzle 1.0.0-rc.4 wraps driver errors in `DrizzleQueryError` whose `.cause`
 * is `pg`'s `DatabaseError` — same unwrap `brand-actor.ts` documents.
 */
const pgErrorOf = (
  error: unknown,
): { code?: unknown; constraint?: unknown } | undefined => {
  if (!(error instanceof Error)) return undefined;
  const cause = (error as { cause?: unknown }).cause;
  return (cause instanceof Error ? cause : error) as {
    code?: unknown;
    constraint?: unknown;
  };
};

/** The two indexes that make the Google binding 1:1 (class doc). */
const GOOGLE_BINDING_CONSTRAINTS = new Set([
  "idx_places_google_place_id",
  "unique_google_place_id",
]);

const isGoogleBindingViolation = (error: unknown): boolean => {
  const pg = pgErrorOf(error);
  return (
    pg?.code === "23505" &&
    typeof pg.constraint === "string" &&
    GOOGLE_BINDING_CONSTRAINTS.has(pg.constraint)
  );
};

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

export class PlaceActor
  extends EntityActorBase<PlaceAggregate>
  implements PlaceActorInterface, InternalPlaceActorInterface
{
  static readonly category: ActorCategory = PlaceActorDescriptor.category;
  /** A place id, or the reserved bulk key `bulkUpsertFromOverture` runs at. */
  static override readonly keyShape: KeyShape = (key) =>
    isCanonicalUuid(key) || key === PLACE_BULK_ACTOR_ID;

  readonly #google: GooglePlacesClient;
  readonly #reserve: BudgetReserver;
  readonly #storePhoto: PlacePhotoStore;

  /**
   * Three defaulted seams past `ActorBase`'s three constructor parameters —
   * the same pattern `FileActor` (binding), `BrandRegistryActor` (creator) and
   * `TierListActor` (insights) use, for the same reason: Dapr constructs
   * actors as `new Cls(client, id)`, so anything else has to arrive as a
   * default, and the no-sidecar test harness substitutes fakes.
   */
  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    google: GooglePlacesClient = googlePlacesClient(),
    reserve: BudgetReserver = daprBudgetReserver,
    storePhoto: PlacePhotoStore = daprPlacePhotoStore(),
  ) {
    super(daprClient, id, db);
    this.#google = google;
    this.#reserve = reserve;
    this.#storePhoto = storePhoto;
  }

  protected async loadAggregate(id: string): Promise<PlaceAggregate | null> {
    if (!isUuid(id)) return null;
    const [place] = await this.db
      .select()
      .from(places)
      .where(eq(places.id, id));
    if (place === undefined) return null;

    const [enrichment] = await this.db
      .select()
      .from(placeGoogleEnrichments)
      .where(eq(placeGoogleEnrichments.placeId, id));

    // Every ordering carries an explicit `id` tie-break: inside `withTestDb`'s
    // single transaction `now()` is constant, so `created_at` ties (B1's
    // harness note).
    const [photos, menus, menuItems, brands] = await Promise.all([
      this.db
        .select()
        .from(placeGooglePhotos)
        .where(eq(placeGooglePhotos.placeId, id))
        .orderBy(
          sql`${placeGooglePhotos.displayOrder} asc, ${placeGooglePhotos.id} asc`,
        ),
      this.db
        .select()
        .from(placeMenus)
        .where(eq(placeMenus.placeId, id))
        .orderBy(
          sql`${placeMenus.isCurrent} desc nulls last, ${placeMenus.createdAt} desc nulls last, ${placeMenus.id} asc`,
        ),
      this.db
        .select()
        .from(placeMenuItems)
        .where(eq(placeMenuItems.placeId, id))
        .orderBy(
          sql`${placeMenuItems.createdAt} asc nulls last, ${placeMenuItems.id} asc`,
        ),
      this.db
        .select()
        .from(placeBrands)
        .where(eq(placeBrands.placeId, id))
        .orderBy(
          sql`${placeBrands.createdAt} asc nulls last, ${placeBrands.id} asc`,
        ),
    ]);

    return {
      place,
      enrichment: enrichment ?? null,
      photos,
      menus,
      menuItems,
      brands,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                   */
  /* ---------------------------------------------------------------------- */

  async get(ctx: Ctx): Promise<PlaceDto> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "view a place");
    return placeRowToDto(aggregate.place);
  }

  async enrichment(ctx: Ctx): Promise<PlaceEnrichmentDto | null> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "view a place");
    return aggregate.enrichment === null
      ? null
      : enrichmentRowToDto(aggregate.enrichment);
  }

  async photos(ctx: Ctx): Promise<readonly PlacePhotoDto[]> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "view a place");
    return aggregate.photos.map(photoRowToDto);
  }

  async menus(ctx: Ctx): Promise<readonly PlaceMenuDto[]> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "view a place");
    return aggregate.menus.map(menuRowToDto);
  }

  async brands(ctx: Ctx): Promise<readonly PlaceBrandDto[]> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "view a place");
    return aggregate.brands.map(placeBrandRowToDto);
  }

  async menuItems(ctx: Ctx, page: PageArgs): Promise<Page<PlaceMenuItemDto>> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "view a place");
    return offsetPage(aggregate.menuItems.map(menuItemRowToDto), page);
  }

  /* ---------------------------------------------------------------------- */
  /* Creation                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Called only by `PlaceCreationActor` (§2.1), synchronously (§8.5's
   * "registry → entity"), with the id that actor minted.
   *
   * §8.4: idempotent on `this.key` — a retried creation with the same minted
   * id returns the existing row rather than conflicting with itself, which is
   * what lets `PlaceCreationActor` retry a call whose success it never saw.
   *
   * `createdById` is passed rather than read from `ctx` because the registry
   * is the thing that knows whose creation this is; it must still match the
   * caller, so a resolver that skipped the registry gains nothing but a
   * missing rate limit and duplicate check.
   *
   * There is no `googlePlaceId` parameter anywhere on this path — see the
   * class doc.
   *
   * ## The authoritative duplicate check lives here
   *
   * `PlaceCreationActor` is keyed by the *creator*, so it serialises one
   * user's submissions and nothing else; two users submitting the same bar at
   * once run in two activations and both pass its early check. That race is
   * closed in `#insert`: before inserting, the transaction takes
   * `pg_advisory_xact_lock` on every geocell the 50 m block distance can reach
   * (`lockPlaceGeocells`, sorted, so no two creators deadlock), re-runs
   * `find_duplicate_places` under those locks, and refuses with the same
   * `ConflictError` the early check raises. The second of two concurrent
   * creators therefore waits for the first to commit — milliseconds, never an
   * AI review — and then sees its row. `docs/architecture/actor-keys.md` has
   * the design and the alternatives it rejected.
   */
  async create(
    ctx: Ctx,
    input: CreatePlaceInput & { readonly createdById: string },
  ): Promise<PlaceDto> {
    requireSignedIn(ctx, "create a place");
    if (!bypassesPolicy(ctx) && ctx.viewerId !== input.createdById) {
      throw new ForbiddenError("a place may only be created for its creator");
    }
    const existing = this.aggregate;
    if (existing !== null) return placeRowToDto(existing.place);

    const name = requirePlaceName(input.name);
    const categories = requireCategories(input.categories);
    if (!isLngLat(input.location)) {
      throw new ValidationError(
        "location must be { lng, lat } within (-180..180, -90..90)",
      );
    }
    const countryCode = normalizeCountryCode(input.countryCode ?? null);
    const confidence = normalizeConfidence(input.confidence ?? null);

    try {
      await this.#insert(input, {
        name,
        categories,
        countryCode,
        confidence,
      });
    } catch (error) {
      // Two genuinely concurrent turns for one minted id both saw no row and
      // both inserted; `places_pkey` picked a winner. `PlaceCreationActor`
      // catches this and converges on the winner's row, exactly as
      // `BrandRegistryActor` does — so this must be a typed `ConflictError`
      // and never a 500.
      if (pgErrorOf(error)?.code === "23505") {
        throw new ConflictError(
          `place ${this.key} was created concurrently by another turn`,
        );
      }
      throw error;
    }
    await this.reload();
    return placeRowToDto(this.requireAggregate().place);
  }

  async #insert(
    input: CreatePlaceInput & { readonly createdById: string },
    normalized: {
      readonly name: string;
      readonly categories: readonly string[];
      readonly countryCode: string | null;
      readonly confidence: number | null;
    },
  ): Promise<void> {
    const { name, categories, countryCode, confidence } = normalized;
    await this.tx(async (tx) => {
      // The cross-user duplicate race, closed here rather than by a global
      // `PlaceCreationActor` (`docs/architecture/actor-keys.md`). Every cell a
      // blocking duplicate could sit in is locked, in one sorted order, and
      // the check `PlaceCreationActor` already ran is run again *under* the
      // locks — so of two near-duplicates created at once, the second sees
      // the first's committed row. Held for this transaction only:
      // milliseconds, never the AI review.
      await lockPlaceGeocells(tx, input.location);
      const blocking = blockingDuplicate(
        await findDuplicatePlaces(tx, name, input.location),
        this.key,
      );
      if (blocking !== undefined) throw duplicatePlaceConflict(blocking);

      await tx.insert(places).values({
        id: this.key,
        name,
        categories: [...categories],
        location: input.location,
        streetAddress: trimOrNull(input.streetAddress),
        locality: trimOrNull(input.locality),
        region: trimOrNull(input.region),
        postcode: trimOrNull(input.postcode),
        countryCode,
        phone: trimOrNull(input.phone),
        website: trimOrNull(input.website),
        email: trimOrNull(input.email),
        description: trimOrNull(input.description),
        confidence: confidence === null ? null : confidence.toFixed(2),
        createdBy: input.createdById,
        // Server-set, exactly as today's Hasura insert permission `set`s them.
        source: "user",
        isVerified: false,
      });
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Google enrichment                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * §8.4: naturally idempotent. A redelivery inside the 30-day window returns
   * `status: "fresh"` and writes nothing; outside it, the enrichment row is
   * keyed by `place_id` and upserted, and photos are keyed by
   * `(place_id, google_photo_name)`, so a re-run overwrites rather than
   * duplicating.
   *
   * A user ctx queues (class doc) — the returned `status` is `"queued"` and
   * the outbox row is written in the same transaction as nothing else, which
   * is deliberate: there is no domain write to pair it with, and §1.4's rule
   * is that a follow-up commits *with* its write, not that it needs one.
   *
   * **Except when the queued turn would be a no-op.** The outbox payload
   * carries no `force`, so for a place enriched inside the window the system
   * turn returns `"fresh"` and writes nothing — and a user who clicked
   * "Refresh" was told "queued", then watched a page poll for three minutes
   * for a `detailsFetchedAt` that was never going to move, before being told
   * Google "has not answered yet". Google was never asked. So the user half
   * runs the same freshness check first (`#freshResult`, the one predicate
   * both halves share) and answers `"fresh"` synchronously, with the
   * enrichment — and its `detailsFetchedAt` — attached, queueing nothing.
   *
   * Deliberately not a user-forced refresh: every forced turn is a Places
   * Details call plus up to `maxPhotos` photo downloads against a shared
   * quota, and a button that spends that on every click inside the window
   * buys data that is, by the same rule `PlaceRefreshJobActor` uses, still
   * current. A `googlePlaceId` hint does not change the answer either — the
   * queued turn ignores it inside the window too.
   */
  async enrichFromGoogle(
    ctx: Ctx,
    input: EnrichFromGoogleInput = {},
  ): Promise<EnrichFromGoogleResult> {
    this.requireAggregate();
    requireSignedIn(ctx, "enrich a place");

    const maxPhotos = normalizeMaxPhotos(input.maxPhotos);
    const requestedGoogleId = trimOrNull(input.googlePlaceId);
    const resolvedVia =
      input.resolvedVia !== undefined && isGoogleResolvedVia(input.resolvedVia)
        ? input.resolvedVia
        : undefined;

    if (!bypassesPolicy(ctx)) {
      // The queued turn would answer "fresh" and do nothing (doc above), so
      // say so now instead of queueing a no-op the page would wait on.
      const fresh = this.#freshResult();
      if (fresh !== null) return fresh;

      // Request-driven half: validate, queue, return. Eight external
      // round-trips do not belong in a user's turn (§8.5).
      await this.tx(async (tx) => {
        await enqueueOutbox(
          tx,
          OUTBOX_TARGETS["PlaceActor.enrichFromGoogle"],
          {
            targetId: this.key,
            payload: {
              ...(requestedGoogleId === null
                ? {}
                : { googlePlaceId: requestedGoogleId }),
              ...(resolvedVia === undefined ? {} : { resolvedVia }),
              maxPhotos,
            },
          },
          { attributeTo: ctx },
        );
      });
      return {
        placeId: this.key,
        status: "queued",
        enrichment: null,
        photos: [],
        collision: null,
        reason: "queued for the outbox; enrichment is not request-driven",
      };
    }

    return await this.#enrich(ctx, {
      googlePlaceId: requestedGoogleId,
      resolvedVia,
      maxPhotos,
      force: input.force === true,
    });
  }

  /**
   * `system`, called by C4's `PlaceRefreshJobActor` (§2.1). The same path,
   * forced past the freshness window, plus a `last_sync_at` stamp.
   */
  async refreshFromSource(
    ctx: Ctx,
    input: RefreshFromSourceInput = {},
  ): Promise<EnrichFromGoogleResult> {
    this.requireAggregate();
    requirePrivileged(ctx, deliveredOnly("refreshFromSource"));

    const result = await this.#enrich(ctx, {
      googlePlaceId: null,
      resolvedVia: undefined,
      maxPhotos: normalizeMaxPhotos(input.maxPhotos),
      force: true,
    });

    await this.tx(async (tx) => {
      await tx
        .update(places)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(places.id, this.key));
    });
    await this.reload();
    return result;
  }

  /* ---------------------------------------------------------------------- */
  /* Overture bulk reload (C4b)                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Upsert a page of Overture places — `system`, called by C4b's
   * `OvertureReloadJobActor` at the reserved key `PLACE_BULK_ACTOR_ID`.
   *
   * ## Why this is one call and not five hundred
   *
   * §8.5's call graph is closed, and a bulk job fanning out synchronous calls
   * to thousands of `PlaceActor` instances is the thing it exists to prevent.
   * §1.2 is equally firm the other way: `places` is this class's table and a
   * loader writing it directly would fail the containment test, correctly. The
   * shape that satisfies both is **one `job → entity` hop per batch, carrying
   * the whole page**, landing in the owning class's own module.
   *
   * ## The §1.3 tension, stated rather than hidden
   *
   * §1.3 was sharpened after B4b to *row* granularity: an actor may cache only
   * the rows **it itself writes**. `PlaceActor(x)` caches place `x`; this
   * method runs at `PlaceActor(overture-bulk)` and writes row `x`. That is the
   * same shape as `UserActor(bob)` writing rows `UserActor(alice)` cached, and
   * C4b takes it deliberately:
   *
   *  - the strictly-correct alternative is one outbox row per changed place
   *    (§1.4's sanctioned fan-out). At 100 rows per 2s drain that is weeks for
   *    a national extract, so it is not a real option;
   *  - the blast radius is bounded to a **stale read** in an activation that is
   *    already warm, for at most the 10-minute entity idle window (§8.5). No
   *    write is ever lost, because nothing here is read-modify-write: every
   *    column is taken from the source row, never from a cached copy;
   *  - and the columns are disjoint from the ones a live turn writes. This
   *    method never touches `google_place_id`, `rating`, `review_count`,
   *    `price_level`, `hours`, `email`, `description`, `is_verified`,
   *    `created_by`, `access_count`, `last_accessed_at` or `last_sync_at`, so
   *    an `enrichFromGoogle` running concurrently cannot lose to it or beat it.
   *
   * `last_sync_at` is the sharpest of those: it is `PlaceRefreshJobActor`'s
   * staleness predicate, and stamping it here would tell the Google refresh
   * that every place in the country had just been enriched.
   *
   * ## Non-destructive, twice over
   *
   * The old loader began with `DELETE FROM places` and left the table empty
   * for the length of the run. Nothing here deletes. And a conflicting row
   * whose `source` is not `'overture'` — a place a user created, or a merged
   * one — is **skipped**, not overwritten: the `setWhere` below is what makes
   * "reload the reference data" unable to eat a user's row. `is_active` is set
   * on insert and never on update, so a place an admin deactivated stays
   * deactivated (the old `update_columns` list resurrected it every run).
   *
   * ## §8.4 idempotency: naturally idempotent on `places_overture_id_key`
   *
   * No idempotency key. Re-delivering the same page writes the same values to
   * the same rows — and because the `DO UPDATE` carries an `IS DISTINCT FROM`
   * guard, the second run touches **zero rows** and does not even move
   * `updated_at`. That is what makes an interrupted reload resumable: the job's
   * cursor advance commits in a later transaction than this one, so a crash
   * between them replays a page that is by then a no-op.
   */
  async bulkUpsertFromOverture(
    ctx: Ctx,
    input: BulkUpsertFromOvertureInput,
  ): Promise<BulkUpsertFromOvertureResult> {
    requirePrivileged(ctx, deliveredOnly("bulkUpsertFromOverture"));
    if (this.key !== PLACE_BULK_ACTOR_ID) {
      throw new ValidationError(
        `bulkUpsertFromOverture runs at PlaceActor("${PLACE_BULK_ACTOR_ID}") ` +
          `and nowhere else; this activation is ${this.key}. A bulk page has ` +
          "no single place, and routing it through one place's activation " +
          "would serialise the reload behind that place's readers.",
      );
    }

    // Last-one-wins, because `ON CONFLICT DO UPDATE` cannot see the same key
    // twice in one statement — Postgres raises 21000 rather than picking.
    const byId = new Map<string, OverturePlaceInput>();
    for (const place of input.places) byId.set(place.overtureId, place);
    const rows = [...byId.values()];
    const duplicatesCollapsed = input.places.length - rows.length;

    if (rows.length === 0) {
      return {
        received: 0,
        inserted: 0,
        updated: 0,
        unchanged: 0,
        skipped: 0,
        duplicatesCollapsed,
      };
    }
    if (rows.length > OVERTURE_RELOAD_MAX_BATCH_SIZE) {
      throw new ValidationError(
        `a bulk Overture page may hold at most ${OVERTURE_RELOAD_MAX_BATCH_SIZE} ` +
          `rows; got ${rows.length}. A batch is one actor turn (§8.5).`,
      );
    }

    const ids = rows.map((row) => row.overtureId);

    return this.tx(async (tx) => {
      // Read before writing so the four counters can be exact. Two narrow
      // columns for at most a page of rows, on `places_overture_id_key`.
      const before = await tx
        .select({ overtureId: places.overtureId, source: places.source })
        .from(places)
        .where(inArray(places.overtureId, ids));

      const existingForeign = before.filter(
        (row) => row.source !== "overture",
      ).length;
      const existingOverture = before.length - existingForeign;

      const written = await tx
        .insert(places)
        .values(
          rows.map((row) => ({
            overtureId: row.overtureId,
            name: row.name,
            displayName: row.name,
            categories: [...row.categories],
            confidence:
              row.confidence === null ? null : row.confidence.toFixed(2),
            location: row.location,
            streetAddress: row.streetAddress,
            locality: row.locality,
            region: row.region,
            postcode: row.postcode,
            countryCode: row.countryCode,
            phone: row.phone,
            website: row.website,
            // Insert-only. `primary_category` is GENERATED ALWAYS and
            // `search_text` is trigger-filled; neither may be written.
            source: "overture",
            isVerified: false,
            isActive: true,
            accessCount: 0,
            firstCachedReason: OVERTURE_BULK_REASON,
          })),
        )
        .onConflictDoUpdate({
          target: places.overtureId,
          set: {
            name: sql`excluded.name`,
            displayName: sql`excluded.display_name`,
            categories: sql`excluded.categories`,
            confidence: sql`excluded.confidence`,
            location: sql`excluded.location`,
            streetAddress: sql`excluded.street_address`,
            locality: sql`excluded.locality`,
            region: sql`excluded.region`,
            postcode: sql`excluded.postcode`,
            countryCode: sql`excluded.country_code`,
            phone: sql`excluded.phone`,
            website: sql`excluded.website`,
            updatedAt: new Date(),
          },
          setWhere: OVERTURE_ROW_CHANGED,
        })
        .returning({ overtureId: places.overtureId });

      const inserted = rows.length - before.length;
      const updated = written.length - inserted;
      return {
        received: rows.length,
        inserted,
        updated,
        unchanged: existingOverture - updated,
        skipped: existingForeign,
        duplicatesCollapsed,
      };
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Menus                                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * `system`, called by `MenuScanActor` (§2.1, B8).
   *
   * §8.4: idempotent on `input.menuScanId`. Every row it writes carries that
   * id in `menu_scan_id`, so a redelivery finds them already present and
   * returns `alreadyApplied: true` without writing. That is stronger than
   * keying on the outbox row id, because the same scan re-processed under a
   * *new* outbox row still must not duplicate its menu.
   */
  async addMenuFromScan(
    ctx: Ctx,
    input: AddMenuFromScanInput,
  ): Promise<AddMenuFromScanResult> {
    const aggregate = this.requireAggregate();
    requirePrivileged(ctx, deliveredOnly("addMenuFromScan"));

    const menuScanId = requireUuid(input.menuScanId, "menuScanId");
    const already = aggregate.menuItems.some(
      (row) => row.menuScanId === menuScanId,
    );
    if (already) {
      return {
        placeId: this.key,
        menuScanId,
        created: 0,
        alreadyApplied: true,
      };
    }

    const items = input.items.map(requireScannedItem);
    if (items.length === 0) {
      return {
        placeId: this.key,
        menuScanId,
        created: 0,
        alreadyApplied: false,
      };
    }

    await this.tx(async (tx) => {
      await tx.insert(placeMenuItems).values(
        items.map((item) => ({
          placeId: this.key,
          menuScanId,
          // `check_menu_or_scan_source`: exactly one of the two sources.
          placeMenuId: null,
          menuItemName: item.name,
          menuItemDescription: item.description ?? null,
          menuItemPrice: item.price === null ? null : item.price.toFixed(2),
          menuCategory: item.menuCategory ?? null,
          detectedItemType: item.detectedItemType ?? null,
          confidenceScore:
            item.confidenceScore === null
              ? null
              : item.confidenceScore.toFixed(2),
          extractedAttributes: item.extractedAttributes ?? null,
          searchName: item.searchName,
        })),
      );
    });
    await this.reload();

    return {
      placeId: this.key,
      menuScanId,
      created: items.length,
      alreadyApplied: false,
    };
  }

  /**
   * The owner of the scan that produced this menu line confirming (or
   * rejecting) an AI match. `match: null` clears every FK column and still
   * stamps the verifier — a rejection is a verification.
   *
   * ## Signed-in was never the authority, it was an inherited default
   *
   * This method carried `#requireSignedIn` alone, which the contracts doc
   * justified as matching "today's reality … reachable by any authenticated
   * client" — i.e. Hasura's `filter: {}` update permission on
   * `place_menu_items`. `BarcodeActor.linkItem` is the site that already
   * settled what to do with an inherited `filter: {}`: it closed it
   * ("Today's `filter: {}` update permission on `barcodes` lets any signed-in
   * user do this to any item"), because carrying a legacy grant across the
   * migration is not the same as deciding it. Measured against this stack, the
   * gap was live: a signed-in stranger set `wine_id`, `detected_item_type`,
   * `match_verified_by` and `match_verified_at` on a menu line belonging to
   * another user's scan, by calling the `verifyMenuItemMatch` mutation
   * directly.
   *
   * The authority the SDL already claims is **the scan owner**
   * (`actOnMenuScanSuggestion`: "Accept or reject one AI match. Scan owner
   * only"), and `MenuScanActor.actOnSuggestion` enforces exactly that on the
   * route that is *meant* to reach here. The direct mutation routed around it;
   * this restores the same principal on both paths, which is also what makes
   * `linkMenuItemRecipe` — the recipe half of the very same acceptance —
   * consistent with its sibling instead of two answers to one question.
   *
   * ## Why `system`/`admin` still passes, unlike `#requireCellarWriteAccess`
   *
   * `ItemOnboardingActor.#requireCellarWriteAccess` (§8.5, commit `9f3cac87`)
   * deliberately has **no** `bypassesPolicy` branch, because there the gate
   * guards an id a *user* supplied that a later `systemCtx` delivery would
   * carry past the far end's owner check — a bypass branch is precisely what
   * turns such a gate into a no-op.
   *
   * This method is the other end of that same pattern, so the conclusion
   * inverts. `MenuScanActor.actOnSuggestion` has already authorized the row it
   * enqueues, twice over: `#requireOwner` proves the caller owns the scan, and
   * its join pins `place_menu_item_id` to `i.menu_scan_id = <that scan>`. The
   * delivery is the authorized consequence, not a second decision — the words
   * `linkMenuItemRecipe` uses for its own `system`-only posture. Refusing
   * `system` here would break accepting a suggestion, and would guard nothing
   * a user can reach.
   *
   * ## Why a `select`, not `MenuScanActor.get`
   *
   * §8.5's synchronous allow-list for an entity actor is closed — `FileActor`,
   * `BudgetActor`, `EmbeddingActor`, `BrandRegistryActor`, `BarcodeActor`, and
   * other entity actors **only via the outbox**. `MenuScanActor` is an entity
   * actor, so calling it would be a new sixth edge, and an outbox hop cannot
   * answer a question this method must answer before it commits. Reading
   * `menu_scans` directly adds no edge at all: §1.1's table ownership governs
   * **writes** (`packages/db/src/writers.ts` still maps `menu_scans` to
   * `MenuScanActor`, and nothing here writes it). Same precedent, same
   * reasoning as `#requireCellarWriteAccess`'s own read of `cellars`.
   */
  async verifyMenuItemMatch(
    ctx: Ctx,
    input: VerifyMenuItemMatchInput,
  ): Promise<PlaceMenuItemDto> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "verify a menu-item match");

    const menuItemId = requireUuid(input.menuItemId, "menuItemId");
    const row = aggregate.menuItems.find((item) => item.id === menuItemId);
    if (row === undefined) {
      throw new NotFoundError(
        `place_menu_item ${menuItemId} is not on place ${this.key}`,
      );
    }
    await this.#requireMenuItemVerifier(ctx, row);
    const match = input.match === null ? null : requireMatch(input.match);

    // All six arc columns: the match's set, the rest cleared.
    const columns = MENU_ITEMS.assign(
      match === null ? null : refOfMatch(match),
    );

    try {
      await this.tx(async (tx) => {
        await tx
          .update(placeMenuItems)
          .set({
            ...columns,
            ...(match === null ? {} : { detectedItemType: match.type }),
            matchVerifiedBy: ctx.viewerId,
            matchVerifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(placeMenuItems.id, menuItemId));
      });
    } catch (error) {
      // A match naming an item that does not exist is a caller mistake, not a
      // 500 — the six FK columns are `ON DELETE SET NULL`, so the row itself
      // is fine and only the id was wrong.
      if (pgErrorOf(error)?.code === "23503" && match !== null) {
        throw new NotFoundError(`${match.type} ${match.id} not found`);
      }
      throw error;
    }
    await this.reload();

    const updated = this.requireAggregate().menuItems.find(
      (item) => item.id === menuItemId,
    );
    if (updated === undefined) {
      throw new ConflictError(
        `place_menu_item ${menuItemId} vanished mid-turn`,
      );
    }
    return menuItemRowToDto(updated);
  }

  /**
   * Where an accepted **cocktail** match lands (B8c).
   *
   * `place_menu_items` has one FK column per item type (wine, beer, spirit,
   * coffee, sake and tea — the last two since `e5d19b69`) and none for a
   * recipe, so `verifyMenuItemMatch` cannot record one. `menu_item_recipes` is
   * this actor's table (§3), and this is the only method that writes it.
   *
   * **`system` only.** The acceptance was already authorized, once, by
   * `MenuScanActor.actOnSuggestion`'s owner check; this is the delivered
   * consequence, not a second decision. Exposing it to any signed-in viewer —
   * the posture `verifyMenuItemMatch` has — would let a stranger staple an
   * arbitrary recipe to an arbitrary menu item, and nothing needs that.
   *
   * **§8.5: no new synchronous edge.** The hop from `MenuScanActor` is an
   * outbox row, exactly like `verifyMenuItemMatch`'s, so the closed set of
   * entity→entity edges is untouched.
   *
   * §8.4: naturally idempotent on
   * `menu_item_recipes_menu_item_id_recipe_id_key`. A redelivery (or a second
   * accept) conflicts on that pair, does nothing, and returns the existing row
   * with `created: false`.
   */
  async linkMenuItemRecipe(
    ctx: Ctx,
    input: LinkMenuItemRecipeInput,
  ): Promise<LinkMenuItemRecipeResult> {
    const aggregate = this.requireAggregate();
    requirePrivileged(ctx, deliveredOnly("linkMenuItemRecipe"));

    const menuItemId = requireUuid(input.menuItemId, "menuItemId");
    const recipeId = requireUuid(input.recipeId, "recipeId");

    // The menu item has to be on *this* place: `menu_item_recipes` has no
    // `place_id` of its own, so this activation's key is the only thing that
    // keeps `PlaceActor` the single writer of its own rows (§1.2).
    if (!aggregate.menuItems.some((item) => item.id === menuItemId)) {
      throw new NotFoundError(
        `place_menu_item ${menuItemId} is not on place ${this.key}`,
      );
    }

    let inserted: MenuItemRecipeRow | undefined;
    try {
      await this.tx(async (tx) => {
        const rows = await tx
          .insert(menuItemRecipes)
          .values({ menuItemId, recipeId })
          .onConflictDoNothing({
            target: [menuItemRecipes.menuItemId, menuItemRecipes.recipeId],
          })
          .returning();
        inserted = rows[0];
      });
    } catch (error) {
      // A recipe id that does not exist is a caller mistake, not a 500 — the
      // same translation `verifyMenuItemMatch` does for its six FK columns.
      if (pgErrorOf(error)?.code === "23503") {
        throw new NotFoundError(`recipe ${recipeId} not found`);
      }
      throw error;
    }

    if (inserted !== undefined) {
      return { link: menuItemRecipeRowToDto(inserted), created: true };
    }

    const existing = await this.db
      .select()
      .from(menuItemRecipes)
      .where(
        and(
          eq(menuItemRecipes.menuItemId, menuItemId),
          eq(menuItemRecipes.recipeId, recipeId),
        ),
      )
      .limit(1);
    const row = existing[0];
    if (row === undefined) {
      throw new ConflictError(
        `menu_item_recipes (${menuItemId}, ${recipeId}) vanished mid-turn`,
      );
    }
    return { link: menuItemRecipeRowToDto(row), created: false };
  }

  /* ---------------------------------------------------------------------- */
  /* Brands and access                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * §8.4: naturally idempotent on `place_brands_place_id_brand_id_key`. A
   * repeat link with a different `relationshipType` updates it rather than
   * conflicting — the pair, not the triple, is the identity.
   */
  async linkBrand(ctx: Ctx, input: LinkBrandInput): Promise<PlaceBrandDto> {
    this.requireAggregate();
    requireSignedIn(ctx, "link a brand to a place");

    const brandId = requireUuid(input.brandId, "brandId");
    if (!isPlaceBrandRelationship(input.relationshipType)) {
      throw new ValidationError(
        `relationshipType must be one of owned_by, affiliated_with, serves; got ${input.relationshipType}`,
      );
    }

    try {
      await this.tx(async (tx) => {
        await tx
          .insert(placeBrands)
          .values({
            placeId: this.key,
            brandId,
            relationshipType: input.relationshipType,
          })
          .onConflictDoUpdate({
            target: [placeBrands.placeId, placeBrands.brandId],
            set: { relationshipType: input.relationshipType },
          });
      });
    } catch (error) {
      const pg = pgErrorOf(error);
      if (pg?.code === "23503") {
        throw new NotFoundError(`brand ${brandId} not found`);
      }
      throw error;
    }
    await this.reload();

    const row = this.requireAggregate().brands.find(
      (entry) => entry.brandId === brandId,
    );
    if (row === undefined) {
      throw new ConflictError(`place_brand for ${brandId} vanished mid-turn`);
    }
    return placeBrandRowToDto(row);
  }

  /**
   * Bumps the place's own counters. `user_place_interactions` is `UserActor`'s
   * table (§3) and is deliberately not touched here — §1.2's single-writer
   * rule holds even for a one-column bump.
   */
  async recordAccess(ctx: Ctx): Promise<RecordedAccess> {
    this.requireAggregate();
    requireSignedIn(ctx, "record a place visit");

    const now = new Date();
    await this.tx(async (tx) => {
      await tx
        .update(places)
        .set({
          accessCount: sql`coalesce(${places.accessCount}, 0) + 1`,
          lastAccessedAt: now,
        })
        .where(eq(places.id, this.key));
    });
    await this.reload();

    const place = this.requireAggregate().place;
    return {
      placeId: this.key,
      accessCount: place.accessCount ?? 0,
      lastAccessedAt: (place.lastAccessedAt ?? now).toISOString(),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Who may verify one `place_menu_items` row's match — see
   * `verifyMenuItemMatch` for why the answer is the scan owner and why
   * `system`/`admin` short-circuits.
   *
   * `check_menu_or_scan_source` gives every row exactly one source, so there
   * are exactly two cases:
   *
   *   - `menu_scan_id` — a user scanned this menu. `menu_scans.user_id` is the
   *     principal, and it is the one the SDL already names.
   *   - `place_menu_id` — a curated/discovered `place_menus` row. Its
   *     `created_by` is nullable and **nothing writes that table** (this actor
   *     only reads it; `place_menus` is empty), so there is no user authority
   *     to appeal to and the honest gate is `system`/`admin`. Refusing is not
   *     a regression today because no such row can exist; when a writer for
   *     `place_menus` lands, that is when the principal gets decided, by
   *     whoever writes it, rather than guessed here.
   *
   * `ForbiddenError`, not `NotFoundError`: unlike `#requireCellarWriteAccess`
   * there is no oracle to close. `menuItems(ctx, page)` already serves every
   * row of every place to any signed-in viewer (module doc, "Visibility:
   * catalog data, signed in"), so the row's existence is not a secret and
   * saying "not yours" leaks nothing it did not already publish.
   */
  async #requireMenuItemVerifier(ctx: Ctx, row: MenuItemRow): Promise<void> {
    if (bypassesPolicy(ctx)) return;

    if (row.menuScanId === null) {
      throw new ForbiddenError(
        `place_menu_item ${row.id} did not come from a menu scan, so it has ` +
          "no owner who may verify its match",
      );
    }

    const [scan] = await this.db
      .select({ userId: menuScans.userId })
      .from(menuScans)
      .where(eq(menuScans.id, row.menuScanId));
    if (isOwner(ctx, scan?.userId)) return;

    throw new ForbiddenError(
      `only the owner of the menu scan that produced place_menu_item ` +
        `${row.id} may verify its match`,
    );
  }

  /**
   * Has some *other* place already claimed `googlePlaceId`? Checked against
   * both tables that carry the binding, because they have separate unique
   * indexes and either can be the one that already holds it.
   */
  async #googleBindingCollision(
    googlePlaceId: string,
  ): Promise<GoogleBindingCollision | null> {
    const [claimedPlace] = await this.db
      .select({ id: places.id })
      .from(places)
      .where(
        and(
          eq(places.googlePlaceId, googlePlaceId),
          ne(places.id, this.key),
          isNotNull(places.googlePlaceId),
        ),
      )
      .limit(1);
    if (claimedPlace !== undefined) {
      return { googlePlaceId, boundToPlaceId: claimedPlace.id };
    }

    const [claimedEnrichment] = await this.db
      .select({ id: placeGoogleEnrichments.placeId })
      .from(placeGoogleEnrichments)
      .where(
        and(
          eq(placeGoogleEnrichments.googlePlaceId, googlePlaceId),
          ne(placeGoogleEnrichments.placeId, this.key),
        ),
      )
      .limit(1);
    return claimedEnrichment === undefined
      ? null
      : { googlePlaceId, boundToPlaceId: claimedEnrichment.id };
  }

  /**
   * The `"fresh"` answer, when this place's Google details are younger than
   * {@link ENRICHMENT_TTL_MS}; null when a turn would have work to do.
   *
   * The one freshness rule, shared by the user half of `enrichFromGoogle`
   * (answer synchronously instead of queueing a no-op) and `#enrich` (skip
   * Google on a redelivery). Two copies would drift, and the user half's whole
   * claim is that it answers exactly what the queued turn would have.
   */
  #freshResult(): EnrichFromGoogleResult | null {
    const aggregate = this.requireAggregate();
    const existing = aggregate.enrichment;
    const fetchedAt = existing?.detailsFetchedAt ?? null;
    if (
      existing === null ||
      fetchedAt === null ||
      Date.now() - fetchedAt.getTime() >= ENRICHMENT_TTL_MS
    ) {
      return null;
    }
    return {
      placeId: this.key,
      status: "fresh",
      enrichment: enrichmentRowToDto(existing),
      photos: aggregate.photos.map(photoRowToDto),
      collision: null,
      reason:
        `Google's details for this place were fetched ` +
        `${fetchedAt.toISOString()}, under 30 days ago; nothing was requested`,
    };
  }

  /** The system half of `enrichFromGoogle`. */
  async #enrich(
    ctx: Ctx,
    options: {
      readonly googlePlaceId: string | null;
      readonly resolvedVia: GoogleResolvedVia | undefined;
      readonly maxPhotos: number;
      readonly force: boolean;
    },
  ): Promise<EnrichFromGoogleResult> {
    const aggregate = this.requireAggregate();
    const existing = aggregate.enrichment;

    if (!options.force) {
      const fresh = this.#freshResult();
      if (fresh !== null) {
        // Fresh details, but maybe not fresh photos: a turn that died inside
        // the photo loop committed the details first (module doc, "A photo
        // loop that dies is finished by the redelivery").
        const unfinished = this.#unfinishedPhotos(options.maxPhotos);
        if (unfinished === null) return fresh;
        return await this.#resumePhotos(ctx, unfinished);
      }
    }

    // One per turn, never per delivery (module doc, "Budget keys").
    const turn = randomUUID();
    const resolution = await this.#resolveGoogleId(
      ctx,
      turn,
      aggregate,
      options,
    );
    if (resolution.result !== null) return resolution.result;
    const { googlePlaceId, resolvedVia } = resolution;

    const collision = await this.#googleBindingCollision(googlePlaceId);
    if (collision !== null) {
      return {
        placeId: this.key,
        status: "collision",
        enrichment: existing === null ? null : enrichmentRowToDto(existing),
        photos: aggregate.photos.map(photoRowToDto),
        collision,
        reason:
          `google place ${googlePlaceId} is already bound to place ` +
          `${collision.boundToPlaceId}; the two rows are duplicates and ` +
          "merging them is a duplicate-search decision, not an enrichment one",
      };
    }

    const reserved = await this.#reserve(
      ctx,
      this.#reservation(ctx, turn, "place_details", googlePlaceId),
    );
    if (!reserved.allowed) {
      return this.#budgetDenied(aggregate, reserved.reason);
    }

    const details = await this.#google.details(googlePlaceId);
    if (details === null) {
      return {
        placeId: this.key,
        status: "unresolved",
        enrichment: existing === null ? null : enrichmentRowToDto(existing),
        photos: aggregate.photos.map(photoRowToDto),
        collision: null,
        reason: `google returned no details for ${googlePlaceId}`,
      };
    }

    const now = new Date();
    try {
      await this.tx(async (tx) => {
        await tx
          .insert(placeGoogleEnrichments)
          .values({
            placeId: this.key,
            googlePlaceId,
            googleName: details.name,
            googleFormattedAddress: details.formattedAddress,
            googleRating: details.rating,
            googleUserRatingsTotal: details.userRatingsTotal,
            googlePriceLevel: details.priceLevel,
            googleWebsite: details.website,
            googlePhone: details.phone,
            googleOpeningHours: details.openingHours,
            googleTypes: [...details.types],
            googleBusinessStatus: details.businessStatus,
            googleEditorialSummary: details.editorialSummary,
            photoReferences: [...details.photos],
            attributions: [...details.attributions],
            resolvedVia,
            detailsFetchedAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: placeGoogleEnrichments.placeId,
            set: {
              googlePlaceId,
              googleName: details.name,
              googleFormattedAddress: details.formattedAddress,
              googleRating: details.rating,
              googleUserRatingsTotal: details.userRatingsTotal,
              googlePriceLevel: details.priceLevel,
              googleWebsite: details.website,
              googlePhone: details.phone,
              googleOpeningHours: details.openingHours,
              googleTypes: [...details.types],
              googleBusinessStatus: details.businessStatus,
              googleEditorialSummary: details.editorialSummary,
              photoReferences: [...details.photos],
              attributions: [...details.attributions],
              resolvedVia,
              detailsFetchedAt: now,
              updatedAt: now,
            },
          });

        // The only write to `places.google_place_id` in the whole system,
        // and it stores what Google itself returned (class doc).
        await tx
          .update(places)
          .set({ googlePlaceId, updatedAt: now })
          .where(eq(places.id, this.key));
      });
    } catch (error) {
      if (isGoogleBindingViolation(error)) {
        // The pre-check above lost a race with another place's enrichment.
        // Same answer, arrived at through the tripwire rather than the check.
        const raced = await this.#googleBindingCollision(googlePlaceId);
        throw new ConflictError(
          `google place ${googlePlaceId} was bound to place ` +
            `${raced?.boundToPlaceId ?? "another row"} while this enrichment ran`,
        );
      }
      throw error;
    }
    await this.reload();

    const { stored } = await this.#fetchPhotos(
      ctx,
      turn,
      indexedPhotoRefs(details.photos).slice(0, options.maxPhotos),
    );

    const enriched = this.requireAggregate().enrichment;
    return {
      placeId: this.key,
      status: "enriched",
      enrichment: enriched === null ? null : enrichmentRowToDto(enriched),
      photos: stored,
      collision: null,
      reason: `enriched from google place ${googlePlaceId}`,
    };
  }

  /**
   * The budget key for one paid Google call: `turn` is this `#enrich`'s own
   * uuid, `scope` tells apart the calls one turn makes to one endpoint. See
   * the module doc's "Budget keys" for why each part is there and why the
   * delivery's row id is not.
   *
   * Derived rather than a bare `randomUUID()` per call so that the same
   * reservation re-sent within a turn replays instead of booking twice.
   */
  #reservationId(
    turn: string,
    endpoint: GoogleEndpoint,
    scope: string,
  ): string {
    return derivedUuid(
      `place-google-call:${turn}`,
      [this.key, endpoint, scope].join("\0"),
    );
  }

  /** `BudgetActor.reserve`'s input for one call to `endpoint`. */
  #reservation(
    ctx: Ctx,
    turn: string,
    endpoint: GoogleEndpoint,
    scope: string,
  ): ReserveInput {
    // `causedBy` rather than `delivery`: a refresh reached through
    // `PlaceRefreshJobActor`'s typed call has no delivery of its own, and the
    // spend is still that batch row's.
    const delivery = causedByOf(ctx);
    return {
      kind: { service: GOOGLE_PLACES_SERVICE, endpoint },
      estimatedCostCents: API_COST_CENTS[endpoint],
      entityId: this.key,
      entityType: "place",
      triggeredBy: ctx.viewerId,
      reservationId: this.#reservationId(turn, endpoint, scope),
      // Attribution, not identity: which delivery spent this.
      ...(delivery === null ? {} : { metadata: { outboxRowId: delivery } }),
    };
  }

  #budgetDenied(
    aggregate: PlaceAggregate,
    reason: string,
  ): EnrichFromGoogleResult {
    return {
      placeId: this.key,
      status: "budget_denied",
      enrichment:
        aggregate.enrichment === null
          ? null
          : enrichmentRowToDto(aggregate.enrichment),
      photos: aggregate.photos.map(photoRowToDto),
      collision: null,
      reason: `BudgetActor refused the google_places spend: ${reason}`,
    };
  }

  /**
   * Either an id and how it was learned, or a finished `result` to return.
   * Split out because resolution has three branches (given, already bound, or
   * a paid text search) and the paid one can itself be denied.
   */
  async #resolveGoogleId(
    ctx: Ctx,
    turn: string,
    aggregate: PlaceAggregate,
    options: {
      readonly googlePlaceId: string | null;
      readonly resolvedVia: GoogleResolvedVia | undefined;
    },
  ): Promise<
    | {
        googlePlaceId: string;
        resolvedVia: GoogleResolvedVia;
        result: null;
      }
    | { googlePlaceId: null; resolvedVia: null; result: EnrichFromGoogleResult }
  > {
    if (options.googlePlaceId !== null) {
      return {
        googlePlaceId: options.googlePlaceId,
        // A caller that supplies the id learned it from autocomplete or a
        // nearby search; `autocomplete` is the honest default of the two.
        resolvedVia: options.resolvedVia ?? "autocomplete",
        result: null,
      };
    }
    const bound = aggregate.place.googlePlaceId;
    if (bound !== null && bound !== "") {
      return {
        googlePlaceId: bound,
        resolvedVia:
          options.resolvedVia ??
          (aggregate.enrichment !== null &&
          isGoogleResolvedVia(aggregate.enrichment.resolvedVia)
            ? aggregate.enrichment.resolvedVia
            : "text_search"),
        result: null,
      };
    }

    const reserved = await this.#reserve(
      ctx,
      this.#reservation(ctx, turn, "text_search", ""),
    );
    if (!reserved.allowed) {
      return {
        googlePlaceId: null,
        resolvedVia: null,
        result: this.#budgetDenied(aggregate, reserved.reason),
      };
    }

    const found = await this.#google.textSearch(
      aggregate.place.name,
      aggregate.place.location,
    );
    if (found === null) {
      return {
        googlePlaceId: null,
        resolvedVia: null,
        result: {
          placeId: this.key,
          status: "unresolved",
          enrichment:
            aggregate.enrichment === null
              ? null
              : enrichmentRowToDto(aggregate.enrichment),
          photos: aggregate.photos.map(photoRowToDto),
          collision: null,
          reason: `google text search found no match for "${aggregate.place.name}"`,
        },
      };
    }
    return {
      googlePlaceId: found.googlePlaceId,
      resolvedVia: "text_search",
      result: null,
    };
  }

  /**
   * The photos the photo loop for the *current* details never finished, or
   * null when it did finish. `[]` is "it died after the last download": there
   * is nothing to pay for, only the marker to write.
   *
   * `photos_fetched_at` is the marker, written only by a loop that ran to its
   * end (`#fetchPhotos`). The details commit writes `details_fetched_at` and
   * leaves it alone, so "photos older than details" — or never — means that
   * details fetch's loop was cut short. A loop that ran to the end is finished
   * even if a photo in it failed, so a permanently broken photo is not bought
   * again by every redelivery inside the window.
   *
   * Of what is unfinished, only a photo with **no stored row** is returned:
   * those already stored were paid for once and are not downloaded again.
   */
  #unfinishedPhotos(maxPhotos: number): readonly IndexedPhotoRef[] | null {
    const { enrichment, photos } = this.requireAggregate();
    const detailsAt = enrichment?.detailsFetchedAt ?? null;
    if (enrichment === null || detailsAt === null) return null;
    const photosAt = enrichment.photosFetchedAt;
    if (photosAt !== null && photosAt.getTime() >= detailsAt.getTime()) {
      return null;
    }
    const stored = new Set(photos.map((photo) => photo.googlePhotoName));
    return indexedPhotoRefs(storedPhotoRefs(enrichment.photoReferences))
      .slice(0, maxPhotos)
      .filter(({ ref }) => !stored.has(ref.name));
  }

  /**
   * Finish a photo loop an earlier turn left unfinished, from the photo
   * references its details commit stored — Google's details are not asked
   * for again. Answers `fresh`, because the details are, with every photo the
   * place now has.
   */
  async #resumePhotos(
    ctx: Ctx,
    missing: readonly IndexedPhotoRef[],
  ): Promise<EnrichFromGoogleResult> {
    // Its own turn: the turn that died minted keys this one must not replay,
    // because each of these downloads is a real call (module doc).
    const { stored, finished } = await this.#fetchPhotos(
      ctx,
      randomUUID(),
      missing,
    );
    const fresh = this.#freshResult();
    if (fresh === null) {
      throw new Error(
        `PlaceActor(${this.key}) lost its fresh details while resuming photos`,
      );
    }
    return {
      ...fresh,
      reason:
        `${fresh.reason} except to finish the photos an earlier turn left ` +
        `unfinished: ${stored.length} of ${missing.length} stored` +
        (finished ? "" : ", then the budget refused the rest"),
    };
  }

  /**
   * Download and store `wanted`. Each photo is charged separately, and a
   * denial *stops* the loop rather than skipping one — the budget does not
   * become available again mid-turn.
   *
   * A single photo failing (download, upload, or the row) is logged and
   * skipped: the details are already committed and are the valuable half.
   *
   * A loop that reaches its end — every photo stored or skipped, however many
   * that was, none — stamps `photos_fetched_at`, which is what
   * `#unfinishedPhotos` reads as "finished". A loop the budget stopped does
   * not, so a later turn inside the window may finish it; one that throws or
   * whose process dies does not either, and that is what lets the outbox's
   * redelivery finish it.
   */
  async #fetchPhotos(
    ctx: Ctx,
    turn: string,
    wanted: readonly IndexedPhotoRef[],
  ): Promise<{
    readonly stored: readonly PlacePhotoDto[];
    readonly finished: boolean;
  }> {
    const stored: PhotoRow[] = [];
    let finished = true;
    for (const { index, ref } of wanted) {
      // Its own key per photo: one turn downloads several (module doc).
      const reserved = await this.#reserve(
        ctx,
        this.#reservation(ctx, turn, "photo", `${index}:${ref.name}`),
      );
      if (!reserved.allowed) {
        finished = false;
        break;
      }

      let fileId: string | null = null;
      try {
        const downloaded = await this.#google.photo(ref.name);
        if (downloaded === null) continue;
        ({ fileId } = await this.#storePhoto(ctx, {
          bytes: downloaded.bytes,
          contentType: downloaded.contentType,
        }));
      } catch (error) {
        console.warn(
          `[PlaceActor(${this.key})] photo ${ref.name} skipped:`,
          error instanceof Error ? error.message : error,
        );
        continue;
      }

      const [row] = await this.tx(async (tx) =>
        tx
          .insert(placeGooglePhotos)
          .values({
            placeId: this.key,
            googlePhotoName: ref.name,
            storageFileId: fileId,
            width: ref.widthPx ?? null,
            height: ref.heightPx ?? null,
            attributions: [...(ref.authorAttributions ?? [])],
            displayOrder: index,
          })
          .onConflictDoUpdate({
            target: [
              placeGooglePhotos.placeId,
              placeGooglePhotos.googlePhotoName,
            ],
            set: { storageFileId: fileId, displayOrder: index },
          })
          .returning(),
      );
      if (row !== undefined) stored.push(row);
    }

    if (finished) {
      await this.tx(async (tx) => {
        await tx
          .update(placeGoogleEnrichments)
          .set({ photosFetchedAt: new Date(), updatedAt: new Date() })
          .where(eq(placeGoogleEnrichments.placeId, this.key));
      });
    }
    await this.reload();
    return { stored: stored.map(photoRowToDto), finished };
  }
}

/** A photo reference and its place in Google's order — `display_order`. */
type IndexedPhotoRef = { readonly index: number; readonly ref: GooglePhotoRef };

const indexedPhotoRefs = (
  refs: readonly GooglePhotoRef[],
): readonly IndexedPhotoRef[] => refs.map((ref, index) => ({ index, ref }));

/**
 * `place_google_enrichments.photo_references` back into refs. The column is
 * jsonb that `#enrich` wrote from `details.photos`, so this is a type guard
 * rather than a parser: an entry without a string `name` cannot be downloaded
 * and is dropped, and so is every entry of a column that is not an array.
 */
const storedPhotoRefs = (value: unknown): readonly GooglePhotoRef[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is GooglePhotoRef =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as { name?: unknown }).name === "string" &&
          (entry as { name: string }).name !== "",
      )
    : [];

/* -------------------------------------------------------------------------- */
/* Input normalisation — shared with `PlaceCreationActor`                      */
/* -------------------------------------------------------------------------- */

export const PLACE_NAME_MIN = 2;
export const PLACE_NAME_MAX = 200;
export const PLACE_DESCRIPTION_MAX = 1000;

export const trimOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

/** Today's server action's own bounds, preserved. */
export const requirePlaceName = (name: string): string => {
  const trimmed = name.trim();
  if (trimmed.length < PLACE_NAME_MIN || trimmed.length > PLACE_NAME_MAX) {
    throw new ValidationError(
      `a place name must be between ${PLACE_NAME_MIN} and ${PLACE_NAME_MAX} characters`,
    );
  }
  return trimmed;
};

export const requireCategories = (
  categories: readonly string[],
): readonly string[] => {
  const cleaned = categories
    .map((category) => category.trim())
    .filter((category) => category !== "");
  if (cleaned.length === 0) {
    throw new ValidationError("a place needs at least one category");
  }
  return cleaned;
};

export const normalizeCountryCode = (value: string | null): string | null => {
  const trimmed = trimOrNull(value);
  if (trimmed === null) return null;
  const upper = trimmed.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) {
    throw new ValidationError("countryCode must be two letters");
  }
  return upper;
};

/** `places.confidence` is `numeric(3,2)`; the review clamps to `0.1..0.9`. */
export const normalizeConfidence = (value: number | null): number | null => {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError("confidence must be between 0 and 1");
  }
  return value;
};

/* -------------------------------------------------------------------------- */
/* The duplicate rule — shared with `PlaceCreationActor`                       */
/* -------------------------------------------------------------------------- */

/** `checkDuplicatePlacesAction`'s arguments to `find_duplicate_places`. */
export const DUPLICATE_RADIUS_METERS = 200;
export const DUPLICATE_MIN_SIMILARITY = 0.3;
export const DUPLICATE_LIMIT = 5;

/**
 * `createUserPlaceAction`'s blocking rule, preserved exactly: a candidate this
 * similar this close is treated as the same venue and refused.
 */
export const DUPLICATE_BLOCK_SIMILARITY = 0.7;
export const DUPLICATE_BLOCK_DISTANCE_METERS = 50;

type DuplicateRow = {
  id: string;
  name: string;
  similarity: number | string;
  distance_m: number | string;
};

const numeric = (value: number | string): number =>
  typeof value === "number" ? value : Number(value);

/**
 * `find_duplicate_places(name, lat, lng, radius, min_similarity, limit)` —
 * the same function `checkDuplicatePlacesAction` calls. It reads `places`
 * only (trigram similarity within a PostGIS radius, active rows, top
 * {@link DUPLICATE_LIMIT} by similarity).
 *
 * Both halves of the duplicate check call this with the same arguments — the
 * early one in `PlaceCreationActor` (before the AI review, so a duplicate is
 * refused without paying for one) and the authoritative one in
 * `PlaceActor.create` under the geocell locks — so the two cannot disagree
 * about what a duplicate is.
 */
export const findDuplicatePlaces = async (
  db: DbOrTx,
  name: string,
  location: LngLat,
  radiusMeters: number = DUPLICATE_RADIUS_METERS,
): Promise<readonly DuplicateCandidate[]> => {
  const result = await db.execute<DuplicateRow>(sql`
    select id, name, similarity, distance_m
    from find_duplicate_places(
      ${name},
      ${location.lat},
      ${location.lng},
      ${radiusMeters},
      ${DUPLICATE_MIN_SIMILARITY},
      ${DUPLICATE_LIMIT}
    )
  `);
  return result.rows.map((row) => ({
    placeId: row.id,
    name: row.name,
    similarity: numeric(row.similarity),
    distanceMeters: numeric(row.distance_m),
  }));
};

/**
 * The first candidate the blocking rule refuses on, ignoring `selfId` — a
 * concurrent sibling carrying the same §8.4 `placeId` is the very creation
 * being made, not a duplicate of it.
 */
export const blockingDuplicate = (
  candidates: readonly DuplicateCandidate[],
  selfId: string,
): DuplicateCandidate | undefined =>
  candidates.find(
    (candidate) =>
      candidate.placeId !== selfId &&
      candidate.similarity > DUPLICATE_BLOCK_SIMILARITY &&
      candidate.distanceMeters < DUPLICATE_BLOCK_DISTANCE_METERS,
  );

/** What a blocked creation is told — one wording, wherever it was caught. */
export const duplicatePlaceConflict = (
  blocking: DuplicateCandidate,
): ConflictError =>
  new ConflictError(
    `a very similar place ("${blocking.name}", ` +
      `${Math.round(blocking.distanceMeters)}m away) already exists; it is ` +
      `place ${blocking.placeId}`,
  );

/**
 * Lock every geocell a blocking duplicate of `location` could fall in
 * (`../lib/geocell.ts` has the grid and its derivation; the radius is the
 * block distance, because a candidate further away than that can never block).
 */
export const lockPlaceGeocells = (
  tx: DbOrTx,
  location: LngLat,
): Promise<unknown> =>
  lockAll(
    tx,
    geocellsWithin(location, DUPLICATE_BLOCK_DISTANCE_METERS).map((cell) =>
      advisoryLockKey(ADVISORY_LOCK_NAMESPACE.placeGeocell, cell.row, cell.col),
    ),
  );

const normalizeMaxPhotos = (value: number | undefined): number => {
  if (value === undefined) return DEFAULT_MAX_PHOTOS;
  if (!Number.isInteger(value) || value < 0 || value > MAX_MAX_PHOTOS) {
    throw new ValidationError(
      `maxPhotos must be an integer between 0 and ${MAX_MAX_PHOTOS}`,
    );
  }
  return value;
};

/** A match as the arc's `ItemRef`; refuses a type that names no item. */
const refOfMatch = (match: MenuItemMatch): ItemRef => {
  const type =
    typeof match.type === "string" ? itemTypeOfMatch(match.type) : null;
  if (type === null) {
    throw new ValidationError(
      `a menu-item match must be an item type (wine, beer, spirit, coffee, sake or tea); got ${match.type}`,
    );
  }
  return { type, id: match.id };
};

const requireMatch = (match: MenuItemMatch): MenuItemMatch => {
  refOfMatch(match);
  return { type: match.type, id: requireUuid(match.id, "match.id") };
};

type NormalizedScannedItem = {
  readonly name: string;
  readonly description: string | null;
  readonly price: number | null;
  readonly menuCategory: string | null;
  readonly detectedItemType: MenuItemType | null;
  readonly confidenceScore: number | null;
  readonly extractedAttributes: Record<string, unknown> | null;
  readonly searchName: string | null;
};

const requireScannedItem = (
  item: ScannedMenuItemInput,
): NormalizedScannedItem => {
  const name = item.name.trim();
  if (name === "") throw new ValidationError("a menu item needs a name");
  const detected = item.detectedItemType ?? null;
  if (detected !== null && !isMenuItemType(detected)) {
    throw new ValidationError(`not a menu item type: ${detected}`);
  }
  const price = item.price ?? null;
  if (price !== null && (!Number.isFinite(price) || price < 0)) {
    throw new ValidationError("a menu item price must be a positive number");
  }
  const confidence = item.confidenceScore ?? null;
  if (confidence !== null && (confidence < 0 || confidence > 1)) {
    throw new ValidationError("confidenceScore must be between 0 and 1");
  }
  return {
    name,
    description: trimOrNull(item.description),
    price,
    menuCategory: trimOrNull(item.menuCategory),
    detectedItemType: detected,
    confidenceScore: confidence,
    extractedAttributes: item.extractedAttributes ?? null,
    searchName: trimOrNull(item.searchName),
  };
};
