/**
 * X04 — searching inside one cellar **narrows** rather than re-sorts.
 *
 * `CellarActor.items(semanticQuery:)` orders every bottle by distance, so a
 * search for "lagavulin" in a cellar of forty bottles still shows forty, with
 * the Lagavulin first and thirty-nine irrelevant ones under it. A cellar is a
 * shelf you know, not a catalog you are browsing: what you want back is the
 * bottles that answer the phrase, and nothing else. So a search page holds
 *
 *  1. **name matches** — the item's name matches the phrase by pg_trgm's
 *     `strict_word_similarity` at the N08 lexical threshold (typos included:
 *     "laphroig" still finds Laphroaig), best match first; then
 *  2. **meaning matches** — items whose name does not match but whose vector
 *     is within {@link CELLAR_SEARCH_MAX_DISTANCE} of the phrase's, nearest
 *     first, and no further than {@link CELLAR_SEARCH_RELATIVE_SPREAD} behind
 *     the nearest one; and
 *  3. nothing else.
 *
 * Both cutoffs were tuned on the N05 eval set (`eval/retrieval`,
 * `cellar-search-eval.live.test.ts`, where the numbers and the sweep live):
 * every catalog item in one cellar, each of the 49 labelled queries asked of
 * it, scored on how many right bottles the narrowed list keeps and how many
 * wrong ones it lets through.
 *
 * Pure apart from {@link nameScores}, which is one SQL read, so the ordering
 * and the cutoff rule are unit-tested without a database.
 */
import type { ItemRef, ItemType } from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import type { DbOrTx } from "./db.ts";
import { ITEM_TABLES } from "./item-bindings.ts";

/**
 * The name arm's bar: `strict_word_similarity(phrase, name)` at or above
 * this is a name match. The same value as `ItemSearchActor`'s
 * `LEXICAL_THRESHOLD` (pg_trgm's own default) — high enough that "smoky islay
 * scotch" matches no name, low enough that a one-word typo still does.
 */
export const CELLAR_NAME_THRESHOLD = 0.5;

/**
 * The meaning arm's absolute cutoff: a cosine distance (0–2) between the
 * phrase's `RETRIEVAL_QUERY` embedding and the item's stored vector. Tuned on
 * N05 with `ollama:nomic-embed-text@768` (the sweep is in
 * `eval/retrieval/README.md`, "In-cellar search").
 *
 * **Model-specific.** Distances are not comparable across embedding models; a
 * deployment on another model (Gemini's `gemini-embedding`) needs its own run
 * of the eval before this number means the same thing there.
 */
export const CELLAR_SEARCH_MAX_DISTANCE = 0.36;

/**
 * The meaning arm's relative cutoff: a meaning match must also be within this
 * much of the nearest item. A descriptive phrase ("something smoky") lands
 * near a few bottles and far from the rest; without it, a cellar of similar
 * bottles (all whisky) would come back whole.
 */
export const CELLAR_SEARCH_RELATIVE_SPREAD = 0.06;

export type NameScore = {
  /** `strict_word_similarity(phrase, name)`, 0–1. */
  readonly lexical: number;
  /** `similarity(phrase, name)`, 0–1 — prefers the name that *is* the phrase. */
  readonly whole: number;
  readonly name: string;
};

/** One bottle as the narrowing sees it. */
export type SearchCandidate<T> = {
  readonly value: T;
  /** The catalog item's id — what `scores` and `distances` are keyed by. */
  readonly itemId: string;
  /** Tie-break of last resort, so an offset page is stable. */
  readonly id: string;
};

export type SearchMatch<T> = {
  readonly value: T;
  readonly match: "NAME" | "MEANING";
  readonly distance: number | null;
};

export type NarrowOptions = {
  readonly maxDistance?: number;
  readonly relativeSpread?: number;
  readonly nameThreshold?: number;
};

const byText = (a: string | undefined, b: string | undefined): number => {
  if (a === undefined || b === undefined) {
    return a === b ? 0 : a === undefined ? 1 : -1;
  }
  return a.localeCompare(b, "en", { sensitivity: "base" });
};

/**
 * The narrowing itself. `distances` may be `null` — the phrase could not be
 * embedded — and then the page is name matches alone.
 */
export const narrowCandidates = <T>(
  candidates: readonly SearchCandidate<T>[],
  scores: ReadonlyMap<string, NameScore>,
  distances: ReadonlyMap<string, number> | null,
  options: NarrowOptions = {},
): SearchMatch<T>[] => {
  const threshold = options.nameThreshold ?? CELLAR_NAME_THRESHOLD;
  const maxDistance = options.maxDistance ?? CELLAR_SEARCH_MAX_DISTANCE;
  const spread = options.relativeSpread ?? CELLAR_SEARCH_RELATIVE_SPREAD;

  const distanceOf = (candidate: SearchCandidate<T>): number | null =>
    distances?.get(candidate.itemId) ?? null;
  const isName = (candidate: SearchCandidate<T>): boolean =>
    (scores.get(candidate.itemId)?.lexical ?? 0) >= threshold;

  const named = candidates.filter(isName);
  const rest = candidates.filter((candidate) => !isName(candidate));

  // Best name first: the mean of word and whole-string similarity (N08's
  // lexical rank), so "Duvel" beats "Duvel Tripel Hop" for "duvel"; then the
  // vector, then the name, then the row.
  const rank = (candidate: SearchCandidate<T>): number => {
    const score = scores.get(candidate.itemId);
    return score === undefined ? 0 : (score.lexical + score.whole) / 2;
  };
  named.sort(
    (a, b) =>
      rank(b) - rank(a) ||
      (distanceOf(a) ?? Number.POSITIVE_INFINITY) -
        (distanceOf(b) ?? Number.POSITIVE_INFINITY) ||
      byText(scores.get(a.itemId)?.name, scores.get(b.itemId)?.name) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const near = rest
    .map((candidate) => ({ candidate, distance: distanceOf(candidate) }))
    .filter(
      (entry): entry is { candidate: SearchCandidate<T>; distance: number } =>
        entry.distance !== null && entry.distance <= maxDistance,
    )
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        byText(
          scores.get(a.candidate.itemId)?.name,
          scores.get(b.candidate.itemId)?.name,
        ) ||
        (a.candidate.id < b.candidate.id
          ? -1
          : a.candidate.id > b.candidate.id
            ? 1
            : 0),
    );
  // The nearest of *either* arm anchors the spread: when the name already
  // found the bottle, a meaning match has to be about as close as it.
  const nearestNamed = named
    .map(distanceOf)
    .filter((distance): distance is number => distance !== null);
  const anchor = Math.min(
    near[0]?.distance ?? Number.POSITIVE_INFINITY,
    ...nearestNamed,
  );
  const meaning = near.filter((entry) => entry.distance <= anchor + spread);

  return [
    ...named.map((candidate) => ({
      value: candidate.value,
      match: "NAME" as const,
      distance: distanceOf(candidate),
    })),
    ...meaning.map((entry) => ({
      value: entry.candidate.value,
      match: "MEANING" as const,
      distance: entry.distance,
    })),
  ];
};

/**
 * Each ref's name and how well `phrase` matches it, by item id: one select
 * per item type present, over the ids given only (a cellar's bottles), so the
 * trigram work is the cellar's size, not the catalog's.
 */
export const nameScores = async (
  db: DbOrTx,
  refs: readonly ItemRef[],
  phrase: string,
): Promise<Map<string, NameScore>> => {
  const byType = new Map<ItemType, Set<string>>();
  for (const ref of refs) {
    const ids = byType.get(ref.type) ?? new Set<string>();
    ids.add(ref.id);
    byType.set(ref.type, ids);
  }
  const results = await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      const table = ITEM_TABLES[type];
      const { rows } = await db.execute<{
        id: string;
        name: string;
        lexical: number | string;
        whole: number | string;
      }>(sql`
        select ${table.id}::text as id, ${table.name} as name,
               strict_word_similarity(${phrase}, ${table.name})::float8 as lexical,
               similarity(${phrase}, ${table.name})::float8 as whole
        from ${table}
        where ${table.id} in (${sql.join(
          [...ids].map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      `);
      return rows;
    }),
  );
  const scores = new Map<string, NameScore>();
  for (const rows of results) {
    for (const row of rows) {
      scores.set(row.id, {
        name: row.name,
        lexical: Number(row.lexical),
        whole: Number(row.whole),
      });
    }
  }
  return scores;
};

/* -------------------------------------------------------------------------- */
/* Grouping                                                                    */
/* -------------------------------------------------------------------------- */

export type Grouped<T> = {
  readonly lead: T;
  readonly members: readonly T[];
};

/**
 * X04's ×N: identical bottles (one catalog item) as one entry, in the order
 * the list already has — a group sits where its best-placed bottle sat, and
 * that bottle leads it. With `group: false` every bottle is its own entry.
 */
export const groupInOrder = <T>(
  list: readonly T[],
  keyOf: (value: T) => string,
  group = true,
): Grouped<T>[] => {
  if (!group) return list.map((value) => ({ lead: value, members: [value] }));
  const order: string[] = [];
  const members = new Map<string, T[]>();
  for (const value of list) {
    const key = keyOf(value);
    const existing = members.get(key);
    if (existing === undefined) {
      order.push(key);
      members.set(key, [value]);
    } else {
      existing.push(value);
    }
  }
  return order.flatMap((key) => {
    const all = members.get(key) ?? [];
    const [lead] = all;
    return lead === undefined ? [] : [{ lead, members: all }];
  });
};

/* -------------------------------------------------------------------------- */
/* The dashboard's calendar                                                    */
/* -------------------------------------------------------------------------- */

/** `zone` if the runtime knows it, else `UTC`. */
export const resolveTimeZone = (zone: string | null | undefined): string => {
  if (zone === null || zone === undefined || zone.trim() === "") return "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
    }).resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
};

/** `YYYY-MM` of `at` in `zone`. */
export const monthKey = (at: Date, zone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(at);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
};

/** The `count` months ending with `current` (`YYYY-MM`), oldest first. */
export const monthsEndingAt = (current: string, count: number): string[] => {
  const [yearText, monthText] = current.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const out: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const index = year * 12 + (month - 1) - back;
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    out.push(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`);
  }
  return out;
};

/** How many of `instants` fall in each of `months` (`YYYY-MM`) in `zone`. */
export const countByMonth = (
  instants: readonly Date[],
  months: readonly string[],
  zone: string,
): number[] => {
  const index = new Map(months.map((month, at) => [month, at]));
  const counts = months.map(() => 0);
  for (const instant of instants) {
    const at = index.get(monthKey(instant, zone));
    if (at !== undefined) counts[at] = (counts[at] ?? 0) + 1;
  }
  return counts;
};
