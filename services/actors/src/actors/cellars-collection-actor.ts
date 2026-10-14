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
 * ## Order: yours first, then by recent activity (decision D13)
 *
 * The page used to be newest-*created* first, so a cellar you filled last
 * night sat below an empty one you made this morning, and a stranger's PUBLIC
 * cellar could sit between two of your own. It is now cellars you created or
 * co-own first, then everything else, each by **last activity**: the newest of
 * the cellar's own creation, any bottle's add or change (`cellar_items.updated_at`
 * is stamped by the shared trigger, so opening, the remaining slider and
 * finishing all count) and any check-in on its bottles. {@link SORT_KEY} folds
 * both into one `text` key so the keyset cursor stays a `(sort, id)` pair.
 * Activity moves, so a cellar that changes between two page reads can move
 * past the cursor; the next full read puts it back in its place.
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
 * user can see right now.
 *
 * D2 took that decision as **sections** rather than a narrower set: `list`
 * takes an optional `section` (`MINE` / `FRIENDS` / `DISCOVER`,
 * `lib/collection-sections.ts`), a partition of the visible set, and the
 * `/cellars` page asks for each in turn — so a stranger's PUBLIC cellar
 * still shows, under Discover, and can never sit among the viewer's own.
 */
import type {
  ActorCategory,
  BottleSearchDto,
  BottleSearchHit,
  BottleSearchInput,
  CappedList,
  CellarItemDto,
  CellarsCollectionActorInterface,
  CollectionSection,
  CollectionStatsDto,
  Ctx,
  ItemRef,
  ItemType,
  Page,
  PageArgs,
} from "@cellar-assistant/contracts";
import {
  BOTTLE_SEARCH_RESULT_CAP,
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
import { cellarItems } from "@cellar-assistant/db";
import { inArray, type SQL, sql } from "@cellar-assistant/db/orm";
import { cellarOwnedBySql } from "../lib/cellar-ownership.ts";
import type { KeysetCursor, PageScope } from "../lib/collection-actor-base.ts";
import { ViewerCollectionActorBase } from "../lib/collection-actor-base.ts";
import {
  requireSection,
  sectionedVisibleWhere,
} from "../lib/collection-sections.ts";
import { keysetOrder, keysetWhere, uuidArray } from "../lib/collection-sql.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { ITEM_TABLES } from "../lib/item-bindings.ts";
import { type VisibleRow, visibleWhere } from "../lib/visibility-sql.ts";
import { escapeLike } from "./brand-search-actor.ts";
import { cellarItemDtoFrom } from "./cellar-actor.ts";

type CellarIdRow = { readonly id: string; readonly sort_key: string };

type BottleRow = {
  readonly cellar_item_id: string;
  readonly cellar_id: string;
  readonly cellar_name: string;
  readonly item_type: string | null;
  readonly item_id: string;
  readonly item_name: string;
  readonly bottle_count: number;
  readonly total: number;
};

/**
 * `findBottles`' typo rule: the item search's lexical threshold
 * (`LEXICAL_THRESHOLD`), so a misspelling finds your bottle exactly when it
 * would find the item.
 */
export const BOTTLE_NAME_SIMILARITY = 0.5;

/** Home's Continue shelf: newest-opened first (`ci` is `cellar_items`). */
const OPENED = sql`ci.open_at`;
const BOTTLE_ID = sql`ci.id`;

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

/** Cellars `viewer` created or co-owns (`c` is `cellars`). Privacy plays no part. */
const ownedBy = (viewer: string): SQL => cellarOwnedBySql(viewer, "c");

/**
 * The newest thing that happened in cellar `c`: its creation, a bottle added
 * or changed, or a check-in on one of its bottles.
 *
 * A LATERAL probe per visible cellar, so the cost follows the cellars the
 * viewer can see rather than every bottle and check-in in the database (the
 * first version grouped both tables whole on every read). Each probe is
 * `idx_cellar_items_cellar_id` for the bottles, then an index-only scan of
 * `idx_check_ins_cellar_item_id_created_at` per bottle — that index exists
 * for this (migration `20261008151737_check_ins_cellar_item_activity`, which
 * has the measurements); without it every probe would scan `check_ins` whole.
 * It still computes the activity of every visible cellar to sort them, so a
 * world of many PUBLIC cellars would want a maintained `last_activity_at`.
 */
const ACTIVITY = sql`greatest(c.created_at, a.bottle_at, a.check_in_at)`;
const ACTIVITY_JOIN = sql`
  left join lateral (
    select max(ci.updated_at) as bottle_at,
           max(k.created_at) as check_in_at
    from public.cellar_items ci
    left join public.check_ins k on k.cellar_item_id = ci.id
    where ci.cellar_id = c.id
  ) a on true`;

/**
 * `1|2026-10-07T18:04:05.123456` for one of yours, `0|…` for anyone else's:
 * fixed width, so a descending byte-wise (`collate "C"`) comparison is
 * "yours first, then newest activity". The collation is pinned because a
 * linguistic one may ignore the punctuation and still agree today by luck.
 */
const sortKeyOf = (viewer: string): SQL => sql`(
  (case when ${ownedBy(viewer)} then '1|' else '0|' end)
  || to_char(${ACTIVITY} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
)`;
const SORT_KEY = sql`s.sort_key collate "C"`;
const ID = sql`s.id`;

export class CellarsCollectionActor
  extends ViewerCollectionActorBase<null>
  implements CellarsCollectionActorInterface
{
  static readonly category: ActorCategory =
    CellarsCollectionActorDescriptor.category;

  async list(
    ctx: Ctx,
    page: PageArgs,
    section?: CollectionSection | null,
  ): Promise<Page<string>> {
    const only = requireSection(section);
    return mapPage(
      await this.paged<CellarIdRow>(
        ctx,
        null,
        page,
        (after, limit) => this.#read(ctx, after, limit, only),
        (row) => ({ sort: row.sort_key, id: row.id }),
        () => this.#scope(ctx, only),
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
   * **created or co-owns** — privacy plays no part, because ownership is the
   * whole filter, and an admin gets their own numbers rather than the world's
   * (`bypassesPolicy` is about seeing rows, not about whose collection this
   * is).
   *
   * What it counts per type is decision D13's: **bottles still in the
   * cellar** (`empty_at is null`), the same thing every cellar card and the
   * cellar page's type bar count (`CellarDto.itemCounts`). The old line
   * counted distinct items whatever their bottles' state, so two bottles of
   * one wine read as 1 and a finished bottle still counted; that is the drift
   * D13 removed.
   *
   * Two statements, both bounded by the viewer's own cellars.
   */
  async stats(ctx: Ctx): Promise<CollectionStatsDto> {
    this.requireKey(ctx);
    const viewer = ctx.viewerId;
    if (viewer === null) throw new ForbiddenError("sign in to see your stats");

    const mine = ownedBy(viewer);

    const cellarRows = await this.db.execute<{ count: number }>(sql`
      select count(*)::int as count from public.cellars c where ${mine}
    `);

    const arc = ARCS.cellarItems;
    const perType = ITEM_TYPES.map(
      (type) =>
        sql`count(${sql.identifier("ci")}.${sql.identifier(
          arc.columns[type].name,
        )})::int as ${sql.identifier(type)}`,
    );
    const itemRows = await this.db.execute<Record<ItemType, number>>(sql`
      select ${sql.join(perType, sql`, `)}
      from public.cellar_items ci
      join public.cellars c on c.id = ci.cellar_id
      where ${mine} and ci.empty_at is null
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
   * Home's Continue shelf (X10): the viewer's open bottles across every
   * cellar they created or co-own (`ownedBy` — `stats`'s set; a friend's
   * open bottle is not yours to pour), newest opened first.
   *
   * Two statements: the keyset page of ids, then those rows whole, shaped by
   * `CellarActor`'s own mapper so a bottle reads the same from either actor.
   */
  async openBottles(ctx: Ctx, page: PageArgs): Promise<Page<CellarItemDto>> {
    const ids = await this.paged<CellarIdRow>(
      ctx,
      null,
      page,
      (after, limit) => this.#readOpen(ctx, after, limit),
      (row) => ({ sort: row.sort_key, id: row.id }),
      () => this.#openScope(ctx),
    );
    const wanted = ids.entries.map((entry) => entry.node.id);
    if (wanted.length === 0) return { ...ids, entries: [] };
    const rows = await this.db
      .select()
      .from(cellarItems)
      .where(inArray(cellarItems.id, wanted));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const entries = ids.entries.flatMap(({ cursor, node }) => {
      const row = byId.get(node.id);
      // Gone between the two reads: drop it rather than fail the shelf.
      return row === undefined
        ? []
        : [{ cursor, node: cellarItemDtoFrom(row) }];
    });
    return { ...ids, entries };
  }

  /** Shared by the open-bottles page and its `count(*)` — see `PageScope`. */
  #openScope(ctx: Ctx): PageScope {
    const viewer = ctx.viewerId;
    return {
      from: sql`public.cellar_items ci join public.cellars c on c.id = ci.cellar_id`,
      where:
        viewer === null
          ? sql`false`
          : sql`${ownedBy(viewer)} and ci.open_at is not null and ci.empty_at is null`,
    };
  }

  async #readOpen(
    ctx: Ctx,
    after: KeysetCursor | null,
    limit: number,
  ): Promise<readonly CellarIdRow[]> {
    const { from, where } = this.#openScope(ctx);
    const { rows } = await this.db.execute<CellarIdRow>(sql`
      select ci.id, (${OPENED})::text as sort_key
      from ${from}
      where ${where}
        and ${keysetWhere(after, OPENED, BOTTLE_ID, "timestamptz", "desc")}
      order by ${keysetOrder(OPENED, BOTTLE_ID, "desc")}
      limit ${limit}
    `);
    return rows;
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

  /**
   * X09 — the cellars "Your bottles" come from: per ref, the viewer's own
   * cellars (created or co-owned — `ownedBy`, as `stats` counts; privacy plays
   * no part) holding a bottle of it, a finished one too when
   * `includeFinished`. One statement for the batch, one row per (item,
   * cellar) however many bottles, by cellar name, capped per item. Ids,
   * hydrated by `CellarActor.bottlesOf`, which re-checks visibility.
   */
  async ownContaining(
    ctx: Ctx,
    refs: readonly ItemRef[],
    includeFinished?: boolean | null,
  ): Promise<readonly CappedList<string>[]> {
    requireReverseEdgeBatch(refs, "ownContaining refs");
    for (const ref of refs) {
      if (!isItemType(ref.type)) {
        throw new ValidationError(`not an item type: ${ref.type}`);
      }
    }
    const none = refs.map(() => ({ nodes: [], totalCount: 0 }));
    return await this.batch(ctx, null, none, async () => {
      const viewer = ctx.viewerId;
      if (refs.length === 0 || viewer === null) return none;
      const arc = ARCS.cellarItems;
      const live =
        includeFinished === true ? sql`true` : sql`ci.empty_at is null`;
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
            where ${live} and (${bottleMatch(refs)})
          ) held
          join public.cellars c on c.id = held.cellar_id
          where ${ownedBy(viewer)}
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
        const bucket = byRef.get(`${ref.type}:${String(ref.id).toLowerCase()}`);
        return { nodes: bucket?.nodes ?? [], totalCount: bucket?.total ?? 0 };
      });
    });
  }

  /**
   * X12 — "Your bottles" in universal search: what the viewer *has*, by name.
   *
   * The set is `stats`' — cellars the viewer created or co-owns, privacy
   * playing no part — and only bottles still in them (`empty_at is null`).
   * A bottle matches when its item's name contains the term or, for a typo,
   * scores {@link BOTTLE_NAME_SIMILARITY} or better on pg_trgm's
   * `strict_word_similarity` (the item search's lexical rule). No operator
   * and no index: the scan is bounded by one person's cellars, which is
   * small, and the answer needs no embedding, so it is the same with or
   * without an AI provider.
   *
   * One hit per item per cellar, with how many open bottles of it the cellar
   * holds; a tap opens the one already opened, else the oldest. Ordered:
   * the exact name, then names that start with the term, then similarity,
   * then name and cellar name — and `id`s, so the order is total.
   */
  async findBottles(
    ctx: Ctx,
    input: BottleSearchInput,
  ): Promise<BottleSearchDto> {
    this.requireKey(ctx);
    const viewer = ctx.viewerId;
    if (viewer === null) throw new ForbiddenError("sign in to search bottles");
    const term = input.term.trim();
    if (term === "") {
      throw new ValidationError(
        "a bottle search needs something to search for",
      );
    }
    const limit = input.limit ?? BOTTLE_SEARCH_RESULT_CAP;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > BOTTLE_SEARCH_RESULT_CAP
    ) {
      throw new ValidationError(
        `limit must be an integer in [1, ${BOTTLE_SEARCH_RESULT_CAP}], got ${limit}`,
      );
    }

    const arc = ARCS.cellarItems;
    const alias = (type: ItemType) =>
      sql.identifier(`it_${type.toLowerCase()}`);
    const joins = sql.join(
      ITEM_TYPES.map(
        (type) =>
          sql`left join ${ITEM_TABLES[type]} ${alias(type)}
                on ${alias(type)}.id = ${arc.column(type, "ci")}`,
      ),
      sql` `,
    );
    const name = sql`coalesce(${sql.join(
      ITEM_TYPES.map((type) => sql`${alias(type)}.name`),
      sql`, `,
    )})`;
    const contains = `%${escapeLike(term)}%`;
    const startsWith = `${escapeLike(term)}%`;

    const { rows } = await this.db.execute<BottleRow>(sql`
      with mine as (
        select ci.id, ci.cellar_id, ci.open_at, ci.created_at,
               ${arc.typeExpr("ci")} as item_type,
               ${arc.idExpr("ci")} as item_id,
               ${name} as item_name
        from public.cellar_items ci
        join public.cellars c on c.id = ci.cellar_id
        ${joins}
        where ${ownedBy(viewer)} and ci.empty_at is null
      ),
      matched as (
        select m.*,
               strict_word_similarity(${term}, m.item_name)::float8 as sim
        from mine m
        where m.item_name is not null
          and (m.item_name ilike ${contains} escape '\\'
               or strict_word_similarity(${term}, m.item_name)
                  >= ${BOTTLE_NAME_SIMILARITY})
      ),
      grouped as (
        select m.cellar_id, m.item_type, m.item_id,
               min(m.item_name) as item_name,
               (array_agg(m.id order by (m.open_at is null), m.created_at, m.id))[1]
                 as cellar_item_id,
               count(*)::int as bottle_count,
               max(m.sim) as sim,
               bool_or(lower(m.item_name) = lower(${term})) as exact,
               bool_or(m.item_name ilike ${startsWith} escape '\\') as prefix
        from matched m
        group by m.cellar_id, m.item_type, m.item_id
      )
      select g.cellar_item_id, g.cellar_id, c.name as cellar_name,
             g.item_type, g.item_id, g.item_name, g.bottle_count,
             (count(*) over ())::int as total
      from grouped g
      join public.cellars c on c.id = g.cellar_id
      order by g.exact desc, g.prefix desc, g.sim desc,
               lower(g.item_name) asc, lower(c.name) asc,
               g.cellar_id asc, g.item_id asc
      limit ${limit}
    `);

    const hits = rows.map((row): BottleSearchHit => {
      if (row.item_type === null || !isItemType(row.item_type)) {
        throw new ConflictError(
          `a cellar_items row in ${row.cellar_id} names no item`,
        );
      }
      return {
        cellarItemId: row.cellar_item_id,
        cellarId: row.cellar_id,
        cellarName: row.cellar_name,
        item: { type: row.item_type, id: row.item_id },
        itemName: row.item_name,
        bottleCount: Number(row.bottle_count),
      };
    });
    return { hits, totalCount: Number(rows[0]?.total ?? 0) };
  }

  /**
   * Shared by the page and its `count(*)` — see `PageScope`. A `section`
   * narrows the visibility clause (D2); it never replaces it.
   */
  async #scope(
    ctx: Ctx,
    section: CollectionSection | null = null,
  ): Promise<PageScope> {
    return {
      from: sql`public.cellars c`,
      where: await sectionedVisibleWhere(this.db, ctx, CELLAR_ROW, section),
    };
  }

  async #read(
    ctx: Ctx,
    after: KeysetCursor | null,
    limit: number,
    section: CollectionSection | null,
  ): Promise<readonly CellarIdRow[]> {
    const viewer = ctx.viewerId;
    if (viewer === null) throw new ForbiddenError("sign in to see cellars");
    const { from, where } = await this.#scope(ctx, section);
    const { rows } = await this.db.execute<CellarIdRow>(sql`
      select s.id, s.sort_key from (
        select c.id, ${sortKeyOf(viewer)} as sort_key
        from ${from}
        ${ACTIVITY_JOIN}
        where ${where}
      ) s
      where ${keysetWhere(after, SORT_KEY, ID, "text", "desc")}
      order by ${keysetOrder(SORT_KEY, ID, "desc")}
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
