/**
 * What each of the six item types *is*, stated once.
 *
 * Before this table, one attribute fact — "a sake has a `sakeType`, stored in
 * `sakes.type`, constrained by `sake_type`, embedded" — was written by hand in
 * up to nine places: the DTO, the input bag, `REQUIRED_ITEM_ATTRIBUTES`,
 * `ITEM_ATTRIBUTE_KEY`, six six-armed switches in `ItemActor`, its
 * `EMBEDDING_FIELDS`, `vocabulary.ts`'s constrained and date lists, the Pothos
 * object and input types, and the client's `itemFormRules.ts`. The renames
 * (`spiritType` → `spirits.type`, `sakeType` → `sakes.type`, `vintageYear` →
 * `sakes.vintage`) were typed out three times each, and three tests existed
 * only to reconcile hand lists with `information_schema`.
 *
 * Now the per-type facts live here, and everything that can be derived is:
 *
 * - **contracts** — the DTO and input types (`ItemAttributesOf`,
 *   `ItemAttributesInputOf`), `REQUIRED_ITEM_ATTRIBUTES`, `ITEM_ATTRIBUTE_KEY`;
 * - **actors** — `lib/item-bindings.ts` maps each wire key to its Drizzle
 *   property and derives the row → DTO read, the insert values, the update
 *   patch, the embedding text and `vocabulary.ts`'s two lists;
 * - **api** — deliberately *not* generated (per-type GraphQL choices such as a
 *   nullable `Wine.style` are made by hand, for reasons written beside them);
 *   `services/api/src/schema/item-spec-parity.test.ts` holds the hand-written
 *   Pothos types to this table instead;
 * - **client** — `itemFormRules.ts` keeps its labels and pickers, and
 *   `src/lib/dev-checks/item-spec.test.ts` holds its keys, requiredness and
 *   vocabulary sources to this table.
 *
 * ## What a field means
 *
 * - The record key of `attributes` is the **wire key**: the field name in the
 *   `<Type>AttributesInput` bag, in the DTO, and on the GraphQL object type.
 *   One name per attribute — a rename happens exactly once, in `column`.
 * - `column` is the SQL column on `table`. Messages cite `<table>.<column>`.
 * - `kind` is the wire and storage shape: `text` (string ↔ text), `date`
 *   (ISO calendar date ↔ `date`), `year` (integer year ↔ `integer`, rendered
 *   by the client as a year), `integer` (number ↔ `integer`), `decimal`
 *   (number ↔ `numeric`, which Drizzle models as a string), `boolean`
 *   (boolean ↔ `boolean`, a tri-state on the wire: true, false or null for
 *   "not recorded" — UI parity G13's `teas.is_organic`/`is_fair_trade`).
 * - `required` is a `NOT NULL` column with no default that only the caller
 *   can fill — the three GraphQL cannot enforce, because it has no input
 *   unions (`REQUIRED_ITEM_ATTRIBUTES` explains why that matters).
 * - `vocabulary` is a closed set: a reference table (`ReferenceKind`) or a
 *   Postgres enum whose labels are compiled in (`enums.ts`).
 *
 * ## Why declaration order and `embedding` are both load-bearing
 *
 * Two orders are observable and they disagree, so neither can be derived from
 * the other:
 *
 * - **Declaration order** of `attributes` is the order the item-defaults
 *   output schema lists its bag properties in (`prompts.ts` walks the required
 *   and constrained lists, which are filtered from this order). Property order
 *   is generation order for a grammar-constrained model — see `prompts.ts` —
 *   so reordering attributes here changes what the model is asked, in what
 *   order.
 * - **`embedding`** is the exact sequence of `field: value` parts that
 *   `regenerateVector` embeds. It is the input of every stored `item_vectors`
 *   row, so reordering it silently changes the vector a re-embedded item gets.
 *   It names core fields (`name`, `description`, `country`) as well as
 *   attributes, which is why it is a per-type list rather than a flag on each
 *   attribute.
 *
 * `item-types.test.ts` pins both orders against the lists they replaced.
 */
import {
  COFFEE_PROCESSES,
  COFFEE_ROAST_LEVELS,
  COFFEE_SPECIES,
  SAKE_SERVING_TEMPERATURES,
  TEA_CAFFEINE_LEVELS,
  TEA_FORMS,
} from "./enums.ts";
import type { ItemType } from "./items.ts";
import type { ReferenceKind } from "./reference.ts";

export type ItemAttributeKind =
  | "text"
  | "date"
  | "year"
  | "integer"
  | "decimal"
  | "boolean";

export type ItemVocabularySpec =
  /** A reference table — `referenceData(kind)` serves its rows. */
  | { readonly kind: "reference"; readonly reference: ReferenceKind }
  /** A `pgEnum`, whose labels are compiled in (`enums.ts`). */
  | { readonly kind: "static"; readonly values: readonly string[] };

export type ItemAttributeSpec = {
  readonly kind: ItemAttributeKind;
  /** The SQL column on the type's `table`. */
  readonly column: string;
  readonly required: boolean;
  readonly vocabulary: ItemVocabularySpec | null;
  /** One line for a human: what the value is and where it is stored. */
  readonly description: string;
};

/** The columns every item table shares that take part in an embedding. */
export const ITEM_CORE_EMBEDDED_FIELDS = [
  "name",
  "description",
  "country",
] as const;
export type ItemCoreEmbeddedField = (typeof ITEM_CORE_EMBEDDED_FIELDS)[number];

export type ItemTypeSpec = {
  /** The physical table. */
  readonly table: string;
  /** `CreateItemInput` / `UpdateItemInput`'s key for this type's bag. */
  readonly bag: string;
  readonly graphql: {
    /** The object type implementing `Item`. */
    readonly object: string;
    /** The attribute bag's input type. */
    readonly input: string;
  };
  /**
   * `item_onboarding_id NOT NULL` — the type cannot be created outside the
   * onboarding flow (`ItemActor.create` refuses without an id).
   */
  readonly onboardingRequired: boolean;
  /** `description NOT NULL` — `coffees` only. */
  readonly descriptionRequired: boolean;
  readonly attributes: { readonly [key: string]: ItemAttributeSpec };
  /** Ordered: what `regenerateVector` embeds. See the module doc. */
  readonly embedding: readonly string[];
};

const reference = (kind: ReferenceKind) =>
  ({ kind: "reference", reference: kind }) as const;
const staticValues = (values: readonly string[]) =>
  ({ kind: "static", values }) as const;

export const ITEM_TYPE_SPECS = {
  WINE: {
    table: "wines",
    bag: "wine",
    graphql: { object: "Wine", input: "WineAttributesInput" },
    onboardingRequired: true,
    descriptionRequired: false,
    attributes: {
      vintage: {
        kind: "date",
        column: "vintage",
        required: true,
        vocabulary: null,
        description: "The vintage, as a calendar date (`wines.vintage`).",
      },
      style: {
        kind: "text",
        column: "style",
        required: true,
        vocabulary: reference("wine_style"),
        description: "`wines.style`, a `wine_style` value.",
      },
      variety: {
        kind: "text",
        column: "variety",
        required: false,
        vocabulary: reference("wine_variety"),
        description: "`wines.variety`, a `wine_variety` value.",
      },
      region: {
        kind: "text",
        column: "region",
        required: false,
        vocabulary: null,
        description: "Free text (`wines.region`).",
      },
      specialDesignation: {
        kind: "text",
        column: "special_designation",
        required: false,
        vocabulary: null,
        description: "Free text (`wines.special_designation`).",
      },
      vineyardDesignation: {
        kind: "text",
        column: "vineyard_designation",
        required: false,
        vocabulary: null,
        description: "Free text (`wines.vineyard_designation`).",
      },
      alcoholContentPercentage: {
        kind: "decimal",
        column: "alcohol_content_percentage",
        required: false,
        vocabulary: null,
        description: "ABV, 0–100 (`wines.alcohol_content_percentage`).",
      },
    },
    embedding: [
      "name",
      "description",
      "vintage",
      "variety",
      "region",
      "style",
      "country",
      "specialDesignation",
      "vineyardDesignation",
      "alcoholContentPercentage",
    ],
  },
  BEER: {
    table: "beers",
    bag: "beer",
    graphql: { object: "Beer", input: "BeerAttributesInput" },
    onboardingRequired: true,
    descriptionRequired: false,
    attributes: {
      style: {
        kind: "text",
        column: "style",
        required: false,
        vocabulary: reference("beer_style"),
        description: "`beers.style`, a `beer_style` value.",
      },
      vintage: {
        kind: "date",
        column: "vintage",
        required: false,
        vocabulary: null,
        description: "The vintage, as a calendar date (`beers.vintage`).",
      },
      internationalBitternessUnit: {
        kind: "integer",
        column: "international_bitterness_unit",
        required: false,
        vocabulary: null,
        description: "IBU (`beers.international_bitterness_unit`).",
      },
      alcoholContentPercentage: {
        kind: "decimal",
        column: "alcohol_content_percentage",
        required: false,
        vocabulary: null,
        description: "ABV, 0–100 (`beers.alcohol_content_percentage`).",
      },
    },
    embedding: [
      "name",
      "description",
      "style",
      "vintage",
      "country",
      "internationalBitternessUnit",
      "alcoholContentPercentage",
    ],
  },
  SPIRIT: {
    table: "spirits",
    bag: "spirit",
    graphql: { object: "Spirit", input: "SpiritAttributesInput" },
    onboardingRequired: true,
    descriptionRequired: false,
    attributes: {
      spiritType: {
        kind: "text",
        // Renamed on the wire: `type` is the `Item` interface's discriminator.
        column: "type",
        required: true,
        vocabulary: reference("spirit_type"),
        description: "`spirits.type`, a `spirit_type` value.",
      },
      style: {
        kind: "text",
        column: "style",
        required: false,
        vocabulary: null,
        description: "Free text (`spirits.style`).",
      },
      vintage: {
        kind: "date",
        column: "vintage",
        required: false,
        vocabulary: null,
        description: "The vintage, as a calendar date (`spirits.vintage`).",
      },
      alcoholContentPercentage: {
        kind: "decimal",
        column: "alcohol_content_percentage",
        required: false,
        vocabulary: null,
        description: "ABV, 0–100 (`spirits.alcohol_content_percentage`).",
      },
    },
    embedding: [
      "name",
      "description",
      "spiritType",
      "style",
      "vintage",
      "country",
      "alcoholContentPercentage",
    ],
  },
  COFFEE: {
    table: "coffees",
    bag: "coffee",
    graphql: { object: "Coffee", input: "CoffeeAttributesInput" },
    onboardingRequired: true,
    descriptionRequired: true,
    attributes: {
      // Declared vocabulary-first: this is the order the item-defaults schema
      // has always listed them in, and property order is generation order.
      cultivar: {
        kind: "text",
        column: "cultivar",
        required: false,
        vocabulary: reference("coffee_cultivar"),
        description: "`coffees.cultivar`, a `coffee_cultivar` value.",
      },
      roastLevel: {
        kind: "text",
        column: "roast_level",
        required: false,
        vocabulary: staticValues(COFFEE_ROAST_LEVELS),
        description: "`coffees.roast_level`, a `coffee_roast_level` label.",
      },
      species: {
        kind: "text",
        column: "species",
        required: false,
        vocabulary: staticValues(COFFEE_SPECIES),
        description: "`coffees.species`, a `coffee_species` label.",
      },
      process: {
        kind: "text",
        column: "process",
        required: false,
        vocabulary: staticValues(COFFEE_PROCESSES),
        description: "`coffees.process`, a `coffee_process` label.",
      },
    },
    embedding: [
      "name",
      "description",
      "roastLevel",
      "process",
      "species",
      "cultivar",
      "country",
    ],
  },
  SAKE: {
    table: "sakes",
    bag: "sake",
    graphql: { object: "Sake", input: "SakeAttributesInput" },
    onboardingRequired: false,
    descriptionRequired: false,
    attributes: {
      category: {
        kind: "text",
        column: "category",
        required: false,
        vocabulary: reference("sake_category"),
        description: "`sakes.category`, a `sake_category` value.",
      },
      sakeType: {
        kind: "text",
        // Renamed on the wire, as `spiritType` is.
        column: "type",
        required: false,
        vocabulary: reference("sake_type"),
        description: "`sakes.type`, a `sake_type` value.",
      },
      riceVariety: {
        kind: "text",
        column: "rice_variety",
        required: false,
        vocabulary: reference("sake_rice_variety"),
        description: "`sakes.rice_variety`, a `sake_rice_variety` value.",
      },
      servingTemperature: {
        kind: "text",
        column: "serving_temperature",
        required: false,
        vocabulary: staticValues(SAKE_SERVING_TEMPERATURES),
        description:
          "`sakes.serving_temperature`, a `sake_serving_temperature` label.",
      },
      region: {
        kind: "text",
        column: "region",
        required: false,
        vocabulary: null,
        description: "Free text (`sakes.region`).",
      },
      polishGrade: {
        kind: "decimal",
        column: "polish_grade",
        required: false,
        vocabulary: null,
        description: "Rice polishing ratio, % (`sakes.polish_grade`).",
      },
      alcoholContentPercentage: {
        kind: "decimal",
        column: "alcohol_content_percentage",
        required: false,
        vocabulary: null,
        description: "ABV (`sakes.alcohol_content_percentage`).",
      },
      vintageYear: {
        kind: "year",
        // Renamed on the wire: `sakes.vintage` is an integer year, and the
        // other types' `vintage` is a `Date` — one field name may not have
        // two types across siblings of the `Item` interface (A7c).
        column: "vintage",
        required: false,
        vocabulary: null,
        description: "The vintage, as an integer year (`sakes.vintage`).",
      },
      // UI parity G12: four columns the old sake detail page showed, which the
      // rewrite never exposed. Appended, and left out of `embedding`, so no
      // stored vector and no item-defaults prompt changes (module doc).
      sakeMeterValue: {
        kind: "decimal",
        column: "sake_meter_value",
        required: false,
        vocabulary: null,
        description:
          "Nihonshu-do, dry (+) to sweet (−) (`sakes.sake_meter_value`).",
      },
      acidity: {
        kind: "decimal",
        column: "acidity",
        required: false,
        vocabulary: null,
        description: "Acidity (`sakes.acidity`).",
      },
      aminoAcid: {
        kind: "decimal",
        column: "amino_acid",
        required: false,
        vocabulary: null,
        description: "Amino acid level (`sakes.amino_acid`).",
      },
      yeastStrain: {
        kind: "text",
        column: "yeast_strain",
        required: false,
        vocabulary: null,
        description: "Free text (`sakes.yeast_strain`).",
      },
    },
    embedding: [
      "name",
      "description",
      "category",
      "sakeType",
      "region",
      "country",
      "polishGrade",
      "riceVariety",
      "servingTemperature",
      "vintageYear",
      "alcoholContentPercentage",
    ],
  },
  TEA: {
    table: "teas",
    bag: "tea",
    graphql: { object: "Tea", input: "TeaAttributesInput" },
    onboardingRequired: false,
    descriptionRequired: false,
    attributes: {
      category: {
        kind: "text",
        column: "category",
        required: false,
        vocabulary: reference("tea_category"),
        description: "`teas.category`, a `tea_category` value.",
      },
      form: {
        kind: "text",
        column: "form",
        required: false,
        vocabulary: staticValues(TEA_FORMS),
        description: "`teas.form`, a `tea_form` label.",
      },
      caffeineLevel: {
        kind: "text",
        column: "caffeine_level",
        required: false,
        vocabulary: staticValues(TEA_CAFFEINE_LEVELS),
        description: "`teas.caffeine_level`, a `tea_caffeine_level` label.",
      },
      region: {
        kind: "text",
        column: "region",
        required: false,
        vocabulary: null,
        description: "Free text (`teas.region`).",
      },
      cultivar: {
        kind: "text",
        column: "cultivar",
        required: false,
        vocabulary: null,
        description: "Free text (`teas.cultivar`).",
      },
      harvestYear: {
        kind: "year",
        column: "harvest_year",
        required: false,
        vocabulary: null,
        description: "The harvest, as an integer year (`teas.harvest_year`).",
      },
      // UI parity G13: eight columns the old tea detail cards showed. Appended
      // and not embedded, for the reason the sake block gives.
      oxidationLevel: {
        kind: "text",
        column: "oxidation_level",
        required: false,
        vocabulary: null,
        description: "Free text (`teas.oxidation_level`).",
      },
      processing: {
        kind: "text",
        column: "processing",
        required: false,
        vocabulary: null,
        description: "Free text (`teas.processing`).",
      },
      ingredients: {
        kind: "text",
        column: "ingredients",
        required: false,
        vocabulary: null,
        description: "Free text, for blends (`teas.ingredients`).",
      },
      steepingTemperature: {
        kind: "text",
        column: "steeping_temperature",
        required: false,
        vocabulary: null,
        description: "Free text, e.g. `80°C` (`teas.steeping_temperature`).",
      },
      steepingTime: {
        kind: "text",
        column: "steeping_time",
        required: false,
        vocabulary: null,
        description: "Free text, e.g. `3 min` (`teas.steeping_time`).",
      },
      flavorProfile: {
        kind: "text",
        column: "flavor_profile",
        required: false,
        vocabulary: null,
        description: "Free text (`teas.flavor_profile`).",
      },
      isOrganic: {
        kind: "boolean",
        column: "is_organic",
        required: false,
        vocabulary: null,
        description:
          "Certified organic; null when not recorded (`teas.is_organic`).",
      },
      isFairTrade: {
        kind: "boolean",
        column: "is_fair_trade",
        required: false,
        vocabulary: null,
        description:
          "Fair-trade certified; null when not recorded (`teas.is_fair_trade`).",
      },
    },
    embedding: [
      "name",
      "description",
      "category",
      "form",
      "caffeineLevel",
      "region",
      "country",
      "cultivar",
      "harvestYear",
    ],
  },
} as const satisfies Record<ItemType, ItemTypeSpec>;

/* -------------------------------------------------------------------------- */
/* Derived types                                                               */
/* -------------------------------------------------------------------------- */

type Specs = typeof ITEM_TYPE_SPECS;

/** Flattens an intersection into one object type, for readable hovers. */
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** The wire keys of one type's attributes: `vintage`, `spiritType`, … */
export type ItemAttributeKey<T extends ItemType> =
  keyof Specs[T]["attributes"] & string;

/** One attribute's spec, by type and wire key. */
export type ItemAttributeSpecOf<
  T extends ItemType,
  K extends ItemAttributeKey<T>,
> = Specs[T]["attributes"][K];

/** What a kind looks like on the wire. */
export type ItemAttributeWire<Kind extends ItemAttributeKind> = Kind extends
  | "text"
  | "date"
  ? string
  : Kind extends "boolean"
    ? boolean
    : number;

type WireOf<T extends ItemType, K extends ItemAttributeKey<T>> =
  ItemAttributeSpecOf<T, K> extends { readonly kind: infer Kind }
    ? Kind extends ItemAttributeKind
      ? ItemAttributeWire<Kind>
      : never
    : never;

type IsRequired<T extends ItemType, K extends ItemAttributeKey<T>> =
  ItemAttributeSpecOf<T, K> extends { readonly required: true } ? true : false;

/**
 * One type's attributes as the DTO carries them: a required attribute is
 * never null (its column is `NOT NULL`), every other one may be.
 */
export type ItemAttributesOf<T extends ItemType> = Simplify<{
  readonly [K in ItemAttributeKey<T>]: IsRequired<T, K> extends true
    ? WireOf<T, K>
    : WireOf<T, K> | null;
}>;

/**
 * One type's attribute bag as `CreateItemInput`/`UpdateItemInput` carry it.
 * Every member is optional: GraphQL has no input unions, so the bag cannot
 * make `wine.style` required without making it required for beers too.
 */
export type ItemAttributesInputOf<T extends ItemType> = Simplify<{
  readonly [K in ItemAttributeKey<T>]?: WireOf<T, K> | null;
}>;

/** `WINE` → `"wine"`. */
export type ItemAttributeBag<T extends ItemType> = Specs[T]["bag"];

/* -------------------------------------------------------------------------- */
/* Runtime helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A total `Record<ItemType, V>`, built from the spec's own keys. (Not from
 * `ITEM_TYPES`: `items.ts` imports this module at load time, so reading its
 * values here would be a cycle.)
 */
export const byItemType = <V>(
  build: (type: ItemType) => V,
): Record<ItemType, V> =>
  Object.fromEntries(
    (Object.keys(ITEM_TYPE_SPECS) as ItemType[]).map((type) => [
      type,
      build(type),
    ]),
  ) as Record<ItemType, V>;

/** The wire keys of one type's attributes, in declaration order. */
export const itemAttributeKeys = <T extends ItemType>(
  type: T,
): readonly ItemAttributeKey<T>[] =>
  Object.keys(ITEM_TYPE_SPECS[type].attributes) as ItemAttributeKey<T>[];

/** One attribute's spec, widened for callers iterating over every type. */
export const itemAttributeSpec = (
  type: ItemType,
  key: string,
): ItemAttributeSpec | undefined =>
  (ITEM_TYPE_SPECS[type].attributes as ItemTypeSpec["attributes"])[key];

/** `(type, spec)` pairs over every attribute of one type, in declaration order. */
export const itemAttributeEntries = (
  type: ItemType,
): readonly (readonly [string, ItemAttributeSpec])[] =>
  Object.entries(
    ITEM_TYPE_SPECS[type].attributes as ItemTypeSpec["attributes"],
  );
