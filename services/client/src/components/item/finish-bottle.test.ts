import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  deleteBottleWarning,
  type FinishDeps,
  type FinishEvent,
  type FinishSnapshot,
  type FinishState,
  finishReducer,
  finishToastCopy,
  initialFinishState,
  performFinish,
  performRefinish,
  performRestore,
  performUndo,
  restoredPercentage,
  restoreFinishedInput,
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

  test("a refused Undo keeps the toast up, with the reason and a retry", () => {
    const failed = run([
      { type: "FINISH_NOW", snapshot: opened },
      { type: "FINISHED" },
      { type: "UNDO" },
      { type: "FAILED", message: "offline" },
    ]);
    assert.deepEqual(failed, {
      phase: "undoFailed",
      snapshot: opened,
      error: "offline",
    });
    assert.deepEqual(finishReducer(failed, { type: "UNDO" }), {
      phase: "undoing",
      snapshot: opened,
    });
    assert.deepEqual(
      finishReducer(failed, { type: "DISMISS" }),
      initialFinishState,
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

describe("Put back (after the Undo toast is gone)", () => {
  test("idle → restoring → restored (its toast); a refusal lands idle with its message", () => {
    let state = run([{ type: "RESTORE" }]);
    assert.deepEqual(state, { phase: "restoring" });
    assert.deepEqual(finishReducer(state, { type: "RESTORED" }), {
      phase: "restored",
    });
    state = finishReducer(state, { type: "FAILED", message: "Not yours" });
    assert.deepEqual(state, { phase: "idle", error: "Not yours" });
  });

  test("only from idle: not mid-finish, not during the toast", () => {
    for (const from of [
      run([{ type: "REQUEST", snapshot: opened }]),
      run([{ type: "FINISH_NOW", snapshot: opened }]),
      run([{ type: "FINISH_NOW", snapshot: opened }, { type: "FINISHED" }]),
    ]) {
      assert.equal(finishReducer(from, { type: "RESTORE" }), from);
    }
    const finished = run([
      { type: "FINISH_NOW", snapshot: opened },
      { type: "FINISHED" },
    ]);
    assert.equal(finishReducer(finished, { type: "RESTORED" }), finished);
  });

  test("a finished bottle (saved at 0) comes back full and stays opened", () => {
    assert.deepEqual(restoreFinishedInput(0), {
      emptyAt: null,
      percentageRemaining: 100,
    });
    assert.deepEqual(restoreFinishedInput(40), {
      emptyAt: null,
      percentageRemaining: 40,
    });
    assert.equal("openAt" in restoreFinishedInput(0), false);
  });

  test("performRestore: updateCellarItem, RESTORED, then a refresh", async () => {
    const events: FinishEvent[] = [];
    const calls: string[] = [];
    let refreshes = 0;
    const deps = (outcome: WriteOutcome): FinishDeps => ({
      dispatch: (event) => events.push(event),
      empty: async () => outcome,
      update: async (input) => {
        calls.push(JSON.stringify(input));
        return outcome;
      },
      refresh: () => {
        refreshes += 1;
      },
    });
    await performRestore(deps({ ok: true }), 0);
    assert.deepEqual(calls, ['{"emptyAt":null,"percentageRemaining":100}']);
    assert.deepEqual(events, [{ type: "RESTORED" }]);
    assert.equal(refreshes, 1);
    await performRestore(deps({ ok: false, message: "gone" }), 0);
    assert.deepEqual(events.at(-1), { type: "FAILED", message: "gone" });
    assert.equal(refreshes, 1);
  });
});

describe("Put back's toast and its Undo (F-150)", () => {
  const restored = run([{ type: "RESTORE" }, { type: "RESTORED" }]);

  test("the toast says where it went back to, and offers Undo", () => {
    assert.equal(finishToastCopy(restored, "Garage"), "Back in Garage");
    assert.equal(finishToastCopy(restored), "Back in the cellar");
  });

  test("Undo finishes it again, then ends idle; the toast timing out is the end of it", () => {
    const again = finishReducer(restored, { type: "UNDO" });
    assert.deepEqual(again, { phase: "refinishing" });
    assert.equal(finishToastCopy(again), "Finishing it again…");
    assert.deepEqual(finishReducer(again, { type: "FINISHED" }), {
      phase: "idle",
      error: null,
    });
    assert.deepEqual(
      finishReducer(again, { type: "FAILED", message: "Offline" }),
      { phase: "idle", error: "Offline" },
    );
    assert.deepEqual(finishReducer(restored, { type: "DISMISS" }), {
      phase: "idle",
      error: null,
    });
  });

  test("performRefinish: emptyCellarItem, FINISHED, then a refresh", async () => {
    const events: FinishEvent[] = [];
    const calls: string[] = [];
    let refreshes = 0;
    const deps = (outcome: WriteOutcome): FinishDeps => ({
      dispatch: (event) => events.push(event),
      empty: async () => {
        calls.push("empty");
        return outcome;
      },
      update: async () => outcome,
      refresh: () => {
        refreshes += 1;
      },
    });
    await performRefinish(deps({ ok: true }));
    assert.deepEqual(calls, ["empty"]);
    assert.deepEqual(events, [{ type: "FINISHED" }]);
    assert.equal(refreshes, 1);
    await performRefinish(deps({ ok: false, message: "gone" }));
    assert.deepEqual(events.at(-1), { type: "FAILED", message: "gone" });
  });

  test("the old level goes back when the server still has it", () => {
    assert.deepEqual(restoreFinishedInput(70), {
      emptyAt: null,
      percentageRemaining: 70,
    });
  });
});

describe("deleteBottleWarning", () => {
  test("keeps the drink log, and offers finishing instead", () => {
    assert.deepEqual(
      deleteBottleWarning({
        itemName: "Castello di Monterosso",
        isFinished: false,
      }),
      {
        body:
          "Delete Castello di Monterosso from your cellar? Drinks you logged " +
          "from it stay in your log. If you drank it, mark it finished " +
          "instead: it stays in the cellar's history and can be restored.",
        suggestFinish: true,
      },
    );
  });

  test("never says the logs are deleted (X02 keeps them)", () => {
    for (const isFinished of [true, false]) {
      assert.doesNotMatch(
        deleteBottleWarning({ itemName: "X", isFinished }).body,
        /deleted too/,
      );
    }
    assert.deepEqual(deleteBottleWarning({ itemName: "X", isFinished: true }), {
      body: "Delete X from your cellar? Drinks you logged from it stay in your log.",
      suggestFinish: false,
    });
  });

  test("an unnamed bottle still reads", () => {
    assert.match(
      deleteBottleWarning({ itemName: undefined, isFinished: false }).body,
      /^Delete this bottle from your cellar\?/,
    );
  });
});

describe("finishToastCopy", () => {
  test("the Undo toast's line follows the phase, and is gone when idle", () => {
    assert.equal(
      finishToastCopy({ phase: "finished", snapshot: opened }),
      "Finished. Moved out of the cellar.",
    );
    assert.equal(
      finishToastCopy({ phase: "undoing", snapshot: opened }),
      "Putting it back…",
    );
    assert.equal(
      finishToastCopy({
        phase: "undoFailed",
        snapshot: opened,
        error: "Offline",
      }),
      "Couldn't undo: Offline",
    );
    assert.equal(finishToastCopy(initialFinishState), null);
    assert.equal(
      finishToastCopy({ phase: "confirming", snapshot: opened }),
      null,
    );
  });
});
