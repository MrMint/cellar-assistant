/**
 * X23 / D4's words and numbers: the band a rating lands in, and what Undo
 * and Redo say they will do and did.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addedEditSeq,
  bandForScore,
  editPhrase,
  historyActionLabel,
  historyStepFailure,
  historyStepMessage,
  stepSeq,
  type TierListEditView,
} from "./history";

describe("bandForScore (band defaults from your verdict)", () => {
  test("each half step lands in the band its word names", () => {
    const cases: [number | null | undefined, number][] = [
      [5, 5],
      [4.5, 5],
      [4, 4],
      [3.5, 4],
      [3, 3],
      [2.5, 3],
      [2, 2],
      [1.5, 2],
      [1, 1],
      [0.5, 1],
      [0, 0],
      [null, 0],
      [undefined, 0],
      [Number.NaN, 0],
    ];
    for (const [score, band] of cases) {
      assert.equal(bandForScore(score), band, `score ${score}`);
    }
  });
});

const edit = (overrides: Partial<TierListEditView>): TierListEditView => ({
  seq: 1,
  kind: "MOVE",
  entryName: "BAROLO RISERVA",
  fromBand: 0,
  toBand: 5,
  ...overrides,
});

describe("history wording", () => {
  test("phrases each edit, names title-cased", () => {
    assert.equal(editPhrase(edit({})), "moved Barolo Riserva to Outstanding");
    assert.equal(
      editPhrase(edit({ fromBand: 3, toBand: 3 })),
      "reordered Barolo Riserva in Good",
    );
    assert.equal(
      editPhrase(edit({ kind: "ADD", fromBand: null, toBand: 4 })),
      "added Barolo Riserva to Very Good",
    );
    assert.equal(
      editPhrase(edit({ kind: "REMOVE", toBand: null })),
      "removed Barolo Riserva",
    );
    assert.equal(
      editPhrase(edit({ entryName: null, fromBand: null, toBand: null })),
      "reordered the list",
    );
  });

  test("the buttons' names say what a press would do", () => {
    assert.equal(historyActionLabel("undo", null), "Undo");
    assert.equal(
      historyActionLabel("redo", edit({ kind: "REMOVE", toBand: null })),
      "Redo: removed Barolo Riserva",
    );
  });

  test("the toast says what changed on the board", () => {
    assert.equal(
      historyStepMessage("undo", edit({})),
      "Moved Barolo Riserva back to Unrated",
    );
    assert.equal(
      historyStepMessage("undo", edit({ kind: "REMOVE", fromBand: 3 })),
      "Put Barolo Riserva back in Good",
    );
    assert.equal(
      historyStepMessage("undo", edit({ kind: "ADD" })),
      "Took Barolo Riserva off the list",
    );
    assert.equal(
      historyStepMessage("redo", edit({})),
      "Moved Barolo Riserva to Outstanding again",
    );
    assert.equal(
      historyStepMessage("redo", edit({ kind: "REMOVE" })),
      "Removed Barolo Riserva again",
    );
    assert.equal(
      historyStepMessage("undo", edit({ fromBand: 2, toBand: 2 })),
      "Put Barolo Riserva back in its place",
    );
    assert.equal(
      historyStepMessage("undo", edit({ entryName: null, fromBand: null })),
      "Put the list back in order",
    );
  });
});

describe("stepSeq and historyStepFailure (expectedSeq, wave B)", () => {
  const edit: TierListEditView = {
    seq: 4,
    kind: "ADD",
    entryName: "Barolo",
    fromBand: null,
    toBand: 5,
  };

  test("names the edit each direction would take, or null when unknown", () => {
    const history = { canUndo: true, canRedo: true, undo: edit, redo: null };
    assert.equal(stepSeq(history, "undo"), 4);
    assert.equal(stepSeq(history, "redo"), null);
    // Just after an edit on this page: undoable, but which edit is not
    // known until the refresh — null, so the page waits rather than guess.
    assert.equal(
      stepSeq(
        { canUndo: true, canRedo: false, undo: null, redo: null },
        "undo",
      ),
      null,
    );
  });

  test("a moved history says the list changed elsewhere and nothing was done", () => {
    const moved = { code: "CONFLICT", reason: "TIER_LIST_HISTORY_MOVED" };
    assert.match(historyStepFailure("undo", moved), /changed somewhere else/);
    assert.match(historyStepFailure("undo", moved), /nothing was undone/);
    assert.match(historyStepFailure("redo", moved), /nothing was redone/);
    assert.equal(
      historyStepFailure("redo", { code: "CONFLICT", reason: null }),
      "Nothing to redo on this list any more.",
    );
    assert.equal(
      historyStepFailure("undo", { code: "FORBIDDEN", reason: null }),
      "Couldn't undo that. Try again.",
    );
  });
});

describe("addedEditSeq (the add's own Undo)", () => {
  test("the newest edit, when it is an ADD of this very entry", () => {
    assert.equal(
      addedEditSeq({ seq: 9, kind: "ADD", entryId: "W-1" }, "w-1"),
      9,
    );
  });

  test("anything else is null: no Undo rather than the wrong one", () => {
    for (const undo of [
      null,
      undefined,
      { seq: 9, kind: "ADD", entryId: "w-2" },
      { seq: 9, kind: "REMOVE", entryId: "w-1" },
      { seq: 9, kind: "ADD", entryId: null },
    ]) {
      assert.equal(addedEditSeq(undo, "w-1"), null);
    }
  });
});
