/**
 * The "Log a drink" sheet's state, as pure functions (X02).
 *
 * Kept out of the component so every rule here is a unit test rather than a
 * click: what a tag becomes, which suggestions are still worth showing, what
 * `logDrink` and `updateDrinkLog` are sent, and how an entry reads in a row.
 *
 * The tag rules are the server's own (`@cellar-assistant/contracts/check-ins`
 * — the same `normaliseCheckInTag` `CheckInActor` runs), so the sheet never
 * shows a chip the server would store differently.
 */
import {
  MAX_CHECK_IN_NOTE_LENGTH,
  MAX_CHECK_IN_TAGS,
  MIN_FLAVOUR_NOTE_LENGTH,
  normaliseCheckInTag,
} from "@cellar-assistant/contracts/check-ins";
import type { ApiItemType } from "@/components/cellar-api/itemTypes";

export { MAX_CHECK_IN_NOTE_LENGTH, MAX_CHECK_IN_TAGS };

/** What is being logged: always an item, sometimes the bottle it came from. */
export type LogSubject = {
  readonly itemType: ApiItemType;
  readonly itemId: string;
  readonly itemName: string;
  readonly bottle?: {
    readonly cellarId: string;
    readonly cellarItemId: string;
  } | null;
};

export type DraftPlace = { readonly id: string; readonly name: string };

export type LogDraft = {
  readonly score: number | null;
  readonly note: string;
  readonly tags: readonly string[];
  readonly place: DraftPlace | null;
  /** Friend user ids; only on a new log (companions are written once). */
  readonly companionIds: readonly string[];
  /** A verified upload of the viewer's own. */
  readonly photoFileId: string | null;
};

export const EMPTY_DRAFT: LogDraft = {
  score: null,
  note: "",
  tags: [],
  place: null,
  companionIds: [],
  photoFileId: null,
};

/** The fields an existing entry brings into edit mode. */
export type EditableEntry = {
  readonly score: number | null;
  readonly note: string | null;
  readonly tags: readonly string[];
  readonly place: {
    readonly id: string;
    readonly name: string;
    readonly displayName?: string | null;
  } | null;
  readonly photo: { readonly id: string } | null;
};

export const draftFromEntry = (entry: EditableEntry): LogDraft => ({
  score: entry.score,
  note: entry.note ?? "",
  tags: [...entry.tags],
  place:
    entry.place === null
      ? null
      : {
          id: entry.place.id,
          name: entry.place.displayName ?? entry.place.name,
        },
  companionIds: [],
  photoFileId: entry.photo?.id ?? null,
});

export type TagResult =
  | { readonly ok: true; readonly tags: readonly string[] }
  | {
      readonly ok: false;
      readonly tags: readonly string[];
      readonly message: string;
    };

/**
 * `raw` added to `tags`: normalised the server's way, a duplicate is a no-op,
 * and the twelfth is the last. Never throws — the sheet shows `message`.
 */
export const addTag = (tags: readonly string[], raw: string): TagResult => {
  let tag: string | null;
  try {
    tag = normaliseCheckInTag(raw);
  } catch (error) {
    return {
      ok: false,
      tags,
      message: error instanceof Error ? error.message : "That tag is too long.",
    };
  }
  if (tag === null || tags.includes(tag)) return { ok: true, tags };
  if (tags.length >= MAX_CHECK_IN_TAGS) {
    return {
      ok: false,
      tags,
      message: `A log takes at most ${MAX_CHECK_IN_TAGS} tags.`,
    };
  }
  return { ok: true, tags: [...tags, tag] };
};

export const removeTag = (
  tags: readonly string[],
  tag: string,
): readonly string[] => tags.filter((value) => value !== tag);

export const toggleId = (
  ids: readonly string[],
  id: string,
): readonly string[] =>
  ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];

/* -------------------------------------------------------------------------- */
/* Suggested flavours                                                          */
/* -------------------------------------------------------------------------- */

/** What "the same note" means for not asking twice: trimmed, case-folded. */
export const noteKey = (note: string): string =>
  note.trim().replace(/\s+/g, " ").toLowerCase();

/** Punctuation and symbols that are not a word (ASCII, and the common typographic ones). */
const NOT_A_LETTER = /[\s!-/:-@[-`{-~\u2010-\u2027\u3000-\u3003\u00a0-\u00bf]/;

/**
 * Letters and digits in `text`, in any script — the server's `\p{L}\p{N}`
 * count, without a `u`-flag regex (this bundle targets ES5).
 */
const letterCount = (text: string): number =>
  Array.from(text).filter((ch) => !NOT_A_LETTER.test(ch)).length;

/**
 * Whether a note is worth a model call: three letters at least (the server's
 * own pre-model gate), and not the note last asked about.
 */
export const shouldSuggest = (
  note: string,
  lastAsked: string | null,
): boolean => {
  const key = noteKey(note);
  if (letterCount(key) < MIN_FLAVOUR_NOTE_LENGTH) return false;
  return key !== lastAsked;
};

export type FlavourSuggestion = {
  readonly tag: string;
  readonly evidence: string;
};

/** Suggestions not yet taken or dismissed — taken ones become real tags. */
export const openSuggestions = (
  suggestions: readonly FlavourSuggestion[],
  tags: readonly string[],
  dismissed: readonly string[],
): FlavourSuggestion[] =>
  suggestions.filter(
    (suggestion) =>
      !tags.includes(suggestion.tag) && !dismissed.includes(suggestion.tag),
  );

/* -------------------------------------------------------------------------- */
/* What the mutations are sent                                                 */
/* -------------------------------------------------------------------------- */

export type LogDrinkVariables = {
  item?: { type: ApiItemType; id: string };
  bottle?: { cellarId: string; cellarItemId: string };
  score?: number;
  note?: string;
  tags?: string[];
  placeId?: string;
  photoFileId?: string;
  companionIds?: string[];
};

/** `logDrink`'s input: only what was given, the bottle when there is one. */
export const logInput = (
  subject: LogSubject,
  draft: LogDraft,
): LogDrinkVariables => {
  const note = draft.note.trim();
  return {
    item: { type: subject.itemType, id: subject.itemId },
    ...(subject.bottle ? { bottle: { ...subject.bottle } } : {}),
    ...(draft.score === null ? {} : { score: draft.score }),
    ...(note === "" ? {} : { note }),
    ...(draft.tags.length === 0 ? {} : { tags: [...draft.tags] }),
    ...(draft.place === null ? {} : { placeId: draft.place.id }),
    ...(draft.photoFileId === null ? {} : { photoFileId: draft.photoFileId }),
    ...(draft.companionIds.length === 0
      ? {}
      : { companionIds: [...draft.companionIds] }),
  };
};

export type UpdateDrinkLogVariables = {
  score?: number | null;
  note?: string | null;
  tags?: string[];
  placeId?: string | null;
  photoFileId?: string | null;
};

const sameTags = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((tag, index) => tag === b[index]);

/**
 * `updateDrinkLog`'s patch: only the fields that changed, `null` clearing.
 * Empty when nothing did — the sheet then closes without a write.
 */
export const updateInput = (
  before: LogDraft,
  after: LogDraft,
): UpdateDrinkLogVariables => {
  const patch: UpdateDrinkLogVariables = {};
  if (before.score !== after.score) patch.score = after.score;
  const note = after.note.trim();
  if (before.note.trim() !== note) patch.note = note === "" ? null : note;
  if (!sameTags(before.tags, after.tags)) patch.tags = [...after.tags];
  if ((before.place?.id ?? null) !== (after.place?.id ?? null)) {
    patch.placeId = after.place?.id ?? null;
  }
  if (before.photoFileId !== after.photoFileId) {
    patch.photoFileId = after.photoFileId;
  }
  return patch;
};

/* -------------------------------------------------------------------------- */
/* How an entry reads                                                          */
/* -------------------------------------------------------------------------- */

/** "Sam", "Sam and Ana", "Sam, Ana and Lee", "Sam, Ana and 2 others". */
export const joinNames = (names: readonly string[]): string => {
  const shown = names.filter((name) => name.trim() !== "");
  if (shown.length === 0) return "";
  if (shown.length === 1) return shown[0] ?? "";
  if (shown.length <= 3) {
    return `${shown.slice(0, -1).join(", ")} and ${shown.at(-1) ?? ""}`;
  }
  const rest = shown.length - 2;
  return `${shown.slice(0, 2).join(", ")} and ${rest} others`;
};

/**
 * The secondary line of a log row: who with and where — "with Sam and Ana ·
 * at The Corner Bar". Empty when it was neither.
 */
export const entryContext = (entry: {
  readonly companionNames: readonly string[];
  readonly placeName: string | null;
}): string =>
  [
    entry.companionNames.length > 0
      ? `with ${joinNames(entry.companionNames)}`
      : null,
    entry.placeName === null ? null : `at ${entry.placeName}`,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
