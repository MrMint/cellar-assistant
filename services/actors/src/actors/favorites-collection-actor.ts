/**
 * `FavoritesCollectionActor(viewerId)` — C3 (migration plan §2.2, §1.5).
 *
 * > | `FavoritesCollectionActor(viewerId)` | `/favorites` | ids (typed `Item`
 * > refs) |
 *
 * This is the worked example §1.5 is written around, and the one `services/api`
 * already pins in `schema.test.ts`: one call returns a page of typed refs
 * across up to six item tables, and `plugin-dataloader` turns them into a
 * single batch of parallel `ItemActor.get` invocations — "Pothos resolves ids
 * through a DataLoader that batches into parallel entity-actor calls", verbatim.
 * An `item_favorites` row has nothing else worth returning: its only non-key
 * column is `created_at`.
 *
 * ## Authorization is the key check, and that is the whole of it
 *
 * `item_favorites` rows belong to one user (§3: `UserActor` writes rows where
 * `user_id` is its own user) and no surface in the app shows anybody else's.
 * So `ViewerCollectionActorBase`'s per-turn `ctx.viewerId === this.key` is not
 * a *first* check here, it is the only one — which is why it has to be
 * unskippable rather than a line at the top of the method. C1's bug was
 * precisely a check that ran once and then stopped running.
 *
 * B4's `UserActor.favorites` answers the same question for the same rows and
 * stays: it is the aggregate's own read, and `toggleFavorite` needs to be able
 * to return the state it just wrote. This is the *page*, keyset-paged and
 * holding nothing, which is what `/favorites` scrolls.
 */
import type {
  ActorCategory,
  Ctx,
  FavoritesCollectionActorInterface,
  ItemRef,
  ItemType,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  FavoritesCollectionActorDescriptor,
  isItemType,
  mapPage,
  ValidationError,
} from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import type { KeysetCursor, PageScope } from "../lib/collection-actor-base.ts";
import { ViewerCollectionActorBase } from "../lib/collection-actor-base.ts";
import { keysetOrder, keysetWhere } from "../lib/collection-sql.ts";
import { ARCS } from "../lib/item-arcs.ts";

type FavoriteRow = {
  readonly id: string;
  readonly item_id: string | null;
  readonly type: string;
  readonly sort_key: string;
};

/**
 * UI parity G25: `item_favorites(where: {type: {_in: …}})`, in the page's own
 * `where` (and so in its `count(*)`). Omitted, `null` or empty: all six.
 */
const typeFilter = (types: readonly ItemType[] | null | undefined): SQL => {
  if (types === null || types === undefined || types.length === 0) {
    return sql`true`;
  }
  for (const type of types) {
    if (!isItemType(type)) {
      throw new ValidationError(`not an item type: ${String(type)}`);
    }
  }
  return sql`f.type::text in (${sql.join(
    [...new Set(types)].map((type) => sql`${type}`),
    sql`, `,
  )})`;
};

const SORT = sql`f.created_at`;
const ID = sql`f.id`;

export class FavoritesCollectionActor
  extends ViewerCollectionActorBase<null>
  implements FavoritesCollectionActorInterface
{
  static readonly category: ActorCategory =
    FavoritesCollectionActorDescriptor.category;

  async list(
    ctx: Ctx,
    page: PageArgs,
    types?: readonly ItemType[] | null,
  ): Promise<Page<ItemRef>> {
    const only = typeFilter(types);
    const rows = await this.paged<FavoriteRow>(
      ctx,
      null,
      page,
      (after, limit) => this.#read(ctx, only, after, limit),
      (row) => ({ sort: row.sort_key, id: row.id }),
      () => this.#scope(ctx, only),
    );
    return mapPage(rows, (row): ItemRef => {
      // `item_favorites.type` is a `GENERATED ALWAYS` column over the same six
      // `num_nonnulls(...) = 1` columns `item_id` coalesces, so the two cannot
      // disagree — the cast is a type narrowing, not a validation.
      const type: ItemType = isItemType(row.type) ? row.type : "SPIRIT";
      return { type, id: row.item_id ?? "" };
    });
  }

  /**
   * Shared by the page and its `count(*)` — see `PageScope`. `requireKey` has
   * already refused an anonymous ctx, so `false` is unreachable narrowing.
   */
  #scope(ctx: Ctx, only: SQL): PageScope {
    const viewer = ctx.viewerId;
    return {
      from: sql`public.item_favorites f`,
      where:
        viewer === null
          ? sql`false`
          : sql`f.user_id = ${viewer}::uuid and ${only}`,
    };
  }

  async #read(
    ctx: Ctx,
    only: SQL,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly FavoriteRow[]> {
    const { from, where } = this.#scope(ctx, only);
    const { rows } = await this.db.execute<FavoriteRow>(sql`
      select f.id, f.type::text as type,
             ${ARCS.itemFavorites.idExpr("f")} as item_id,
             (f.created_at)::text as sort_key
      from ${from}
      where ${where}
        and ${keysetWhere(after, SORT, ID, "timestamptz", "desc")}
      order by ${keysetOrder(SORT, ID, "desc")}
      limit ${limit}
    `);
    return rows;
  }
}
