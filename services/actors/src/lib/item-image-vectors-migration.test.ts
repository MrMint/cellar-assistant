/**
 * `20261006012739_item_image_vectors` (G32), checked against the catalog of
 * a database built by `db:migrate` — the test harness's template — rather
 * than against the SQL text, so what is asserted is what a deployment gets.
 *
 * Four properties the image search and the backfill lean on:
 *
 *  - one row per image (primary key on `item_image_id`), so a re-embed
 *    overwrites instead of duplicating;
 *  - the vector and the model that made it are both required — a row with no
 *    identity could never be told stale;
 *  - deleting an `item_image` removes its vector (`ON DELETE CASCADE`), so a
 *    detached photo stops matching;
 *  - an HNSW cosine index in `item_vectors`' style, so the image arm of a
 *    search is an index scan.
 */
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  seedItemImage,
  seedItemImageVector,
  seedWine,
  unitVector,
} from "./search-testing.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "./testing.ts";

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("migration: item_image_vectors (G32)", () => {
  afterAll(closeTestDb);

  it("has the columns, key and constraints the write path assumes", async () => {
    await withTestDb(async (db) => {
      const { rows: columns } = await db.execute<{
        column_name: string;
        is_nullable: string;
        udt_name: string;
      }>(sql`
        select column_name, is_nullable, udt_name
        from information_schema.columns
        where table_schema = 'public' and table_name = 'item_image_vectors'
        order by ordinal_position
      `);
      expect(columns).toEqual([
        { column_name: "item_image_id", is_nullable: "NO", udt_name: "uuid" },
        { column_name: "vector", is_nullable: "NO", udt_name: "halfvec" },
        { column_name: "embedding_model", is_nullable: "NO", udt_name: "text" },
        {
          column_name: "created_at",
          is_nullable: "NO",
          udt_name: "timestamptz",
        },
        {
          column_name: "updated_at",
          is_nullable: "NO",
          udt_name: "timestamptz",
        },
      ]);

      const { rows: constraints } = await db.execute<{
        contype: string;
        def: string;
      }>(sql`
        select contype, pg_get_constraintdef(oid) as def
        from pg_constraint
        where conrelid = 'public.item_image_vectors'::regclass
          -- PostgreSQL 18 catalogs NOT NULL as constraints too; the column
          -- check above already covers those.
          and contype in ('f', 'p')
        order by contype
      `);
      expect(constraints).toEqual([
        {
          contype: "f",
          def: "FOREIGN KEY (item_image_id) REFERENCES item_image(id) ON DELETE CASCADE",
        },
        { contype: "p", def: "PRIMARY KEY (item_image_id)" },
      ]);
    });
  });

  it("indexes the vector with HNSW cosine, as item_vectors is", async () => {
    await withTestDb(async (db) => {
      const { rows } = await db.execute<{ indexdef: string }>(sql`
        select indexdef from pg_indexes
        where schemaname = 'public'
          and indexname in ('item_image_vectors_vector_hnsw_idx',
                            'item_vectors_vector_hnsw_idx')
        order by indexname
      `);
      expect(rows).toHaveLength(2);
      const [image, item] = rows.map((row) =>
        row.indexdef.replace(/^.* USING /, "USING "),
      );
      expect(image).toBe(item);
      expect(image).toMatch(/hnsw \(vector halfvec_cosine_ops\)/);
    });
  });

  it("cascades: deleting the image deletes its vector", async () => {
    await withTestDb(async (db) => {
      const user = await seedUser(db);
      const wine = await seedWine(db, user, "Cascade Wine");
      const image = await seedItemImage(db, wine, user);
      await seedItemImageVector(
        db,
        image.imageId,
        unitVector(0),
        "vertex-ai:gemini-embedding-2@768/IMAGE",
      );
      await db.execute(
        sql`delete from public.item_image where id = ${image.imageId}::uuid`,
      );
      const { rows } = await db.execute(sql`
        select 1 from public.item_image_vectors
        where item_image_id = ${image.imageId}::uuid
      `);
      expect(rows).toEqual([]);
    });
  });
});
