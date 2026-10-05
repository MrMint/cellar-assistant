/**
 * `ItemActor` — B2 (migration plan §2.1, §3).
 *
 * > **`ItemActor(type:itemId)`** — `type ∈ wine | beer | spirit | coffee |
 * > sake | tea | generic`
 * > - Owns: the type's row in `wines | beers | spirits | coffees | sakes |
 * >   teas | generic_items`, `item_image`, `item_vectors`, `item_reviews`,
 * >   `item_brands`.
 *
 * **Seven physical tables, one actor class, one GraphQL interface.** The six
 * item tables plus the six-column polymorphic foreign key stop here: nothing
 * above this file — not `services/api`, not the frontend — knows that a wine and a
 * tea live in different tables (§9 defers consolidating them; `Item` is what
 * makes deferring safe).
 *
 * ## The key space has seven namespaces; `ItemType` has six
 *
 * `packages/contracts/src/items.ts` carries the long form of this. In short,
 * checked against the live database on 2026-09-09:
 *
 * - the `item_type` enum's values are exactly `WINE BEER SPIRIT COFFEE SAKE
 *   TEA`; `generic` is not among them;
 * - `generic_items.item_type` is a *`text`* column with its own check
 *   constraint over the six item types plus `ingredient` (sake and tea only
 *   since `20260928043100_generic_items_sake_tea_kinds`) — it categorises
 *   an ingredient, it does not select a table;
 * - none of `item_image`, `item_vectors`, `item_reviews`, `item_brands`,
 *   `cellar_items`, `item_favorites` or `tier_list_items` has a
 *   `generic_item_id` column, so a generic item has no images, no vector, no
 *   reviews, no brands, cannot be favourited and cannot sit in a cellar.
 *
 * So the `*Generic` methods below are the *only* ones a `generic:<id>` actor
 * answers, and every other method refuses that key. They are deliberately not
 * polymorphic with `get`/`create`/`update`: a generic item shares an actor
 * class with an item and shares nothing else.
 *
 * ## What runs inside a turn
 *
 * No `fetch`, no HTTP client, no AI SDK — `src/lib/no-external-calls.test.ts`
 * asserts that statically over this file's identifiers *and* its import list.
 * The two outbound calls this actor makes are the ones §8.5 sanctions for an
 * entity actor (`FileActor`, `EmbeddingActor`), both behind injected seams so
 * the no-sidecar harness can drive them — the shape `CellarActor` uses for
 * `EmbeddingActor` and `FileActor` uses for its binding.
 *
 * `regenerateVector` is the model-shaped one, and it is **outbox-driven**
 * (`system`), never request-driven, precisely so a multi-second embedding never
 * sits in the turn of an item a user is reading.
 */
import { randomUUID } from "node:crypto";
import type {
  ActorCategory,
  AddItemReviewInput,
  AttachItemImageInput,
  CreateGenericItemInput,
  CreateItemInput,
  Ctx,
  DeletedItemReview,
  DetachedItemImage,
  GenericItemDto,
  GenericItemKind,
  ItemActorInterface,
  ItemBrandDto,
  ItemDto,
  ItemImageDto,
  ItemRef,
  ItemReviewDto,
  ItemScoreDto,
  ItemType,
  LinkItemBrandInput,
  Page,
  PageArgs,
  RegenerateVectorResult,
  SetItemBarcodeInput,
  UnlinkedItemBrand,
  UpdateGenericItemInput,
  UpdateItemInput,
  UpdateItemReviewInput,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  canonicalBarcodeCode,
  ForbiddenError,
  genericItemActorId,
  ITEM_TYPE_SPECS,
  ItemActorDescriptor,
  isGenericItemKind,
  itemActorId,
  NotFoundError,
  offsetPage,
  parseItemActorKey,
  requireItemAttributes,
  ValidationError,
} from "@cellar-assistant/contracts";
import {
  beers,
  coffees,
  genericItems,
  itemBrands,
  itemImage,
  itemOnboardings,
  itemReviews,
  itemVectors,
  sakes,
  spirits,
  teas,
  wines,
} from "@cellar-assistant/db";
import { eq, sql } from "@cellar-assistant/db/orm";
import {
  bypassesPolicy,
  canSeeItemImage,
  isOwner,
} from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import {
  EntityActorBase,
  isCanonicalUuid,
  type KeyShape,
} from "../lib/actor-base.ts";
import { assertNever } from "../lib/assert-never.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import {
  daprEmbedDocument,
  type EmbedDocument,
} from "../lib/embedding-client.ts";
import {
  daprVerifyFile,
  requireVerifiedFile,
  type VerifyFile,
} from "../lib/file-verification.ts";
import { requirePrivileged, requireSignedIn } from "../lib/guards.ts";
import { ARCS } from "../lib/item-arcs.ts";
import {
  anyItemRowToDto,
  attributeColumns,
  EMBEDDING_PROPERTIES,
  embeddingTextFor,
  ITEM_TABLES,
  type ItemInsertOf,
  type ItemRow,
  itemInsertValues,
} from "../lib/item-bindings.ts";
import { enqueueOutbox } from "../lib/outbox.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import { requireUuid } from "../lib/uuid.ts";
import {
  embeddingModel,
  halfvec,
  imageSetKey,
  regenerateIfStale,
  type StoredVector,
  storedVector,
} from "../lib/vectors.ts";

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

type GenericItemRow = typeof genericItems.$inferSelect;

export type { ItemRow };

type ItemImageRow = typeof itemImage.$inferSelect;
type ItemReviewRow = typeof itemReviews.$inferSelect;
type ItemBrandRow = typeof itemBrands.$inferSelect;

export type ItemAggregate =
  | {
      readonly kind: "item";
      readonly ref: ItemRef;
      readonly row: ItemRow;
      /** Every row; `images()` filters by `canSeeItemImage` per viewer. */
      readonly images: readonly ItemImageRow[];
      readonly reviews: readonly ItemReviewRow[];
      readonly brands: readonly ItemBrandRow[];
      /** This item's `item_vectors` row: when it was written, and by what. */
      readonly vector: StoredVector | null;
    }
  | { readonly kind: "generic"; readonly row: GenericItemRow };

/* -------------------------------------------------------------------------- */
/* The polymorphic foreign key, in both directions                             */
/* -------------------------------------------------------------------------- */

/**
 * The four satellites this actor owns each carry the six-column item arc;
 * `../lib/item-arcs.ts` derives the `where`, the insert fragment and the
 * read-back from each table's own columns.
 */
const { itemBrands: BRANDS, itemImage: IMAGES, itemReviews: REVIEWS } = ARCS;
const VECTORS = ARCS.itemVectors;

/* -------------------------------------------------------------------------- */
/* Injected seams (§8.5: entity → FileActor / EmbeddingActor)                  */
/* -------------------------------------------------------------------------- */

/**
 * `FileActor.verify` — "verifies the object exists via `FileActor` before
 * writing" (§2.1 `attachImage`). Injected for the same reason `FileActor`
 * injects its binding: the no-Dapr harness has no sidecar.
 *
 * E2d moved the seam itself to `../lib/file-verification.ts` so
 * `MenuScanActor` could use the *same* one rather than a second copy — which
 * is how `derivedUuid` ended up with three. Re-exported because this module's
 * existing importers (and `item-actor.test.ts`) name it here.
 */
export type { VerifyFile };
export { daprVerifyFile };

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

const iso = (value: Date | null): string =>
  (value ?? new Date(0)).toISOString();

/** `item_reviews`' "Score in allowed values" check, enforced before the insert. */
const ALLOWED_SCORES = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;

const requireScore = (score: number): number => {
  if (!(ALLOWED_SCORES as readonly number[]).includes(score)) {
    throw new ValidationError(
      `score must be one of ${ALLOWED_SCORES.join(", ")}, got ${score}`,
    );
  }
  return score;
};

/**
 * Which columns, per type, actually change the embedding.
 *
 * §2.1: "`regenerateVector` (system, via outbox; change detection on
 * embedding-relevant fields only — today every column update re-embeds)".
 * Today's `generate_*_vector` event triggers are declared `update: columns:
 * '*'`, so touching `barcode_code` costs a model call. `EMBEDDING_PROPERTIES`
 * (derived from each spec's `embedding` list in `../lib/item-bindings.ts`) is
 * what replaces that; anything not named there (`barcode_code`,
 * `item_onboarding_id`, `created_by_id`, the timestamps) is embedding-inert.
 */
export { embeddingTextFor };

/* -------------------------------------------------------------------------- */
/* Row → DTO                                                                   */
/* -------------------------------------------------------------------------- */

/** Derived from `ITEM_BINDINGS` — see `../lib/item-bindings.ts`. */
export const itemRowToDto = anyItemRowToDto;

const genericRowToDto = (row: GenericItemRow): GenericItemDto => {
  if (!isGenericItemKind(row.itemType)) {
    // The check constraint makes this unreachable; if it fires the constraint
    // and `GENERIC_ITEM_KINDS` have drifted apart.
    throw new ConflictError(
      `generic_items ${row.id} has item_type "${row.itemType}", which is not a GenericItemKind`,
    );
  }
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    kind: row.itemType,
    description: row.description,
    isSubstitutable: row.isSubstitutable ?? true,
    createdById: row.createdById,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
};

const imageRowToDto = (type: ItemType, row: ItemImageRow): ItemImageDto => ({
  id: row.id,
  itemId: IMAGES.refOf(row)?.id ?? "",
  itemType: type,
  fileId: row.fileId,
  userId: row.userId,
  isPublic: row.isPublic,
  placeholder: row.placeholder,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const reviewRowToDto = (type: ItemType, row: ItemReviewRow): ItemReviewDto => ({
  id: row.id,
  itemId: REVIEWS.refOf(row)?.id ?? "",
  itemType: type,
  userId: row.userId,
  score: Number(row.score),
  text: row.text === null ? null : JSON.stringify(row.text),
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const brandRowToDto = (type: ItemType, row: ItemBrandRow): ItemBrandDto => ({
  id: row.id,
  itemId: BRANDS.refOf(row)?.id ?? "",
  itemType: type,
  brandId: row.brandId,
  isPrimary: row.isPrimary ?? false,
  createdAt: iso(row.createdAt),
});

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

export class ItemActor
  extends EntityActorBase<ItemAggregate>
  implements ItemActorInterface
{
  static readonly category: ActorCategory = ItemActorDescriptor.category;
  /**
   * `<type>:<uuid>` or `generic:<uuid>` — all seven tables' ids are uuids —
   * and spelled exactly as `itemActorId` / `genericItemActorId` spell it. The
   * key that took the actor host down was `sake:not-a-uuid`: a valid prefix,
   * which `parseItemActorKey` accepts, around an id Postgres cannot cast. The
   * round-trip also refuses `SAKE:<uuid>`, which parses (the prefix is matched
   * case-blind) but would be a second activation for the same row.
   */
  static override readonly keyShape: KeyShape = (key) => {
    const parsed = parseItemActorKey(key);
    if (parsed === null) return false;
    if (parsed.kind === "generic") {
      return (
        isCanonicalUuid(parsed.id) && key === genericItemActorId(parsed.id)
      );
    }
    return isCanonicalUuid(parsed.ref.id) && key === itemActorId(parsed.ref);
  };

  readonly #verifyFile: VerifyFile;
  readonly #embed: EmbedDocument;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    verifyFile: VerifyFile = daprVerifyFile,
    embed: EmbedDocument = daprEmbedDocument,
  ) {
    super(daprClient, id, db);
    this.#verifyFile = verifyFile;
    this.#embed = embed;
  }

  protected async loadAggregate(id: string): Promise<ItemAggregate | null> {
    const key = parseItemActorKey(id);
    if (key === null) return null;

    if (key.kind === "generic") {
      const [row] = await this.db
        .select()
        .from(genericItems)
        .where(eq(genericItems.id, key.id));
      return row === undefined ? null : { kind: "generic", row };
    }

    const { ref } = key;
    const row = await this.#readItemRow(ref);
    if (row === null) return null;

    const [images, reviews, brands, vectors] = await Promise.all([
      this.db
        .select()
        .from(itemImage)
        .where(IMAGES.where(ref))
        .orderBy(sql`${itemImage.createdAt} desc, ${itemImage.id} desc`),
      this.db
        .select()
        .from(itemReviews)
        .where(REVIEWS.where(ref))
        .orderBy(sql`${itemReviews.createdAt} desc, ${itemReviews.id} desc`),
      this.db
        .select()
        .from(itemBrands)
        .where(BRANDS.where(ref))
        .orderBy(sql`${itemBrands.createdAt} desc, ${itemBrands.id} desc`),
      this.db
        .select({
          id: itemVectors.id,
          updatedAt: itemVectors.updatedAt,
          embeddingModel: itemVectors.embeddingModel,
          embeddingImages: itemVectors.embeddingImages,
        })
        .from(itemVectors)
        .where(VECTORS.where(ref))
        .orderBy(sql`${itemVectors.id} asc`),
    ]);

    return {
      kind: "item",
      ref,
      row,
      images,
      reviews,
      brands,
      vector: storedVector(vectors),
    };
  }

  async #readItemRow(ref: ItemRef): Promise<ItemRow | null> {
    const table = ITEM_TABLES[ref.type];
    const [row] = await this.db
      .select()
      .from(table)
      .where(eq(table.id, ref.id));
    return (row as ItemRow | undefined) ?? null;
  }

  /* ---------------------------------------------------------------------- */
  /* Key-space guards                                                        */
  /* ---------------------------------------------------------------------- */

  /** The aggregate as an item, or `ValidationError` on a `generic:` key. */
  #requireItem(): Extract<ItemAggregate, { kind: "item" }> {
    const aggregate = this.requireAggregate();
    if (aggregate.kind !== "item") {
      throw new ValidationError(
        `${this.key} is a generic item; use the *Generic methods (see ItemActor's module doc)`,
      );
    }
    return aggregate;
  }

  #requireGeneric(): Extract<ItemAggregate, { kind: "generic" }> {
    const aggregate = this.requireAggregate();
    if (aggregate.kind !== "generic") {
      throw new ValidationError(
        `${this.key} is an item, not a generic item; use get/create/update`,
      );
    }
    return aggregate;
  }

  /** The key this actor was addressed by, whether or not a row exists yet. */
  #key() {
    const key = parseItemActorKey(this.key);
    if (key === null) {
      throw new ValidationError(
        `"${this.key}" is not an ItemActor id: expected <type>:<uuid> with ` +
          "type in wine|beer|spirit|coffee|sake|tea|generic",
      );
    }
    return key;
  }

  #itemRef(): ItemRef {
    const key = this.#key();
    if (key.kind !== "item") {
      throw new ValidationError(
        `${this.key} is a generic-item key; use createGeneric`,
      );
    }
    return key.ref;
  }

  /* ---------------------------------------------------------------------- */
  /* Policy                                                                  */
  /* ---------------------------------------------------------------------- */

  // Reads are catalog data. §2.1 says "the item is public"; §1.6 says the
  // stranger case for catalog data is "any signed-in user", which is the rule
  // B3 settled for `BrandActor` and this follows: `requireSignedIn`
  // (`../lib/guards.ts`). Anonymous is refused — see the report.

  /** §2.1: `update` is "creator only; enrichment updates use `system`". */
  #requireCreator(ctx: Ctx, createdById: string | null, what: string): void {
    if (isOwner(ctx, createdById)) return;
    throw new ForbiddenError(`only the creator of ${this.key} may ${what}`);
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                   */
  /* ---------------------------------------------------------------------- */

  async get(ctx: Ctx): Promise<ItemDto> {
    const aggregate = this.#requireItem();
    requireSignedIn(ctx, "view an item");
    return itemRowToDto(aggregate.ref.type, aggregate.row);
  }

  /**
   * Already filtered by `canSeeItemImage` — public, or the viewer's own. The
   * page is over the filtered list, so `totalCount` is what this viewer can
   * see rather than what exists.
   */
  async images(ctx: Ctx, page: PageArgs): Promise<Page<ItemImageDto>> {
    const aggregate = this.#requireItem();
    requireSignedIn(ctx, "view item images");
    const visible = aggregate.images
      .filter((row) => canSeeItemImage(ctx, row))
      .map((row) => imageRowToDto(aggregate.ref.type, row));
    return offsetPage(visible, page);
  }

  /**
   * UI parity G15: one image by id, from the images this actor already holds,
   * under the same `canSeeItemImage` rule as `images` — `null` for an image
   * the viewer may not see and for an id that is not this item's, which are
   * deliberately the same answer.
   */
  async image(ctx: Ctx, imageId: string): Promise<ItemImageDto | null> {
    const aggregate = this.#requireItem();
    requireSignedIn(ctx, "view item images");
    const wanted = String(imageId).toLowerCase();
    const row = aggregate.images.find((image) => image.id === wanted);
    return row === undefined || !canSeeItemImage(ctx, row)
      ? null
      : imageRowToDto(aggregate.ref.type, row);
  }

  /** Reviews are world-readable today (`filter: {}` in the Hasura metadata). */
  async reviews(ctx: Ctx, page: PageArgs): Promise<Page<ItemReviewDto>> {
    const aggregate = this.#requireItem();
    requireSignedIn(ctx, "view item reviews");
    return offsetPage(
      aggregate.reviews.map((row) => reviewRowToDto(aggregate.ref.type, row)),
      page,
    );
  }

  /**
   * §2.1: "computed from reviews in memory; replaces the `_aggregate` calls".
   * `average` is `null` with no reviews — not `0`, which reads as "everyone
   * hated it". Rounded to 2dp so a `float4` sum does not leak
   * `3.6666666666666665` into the API.
   */
  async score(ctx: Ctx): Promise<ItemScoreDto> {
    const aggregate = this.#requireItem();
    requireSignedIn(ctx, "view an item score");
    const count = aggregate.reviews.length;
    if (count === 0) return { average: null, count: 0 };
    const total = aggregate.reviews.reduce(
      (sum, row) => sum + Number(row.score),
      0,
    );
    return { average: Math.round((total / count) * 100) / 100, count };
  }

  /**
   * UI parity G7: the viewer's own newest review, from the rows this actor
   * already holds (it owns `item_reviews`, so they are cached legitimately).
   * `item_reviews` has no one-per-user constraint, so "newest" is the rule;
   * the cache is newest-first. Anonymous is refused by the same sign-in check
   * as every other read here, so this is no wider than `reviews`; a `system`
   * ctx passes that check but names nobody, and gets `null`.
   */
  async myReview(ctx: Ctx): Promise<ItemReviewDto | null> {
    const aggregate = this.#requireItem();
    requireSignedIn(ctx, "view your review");
    const viewerId = ctx.viewerId;
    if (viewerId === null) return null;
    const mine = aggregate.reviews.find((row) => row.userId === viewerId);
    return mine === undefined ? null : reviewRowToDto(aggregate.ref.type, mine);
  }

  async brands(ctx: Ctx, page: PageArgs): Promise<Page<ItemBrandDto>> {
    const aggregate = this.#requireItem();
    requireSignedIn(ctx, "view item brands");
    return offsetPage(
      aggregate.brands.map((row) => brandRowToDto(aggregate.ref.type, row)),
      page,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* The item row                                                            */
  /* ---------------------------------------------------------------------- */

  /**
   * Called by `ItemOnboardingActor.confirm` and `RecipePhotoJobActor` (§2.1).
   * The caller mints the id and addresses `ItemActor(type:id)` before any row
   * exists — the provisional-id pattern every entity `create` uses.
   *
   * **Idempotent on `this.key`** (§8.4): a re-delivered `confirm` addresses the
   * same actor id and gets the existing row back rather than a second item.
   */
  async create(ctx: Ctx, input: CreateItemInput): Promise<ItemDto> {
    const ref = this.#itemRef();
    requireSignedIn(ctx, "create an item");
    if (this.aggregate !== null) {
      const existing = this.#requireItem();
      return itemRowToDto(existing.ref.type, existing.row);
    }

    const createdById = bypassesPolicy(ctx)
      ? (input.createdById ?? ctx.viewerId)
      : ctx.viewerId;
    if (createdById === null || createdById === undefined) {
      throw new ValidationError(
        "create needs a creator: sign in, or pass `createdById` on a system call",
      );
    }

    const name = input.name.trim();
    if (name.length === 0) {
      throw new ValidationError("item name must not be blank");
    }

    requireItemAttributes(ref.type, {
      ...input,
      description: input.description,
    });
    const row = { id: ref.id, name, createdById };
    const values = <T extends ItemType>(type: T): ItemInsertOf<T> =>
      itemInsertValues(type, input, row);

    await this.tx(async (tx) => {
      // One arm per table, each naming it: the single-writer scan resolves a
      // write only when its table is a named import (`../lib/item-bindings.ts`).
      switch (ref.type) {
        case "WINE":
          await tx
            .insert(wines)
            .values(values("WINE"))
            .onConflictDoNothing({ target: wines.id });
          break;
        case "BEER":
          await tx
            .insert(beers)
            .values(values("BEER"))
            .onConflictDoNothing({ target: beers.id });
          break;
        case "SPIRIT":
          await tx
            .insert(spirits)
            .values(values("SPIRIT"))
            .onConflictDoNothing({ target: spirits.id });
          break;
        case "COFFEE":
          await tx
            .insert(coffees)
            .values(values("COFFEE"))
            .onConflictDoNothing({ target: coffees.id });
          break;
        case "SAKE":
          await tx
            .insert(sakes)
            .values(values("SAKE"))
            .onConflictDoNothing({ target: sakes.id });
          break;
        case "TEA":
          await tx
            .insert(teas)
            .values(values("TEA"))
            .onConflictDoNothing({ target: teas.id });
          break;
        default:
          // A type with no arm would insert nothing and still enqueue
          // `regenerateVector` below; make forgetting one a compile error.
          assertNever(ref.type, "item type");
      }
      // §1.4: the domain write and the follow-up commit together. A new item
      // has no vector, so this is unconditional — unlike `update`.
      await enqueueOutbox(
        tx,
        OUTBOX_TARGETS["ItemActor.regenerateVector"],
        {
          targetId: this.key,
          payload: { reason: "create", itemType: ref.type, itemId: ref.id },
        },
        { attributeTo: ctx },
      );
    });

    await this.reload();
    const created = this.#requireItem();
    return itemRowToDto(created.ref.type, created.row);
  }

  /** Creator only; enrichment updates arrive as `system` (§2.1). */
  async update(ctx: Ctx, input: UpdateItemInput): Promise<ItemDto> {
    const aggregate = this.#requireItem();
    this.#requireCreator(ctx, aggregate.row.createdById, "update it");

    const patch = this.#updateValues(aggregate.ref.type, input);
    if (Object.keys(patch).length === 0) {
      return itemRowToDto(aggregate.ref.type, aggregate.row);
    }

    const before = aggregate.row as Record<string, unknown>;
    const relevant = EMBEDDING_PROPERTIES[aggregate.ref.type];
    const embeddingChanged = Object.entries(patch).some(
      ([field, value]) =>
        relevant.includes(field) && String(value) !== String(before[field]),
    );

    await this.tx(async (tx) => {
      await this.#updateRow(tx, aggregate.ref, patch);
      if (embeddingChanged) {
        await enqueueOutbox(
          tx,
          OUTBOX_TARGETS["ItemActor.regenerateVector"],
          {
            targetId: this.key,
            payload: {
              reason: "update",
              itemType: aggregate.ref.type,
              itemId: aggregate.ref.id,
            },
          },
          { attributeTo: ctx },
        );
      }
    });

    await this.reload();
    const updated = this.#requireItem();
    return itemRowToDto(updated.ref.type, updated.row);
  }

  /**
   * The item half of `BarcodeActor.linkItem`, delivered by the outbox (§1.7).
   * `system`/`admin` only: a user links a barcode by calling `BarcodeActor`,
   * which owns `barcodes` and is the only thing that may decide a code is
   * legitimate. Idempotent — setting the code it already has writes nothing.
   */
  async setBarcode(ctx: Ctx, input: SetItemBarcodeInput): Promise<ItemDto> {
    const aggregate = this.#requireItem();
    requirePrivileged(
      ctx,
      `only a system or admin caller may set the barcode of ${this.key}`,
    );
    // Canonical, like every `barcode_code`: `BarcodeActor.linkItem` already
    // sends its canonical key, but an outbox row enqueued before
    // `20260928185314_canonical_barcode_codes` may still carry the old
    // spelling, whose `barcodes` row that migration merged away.
    const code = input.code === null ? null : canonicalBarcodeCode(input.code);

    if (aggregate.row.barcodeCode === code) {
      return itemRowToDto(aggregate.ref.type, aggregate.row);
    }

    try {
      await this.tx(async (tx) => {
        // Deliberately no outbox row: `barcode_code` is not in
        // EMBEDDING_FIELDS, so this is the one item write that never costs a
        // model call — the point of §2.1's "change detection on
        // embedding-relevant fields".
        await this.#updateRow(tx, aggregate.ref, { barcodeCode: code });
      });
    } catch (error) {
      const pg = pgErrorOf(error);
      if (pg?.code === "23503") {
        // `<table>_barcode_code_barcodes_code_fkey`. `BarcodeActor.ensure`
        // runs before `linkItem` enqueues this, so seeing it means the two
        // have drifted — a `ConflictError` is retried by the outbox, which is
        // the right behaviour if the barcode row is merely late.
        throw new ConflictError(
          `barcode ${String(code)} has no row yet; BarcodeActor.ensure must run first`,
        );
      }
      throw error;
    }

    await this.reload();
    const updated = this.#requireItem();
    return itemRowToDto(updated.ref.type, updated.row);
  }

  /* ---------------------------------------------------------------------- */
  /* Images                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Any signed-in viewer may add an image (today's `item_image` insert
   * permission is `check: {}` with `user_id` set from the session, and this
   * preserves it). The file must exist **and be verified** first — that is
   * `FileActor.verify`'s whole job, and calling it here is §8.5's sanctioned
   * entity → `FileActor` edge.
   */
  async attachImage(
    ctx: Ctx,
    input: AttachItemImageInput,
  ): Promise<ItemImageDto> {
    const aggregate = this.#requireItem();
    requireSignedIn(ctx, "attach an item image");

    const userId = ctx.viewerId;
    if (userId === null) {
      throw new ValidationError(
        "attachImage needs a viewer to attribute the upload to",
      );
    }
    const fileId = requireUuid(input.fileId, "fileId");
    const imageId = requireUuid(input.imageId ?? randomUUID(), "imageId");

    const existing = aggregate.images.find((row) => row.id === imageId);
    if (existing !== undefined) {
      return imageRowToDto(aggregate.ref.type, existing);
    }

    await requireVerifiedFile(this.#verifyFile, ctx, fileId, "an item image");

    await this.tx(async (tx) => {
      await tx
        .insert(itemImage)
        .values({
          id: imageId,
          userId,
          fileId,
          isPublic: input.isPublic ?? true,
          placeholder: input.placeholder ?? null,
          ...IMAGES.values(aggregate.ref),
        })
        .onConflictDoNothing({ target: itemImage.id });
      await this.#enqueueImageRegenerate(tx, ctx, aggregate.ref);
    });

    await this.reload();
    const reloaded = this.#requireItem();
    const row = reloaded.images.find((image) => image.id === imageId);
    if (row === undefined) {
      throw new ConflictError(`item image ${imageId} was not written`);
    }
    return imageRowToDto(reloaded.ref.type, row);
  }

  /** Uploader only (today's `item_image` delete filter), or admin/system. */
  async detachImage(ctx: Ctx, imageId: string): Promise<DetachedItemImage> {
    imageId = requireUuid(imageId, "imageId");
    const aggregate = this.#requireItem();
    const row = aggregate.images.find((image) => image.id === imageId);
    if (row === undefined) {
      throw new NotFoundError(`item image ${imageId} is not on ${this.key}`);
    }
    if (!isOwner(ctx, row.userId)) {
      throw new ForbiddenError(`item image ${imageId} is not yours`);
    }

    await this.tx(async (tx) => {
      await tx.delete(itemImage).where(eq(itemImage.id, imageId));
      await this.#enqueueImageRegenerate(tx, ctx, aggregate.ref);
    });
    await this.reload();
    return { id: imageId };
  }

  /**
   * When the configured embedding takes images, an item's newest image is one
   * of its vector's inputs (`#embeddingImageIds`), so attaching or detaching
   * one must re-embed — in the same transaction, like `update`'s enqueue. A
   * change that leaves the image set as it was costs `regenerateVector` a
   * `SELECT`: its identity check finds `embedding_images` unchanged and skips.
   * With a text-only model (or none) images are not inputs, and nothing is
   * enqueued.
   */
  async #enqueueImageRegenerate(
    tx: DbOrTx,
    ctx: Ctx,
    ref: ItemRef,
  ): Promise<void> {
    if (embeddingModel()?.acceptsImages !== true) return;
    await enqueueOutbox(
      tx,
      OUTBOX_TARGETS["ItemActor.regenerateVector"],
      {
        targetId: this.key,
        payload: { reason: "image", itemType: ref.type, itemId: ref.id },
      },
      { attributeTo: ctx },
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Reviews                                                                 */
  /* ---------------------------------------------------------------------- */

  /** Any signed-in viewer, one row per call. Idempotent on `reviewId` (§8.4). */
  async addReview(ctx: Ctx, input: AddItemReviewInput): Promise<ItemReviewDto> {
    const aggregate = this.#requireItem();
    requireSignedIn(ctx, "review an item");
    const userId = ctx.viewerId;
    if (userId === null) {
      throw new ValidationError("addReview needs a viewer to attribute it to");
    }

    const reviewId = requireUuid(input.reviewId ?? randomUUID(), "reviewId");
    const existing = aggregate.reviews.find((row) => row.id === reviewId);
    if (existing !== undefined) {
      return reviewRowToDto(aggregate.ref.type, existing);
    }

    const score = requireScore(input.score);
    await this.tx(async (tx) => {
      await tx
        .insert(itemReviews)
        .values({
          id: reviewId,
          userId,
          score,
          text: parseReviewText(input.text),
          ...REVIEWS.values(aggregate.ref),
        })
        .onConflictDoNothing({ target: itemReviews.id });
    });

    await this.reload();
    const reloaded = this.#requireItem();
    const row = reloaded.reviews.find((review) => review.id === reviewId);
    if (row === undefined) {
      throw new ConflictError(`item review ${reviewId} was not written`);
    }
    return reviewRowToDto(reloaded.ref.type, row);
  }

  /** Author only (today's `item_reviews` update filter), or admin/system. */
  async updateReview(
    ctx: Ctx,
    reviewId: string,
    input: UpdateItemReviewInput,
  ): Promise<ItemReviewDto> {
    reviewId = requireUuid(reviewId, "reviewId");
    const aggregate = this.#requireItem();
    const row = aggregate.reviews.find((review) => review.id === reviewId);
    if (row === undefined) {
      throw new NotFoundError(`review ${reviewId} is not on ${this.key}`);
    }
    if (!isOwner(ctx, row.userId)) {
      throw new ForbiddenError(`review ${reviewId} is not yours`);
    }

    const patch: { score?: number; text?: unknown; updatedAt?: Date } = {};
    if (input.score !== undefined) patch.score = requireScore(input.score);
    if (input.text !== undefined) patch.text = parseReviewText(input.text);
    if (Object.keys(patch).length === 0) {
      return reviewRowToDto(aggregate.ref.type, row);
    }
    patch.updatedAt = new Date();

    await this.tx(async (tx) => {
      await tx
        .update(itemReviews)
        .set(patch)
        .where(eq(itemReviews.id, reviewId));
    });
    await this.reload();
    const reloaded = this.#requireItem();
    const updated = reloaded.reviews.find((review) => review.id === reviewId);
    if (updated === undefined) {
      throw new ConflictError(`review ${reviewId} vanished mid-update`);
    }
    return reviewRowToDto(reloaded.ref.type, updated);
  }

  async deleteReview(ctx: Ctx, reviewId: string): Promise<DeletedItemReview> {
    reviewId = requireUuid(reviewId, "reviewId");
    const aggregate = this.#requireItem();
    const row = aggregate.reviews.find((review) => review.id === reviewId);
    if (row === undefined) {
      throw new NotFoundError(`review ${reviewId} is not on ${this.key}`);
    }
    if (!isOwner(ctx, row.userId)) {
      throw new ForbiddenError(`review ${reviewId} is not yours`);
    }

    await this.tx(async (tx) => {
      await tx.delete(itemReviews).where(eq(itemReviews.id, reviewId));
    });
    await this.reload();
    return { id: reviewId };
  }

  /* ---------------------------------------------------------------------- */
  /* Brands                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Item creator only — today's `item_brands` insert check is exactly
   * "`<type>.created_by_id = session user`". `BrandRegistryActor` is what mints
   * the `brandId`; this only records the link.
   *
   * Idempotent on `(item, brandId)`, which is also how a re-delivered
   * `ItemOnboardingActor.confirm` produces one link rather than two.
   */
  async linkBrand(ctx: Ctx, input: LinkItemBrandInput): Promise<ItemBrandDto> {
    const aggregate = this.#requireItem();
    this.#requireCreator(ctx, aggregate.row.createdById, "link a brand to it");
    const brandId = requireUuid(input.brandId, "brandId");
    const isPrimary = input.isPrimary ?? false;

    const existing = aggregate.brands.find((row) => row.brandId === brandId);
    if (existing !== undefined) {
      if ((existing.isPrimary ?? false) === isPrimary) {
        return brandRowToDto(aggregate.ref.type, existing);
      }
      await this.tx(async (tx) => {
        await tx
          .update(itemBrands)
          .set({ isPrimary })
          .where(eq(itemBrands.id, existing.id));
      });
      await this.reload();
      const reloaded = this.#requireItem();
      const row = reloaded.brands.find((brand) => brand.brandId === brandId);
      if (row === undefined) {
        throw new ConflictError(`item brand ${brandId} vanished mid-update`);
      }
      return brandRowToDto(reloaded.ref.type, row);
    }

    const linkId = randomUUID();
    await this.tx(async (tx) => {
      await tx.insert(itemBrands).values({
        id: linkId,
        brandId,
        isPrimary,
        ...BRANDS.values(aggregate.ref),
      });
    });
    await this.reload();
    const reloaded = this.#requireItem();
    const row = reloaded.brands.find((brand) => brand.brandId === brandId);
    if (row === undefined) {
      throw new ConflictError(`item brand ${brandId} was not written`);
    }
    return brandRowToDto(reloaded.ref.type, row);
  }

  async unlinkBrand(ctx: Ctx, brandId: string): Promise<UnlinkedItemBrand> {
    brandId = requireUuid(brandId, "brandId");
    const aggregate = this.#requireItem();
    this.#requireCreator(
      ctx,
      aggregate.row.createdById,
      "unlink a brand from it",
    );
    const row = aggregate.brands.find((brand) => brand.brandId === brandId);
    if (row === undefined) {
      throw new NotFoundError(`brand ${brandId} is not linked to ${this.key}`);
    }

    await this.tx(async (tx) => {
      await tx.delete(itemBrands).where(eq(itemBrands.id, row.id));
    });
    await this.reload();
    return { brandId };
  }

  /* ---------------------------------------------------------------------- */
  /* Vectors                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * `system`, via the outbox (§2.1). The embedding is the one model-shaped
   * dependency in this actor and it is deliberately *not* reachable from a
   * request: the outbox delivers it, so a 30-second model call can only ever
   * block this item's own background turn.
   *
   * **Idempotent without an idempotency key** (§8.4's "naturally idempotent"
   * branch): the row is keyed on the item's own polymorphic column, and a
   * delivery whose vector is already newer than the item row skips *before*
   * calling the model — so a redelivery costs a `SELECT`, not an embedding.
   */
  async regenerateVector(ctx: Ctx): Promise<RegenerateVectorResult> {
    const aggregate = this.#requireItem();
    requirePrivileged(
      ctx,
      `only a system or admin caller may regenerate the vector of ${this.key}`,
    );

    const { ref, row, vector } = aggregate;
    // Which embedding this process makes, and so what a fresh row must have
    // been made by: the configured model, over the images it would send now.
    // `null` with no provider installed, which leaves the timestamp to decide.
    const model = embeddingModel();
    const imageFileIds =
      model?.acceptsImages === true
        ? await this.#embeddingImageIds(aggregate)
        : [];
    const images = imageSetKey(imageFileIds);
    const outcome = await regenerateIfStale(
      vector,
      [row.updatedAt],
      {
        embed: () =>
          this.#embed(ctx, { text: embeddingTextFor(ref, row), imageFileIds }),
        // One upsert on the item's own unique column, whether or not a row
        // was seen (`item_vectors_one_per_item`). Two activations of one item
        // that both found no vector — a placement split-brain — used to race
        // to a plain insert, and the second failed on the unique index; now it
        // overwrites. `updated_at` is the database's clock on both paths, the
        // clock every input timestamp it is compared against was written with.
        // `embedding_model` is what `EmbeddingActor` says made the vector.
        write: (embedded) =>
          this.tx(async (tx) => {
            const identity = {
              vector: halfvec(embedded.vector),
              updatedAt: sql`now()`,
              embeddingModel: embedded.model,
              embeddingImages: images,
            };
            await tx
              .insert(itemVectors)
              .values({ ...VECTORS.values(ref), ...identity })
              .onConflictDoUpdate({
                target: VECTORS.columns[ref.type],
                set: identity,
              });
          }),
      },
      model === null ? null : { model: model.key, images },
    );
    if (outcome === "fresh") {
      return {
        itemId: ref.id,
        itemType: ref.type,
        skipped: true,
        reason: "vector is newer than the item row",
      };
    }

    await this.reload();
    return {
      itemId: ref.id,
      itemType: ref.type,
      skipped: false,
      reason:
        outcome === "first vector"
          ? "first vector"
          : outcome === "embedding changed"
            ? "embedding changed"
            : "item changed",
    };
  }

  /**
   * The files legacy production embedded with an item's text
   * (`generateItemVector`, `82450ad1`): the front and back label its
   * onboarding photographed, then its most recent image — in that order, each
   * once. At most three, inside `gemini-embedding-2`'s six.
   *
   * `item_onboardings` is `ItemOnboardingActor`'s table; this only reads it
   * (§1.2 is about writers). A missing or unlabelled onboarding contributes
   * nothing, as it did in legacy.
   */
  async #embeddingImageIds(
    aggregate: Extract<ItemAggregate, { kind: "item" }>,
  ): Promise<string[]> {
    const ids: string[] = [];
    const onboardingId = aggregate.row.itemOnboardingId;
    if (onboardingId !== null) {
      const [labels] = await this.db
        .select({
          front: itemOnboardings.frontLabelImageId,
          back: itemOnboardings.backLabelImageId,
        })
        .from(itemOnboardings)
        .where(eq(itemOnboardings.id, onboardingId));
      if (labels?.front) ids.push(labels.front);
      if (labels?.back) ids.push(labels.back);
    }
    // `images` is newest first (`loadAggregate`).
    const display = aggregate.images[0]?.fileId;
    if (display !== undefined) ids.push(display);
    return [...new Set(ids)];
  }

  /* ---------------------------------------------------------------------- */
  /* The seventh key namespace: `generic_items`                              */
  /* ---------------------------------------------------------------------- */

  async getGeneric(ctx: Ctx): Promise<GenericItemDto> {
    const aggregate = this.#requireGeneric();
    requireSignedIn(ctx, "view a generic item");
    return genericRowToDto(aggregate.row);
  }

  /** Idempotent on `this.key`, like `create`. */
  async createGeneric(
    ctx: Ctx,
    input: CreateGenericItemInput,
  ): Promise<GenericItemDto> {
    const key = this.#key();
    if (key.kind !== "generic") {
      throw new ValidationError(
        `${this.key} is an item key; use create, not createGeneric`,
      );
    }
    requireSignedIn(ctx, "create a generic item");
    if (this.aggregate !== null) {
      return genericRowToDto(this.#requireGeneric().row);
    }

    const name = input.name.trim();
    if (name.length === 0) {
      throw new ValidationError("generic item name must not be blank");
    }
    const category = input.category.trim();
    if (category.length === 0) {
      throw new ValidationError("generic item category must not be blank");
    }
    requireGenericKind(input.kind);

    try {
      await this.tx(async (tx) => {
        await tx
          .insert(genericItems)
          .values({
            id: key.id,
            name,
            category,
            subcategory: input.subcategory ?? null,
            itemType: input.kind,
            description: input.description ?? null,
            isSubstitutable: input.isSubstitutable ?? true,
            // `generic_items.created_by_id` is nullable and `ON DELETE SET
            // NULL`, unlike the six item tables' NOT NULL creator.
            createdById: ctx.viewerId,
          })
          .onConflictDoNothing({ target: genericItems.id });
      });
    } catch (error) {
      throw translateGenericUniqueViolation(error, name, category);
    }

    await this.reload();
    return genericRowToDto(this.#requireGeneric().row);
  }

  /** Creator only (or admin/system); `created_by_id` may legitimately be null. */
  async updateGeneric(
    ctx: Ctx,
    input: UpdateGenericItemInput,
  ): Promise<GenericItemDto> {
    const aggregate = this.#requireGeneric();
    if (!bypassesPolicy(ctx)) {
      if (aggregate.row.createdById === null) {
        throw new ForbiddenError(
          `generic item ${this.key} has no creator; only an admin may edit it`,
        );
      }
      this.#requireCreator(ctx, aggregate.row.createdById, "update it");
    }

    const patch: Partial<typeof genericItems.$inferInsert> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length === 0) {
        throw new ValidationError("generic item name must not be blank");
      }
      patch.name = name;
    }
    if (input.category !== undefined) {
      const category = input.category.trim();
      if (category.length === 0) {
        throw new ValidationError("generic item category must not be blank");
      }
      patch.category = category;
    }
    if (input.subcategory !== undefined) patch.subcategory = input.subcategory;
    if (input.kind !== undefined) {
      patch.itemType = requireGenericKind(input.kind);
    }
    if (input.description !== undefined) patch.description = input.description;
    if (input.isSubstitutable !== undefined) {
      patch.isSubstitutable = input.isSubstitutable ?? true;
    }
    if (Object.keys(patch).length === 0) return genericRowToDto(aggregate.row);

    try {
      await this.tx(async (tx) => {
        await tx
          .update(genericItems)
          .set(patch)
          .where(eq(genericItems.id, aggregate.row.id));
      });
    } catch (error) {
      throw translateGenericUniqueViolation(
        error,
        patch.name ?? aggregate.row.name,
        patch.category ?? aggregate.row.category,
      );
    }

    await this.reload();
    return genericRowToDto(this.#requireGeneric().row);
  }

  /* ---------------------------------------------------------------------- */
  /* The update patch and the write it becomes                               */
  /* ---------------------------------------------------------------------- */

  /**
   * The per-table NOT NULL columns are enforced by `requireItemAttributes`
   * (contracts) before the insert rather than by a Postgres error, because
   * "null value in column \"style\" violates not-null constraint" is not
   * something a client can act on. **The check lives in `contracts`**, not
   * here, because this actor is not the only place it has to run: A7c found
   * that `ItemOnboardingActor.confirm` reaches `create` *through the outbox*,
   * so a rejection raised here reaches a dead-letter table rather than the
   * caller. Anything that enqueues an `ItemActor.create` calls the same
   * function before writing the outbox row; `create`'s call is the backstop.
   */
  #updateValues(
    type: ItemType,
    input: UpdateItemInput,
  ): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length === 0) {
        throw new ValidationError("item name must not be blank");
      }
      patch.name = name;
    }
    if (input.description !== undefined) patch.description = input.description;
    if (input.country !== undefined) patch.country = input.country;

    const bag = input[ITEM_TYPE_SPECS[type].bag as keyof UpdateItemInput];
    Object.assign(
      patch,
      attributeColumns(
        type,
        bag as Readonly<Record<string, unknown>> | null | undefined,
      ),
    );
    return patch;
  }

  /**
   * `updated_at` is not written here: every item table's `BEFORE UPDATE`
   * trigger stamps it with the database's `now()` — one function,
   * `set_current_timestamp_updated_at`, on all six since
   * `20260928181546_one_updated_at_trigger_function`
   * (`../lib/updated-at-triggers.test.ts` proves each fires). That is the clock
   * `regenerateVector`'s freshness test compares against, and the trigger
   * overwrote any value written here anyway.
   *
   * `patch` is keyed by row property by construction (`attributeColumns`), so
   * each arm's cast only restores the table type the switch already narrowed.
   */
  async #updateRow(
    tx: DbOrTx,
    ref: ItemRef,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const set = <T extends ItemType>(_type: T) =>
      patch as Partial<ItemInsertOf<T>>;
    switch (ref.type) {
      case "WINE":
        await tx.update(wines).set(set("WINE")).where(eq(wines.id, ref.id));
        return;
      case "BEER":
        await tx.update(beers).set(set("BEER")).where(eq(beers.id, ref.id));
        return;
      case "SPIRIT":
        await tx
          .update(spirits)
          .set(set("SPIRIT"))
          .where(eq(spirits.id, ref.id));
        return;
      case "COFFEE":
        await tx
          .update(coffees)
          .set(set("COFFEE"))
          .where(eq(coffees.id, ref.id));
        return;
      case "SAKE":
        await tx.update(sakes).set(set("SAKE")).where(eq(sakes.id, ref.id));
        return;
      case "TEA":
        await tx.update(teas).set(set("TEA")).where(eq(teas.id, ref.id));
        return;
      default:
        assertNever(ref.type, "item type");
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                                */
/* -------------------------------------------------------------------------- */

const requireGenericKind = (kind: string): GenericItemKind => {
  if (!isGenericItemKind(kind)) {
    throw new ValidationError(
      `"${kind}" is not a generic item kind (generic_items_item_type_check)`,
    );
  }
  return kind;
};

/**
 * `item_reviews.text` is a `json` column whose shape the client owns (rich-text
 * nodes today). Accept either JSON or a plain string; store `null` for absent.
 */
const parseReviewText = (text: string | null | undefined): unknown => {
  if (text === undefined || text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

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

/** `idx_generic_items_name_category` is a UNIQUE CONSTRAINT, not an index. */
const translateGenericUniqueViolation = (
  error: unknown,
  name: string,
  category: string,
): unknown => {
  const pg = pgErrorOf(error);
  if (
    pg?.code === "23505" &&
    pg?.constraint === "idx_generic_items_name_category"
  ) {
    return new ConflictError(
      `a generic item named "${name}" already exists in category "${category}"`,
    );
  }
  return error;
};
