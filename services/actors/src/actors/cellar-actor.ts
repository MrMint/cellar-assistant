/**
 * `CellarActor` — B1 (migration plan §2.1, §3).
 *
 * Owns `cellars`, `cellar_owners`, `cellar_items` and `check_ins`, and loads
 * all four on activate: §2.1's "the cellar row, owners, all `cellar_items` (a
 * cellar is small enough to hold), and `check_ins` for those items". That
 * sentence is load-bearing rather than descriptive — because the whole
 * aggregate is in memory, `items` and `checkIns` sort and page the cached
 * list with `offsetPage` instead of issuing a keyset query per call, and
 * `semanticQuery` becomes a *re-sort* of that same list rather than a
 * different query.
 *
 * ## The four-branch rule, and where it does and does not apply
 *
 * `get`, `items` and `checkIns` all call `canSeeCellar`
 * (`@cellar-assistant/policy`): owner (creator or co-owner), or PUBLIC, or
 * FRIENDS-and-a-friend-of-the-creator, else hidden. `requireAggregate()` runs
 * first, so a viewer who may not see the cellar and a cellar that does not
 * exist are both `NotFoundError` and indistinguishable.
 *
 * Writes are not one rule but two, matching the Hasura permissions they
 * replace (`nhost/metadata/databases/default/tables/public_cellars.yaml` and
 * `public_cellar_owners.yaml`):
 *
 * - **creator or co-owner** may rename, re-privacy, and add/change/remove
 *   items;
 * - **the creator alone** may change the co-owner set, or delete the cellar.
 *   `cellar_owners`' insert permission today is `cellar.created_by_id = me`,
 *   so a co-owner has never been able to recruit further co-owners, and that
 *   is worth keeping: it is the difference between sharing a cellar and
 *   giving away control of who can see it.
 *
 * ## §1.6's open decision, resolved: `checkIns` is gated on the *cellar*
 *
 * §1.6 records §2.1 and §2.2 disagreeing about check-in visibility, and asks
 * B1 to settle it. They are two different surfaces and they want two
 * different rules:
 *
 * - **This method is cellar-scoped.** It is reached by naming a cellar id and
 *   it answers "what has happened in this cellar". Serving it to a viewer who
 *   cannot see the cellar makes the cellar id an oracle: page the check-ins
 *   and you learn that a PRIVATE cellar exists, that it is active, and a set
 *   of `cellarItemId`s belonging to it. A private collection whose contents
 *   are enumerable through a side door is not private. So `checkIns` is
 *   `canSeeCellar`, exactly as §2.1 says — and the same rule as `get` and
 *   `items`, which is the only way the four-branch rule stays checkable.
 * - **§2.2's `CheckInsCollectionActor` is item-scoped** (C3). It is reached
 *   by naming an *item*, never a cellar; its answer names the drinker and
 *   never the cellar. `canSeeCheckIn`'s author-or-friend-of-author branch
 *   belongs there, and A4's reading of it stands untouched.
 *
 * So the product behaviour §1.6 worried about — "a friend can see that you
 * drank something without seeing the private cellar it came from" — survives
 * on the item page, where it was always meant to live, and is refused on the
 * cellar page, where it leaks. `canSeeCheckIn` is not wrong; it was attached
 * to the wrong method.
 *
 * One consequence worth naming: inside a cellar you *can* see, you see every
 * check-in, including a co-owner's, whether or not you are their friend. The
 * Hasura rule could not express that (it gated on friendship alone, with no
 * cellar branch at all), so co-owners could not see each other's check-ins.
 * The cellar is the unit of sharing; that is the point of co-ownership.
 *
 * ## Idempotency (§8.4)
 *
 * `cellar_items` and `check_ins` have no natural unique constraint — two
 * bottles of the same wine, or two drinks from the same bottle, are two
 * legitimate rows — so the only thing that can recognise a redelivery is the
 * row id. `addItem` and `checkIn` therefore take one from the caller.
 * `addItem` alone falls back to `idempotencyKey(ctx, …)` (`lib/delivery.ts`),
 * derived from the delivery `OutboxActor` minted and so stable across its
 * at-least-once redeliveries — and null for anything but a genuine delivery,
 * so a request cannot pick its own row ids. `addItem` is the method B2's
 * `ItemOnboardingActor.confirm` calls (§2.1), so this is where its
 * "re-delivered twice … one cellar item" acceptance is actually paid for.
 * `checkIn` is no outbox target, and `forwardCtx` strips `delivery` from
 * every onward call, so a delivery key could never reach it: without a
 * caller's id it mints a random one, and a retry is a second check-in.
 *
 * ## No outbox row is written here
 *
 * Deliberately, and it is a finding rather than an omission: §2.1 lists no
 * `(system, outbox)` method for this aggregate, none of its four tables has
 * an event trigger today, and its one cross-actor dependency —
 * `EmbeddingActor` for semantic sort — is the single synchronous entity →
 * search call §8.5 allows. This actor is an outbox *target*, not a source.
 */
import { randomUUID } from "node:crypto";
import type {
  ActorCategory,
  AddCellarItemInput,
  CappedList,
  CellarActorInterface,
  CellarDto,
  CellarItemDto,
  CellarItemSort,
  CellarItemSource,
  CellarItemStatus,
  CellarItemsArgs,
  CheckInDto,
  CreateCellarInput,
  Ctx,
  DeletedCellar,
  ItemRef,
  ItemType,
  ItemTypeCountsDto,
  Page,
  PageArgs,
  PermissionType,
  RemovedCellarItem,
  UpdateCellarInput,
  UpdateCellarItemInput,
} from "@cellar-assistant/contracts";
import {
  CellarActorDescriptor,
  ConflictError,
  ForbiddenError,
  ITEM_TYPES,
  isCellarItemSource,
  isItemType,
  NotFoundError,
  offsetPage,
  REVERSE_EDGE_CAP,
  requireReverseEdgeBatch,
  ValidationError,
} from "@cellar-assistant/contracts";
import {
  cellarItems,
  cellarOwners,
  cellars,
  checkIns,
} from "@cellar-assistant/db";
import { and, eq, inArray, sql } from "@cellar-assistant/db/orm";
import {
  bypassesPolicy,
  canSeeCellar,
  isFriend,
  isOwner,
} from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { EntityActorBase } from "../lib/actor-base.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { idempotencyKey } from "../lib/delivery.ts";
import { daprEmbedQuery, type EmbedQuery } from "../lib/embedding-client.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { itemNames } from "../lib/item-names.ts";
import { requireUuid } from "../lib/uuid.ts";
import { vectorDistances } from "../lib/vectors.ts";
import {
  type CellarAccess,
  cellarVisibility,
  friendshipsOf,
  isCellarOwner,
} from "../lib/visibility.ts";

type CellarRow = typeof cellars.$inferSelect;
type CellarItemRow = typeof cellarItems.$inferSelect;
type CheckInRow = typeof checkIns.$inferSelect;

export type CellarAggregate = {
  readonly cellar: CellarRow;
  /** `cellar_owners.user_id`; the creator is not among them. */
  readonly coOwnerIds: readonly string[];
  /** Every row, newest first. §2.1: a cellar is small enough to hold. */
  readonly items: readonly CellarItemRow[];
  /** Every check-in on those items, newest first. */
  readonly checkIns: readonly CheckInRow[];
};

/** What `../lib/visibility.ts` decides a cellar's visibility and ownership from. */
const access = (aggregate: CellarAggregate): CellarAccess => ({
  createdById: aggregate.cellar.createdById,
  privacy: aggregate.cellar.privacy,
  coOwnerIds: aggregate.coOwnerIds,
});

/**
 * You drank it with a table, not a stadium. Also `MAX_PAGE_SIZE`, so the
 * resolver can hand the written rows straight back as one page.
 */
const MAX_BULK_CHECK_IN = 100;

/** `cellar_items`' item arc (`../lib/item-arcs.ts`). */
const ITEMS = ARCS.cellarItems;

/** The item a row holds. "Ensure exactly one item Id" makes a miss impossible. */
const itemRefOf = (row: CellarItemRow): ItemRef => ITEMS.requireRefOf(row);

const iso = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

const requiredIso = (value: Date): string => value.toISOString();

const sourceTypeOf = (value: string | null): CellarItemSource | null =>
  value !== null && isCellarItemSource(value) ? value : null;

export class CellarActor
  extends EntityActorBase<CellarAggregate>
  implements CellarActorInterface
{
  static readonly category: ActorCategory = CellarActorDescriptor.category;

  /**
   * §8.5's one sanctioned synchronous entity → search call: `EmbeddingActor`,
   * through the shared adapter in `../lib/embedding-client.ts`. Injected, as
   * `FileActor`'s binding is, because the no-Dapr test harness has no
   * sidecar. The key it addresses (`embeddingActorId`, in contracts) has the
   * viewer deliberately *not* in the hash — the embedding of a phrase is the
   * same for everyone.
   */
  readonly #embed: EmbedQuery;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    embed: EmbedQuery = daprEmbedQuery,
  ) {
    super(daprClient, id, db);
    this.#embed = embed;
  }

  protected async loadAggregate(id: string): Promise<CellarAggregate | null> {
    const [cellar] = await this.db
      .select()
      .from(cellars)
      .where(eq(cellars.id, id));
    if (cellar === undefined) return null;

    const owners = await this.db
      .select({ userId: cellarOwners.userId })
      .from(cellarOwners)
      .where(eq(cellarOwners.cellarId, id));

    const items = await this.db
      .select()
      .from(cellarItems)
      .where(eq(cellarItems.cellarId, id))
      .orderBy(sql`${cellarItems.createdAt} desc, ${cellarItems.id} desc`);

    const itemIds = items.map((item) => item.id);
    const checkInRows =
      itemIds.length === 0
        ? []
        : await this.db
            .select()
            .from(checkIns)
            .where(inArray(checkIns.cellarItemId, itemIds))
            .orderBy(sql`${checkIns.createdAt} desc, ${checkIns.id} desc`);

    return {
      cellar,
      coOwnerIds: owners.map((owner) => owner.userId),
      items,
      checkIns: checkInRows,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Reads                                                                   */
  /* ---------------------------------------------------------------------- */

  async get(ctx: Ctx): Promise<CellarDto> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    return this.#toDto(aggregate);
  }

  /**
   * §2.1: `items(page, sort?, semanticQuery?)`. Sorting and paging happen over
   * the cached list, which is stable for the turn (`reload()` runs after every
   * write), so the offset cursor means the same thing on the next page.
   */
  async items(ctx: Ctx, args: CellarItemsArgs): Promise<Page<CellarItemDto>> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);

    // G2: filter before sorting and paging, so `totalCount` and the offset
    // cursor both describe the filtered list rather than short-paging it.
    const rows = filtered(aggregate.items, args.types, args.status);
    const query = args.semanticQuery?.trim();
    const dtos =
      query === undefined || query === ""
        ? await this.#sorted(rows, args.sort)
        : await this.#semanticallySorted(ctx, rows, query);

    return offsetPage(dtos, args.page);
  }

  async checkIns(ctx: Ctx, page: PageArgs): Promise<Page<CheckInDto>> {
    const aggregate = this.requireAggregate();
    // The §1.6 decision, in one line. See the module doc.
    await this.requireVisible(ctx, aggregate);
    return offsetPage(aggregate.checkIns.map(toCheckInDto), page);
  }

  /**
   * UI parity G10: one bottle, by `cellar_items.id` — the old URL's meaning
   * (decision 1). Visibility first, then the lookup, so a bottle in a cellar
   * the viewer cannot see is the same `NotFoundError` as a missing one.
   */
  async item(ctx: Ctx, cellarItemId: string): Promise<CellarItemDto> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    return toItemDto(this.#requireItem(cellarItemId), null);
  }

  /**
   * UI parity G10's redirect for a link carrying a catalog item id. Exactly
   * one non-empty bottle of the item → it; none non-empty and exactly one
   * emptied → that; anything else (two bottles, or none) → `null`, and the
   * client goes to the item page (decision 1).
   */
  async bottleFor(ctx: Ctx, item: ItemRef): Promise<CellarItemDto | null> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    if (!isItemType(item.type)) {
      throw new ValidationError(`not an item type: ${String(item.type)}`);
    }
    const wanted = String(item.id).toLowerCase();
    const bottles = aggregate.items.filter((row) => {
      const ref = itemRefOf(row);
      return ref.type === item.type && ref.id === wanted;
    });
    const active = bottles.filter((row) => row.emptyAt === null);
    const pool = active.length > 0 ? active : bottles;
    const [only, ...more] = pool;
    return only === undefined || more.length > 0 ? null : toItemDto(only, null);
  }

  /**
   * UI parity G14: per-bottle check-ins from the cached aggregate, gated as
   * `checkIns` is. One call answers every bottle a page shows.
   */
  async checkInsOf(
    ctx: Ctx,
    cellarItemIds: readonly string[],
  ): Promise<readonly CappedList<CheckInDto>[]> {
    requireReverseEdgeBatch(cellarItemIds, "checkInsOf cellarItemIds");
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    return cellarItemIds.map((cellarItemId) => {
      const wanted = String(cellarItemId).toLowerCase();
      // `aggregate.checkIns` is newest first already (`loadAggregate`).
      const rows = aggregate.checkIns.filter(
        (row) => row.cellarItemId === wanted,
      );
      return {
        nodes: rows.slice(0, REVERSE_EDGE_CAP).map(toCheckInDto),
        totalCount: rows.length,
      };
    });
  }

  /* ---------------------------------------------------------------------- */
  /* The cellar itself                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * The caller mints `cellarId` and addresses `CellarActor(cellarId)` before
   * any row exists — the same provisional-id pattern as `FileActor` (§2.1).
   */
  async create(ctx: Ctx, input: CreateCellarInput): Promise<CellarDto> {
    const creator = ctx.viewerId;
    if (creator === null) {
      throw new ForbiddenError("sign in to create a cellar");
    }
    if (this.aggregate !== null) {
      throw new ConflictError(`cellar ${this.key} already exists`);
    }
    const name = requireName(input.name);
    const coOwnerIds = normaliseOwners(input.coOwnerIds ?? [], creator);

    await this.tx(async (tx) => {
      await tx.insert(cellars).values({
        id: this.key,
        name,
        createdById: creator,
        ...(input.privacy === undefined ? {} : { privacy: input.privacy }),
      });
      if (coOwnerIds.length > 0) {
        await tx
          .insert(cellarOwners)
          .values(coOwnerIds.map((userId) => ({ cellarId: this.key, userId })));
      }
    });
    await this.reload();
    return this.#toDto(this.requireAggregate());
  }

  /**
   * §2.1: "replaces the delete-all/re-insert owner pattern with a set diff in
   * one transaction".
   *
   * The header write and both halves of the owner diff are one `this.tx()`, so
   * a co-owner id that does not resolve (the FK rejects it) rolls the rename
   * back with it. Nothing here pre-checks that a co-owner exists: the foreign
   * key is the check, and a `select` first would only be a TOCTOU race with a
   * friendlier message.
   */
  async update(ctx: Ctx, input: UpdateCellarInput): Promise<CellarDto> {
    const aggregate = this.requireAggregate();
    await this.#requireOwner(ctx, aggregate);

    const header: { name?: string; privacy?: PermissionType } = {};
    if (input.name !== undefined) header.name = requireName(input.name);
    if (input.privacy !== undefined) header.privacy = input.privacy;

    let diff: { added: string[]; removed: string[] } | null = null;
    if (input.coOwnerIds !== undefined) {
      const next = new Set(
        normaliseOwners(input.coOwnerIds, aggregate.cellar.createdById),
      );
      const current = new Set(aggregate.coOwnerIds);
      const added = [...next].filter((id) => !current.has(id));
      const removed = [...current].filter((id) => !next.has(id));
      // The edit form always sends the whole owner set, so a co-owner who only
      // renamed the cellar sends the set unchanged. That is not a change of
      // owners and needs no creator: refusing it made the form unsavable for
      // every co-owner. Any real change — one id added or removed — still
      // does (module doc: only the creator decides who can see the cellar).
      if (added.length > 0 || removed.length > 0) {
        await this.#requireCreator(ctx, aggregate, "change a cellar's owners");
        diff = { added, removed };
      }
    }

    if (Object.keys(header).length === 0 && diff === null) {
      return this.#toDto(aggregate);
    }

    await this.tx(async (tx) => {
      if (Object.keys(header).length > 0) {
        await tx
          .update(cellars)
          .set({ ...header, updatedAt: new Date() })
          .where(eq(cellars.id, this.key));
      }
      if (diff !== null && diff.removed.length > 0) {
        await tx
          .delete(cellarOwners)
          .where(
            and(
              eq(cellarOwners.cellarId, this.key),
              inArray(cellarOwners.userId, diff.removed),
            ),
          );
      }
      if (diff !== null && diff.added.length > 0) {
        await tx
          .insert(cellarOwners)
          .values(diff.added.map((userId) => ({ cellarId: this.key, userId })));
      }
    });
    await this.reload();
    return this.#toDto(this.requireAggregate());
  }

  /**
   * Creator only, and refuses a cellar that still holds items.
   *
   * Every foreign key into `cellars` and `cellar_items` is `ON DELETE
   * RESTRICT`, so a cascading delete would have to be written out by hand
   * here — and a single call that silently removes a collection, its history
   * and its co-owners is a footgun, not a feature. It would also be unbounded,
   * which §1.5 forbids: emptying a thousand-bottle cellar is a job actor's
   * work, not a request turn's.
   */
  async delete(ctx: Ctx): Promise<DeletedCellar> {
    const aggregate = this.requireAggregate();
    await this.#requireCreator(ctx, aggregate, "delete a cellar");
    if (aggregate.items.length > 0) {
      throw new ConflictError(
        `cellar ${this.key} still holds ${aggregate.items.length} item(s); ` +
          "remove them first",
      );
    }

    await this.tx(async (tx) => {
      await tx.delete(cellarOwners).where(eq(cellarOwners.cellarId, this.key));
      await tx.delete(cellars).where(eq(cellars.id, this.key));
    });
    this.setAggregate(null);
    return { id: this.key };
  }

  /* ---------------------------------------------------------------------- */
  /* Items                                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * §8.4: the row id **is** the idempotency key. A re-delivered call with the
   * same `cellarItemId` (or the same outbox row id) returns the existing row
   * and writes nothing.
   */
  async addItem(ctx: Ctx, input: AddCellarItemInput): Promise<CellarItemDto> {
    const aggregate = this.requireAggregate();
    await this.#requireOwner(ctx, aggregate);

    const createdBy = bypassesPolicy(ctx)
      ? (input.createdBy ?? ctx.viewerId)
      : ctx.viewerId;
    if (createdBy === null || createdBy === undefined) {
      throw new ValidationError(
        "addItem needs a creator: sign in, or pass `createdBy` on a system call",
      );
    }
    const itemId = requireUuid(input.item.id, "item.id");
    const cellarItemId = requireUuid(
      input.cellarItemId ??
        idempotencyKey(ctx, "CellarActor.addItem:cellar-item") ??
        randomUUID(),
      "cellarItemId",
    );

    const existing = aggregate.items.find((row) => row.id === cellarItemId);
    if (existing !== undefined) return toItemDto(existing, null);

    const percentage =
      input.percentageRemaining === undefined
        ? 100
        : requirePercentage(input.percentageRemaining);

    await this.tx(async (tx) => {
      await tx
        .insert(cellarItems)
        .values({
          id: cellarItemId,
          cellarId: this.key,
          createdBy,
          ...ITEMS.values({ type: input.item.type, id: itemId }),
          percentageRemaining: percentage,
          displayImageId: input.displayImageId ?? null,
          openAt: parseInstant(input.openAt, "openAt"),
          emptyAt: parseInstant(input.emptyAt, "emptyAt"),
          sourceType: input.sourceType ?? null,
          sourcePlaceId: input.sourcePlaceId ?? null,
          sourceMenuItemId: input.sourceMenuItemId ?? null,
        })
        // Belt and braces for a redelivery racing itself: the pre-check above
        // reads the activation's cache, this reads Postgres.
        .onConflictDoNothing({ target: cellarItems.id });
    });
    await this.reload();
    return toItemDto(this.#requireItem(cellarItemId), null);
  }

  async updateItem(
    ctx: Ctx,
    cellarItemId: string,
    input: UpdateCellarItemInput,
  ): Promise<CellarItemDto> {
    const aggregate = this.requireAggregate();
    await this.#requireOwner(ctx, aggregate);
    const { id } = this.#requireItem(cellarItemId);

    const patch: Partial<typeof cellarItems.$inferInsert> = {};
    if (input.percentageRemaining !== undefined) {
      patch.percentageRemaining = requirePercentage(input.percentageRemaining);
    }
    if (input.displayImageId !== undefined) {
      patch.displayImageId = input.displayImageId;
    }
    if (input.openAt !== undefined) {
      patch.openAt = parseInstant(input.openAt, "openAt");
    }
    if (input.emptyAt !== undefined) {
      patch.emptyAt = parseInstant(input.emptyAt, "emptyAt");
    }
    return this.#patchItem(id, patch);
  }

  async setItemPercentage(
    ctx: Ctx,
    cellarItemId: string,
    percentageRemaining: number,
  ): Promise<CellarItemDto> {
    const aggregate = this.requireAggregate();
    await this.#requireOwner(ctx, aggregate);
    const { id } = this.#requireItem(cellarItemId);
    return this.#patchItem(id, {
      percentageRemaining: requirePercentage(percentageRemaining),
    });
  }

  /** Idempotent: an already-open item keeps its original `open_at`. */
  async openItem(ctx: Ctx, cellarItemId: string): Promise<CellarItemDto> {
    const aggregate = this.requireAggregate();
    await this.#requireOwner(ctx, aggregate);
    const item = this.#requireItem(cellarItemId);
    if (item.openAt !== null) return toItemDto(item, null);
    return this.#patchItem(item.id, { openAt: new Date() });
  }

  /** Idempotent, and implies open: an empty bottle was opened at some point. */
  async emptyItem(ctx: Ctx, cellarItemId: string): Promise<CellarItemDto> {
    const aggregate = this.requireAggregate();
    await this.#requireOwner(ctx, aggregate);
    const item = this.#requireItem(cellarItemId);
    if (item.emptyAt !== null) return toItemDto(item, null);
    const now = new Date();
    return this.#patchItem(item.id, {
      emptyAt: now,
      openAt: item.openAt ?? now,
      percentageRemaining: 0,
    });
  }

  /**
   * Removes the item and the check-ins that point at it, in one transaction —
   * `check_ins.cellar_item_id` is `ON DELETE RESTRICT`, so the order is not a
   * preference.
   */
  async removeItem(ctx: Ctx, cellarItemId: string): Promise<RemovedCellarItem> {
    const aggregate = this.requireAggregate();
    await this.#requireOwner(ctx, aggregate);
    const { id } = this.#requireItem(cellarItemId);

    await this.tx(async (tx) => {
      await tx.delete(checkIns).where(eq(checkIns.cellarItemId, id));
      await tx.delete(cellarItems).where(eq(cellarItems.id, id));
    });
    await this.reload();
    return { id };
  }

  /* ---------------------------------------------------------------------- */
  /* Check-ins                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Requires the cellar to be *visible*, which the Hasura permission it
   * replaces did not check — `check_ins`' insert rule gated only on the
   * subject being the caller or a friend, so any `cellar_item_id` a client
   * could name was checkinnable. Drinking from a cellar you cannot see is not
   * a thing.
   */
  async checkIn(
    ctx: Ctx,
    requestedItemId: string,
    checkInId?: string,
  ): Promise<CheckInDto> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    const userId = ctx.viewerId;
    if (userId === null) throw new ForbiddenError("sign in to check in");
    const { id: cellarItemId } = this.#requireItem(requestedItemId);

    const id = requireUuid(checkInId ?? randomUUID(), "checkInId");
    const existing = aggregate.checkIns.find((row) => row.id === id);
    if (existing !== undefined) return toCheckInDto(existing);

    await this.tx(async (tx) => {
      await tx
        .insert(checkIns)
        .values({ id, userId, cellarItemId })
        .onConflictDoNothing({ target: checkIns.id });
    });
    await this.reload();
    const written = this.requireAggregate().checkIns.find(
      (row) => row.id === id,
    );
    if (written === undefined) {
      throw new ConflictError(`check-in ${id} was not written`);
    }
    return toCheckInDto(written);
  }

  /**
   * §2.1: "rows written on behalf of friends; friend check in policy". Every
   * id must be the caller or a friend of the caller; one that is not rejects
   * the whole call before the transaction opens, so there is no partial write.
   */
  async bulkCheckIn(
    ctx: Ctx,
    requestedItemId: string,
    userIds: readonly string[],
  ): Promise<readonly CheckInDto[]> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    const viewer = ctx.viewerId;
    if (viewer === null) throw new ForbiddenError("sign in to check in");
    const { id: cellarItemId } = this.#requireItem(requestedItemId);
    if (!Array.isArray(userIds)) {
      throw new ValidationError("bulkCheckIn takes a list of user ids");
    }

    // Canonical before the dedupe and before the friend check, both of which
    // compare strings: an uppercase copy of your own id, or of a friend's,
    // used to count as a second person and fail as "not a friend".
    const unique = [
      ...new Set(userIds.map((userId) => requireUuid(userId, "userIds[]"))),
    ];
    if (unique.length === 0) {
      throw new ValidationError("bulkCheckIn needs at least one user id");
    }
    if (unique.length > MAX_BULK_CHECK_IN) {
      throw new ValidationError(
        `bulkCheckIn takes at most ${MAX_BULK_CHECK_IN} user ids, got ${unique.length}`,
      );
    }
    const friendships = await friendshipsOf(this.db, viewer);
    for (const userId of unique) {
      if (userId === viewer) continue;
      if (isFriend(ctx, userId, friendships)) continue;
      throw new ForbiddenError(
        `cannot check in on behalf of ${userId}: not a friend`,
      );
    }

    const rows = unique.map((userId) => ({
      id: randomUUID(),
      userId,
      cellarItemId,
    }));
    await this.tx(async (tx) => {
      await tx.insert(checkIns).values(rows);
    });
    await this.reload();
    const written = new Map(
      this.requireAggregate().checkIns.map((row) => [row.id, row]),
    );
    return rows.map(({ id }) => {
      const row = written.get(id);
      if (row === undefined) {
        throw new ConflictError(`check-in ${id} was not written`);
      }
      return toCheckInDto(row);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * The four-branch rule (`packages/policy`), with the friendship read — of
   * `UserActor`'s table, fresh per turn — done by `../lib/visibility.ts`.
   * `requireVisible` / `requireAllowed` (the base class) turn a "no" into
   * `NotFound`, so absence and denial are indistinguishable.
   */
  protected override async canSee(
    ctx: Ctx,
    aggregate: CellarAggregate,
  ): Promise<boolean> {
    return canSeeCellar(
      ctx,
      await cellarVisibility(this.db, ctx, access(aggregate)),
    );
  }

  /** Creator or co-owner. */
  async #requireOwner(ctx: Ctx, aggregate: CellarAggregate): Promise<void> {
    await this.requireAllowed(
      ctx,
      bypassesPolicy(ctx) || isCellarOwner(access(aggregate), ctx.viewerId),
      `cellar ${this.key} is not yours to change`,
      aggregate,
    );
  }

  /**
   * Creator only — and, like `#requireOwner`, it refuses an invisible cellar
   * as *absent* rather than as forbidden (E5b).
   *
   * `delete` used to reach this helper straight off `requireAggregate()`, so
   * the two refusals were distinguishable: a stranger's cellar answered
   * `ForbiddenError("only the cellar's creator may delete a cellar")` while an
   * id that named no row answered `NotFoundError`. That difference is an
   * existence oracle — a signed-in caller could sweep ids and learn which ones
   * are real cellars, PRIVATE ones included, without being able to see any of
   * them. `#requireOwner` has always run `#requireVisible` first for exactly
   * this reason; this is the same guard on the narrower check.
   *
   * `ForbiddenError` survives where the caller can already see the cellar
   * (PUBLIC, or FRIENDS and a friend of the creator, or a co-owner): existence
   * is not a secret there, and "you are not the creator" is the useful answer.
   */
  async #requireCreator(
    ctx: Ctx,
    aggregate: CellarAggregate,
    what: string,
  ): Promise<void> {
    await this.requireAllowed(
      ctx,
      isOwner(ctx, aggregate.cellar.createdById),
      `only the cellar's creator may ${what}`,
      aggregate,
    );
  }

  /**
   * The cached row for a client-supplied id, compared **case-insensitively**:
   * `cellar_items.id` comes back from Postgres lowercase, and Postgres itself
   * would find the row by either spelling, so an uppercase copy of a real id
   * is that row. Callers take the row's own `id` from here rather than reusing
   * the argument, so what they write and return is the canonical spelling.
   * Not `requireUuid`: a string that is not a uuid at all is simply not in
   * this cellar, and has always answered `NotFound`.
   */
  #requireItem(cellarItemId: string): CellarItemRow {
    const wanted = String(cellarItemId).toLowerCase();
    const item = this.requireAggregate().items.find((row) => row.id === wanted);
    if (item === undefined) {
      throw new NotFoundError(
        `cellar_item ${cellarItemId} is not in cellar ${this.key}`,
      );
    }
    return item;
  }

  async #patchItem(
    cellarItemId: string,
    patch: Partial<typeof cellarItems.$inferInsert>,
  ): Promise<CellarItemDto> {
    await this.tx(async (tx) => {
      await tx
        .update(cellarItems)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(cellarItems.id, cellarItemId));
    });
    await this.reload();
    return toItemDto(this.#requireItem(cellarItemId), null);
  }

  /**
   * §2.1: "calls `EmbeddingActor` for the vector, then computes distances over
   * the cached items' vectors fetched via `ItemActor` or a direct read". A
   * direct read it is — `item_vectors` is `ItemActor`'s to *write*, and one
   * query beats six `ItemActor.get` round trips inside this turn.
   *
   * Items with no vector sort last rather than disappearing: a semantic sort
   * is an ordering, not a filter, and dropping an un-embedded bottle out of
   * its owner's own cellar list would look like data loss.
   */
  async #semanticallySorted(
    ctx: Ctx,
    rows: readonly CellarItemRow[],
    query: string,
  ): Promise<CellarItemDto[]> {
    const refs = rows.map(itemRefOf);
    const [distances, names] = await Promise.all([
      this.#embed(ctx, query).then((vector) =>
        vectorDistances(this.db, refs, vector),
      ),
      // G3: the old page broke distance ties by name (`ascend(distance)`, then
      // `ascend(name)`) — which matters most for the un-embedded tail, whose
      // distances are all "infinite".
      itemNames(this.db, refs),
    ]);

    return rows
      .map((row) => toItemDto(row, distances.get(itemRefOf(row).id) ?? null))
      .sort(
        (a, b) =>
          (a.distance ?? Number.POSITIVE_INFINITY) -
            (b.distance ?? Number.POSITIVE_INFINITY) || byName(names)(a, b),
      );
  }

  /**
   * The non-semantic orderings. `NAME_ASC` (G3) is the one that needs data
   * this actor does not hold: names are `ItemActor`'s columns, so they are
   * read fresh for this call (§1.3: cache only what you write) and only when
   * asked for — every other sort stays a pure re-sort of the cached rows.
   */
  async #sorted(
    rows: readonly CellarItemRow[],
    sort: CellarItemSort | null | undefined,
  ): Promise<CellarItemDto[]> {
    const dtos = rows.map((row) => toItemDto(row, null));
    if (sort !== "NAME_ASC") return sorted(dtos, sort);
    const names = await itemNames(this.db, rows.map(itemRefOf));
    return dtos.sort(byName(names));
  }

  #toDto(aggregate: CellarAggregate): CellarDto {
    return {
      id: aggregate.cellar.id,
      name: aggregate.cellar.name,
      privacy: aggregate.cellar.privacy,
      createdById: aggregate.cellar.createdById,
      coOwnerIds: aggregate.coOwnerIds,
      itemCount: aggregate.items.length,
      itemCounts: activeCounts(aggregate.items),
      createdAt: requiredIso(aggregate.cellar.createdAt),
      updatedAt: requiredIso(aggregate.cellar.updatedAt),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                                */
/* -------------------------------------------------------------------------- */

const toItemDto = (
  row: CellarItemRow,
  distance: number | null,
): CellarItemDto => ({
  id: row.id,
  cellarId: row.cellarId,
  createdBy: row.createdBy,
  item: itemRefOf(row),
  openAt: iso(row.openAt),
  emptyAt: iso(row.emptyAt),
  // `numeric` with `mode: 'number'`, so Drizzle has already parsed it — the
  // `Number(...)` is for the day someone flips that mode back.
  percentageRemaining: Number(row.percentageRemaining),
  displayImageId: row.displayImageId,
  sourceType: sourceTypeOf(row.sourceType),
  sourcePlaceId: row.sourcePlaceId,
  sourceMenuItemId: row.sourceMenuItemId,
  distance,
  createdAt: requiredIso(row.createdAt),
  updatedAt: requiredIso(row.updatedAt),
});

const toCheckInDto = (row: CheckInRow): CheckInDto => ({
  id: row.id,
  userId: row.userId,
  cellarItemId: row.cellarItemId,
  createdAt: requiredIso(row.createdAt),
  updatedAt: requiredIso(row.updatedAt),
});

/**
 * G1: non-empty bottles per type — the old card's
 * `items_aggregate(where: {empty_at: {_is_null: true}})` with one
 * `count(columns: [<type>_id])` per type. Bottles, not distinct items.
 */
const activeCounts = (rows: readonly CellarItemRow[]): ItemTypeCountsDto => {
  const byType = Object.fromEntries(
    ITEM_TYPES.map((type) => [type, 0]),
  ) as Record<ItemType, number>;
  let total = 0;
  for (const row of rows) {
    if (row.emptyAt !== null) continue;
    byType[itemRefOf(row).type] += 1;
    total += 1;
  }
  return { total, byType };
};

/**
 * G2's two filters. An unknown type or status is a `ValidationError` rather
 * than an empty page: the API's enums make one unreachable from GraphQL, so
 * only a malformed direct call can send it, and silence would hide the bug.
 */
const filtered = (
  rows: readonly CellarItemRow[],
  types: readonly ItemType[] | null | undefined,
  status: CellarItemStatus | null | undefined,
): readonly CellarItemRow[] => {
  const wanted =
    types === null || types === undefined || types.length === 0
      ? null
      : new Set(
          types.map((type) => {
            if (typeof type !== "string" || !isItemType(type)) {
              throw new ValidationError(`not an item type: ${String(type)}`);
            }
            return type;
          }),
        );
  const state = status ?? "ACTIVE";
  if (state !== "ACTIVE" && state !== "EMPTY" && state !== "ALL") {
    throw new ValidationError(`not a cellar item status: ${String(state)}`);
  }
  return rows.filter(
    (row) =>
      (wanted === null || wanted.has(itemRefOf(row).type)) &&
      (state === "ALL" ||
        (state === "ACTIVE" ? row.emptyAt === null : row.emptyAt !== null)),
  );
};

/**
 * G3: case-insensitive by name, then by row id so equal names (two bottles of
 * one wine) keep a stable order across pages. An item whose row vanished
 * between the cellar load and this read has no name and sorts last.
 */
const byName =
  (names: ReadonlyMap<string, string>) =>
  (a: CellarItemDto, b: CellarItemDto): number => {
    const left = names.get(a.item.id);
    const right = names.get(b.item.id);
    if (left === undefined || right === undefined) {
      if (left !== right) return left === undefined ? 1 : -1;
    } else {
      const byText = left.localeCompare(right, "en", { sensitivity: "base" });
      if (byText !== 0) return byText;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };

/** `loadAggregate` already returns newest-first, which is `ADDED_DESC`. */
const sorted = (
  items: readonly CellarItemDto[],
  sort: CellarItemSort | null | undefined,
): CellarItemDto[] => {
  const copy = [...items];
  switch (sort ?? "ADDED_DESC") {
    case "ADDED_DESC":
      return copy;
    case "ADDED_ASC":
      return copy.reverse();
    case "PERCENTAGE_ASC":
      return copy.sort((a, b) => a.percentageRemaining - b.percentageRemaining);
    case "PERCENTAGE_DESC":
      return copy.sort((a, b) => b.percentageRemaining - a.percentageRemaining);
    case "OPEN_FIRST":
      // Open (and not finished) first, then unopened, then empty; newest
      // first inside each group, which `copy` already is.
      return copy.sort((a, b) => openRank(a) - openRank(b));
    case "NAME_ASC":
      // Needs names, which `#sorted` reads before it gets here; reaching this
      // arm means a caller skipped that, so say so rather than guess.
      throw new Error("NAME_ASC is sorted by CellarActor#sorted, not here");
  }
};

const openRank = (item: CellarItemDto): number => {
  if (item.emptyAt !== null) return 2;
  return item.openAt === null ? 1 : 0;
};

const requireName = (name: string): string => {
  const trimmed = name.trim();
  if (trimmed === "") throw new ValidationError("a cellar needs a name");
  if (trimmed.length > 200) {
    throw new ValidationError("a cellar's name must be 200 characters or less");
  }
  return trimmed;
};

const requirePercentage = (value: number): number => {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new ValidationError(
      `percentageRemaining must be between 0 and 100, got ${value}`,
    );
  }
  return value;
};

const parseInstant = (
  value: string | null | undefined,
  what: string,
): Date | null => {
  if (value === null || value === undefined) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${what} must be an ISO-8601 instant`);
  }
  return parsed;
};

/**
 * The creator is an owner already, by `created_by_id`; a `cellar_owners` row
 * for them would be a second, redundant source of truth for the same fact.
 *
 * `requireUuid` lowercases, so the creator filter, the dedupe and `update`'s
 * set diff against the cached (lowercase) owners all compare one spelling —
 * an upper-cased creator id used to survive the filter and be inserted as a
 * co-owner of their own cellar, and an upper-cased existing co-owner read as
 * "added" and hit `cellar_owners`' primary key.
 */
const normaliseOwners = (
  ids: readonly string[],
  creatorId: string,
): string[] => [
  ...new Set(
    ids
      .map((id) => requireUuid(id, "coOwnerIds[]"))
      .filter((id) => id !== creatorId),
  ),
];
