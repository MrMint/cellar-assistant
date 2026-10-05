/**
 * `CheckInsCollectionActor(viewerId)` — C3 (migration plan §2.2, §1.6).
 *
 * > | `CheckInsCollectionActor(viewerId)` | item detail check-in history: mine
 * > + friends' for an item | ids |
 *
 * ## §2.2 says "ids"; that is not implementable, and this returns a projection
 *
 * A `check_ins` row has **no entity actor of its own**. §3 makes `CellarActor`
 * its writer, and `CellarActor` is keyed by *cellar* id — so a check-in id
 * addresses nothing, and there is no `CheckInActor.get` for a DataLoader to
 * batch into. §1.5's ids-vs-projection rule assumes the row has an owning actor
 * addressable by that id; where it does not, the choice is not a choice.
 *
 * The row is also four small fields. Even if a per-check-in actor existed, an
 * id round trip would cost more than the row it fetched.
 *
 * ## Visibility: `canSeeCheckIn`, exactly as A4 wrote it — settled by B1
 *
 * §1.6 splits the two check-in surfaces and gives them different rules on
 * purpose:
 *
 * > - **Cellar-scoped `CellarActor.checkIns` uses `canSeeCellar`.** You reach it
 * >   by naming a cellar id … under the looser rule a friend-of-any-drinker who
 * >   cannot see the cellar still gets a page back, which turns the cellar id
 * >   into an oracle for a PRIVATE collection's existence, activity and item ids.
 * > - **Item-scoped `CheckInsCollectionActor` uses `canSeeCheckIn`** (author OR
 * >   friend-of-author), unchanged. It is reached by naming an *item*, never a
 * >   cellar, and its answer names the drinker rather than where the bottle sat.
 * >   **C3 keeps `canSeeCheckIn` as A4 wrote it.**
 *
 * So the predicate below is `canSeeCheckIn`, branch for branch — author, then
 * friend-of-author, then `canSeeCellar` — and `packages/policy` is untouched.
 * `check-ins-collection-actor.test.ts` asserts the SQL and the policy function
 * agree for author / friend-of-author / stranger.
 *
 * **`cellarItemId` is deliberately not in the result.** `CheckInDto` carries it
 * because you asked by cellar; here you asked by item, and echoing it back
 * would hand a friend-of-a-drinker a row id inside a cellar they may not be
 * able to see — B1's oracle, one field smaller.
 */
import type {
  ActorCategory,
  CheckInsCollectionActorInterface,
  Ctx,
  ItemCheckInDto,
  ItemRef,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  CheckInsCollectionActorDescriptor,
  isItemType,
  mapPage,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import type { KeysetCursor, PageScope } from "../lib/collection-actor-base.ts";
import { ViewerCollectionActorBase } from "../lib/collection-actor-base.ts";
import {
  keysetOrder,
  keysetWhere,
  requireUuidValue,
  toIso,
  uuidArray,
} from "../lib/collection-sql.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { canSeeSql, visibilityScope } from "../lib/visibility-sql.ts";

type CheckInRow = {
  readonly id: string;
  readonly user_id: string;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly sort_key: string;
};

const SORT = sql`ci.created_at`;
const ID = sql`ci.id`;

export class CheckInsCollectionActor
  extends ViewerCollectionActorBase<ItemRef>
  implements CheckInsCollectionActorInterface
{
  static readonly category: ActorCategory =
    CheckInsCollectionActorDescriptor.category;

  async list(
    ctx: Ctx,
    item: ItemRef,
    page: PageArgs,
  ): Promise<Page<ItemCheckInDto>> {
    return mapPage(
      await this.paged<CheckInRow>(
        ctx,
        item,
        page,
        (after, limit) => this.#read(ctx, item, after, limit),
        (row) => ({ sort: row.sort_key, id: row.id }),
        () => this.#scope(ctx, item),
      ),
      (row): ItemCheckInDto => ({
        id: row.id,
        userId: row.user_id,
        item,
        createdAt: toIso(row.created_at) ?? "",
        updatedAt: toIso(row.updated_at) ?? "",
      }),
    );
  }

  /**
   * Validating the ref is `authorize`'s job because it runs on **every** turn,
   * before anything is read (§1.5) — the same place the key check runs.
   */
  protected override async authorize(
    ctx: Ctx,
    item: ItemRef,
  ): Promise<"allow" | "empty"> {
    await super.authorize(ctx, item);
    if (!isItemType(item.type)) {
      throw new ValidationError(
        `unknown item type ${JSON.stringify(item.type)}`,
      );
    }
    requireUuidValue(item.id, "itemId");
    return "allow";
  }

  /**
   * Shared by the page and its `count(*)` — see `PageScope`. Both joins belong
   * to the scope rather than to the `select`, because the visibility clause
   * reads `c.privacy` and `cellar_owners`: a count that dropped them would
   * count rows this viewer may not see.
   */
  async #scope(ctx: Ctx, item: ItemRef): Promise<PageScope> {
    // `authorize` has already refused any type that is not an `ItemType`;
    // the arc renders its column through `sql.identifier`, never `sql.raw`.
    const column = ARCS.cellarItems.column(item.type, "it");
    const visible = await this.#visibilityClause(ctx);
    return {
      from: sql`public.check_ins ci
      join public.cellar_items it on it.id = ci.cellar_item_id
      join public.cellars c on c.id = it.cellar_id`,
      where: sql`${column} = ${item.id}::uuid and ${visible}`,
    };
  }

  async #read(
    ctx: Ctx,
    item: ItemRef,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly CheckInRow[]> {
    const { from, where } = await this.#scope(ctx, item);
    const { rows } = await this.db.execute<CheckInRow>(sql`
      select ci.id, ci.user_id, ci.created_at, ci.updated_at,
             (ci.created_at)::text as sort_key
      from ${from}
      where ${where}
        and ${keysetWhere(after, SORT, ID, "timestamptz", "desc")}
      order by ${keysetOrder(SORT, ID, "desc")}
      limit ${limit}
    `);
    return rows;
  }

  /**
   * `canSeeCheckIn` (`packages/policy`), branch for branch:
   *
   *   1. the viewer wrote it (`isOwner(ctx, check_ins.user_id)`);
   *   2. the viewer is a friend of whoever it is about;
   *   3. otherwise `canSeeCellar` on the cellar holding the `cellar_items` row
   *      — which is what keeps a co-owner's own history visible to them here.
   */
  async #visibilityClause(ctx: Ctx) {
    const scope = await visibilityScope(this.db, ctx);
    const cellar = canSeeSql(scope, {
      createdBy: sql`c.created_by_id`,
      privacy: sql`c.privacy`,
      coOwnedCellarId: sql`c.id`,
    });
    // Branch 0 (`true` / `false`) needs nothing added.
    if (scope.kind !== "viewer") return cellar;
    return sql`(
      ci.user_id = ${scope.viewer}::uuid
      or ci.user_id = any(${uuidArray(scope.friendIds, "friendId")})
      or ${cellar}
    )`;
  }
}
