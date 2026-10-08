/**
 * Finishing a bottle is deliberate and reversible — roadmap N13a.
 *
 * The remaining slider used to call `emptyCellarItem` the moment it settled
 * on 0%, and the only other way out of a bottle was "Delete item", which also
 * deletes every check-in on it. Now:
 *
 * 1. reaching 0% asks "Finished it?" (`confirming`) — "Not yet" puts the
 *    slider back where it was, "Finished" empties the bottle;
 * 2. once finished, a toast offers **Undo** for a few seconds (`finished`),
 *    which is `updateCellarItem(emptyAt: null)` with the remaining level (and,
 *    for a bottle that was never opened, `openAt: null`) put back;
 * 3. the delete dialog says the check-ins go too, and offers "Mark finished
 *    instead", which goes straight to step 2.
 *
 * This module is the whole behaviour — a reducer and two commands with their
 * side effects injected — so it is tested without React, and the shadcn
 * migration (D20) swaps only the markup (`FinishBottleDialogs.tsx`) and the
 * thin hook (`useFinishBottle.ts`) that wires it to URQL.
 */

/** What the bottle looked like before it was finished — what Undo restores. */
export type FinishSnapshot = {
  /** The last *saved* level; the slider may be showing 0 by now. */
  percentageRemaining: number;
  openAt: string | null;
};

export type FinishState =
  | { phase: "idle"; error: string | null }
  | { phase: "confirming"; snapshot: FinishSnapshot }
  /** `asked`: it came through "Finished it?", which shows the progress. */
  | { phase: "finishing"; snapshot: FinishSnapshot; asked: boolean }
  | { phase: "finished"; snapshot: FinishSnapshot }
  | { phase: "undoing"; snapshot: FinishSnapshot };

export type FinishEvent =
  /** The slider settled on 0%: ask first. */
  | { type: "REQUEST"; snapshot: FinishSnapshot }
  /** "Mark finished instead" — the user already said so: no question. */
  | { type: "FINISH_NOW"; snapshot: FinishSnapshot }
  | { type: "CANCEL" }
  | { type: "CONFIRM" }
  | { type: "FINISHED" }
  | { type: "UNDO" }
  | { type: "UNDONE" }
  | { type: "DISMISS" }
  | { type: "FAILED"; message: string };

export const initialFinishState: FinishState = { phase: "idle", error: null };

/**
 * Events that do not apply to the current phase are ignored (a second tap on
 * "Finished" while the first is in flight, an Undo after the toast closed).
 */
export function finishReducer(
  state: FinishState,
  event: FinishEvent,
): FinishState {
  switch (event.type) {
    case "REQUEST":
      return state.phase === "idle"
        ? { phase: "confirming", snapshot: event.snapshot }
        : state;
    case "FINISH_NOW":
      return state.phase === "idle" || state.phase === "confirming"
        ? { phase: "finishing", snapshot: event.snapshot, asked: false }
        : state;
    case "CANCEL":
      return state.phase === "confirming" ? initialFinishState : state;
    case "CONFIRM":
      return state.phase === "confirming"
        ? { phase: "finishing", snapshot: state.snapshot, asked: true }
        : state;
    case "FINISHED":
      return state.phase === "finishing"
        ? { phase: "finished", snapshot: state.snapshot }
        : state;
    case "UNDO":
      return state.phase === "finished"
        ? { phase: "undoing", snapshot: state.snapshot }
        : state;
    case "UNDONE":
      return state.phase === "undoing" ? initialFinishState : state;
    case "DISMISS":
      return state.phase === "finished" ? initialFinishState : state;
    case "FAILED":
      return state.phase === "finishing" || state.phase === "undoing"
        ? { phase: "idle", error: event.message }
        : state;
  }
}

/** The level Undo puts back: the last saved one, or full if that was 0. */
export const restoredPercentage = (snapshot: FinishSnapshot): number =>
  snapshot.percentageRemaining > 0 ? snapshot.percentageRemaining : 100;

/**
 * `UpdateCellarItemInput` for Undo. `emptyCellarItem` also stamps `openAt` on
 * a bottle that was never opened ("an empty bottle was opened at some
 * point"), so Undo clears that too; an opened bottle keeps its date.
 */
export const undoFinishInput = (
  snapshot: FinishSnapshot,
): { emptyAt: null; percentageRemaining: number; openAt?: null } => ({
  emptyAt: null,
  percentageRemaining: restoredPercentage(snapshot),
  ...(snapshot.openAt === null ? { openAt: null } : {}),
});

/** A write's outcome, as the commands need it. */
export type WriteOutcome = { ok: true } | { ok: false; message: string };

export type FinishDeps = {
  dispatch: (event: FinishEvent) => void;
  /** `emptyCellarItem`. */
  empty: () => Promise<WriteOutcome>;
  /** `updateCellarItem(input)`. */
  update: (input: ReturnType<typeof undoFinishInput>) => Promise<WriteOutcome>;
  /** Re-read the page (`router.refresh()`). */
  refresh: () => void;
};

/** Run after `CONFIRM` or `FINISH_NOW`: empty the bottle. */
export async function performFinish(deps: FinishDeps): Promise<void> {
  const outcome = await deps.empty();
  if (!outcome.ok) {
    deps.dispatch({ type: "FAILED", message: outcome.message });
    return;
  }
  deps.dispatch({ type: "FINISHED" });
  deps.refresh();
}

/** Run after `UNDO`: put the bottle back as it was. */
export async function performUndo(
  deps: FinishDeps,
  snapshot: FinishSnapshot,
): Promise<void> {
  const outcome = await deps.update(undoFinishInput(snapshot));
  if (!outcome.ok) {
    deps.dispatch({ type: "FAILED", message: outcome.message });
    return;
  }
  deps.dispatch({ type: "UNDONE" });
  deps.refresh();
}

/** How long the Undo toast stays up. Long enough to read and reach. */
export const UNDO_WINDOW_MS = 6000;

/**
 * The delete dialog's text. Deleting a bottle deletes its check-ins
 * (`removeItemFromCellar`); finishing it keeps them, which is almost always
 * what someone who drank it wants.
 */
export function deleteBottleWarning({
  itemName,
  checkInCount,
  isFinished,
}: {
  itemName: string | undefined;
  checkInCount: number;
  isFinished: boolean;
}): { body: string; suggestFinish: boolean } {
  const name =
    itemName === undefined || itemName === "" ? "this bottle" : itemName;
  const checkIns =
    checkInCount === 0
      ? ""
      : checkInCount === 1
        ? " Its check-in will be deleted too."
        : ` Its ${checkInCount} check-ins will be deleted too.`;
  const body = `Delete ${name} from your cellar?${checkIns}`;
  if (isFinished) return { body, suggestFinish: false };
  return {
    body: `${body} If you drank it, mark it finished instead: it leaves the cellar and keeps its check-ins.`,
    suggestFinish: true,
  };
}
