/**
 * L09's comparison logic as data: the questions a placement asks, where it
 * lands, and the question budget — ceil(log2(n + 1)) + 1 at most for a band
 * of n — for n = 0, 1, 2, 7 and 20, with "About the same" and Skip.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  answer,
  currentRival,
  maxQuestions,
  type PlacementEntry,
  type PlacementState,
  placedBetween,
  placedOutcome,
  placedRank,
  placementResult,
  remainingQuestions,
  skip,
  startPlacement,
  stepLabel,
  tapsLabel,
} from "./placement";

/** `count` entries in `band`, named `<prefix>0..`, top first. */
const bandOf = (band: number, count: number, prefix = `b${band}-`) =>
  Array.from(
    { length: count },
    (_, position): PlacementEntry => ({
      id: `${prefix}${position}`,
      name: `${prefix}${position}`,
      band,
      position,
    }),
  );

/**
 * A person who knows exactly where the new entry belongs: it is better than
 * every entry of the band from index `slot` on, worse than those before it.
 * Neighbouring bands are answered the way the band's own edges imply unless
 * `cross` says it truly belongs across the line.
 */
const placeLike = (
  start: PlacementState,
  slot: number,
  cross: "UP" | "DOWN" | null = null,
) => {
  let state = start;
  const rivals: string[] = [];
  for (let guard = 0; guard < 50; guard += 1) {
    const rival = currentRival(state);
    if (rival === null) break;
    rivals.push(rival.id);
    let choice: "NEW" | "OLD";
    if (rival.band === start.band) {
      choice = rival.position >= slot ? "NEW" : "OLD";
    } else if (rival.band > start.band) {
      choice = cross === "UP" ? "NEW" : "OLD";
    } else {
      choice = cross === "DOWN" ? "OLD" : "NEW";
    }
    state = answer(state, choice);
  }
  return { state, rivals, result: placementResult(state) };
};

describe("the question budget", () => {
  test("ceil(log2(n + 1)) + 1, and nothing for an empty band", () => {
    assert.deepEqual([0, 1, 2, 7, 20].map(maxQuestions), [
      0,
      1 + 1,
      2 + 1,
      3 + 1,
      5 + 1,
    ]);
  });
});

describe("an empty band (n = 0)", () => {
  test("asks nothing and goes straight in at the top", () => {
    const state = startPlacement(bandOf(5, 3), 4);
    assert.equal(currentRival(state), null);
    assert.deepEqual(placementResult(state), {
      band: 4,
      position: 0,
      how: "ANSWERED",
    });
  });
});

describe("every slot of every band size lands where the person meant", () => {
  for (const n of [1, 2, 7, 20]) {
    test(`n = ${n}: each of the ${n + 1} slots, within budget`, () => {
      const board = bandOf(4, n);
      for (let slot = 0; slot <= n; slot += 1) {
        const start = startPlacement(board, 4);
        assert.equal(remainingQuestions(start), maxQuestions(n) - 1);
        const { state, result } = placeLike(start, slot);
        assert.deepEqual(result, { band: 4, position: slot, how: "ANSWERED" });
        assert.ok(
          state.asked <= Math.ceil(Math.log2(n + 1)),
          `n=${n} slot=${slot}: ${state.asked} questions`,
        );
      }
    });

    test(`n = ${n} with both neighbours: still within ceil(log2(n+1)) + 1`, () => {
      const board = [...bandOf(5, 3), ...bandOf(4, n), ...bandOf(3, 2)];
      for (let slot = 0; slot <= n; slot += 1) {
        const start = startPlacement(board, 4);
        assert.equal(remainingQuestions(start), maxQuestions(n));
        const { state, result } = placeLike(start, slot);
        assert.deepEqual(result, { band: 4, position: slot, how: "ANSWERED" });
        assert.ok(state.asked <= maxQuestions(n));
      }
    });
  }
});

describe("the sequence of questions", () => {
  test("n = 7: middle, then halves — b4-3, b4-1, b4-0 for the top slot", () => {
    const { rivals } = placeLike(startPlacement(bandOf(4, 7), 4), 0);
    assert.deepEqual(rivals, ["b4-3", "b4-1", "b4-0"]);
  });

  test("n = 7: b4-3, b4-5, b4-6 for the bottom slot", () => {
    const { rivals } = placeLike(startPlacement(bandOf(4, 7), 4), 7);
    assert.deepEqual(rivals, ["b4-3", "b4-5", "b4-6"]);
  });

  test("n = 2: b4-1 then b4-0", () => {
    const { rivals } = placeLike(startPlacement(bandOf(4, 2), 4), 0);
    assert.deepEqual(rivals, ["b4-1", "b4-0"]);
  });

  test("n = 1 at the top asks the band above's bottom entry next", () => {
    const board = [...bandOf(5, 2), ...bandOf(4, 1)];
    const { rivals } = placeLike(startPlacement(board, 4), 0);
    assert.deepEqual(rivals, ["b4-0", "b5-1"]);
  });

  test("n = 20, slot 13: b4-10, b4-15, b4-13, b4-12 — four of the five allowed", () => {
    const { rivals, result } = placeLike(startPlacement(bandOf(4, 20), 4), 13);
    assert.deepEqual(rivals, ["b4-10", "b4-15", "b4-13", "b4-12"]);
    assert.equal(result?.position, 13);
  });
});

describe("crossing into a neighbouring band", () => {
  const board = [...bandOf(5, 3), ...bandOf(4, 2), ...bandOf(3, 2)];

  test("beating the band above's bottom puts it just above that entry", () => {
    const { result } = placeLike(startPlacement(board, 4), 0, "UP");
    assert.deepEqual(result, { band: 5, position: 2, how: "ANSWERED" });
    assert.equal(
      placedBetween(
        board,
        result ?? { band: 0, position: 0, how: "ANSWERED" },
        "Outstanding",
      ),
      "Above b5-2, below b5-1.",
    );
  });

  test("losing to the band below's top puts it just below that entry", () => {
    const { result } = placeLike(startPlacement(board, 4), 2, "DOWN");
    assert.deepEqual(result, { band: 3, position: 1, how: "ANSWERED" });
  });

  test("Unrated has no neighbours, and Bad does not cross down into it", () => {
    const unrated = [...bandOf(1, 2), ...bandOf(0, 2)];
    const atTop = placeLike(startPlacement(unrated, 0), 0, "UP");
    assert.deepEqual(atTop.result, { band: 0, position: 0, how: "ANSWERED" });
    const atBottom = placeLike(startPlacement(unrated, 1), 2, "DOWN");
    assert.deepEqual(atBottom.result, {
      band: 1,
      position: 2,
      how: "ANSWERED",
    });
  });
});

describe("About the same", () => {
  test("ends it just below the entry it was compared with", () => {
    const start = startPlacement(bandOf(4, 7), 4);
    assert.equal(currentRival(start)?.id, "b4-3");
    const state = answer(start, "SAME");
    assert.deepEqual(placementResult(state), {
      band: 4,
      position: 4,
      how: "ANSWERED",
    });
    assert.equal(state.asked, 1);
  });

  test("against a neighbour, it stays in its own band at that edge", () => {
    const board = [...bandOf(5, 1), ...bandOf(4, 1)];
    const atEdge = answer(startPlacement(board, 4), "NEW");
    assert.equal(currentRival(atEdge)?.id, "b5-0");
    assert.deepEqual(placementResult(answer(atEdge, "SAME")), {
      band: 4,
      position: 0,
      how: "ANSWERED",
    });
  });
});

describe("Skip", () => {
  test("at the first question: the end of its band", () => {
    const state = skip(startPlacement(bandOf(4, 7), 4));
    assert.deepEqual(placementResult(state), {
      band: 4,
      position: 7,
      how: "SKIPPED",
    });
    assert.equal(state.asked, 0);
  });

  test("midway: still the end of its band, and the taps it took count", () => {
    const midway = answer(startPlacement(bandOf(4, 7), 4), "NEW");
    const state = skip(midway);
    assert.equal(placementResult(state)?.position, 7);
    assert.equal(state.asked, 1);
  });

  test("a finished placement is left as it is", () => {
    const finished = answer(startPlacement(bandOf(4, 1), 4), "OLD");
    assert.deepEqual(skip(finished), finished);
    assert.deepEqual(answer(finished, "NEW"), finished);
  });
});

describe("the words", () => {
  test("the step label counts down the budget as answers narrow it", () => {
    const start = startPlacement(bandOf(4, 7), 4);
    assert.equal(stepLabel(start), "1 of 3");
    assert.equal(stepLabel(answer(start, "NEW")), "2 of 3");
  });

  test("rank and neighbours on the whole board", () => {
    const board = [...bandOf(5, 3), ...bandOf(4, 4)];
    const result = { band: 4, position: 1, how: "ANSWERED" as const };
    assert.equal(placedRank(board, result), 5);
    assert.equal(
      placedBetween(board, result, "Very Good"),
      "Above b4-1, below b4-0.",
    );
    assert.equal(
      placedBetween(board, { ...result, position: 0 }, "Very Good"),
      "Top of Very Good, above b4-0.",
    );
    assert.equal(
      placedBetween(board, { ...result, position: 4 }, "Very Good"),
      "Bottom of Very Good, below b4-3.",
    );
    assert.equal(
      placedBetween(
        board,
        { band: 2, position: 0, how: "ANSWERED" },
        "Mediocre",
      ),
      "First in Mediocre.",
    );
  });

  test("CROSS-LOT: one outcome — the rank, and the whole board's neighbours either side", () => {
    const board = [...bandOf(5, 2), ...bandOf(4, 2), ...bandOf(2, 1)];
    // Mid-band: neighbours from its own band, ranks around its own.
    const mid = placedOutcome(board, { band: 4, position: 1, how: "ANSWERED" });
    assert.deepEqual(mid, {
      rank: 4,
      above: { name: "b4-0", band: 4, rank: 3 },
      below: { name: "b4-1", band: 4, rank: 5 },
    });
    // The top of its band: the entry above is the band above's last.
    const top = placedOutcome(board, { band: 4, position: 0, how: "ANSWERED" });
    assert.equal(top.rank, 3);
    assert.deepEqual(top.above, { name: "b5-1", band: 5, rank: 2 });
    // An empty band in between: the neighbours are across both lines.
    const alone = placedOutcome(board, {
      band: 3,
      position: 0,
      how: "ANSWERED",
    });
    assert.deepEqual(alone, {
      rank: 5,
      above: { name: "b4-1", band: 4, rank: 4 },
      below: { name: "b2-0", band: 2, rank: 6 },
    });
    // #1 has nothing above; the rank agrees with placedRank, always.
    const first = placedOutcome(board, {
      band: 5,
      position: 0,
      how: "ANSWERED",
    });
    assert.equal(first.above, null);
    for (const r of [mid, top, alone, first]) assert.ok(r.rank >= 1);
    assert.equal(
      mid.rank,
      placedRank(board, { band: 4, position: 1, how: "ANSWERED" }),
    );
  });

  test("taps", () => {
    assert.equal(tapsLabel(1), "1 tap, no scores stored.");
    assert.equal(tapsLabel(3), "3 taps, no scores stored.");
  });
});
