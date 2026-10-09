/**
 * X23 / D4 on the client: the band a new entry lands in, and the words for
 * the edit history's Undo and Redo — plain functions, so the board, the two
 * pickers and their tests all say the same thing.
 */

import { bandForScore as sharedBandForScore } from "@cellar-assistant/contracts/bands";
import { displayItemName } from "@/utilities/smart-title-case";
import { BAND_LABELS, type Band } from "./constants";

/**
 * "Band defaults from your verdict on add": your rating, in half stars, to
 * the band whose word matches it — 4.5 and 5 are Outstanding, 4 Very Good,
 * 3 Good, 2 Mediocre, 1 Bad (each half step rounds up into the band above,
 * as 4.5 reads "outstanding" and not "very good"). No rating is Unrated, as
 * every add was before.
 *
 * The rule itself lives in `@cellar-assistant/contracts` since X16, so a list
 * the server starts from your ratings bands each bottle exactly as Add entry
 * would.
 */
export function bandForScore(score: number | null | undefined): Band {
  return sharedBandForScore(score) as Band;
}

/** One recorded edit, as the page reads `TierListEdit`. */
export type TierListEditView = {
  seq: number;
  kind: "ADD" | "REMOVE" | "MOVE";
  entryName: string | null;
  fromBand: number | null;
  toBand: number | null;
  /**
   * X16: entries the edit added or removed — several for a multi-add or a
   * list started from your ratings. Optional so an older response reads as 1.
   */
  entryCount?: number;
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

/** "3 entries", for an edit that added or removed several at once. */
const countOf = (edit: TierListEditView): number | null =>
  (edit.kind === "ADD" || edit.kind === "REMOVE") &&
  edit.entryCount !== undefined &&
  edit.entryCount > 1
    ? edit.entryCount
    : null;

const nameOf = (edit: TierListEditView): string => {
  const count = countOf(edit);
  if (count !== null) return `${count} entries`;
  return edit.entryName === null
    ? "an entry"
    : (displayItemName(edit.entryName) ?? edit.entryName);
};

const isBandChange = (edit: TierListEditView) =>
  edit.fromBand !== null &&
  edit.toBand !== null &&
  edit.fromBand !== edit.toBand;

/** What the edit did, in the past tense: "moved Barolo to Outstanding". */
export function editPhrase(edit: TierListEditView): string {
  switch (edit.kind) {
    case "ADD":
      // A multi-add across several bands names none of them.
      return countOf(edit) !== null && edit.toBand === null
        ? `added ${nameOf(edit)}`
        : `added ${nameOf(edit)} to ${band(edit.toBand)}`;
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
        return countOf(edit) !== null && edit.fromBand === null
          ? `Put ${name} back`
          : `Put ${name} back in ${band(edit.fromBand)}`;
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
      return countOf(edit) !== null && edit.toBand === null
        ? `Added ${name} again`
        : `Added ${name} to ${band(edit.toBand)} again`;
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
