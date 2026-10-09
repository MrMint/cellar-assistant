/**
 * `CellarActor` — B1 (migration plan §2.1, §3).
 *
 * Owns `cellars`, `cellar_owners` and `cellar_items`, and loads all three on
 * activate: §2.1's "the cellar row, owners, all `cellar_items` (a cellar is
 * small enough to hold)". That sentence is load-bearing rather than
 * descriptive — because the whole aggregate is in memory, `items` sorts and
 * pages the cached list with `offsetPage` instead of issuing a keyset query
 * per call, and `semanticQuery` becomes a *re-sort* of that same list rather
 * than a different query.
 *
 * **`check_ins` left this aggregate in X02.** A log entry is about an item,
 * and a bottle is only where it was poured from, so its writer is
 * `CheckInActor`. This actor still answers the cellar-scoped history
 * (`checkIns`, `checkInsOf`) — read fresh per call, never cached, because it
 * no longer writes the rows (§1.3: cache only what you write) — and
 * `removeItem` no longer deletes a bottle's logs: the foreign key nulls their
 * `cellar_item_id`, and the drinker's history survives the bottle (D5).
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
 * replace (`82450ad1:nhost/metadata/databases/default/tables/public_cellars.yaml` and
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
 * `cellar_items` has no natural unique constraint — two bottles of the same
 * wine are two legitimate rows — so the only thing that can recognise a
 * redelivery is the row id. `addItem` therefore takes one from the caller
 * (as `CheckInActor.log` does, keyed by the id its caller mints).
 * `addItem` alone falls back to `idempotencyKey(ctx, …)` (`lib/delivery.ts`),
 * derived from the delivery `OutboxActor` minted and so stable across its
 * at-least-once redeliveries — and null for anything but a genuine delivery,
 * so a request cannot pick its own row ids. `addItem` is the method B2's
 * `ItemOnboardingActor.confirm` calls (§2.1), so this is where its
 * "re-delivered twice … one cellar item" acceptance is actually paid for.
 *
 * ## No outbox row is written here
 *
 * Deliberately, and it is a finding rather than an omission: §2.1 lists no
 * `(system, outbox)` method for this aggregate, none of its tables has
 * an event trigger today, and its one cross-actor dependency —
 * `EmbeddingActor` for semantic sort — is the single synchronous entity →
 * search call §8.5 allows. This actor is an outbox *target*, not a source.
 */
import { randomUUID } from "node:crypto";
import type {
  ActorCategory,
  AddCellarItemInput,
  BottleLogSummaryDto,
  CappedList,
  CellarActorInterface,
  CellarDashboardArgs,
  CellarDashboardDto,
  CellarDto,
  CellarItemDto,
  CellarItemGroupDto,
  CellarItemGroupPage,
  CellarItemGroupsArgs,
  CellarItemSort,
  CellarItemSource,
  CellarItemStatus,
  CellarItemsArgs,
  CellarNameMatchesArgs,
  CellarSearchMeaning,
  CheckInDto,
  CreateCellarInput,
  Ctx,
  DeletedCellar,
  InternalCellarActorInterface,
  ItemRef,
  ItemType,
  ItemTypeCountsDto,
  Page,
  PageArgs,
  PermissionType,
  RemovedCellarItem,
  StarterCellarInput,
  UpdateCellarInput,
  UpdateCellarItemInput,
} from "@cellar-assistant/contracts";
import {
  CELLAR_ALMOST_EMPTY_AT,
  CELLAR_LOG_MONTHS,
  CELLAR_RECENT_DAYS,
  CellarActorDescriptor,
  ConflictError,
  ForbiddenError,
  ITEM_TYPES,
  isCellarItemSource,
  isItemType,
  NotFoundError,
  offsetPage,
  orderOwnBottles,
  REVERSE_EDGE_CAP,
  requireReverseEdgeBatch,
  STARTER_CELLAR_NAME,
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
  isOwner,
} from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { EntityActorBase } from "../lib/actor-base.ts";
import {
  CELLAR_NAME_THRESHOLD,
  countByMonth,
  groupInOrder,
  monthKey,
  monthsEndingAt,
  nameScores,
  narrowCandidates,
  resolveTimeZone,
  type SearchMatch,
} from "../lib/cellar-search.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { idempotencyKey } from "../lib/delivery.ts";
import { daprEmbedQuery, type EmbedQuery } from "../lib/embedding-client.ts";
import { requireSystem } from "../lib/guards.ts";
import { ARCS } from "../lib/item-arcs.ts";
import { itemNames } from "../lib/item-names.ts";
import { starterCellarId } from "../lib/starter-cellar.ts";
import { placeIsVisible } from "../lib/unshared-places.ts";
import { requireUuid } from "../lib/uuid.ts";
import { vectorDistances } from "../lib/vectors.ts";
import {
  type CellarAccess,
  cellarVisibility,
  isCellarOwner,
} from "../lib/visibility.ts";

type CellarRow = typeof cellars.$inferSelect;
type CellarItemRow = typeof cellarItems.$inferSelect;
/** A log that still points at one of this cellar's bottles. */
type BottleCheckInRow = {
  readonly id: string;
  readonly userId: string;
  readonly cellarItemId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CellarAggregate = {
  readonly cellar: CellarRow;
  /** `cellar_owners.user_id`; the creator is not among them. */
  readonly coOwnerIds: readonly string[];
  /** Every row, newest first. §2.1: a cellar is small enough to hold. */
  readonly items: readonly CellarItemRow[];
};

/** What `../lib/visibility.ts` decides a cellar's visibility and ownership from. */
const access = (aggregate: CellarAggregate): CellarAccess => ({
  createdById: aggregate.cellar.createdById,
  privacy: aggregate.cellar.privacy,
  coOwnerIds: aggregate.coOwnerIds,
});

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
  implements CellarActorInterface, InternalCellarActorInterface
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

    return {
      cellar,
      coOwnerIds: owners.map((owner) => owner.userId),
      items,
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
    const rows = await this.#checkInsFor(aggregate.items.map((row) => row.id));
    return offsetPage(rows.map(toCheckInDto), page);
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
   * X09 "Your bottles": every bottle of each item here, aligned to `items`,
   * from the cached aggregate — the same rows `bottleFor` picks one from —
   * filtered by `status` (default `ACTIVE`, as `items` defaults) and in
   * {@link orderOwnBottles}' order: open, then sealed, then finished.
   */
  async bottlesOf(
    ctx: Ctx,
    items: readonly ItemRef[],
    status?: CellarItemStatus | null,
  ): Promise<readonly (readonly CellarItemDto[])[]> {
    requireReverseEdgeBatch(items, "bottlesOf items");
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    for (const item of items) {
      if (!isItemType(item.type)) {
        throw new ValidationError(`not an item type: ${String(item.type)}`);
      }
    }
    const rows = filtered(aggregate.items, null, status);
    return items.map((item) => {
      const wanted = String(item.id).toLowerCase();
      return orderOwnBottles(
        rows
          .filter((row) => {
            const ref = itemRefOf(row);
            return ref.type === item.type && ref.id === wanted;
          })
          .map((row) => toItemDto(row, null)),
      );
    });
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
    const mine = new Set(aggregate.items.map((row) => row.id));
    const wanted = cellarItemIds.map((id) => String(id).toLowerCase());
    // Newest first (`#checkInsFor`), and only this cellar's bottles: an id
    // from another cellar answers an empty list, as it always has.
    const all = await this.#checkInsFor(wanted.filter((id) => mine.has(id)));
    return wanted.map((cellarItemId) => {
      const rows = all.filter((row) => row.cellarItemId === cellarItemId);
      return {
        nodes: rows.slice(0, REVERSE_EDGE_CAP).map(toCheckInDto),
        totalCount: rows.length,
      };
    });
  }

  /* ---------------------------------------------------------------------- */
  /* X04: the cellar home                                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * X04: the grid's list. The same filter as `items` (G2), then either the
   * sort or — with `search` — the narrowing (`../lib/cellar-search.ts`): name
   * matches, then meaning matches inside the tuned cutoff, and nothing else.
   * A search overrides the sort, except FINISHED_DESC (the diary), which
   * orders what the search kept by date.
   * Then identical bottles fold into one group ("×3"), which sits where its
   * best-placed bottle sat. Paged by group; `bottleCount` counts bottles.
   *
   * When the phrase cannot be embedded (no AI provider, out of allowance, a
   * model error) the page is name matches alone and says so (`meaning:
   * UNAVAILABLE`) — a search by name needs no model, and must not fail
   * because one is missing.
   */
  async itemGroups(
    ctx: Ctx,
    args: CellarItemGroupsArgs,
  ): Promise<CellarItemGroupPage> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);

    const rows = filtered(aggregate.items, args.types, args.status);
    const query = args.search?.trim() ?? "";
    let ordered: readonly Matched[];
    let meaning: CellarSearchMeaning = "NOT_ASKED";
    if (query === "") {
      ordered = (await this.#sorted(rows, args.sort)).map((dto) => ({
        dto,
        match: null,
      }));
    } else {
      const searched = await this.#narrowed(ctx, rows, query);
      meaning = searched.meaning;
      const hits = searched.matches.map((hit) => ({
        dto: toItemDto(hit.value, hit.distance),
        match: hit.match,
      }));
      // The narrowing decides *which* bottles; the diary still reads by date,
      // so a search of Finished keeps its month headings in calendar order
      // (by relevance they came out as "March 2026", "October 2026", and so
      // on). Every other sort steps aside for the search's order: names first.
      ordered =
        args.sort === "FINISHED_DESC"
          ? [...hits].sort((a, b) => finishedDesc(a.dto, b.dto))
          : hits;
    }

    const groups = toGroups(ordered, args.group ?? true);
    return {
      ...offsetPage(groups, args.page),
      bottleCount: ordered.length,
      meaning,
    };
  }

  /**
   * X04 / D3: the dashboard above the grid — open, almost empty, finished
   * this month, recently added, and the logs poured per month. Bottles from
   * the cached aggregate; the logs read fresh (this actor does not write
   * them), only their timestamps, only the last {@link CELLAR_LOG_MONTHS}
   * months' worth. Months are cut in the viewer's zone, so a glass at 11 pm
   * on the 31st lands in the month the viewer lived it in.
   */
  async dashboard(
    ctx: Ctx,
    args: CellarDashboardArgs,
  ): Promise<CellarDashboardDto> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);

    const zone = resolveTimeZone(args.timeZone);
    const now = new Date();
    const current = monthKey(now, zone);
    const months = monthsEndingAt(current, CELLAR_LOG_MONTHS);
    const recentSince = now.getTime() - CELLAR_RECENT_DAYS * DAY_MS;

    const active = aggregate.items.filter((row) => row.emptyAt === null);
    const open = active.filter(isOpenRow);
    const finished = aggregate.items.filter((row) => row.emptyAt !== null);

    const ids = aggregate.items.map((row) => row.id);
    // A day of slack past the oldest month's start in any zone; the
    // bucketing drops whatever falls outside the months.
    const since = new Date(
      now.getTime() - (CELLAR_LOG_MONTHS * 31 + 1) * DAY_MS,
    );
    const logs =
      ids.length === 0
        ? []
        : await this.db
            .select({ createdAt: checkIns.createdAt })
            .from(checkIns)
            .where(
              and(
                inArray(checkIns.cellarItemId, ids),
                sql`${checkIns.createdAt} >= ${since.toISOString()}`,
              ),
            );

    return {
      bottleCount: active.length,
      openCount: open.length,
      almostEmptyCount: open.filter(
        (row) => Number(row.percentageRemaining) <= CELLAR_ALMOST_EMPTY_AT,
      ).length,
      finishedThisMonth: finished.filter(
        (row) =>
          row.emptyAt !== null && monthKey(row.emptyAt, zone) === current,
      ).length,
      finishedCount: finished.length,
      addedRecently: active.filter(
        (row) => row.createdAt.getTime() >= recentSince,
      ).length,
      logsByMonth: countByMonth(
        logs.map((log) => log.createdAt),
        months,
        zone,
      ),
      currentMonth: current,
      timeZone: zone,
    };
  }

  /**
   * X04: the Finished diary's "your log" — the viewer's **own** logs from
   * each bottle, never a co-owner's or a friend's (their notes are theirs;
   * `checkIns` already tells the cellar *that* they drank). Gated on the
   * cellar, like every read here.
   */
  async myLogsOf(
    ctx: Ctx,
    cellarItemIds: readonly string[],
  ): Promise<readonly BottleLogSummaryDto[]> {
    requireReverseEdgeBatch(cellarItemIds, "myLogsOf cellarItemIds");
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    const wanted = cellarItemIds.map((id) => String(id).toLowerCase());
    const viewer = ctx.viewerId;
    const mine = new Set(aggregate.items.map((row) => row.id));
    const asked = wanted.filter((id) => mine.has(id));
    const rows =
      viewer === null || asked.length === 0
        ? []
        : await this.db
            .select({
              cellarItemId: checkIns.cellarItemId,
              createdAt: checkIns.createdAt,
              score: checkIns.score,
              note: checkIns.note,
            })
            .from(checkIns)
            .where(
              and(
                inArray(checkIns.cellarItemId, asked),
                eq(checkIns.userId, viewer),
              ),
            )
            .orderBy(sql`${checkIns.createdAt} desc, ${checkIns.id} desc`);
    return wanted.map((cellarItemId) =>
      summariseLogs(rows.filter((row) => row.cellarItemId === cellarItemId)),
    );
  }

  /**
   * X04's fan-out: bottles still here whose item name matches `search`,
   * grouped, best first — no embedding, so `services/api` can ask every
   * cellar the viewer owns for the price of a trigram read each.
   */
  async nameMatches(
    ctx: Ctx,
    args: CellarNameMatchesArgs,
  ): Promise<readonly CellarItemGroupDto[]> {
    const aggregate = this.requireAggregate();
    await this.requireVisible(ctx, aggregate);
    const query = String(args.search ?? "").trim();
    if (query === "") return [];
    if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 20) {
      throw new ValidationError(
        `limit must be an integer from 1 to 20, got ${args.limit}`,
      );
    }
    const rows = aggregate.items.filter((row) => row.emptyAt === null);
    const matches = await this.#namedOnly(rows, query);
    const groups = toGroups(
      matches.map((hit) => ({
        dto: toItemDto(hit.value, hit.distance),
        match: hit.match,
      })),
      true,
    );
    return groups.slice(0, args.limit);
  }

  /**
   * The narrowing over `rows` (`../lib/cellar-search.ts`): name scores and,
   * when the phrase can be embedded, vector distances.
   */
  async #narrowed(
    ctx: Ctx,
    rows: readonly CellarItemRow[],
    query: string,
  ): Promise<{
    readonly matches: readonly SearchMatch<CellarItemRow>[];
    readonly meaning: CellarSearchMeaning;
  }> {
    if (rows.length === 0) return { matches: [], meaning: "USED" };
    const refs = rows.map(itemRefOf);
    const [scores, distances] = await Promise.all([
      nameScores(this.db, refs, query),
      this.#embed(ctx, query).then(
        (vector) => vectorDistances(this.db, refs, vector),
        // A model that is missing, out of allowance or failing costs the
        // meaning arm, not the search: names need no model.
        () => null,
      ),
    ]);
    return {
      matches: narrowCandidates(candidatesOf(rows), scores, distances, {
        nameThreshold: CELLAR_NAME_THRESHOLD,
      }),
      meaning: distances === null ? "UNAVAILABLE" : "USED",
    };
  }

  /**
   * Name matches alone — `nameMatches`' path, which must never reach a model
   * (`MODEL_BACKED_FIELDS` derives that from this method not calling
   * `#embed`).
   */
  async #namedOnly(
    rows: readonly CellarItemRow[],
    query: string,
  ): Promise<readonly SearchMatch<CellarItemRow>[]> {
    if (rows.length === 0) return [];
    const scores = await nameScores(this.db, rows.map(itemRefOf), query);
    return narrowCandidates(candidatesOf(rows), scores, null, {
      nameThreshold: CELLAR_NAME_THRESHOLD,
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
   * N15 — a brand-new account's first cellar, "My Cellar", PRIVATE.
   *
   * Reached only through the outbox (`InternalCellarActorInterface`):
   * better-auth's `user.create` hook enqueues it at
   * `starterCellarId(ownerId)`. The row runs as `system`, so the guards are
   * here rather than in a policy check that would open on it:
   *
   *   - `system` only — no request, not even an admin's, makes a cellar for
   *     someone else this way;
   *   - this actor's key must be the one derived from `ownerId`, so a row
   *     cannot plant a cellar for one user at an id chosen for another;
   *   - idempotent: delivery is at least once, and a second run finds the
   *     cellar (in the aggregate, or as a conflicting insert) and stops.
   *
   * A user who later deletes it is not given another: the hook runs on
   * account creation and nowhere else.
   */
  async createStarter(ctx: Ctx, input: StarterCellarInput): Promise<void> {
    requireSystem(ctx, "only the outbox makes a starter cellar");
    const ownerId = requireUuid(input.ownerId, "ownerId");
    if (this.key !== starterCellarId(ownerId)) {
      throw new ValidationError(
        `cellar ${this.key} is not ${ownerId}'s starter cellar`,
      );
    }
    if (this.aggregate !== null) return;
    await this.tx(async (tx) => {
      await tx
        .insert(cellars)
        .values({
          id: this.key,
          name: STARTER_CELLAR_NAME,
          createdById: ownerId,
          privacy: "PRIVATE",
        })
        .onConflictDoNothing({ target: cellars.id });
    });
    await this.reload();
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

    // X27: a source place the caller cannot see — somebody else's place
    // still under review — is answered as an unknown one, rather than
    // accepted by the foreign key and so confirmed to exist.
    const sourcePlaceId = input.sourcePlaceId ?? null;
    if (
      sourcePlaceId !== null &&
      !(await placeIsVisible(this.db, ctx, sourcePlaceId))
    ) {
      throw new NotFoundError(`place ${sourcePlaceId} not found`);
    }

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
          sourcePlaceId,
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
   * Removes the bottle and nothing else. Its logs are `CheckInActor`'s and
   * outlive it: `check_ins.cellar_item_id` is `ON DELETE SET NULL` since X02,
   * so Postgres detaches them as the row goes (D5, "logs survive the bottle").
   */
  async removeItem(ctx: Ctx, cellarItemId: string): Promise<RemovedCellarItem> {
    const aggregate = this.requireAggregate();
    await this.#requireOwner(ctx, aggregate);
    const { id } = this.#requireItem(cellarItemId);

    await this.tx(async (tx) => {
      await tx.delete(cellarItems).where(eq(cellarItems.id, id));
    });
    await this.reload();
    return { id };
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

  /**
   * The logs poured from these bottles, newest first. Read per call: since
   * X02 `CheckInActor` writes `check_ins`, so a cached copy here would go
   * stale the moment somebody logged a glass.
   */
  async #checkInsFor(
    cellarItemIds: readonly string[],
  ): Promise<readonly BottleCheckInRow[]> {
    if (cellarItemIds.length === 0) return [];
    const rows = await this.db
      .select({
        id: checkIns.id,
        userId: checkIns.userId,
        cellarItemId: checkIns.cellarItemId,
        createdAt: checkIns.createdAt,
        updatedAt: checkIns.updatedAt,
      })
      .from(checkIns)
      .where(inArray(checkIns.cellarItemId, [...cellarItemIds]))
      .orderBy(sql`${checkIns.createdAt} desc, ${checkIns.id} desc`);
    return rows.flatMap((row) =>
      row.cellarItemId === null
        ? []
        : [{ ...row, cellarItemId: row.cellarItemId }],
    );
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
      finishedCount: aggregate.items.filter((row) => row.emptyAt !== null)
        .length,
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

const toCheckInDto = (row: BottleCheckInRow): CheckInDto => ({
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
  if (
    state !== "ACTIVE" &&
    state !== "EMPTY" &&
    state !== "ALL" &&
    state !== "OPEN"
  ) {
    throw new ValidationError(`not a cellar item status: ${String(state)}`);
  }
  const inState = (row: CellarItemRow): boolean => {
    switch (state) {
      case "ALL":
        return true;
      case "ACTIVE":
        return row.emptyAt === null;
      case "EMPTY":
        return row.emptyAt !== null;
      case "OPEN":
        return isOpenRow(row);
    }
  };
  return rows.filter(
    (row) =>
      (wanted === null || wanted.has(itemRefOf(row).type)) && inState(row),
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
    case "OPENED_DESC":
      // Open bottles, most recently opened first (one opened by its level
      // alone has no `openAt` and sorts after those that have one), then the
      // rest as OPEN_FIRST has them.
      return copy.sort(
        (a, b) =>
          openRank(a) - openRank(b) ||
          (openRank(a) === 0 ? instantDesc(a.openAt, b.openAt) : 0),
      );
    case "FINISHED_DESC":
      // Finished bottles, most recently finished first, then the rest newest
      // first — the diary's order.
      return copy.sort(finishedDesc);
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

/** Newest instant first; a missing one after any present one. Stable on ties. */
const instantDesc = (a: string | null, b: string | null): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return Date.parse(b) - Date.parse(a);
};

/** FINISHED_DESC: finished first, the latest finish first; stable on ties. */
const finishedDesc = (a: CellarItemDto, b: CellarItemDto): number =>
  Number(a.emptyAt === null) - Number(b.emptyAt === null) ||
  instantDesc(a.emptyAt, b.emptyAt);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * X04's "open": not finished, and opened — by `openAt`, or by a level already
 * below full, which the API allows without one. The client's `bottleState`
 * reads a bottle the same way.
 */
const isOpenRow = (row: CellarItemRow): boolean =>
  row.emptyAt === null &&
  (row.openAt !== null || Number(row.percentageRemaining) < 100);

const isOpenDto = (dto: CellarItemDto): boolean =>
  dto.emptyAt === null &&
  (dto.openAt !== null || dto.percentageRemaining < 100);

/** Rows as `narrowCandidates` takes them. */
const candidatesOf = (rows: readonly CellarItemRow[]) =>
  rows.map((row) => ({ value: row, itemId: itemRefOf(row).id, id: row.id }));

/** A bottle in a list, and how it answered a search (null without one). */
type Matched = {
  readonly dto: CellarItemDto;
  readonly match: CellarItemGroupDto["match"];
};

/**
 * X04's ×N over an ordered list (`groupInOrder`). Identical means one catalog
 * item *and* the same side of finished: under "All" a finished bottle is its
 * own card, never one of a "×3" whose lead is still on the shelf — the card
 * links to its lead only, so a folded-in finished bottle could not be reached
 * from the grid, and the "×3" would count bottles that are gone.
 */
const toGroups = (
  ordered: readonly Matched[],
  group: boolean,
): CellarItemGroupDto[] =>
  groupInOrder(
    ordered,
    (entry) =>
      `${entry.dto.item.type}:${entry.dto.item.id}:${
        entry.dto.emptyAt === null ? "here" : "finished"
      }`,
    group,
  ).map(({ lead, members }) => ({
    lead: lead.dto,
    bottleIds: members.map((member) => member.dto.id),
    count: members.length,
    openCount: members.filter((member) => isOpenDto(member.dto)).length,
    match: lead.match,
  }));

/** The diary's "your log" for one bottle: newest first in, a summary out. */
const summariseLogs = (
  rows: readonly {
    readonly createdAt: Date;
    readonly score: number | null;
    readonly note: string | null;
  }[],
): BottleLogSummaryDto => {
  const newest = rows[0];
  const oldest = rows.at(-1);
  const scored = rows.find((row) => row.score !== null);
  const noted = rows.find((row) => row.note !== null && row.note.trim() !== "");
  return {
    count: rows.length,
    firstAt: oldest === undefined ? null : oldest.createdAt.toISOString(),
    lastAt: newest === undefined ? null : newest.createdAt.toISOString(),
    lastScore: scored?.score ?? null,
    lastNote: noted?.note?.trim() ?? null,
  };
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
