/**
 * The `Item` aggregate as `services/api` sees it (migration plan §2.1, `ItemActor`).
 *
 * Six physical tables — `wines`, `beers`, `spirits`, `coffees`, `sakes`,
 * `teas` — plus a six-column polymorphic foreign key are hidden behind one
 * actor and, in GraphQL, behind one `Item` interface (§9 defers consolidating
 * the tables; the interface is what makes that deferral safe).
 *
 * ## `generic` is a key namespace, not an `ItemType` (settled by B2)
 *
 * §2.1 keys `ItemActor` by `type ∈ wine | beer | spirit | coffee | sake | tea |
 * generic`, while `ITEM_TYPES` below has only six values. **Both are right,
 * about different things**, and B2 checked it against the live database:
 *
 * - `item_type` is a Postgres enum whose values are exactly the six. Its only
 *   referencing column is `item_favorites.type`, so a generic item cannot even
 *   be favourited.
 * - `generic_items.item_type` is a *`text`* column with its own check
 *   constraint over the six item types, lowercase, plus `ingredient`, which
 *   `item_type` cannot represent. It categorises an ingredient; it does not
 *   select a table. (It lacked `sake` and `tea` until
 *   `20260928043100_generic_items_sake_tea_kinds`, so a sake or tea ingredient
 *   was filed as `ingredient`.)
 * - None of `item_image`, `item_vectors`, `item_reviews`, `item_brands` or
 *   `cellar_items` has a `generic_item_id` column. Each carries exactly six
 *   polymorphic columns under a `num_nonnulls(…) = 1` check. A generic item
 *   therefore has no images, no vector, no reviews, no brands, and cannot sit
 *   in a cellar — which is what `Item` means.
 * - `generic_items`' only referent is `recipe_ingredients.generic_item_id`.
 *
 * So `ItemActor`'s **key space** has seven namespaces (it is the single writer
 * of `generic_items`, per §3), and the **`Item` interface and `ItemType`** have
 * six. `GenericItemDto` below is deliberately not a member of `ItemDto`, and
 * `getGeneric` / `createGeneric` / `updateGeneric` are deliberately separate
 * methods: a generic item shares an actor class with an item and shares
 * nothing else. B6 surfaces it on `RecipeIngredient`.
 *
 * **These DTOs are the wire shape, not the row shape.** `numeric` columns cross
 * the Dapr wire as JSON numbers and `timestamptz` as ISO-8601 strings; the
 * actor is responsible for that conversion, because `services/api` has no Drizzle
 * and no database.
 *
 * B2 owns `ItemActor` and will extend these. Fields listed here are the ones
 * the six tables actually have today.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import { ValidationError } from "./errors.ts";
import {
  byItemType,
  ITEM_TYPE_SPECS,
  type ItemAttributeBag,
  type ItemAttributesInputOf,
  type ItemAttributesOf,
  type ItemTypeSpec,
  itemAttributeEntries,
  type Simplify,
} from "./item-types.ts";
import type { Page, PageArgs } from "./page.ts";

/** Exactly the values of the `item_type` Postgres enum. */
export const ITEM_TYPES = [
  "WINE",
  "BEER",
  "SPIRIT",
  "COFFEE",
  "SAKE",
  "TEA",
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

export const isItemType = (value: string): value is ItemType =>
  (ITEM_TYPES as readonly string[]).includes(value);

/** A typed reference to an item. What collection actors return (§2.2). */
export type ItemRef = { readonly type: ItemType; readonly id: string };

/**
 * `ItemActor` is keyed `type:itemId` with a lowercase type (§2.1). Every
 * resolver that reaches an item goes through this, so the key format is
 * decided once here rather than string-concatenated at twenty call sites.
 */
export const itemActorId = (ref: ItemRef): string =>
  `${ref.type.toLowerCase()}:${ref.id}`;

export const parseItemActorId = (actorId: string): ItemRef | null => {
  const separator = actorId.indexOf(":");
  if (separator < 1) return null;
  const type = actorId.slice(0, separator).toUpperCase();
  const id = actorId.slice(separator + 1);
  return isItemType(type) && id.length > 0 ? { type, id } : null;
};

/** The columns all six tables share. */
type ItemCore = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  /** ISO-8601. */
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdById: string;
  readonly barcodeCode: string | null;
  readonly country: string | null;
};

/**
 * One concrete item as the wire carries it: the shared columns, the
 * discriminator, and the type's attributes exactly as `ITEM_TYPE_SPECS`
 * declares them (`item-types.ts`) — so the renames (`spiritType`, `sakeType`,
 * `vintageYear`) and the three required attributes are stated there, once.
 */
export type ItemDtoOf<T extends ItemType> = Simplify<
  ItemCore & { readonly type: T } & ItemAttributesOf<T>
>;

export type WineDto = ItemDtoOf<"WINE">;
export type BeerDto = ItemDtoOf<"BEER">;
export type SpiritDto = ItemDtoOf<"SPIRIT">;
export type CoffeeDto = ItemDtoOf<"COFFEE">;
export type SakeDto = ItemDtoOf<"SAKE">;
export type TeaDto = ItemDtoOf<"TEA">;

export type ItemDto =
  | WineDto
  | BeerDto
  | SpiritDto
  | CoffeeDto
  | SakeDto
  | TeaDto;

/* -------------------------------------------------------------------------- */
/* The seventh key namespace: `generic_items`                                  */
/* -------------------------------------------------------------------------- */

/** The `ItemActor` key prefix for a `generic_items` row. Not an `ItemType`. */
export const GENERIC_ITEM_PREFIX = "generic";

/**
 * `generic_items.item_type` — a `text` check constraint, not `item_type`:
 * every item type, lowercase, plus `ingredient`. `item-types.test.ts` holds it
 * to `ITEM_TYPES`; `item-spec-schema.test.ts` (actors) to the constraint.
 */
export const GENERIC_ITEM_KINDS = [
  "beer",
  "coffee",
  "ingredient",
  "sake",
  "spirit",
  "tea",
  "wine",
] as const;
export type GenericItemKind = (typeof GENERIC_ITEM_KINDS)[number];

export const isGenericItemKind = (value: string): value is GenericItemKind =>
  (GENERIC_ITEM_KINDS as readonly string[]).includes(value);

/**
 * A `generic_items` row: a recipe ingredient like salt or "London dry gin".
 * Deliberately **not** a member of `ItemDto` — see the module doc.
 */
export type GenericItemDto = {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly subcategory: string | null;
  readonly kind: GenericItemKind;
  readonly description: string | null;
  readonly isSubstitutable: boolean;
  /** Nullable, and `ON DELETE SET NULL` — unlike the six item tables. */
  readonly createdById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export const genericItemActorId = (id: string): string =>
  `${GENERIC_ITEM_PREFIX}:${id}`;

/**
 * `ItemActor`'s full key space: one of the six item types, or `generic`.
 * `parseItemActorId` stays six-only, because everything reaching an item
 * through the `Item` interface must never resolve a generic id by accident.
 */
export type ItemActorKey =
  | { readonly kind: "item"; readonly ref: ItemRef }
  | { readonly kind: "generic"; readonly id: string };

export const parseItemActorKey = (actorId: string): ItemActorKey | null => {
  const separator = actorId.indexOf(":");
  if (separator < 1) return null;
  const prefix = actorId.slice(0, separator);
  const id = actorId.slice(separator + 1);
  if (id.length === 0) return null;
  if (prefix === GENERIC_ITEM_PREFIX) return { kind: "generic", id };
  const ref = parseItemActorId(actorId);
  return ref === null ? null : { kind: "item", ref };
};

/* -------------------------------------------------------------------------- */
/* Satellite DTOs — `item_image`, `item_reviews`, `item_brands`                 */
/* -------------------------------------------------------------------------- */

/**
 * One `item_image` row. §2.1: "the item is public; `item_image` rows are
 * visible when `is_public` or owned by the viewer" — so a page of these is
 * already filtered by `ItemActor.images` and needs no second check.
 */
export type ItemImageDto = {
  readonly id: string;
  readonly itemId: string;
  readonly itemType: ItemType;
  /** `files.id`. B2 repointed this FK off `storage.files` (A8's outcome note). */
  readonly fileId: string;
  /** Who uploaded it. */
  readonly userId: string;
  readonly isPublic: boolean;
  readonly placeholder: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** One `item_reviews` row. `text` is a `json` column, shape owned by the client. */
export type ItemReviewDto = {
  readonly id: string;
  readonly itemId: string;
  readonly itemType: ItemType;
  readonly userId: string;
  /** 0.5 – 5.0 in 0.5 steps; the check constraint is the authority. */
  readonly score: number;
  readonly text: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/**
 * §2.1's `score`, "computed from reviews in memory; replaces the `_aggregate`
 * calls". `average` is `null` when there are no reviews — not `0`, which would
 * read as "everyone hated it".
 */
export type ItemScoreDto = {
  readonly average: number | null;
  readonly count: number;
};

/** One `item_brands` row: which brand, and whether it is the primary one. */
export type ItemBrandDto = {
  readonly id: string;
  readonly itemId: string;
  readonly itemType: ItemType;
  readonly brandId: string;
  readonly isPrimary: boolean;
  readonly createdAt: string;
};

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The per-type attribute bags. GraphQL has no input unions, so `CreateItemInput`
 * carries all six as optional members and the actor requires the one matching
 * `type` — which is also where the per-table NOT NULL columns are enforced
 * (`wines.vintage`, `wines.style`, `spirits.type`, `coffees.description`).
 *
 * Each bag is `ItemAttributesInputOf<T>`, derived from `ITEM_TYPE_SPECS`.
 */
export type WineAttributesInput = ItemAttributesInputOf<"WINE">;
export type BeerAttributesInput = ItemAttributesInputOf<"BEER">;
export type SpiritAttributesInput = ItemAttributesInputOf<"SPIRIT">;
export type CoffeeAttributesInput = ItemAttributesInputOf<"COFFEE">;
export type SakeAttributesInput = ItemAttributesInputOf<"SAKE">;
export type TeaAttributesInput = ItemAttributesInputOf<"TEA">;

/** `{ wine?: WineAttributesInput | null, … }`, keyed by each spec's `bag`. */
export type ItemAttributesInput = {
  readonly [T in ItemType as ItemAttributeBag<T>]?: ItemAttributesInputOf<T> | null;
};

export type CreateItemInput = ItemAttributesInput & {
  readonly name: string;
  readonly description?: string | null;
  readonly country?: string | null;
  /**
   * Ensured through `BarcodeActor.ensure` before the item row is written
   * (§8.5 lets an entity actor call `BarcodeActor` synchronously).
   */
  readonly barcodeCode?: string | null;
  readonly barcodeType?: string | null;
  /**
   * `NOT NULL` on `wines`, `beers`, `spirits` and `coffees`; nullable on
   * `sakes` and `teas`. `ItemOnboardingActor.confirm` always supplies it.
   */
  readonly itemOnboardingId?: string | null;
  /** `system` only — an outbox delivery has no viewer to attribute the row to. */
  readonly createdById?: string | null;
};

export type UpdateItemInput = ItemAttributesInput & {
  readonly name?: string;
  readonly description?: string | null;
  readonly country?: string | null;
};

/* -------------------------------------------------------------------------- */
/* The NOT NULL columns that have no GraphQL non-null to enforce them (A7c)    */
/* -------------------------------------------------------------------------- */

/**
 * Four columns are `NOT NULL` with no default and **invisible at the GraphQL
 * boundary**, because GraphQL has no input unions: `CreateItemInput` has to
 * carry all six attribute bags as optional, so `wine.style` cannot be `String!`
 * without making it required for beers too.
 *
 * They are listed here — in `contracts`, next to the types — rather than inside
 * `ItemActor`, because **`ItemActor` is the wrong place to be the only
 * enforcer.** `ItemOnboardingActor.confirm` reaches `ItemActor.create` through
 * the outbox (§8.5: entity → entity), so a violation raised inside `create` is
 * raised during *delivery*: the caller was already told the mutation succeeded,
 * the row retries for ~17 minutes and dead-letters where only Grafana looks,
 * and the item silently never appears. Anything that enqueues an
 * `ItemActor.create` must call `requireItemAttributes` **before** writing the
 * outbox row.
 *
 * `sakes` and `teas` have no such column — they were added after this flow and
 * every one of their attributes is nullable.
 *
 * **Derived from `ITEM_TYPE_SPECS`**: every attribute declared `required`,
 * then `description` where the spec says `descriptionRequired`.
 * `item-types.test.ts` pins the result to the list this used to spell out,
 * and `services/actors`' `item-spec-schema.test.ts` holds the spec's
 * requiredness to `information_schema`.
 */
export type RequiredItemAttribute = {
  /** The input path the caller has to fill in, for the error message. */
  readonly field: string;
  /** `<table>.<column>`, so the message says why it is required. */
  readonly column: string;
  /** Where to look: the per-type bag, or `CreateItemInput` itself. */
  readonly on: "attributes" | "input";
};

export const REQUIRED_ITEM_ATTRIBUTES: Record<
  ItemType,
  readonly RequiredItemAttribute[]
> = byItemType((type): readonly RequiredItemAttribute[] => {
  const spec: ItemTypeSpec = ITEM_TYPE_SPECS[type];
  return [
    ...itemAttributeEntries(type)
      .filter(([, attribute]) => attribute.required)
      .map(([field, attribute]) => ({
        field,
        column: `${spec.table}.${attribute.column}`,
        on: "attributes" as const,
      })),
    ...(spec.descriptionRequired
      ? [
          {
            field: "description",
            column: `${spec.table}.description`,
            on: "input" as const,
          },
        ]
      : []),
  ];
});

/** `CreateItemInput`'s attribute-bag key, per type — each spec's `bag`. */
export const ITEM_ATTRIBUTE_KEY = {
  WINE: ITEM_TYPE_SPECS.WINE.bag,
  BEER: ITEM_TYPE_SPECS.BEER.bag,
  SPIRIT: ITEM_TYPE_SPECS.SPIRIT.bag,
  COFFEE: ITEM_TYPE_SPECS.COFFEE.bag,
  SAKE: ITEM_TYPE_SPECS.SAKE.bag,
  TEA: ITEM_TYPE_SPECS.TEA.bag,
} as const satisfies {
  readonly [T in ItemType]: ItemAttributeBag<T> & keyof ItemAttributesInput;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Throws a `ValidationError` naming the first missing field, or returns.
 *
 * Deliberately shallow: it checks presence, not type or reference-table
 * membership. A bad `style` is a foreign-key error the caller can read; a
 * *missing* one is the case that used to vanish.
 */
export const requireItemAttributes = (
  type: ItemType,
  input: Partial<CreateItemInput> & Record<string, unknown>,
): void => {
  const bagKey = ITEM_ATTRIBUTE_KEY[type];
  const rawBag = input[bagKey];
  if (rawBag !== undefined && rawBag !== null && !isPlainObject(rawBag)) {
    throw new ValidationError(
      `${bagKey} attributes must be an object, got ${Array.isArray(rawBag) ? "an array" : typeof rawBag}`,
    );
  }
  const bag: Record<string, unknown> = isPlainObject(rawBag) ? rawBag : {};

  for (const required of REQUIRED_ITEM_ATTRIBUTES[type]) {
    const value =
      required.on === "attributes"
        ? bag[required.field]
        : input[required.field];
    if (value === undefined || value === null || value === "") {
      throw new ValidationError(
        `a ${type.toLowerCase()} needs ${required.on === "attributes" ? `${bagKey}.${required.field}` : required.field}` +
          ` (${required.column} is NOT NULL)`,
      );
    }
  }
};

export type CreateGenericItemInput = {
  readonly name: string;
  readonly category: string;
  readonly subcategory?: string | null;
  readonly kind: GenericItemKind;
  readonly description?: string | null;
  readonly isSubstitutable?: boolean | null;
};

export type UpdateGenericItemInput = {
  readonly name?: string;
  readonly category?: string;
  readonly subcategory?: string | null;
  readonly kind?: GenericItemKind;
  readonly description?: string | null;
  readonly isSubstitutable?: boolean | null;
};

export type AttachItemImageInput = {
  /** A `files.id` whose object `FileActor.verify` has confirmed. */
  readonly fileId: string;
  readonly isPublic?: boolean | null;
  readonly placeholder?: string | null;
  /** Mint it to make the call idempotent (§8.4). */
  readonly imageId?: string | null;
};

export type AddItemReviewInput = {
  readonly score: number;
  readonly text?: string | null;
  /** Mint it to make the call idempotent (§8.4). */
  readonly reviewId?: string | null;
};

export type UpdateItemReviewInput = {
  readonly score?: number;
  readonly text?: string | null;
};

export type LinkItemBrandInput = {
  readonly brandId: string;
  readonly isPrimary?: boolean | null;
};

/**
 * `setBarcode`'s argument.
 *
 * **A bare `string | null` will not work over the outbox**, and this is the
 * same trap B4 hit with `confirmFriendship`: `enqueueOutbox` types `payload`
 * as `Record<string, unknown>` and `OutboxActor.deliver` invokes exactly
 * `method(systemCtx, payload)`, so a scalar second argument arrives as an
 * object. §2.1's prose (`linkItem` → the item half) implies the scalar; the
 * real signature is this.
 */
export type SetItemBarcodeInput = {
  /** `null` clears the link. */
  readonly code: string | null;
};

export type DeletedItemReview = { readonly id: string };
export type UnlinkedItemBrand = { readonly brandId: string };
export type DetachedItemImage = { readonly id: string };

/** What an `ItemActor.regenerateVector` outbox row carries. */
export type RegenerateItemVectorPayload = {
  /**
   * `image`: an image was attached or detached while the configured embedding
   * takes images, so the vector's image set changed (`embedding_images`).
   */
  readonly reason: "create" | "update" | "image";
  readonly itemType: ItemType;
  readonly itemId: string;
};

/**
 * What `regenerateVector` reports back. `skipped` is the case §6 B2 asks for a
 * test on: nothing embedding-relevant changed, so no model call was made.
 */
export type RegenerateVectorResult = {
  readonly itemId: string;
  readonly itemType: ItemType;
  readonly skipped: boolean;
  readonly reason: string;
};

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `ItemActor(type:itemId)` — entity actor, owned by **B2** (§2.1, §3).
 *
 * Owns the type's row in `wines | beers | spirits | coffees | sakes | teas |
 * generic_items`, plus `item_image`, `item_vectors`, `item_reviews` and
 * `item_brands`.
 *
 * The `*Generic` methods address the seventh key namespace and are the only
 * ones a `generic:<id>` actor answers; the rest throw `ValidationError` there,
 * and `getGeneric` throws on an item key. See the module doc for why they are
 * separate rather than polymorphic.
 *
 * **No method here awaits an external or AI call.** The one model-shaped
 * dependency, `regenerateVector`'s embedding, is delegated to `EmbeddingActor`
 * (C1) through an injected seam — the same shape `CellarActor.semanticQuery`
 * uses. `services/actors/src/lib/no-external-calls.test.ts` asserts it statically.
 */
export type ItemActorInterface = {
  get(ctx: Ctx): Promise<ItemDto>;
  /** Called by `ItemOnboardingActor.confirm` and `RecipePhotoJobActor` (§2.1). */
  create(ctx: Ctx, input: CreateItemInput): Promise<ItemDto>;
  /** Creator only; enrichment updates come in as `system`. */
  update(ctx: Ctx, input: UpdateItemInput): Promise<ItemDto>;
  /**
   * The item half of `BarcodeActor.linkItem`, delivered by the outbox
   * (§1.7). Idempotent: setting the code it already has writes nothing.
   */
  setBarcode(ctx: Ctx, input: SetItemBarcodeInput): Promise<ItemDto>;
  /** Verifies the object exists through `FileActor` before writing (§2.1). */
  attachImage(ctx: Ctx, input: AttachItemImageInput): Promise<ItemImageDto>;
  detachImage(ctx: Ctx, imageId: string): Promise<DetachedItemImage>;
  /** Already filtered by `canSeeItemImage` — public, or the viewer's own. */
  images(ctx: Ctx, page: PageArgs): Promise<Page<ItemImageDto>>;
  /**
   * UI parity G15 — one of this item's images by id, if the viewer may see
   * it (`canSeeItemImage`), else `null` — as is an id that is not this item's.
   * What `CellarItem.displayImage` resolves `display_image_id` through.
   */
  image(ctx: Ctx, imageId: string): Promise<ItemImageDto | null>;
  addReview(ctx: Ctx, input: AddItemReviewInput): Promise<ItemReviewDto>;
  updateReview(
    ctx: Ctx,
    reviewId: string,
    input: UpdateItemReviewInput,
  ): Promise<ItemReviewDto>;
  deleteReview(ctx: Ctx, reviewId: string): Promise<DeletedItemReview>;
  reviews(ctx: Ctx, page: PageArgs): Promise<Page<ItemReviewDto>>;
  /** Computed in memory from the loaded reviews; replaces `_aggregate` (§2.1). */
  score(ctx: Ctx): Promise<ItemScoreDto>;
  /**
   * UI parity G7: the viewer's own newest review of this item, or `null` —
   * the old card's gold star (`user_reviews` aggregate) and the tier-list
   * row's score. Read from the reviews this actor already holds. Anonymous is
   * refused like every other read here (the API answers `null` for it without
   * calling); a `system` ctx, which names nobody, gets `null`.
   */
  myReview(ctx: Ctx): Promise<ItemReviewDto | null>;
  linkBrand(ctx: Ctx, input: LinkItemBrandInput): Promise<ItemBrandDto>;
  unlinkBrand(ctx: Ctx, brandId: string): Promise<UnlinkedItemBrand>;
  brands(ctx: Ctx, page: PageArgs): Promise<Page<ItemBrandDto>>;
  /**
   * `system`, via the outbox. Idempotent on the outbox row id (§8.4). The
   * payload is forensic — it says in the `outbox` row why the vector was
   * restated — and the method reads none of it.
   */
  regenerateVector(
    ctx: Ctx,
    payload?: RegenerateItemVectorPayload,
  ): Promise<RegenerateVectorResult>;

  /* The seventh key namespace. */
  getGeneric(ctx: Ctx): Promise<GenericItemDto>;
  createGeneric(
    ctx: Ctx,
    input: CreateGenericItemInput,
  ): Promise<GenericItemDto>;
  updateGeneric(
    ctx: Ctx,
    input: UpdateGenericItemInput,
  ): Promise<GenericItemDto>;
};

export const ItemActorDescriptor: ActorDescriptor<ItemActorInterface> = {
  actorType: "ItemActor",
  category: "entity",
  // Each enqueues `regenerateVector` (an embedding) — `update` only when an
  // embedded field changes, which is counted as always (over-counting is the
  // direction a cost limit may err in).
  methods: {
    get: {},
    create: { modelBacked: true },
    update: { modelBacked: true },
    setBarcode: {},
    // Each enqueues `regenerateVector` (an embedding) when the configured
    // embedding takes images — the item's newest image is one of its inputs.
    attachImage: { modelBacked: true },
    detachImage: { modelBacked: true },
    images: {},
    image: {},
    addReview: {},
    updateReview: {},
    deleteReview: {},
    reviews: {},
    score: {},
    myReview: {},
    linkBrand: {},
    unlinkBrand: {},
    brands: {},
    // An embedding through `EmbeddingActor.embedDocument` (90s: up to three
    // label/display image downloads and the model call), plus the turn around
    // it. The outbox waits this long for the delivery (`pairDeliveryTimeoutMs`).
    regenerateVector: { timeoutMs: 100_000 },
    getGeneric: {},
    createGeneric: {},
    updateGeneric: {},
  },
};

/**
 * `FavoritesCollectionActor(viewerId)` moved to `collections.ts` in **C3**,
 * where it sits with the other eight collection actors and their shared
 * ids-vs-projection rationale (§1.5). A7 declared it here so `me.favorites`
 * could be written before C3 existed; the descriptor and the method signature
 * are unchanged, and both still reach `services/api` through the package index.
 */
export type {} from "./collections.ts";
