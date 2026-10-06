/**
 * The cellar aggregate as `services/api` sees it (migration plan §2.1
 * `CellarActor`, workstream B1).
 *
 * `CellarActor(cellarId)` owns four tables — `cellars`, `cellar_owners`,
 * `cellar_items`, `check_ins` — and every one of them is hidden behind the
 * DTOs below. Two shapes in particular are deliberately *not* the row shape:
 *
 * - **`cellar_items`' six-column polymorphic foreign key** (`wine_id`,
 *   `beer_id`, …) collapses to a single `item: ItemRef`, the same typed
 *   reference collection actors return (`items.ts`). §9 defers consolidating
 *   the six item tables; nothing outside `packages/db`, `ItemActor` and
 *   `CellarActor` may see that they exist.
 * - **`percentage_remaining` is `numeric`**, which `pg` hands back as a
 *   *string*. It crosses this wire as a JSON number, converted in the actor —
 *   `services/api` has no Drizzle and no database, so it cannot do it.
 *
 * `timestamptz` columns cross as ISO-8601 strings for the same reason.
 *
 * ## Visibility, and the §1.6 open decision B1 resolved
 *
 * `get`, `items` and `checkIns` are all gated on the **cellar's** four-branch
 * visibility (`canSeeCellar` in `@cellar-assistant/policy`): PUBLIC, or
 * FRIENDS and the viewer is a friend of the creator, or the viewer is the
 * creator or a co-owner.
 *
 * §1.6 flagged a conflict between §2.1 (gate `checkIns` on cellar visibility)
 * and §2.2 (the check-ins collection is "mine + friends'" per *item*). They
 * are not the same surface and they do not want the same rule:
 *
 * - **`CellarActor.checkIns` is cellar-scoped.** It is reached by naming a
 *   cellar id, and its rows carry `cellarItemId`s belonging to that cellar.
 *   Answering it for a viewer who cannot see the cellar turns the cellar id
 *   into an oracle for a private collection's contents and activity. So it is
 *   gated on the cellar, exactly as §2.1 says.
 * - **`CheckInsCollectionActor` (§2.2, C3) is item-scoped.** It is reached by
 *   naming an *item*, never a cellar, and the answer names the drinker rather
 *   than where the bottle sat. `canSeeCheckIn`'s author-or-friend-of-author
 *   branch is right there, and A4's reading of it stands.
 *
 * So `canSeeCheckIn` is not wrong — it belongs to the other surface. See
 * `services/actors/src/actors/cellar-actor.ts`'s module doc for the long form.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { PermissionType } from "./enums.ts";
import type { ItemRef, ItemType } from "./items.ts";
import type { CappedList, Page, PageArgs } from "./page.ts";

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A count per item type, plus their sum (UI parity G1, G36).
 *
 * A fixed six-key record rather than a list of `{type, count}` pairs: the
 * schema refuses any composite list that is not a connection's `edges`
 * (§1.5), and six named fields are what the old cards read anyway — the old
 * Hasura fragment was six `count(columns: [<type>_id])` aggregates.
 */
export type ItemTypeCountsDto = {
  readonly total: number;
  readonly byType: Readonly<Record<ItemType, number>>;
};

export type CellarDto = {
  readonly id: string;
  readonly name: string;
  readonly privacy: PermissionType;
  readonly createdById: string;
  /**
   * `cellar_owners.user_id` for this cellar — co-owners only. The creator is
   * an owner by virtue of `created_by_id` and is deliberately not repeated
   * here, because today's `cellar_owners` rows do not include them either.
   */
  readonly coOwnerIds: readonly string[];
  /** Cheap: §2.1 loads every `cellar_items` row on activate. Every bottle, emptied ones included. */
  readonly itemCount: number;
  /**
   * UI parity G1: **non-empty** bottles per item type — the old
   * `items_aggregate(where: {empty_at: {_is_null: true}})` (decision 4). A
   * count of bottles, not of distinct items: two bottles of one wine are 2.
   */
  readonly itemCounts: ItemTypeCountsDto;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** `cellar_items.source_type`'s check constraint, verbatim. */
export const CELLAR_ITEM_SOURCES = [
  "manual",
  "menu_discovery",
  "menu_scan",
  "import",
] as const;

export type CellarItemSource = (typeof CELLAR_ITEM_SOURCES)[number];

export const isCellarItemSource = (value: string): value is CellarItemSource =>
  (CELLAR_ITEM_SOURCES as readonly string[]).includes(value);

export type CellarItemDto = {
  readonly id: string;
  readonly cellarId: string;
  /** `cellar_items.created_by` — who put it in the cellar. */
  readonly createdBy: string;
  /** The six-column polymorphic FK, resolved. */
  readonly item: ItemRef;
  readonly openAt: string | null;
  readonly emptyAt: string | null;
  /** `numeric(0–100)`, as a number. */
  readonly percentageRemaining: number;
  readonly displayImageId: string | null;
  readonly sourceType: CellarItemSource | null;
  readonly sourcePlaceId: string | null;
  readonly sourceMenuItemId: string | null;
  /** Semantic distance, present only on a `semanticQuery` page. Cosine, 0–2. */
  readonly distance: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CheckInDto = {
  readonly id: string;
  /**
   * Who the check-in is *about*. Not necessarily who wrote it: `bulkCheckIn`
   * writes rows on behalf of friends (§2.1).
   */
  readonly userId: string;
  readonly cellarItemId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

export type CreateCellarInput = {
  readonly name: string;
  /** Defaults to the column default, `PRIVATE`. */
  readonly privacy?: PermissionType;
  /** Co-owners besides the creator. The creator is filtered out if present. */
  readonly coOwnerIds?: readonly string[];
};

/**
 * Every field is optional and only the present ones are written.
 *
 * `coOwnerIds` is the **complete** new set, not a delta — §2.1: "replaces the
 * delete-all/re-insert owner pattern with a set diff in one transaction".
 * Omit it to leave the owner set untouched; pass `[]` to clear it.
 */
export type UpdateCellarInput = {
  readonly name?: string;
  readonly privacy?: PermissionType;
  readonly coOwnerIds?: readonly string[];
};

export type AddCellarItemInput = {
  readonly item: ItemRef;
  /**
   * The row id, minted by the caller. **This is the §8.4 idempotency key.**
   * `cellar_items` has no natural unique constraint — two bottles of the same
   * wine are two legitimate rows — so a re-delivered `addItem` can only be
   * recognised by its id. Omit it for a user-initiated add; an outbox
   * delivery that omits it gets a key derived from the delivery instead (see
   * `CellarActorInterface.addItem`).
   */
  readonly cellarItemId?: string;
  /**
   * `cellar_items.created_by`. Honoured **only** for a `system` ctx, where
   * there is no viewer to take it from — an outbox payload written by
   * `ItemOnboardingActor.confirm` inside its own transaction is trusted; a
   * request is not. A user call always records the viewer, whatever this says.
   */
  readonly createdBy?: string;
  /** 0–100. Defaults to 100. */
  readonly percentageRemaining?: number;
  readonly displayImageId?: string | null;
  readonly openAt?: string | null;
  readonly emptyAt?: string | null;
  readonly sourceType?: CellarItemSource | null;
  readonly sourcePlaceId?: string | null;
  readonly sourceMenuItemId?: string | null;
};

export type UpdateCellarItemInput = {
  readonly percentageRemaining?: number;
  readonly displayImageId?: string | null;
  readonly openAt?: string | null;
  readonly emptyAt?: string | null;
};

/**
 * In-cellar orderings. §2.1 loads every `cellar_items` row on activate ("a
 * cellar is small enough to hold"), so these sort the cached list rather than
 * the database — which is also what makes `SEMANTIC` a re-sort of the same
 * list rather than a different query.
 */
export const CELLAR_ITEM_SORTS = [
  "ADDED_DESC",
  "ADDED_ASC",
  "PERCENTAGE_ASC",
  "PERCENTAGE_DESC",
  "OPEN_FIRST",
  // UI parity G3: the old items page sorted by item name (ramda
  // `ascend(name)` after distance). Names live in the item tables, which this
  // actor does not own, so they are read fresh per call, never cached (§1.3).
  "NAME_ASC",
] as const;

export type CellarItemSort = (typeof CELLAR_ITEM_SORTS)[number];

/**
 * UI parity G2: which bottles a `CellarActor.items` page holds. `ACTIVE` (not
 * emptied) is the default — decision 4: the old UI hid empty bottles from
 * every cellar list (`empty_at: {_is_null: true}`).
 */
export const CELLAR_ITEM_STATUSES = ["ACTIVE", "EMPTY", "ALL"] as const;

export type CellarItemStatus = (typeof CELLAR_ITEM_STATUSES)[number];

export type CellarItemsArgs = {
  readonly page: PageArgs;
  /** Defaults to `ADDED_DESC`. Ignored when `semanticQuery` is set. */
  readonly sort?: CellarItemSort | null;
  /**
   * Free text. The actor asks `EmbeddingActor` for the vector (§8.5's one
   * sanctioned synchronous entity → search call) and orders the cached items
   * by cosine distance over `item_vectors`.
   */
  readonly semanticQuery?: string | null;
  /**
   * UI parity G2. Only these item types; null or empty means all six. Applied
   * **before** paging, so `totalCount` and the cursor follow the filter.
   */
  readonly types?: readonly ItemType[] | null;
  /** UI parity G2. Defaults to `ACTIVE`. Applied before paging, like `types`. */
  readonly status?: CellarItemStatus | null;
};

export type DeletedCellar = { readonly id: string };
export type RemovedCellarItem = { readonly id: string };

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `CellarActor(cellarId)` — entity actor, owned by **B1**.
 *
 * Reads (`get`, `items`, `checkIns`) are gated on cellar visibility. Writes
 * split two ways, matching what the Hasura permissions they replace allowed:
 *
 * - **creator or co-owner** — `update` (name/privacy), every `*Item` method;
 * - **creator only** — changing the co-owner set, and `delete`.
 *
 * `checkIn`/`bulkCheckIn` additionally require the cellar to be *visible*,
 * which the Hasura rule did not check at all (it gated only on the check-in's
 * subject being the caller or a friend). See the actor's module doc.
 */
export type CellarActorInterface = {
  get(ctx: Ctx): Promise<CellarDto>;
  create(ctx: Ctx, input: CreateCellarInput): Promise<CellarDto>;
  update(ctx: Ctx, input: UpdateCellarInput): Promise<CellarDto>;
  delete(ctx: Ctx): Promise<DeletedCellar>;

  items(ctx: Ctx, args: CellarItemsArgs): Promise<Page<CellarItemDto>>;
  /**
   * §8.4: idempotent on `input.cellarItemId`, falling back to
   * `idempotencyKey(ctx, …)` for an outbox delivery that supplies none —
   * derived from `ctx.delivery`, which only the drainer mints and the wire
   * boundary refuses on any other ctx.
   * A second delivery of the same row returns the existing item and writes
   * nothing — which is `ItemOnboardingActor.confirm`'s "re-delivered twice …
   * one cellar item" (§6 B2), prepaid.
   */
  addItem(ctx: Ctx, input: AddCellarItemInput): Promise<CellarItemDto>;
  updateItem(
    ctx: Ctx,
    cellarItemId: string,
    input: UpdateCellarItemInput,
  ): Promise<CellarItemDto>;
  removeItem(ctx: Ctx, cellarItemId: string): Promise<RemovedCellarItem>;
  setItemPercentage(
    ctx: Ctx,
    cellarItemId: string,
    percentageRemaining: number,
  ): Promise<CellarItemDto>;
  openItem(ctx: Ctx, cellarItemId: string): Promise<CellarItemDto>;
  emptyItem(ctx: Ctx, cellarItemId: string): Promise<CellarItemDto>;

  /** Idempotent on `checkInId` / the delivery's key, like `addItem`. */
  checkIn(
    ctx: Ctx,
    cellarItemId: string,
    checkInId?: string,
  ): Promise<CheckInDto>;
  /**
   * Writes one row per id in `userIds`, each of which must be the caller or a
   * friend of the caller — §2.1's "friend check in policy". A single
   * non-friend rejects the whole call; no partial write.
   */
  bulkCheckIn(
    ctx: Ctx,
    cellarItemId: string,
    userIds: readonly string[],
  ): Promise<readonly CheckInDto[]>;
  checkIns(ctx: Ctx, page: PageArgs): Promise<Page<CheckInDto>>;

  /**
   * UI parity G10 — one bottle by `cellar_items.id`, which is what a
   * `/cellars/[c]/<type>s/[id]` URL means again (decision 1). Emptied bottles
   * included: a bookmark to a finished bottle still opens it. `NotFoundError`
   * for a bottle that is not in *this* cellar, same as a missing one.
   */
  item(ctx: Ctx, cellarItemId: string): Promise<CellarItemDto>;
  /**
   * UI parity G10's redirect: an old link carrying a **catalog** item id.
   * The cellar's one bottle of that item, or `null` when there is no single
   * answer — decision 1 sends the client to the item page then. Non-empty
   * bottles decide first; only when there are none does a lone emptied bottle
   * count.
   */
  bottleFor(ctx: Ctx, item: ItemRef): Promise<CellarItemDto | null>;
  /**
   * UI parity G14 — check-ins per bottle, newest first, aligned to
   * `cellarItemIds`. Gated exactly as `checkIns` (the cellar's visibility);
   * an id that is not one of this cellar's bottles answers an empty list.
   */
  checkInsOf(
    ctx: Ctx,
    cellarItemIds: readonly string[],
  ): Promise<readonly CappedList<CheckInDto>[]>;
};

export const CellarActorDescriptor: ActorDescriptor<CellarActorInterface> = {
  actorType: "CellarActor",
  category: "entity",
  methods: {
    get: {},
    create: {},
    update: {},
    delete: {},
    // Only with `semanticQuery`, which embeds it; the API charges the field
    // only when that argument is given (`MODEL_BACKED_FIELDS`).
    items: { modelBacked: true },
    addItem: {},
    updateItem: {},
    removeItem: {},
    setItemPercentage: {},
    openItem: {},
    emptyItem: {},
    checkIn: {},
    bulkCheckIn: {},
    checkIns: {},
    item: {},
    bottleFor: {},
    checkInsOf: {},
  },
};

/**
 * `EmbeddingActor(hash(text))` moved to `search.ts` in **C1**, as the note that
 * stood here invited ("C1 may move it; the shape is the contract, not the
 * file"). It now sits with the other nine search actors, and its key builder —
 * `embeddingActorId`, `sha256(lower(trim(text)))` — sits beside it.
 */
export type {} from "./search.ts";
