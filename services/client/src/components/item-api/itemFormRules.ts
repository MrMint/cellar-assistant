/**
 * What each of the six item types needs from a form, and what the database will
 * refuse if it does not get it (D3).
 *
 * This table exists because **two of the constraints it encodes are invisible
 * at the GraphQL boundary**, and both were found by running the real mutations
 * against the running stack rather than by reading the schema:
 *
 * 1. **`wines.style`, `wines.vintage` and `spirits.type` are `NOT NULL`, and
 *    `coffees.description` is too** — but `WineAttributesInput.style` and
 *    friends are all nullable, so the schema will happily accept a confirm
 *    without them. `ItemOnboardingActor.confirm` then hands `ItemActor.create`
 *    to the **outbox**, the insert fails there, and the row is retried and
 *    eventually dies. The user sees a successful confirm and an item that never
 *    appears. Observed exactly once, as an outbox row reading *"a wine needs a
 *    style (wines.style is NOT NULL)"*. So the form is the only place this can
 *    be caught, and `required` below is load-bearing rather than cosmetic.
 * 2. **`wines`, `beers`, `spirits` and `coffees` carry
 *    `item_onboarding_id NOT NULL`** — an item of those four types cannot be
 *    created outside the onboarding flow, whatever `createItem` claims. `sakes`
 *    and `teas` have no such column. `canCreateDirectly` is that fact.
 *
 * Constrained columns come in two flavours. Most are FKs to reference tables
 * and are read live through `referenceData` (`ReferenceOptionsQuery`); six are
 * Postgres enums with no `ReferenceKind` and are listed here as constants. Both
 * cross the wire as plain `String`, so getting the value wrong is a foreign-key
 * violation inside the actor rather than a GraphQL error — another reason the
 * fields are pickers and not free text.
 *
 * Getting the *key* wrong used to be invisible in the same way, and was: see
 * `AttributeKey` below, which now holds every `key` to the generated
 * introspection so a skew like sake's `vintage`/`vintageYear` is a `tsc` error
 * rather than a mutation that fails only when the field is filled in. It holds
 * keys to the *object* types too, which is what replaced the `writeOnly` flag
 * six fields used to carry on a premise that had stopped being true.
 */

import type { introspection } from "@cellar-assistant/schema/graphql-env.d.ts";
import type { ApiItemType } from "./itemTypes";

/** Which `ReferenceOptionsQuery` alias supplies a field's options. */
export type ReferenceSource =
  | "country"
  | "wineStyle"
  | "wineVariety"
  | "beerStyle"
  | "spiritType"
  | "coffeeCultivar"
  | "sakeCategory"
  | "sakeType"
  | "sakeRiceVariety"
  | "teaCategory";

/**
 * The six enum-backed columns `ReferenceKind` does not cover.
 *
 * Values are the Postgres enum labels verbatim — `coffee_roast_level` is
 * SCREAMING_CASE, `tea_form` and `sake_serving_temperature` are lowercase. The
 * casing is not a style choice; it is the value the FK/enum check compares.
 *
 * **This list is a copy, and it had already drifted (E2c).**
 * `sakeServingTemperature` held seven of `sake_serving_temperature`'s nine
 * labels — `tobikiri_kan` and `yuki_hie` were simply missing. That is not a
 * cosmetic gap: `SakeAttributesInput.servingTemperature` is `String` in the SDL,
 * not the `SakeServingTemperature` enum the same schema defines, so the picker
 * is the *only* thing standing between a person and a bad enum label. Short by
 * two, it made two legal values unreachable by hand — and X1b now constrains the
 * model to the full nine from `SAKE_SERVING_TEMPERATURES`, so an extraction can
 * legitimately propose a value this table cannot offer.
 *
 * `src/lib/dev-checks/static-options.test.ts` holds it against
 * `packages/db/src/schema/tables.ts` so the next drift is a red test rather
 * than an option nobody can pick.
 */
export const STATIC_OPTIONS = {
  coffeeRoastLevel: [
    "LIGHT",
    "LIGHT_MEDIUM",
    "MEDIUM",
    "MEDIUM_DARK",
    "DARK",
    "EXTRA_DARK",
  ],
  coffeeSpecies: [
    "ARABICA",
    "ROBUSTA",
    "LIBERICA",
    "CHARRIERIANA",
    "STENOPHYLLA",
  ],
  coffeeProcess: [
    "WASHED",
    "NATURAL_DRY",
    "HONEY",
    "PULPED_NATURAL",
    "PULPED_NATURAL_HONEY",
    "WET_HULLED",
  ],
  teaForm: [
    "loose_leaf",
    "tea_bag",
    "matcha_powder",
    "brick",
    "instant",
    "sachet",
  ],
  teaCaffeineLevel: ["none", "decaf", "low", "medium", "high"],
  // Coldest to hottest, which is the order a person picks in — `yuki_hie`
  // ("snow chilled") below `rei_shu`, `tobikiri_kan` ("extra hot") above
  // `atsu_kan`. Both were absent until E2c.
  sakeServingTemperature: [
    "yuki_hie",
    "rei_shu",
    "hiya",
    "room_temperature",
    "hitohada_kan",
    "nuru_kan",
    "jo_kan",
    "atsu_kan",
    "tobikiri_kan",
  ],
} as const;

export type StaticSource = keyof typeof STATIC_OPTIONS;

/**
 * The values a `kind: "static"` picker can offer, or `null` when the field is
 * not one — `undefined` options included, which is a malformed rule rather than
 * an empty picker.
 *
 * Exists so `mergeExtractedDefaults` can be told what a picker will accept
 * without importing this module: `src/lib` is compiled by `node --test` with no
 * bundler and no `@/` alias, so the merge takes its vocabulary as an argument
 * exactly as it takes its field list.
 */
export const staticOptionValues = (
  options: string | undefined,
): readonly string[] | null => {
  if (options === undefined) return null;
  const table: Record<string, readonly string[]> = STATIC_OPTIONS;
  return table[options] ?? null;
};

/* -------------------------------------------------------------------------- */
/* Keys, held to the schema                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The generated introspection, so a `key` below is checked rather than trusted.
 *
 * **This exists because a free-string `key` had already been wrong.** `SAKE`
 * declared `key: "vintage"` while `SakeAttributesInput` has only `vintageYear`
 * — a skew the SDL's own comment on that field warns about
 * (*"see `Sake.vintageYear` for why it is not called `vintage` on the wire"*)
 * and the table fell into anyway. On `/sakes/[itemId]/edit` a filled Vintage
 * year failed the whole `updateItem` with
 * `Field "vintage" is not defined by type "SakeAttributesInput"`; on the add
 * wizard, where the bag crosses as `attributes: JSON`, the year was **silently
 * dropped**. Nothing in `tsc`, Biome or the document tests could see it: the
 * bag is spliced together at runtime from these strings, so the mistake lived
 * in data, not in a query gql.tada could type.
 *
 * `graphql-env.d.ts` is already wired into `services/client/tsconfig.json` for
 * the `gql.tada/ts-plugin`, and `packages/schema#build` regenerates it ahead of
 * this package's typecheck — so this costs no new dependency and cannot go
 * stale against the SDL.
 */
type SchemaTypes = introspection["types"];

/**
 * `WINE` → `WineAttributesInput`. Derived, not listed, so a seventh item type
 * cannot arrive with half a mapping.
 *
 * If the schema ever renames one of the six, `AttributeKey` for that type
 * collapses to `never` and every one of its keys goes red at once. That is a
 * blunt failure, but a loud one, and the type name is in the error.
 */
type AttributeInputName<T extends ApiItemType> =
  `${Capitalize<Lowercase<T>>}AttributesInput`;

/** The field names of one `INPUT_OBJECT`, as a union of string literals. */
type InputFieldName<N extends string> = N extends keyof SchemaTypes
  ? SchemaTypes[N] extends { inputFields: readonly { name: string }[] }
    ? SchemaTypes[N]["inputFields"][number]["name"]
    : never
  : never;

/** `WINE` → `Wine`, the object type the same bag is read back off. */
type AttributeObjectName<T extends ApiItemType> = Capitalize<Lowercase<T>>;

/** The field names of one `OBJECT`, as a union of string literals. */
type ObjectFieldName<N extends string> = N extends keyof SchemaTypes
  ? SchemaTypes[N] extends { fields: Record<string, { name: string }> }
    ? keyof SchemaTypes[N]["fields"] & string
    : never
  : never;

/**
 * What a `key` may be for one item type: a field its input object accepts
 * **and** its object type returns.
 *
 * The readable half is deliberate, and it is what used to be the `writeOnly`
 * flag. Six fields were marked write-only on the premise that the object type
 * "does not expose it" — `Wine.specialDesignation`, `Wine.vineyardDesignation`,
 * `Sake.riceVariety`, `Sake.servingTemperature`, `Sake.vintageYear` and
 * `Tea.cultivar`. Live introspection against the running API says all six are
 * readable, and so does the checked-in SDL; the edit form was blanking them on
 * every visit for a reason that had stopped being true. A flag is the wrong
 * shape for that fact anyway — it is a hand-maintained claim about the schema,
 * which is exactly the kind of claim that goes stale without anything failing.
 * Requiring both halves here makes a genuinely write-only field a compile error
 * instead, at the moment someone tries to put one in a form that cannot
 * pre-fill it.
 */
export type AttributeKey<T extends ApiItemType> = InputFieldName<
  AttributeInputName<T>
> &
  ObjectFieldName<AttributeObjectName<T>>;

export type AttributeField<K extends string = string> = {
  /** The key inside `WineAttributesInput` and friends, and inside `defaults`. */
  key: K;
  label: string;
  /**
   * `date` is a real `Date` scalar (`YYYY-MM-DD`) — wine, beer and spirit
   * vintages are dates in this database. `year` is an integer year: sake's
   * `vintage` and tea's `harvestYear`. They are not interchangeable.
   * `boolean` is a tri-state column (UI parity G13, `teas.is_organic`): the
   * form value is `"true"`, `"false"` or `""` for "not recorded".
   */
  kind:
    | "text"
    | "number"
    | "date"
    | "year"
    | "boolean"
    | "reference"
    | "static";
  /** For `kind: "reference"`. */
  reference?: ReferenceSource;
  /** For `kind: "static"`. */
  options?: StaticSource;
  /** A `NOT NULL` column. Omitting it fails *inside the outbox*, not here. */
  required?: boolean;
  help?: string;
};

export type ItemTypeRules<K extends string = string> = {
  /** `false` for the four types whose table has `item_onboarding_id NOT NULL`. */
  canCreateDirectly: boolean;
  /** `description` is `NOT NULL` on `coffees` and nullable everywhere else. */
  descriptionRequired: boolean;
  attributes: readonly AttributeField<K>[];
};

/**
 * The table itself, checked key by key against the schema.
 *
 * `satisfies` rather than an annotation: an annotation of
 * `Record<ApiItemType, ItemTypeRules>` widens every `key` back to `string` and
 * the check evaporates. Declared here and re-exported widened below, so callers
 * keep the type they already had — only the literal is held to the schema.
 */
const RULES = {
  WINE: {
    canCreateDirectly: false,
    descriptionRequired: false,
    attributes: [
      {
        key: "vintage",
        label: "Vintage",
        kind: "date",
        required: true,
        help: "wines.vintage is NOT NULL — a wine without one never gets written.",
      },
      {
        key: "style",
        label: "Style",
        kind: "reference",
        reference: "wineStyle",
        required: true,
        help: "wines.style is NOT NULL.",
      },
      {
        key: "variety",
        label: "Variety",
        kind: "reference",
        reference: "wineVariety",
      },
      { key: "region", label: "Region", kind: "text" },
      {
        key: "specialDesignation",
        label: "Special designation",
        kind: "text",
      },
      {
        key: "vineyardDesignation",
        label: "Vineyard designation",
        kind: "text",
      },
      { key: "alcoholContentPercentage", label: "ABV %", kind: "number" },
    ],
  },
  BEER: {
    canCreateDirectly: false,
    descriptionRequired: false,
    attributes: [
      {
        key: "style",
        label: "Style",
        kind: "reference",
        reference: "beerStyle",
      },
      { key: "vintage", label: "Vintage", kind: "date" },
      {
        key: "internationalBitternessUnit",
        label: "IBU",
        kind: "number",
      },
      { key: "alcoholContentPercentage", label: "ABV %", kind: "number" },
    ],
  },
  SPIRIT: {
    canCreateDirectly: false,
    descriptionRequired: false,
    attributes: [
      {
        key: "spiritType",
        label: "Type",
        kind: "reference",
        reference: "spiritType",
        required: true,
        help: "spirits.type is NOT NULL.",
      },
      { key: "style", label: "Style", kind: "text" },
      { key: "vintage", label: "Vintage", kind: "date" },
      { key: "alcoholContentPercentage", label: "ABV %", kind: "number" },
    ],
  },
  COFFEE: {
    canCreateDirectly: false,
    descriptionRequired: true,
    attributes: [
      {
        key: "roastLevel",
        label: "Roast level",
        kind: "static",
        options: "coffeeRoastLevel",
      },
      {
        key: "species",
        label: "Species",
        kind: "static",
        options: "coffeeSpecies",
      },
      {
        key: "process",
        label: "Process",
        kind: "static",
        options: "coffeeProcess",
      },
      {
        key: "cultivar",
        label: "Cultivar",
        kind: "reference",
        reference: "coffeeCultivar",
      },
    ],
  },
  SAKE: {
    canCreateDirectly: true,
    descriptionRequired: false,
    attributes: [
      {
        key: "category",
        label: "Category",
        kind: "reference",
        reference: "sakeCategory",
        help: "junmai, ginjo, daiginjo… — sakes.category, not sakes.type.",
      },
      {
        key: "sakeType",
        label: "Flavour profile",
        kind: "reference",
        reference: "sakeType",
        help: "sakes.type is a flavour profile (dry, fruity, umami…).",
      },
      { key: "region", label: "Region", kind: "text" },
      { key: "polishGrade", label: "Polish grade %", kind: "number" },
      {
        key: "riceVariety",
        label: "Rice variety",
        kind: "reference",
        reference: "sakeRiceVariety",
      },
      {
        key: "servingTemperature",
        label: "Serving temperature",
        kind: "static",
        options: "sakeServingTemperature",
      },
      { key: "alcoholContentPercentage", label: "ABV %", kind: "number" },
      {
        // `vintageYear`, not `vintage`: `sakes.vintage` is an `integer` year
        // and the other five carry a `Date`, and one field name may not have
        // two types across siblings of an interface (A7c), so the wire name
        // differs from the column name. This read `vintage` until the
        // `satisfies` above was added, and the mutation failed on every sake
        // that had one.
        key: "vintageYear",
        label: "Vintage year",
        kind: "year",
        help: "sakes.vintage is an integer year, unlike wine's date.",
      },
      // UI parity G12 — the old sake form's four technical fields.
      {
        key: "sakeMeterValue",
        label: "Sake meter value (SMV)",
        kind: "number",
        help: "Nihonshu-do: positive is drier, negative sweeter.",
      },
      { key: "acidity", label: "Acidity", kind: "number" },
      { key: "aminoAcid", label: "Amino acid", kind: "number" },
      { key: "yeastStrain", label: "Yeast strain", kind: "text" },
    ],
  },
  TEA: {
    canCreateDirectly: true,
    descriptionRequired: false,
    attributes: [
      {
        key: "category",
        label: "Category",
        kind: "reference",
        reference: "teaCategory",
      },
      { key: "form", label: "Form", kind: "static", options: "teaForm" },
      {
        key: "caffeineLevel",
        label: "Caffeine",
        kind: "static",
        options: "teaCaffeineLevel",
      },
      { key: "cultivar", label: "Cultivar", kind: "text" },
      { key: "region", label: "Region", kind: "text" },
      { key: "harvestYear", label: "Harvest year", kind: "year" },
      // UI parity G13 — the old tea form's eight fields.
      { key: "oxidationLevel", label: "Oxidation level", kind: "text" },
      { key: "processing", label: "Processing", kind: "text" },
      { key: "ingredients", label: "Ingredients", kind: "text" },
      {
        key: "steepingTemperature",
        label: "Steeping temperature",
        kind: "text",
        help: "e.g. 80°C",
      },
      {
        key: "steepingTime",
        label: "Steeping time",
        kind: "text",
        help: "e.g. 3 min",
      },
      { key: "flavorProfile", label: "Flavor profile", kind: "text" },
      { key: "isOrganic", label: "Organic", kind: "boolean" },
      { key: "isFairTrade", label: "Fair trade", kind: "boolean" },
    ],
  },
} satisfies { [T in ApiItemType]: ItemTypeRules<AttributeKey<T>> };

export const ITEM_FORM_RULES: Record<ApiItemType, ItemTypeRules> = RULES;

/** The `CreateItemInput` / `UpdateItemInput` key that carries this type's bag. */
export const ATTRIBUTE_INPUT_KEY: Record<ApiItemType, string> = {
  WINE: "wine",
  BEER: "beer",
  SPIRIT: "spirit",
  COFFEE: "coffee",
  SAKE: "sake",
  TEA: "tea",
};

/** A reference-table value rendered for a person: `PINOT_NOIR` → `Pinot noir`. */
export const humanizeReferenceValue = (value: string): string => {
  const spaced = value.replace(/_/g, " ").toLowerCase().trim();
  return spaced.length === 0
    ? value
    : spaced[0].toUpperCase() + spaced.slice(1);
};

/**
 * Coerce one form value into what its attribute input expects.
 *
 * Empty means "not supplied" and must cross as `null`, never as `""`: every
 * constrained column is a foreign key to a reference table, and `''` is not a
 * row in any of them — it fails inside the actor rather than at the boundary.
 */
export const coerceAttributeValue = (
  field: AttributeField,
  raw: string,
): string | number | boolean | null => {
  const value = raw.trim();
  if (value === "") return null;
  if (field.kind === "boolean") {
    return value === "true" ? true : value === "false" ? false : null;
  }
  if (field.kind === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (field.kind === "year") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return value;
};

/** The fields a form must fill before `confirm`/`create` can possibly succeed. */
export const missingRequiredAttributes = (
  type: ApiItemType,
  values: Record<string, string>,
): AttributeField[] =>
  ITEM_FORM_RULES[type].attributes.filter(
    (field) =>
      field.required === true && (values[field.key] ?? "").trim() === "",
  );

/**
 * Pull the current attribute values out of the read fragment, by key — as the
 * strings `ItemFields` edits. A boolean becomes `"true"`/`"false"`, and a
 * `null` stays absent (`""`, "not recorded"), never `"false"`.
 */
export const attributesFrom = (
  attributes: Record<string, unknown>,
  type: ApiItemType,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const field of ITEM_FORM_RULES[type].attributes) {
    // Every field is read here. Six used to be skipped as `writeOnly`, on the
    // premise that the object type did not expose them; live introspection says
    // it does, and `AttributeKey` now makes that a compile-time requirement
    // rather than a flag, so there is nothing left to skip.
    //
    // `style` is aliased per type in `ItemAttributesFragment` (Wine's is
    // `String!` and the others' `String`, which graphql-js treats as a
    // conflict), so the read key is not always the input key.
    const readKey =
      field.key === "style"
        ? type === "WINE"
          ? "wineStyle"
          : type === "BEER"
            ? "beerStyle"
            : type === "SPIRIT"
              ? "spiritStyle"
              : field.key
        : field.key;
    const value = attributes[readKey];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[field.key] = String(value);
    }
  }
  return out;
};

/**
 * The edit form's half of the round trip: the attribute bag `updateItem` gets.
 * A blank value is **omitted**, so a column the form never showed (or a
 * boolean still "not recorded") is left alone rather than cleared.
 */
export const attributesToSave = (
  type: ApiItemType,
  values: Record<string, string>,
): Record<string, string | number | boolean> => {
  const attributes: Record<string, string | number | boolean> = {};
  for (const field of ITEM_FORM_RULES[type].attributes) {
    const raw = values[field.key] ?? "";
    if (raw.trim() === "") continue;
    const coerced = coerceAttributeValue(field, raw);
    if (coerced !== null) attributes[field.key] = coerced;
  }
  return attributes;
};
