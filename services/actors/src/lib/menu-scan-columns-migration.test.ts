/**
 * `packages/db/migrations/20260928182317_place_menu_items_scan_columns`'s
 * backfill, run for real against fixture rows of every shape.
 *
 * The harness database has already applied the migration, so the column
 * exists and every row it held has been backfilled. This file seeds rows the
 * way the pre-migration writers left them (the scanned type only in
 * `extracted_attributes.scanItemType`, the search phrase only in
 * `extracted_attributes.search_name`), then runs the migration file's own
 * statements — everything after its `ADD COLUMN` — inside the harness's
 * rolled-back transaction, and asserts each row's before → after.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "./db.ts";
import { seedPlace } from "./search-testing.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "./testing.ts";

const { skip } = await resolveTestDatabase();

const MIGRATION = fileURLToPath(
  new URL(
    "../../../../packages/db/migrations/20260928182317_place_menu_items_scan_columns/migration.sql",
    import.meta.url,
  ),
);

/** The migration's statements, minus the DDL the harness already applied. */
const backfillStatements = (): string[] => {
  const statements = readFileSync(MIGRATION, "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim());
  const [addColumn, ...rest] = statements;
  // The file's first statement must be the one being skipped, or this test
  // would be silently skipping something else.
  expect(addColumn).toMatch(
    /ALTER TABLE "place_menu_items" ADD COLUMN "search_name" text;$/,
  );
  expect(rest).toHaveLength(3);
  return rest;
};

type Row = {
  readonly name: string;
  readonly detected: string | null;
  readonly search_name: string | null;
  readonly attributes: unknown;
};

const seedScan = async (db: DbOrTx, userId: string, placeId: string) => {
  const files = await db.execute<{ id: string }>(sql`
    insert into public.files (key) values (${`menus/${crypto.randomUUID()}.jpg`})
    returning id
  `);
  const id = crypto.randomUUID();
  await db.execute(sql`
    insert into public.menu_scans
      (id, user_id, original_image_id, place_id, processing_status)
    values (${id}::uuid, ${userId}::uuid, ${files.rows[0]?.id}::uuid,
            ${placeId}::uuid, 'completed')
  `);
  return id;
};

describe.skipIf(skip)("place_menu_items_scan_columns backfill", () => {
  afterAll(closeTestDb);

  it("moves the scanned type and search phrase into their columns and out of the JSONB", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const placeId = await seedPlace(db, {
        name: "Bar",
        lng: -122.4194,
        lat: 37.7749,
      });
      const scanId = await seedScan(db, owner, placeId);
      const seed = async (
        name: string,
        detected: string | null,
        attributes: unknown,
      ) => {
        await db.execute(sql`
          insert into public.place_menu_items
            (place_id, menu_scan_id, menu_item_name, detected_item_type,
             extracted_attributes)
          values (${placeId}::uuid, ${scanId}::uuid, ${name}, ${detected},
                  ${attributes === null ? null : JSON.stringify(attributes)}::jsonb)
        `);
      };
      // Pre-B8b: the CHECK could not spell sake, so the column says unknown.
      await seed("pre-b8b sake", "unknown", {
        scanItemType: "sake",
        search_name: " Dassai 45 ",
        abv: 16,
      });
      await seed("null column cocktail", null, {
        scanItemType: "cocktail",
        search_name: "Negroni",
      });
      // Post-B8b: both copies agree; only the JSONB keys go.
      await seed("agreeing wine", "wine", {
        scanItemType: "wine",
        search_name: "Chateau Test",
      });
      // A user's match rewrote the column; the scanner's JSONB is stale.
      await seed("user-corrected", "beer", {
        scanItemType: "spirit",
        search_name: "",
      });
      // Nothing usable in the JSONB: the column keeps what it had.
      await seed("bogus type", "unknown", {
        scanItemType: "kombucha",
        search_name: 7,
      });
      await seed("genuinely unknown", "unknown", { scanItemType: "unknown" });
      await seed("no attributes", "coffee", null);
      await seed("scalar attributes", "tea", "scanItemType");

      for (const statement of backfillStatements()) {
        await db.execute(sql.raw(statement));
      }

      const { rows } = await db.execute<Row>(sql`
        select menu_item_name as name, detected_item_type as detected,
               search_name, extracted_attributes as attributes
        from public.place_menu_items
        where menu_scan_id = ${scanId}::uuid
        order by menu_item_name
      `);
      expect(rows).toEqual(
        [
          {
            name: "agreeing wine",
            detected: "wine",
            search_name: "Chateau Test",
            attributes: {},
          },
          {
            name: "bogus type",
            detected: "unknown",
            search_name: null,
            attributes: {},
          },
          {
            name: "genuinely unknown",
            detected: "unknown",
            search_name: null,
            attributes: {},
          },
          {
            name: "no attributes",
            detected: "coffee",
            search_name: null,
            attributes: null,
          },
          {
            name: "null column cocktail",
            detected: "cocktail",
            search_name: "Negroni",
            attributes: {},
          },
          {
            name: "pre-b8b sake",
            detected: "sake",
            search_name: "Dassai 45",
            attributes: { abv: 16 },
          },
          {
            name: "scalar attributes",
            detected: "tea",
            search_name: null,
            attributes: "scanItemType",
          },
          {
            name: "user-corrected",
            detected: "beer",
            search_name: null,
            attributes: {},
          },
        ].sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
  });
});
