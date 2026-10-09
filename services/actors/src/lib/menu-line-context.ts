/**
 * X07 — what a page of menu lines means to one viewer, in five statements.
 *
 * The menu is shared (any signed-in viewer reads a place's lines), but the
 * reasons a line might matter are not: "In Bar Cart", "You ★4.5", "Sam loved
 * it", "Like the Lagavulin 16 you rated ★4.5". Each is a row that exists —
 * a bottle, a review, a friend's review, an embedding distance under a fixed
 * threshold — and nothing here invents or scores anything. In particular
 * there is **no affinity number**: the "like" reason names the item and the
 * viewer's own score, and the distance that chose it is never returned.
 *
 * ## Whose rows, and why that is the whole authorization
 *
 * Everything read here is either the viewer's own (`cellars` they created or
 * co-own, their `item_reviews`, the `menu_scans` they made) or a friend's
 * review — and item reviews are already public on every item page
 * (`Item.reviews`). Friends' **favourites** are deliberately not read: those
 * are owner-only (`FavoritesCollectionActor`'s module doc), so "loved it"
 * means a 4.5★-or-better review, which a friend has published.
 *
 * The line ids are not trusted for anything but lookup: the matched item each
 * line names is read from `place_menu_items` itself, so a caller cannot ask
 * "what do my friends think of X" through a line that does not name X.
 *
 * Plain functions over a `DbOrTx` so `menu-line-context.test.ts` can drive
 * them against the test database; `MenuScansCollectionActor.lineContext` is
 * the only production caller.
 */
import type {
  ItemRef,
  MenuLineContextDto,
  MenuLineForYouDto,
} from "@cellar-assistant/contracts";
import {
  ITEM_TYPES,
  isItemType,
  MENU_LINE_FRIEND_LOVED_MIN_SCORE,
  MENU_LINE_FRIEND_NAMES,
  MENU_LINE_LIKE_MAX_DISTANCE,
  MENU_LINE_LIKE_MIN_SCORE,
} from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import { uuidArray } from "./collection-sql.ts";
import type { DbOrTx } from "./db.ts";
import { ARCS } from "./item-arcs.ts";

const keyOf = (ref: ItemRef): string => `${ref.type}:${ref.id}`;

/** `alias.<type>_id = any(...)` for each type present, or'd; `false` if none. */
const arcMatch = (
  arc: (typeof ARCS)[keyof typeof ARCS],
  alias: string,
  refs: readonly ItemRef[],
): SQL => {
  const clauses = ITEM_TYPES.flatMap((type) => {
    const ids = refs.filter((ref) => ref.type === type).map((ref) => ref.id);
    return ids.length === 0
      ? []
      : [sql`${arc.column(type, alias)} = any(${uuidArray(ids, "item id")})`];
  });
  return clauses.length === 0 ? sql`false` : sql.join(clauses, sql` or `);
};

const refFrom = (type: unknown, id: unknown): ItemRef | null =>
  typeof type === "string" && isItemType(type) && typeof id === "string"
    ? { type, id }
    : null;

type LineRow = {
  readonly id: string;
  readonly item_type: string | null;
  readonly item_id: string | null;
  readonly mine: boolean;
};

/** The lines, the item each is matched to, and whether the viewer scanned it. */
const readLines = async (
  db: DbOrTx,
  viewer: string,
  lineIds: readonly string[],
): Promise<readonly LineRow[]> => {
  const arc = ARCS.placeMenuItems;
  const { rows } = await db.execute<LineRow>(sql`
    select i.id,
           ${arc.typeExpr("i")} as item_type,
           ${arc.idExpr("i")} as item_id,
           coalesce(s.user_id = ${viewer}::uuid, false) as mine
    from public.place_menu_items i
    left join public.menu_scans s on s.id = i.menu_scan_id
    where i.id = any(${uuidArray(lineIds, "line id")})
  `);
  return rows;
};

/** The viewer's most recently stocked cellar holding each item, unfinished. */
const readCellars = async (
  db: DbOrTx,
  viewer: string,
  refs: readonly ItemRef[],
): Promise<ReadonlyMap<string, string>> => {
  const arc = ARCS.cellarItems;
  const { rows } = await db.execute<{
    item_type: string;
    item_id: string;
    cellar_id: string;
  }>(sql`
    select distinct on (item_type, item_id) item_type, item_id, cellar_id
    from (
      select ci.cellar_id, ci.created_at,
             ${arc.typeExpr("ci")} as item_type,
             ${arc.idExpr("ci")} as item_id
      from public.cellar_items ci
      join public.cellars c on c.id = ci.cellar_id
      where ci.empty_at is null
        and (${arcMatch(arc, "ci", refs)})
        and (
          c.created_by_id = ${viewer}::uuid
          or exists (
            select 1 from public.cellar_owners o
            where o.cellar_id = c.id and o.user_id = ${viewer}::uuid
          )
        )
    ) held
    order by item_type, item_id, created_at desc, cellar_id
  `);
  return new Map(
    rows.map((row) => [`${row.item_type}:${row.item_id}`, row.cellar_id]),
  );
};

/** Each user's newest review of each item, for a set of users and items. */
const newestReviews = (users: SQL, refs: readonly ItemRef[] | null): SQL => {
  const arc = ARCS.itemReviews;
  return sql`(
    select distinct on (r.user_id, item_type, item_id)
           r.user_id, item_type, item_id, r.score, r.updated_at
    from (
      select r.*, ${arc.typeExpr("r")} as item_type, ${arc.idExpr("r")} as item_id
      from public.item_reviews r
      where r.user_id in (${users})
        ${refs === null ? sql`` : sql`and (${arcMatch(arc, "r", refs)})`}
    ) r
    order by r.user_id, item_type, item_id, r.updated_at desc, r.id desc
  )`;
};

/** The viewer's own newest score for each item. */
const readYourScores = async (
  db: DbOrTx,
  viewer: string,
  refs: readonly ItemRef[],
): Promise<ReadonlyMap<string, number>> => {
  const { rows } = await db.execute<{
    item_type: string;
    item_id: string;
    score: number | string;
  }>(sql`
    select item_type, item_id, score
    from ${newestReviews(sql`${viewer}::uuid`, refs)} mine
  `);
  return new Map(
    rows.map((row) => [`${row.item_type}:${row.item_id}`, Number(row.score)]),
  );
};

/**
 * The names of friends whose newest review of each item is "loved it",
 * newest first (`user.name`, the profile's display name). The
 * `friends` table is read in both directions: a friendship may be stored
 * once, either way round (`FriendsCollectionActor#friendsScope`).
 */
const readFriendsWhoLoved = async (
  db: DbOrTx,
  viewer: string,
  refs: readonly ItemRef[],
): Promise<ReadonlyMap<string, readonly string[]>> => {
  const friendIds = sql`
    select friend_id from public.friends where user_id = ${viewer}::uuid
    union
    select user_id from public.friends where friend_id = ${viewer}::uuid
  `;
  const { rows } = await db.execute<{
    item_type: string;
    item_id: string;
    name: string;
  }>(sql`
    select theirs.item_type, theirs.item_id, u.name
    from ${newestReviews(friendIds, refs)} theirs
    join public."user" u on u.id = theirs.user_id
    where theirs.score >= ${MENU_LINE_FRIEND_LOVED_MIN_SCORE}
      and theirs.user_id <> ${viewer}::uuid
    order by theirs.updated_at desc, theirs.user_id
  `);
  const byItem = new Map<string, string[]>();
  for (const row of rows) {
    const key = `${row.item_type}:${row.item_id}`;
    byItem.set(key, [...(byItem.get(key) ?? []), row.name]);
  }
  return byItem;
};

/**
 * What an item *is* within its type, for "like": a wine's style and grape, a
 * spirit's type, a beer's style; nothing for coffee, sake or tea, which are
 * held to the distance alone. Two subqueries on the item's own row — the
 * per-type tables are what `ItemActor` writes, read here, never written.
 */
export const likeKindColumns = (type: SQL, id: SQL): SQL => sql`
  case ${type}
    when 'WINE' then (select w.style from public.wines w where w.id = ${id})
    when 'SPIRIT' then (select s.type from public.spirits s where s.id = ${id})
    when 'BEER' then (select b.style from public.beers b where b.id = ${id})
  end as kind,
  case ${type}
    when 'WINE' then (select w.variety from public.wines w where w.id = ${id})
  end as variety`;

/**
 * Two rows carrying {@link likeKindColumns} are alike enough to compare: the
 * same kind (both unknown counts as the same), and — when both name a grape
 * — the same grape. La Crema's Chardonnay and its Pinot Noir are a
 * cosine distance of 0.079 apart; this is what keeps them apart.
 */
export const likeComparable = (a: string, b: string): SQL => {
  const ka = sql.identifier(a);
  const kb = sql.identifier(b);
  return sql`(${ka}.kind is not distinct from ${kb}.kind
    and (${ka}.variety is null or ${kb}.variety is null
         or ${ka}.variety = ${kb}.variety))`;
};

/**
 * For each item, the nearest item of the same type and kind the viewer rated
 * at least {@link MENU_LINE_LIKE_MIN_SCORE}, when it is within
 * {@link MENU_LINE_LIKE_MAX_DISTANCE}. Both vectors must come from the same
 * embedding model: a distance across two models' spaces means nothing.
 */
const readLikeYouRated = async (
  db: DbOrTx,
  viewer: string,
  refs: readonly ItemRef[],
): Promise<ReadonlyMap<string, { item: ItemRef; score: number }>> => {
  if (refs.length === 0) return new Map();
  const vec = ARCS.itemVectors;
  const { rows } = await db.execute<{
    item_type: string;
    item_id: string;
    like_type: string;
    like_id: string;
    score: number | string;
  }>(sql`
    with rated as (
      select item_type, item_id, score
      from ${newestReviews(sql`${viewer}::uuid`, null)} mine
      where score >= ${MENU_LINE_LIKE_MIN_SCORE}
    ),
    rated_vectors as (
      select r.item_type, r.item_id, r.score, v.vector, v.embedding_model,
             ${likeKindColumns(sql`r.item_type`, sql`r.item_id`)}
      from rated r
      join public.item_vectors v
        on ${vec.typeExpr("v")} = r.item_type
       and ${vec.idExpr("v")} = r.item_id
      where v.vector is not null
    ),
    target_rows as (
      select ${vec.typeExpr("t")} as item_type,
             ${vec.idExpr("t")} as item_id,
             t.vector, t.embedding_model
      from public.item_vectors t
      where t.vector is not null and (${arcMatch(vec, "t", refs)})
    ),
    target as (
      select tr.*, ${likeKindColumns(sql`tr.item_type`, sql`tr.item_id`)}
      from target_rows tr
    )
    select target.item_type, target.item_id,
           best.item_type as like_type, best.item_id as like_id, best.score
    from target
    cross join lateral (
      select rv.item_type, rv.item_id, rv.score,
             (rv.vector <=> target.vector) as distance
      from rated_vectors rv
      where rv.item_type = target.item_type
        and rv.item_id <> target.item_id
        and ${likeComparable("rv", "target")}
        and rv.embedding_model is not distinct from target.embedding_model
      order by rv.vector <=> target.vector, rv.item_id
      limit 1
    ) best
    where best.distance <= ${MENU_LINE_LIKE_MAX_DISTANCE}
  `);
  const out = new Map<string, { item: ItemRef; score: number }>();
  for (const row of rows) {
    const like = refFrom(row.like_type, row.like_id);
    if (like === null) continue;
    out.set(`${row.item_type}:${row.item_id}`, {
      item: like,
      score: Number(row.score),
    });
  }
  return out;
};

/** Every reason is empty: the line draws no chip. */
export const hasNoReason = (forYou: MenuLineForYouDto): boolean =>
  forYou.cellarId === null &&
  forYou.yourScore === null &&
  forYou.lovedByFriendCount === 0 &&
  forYou.likeYouRated === null;

/**
 * The context for each of `lineIds`, in order. `lineIds` must already be
 * uuids (the actor checks); an id naming no line answers as an unmatched line
 * the viewer did not scan.
 */
export const readMenuLineContext = async (
  db: DbOrTx,
  viewer: string,
  lineIds: readonly string[],
): Promise<readonly MenuLineContextDto[]> => {
  if (lineIds.length === 0) return [];
  const lines = await readLines(db, viewer, lineIds);
  const byLine = new Map(lines.map((line) => [line.id, line]));

  const refs = new Map<string, ItemRef>();
  for (const line of lines) {
    const ref = refFrom(line.item_type, line.item_id);
    if (ref !== null) refs.set(keyOf(ref), ref);
  }
  const matched = [...refs.values()];
  // One after another, not `Promise.all`: inside a transaction `db` is one
  // client, and pg queues concurrent queries on it with a deprecation warning.
  const none = matched.length === 0;
  const cellars = none ? new Map() : await readCellars(db, viewer, matched);
  const scores = none ? new Map() : await readYourScores(db, viewer, matched);
  const loved = none
    ? new Map<string, readonly string[]>()
    : await readFriendsWhoLoved(db, viewer, matched);
  // "Like the X you rated" only for an item the viewer has not rated: their
  // own score is the better reason, and the two together would be noise.
  const like = await readLikeYouRated(
    db,
    viewer,
    matched.filter((ref) => !scores.has(keyOf(ref))),
  );

  return lineIds.map((lineId): MenuLineContextDto => {
    const line = byLine.get(lineId);
    const ref =
      line === undefined ? null : refFrom(line.item_type, line.item_id);
    if (line === undefined || ref === null) {
      return {
        lineId,
        canCorrectMatch: line?.mine === true,
        forYou: null,
      };
    }
    const key = keyOf(ref);
    const friends: readonly string[] = loved.get(key) ?? [];
    return {
      lineId,
      canCorrectMatch: line.mine === true,
      forYou: {
        cellarId: cellars.get(key) ?? null,
        yourScore: scores.get(key) ?? null,
        lovedByFriendNames: friends.slice(0, MENU_LINE_FRIEND_NAMES),
        lovedByFriendCount: friends.length,
        likeYouRated: like.get(key) ?? null,
      },
    };
  });
};
