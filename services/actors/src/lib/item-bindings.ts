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
 * spec's `embedding` list with each attribute resolved to its property. The
 * property name is also the label in the embedded text (`type: BOURBON`), so
 * this is byte-for-byte the list `ItemActor` used to spell out.
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

/** The text `regenerateVector` embeds. Deterministic, so a re-run is a no-op. */
export const embeddingTextFor = (ref: ItemRef, row: ItemRow): string => {
  const record = row as Record<string, unknown>;
  const parts = [ref.type.toLowerCase()];
  for (const field of EMBEDDING_PROPERTIES[ref.type]) {
    const value = record[field];
    if (value === null || value === undefined || value === "") continue;
    parts.push(`${field}: ${String(value)}`);
  }
  return parts.join("; ");
};
