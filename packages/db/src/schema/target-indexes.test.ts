import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { loadMigrations, TRANSFORM_HORIZON } from "../migrate/ledger.ts";
import { tables } from "./index.ts";

/**
 * The guard behind E4 decision 1 (`docs/architecture/e4-decisions.md`).
 *
 * `packages/db/transform/17_target_indexes.sql` is what makes the transform's
 * index set a property of the transform rather than of whatever the source
 * `pg_dump` happened to carry. That only holds while the file stays complete:
 * add an index to `tables.ts`, forget the transform, and the next cutover's
 * `baseline` phase fails the same way decision 1 describes — with the site
 * already frozen.
 *
 * So the schema is read through `getTableConfig`, not by grepping `tables.ts`,
 * and the SQL by its statement heads. Both sides are the real artifacts.
 *
 * Definitions are deliberately *not* compared. `scripts/cutover/cutover.sh`'s
 * `baseline` phase already does that properly — `drizzle-kit pull` against the
 * transformed database, diffed against `tables.ts` — and a second, weaker
 * string comparison here would only ever disagree with it.
 */

const TRANSFORM_STEP = fileURLToPath(
  new URL("../../transform/17_target_indexes.sql", import.meta.url),
);

/**
 * Tables created by the hand-written SQL lane (§8.6, `packages/db/README.md`
 * "Why there are two AGENTS.md files" sibling section) rather than by a
 * numbered transform step or the source dump.
 *
 * Decision 1 (the reason this file exists at all) is about an index whose
 * presence would otherwise depend on what a `pg_dump` happened to carry —
 * `17_target_indexes.sql` closes that gap for every table `06`/`13` create or
 * the dump itself carries. It cannot close it for a lane table: `run.sh` runs
 * every numbered step, `17` included, before it applies the lane
 * (`packages/db/transform/run.sh`'s two loops), so the table does not exist
 * yet when this file's statements would run — `CREATE INDEX ... ON
 * outbox_dead_letter_acks` fails with "relation does not exist" against a
 * fresh transform. There is also no dump in between for the index to be
 * missing from: the lane migration that creates the table
 * (`packages/db/migrations/20260920164500_outbox_dead_letter_acks`) creates
 * its index in the same file, unconditionally, every time. So for these
 * tables the index and the table share one source of truth already, and it
 * is not this one.
 */
const HAND_WRITTEN_LANE_TABLES: ReadonlySet<string> = new Set([
  "outbox_dead_letter_acks",
]);

/**
 * Indexes created by a migration AFTER the transform horizon.
 *
 * The transform is frozen at the horizon (`../migrate/transform-freeze.test.ts`)
 * and `db:migrate` applies every later migration to every database, fresh
 * builds included — so an index a later migration creates reaches the
 * transformed database from that migration, and `17` must NOT also create it
 * (it could not anyway: the file is pinned). Parsed from the migrations' own
 * SQL, so an index is exempt only if a real post-horizon migration creates it.
 */
const postHorizonIndexNames = (verb: RegExp): Set<string> =>
  new Set(
    loadMigrations()
      .filter((m) => m.name > TRANSFORM_HORIZON)
      .flatMap((m) =>
        [
          ...m.sql.matchAll(
            new RegExp(
              `^\\s*${verb.source} (?:IF (?:NOT )?EXISTS )?"?([A-Za-z0-9_]+)"?`,
              "gim",
            ),
          ),
        ].map((match) => match[1] ?? ""),
      ),
  );

const CREATE_INDEX = /CREATE (?:UNIQUE )?INDEX/;

/**
 * Indexes a migration AFTER the horizon drops. `17` still creates them — it is
 * frozen — and the migration takes them away again on every build, so an index
 * `17` creates is only owed a declaration while no later migration drops it.
 * (Dropping and re-creating under the same name, as `item_vectors_one_per_item`
 * does to make two indexes unique, puts the name in both sets.)
 */
const DROP_INDEX = /DROP INDEX/;

/** Every index name `tables.ts` declares, via Drizzle's own table config. */
const declaredIndexNames = (): string[] => {
  const postHorizon = postHorizonIndexNames(CREATE_INDEX);
  const names: string[] = [];
  for (const table of Object.values(tables)) {
    // `instanceof` is unreliable across duplicate module instances; `is()` is
    // Drizzle's own brand check and is not.
    if (!is(table, PgTable)) continue;
    if (HAND_WRITTEN_LANE_TABLES.has(getTableName(table))) continue;
    for (const index of getTableConfig(table).indexes) {
      const name = index.config.name;
      if (name !== undefined && !postHorizon.has(name)) names.push(name);
    }
  }
  return names.sort();
};

/**
 * Index names created by the transform step. Anchored at the start of a line so
 * the `CREATE INDEX` mentions in the file's own header comment cannot count.
 */
const transformedIndexNames = (source: string): string[] =>
  source
    .split("\n")
    .flatMap((line) => {
      const match = /^CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "([^"]+)"/.exec(
        line,
      );
      return match === null ? [] : [match[1] ?? ""];
    })
    .sort();

describe("17_target_indexes.sql", () => {
  const source = readFileSync(TRANSFORM_STEP, "utf8");
  const declared = declaredIndexNames();
  const created = transformedIndexNames(source);

  it("declares at least one index on both sides", () => {
    expect(declared.length).toBeGreaterThan(0);
    expect(created.length).toBeGreaterThan(0);
  });

  it("creates every index the Drizzle schema declares", () => {
    const createdSet = new Set(created);
    expect(declared.filter((name) => !createdSet.has(name))).toEqual([]);
  });

  it("creates no index the Drizzle schema does not declare", () => {
    const declaredSet = new Set(declared);
    const droppedLater = postHorizonIndexNames(DROP_INDEX);
    expect(
      created.filter(
        (name) => !declaredSet.has(name) && !droppedLater.has(name),
      ),
    ).toEqual([]);
  });

  it("creates each index once", () => {
    const seen = new Set<string>();
    const duplicates = created.filter((name) => {
      const repeat = seen.has(name);
      seen.add(name);
      return repeat;
    });
    expect(duplicates).toEqual([]);
  });

  it("uses no CONCURRENTLY — a failed build leaves an INVALID index that `IF NOT EXISTS` never repairs", () => {
    const offenders = source
      .split("\n")
      .filter((line) => /^CREATE .*CONCURRENTLY/.test(line));
    expect(offenders).toEqual([] satisfies string[]);
  });

  it("makes every statement idempotent", () => {
    const offenders = source
      .split("\n")
      .filter(
        (line) =>
          /^CREATE (?:UNIQUE )?INDEX/.test(line) &&
          !line.startsWith("CREATE INDEX IF NOT EXISTS") &&
          !line.startsWith("CREATE UNIQUE INDEX IF NOT EXISTS"),
      );
    expect(offenders).toEqual([] satisfies string[]);
  });
});
