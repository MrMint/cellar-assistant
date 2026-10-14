/**
 * X23 / D4's words and numbers: the band a rating lands in, and what Undo
 * and Redo say they will do and did.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  addedEditSeq,
  addedEntriesEditSeq,
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

describe("history wording for several entries at once (X16)", () => {
  const many = (overrides: Partial<TierListEditView>) =>
    edit({
      kind: "ADD",
      entryName: null,
      fromBand: null,
      entryCount: 4,
      ...overrides,
    });

  test("a multi-add across bands is counted, not named", () => {
    assert.equal(editPhrase(many({ toBand: null })), "added 4 entries");
    assert.equal(
      historyActionLabel("undo", many({ toBand: null })),
      "Undo: added 4 entries",
    );
    assert.equal(
      historyStepMessage("undo", many({ toBand: null })),
      "Took 4 entries off the list",
    );
    assert.equal(
      historyStepMessage("redo", many({ toBand: null })),
      "Added 4 entries again",
    );
  });

  test("into one band, it says which", () => {
    assert.equal(
      editPhrase(many({ toBand: 5 })),
      "added 4 entries to Outstanding",
    );
  });

  test("a single add still names its entry", () => {
    assert.equal(
      editPhrase(
        edit({ kind: "ADD", fromBand: null, toBand: 3, entryCount: 1 }),
      ),
      "added Barolo Riserva to Good",
    );
  });
});

describe("addedEntriesEditSeq (a multi-add's own Undo, X16 x expectedSeq)", () => {
  test("several added: the newest edit when it is an ADD of that many", () => {
    const undo = { seq: 12, kind: "ADD", entryId: null, entryCount: 3 };
    assert.equal(addedEntriesEditSeq(undo, ["a", "b", "c", "d"], 3), 12);
    assert.equal(
      addedEntriesEditSeq({ ...undo, entryCount: 2 }, ["a", "b", "c"], 3),
      null,
    );
    assert.equal(
      addedEntriesEditSeq({ ...undo, kind: "MOVE" }, ["a", "b", "c"], 3),
      null,
    );
  });

  test("one added: an ADD of one of the entries asked for", () => {
    const one = { seq: 7, kind: "ADD", entryId: "W-2", entryCount: 1 };
    assert.equal(addedEntriesEditSeq(one, ["w-1", "w-2"], 1), 7);
    assert.equal(addedEntriesEditSeq(one, ["w-1", "w-3"], 1), null);
  });

  test("nothing added, or no history, is no Undo", () => {
    assert.equal(addedEntriesEditSeq(null, ["a"], 1), null);
    assert.equal(addedEntriesEditSeq(undefined, ["a"], 1), null);
    assert.equal(
      addedEntriesEditSeq(
        { seq: 1, kind: "ADD", entryId: "a", entryCount: 1 },
        ["a"],
        0,
      ),
      null,
    );
  });
});
