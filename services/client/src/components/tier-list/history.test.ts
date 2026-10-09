/**
 * X23 / D4's words and numbers: the band a rating lands in, and what Undo
 * and Redo say they will do and did.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  bandForScore,
  editPhrase,
  historyActionLabel,
  historyStepMessage,
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
