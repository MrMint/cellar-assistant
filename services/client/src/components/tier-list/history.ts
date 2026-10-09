/**
 * X23 / D4 on the client: the band a new entry lands in, and the words for
 * the edit history's Undo and Redo — plain functions, so the board, the two
 * pickers and their tests all say the same thing.
 */

import { displayItemName } from "@/utilities/smart-title-case";
import { BAND_LABELS, type Band } from "./constants";

/**
 * "Band defaults from your verdict on add": your rating, in half stars, to
 * the band whose word matches it — 4.5 and 5 are Outstanding, 4 Very Good,
 * 3 Good, 2 Mediocre, 1 Bad (each half step rounds up into the band above,
 * as 4.5 reads "outstanding" and not "very good"). No rating is Unrated, as
 * every add was before.
 */
export function bandForScore(score: number | null | undefined): Band {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return 0;
  }
  if (score >= 4.5) return 5;
  if (score >= 3.5) return 4;
  if (score >= 2.5) return 3;
  if (score >= 1.5) return 2;
  if (score > 0) return 1;
  return 0;
}

/** One recorded edit, as the page reads `TierListEdit`. */
export type TierListEditView = {
  seq: number;
  kind: "ADD" | "REMOVE" | "MOVE";
  entryName: string | null;
  fromBand: number | null;
  toBand: number | null;
};

/** `TierList.editHistory`, as the page reads it. Null for a non-owner. */
export type TierListHistoryView = {
  canUndo: boolean;
  canRedo: boolean;
  undo: TierListEditView | null;
  redo: TierListEditView | null;
};

const band = (value: number | null): string =>
  value === null ? "the list" : (BAND_LABELS[value] ?? "the list");

const nameOf = (edit: TierListEditView): string =>
  edit.entryName === null
    ? "an entry"
    : (displayItemName(edit.entryName) ?? edit.entryName);

const isBandChange = (edit: TierListEditView) =>
  edit.fromBand !== null &&
  edit.toBand !== null &&
  edit.fromBand !== edit.toBand;

/** What the edit did, in the past tense: "moved Barolo to Outstanding". */
export function editPhrase(edit: TierListEditView): string {
  switch (edit.kind) {
    case "ADD":
      return `added ${nameOf(edit)} to ${band(edit.toBand)}`;
    case "REMOVE":
      return `removed ${nameOf(edit)}`;
    case "MOVE":
      if (edit.entryName === null && edit.fromBand === null) {
        return "reordered the list";
      }
      return isBandChange(edit)
        ? `moved ${nameOf(edit)} to ${band(edit.toBand)}`
        : `reordered ${nameOf(edit)} in ${band(edit.toBand)}`;
  }
}

/** The Undo / Redo buttons' accessible names: "Undo: removed Barolo". */
export function historyActionLabel(
  direction: "undo" | "redo",
  edit: TierListEditView | null,
): string {
  const verb = direction === "undo" ? "Undo" : "Redo";
  return edit === null ? verb : `${verb}: ${editPhrase(edit)}`;
}

/**
 * The edit an Undo or Redo would take, by `seq` — what the mutation's
 * `expectedSeq` names. Null when the page does not know it yet (just after an
 * edit, before the refreshed history arrives) or there is nothing to take.
 */
export function stepSeq(
  history: TierListHistoryView,
  direction: "undo" | "redo",
): number | null {
  const edit = direction === "undo" ? history.undo : history.redo;
  return edit?.seq ?? null;
}

/**
 * The `seq` of the add just made, read back with it: the list's newest
 * undoable edit, when that is an ADD of this very entry. Anything else (an
 * edit from another device landed in between, or the history is hidden) is
 * null, and the add's toast then has no Undo to offer rather than one that
 * could take back something else.
 */
export function addedEditSeq(
  undo:
    | { seq: number; kind: string; entryId?: string | null }
    | null
    | undefined,
  entityId: string,
): number | null {
  if (undo === null || undo === undefined || undo.kind !== "ADD") return null;
  return undo.entryId?.toLowerCase() === entityId.toLowerCase()
    ? undo.seq
    : null;
}

/**
 * Why a step was refused, in the person's words. The one refusal they can
 * meet is another tab or device having changed the list since this page read
 * it (`TIER_LIST_HISTORY_MOVED`): the step it named is no longer the one on
 * top, so nothing was undone, and the page shows where the list stands now.
 */
export function historyStepFailure(
  direction: "undo" | "redo",
  error: { code: string; reason: string | null },
): string {
  if (error.reason === "TIER_LIST_HISTORY_MOVED") {
    const done = direction === "undo" ? "undone" : "redone";
    return `This list changed somewhere else, so nothing was ${done}. Here's where it stands now.`;
  }
  return error.code === "CONFLICT"
    ? `Nothing to ${direction} on this list any more.`
    : `Couldn't ${direction} that. Try again.`;
}

/**
 * The toast after an Undo or Redo, saying what changed on the board rather
 * than naming the mechanism: "Put Barolo back in Good", "Moved Barolo to
 * Outstanding again".
 */
export function historyStepMessage(
  direction: "undo" | "redo",
  edit: TierListEditView,
): string {
  const name = nameOf(edit);
  const capital = name.charAt(0).toUpperCase() + name.slice(1);
  if (direction === "undo") {
    switch (edit.kind) {
      case "ADD":
        return `Took ${name} off the list`;
      case "REMOVE":
        return `Put ${name} back in ${band(edit.fromBand)}`;
      case "MOVE":
        if (edit.entryName === null && edit.fromBand === null) {
          return "Put the list back in order";
        }
        return isBandChange(edit)
          ? `Moved ${name} back to ${band(edit.fromBand)}`
          : `Put ${name} back in its place`;
    }
  }
  switch (edit.kind) {
    case "ADD":
      return `Added ${name} to ${band(edit.toBand)} again`;
    case "REMOVE":
      return `Removed ${name} again`;
    case "MOVE":
      if (edit.entryName === null && edit.fromBand === null) {
        return "Reordered the list again";
      }
      return isBandChange(edit)
        ? `Moved ${name} to ${band(edit.toBand)} again`
        : `${capital} is back where you dragged it`;
  }
}
