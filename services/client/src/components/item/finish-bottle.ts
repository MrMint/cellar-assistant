/**
 * Finishing a bottle is deliberate and reversible — roadmap N13a.
 *
 * The remaining slider used to call `emptyCellarItem` the moment it settled
 * on 0%, and the only other way out of a bottle was "Delete item", which also
 * deletes every check-in on it. Now:
 *
 * 1. reaching 0% asks "Finished it?" (`confirming`) — "Not yet" puts the
 *    slider back where it was, "Finished" empties the bottle;
 * 2. once finished, a toast offers **Undo** for five seconds (`finished`),
 *    which is `updateCellarItem(emptyAt: null)` with the remaining level (and,
 *    for a bottle that was never opened, `openAt: null`) put back;
 * 3. the delete dialog says the check-ins go too, and offers "Mark finished
 *    instead", which goes straight to step 2;
 * 4. after the toast is gone, a finished bottle's page still offers
 *    "Put back" (`restoring`) — the same `updateCellarItem(emptyAt:
 *    null)`, so Undo is not limited to the toast's five seconds.
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
  | { phase: "undoing"; snapshot: FinishSnapshot }
  /**
   * Undo was refused (or the network dropped it): the bottle is still
   * finished. The toast stays up with the reason and "Try again" — an Undo
   * that fails silently would read as done.
   */
  | { phase: "undoFailed"; snapshot: FinishSnapshot; error: string }
  /** "Put back" on a bottle that was finished earlier. */
  | { phase: "restoring" }
  /** F-150: it is back; the toast ("Back in <cellar>") offers Undo. */
  | { phase: "restored" }
  /** That Undo: finishing it again. */
  | { phase: "refinishing" };

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
  /** "Put back", long after the Undo toast. */
  | { type: "RESTORE" }
  | { type: "RESTORED" }
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
      if (state.phase === "refinishing") return initialFinishState;
      return state.phase === "finishing"
        ? { phase: "finished", snapshot: state.snapshot }
        : state;
    case "UNDO":
      if (state.phase === "restored") return { phase: "refinishing" };
      return state.phase === "finished" || state.phase === "undoFailed"
        ? { phase: "undoing", snapshot: state.snapshot }
        : state;
    case "UNDONE":
      return state.phase === "undoing" ? initialFinishState : state;
    case "DISMISS":
      return state.phase === "finished" ||
        state.phase === "undoFailed" ||
        state.phase === "restored"
        ? initialFinishState
        : state;
    case "RESTORE":
      return state.phase === "idle" ? { phase: "restoring" } : state;
    case "RESTORED":
      return state.phase === "restoring" ? { phase: "restored" } : state;
    case "FAILED":
      if (
        state.phase === "finishing" ||
        state.phase === "restoring" ||
        state.phase === "refinishing"
      ) {
        return { phase: "idle", error: event.message };
      }
      return state.phase === "undoing"
        ? {
            phase: "undoFailed",
            snapshot: state.snapshot,
            error: event.message,
          }
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

/**
 * `UpdateCellarItemInput` for "Put back". The board puts it back at the level
 * it had before it was finished, else full. `emptyCellarItem` saves the level
 * as 0 and keeps the one before it (`CellarItem.levelBeforeEmpty`, F-150,
 * H-125), so a bottle the read shows at 0 comes back at that kept level, or
 * full when nothing was kept (finished from 0, or before the server kept
 * one); a level the read still carries is put back as it is. The level is
 * always named: the server leaves an unnamed one at 0. Its `openAt` stays:
 * whether it was opened before finishing is not recorded.
 */
export const restoreFinishedInput = (
  percentageRemaining: number,
  levelBeforeEmpty?: number | null,
): { emptyAt: null; percentageRemaining: number } => ({
  emptyAt: null,
  percentageRemaining:
    percentageRemaining > 0 ? percentageRemaining : (levelBeforeEmpty ?? 100),
});

/** A write's outcome, as the commands need it. */
export type WriteOutcome = { ok: true } | { ok: false; message: string };

export type FinishDeps = {
  dispatch: (event: FinishEvent) => void;
  /** `emptyCellarItem`. */
  empty: () => Promise<WriteOutcome>;
  /** `updateCellarItem(input)`. */
  update: (
    input:
      | ReturnType<typeof undoFinishInput>
      | ReturnType<typeof restoreFinishedInput>,
  ) => Promise<WriteOutcome>;
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

/** Run after `RESTORE`: put a finished bottle back in the cellar. */
export async function performRestore(
  deps: FinishDeps,
  percentageRemaining: number,
  levelBeforeEmpty?: number | null,
): Promise<void> {
  const outcome = await deps.update(
    restoreFinishedInput(percentageRemaining, levelBeforeEmpty),
  );
  if (!outcome.ok) {
    deps.dispatch({ type: "FAILED", message: outcome.message });
    return;
  }
  deps.dispatch({ type: "RESTORED" });
  deps.refresh();
}

/** Run after `UNDO` of a put back: finish it again. */
export async function performRefinish(deps: FinishDeps): Promise<void> {
  const outcome = await deps.empty();
  if (!outcome.ok) {
    deps.dispatch({ type: "FAILED", message: outcome.message });
    return;
  }
  deps.dispatch({ type: "FINISHED" });
  deps.refresh();
}

/**
 * The Undo toast's line for each phase that shows one (N13a's wording, and
 * the board's "Back in <cellar>" for a put back); null while there is no
 * toast. It stays up `UNDO_TOAST_MS` (`app/notify`).
 */
export function finishToastCopy(
  state: FinishState,
  cellarName?: string,
): string | null {
  switch (state.phase) {
    case "restored":
      return `Back in ${cellarName === undefined || cellarName === "" ? "the cellar" : cellarName}`;
    case "refinishing":
      return "Finishing it again…";
    case "finished":
      return "Finished. Moved out of the cellar.";
    case "undoing":
      return "Putting it back…";
    case "undoFailed":
      return `Couldn't undo: ${state.error}`;
    default:
      return null;
  }
}

/**
 * The delete dialog's text. Since X02 a bottle's drink logs outlive it
 * (`check_ins.cellar_item_id` is `ON DELETE SET NULL`), so deleting no longer
 * takes them — the dialog used to say it did. What finishing keeps that
 * deleting does not is the bottle itself: a finished bottle stays in the
 * cellar's history and its Finished filter, and can be restored.
 */
export function deleteBottleWarning({
  itemName,
  isFinished,
}: {
  itemName: string | undefined;
  isFinished: boolean;
}): { body: string; suggestFinish: boolean } {
  const name =
    itemName === undefined || itemName === "" ? "this bottle" : itemName;
  const body = `Delete ${name} from your cellar? Drinks you logged from it stay in your log.`;
  if (isFinished) return { body, suggestFinish: false };
  return {
    body: `${body} If you drank it, mark it finished instead: it stays in the cellar's history and can be restored.`,
    suggestFinish: true,
  };
}
