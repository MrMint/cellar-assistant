/**
 * `ITEM_TYPE_SPECS` (contracts) meets Drizzle: which table each item type
 * lives in, and which row property each wire key is stored under.
 *
 * `contracts` knows the wire shape and nothing about Drizzle; `packages/db`
 * knows the tables and nothing about the wire. This module is the one place
 * the two are joined, and everything `ItemActor` used to spell out per type —
 * row → DTO, the insert values, the update patch, the embedding text — is
 * derived from it rather than written again.
 *
 * ## Total by construction
 *
 * `ITEM_BINDINGS` is checked against `ItemBindings<T>`, a mapped type over the
 * spec's wire keys whose values must be row properties of a compatible storage
 * type. So a seventh attribute in the spec without a binding, a binding to a
 * property the table does not have, or a `decimal` attribute bound to an
 * `integer` column, is a compile error here. `bindingsFor` fills every key the
 * spec does not rename with itself, which is why only the three renames are
 * written out.
 *
 * ## What is deliberately not here
 *
 * The writes. `packages/db`'s single-writer scan resolves `tx.insert(x)` only
 * when `x` is a named table import, so `ItemActor` keeps a switch whose arms
 * differ only in the table they name, and asks this module for the values.
 */
import { createHash } from "node:crypto";
import type {
  CreateItemInput,
  ItemAttributeKey,
  ItemAttributeKind,
  ItemAttributeSpecOf,
  ItemCoreEmbeddedField,
  ItemDto,
  ItemDtoOf,
  ItemRef,
  ItemType,
} from "@cellar-assistant/contracts";
import {
  byItemType,
  canonicalBarcodeCode,
  ITEM_CORE_EMBEDDED_FIELDS,
  ITEM_TYPE_SPECS,
  itemAttributeKeys,
  itemAttributeSpec,
  NON_VINTAGE,
  ValidationError,
} from "@cellar-assistant/contracts";
import {
  beers,
  coffees,
  sakes,
  spirits,
  teas,
  wines,
} from "@cellar-assistant/db";

/* -------------------------------------------------------------------------- */
/* Tables                                                                      */
/* -------------------------------------------------------------------------- */

import { requireUuid } from "./uuid.ts";
/** The physical table per item type. The one `ItemType → table` map. */
export const ITEM_TABLES = {
  WINE: wines,
  BEER: beers,
  SPIRIT: spirits,
  COFFEE: coffees,
  SAKE: sakes,
  TEA: teas,
} as const satisfies Record<ItemType, unknown>;

export type ItemTable<T extends ItemType = ItemType> = (typeof ITEM_TABLES)[T];
export type ItemRowOf<T extends ItemType> = ItemTable<T>["$inferSelect"];
export type ItemInsertOf<T extends ItemType> = ItemTable<T>["$inferInsert"];
/** Any of the six rows. */
export type ItemRow = { [T in ItemType]: ItemRowOf<T> }[ItemType];

/* -------------------------------------------------------------------------- */
/* Bindings                                                                    */
/* -------------------------------------------------------------------------- */

/** What Drizzle hands back for a kind: `numeric` and `date` are strings. */
type StorageOf<Kind extends ItemAttributeKind> = Kind extends
  | "text"
  | "date"
  | "decimal"
  ? string
  : Kind extends "boolean"
    ? boolean
    : number;

type KindOf<T extends ItemType, K extends ItemAttributeKey<T>> =
  ItemAttributeSpecOf<T, K> extends { readonly kind: infer Kind }
    ? Kind extends ItemAttributeKind
      ? Kind
      : never
    : never;

/** The row properties of `T` that can hold attribute `K`. */
type PropertyFor<T extends ItemType, K extends ItemAttributeKey<T>> = {
  [P in keyof ItemRowOf<T>]: NonNullable<ItemRowOf<T>[P]> extends StorageOf<
    KindOf<T, K>
  >
    ? P
    : never;
}[keyof ItemRowOf<T>] &
  string;

/** Every wire key of `T`, mapped to a row property that can store it. */
export type ItemBindings<T extends ItemType> = {
  readonly [K in ItemAttributeKey<T>]: PropertyFor<T, K>;
};

type Resolved<T extends ItemType, R> = {
  readonly [K in ItemAttributeKey<T>]: K extends keyof R ? R[K] : K;
};

/** The spec's keys, each bound to itself unless `renames` says otherwise. */
const bindingsFor = <
  T extends ItemType,
  const R extends { readonly [K in ItemAttributeKey<T>]?: string },
>(
  type: T,
  renames: R,
): Resolved<T, R> =>
  Object.fromEntries(
    itemAttributeKeys(type).map((key) => [
      key,
      (renames as Record<string, string | undefined>)[key] ?? key,
    ]),
  ) as Resolved<T, R>;

/**
 * Wire key → Drizzle row property. Identity except where the wire renames a
 * column (`ITEM_TYPE_SPECS` says why each rename exists).
 */
export const ITEM_BINDINGS = {
  WINE: bindingsFor("WINE", {}),
  BEER: bindingsFor("BEER", {}),
  SPIRIT: bindingsFor("SPIRIT", { spiritType: "type" }),
  COFFEE: bindingsFor("COFFEE", {}),
  SAKE: bindingsFor("SAKE", { sakeType: "type", vintageYear: "vintage" }),
  TEA: bindingsFor("TEA", {}),
} as const satisfies { readonly [T in ItemType]: ItemBindings<T> };

/** The row property for one wire key, widened for loops over every type. */
export const boundProperty = (type: ItemType, key: string): string => {
  const property = (ITEM_BINDINGS[type] as Record<string, string>)[key];
  if (property === undefined) {
    throw new ValidationError(`${type} has no attribute "${key}"`);
  }
  return property;
};

/* -------------------------------------------------------------------------- */
/* Values                                                                      */
/* -------------------------------------------------------------------------- */

const dateOf = (value: string | Date): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value;

/** Row → wire, per kind. `date` stays `YYYY-MM-DD`; `numeric` becomes a number. */
const decode = (kind: ItemAttributeKind, value: unknown): unknown => {
  if (value === null || value === undefined) return null;
  switch (kind) {
    case "date":
      return dateOf(value as string | Date);
    case "decimal":
      return Number(value);
    case "text":
    case "year":
    case "integer":
    case "boolean":
      return value;
  }
};

/** Wire → row, per kind. Drizzle models `numeric` as a string. */
const encode = (kind: ItemAttributeKind, value: unknown): unknown => {
  if (value === null || value === undefined) return null;
  return kind === "decimal" ? String(value) : value;
};

const iso = (value: Date | null): string =>
  (value ?? new Date(0)).toISOString();

/** Row → DTO. The read half of the bindings. */
export const itemRowToDto = <T extends ItemType>(
  type: T,
  row: ItemRowOf<T>,
): ItemDtoOf<T> => {
  const record = row as unknown as Record<string, unknown>;
  const attributes: Record<string, unknown> = {};
  for (const key of itemAttributeKeys(type)) {
    const spec = itemAttributeSpec(type, key);
    if (spec === undefined) continue;
    attributes[key] = decode(spec.kind, record[boundProperty(type, key)]);
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    createdById: row.createdById,
    barcodeCode: row.barcodeCode,
    country: row.country,
    type,
    ...attributes,
  } as ItemDtoOf<T>;
};

/** The same, for a caller holding a union row and a runtime type. */
export const anyItemRowToDto = (type: ItemType, row: ItemRow): ItemDto =>
  itemRowToDto(type, row as ItemRowOf<typeof type>) as ItemDto;

/**
 * Wire attribute bag → row properties. Absent keys are left out; `null` is
 * kept, so the caller decides what a `null` means (see `itemPatch`).
 */
export const attributeColumns = (
  type: ItemType,
  bag: Readonly<Record<string, unknown>> | null | undefined,
  keep: (key: string, value: unknown) => boolean = (_key, value) =>
    value !== undefined,
): Record<string, unknown> => {
  const columns: Record<string, unknown> = {};
  if (bag === null || bag === undefined) return columns;
  for (const key of itemAttributeKeys(type)) {
    const spec = itemAttributeSpec(type, key);
    if (spec === undefined) continue;
    const value = bag[key];
    if (!keep(key, value)) continue;
    columns[boundProperty(type, key)] = encode(spec.kind, value);
  }
  return columns;
};

/**
 * `wines`, `beers`, `spirits` and `coffees` declare `item_onboarding_id`
 * NOT NULL — an item of those four types cannot exist without an onboarding
 * row, which is why `ItemOnboardingActor.confirm` always supplies one and
 * `RecipePhotoJobActor` mints one. `sakes` and `teas` (added after the
 * onboarding flow was built) take one if given and are fine without.
 */
const onboardingIdFor = (
  type: ItemType,
  input: CreateItemInput,
): string | null => {
  const spec = ITEM_TYPE_SPECS[type];
  const id = input.itemOnboardingId ?? null;
  if (id === null) {
    if (!spec.onboardingRequired) return null;
    throw new ValidationError(
      `${spec.table}.item_onboarding_id is NOT NULL: create this item through ` +
        "ItemOnboardingActor.confirm, or pass itemOnboardingId",
    );
  }
  // For every type, optional ones included: a malformed id used to reach a
  // sake or tea insert unchecked and fail there as Postgres's opaque
  // `invalid input syntax for type uuid` — an unexpected error, not a
  // ValidationError naming the field.
  return requireUuid(id, "itemOnboardingId");
};

/**
 * The insert values for one new item. The caller has already run
 * `requireItemAttributes`, so a required attribute is present here.
 */
export const itemInsertValues = <T extends ItemType>(
  type: T,
  input: CreateItemInput,
  row: {
    readonly id: string;
    readonly name: string;
    readonly createdById: string;
  },
): ItemInsertOf<T> => {
  const bag = input[ITEM_TYPE_SPECS[type].bag as keyof CreateItemInput];
  return {
    id: row.id,
    name: row.name,
    description: input.description ?? null,
    country: input.country ?? null,
    // The canonical spelling, the only one `barcodes` holds
    // (`barcodes_code_canonical`): a caller that registered `012345678905`
    // through `ensureBarcode` and passes it here again means `00012345678905`.
    barcodeCode:
      input.barcodeCode === undefined || input.barcodeCode === null
        ? null
        : canonicalBarcodeCode(input.barcodeCode, input.barcodeType),
    createdById: row.createdById,
    itemOnboardingId: onboardingIdFor(type, input),
    ...attributeColumns(
      type,
      bag as Readonly<Record<string, unknown>> | null | undefined,
      () => true,
    ),
  } as ItemInsertOf<T>;
};

/**
 * The row properties whose values are embedded, in embedding order — the
 * spec's `embedding` list with each attribute resolved to its property,
 * index for index, so `embeddingTextFor` reads `record[properties[i]]` for
 * the spec's `fields[i]`. (Format 1 also used the property name as the
 * label, `type: BOURBON`; format 2 labels by `EMBEDDING_LABELS`.)
 */
export const EMBEDDING_PROPERTIES: Readonly<
  Record<ItemType, readonly string[]>
> = byItemType((type) =>
  ITEM_TYPE_SPECS[type].embedding.map((field: string) =>
    (ITEM_CORE_EMBEDDED_FIELDS as readonly string[]).includes(field)
      ? (field as ItemCoreEmbeddedField)
      : boundProperty(type, field),
  ),
);

/* -------------------------------------------------------------------------- */
/* The embedded text (N08)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Which `embeddingTextFor` format a stored vector was made from. It is the
 * prefix of `item_vectors.embedding_text` (`embeddingTextKey`), so the re-embed
 * job can find every row made from an older format in SQL.
 *
 * **Bump it whenever `embeddingTextFor` would return different text for an
 * unchanged row** — a label, a value rendering, the order, the layout — or the
 * old vectors stay "fresh" in a space the new text no longer describes.
 *
 * - 1 (implicit; `embedding_text` NULL): `spirit; name: …; type: BOURBON;
 *   alcoholContentPercentage: 45` — the Drizzle property as the label and the
 *   stored code as the value, no brand.
 * - 2: human-readable labels and values, and the item's brands after its name.
 */
export const EMBEDDING_TEXT_VERSION = 2;

type EmbeddedField = (typeof ITEM_TYPE_SPECS)[ItemType]["embedding"][number];

/**
 * The label each embedded field gets, by wire key. Total by type: a field
 * added to a spec's `embedding` list does not compile until it has a label
 * here. `name` has none — it leads the text after the type word.
 */
const EMBEDDING_LABELS: Readonly<
  Record<Exclude<EmbeddedField, "name">, string>
> = {
  description: "description",
  country: "country",
  vintage: "vintage",
  variety: "grape",
  region: "region",
  style: "style",
  specialDesignation: "designation",
  vineyardDesignation: "vineyard",
  alcoholContentPercentage: "ABV",
  internationalBitternessUnit: "IBU",
  spiritType: "type",
  roastLevel: "roast",
  process: "process",
  species: "species",
  cultivar: "cultivar",
  category: "category",
  sakeType: "profile",
  riceVariety: "rice",
  servingTemperature: "serving temperature",
  polishGrade: "rice polished to",
  vintageYear: "vintage",
  form: "form",
  caffeineLevel: "caffeine",
  harvestYear: "harvest",
};

/** Wire fields whose number is a percentage. */
const PERCENT_FIELDS: ReadonlySet<string> = new Set([
  "alcoholContentPercentage",
  "polishGrade",
]);

/**
 * A vocabulary code as words: `PILSENER_PILSNER_PILS` → `pilsener pilsner
 * pils`, `junmai_daiginjo` → `junmai daiginjo`, `UNITED_STATES` → `united
 * states`. Lower case, because the codes are upper or lower case by accident
 * of the table they live in, not because the case means anything.
 */
export const humanizeCode = (code: string): string =>
  code.replace(/_+/g, " ").trim().toLowerCase();

/** One embedded value as a person would write it, or `null` to leave it out. */
const renderEmbeddedValue = (
  type: ItemType,
  field: EmbeddedField,
  value: unknown,
): string | null => {
  if (value === null || value === undefined || value === "") {
    // X19: a wine's NULL vintage is an answer — non-vintage — and "NV" is
    // what a search for one types. No row embedded before X19 can hold one
    // (the column was NOT NULL), so no stored text changes and
    // `EMBEDDING_TEXT_VERSION` stays where it is.
    return value === null && itemAttributeSpec(type, field)?.nonVintage
      ? NON_VINTAGE
      : null;
  }
  if (field === "name" || field === "description") return String(value);
  if (field === "country") return humanizeCode(String(value));
  const spec = itemAttributeSpec(type, field);
  if (spec === undefined) return String(value);
  if (spec.vocabulary !== null) return humanizeCode(String(value));
  switch (spec.kind) {
    case "date":
      // `wines.vintage` is a calendar date by schema and a year by meaning:
      // every vintage is stored as `YYYY-01-01`.
      return String(value).slice(0, 4);
    case "boolean":
      return value === true ? "yes" : "no";
    case "decimal": {
      const number = Number(value);
      const shown = Number.isFinite(number) ? String(number) : String(value);
      return PERCENT_FIELDS.has(field) ? `${shown}%` : shown;
    }
    default:
      return String(value);
  }
};

/**
 * The text `regenerateVector` embeds. Deterministic, so a re-run is a no-op.
 *
 * `spirit: Lagavulin 16 Year Old; brand: Lagavulin; description: …; type:
 * scotch; country: scotland; ABV: 43%` — the type word, the name, the
 * brands (primary first, as the caller orders them), then the spec's
 * `embedding` fields in order, each under a label a person would use and with
 * its value spelled as words rather than as the stored code.
 *
 * The brand is there because it is often the only place a producer's name
 * appears — "Tignanello" never says Antinori — and a search for the producer
 * should find it. It is left out when the name already says it ("Jameson
 * Irish Whiskey", brand Jameson): repeating it adds nothing a search could
 * use and makes every sibling of the house look more like every other —
 * measured on the N05 eval, where it cost two menu lines their match. A
 * brand rename does not re-embed its items; the next change to the item, or
 * a version bump, does.
 *
 * Changing the output for an unchanged row requires bumping
 * {@link EMBEDDING_TEXT_VERSION}.
 */
export const embeddingTextFor = (
  ref: ItemRef,
  row: ItemRow,
  brands: readonly string[] = [],
): string => {
  const record = row as Record<string, unknown>;
  const fields = ITEM_TYPE_SPECS[ref.type]
    .embedding as readonly EmbeddedField[];
  const properties = EMBEDDING_PROPERTIES[ref.type];
  const parts: string[] = [];
  const name = renderEmbeddedValue(ref.type, "name", record.name) ?? "";
  parts.push(`${ref.type.toLowerCase()}: ${name}`);
  const brandNames = brands
    .map((brand) => brand.trim())
    .filter((brand) => brand !== "" && !nameSays(name, brand));
  if (brandNames.length > 0) parts.push(`brand: ${brandNames.join(", ")}`);
  fields.forEach((field, index) => {
    if (field === "name") return;
    const property = properties[index] ?? field;
    const value = renderEmbeddedValue(ref.type, field, record[property]);
    if (value === null) return;
    parts.push(`${EMBEDDING_LABELS[field]}: ${value}`);
  });
  return parts.join("; ");
};

/**
 * Whether `name` already contains `brand` as a run of whole words, ignoring
 * case, accents and apostrophes — "The Glenlivet 12 Year Old" says "The
 * Glenlivet", "Hendrick's Gin" says "Hendrick's", "Eagle Rare 10 Year" does
 * not say "Buffalo Trace".
 */
const nameSays = (name: string, brand: string): boolean => {
  const words = (text: string) =>
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['’]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  const haystack = ` ${words(name).join(" ")} `;
  const needle = words(brand).join(" ");
  return needle !== "" && haystack.includes(` ${needle} `);
};

/**
 * `item_vectors.embedding_text`: the format version and a digest of the text,
 * `v2:3f1c…` (16 hex digits of SHA-256). A stored vector whose key differs
 * from the one its item would embed now is stale — whether the format
 * changed (the version) or what the item says did (the digest: an edit, a
 * brand linked or unlinked). `NULL` on every row written before N08.
 */
export const embeddingTextKey = (text: string): string =>
  `v${EMBEDDING_TEXT_VERSION}:${createHash("sha256").update(text).digest("hex").slice(0, 16)}`;

/** The `embedding_text` prefix every current row has: `v2:`. */
export const EMBEDDING_TEXT_PREFIX = `v${EMBEDDING_TEXT_VERSION}:`;
