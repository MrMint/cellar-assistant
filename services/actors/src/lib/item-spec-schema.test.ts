/**
 * `ITEM_TYPE_SPECS` against the live database — the one fence between the
 * spec and `information_schema`.
 *
 * This replaces three tests that each reconciled a hand-written list with the
 * catalog (`required-item-attributes.test.ts` for A7c's NOT NULL columns,
 * `ai/constrained-attributes.test.ts` for X1b's vocabularies and date columns).
 * The lists are derived from the spec now, so the spec is what has to be true
 * of the tables, and a stale spec has the same invisible failure modes those
 * files were written against:
 *
 * - an undeclared NOT NULL column: the caller is told the write succeeded, the
 *   outbox retries `ItemActor.create` for ~17 minutes and dead-letters, and the
 *   item never appears (A7c);
 * - an undeclared foreign key: the item-defaults schema goes back to free text
 *   for that column, the model answers `"Red Wine"` for a five-value column,
 *   and the violation is raised inside the outbox (X1b);
 * - an undeclared `date`: the schema stops telling the model it wants a
 *   calendar date, and it answers with a year.
 *
 * Each direction is asserted separately — a declared fact the database does
 * not enforce is a validation hole, an enforced one nobody declared is a
 * picker that will not offer what the column accepts — so the failure says
 * which.
 *
 *   bun run --filter @cellar-assistant/actors test
 */
import type { ItemAttributeKind, ItemType } from "@cellar-assistant/contracts";
import {
  GENERIC_ITEM_KINDS,
  ITEM_TYPE_SPECS,
  ITEM_TYPES,
  itemAttributeEntries,
  REFERENCE_KINDS,
} from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeTestDb, resolveTestDatabase, withTestDb } from "./testing.ts";

const TABLE_OF = (type: ItemType): string => ITEM_TYPE_SPECS[type].table;
const ITEM_TABLE_NAMES = ITEM_TYPES.map(TABLE_OF);

/**
 * `in (…)` rather than a bound array: Drizzle binds a JS array as one
 * comma-joined parameter, which Postgres rejects with *"op ANY/ALL (array)
 * requires array on right side"*.
 */
const inList = (values: readonly string[]) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );

/**
 * Columns `ItemActor.create` always writes from something other than the
 * caller's attribute bag, so a `NOT NULL` on them can never be a caller's
 * mistake: `id`/`name` come from the actor key and the required `name`
 * argument, `created_by_id` from `ctx` or the system payload, and
 * `item_onboarding_id` from the onboarding (asserted separately below).
 */
const ALWAYS_SUPPLIED = new Set([
  "id",
  "name",
  "created_by_id",
  "item_onboarding_id",
]);

/** `information_schema.columns.data_type` each kind may be stored as. */
const DATA_TYPES: Record<ItemAttributeKind, readonly string[]> = {
  text: ["text", "USER-DEFINED"],
  date: ["date"],
  year: ["integer"],
  integer: ["integer"],
  decimal: ["numeric"],
  boolean: ["boolean"],
};

type ColumnRow = {
  readonly table_name: string;
  readonly column_name: string;
  readonly data_type: string;
  readonly is_nullable: "YES" | "NO";
  readonly column_default: string | null;
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("ITEM_TYPE_SPECS vs information_schema", () => {
  afterAll(closeTestDb);

  const columns = async (): Promise<Map<string, ColumnRow>> =>
    await withTestDb(async (db) => {
      const { rows } = await db.execute<ColumnRow>(sql`
        select table_name, column_name, data_type, is_nullable, column_default
          from information_schema.columns
         where table_schema = 'public'
           and table_name in (${inList(ITEM_TABLE_NAMES)})
      `);
      return new Map(
        rows.map((row) => [`${row.table_name}.${row.column_name}`, row]),
      );
    });

  it("declares columns that exist, with a type the attribute's kind can hold", async () => {
    const catalog = await columns();
    for (const type of ITEM_TYPES) {
      for (const [key, attribute] of itemAttributeEntries(type)) {
        const column = catalog.get(`${TABLE_OF(type)}.${attribute.column}`);
        expect(column, `${type}.${key}`).toBeDefined();
        expect(DATA_TYPES[attribute.kind], `${type}.${key}`).toContain(
          column?.data_type,
        );
      }
    }
  });

  it("declares every NOT NULL column a caller has to supply, and only those", async () => {
    const catalog = await columns();
    const fromDatabase = [...catalog.values()]
      .filter(
        (row) =>
          row.is_nullable === "NO" &&
          row.column_default === null &&
          !ALWAYS_SUPPLIED.has(row.column_name),
      )
      .map((row) => `${row.table_name}.${row.column_name}`)
      .sort();
    const declared = ITEM_TYPES.flatMap((type) => [
      ...itemAttributeEntries(type)
        .filter(([, attribute]) => attribute.required)
        .map(([, attribute]) => `${TABLE_OF(type)}.${attribute.column}`),
      ...(ITEM_TYPE_SPECS[type].descriptionRequired
        ? [`${TABLE_OF(type)}.description`]
        : []),
    ]).sort();
    expect(fromDatabase).toEqual(declared);
  });

  it("marks onboardingRequired exactly where item_onboarding_id is NOT NULL", async () => {
    const catalog = await columns();
    for (const type of ITEM_TYPES) {
      const column = catalog.get(`${TABLE_OF(type)}.item_onboarding_id`);
      expect(column?.is_nullable === "NO", type).toBe(
        ITEM_TYPE_SPECS[type].onboardingRequired,
      );
    }
  });

  const referenceEdges = async (): Promise<string[]> =>
    await withTestDb(async (db) => {
      const { rows } = await db.execute<{ source: string; target: string }>(sql`
        select tc.table_name || '.' || kcu.column_name as source,
               ccu.table_name                          as target
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on kcu.constraint_name = tc.constraint_name
          join information_schema.constraint_column_usage ccu
            on ccu.constraint_name = tc.constraint_name
         where tc.constraint_type = 'FOREIGN KEY'
           and tc.table_name in (${inList(ITEM_TABLE_NAMES)})
           and ccu.table_name in (${inList(REFERENCE_KINDS)})
      `);
      return rows.map((row) => `${row.source} -> ${row.target}`).sort();
    });

  /** `country` is a core column on all six, constrained by `country` on all six. */
  const declaredEdges = (): string[] =>
    ITEM_TYPES.flatMap((type) => [
      `${TABLE_OF(type)}.country -> country`,
      ...itemAttributeEntries(type).flatMap(([, attribute]) =>
        attribute.vocabulary?.kind === "reference"
          ? [
              `${TABLE_OF(type)}.${attribute.column} -> ${attribute.vocabulary.reference}`,
            ]
          : [],
      ),
    ]).sort();

  it("declares every reference-table foreign key the database enforces", async () => {
    const declared = new Set(declaredEdges());
    const undeclared = (await referenceEdges()).filter(
      (edge) => !declared.has(edge),
    );
    expect(undeclared).toEqual([]);
  });

  it("declares no reference vocabulary the database does not enforce", async () => {
    const enforced = new Set(await referenceEdges());
    const extra = declaredEdges().filter((edge) => !enforced.has(edge));
    expect(extra).toEqual([]);
  });

  it("declares every enum column as a static vocabulary of exactly its labels", async () => {
    const labels = await withTestDb(async (db) => {
      const { rows } = await db.execute<{
        table_name: string;
        column_name: string;
        label: string;
      }>(sql`
        select c.table_name, c.column_name, e.enumlabel as label
          from information_schema.columns c
          join pg_type t on t.typname = c.udt_name
          join pg_enum e on e.enumtypid = t.oid
         where c.table_schema = 'public'
           and c.table_name in (${inList(ITEM_TABLE_NAMES)})
         order by e.enumsortorder
      `);
      const byColumn = new Map<string, string[]>();
      for (const row of rows) {
        const key = `${row.table_name}.${row.column_name}`;
        byColumn.set(key, [...(byColumn.get(key) ?? []), row.label]);
      }
      return byColumn;
    });

    const declared = new Map<string, readonly string[]>();
    for (const type of ITEM_TYPES) {
      for (const [, attribute] of itemAttributeEntries(type)) {
        if (attribute.vocabulary?.kind !== "static") continue;
        declared.set(
          `${TABLE_OF(type)}.${attribute.column}`,
          attribute.vocabulary.values,
        );
      }
    }
    expect([...labels.keys()].sort()).toEqual([...declared.keys()].sort());
    for (const [column, values] of declared) {
      expect(labels.get(column)?.slice().sort(), column).toEqual(
        [...values].sort(),
      );
    }
  });

  it("lets generic_items.item_type hold exactly GENERIC_ITEM_KINDS", async () => {
    const definition = await withTestDb(async (db) => {
      const { rows } = await db.execute<{ definition: string }>(sql`
        select pg_get_constraintdef(oid) as definition
          from pg_constraint
         where conname = 'generic_items_item_type_check'`);
      return rows[0]?.definition ?? "";
    });
    const accepted = [...definition.matchAll(/'([a-z_]+)'::text/g)]
      .map((match) => match[1])
      .sort();
    expect(accepted).toEqual([...GENERIC_ITEM_KINDS].sort());
  });

  it("declares every date-typed column as a `date` attribute, and only those", async () => {
    const catalog = await columns();
    const fromDatabase = [...catalog.values()]
      .filter((row) => row.data_type === "date")
      .map((row) => `${row.table_name}.${row.column_name}`)
      .sort();
    const declared = ITEM_TYPES.flatMap((type) =>
      itemAttributeEntries(type)
        .filter(([, attribute]) => attribute.kind === "date")
        .map(([, attribute]) => `${TABLE_OF(type)}.${attribute.column}`),
    ).sort();
    expect(fromDatabase).toEqual(declared);
  });
});
