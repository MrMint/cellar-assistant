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
 * ## Visibility: `canSeeCheckIn` — settled by B1, widened for X02
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
 * So the predicate below is `canSeeCheckIn`, branch for branch — author,
 * companion, friend-of-author, then `canSeeCellar` for an entry still poured
 * from a bottle (`lib/check-in-visibility.ts`). X02 made the bottle optional:
 * an entry logged without one (or whose bottle was since removed) has no
 * cellar branch at all, and the item is read off the entry's own arc rather
 * than through `cellar_items`. `check-ins-collection-actor.test.ts` asserts
 * the SQL and the policy function agree.
 *
 * `scope: "MINE"` is the item page's "Your log" (D8): only entries about the
 * viewer. The default, `"ALL"`, is the C3 surface.
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
  ItemCheckInScope,
  ItemRef,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  CheckInsCollectionActorDescriptor,
  ITEM_CHECK_IN_SCOPES,
  isItemType,
  mapPage,
  ValidationError,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import {
  type CheckInSqlRow,
  checkInColumns,
  toItemCheckInDto,
} from "../lib/check-in-rows.ts";
import {
  canSeeCheckInDetailsSql,
  canSeeCheckInSql,
} from "../lib/check-in-visibility.ts";
import type { KeysetCursor, PageScope } from "../lib/collection-actor-base.ts";
import { ViewerCollectionActorBase } from "../lib/collection-actor-base.ts";
import {
  keysetOrder,
  keysetWhere,
  requireUuidValue,
} from "../lib/collection-sql.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { visibilityScope } from "../lib/visibility-sql.ts";

type CheckInRow = CheckInSqlRow & { readonly sort_key: string };

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
    scope?: ItemCheckInScope | null,
  ): Promise<Page<ItemCheckInDto>> {
    const which = requireScope(scope);
    return mapPage(
      await this.paged<CheckInRow>(
        ctx,
        item,
        page,
        (after, limit) => this.#read(ctx, item, which, after, limit),
        (row) => ({ sort: row.sort_key, id: row.id }),
        () => this.#scope(ctx, item, which),
      ),
      (row): ItemCheckInDto => toItemCheckInDto(row, ctx.viewerId),
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
   * Shared by the page and its `count(*)` — see `PageScope`. The visibility
   * clause reads the bottle's cellar through its own `exists`, so a count
   * over this scope counts exactly the rows the page could show.
   */
  async #scope(
    ctx: Ctx,
    item: ItemRef,
    which: ItemCheckInScope,
  ): Promise<PageScope> {
    // `authorize` has already refused any type that is not an `ItemType`;
    // the arc renders its column through `sql.identifier`, never `sql.raw`.
    const column = ARCS.checkIns.column(item.type, "ci");
    const visible = canSeeCheckInSql(await visibilityScope(this.db, ctx), "ci");
    const mine =
      which === "MINE" && ctx.viewerId !== null
        ? sql` and ci.user_id = ${ctx.viewerId}::uuid`
        : which === "MINE"
          ? sql` and false`
          : sql``;
    return {
      from: sql`public.check_ins ci`,
      where: sql`${column} = ${item.id}::uuid and ${visible}${mine}`,
    };
  }

  async #read(
    ctx: Ctx,
    item: ItemRef,
    which: ItemCheckInScope,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly CheckInRow[]> {
    const { from, where } = await this.#scope(ctx, item, which);
    const details = canSeeCheckInDetailsSql(
      await visibilityScope(this.db, ctx),
      "ci",
    );
    const { rows } = await this.db.execute<CheckInRow>(sql`
      select ${checkInColumns("ci", details)},
             (ci.created_at)::text as sort_key
      from ${from}
      where ${where}
        and ${keysetWhere(after, SORT, ID, "timestamptz", "desc")}
      order by ${keysetOrder(SORT, ID, "desc")}
      limit ${limit}
    `);
    return rows;
  }
}

const requireScope = (
  scope: ItemCheckInScope | null | undefined,
): ItemCheckInScope => {
  const value = scope ?? "ALL";
  if (!(ITEM_CHECK_IN_SCOPES as readonly string[]).includes(value)) {
    throw new ValidationError(
      `unknown check-in scope ${JSON.stringify(value)}`,
    );
  }
  return value;
};
