/**
 * X1b — the vocabulary the item-defaults schema constrains the model to.
 *
 * ## What was lost, and what this puts back
 *
 * The Nhost `*_defaults` actions built their output schema at runtime from ten
 * reference tables, so `style`, `country`, `roast_level` and friends were
 * `enum`s the model could not miss. The port dropped that (`prompts.ts` used to
 * say so in its own header) because reaching `ReferenceDataActor` for them
 * would put a second sidecar hop inside `ItemOnboardingActor.start`'s turn,
 * which §8.5 forbids.
 *
 * The cost was measured, not assumed. Driving the real seam against the running
 * Ollama with a barcode and no label returned `wine.style: "Red Wine"` on one
 * run and `"Chardonnay"` on the next — and `wine_style` holds exactly five
 * rows: `DESSERT`, `RED`, `ROSE`, `SPARKLING`, `WHITE`. Every one of those
 * answers is a foreign-key violation that surfaces *inside the outbox*, where
 * `itemFormRules.ts` says nobody sees it.
 *
 * So the vocabulary is loaded **once per process, lazily, straight from the
 * database** — `selectReferenceRows`, the same ten queries `ReferenceDataActor`
 * serves the dropdowns from, hoisted so the two cannot drift. Not a sidecar
 * hop, so §8.5 is satisfied; not per request, so the second onboarding pays
 * nothing; not at boot, so a database that is slow to accept connections
 * delays one extraction rather than refusing to start the host.
 *
 * ## What this is *not*
 *
 * It is not a defence against fabrication. Constraining the grammar makes an
 * invented wine **more** schema-valid, not less: the same no-input run that
 * produced `"Red Wine"` produces `style: "SPARKLING"` once the enum is there,
 * at confidence 0.95, for a Château d'Yquem that does not exist. Refusing to
 * ask a vision model to read a label that was never supplied is a different
 * guard, and it lives in `../item-defaults.ts`.
 */
import type { ItemType, ReferenceKind } from "@cellar-assistant/contracts";
import {
  byItemType,
  ConflictError,
  ITEM_ATTRIBUTE_KEY,
  ITEM_TYPE_SPECS,
  itemAttributeEntries,
  REFERENCE_KINDS,
} from "@cellar-assistant/contracts";
import { actorDb } from "../db.ts";
import { selectReferenceRows } from "../reference-rows.ts";

/** Every reference table's allowed values, keyed by table name. */
export type ItemVocabulary = Readonly<Record<ReferenceKind, readonly string[]>>;

/** Where one constrained field's allowed values come from. */
export type VocabularySource =
  /** A reference table — resolved against a loaded {@link ItemVocabulary}. */
  | { readonly kind: "reference"; readonly reference: ReferenceKind }
  /** A `pgEnum`, whose members are compiled in (`contracts/enums.ts`). */
  | { readonly kind: "static"; readonly values: readonly string[] };

export type ConstrainedAttribute = {
  /** The key in the model's answer. */
  readonly field: string;
  /** Top level of the answer, or inside the per-type bag. */
  readonly on: "attributes" | "input";
  /** `<table>.<column>`, so a rejection says what the value has to satisfy. */
  readonly column: string;
  readonly source: VocabularySource;
};

/**
 * Which fields of the item-defaults answer have a closed vocabulary —
 * **derived from `ITEM_TYPE_SPECS`** (contracts `item-types.ts`): `country`
 * first, then every attribute with a `vocabulary`, in declaration order.
 *
 * Every type carries its own `country` column — there is no `items.country` —
 * and it is the one constrained field the answer holds at the **top level**
 * rather than inside the per-type bag, because `CreateItemInput.country` is.
 *
 * The form constrains exactly these (`src/components/item-api/itemFormRules.ts`,
 * held to the same spec by the client's `item-spec.test.ts`), because every one
 * is a foreign key or a `pgEnum` and a typed-in value fails as a constraint
 * violation inside the actor. `../item-spec-schema.test.ts` holds the spec to
 * the live database; `../item-bindings.test.ts` pins this derivation to the list it
 * replaced, order included — the order is the order of the model's schema.
 */
export const CONSTRAINED_ITEM_ATTRIBUTES: Readonly<
  Record<ItemType, readonly ConstrainedAttribute[]>
> = byItemType((type) => {
  const { table } = ITEM_TYPE_SPECS[type];
  return [
    {
      field: "country",
      on: "input",
      column: `${table}.country`,
      source: { kind: "reference", reference: "country" },
    },
    ...itemAttributeEntries(type).flatMap(
      ([field, attribute]): ConstrainedAttribute[] =>
        attribute.vocabulary === null
          ? []
          : [
              {
                field,
                on: "attributes",
                column: `${table}.${attribute.column}`,
                source: attribute.vocabulary,
              },
            ],
    ),
  ];
});

/**
 * The per-type attributes whose column is a `date`, not text — the spec's
 * `kind: "date"` attributes.
 *
 * `wines.vintage` is `date NOT NULL` — which is why E2c's save error names it.
 * JSON Schema's `format` is a description, not a grammar: Ollama constrains
 * decoding to `type`/`enum` and nothing else, so a model told "YYYY-MM-DD"
 * still answers `"2005"`, measured. The schema says the format anyway, and the
 * *form* is what refuses to silently accept a value its `date` input cannot
 * hold — see `src/lib/items/extraction-merge.ts`.
 */
export const DATE_ITEM_ATTRIBUTES: Readonly<
  Record<ItemType, readonly string[]>
> = byItemType((type) =>
  itemAttributeEntries(type)
    .filter(([, attribute]) => attribute.kind === "date")
    .map(([field]) => field),
);

export type VocabularyLoader = () => Promise<ItemVocabulary>;

/**
 * The ten tables, in one pass.
 *
 * The returned object is written out key by key rather than assembled from
 * `REFERENCE_KINDS`, for the reason `TABLE_WRITERS` is: totality over the union
 * is then a compile error rather than a runtime hole. An eleventh reference
 * table turns this red, which is the moment to decide which item field it
 * constrains.
 */
export const databaseVocabularyLoader: VocabularyLoader = async () => {
  const db = actorDb();
  const loaded = new Map<ReferenceKind, readonly string[]>(
    await Promise.all(
      REFERENCE_KINDS.map(async (kind) => {
        const rows = await selectReferenceRows(db, kind);
        return [kind, rows.map((row) => row.value)] as const;
      }),
    ),
  );

  /** An empty table would compile to an empty `enum`, which rejects every answer. */
  const at = (kind: ReferenceKind): readonly string[] => {
    const values = loaded.get(kind) ?? [];
    if (values.length === 0) {
      throw new ConflictError(
        `reference table ${kind} is empty, so the item-defaults schema cannot ` +
          "constrain the model to it. Seed the reference data before running " +
          "an onboarding — see services/actors/scripts/seed.ts.",
      );
    }
    return values;
  };

  return {
    beer_style: at("beer_style"),
    coffee_cultivar: at("coffee_cultivar"),
    country: at("country"),
    sake_category: at("sake_category"),
    sake_rice_variety: at("sake_rice_variety"),
    sake_type: at("sake_type"),
    spirit_type: at("spirit_type"),
    tea_category: at("tea_category"),
    wine_style: at("wine_style"),
    wine_variety: at("wine_variety"),
  } satisfies ItemVocabulary;
};

let loader: VocabularyLoader = databaseVocabularyLoader;
let cached: Promise<ItemVocabulary> | null = null;

/**
 * The vocabulary, loaded at most once.
 *
 * The *promise* is cached, not the result, so two onboardings racing the first
 * extraction after boot share one read rather than issuing twenty queries. A
 * failed load is not cached — a database that was not up yet gets another
 * chance on the next onboarding rather than poisoning the process.
 */
export const itemVocabulary = (): Promise<ItemVocabulary> => {
  if (cached !== null) return cached;
  const pending = loader().catch((error: unknown) => {
    if (cached === pending) cached = null;
    throw error;
  });
  cached = pending;
  return pending;
};

/** Injected by the tests, and by anything that has the ten lists already. */
export const setItemVocabularyLoader = (next: VocabularyLoader): void => {
  loader = next;
  cached = null;
};

export const resetItemVocabulary = (): void => {
  loader = databaseVocabularyLoader;
  cached = null;
};

/** The allowed values for one constrained field. */
export const allowedValues = (
  attribute: ConstrainedAttribute,
  vocabulary: ItemVocabulary,
): readonly string[] =>
  attribute.source.kind === "static"
    ? attribute.source.values
    : vocabulary[attribute.source.reference];

/** Where one constrained field sits in the model's answer. */
const valueAt = (
  type: ItemType,
  defaults: Record<string, unknown>,
  attribute: ConstrainedAttribute,
): unknown => {
  if (attribute.on === "input") return defaults[attribute.field];
  const bag = defaults[ITEM_ATTRIBUTE_KEY[type]];
  if (typeof bag !== "object" || bag === null || Array.isArray(bag)) {
    return undefined;
  }
  return (bag as Record<string, unknown>)[attribute.field];
};

/**
 * Refuse an answer that used a value outside the column's vocabulary.
 *
 * A throw rather than a drop, and the precedent is two functions away:
 * `providerMenuMatchVerifier` throws on a candidate key the model invented,
 * because "treating a hallucinated id as a rejection would hide a prompt
 * regression behind plausible-looking output". The same reasoning applies with
 * more force here, because the schema handed the model the entire vocabulary —
 * Ollama compiles it into the sampler's grammar, so an out-of-vocabulary value
 * means the provider did not honour the schema at all, which is a fact about
 * the provider that should reach a human rather than a field that quietly
 * arrives blank.
 *
 * The alternative — dropping the field — puts this module back where E2c found
 * it: a form that renders fewer values than the model returned, and a save
 * error the user cannot reconcile with what they can see.
 */
export const requireInVocabulary = (
  type: ItemType,
  defaults: Record<string, unknown>,
  vocabulary: ItemVocabulary,
): void => {
  for (const attribute of CONSTRAINED_ITEM_ATTRIBUTES[type]) {
    const value = valueAt(type, defaults, attribute);
    if (value === undefined || value === null || value === "") continue;
    const allowed = allowedValues(attribute, vocabulary);
    if (typeof value === "string" && allowed.includes(value)) continue;
    throw new ConflictError(
      `the model answered ${attribute.field}=${JSON.stringify(value)}, which ` +
        `${attribute.column} does not accept. Its ${allowed.length} legal ` +
        `values include ${allowed.slice(0, 4).join(", ")}. The schema listed ` +
        "every one of them, so this is the provider ignoring the output " +
        "schema — not a bad label.",
    );
  }
};

/* -------------------------------------------------------------------------- */
/* Vocabularies too large to send as an `enum`                                 */
/* -------------------------------------------------------------------------- */

/**
 * The largest `enum` any AI response schema in this service may carry.
 *
 * **Measured, 2026-10-04, against Vertex at `global`:** from
 * `itemDefaultsSchema`, the 197-value `country` enum made every item type's
 * schema fail with `400 INVALID_ARGUMENT` on every model we could try:
 * `gemini-2.5-flash-lite`, `-2.5-pro`, `-3.1-flash-lite`, `-3.5-flash-lite`,
 * `-3.5-flash` and `-3.8-flash`. So every label onboarding on the deployed
 * provider failed before the model saw the photograph. Sent as
 * `responseJsonSchema`, the same schema gets the reason:
 * "The specified schema produces a constraint that has too much branching for
 * serving … enums with too many values". This is not a count limit. A synthetic
 * 197-value enum passed on its own, and so did the first 190 countries. The
 * limit is on the whole grammar, so an enum's safe size depends on everything
 * around it, and the only robust rule is to keep big enums out of schemas.
 * With `country` sent as plain text, all five item types passed on
 * `gemini-3.5-flash` and `gemini-3.8-flash`, including the 53-value
 * `beer_style` and 55-value `wine_variety` enums. Fifty leaves those below the
 * line too, and a reference table that grows past fifty stops being an `enum`
 * on its own.
 *
 * The Nhost provider hit the same wall and stripped *every* enum on Vertex
 * (`functions/_utils/ai-providers/vertex-ai.ts`, `82450ad1`: "large enum
 * arrays cause INVALID_ARGUMENT"), then fuzzy-matched the answer back
 * (`performEnumMatch`). This keeps the small enums, which Ollama compiles into
 * its grammar and which work everywhere. Only a vocabulary over the line is
 * sent as text, with its values listed in the description, and mapped back by
 * {@link normaliseUnconstrainedAttributes}. `prompts.test.ts` asserts the
 * line for every schema the seams send.
 */
export const MAX_SCHEMA_ENUM_VALUES = 50;

/** Whether `itemDefaultsSchema` sends this attribute as text, not an `enum`. */
export const isSentUnconstrained = (
  attribute: ConstrainedAttribute,
  vocabulary: ItemVocabulary,
): boolean =>
  allowedValues(attribute, vocabulary).length > MAX_SCHEMA_ENUM_VALUES;

/**
 * Upper case, accents stripped, everything but letters and digits removed.
 * "Côte d'Ivoire", "COTE_DIVOIRE" and "cote divoire" all become
 * `COTEDIVOIRE`, and so do "United States" and `UNITED_STATES`.
 */
const compactKey = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/**
 * Names a label commonly prints for a country, where they differ from the
 * `country` table's value by more than spelling. Keys are {@link compactKey}s.
 * An alias is used only when its target really is in the loaded vocabulary.
 * `SCOTLAND` and `WALES` are rows of their own, so they are never aliased.
 */
export const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  USA: "UNITED_STATES",
  US: "UNITED_STATES",
  AMERICA: "UNITED_STATES",
  UNITEDSTATESOFAMERICA: "UNITED_STATES",
  UK: "UNITED_KINGDOM",
  GB: "UNITED_KINGDOM",
  GREATBRITAIN: "UNITED_KINGDOM",
  BRITAIN: "UNITED_KINGDOM",
  ENGLAND: "UNITED_KINGDOM",
  UNITEDKINGDOMOFGREATBRITAINANDNORTHERNIRELAND: "UNITED_KINGDOM",
  HOLLAND: "NETHERLANDS",
  THENETHERLANDS: "NETHERLANDS",
  CZECHIA: "CZECH_REPUBLIC",
  IVORYCOAST: "COTE_DIVOIRE",
  CAPEVERDE: "CAPE_VERDE_CABO_VERDE",
  CABOVERDE: "CAPE_VERDE_CABO_VERDE",
  KOREA: "SOUTH_KOREA",
  REPUBLICOFKOREA: "SOUTH_KOREA",
  TURKIYE: "TURKEY",
  RUSSIANFEDERATION: "RUSSIA",
  BURMA: "MYANMAR",
  SWAZILAND: "ESWATINI",
  EASTTIMOR: "TIMOR_LESTE",
  MACEDONIA: "NORTH_MACEDONIA",
  HOLYSEE: "VATICAN_CITY",
  DEUTSCHLAND: "GERMANY",
  ESPANA: "SPAIN",
  ITALIA: "ITALY",
  NIPPON: "JAPAN",
  BRASIL: "BRAZIL",
};

/**
 * Map one free-text answer onto a vocabulary, or `null`.
 *
 * Exact first, then by {@link compactKey} (case, accents, spaces and
 * punctuation ignored), then through `aliases`. Nothing fuzzier than that.
 * The Nhost matcher took any candidate scoring 70 or more, and that is how a
 * near miss becomes a wrong country nobody asked for. An answer that matches
 * nothing becomes `null`: the field arrives blank, and the person with the
 * bottle fills it in. A value outside the vocabulary is never returned.
 */
export const normaliseToVocabulary = (
  value: unknown,
  allowed: readonly string[],
  aliases: Readonly<Record<string, string>> = {},
): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (allowed.includes(trimmed)) return trimmed;
  const key = compactKey(trimmed);
  if (key === "") return null;
  const byKey = allowed.find((candidate) => compactKey(candidate) === key);
  if (byKey !== undefined) return byKey;
  const aliased = aliases[key];
  return aliased !== undefined && allowed.includes(aliased) ? aliased : null;
};

/**
 * Every attribute {@link isSentUnconstrained} sends as text, mapped back onto
 * its vocabulary by {@link normaliseToVocabulary}, in a copy of `defaults`.
 * An unmatched value is set to `null`. A field the model left out stays out.
 *
 * Attributes that went out as an `enum` are left alone on purpose.
 * {@link requireInVocabulary} still treats an out-of-vocabulary value there
 * as the provider ignoring its schema. Normalising those too would hide that
 * fact instead of reporting it.
 */
export const normaliseUnconstrainedAttributes = (
  type: ItemType,
  defaults: Record<string, unknown>,
  vocabulary: ItemVocabulary,
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...defaults };
  const bagKey = ITEM_ATTRIBUTE_KEY[type];
  const rawBag = out[bagKey];
  const bag: Record<string, unknown> | null =
    typeof rawBag === "object" && rawBag !== null && !Array.isArray(rawBag)
      ? { ...(rawBag as Record<string, unknown>) }
      : null;
  for (const attribute of CONSTRAINED_ITEM_ATTRIBUTES[type]) {
    if (!isSentUnconstrained(attribute, vocabulary)) continue;
    const holder = attribute.on === "input" ? out : bag;
    if (holder === null || !(attribute.field in holder)) continue;
    const aliases =
      attribute.source.kind === "reference" &&
      attribute.source.reference === "country"
        ? COUNTRY_ALIASES
        : {};
    holder[attribute.field] = normaliseToVocabulary(
      holder[attribute.field],
      allowedValues(attribute, vocabulary),
      aliases,
    );
  }
  if (bag !== null) out[bagKey] = bag;
  return out;
};
