/**
 * `CellarsCollectionActor(viewerId)` — C3 (migration plan §2.2).
 *
 * > | `CellarsCollectionActor(viewerId)` | `/cellars`: mine, co-owned,
 * > friends' visible | ids |
 *
 * ## Why this returns ids
 *
 * §1.5: *"Ids for owned lists whose entity actors are cheap and likely warm."*
 * A cellar's entity actor is keyed by exactly the id this list produces,
 * `CellarActor.get` answers from an aggregate loaded on activate, and the
 * `/cellars` card wants `itemCount` — which only that actor computes. So the
 * page is uuids and `services/api` fans them out through the `Cellar` DataLoader,
 * one batch per page.
 *
 * ## The visibility predicate is `canSee` (§1.6), written in SQL
 *
 * Keyset paging means the filter has to be in the `where` clause: a page of 20
 * cannot be assembled by reading rows and discarding the invisible ones without
 * either over-reading or returning short pages. So `canSee`'s four branches are
 * transcribed into SQL here, in the same order, and
 * `cellars-collection-actor.test.ts` pins the transcription against the policy
 * function itself for owner, co-owner, friend and stranger — the §1.6 trio plus
 * the branch a cellar has and a tier list does not.
 *
 * The one input the SQL cannot derive is friendship, because §1.6's `isFriend`
 * *"answers a question of fact, not of permission"* and deliberately does not
 * short-circuit for admin. `friendshipsOf` reads it in one round trip for the
 * whole page (B4: match either direction, because between the two calls of an
 * acceptance only one row exists).
 *
 * ## What "visible" includes, and how that differs from §2.2
 *
 * §2.2 says "mine, co-owned, friends' visible". `canSee` is a superset: it also
 * returns a **stranger's PUBLIC cellar**. That is what `/cellars` shows today —
 * `public_cellars.yaml` grants role `user` exactly these four branches and the
 * page renders the filter unmodified — so narrowing it would drop cellars a
 * user can see right now. Narrowing is a product decision for D2; this is the
 * migration.
 */
import type {
  ActorCategory,
  CappedList,
  CellarsCollectionActorInterface,
  CollectionStatsDto,
  Ctx,
  ItemRef,
  ItemType,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  CellarsCollectionActorDescriptor,
  ConflictError,
  ForbiddenError,
  ITEM_TYPES,
  isItemType,
  mapPage,
  REVERSE_EDGE_CAP,
  requireReverseEdgeBatch,
  ValidationError,
} from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import type { KeysetCursor, PageScope } from "../lib/collection-actor-base.ts";
import { ViewerCollectionActorBase } from "../lib/collection-actor-base.ts";
import { keysetOrder, keysetWhere, uuidArray } from "../lib/collection-sql.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { type VisibleRow, visibleWhere } from "../lib/visibility-sql.ts";

type CellarIdRow = { readonly id: string; readonly sort_key: string };

type ContainingRow = {
  readonly cellar_id: string;
  readonly item_type: string | null;
  readonly item_id: string;
  readonly total: number;
};

/** `ci.<type>_id = any(<ids>)` per item type present in `refs`. */
const bottleMatch = (refs: readonly ItemRef[]): SQL =>
  sql.join(
    ITEM_TYPES.flatMap((type) => {
      const ids = refs.filter((ref) => ref.type === type).map((r) => r.id);
      return ids.length === 0
        ? []
        : [
            sql`${ARCS.cellarItems.column(type, "ci")} = any(${uuidArray(ids, "item id")})`,
          ];
    }),
    sql` or `,
  );

/** Where `canSee`'s inputs live in this collection's query (`c` is `cellars`). */
const CELLAR_ROW: VisibleRow = {
  createdBy: sql`c.created_by_id`,
  privacy: sql`c.privacy`,
  coOwnedCellarId: sql`c.id`,
};

/** `cellars.created_at` is `not null`, so the cursor needs no `coalesce`. */
const SORT = sql`c.created_at`;
const ID = sql`c.id`;

export class CellarsCollectionActor
  extends ViewerCollectionActorBase<null>
  implements CellarsCollectionActorInterface
{
  static readonly category: ActorCategory =
    CellarsCollectionActorDescriptor.category;

  async list(ctx: Ctx, page: PageArgs): Promise<Page<string>> {
    return mapPage(
      await this.paged<CellarIdRow>(
        ctx,
        null,
        page,
        (after, limit) => this.#read(ctx, after, limit),
        (row) => ({ sort: row.sort_key, id: row.id }),
        () => this.#scope(ctx),
      ),
      (row) => row.id,
    );
  }

  /**
   * The `/search` landing line (UI parity G36, and the bug it fixes).
   *
   * The client used to sum `list`'s page, so a viewer's "items across
   * cellars" included every stranger's PUBLIC cellar and every friend's
   * FRIENDS one. The old page asked a narrower question
   * (`82450ad1:src/components/search/fragments.ts`): cellars the viewer
   * **created or co-owns**, and per type the number of **distinct items**
   * with a bottle in one of them. This is that question, verbatim — privacy
   * plays no part, because ownership is the whole filter, and an admin gets
   * their own numbers rather than the world's (`bypassesPolicy` is about
   * seeing rows, not about whose collection this is).
   *
   * Two statements, both bounded by the viewer's own cellars.
   */
  async stats(ctx: Ctx): Promise<CollectionStatsDto> {
    this.requireKey(ctx);
    const viewer = ctx.viewerId;
    if (viewer === null) throw new ForbiddenError("sign in to see your stats");

    const mine = sql`(
      c.created_by_id = ${viewer}::uuid
      or exists (
        select 1 from public.cellar_owners o
        where o.cellar_id = c.id and o.user_id = ${viewer}::uuid
      )
    )`;

    const cellarRows = await this.db.execute<{ count: number }>(sql`
      select count(*)::int as count from public.cellars c where ${mine}
    `);

    const arc = ARCS.cellarItems;
    const perType = ITEM_TYPES.map(
      (type) =>
        sql`count(distinct ${sql.identifier("ci")}.${sql.identifier(
          arc.columns[type].name,
        )})::int as ${sql.identifier(type)}`,
    );
    const itemRows = await this.db.execute<Record<ItemType, number>>(sql`
      select ${sql.join(perType, sql`, `)}
      from public.cellar_items ci
      join public.cellars c on c.id = ci.cellar_id
      where ${mine}
    `);

    const counted = itemRows.rows[0];
    const byType = Object.fromEntries(
      ITEM_TYPES.map((type) => [type, Number(counted?.[type] ?? 0)]),
    ) as Record<ItemType, number>;
    return {
      cellarCount: Number(cellarRows.rows[0]?.count ?? 0),
      itemCounts: {
        total: ITEM_TYPES.reduce((sum, type) => sum + byType[type], 0),
        byType,
      },
    };
  }

  /**
   * UI parity G9 — the old item page's
   * `cellar_items(where: {empty_at: {_is_null: true}}) { cellar { … } }`,
   * minus its leak: only cellars `#visibilityClause` admits, the clause `list`
   * pages by. One statement for the batch, one row per (item, cellar) however
   * many bottles of it the cellar holds, by cellar name, capped per item.
   */
  async containing(
    ctx: Ctx,
    refs: readonly ItemRef[],
  ): Promise<readonly CappedList<string>[]> {
    requireReverseEdgeBatch(refs, "containing refs");
    for (const ref of refs) {
      if (!isItemType(ref.type)) {
        throw new ValidationError(`not an item type: ${ref.type}`);
      }
    }
    return await this.batch(ctx, null, [], async () => {
      if (refs.length === 0) return [];
      const arc = ARCS.cellarItems;
      const visible = await this.#visibilityClause(ctx);
      const { rows } = await this.db.execute<ContainingRow>(sql`
        select cellar_id, item_type, item_id, total from (
          select c.id as cellar_id, c.name, held.item_type, held.item_id,
                 row_number() over (
                   partition by held.item_type, held.item_id
                   order by c.name asc, c.id asc
                 ) as rn,
                 (count(*) over (
                   partition by held.item_type, held.item_id
                 ))::int as total
          from (
            select distinct ci.cellar_id,
                   ${arc.typeExpr("ci")} as item_type,
                   ${arc.idExpr("ci")} as item_id
            from public.cellar_items ci
            where ci.empty_at is null and (${bottleMatch(refs)})
          ) held
          join public.cellars c on c.id = held.cellar_id
          where ${visible}
        ) ranked
        where rn <= ${REVERSE_EDGE_CAP}
        order by rn
      `);
      const byRef = new Map<string, { nodes: string[]; total: number }>();
      for (const row of rows) {
        if (row.item_type === null) {
          throw new ConflictError(
            `a cellar_items row in ${row.cellar_id} names no item`,
          );
        }
        const key = `${row.item_type}:${row.item_id}`;
        const bucket = byRef.get(key) ?? { nodes: [], total: row.total };
        bucket.nodes.push(row.cellar_id);
        byRef.set(key, bucket);
      }
      return refs.map((ref) => {
        const bucket = byRef.get(`${ref.type}:${ref.id}`);
        return { nodes: bucket?.nodes ?? [], totalCount: bucket?.total ?? 0 };
      });
    });
  }

  /** Shared by the page and its `count(*)` — see `PageScope`. */
  async #scope(ctx: Ctx): Promise<PageScope> {
    return {
      from: sql`public.cellars c`,
      where: await this.#visibilityClause(ctx),
    };
  }

  async #read(
    ctx: Ctx,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly CellarIdRow[]> {
    const { from, where } = await this.#scope(ctx);
    const { rows } = await this.db.execute<CellarIdRow>(sql`
      select c.id, (c.created_at)::text as sort_key
      from ${from}
      where ${where}
        and ${keysetWhere(after, SORT, ID, "timestamptz", "desc")}
      order by ${keysetOrder(SORT, ID, "desc")}
      limit ${limit}
    `);
    return rows;
  }

  /**
   * `canSee` (`packages/policy`), branch for branch:
   *
   *   1. owner — creator **or** co-owner, regardless of privacy;
   *   2. `PUBLIC`;
   *   3. `FRIENDS` and the viewer is a friend of the creator;
   *   4. otherwise no.
   *
   * `bypassesPolicy` (§1.6: system **and** admin) drops the clause entirely,
   * which is what `canSee`'s own first line does. It can only ever apply to an
   * admin reading *their own* collection: `ViewerCollectionActorBase` refuses
   * any ctx whose viewer is not this actor's key, so there is no way to address
   * somebody else's `/cellars` with an admin token (C2's narrowing).
   */
  async #visibilityClause(ctx: Ctx) {
    return visibleWhere(this.db, ctx, CELLAR_ROW);
  }
}
