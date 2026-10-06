/**
 * `BarcodeActor` against a real Postgres (B2).
 *
 * The reason this file exists is one line in `target-stack.md` §7:
 *
 * > any user can update any `barcodes` row
 *
 * — and the metadata behind it (`public_barcodes.yaml`: `update_permissions`
 * for role `user`, `columns: [code, type]`, `filter: {}`). The tests under
 * "the §7 gap, closed" are the proof that it no longer holds, from all three
 * viewpoints §1.6 asks for.
 *
 * `barcodes` has no owner column — `(code text primary key, type text)` — so
 * "owns the row" is derived rather than read: creation, and the item's own
 * `created_by_id`. Both are exercised here.
 */
import { randomUUID } from "node:crypto";
import {
  adminCtx,
  anonymousCtx,
  barcodeActorId,
  ForbiddenError,
  hasValidGs1CheckDigit,
  type ItemRef,
  NotFoundError,
  userCtx,
  ValidationError,
} from "@cellar-assistant/contracts";
import { outbox } from "@cellar-assistant/db";
import { and, eq, sql } from "@cellar-assistant/db/orm";
import { ActorId, DaprClient } from "@dapr/dapr";
import { afterAll, describe, expect, it } from "vitest";
import type { DbOrTx } from "../lib/db.ts";
import {
  activate,
  closeTestDb,
  resolveTestDatabase,
  seedUser,
  testDelivery,
  withTestDb,
} from "../lib/testing.ts";
import { BarcodeActor } from "./barcode-actor.ts";
import { ItemActor } from "./item-actor.ts";

const daprClient = (): DaprClient =>
  new DaprClient({ daprHost: "127.0.0.1", daprPort: "3502" });

const newBarcodeActor = (code: string, db: DbOrTx): BarcodeActor =>
  new BarcodeActor(daprClient(), new ActorId(code), db);

const newItemActor = (id: string, db: DbOrTx): ItemActor =>
  new ItemActor(daprClient(), new ActorId(id), db);

/**
 * A distinct GTIN-14 per test, so nothing collides across rollbacks — with a
 * valid check digit, so it is already the canonical key `BarcodeActor`
 * requires (a 13-digit number would be canonical only when its check digit
 * happened to fail, and padded to 14 digits otherwise).
 */
let codeSeq = 0;
const nextCode = (): string => {
  codeSeq += 1;
  const body = String(1_000_000_000_000 + codeSeq);
  const check = [..."0123456789"].find((digit) =>
    hasValidGs1CheckDigit(`${body}${digit}`),
  );
  return `${body}${check ?? "0"}`;
};

const seedWine = async (db: DbOrTx, createdById: string): Promise<ItemRef> => {
  await db.execute(
    sql`insert into public.wine_style (value) values ('RED') on conflict do nothing`,
  );
  const onboardingId = randomUUID();
  await db.execute(sql`
    insert into public.item_onboardings (id, user_id, item_type)
    values (${onboardingId}::uuid, ${createdById}::uuid, 'WINE')
  `);
  const id = randomUUID();
  await db.execute(sql`
    insert into public.wines (id, name, created_by_id, vintage, style, item_onboarding_id)
    values (${id}::uuid, 'Test Wine', ${createdById}::uuid, '2020-01-01', 'RED',
            ${onboardingId}::uuid)
  `);
  return { type: "WINE", id };
};

const seedFriendship = async (
  db: DbOrTx,
  userId: string,
  friendId: string,
): Promise<void> => {
  await db.execute(sql`
    insert into public.friends (user_id, friend_id)
    values (${userId}::uuid, ${friendId}::uuid) on conflict do nothing
  `);
};

const { skip } = await resolveTestDatabase();

describe.skipIf(skip)("BarcodeActor (B2)", () => {
  afterAll(closeTestDb);

  it("is an entity actor per §8.3", () => {
    expect(BarcodeActor.category).toBe("entity");
  });

  /* ------------------------------------------------------------------ */
  /* ensure — find-or-create, the only insert path                       */
  /* ------------------------------------------------------------------ */

  describe("ensure (§2.1): find-or-create on the natural key", () => {
    it("creates a row, then returns the same one", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const code = nextCode();
        const actor = await activate(newBarcodeActor(code, db));

        const first = await actor.ensure(userCtx(user, "r"), {
          type: "EAN13",
        });
        expect(first).toEqual({ code, type: "EAN13", items: [] });

        const again = await actor.ensure(userCtx(user, "r"), {
          type: "EAN13",
        });
        expect(again).toEqual(first);

        const rows = await db.execute<{ count: string }>(
          sql`select count(*) as count from public.barcodes where code = ${code}`,
        );
        expect(rows.rows[0]?.count).toBe("1");
      });
    });

    it("refuses an anonymous caller", async () => {
      await withTestDb(async (db) => {
        const actor = await activate(newBarcodeActor(nextCode(), db));
        await expect(actor.ensure(anonymousCtx("r"), {})).rejects.toThrow(
          ForbiddenError,
        );
      });
    });

    it("refuses a key that is not a barcode", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const actor = await activate(newBarcodeActor("not a barcode!!", db));
        await expect(
          actor.ensure(userCtx(user, "r"), { type: "EAN13" }),
        ).rejects.toThrow(ValidationError);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* one spelling per product (actor-keys.md, "BarcodeActor")            */
  /* ------------------------------------------------------------------ */

  describe("the key is the canonical code", () => {
    it.each([
      ["00036000291452", true],
      ["036000291452", false],
      ["0036000291452", false],
      ["ABC123", true],
      ["abc123", false],
      ["012345678900", true],
      ["", false],
      ["not a barcode!!", false],
    ] as const)("keyShape(%j) is %s", (key, accepted) => {
      expect(BarcodeActor.keyShape(key)).toBe(accepted);
    });

    it("ensure refuses a non-canonical key and names the canonical one", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const actor = await activate(newBarcodeActor("036000291452", db));
        await expect(
          actor.ensure(userCtx(user, "r"), { type: "UPC_A" }),
        ).rejects.toThrow(
          new ValidationError(
            '"036000291452" is not a canonical barcode key; address BarcodeActor("00036000291452") (barcodeActorId)',
          ),
        );
        const rows = await db.execute<{ count: string }>(
          sql`select count(*) as count from public.barcodes where code in ('036000291452', '00036000291452')`,
        );
        expect(rows.rows[0]?.count).toBe("0");
      });
    });

    it("get on a non-canonical key is NotFound even when its canonical row exists", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const canonical = await activate(
          newBarcodeActor(barcodeActorId("036000291452"), db),
        );
        await canonical.ensure(userCtx(user, "r"), { type: "UPC_A" });
        const stray = await activate(newBarcodeActor("0036000291452", db));
        await expect(stray.get(userCtx(user, "r"))).rejects.toThrow(
          NotFoundError,
        );
      });
    });

    /**
     * The finding, end to end: a bottle registered from its UPC-A and later
     * scanned as EAN-13 (what AVFoundation reports for a UPC-A) must find the
     * same item — and a text code typed in a different case, likewise.
     */
    it.each([
      [
        "UPC-A, then EAN-13",
        "036000291452",
        "UPC_A",
        "0036000291452",
        "EAN_13",
      ],
      ["EAN-13, then UPC-A", "0036000291452", "EAN_13", "036000291452", null],
      ["UPC-E, then its UPC-A", "04252614", "UPC_E", "042100005264", "UPC_A"],
      ["lower case, then upper", "w6-sku-1", null, "W6-SKU-1", null],
    ] as const)("%s → one row, one item", async (_label, first, firstType, second, secondType) => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const wine = await seedWine(db, owner);

        // Registered and linked under the first spelling.
        const scanned = await activate(
          newBarcodeActor(barcodeActorId(first, firstType), db),
        );
        await scanned.ensure(userCtx(owner, "r"), { type: firstType });
        const linked = await scanned.linkItem(userCtx(owner, "r"), {
          itemType: wine.type,
          itemId: wine.id,
        });
        const item = await activate(newItemActor(`wine:${wine.id}`, db));
        await item.setBarcode(testDelivery(linked.outboxRowId ?? "x"), {
          code: linked.code,
        });

        // Scanned again under the second: the same actor key, the same row.
        const key = barcodeActorId(second, secondType);
        expect(key).toBe(linked.code);
        const again = await activate(newBarcodeActor(key, db));
        const ensured = await again.ensure(userCtx(owner, "r"), {
          type: secondType,
        });
        expect(ensured).toEqual({
          code: linked.code,
          type: firstType,
          items: [{ type: "WINE", id: wine.id }],
        });
        const rows = await db.execute<{ code: string }>(
          sql`select code from public.barcodes where code in (${first}, ${second}, ${linked.code})`,
        );
        expect(rows.rows).toEqual([{ code: linked.code }]);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* target-stack §7: "any user can update any barcodes row"             */
  /* ------------------------------------------------------------------ */

  describe("the §7 gap, closed: only creation or admin may write", () => {
    /**
     * Today: `update_permissions` for role `user` is `columns: [code, type]`,
     * `filter: {}`. So any signed-in user can re-type any barcode in the
     * database. Here, three viewers try it and all three are refused; only
     * `admin` (and `system`) succeed.
     */
    it("refuses a re-type from the creator, a friend and a stranger", async () => {
      await withTestDb(async (db) => {
        const creator = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, creator, friend);

        // A text code: a GTIN's other renderings are not a re-type (next test).
        const code = `W6-RETYPE-${nextCode()}`;
        const actor = await activate(newBarcodeActor(code, db));
        await actor.ensure(userCtx(creator, "r"), { type: "EAN13" });

        // Not even the user who created the row — §2.1 is "creation or admin",
        // and creation is over.
        for (const viewer of [creator, friend, stranger]) {
          await expect(
            actor.ensure(userCtx(viewer, "r"), { type: "UPC_A" }),
          ).rejects.toThrow(ForbiddenError);
        }

        const unchanged = await db.execute<{ type: string }>(
          sql`select type from public.barcodes where code = ${code}`,
        );
        expect(unchanged.rows[0]?.type).toBe("EAN13");

        await expect(
          actor.ensure(adminCtx(stranger, "r"), { type: "UPC_A" }),
        ).resolves.toMatchObject({ type: "UPC_A" });
      });
    });

    /**
     * With canonical keys, one GTIN-14 row is reached from every rendering of
     * the number — UPC-A, EAN-13, UPC-E — and each scanner reports its own.
     * A user naming a different one writes nothing and is not refused; an
     * admin may still re-type.
     */
    it("leaves a GTIN's type alone for a user naming another rendering of it, without refusing", async () => {
      await withTestDb(async (db) => {
        const creator = await seedUser(db);
        const stranger = await seedUser(db);
        const code = nextCode();
        const actor = await activate(newBarcodeActor(code, db));
        await actor.ensure(userCtx(creator, "r"), { type: "UPC_A" });

        for (const viewer of [creator, stranger]) {
          await expect(
            actor.ensure(userCtx(viewer, "r"), { type: "EAN_13" }),
          ).resolves.toMatchObject({ code, type: "UPC_A" });
        }
        const unchanged = await db.execute<{ type: string }>(
          sql`select type from public.barcodes where code = ${code}`,
        );
        expect(unchanged.rows[0]?.type).toBe("UPC_A");

        await expect(
          actor.ensure(adminCtx(stranger, "r"), { type: "EAN_13" }),
        ).resolves.toMatchObject({ type: "EAN_13" });
      });
    });

    /**
     * The other half of "owns the row": the *item* is what a barcode link
     * touches, and an item has a creator. This is the write today's
     * `filter: {}` permission most obviously enables — pointing someone else's
     * bottle at a code of your choosing.
     */
    it("refuses linkItem from a user who does not own the item", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, owner, friend);

        const wine = await seedWine(db, owner);
        const code = nextCode();
        const actor = await activate(newBarcodeActor(code, db));
        await actor.ensure(userCtx(owner, "r"), { type: "EAN13" });

        const input = { itemType: wine.type, itemId: wine.id } as const;

        for (const viewer of [friend, stranger]) {
          await expect(
            actor.linkItem(userCtx(viewer, "r"), input),
          ).rejects.toThrow(ForbiddenError);
        }
        await expect(actor.linkItem(anonymousCtx("r"), input)).rejects.toThrow(
          ForbiddenError,
        );

        // …and nothing was enqueued on their behalf.
        const rows = await db
          .select({ id: outbox.id })
          .from(outbox)
          .where(
            and(
              eq(outbox.targetActor, "ItemActor"),
              eq(outbox.method, "setBarcode"),
            ),
          );
        expect(rows).toHaveLength(0);

        // The creator may.
        const linked = await actor.linkItem(userCtx(owner, "r"), input);
        expect(linked.outboxRowId).not.toBeNull();
      });
    });

    it("refuses linkItem for an item that does not exist", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const actor = await activate(newBarcodeActor(nextCode(), db));
        await actor.ensure(userCtx(user, "r"), {});
        await expect(
          actor.linkItem(userCtx(user, "r"), {
            itemType: "WINE",
            itemId: randomUUID(),
          }),
        ).rejects.toThrow(NotFoundError);
      });
    });

    it("refuses a malformed itemId rather than passing it to Postgres", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const actor = await activate(newBarcodeActor(nextCode(), db));
        await actor.ensure(userCtx(user, "r"), {});
        await expect(
          actor.linkItem(userCtx(user, "r"), {
            itemType: "WINE",
            itemId: "'; drop table wines; --",
          }),
        ).rejects.toThrow(ValidationError);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* linkItem is a §1.7 cross-aggregate operation                        */
  /* ------------------------------------------------------------------ */

  describe("linkItem completes through the outbox (§1.7)", () => {
    it("enqueues ItemActor.setBarcode with an object payload, and the delivery writes the item", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const wine = await seedWine(db, owner);
        const code = nextCode();

        const barcode = await activate(newBarcodeActor(code, db));
        await barcode.ensure(userCtx(owner, "r"), { type: "EAN13" });
        const linked = await barcode.linkItem(userCtx(owner, "r"), {
          itemType: wine.type,
          itemId: wine.id,
        });

        const [row] = await db
          .select({
            targetActor: outbox.targetActor,
            targetId: outbox.targetId,
            method: outbox.method,
            payload: outbox.payload,
          })
          .from(outbox)
          .where(eq(outbox.id, linked.outboxRowId ?? ""));
        expect(row).toEqual({
          targetActor: "ItemActor",
          targetId: `wine:${wine.id}`,
          method: "setBarcode",
          // Not a bare string — `deliver` calls `method(systemCtx, payload)`.
          payload: { code },
        });

        // What the drainer does with it.
        const item = await activate(newItemActor(`wine:${wine.id}`, db));
        const updated = await item.setBarcode(
          testDelivery(linked.outboxRowId ?? "no-row"),
          row?.payload as { code: string },
        );
        expect(updated.barcodeCode).toBe(code);

        // And the barcode now knows about the item.
        const reloaded = await activate(newBarcodeActor(code, db));
        expect(await reloaded.get(userCtx(owner, "r"))).toEqual({
          code,
          type: "EAN13",
          items: [{ type: "WINE", id: wine.id }],
        });
      });
    });

    /**
     * `ItemActor` refuses a non-canonical key as absent (one row, one
     * activation — `EntityActorBase.keyShape`), so an uppercase `itemId`,
     * which the case-blind uuid check accepts, must not become the outbox
     * target as sent: the delivery would be `NotFound`, every retry too, and
     * the row would dead-letter.
     */
    it("addresses the outbox row by the canonical item key, whatever case the itemId arrived in", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const wine = await seedWine(db, owner);
        const code = nextCode();

        const barcode = await activate(newBarcodeActor(code, db));
        await barcode.ensure(userCtx(owner, "r"), {});
        const linked = await barcode.linkItem(userCtx(owner, "r"), {
          itemType: wine.type,
          itemId: wine.id.toUpperCase(),
        });

        const [row] = await db
          .select({ targetId: outbox.targetId })
          .from(outbox)
          .where(eq(outbox.id, linked.outboxRowId ?? ""));
        expect(row?.targetId).toBe(`wine:${wine.id}`);
        expect(linked.item).toEqual({ type: "WINE", id: wine.id });
      });
    });

    it("is idempotent: a second linkItem enqueues nothing", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const wine = await seedWine(db, owner);
        const code = nextCode();

        const barcode = await activate(newBarcodeActor(code, db));
        await barcode.ensure(userCtx(owner, "r"), {});
        const first = await barcode.linkItem(userCtx(owner, "r"), {
          itemType: wine.type,
          itemId: wine.id,
        });
        const item = await activate(newItemActor(`wine:${wine.id}`, db));
        await item.setBarcode(testDelivery("x"), { code });

        const reloaded = await activate(newBarcodeActor(code, db));
        const second = await reloaded.linkItem(userCtx(owner, "r"), {
          itemType: wine.type,
          itemId: wine.id,
        });
        expect(first.outboxRowId).not.toBeNull();
        expect(second.outboxRowId).toBeNull();

        const rows = await db
          .select({ id: outbox.id })
          .from(outbox)
          .where(
            and(
              eq(outbox.targetActor, "ItemActor"),
              eq(outbox.method, "setBarcode"),
            ),
          );
        expect(rows).toHaveLength(1);
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* get                                                                 */
  /* ------------------------------------------------------------------ */

  describe("get (§1.6): every signed-in viewer, anonymous refused", () => {
    it("answers all three viewers and refuses anonymous", async () => {
      await withTestDb(async (db) => {
        const owner = await seedUser(db);
        const friend = await seedUser(db);
        const stranger = await seedUser(db);
        await seedFriendship(db, owner, friend);
        const code = nextCode();
        const actor = await activate(newBarcodeActor(code, db));
        await actor.ensure(userCtx(owner, "r"), { type: "EAN13" });

        for (const viewer of [owner, friend, stranger]) {
          await expect(actor.get(userCtx(viewer, "r"))).resolves.toMatchObject({
            code,
          });
        }
        await expect(actor.get(anonymousCtx("r"))).rejects.toThrow(
          ForbiddenError,
        );
      });
    });

    it("is NotFound for a code nobody has registered", async () => {
      await withTestDb(async (db) => {
        const user = await seedUser(db);
        const actor = await activate(newBarcodeActor(nextCode(), db));
        await expect(actor.get(userCtx(user, "r"))).rejects.toThrow(
          NotFoundError,
        );
      });
    });
  });

  /* ------------------------------------------------------------------ */
  /* B10: the linked-items list is read fresh, not cached                */
  /* ------------------------------------------------------------------ */

  /**
   * The regression test for B10 (module doc: "the linked-items list is read
   * fresh, not cached"). `wines.barcode_code` and its five siblings belong to
   * `ItemActor`, not `BarcodeActor` — and a `linkItem`'s own outbox delivery
   * writes exactly that column on a *different* actor. Before the fix,
   * `get()` and `linkItem`'s own idempotency check both read
   * `loadAggregate`'s cached `items`, frozen at activation, so a warm
   * `BarcodeActor` would keep answering "nothing points at this code" even
   * after a delivery landed. Everything here happens on ONE activation on
   * purpose, and `ItemActor.setBarcode` is called directly — the way an
   * outbox delivery would, never back through this actor's own `linkItem`.
   */
  it("sees an item linked by ItemActor.setBarcode after this activation started", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const wine = await seedWine(db, owner);
      const code = nextCode();

      const actor = await activate(newBarcodeActor(code, db));
      await actor.ensure(userCtx(owner, "r"), { type: "EAN13" });

      // Activated while nothing points at this code.
      expect(await actor.get(userCtx(owner, "r"))).toEqual({
        code,
        type: "EAN13",
        items: [],
      });

      // A *different* aggregate writes the column `#linkedItems` scans.
      const item = await activate(newItemActor(`wine:${wine.id}`, db));
      await item.setBarcode(testDelivery("x"), { code });

      // The same activation, no reload() call in the test.
      expect(await actor.get(userCtx(owner, "r"))).toEqual({
        code,
        type: "EAN13",
        items: [{ type: "WINE", id: wine.id }],
      });

      // `linkItem`'s own idempotency check must see it too, or it would
      // enqueue a second, redundant `setBarcode`.
      const relinked = await actor.linkItem(userCtx(owner, "r"), {
        itemType: wine.type,
        itemId: wine.id,
      });
      expect(relinked.outboxRowId).toBeNull();
    });
  });
});
