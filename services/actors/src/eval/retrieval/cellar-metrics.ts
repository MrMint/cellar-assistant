/**
 * X04's in-cellar search, scored: a narrowed list is judged on what it
 * **keeps**, not on how it ranks. Pure and unit-tested
 * (`cellar-metrics.test.ts`), as `metrics.ts` is for N05's ranked search.
 *
 * Per query, with `kept` the narrowed list and `relevant` the labelled set:
 *
 *  - **hit** — at least one right bottle is kept (the search "found it");
 *  - **recall** — the share of the right bottles kept;
 *  - **precision** — the share of kept bottles that are right (0 when the
 *    list is empty);
 *  - **extra** — how many wrong bottles came along;
 *  - **F1** — the harmonic mean of the two.
 *
 * Precision is a floor for the descriptive (`semantic`) queries: their
 * labelled sets are what a sommelier would name, and a bottle the list keeps
 * that the label missed counts against it.
 */

export type NarrowedQuery = {
  readonly id: string;
  readonly kind: string;
  readonly relevant: readonly string[];
  readonly kept: readonly string[];
};

export type NarrowingSummary = {
  readonly queries: number;
  readonly hitRate: number;
  readonly recall: number;
  readonly precision: number;
  readonly f1: number;
  /** Mean wrong bottles per query. */
  readonly extra: number;
  /** Queries whose list came back empty. */
  readonly empty: number;
  /** Queries that kept no right bottle. */
  readonly misses: readonly string[];
};

const mean = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

export const scoreNarrowed = (
  query: NarrowedQuery,
): {
  hit: boolean;
  recall: number;
  precision: number;
  f1: number;
  extra: number;
} => {
  const relevant = new Set(query.relevant);
  const right = query.kept.filter((key) => relevant.has(key)).length;
  const recall = relevant.size === 0 ? 1 : right / relevant.size;
  const precision = query.kept.length === 0 ? 0 : right / query.kept.length;
  const f1 =
    recall + precision === 0
      ? 0
      : (2 * recall * precision) / (recall + precision);
  return {
    hit: right > 0,
    recall,
    precision,
    f1,
    extra: query.kept.length - right,
  };
};

export const summariseNarrowing = (
  queries: readonly NarrowedQuery[],
): NarrowingSummary => {
  const scored = queries.map((query) => ({ query, ...scoreNarrowed(query) }));
  return {
    queries: queries.length,
    hitRate: mean(scored.map((entry) => (entry.hit ? 1 : 0))),
    recall: mean(scored.map((entry) => entry.recall)),
    precision: mean(scored.map((entry) => entry.precision)),
    f1: mean(scored.map((entry) => entry.f1)),
    extra: mean(scored.map((entry) => entry.extra)),
    empty: scored.filter((entry) => entry.query.kept.length === 0).length,
    misses: scored.filter((entry) => !entry.hit).map((entry) => entry.query.id),
  };
};
