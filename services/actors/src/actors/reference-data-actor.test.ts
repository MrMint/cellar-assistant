/**
 * `ReferenceDataActor` against a real Postgres (A9, migration plan §2.5).
 *
 * Every one of `REFERENCE_KINDS` is exercised — not a sample — because the
 * acceptance criterion is "returns rows for each of the ten reference
 * tables", and a table-shaped bug (wrong column, wrong table) would only show
 * up on the one kind it hits.
 */
import type { ReferenceKind } from "@cellar-assistant/contracts";
import { REFERENCE_KINDS } from "@cellar-assistant/contracts";
import {
  beerStyle,
  coffeeCultivar,
  country,
  sakeCategory,
  sakeRiceVariety,
  sakeType,
  spiritType,
  teaCategory,
  wineStyle,
  wineVariety,
} from "@cellar-assistant/db";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  activate,
  closeTestDb,
  createActor,
  resolveTestDatabase,
  withTestDb,
} from "../lib/testing.ts";
import { ReferenceDataActor } from "./reference-data-actor.ts";

const newActor = (kind: string, db: DbOrTx): ReferenceDataActor =>
  createActor(ReferenceDataActor, kind, db);

/**
 * A fixture insert per kind. A `switch`, mirroring the actor's own
 * `selectRows` — a `Record<ReferenceKind, PgTable>` lookup would give
 * `db.insert(table)` a ten-way union table type that Drizzle's insert
 * overloads cannot resolve against a single `.values()` shape.
 */
const insertFixture = (
  db: DbOrTx,
  kind: ReferenceKind,
  value: string,
): Promise<unknown> => {
  const comment = "A9 fixture";
  switch (kind) {
    case "beer_style":
      return db.insert(beerStyle).values({ value, comment });
    case "coffee_cultivar":
      return db.insert(coffeeCultivar).values({ value, comment });
    case "country":
      return db.insert(country).values({ value, comment });
    case "sake_category":
      return db.insert(sakeCategory).values({ value, comment });
    case "sake_rice_variety":
      return db.insert(sakeRiceVariety).values({ value, comment });
    case "sake_type":
      return db.insert(sakeType).values({ value, comment });
    case "spirit_type":
      return db.insert(spiritType).values({ value, comment });
    case "tea_category":
      return db.insert(teaCategory).values({ value, comment });
    case "wine_style":
      return db.insert(wineStyle).values({ value, comment });
    case "wine_variety":
      return db.insert(wineVariety).values({ value, comment });
  }
};

/** A fixture value unlikely to collide with real reference data. */
const fixtureValue = (kind: string): string => `__A9_TEST__${kind}`;

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("ReferenceDataActor (A9)", () => {
  afterAll(closeTestDb);

  it("is a reference actor per §1.1 (reads only, everything cached)", () => {
    expect(ReferenceDataActor.category).toBe("reference");
  });

  it.each(REFERENCE_KINDS)(
    "returns rows for %s, including a freshly inserted one",
    async (kind) => {
      await withTestDb(async (db) => {
        const value = fixtureValue(kind);
        // Test-file writes to a reference table are exempt from the
        // single-writer containment scan (`writers-scan.ts` excludes
        // `*.test.ts`); this fixture row never leaves the rolled-back tx.
        await insertFixture(db, kind, value);

        const actor = await activate(newActor(kind, db));
        const rows = await actor.all({
          viewerId: null,
          kind: "user",
          requestId: "r",
        });

        expect(rows.length).toBeGreaterThan(0);
        expect(rows.some((row) => row.value === value)).toBe(true);
      });
    },
  );

  it("orders by value — Postgres's own collation, not JS's default sort", async () => {
    // Isolated to this rolled-back tx: clearing a small table is safe here
    // (never committed), and sidesteps collation drift between JS's default
    // `.sort()` and whatever `lc_collate` this Postgres uses — comparing
    // against `.sort()` is what made this assertion flaky once `wine_style`
    // held real seeded rows (`bun run db:seed`) alongside a fixture value.
    // Letters-only fixture values sort identically under any locale.
    await withTestDb(async (db) => {
      await db.delete(wineStyle);
      await db.insert(wineStyle).values([
        { value: "GAMMA", comment: null },
        { value: "ALPHA", comment: null },
        { value: "BETA", comment: null },
      ]);

      const actor = await activate(newActor("wine_style", db));
      const rows = await actor.all({
        viewerId: null,
        kind: "user",
        requestId: "r",
      });
      expect(rows.map((row) => row.value)).toEqual(["ALPHA", "BETA", "GAMMA"]);
    });
  });

  it("byValue finds a row and rejects an unknown value", async () => {
    await withTestDb(async (db) => {
      const value = fixtureValue("wine_style-byvalue");
      await db.insert(wineStyle).values({ value, comment: null });

      const actor = await activate(newActor("wine_style", db));
      const ctx = { viewerId: null, kind: "user" as const, requestId: "r" };

      const row = await actor.byValue(ctx, value);
      expect(row).toEqual({ value, comment: null });

      await expect(actor.byValue(ctx, "__does_not_exist__")).rejects.toThrow(
        /no row for value/,
      );
    });
  });

  it("an unknown kind loads as NotFound, same as a missing row", async () => {
    await withTestDb(async (db) => {
      const actor = await activate(newActor("not_a_reference_table", db));
      await expect(
        actor.all({ viewerId: null, kind: "user", requestId: "r" }),
      ).rejects.toThrow(/has no row/);
    });
  });

  it("holds no viewer-dependent logic — system, admin and anonymous all see the same rows", async () => {
    await withTestDb(async (db) => {
      const value = fixtureValue("wine_style-viewer");
      await db.insert(wineStyle).values({ value, comment: null });
      const actor = await activate(newActor("wine_style", db));

      const anonymous = await actor.all({
        viewerId: null,
        kind: "user",
        requestId: "r1",
      });
      const admin = await actor.all({
        viewerId: "11111111-1111-4111-8111-111111111111",
        kind: "admin",
        requestId: "r2",
      });
      const system = await actor.all({
        viewerId: null,
        kind: "system",
        requestId: "r3",
      });
      expect(anonymous).toEqual(admin);
      expect(admin).toEqual(system);
    });
  });

  // Not part of the loop above: proves the count independently, matching
  // acceptance's "show all ten, not a sample".
  it("REFERENCE_KINDS is exactly the ten tables §4 (corrected) leaves as tables", () => {
    expect([...REFERENCE_KINDS].sort()).toEqual(
      [
        "beer_style",
        "coffee_cultivar",
        "country",
        "sake_category",
        "sake_rice_variety",
        "sake_type",
        "spirit_type",
        "tea_category",
        "wine_style",
        "wine_variety",
      ].sort(),
    );
  });
});
