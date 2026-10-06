/**
 * `packages/db/migrations/20260928185314_canonical_barcode_codes` and the
 * `barcodes_code_canonical` CHECK after it, run for real.
 *
 * Two halves:
 *
 * 1. **The SQL mirror agrees with the TypeScript.** `public.canonical_barcode_code`
 *    is what rewrites stored codes and what the CHECK enforces;
 *    `canonicalBarcodeCode` (packages/contracts) is what every caller keys
 *    `BarcodeActor` by. If they disagreed, a code the API accepts would be
 *    refused by the CHECK, or a migrated row would be unreachable by its
 *    actor. Asserted over the documented cases plus a dense sweep of the
 *    8-digit space, the one branch a symbology hint changes.
 * 2. **The migration merges what it should and nothing else.** The harness
 *    database has already applied both migrations, so the CHECK is dropped
 *    inside the harness's rolled-back transaction, fixture rows are seeded the
 *    way the pre-canonical writers left them, and the migration file's own
 *    statements run over them: a UPC-A/EAN-13 duplicate linked from both
 *    sides, a case duplicate, a triple collapse from UPC-E/UPC-A/EAN-13,
 *    an 8-digit code whose stored `type` must keep it apart, invalid check
 *    digits, and rows that are already canonical. Then the CHECK is re-added
 *    (the result satisfies it) and the migration is run again (a no-op).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalBarcodeCode } from "@cellar-assistant/contracts";
import { sql } from "@cellar-assistant/db/orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "./db.ts";
import { seedItemOfType } from "./search-testing.ts";
import {
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  withTestDb,
} from "./testing.ts";

const { skip } = await resolveTestDatabase();

const migrationFile = (name: string): string =>
  fileURLToPath(
    new URL(
      `../../../../packages/db/migrations/${name}/migration.sql`,
      import.meta.url,
    ),
  );

const statementsOf = (name: string): string[] =>
  readFileSync(migrationFile(name), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

const CANONICALISE = "20260928185314_canonical_barcode_codes";
const CHECK = "20260928185333_barcodes_code_canonical_check";

/**
 * Two functions, the NOTICE block, the merge insert, six item repoints, two
 * outbox rewrites and the delete. Counted so that a statement added to the
 * file without a fixture to exercise it fails here first.
 */
const EXPECTED_STATEMENTS = 13;

const runCanonicalise = async (db: DbOrTx): Promise<void> => {
  for (const statement of statementsOf(CANONICALISE)) {
    await db.execute(sql.raw(statement));
  }
};

/**
 * First, before anything else in the transaction: an `ALTER TABLE` taken
 * after this test already holds row locks on the item tables could deadlock
 * a concurrent suite that holds a `barcodes` lock and wants an item row
 * (`updated-at-triggers.test.ts` hit exactly that shape).
 */
const dropCheck = async (db: DbOrTx): Promise<void> => {
  await db.execute(sql`lock table public.barcodes in access exclusive mode`);
  await db.execute(
    sql`alter table public.barcodes drop constraint barcodes_code_canonical`,
  );
};

describe.skipIf(skip)("canonical_barcode_code (the SQL mirror)", () => {
  afterAll(closeTestDb);

  it("agrees with canonicalBarcodeCode on every input and hint", async () => {
    const inputs = [
      "012345678905",
      "0012345678905",
      "00012345678905",
      "036000291452",
      "4006381333931",
      "10012345678902",
      "96385074",
      "04252614",
      "01234565",
      "01234619",
      "01234560",
      "012345678900",
      "0000000000001",
      "00012345678900",
      "01234567890",
      "000012345678905",
      "425261",
      "abc123",
      "ABC123",
      "x11-Probe.7",
      " \t012345678905\r\n",
      "ANNO\n1822",
      "straße-é",
      " abc",
      "\u000b12\u000c",
      "",
      "  \n",
    ];
    // Dense over the 8-digit space with a 0/1 prefix (the UPC-E branch), and
    // every UPC-E sixth-digit rule.
    for (let n = 0; n < 2_000_000; n += 997) {
      inputs.push(String(n).padStart(8, "0"));
    }
    for (let d = 0; d <= 9; d++) {
      for (let check = 0; check <= 9; check++) {
        inputs.push(`01234${d}${d}${check}`);
      }
    }
    const hints = [null, "UPC_E", "EAN_8", "upc-e", "ean8", "UPC_A", ""];

    const pairs: [string, string | null][] = inputs.flatMap((raw) =>
      hints.map((hint): [string, string | null] => [raw, hint]),
    );

    await withTestDb(async (db) => {
      // One jsonb parameter rather than a text[]: drizzle expands a JS array
      // into a placeholder list, and a hand-built array literal would have to
      // escape the very characters (newline, backslash) under test.
      const result = await db.execute<{ canonical: string }>(sql`
        select public.canonical_barcode_code(p ->> 0, p ->> 1) as canonical
          from jsonb_array_elements(${JSON.stringify(pairs)}::jsonb)
               with ordinality as t(p, n)
         order by n
      `);
      const fromSql = result.rows.map((row) => row.canonical);
      expect(fromSql).toHaveLength(pairs.length);
      const disagreements = pairs
        .map(([raw, hint], i) => ({
          raw,
          hint,
          ts: canonicalBarcodeCode(raw, hint),
          sql: fromSql[i],
        }))
        .filter((row) => row.ts !== row.sql);
      expect(disagreements).toEqual([]);
    });
  });

  it("is NULL for NULL, like a column with no barcode", async () => {
    await withTestDb(async (db) => {
      const result = await db.execute<{ canonical: string | null }>(
        sql`select public.canonical_barcode_code(null, null) as canonical`,
      );
      expect(result.rows[0]?.canonical).toBeNull();
    });
  });

  it("barcodes_code_canonical refuses a non-canonical code and admits its canonical form", async () => {
    await withTestDb(async (db) => {
      await expect(
        db.execute(
          sql`insert into public.barcodes (code) values ('036000291452')`,
        ),
      ).rejects.toMatchObject({
        cause: { code: "23514", constraint: "barcodes_code_canonical" },
      });
    });
    await withTestDb(async (db) => {
      await db.execute(
        sql`insert into public.barcodes (code) values ('00036000291452') on conflict do nothing`,
      );
      await expect(
        db.execute(sql`insert into public.barcodes (code) values ('abc123')`),
      ).rejects.toMatchObject({
        cause: { code: "23514", constraint: "barcodes_code_canonical" },
      });
    });
  });
});

type BarcodeRow = { readonly code: string; readonly type: string | null };

const barcodeRows = async (
  db: DbOrTx,
  codes: readonly string[],
): Promise<BarcodeRow[]> => {
  const result = await db.execute<BarcodeRow>(sql`
    select code, type from public.barcodes
     where code in (select jsonb_array_elements_text(${JSON.stringify(codes)}::jsonb))
     order by code collate "C"
  `);
  return result.rows;
};

const ITEM_TABLE = {
  WINE: "wines",
  BEER: "beers",
  SPIRIT: "spirits",
  COFFEE: "coffees",
  SAKE: "sakes",
  TEA: "teas",
} as const;
type LinkedType = keyof typeof ITEM_TABLE;

const linkItem = async (
  db: DbOrTx,
  type: LinkedType,
  userId: string,
  code: string,
): Promise<{ type: LinkedType; id: string }> => {
  const { id } = await seedItemOfType(db, type, userId);
  await db.execute(
    sql`update ${sql.identifier(ITEM_TABLE[type])} set barcode_code = ${code} where id = ${id}::uuid`,
  );
  return { type, id };
};

/**
 * `ctid` rather than `updated_at` to tell a rewritten row from an untouched
 * one: the whole test is one transaction, so `now()` — and therefore every
 * trigger-stamped `updated_at` — is the same instant throughout, while an
 * UPDATE always writes a new tuple version at a new `ctid`.
 */
const itemState = async (
  db: DbOrTx,
  item: { type: LinkedType; id: string },
): Promise<{ barcode_code: string | null; ctid: string }> => {
  const result = await db.execute<{
    barcode_code: string | null;
    ctid: string;
  }>(
    sql`select barcode_code, ctid::text as ctid from ${sql.identifier(ITEM_TABLE[item.type])} where id = ${item.id}::uuid`,
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error(`no ${item.type} ${item.id}`);
  return row;
};

describe.skipIf(skip)(
  "20260928185314_canonical_barcode_codes over fixture rows",
  () => {
    afterAll(closeTestDb);

    it("has the statements this file exercises, and the CHECK after it", () => {
      expect(statementsOf(CANONICALISE)).toHaveLength(EXPECTED_STATEMENTS);
      expect(statementsOf(CHECK)).toEqual([
        'ALTER TABLE "barcodes" ADD CONSTRAINT "barcodes_code_canonical" CHECK ((code = canonical_barcode_code(code, NULL::text)));',
      ]);
    });

    it("merges every spelling of one product, keeps the rest, and is a no-op the second time", async () => {
      await withTestDb(async (db) => {
        await dropCheck(db);
        const user = await seedUser(db);

        await db.execute(sql`
          insert into public.barcodes (code, type) values
            -- (a) UPC-A and its EAN-13 spelling, linked from both sides.
            ('036000291452', 'UPC_A'),
            ('0036000291452', 'EAN_13'),
            -- (b) a case duplicate of a text code; the upper one exists.
            ('sku-w6-case', null),
            ('SKU-W6-CASE', 'CODE_128'),
            -- (c) one GTIN three ways: UPC-E, its UPC-A, its EAN-13.
            ('04252614', 'UPC_E'),
            ('042100005264', null),
            ('0042100005264', 'EAN_13'),
            -- (d) 8 digits valid as both EAN-8 and UPC-E: the stored type
            --     keeps the EAN-8 apart from the UPC-A the UPC-E means.
            ('01234565', 'EAN_8'),
            ('012345000065', 'UPC_A'),
            -- (e) invalid check digits and a non-GTIN length: opaque, kept.
            ('012345678900', 'UPC_A'),
            ('0000000000001', 'EAN13'),
            ('01234567890', null),
            -- (f) already canonical.
            ('00012345678905', 'UPC_A')
        `);
        await db.execute(sql`
          insert into public.barcodes (code, type) values ('', null), (${"ANNO\n1822"}, null)
          on conflict do nothing
        `);

        const a12 = await linkItem(db, "WINE", user, "036000291452");
        const a13Beer = await linkItem(db, "BEER", user, "0036000291452");
        const a13Sake = await linkItem(db, "SAKE", user, "0036000291452");
        const bLower = await linkItem(db, "TEA", user, "sku-w6-case");
        const cUpcE = await linkItem(db, "SPIRIT", user, "04252614");
        const cEan = await linkItem(db, "COFFEE", user, "0042100005264");
        const dEan8 = await linkItem(db, "WINE", user, "01234565");
        const dUpcA = await linkItem(db, "BEER", user, "012345000065");
        const eBad = await linkItem(db, "WINE", user, "012345678900");
        const eBlank = await linkItem(db, "BEER", user, "");
        const fDone = await linkItem(db, "TEA", user, "00012345678905");

        const outbox = await db.execute<{ id: string }>(sql`
          insert into public.outbox (target_actor, target_id, method, payload, status) values
            ('ItemActor', ${`wine:${a12.id}`}, 'setBarcode', ${JSON.stringify({ code: "036000291452" })}::jsonb, 'pending'),
            ('ItemActor', ${`wine:${a12.id}`}, 'setBarcode', ${JSON.stringify({ code: "036000291452" })}::jsonb, 'delivered'),
            ('ItemActor', ${`beer:${a13Beer.id}`}, 'create', ${JSON.stringify({ name: "x", barcodeCode: "0036000291452" })}::jsonb, 'dead'),
            ('ItemActor', ${`tea:${fDone.id}`}, 'setBarcode', ${JSON.stringify({ code: "00012345678905" })}::jsonb, 'pending'),
            ('ItemActor', ${`tea:${fDone.id}`}, 'setBarcode', ${JSON.stringify({ code: null })}::jsonb, 'pending')
          returning id
        `);
        const outboxIds = outbox.rows.map((row) => row.id);
        const idArray = `{${outboxIds.join(",")}}`;
        const untouched = await Promise.all(
          [eBad, eBlank, fDone].map((item) => itemState(db, item)),
        );

        await runCanonicalise(db);

        const touched = [
          "036000291452",
          "0036000291452",
          "00036000291452",
          "sku-w6-case",
          "SKU-W6-CASE",
          "04252614",
          "042100005264",
          "0042100005264",
          "00042100005264",
          "01234565",
          "00000001234565",
          "012345000065",
          "00012345000065",
          "012345678900",
          "0000000000001",
          "01234567890",
          "00012345678905",
          "",
          "ANNO\n1822",
        ];
        expect(await barcodeRows(db, touched)).toEqual([
          { code: "", type: null },
          { code: "0000000000001", type: "EAN13" },
          // (d) EAN-8 and UPC-A stay two products.
          { code: "00000001234565", type: "EAN_8" },
          { code: "00012345000065", type: "UPC_A" },
          { code: "00012345678905", type: "UPC_A" },
          // (a) EAN_13 wins: its spelling carried two links to UPC-A's one.
          { code: "00036000291452", type: "EAN_13" },
          // (c) UPC-E and EAN-13 tie on one link each, neither was already
          //     canonical, and "0042…" sorts before "0425…": EAN_13.
          { code: "00042100005264", type: "EAN_13" },
          { code: "01234567890", type: null },
          { code: "012345678900", type: "UPC_A" },
          { code: "ANNO\n1822", type: null },
          // (b) the lower spelling's link wins, but it has no type.
          { code: "SKU-W6-CASE", type: "CODE_128" },
        ]);

        expect(await itemState(db, a12)).toMatchObject({
          barcode_code: "00036000291452",
        });
        expect(await itemState(db, a13Beer)).toMatchObject({
          barcode_code: "00036000291452",
        });
        expect(await itemState(db, a13Sake)).toMatchObject({
          barcode_code: "00036000291452",
        });
        expect(await itemState(db, bLower)).toMatchObject({
          barcode_code: "SKU-W6-CASE",
        });
        expect(await itemState(db, cUpcE)).toMatchObject({
          barcode_code: "00042100005264",
        });
        expect(await itemState(db, cEan)).toMatchObject({
          barcode_code: "00042100005264",
        });
        expect(await itemState(db, dEan8)).toMatchObject({
          barcode_code: "00000001234565",
        });
        expect(await itemState(db, dUpcA)).toMatchObject({
          barcode_code: "00012345000065",
        });
        // Opaque and already-canonical rows are not even rewritten in place.
        expect(
          await Promise.all(
            [eBad, eBlank, fDone].map((item) => itemState(db, item)),
          ),
        ).toEqual(untouched);
        expect(untouched.map((row) => row.barcode_code)).toEqual([
          "012345678900",
          "",
          "00012345678905",
        ]);

        const payloads = await db.execute<{ id: string; payload: unknown }>(
          sql`select id, payload from public.outbox where id = any(${idArray}::uuid[])`,
        );
        const payloadOf = (id: string | undefined) =>
          payloads.rows.find((row) => row.id === id)?.payload;
        expect(payloadOf(outboxIds[0])).toEqual({ code: "00036000291452" });
        // Delivered history is left as it happened.
        expect(payloadOf(outboxIds[1])).toEqual({ code: "036000291452" });
        expect(payloadOf(outboxIds[2])).toEqual({
          name: "x",
          barcodeCode: "00036000291452",
        });
        expect(payloadOf(outboxIds[3])).toEqual({ code: "00012345678905" });
        expect(payloadOf(outboxIds[4])).toEqual({ code: null });

        // The result satisfies the CHECK the next migration adds.
        for (const statement of statementsOf(CHECK)) {
          await db.execute(sql.raw(statement));
        }

        // And a second run changes nothing at all.
        const snapshot = async () => ({
          barcodes: (
            await db.execute(
              sql`select code, type from public.barcodes order by code collate "C"`,
            )
          ).rows,
          items: await Promise.all(
            [
              a12,
              a13Beer,
              a13Sake,
              bLower,
              cUpcE,
              cEan,
              dEan8,
              dUpcA,
              eBad,
              eBlank,
              fDone,
            ].map((item) => itemState(db, item)),
          ),
          outbox: (
            await db.execute(
              sql`select id, payload, ctid::text as ctid from public.outbox where id = any(${idArray}::uuid[]) order by id`,
            )
          ).rows,
        });
        const before = await snapshot();
        await runCanonicalise(db);
        expect(await snapshot()).toEqual(before);
      });
    });
  },
);
