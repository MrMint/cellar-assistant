/**
 * A shared tier list's entries, laid out the way the board reads: bands
 * Outstanding → Bad with Unrated last, each in its own order, and one global
 * rank (#1, #2 …) over the rated bands. The rank is derived, never stored
 * (`band desc, position asc` — the tier-list model).
 */

export type BandEntry = {
  readonly band: number;
  readonly position: number;
};

export type RankedEntry<T extends BandEntry> = T & {
  /** 1-based over every rated entry; `null` for Unrated (band 0). */
  readonly rank: number | null;
};

export type BandGroup<T extends BandEntry> = {
  readonly band: number;
  readonly entries: readonly RankedEntry<T>[];
};

const BAND_ORDER = [5, 4, 3, 2, 1, 0] as const;

export const groupByBand = <T extends BandEntry>(
  entries: readonly T[],
): BandGroup<T>[] => {
  const sorted = [...entries].sort(
    (a, b) => b.band - a.band || a.position - b.position,
  );
  let rank = 0;
  const ranked = sorted.map((entry) => ({
    ...entry,
    rank: entry.band > 0 ? ++rank : null,
  }));
  return BAND_ORDER.map((band) => ({
    band,
    entries: ranked.filter((entry) => entry.band === band),
  })).filter((group) => group.entries.length > 0);
};

/** The first `count` rated entries, best first — what a preview card shows. */
export const topEntries = <T extends BandEntry>(
  entries: readonly T[],
  count: number,
): RankedEntry<T>[] =>
  groupByBand(entries)
    .flatMap((group) => group.entries)
    .filter((entry) => entry.rank !== null)
    .slice(0, count);
