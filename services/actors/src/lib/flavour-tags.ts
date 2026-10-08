/**
 * X02 · "a typed note becomes suggested flavour chips via an abstaining seam".
 *
 * `CheckInActor.suggestFlavourTags` calls {@link flavourTagSuggester}; the
 * production implementation is `providerFlavourTags` in `./ai/seams.ts`,
 * installed by `installAI()`. With no provider configured the default below
 * throws, naming itself — configured or loudly broken, never quietly
 * plausible (the `seams.ts` rule).
 *
 * The output is **suggestions** and nothing more: the client renders them as
 * `AIDraftField source="suggested"` chips that do nothing until the drinker
 * taps one, and nothing on the server writes them anywhere. They are never
 * applied to a log, and never to the shared catalog.
 *
 * ## Grounding, which the model cannot be trusted to do
 *
 * {@link groundFlavourTags} is deterministic and runs on every answer:
 *
 * - an entry whose `evidence` is not in the note as whole words (whitespace,
 *   case and punctuation aside) is dropped — the model was asked to copy it,
 *   so a miss is an invention; and "pear" is not in "appearance";
 * - an entry with a tag word not drawn from its own evidence is dropped:
 *   "lemon zest" may become "lemon", never "citrus"; "burnt toast" may not
 *   become "burnt sugar"; "great night" may become nothing at all. "Drawn
 *   from" is a shared four-letter stem ("cherries" → "cherry") or a short
 *   suffix on a word of three letters or more ("oak" → "oaky") — never a
 *   one-letter word ("a" → "apple") or a long one ("bit" → "bitter");
 * - tags already on the log are not suggested again, duplicates collapse, and
 *   at most {@link MAX_FLAVOUR_SUGGESTIONS} survive.
 *
 * What survives is a word the drinker wrote, tidied.
 */
import type {
  Ctx,
  FlavourTagSuggestionDto,
  ItemType,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  MAX_FLAVOUR_SUGGESTIONS,
  MIN_FLAVOUR_NOTE_LENGTH,
  normaliseCheckInTag,
} from "@cellar-assistant/contracts";

export type FlavourTagRequest = {
  readonly note: string;
  readonly itemType: ItemType;
  readonly existing: readonly string[];
};

export type FlavourTagSuggester = (
  ctx: Ctx,
  request: FlavourTagRequest,
) => Promise<FlavourTagSuggestionDto>;

export const unconfiguredFlavourTagSuggester: FlavourTagSuggester =
  async () => {
    throw new ConflictError(
      "no AI provider is configured to suggest flavour tags from a note. " +
        "`CheckInActor.suggestFlavourTags` needs AI_PROVIDER set — " +
        "`installAI()` installed nothing at boot. Set AI_PROVIDER=ollama for " +
        "a local model that needs no credentials. See services/actors/README.md.",
      "AI_UNCONFIGURED",
    );
  };

let suggester: FlavourTagSuggester = unconfiguredFlavourTagSuggester;

export const setFlavourTagSuggester = (next: FlavourTagSuggester): void => {
  suggester = next;
};

export const flavourTagSuggester = (): FlavourTagSuggester => suggester;

/** The abstention every caller can return without asking a model. */
export const NO_FLAVOUR_TAGS: FlavourTagSuggestionDto = {
  abstained: true,
  tags: [],
};

/** Whitespace collapsed, lower case — what "is this text in the note" compares. */
const comparable = (text: string): string =>
  text.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The pre-model gate: a note too short to name a flavour is an abstention
 * without a call (and without a charge).
 */
export const noteIsWorthAsking = (note: string): boolean =>
  comparable(note).replace(/[^\p{L}\p{N}]+/gu, "").length >=
  MIN_FLAVOUR_NOTE_LENGTH;

/** "cherries" and "cherry" share `cher`. */
const STEM = 4;
/** "oak" → "oaky", "smoke" → "smokey": a suffix this long, on a real word. */
const MAX_SUFFIX = 2;
const MIN_ROOT = 3;
const words = (text: string): string[] =>
  comparable(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
const stem = (word: string): string => word.slice(0, STEM);

/** One tag word is drawn from one evidence word. */
const drawnFrom = (word: string, candidate: string): boolean =>
  candidate.startsWith(stem(word)) ||
  (candidate.length >= MIN_ROOT &&
    word.startsWith(candidate) &&
    word.length - candidate.length <= MAX_SUFFIX);

/** Every word of the tag comes from a word of its evidence. */
const drawnFromEvidence = (tag: string, evidence: string): boolean => {
  const evidenceWords = words(evidence);
  const tagWords = words(tag);
  return (
    tagWords.length > 0 &&
    tagWords.every((word) =>
      evidenceWords.some((candidate) => drawnFrom(word, candidate)),
    )
  );
};

/** `needle`'s words appear in `haystack`, contiguous and whole. */
const containsWords = (
  haystack: readonly string[],
  needle: readonly string[],
): boolean => {
  if (needle.length === 0) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) {
      return true;
    }
  }
  return false;
};

/** One model entry, before grounding. */
export type FlavourTagCandidate = {
  readonly tag: string | null;
  readonly evidence: string | null;
};

/**
 * Keep only the candidates the note itself supports. Pure, so the rules above
 * are tested without a model (`flavour-tags.test.ts`).
 */
export const groundFlavourTags = (
  note: string,
  candidates: readonly FlavourTagCandidate[],
  existing: readonly string[],
): FlavourTagSuggestionDto => {
  const haystack = words(note);
  const taken = new Set(
    existing
      .map((tag) => {
        try {
          return normaliseCheckInTag(tag);
        } catch {
          return null;
        }
      })
      .filter((tag): tag is string => tag !== null),
  );
  const tags: { tag: string; evidence: string }[] = [];
  for (const candidate of candidates) {
    if (tags.length >= MAX_FLAVOUR_SUGGESTIONS) break;
    if (candidate.tag === null || candidate.evidence === null) continue;
    if (!containsWords(haystack, words(candidate.evidence))) continue;
    const evidence = comparable(candidate.evidence);
    let tag: string | null;
    try {
      tag = normaliseCheckInTag(candidate.tag);
    } catch {
      continue; // longer than a tag may be: a sentence, not a flavour
    }
    if (tag === null || words(tag).length > 3) continue;
    if (!drawnFromEvidence(tag, evidence)) continue;
    if (taken.has(tag)) continue;
    taken.add(tag);
    tags.push({ tag, evidence: candidate.evidence.trim() });
  }
  return { abstained: tags.length === 0, tags };
};
