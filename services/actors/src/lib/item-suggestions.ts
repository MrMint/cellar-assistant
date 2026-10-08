/**
 * The text-only AI seam for X19's "Suggest details" — the contract, the gates
 * and the loud default, in the shape `item-defaults.ts` set for the label read.
 *
 * ## What this is, and the one way it differs from a label read
 *
 * A label read *transcribes*: every value it returns is printed on the bottle
 * in the photograph, and `requireLegibleLabel` refuses an answer about a
 * photograph that holds no label. This seam has no photograph. It asks a text
 * model what it **knows** about a product named "Ridge Lytton Springs" by
 * "Ridge Vineyards" — and what a model knows about a named product it does not
 * recognise is a confident invention (`item-defaults.ts` measured exactly that:
 * a wine with no image came back as a Château d'Yquem at confidence 0.9).
 *
 * So the rules are tighter than the label read's, and three of them are
 * enforced here in code rather than asked for in the prompt:
 *
 * 1. **Only closed lists, plus region.** {@link SUGGESTIBLE_ITEM_FIELDS} is
 *    `country`, every attribute with a vocabulary (style, grape, roast…) and
 *    `region`. No number, date or year is ever asked for or accepted — an ABV,
 *    a vintage or a polish ratio recalled from memory is an invented number,
 *    and those differ bottle to bottle anyway. No free prose (description,
 *    tasting notes) either.
 * 2. **Abstention is a field, decoded first.** The schema opens with the
 *    model's own one-line account of the product and then `recognised`, and
 *    {@link requireRecognition} reads that verdict before anything else in the
 *    answer is believed: a `false` discards every suggestion even if the model
 *    also wrote some. Property order is generation order (`prompts.ts`).
 * 3. **Nothing is applied.** The result goes back to the form as "Suggested"
 *    chips (`AIDraftField source="suggested"`), each needing a tap; the save
 *    is the person's. Nothing here writes, and the actor stores nothing.
 *
 * The real provider lives in `ai/seams.ts` (`providerItemSuggestions`),
 * installed by `installAI()`; with no provider this module's default throws,
 * like every other seam's.
 */
import {
  byItemType,
  ConflictError,
  type Ctx,
  ITEM_ATTRIBUTE_KEY,
  type ItemType,
  itemAttributeEntries,
  ValidationError,
} from "@cellar-assistant/contracts";

/** One detail the pass may suggest: where it sits in a defaults answer. */
export type SuggestibleField = {
  /** The key: `country`, or a wire key inside the per-type bag. */
  readonly field: string;
  readonly on: "input" | "attributes";
};

/**
 * What a text-only pass may suggest, per type, in the order the model is asked
 * — `country` first, then the type's attributes in declaration order: every
 * one with a vocabulary, and `region`. Derived from `ITEM_TYPE_SPECS`, so a new
 * constrained attribute is suggestible the moment it is declared.
 */
export const SUGGESTIBLE_ITEM_FIELDS: Readonly<
  Record<ItemType, readonly SuggestibleField[]>
> = byItemType((type) => [
  { field: "country", on: "input" as const },
  ...itemAttributeEntries(type)
    .filter(
      ([key, attribute]) =>
        attribute.vocabulary !== null ||
        (key === "region" && attribute.kind === "text"),
    )
    .map(([field]) => ({ field, on: "attributes" as const })),
]);

export type ItemSuggestionsRequest = {
  readonly itemType: ItemType;
  /** The product name as the form holds it now. */
  readonly name: string;
  readonly brandName: string | null;
  /**
   * What is already known, in defaults shape (`country`, the per-type bag) —
   * context for the model, and never re-suggested.
   */
  readonly known: Readonly<Record<string, unknown>>;
  /** The empty, suggestible fields to ask about. Never empty (the gate). */
  readonly wanted: readonly SuggestibleField[];
};

export type ItemSuggestionsResult = {
  readonly abstained: boolean;
  /** The model's own account of what it took the product to be. */
  readonly note: string | null;
  /** Defaults-shaped: `country` and/or the per-type bag, `wanted` keys only. */
  readonly defaults: Record<string, unknown>;
  readonly model: string;
};

export type ItemSuggestionsProvider = (
  ctx: Ctx,
  request: ItemSuggestionsRequest,
) => Promise<ItemSuggestionsResult>;

/* -------------------------------------------------------------------------- */
/* The gates                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Refuse to ask when there is nothing to go on, or nothing to ask for.
 *
 * A blank name is the text-only twin of `requireExtractableInput`'s missing
 * photograph: asked about "a wine" and nothing else, a model names a famous
 * one. And a request with no empty suggestible field would spend a model call
 * to be told nothing — the form only offers the action when one is empty.
 */
export const requireSuggestibleInput = (
  request: ItemSuggestionsRequest,
): void => {
  if (request.name.trim().length < 2) {
    throw new ValidationError(
      "suggesting details needs the product's name — with nothing to go on, " +
        "a model answers with a well-known product rather than this one. " +
        "Nothing was asked.",
      "NOTHING_READ",
    );
  }
  if (request.wanted.length === 0) {
    throw new ValidationError(
      "every detail a suggestion could fill is already filled in, so there " +
        "is nothing to ask. Nothing was asked.",
    );
  }
};

/**
 * Read the model's verdict before believing anything else it said.
 *
 * - absent → `ConflictError`: `recognised` is required by the schema, so a
 *   provider that leaves it out is not honouring the schema (the judgement
 *   `requireLegibleLabel` makes for `labelIsLegible`). Reading the absence as
 *   `true` would turn a broken provider into a source of plausible inventions.
 * - `false` → the abstention: returns `false`, and the caller discards every
 *   suggestion in the answer, even ones the model also wrote.
 * - `true` → returns `true`.
 */
export const requireRecognition = (recognised: boolean | null): boolean => {
  if (recognised === null) {
    throw new ConflictError(
      "the model's detail-suggestion answer has no `recognised`, one of the " +
        "two fields the schema requires. Either the provider is not " +
        "constraining its sampler to the output schema, or the schema it was " +
        "given is not the one this seam builds. Treating the absence as " +
        "recognition would hand the form guesses about a product the model " +
        "never claimed to know, so it is refused instead.",
    );
  }
  return recognised;
};

/**
 * Keep only what was asked for: the `wanted` fields, non-blank, and not equal
 * to what is already known. Everything else in the answer — a number the
 * model volunteered, a field it was not asked about, a "suggestion" of the
 * value already in the form — is dropped here, whatever the prompt said.
 */
export const keepWanted = (
  type: ItemType,
  answer: Readonly<Record<string, unknown>>,
  request: Pick<ItemSuggestionsRequest, "known" | "wanted">,
): Record<string, unknown> => {
  const bagKey = ITEM_ATTRIBUTE_KEY[type];
  const answerBag = asRecord(answer[bagKey]);
  const knownBag = asRecord(request.known[bagKey]);
  const out: Record<string, unknown> = {};
  const bag: Record<string, unknown> = {};
  for (const { field, on } of request.wanted) {
    const value = on === "input" ? answer[field] : answerBag[field];
    if (typeof value !== "string" || value.trim() === "") continue;
    const known = on === "input" ? request.known[field] : knownBag[field];
    if (typeof known === "string" && known.trim() === value.trim()) continue;
    if (on === "input") out[field] = value.trim();
    else bag[field] = value.trim();
  }
  if (Object.keys(bag).length > 0) out[bagKey] = bag;
  return out;
};

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Which suggestible fields are empty in what the form holds — the `wanted` of
 * a request. A field counts as empty when it is absent, `null` or blank.
 */
export const emptySuggestibleFields = (
  type: ItemType,
  known: Readonly<Record<string, unknown>>,
): readonly SuggestibleField[] => {
  const bag = asRecord(known[ITEM_ATTRIBUTE_KEY[type]]);
  return SUGGESTIBLE_ITEM_FIELDS[type].filter(({ field, on }) => {
    const value = on === "input" ? known[field] : bag[field];
    return (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
    );
  });
};

/* -------------------------------------------------------------------------- */
/* The default                                                                 */
/* -------------------------------------------------------------------------- */

/** No provider: a `ConflictError` naming the fix, never an empty answer. */
export const unconfiguredItemSuggestions: ItemSuggestionsProvider =
  async () => {
    throw new ConflictError(
      "no AI provider is configured, so item details cannot be suggested — " +
        "`installAI()` installed nothing at boot. Set AI_PROVIDER=ollama for " +
        "a local model that needs no credentials. See services/actors/" +
        "README.md · Local AI.",
      "AI_UNCONFIGURED",
    );
  };

let provider: ItemSuggestionsProvider = unconfiguredItemSuggestions;

export const setItemSuggestionsProvider = (
  next: ItemSuggestionsProvider,
): void => {
  provider = next;
};

export const itemSuggestionsProvider = (): ItemSuggestionsProvider => provider;
