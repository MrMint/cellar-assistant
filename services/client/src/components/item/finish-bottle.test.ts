import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  deleteBottleWarning,
  type FinishDeps,
  type FinishEvent,
  type FinishSnapshot,
  type FinishState,
  finishReducer,
  initialFinishState,
  performFinish,
  performUndo,
  restoredPercentage,
  undoFinishInput,
  type WriteOutcome,
} from "./finish-bottle";

const opened: FinishSnapshot = {
  percentageRemaining: 30,
  openAt: "2026-10-01T18:00:00.000Z",
};

const run = (events: FinishEvent[], from: FinishState = initialFinishState) =>
  events.reduce(finishReducer, from);

describe("finishReducer", () => {
  test("0% asks first; Finished empties; then the Undo toast", () => {
    let state = run([{ type: "REQUEST", snapshot: opened }]);
    assert.deepEqual(state, { phase: "confirming", snapshot: opened });
    state = finishReducer(state, { type: "CONFIRM" });
    assert.deepEqual(state, {
      phase: "finishing",
      snapshot: opened,
      asked: true,
    });
    state = finishReducer(state, { type: "FINISHED" });
    assert.deepEqual(state, { phase: "finished", snapshot: opened });
  });

  test("Not yet goes back to idle, with nothing written", () => {
    assert.deepEqual(
      run([{ type: "REQUEST", snapshot: opened }, { type: "CANCEL" }]),
      initialFinishState,
    );
  });

  test("Undo runs from the toast and ends idle", () => {
    const finished = run([
      { type: "REQUEST", snapshot: opened },
      { type: "CONFIRM" },
      { type: "FINISHED" },
    ]);
    const undoing = finishReducer(finished, { type: "UNDO" });
    assert.deepEqual(undoing, { phase: "undoing", snapshot: opened });
    assert.deepEqual(
      finishReducer(undoing, { type: "UNDONE" }),
      initialFinishState,
    );
  });

  test("the toast timing out is the end of it", () => {
    const finished = run([
      { type: "FINISH_NOW", snapshot: opened },
      { type: "FINISHED" },
    ]);
    assert.deepEqual(
      finishReducer(finished, { type: "DISMISS" }),
      initialFinishState,
    );
  });

  test("Mark finished instead skips the question", () => {
    assert.deepEqual(run([{ type: "FINISH_NOW", snapshot: opened }]), {
      phase: "finishing",
      snapshot: opened,
      asked: false,
    });
  });

  test("a refused write lands idle with its message", () => {
    assert.deepEqual(
      run([
        { type: "REQUEST", snapshot: opened },
        { type: "CONFIRM" },
        { type: "FAILED", message: "nope" },
      ]),
      { phase: "idle", error: "nope" },
    );
  });

  test("events that do not apply are ignored", () => {
    // A double tap on Finished, an Undo with no toast, a stray FINISHED.
    const finishing = run([
      { type: "REQUEST", snapshot: opened },
      { type: "CONFIRM" },
    ]);
    assert.equal(finishReducer(finishing, { type: "CONFIRM" }), finishing);
    assert.equal(finishReducer(finishing, { type: "CANCEL" }), finishing);
    assert.equal(
      finishReducer(initialFinishState, { type: "UNDO" }),
      initialFinishState,
    );
    assert.equal(
      finishReducer(initialFinishState, { type: "FINISHED" }),
      initialFinishState,
    );
    const confirming = run([{ type: "REQUEST", snapshot: opened }]);
    assert.equal(
      finishReducer(confirming, {
        type: "REQUEST",
        snapshot: { ...opened, percentageRemaining: 90 },
      }),
      confirming,
    );
  });
});

describe("Undo's input", () => {
  test("puts the last saved level back and keeps an opened bottle's date", () => {
    assert.deepEqual(undoFinishInput(opened), {
      emptyAt: null,
      percentageRemaining: 30,
    });
  });

  test("a never-opened bottle is un-opened again (emptyCellarItem opened it)", () => {
    assert.deepEqual(
      undoFinishInput({ percentageRemaining: 100, openAt: null }),
      { emptyAt: null, percentageRemaining: 100, openAt: null },
    );
  });

  test("a saved level of 0 restores as full, never as a bottle at 0%", () => {
    assert.equal(
      restoredPercentage({ percentageRemaining: 0, openAt: null }),
      100,
    );
    assert.equal(restoredPercentage(opened), 30);
  });
});

describe("performFinish / performUndo", () => {
  const harness = (outcome: WriteOutcome) => {
    const events: FinishEvent[] = [];
    const calls: string[] = [];
    let refreshes = 0;
    const deps: FinishDeps = {
      dispatch: (event) => events.push(event),
      empty: async () => {
        calls.push("empty");
        return outcome;
      },
      update: async (input) => {
        calls.push(`update ${JSON.stringify(input)}`);
        return outcome;
      },
      refresh: () => {
        refreshes += 1;
      },
    };
    return { deps, events, calls, refreshes: () => refreshes };
  };

  test("finish: emptyCellarItem, FINISHED, then a refresh", async () => {
    const h = harness({ ok: true });
    await performFinish(h.deps);
    assert.deepEqual(h.calls, ["empty"]);
    assert.deepEqual(h.events, [{ type: "FINISHED" }]);
    assert.equal(h.refreshes(), 1);
  });

  test("finish refused: FAILED with the message, no refresh", async () => {
    const h = harness({ ok: false, message: "Not your cellar" });
    await performFinish(h.deps);
    assert.deepEqual(h.events, [
      { type: "FAILED", message: "Not your cellar" },
    ]);
    assert.equal(h.refreshes(), 0);
  });

  test("undo: updateCellarItem(emptyAt: null, …), UNDONE, then a refresh", async () => {
    const h = harness({ ok: true });
    await performUndo(h.deps, opened);
    assert.deepEqual(h.calls, [
      'update {"emptyAt":null,"percentageRemaining":30}',
    ]);
    assert.deepEqual(h.events, [{ type: "UNDONE" }]);
    assert.equal(h.refreshes(), 1);
  });

  test("undo refused: FAILED", async () => {
    const h = harness({ ok: false, message: "gone" });
    await performUndo(h.deps, opened);
    assert.deepEqual(h.events, [{ type: "FAILED", message: "gone" }]);
  });
});

describe("deleteBottleWarning", () => {
  test("says the check-ins go too, and offers finishing instead", () => {
    assert.deepEqual(
      deleteBottleWarning({
        itemName: "Castello di Monterosso",
        checkInCount: 3,
        isFinished: false,
      }),
      {
        body:
          "Delete Castello di Monterosso from your cellar? Its 3 check-ins " +
          "will be deleted too. If you drank it, mark it finished instead: " +
          "it leaves the cellar and keeps its check-ins.",
        suggestFinish: true,
      },
    );
  });

  test("one check-in is singular; none is not mentioned", () => {
    assert.match(
      deleteBottleWarning({ itemName: "X", checkInCount: 1, isFinished: true })
        .body,
      /Its check-in will be deleted too\.$/,
    );
    assert.deepEqual(
      deleteBottleWarning({ itemName: "X", checkInCount: 0, isFinished: true }),
      { body: "Delete X from your cellar?", suggestFinish: false },
    );
  });

  test("an unnamed bottle still reads", () => {
    assert.match(
      deleteBottleWarning({
        itemName: undefined,
        checkInCount: 0,
        isFinished: false,
      }).body,
      /^Delete this bottle from your cellar\?/,
    );
  });
});
