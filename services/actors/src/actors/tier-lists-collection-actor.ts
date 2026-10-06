/**
 * `TierListsCollectionActor(viewerId)` — C3 (migration plan §2.2).
 *
 * > | `TierListsCollectionActor(viewerId)` | `/tier-lists` | ids |
 *
 * **Ids**, for the same reason `CellarsCollectionActor` returns them (§1.5):
 * a tier list's entity actor is keyed by exactly this id, `TierListActor.get`
 * answers from an aggregate loaded on activate, and the `/tier-lists` card
 * wants `itemCount` and `contentUpdatedAt`, which only that actor supplies.
 *
 * ## The visibility predicate is `canSeeTierList`, and it must not drift
 *
 * Three places in the new stack decide who may see a tier list, and a
 * disagreement between them is exactly `target-stack.md` §7's live hole:
 * B7's `TierListActor` gates a single list, C1's `lib/tier-list-visibility.ts`
 * reduces a *filter* before it reaches the map SQL, and this reduces the
 * *index*. All three answer with `canSeeTierList` — creator, or PUBLIC, or
 * FRIENDS-and-a-friend-of-the-creator; there is no co-owner table for tier
 * lists. Here the rule is transcribed into SQL because keyset paging needs the
 * filter in the `where` clause, and the test pins the transcription against the
 * policy function for owner / friend / stranger.
 *
 * Ordered by `content_updated_at` — B7's "bumped by every content-changing
 * write, never by `update`" — because an index of tier lists is most useful
 * sorted by when the *contents* last moved, not by when someone renamed one.
 */
import type {
  ActorCategory,
  CappedList,
  Ctx,
  Page,
  PageArgs,
  TierListEntryRef,
  TierListItemDto,
  TierListsCollectionActorInterface,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  ITEM_TYPES,
  isTierListEntryType,
  mapPage,
  REVERSE_EDGE_CAP,
  requireReverseEdgeBatch,
  TierListsCollectionActorDescriptor,
  ValidationError,
} from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import type { KeysetCursor, PageScope } from "../lib/collection-actor-base.ts";
import { ViewerCollectionActorBase } from "../lib/collection-actor-base.ts";
import {
  keysetOrder,
  keysetWhere,
  toIso,
  uuidArray,
} from "../lib/collection-sql.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { visibleWhere } from "../lib/visibility-sql.ts";

type TierListIdRow = { readonly id: string; readonly sort_key: string };

type EntryRow = {
  readonly id: string;
  readonly tier_list_id: string;
  readonly band: number;
  readonly position: number;
  readonly notes: string | null;
  readonly created_at: Date | string | null;
  readonly updated_at: Date | string | null;
  readonly entry_type: string | null;
  readonly entry_id: string;
  readonly total: number;
};

const ENTRY_ARC = ARCS.tierListItems;

/** `${type}:${id}` — the alignment key between `refs` and result rows. */
const refKey = (type: string, id: string): string => `${type}:${id}`;

/**
 * `ti.<column> = any(<ids>)` per entry type present — one disjunct per type,
 * so each can use that column's partial index (`idx_tier_list_items_*`).
 */
const entryMatch = (refs: readonly TierListEntryRef[]): SQL => {
  const disjuncts: SQL[] = [];
  const idsOf = (type: string) =>
    refs.filter((ref) => ref.type === type).map((ref) => ref.id);
  const places = idsOf("PLACE");
  if (places.length > 0) {
    disjuncts.push(sql`ti.place_id = any(${uuidArray(places, "place id")})`);
  }
  for (const type of ITEM_TYPES) {
    const ids = idsOf(type);
    if (ids.length === 0) continue;
    disjuncts.push(
      sql`${ENTRY_ARC.column(type, "ti")} = any(${uuidArray(ids, "item id")})`,
    );
  }
  return sql.join(disjuncts, sql` or `);
};

/** `tier_lists.content_updated_at` is `not null` — no `coalesce` needed. */
const SORT = sql`t.content_updated_at`;
const ID = sql`t.id`;

export class TierListsCollectionActor
  extends ViewerCollectionActorBase<null>
  implements TierListsCollectionActorInterface
{
  static readonly category: ActorCategory =
    TierListsCollectionActorDescriptor.category;

  async list(ctx: Ctx, page: PageArgs): Promise<Page<string>> {
    return mapPage(
      await this.paged<TierListIdRow>(
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
   * UI parity G8. One statement for the whole batch: every `tier_list_items`
   * row ranking one of `refs` on a list `#visibilityClause` admits — the same
   * clause `list` pages by, so the two can never disagree about a list —
   * windowed per entry to {@link REVERSE_EDGE_CAP} rows, with the true count.
   *
   * A list the viewer may not see contributes no row, so neither its id nor
   * (through the `TierList` loader) its name ever reaches the response: the
   * leak the old `ItemTierLists` query had.
   */
  async entriesOf(
    ctx: Ctx,
    refs: readonly TierListEntryRef[],
  ): Promise<readonly CappedList<TierListItemDto>[]> {
    requireReverseEdgeBatch(refs, "entriesOf refs");
    for (const ref of refs) {
      if (!isTierListEntryType(ref.type)) {
        throw new ValidationError(`not a tier-list entry type: ${ref.type}`);
      }
    }
    return await this.batch(ctx, null, [], async () => {
      if (refs.length === 0) return [];
      const visible = await this.#visibilityClause(ctx);
      const { rows } = await this.db.execute<EntryRow>(sql`
        select * from (
          select ti.id, ti.tier_list_id, ti.band, ti.position, ti.notes,
                 ti.created_at, ti.updated_at,
                 ti.type as entry_type,
                 coalesce(ti.place_id, ${ENTRY_ARC.idExpr("ti")}) as entry_id,
                 row_number() over w as rn,
                 (count(*) over (partition by ti.type,
                   coalesce(ti.place_id, ${ENTRY_ARC.idExpr("ti")})))::int as total
          from public.tier_list_items ti
          join public.tier_lists t on t.id = ti.tier_list_id
          where (${entryMatch(refs)}) and ${visible}
          window w as (
            partition by ti.type, coalesce(ti.place_id, ${ENTRY_ARC.idExpr("ti")})
            order by t.content_updated_at desc, t.id desc, ti.id asc
          )
        ) ranked
        where rn <= ${REVERSE_EDGE_CAP}
        order by rn
      `);

      const byRef = new Map<
        string,
        { nodes: TierListItemDto[]; total: number }
      >();
      for (const row of rows) {
        if (row.entry_type === null || !isTierListEntryType(row.entry_type)) {
          throw new ConflictError(
            `tier_list_items ${row.id} names no entry; ` +
              "its type column should have made that impossible",
          );
        }
        const key = refKey(row.entry_type, row.entry_id);
        const bucket = byRef.get(key) ?? { nodes: [], total: row.total };
        bucket.nodes.push({
          id: row.id,
          tierListId: row.tier_list_id,
          band: row.band,
          position: row.position,
          notes: row.notes,
          entry: { type: row.entry_type, id: row.entry_id },
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at),
        });
        byRef.set(key, bucket);
      }
      return refs.map((ref) => {
        const bucket = byRef.get(refKey(ref.type, ref.id));
        return { nodes: bucket?.nodes ?? [], totalCount: bucket?.total ?? 0 };
      });
    });
  }

  /** Shared by the page and its `count(*)` — see `PageScope`. */
  async #scope(ctx: Ctx): Promise<PageScope> {
    return {
      from: sql`public.tier_lists t`,
      where: await this.#visibilityClause(ctx),
    };
  }

  async #read(
    ctx: Ctx,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly TierListIdRow[]> {
    const { from, where } = await this.#scope(ctx);
    const { rows } = await this.db.execute<TierListIdRow>(sql`
      select t.id, (t.content_updated_at)::text as sort_key
      from ${from}
      where ${where}
        and ${keysetWhere(after, SORT, ID, "timestamptz", "desc")}
      order by ${keysetOrder(SORT, ID, "desc")}
      limit ${limit}
    `);
    return rows;
  }

  /** `canSeeTierList`: creator, PUBLIC, or FRIENDS-and-a-friend. */
  async #visibilityClause(ctx: Ctx) {
    return visibleWhere(this.db, ctx, {
      createdBy: sql`t.created_by_id`,
      privacy: sql`t.privacy`,
    });
  }
}
