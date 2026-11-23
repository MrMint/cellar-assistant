/**
 * L09 pairwise placement, as plain data: where a new entry goes on a tier
 * list, found by asking "which do you like more?" a few times. No React and
 * no network here, so the rules are tested as data (`placement.test.ts`).
 *
 * The entry starts in the band its rating gives it (`bandForScore`, X23).
 * Within that band it is a binary search over the insertion slots `0..n`:
 * each answer halves what is left, so `n` entries take at most
 * `ceil(log2(n + 1))` questions. Then, only when it ended at the band's very
 * top or very bottom, one question against the neighbouring band's nearest
 * entry decides whether it crosses over. That is the whole budget:
 * `ceil(log2(n + 1)) + 1` at most, and nothing is stored but the band and
 * position it lands at — no second score.
 *
 * "About the same" ends it next to the entry it was compared with, just
 * below it. Skip ends it at the bottom of its band, as a plain add would.
 * Unrated (band 0) is not a quality tier, so it is nobody's neighbour.
 */

/** One entry already on the board. Position is within its band, 0 = top. */
export type PlacementEntry = {
  id: string;
  name: string;
  band: number;
  position: number;
};

/** NEW: the new entry is better. OLD: the one on the board is. */
export type PlacementAnswer = "NEW" | "OLD" | "SAME";

export type PlacementResult = {
  band: number;
  /** The index in `band` it is inserted at — M7's `position`. */
  position: number;
  /** SKIPPED: the person skipped, so it went to the band's end. */
  how: "ANSWERED" | "SKIPPED";
};

type Phase =
  /** Binary search within the band: the slot is in `lo..hi`. */
  | { kind: "BAND"; lo: number; hi: number }
  /** It beat the band's top: against the last entry of the band above. */
  | { kind: "ABOVE" }
  /** It lost to the band's bottom: against the first of the band below. */
  | { kind: "BELOW" }
  | { kind: "DONE"; result: PlacementResult };

export type PlacementState = {
  readonly band: number;
  /** The band's entries, top first. */
  readonly inBand: readonly PlacementEntry[];
  /** The band above's bottom entry, when there is a band above to cross to. */
  readonly above: PlacementEntry | null;
  /** The band below's top entry, when there is a band below to cross to. */
  readonly below: PlacementEntry | null;
  /** How many entries the band above holds (for a crossing up). */
  readonly aboveCount: number;
  readonly asked: number;
  readonly phase: Phase;
};

/** The lowest and highest bands that rank anything; 0 is Unrated. */
const LOWEST_RANKED = 1;
const HIGHEST_RANKED = 5;

const bandOf = (
  board: readonly PlacementEntry[],
  band: number,
): PlacementEntry[] =>
  board
    .filter((entry) => entry.band === band)
    .slice()
    .sort((a, b) => a.position - b.position);

const ranked = (band: number) =>
  band >= LOWEST_RANKED && band <= HIGHEST_RANKED;

/** `ceil(log2(slots))` without floating point: questions to pick 1 of `slots`. */
const searchQuestions = (slots: number): number => {
  let questions = 0;
  for (let reach = 1; reach < slots; reach *= 2) questions += 1;
  return questions;
};

/**
 * The most questions placing into a band of `n` entries can take:
 * `ceil(log2(n + 1)) + 1`, or 0 for an empty band (there is nothing to
 * compare with, so it goes straight in).
 */
export function maxQuestions(n: number): number {
  return n <= 0 ? 0 : searchQuestions(n + 1) + 1;
}

/** The state a placement into `band` of `board` starts from. */
export function startPlacement(
  board: readonly PlacementEntry[],
  band: number,
): PlacementState {
  const inBand = bandOf(board, band);
  const upper = ranked(band) && ranked(band + 1) ? bandOf(board, band + 1) : [];
  const lower = ranked(band) && ranked(band - 1) ? bandOf(board, band - 1) : [];
  const base = {
    band,
    inBand,
    above: upper[upper.length - 1] ?? null,
    below: lower[0] ?? null,
    aboveCount: upper.length,
    asked: 0,
  };
  if (inBand.length === 0) {
    return {
      ...base,
      phase: { kind: "DONE", result: { band, position: 0, how: "ANSWERED" } },
    };
  }
  return { ...base, phase: { kind: "BAND", lo: 0, hi: inBand.length } };
}

const done = (
  state: PlacementState,
  result: PlacementResult,
  asked = state.asked,
): PlacementState => ({ ...state, asked, phase: { kind: "DONE", result } });

/** The entry the current question compares against, or null when done. */
export function currentRival(state: PlacementState): PlacementEntry | null {
  const { phase } = state;
  switch (phase.kind) {
    case "BAND":
      return state.inBand[Math.floor((phase.lo + phase.hi) / 2)] ?? null;
    case "ABOVE":
      return state.above;
    case "BELOW":
      return state.below;
    case "DONE":
      return null;
  }
}

/** Where it landed, once it has. */
export function placementResult(state: PlacementState): PlacementResult | null {
  return state.phase.kind === "DONE" ? state.phase.result : null;
}

/** One answer to the current question. A finished placement is unchanged. */
export function answer(
  state: PlacementState,
  choice: PlacementAnswer,
): PlacementState {
  const { phase, band } = state;
  const asked = state.asked + 1;
  const n = state.inBand.length;

  if (phase.kind === "BAND") {
    const mid = Math.floor((phase.lo + phase.hi) / 2);
    if (choice === "SAME") {
      return done(state, { band, position: mid + 1, how: "ANSWERED" }, asked);
    }
    const lo = choice === "NEW" ? phase.lo : mid + 1;
    const hi = choice === "NEW" ? mid : phase.hi;
    if (lo < hi) return { ...state, asked, phase: { kind: "BAND", lo, hi } };
    // Settled within the band. At its very top or bottom, one more question
    // decides whether it belongs across the line instead.
    if (lo === 0 && state.above !== null) {
      return { ...state, asked, phase: { kind: "ABOVE" } };
    }
    if (lo === n && state.below !== null) {
      return { ...state, asked, phase: { kind: "BELOW" } };
    }
    return done(state, { band, position: lo, how: "ANSWERED" }, asked);
  }

  if (phase.kind === "ABOVE") {
    // Better than the band above's bottom: it goes just above that entry.
    return choice === "NEW"
      ? done(
          state,
          {
            band: band + 1,
            position: Math.max(0, state.aboveCount - 1),
            how: "ANSWERED",
          },
          asked,
        )
      : done(state, { band, position: 0, how: "ANSWERED" }, asked);
  }

  if (phase.kind === "BELOW") {
    // Worse than the band below's top: it goes just below that entry.
    return choice === "OLD"
      ? done(state, { band: band - 1, position: 1, how: "ANSWERED" }, asked)
      : done(state, { band, position: n, how: "ANSWERED" }, asked);
  }

  return state;
}

/** Skip: the bottom of its own band, wherever the questions had got to. */
export function skip(state: PlacementState): PlacementState {
  if (state.phase.kind === "DONE") return state;
  return done(state, {
    band: state.band,
    position: state.inBand.length,
    how: "SKIPPED",
  });
}

/**
 * The most questions still to come from here: what is left of the search,
 * plus the crossing question when it could still come up.
 */
export function remainingQuestions(state: PlacementState): number {
  const { phase } = state;
  switch (phase.kind) {
    case "DONE":
      return 0;
    case "ABOVE":
    case "BELOW":
      return 1;
    case "BAND": {
      const n = state.inBand.length;
      const crossing =
        (phase.lo === 0 && state.above !== null) ||
        (phase.hi === n && state.below !== null);
      return searchQuestions(phase.hi - phase.lo + 1) + (crossing ? 1 : 0);
    }
  }
}

/** "2 of 4": this question, of at most how many in all. */
export function stepLabel(state: PlacementState): string {
  const total = state.asked + remainingQuestions(state);
  return `${state.asked + 1} of ${total}`;
}

/** "1 tap", "3 taps". */
export function tapsLabel(taps: number): string {
  return `${taps} ${taps === 1 ? "tap" : "taps"}, no scores stored.`;
}

/**
 * Its rank on the whole board once inserted, from 1: everything in a higher
 * band, then its position in its own.
 */
export function placedRank(
  board: readonly PlacementEntry[],
  result: PlacementResult,
): number {
  const higher = board.filter((entry) => entry.band > result.band).length;
  return higher + result.position + 1;
}

/** The entries it sits between in its band: the one above it and below it. */
export function placedNeighbours(
  board: readonly PlacementEntry[],
  result: PlacementResult,
): { above: PlacementEntry | null; below: PlacementEntry | null } {
  const order = bandOf(board, result.band);
  return {
    above: order[result.position - 1] ?? null,
    below: order[result.position] ?? null,
  };
}

/**
 * The result's line: "Above Buffalo Trace, below Eagle Rare.", or "Top of
 * Very Good." / "Bottom of Very Good." at an edge, "First in Very Good." in
 * an empty band.
 */
export function placedBetween(
  board: readonly PlacementEntry[],
  result: PlacementResult,
  bandLabel: string,
): string {
  const { above, below } = placedNeighbours(board, result);
  if (above === null && below === null) return `First in ${bandLabel}.`;
  if (above === null) return `Top of ${bandLabel}, above ${below?.name}.`;
  if (below === null) return `Bottom of ${bandLabel}, below ${above.name}.`;
  return `Above ${below.name}, below ${above.name}.`;
}
