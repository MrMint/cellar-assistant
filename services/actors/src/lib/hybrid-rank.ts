/**
 * Reciprocal rank fusion (N08): one ranking out of several, by rank alone.
 *
 * `ItemSearchActor` ranks a phrase two ways — by cosine distance to its
 * embedding, and by trigram similarity to item names — and the two scores
 * are not on one scale: a cosine distance of 0.3 and a `word_similarity` of
 * 0.8 cannot be added or compared. RRF sidesteps calibration entirely: each
 * list contributes `weight / (k + rank)` for every item it holds, and the
 * item's fused score is the sum. An item both lists rank highly beats one
 * only a single list likes; an item only one list knows still competes.
 *
 * `k = 60` is the constant from Cormack, Clarke & Büttcher (2009), the
 * usual default: large enough that the difference between rank 1 and rank 2
 * in one list does not swamp agreement between lists.
 *
 * Pure, so the ordering claim is unit-tested (`hybrid-rank.test.ts`) apart
 * from any SQL.
 */

export const RRF_K = 60;

export type RankedList<T> = {
  /** Best first. An item listed twice in one list counts at its first rank. */
  readonly items: readonly T[];
  /**
   * Each item's 1-based rank, parallel to `items`, when some share one
   * ({@link tiedRanks}). Absent means the position is the rank.
   */
  readonly ranks?: readonly number[];
  /** Multiplies this list's contribution. 1 unless a list is trusted less. */
  readonly weight?: number;
};

/**
 * Ranks for a list sorted best-first by `score`, where an item scoring within
 * `tolerance` of the best item of its group shares that group's rank
 * (standard competition ranking: 1, 1, 3). A difference smaller than the
 * tolerance is noise, and ranking on it would let noise outvote the other
 * list: "jameson" is a whole word of both "Jameson Irish Whiskey" and
 * "Jameson Black Barrel", and the 0.02 of whole-string similarity between
 * them says nothing about which one a menu means.
 */
export const tiedRanks = (
  scores: readonly number[],
  tolerance: number,
): number[] => {
  const ranks: number[] = [];
  let groupScore = Number.NaN;
  let groupRank = 0;
  scores.forEach((score, index) => {
    if (index === 0 || !(groupScore - score < tolerance)) {
      groupScore = score;
      groupRank = index + 1;
    }
    ranks.push(groupRank);
  });
  return ranks;
};

export type Fused<T> = {
  readonly key: string;
  readonly score: number;
  /** The 1-based rank in each input list, `null` where it is absent. */
  readonly ranks: readonly (number | null)[];
  /** The item as each list carried it, `undefined` where it is absent. */
  readonly entries: readonly (T | undefined)[];
};

/**
 * Fuses `lists` into one, best first. Ties in score — two items each only in
 * one list at the same rank, say — are left in first-seen order (list order,
 * then rank); a caller that pages by offset must break them itself, as
 * `ItemSearchActor` does with distance, name and id.
 */
export const reciprocalRankFusion = <T>(
  lists: readonly RankedList<T>[],
  keyOf: (item: T) => string,
  k: number = RRF_K,
): Fused<T>[] => {
  if (!Number.isFinite(k) || k < 0) {
    throw new Error(`RRF k must be a non-negative number, got ${k}`);
  }
  const fused = new Map<
    string,
    { score: number; ranks: (number | null)[]; entries: (T | undefined)[] }
  >();
  lists.forEach((list, listIndex) => {
    const weight = list.weight ?? 1;
    const seen = new Set<string>();
    let position = 0;
    for (const [index, item] of list.items.entries()) {
      const key = keyOf(item);
      if (seen.has(key)) continue;
      seen.add(key);
      position += 1;
      const rank = list.ranks?.[index] ?? position;
      let entry = fused.get(key);
      if (entry === undefined) {
        entry = {
          score: 0,
          ranks: lists.map(() => null),
          entries: lists.map(() => undefined),
        };
        fused.set(key, entry);
      }
      entry.score += weight / (k + rank);
      entry.ranks[listIndex] = rank;
      entry.entries[listIndex] = item;
    }
  });
  return [...fused.entries()]
    .map(([key, entry]) => ({ key, ...entry }))
    .sort((a, b) => b.score - a.score);
};
