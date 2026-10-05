/**
 * `ItemOnboardingActor` — B2 (migration plan §2.1, §1.7, §8.4, §8.5).
 *
 * > **`ItemOnboardingActor(onboardingId)`**
 * > - Owns: `item_onboardings`.
 * > - Methods: `start(type, images)` (AI label/barcode extraction — replaces
 * >   the six `*_defaults` actions and `getItemDefaults`; the AI call runs in
 * >   this actor's turn, which blocks only this onboarding), `defaults`,
 * >   `confirm(itemInput)` → `ItemActor.create` + `BarcodeActor.ensure` +
 * >   `BrandRegistryActor.resolve` + `CellarActor.addItem`, as idempotent
 * >   calls, `reprocess` (system).
 * > - Visibility: owner only.
 *
 * ## Why this actor exists
 *
 * Not to model anything — to contain a slow call. Dapr runs one turn at a time
 * per actor id, so a multi-second vision call inside `UserActor` or `ItemActor`
 * would stall every other operation for that id (§8.5). Onboarding gets its own
 * key so the only thing queued behind the model is the one onboarding it
 * belongs to. The provider is injected (`../lib/item-defaults.ts`), the way
 * `FileActor` injects its storage binding.
 *
 * ## `confirm` is four calls, and the split between them is §8.5's, not a taste
 *
 * §8.5's allowed directions for an entity actor are: `FileActor`,
 * `BudgetActor`, `EmbeddingActor`, `BrandRegistryActor`, `BarcodeActor`
 * synchronously — **and other entity actors only via the outbox**. So:
 *
 * | call | how | why |
 * |---|---|---|
 * | `BarcodeActor.ensure` | synchronous | on §8.5's allow-list; find-or-create |
 * | `BrandRegistryActor.resolve` | synchronous | on §8.5's allow-list; find-or-create by `lower(trim(name))` |
 * | `ItemActor.create` | **outbox** | entity → entity |
 * | `ItemActor.linkBrand` | **outbox** | entity → entity, and must follow `create` |
 * | `CellarActor.addItem` | **outbox** | entity → entity |
 *
 * `outbox.seq` gives the three deliveries their first-attempt order (A7b), and
 * each is idempotent, so a delivery that overtakes its predecessor fails on the
 * foreign key and is simply retried — at-least-once, converging.
 *
 * ## The outbox is a privilege boundary, so `confirm` authorizes three ids
 *
 * Every row above is delivered as `systemCtx`, and every owner gate in this
 * codebase opens with `if (bypassesPolicy(ctx)) return;` — a system delivery
 * has no viewer to authorize, so the far end's check cannot fire. Whatever an
 * authenticated caller can persuade this method to enqueue therefore runs with
 * policy off, and **every caller-supplied id on a row has to be authorized
 * before the row is written**. `confirm` therefore authorizes three things,
 * not one:
 *
 * | id | authorized by | what it would otherwise reach |
 * |---|---|---|
 * | `this.key` | `canSee` (`requireVisible`) | the onboarding itself |
 * | `input.cellarId` | `#requireCellarWriteAccess` | `CellarActor.addItem` on anyone's cellar |
 * | `input.itemId` | `#requireItemNotAnotherUsers` | `ItemActor.linkBrand` on anyone's item |
 *
 * E5a found the second and third unchecked; see each method for its argument.
 * `BarcodeActor.linkItem` is the shape both are modelled on — it is the one
 * pre-existing site that takes a caller-supplied `targetId` and proves the
 * target's ownership *before* enqueuing.
 *
 * ## Idempotency without a new column (§8.4)
 *
 * `confirm` mints **deterministic** ids from the onboarding id, via
 * `derivedUuid` (`../lib/derived-uuid.ts` — hoisted there by C4c; see that
 * module for why the separator it uses matters): `itemId =
 * derivedUuid(onboardingId, "item")`, `cellarItemId =
 * derivedUuid(onboardingId, cellarId)`. So even if the short-circuit below is
 * bypassed entirely — a redelivery racing itself, two tabs, a retried
 * mutation — every downstream call addresses the *same* actor id and the same
 * row id, and `ItemActor.create`, `BrandRegistryActor.resolve` and
 * `CellarActor.addItem` are each already idempotent on exactly that. One item,
 * one brand, one cellar item, with no extra bookkeeping table and no
 * `confirmed_item_id` column added to `item_onboardings`.
 */
import { randomUUID } from "node:crypto";
import type {
  ActorCategory,
  ConfirmOnboardingInput,
  ConfirmOnboardingResult,
  CreateItemInput,
  Ctx,
  ItemOnboardingActorInterface,
  ItemOnboardingDto,
  ItemRef,
  ItemType,
  OnboardingStatus,
  ReprocessResult,
  StartOnboardingInput,
} from "@cellar-assistant/contracts";
import {
  BarcodeActorDescriptor,
  BrandRegistryActorDescriptor,
  barcodeActorId,
  ForbiddenError,
  ITEM_ATTRIBUTE_KEY,
  ItemOnboardingActorDescriptor,
  isItemType,
  isOnboardingStatus,
  itemActorId,
  normalizeBrandName,
  requireItemAttributes,
  ValidationError,
} from "@cellar-assistant/contracts";
import { itemOnboardings } from "@cellar-assistant/db";
import { eq } from "@cellar-assistant/db/orm";
import { isOwner } from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { absentRow, EntityActorBase } from "../lib/actor-base.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { derivedUuid } from "../lib/derived-uuid.ts";
import {
  daprVerifyFile,
  requireVerifiedFile,
  type VerifyFile,
} from "../lib/file-verification.ts";
import { internal } from "../lib/internal-client.ts";
import { ITEM_TABLES } from "../lib/item-bindings.ts";
import type {
  ItemDefaultsProvider,
  ItemDefaultsRequest,
} from "../lib/item-defaults.ts";
import { itemDefaultsProvider } from "../lib/item-defaults.ts";
import { enqueueOutbox } from "../lib/outbox.ts";
import { OUTBOX_TARGETS } from "../lib/outbox-targets.ts";
import { isUuid, requireUuid } from "../lib/uuid.ts";
import { isCellarOwner, loadCellarAccess } from "../lib/visibility.ts";

type OnboardingRow = typeof itemOnboardings.$inferSelect;

export type ItemOnboardingAggregate = { readonly row: OnboardingRow };

/* -------------------------------------------------------------------------- */
/* Injected seams (§8.5's synchronous allow-list)                              */
/* -------------------------------------------------------------------------- */

export type BarcodeEnsurer = (
  ctx: Ctx,
  code: string,
  type: string | null,
) => Promise<{ readonly code: string }>;

export type BrandResolver = (
  ctx: Ctx,
  name: string,
) => Promise<{ readonly id: string }>;

/**
 * `BarcodeActor(barcodeActorId(code, type))` — the canonical key, with the
 * scan's symbology as the hint that tells an 8-digit UPC-E from an EAN-8.
 * `confirm` already passes the canonical code; canonicalising again is free
 * (it is idempotent) and keeps this seam safe for any other caller.
 */
export const daprEnsureBarcode: BarcodeEnsurer = (ctx, code, type) =>
  internal(ctx)(BarcodeActorDescriptor, barcodeActorId(code, type)).ensure({
    type,
  });

/**
 * `BrandRegistryActor` is keyed by `normalizeBrandName(name)` — B3's note for
 * B2 is explicit that the key is built with that function and not by
 * lowercasing here, so `" Château Margaux "` and `"château margaux"` reach one
 * activation and produce one brand.
 */
export const daprResolveBrand: BrandResolver = (ctx, name) =>
  internal(ctx)(BrandRegistryActorDescriptor, normalizeBrandName(name)).resolve(
    name,
  );

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const iso = (value: Date | null): string =>
  (value ?? new Date(0)).toISOString();

const jsonOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : JSON.stringify(value);

const statusOf = (value: string): OnboardingStatus =>
  isOnboardingStatus(value) ? value : "START";

export const onboardingRowToDto = (row: OnboardingRow): ItemOnboardingDto => ({
  id: row.id,
  userId: row.userId,
  status: statusOf(row.status),
  itemType: isItemType(row.itemType.toUpperCase())
    ? (row.itemType.toUpperCase() as ItemType)
    : "WINE",
  barcode: row.barcode,
  barcodeType: row.barcodeType,
  frontLabelImageId: row.frontLabelImageId,
  backLabelImageId: row.backLabelImageId,
  defaults: jsonOrNull(row.defaults),
  rawDefaults: row.rawDefaults,
  aiModel: row.aiModel,
  confidence: row.confidence,
  lastReprocessResult: jsonOrNull(row.lastReprocessResult),
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

export class ItemOnboardingActor
  extends EntityActorBase<ItemOnboardingAggregate>
  implements ItemOnboardingActorInterface
{
  static readonly category: ActorCategory =
    ItemOnboardingActorDescriptor.category;

  readonly #defaultsProvider: ItemDefaultsProvider;
  readonly #ensureBarcode: BarcodeEnsurer;
  readonly #resolveBrand: BrandResolver;
  readonly #verifyFile: VerifyFile;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    defaultsProvider: ItemDefaultsProvider = itemDefaultsProvider(),
    ensureBarcode: BarcodeEnsurer = daprEnsureBarcode,
    resolveBrand: BrandResolver = daprResolveBrand,
    verifyFile: VerifyFile = daprVerifyFile,
  ) {
    super(daprClient, id, db);
    this.#defaultsProvider = defaultsProvider;
    this.#ensureBarcode = ensureBarcode;
    this.#resolveBrand = resolveBrand;
    this.#verifyFile = verifyFile;
  }

  protected async loadAggregate(
    id: string,
  ): Promise<ItemOnboardingAggregate | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.db
      .select()
      .from(itemOnboardings)
      .where(eq(itemOnboardings.id, id));
    return row === undefined ? null : { row };
  }

  /**
   * §2.1: "Visibility: owner only." Not friends, not the public.
   *
   * Refused as **absent**, not as forbidden (E5b). There is no third party who
   * may see an onboarding without owning it, so `ForbiddenError` here could
   * only ever mean "this id names a real row, and it is somebody else's" —
   * which is an existence oracle, and the only thing a stranger could learn
   * from this actor at all. `NotFoundError` with `requireAggregate()`'s own
   * wording makes the two cases one case; `CellarActor`'s `requireAllowed` is the
   * same decision where a visible-but-not-yours state does exist.
   */
  protected override canSee(
    ctx: Ctx,
    aggregate: ItemOnboardingAggregate,
  ): boolean {
    return isOwner(ctx, aggregate.row.userId);
  }

  /**
   * E5a — **the owner check for the cellar `confirm` is about to write into.**
   *
   * `canSee` above authorizes the *onboarding*. It says nothing about
   * `input.cellarId`, and `confirm` used to enqueue
   * `{targetActor:"CellarActor", targetId: cellarId, method:"addItem"}` on
   * nothing but the caller's word — so any signed-in user could file an item
   * into any other user's cellar, PRIVATE included, with
   * `cellar_items.created_by` set to themselves.
   *
   * ## Why the check has to be here and not in `CellarActor.addItem`
   *
   * `addItem` *does* call `#requireOwner`, and it is not a missing check —
   * it is a check that cannot fire on this path. The outbox delivers as
   * `systemCtx`, and every owner gate in this codebase opens with
   * `if (bypassesPolicy(ctx)) return;` because a system delivery has no viewer
   * to authorize. So the outbox is a **privilege boundary**: whatever the
   * authenticated caller can persuade an actor to enqueue is executed with
   * policy off. Anything the far end can no longer verify has to be verified
   * *before the row is written*.
   *
   * That is the same argument as A7c (1) at the `requireItemAttributes` call
   * below — a rejection raised during delivery is not a rejection the caller
   * ever sees — sharpened by one degree: there, delivery raised the error too
   * late; here, delivery does not raise it at all.
   *
   * ## Why a `select` and not `CellarActor.get`
   *
   * §8.5's synchronous allow-list for an entity actor is closed —
   * `FileActor`, `BudgetActor`, `EmbeddingActor`, `BrandRegistryActor`,
   * `BarcodeActor`, and other entity actors **only via the outbox**. An
   * `ItemOnboardingActor → CellarActor` call would be a new sixth edge, and
   * an outbox hop cannot answer a question `confirm` must answer *before* it
   * commits. So this reads the two rows directly, which adds no edge at all:
   * §1.1's table ownership governs **writes** (`packages/db/src/writers.ts`
   * still maps `cellars` and `cellar_owners` to `CellarActor`, and this method
   * writes neither). The precedent is `CellarActor.#friendshipsOf`, which
   * reads `friends` — a table it does not own — for exactly this kind of
   * authorization decision, and which `lib/visibility.ts` documents as
   * deliberate rather than accidental.
   *
   * ## Whose ownership, and why no `bypassesPolicy` escape
   *
   * The subject is `item_onboardings.user_id`, not `ctx.viewerId`: that is the
   * id `confirm` puts in `createdBy` on the payload, so it is the id whose
   * write access has to hold. Checking it rather than the viewer also means an
   * `admin` confirming on a user's behalf still cannot file the item somewhere
   * that user could not — and deliberately gives this method **no
   * `bypassesPolicy` branch**, because such a branch is precisely what turned
   * `addItem`'s gate into a no-op.
   *
   * `NotFoundError` for both "no such cellar" and "not yours", per
   * `CellarActor`'s own line that absence and denial are indistinguishable: a
   * caller who is neither creator nor co-owner learns nothing about which of
   * the two it was.
   */
  async #requireCellarWriteAccess(
    cellarId: string,
    ownerId: string,
  ): Promise<void> {
    const cellar = await loadCellarAccess(this.db, cellarId);
    if (cellar !== null && isCellarOwner(cellar, ownerId)) return;
    // `CellarActor`'s own absent answer, so this is the same bytes the cellar
    // would give for an id that names nothing.
    throw absentRow("CellarActor", cellarId);
  }

  /**
   * E5a (second instance) — `input.itemId` is caller-supplied too.
   *
   * `itemId` is documented as a client-minted idempotency key, and for a fresh
   * uuid that is all it is. Point it at an item that *already exists* and it
   * becomes a target id: `ItemActor.create` short-circuits to a read (so
   * nothing is overwritten), and then the `linkBrand` row this method enqueues
   * next is delivered as `systemCtx` to somebody else's item — past
   * `ItemActor.linkBrand`'s `#requireCreator` gate, which the system ctx opens.
   * Net effect: any signed-in user could attach a brand of their choosing to
   * any item in the catalog, and set it primary.
   *
   * Strictly less severe than the cellar hole — `wines` and its five siblings
   * carry no privacy column, so this is integrity on shared catalog rows rather
   * than a write into private data — but it is the same mechanism and it is
   * closed the same way, and it is why the creator check reads the item table
   * directly (as `BarcodeActor.#itemCreator` does) instead of asking
   * `ItemActor`.
   *
   * A *new* id is not an error: `createdById === null` means no such row yet,
   * which is the ordinary case this parameter exists for.
   */
  async #requireItemNotAnotherUsers(
    item: ItemRef,
    ownerId: string,
  ): Promise<void> {
    // `ITEM_TABLES` is total over `ItemType`: a seventh type is covered here
    // the moment it is bound, rather than silently skipping the check.
    const table = ITEM_TABLES[item.type];
    const [row] = await this.db
      .select({ createdById: table.createdById })
      .from(table)
      .where(eq(table.id, item.id));
    if (row === undefined || row.createdById === ownerId) return;
    throw new ForbiddenError(
      `${item.type.toLowerCase()} ${item.id} belongs to another user`,
    );
  }

  async get(ctx: Ctx): Promise<ItemOnboardingDto> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    return onboardingRowToDto(aggregate.row);
  }

  /**
   * Create the onboarding row and run the extraction.
   *
   * **The one method in this codebase that deliberately awaits a model call in
   * a turn.** §8.5 sanctions it here and in `PlaceCreationActor` and nowhere
   * else, because the user is sitting in front of a spinner waiting for the
   * answer; the cost is bounded to this onboarding id.
   *
   * Idempotent on `this.key` (§8.4): a retry after a completed extraction
   * returns the stored defaults without calling the model again. A retry after
   * a *failed* one re-runs it, which is the point of retrying.
   *
   * Both label ids go through `requireVerifiedFile` first — see the comment at
   * the check for why, and §8.5 for why an entity actor may call `FileActor`.
   */
  async start(
    ctx: Ctx,
    input: StartOnboardingInput,
  ): Promise<ItemOnboardingDto> {
    requireUuid(this.key, "onboardingId");
    const userId = ctx.viewerId;
    if (userId === null) {
      throw new ForbiddenError("sign in to start an item onboarding");
    }
    if (!isItemType(input.itemType)) {
      throw new ValidationError(`"${input.itemType}" is not an item type`);
    }

    const existing = this.aggregate;
    if (existing !== null) {
      await this.requireVisible(ctx, existing);
      if (
        existing.row.status === "COMPLETED" &&
        existing.row.defaults !== null
      ) {
        return onboardingRowToDto(existing.row);
      }
    }

    // E2f: the fourth instance of "never trust the client's done" (§4). Both
    // label ids are caller-supplied `files.id`s, and until this check they were
    // written to the row *and* handed to the vision seam on nothing but the
    // caller's word — so a signed-in user could name another user's photo and
    // have the model read it back to them, and a `files` row minted by
    // `createUploadTarget` with no bytes behind it produced a doomed extraction.
    // Shape first, because a non-uuid used to reach Postgres and surface as a
    // 500 instead of a `ValidationError`.
    //
    // The check sits after the idempotency return, like `MenuScanActor.create`:
    // a retry of a completed onboarding costs no sidecar hop. It sits *before*
    // the insert and before the provider call, and outside the `existing ===
    // null` branch, because the retry-after-FAILED path skips the insert but
    // still feeds `input`'s ids to the model.
    const frontLabelImageId =
      input.frontLabelImageId == null
        ? null
        : requireUuid(input.frontLabelImageId, "frontLabelImageId");
    const backLabelImageId =
      input.backLabelImageId == null
        ? null
        : requireUuid(input.backLabelImageId, "backLabelImageId");
    if (frontLabelImageId !== null) {
      await requireVerifiedFile(
        this.#verifyFile,
        ctx,
        frontLabelImageId,
        "an item onboarding",
      );
    }
    if (backLabelImageId !== null) {
      await requireVerifiedFile(
        this.#verifyFile,
        ctx,
        backLabelImageId,
        "an item onboarding",
      );
    }

    if (existing === null) {
      await this.tx(async (tx) => {
        await tx
          .insert(itemOnboardings)
          .values({
            id: this.key,
            userId,
            itemType: input.itemType,
            status: "START",
            barcode: input.barcode ?? null,
            barcodeType: input.barcodeType ?? null,
            frontLabelImageId,
            backLabelImageId,
          })
          .onConflictDoNothing({ target: itemOnboardings.id });
      });
      await this.reload();
    }

    const request: ItemDefaultsRequest = {
      itemType: input.itemType,
      frontLabelImageId,
      backLabelImageId,
      barcode: input.barcode ?? null,
      barcodeType: input.barcodeType ?? null,
    };

    let result: Awaited<ReturnType<ItemDefaultsProvider>>;
    try {
      // Outside `this.tx`, deliberately: a 30-second model call must not hold
      // a Postgres transaction open for its duration.
      result = await this.#defaultsProvider(ctx, request);
    } catch (error) {
      await this.tx(async (tx) => {
        await tx
          .update(itemOnboardings)
          .set({ status: "FAILED", updatedAt: new Date() })
          .where(eq(itemOnboardings.id, this.key));
      });
      await this.reload();
      throw error;
    }

    await this.tx(async (tx) => {
      await tx
        .update(itemOnboardings)
        .set({
          status: "COMPLETED",
          defaults: result.defaults,
          rawDefaults: result.raw,
          aiModel: result.model,
          confidence: result.confidence,
          updatedAt: new Date(),
        })
        .where(eq(itemOnboardings.id, this.key));
    });
    await this.reload();
    return onboardingRowToDto(this.requireAggregate().row);
  }

  /** The stored proposal. Never calls the model — that is `start`'s job. */
  async defaults(ctx: Ctx): Promise<ItemOnboardingDto> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    return onboardingRowToDto(aggregate.row);
  }

  /**
   * Turn an accepted proposal into an item — and, optionally, a brand link and
   * a cellar item.
   *
   * See the module doc for which of the four calls is synchronous and why, and
   * for why the minted ids are deterministic. The short-circuit below is the
   * fast path; the deterministic ids are what make correctness not depend on
   * it.
   */
  async confirm(
    ctx: Ctx,
    input: ConfirmOnboardingInput,
  ): Promise<ConfirmOnboardingResult> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);

    const itemType = onboardingRowToDto(aggregate.row).itemType;
    const name = input.name.trim();
    if (name.length === 0) {
      throw new ValidationError("item name must not be blank");
    }

    const itemId = requireUuid(
      input.itemId ?? derivedUuid(this.key, "item"),
      "itemId",
    );
    const item: ItemRef = { type: itemType, id: itemId };
    const cellarId =
      input.cellarId === undefined || input.cellarId === null
        ? null
        : requireUuid(input.cellarId, "cellarId");
    const cellarItemId =
      cellarId === null
        ? null
        : requireUuid(
            input.cellarItemId ??
              derivedUuid(this.key, `cellar-item:${cellarId}`),
            "cellarItemId",
          );

    // Only when the caller supplied one: the derived id is minted from
    // `this.key`, so it can only ever name this onboarding's own item.
    if (input.itemId !== undefined && input.itemId !== null) {
      await this.#requireItemNotAnotherUsers(item, aggregate.row.userId);
    }

    // E5a — **the cross-tenant hole.** `cellarId` is the caller's, and until
    // this line nothing had asked whose cellar it is. See
    // `#requireCellarWriteAccess` for why the check cannot live at the far end
    // of the outbox row it guards. It runs before the short-circuit below so
    // that a second `confirm` naming somebody else's cellar is refused rather
    // than answered with a derived `cellarItemId`.
    if (cellarId !== null) {
      await this.#requireCellarWriteAccess(cellarId, aggregate.row.userId);
    }

    // `item_onboardings.barcode` is the code as scanned or typed, kept beside
    // the `barcode_type` it was scanned as. What the item carries — and what
    // this returns, on both paths — is its canonical spelling, the key
    // `BarcodeActor` owns (`packages/contracts/src/barcodes.ts`); with the raw
    // one, an EAN-13 scan of a code registered as UPC-A would name a
    // `barcodes` row that does not exist.
    const barcode =
      aggregate.row.barcode === null
        ? null
        : barcodeActorId(aggregate.row.barcode, aggregate.row.barcodeType);

    // Already confirmed: return the same answer and enqueue nothing. The
    // deterministic ids above make this an optimisation rather than the
    // correctness boundary.
    if (aggregate.row.status === "CONFIRMED") {
      return {
        onboardingId: this.key,
        item,
        brandId:
          input.brandName === undefined || input.brandName === null
            ? null
            : (await this.#resolveBrand(ctx, input.brandName)).id,
        cellarItemId,
        barcode,
      };
    }

    // §8.5's synchronous allow-list, both find-or-create and therefore safe to
    // repeat. Done before the transaction because both are remote calls.
    if (barcode !== null) {
      await this.#ensureBarcode(ctx, barcode, aggregate.row.barcodeType);
    }
    const brandId =
      input.brandName === undefined ||
      input.brandName === null ||
      input.brandName.trim().length === 0
        ? null
        : (await this.#resolveBrand(ctx, input.brandName)).id;

    const createPayload: CreateItemInput = {
      name,
      description: input.description ?? null,
      country: input.country ?? null,
      barcodeCode: barcode,
      itemOnboardingId: this.key,
      // `create` runs as `system` from the outbox, and a system call has no
      // viewer to attribute the row to — hence `createdById` on the payload.
      createdById: aggregate.row.userId,
      [ITEM_ATTRIBUTE_KEY[itemType]]: input.attributes ?? {},
    };

    /**
     * A7c (1) — **the validation has to happen here, not only in
     * `ItemActor.create`.**
     *
     * `create` is reached through the outbox (§8.5: entity → entity), so a
     * `NOT NULL` violation raised inside it is raised during *delivery*: this
     * method has already returned success, the row retries for ~17 minutes and
     * dead-letters where only Grafana looks, and the item never appears.
     * `requireItemAttributes` is the same check `create` runs, run against the
     * payload we are about to enqueue, before the transaction opens — so the
     * caller gets a `ValidationError` naming the field it left out.
     */
    requireItemAttributes(itemType, createPayload);

    await this.tx(async (tx) => {
      await tx
        .update(itemOnboardings)
        .set({ status: "CONFIRMED", updatedAt: new Date() })
        .where(eq(itemOnboardings.id, this.key));

      // §1.4: the status change and every follow-up commit together. Order is
      // `outbox.seq` (A7b), so the first attempts run create → linkBrand →
      // addItem; a retry that overtakes fails on the foreign key and is
      // retried, which is the contract, not a bug.
      await enqueueOutbox(
        tx,
        OUTBOX_TARGETS["ItemActor.create"],
        {
          targetId: itemActorId(item),
          payload: createPayload,
        },
        { attributeTo: ctx },
      );
      if (brandId !== null) {
        await enqueueOutbox(
          tx,
          OUTBOX_TARGETS["ItemActor.linkBrand"],
          {
            targetId: itemActorId(item),
            payload: { brandId, isPrimary: true },
          },
          { attributeTo: ctx },
        );
      }
      if (cellarId !== null && cellarItemId !== null) {
        await enqueueOutbox(
          tx,
          OUTBOX_TARGETS["CellarActor.addItem"],
          {
            targetId: cellarId,
            payload: {
              item: { type: item.type, id: item.id },
              cellarItemId,
              createdBy: aggregate.row.userId,
              // `cellar_item_source`'s allowed values (contracts
              // `CELLAR_ITEM_SOURCES`) have no "onboarding" member; the
              // onboarding flow is the manual add path.
              sourceType: "manual",
            },
          },
          { attributeTo: ctx },
        );
      }
    });
    await this.reload();

    return {
      onboardingId: this.key,
      item,
      brandId,
      cellarItemId,
      barcode,
    };
  }

  /**
   * `system`; called by `OnboardingReprocessJobActor` (C4) to re-run an
   * extraction whose model or prompt has since improved.
   *
   * Idempotent on `input.idempotencyKey` (§8.4): the key is recorded in
   * `last_reprocess_result`, and a second call with the same key is a read.
   * `OnboardingReprocessJobActor` derives it from its own delivery
   * (`idempotencyKey(ctx, …, onboardingId)`) and passes it explicitly: this
   * method is reached through the typed client, which strips the caller's
   * `delivery` (`lib/delivery.ts`), so it has no delivery of its own to key
   * on. Without a key — an admin repairing a row by hand — every call runs.
   *
   * No `requireVerifiedFile` here, deliberately. This method accepts no file
   * id: it re-reads the two the row already holds, and `start` is the only
   * writer of those columns and now verifies them before writing. Re-checking
   * would also be checked against a `system` ctx, which bypasses the uploader
   * half and so proves nothing the write path did not already prove.
   */
  async reprocess(
    ctx: Ctx,
    input: Record<string, unknown> = {},
  ): Promise<ReprocessResult> {
    // The caller first: a real id and a made-up one answer an ordinary
    // caller the same `Forbidden`.
    const aggregate = this.requirePrivilegedAggregate(
      ctx,
      `only a system or admin caller may reprocess onboarding ${this.key}`,
    );

    const deliveryId =
      input.idempotencyKey === undefined
        ? randomUUID()
        : requireUuid(String(input.idempotencyKey), "idempotencyKey");
    const previous = aggregate.row.lastReprocessResult as {
      deliveryId?: unknown;
    } | null;
    if (previous?.deliveryId === deliveryId) {
      return {
        onboardingId: this.key,
        reprocessed: false,
        reason: "this outbox row has already been delivered",
      };
    }

    const dto = onboardingRowToDto(aggregate.row);
    const request: ItemDefaultsRequest = {
      itemType: dto.itemType,
      frontLabelImageId: aggregate.row.frontLabelImageId,
      backLabelImageId: aggregate.row.backLabelImageId,
      barcode: aggregate.row.barcode,
      barcodeType: aggregate.row.barcodeType,
    };

    let result: Awaited<ReturnType<ItemDefaultsProvider>>;
    try {
      result = await this.#defaultsProvider(ctx, request);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.tx(async (tx) => {
        await tx
          .update(itemOnboardings)
          .set({
            lastReprocessResult: {
              deliveryId,
              status: "failed",
              reason,
              at: new Date().toISOString(),
              reprocessRequestedBy: String(input.requestedBy ?? "system"),
            },
            updatedAt: new Date(),
          })
          .where(eq(itemOnboardings.id, this.key));
      });
      await this.reload();
      throw error;
    }

    await this.tx(async (tx) => {
      await tx
        .update(itemOnboardings)
        .set({
          status: "COMPLETED",
          defaults: result.defaults,
          rawDefaults: result.raw,
          aiModel: result.model,
          confidence: result.confidence,
          lastReprocessResult: {
            deliveryId,
            status: "updated",
            model: result.model,
            at: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(itemOnboardings.id, this.key));
    });
    await this.reload();

    return {
      onboardingId: this.key,
      reprocessed: true,
      reason: `re-extracted with ${result.model}`,
    };
  }
}
