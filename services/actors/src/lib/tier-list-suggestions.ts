/**
 * X16 — tier lists without typing: the reads behind Add entry's sections,
 * a list started from your ratings, and a grounded "Try this next".
 *
 * Everything here is a §1.1 FK-lookup read issued from `TierListActor`'s own
 * turn (or `TierListsCollectionActor`'s, for the template counts), the same
 * kind `resolveTierListEntries` already does for the insights prompt: it
 * reads `cellar_items`, `item_reviews`, `check_ins`, `item_favorites`,
 * `user_place_interactions`, other people's `tier_list_items` and
 * `item_vectors`, and writes nothing. No model is called — the similarity
 * arm reads the vectors items already have — so none of it costs an AI call
 * or spends a budget.
 *
 * ## Privacy
 *
 *  - Your own rows only: reviews, drink logs, cellars and loves are filtered
 *    to `user_id = viewer` (a cellar: created or co-owned).
 *  - Friends' rankings come from lists **a friend created** that the viewer
 *    may see — `canSeeSql`, the same clause every tier-list collection uses —
 *    so a private list contributes nothing, and a stranger's public list is
 *    not "friends ranked" (X11's "From friends means created by a friend").
 *  - A place still under review is its creator's alone (X27):
 *    `placeRefVisibleToSql` drops it from every place read here.
 *
 * ## Abstention
 *
 * "Try this next" is empty rather than padded. A similar item must sit within
 * {@link SIMILAR_MAX_DISTANCE} of the entry it is like, or share enough of its
 * name ({@link SIMILAR_NAME_THRESHOLD}); a friend's pick must be in their top
 * two bands. Each card carries the fact that put it there, never a score.
 */
import type {
  ItemType,
  TierListEntryRef,
  TierListEntryType,
  TierListSuggestionDto,
  TierListSuggestionSection,
  TierListTemplateDto,
  TierListTryNextDto,
} from "@cellar-assistant/contracts";
import {
  bandForScore,
  distanceFromSimilarity,
  ITEM_TYPES,
  listTypeOfEntryType,
  MAX_BATCH_ADD,
  SUGGESTIONS_PER_SECTION,
  TIER_LIST_ENTRY_TYPES,
  TRY_NEXT_LIMIT,
} from "@cellar-assistant/contracts";
import { type SQL, sql } from "@cellar-assistant/db/orm";
import { toIso, uuidArray } from "./collection-sql.ts";
import type { DbOrTx } from "./db.ts";
import { withHnswScan } from "./hnsw.ts";
import { reciprocalRankFusion } from "./hybrid-rank.ts";
import { ARCS } from "./item-arcs.ts";
import { ITEM_TABLES } from "./item-bindings.ts";
import { entryKey, resolveTierListEntries } from "./tier-list-entries.ts";
import { placeRefVisibleToSql } from "./unshared-places.ts";
import {
  canSeeSql,
  type VisibilityScope,
  type VisibleRow,
} from "./visibility-sql.ts";

/* -------------------------------------------------------------------------- */
/* Tuning                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A neighbour must be at least this similar (`similarity = 1 - distance/2`,
 * the app's one conversion) to the entry it is "like". Tighter than a search
 * cutoff on purpose: a search is asked for, a recommendation is volunteered,
 * and a weak one costs trust. Untuned beyond that; N05's eval set is where it
 * should be measured.
 */
export const SIMILAR_MIN_SIMILARITY = 0.85;
export const SIMILAR_MAX_DISTANCE = distanceFromSimilarity(
  SIMILAR_MIN_SIMILARITY,
);

/**
 * The lexical arm's floor: `strict_word_similarity(seed name, name)`, as
 * `ItemSearchActor`'s N08 arm uses for a phrase. It finds the same maker's
 * other bottles ("Lagavulin 8" for "Lagavulin 16 Year Old"), which a vector
 * built from tasting notes may rank below a stranger.
 */
export const SIMILAR_NAME_THRESHOLD = 0.5;

/** A friend's pick counts for "Try this next" from this band up. */
export const FRIEND_PICK_MIN_BAND = 4;

/** A list entry seeds "like this" from this band up. */
export const SEED_MIN_BAND = 4;

/** At most this many seeds of each kind (list tops, loves). */
export const MAX_SEEDS_PER_KIND = 4;

/** Neighbours read per seed and arm, before fusion. */
const NEIGHBOURS_PER_SEED = 12;

/** Fused candidates kept per seed, so one seed cannot fill every card. */
const PICKS_PER_SEED = 2;

/* -------------------------------------------------------------------------- */
/* Pure parts                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The first section to claim an entry keeps it: a bottle you own and rated
 * is "In your cellars", not also "Tasted". Order within a section is kept.
 */
export const claimSections = <T extends { readonly entryId: string }>(
  sections: readonly (readonly [TierListSuggestionSection, readonly T[]])[],
): { section: TierListSuggestionSection; row: T }[] => {
  const claimed = new Set<string>();
  const out: { section: TierListSuggestionSection; row: T }[] = [];
  for (const [section, rows] of sections) {
    for (const row of rows) {
      if (claimed.has(row.entryId)) continue;
      claimed.add(row.entryId);
      out.push({ section, row });
    }
  }
  return out;
};

/** Your verdict: the review's score, else the newest scored log's. */
export const myScoreOf = (
  reviewScore: number | null | undefined,
  logScore: number | null | undefined,
): number | null => reviewScore ?? logScore ?? null;

/** One seed's candidates from the two arms, best first. */
export type SeedNeighbours = {
  readonly seedId: string;
  /** Nearest first; every one already inside {@link SIMILAR_MAX_DISTANCE}. */
  readonly byVector: readonly string[];
  /** Best name match first; every one over {@link SIMILAR_NAME_THRESHOLD}. */
  readonly byName: readonly string[];
};

/**
 * N08's fusion, per seed: the two arms by reciprocal rank, then each seed's
 * best {@link PICKS_PER_SEED}, taken round-robin across seeds in seed order
 * so the list's top entry speaks first and no one seed fills the row. An
 * entry two seeds share goes to the earlier seed. `excluded` (the seeds
 * themselves, anything already claimed) is never returned.
 */
export const pickSimilar = (
  seeds: readonly SeedNeighbours[],
  excluded: ReadonlySet<string>,
  limit: number,
): { seedId: string; entryId: string }[] => {
  const perSeed = seeds.map((seed) =>
    reciprocalRankFusion<string>(
      [{ items: seed.byVector }, { items: seed.byName }],
      (id) => id,
    )
      .map((fused) => fused.key)
      .filter((id) => id !== seed.seedId)
      .slice(0, NEIGHBOURS_PER_SEED),
  );
  const taken = new Set<string>(excluded);
  const out: { seedId: string; entryId: string }[] = [];
  const used = seeds.map(() => 0);
  const cursor = seeds.map(() => 0);
  let progressed = true;
  while (out.length < limit && progressed) {
    progressed = false;
    for (const [index, seed] of seeds.entries()) {
      if (out.length >= limit) break;
      if ((used[index] ?? 0) >= PICKS_PER_SEED) continue;
      const candidates = perSeed[index] ?? [];
      let at = cursor[index] ?? 0;
      while (at < candidates.length) {
        const id = candidates[at] ?? "";
        at += 1;
        if (taken.has(id)) continue;
        taken.add(id);
        out.push({ seedId: seed.seedId, entryId: id });
        used[index] = (used[index] ?? 0) + 1;
        progressed = true;
        break;
      }
      cursor[index] = at;
    }
  }
  return out;
};

/**
 * Friends' picks and "like this" picks, alternated — a friend first, since a
 * person's word is the stronger reason — up to `limit`, the first claim on an
 * entry winning.
 */
export const interleave = <T extends { readonly entry: TierListEntryRef }>(
  first: readonly T[],
  second: readonly T[],
  limit: number,
): T[] => {
  const out: T[] = [];
  const seen = new Set<string>();
  const push = (row: T | undefined) => {
    if (row === undefined || out.length >= limit) return;
    const key = entryKey(row.entry);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  };
  for (let i = 0; i < Math.max(first.length, second.length); i += 1) {
    push(first[i]);
    push(second[i]);
  }
  return out;
};

/* -------------------------------------------------------------------------- */
/* SQL helpers                                                                 */
/* -------------------------------------------------------------------------- */

const CELLAR = ARCS.cellarItems;
const REVIEWS = ARCS.itemReviews;
const LOGS = ARCS.checkIns;
const ENTRIES = ARCS.tierListItems;
const FAVORITES = ARCS.itemFavorites;
const VECTORS = ARCS.itemVectors;

/** Where `canSeeTierList`'s inputs live in the queries below. */
const TIER_LIST_ROW: VisibleRow = {
  createdBy: sql`t.created_by_id`,
  privacy: sql`t.privacy`,
};

const isItemType = (type: TierListEntryType): type is ItemType =>
  type !== "PLACE";

/** `x not in (ids)`, written so an empty list excludes nothing. */
const notAmong = (expr: SQL, ids: readonly string[]): SQL =>
  sql`not (${expr} = any(${uuidArray(ids, "entry id")}))`;

/** A cellar you made or co-own, for the alias `c`. */
const ownCellar = (viewer: string): SQL => sql`(
  c.created_by_id = ${viewer}::uuid
  or exists (
    select 1 from public.cellar_owners o
    where o.cellar_id = c.id and o.user_id = ${viewer}::uuid
  )
)`;

/**
 * "You have had it, or have it": rated, logged, or in one of your cellars —
 * for an item. For a place: rated, marked visited, or a drink logged there.
 * "Try this next" never offers one.
 */
const untriedBy = (viewer: string, type: TierListEntryType, id: SQL): SQL => {
  if (!isItemType(type)) {
    return sql`(
      not exists (
        select 1 from public.user_place_interactions upi
        where upi.user_id = ${viewer}::uuid and upi.place_id = ${id}
          and (upi.is_visited or upi.rating is not null)
      )
      and not exists (
        select 1 from public.check_ins l
        where l.user_id = ${viewer}::uuid and l.place_id = ${id}
      )
    )`;
  }
  return sql`(
    not exists (
      select 1 from public.item_reviews r
      where r.user_id = ${viewer}::uuid and ${REVIEWS.column(type, "r")} = ${id}
    )
    and not exists (
      select 1 from public.check_ins l
      where l.user_id = ${viewer}::uuid and ${LOGS.column(type, "l")} = ${id}
    )
    and not exists (
      select 1 from public.cellar_items ci
      join public.cellars c on c.id = ci.cellar_id
      where ${CELLAR.column(type, "ci")} = ${id} and ${ownCellar(viewer)}
    )
  )`;
};

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/* -------------------------------------------------------------------------- */
/* Add entry's sections                                                        */
/* -------------------------------------------------------------------------- */

type SectionRow = {
  readonly entryId: string;
  readonly reviewScore: number | null;
  readonly logScore: number | null;
  readonly cellarName: string | null;
  readonly bottleCount: number | null;
  readonly logCount: number | null;
  readonly lastTastedAt: string | null;
  readonly friendId: string | null;
  readonly friendBand: number | null;
  readonly friendCount: number | null;
};

const blank = (entryId: string): SectionRow => ({
  entryId,
  reviewScore: null,
  logScore: null,
  cellarName: null,
  bottleCount: null,
  logCount: null,
  lastTastedAt: null,
  friendId: null,
  friendBand: null,
  friendCount: null,
});

const inCellars = async (
  db: DbOrTx,
  viewer: string,
  type: ItemType,
  exclude: readonly string[],
): Promise<SectionRow[]> => {
  const { rows } = await db.execute<{
    entry_id: string;
    bottles: number;
    cellar_name: string | null;
  }>(sql`
    select ${CELLAR.column(type, "ci")}::text as entry_id,
           (count(*) filter (where ci.empty_at is null))::int as bottles,
           (array_agg(c.name order by ci.updated_at desc))[1] as cellar_name
    from public.cellar_items ci
    join public.cellars c on c.id = ci.cellar_id
    where ${CELLAR.isSet(type, "ci")}
      and ${ownCellar(viewer)}
      and ${notAmong(CELLAR.column(type, "ci"), exclude)}
    group by ${CELLAR.column(type, "ci")}
    order by (count(*) filter (where ci.empty_at is null) > 0) desc,
             max(ci.updated_at) desc,
             1
    limit ${SUGGESTIONS_PER_SECTION}
  `);
  return rows.map((row) => ({
    ...blank(row.entry_id),
    cellarName: row.cellar_name,
    bottleCount: num(row.bottles) ?? 0,
  }));
};

type TastedSqlRow = {
  entry_id: string;
  review_score: number | string | null;
  log_score: number | string | null;
  log_count: number;
  last_at: Date | string | null;
};

const tastedRow = (row: TastedSqlRow): SectionRow => ({
  ...blank(row.entry_id),
  reviewScore: num(row.review_score),
  logScore: num(row.log_score),
  logCount: num(row.log_count) ?? 0,
  lastTastedAt: toIso(row.last_at),
});

const tastedItems = async (
  db: DbOrTx,
  viewer: string,
  type: ItemType,
  exclude: readonly string[],
): Promise<SectionRow[]> => {
  const { rows } = await db.execute<TastedSqlRow>(sql`
    with r as (
      select distinct on (${REVIEWS.column(type, "r")})
             ${REVIEWS.column(type, "r")} as entry_id,
             r.score::float8 as score,
             r.updated_at as at
      from public.item_reviews r
      where r.user_id = ${viewer}::uuid and ${REVIEWS.isSet(type, "r")}
      order by ${REVIEWS.column(type, "r")}, r.updated_at desc
    ),
    l as (
      select ${LOGS.column(type, "l")} as entry_id,
             count(*)::int as log_count,
             max(l.created_at) as at,
             (array_agg(l.score::float8 order by l.created_at desc)
                filter (where l.score is not null))[1] as log_score
      from public.check_ins l
      where l.user_id = ${viewer}::uuid and ${LOGS.isSet(type, "l")}
      group by ${LOGS.column(type, "l")}
    )
    select coalesce(r.entry_id, l.entry_id)::text as entry_id,
           r.score as review_score,
           l.log_score as log_score,
           coalesce(l.log_count, 0)::int as log_count,
           greatest(r.at, l.at) as last_at
    from r full join l on l.entry_id = r.entry_id
    where ${notAmong(sql`coalesce(r.entry_id, l.entry_id)`, exclude)}
    order by greatest(r.at, l.at) desc nulls last, 1
    limit ${SUGGESTIONS_PER_SECTION}
  `);
  return rows.map(tastedRow);
};

const tastedPlaces = async (
  db: DbOrTx,
  viewer: string,
  exclude: readonly string[],
): Promise<SectionRow[]> => {
  const { rows } = await db.execute<TastedSqlRow>(sql`
    with i as (
      select upi.place_id as entry_id,
             upi.rating::float8 as score,
             coalesce(upi.last_visited_at, upi.updated_at) as at
      from public.user_place_interactions upi
      where upi.user_id = ${viewer}::uuid
        and (upi.is_visited or upi.rating is not null)
    ),
    l as (
      select l.place_id as entry_id,
             count(*)::int as log_count,
             max(l.created_at) as at
      from public.check_ins l
      where l.user_id = ${viewer}::uuid and l.place_id is not null
      group by l.place_id
    )
    select coalesce(i.entry_id, l.entry_id)::text as entry_id,
           i.score as review_score,
           null::float8 as log_score,
           coalesce(l.log_count, 0)::int as log_count,
           greatest(i.at, l.at) as last_at
    from i full join l on l.entry_id = i.entry_id
    where ${notAmong(sql`coalesce(i.entry_id, l.entry_id)`, exclude)}
      and ${placeRefVisibleToSql(viewer, sql`coalesce(i.entry_id, l.entry_id)`)}
    order by greatest(i.at, l.at) desc nulls last, 1
    limit ${SUGGESTIONS_PER_SECTION}
  `);
  return rows.map(tastedRow);
};

/** The column a tier-list entry of `type` is held in, for the alias `ti`. */
const entryColumn = (type: TierListEntryType): SQL =>
  isItemType(type) ? ENTRIES.column(type, "ti") : sql`ti.place_id`;

/**
 * What friends ranked at `minBand` or above, best band first, then most
 * friends: one row per entry with the friend who ranked it highest (their
 * newest list on a tie).
 */
const friendsRanked = async (
  db: DbOrTx,
  scope: Extract<VisibilityScope, { kind: "viewer" }>,
  type: TierListEntryType,
  options: {
    readonly minBand: number;
    readonly exclude: readonly string[];
    readonly untried: boolean;
    readonly limit: number;
  },
): Promise<SectionRow[]> => {
  if (scope.friendIds.length === 0) return [];
  const column = entryColumn(type);
  const { rows } = await db.execute<{
    entry_id: string;
    best_band: number;
    friend_count: number;
    friend_id: string;
  }>(sql`
    select ${column}::text as entry_id,
           max(ti.band)::int as best_band,
           count(distinct t.created_by_id)::int as friend_count,
           (array_agg(t.created_by_id::text
              order by ti.band desc, t.content_updated_at desc))[1] as friend_id
    from public.tier_list_items ti
    join public.tier_lists t on t.id = ti.tier_list_id
    where ${column} is not null
      and ti.band >= ${options.minBand}
      and t.created_by_id = any(${uuidArray(scope.friendIds, "friend id")})
      and ${canSeeSql(scope, TIER_LIST_ROW)}
      and ${notAmong(column, options.exclude)}
      ${isItemType(type) ? sql`` : sql`and ${placeRefVisibleToSql(scope.viewer, column)}`}
      ${options.untried ? sql`and ${untriedBy(scope.viewer, type, column)}` : sql``}
    group by ${column}
    order by max(ti.band) desc, count(distinct t.created_by_id) desc, 1
    limit ${options.limit}
  `);
  return rows.map((row) => ({
    ...blank(row.entry_id),
    friendId: row.friend_id,
    friendBand: num(row.best_band),
    friendCount: num(row.friend_count),
  }));
};

/**
 * Your verdict on each of `ids` (newest review, else newest scored log; a
 * place: your rating), for rows a section found some other way.
 */
const scoresOf = async (
  db: DbOrTx,
  viewer: string,
  type: TierListEntryType,
  ids: readonly string[],
): Promise<Map<string, number>> => {
  if (ids.length === 0) return new Map();
  const list = uuidArray(ids, "entry id");
  const { rows } = await db.execute<{
    entry_id: string;
    review_score: number | string | null;
    log_score: number | string | null;
  }>(
    isItemType(type)
      ? sql`
        select e.id::text as entry_id,
          (select r.score::float8 from public.item_reviews r
            where r.user_id = ${viewer}::uuid and ${REVIEWS.column(type, "r")} = e.id
            order by r.updated_at desc limit 1) as review_score,
          (select l.score::float8 from public.check_ins l
            where l.user_id = ${viewer}::uuid and ${LOGS.column(type, "l")} = e.id
              and l.score is not null
            order by l.created_at desc limit 1) as log_score
        from unnest(${list}) as e(id)`
      : sql`
        select e.id::text as entry_id,
          (select upi.rating::float8 from public.user_place_interactions upi
            where upi.user_id = ${viewer}::uuid and upi.place_id = e.id) as review_score,
          null::float8 as log_score
        from unnest(${list}) as e(id)`,
  );
  const scores = new Map<string, number>();
  for (const row of rows) {
    const score = myScoreOf(num(row.review_score), num(row.log_score));
    if (score !== null) scores.set(row.entry_id, score);
  }
  return scores;
};

/**
 * Add entry's sections for a list of `type`, none of `onList` among them.
 * See `TierListSuggestionSection` for what each holds.
 */
export const addSuggestionsFor = async (
  db: DbOrTx,
  scope: Extract<VisibilityScope, { kind: "viewer" }>,
  type: TierListEntryType,
  onList: readonly string[],
): Promise<TierListSuggestionDto[]> => {
  const viewer = scope.viewer;
  // In turn, not `Promise.all`: inside a transaction `db` is one client, and
  // node-postgres refuses to run two queries on one client at once.
  const cellars = isItemType(type)
    ? await inCellars(db, viewer, type, onList)
    : [];
  const tasted = isItemType(type)
    ? await tastedItems(db, viewer, type, onList)
    : await tastedPlaces(db, viewer, onList);
  const friends = await friendsRanked(db, scope, type, {
    minBand: 1,
    exclude: onList,
    untried: false,
    limit: SUGGESTIONS_PER_SECTION,
  });
  const claimed = claimSections<SectionRow>([
    ["IN_CELLARS", cellars],
    ["TASTED", tasted],
    ["FRIENDS_RANKED", friends],
  ]);
  // TASTED rows carry their own scores; the others ask.
  const missing = claimed
    .filter(({ section }) => section !== "TASTED")
    .map(({ row }) => row.entryId);
  const scores = await scoresOf(db, viewer, type, missing);
  return claimed.map(({ section, row }) => ({
    section,
    entry: { type, id: row.entryId },
    myScore:
      section === "TASTED"
        ? myScoreOf(row.reviewScore, row.logScore)
        : (scores.get(row.entryId) ?? null),
    cellarName: row.cellarName,
    bottleCount: row.bottleCount,
    logCount: row.logCount,
    lastTastedAt: row.lastTastedAt,
    friendId: row.friendId,
    friendBand: row.friendBand,
    friendCount: row.friendCount,
  }));
};

/* -------------------------------------------------------------------------- */
/* Templates: a list started from your ratings                                 */
/* -------------------------------------------------------------------------- */

/** One entry of a list started from your ratings. */
export type RatedEntry = {
  readonly entry: TierListEntryRef;
  readonly score: number;
  readonly band: number;
};

/**
 * Everything of `type` you have rated, best first (score, then newest), at
 * most {@link MAX_BATCH_ADD}, each with the band `bandForScore` gives it.
 * Items: your newest review of each. Places: your rating, of a place you may
 * still see.
 */
export const ratedEntries = async (
  db: DbOrTx,
  viewer: string,
  type: TierListEntryType,
): Promise<RatedEntry[]> => {
  const { rows } = await db.execute<{
    entry_id: string;
    score: number | string;
  }>(
    isItemType(type)
      ? sql`
        select entry_id::text as entry_id, score from (
          select distinct on (${REVIEWS.column(type, "r")})
                 ${REVIEWS.column(type, "r")} as entry_id,
                 r.score::float8 as score,
                 r.updated_at as at
          from public.item_reviews r
          where r.user_id = ${viewer}::uuid and ${REVIEWS.isSet(type, "r")}
          order by ${REVIEWS.column(type, "r")}, r.updated_at desc
        ) newest
        order by score desc, at desc, entry_id
        limit ${MAX_BATCH_ADD}`
      : sql`
        select upi.place_id::text as entry_id, upi.rating::float8 as score
        from public.user_place_interactions upi
        where upi.user_id = ${viewer}::uuid and upi.rating is not null
          and ${placeRefVisibleToSql(viewer, sql`upi.place_id`)}
        order by upi.rating desc, upi.updated_at desc nulls last, upi.place_id
        limit ${MAX_BATCH_ADD}`,
  );
  return rows.flatMap((row) => {
    const score = num(row.score);
    return score === null
      ? []
      : [
          {
            entry: { type, id: row.entry_id },
            score,
            band: bandForScore(score),
          },
        ];
  });
};

/** How many of each type you have rated (see `TierListTemplateDto`). */
export const ratedCounts = async (
  db: DbOrTx,
  viewer: string,
): Promise<TierListTemplateDto[]> => {
  const arms = ITEM_TYPES.map(
    (type) => sql`
      select ${type}::text as entry_type,
             count(distinct ${REVIEWS.column(type, "r")})::int as rated
      from public.item_reviews r
      where r.user_id = ${viewer}::uuid and ${REVIEWS.isSet(type, "r")}`,
  );
  const { rows } = await db.execute<{ entry_type: string; rated: number }>(sql`
    ${sql.join(arms, sql` union all `)}
    union all
    select 'PLACE'::text as entry_type, count(*)::int as rated
    from public.user_place_interactions upi
    where upi.user_id = ${viewer}::uuid and upi.rating is not null
      and ${placeRefVisibleToSql(viewer, sql`upi.place_id`)}
  `);
  const counts = new Map(rows.map((row) => [row.entry_type, num(row.rated)]));
  return TIER_LIST_ENTRY_TYPES.map((entryType) => ({
    entryType,
    listType: listTypeOfEntryType(entryType),
    ratedCount: counts.get(entryType) ?? 0,
  }));
};

/* -------------------------------------------------------------------------- */
/* Try this next                                                               */
/* -------------------------------------------------------------------------- */

/** A list entry, as the seed reads need it. */
export type ListEntry = {
  readonly entry: TierListEntryRef;
  readonly band: number;
  readonly position: number;
};

type Seed = {
  readonly id: string;
  readonly kind: "LIKE_TOP" | "LIKE_LOVED";
  readonly band: number | null;
};

/** This list's top-band entries, best first, then your newest loves. */
const seedsFor = async (
  db: DbOrTx,
  viewer: string,
  type: ItemType,
  entries: readonly ListEntry[],
): Promise<Seed[]> => {
  const tops: Seed[] = entries
    .filter((row) => row.entry.type === type && row.band >= SEED_MIN_BAND)
    .slice()
    .sort((a, b) => b.band - a.band || a.position - b.position)
    .slice(0, MAX_SEEDS_PER_KIND)
    .map((row) => ({ id: row.entry.id, kind: "LIKE_TOP", band: row.band }));
  const { rows } = await db.execute<{ entry_id: string }>(sql`
    select ${FAVORITES.column(type, "f")}::text as entry_id
    from public.item_favorites f
    where f.user_id = ${viewer}::uuid and ${FAVORITES.isSet(type, "f")}
    order by f.created_at desc
    limit ${MAX_SEEDS_PER_KIND * 2}
  `);
  const topIds = new Set(tops.map((seed) => seed.id));
  const loves: Seed[] = rows
    .filter((row) => !topIds.has(row.entry_id))
    .slice(0, MAX_SEEDS_PER_KIND)
    .map((row) => ({ id: row.entry_id, kind: "LIKE_LOVED", band: null }));
  return [...tops, ...loves];
};

/** Both arms of N08's retrieval for every seed, in one read-only turn. */
const neighboursOf = async (
  db: DbOrTx,
  viewer: string,
  type: ItemType,
  seeds: readonly Seed[],
  onList: readonly string[],
): Promise<SeedNeighbours[]> => {
  if (seeds.length === 0) return [];
  const seedList = uuidArray(
    seeds.map((seed) => seed.id),
    "seed id",
  );
  const table = ITEM_TABLES[type];
  const keep = (id: SQL) =>
    sql`${notAmong(id, onList)} and ${untriedBy(viewer, type, id)}`;
  const { vectorRows, nameRows } = await withHnswScan(db, async (tx) => {
    // `ORDER BY v.vector <=> sv.vector LIMIT k` per seed is the shape the
    // HNSW index serves (`./hnsw.ts`); the cutoff and the "untried" filter
    // apply to those k after, as `ItemSearchActor` does.
    const { rows: vectorRows } = await tx.execute<{
      seed_id: string;
      entry_id: string;
    }>(sql`
      select s.seed_id::text as seed_id, n.entry_id::text as entry_id
      from unnest(${seedList}) with ordinality as s(seed_id, ord)
      join public.item_vectors sv
        on ${VECTORS.column(type, "sv")} = s.seed_id and sv.vector is not null
      cross join lateral (
        select ${VECTORS.column(type, "v")} as entry_id,
               (v.vector <=> sv.vector)::float8 as distance
        from public.item_vectors v
        where v.vector is not null and ${VECTORS.isSet(type, "v")}
          and v.embedding_model is not distinct from sv.embedding_model
          and ${VECTORS.column(type, "v")} <> s.seed_id
        order by v.vector <=> sv.vector
        limit ${NEIGHBOURS_PER_SEED}
      ) n
      where n.distance <= ${SIMILAR_MAX_DISTANCE}
        and ${keep(sql`n.entry_id`)}
      order by s.ord, n.distance, 2
    `);
    await tx.execute(sql`
      select set_config('pg_trgm.strict_word_similarity_threshold',
                        ${String(SIMILAR_NAME_THRESHOLD)}, true)
    `);
    const { rows: nameRows } = await tx.execute<{
      seed_id: string;
      entry_id: string;
    }>(sql`
      select s.seed_id::text as seed_id, n.entry_id::text as entry_id
      from unnest(${seedList}) with ordinality as s(seed_id, ord)
      join ${table} st on st.id = s.seed_id
      cross join lateral (
        select t.id as entry_id,
               strict_word_similarity(st.name, t.name)::float8 as score
        from ${table} t
        where st.name <<% t.name and t.id <> s.seed_id
        order by score desc, t.name, t.id
        limit ${NEIGHBOURS_PER_SEED}
      ) n
      where ${keep(sql`n.entry_id`)}
      order by s.ord, n.score desc, 2
    `);
    return { vectorRows, nameRows };
  });
  const group = (rows: readonly { seed_id: string; entry_id: string }[]) => {
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const list = map.get(row.seed_id) ?? [];
      list.push(row.entry_id);
      map.set(row.seed_id, list);
    }
    return map;
  };
  const byVector = group(vectorRows);
  const byName = group(nameRows);
  return seeds.map((seed) => ({
    seedId: seed.id,
    byVector: byVector.get(seed.id) ?? [],
    byName: byName.get(seed.id) ?? [],
  }));
};

/**
 * "Try this next" for the viewer, on a list of `type` holding `entries`.
 * See `TryNextReason` for what qualifies; empty when nothing does.
 */
export const tryNextFor = async (
  db: DbOrTx,
  scope: Extract<VisibilityScope, { kind: "viewer" }>,
  type: TierListEntryType,
  entries: readonly ListEntry[],
  limit: number = TRY_NEXT_LIMIT,
): Promise<TierListTryNextDto[]> => {
  const viewer = scope.viewer;
  const onList = entries
    .filter((row) => row.entry.type === type)
    .map((row) => row.entry.id);

  const friendRows = await friendsRanked(db, scope, type, {
    minBand: FRIEND_PICK_MIN_BAND,
    exclude: onList,
    untried: true,
    limit,
  });
  const friendPicks: TierListTryNextDto[] = friendRows.map((row) => ({
    reason: "FRIEND_RANKED",
    entry: { type, id: row.entryId },
    friendId: row.friendId,
    friendBand: row.friendBand,
    friendCount: row.friendCount,
    likeName: null,
    likeBand: null,
  }));

  if (!isItemType(type)) return friendPicks.slice(0, limit);

  const seeds = await seedsFor(db, viewer, type, entries);
  const neighbours = await neighboursOf(db, viewer, type, seeds, onList);
  const picks = pickSimilar(
    neighbours,
    new Set([...seeds.map((seed) => seed.id), ...onList]),
    limit,
  );
  const seedById = new Map(seeds.map((seed) => [seed.id, seed]));
  const names = await resolveTierListEntries(
    db,
    [...new Set(picks.map((pick) => pick.seedId))].map((id) => ({ type, id })),
  );
  const similarPicks: TierListTryNextDto[] = picks.flatMap((pick) => {
    const seed = seedById.get(pick.seedId);
    const name = names.get(entryKey({ type, id: pick.seedId }))?.name ?? null;
    // A seed whose name cannot be read cannot be named as the reason, and a
    // card that says "like something" explains nothing: dropped.
    if (seed === undefined || name === null) return [];
    return [
      {
        reason: seed.kind,
        entry: { type, id: pick.entryId },
        friendId: null,
        friendBand: null,
        friendCount: null,
        likeName: name,
        likeBand: seed.band,
      },
    ];
  });
  return interleave(friendPicks, similarPicks, limit);
};

/** For a caller holding a ctx: the viewer's scope, or `null` when anonymous. */
export const viewerScopeOf = (
  scope: VisibilityScope,
): Extract<VisibilityScope, { kind: "viewer" }> | null =>
  scope.kind === "viewer" ? scope : null;
