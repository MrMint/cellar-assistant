/**
 * `BrandLinksCollectionActor(hash(brandId))` — A7g.
 *
 * `Brand`'s two reverse edges. D4 recorded the gap plainly: *"`Brand` has no
 * reverse edges at all — no `items`, no `places`, no `parentBrand`, no
 * `childBrands`. The Hasura `/brands/[id]` page rendered all four."* The two
 * self-referential ones are `brands.parent_brand_id` and need no actor;
 * these two cross into other actors' tables and are why this file exists.
 *
 * ## Reading another actor's tables is the point, not a violation
 *
 * `TABLE_WRITERS` assigns `item_brands` to `ItemActor` and `place_brands` to
 * `PlaceActor`, so neither edge could be a `BrandActor` method: §1.3 lets an
 * entity actor cache only what it writes, and `packages/db`'s single-writer
 * test resolves ownership from the file path. §1.1 grants *this* category
 * exactly what is needed — "writes nothing | reads any table, directly via
 * Drizzle" — and `CollectionActorBase` holds no cache at all, so there is
 * nothing here to go stale against a writer it does not control.
 *
 * The alternative would have been `BrandActor` calling `ItemActor`, which is a
 * new synchronous entity→entity edge. §8.5 defines that set as closed, so
 * adding one is a plan-level decision — and it would have been the wrong one
 * anyway: the fan-out is over however many items carry the brand, which is the
 * N+1 §1.5 exists to forbid.
 *
 * ## `items` returns refs; `places` returns the link rows
 *
 * §1.5: "ids for owned lists whose entity actors are cheap and likely warm …
 * projections for high-cardinality catalog lists". An item's card needs the
 * whole item, and `Item` is already a batched `loadableInterface` in
 * `services/api`, so `items` hands back `ItemRef`s and one fan-out draws the
 * page.
 *
 * `places` is not symmetric, and deliberately: the interesting part of a
 * `place_brands` row is the **relationship** (`owned_by` / `affiliated_with` /
 * `serves`), which is on the link and not on the place. So it returns the
 * projection and `services/api` resolves the `Place` behind each `place_id`
 * through the memo `place.ts` already has.
 *
 * ## Ordering
 *
 * `item_brands` has no name to sort by without joining seven tables, so the
 * order is `is_primary desc, created_at, id` — the flagship first, which is
 * what `is_primary` is for, and stable after that. `place_brands` orders by
 * `relationship_type, created_at, id` so an owner sorts above a stockist.
 *
 * Both are keyset-paged through `paged()`, so both carry a real `totalCount`
 * (A7d item 1) — a brand page can say "42 items" without walking them.
 */
import type {
  ActorCategory,
  BrandItemCountsFilter,
  BrandLinksCollectionActorInterface,
  BrandLinksFilter,
  Ctx,
  ItemBrandDto,
  ItemRef,
  ItemType,
  Page,
  PageArgs,
  PlaceBrandDto,
  PlaceBrandRelationship,
} from "@cellar-assistant/contracts";
import {
  BrandLinksCollectionActorDescriptor,
  brandItemCountsActorId,
  brandLinksCollectionActorId,
  isItemType,
  isPlaceBrandRelationship,
  mapPage,
  requireReverseEdgeBatch,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import type { KeysetCursor, PageScope } from "../lib/collection-actor-base.ts";
import { ScopedCollectionActorBase } from "../lib/collection-actor-base.ts";
import {
  keysetOrder,
  keysetWhere,
  requireUuidValue,
  toIso,
  uuidArray,
} from "../lib/collection-sql.ts";
import { ARCS } from "../lib/item-arcs.ts";

type ItemLinkRow = {
  readonly id: string;
  readonly item_id: string | null;
  readonly item_type: string;
  readonly sort_key: string;
};

type ItemBrandRow = ItemLinkRow & {
  readonly brand_id: string;
  readonly is_primary: boolean | null;
  readonly created_at: Date | string | null;
};

/** An `item_brands` row's typed ref, or a loud refusal for a torn row. */
const linkRefOf = (row: ItemLinkRow): ItemRef => {
  if (!isItemType(row.item_type)) {
    throw new ValidationError(
      `item_brands ${row.id} names no item type; ` +
        "exactly_one_item_reference should have made that impossible",
    );
  }
  const type: ItemType = row.item_type;
  if (row.item_id === null) {
    throw new ValidationError(`item_brands ${row.id} names no item`);
  }
  return { type, id: row.item_id };
};

type PlaceLinkRow = {
  readonly id: string;
  readonly place_id: string;
  readonly brand_id: string;
  readonly relationship_type: string;
  readonly created_at: Date | string | null;
  readonly sort_key: string;
};

/**
 * `item_brands` has the six polymorphic columns and — unlike `item_favorites`
 * — **no** generated `type` column, so the discriminator is derived here. The
 * table's `exactly_one_item_reference` check (`num_nonnulls(...) = 1`)
 * guarantees exactly one branch matches, so the `else` is unreachable rather
 * than a default. The expression is the arc's own (`../lib/item-arcs.ts`).
 */
const ITEM_TYPE_EXPR = ARCS.itemBrands.typeExpr("ib");

/**
 * `is_primary` is nullable (`default false`), so it is coalesced before being
 * ordered on — a null would sort with the wrong group under `desc`.
 *
 * The cursor's `sort` half has to be a single text value, so the two ordering
 * columns are concatenated into one: `'1'`/`'0'` for primary, then the
 * timestamp. Lexicographic order over that string is the order the `ORDER BY`
 * produces, which is the contract `keysetWhere` needs.
 */
const ITEM_SORT = sql`(
  case when coalesce(ib.is_primary, false) then '0' else '1' end
  || coalesce(ib.created_at, 'epoch'::timestamptz)::text
)`;
const ITEM_ID = sql`ib.id`;

const PLACE_SORT = sql`(
  pb.relationship_type
  || coalesce(pb.created_at, 'epoch'::timestamptz)::text
)`;
const PLACE_ID = sql`pb.id`;

export class BrandLinksCollectionActor
  extends ScopedCollectionActorBase<BrandLinksFilter>
  implements BrandLinksCollectionActorInterface
{
  static readonly category: ActorCategory =
    BrandLinksCollectionActorDescriptor.category;

  protected keyFor(filter: BrandLinksFilter): string {
    return brandLinksCollectionActorId(filter);
  }

  /**
   * The brand id is spliced into SQL as a `uuid` parameter, but it also
   * reaches `keyFor` as text, so it is validated on every turn — before
   * anything is read (§1.5), in the place the key check already runs.
   */
  protected override async authorize(
    ctx: Ctx,
    filter: BrandLinksFilter,
  ): Promise<"allow" | "empty"> {
    await super.authorize(ctx, filter);
    requireUuidValue(filter.brandId, "brandId");
    return "allow";
  }

  async items(
    ctx: Ctx,
    filter: BrandLinksFilter,
    page: PageArgs,
  ): Promise<Page<ItemRef>> {
    return mapPage(
      await this.paged<ItemLinkRow>(
        ctx,
        filter,
        page,
        (after, limit) => this.#readItems(filter, after, limit),
        (row) => ({ sort: row.sort_key, id: row.id }),
        () => this.#itemsScope(filter),
      ),
      linkRefOf,
    );
  }

  /**
   * UI parity G24 — `items`' rows, scope and order, carrying the link. The
   * brand page's "Primary" chip is `item_brands.is_primary`, which an
   * `ItemRef` cannot carry.
   */
  async itemLinks(
    ctx: Ctx,
    filter: BrandLinksFilter,
    page: PageArgs,
  ): Promise<Page<ItemBrandDto>> {
    return mapPage(
      await this.paged<ItemBrandRow>(
        ctx,
        filter,
        page,
        (after, limit) => this.#readItemLinks(filter, after, limit),
        (row) => ({ sort: row.sort_key, id: row.id }),
        () => this.#itemsScope(filter),
      ),
      (row): ItemBrandDto => {
        const ref = linkRefOf(row);
        return {
          id: row.id,
          itemId: ref.id,
          itemType: ref.type,
          brandId: row.brand_id,
          isPrimary: row.is_primary ?? false,
          createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
        };
      },
    );
  }

  /**
   * UI parity G23 — the old card's `item_brands_aggregate.count`, for a page
   * of brands in one `group by`. Addressed at `brandItemCountsActorId`, which
   * `keyedBatch` re-derives from the input.
   */
  async itemCounts(
    ctx: Ctx,
    filter: BrandItemCountsFilter,
  ): Promise<readonly number[]> {
    requireReverseEdgeBatch(filter.brandIds, "itemCounts brandIds");
    return await this.keyedBatch(
      ctx,
      brandItemCountsActorId(filter),
      async () => {
        if (filter.brandIds.length === 0) return [];
        const { rows } = await this.db.execute<{
          readonly brand_id: string;
          readonly n: number;
        }>(sql`
          select ib.brand_id, count(*)::int as n
          from public.item_brands ib
          where ib.brand_id = any(${uuidArray(filter.brandIds, "brandId")})
          group by ib.brand_id
        `);
        const counts = new Map(rows.map((row) => [row.brand_id, row.n]));
        return filter.brandIds.map((id) => counts.get(id) ?? 0);
      },
    );
  }

  async places(
    ctx: Ctx,
    filter: BrandLinksFilter,
    page: PageArgs,
  ): Promise<Page<PlaceBrandDto>> {
    return mapPage(
      await this.paged<PlaceLinkRow>(
        ctx,
        filter,
        page,
        (after, limit) => this.#readPlaces(filter, after, limit),
        (row) => ({ sort: row.sort_key, id: row.id }),
        () => this.#placesScope(filter),
      ),
      (row): PlaceBrandDto => {
        if (!isPlaceBrandRelationship(row.relationship_type)) {
          throw new ValidationError(
            `place_brands.relationship_type ${JSON.stringify(
              row.relationship_type,
            )} is not a PlaceBrandRelationship`,
          );
        }
        const relationshipType: PlaceBrandRelationship = row.relationship_type;
        return {
          id: row.id,
          placeId: row.place_id,
          brandId: row.brand_id,
          relationshipType,
          createdAt: toIso(row.created_at),
        };
      },
    );
  }

  /** Shared by the page and its `count(*)` — see `PageScope`. */
  #itemsScope(filter: BrandLinksFilter): PageScope {
    return {
      from: sql`public.item_brands ib`,
      where: sql`ib.brand_id = ${filter.brandId}::uuid`,
    };
  }

  async #readItems(
    filter: BrandLinksFilter,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly ItemLinkRow[]> {
    const { from, where } = this.#itemsScope(filter);
    const { rows } = await this.db.execute<ItemLinkRow>(sql`
      select ib.id,
             ${ARCS.itemBrands.idExpr("ib")} as item_id,
             ${ITEM_TYPE_EXPR} as item_type,
             (${ITEM_SORT})::text as sort_key
      from ${from}
      where ${where}
        and ${keysetWhere(after, ITEM_SORT, ITEM_ID, "text", "asc")}
      order by ${keysetOrder(ITEM_SORT, ITEM_ID, "asc")}
      limit ${limit}
    `);
    return rows;
  }

  async #readItemLinks(
    filter: BrandLinksFilter,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly ItemBrandRow[]> {
    const { from, where } = this.#itemsScope(filter);
    const { rows } = await this.db.execute<ItemBrandRow>(sql`
      select ib.id, ib.brand_id, ib.is_primary, ib.created_at,
             ${ARCS.itemBrands.idExpr("ib")} as item_id,
             ${ITEM_TYPE_EXPR} as item_type,
             (${ITEM_SORT})::text as sort_key
      from ${from}
      where ${where}
        and ${keysetWhere(after, ITEM_SORT, ITEM_ID, "text", "asc")}
      order by ${keysetOrder(ITEM_SORT, ITEM_ID, "asc")}
      limit ${limit}
    `);
    return rows;
  }

  /** Shared by the page and its `count(*)` — see `PageScope`. */
  #placesScope(filter: BrandLinksFilter): PageScope {
    return {
      from: sql`public.place_brands pb`,
      where: sql`pb.brand_id = ${filter.brandId}::uuid`,
    };
  }

  async #readPlaces(
    filter: BrandLinksFilter,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly PlaceLinkRow[]> {
    const { from, where } = this.#placesScope(filter);
    const { rows } = await this.db.execute<PlaceLinkRow>(sql`
      select pb.id, pb.place_id, pb.brand_id, pb.relationship_type,
             pb.created_at, (${PLACE_SORT})::text as sort_key
      from ${from}
      where ${where}
        and ${keysetWhere(after, PLACE_SORT, PLACE_ID, "text", "asc")}
      order by ${keysetOrder(PLACE_SORT, PLACE_ID, "asc")}
      limit ${limit}
    `);
    return rows;
  }
}
