/**
 * `RankingsActor(viewerId)` — C2 (migration plan §2.4).
 *
 * > | `RankingsActor(viewerId)` | `/rankings` | replaces the `item_scores`
 * > Hasura native query: `AVG(score)`, `COUNT(*)` over `item_reviews` grouped
 * > by item, for a reviewer set of *everyone* or *viewer + friends*, top 200 by
 * > score then count. **The reviewer set is derived from `ctx`, never passed by
 * > the client (today it is).** Returns a projection with typed `Item` refs. |
 *
 * ## `item_scores` is a native query, not a table
 *
 * Worth stating plainly because an earlier review of the plan concluded
 * `/rankings` had no backend at all — there is no `item_scores` table, and
 * `grep` finds nothing. It is a Hasura *native query*, declared in
 * `82450ad1:nhost/metadata/databases/databases.yaml` and reached as a GraphQL root
 * field. Hasura is going away, so it is reimplemented here. The original, for
 * the record:
 *
 * ```sql
 * SELECT beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id,
 *        AVG(score) as score, COUNT(*) as count,
 *        CASE WHEN (beer_id IS NOT NULL) THEN 'BEER'::text
 *             WHEN (wine_id IS NOT NULL) THEN 'WINE'::text
 *             WHEN (coffee_id IS NOT NULL) THEN 'COFFEE'::text
 *             WHEN (sake_id IS NOT NULL) THEN 'SAKE'::text
 *             WHEN (tea_id IS NOT NULL) THEN 'TEA'::text
 *             ELSE 'SPIRIT'::text END as type
 * FROM item_reviews
 * WHERE CASE WHEN cardinality({{reviewers}}::UUID[]) = 0 THEN true
 *            ELSE user_id = ANY ({{reviewers}}::UUID[]) END
 * GROUP BY (beer_id, wine_id, spirit_id, coffee_id, sake_id, tea_id)
 * ```
 *
 * with `order_by: {score: desc, count: desc}` and `limit: 200` supplied by the
 * client query, plus a `where: {type: {_in: …}}` for the item-type toggles.
 *
 * The `CASE`, the `coalesce` and the `GROUP BY` list are `item_reviews`' item
 * arc (`../lib/item-arcs.ts`) rather than hand-typed. The `CASE` no longer
 * keeps the native query's branch order or its `ELSE 'SPIRIT'` — the table's
 * `num_nonnulls(…) = 1` check makes exactly one branch match, so neither can
 * change a result.
 *
 * ## The reviewer list is the live authorization gap, and it is closed here
 *
 * `target-stack.md` §7: *"the `item_scores` native query takes the reviewer
 * list from the client, so any user can compute rankings over any reviewer
 * set."* `src/components/ranking/fragments.ts` passes `$reviewers: String!` and
 * `RankingsClient` builds it as `{uuid, uuid, …}` from whatever it likes.
 *
 * The fix is in the *contract*, not in a validator: `RankingsInput` has no
 * uuid-array field at all, so there is no arbitrary reviewer set to reject. The
 * client names a `RankingScope`; this actor resolves it against `ctx.viewerId`
 * and the viewer's own `friends` rows. See `#reviewers` for the four cases and
 * for the one behaviour that deliberately does not carry over.
 *
 * ## Why the projection is ids and two numbers
 *
 * §2.4 says "a projection with typed `Item` refs", and Q4/§2.2 is the reason:
 * the *ranking* is the high-cardinality projection worth returning whole, and
 * the item behind each row is an id Pothos dataloads through `ItemActor`. The
 * old query inlined name, vintage, brand, image, favourite count and "have I
 * reviewed this" through six per-type fragments; none of that is ranking data,
 * and all of it is `ItemActor`'s to answer.
 *
 * ## Caching
 *
 * `ViewActorBase`'s buffer, and nothing else. Every row this actor reads —
 * `item_reviews`, `friends` — belongs to another actor, so §1.3 forbids holding
 * any of it across a fresh read: a new review, or a friendship accepted between
 * two calls, must show up on the next `all()`. The buffer is only ever
 * consulted to continue a page-walk this activation started.
 */
import type {
  ActorCategory,
  Ctx,
  ItemRef,
  Page,
  PageArgs,
  RankingEntry,
  RankingsActorInterface,
  RankingsInput,
} from "@cellar-assistant/contracts";
import {
  isItemType,
  isRankingScope,
  RANKINGS_RESULT_CAP,
  RankingsActorDescriptor,
  searchHash,
  ValidationError,
} from "@cellar-assistant/contracts";
import { itemReviews } from "@cellar-assistant/db";
import {
  and,
  desc,
  inArray,
  or,
  type SQL,
  sql,
} from "@cellar-assistant/db/orm";
import { requireSignedIn } from "../lib/guards.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { ViewActorBase } from "../lib/view-actor-base.ts";
import { friendshipsOf } from "../lib/visibility.ts";
import { friendIdsOf } from "../lib/visibility-sql.ts";

/** `item_reviews`' item arc (`../lib/item-arcs.ts`). */
const REVIEWS = ARCS.itemReviews;

type ScoreRow = {
  readonly item_id: string | null;
  readonly type: string;
  readonly score: string | number;
  readonly review_count: string | number;
};

export class RankingsActor
  extends ViewActorBase<RankingsInput, RankingEntry>
  implements RankingsActorInterface
{
  static readonly category: ActorCategory = RankingsActorDescriptor.category;

  async results(
    ctx: Ctx,
    input: RankingsInput,
    page: PageArgs,
  ): Promise<Page<RankingEntry>> {
    return this.pageOf(ctx, input, page);
  }

  async all(ctx: Ctx, input: RankingsInput): Promise<readonly RankingEntry[]> {
    return this.allOf(ctx, input);
  }

  protected projectionKey(input: RankingsInput): string {
    return searchHash({
      kind: "rankings",
      scope: input.scope,
      types: [...(input.types ?? [])].sort(),
    });
  }

  /** **Every turn**, before the buffer (§1.5). */
  protected override async authorize(
    ctx: Ctx,
    input: RankingsInput,
  ): Promise<"allow" | "empty"> {
    requireSignedIn(ctx, "read rankings");
    if (!isRankingScope(input.scope)) {
      throw new ValidationError(
        `unknown ranking scope ${JSON.stringify(input.scope)}. The reviewer ` +
          "set is derived from ctx, never named by the client (§2.4).",
      );
    }
    for (const type of input.types ?? []) {
      if (!isItemType(type)) {
        throw new ValidationError(`unknown item type ${JSON.stringify(type)}`);
      }
    }
    return "allow";
  }

  protected async project(
    ctx: Ctx,
    input: RankingsInput,
  ): Promise<readonly RankingEntry[]> {
    const reviewers = await this.#reviewers(ctx, input.scope);
    // A scope that resolves to *nobody* is an empty ranking, never a global
    // one. Today's client sends an empty array for exactly this case and the
    // native query's `cardinality = 0` branch turns it into "everyone" — the
    // same widening-on-denial trap `resolveTierListFilter` guards on the map.
    if (reviewers !== null && reviewers.length === 0) return [];

    const filters: SQL[] = [];
    if (reviewers !== null) {
      filters.push(inArray(itemReviews.userId, [...reviewers]));
    }
    const typeFilter = this.#typeFilter(input.types);
    if (typeFilter !== null) filters.push(typeFilter);

    // `AVG(score)` and `COUNT(*)`, named once and reused in the projection and
    // the ordering so the two cannot drift.
    const average = sql`avg(${itemReviews.score})`;
    const reviews = sql`count(*)`;
    // `coalesce` over the six columns is safe: the table's
    // `num_nonnulls(...) = 1` check guarantees exactly one is non-null.
    const itemId = REVIEWS.idExpr();

    const { rows } = await this.db.execute<ScoreRow>(sql`
      select
        ${itemId} as item_id,
        ${TYPE_CASE} as type,
        ${average} as score,
        ${reviews} as review_count
      from ${itemReviews}
      ${filters.length === 0 ? sql`` : sql`where ${and(...filters)}`}
      group by ${REVIEWS.columnList()}
      order by ${desc(average)}, ${desc(reviews)}, ${itemId} asc
      limit ${RANKINGS_RESULT_CAP}
    `);

    return rows.flatMap((row): RankingEntry[] => {
      if (row.item_id === null || !isItemType(row.type)) return [];
      const item: ItemRef = { type: row.type, id: row.item_id };
      return [
        {
          item,
          score: Number(row.score),
          reviewCount: Number(row.review_count),
        },
      ];
    });
  }

  /**
   * The reviewer set, derived from `ctx` — **the whole of §7's `item_scores`
   * fix**.
   *
   * `null` means "no `user_id` filter", which is the native query's
   * `cardinality = 0 → true` branch. Every other answer is a concrete set of
   * ids the viewer is entitled to name:
   *
   *   - `EVERYONE` → `null`. Aggregate over all reviews, as today's default.
   *   - `ME` → the viewer, and only ever the viewer.
   *   - `FRIENDS` → the viewer's friends, read here rather than accepted from
   *     the client. `friends` is visible only to the two people in the row
   *     (today's Hasura rule and B4's), so a client-supplied list let a
   *     stranger aggregate over a social graph they cannot even read.
   *   - `ME_AND_FRIENDS` → both.
   *
   * `friendshipsOf` matches a friendship in either direction (B4): writing one
   * is two rows delivered by the outbox, and a one-directional read would drop
   * a friend for the width of that window.
   */
  async #reviewers(
    ctx: Ctx,
    scope: RankingsInput["scope"],
  ): Promise<readonly string[] | null> {
    if (scope === "EVERYONE") return null;
    const viewer = ctx.viewerId;
    // `requireSignedIn` in `authorize` has already refused an anonymous ctx,
    // and `ViewActorBase` refuses any ctx whose viewer is not this actor's key.
    if (viewer === null) return [];
    if (scope === "ME") return [viewer];

    const friends = friendIdsOf(viewer, await friendshipsOf(this.db, viewer));
    return scope === "FRIENDS" ? friends : [viewer, ...friends];
  }

  /**
   * The old `where: {type: {_in: […]}}`, which Hasura applied *after* the
   * grouping. Applied before it here, over the polymorphic columns: the
   * `num_nonnulls(…) = 1` check makes "the `CASE` said `WINE`" and
   * "`wine_id is not null`" the same predicate, and the column form can use an
   * index. `rankings-actor.test.ts` asserts the two agree.
   */
  #typeFilter(types: RankingsInput["types"]): SQL | null {
    if (types == null || types.length === 0) return null;
    const unique = [...new Set(types)];
    const clauses = unique.map((type) => REVIEWS.isSet(type));
    return clauses.length === 1 ? (clauses[0] as SQL) : (or(...clauses) as SQL);
  }
}

/**
 * `item_scores`' `CASE`, as the arc's `typeExpr`. The native query's branch
 * order and its `ELSE 'SPIRIT'` are not kept verbatim: under the table's
 * `num_nonnulls(...) = 1` check exactly one branch matches, so neither the
 * order nor an `ELSE` standing in for the sixth `WHEN` can change a result.
 */
const TYPE_CASE = REVIEWS.typeExpr();
