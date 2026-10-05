/**
 * The SQL functions allowed to exist in `public`, and why each one is there.
 *
 * Hasura exposed SQL functions as GraphQL — computed fields, tracked queries
 * and mutations — so the Nhost database accumulated them; the actor stack
 * calls four by name and needs three more as trigger bodies. Nineteen others
 * survived the cutover transform with no caller at all until
 * `packages/db/migrations/20260928181327_drop_hasura_surface_functions`, and
 * seven redundant `updated_at` trigger functions until
 * `20260928181546_one_updated_at_trigger_function`. This file is what stops
 * the next one: a function in `public` that is not listed here fails the
 * suite, and a listed one must still exist *and* still be used — called from
 * the named source file, bound to a trigger, named by a table constraint, or
 * called from the body of another listed function.
 *
 * It runs against the harness database, which is built exactly the way
 * production is (the cutover transform over the Nhost schema, then every
 * migration), so it checks the schema the repo ships rather than a
 * migrations-only approximation — which is also why it lives here and not in
 * `packages/db`, whose tests have a bare Postgres server but no transformed
 * database. Extension-owned functions (postgis, pgvector, pg_trgm, pgcrypto,
 * citext: `pg_depend.deptype = 'e'`) are not ours and are excluded.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeTestDb, resolveTestDatabase, withTestDb } from "./testing.ts";

const { skip } = await resolveTestDatabase();

type Use =
  | { readonly calledFrom: string; readonly why: string }
  | { readonly trigger: true; readonly why: string }
  | { readonly constraint: string; readonly why: string }
  | { readonly calledByFunction: string; readonly why: string };

/** `proname` → how it is used. Signatures are not pinned; names are. */
const ALLOWED: Readonly<Record<string, Use>> = {
  search_places_hybrid: {
    calledFrom: "actors/place-search-actor.ts",
    why: "PlaceSearchActor's ranked text/vector/tier-list place search (hand_written_sql_lane)",
  },
  search_places_adaptive_cluster: {
    calledFrom: "actors/map-actor.ts",
    why: "MapActor's clustered map viewport query (hand_written_sql_lane)",
  },
  find_duplicate_places: {
    calledFrom: "actors/duplicate-place-search-actor.ts",
    why: "DuplicatePlaceSearchActor's near-duplicate check before a place is created",
  },
  search_category_vectors: {
    calledFrom: "actors/place-search-actor.ts",
    why: "PlaceSearchActor's category-vector expansion of a text query",
  },
  set_current_timestamp_updated_at: {
    trigger: true,
    why: "the one BEFORE UPDATE trigger that stamps updated_at (updated-at-triggers.test.ts)",
  },
  update_places_search_text: {
    trigger: true,
    why: "trg_places_search_text keeps places.search_text (the tsvector) in step with name/categories/locality",
  },
  end_sessions_of_disabled_user: {
    trigger: true,
    why: "user_disabled_ends_sessions deletes a user's sessions the moment they are disabled",
  },
  canonical_barcode_code: {
    constraint: "barcodes_code_canonical",
    why: "the SQL mirror of contracts' canonicalBarcodeCode; the CHECK refuses a non-canonical barcodes.code (canonical_barcode_codes)",
  },
  gs1_check_digit_valid: {
    calledByFunction: "canonical_barcode_code",
    why: "the GS1 mod-10 check canonical_barcode_code validates GTINs with",
  },
};

const SRC = fileURLToPath(new URL("../", import.meta.url));

describe.skipIf(skip)("functions in schema public", () => {
  afterAll(closeTestDb);

  it("are exactly the allow-listed ones", async () => {
    await withTestDb(async (db) => {
      const { rows } = await db.execute<{ name: string }>(sql`
        select distinct p.proname as name
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and not exists (
            select 1 from pg_depend d
            where d.classid = 'pg_proc'::regclass
              and d.objid = p.oid and d.deptype = 'e')
        order by 1
      `);
      const present = rows.map((row) => row.name);
      // Both directions: nothing unlisted exists, nothing listed has gone.
      expect(present).toEqual(Object.keys(ALLOWED).sort());
    });
  });

  it("are each still used — called from the named file, bound to a trigger, named by a constraint, or called by a listed function", async () => {
    await withTestDb(async (db) => {
      const { rows } = await db.execute<{ name: string }>(sql`
        select distinct p.proname as name
        from pg_trigger t join pg_proc p on p.oid = t.tgfoid
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and not t.tgisinternal
      `);
      const triggerFunctions = new Set(rows.map((row) => row.name));
      const { rows: constraints } = await db.execute<{
        name: string;
        def: string;
      }>(sql`
        select c.conname as name, pg_get_constraintdef(c.oid) as def
        from pg_constraint c
        join pg_namespace n on n.oid = c.connamespace
        where n.nspname = 'public'
      `);
      const { rows: bodies } = await db.execute<{ name: string; src: string }>(
        sql`
          select p.proname as name, p.prosrc as src
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
        `,
      );
      const used = (name: string, use: Use): boolean => {
        if ("trigger" in use) return triggerFunctions.has(name);
        if ("constraint" in use) {
          return constraints.some(
            (row) => row.name === use.constraint && row.def.includes(name),
          );
        }
        if ("calledByFunction" in use) {
          return bodies.some(
            (row) =>
              row.name === use.calledByFunction && row.src.includes(name),
          );
        }
        return readFileSync(`${SRC}${use.calledFrom}`, "utf8").includes(name);
      };
      const unused = Object.entries(ALLOWED).filter(
        ([name, use]) => !used(name, use),
      );
      expect(unused.map(([name]) => name)).toEqual([]);
    });
  });
});
