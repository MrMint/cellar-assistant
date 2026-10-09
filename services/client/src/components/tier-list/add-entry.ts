/**
 * X16 — tier lists without typing, as plain data: Add entry's sections and
 * the words that say why each row is there, the multi-add's toast, and
 * Try this next's reasons. No React here, so the rules are tested as data
 * (`add-entry.test.ts`), the way `want-to-try/adapter.ts` does it.
 *
 * Every reason is a fact the person can check — a cellar's name, a count of
 * their own logs, a friend's band — never a score or a percentage.
 */

import { displayItemName } from "@/utilities/smart-title-case";
import {
  candidateHref,
  type EntryItemFields,
  type EntryPlaceFields,
  itemEntrySubtitle,
  placeEntrySubtitle,
} from "./adapter";
import { BAND_LABELS, type TierListEntityType } from "./constants";
import { bandForScore } from "./history";

export type AddEntrySection = "IN_CELLARS" | "TASTED" | "FRIENDS_RANKED";

/** The order the sheet draws its sections in (the server's claim order). */
export const ADD_ENTRY_SECTIONS: readonly AddEntrySection[] = [
  "IN_CELLARS",
  "TASTED",
  "FRIENDS_RANKED",
];

/** Rows a section shows before "Show N more". */
export const SECTION_PREVIEW = 5;

export type AddEntryCandidate = {
  id: string;
  entityType: TierListEntityType;
  name: string;
  subtitle: string;
  /**
   * Your own rating of it (an item review, a place rating; for a suggestion,
   * else your newest scored drink log), or null — the band it lands in
   * follows from it (`bandForScore`, X23).
   */
  myScore: number | null;
  /** X16: why a suggestion is offered, in words. Absent on a search row. */
  reason?: string;
};

/** A candidate's identity on the list: its board href. */
export const candidateKey = candidateHref;

/** "In your cellars", "Tasted, not ranked", "Friends ranked". */
export function sectionTitle(
  section: AddEntrySection,
  entityType: TierListEntityType,
): string {
  switch (section) {
    case "IN_CELLARS":
      return "In your cellars";
    case "TASTED":
      return entityType === "place"
        ? "Been there, not ranked"
        : "Tasted, not ranked";
    case "FRIENDS_RANKED":
      return "Friends ranked";
  }
}

const times = (n: number): string =>
  n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;

const bandWord = (band: number | null | undefined): string =>
  band === null || band === undefined
    ? "on a list"
    : (BAND_LABELS[band] ?? "on a list");

/** The facts on one `TierListSuggestion`, as the sheet reads them. */
export type SuggestionFacts = {
  section: AddEntrySection;
  cellarName?: string | null;
  bottleCount?: number | null;
  logCount?: number | null;
  friendName?: string | null;
  friendBand?: number | null;
  friendCount?: number | null;
};

/**
 * Why a suggestion is offered: "In Garage · 2 bottles", "Finished · Garage",
 * "Logged twice", "Rated", "Riley: Outstanding · +1 friend".
 */
export function suggestionReason(
  facts: SuggestionFacts,
  entityType: TierListEntityType,
): string {
  switch (facts.section) {
    case "IN_CELLARS": {
      const cellar = facts.cellarName?.trim() || "your cellar";
      const bottles = facts.bottleCount ?? 0;
      if (bottles === 0) return `Finished · ${cellar}`;
      return bottles === 1
        ? `In ${cellar}`
        : `In ${cellar} · ${bottles} bottles`;
    }
    case "TASTED": {
      const logs = facts.logCount ?? 0;
      if (entityType === "place") {
        return logs > 0 ? `Drank here ${times(logs)}` : "You've been";
      }
      return logs > 0 ? `Logged ${times(logs)}` : "Rated";
    }
    case "FRIENDS_RANKED": {
      const who = facts.friendName?.trim() || "A friend";
      const more = Math.max(0, (facts.friendCount ?? 1) - 1);
      const tail =
        more === 0 ? "" : ` · +${more} friend${more === 1 ? "" : "s"}`;
      return `${who}: ${bandWord(facts.friendBand)}${tail}`;
    }
  }
}

/** One `addSuggestions` node, as the query selects it. */
export type SuggestionNode = {
  section: string;
  entryType: string;
  myScore: number | null;
  cellarName: string | null;
  bottleCount: number | null;
  logCount: number | null;
  friendBand: number | null;
  friendCount: number | null;
  friend: { displayName: string } | null;
  place:
    | (EntryPlaceFields & {
        id: string;
        name: string;
        displayName: string | null;
      })
    | null;
  item: (EntryItemFields & { id: string; name: string }) | null;
};

const isSection = (value: string): value is AddEntrySection =>
  (ADD_ENTRY_SECTIONS as readonly string[]).includes(value);

/**
 * The sections, in order, each a list of candidates for a list of
 * `entityType`. A node of another type (a list whose type changed under the
 * sheet) or one whose entry the server nulled is skipped, not drawn blank.
 */
export function suggestionSections(
  nodes: readonly SuggestionNode[],
  entityType: TierListEntityType,
): { section: AddEntrySection; rows: AddEntryCandidate[] }[] {
  const bySection = new Map<AddEntrySection, AddEntryCandidate[]>();
  for (const node of nodes) {
    if (!isSection(node.section)) continue;
    const facts: SuggestionFacts = {
      section: node.section,
      cellarName: node.cellarName,
      bottleCount: node.bottleCount,
      logCount: node.logCount,
      friendName: node.friend?.displayName ?? null,
      friendBand: node.friendBand,
      friendCount: node.friendCount,
    };
    let row: AddEntryCandidate | null = null;
    if (entityType === "place" && node.place !== null) {
      row = {
        id: node.place.id,
        entityType,
        name: node.place.displayName ?? node.place.name,
        subtitle: placeEntrySubtitle(node.place),
        myScore: node.myScore,
      };
    } else if (
      entityType !== "place" &&
      node.item !== null &&
      node.item.type.toLowerCase() === entityType
    ) {
      row = {
        id: node.item.id,
        entityType,
        name: displayItemName(node.item.name),
        subtitle: itemEntrySubtitle(node.item),
        myScore: node.myScore,
      };
    }
    if (row === null) continue;
    row.reason = suggestionReason(facts, entityType);
    const list = bySection.get(node.section) ?? [];
    list.push(row);
    bySection.set(node.section, list);
  }
  return ADD_ENTRY_SECTIONS.flatMap((section) => {
    const rows = bySection.get(section) ?? [];
    return rows.length === 0 ? [] : [{ section, rows }];
  });
}

/* -------------------------------------------------------------------------- */
/* Picking several                                                             */
/* -------------------------------------------------------------------------- */

/** What is picked, keyed by `candidateKey`, in the order picked. */
export type Picks = ReadonlyMap<string, AddEntryCandidate>;

/** Picks with `candidate` added, or taken out if it was already in. */
export function togglePick(picks: Picks, candidate: AddEntryCandidate): Picks {
  const key = candidateKey(candidate);
  const next = new Map(picks);
  if (next.has(key)) next.delete(key);
  else next.set(key, candidate);
  return next;
}

/** The footer's action: "Add 1 entry", "Add 3 entries". */
export function addButtonLabel(count: number): string {
  if (count <= 0) return "Pick what to add";
  return `Add ${count} ${count === 1 ? "entry" : "entries"}`;
}

/**
 * The toast after a multi-add. When everything picked went on, one entry is
 * named with its band ("Added Barolo to Outstanding") and several are
 * counted ("Added 3 entries"); when the server passed some over (already on
 * the list by then, say), it is counted and said.
 */
export function addedMessage(
  picked: readonly AddEntryCandidate[],
  added: number,
  skipped: number,
): string {
  const [only] = picked;
  if (skipped === 0 && added === picked.length) {
    if (added === 1 && only !== undefined) {
      return `Added ${only.name} to ${BAND_LABELS[bandForScore(only.myScore)]}`;
    }
    return `Added ${added} entries`;
  }
  if (added === 0) return "Already on this list";
  const tail = ` · ${skipped} ${skipped === 1 ? "was" : "were"} already on it`;
  return `Added ${added} ${added === 1 ? "entry" : "entries"}${tail}`;
}

/* -------------------------------------------------------------------------- */
/* Try this next                                                               */
/* -------------------------------------------------------------------------- */

export type TryNextReason = "FRIEND_RANKED" | "LIKE_TOP" | "LIKE_LOVED";

export type TryNextFacts = {
  reason: string;
  friendName?: string | null;
  friendBand?: number | null;
  friendCount?: number | null;
  likeName?: string | null;
  likeBand?: number | null;
};

/**
 * Why a card is in Try this next — "Riley ranks it Outstanding", "Like
 * Barolo Cannubi, which you ranked Outstanding", "Like Barolo Cannubi, which
 * you love" — or `null` for a reason this client does not know, which the
 * caller drops rather than show a card it cannot explain.
 */
export function tryNextReason(
  facts: TryNextFacts,
  isOwner: boolean,
): string | null {
  switch (facts.reason) {
    case "FRIEND_RANKED": {
      const who = facts.friendName?.trim() || "A friend";
      const more = Math.max(0, (facts.friendCount ?? 1) - 1);
      const tail =
        more === 0
          ? ""
          : `, as ${more === 1 ? "does 1 more friend" : `do ${more} more friends`}`;
      return `${who} ranks it ${bandWord(facts.friendBand)}${tail}`;
    }
    case "LIKE_TOP": {
      const like = facts.likeName ? displayItemName(facts.likeName) : null;
      if (like === null) return null;
      const band = bandWord(facts.likeBand);
      return isOwner
        ? `Like ${like}, which you ranked ${band}`
        : `Like ${like}, ranked ${band} here`;
    }
    case "LIKE_LOVED": {
      const like = facts.likeName ? displayItemName(facts.likeName) : null;
      return like === null ? null : `Like ${like}, which you love`;
    }
    default:
      return null;
  }
}
