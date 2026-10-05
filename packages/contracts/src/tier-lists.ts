/**
 * The tier-list aggregate as `services/api` sees it (migration plan §2.1
 * `TierListActor`, workstream B7).
 *
 * `TierListActor(tierListId)` owns two tables — `tier_lists`, `tier_list_items`
 * — hidden behind the DTOs below.
 *
 * ## Items and places are both rankable — modelled honestly
 *
 * A3 found `tier_list_items.type` carries a seventh value, `'PLACE'`, that the
 * `item_type` Postgres enum cannot represent (its `wine|beer|spirit|coffee|
 * sake|tea` are exactly `ItemType` from `items.ts`) — which is why the column
 * stays `text` rather than becoming a `pgEnum`. Tier lists rank **both** items
 * and places, so `TierListEntryRef` is deliberately not `ItemRef`: it is
 * `ItemRef`'s six types plus `"PLACE"`, and a `TierListItemDto` carries one
 * `entry` of that wider type rather than assuming every row is an item.
 * `services/api/src/schema/tier-list.ts` exposes this as two sibling fields
 * (`item`, resolved through the existing `Item` interface, and `placeId`, a
 * bare id) rather than a GraphQL union — there is no `PlaceActor` yet (B5),
 * so there is nothing to batch-load a richer `Place` type through. Whoever
 * builds B5 can promote `placeId` to a resolved `Place` field without changing
 * this contract.
 *
 * **These DTOs are the wire shape, not the row shape.** `timestamptz` columns
 * cross as ISO-8601 strings (or `null` — see below) and `jsonb` crosses as a
 * plain object, because `services/api` has no Drizzle and no database.
 *
 * ## A schema quirk worth knowing before you assume non-null
 *
 * Unlike `cellars.created_at`/`updated_at` (`NOT NULL` in the live database),
 * `tier_lists.created_at`/`updated_at` and `tier_list_items.created_at`/
 * `updated_at` carry **no** `NOT NULL` constraint — `packages/db/src/schema/
 * tables.ts` (introspected, not hand-written) has no `.notNull()` on any of
 * the four. `contentUpdatedAt` is the one exception: it *is* `NOT NULL`,
 * which is what makes it safe to bump unconditionally as the "insights should
 * regenerate" signal. So every other timestamp here is `string | null`, and
 * only `contentUpdatedAt` is a bare `string`.
 *
 * ## Ordering — settled, not this workstream's to redesign
 *
 * `band` (0–5) + `position` (sequential per band) is the whole model. A
 * reorder batch-renumbers a band's positions to clean `0..n-1`; there is no
 * fractional indexing here (that is a deferred, collaborative-editing-only
 * migration path recorded in the plan, not adopted). The global rank the
 * frontend shows is derived client-side from `(band, position)` and is never
 * stored.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { PermissionType } from "./enums.ts";
import { ITEM_TYPES, type ItemType } from "./items.ts";
import type { Page, PageArgs } from "./page.ts";

/* -------------------------------------------------------------------------- */
/* The wider entry type — items, plus places                                   */
/* -------------------------------------------------------------------------- */

/**
 * `ItemType` plus `"PLACE"` — exactly the seven values
 * `tier_list_items.type` (a generated column) can produce, in the same order
 * as the table's own columns (`place_id, wine_id, beer_id, spirit_id,
 * coffee_id, sake_id, tea_id`).
 */
export const TIER_LIST_ENTRY_TYPES = [
  "PLACE",
  ...ITEM_TYPES,
] as const satisfies readonly [string, ...ItemType[]];

export type TierListEntryType = (typeof TIER_LIST_ENTRY_TYPES)[number];

export const isTierListEntryType = (
  value: string,
): value is TierListEntryType =>
  (TIER_LIST_ENTRY_TYPES as readonly string[]).includes(value);

/**
 * A typed reference to whatever a tier-list row ranks: one of the six item
 * types, or a place. Deliberately wider than `ItemRef` (`items.ts`) — see the
 * module doc for why the extra case cannot be modelled away.
 */
export type TierListEntryRef = {
  readonly type: TierListEntryType;
  readonly id: string;
};

/** `tier_list_items_band_check`: `band between 0 and 5`, verbatim. */
export const MIN_BAND = 0;
export const MAX_BAND = 5;

/* -------------------------------------------------------------------------- */
/* Wire shapes                                                                 */
/* -------------------------------------------------------------------------- */

export type TierListDto = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdById: string;
  readonly privacy: PermissionType;
  /** `tier_lists.list_type` — free text (`'place'` by default), not an enum. */
  readonly listType: string;
  readonly isEditingLocked: boolean;
  /** Cheap: `loadAggregate` reads every `tier_list_items` row on activate. */
  readonly itemCount: number;
  /** `ai_insights`, `generateInsights`'s output. `null` until first generated. */
  readonly aiInsights: Record<string, unknown> | null;
  readonly insightsGeneratedAt: string | null;
  /**
   * Bumped by every content-changing write (`addItem`, `removeItem`,
   * `reorderBand`) — never by `update`, which only touches the header. This
   * is the signal `generateInsights` throttles against, replacing the
   * `tier_list_items_content_changed` trigger it used to be.
   */
  readonly contentUpdatedAt: string;
  /** See the module doc: nullable in the live schema, unlike `cellars`. */
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

export type TierListItemDto = {
  readonly id: string;
  readonly tierListId: string;
  readonly band: number;
  readonly position: number;
  readonly notes: string | null;
  /** The six-or-seven-column polymorphic FK, resolved. */
  readonly entry: TierListEntryRef;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

export type CreateTierListInput = {
  readonly name: string;
  readonly description?: string | null;
  /** Defaults to the column default, `PRIVATE`. */
  readonly privacy?: PermissionType;
  /** Defaults to the column default, `'place'`. Settable only at creation —
   *  the Hasura permissions this replaces never allowed changing it later,
   *  and `UpdateTierListInput` below preserves that. */
  readonly listType?: string;
};

/** Every field is optional; only the present ones are written. Creator only. */
export type UpdateTierListInput = {
  readonly name?: string;
  readonly description?: string | null;
  readonly privacy?: PermissionType;
  readonly isEditingLocked?: boolean;
};

export type AddTierListItemInput = {
  readonly entry: TierListEntryRef;
  /** Defaults to `0`. Position within the band is computed in-turn (§2.1) —
   *  there is no way to request a specific position; append, then reorder. */
  readonly band?: number;
  readonly notes?: string | null;
  /**
   * The row id, minted by the caller. **The §8.4 idempotency key.** Falls
   * back to a key derived from the delivery for a system-delivered call
   * (`idempotencyKey`, `services/actors/src/lib/delivery.ts`), then a fresh
   * uuid.
   */
  readonly tierListItemId?: string;
};

export type DeletedTierList = { readonly id: string };
export type RemovedTierListItem = { readonly id: string };

/**
 * What `generateInsights` reports back — mirrors `RegenerateVectorResult`'s
 * shape (`items.ts`) for the same reason: a no-op delivery (throttled, or too
 * few items) is a normal outcome, not a failure, and callers should be able
 * to tell the two apart without parsing `reason`.
 */
export type GenerateInsightsResult = {
  readonly tierListId: string;
  readonly skipped: boolean;
  readonly reason: string;
};

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * `TierListActor(tierListId)` — entity actor, owned by **B7** (§2.1, §3).
 *
 * Visibility (`get`, `items`): PUBLIC, or FRIENDS and the viewer is a friend
 * of the creator, or the viewer is the creator — `canSeeTierList` in
 * `@cellar-assistant/policy`. There is no co-owner table for tier lists (A3;
 * `packages/policy`'s module doc says so explicitly), so every write —
 * `update`, `delete`, `addItem`, `removeItem`, `reorderBand` — is creator-only,
 * with no co-owner carve-out the way `CellarActor` has one.
 *
 * `delete` does not refuse a non-empty tier list: unlike `cellar_items`
 * (`ON DELETE RESTRICT`), `tier_list_items.tier_list_id` is `ON DELETE
 * CASCADE`, so removing the header is a bounded, single-statement operation
 * that takes its items with it. §1.5's "no unbounded read" is about request
 * turns doing unbounded *work*; a tier list is a small, curated list by
 * construction, not a collection that grows without limit like a cellar.
 */
export type TierListActorInterface = {
  get(ctx: Ctx): Promise<TierListDto>;
  create(ctx: Ctx, input: CreateTierListInput): Promise<TierListDto>;
  update(ctx: Ctx, input: UpdateTierListInput): Promise<TierListDto>;
  delete(ctx: Ctx): Promise<DeletedTierList>;

  items(ctx: Ctx, page: PageArgs): Promise<Page<TierListItemDto>>;

  /**
   * §8.4: idempotent on `input.tierListItemId`, falling back to a key
   * derived from the delivery. Also naturally idempotent on content: the table's own
   * `unique_<type>_in_tier_list` constraints mean the same wine (or place, or
   * …) cannot sit twice in one tier list — a second `addItem` for an entry
   * already present throws `ConflictError` rather than silently duplicating.
   */
  addItem(ctx: Ctx, input: AddTierListItemInput): Promise<TierListItemDto>;
  removeItem(ctx: Ctx, tierListItemId: string): Promise<RemovedTierListItem>;
  /**
   * One transaction. `orderedIds` is the **complete** post-reorder membership
   * of `band`, in order — every id currently in `band` must appear in it (an
   * omission is a `ValidationError`, not a silent drop), and an id not
   * currently in `band` is *moved* into it. Any other band that loses a
   * member this way is renumbered too, in the same transaction, which is
   * what "batch-renumbers the affected band(s)" (§6 B7) means: a cross-band
   * drag is one call, not two.
   */
  reorderBand(
    ctx: Ctx,
    band: number,
    orderedIds: readonly string[],
  ): Promise<readonly TierListItemDto[]>;

  /**
   * `system`, via the outbox — replaces the `tier_list_items_content_changed`
   * trigger plus the `generate_tier_list_insights` event trigger. Enqueued by
   * every content-changing write, never by `update`. Idempotent by
   * construction: it recomputes from current state and is a no-op (returns
   * `skipped: true`) under 3 items or inside the 24h throttle, so a
   * redelivery after a successful generation just throttles again.
   */
  generateInsights(
    ctx: Ctx,
    payload?: Record<string, unknown>,
  ): Promise<GenerateInsightsResult>;
};

export const TierListActorDescriptor: ActorDescriptor<TierListActorInterface> =
  {
    actorType: "TierListActor",
    category: "entity",
    // Each edit enqueues `generateInsights`, an LLM call.
    methods: {
      get: {},
      create: {},
      update: {},
      delete: {},
      items: {},
      addItem: { modelBacked: true },
      removeItem: { modelBacked: true },
      reorderBand: { modelBacked: true },
      generateInsights: {},
    },
  };
