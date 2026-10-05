/**
 * The polymorphic item foreign key — "an arc" — stated once per table.
 *
 * Ten tables point at an item through six nullable columns, one per item type
 * (`wine_id`, `beer_id`, … or `suggested_wine_id`, …), under a
 * `num_nonnulls(...)` check that lets exactly one be set. Every reader and
 * writer of those tables used to carry its own `ItemType → column` map — about
 * sixteen of them, in three spellings (Drizzle column, property name, SQL
 * name), plus hand-typed `coalesce(...)`, `CASE` and `DISTINCT ON` lists and
 * column names spliced into `sql.raw`. Two `itemRefOf`s disagreed about which
 * error an impossible row raises.
 *
 * `itemArc(table)` derives all of it from the table's own Drizzle columns:
 *
 * - `columns` / `properties` — the six columns, and their row property names;
 * - `where(ref)` — `<column> = id` for the ref's type;
 * - `values(ref)` / `assign(ref)` — the insert/update fragment (the latter sets
 *   the other five to `null`, for a row that changes which item it names);
 * - `refOf(row)` — the ref a row names (by property, or by SQL column name for
 *   a raw `db.execute` row), `null` when none of the six is set;
 * - `idExpr` / `typeExpr` / `isSet(type)` / `columnList` — SQL fragments.
 *
 * **Columns only.** Nothing here issues a query, and nothing here writes: the
 * single-writer scan (`packages/db/src/writers-scan.ts`) must go on seeing
 * each `tx.insert(itemImage)` at its call site.
 *
 * Every fragment takes an optional table alias (`"ib"`) for the raw-SQL
 * collection actors, and renders a column through `sql.identifier` of its own
 * Drizzle name — never a column name typed as a string. `item-arcs.test.ts`
 * discovers the arc tables from the schema and holds `ARCS` to them, and
 * forbids hand-written arc maps and `_id` names in `sql.raw` under
 * `services/actors/src`.
 */
import type { ItemRef, ItemType } from "@cellar-assistant/contracts";
import { ConflictError, ITEM_TYPES } from "@cellar-assistant/contracts";
import {
  cellarItems,
  itemBrands,
  itemFavorites,
  itemImage,
  itemMatchSuggestions,
  itemReviews,
  itemVectors,
  placeMenuItems,
  recipeIngredients,
  tierListItems,
} from "@cellar-assistant/db";
import type {
  Column,
  InferSelectModel,
  SQL,
  Table,
} from "@cellar-assistant/db/orm";
import {
  eq,
  getTableColumns,
  getTableName,
  sql,
} from "@cellar-assistant/db/orm";

/**
 * A raw `db.execute` row that carries an arc's columns under their SQL names.
 * Typed by pattern rather than column by column, so a row type never grows a
 * per-item-type field list of its own; read it with `refOf(row, "column")`.
 */
export type ArcSqlRow = { readonly [column: `${string}_id`]: string | null };

/** The select-row property names of `TTable`. */
type PropertyOf<TTable extends Table> = keyof InferSelectModel<TTable> & string;

/**
 * One of `TTable`'s own column types — `PgColumn` for every table here, which
 * is what Drizzle's `onConflictDoUpdate({ target })` requires. `Column` alone
 * (what `columns` used to be typed as) is table-agnostic, and Drizzle will not
 * take it as a conflict target.
 */
export type ColumnOf<TTable extends Table> =
  TTable["_"]["columns"][keyof TTable["_"]["columns"]];

export type ItemArc<TTable extends Table = Table> = {
  readonly table: TTable;
  /** The SQL table name. */
  readonly name: string;
  /**
   * The six columns, typed as the table's own (`ColumnOf`) so a caller can hand
   * one to Drizzle anywhere a column of this table is wanted — an
   * `onConflictDoUpdate` target included — without a per-type map of its own.
   */
  readonly columns: Readonly<Record<ItemType, ColumnOf<TTable>>>;
  /** Row property per type (`wineId`, `suggestedWineId`). */
  readonly properties: Readonly<Record<ItemType, PropertyOf<TTable>>>;
  /** One type's column, rendered — qualified by `alias` when given. */
  column(type: ItemType, alias?: string): SQL;
  /** One type's column name, unqualified — an `insert (…)` column list. */
  unqualified(type: ItemType): SQL;
  /** `<the ref's column> = <ref.id>`. */
  where(ref: ItemRef, alias?: string): SQL;
  /** `<type's column> is not null`. */
  isSet(type: ItemType, alias?: string): SQL;
  /** `{ [property]: id }` — spread into an insert. */
  values(ref: ItemRef): { readonly [property: string]: string };
  /** All six properties: the ref's set to its id, the rest `null`. */
  assign(ref: ItemRef | null): { readonly [property: string]: string | null };
  /** The ref a row names, or `null` when none of the six columns is set. */
  refOf(row: object, keyedBy?: "property" | "column"): ItemRef | null;
  /** `refOf`, for a row the check constraint says must name an item. */
  requireRefOf(row: object, keyedBy?: "property" | "column"): ItemRef;
  /**
   * `coalesce(<columns>)` — the one non-null id. `types` narrows it to those
   * types' columns (a search over some types only), in `ITEM_TYPES` order.
   */
  idExpr(alias?: string, types?: readonly ItemType[]): SQL;
  /**
   * `case when <col> is not null then '<TYPE>' … end` — `null` when none of
   * `types`' columns (default: all six) is set.
   */
  typeExpr(alias?: string, types?: readonly ItemType[]): SQL;
  /** The six columns, comma-separated — `group by`, `partition by`, `select`. */
  columnList(alias?: string): SQL;
};

/** `WINE` → `wineId` — the naming nine of the ten arc tables follow. */
const defaultProperty = (type: ItemType): string => `${type.toLowerCase()}Id`;

/** `WINE` → `suggestedWineId`. */
export const suggestedProperty = (type: ItemType): string =>
  `suggested${type.charAt(0)}${type.slice(1).toLowerCase()}Id`;

/**
 * The arc on one table. Throws at module load if the table lacks a column the
 * naming promises — `item-arcs.test.ts` is what keeps that from shipping.
 */
export const itemArc = <TTable extends Table>(
  table: TTable,
  options: { readonly property?: (type: ItemType) => string } = {},
): ItemArc<TTable> => {
  const name = getTableName(table);
  const all = getTableColumns(table) as Record<string, Column>;
  const propertyOf = options.property ?? defaultProperty;

  const properties = {} as Record<ItemType, PropertyOf<TTable>>;
  const columns = {} as Record<ItemType, ColumnOf<TTable>>;
  for (const type of ITEM_TYPES) {
    const property = propertyOf(type);
    const column = all[property];
    if (column === undefined) {
      throw new Error(`${name} has no ${property} column for its ${type} arc`);
    }
    properties[type] = property as PropertyOf<TTable>;
    // It is one of `table`'s own columns — read from `getTableColumns(table)`
    // by the property just checked — so it has that table's column type.
    columns[type] = column as ColumnOf<TTable>;
  }

  const column = (type: ItemType, alias?: string): SQL =>
    alias === undefined
      ? sql`${columns[type]}`
      : sql`${sql.identifier(alias)}.${sql.identifier(columns[type].name)}`;

  const refOf = (
    row: object,
    keyedBy: "property" | "column" = "property",
  ): ItemRef | null => {
    const record = row as Record<string, unknown>;
    for (const type of ITEM_TYPES) {
      const key =
        keyedBy === "property" ? properties[type] : columns[type].name;
      const id = record[key];
      if (typeof id === "string") return { type, id };
    }
    return null;
  };

  const columnList = (
    alias?: string,
    types: readonly ItemType[] = ITEM_TYPES,
  ): SQL =>
    sql.join(
      types.map((type) => column(type, alias)),
      sql`, `,
    );

  return {
    table,
    name,
    columns,
    properties,
    column,
    unqualified: (type) => sql`${sql.identifier(columns[type].name)}`,
    where: (ref, alias) =>
      alias === undefined
        ? eq(columns[ref.type], ref.id)
        : sql`${column(ref.type, alias)} = ${ref.id}`,
    isSet: (type, alias) => sql`${column(type, alias)} is not null`,
    values: (ref) => ({ [properties[ref.type]]: ref.id }),
    assign: (ref) =>
      Object.fromEntries(
        ITEM_TYPES.map((type) => [
          properties[type],
          ref !== null && ref.type === type ? ref.id : null,
        ]),
      ),
    refOf,
    requireRefOf: (row, keyedBy) => {
      const ref = refOf(row, keyedBy);
      if (ref !== null) return ref;
      const id = (row as { id?: unknown }).id;
      throw new ConflictError(
        `${name} ${String(id)} names no item — the row violates its own ` +
          "num_nonnulls check",
      );
    },
    idExpr: (alias, types) => sql`coalesce(${columnList(alias, types)})`,
    // Filtered through `ITEM_TYPES` rather than trusted: only the six enum
    // literals ever reach the `sql.raw` below, whatever a caller passes.
    typeExpr: (alias, types = ITEM_TYPES) =>
      sql`(case ${sql.join(
        ITEM_TYPES.filter((type) => types.includes(type)).map(
          (type) =>
            sql`when ${column(type, alias)} is not null then ${sql.raw(`'${type}'`)}`,
        ),
        sql` `,
      )} end)`,
    columnList: (alias) => columnList(alias),
  };
};

/**
 * Every table with an item arc. `item-arcs.test.ts` discovers the arc tables
 * from the schema (every table with two or more `<type>_id` foreign keys into
 * the item tables) and fails if one is missing here, if one carries fewer
 * than all six columns, or if its `num_nonnulls` check does not name them all.
 *
 * Three share their check with one more column, and say so where they are
 * read: `recipe_ingredients` (`generic_item_id`), `tier_list_items`
 * (`place_id`), `item_match_suggestions` (`suggested_recipe_id`). And
 * `place_menu_items`' check is `<= 1`, because a menu line may be unmatched.
 */
export const ARCS = {
  cellarItems: itemArc(cellarItems),
  itemBrands: itemArc(itemBrands),
  itemFavorites: itemArc(itemFavorites),
  itemImage: itemArc(itemImage),
  itemMatchSuggestions: itemArc(itemMatchSuggestions, {
    property: suggestedProperty,
  }),
  itemReviews: itemArc(itemReviews),
  itemVectors: itemArc(itemVectors),
  placeMenuItems: itemArc(placeMenuItems),
  recipeIngredients: itemArc(recipeIngredients),
  tierListItems: itemArc(tierListItems),
} as const;
