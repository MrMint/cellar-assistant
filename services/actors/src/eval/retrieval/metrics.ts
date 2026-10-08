/**
 * The numbers the retrieval eval (roadmap N05) reports — pure, so they are
 * unit-tested without a database or a model (`metrics.test.ts`).
 *
 * Two families:
 *
 *  - **search** — one ranked list of fixture keys per query, scored against
 *    the query's set of relevant keys: `hit@k` (any relevant key in the top
 *    k), `recall@k` (the share of relevant keys in the top k) and the
 *    reciprocal rank of the first relevant key (averaged into MRR);
 *  - **menu matching** — one outcome per menu line, from what
 *    `MenuMatchJobActor` offered and recorded for it. A line either names an
 *    item in the catalog (`expected`) or deliberately does not (`null`, e.g.
 *    "House Red"), and the two are scored separately: a matcher that
 *    suggests *something* for every line looks perfect on the first kind and
 *    is exposed by the second.
 */

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

export type RankedQuery = {
  readonly id: string;
  /** The keys the search returned, best first. */
  readonly ranked: readonly string[];
  /** The keys a correct answer contains. Never empty. */
  readonly relevant: readonly string[];
};

/** 1 when any relevant key is in the top `k`, else 0. */
export const hitAt = (query: RankedQuery, k: number): number =>
  query.ranked.slice(0, k).some((key) => query.relevant.includes(key)) ? 1 : 0;

/**
 * The share of the relevant keys found in the top `k`. Capped by `k`: with
 * three relevant keys and `k = 1`, finding one of them is a perfect 1.0 —
 * otherwise recall@1 could never reach 1 for a multi-answer query and would
 * read as a failure of the search rather than of the metric.
 */
export const recallAt = (query: RankedQuery, k: number): number => {
  const relevant = new Set(query.relevant);
  if (relevant.size === 0) {
    throw new Error(`query ${query.id} has no relevant keys`);
  }
  const found = new Set(
    query.ranked.slice(0, k).filter((key) => relevant.has(key)),
  ).size;
  return found / Math.min(relevant.size, k);
};

/** 1 / rank of the first relevant key (1-based), 0 when none was returned. */
export const reciprocalRank = (query: RankedQuery): number => {
  const index = query.ranked.findIndex((key) => query.relevant.includes(key));
  return index === -1 ? 0 : 1 / (index + 1);
};

export type SearchSummary = {
  readonly queries: number;
  readonly hitAt1: number;
  readonly hitAt3: number;
  readonly hitAt10: number;
  readonly recallAt3: number;
  readonly recallAt10: number;
  readonly mrr: number;
  /** Every query that missed in the top 3 — the ones worth reading. */
  readonly missesAt3: readonly string[];
};

const mean = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

export const summariseSearch = (
  queries: readonly RankedQuery[],
): SearchSummary => ({
  queries: queries.length,
  hitAt1: mean(queries.map((q) => hitAt(q, 1))),
  hitAt3: mean(queries.map((q) => hitAt(q, 3))),
  hitAt10: mean(queries.map((q) => hitAt(q, 10))),
  recallAt3: mean(queries.map((q) => recallAt(q, 3))),
  recallAt10: mean(queries.map((q) => recallAt(q, 10))),
  mrr: mean(queries.map(reciprocalRank)),
  missesAt3: queries.filter((q) => hitAt(q, 3) === 0).map((q) => q.id),
});

/* -------------------------------------------------------------------------- */
/* Menu matching                                                               */
/* -------------------------------------------------------------------------- */

export type MenuLineOutcome = {
  readonly id: string;
  /** The catalog key this line is, or `null` for a line that is not in it. */
  readonly expected: string | null;
  /** The candidates the job considered for the line, best first (≤ 3). */
  readonly candidates: readonly string[];
  /**
   * What the job recorded, best first: the auto band's suggestions, or the
   * one the verifier accepted.
   */
  readonly suggested: readonly string[];
  /** Whether the suggestion came from the auto band (no verifier). */
  readonly auto: boolean;
};

export type MenuSummary = {
  readonly lines: number;
  readonly inCatalog: number;
  readonly notInCatalog: number;
  /**
   * In-catalog lines whose **top** suggestion is the expected item — the
   * share a user would see matched correctly. With the eval's stand-in
   * verifier (accept the first candidate offered) this is the ordering's
   * score, not a model's.
   */
  readonly matchRate: number;
  /**
   * In-catalog lines whose expected item was among the candidates offered at
   * all — the ceiling for any verifier, since it can only pick from these.
   */
  readonly candidateRecall: number;
  /** Lines that got an auto-band suggestion, and the share of those right. */
  readonly autoSuggested: number;
  readonly autoPrecision: number;
  /**
   * Not-in-catalog lines that got no candidate at all — rejected by retrieval
   * alone, before a verifier is asked.
   */
  readonly correctRejections: number;
  /** Not-in-catalog lines that were auto-suggested: the worst outcome. */
  readonly falseAutoMatches: number;
  /**
   * Not-in-catalog lines that got any suggestion. Always all of them under
   * the stand-in verifier, which accepts whatever it is offered; meaningful
   * with `RETRIEVAL_EVAL_VERIFIER=model`, where it is the verifier's misses.
   */
  readonly falseSuggestions: number;
  /** In-catalog lines whose top suggestion was wrong or missing. */
  readonly misses: readonly string[];
};

const share = (part: number, whole: number): number =>
  whole === 0 ? 0 : part / whole;

export const summariseMenus = (
  lines: readonly MenuLineOutcome[],
): MenuSummary => {
  const known = lines.filter((line) => line.expected !== null);
  const unknown = lines.filter((line) => line.expected === null);
  const matched = known.filter((line) => line.suggested[0] === line.expected);
  const offered = known.filter(
    (line) => line.expected !== null && line.candidates.includes(line.expected),
  );
  const auto = lines.filter((line) => line.auto && line.suggested.length > 0);
  const autoRight = auto.filter(
    (line) => line.expected !== null && line.suggested[0] === line.expected,
  );
  return {
    lines: lines.length,
    inCatalog: known.length,
    notInCatalog: unknown.length,
    matchRate: share(matched.length, known.length),
    candidateRecall: share(offered.length, known.length),
    autoSuggested: auto.length,
    autoPrecision: share(autoRight.length, auto.length),
    correctRejections: share(
      unknown.filter((line) => line.candidates.length === 0).length,
      unknown.length,
    ),
    falseAutoMatches: unknown.filter(
      (line) => line.auto && line.suggested.length > 0,
    ).length,
    falseSuggestions: unknown.filter((line) => line.suggested.length > 0)
      .length,
    misses: known
      .filter((line) => line.suggested[0] !== line.expected)
      .map((line) => line.id),
  };
};

/* -------------------------------------------------------------------------- */
/* Comparing a run against a recorded baseline                                 */
/* -------------------------------------------------------------------------- */

/**
 * The metrics a run is held to, by name: higher is better for every one of
 * them. `falseAutoMatches` is compared the other way round and so is kept out
 * of these lists (see {@link regressions}).
 */
export const GUARDED_SEARCH_METRICS = [
  "hitAt1",
  "hitAt3",
  "recallAt10",
  "mrr",
] as const satisfies readonly (keyof SearchSummary)[];

export const GUARDED_MENU_METRICS = [
  "matchRate",
  "candidateRecall",
] as const satisfies readonly (keyof MenuSummary)[];

export type GuardedBaseline = {
  readonly search: Pick<SearchSummary, (typeof GUARDED_SEARCH_METRICS)[number]>;
  readonly menus: Pick<
    MenuSummary,
    (typeof GUARDED_MENU_METRICS)[number] | "falseAutoMatches"
  >;
};

/**
 * Every guarded metric that fell more than `tolerance` below the baseline,
 * plus any increase in false auto-matches, as human-readable lines. Empty
 * means the run is at least as good as the baseline.
 */
export const regressions = (
  baseline: GuardedBaseline,
  run: { readonly search: SearchSummary; readonly menus: MenuSummary },
  tolerance = 0.001,
): string[] => {
  const out: string[] = [];
  for (const metric of GUARDED_SEARCH_METRICS) {
    if (run.search[metric] < baseline.search[metric] - tolerance) {
      out.push(
        `search.${metric} ${run.search[metric].toFixed(3)} < baseline ` +
          baseline.search[metric].toFixed(3),
      );
    }
  }
  for (const metric of GUARDED_MENU_METRICS) {
    if (run.menus[metric] < baseline.menus[metric] - tolerance) {
      out.push(
        `menus.${metric} ${run.menus[metric].toFixed(3)} < baseline ` +
          baseline.menus[metric].toFixed(3),
      );
    }
  }
  if (run.menus.falseAutoMatches > baseline.menus.falseAutoMatches) {
    out.push(
      `menus.falseAutoMatches ${run.menus.falseAutoMatches} > baseline ` +
        String(baseline.menus.falseAutoMatches),
    );
  }
  return out;
};
