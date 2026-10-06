/**
 * `BrandsCollectionActor(hash(filter))` — C3 (migration plan §2.2).
 *
 * > | `BrandsCollectionActor()` | `/brands` index, paged | **projection** |
 *
 * **A projection**, and this is the case §1.5 names outright: *"projections for
 * high-cardinality catalog lists (map, item search, **brand index**)"*. A
 * `BrandDto` is the whole `brands` row and the index renders all of it, so
 * hydrating a page of ids would be twenty cold `BrandActor` activations per
 * screen for data this query already has in hand.
 *
 * That is the exact opposite of the answer `Item.brands` takes, where a page of
 * `item_brands` links returns `brandId` and lets B3's `Brand` DataLoader batch
 * them — because there the brand is a *satellite* of something else the client
 * is already loading, and the ids are few and repeat across rows. Same type,
 * two surfaces, two answers: that is why §1.5 says "declared per method".
 *
 * ## Keyed by its filter, not by nothing
 *
 * §2.2 writes it `BrandsCollectionActor()`. §1.5 warns that a singleton
 * read actor is a serialization point and says to key read-only actors by
 * something with cardinality. `/brands` has no reason to serialize, so the id
 * is `brandsCollectionActorId(filter)`; `ScopedCollectionActorBase` re-derives
 * that hash on every turn so an activation cannot be handed a scope other than
 * the one it is addressed as.
 *
 * Free text belongs to `BrandSearchActor` (§2.3) for the same reason it does in
 * `RecipeGroupsCollectionActor`: two differently-ranked text searches over one
 * catalog eventually disagree. This is the alphabetical index.
 *
 * Catalog visibility (§1.6): any signed-in viewer, which is B3's rule for the
 * brand catalog and the default `CollectionActorBase.authorize` applies.
 */
import type {
  ActorCategory,
  BrandDto,
  BrandsCollectionActorInterface,
  BrandsFilter,
  BrandType,
  Ctx,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  BRAND_TYPES,
  BrandsCollectionActorDescriptor,
  brandsCollectionActorId,
  mapPage,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import type { KeysetCursor, PageScope } from "../lib/collection-actor-base.ts";
import { ScopedCollectionActorBase } from "../lib/collection-actor-base.ts";
import {
  keysetOrder,
  keysetWhere,
  requireUuidValue,
  toIso,
} from "../lib/collection-sql.ts";

type BrandRow = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly logo_url: string | null;
  readonly brand_type: string | null;
  readonly parent_brand_id: string | null;
  readonly created_at: Date | string | null;
  readonly updated_at: Date | string | null;
};

/**
 * `brands.created_at`/`updated_at` are nullable in the live schema but
 * `BrandDto` types them non-null, which is what `BrandActor` already assumes.
 * The epoch floor keeps that contract without widening the DTO for a row that
 * predates the column's default.
 */
const iso = (value: Date | string | null): string =>
  toIso(value) ?? new Date(0).toISOString();

const isBrandType = (value: string): value is BrandType =>
  (BRAND_TYPES as readonly string[]).includes(value);

const SORT = sql`b.name`;
const ID = sql`b.id`;

export class BrandsCollectionActor
  extends ScopedCollectionActorBase<BrandsFilter>
  implements BrandsCollectionActorInterface
{
  static readonly category: ActorCategory =
    BrandsCollectionActorDescriptor.category;

  protected keyFor(filter: BrandsFilter): string {
    return brandsCollectionActorId(filter);
  }

  async list(
    ctx: Ctx,
    filter: BrandsFilter,
    page: PageArgs,
  ): Promise<Page<BrandDto>> {
    return mapPage(
      await this.paged<BrandRow>(
        ctx,
        filter,
        page,
        (after, limit) => this.#read(filter, after, limit),
        (row) => ({ sort: row.name, id: row.id }),
        () => this.#scope(filter),
      ),
      (row): BrandDto => ({
        id: row.id,
        name: row.name,
        description: row.description,
        logoUrl: row.logo_url,
        brandType:
          row.brand_type !== null && isBrandType(row.brand_type)
            ? row.brand_type
            : null,
        parentBrandId: row.parent_brand_id,
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
      }),
    );
  }

  /**
   * Shared by the page and its `count(*)` — see `PageScope`.
   *
   * `parentBrandId` is A7g: `Brand.childBrands` and `brands(parentBrandId:)`
   * are the same query, and `idx_brands_parent` already indexes it. It is
   * validated rather than cast blind, because an actor id built from a bad
   * uuid would still hash and only fail in the database.
   */
  #scope(filter: BrandsFilter): PageScope {
    const brandType =
      filter.brandType == null
        ? sql`true`
        : sql`b.brand_type = ${filter.brandType}::brand_types`;
    const parent =
      filter.parentBrandId == null
        ? sql`true`
        : sql`b.parent_brand_id = ${requireUuidValue(
            filter.parentBrandId,
            "parentBrandId",
          )}::uuid`;
    return {
      from: sql`public.brands b`,
      where: sql`${brandType} and ${parent}`,
    };
  }

  async #read(
    filter: BrandsFilter,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly BrandRow[]> {
    const { from, where } = this.#scope(filter);
    const { rows } = await this.db.execute<BrandRow>(sql`
      select b.id, b.name, b.description, b.logo_url,
             b.brand_type::text as brand_type, b.parent_brand_id,
             b.created_at, b.updated_at
      from ${from}
      where ${where}
        and ${keysetWhere(after, SORT, ID, "text", "asc")}
      order by ${keysetOrder(SORT, ID, "asc")}
      limit ${limit}
    `);
    return rows;
  }
}
