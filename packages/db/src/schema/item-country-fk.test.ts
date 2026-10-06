import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { tables } from "./index.ts";

/**
 * A `country` column is a reference into `country`, on **every** table that has
 * one, or the rule is not a rule.
 *
 * `teas.country` was a bare `text()` while the other five item types carried
 * `.references(() => country.value)` — confirmed against the live database, not
 * only against this file: all six had the column, `beers, coffees, sakes,
 * spirits, wines` had the constraint. Nothing else validates it. `ItemActor`
 * does no country checking of its own, so `updateItem(type: TEA, country:
 * "Freedonia")` was stored where the same call on a wine was rejected.
 *
 * That silence has two named dependants who both state the stronger claim as
 * fact. `services/actors/src/lib/ai/vocabulary.ts` registers `countryOf("teas")`
 * as a reference constraint and asserts that for every such field "a typed-in
 * value fails as a constraint violation inside the actor";
 * `services/client/src/hooks/useReferenceOptions.ts` repeats it.
 *
 * ## Why it is written this way
 *
 * **Discovered, not listed.** The defect was one table missing from a set of
 * six, so a test carrying its own hand-written list of six would have had the
 * same blind spot as the schema: a seventh item type is covered here the moment
 * it declares the column, without anyone remembering this file.
 *
 * **Read through `getTableConfig`, not by grepping `tables.ts`** —
 * `target-indexes.test.ts`'s reason: it must fail when the declaration changes,
 * not when its formatting does.
 *
 * **Asserted against the declaration, not a database.** The declaration is what
 * `scripts/cutover/cutover.sh`'s `baseline` phase diffs a `drizzle-kit pull`
 * against, and a test that only queried a database would pass against one built
 * before `20260920005733_teas_country_fk` and say nothing about the schema the
 * repo ships.
 */

const COUNTRY_COLUMN = "country";

type CountryTable = {
  readonly name: string;
  readonly references: string | null;
};

/** Every table declaring a `country` column, with what that column points at. */
const countryColumnTables = (): CountryTable[] => {
  const found: CountryTable[] = [];
  for (const table of Object.values(tables)) {
    // `instanceof` is unreliable across duplicate module instances; `is()` is
    // Drizzle's own brand check and is not.
    if (!is(table, PgTable)) continue;
    const config = getTableConfig(table);
    if (!config.columns.some((column) => column.name === COUNTRY_COLUMN)) {
      continue;
    }
    const fk = config.foreignKeys.find((candidate) =>
      candidate
        .reference()
        .columns.some((column) => column.name === COUNTRY_COLUMN),
    );
    const reference = fk?.reference();
    found.push({
      name: config.name,
      references:
        reference === undefined
          ? null
          : `${getTableConfig(reference.foreignTable).name}.${reference.foreignColumns
              .map((column) => column.name)
              .join(",")}`,
    });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
};

describe("schema · country columns", () => {
  it("every `country` column is a foreign key into `country.value`", () => {
    const declared = countryColumnTables();
    // A schema with no `country` column at all would make the assertion below
    // vacuous, so say out loud that there are some.
    expect(declared.length).toBeGreaterThan(0);
    expect(
      declared.filter((table) => table.references !== "country.value"),
    ).toEqual([]);
  });

  it("the six item types are the tables that have one", () => {
    expect(countryColumnTables().map((table) => table.name)).toEqual([
      "beers",
      "coffees",
      "sakes",
      "spirits",
      "teas",
      "wines",
    ]);
  });
});
