/**
 * `BarcodeActor` — B2 (migration plan §2.1, §3; target-stack §7).
 *
 * > **`BarcodeActor(code)`**
 * > - Owns: `barcodes`. Natural-key entity; doubles as the registry for
 * >   barcode uniqueness.
 * > - Methods: `get`, `ensure(type)`, `linkItem`. Today any user can update any
 * >   barcode; now only the actor can, and only on creation or admin.
 *
 * ## The gap being closed, precisely
 *
 * `nhost/metadata/databases/default/tables/public_barcodes.yaml` grants role
 * `user` an update permission over `[code, type]` with `filter: {}` — every
 * row, for every signed-in user. Since `barcodes.code` is the primary key that
 * six item tables reference, that permission also lets any user rename a code
 * out from under someone else's item (the FK is `ON UPDATE RESTRICT`, which
 * blocks the rename but not the attempt, and `type` is unprotected outright).
 *
 * **There is no owner column to check.** `barcodes` is `(code text primary key,
 * type text)` and nothing more, so this actor derives ownership from the two
 * places it exists:
 *
 * - **creation** — a code nobody has claimed may be created by anyone signed
 *   in; changing an existing row is admin/system only (§2.1's "only on
 *   creation or admin");
 * - **the item** — `linkItem` writes `<table>.barcode_code`, and *that* row has
 *   `created_by_id`. `barcode-actor.test.ts` proves a non-creator is refused.
 *
 * ## Why `linkItem` goes through the outbox
 *
 * The link is two rows in two aggregates: `barcodes` (this actor) and the item
 * table (`ItemActor`). §1.7 makes that a sequence of idempotent calls, with the
 * initiating actor's write and the outbox row committing together — so
 * `linkItem` writes the `barcodes` row and enqueues
 * `ItemActor(type:id).setBarcode({ code })` in one transaction. It does **not**
 * call `ItemActor` synchronously: §8.5 allows entity → entity only via the
 * outbox, and reentrancy is off.
 *
 * ## B10: the linked-items list is read fresh, not cached
 *
 * This actor owns `barcodes` alone; the six `<table>.barcode_code` columns
 * `#linkedItems` scans belong to `ItemActor` (`packages/db/src/writers.ts`).
 * Caching that scan in `loadAggregate` — as an earlier version of this file
 * did — is exactly B6's `RecipeGroupActor` bug: a warm `BarcodeActor(code)`
 * that loaded before an item was linked would keep `get()` and `linkItem`'s
 * own idempotency check answering "nothing points at this code" forever,
 * with nothing to invalidate it, since the write that changes the answer
 * lands on a different aggregate (`ItemActor.setBarcode`, delivered via the
 * outbox `linkItem` itself enqueues — B2's own idempotent-redelivery
 * concern would have papered over a stale re-enqueue, but `get()` reading
 * stale forever would not). `#linkedItems` is therefore called fresh, per
 * call, from `#snapshot()` — never from `loadAggregate`.
 *
 * ## The key is the canonical code, and nothing else
 *
 * One product, one activation, one row: the key must be what
 * `canonicalBarcodeCode` (`@cellar-assistant/contracts`) makes of it — GTIN-14
 * for a retail code with a valid check digit, ASCII upper case for text. Before
 * that, UPC-A `012345678905` and its EAN-13 spelling `0012345678905` were two
 * activations and two rows, and so were `abc123` and `ABC123`. Callers build the
 * id with `barcodeActorId(code, symbology)`; a key that function would change
 * is refused here like any other malformed key (`keyShape` — absent, before the
 * method body runs), and `ensure` names the canonical spelling when called
 * directly. `barcodes_code_canonical` refuses the same rows in Postgres, and
 * `packages/db/migrations/20260928185314_canonical_barcode_codes` merged the
 * spellings that existed before this.
 */
import type {
  ActorCategory,
  BarcodeActorInterface,
  BarcodeDto,
  Ctx,
  EnsureBarcodeInput,
  ItemRef,
  ItemType,
  LinkBarcodeItemInput,
  LinkedBarcodeItem,
} from "@cellar-assistant/contracts";
import {
  BarcodeActorDescriptor,
  canonicalBarcodeCode,
  ForbiddenError,
  hasValidGs1CheckDigit,
  ITEM_TYPES,
  isCanonicalBarcodeCode,
  isItemType,
  itemActorId,
  NotFoundError,
  ValidationError,
} from "@cellar-assistant/contracts";
import { barcodes } from "@cellar-assistant/db";
import { eq } from "@cellar-assistant/db/orm";
import { bypassesPolicy, isOwner } from "@cellar-assistant/policy";
import { EntityActorBase, type KeyShape } from "../lib/actor-base.ts";
import { requirePrivileged, requireSignedIn } from "../lib/guards.ts";
import { ITEM_TABLES } from "../lib/item-bindings.ts";
import { enqueueOutbox } from "../lib/outbox.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";

type BarcodeRow = typeof barcodes.$inferSelect;

/** **Only the `barcodes` row is cached** — see the module doc's "B10" section. */
export type BarcodeAggregate = {
  readonly barcode: BarcodeRow;
};

/** A barcode plus a *fresh* read of everything currently pointing at it. */
type BarcodeSnapshot = {
  readonly barcode: BarcodeRow;
  /** Everything currently pointing at this code, across the six tables. */
  readonly items: readonly ItemRef[];
};

/**
 * Codes are scanned by a phone camera and typed by hand, so the key space is
 * constrained here rather than trusted. EAN/UPC/ITF are digits; some retailers
 * use alphanumeric internal codes, hence the wider allowance.
 */
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** A canonical retail code: 14 digits with a valid GS1 check digit. */
const isGtin14 = (code: string): boolean =>
  /^[0-9]{14}$/.test(code) && hasValidGs1CheckDigit(code);

/** A key this actor can own: well-formed, and already canonical (module doc). */
const isBarcodeKey = (key: string): boolean =>
  CODE_PATTERN.test(key) && isCanonicalBarcodeCode(key);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class BarcodeActor
  extends EntityActorBase<BarcodeAggregate>
  implements BarcodeActorInterface
{
  static readonly category: ActorCategory = BarcodeActorDescriptor.category;
  /** Keyed by the canonical code itself, not a uuid (module doc). */
  static override readonly keyShape: KeyShape = isBarcodeKey;

  protected async loadAggregate(id: string): Promise<BarcodeAggregate | null> {
    if (!isBarcodeKey(id)) return null;
    const [row] = await this.db
      .select()
      .from(barcodes)
      .where(eq(barcodes.code, id));
    if (row === undefined) return null;
    return { barcode: row };
  }

  /** The barcode plus a fresh `#linkedItems` read — see the module doc. */
  async #snapshot(): Promise<BarcodeSnapshot> {
    const { barcode } = this.requireAggregate();
    return { barcode, items: await this.#linkedItems(barcode.code) };
  }

  /**
   * One one-column index scan per item table. A direct read of another aggregate's tables,
   * which §1.5 permits — the single-writer rule is about writes, and
   * `CellarActor` already reads `friends` and `item_vectors` the same way.
   */
  async #linkedItems(code: string): Promise<ItemRef[]> {
    const found = await Promise.all(
      ITEM_TYPES.map(async (type) => {
        const table = ITEM_TABLES[type];
        const rows = await this.db
          .select({ id: table.id })
          .from(table)
          .where(eq(table.barcodeCode, code));
        return rows.map((row): ItemRef => ({ type, id: row.id }));
      }),
    );
    return found.flat();
  }

  /** The item's `created_by_id`, or `null` when no such row exists. */
  async #itemCreator(ref: ItemRef): Promise<string | null> {
    const table = ITEM_TABLES[ref.type];
    const [row] = await this.db
      .select({ createdById: table.createdById })
      .from(table)
      .where(eq(table.id, ref.id));
    return row?.createdById ?? null;
  }

  #requireCode(): string {
    if (!CODE_PATTERN.test(this.key)) {
      throw new ValidationError(
        `"${this.key}" is not a barcode: expected ${CODE_PATTERN.source}`,
      );
    }
    const canonical = canonicalBarcodeCode(this.key);
    if (canonical !== this.key) {
      throw new ValidationError(
        `"${this.key}" is not a canonical barcode key; address BarcodeActor("${canonical}") (barcodeActorId)`,
      );
    }
    return this.key;
  }

  #toDto(snapshot: BarcodeSnapshot): BarcodeDto {
    return {
      code: snapshot.barcode.code,
      type: snapshot.barcode.type,
      items: snapshot.items,
    };
  }

  async get(ctx: Ctx): Promise<BarcodeDto> {
    this.requireAggregate();
    requireSignedIn(ctx, "look a barcode up");
    return this.#toDto(await this.#snapshot());
  }

  /**
   * Find-or-create, and the only path that ever inserts a `barcodes` row.
   *
   * Naturally idempotent on the primary key (§8.4) — which is what lets
   * `ItemOnboardingActor.confirm` call it on every delivery without a key of
   * its own.
   *
   * **Re-typing an existing row is admin/system only.** §2.1: "only on creation
   * or admin". A plain user asking for a different `type` on a code that
   * already has one gets `ForbiddenError`, which is exactly the write today's
   * `filter: {}` update permission allows anybody to make.
   *
   * **Except that another rendering of one GTIN is not a re-type.** Since the
   * key is canonical, the row for `00036000291452` is reached from a UPC-A
   * scan (`UPC_A`) and from the same bottle scanned as EAN-13 (`EAN_13`, which
   * AVFoundation reports for every UPC-A). Both are true of the product, so a
   * plain user's `ensure` with a different `type` on a GTIN-14 key returns the
   * row unchanged — no write, which is all §2.1 asks — instead of refusing,
   * which would fail `ItemOnboardingActor.confirm` for the second scanner
   * (it passes the scan's symbology). A text code keeps the refusal: its
   * `type` is not implied by its digits.
   */
  async ensure(ctx: Ctx, input: EnsureBarcodeInput): Promise<BarcodeDto> {
    const code = this.#requireCode();
    requireSignedIn(ctx, "register a barcode");
    const type = input.type ?? null;

    const existing = this.aggregate;
    if (existing !== null) {
      if (type === null || type === existing.barcode.type) {
        return this.#toDto(await this.#snapshot());
      }
      if (isGtin14(code) && !bypassesPolicy(ctx)) {
        return this.#toDto(await this.#snapshot());
      }
      requirePrivileged(
        ctx,
        `barcode ${code} already exists with type ${String(existing.barcode.type)}; ` +
          "only an admin may change it",
      );
      await this.tx(async (tx) => {
        await tx.update(barcodes).set({ type }).where(eq(barcodes.code, code));
      });
      await this.reload();
      return this.#toDto(await this.#snapshot());
    }

    await this.tx(async (tx) => {
      await tx
        .insert(barcodes)
        .values({ code, type })
        // Two scanners racing the same new code: the loser reads the winner's
        // row rather than failing, which is what "registry" means here.
        .onConflictDoNothing({ target: barcodes.code });
    });
    await this.reload();
    return this.#toDto(await this.#snapshot());
  }

  /**
   * Point an item at this code.
   *
   * **The authorization gap closes here.** The caller must be the item's
   * creator, or `admin`/`system` — anyone else gets `ForbiddenError` before a
   * single row is touched. Today's `filter: {}` update permission on `barcodes`
   * lets any signed-in user do this to any item.
   *
   * Idempotent: an item that already carries the code returns
   * `outboxRowId: null` and enqueues nothing, so a redelivery is a read.
   */
  async linkItem(
    ctx: Ctx,
    input: LinkBarcodeItemInput,
  ): Promise<LinkedBarcodeItem> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "link a barcode to an item");

    if (!isItemType(input.itemType)) {
      throw new ValidationError(`"${input.itemType}" is not an item type`);
    }
    if (!UUID_PATTERN.test(input.itemId)) {
      throw new ValidationError(`itemId must be a uuid, got ${input.itemId}`);
    }
    // Lowercased because it becomes an actor id below (the outbox row to
    // `ItemActor`), and `ItemActor` refuses a non-canonical key as absent: an
    // uppercase id that passed the case-blind check above would otherwise be
    // accepted here and dead-letter on delivery.
    const ref: ItemRef = {
      type: input.itemType,
      id: input.itemId.toLowerCase(),
    };

    const createdById = await this.#itemCreator(ref);
    if (createdById === null) {
      throw new NotFoundError(
        `${ref.type.toLowerCase()} ${ref.id} does not exist`,
      );
    }
    if (!isOwner(ctx, createdById)) {
      throw new ForbiddenError(
        `only the creator of ${ref.type.toLowerCase()} ${ref.id} may link a barcode to it`,
      );
    }

    // B10: freshly read, not `aggregate.items` — `wines.barcode_code` and its
    // five siblings belong to `ItemActor` (module doc), so a link made by a
    // redelivery this activation has not seen must still be found here.
    const items = await this.#linkedItems(aggregate.barcode.code);
    const already = items.some(
      (item) => item.type === ref.type && item.id === ref.id,
    );
    if (already) {
      return { code: aggregate.barcode.code, item: ref, outboxRowId: null };
    }

    // §1.4: the outbox row commits with the write it follows. There is no
    // `barcodes` write left to make (the row exists), so this transaction
    // carries the intent alone — deliberately still a transaction, because a
    // later `barcodes` write here must not be able to drift apart from it.
    const outboxRowId = await this.tx(
      async (tx) =>
        await enqueueOutbox(
          tx,
          OUTBOX_TARGETS["ItemActor.setBarcode"],
          {
            targetId: itemActorId(ref),
            // A `Record<string, unknown>`, never a bare string: `deliver` calls
            // `method(systemCtx, payload)` (B4's finding, §8.4).
            payload: { code: aggregate.barcode.code },
          },
          { attributeTo: ctx },
        ),
    );

    return { code: aggregate.barcode.code, item: ref, outboxRowId };
  }
}

/** Narrowing helper for callers holding a `string` item type. */
export const asItemType = (value: string): ItemType => {
  if (!isItemType(value)) {
    throw new ValidationError(`"${value}" is not an item type`);
  }
  return value;
};
