import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  ADOPTION,
  BASELINE_HORIZON,
  loadMigrations,
} from "../migrate/ledger.ts";
import { tables } from "./index.ts";

/**
 * The guard behind E4 decision 1 (`docs/archive/nhost-migration/e4-decisions.md`): every
 * index `tables.ts` declares exists in a freshly built database, and nothing
 * builds an index `tables.ts` does not declare.
 *
 * A fresh database is `baseline/schema.sql`, plus the migrations `db:migrate`
 * re-applies on adoption (`kind: "reapply"`), plus every migration after the
 * horizon, so the index set is computed the same way: the baseline's indexes,
 * then each of those migrations' `CREATE INDEX` and `DROP INDEX` statements, in
 * order. Statements are matched at the start of a line, so a mention inside a
 * comment does not count.
 *
 * Definitions are deliberately *not* compared, only names; `bun run
 * db:check-drift` compares the whole schema against a real database.
 */

const BASELINE = fileURLToPath(
  new URL("../../baseline/schema.sql", import.meta.url),
);

const STATEMENT =
  /^\s*(CREATE (?:UNIQUE )?INDEX|DROP INDEX)(?: CONCURRENTLY)?(?: IF (?:NOT )?EXISTS)? "?(?:public\.)?"?([A-Za-z0-9_]+)"?/gim;

const applyIndexStatements = (sql: string, into: Set<string>): void => {
  for (const match of sql.matchAll(STATEMENT)) {
    const verb = (match[1] ?? "").toUpperCase();
    const name = match[2] ?? "";
    if (verb.startsWith("DROP")) into.delete(name);
    else into.add(name);
  }
};

/** The index names a fresh build ends up with. */
const builtIndexNames = (): Set<string> => {
  const names = new Set<string>();
  applyIndexStatements(readFileSync(BASELINE, "utf8"), names);
  for (const migration of loadMigrations()) {
    if (
      migration.name > BASELINE_HORIZON ||
      ADOPTION[migration.name]?.kind === "reapply"
    ) {
      applyIndexStatements(migration.sql, names);
    }
  }
  return names;
};

/** Every index name `tables.ts` declares, via Drizzle's own table config. */
const declaredIndexNames = (): string[] => {
  const names: string[] = [];
  for (const table of Object.values(tables)) {
    // `instanceof` is unreliable across duplicate module instances; `is()` is
    // Drizzle's own brand check and is not.
    if (!is(table, PgTable)) continue;
    for (const index of getTableConfig(table).indexes) {
      if (index.config.name !== undefined) names.push(index.config.name);
    }
  }
  return names.sort();
};

describe("the indexes a fresh build creates", () => {
  const declared = declaredIndexNames();
  const built = builtIndexNames();

  it("finds indexes on both sides", () => {
    expect(declared.length).toBeGreaterThan(0);
    expect(built.size).toBeGreaterThan(0);
  });

  it("include every index the Drizzle schema declares", () => {
    expect(declared.filter((name) => !built.has(name))).toEqual([]);
  });

  it("include no index the Drizzle schema does not declare", () => {
    const declaredSet = new Set(declared);
    expect([...built].filter((name) => !declaredSet.has(name)).sort()).toEqual(
      [],
    );
  });
});
