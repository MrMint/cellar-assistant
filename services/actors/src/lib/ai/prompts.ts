/**
 * The prompts and output schemas the five seams ask for.
 *
 * Kept apart from `seams.ts` so that changing what the model is *asked* never
 * touches the wiring, and so that a prompt regression is a one-file diff. Every
 * schema here is `JsonSchema` (this port's structural subset) rather than
 * `JSONSchema7` from `@types/json-schema` — see `types.ts`.
 *
 * ## What survived the port from `functions/` and what did not
 *
 *  - **Tier-list insights** keeps the Nhost function's six-field output schema
 *    (`palateProfile`, `blindSpots`, `hotTake`, `archetype`,
 *    `archetypeDescription`, `recommendation`) and its voice, so an
 *    `ai_insights` row written by the new stack is the same shape the frontend
 *    already reads.
 *
 *    **B7b gave it back its raw material.** This paragraph used to say the
 *    port could not keep it: B7's seam handed over `TierListItemDto`s, which
 *    carry an entry's type and id but not its name, so every ranked row
 *    rendered as the bare word `place`. `InsightsGenerator` now takes resolved
 *    entries — name, categories or vocabulary attributes, location, editorial
 *    summary, public rating and price level — read from `places` and the six
 *    item tables by `TierListActor` itself (a §1.1 FK read, not a new §8.5
 *    edge). Two things the old function did that this does not: it refused
 *    every list whose `list_type` was not `place`, and it listed all six
 *    output fields as `required`. See `INSIGHTS_SCHEMA` for why the second was
 *    actively harmful.
 *  - **Item defaults keeps the enum-constrained schema** (X1b). The Nhost
 *    version generated its schema at runtime from ten reference tables
 *    (`shared-enums.ts`), so `style`, `country`, `roast_level` and friends were
 *    `enum`s the model could not miss. The port dropped that, on the grounds
 *    that reaching `ReferenceDataActor` would put a second sidecar hop inside
 *    `ItemOnboardingActor.start`'s turn. `vocabulary.ts` restores it without
 *    the hop: the ten tables are read straight from the database, once per
 *    process, and `itemDefaultsSchema` is built against that. The required
 *    attributes per type still come from `REQUIRED_ITEM_ATTRIBUTES` in
 *    `@cellar-assistant/contracts`, so the model is asked for everything
 *    `ItemActor.create` will insist on.
 *
 *    **The enum is a correctness constraint, not a truthfulness one.** It stops
 *    `style: "Chardonnay"` reaching a column whose five legal values are
 *    `DESSERT`/`RED`/`ROSE`/`SPARKLING`/`WHITE`; it does nothing whatever about
 *    a wine the model invented, which simply becomes a *well-formed* invention.
 *    Abstention is `../item-defaults.ts`'s `requireExtractableInput`.
 */
import type { ItemType, ScannedItemType } from "@cellar-assistant/contracts";
import {
  ConflictError,
  ITEM_ATTRIBUTE_KEY,
  ITEM_TYPES,
  RECIPE_CATEGORIES,
  RECIPE_TYPES,
  REQUIRED_ITEM_ATTRIBUTES,
  SCANNED_ITEM_TYPES,
} from "@cellar-assistant/contracts";
import type { MenuMatchVerificationRequest } from "../menu-ai.ts";
import type { JsonSchema } from "./types.ts";
import type { ConstrainedAttribute, ItemVocabulary } from "./vocabulary.ts";
import {
  allowedValues,
  CONSTRAINED_ITEM_ATTRIBUTES,
  DATE_ITEM_ATTRIBUTES,
  isSentUnconstrained,
} from "./vocabulary.ts";

const string_ = (description: string): JsonSchema => ({
  type: "string",
  description,
});
const number_ = (description: string): JsonSchema => ({
  type: "number",
  description,
});

/* -------------------------------------------------------------------------- */
/* B7 · tier-list insights                                                     */
/* -------------------------------------------------------------------------- */

/** Verbatim from `functions/generateTierListInsights/_prompts.ts`. */
export const INSIGHTS_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    palateProfile: string_("2-4 sentences, second person, plain text only."),
    blindSpots: string_("2-3 sentences, encouraging tone, plain text only."),
    hotTake: string_("One punchy sentence, plain text only."),
    archetype: string_(
      "2-4 word label, title case. e.g. 'The Adventurous Purist'.",
    ),
    archetypeDescription: string_(
      "One sentence explaining the archetype, plain text only.",
    ),
    recommendation: string_(
      "1-2 sentences suggesting a type or style to try (never a specific venue).",
    ),
  },
  /**
   * Two of the six, not all six (B7b).
   *
   * `required` is not a request — it compiles into the sampler's grammar, so a
   * listed field cannot be omitted and "I could not tell from this list" is
   * not a reachable completion for it. That is how `item-defaults.ts` measured
   * an entire invented wine at confidence 0.9, and four of these fields are
   * exactly the kind that can be unanswerable: `blindSpots` on a list that is
   * deliberately narrow, `hotTake` on a list with no outlier to react to,
   * `recommendation` on a list too uniform to extrapolate from.
   *
   * The two that stay are the two the card is *built* around — the archetype
   * chip and the palate paragraph — and both are answerable from any list the
   * `requireGroundedEntries` gate lets through. The prompt still asks for all
   * six; the schema just stops forcing four of them.
   *
   * This is safe at the frontend, which was checked rather than assumed:
   * `src/components/tier-list-api/TierListInsights.tsx` maps
   * `INSIGHT_SECTIONS` and then `.filter((section) => section.text !== null)`,
   * and renders `archetype` behind its own null check. A missing field is a
   * section that does not appear — not the blank panel this list used to be
   * justified by.
   */
  required: ["palateProfile", "archetype"],
};

export const INSIGHTS_FIELDS = [
  "palateProfile",
  "blindSpots",
  "hotTake",
  "archetype",
  "archetypeDescription",
  "recommendation",
] as const;

/**
 * The fields the seam refuses an answer without — **read off the schema**, not
 * typed out again.
 *
 * `seams.ts` used to require all six while this schema required two, and the
 * disagreement was not theoretical: it meant a model that declined one of the
 * four optional fields failed the whole generation. Deriving the list from
 * `INSIGHTS_SCHEMA.required` makes the two statements one statement, so
 * changing what the sampler is forced to produce also changes what the parser
 * insists on.
 */
export const INSIGHTS_REQUIRED_FIELDS: readonly string[] =
  INSIGHTS_SCHEMA.required ?? [];

const BAND_LABELS: Readonly<Record<number, string>> = {
  5: "Outstanding",
  4: "Very Good",
  3: "Good",
  2: "Mediocre",
  1: "Bad",
  0: "Unrated",
};

/** `$`…`$$$$`, the old function's rendering of `price_level`. */
const PRICE_LEVELS: Readonly<Record<number, string>> = {
  0: "Free",
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
};

/** One ranked entry as the prompt needs it — `TierListInsightsEntry`, structurally. */
type InsightsEntry = {
  readonly ref: { readonly type: string; readonly id: string };
  readonly name: string | null;
  readonly attributes: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly location: string | null;
  readonly summary: string | null;
  readonly publicRating: number | null;
  readonly publicRatingCount: number | null;
  readonly priceLevel: number | null;
  readonly band: number;
  readonly position: number;
  readonly notes: string | null;
};

const unique = (values: readonly (string | null)[]): readonly string[] =>
  Array.from(
    new Set(values.filter((value): value is string => value !== null)),
  );

/** `{Public rating: 4.5 from 1,200 reviews, $$}`, or nothing. */
const crowdSuffix = (entry: InsightsEntry): string => {
  const parts: string[] = [];
  if (entry.publicRating !== null) {
    const count =
      entry.publicRatingCount === null || entry.publicRatingCount === 0
        ? ""
        : ` from ${entry.publicRatingCount.toLocaleString("en-US")} reviews`;
    parts.push(`Public rating: ${entry.publicRating}/5${count}`);
  }
  if (entry.priceLevel !== null) {
    parts.push(
      PRICE_LEVELS[entry.priceLevel] ?? `price level ${entry.priceLevel}`,
    );
  }
  return parts.length === 0 ? "" : ` {${parts.join(", ")}}`;
};

const entryLine = (entry: InsightsEntry, index: number): string => {
  const band = BAND_LABELS[entry.band] ?? "Unrated";
  // A name that did not resolve degrades to the type, which is what every line
  // looked like before B7b — never to a blank, which reads as a nameless thing
  // the model is free to fill in.
  const name = entry.name ?? `(unnamed ${entry.ref.type.toLowerCase()})`;
  const facts = [
    ...entry.attributes.map((a) => `${a.label}: ${a.value}`),
    ...(entry.location === null ? [] : [entry.location]),
  ];
  const parenthetical = facts.length === 0 ? "" : ` (${facts.join(" | ")})`;
  const note = entry.notes === null ? "" : ` — note: "${entry.notes}"`;
  return (
    `${index + 1}. ${name} [${band}, #${entry.position + 1} in tier]` +
    `${parenthetical}${crowdSuffix(entry)}${note}`
  );
};

/**
 * B7b: built from resolved entries, not from `type` and a uuid.
 *
 * The shape follows the Nhost function's — identified rankings, then summary
 * statistics, then the crowd-consensus contrast, then "what these are known
 * for" — because that prompt's substance is what §6 B7b asks to match. Two
 * deliberate differences: it handles all seven entry types rather than
 * refusing every non-`place` list, and each optional block still disappears
 * when its data is absent, so a list with no enrichment is not padded with
 * empty headings the model would feel obliged to fill.
 */
export const buildInsightsPrompt = (input: {
  readonly name: string;
  readonly description: string | null;
  readonly listType: string;
  readonly entries: readonly InsightsEntry[];
}): string => {
  const { entries } = input;
  const rows = entries.map(entryLine).join("\n");

  const counts = [5, 4, 3, 2, 1, 0]
    .map(
      (band) =>
        `${BAND_LABELS[band]}: ${entries.filter((e) => e.band === band).length}`,
    )
    .join(", ");

  const types = unique(entries.map((e) => e.ref.type)).join(", ");
  const categories = unique(
    entries.flatMap((e) => e.attributes.map((a) => a.value)),
  );
  const locations = unique(entries.map((e) => e.location));
  const named = entries.filter((e) => e.name !== null).length;

  const high = entries.filter((e) => e.band >= 4).length;
  const low = entries.filter((e) => e.band <= 2 && e.band > 0).length;
  const mid = entries.filter((e) => e.band === 3).length;
  const shape =
    high > entries.length * 0.5
      ? "generous (mostly high ratings)"
      : low > high
        ? "critical (more low ratings than high)"
        : mid > entries.length * 0.4
          ? "cautious (heavy in the middle)"
          : "balanced (spread across tiers)";

  const rated = entries.filter((e) => e.publicRating !== null);
  const averagePublic =
    rated.length === 0
      ? null
      : (
          rated.reduce((sum, e) => sum + (e.publicRating ?? 0), 0) /
          rated.length
        ).toFixed(1);

  const crowdBlock =
    averagePublic === null
      ? ""
      : `

## Public Ratings Data
- Entries with a public rating: ${rated.length}/${entries.length}
- Average public rating across them: ${averagePublic}/5

Compare the user's own ranking against crowd consensus. Do they favour hidden
gems (low public rating, high tier) or crowd favourites? Where they disagree
with the crowd is one of the most revealing signals about a rater.`;

  const knownFor = entries
    .filter((e) => e.summary !== null)
    .map((e) => `- ${e.name ?? e.ref.type}: ${e.summary}`)
    .join("\n");
  const knownForBlock =
    knownFor === ""
      ? ""
      : `

## What These Are Known For
${knownFor}

Use these to understand what each entry actually is, rather than relying on
category labels alone.`;

  return `You are a witty food and drink culture writer — warm but sharp, always grounded in specifics, like a perceptive friend affectionately roasting someone.

You are analyzing a user's ranked tier list.

## About This List
- Name: "${input.name}"${input.description === null ? "" : `\n- Description: "${input.description}"`}
- Type: ${input.listType}
The name and description reveal the user's intent — use them.

## Rankings (highest to lowest)
${rows}

## Summary
- Total entries: ${entries.length}
- Entry types: ${types || "none"}
- Named entries: ${named}/${entries.length}
- Categories and attributes: ${categories.join(", ") || "none recorded"}
- Places and regions (${locations.length}): ${locations.join("; ") || "none recorded"}
- Distribution: ${counts}
- Distribution shape: ${shape}
- Entries carrying a personal note: ${entries.filter((e) => e.notes !== null).length}${crowdBlock}${knownForBlock}

Ground every observation in the entries above — their names, attributes,
locations and the user's own notes. Do not invent an entry, a place, a producer
or a cuisine that is not listed here. Where the data does not support a field,
leave that field out rather than inventing something to fill it.

## What to generate
1. **palateProfile** — a personality-style description of this person's taste, second person, 2-4 sentences. Required.
2. **blindSpots** — what is missing, encouraging, 2-3 sentences. Omit if the list is too narrow to tell.
3. **hotTake** — one punchy opinionated sentence about the most interesting thing in the rankings, naming at least one entry. Omit if nothing here is surprising.
4. **archetype** — a 2-4 word title-case label ("The Comfort Maximalist"). Required.
5. **archetypeDescription** — one sentence on what makes that archetype tick, specific to this data.
6. **recommendation** — 1-2 sentences suggesting a style or category to try. Never a specific venue or product. Omit if the list is too uniform to extrapolate from.

## Tone
- Plain text only. No markdown, no bullets.
- Second person.
- Witty and warm, not snarky.

## Avoid
- Generic compliments and observations that would fit anyone.
- Simply restating the numbers.
- Opening with "It appears that", "It seems like", "It's clear that", or "You are a".
- The word "eclectic".
- Repeating the same observation across fields.
- Recommending a specific venue or product — you only know what is listed above.`;
};

/* -------------------------------------------------------------------------- */
/* B2 · item onboarding defaults                                               */
/* -------------------------------------------------------------------------- */

/**
 * The label fields every type shares, plus the per-type bag. `defaults` is
 * stored verbatim in `item_onboardings.defaults`, and `confirm` feeds it to
 * `ItemActor.create`, so the bag key matches `ITEM_ATTRIBUTE_KEY`.
 *
 * ## Two decisions worth reading before changing this
 *
 * **Constrained fields carry an `enum`, built from the live reference tables**
 * (X1b, `vocabulary.ts`). Ollama compiles the schema into the sampler's
 * grammar, so an `enum` is the difference between a value the column accepts
 * and a foreign-key violation raised inside the outbox. **Except past
 * `MAX_SCHEMA_ENUM_VALUES` values** (`country`, 197). Vertex rejects the whole
 * schema with a 400 over an enum that big, so such a field goes out as text
 * listing its values and is normalised back afterwards (`vocabulary.ts`).
 *
 * **Nothing in the bag is `required`, including the `NOT NULL` columns.** It
 * used to be: `wine.vintage` and `wine.style` sat in the bag's `required` list
 * because `wines.vintage` and `wines.style` are `NOT NULL`. A grammar-level
 * `required` is not a request, it is a compulsion — the decoder *cannot* end
 * the object without emitting those keys, so "I could not read a vintage"
 * becomes structurally unsayable and the model emits a plausible year instead.
 * Measured: adding the bag to `required` turned an empty answer into
 * `{"vintage":"2005","style":"SPARKLING"}` for a wine that does not exist.
 * A `NOT NULL` column is a constraint on the *confirmed item*, not a licence to
 * invent; `missingRequiredAttributes` in the form is what enforces it, against
 * a person who can actually look at the bottle.
 */
export const itemDefaultsSchema = (
  type: ItemType,
  vocabulary: ItemVocabulary,
): JsonSchema => {
  const bagKey = ITEM_ATTRIBUTE_KEY[type];
  const required = REQUIRED_ITEM_ATTRIBUTES[type];
  const constrained = CONSTRAINED_ITEM_ATTRIBUTES[type];
  const dateFields = new Set(DATE_ITEM_ATTRIBUTES[type]);
  const inputFields = required.filter((r) => r.on === "input");

  /**
   * An `enum` while the vocabulary is small. Past `MAX_SCHEMA_ENUM_VALUES`
   * it is plain text with the values listed in the description, because
   * Vertex refuses the whole schema over a large enum (`400 INVALID_ARGUMENT`,
   * measured in `vocabulary.ts`). `providerItemDefaults` then maps the answer
   * back with `normaliseUnconstrainedAttributes`. `note`, when given, replaces
   * the advice. The list of values is kept either way.
   */
  const enumSchema = (
    attribute: ConstrainedAttribute,
    note?: string,
  ): JsonSchema => {
    const values = allowedValues(attribute, vocabulary);
    if (isSentUnconstrained(attribute, vocabulary)) {
      return {
        type: "string",
        description:
          `${note ?? "Omit it entirely rather than picking the nearest one."} ` +
          `If you give it, it must be one of the ${values.length} values ` +
          `${attribute.column} accepts, written exactly as listed: ` +
          `${values.join(", ")}.`,
      };
    }
    return {
      type: "string",
      enum: [...values],
      description:
        note ??
        `One of the ${values.length} values ${attribute.column} accepts. ` +
          "Omit it entirely rather than picking the nearest one.",
    };
  };

  /** The `NOT NULL` note, without the licence to guess that used to follow it. */
  const notNull = (column: string): string =>
    `${column} is NOT NULL, so the person cataloguing this has to supply it ` +
    "if you cannot read it. Leave it out rather than guessing.";

  const bagProperties: Record<string, JsonSchema> = {};
  for (const field of required.filter((r) => r.on === "attributes")) {
    const match = constrained.find(
      (c) => c.on === "attributes" && c.field === field.field,
    );
    bagProperties[field.field] =
      match === undefined
        ? string_(
            dateFields.has(field.field)
              ? `The calendar date, as YYYY-MM-DD. ${notNull(field.column)}`
              : notNull(field.column),
          )
        : enumSchema(match, notNull(field.column));
  }
  for (const attribute of constrained) {
    if (attribute.on !== "attributes") continue;
    bagProperties[attribute.field] ??= enumSchema(attribute);
  }
  for (const field of dateFields) {
    bagProperties[field] ??= string_(
      "The calendar date printed on the label, as YYYY-MM-DD.",
    );
  }

  const countryField = constrained.find(
    (c) => c.on === "input" && c.field === "country",
  );

  /**
   * **These two are first, and `Object.keys` order is what makes them work
   * (E2g).**
   *
   * `requireExtractableInput` refuses an extraction with *no* image. It does
   * not — could not — refuse one whose image contains no label, and the
   * measurement is that this is the same defect: sent the 1×1 grey pixel from
   * `packages/e2e/specs/09-menu-scan.spec.ts`, `gemma3:4b` answered
   * `{"name": "CHARDONNAY", "confidence": 1.0}` **3 runs of 3 at
   * `temperature: 0`**, identically. An invented grape at the maximum
   * confidence the column can hold, written to `item_onboardings.defaults`,
   * `COMPLETED`, and pre-filled into the wizard form.
   *
   * The shape is `MENU_EXTRACTION_SCHEMA`'s, ported (B8c → E2g); its three
   * measurements are written up there. The part that is easy to break here and
   * nowhere else: **this schema is assembled, not written out**, so the
   * ordering guarantee is JavaScript's own — a plain object preserves string
   * keys in insertion order, that order is the JSON the provider serialises,
   * and llama.cpp's `json_schema_to_grammar` builds the object rule in
   * declaration order. So the two fields are inserted *here*, at the head of
   * the literal, and everything the loops below add lands after them. Adding
   * them anywhere further down — or building this record by spreading it into
   * a fresh object with a different key order — silently restores the defect
   * and does it as a passing build.
   *
   * `labelIsLegible`, not `labelIsMissing`: a negatively-named verdict was
   * measured *inverting* on the menu seam, where a real menu the model read
   * correctly was then declared absent 3/3. The positive question is the one
   * a 4B model answers about the thing it just described.
   *
   * ## The two fields ask about provenance now, not legibility (E2h)
   *
   * E2g's version of these two descriptions was answered *correctly* and
   * still let the wrong thing through: sent a photograph of a restaurant
   * drinks list, gemma3:4b described it as "a drinks list for 'The Copper
   * Lantern'", answered `labelIsLegible: true`, and transcribed
   * `Chateau Margaux 2015` — a wine genuinely printed on that menu — with its
   * region, at `confidence: 1.0`, **4 runs of 4 at `temperature: 0`**.
   * Grounded, and wrong-sourced. `requireLegibleLabel` in `../item-defaults.ts`
   * carries the argument; what matters here is what changed and where it came
   * from.
   *
   * **It came from `RECIPE_PHOTO_SCHEMA`, which refuses that same photograph
   * 3/3.** The difference between the two verdict fields was never structural
   * — both are a positive question decided from a description decoded ahead
   * of them — it was *what their false-list names*. The recipe one names the
   * near-miss that actually tempts the model and says why it is disqualified
   * ("a photograph of a finished dish or drink … shows you the result, not
   * the method"). This one named only non-documents: a wall, a landscape, a
   * person, a glass already poured. A menu is a document, densely printed
   * with producers, vintages and regions, and it matched nothing the model
   * had been warned about.
   *
   * So the port is one mechanism, applied twice:
   *
   *  - `labelIsLegible` names the document-shaped near-misses — menu, drinks
   *    or wine list, price tag, shelf ticket, receipt, printed review, web
   *    page, phone screen — with the reason they are disqualified: they say
   *    what somebody sells, not what is in the container.
   *  - `imageDescription` is asked for one thing more than before: **what the
   *    text is printed on.** The verdict is decided from that sentence, so
   *    making the sentence carry the provenance is what gives the verdict
   *    something to decide from. It is also what the user ends up reading,
   *    because `requireLegibleLabel` quotes it back in the refusal.
   *
   * Measured after, same fixture, same temperature: the menu is `false` 4/4
   * and a genuine wine label is still read 4/4 (`DOMAINE SAINT-CLAIR`,
   * `SAUVIGNON_BLANC`, `confidence: 1.0`) — the over-correction this class of
   * fix fails by, checked for rather than assumed.
   */
  const properties: Record<string, JsonSchema> = {
    imageDescription: {
      type: "string",
      description:
        "Before you look for a label at all: one short sentence saying what " +
        "you can actually see in this image — and in particular, if there is " +
        "text in it, what that text is printed on: a bottle, a can, a box, a " +
        "printed list or menu, a page, a shelf ticket, a screen. If the " +
        "image is blank, featureless, or too small to contain anything, say " +
        "exactly that.",
    },
    labelIsLegible: {
      type: "boolean",
      description:
        "Decide this next, before transcribing anything, and decide it from " +
        `the description you just gave. True only when that description is of a ${type.toLowerCase()} ` +
        "container — a bottle, a can, a bag, a tin, a box — with its own " +
        "printed label facing you, readable. False when it is not that (a " +
        "blank page, a wall, a landscape, a person, an unrelated object, a " +
        "glass already poured); false when the label is there but has no " +
        `legible text on it; and false when the image is some other surface that names a ${type.toLowerCase()} ` +
        "without being its label — a menu, a drinks or wine list, a price " +
        "tag, a shelf ticket, a receipt, a printed review, a web page, a " +
        "phone screen. Those say what somebody sells or wrote about; only " +
        "the container's own label says what is inside it.",
    },
    name: string_("The product name exactly as printed on the label."),
    description: string_("2-3 sentences describing the product."),
    brandName: string_(
      "The producer or brand as printed ('Stone Brewing', 'Château Margaux').",
    ),
    region: string_("Region or appellation, if printed."),
    country:
      countryField === undefined
        ? string_("Country of origin.")
        : enumSchema(countryField),
    confidence: number_(
      "0 to 1 — how confident you are in this reading overall.",
    ),
    [bagKey]: {
      type: "object",
      description: `Attributes specific to a ${type.toLowerCase()}, as printed.`,
      properties: bagProperties,
    },
  };
  for (const field of inputFields) {
    properties[field.field] = string_(notNull(field.column));
  }

  return {
    type: "object",
    properties,
    /**
     * Four now: the two that ground the answer, then `name` and `confidence`.
     * Everything else — including the four `NOT NULL` attributes — stays
     * omittable, because the grammar is the one place the model cannot say
     * "I do not know".
     *
     * `name` and `confidence` are required *again*, and only because they are
     * now decoded after the verdict. A grammar constrains each token as it is
     * decoded and does not reach backwards: by the time `name` is forced,
     * `imageDescription` and `labelIsLegible` are already emitted and
     * committed, so compelling a name can no longer talk the model into a
     * bottle — it can only make it write something after it has already said
     * there is none, and `providerItemDefaults` stores none of that. Dropping
     * them instead would be the over-correction the menu seam measured, where
     * relaxing the transcription field emptied it on every *real* page.
     *
     * The rule, stated once and applying to all four: **a field may be
     * required when the model can answer it honestly at the point it is
     * decoded.**
     */
    required: ["imageDescription", "labelIsLegible", "name", "confidence"],
  };
};

export const buildItemDefaultsPrompt = (input: {
  readonly itemType: ItemType;
  readonly hasFront: boolean;
  readonly hasBack: boolean;
  readonly barcode: string | null;
  readonly barcodeType: string | null;
}): string => {
  const images: string[] = [];
  if (input.hasFront) images.push("the front label");
  if (input.hasBack) images.push("the back label");

  // An assertion, not a branch: `requireExtractableInput` in
  // `../item-defaults.ts` refuses the call before it reaches here. The prompt
  // this replaces said "You are given no photograph" and then asked for the
  // fields anyway, which is how E2c's Château d'Yquem was born.
  if (images.length === 0) {
    throw new ConflictError(
      "buildItemDefaultsPrompt was asked for a label-reading prompt with no " +
        "label. Extraction with no image is refused by " +
        "`requireExtractableInput`; reaching this line means a caller went " +
        "round it.",
    );
  }

  const type = input.itemType.toLowerCase();
  return `Someone is cataloguing a ${type} for a personal collection, and has uploaded ${images.join(" and ")} as ${images.length === 1 ? "an image" : "images"} believing ${images.length === 1 ? "it shows" : "they show"} its label. They are often wrong: it may be a blank page, a wall, a person, an unrelated object, a glass already poured, a menu or list that merely names a ${type}, or an image too small or too dark to hold any legible text at all.

Say what you can see, then decide whether this really is a ${type} label you can read. Only if it is, read every printed detail off it.${
    input.barcode === null
      ? ""
      : `\nThe scanned barcode is ${input.barcode}${input.barcodeType === null ? "" : ` (${input.barcodeType})`}. That is a lookup key for another system, not something to read a product off — it tells you nothing about what is in the image.`
  }

Return the fields in the schema. Rules:
- \`imageDescription\` comes first and is answered from the image alone, in one
  short sentence: what do you actually see, and what is any text in it printed
  on — a bottle, a can, a box, a printed list, a page, a screen? Answer that
  before you decide anything else, and then decide \`labelIsLegible\` from your
  own answer.
- \`labelIsLegible\` is **true** when the image shows a ${type} container with
  its own printed label facing you and that label is readable, and **false**
  when it does not — because it is not one, or because there is no legible
  text on it.
- **A surface that merely names a ${type} is not a ${type} label.** A menu, a
  drinks or wine list, a price tag, a shelf ticket, a receipt, a printed
  review, a web page or a phone screen can all carry a producer, a vintage and
  a region in perfectly clear type, and none of them is the label: they tell
  you what somebody sells or wrote about, not what is inside the container in
  front of you. That is \`labelIsLegible\` **false**, however legible the text
  is — and however certain you are which ${type} it names.
- **When \`labelIsLegible\` is false, leave every other field out. That is a
  correct and useful answer, not a failure.** "We could not read a label in
  that photo" is exactly what the person needs to hear; a plausible bottle
  they never photographed is the worst thing you can give them.
- Transcribe what is printed. Do not translate or tidy the product name.
- Every remaining field is optional. Leave one out entirely rather than
  supplying a value the image does not show you — an omitted field is filled
  in by the person cataloguing the item, which is a better outcome than a
  plausible wrong one.
- Do not infer a value from what is typical for this producer, this region or
  this category. You are transcribing a label, not recalling a catalogue.
- \`confidence\` is your honest overall confidence, 0 to 1. A blurry or partial
  label should score low. Do not inflate it.`;
};

/* -------------------------------------------------------------------------- */
/* B8 · menu extraction                                                        */
/* -------------------------------------------------------------------------- */

/**
 * **Two fields were added at the front, and that — not the `required` list —
 * is what stopped the invented menus (B8c).**
 *
 * A 1×1 grey pixel was scanned and produced an eighteen-item British pub menu
 * — `LOCAL IPA 5.4% - £4.50`, prices in sterling, `items_detected = 18`,
 * `processing_status = completed`. Nothing in the row distinguished it from a
 * real scan, and it reproduced 3 times out of 3 (20, 19 and 9 items,
 * `confidence: 1` every time).
 *
 * The obvious suspect was `required`, and the honest answer is that it was a
 * cause but not *the* cause. Three sections, in the order they were measured;
 * the second and third are the ones that did the work, and each was found only
 * because the change before it was shipped and then watched failing.
 *
 * ## 1 · `required` compiles into the sampler's grammar — necessary, not
 * sufficient
 *
 * The same finding `INSIGHTS_SCHEMA` above is annotated with and the one
 * `PLACE_REVIEW_SCHEMA` below cites: a listed field cannot be omitted, so
 * "there is nothing here to transcribe" was not a reachable completion for
 * `rawText`. The model was *held to* transcribing a page with no text on it,
 * and a transcription of nothing is an invention.
 *
 * But look at what `required` ends up being below: **all five fields, which is
 * the original three plus the two new ones.** Cutting the list to nothing did
 * not fix this, and cutting it too far actively broke real menus (see the
 * `required` list's own note). The defect was never really *which* fields were
 * forced. It was that the schema had **no field in which an abstention could
 * be expressed at all** — the only candidate, an empty `items`, was decoded
 * *after* a compelled transcription that had already invented the page. Adding
 * a channel for the answer mattered; relaxing the grammar around it did not.
 *
 * The rule worth carrying to the other schemas is therefore sharper than "use
 * less `required`": **every extraction schema needs a field whose value can
 * say "the input does not support an answer", and it has to be decoded before
 * the fields that would have to invent one.**
 *
 * ## 2 · Property order is generation order, and a bare verdict loses
 *
 * Ollama hands this object to llama.cpp's `json_schema_to_grammar`, which
 * builds an object rule in the order the properties are declared, so the model
 * decodes them in that order and each field is conditioned on the ones before
 * it. So the verdict has to come before `rawText` — declared after a menu had
 * already been written out, it would be answered by a model that does not
 * contradict its own transcript.
 *
 * That much was the first attempt, and **measured on gemma3:4b against the
 * 1×1 pixel it did not work**: 5 abstentions in 13 runs at the default
 * temperature, and at `temperature: 0` — greedy, so this is the argmax, not
 * the tail — the verdict said "menu" and a twelve-item cocktail list came with
 * it ("Mojito", "Margarita", "Long Island Iced Tea", …) **6 times out of 6,
 * identically**. Abstention was reachable and the model still did not reach
 * it: the prompt's premise that this is a menu dominates a lone verdict with
 * no evidence in front of it.
 *
 * `imageDescription` is what fixes that, and it is first for exactly the
 * reason the verdict is second. It forces one grounded sentence about the
 * pixels *before* the verdict, so the verdict is conditioned on the model's
 * own description rather than on the prompt. Same image, same greedy decoding,
 * with the field added: `"A solid grey image."` and no items, **3 of 3** — and
 * in 0.4s rather than 10s, because inventing a menu is most of the work. It is
 * chain-of-thought done through the grammar, which is the only place a
 * constrained decoder will accept it.
 *
 * **Reordering these properties is not cosmetic.** Moving `imageDescription`
 * or `menuIsLegible` below `rawText` silently restores the defect, and it
 * restores it as a passing build.
 *
 * ## 3 · The verdict is positive, and that is not a style choice
 *
 * It was `noMenuDetected: boolean` for one round, and that field **inverted**.
 * Given the real 900×1200 menu photograph, gemma3:4b described it correctly —
 * *"a printed menu titled \"THE COPPER LANTERN\" Drinks List, with sections
 * for Wine by the Glass, Draft Beer, Spirits"* — and then answered
 * `noMenuDetected: true`, 3 of 3 at `temperature: 0`. It had read the menu and
 * then said there was no menu, which is not a vision failure at all: a 4B
 * model answers the concept named in the field, and a field named for the
 * absence gets `true` from a model that found the thing.
 *
 * So the schema asks the positive question and the domain type keeps the
 * negative one. `MenuExtractionResult.noMenuDetected` is `!menuIsLegible`,
 * computed once in `providerMenuExtraction` — the two polarities are
 * deliberate, and the inversion is written down in one place rather than
 * guessed at in several. **Do not "tidy" this by renaming the schema field to
 * match the result field.** That is precisely the change that was measured
 * breaking every real menu.
 *
 * `confidence` is no longer required either: `providerMenuExtraction` already
 * substitutes `lines.length > 0 ? 0.5 : 0` for an absent one, so forcing the
 * field bought nothing and cost the model a way to decline it.
 */
export const MENU_EXTRACTION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    imageDescription: {
      type: "string",
      description:
        "Before you look for a menu at all: one short sentence saying what " +
        "you can actually see in this image. If it is blank, featureless, or " +
        "too small to contain anything, say exactly that.",
    },
    menuIsLegible: {
      type: "boolean",
      description:
        "Decide this next, before transcribing anything, and decide it from " +
        "the description you just gave. True when that description is of a " +
        "menu whose text you can actually read. False when it is not a menu " +
        "— a blank page, a wall, a landscape, a person, an object — or when " +
        "it is a menu with no legible text on it.",
    },
    rawText: string_(
      "Every word of text visible on the menu, transcribed verbatim, in " +
        "reading order. An empty string when there is no text to read — " +
        "never a description of the image, and never text you cannot see.",
    ),
    confidence: number_("0 to 1 — legibility and completeness of the page."),
    items: {
      type: "array",
      description: "One entry per drink or item listed on the menu.",
      // Left where it is, last: `items` is the expensive field, and every
      // field that precedes it is one the model has already committed to
      // before it starts writing lines.
      items: {
        type: "object",
        properties: {
          name: string_("The item's name exactly as the menu prints it."),
          description: string_("The menu's own description, if any."),
          price: number_("Price as a number, no currency symbol."),
          menuCategory: string_(
            "The menu's own section heading ('By the Glass', 'Draft').",
          ),
          itemType: {
            type: "string",
            enum: [...SCANNED_ITEM_TYPES],
            description: "Which kind of thing this is. 'unknown' if unclear.",
          },
          searchName: string_(
            "The normalised name to search a catalogue with — expand " +
              'abbreviations and vintages: "Ch. Margaux \'15 — glass" becomes ' +
              '"Château Margaux 2015".',
          ),
          confidence: number_("0 to 1 — confidence in this line specifically."),
        },
        required: ["name", "itemType"],
      },
    },
  },
  /**
   * `rawText` and `confidence` are required **again**, and only because they
   * are decoded after the verdict.
   *
   * Dropping them was over-correction, and it was measured: with all four
   * optional, gemma3:4b read the real 900×1200 menu correctly — the same
   * eight items, in 5.7–9.4s — and returned **`rawText: ""`** every time. That
   * empties `menu_scans.extracted_text`, which is the "What the scanner read"
   * panel on the scan page, and it trips `providerMenuExtraction`'s own
   * groundedness check, which reads items with no transcription as an
   * invention. The fix for confabulation had quietly broken every real scan.
   *
   * Requiring them is safe *here* and would not have been safe before, and the
   * difference is entirely the property order above. A grammar constrains each
   * token as it is decoded; it does not reach backwards. By the time `rawText`
   * is forced, `imageDescription` and `menuIsLegible` are already emitted and
   * committed, so a compelled transcription can no longer talk the model into
   * a menu — it can only make it write something after it has already said
   * there is none. Measured, that something is an apology: "This image does
   * not contain a legible menu.", "We could not find a menu in this photo",
   * " ". `providerMenuExtraction` drops `rawText` outright on abstention, so
   * none of it is ever stored.
   *
   * The rule this leaves behind is not "never use `required`". It is: **a
   * field may be required when the model can answer it honestly at the point
   * it is decoded.** `imageDescription` always can. The verdict always can.
   * `rawText` can, once the verdict is behind it. It could not when it came
   * first, and that is the whole of B8c.
   */
  required: [
    "imageDescription",
    "menuIsLegible",
    "rawText",
    "confidence",
    "items",
  ],
};

/**
 * The prompt no longer opens by telling the model it is looking at a menu.
 *
 * "You are reading a photograph of a drinks or food menu" is a premise, and a
 * premise is not something a model argues with — it read a menu off a grey
 * pixel because it had been told there was one. The photograph is now
 * described as *a photograph someone believes is a menu*, which makes "it is
 * not" an answer rather than a contradiction, and the first rule is the
 * decision rather than the transcription.
 *
 * The old last rule ("if the photograph is too blurred to read, return an
 * empty `items` array and a low `confidence`") was already trying to say this
 * and could not be obeyed, because `rawText` was `required` in the schema
 * beside it. A prompt cannot grant permission the grammar withholds; see
 * `MENU_EXTRACTION_SCHEMA`.
 */
export const buildMenuExtractionPrompt = (placeKnown: boolean): string =>
  `You are looking at a photograph that someone has uploaded believing it shows a drinks or food menu. They are often wrong: it may be a blank page, a wall, a table, a person, a landscape, or an image too small or too dark to hold any legible text at all.

Say what you can see, then decide whether this image really does show menu text you can read. Only if it does, transcribe it and break it into individual items.${
    placeKnown
      ? "\n\nThe scan is filed against a venue already known to this system. That is context for reading what is on the page — never a source of items, and never a reason to believe a page is a menu when it is not."
      : ""
  }

Rules:
- \`imageDescription\` comes first and is answered from the image alone, in one
  short sentence: what do you actually see? Answer that before you decide
  anything else, and then decide \`menuIsLegible\` from your own answer.
- \`menuIsLegible\` is **true** when you can read menu text in this image, and
  **false** when you cannot — because it is not a menu, or because there is no
  legible text on it.
- **When \`menuIsLegible\` is false, return no \`items\` and leave
  \`rawText\` empty. That is a correct and useful answer, not a failure.**
  "We could not find a menu in this photo" is exactly what the person needs to
  hear; a plausible menu they never photographed is the worst thing you can
  give them.
- Never write down an item, a price, a section heading or a word of \`rawText\`
  that you cannot actually see in this image. Do not fill the page from what a
  menu like this usually says.
- One entry per line item actually printed.
- \`name\` is the menu's own wording. \`searchName\` is your normalised version
  for catalogue lookup — expand abbreviations, producers and vintages.
- If a section lists a wine by the glass and by the bottle, that is two entries.
- \`itemType\` must be one of the listed values; use "unknown" rather than
  guessing between two.
- When \`menuIsLegible\` is true, \`rawText\` is a verbatim transcription of
  the whole page, including headings and prices — not a summary, and not a
  description of the image. Every item you list must appear in it.
- A page that is genuinely a menu but too blurred to read is \`menuIsLegible\`
  false, with a low \`confidence\`.`;

/* -------------------------------------------------------------------------- */
/* B8 · match verification (the 0.4–0.9 band)                                  */
/* -------------------------------------------------------------------------- */

export const MENU_MATCH_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    acceptedKey: string_(
      "The `key` of the candidate that is the same product, or the exact " +
        'string "none" if none of them is.',
    ),
    confidence: number_("0 to 1 — how sure you are of that decision."),
    reasoning: string_("One or two sentences explaining the decision."),
  },
  required: ["acceptedKey", "confidence", "reasoning"],
};

export const buildMenuMatchPrompt = (
  request: MenuMatchVerificationRequest,
): string => {
  const candidates = request.candidates
    .map(
      (candidate) =>
        `- key: ${candidate.key}\n  name: ${candidate.name}\n  vector similarity: ${candidate.similarity.toFixed(3)}`,
    )
    .join("\n");

  return `A menu line was matched against a catalogue by vector similarity, and the result is ambiguous. Decide whether any candidate is genuinely the same product.

## The menu line
- Type: ${request.itemType}
- Name as printed: ${request.menuItemName}
- Description: ${request.menuItemDescription ?? "(none)"}

## Candidates
${candidates}

## Rules
- Same producer and same product, allowing for the menu's abbreviations, is a
  match. A different vintage, expression, or size of the same producer's
  product is **not** a match.
- The vector similarity is a hint, not evidence. A high similarity between two
  different products of the same producer is exactly the case you are here to
  catch.
- If none of the candidates is the same product, set \`acceptedKey\` to the
  exact string "none". That is a real answer, not a failure.
- \`confidence\` is your confidence in the decision you made, including a
  decision of "none".`;
};

/* -------------------------------------------------------------------------- */
/* C4 · recipe photo                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The values `RECIPE_PHOTO_SCHEMA` asks an ingredient's `itemType` to take:
 * `ITEM_TYPES`, lowercased — `wine`, `beer`, `spirit`, `coffee`, `sake`,
 * `tea`. Singular, like the pre-migration schema's `database_item_type` and
 * like `generic_items.item_type`, so `genericFallback` can use the same
 * answer as a generic item's kind. Exported so the matcher's tests run on
 * exactly what the prompt requests.
 */
export const RECIPE_INGREDIENT_ITEM_TYPES: readonly string[] = ITEM_TYPES.map(
  (type) => type.toLowerCase(),
);

/**
 * **The same two fields, at the front, for the same measured reason
 * (B8c → C4c).**
 *
 * A 1×1 grey pixel — `packages/e2e/specs/09-menu-scan.spec.ts`'s fixture, 70
 * bytes and a genuine decode — was sent through this schema and came back as a
 * complete **"Chocolate Chip Cookies"**: nine ingredients, from `1 cup butter`
 * to `2 cups chocolate chips`, and `Preheat oven to 375 degrees F (190 degrees
 * C).` **3 runs of 3 at `temperature: 0`, byte-identical each time** — the
 * argmax, not a sampling tail. `RecipePhotoJobActor` would then have created
 * that recipe, resolved nine ingredients against the catalogue, and reported
 * the job `completed`.
 *
 * `MENU_EXTRACTION_SCHEMA` above carries the three measurements that found the
 * shape; they are not repeated here, but all three apply unchanged and two of
 * them are load-bearing enough to restate:
 *
 *  - **Property order is generation order.** Ollama hands this object to
 *    llama.cpp's `json_schema_to_grammar`, which builds the object rule in
 *    declaration order. `imageDescription` and `recipeIsLegible` are first so
 *    that the verdict is conditioned on the model's own grounded sentence
 *    rather than on the prompt's premise. **Moving either below `ingredients`
 *    silently restores the defect, as a passing build.** A bare verdict with
 *    nothing before it was measured losing to the premise 6/6 on the menu
 *    seam.
 *  - **The verdict is phrased positively.** `noMenuDetected` *inverted* on the
 *    menu seam — the model described a real menu correctly and then declared
 *    it absent, 3/3 — so the schema asks the positive question. Here that is
 *    `recipeIsLegible`, and unlike the menu seam nothing inverts it back: the
 *    domain has no negative field to keep in step (see
 *    `providerRecipePhotoExtractor`), so the one polarity is the only one.
 *
 * The one thing adapted rather than copied is the **question**. "Is this menu
 * legible" asks about a page; "is there a recipe in this photo" has to cover a
 * card, a book page, a screenshot and a handwritten note, and has to exclude
 * the near-miss that a menu never faces — *a photograph of the finished dish*,
 * which is a picture of food with no recipe in it at all. The field
 * description says so outright, because that is the confusion this model will
 * actually reach for.
 *
 * `required` keeps all four original fields and gains the two new ones.
 * Dropping the originals was measured as over-correction on the menu seam —
 * with the transcription field optional, every *real* menu came back with it
 * empty — and the rule that came out of it is the one to apply here:
 * **a field may be required when the model can answer it honestly at the point
 * it is decoded.** `name`, `ingredients` and `instructions` can, once the
 * verdict is behind them; on an abstention the model writes an apology into
 * them and `providerRecipePhotoExtractor` never stores it.
 */
export const RECIPE_PHOTO_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    imageDescription: {
      type: "string",
      description:
        "Before you look for a recipe at all: one short sentence saying what " +
        "you can actually see in this image. If it is blank, featureless, or " +
        "too small to contain anything, say exactly that.",
    },
    recipeIsLegible: {
      type: "boolean",
      description:
        "Decide this next, before transcribing anything, and decide it from " +
        "the description you just gave. True when that description is of " +
        "written recipe text you can actually read — a card, a book page, a " +
        "screenshot, a handwritten note. False when it is not a recipe (a " +
        "blank page, a wall, a person, an object, or a photograph of a " +
        "finished dish or drink with no writing on it), and false when it is " +
        "a recipe whose text you cannot read.",
    },
    name: string_("The recipe's name."),
    description: string_("1-2 sentences."),
    difficultyLevel: number_("1 (trivial) to 5 (expert)."),
    prepTimeMinutes: number_("Total preparation time in minutes."),
    servingSize: number_("How many servings this makes."),
    groupName: string_(
      "The classic recipe this is a variation of ('Old Fashioned'), if any.",
    ),
    confidence: number_("0 to 1 — confidence in the whole reading."),
    // Left where they are, last: `ingredients` and `instructions` are the
    // expensive fields, and everything above them is something the model has
    // already committed to before it starts writing lines.
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: string_("The ingredient as written."),
          quantity: number_("Numeric amount, if given."),
          unit: string_("Unit of measure ('oz', 'ml', 'dash')."),
          isOptional: { type: "boolean", description: "True if optional." },
          substitutionNotes: string_("Any substitution the recipe suggests."),
          // Spelled from `ITEM_TYPES` (see RECIPE_INGREDIENT_ITEM_TYPES). The
          // port wrote the table names here — 'wines', 'spirits' — which
          // `ingredientItemTypes` did not recognise, so every declared type
          // widened the search to all six tables and every generic fallback
          // got kind `ingredient`. The matcher now tolerates the plural as
          // well; this is still the one spelling the prompt asks for.
          itemType: string_(
            `Which catalogue this would live in: ${RECIPE_INGREDIENT_ITEM_TYPES.map(
              (type) => `'${type}'`,
            ).join(", ")}. Omit for a pantry ingredient.`,
          ),
          brandName: string_("Brand as printed, if the recipe names one."),
          category: string_("A generic category for a non-branded ingredient."),
        },
        required: ["name"],
      },
    },
    instructions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          instructionText: string_("One step, as written."),
          instructionType: string_("'prep', 'mix', 'garnish', 'serve', …"),
          equipmentNeeded: string_("Equipment this step calls for."),
          timeMinutes: number_("Minutes this step takes, if stated."),
        },
        required: ["instructionText"],
      },
    },
    /*
     * **The two classification fields, `enum`-constrained and decoded last
     * (C4d).**
     *
     * `type` was free text and the model never once answered it legally.
     * Measured on gemma3:4b at `temperature: 0`, 4 runs of 4 each: on a real
     * cocktail card it answered `"groupName"`, and on a real food card
     * (a "Lemon Garlic Roast Chicken", six ingredients, five steps, all read
     * correctly) it also answered `"groupName"` — the *name of the property
     * declared after it*, which is what a grammar with an unconstrained
     * string in an object rule invites. `recipeTypeOf` then mapped both onto
     * `cocktail`, so **every photographed food recipe was filed as a drink**,
     * and `groupCategoryOf` filed its group as `cocktail` too. There was no
     * regression to find because there had never been a correct answer.
     *
     * Two things fix it, and they are the two this file already argues for
     * everywhere else:
     *
     *  - **An `enum` compiles into the sampler's grammar**, so the illegal
     *    answer stops being something the model has to be talked out of and
     *    becomes something it cannot emit. Same correctness constraint
     *    `vocabulary.ts` applies to item attributes, and the same one
     *    `PLACE_REVIEW_CATEGORIES` applies to a `text[]` column with no
     *    foreign key: it is about what the column accepts, not about whether
     *    the model is telling the truth.
     *  - **The values are the database's, read from it and not from
     *    intuition.** `recipes_type_check` is
     *    `type = ANY (ARRAY['food', 'cocktail'])` and `recipe_category` is
     *    `cocktail, mocktail, other, punch, shot` — both checked against the
     *    running Postgres, both mirrored in `@cellar-assistant/contracts` as
     *    `RECIPE_TYPES` and `RECIPE_CATEGORIES`, and spread from there so a
     *    sixth category cannot be added to the enum without this schema
     *    learning about it. `groupCategoryOf` accepts all five members and
     *    falls back for none of them.
     *
     * **And they are declared here, at the tail, not beside `name`.** Property
     * order is generation order (see `MENU_EXTRACTION_SCHEMA` §2), and "is
     * this a drink or a meal" is a verdict: decoded after `name` it is
     * answered from the title, which is exactly the premise-following this
     * schema puts `imageDescription` first to avoid. Decoded here it is
     * answered from six transcribed ingredients and five transcribed steps
     * the model has already committed to. Measured at `temperature: 0`, 4
     * runs of 4 per position: beside `name` the enum alone already fixes the
     * food card, but the honest position is this one and it costs nothing —
     * both fixtures answer correctly here, and the answer is conditioned on
     * the reading rather than on the heading.
     *
     * `type` stays in `required`; `groupCategory` stays out. That is the
     * `required` rule this file states once and applies four times — **a
     * field may be required when the model can answer it honestly at the
     * point it is decoded** — plus the fact that the two domains are shaped
     * differently. `recipes.type` is `NOT NULL` over exactly two values, so
     * it is exhaustive and there is no row state an abstention could be
     * written as; forcing the choice here costs a coin-flip on a genuinely
     * ambiguous card and saves every real one. `recipe_groups.category` has
     * five values and a real `other`, and a recipe need belong to no group at
     * all, so omission is meaningful there and is left reachable.
     */
    type: {
      type: "string",
      enum: [...RECIPE_TYPES],
      description:
        "Now that you have written out the ingredients and the method, say " +
        "which of these two this recipe makes. 'cocktail' when the result " +
        "is a drink you mix and pour; 'food' when it is something you cook, " +
        "bake or eat. Decide it from the lines you have just transcribed, " +
        "not from the title.",
    },
    groupCategory: {
      type: "string",
      enum: [...RECIPE_CATEGORIES],
      description:
        "Only if you named a `groupName` above: which of these that classic " +
        "belongs to, consistent with the `type` you have just given. A " +
        "cocktail group is 'cocktail', or 'mocktail', 'punch' or 'shot' " +
        "where the card says so; a food group is always 'other'. Leave it " +
        "out entirely when you named no group.",
    },
  },
  required: [
    "imageDescription",
    "recipeIsLegible",
    "name",
    "type",
    "ingredients",
    "instructions",
  ],
};

/**
 * The prompt no longer opens by telling the model it is looking at a recipe.
 *
 * "You are reading a photograph of a single recipe" is a premise, and a model
 * does not argue with a premise — it read nine cookie ingredients off a grey
 * pixel because it had been told a recipe was there. The photograph is now
 * described as *a photograph someone believes shows a recipe*, which makes "it
 * does not" an answer rather than a contradiction.
 *
 * The old last rule ("if the photograph is unreadable, say so by returning a
 * low `confidence` and only the parts you could actually read") was already
 * reaching for this and could not be obeyed: `name`, `ingredients` and
 * `instructions` were all `required` in the schema beside it, so "only the
 * parts you could actually read" had no reachable spelling when that was
 * none of them. A prompt cannot grant permission the grammar withholds.
 */
export const buildRecipePhotoPrompt = (notes: string | null): string =>
  `You are looking at a photograph that someone has uploaded believing it shows a single recipe — a card, a book page, a screenshot or a handwritten note. They are often wrong: it may be a blank page, a wall, a person, a photograph of the finished dish with no writing on it, or an image too small or too dark to hold any legible text at all.

Say what you can see, then decide whether this image really does show recipe text you can read. Only if it does, transcribe it into the structured shape in the schema.${
    notes === null ? "" : `\n\nThe person who took the photo added: "${notes}"`
  }

Rules:
- \`imageDescription\` comes first and is answered from the image alone, in one
  short sentence: what do you actually see? Answer that before you decide
  anything else, and then decide \`recipeIsLegible\` from your own answer.
- \`recipeIsLegible\` is **true** when you can read written recipe text in this
  image, and **false** when you cannot — because it is not a recipe, or
  because there is no legible text on it. A photograph of a finished dish or
  drink is **not** a recipe: it shows you the result, not the method.
- **When \`recipeIsLegible\` is false, return no \`ingredients\` and no
  \`instructions\`. That is a correct and useful answer, not a failure.**
  "We could not find a recipe in this photo" is exactly what the person needs
  to hear; a plausible recipe they never photographed is the worst thing you
  can give them.
- Never write down an ingredient, a quantity or a step that you cannot
  actually see in this image. Do not fill the page in from what a recipe with
  this title usually says.
- One recipe. If the photograph shows several, take the one that is most
  prominent and ignore the rest.
- Ingredients in the order the recipe lists them, with quantities and units
  exactly as written. Do not convert between units.
- Instructions as separate steps, in order, in the recipe's own words.
- \`groupName\` only when the recipe is recognisably a variation of a classic.
  Leave it out rather than inventing a lineage.
- \`type\` and \`groupCategory\` come **last**, after the ingredients and the
  method are written out, and each has a fixed list of values in the schema —
  those are the only ones the database accepts, so answer with one of them and
  nothing else. \`type\` is \`cocktail\` when what this makes is a drink you mix
  and pour, and \`food\` when it is something you cook, bake or eat; decide it
  from the lines you just transcribed, not from the recipe's title.
- \`groupCategory\` only when you named a \`groupName\`. \`other\` is the right
  answer for a food group, and for a drink that is none of the others.
- A photograph that is genuinely a recipe but too blurred to read is
  \`recipeIsLegible\` false, with a low \`confidence\`.`;

/** Which of the six scanned types a menu line's `itemType` may be. */
export const isScannedType = (value: unknown): value is ScannedItemType =>
  typeof value === "string" &&
  (SCANNED_ITEM_TYPES as readonly string[]).includes(value);

/* -------------------------------------------------------------------------- */
/* B5b · user place review (ported from `functions/reviewUserPlace`)           */
/* -------------------------------------------------------------------------- */

/**
 * The categories a suggestion may name.
 *
 * `places.categories` is `text[]` with no foreign key, so an invented category
 * violates nothing in the database — it is simply unusable: the create form
 * (`services/client/src/components/map/places/CreatePlaceForm.tsx`) renders
 * its options from a fixed list (`PLACE_CATEGORY_TIERS` in
 * `services/client/src/components/map/places/userPlaceCategories.ts`, the
 * restored copy of the old `@cellar-assistant/shared` categories) and a
 * suggestion outside it is a word the user cannot act on. So this is an `enum` in the schema for the same
 * reason the reference tables are: a correctness constraint, not a truthfulness
 * one.
 *
 * The old prompt printed these as Title Case *labels* ("Coffee Shop") while the
 * column and the form both hold slugs, so a model that obeyed the prompt
 * answered with strings the form could never match. This lists the slugs.
 *
 * `place-review.test.ts` holds this against the form's own list rather than
 * against a copy of itself.
 */
export const PLACE_REVIEW_CATEGORIES = [
  // venues
  "restaurant",
  "bar",
  "cafe",
  "coffee_shop",
  "cocktail_bar",
  "wine_bar",
  "brewery",
  "winery",
  "distillery",
  "pub",
  "beer_bar",
  "sports_bar",
  "lounge",
  "gastropub",
  "tapas_bar",
  "sake_bar",
  "whiskey_bar",
  "beer_garden",
  "wine_tasting_room",
  "coffee_roastery",
  "tea_house",
  // retail
  "liquor_store",
  "beer_wine_and_spirits",
  "beverage_store",
  "specialty_store",
] as const;

/** The quality flags the old prompt named, as a closed set. */
export const PLACE_REVIEW_FLAGS = [
  "spam",
  "inappropriate",
  "duplicate_suspected",
  "low_quality",
  "fictional",
] as const;

/**
 * The review's output shape — and the one decision in this file worth arguing.
 *
 * **`approved` is the only required field.** The Nhost schema required five
 * (`approved`, `confidence_adjustment`, `enriched_description`,
 * `suggested_categories`, `flags`), and `required` is not a request: providers
 * compile it into the sampler's grammar, so the decoder *cannot* close the
 * object without emitting those keys. The old handler's own code carries the
 * evidence — it patched `enriched_description` from `null` to `""` before
 * validating, with the comment "AI sometimes returns null for required string
 * fields", which is a model trying to say "I have nothing to add" through a
 * grammar that forbade it. See `itemDefaultsSchema` above for where that same
 * compulsion produced an entire invented wine.
 *
 * `approved` stays required because it is the one field with no abstention to
 * express. It is a binary verdict over material the caller has already
 * validated, and there is no third value a caller could act on: defaulting an
 * absent verdict to `true` is the silent approval this whole seam exists to
 * refuse, and defaulting it to `false` rejects a legitimate submission. The
 * abstention lives one level up instead — a reviewer that cannot answer throws,
 * and `PlaceCreationActor` records `review: null`, which is a state the result
 * type has always had a shape for.
 *
 * Everything else is omittable, and each omission means something: no
 * adjustment, no better description than the user's own, no extra categories,
 * no flags, no rejection reason because there was no rejection.
 */
export const PLACE_REVIEW_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    approved: {
      type: "boolean",
      description: "Whether this submission should become a place.",
    },
    confidenceAdjustment: {
      type: "number",
      minimum: -0.3,
      maximum: 0.3,
      description:
        "How far to move the 0.5 base confidence, between -0.3 and +0.3. " +
        "Omit it when nothing about this submission moves the needle.",
    },
    enrichedDescription: string_(
      "One or two sentences describing the place, for display. Omit it " +
        "unless you can write something better than what the user supplied.",
    ),
    suggestedCategories: {
      type: "array",
      items: { type: "string", enum: [...PLACE_REVIEW_CATEGORIES] },
      description:
        "Categories that clearly fit and the user did not pick. Omit it " +
        "when their selection is already right.",
    },
    rejectionReason: string_(
      "Why this was not approved, addressed to the person who submitted it. " +
        "Only when `approved` is false.",
    ),
    flags: {
      type: "array",
      items: { type: "string", enum: [...PLACE_REVIEW_FLAGS] },
      description: "Quality problems you actually observed. Omit when none.",
    },
  },
  // `approved` alone. Read the block above before adding to this list.
  required: ["approved"],
};

export const buildPlaceReviewPrompt = (subject: {
  readonly name: string;
  readonly categories: readonly string[];
  readonly location: { readonly lng: number; readonly lat: number };
  readonly streetAddress: string | null;
  readonly locality: string | null;
  readonly region: string | null;
  readonly countryCode: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly description: string | null;
}): string => {
  const address = [
    subject.streetAddress,
    subject.locality,
    subject.region,
    subject.countryCode,
  ].filter((part): part is string => part !== null);

  const optional = (label: string, value: string | null): string =>
    value === null ? "" : `\n- ${label}: ${value}`;

  return `You are reviewing a user-submitted place for an app that helps people discover and track venues for wine, beer, spirits, coffee, sake and tea.

Evaluate this submission for quality, accuracy and potential abuse.

## The submission
- Name: ${subject.name}
- Categories: ${subject.categories.join(", ")}
- Coordinates: ${subject.location.lat.toFixed(6)}, ${subject.location.lng.toFixed(6)}
- Address: ${address.length > 0 ? address.join(", ") : "not provided"}${optional("Phone", subject.phone)}${optional("Website", subject.website)}${optional("Their description", subject.description)}

## What to judge
1. Does the name read like a real business rather than random text, profanity
   or test data?
2. Do the categories fit? The ones this app knows are: ${PLACE_REVIEW_CATEGORIES.join(", ")}.
3. Is there any sign of spam, abuse or a fictional place?
4. Could you write a short, useful description — either because they gave none
   or because theirs is poor?
5. Are there categories that obviously apply and they did not pick?

## How to decide
- **Approve** anything that looks like a genuine venue, even when the details
  are sparse. Sparse is the normal case, not a reason to reject.
- **Reject** only what is clearly wrong: spam, profanity, an obviously
  fictional place, or somewhere with no plausible connection to food or drink
  (a hardware store, a car dealership). A rejection stops the submission and
  the person is shown your \`rejectionReason\`, so write it to them.
- \`confidenceAdjustment\`: +0.1 to +0.3 when the submission is complete (name,
  address, and a phone or website); around 0 when it is sparse; -0.2 to -0.3
  when it is poor but still genuine enough to keep.
- Leave any field out entirely rather than filling it in to be helpful. An
  omitted \`enrichedDescription\` means the user's own words stand; an omitted
  \`flags\` means you saw nothing wrong. Both are real answers.
- \`suggestedCategories\` and \`flags\` may only use the values listed above.`;
};
