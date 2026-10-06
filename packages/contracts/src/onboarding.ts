/**
 * `ItemOnboardingActor` (migration plan §2.1, §3, §8.5) — B2.
 *
 * > **`ItemOnboardingActor(onboardingId)`**
 * > - Owns: `item_onboardings`.
 * > - Methods: `start(type, images)` (AI label/barcode extraction — replaces
 * >   the six `*_defaults` actions and `getItemDefaults`; the AI call runs in
 * >   this actor's turn, which blocks only this onboarding), `defaults`,
 * >   `confirm(itemInput)` → `ItemActor.create` + `BarcodeActor.ensure` +
 * >   `BrandRegistryActor.resolve` + `CellarActor.addItem`, as idempotent
 * >   calls, `reprocess` (system, called by `OnboardingReprocessJobActor`).
 * > - Visibility: owner only.
 *
 * ## Why this actor exists at all
 *
 * It is the answer to a §8.5 problem, not a modelling one. Dapr is turn-based:
 * one turn at a time per actor id. A multi-second vision call inside
 * `UserActor` or `ItemActor` would stall every other operation for that id —
 * §2.1 says so explicitly under `UserActor` ("No AI or external call runs
 * inside a `UserActor` turn … Onboarding therefore has its own actor"). Giving
 * onboarding its own key means the only thing that queues behind a 30-second
 * model call is the one onboarding it belongs to.
 *
 * `start` is one of §8.5's two sanctioned request-driven long operations (the
 * other is `PlaceCreationActor`); set the API's actor-invocation timeout to
 * 120s for it and accept the wait.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { ItemRef, ItemType } from "./items.ts";

/**
 * `item_onboardings.status` — plain `text` with no check constraint, so this
 * list is a convention rather than an enforced domain. `START` is the column
 * default and `COMPLETED` is what `getItemDefaults` writes today; `CONFIRMED`
 * and `FAILED` are B2's additions, for the two states the old flow had nowhere
 * to record.
 */
export const ONBOARDING_STATUSES = [
  "START",
  "COMPLETED",
  "CONFIRMED",
  "FAILED",
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const isOnboardingStatus = (value: string): value is OnboardingStatus =>
  (ONBOARDING_STATUSES as readonly string[]).includes(value);

/**
 * One `item_onboardings` row.
 *
 * `defaults` is the `jsonb` column: the AI's proposal, whose per-type shape is
 * owned by the model prompt rather than by this contract, so it crosses the
 * wire as a JSON string exactly as `item_reviews.text` does.
 */
export type ItemOnboardingDto = {
  readonly id: string;
  readonly userId: string;
  readonly status: OnboardingStatus;
  readonly itemType: ItemType;
  readonly barcode: string | null;
  readonly barcodeType: string | null;
  readonly frontLabelImageId: string | null;
  readonly backLabelImageId: string | null;
  /** JSON, or `null` before `start` has run. */
  readonly defaults: string | null;
  /** The model's raw text, kept for debugging a bad extraction. */
  readonly rawDefaults: string | null;
  readonly aiModel: string | null;
  readonly confidence: number | null;
  readonly lastReprocessResult: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type StartOnboardingInput = {
  readonly itemType: ItemType;
  /** `files.id`, both optional — a barcode-only onboarding has neither. */
  readonly frontLabelImageId?: string | null;
  readonly backLabelImageId?: string | null;
  readonly barcode?: string | null;
  readonly barcodeType?: string | null;
};

/** What the AI seam returns; the actor persists it and never interprets it. */
export type ItemDefaults = {
  /** The proposed item fields, as JSON. Per-type shape owned by the prompt. */
  readonly defaults: Record<string, unknown>;
  readonly raw: string;
  readonly model: string;
  /** 0–1. Drives whether the client pre-fills or merely suggests. */
  readonly confidence: number;
  /** A brand name for `BrandRegistryActor.resolve`, if the label showed one. */
  readonly brandName?: string | null;
};

/**
 * `confirm`'s argument: the fields the user accepted, plus where the bottle
 * goes.
 *
 * Everything here is idempotent downstream, which is the whole design: the
 * `itemId` addresses `ItemActor(type:itemId)`, `BarcodeActor.ensure` is
 * find-or-create on a primary key, `BrandRegistryActor.resolve` is
 * find-or-create on `lower(name)`, and `CellarActor.addItem` keys on
 * `cellarItemId ?? idempotencyKey(ctx, …) ?? randomUUID()` (B1). So a
 * re-delivered `confirm` produces one item, one brand and one cellar item.
 */
export type ConfirmOnboardingInput = {
  /**
   * Mint it client-side. This is the idempotency key for the whole cascade —
   * without it a redelivery would create a second item.
   */
  readonly itemId?: string | null;
  readonly name: string;
  readonly description?: string | null;
  readonly country?: string | null;
  /** Per-type attributes, same bags `CreateItemInput` carries. */
  readonly attributes?: Record<string, unknown> | null;
  /** Resolved through `BrandRegistryActor`, never written directly. */
  readonly brandName?: string | null;
  /** Add the item to this cellar too (`CellarActor.addItem`). */
  readonly cellarId?: string | null;
  /** Mint it to make the cellar half idempotent as well (§8.4). */
  readonly cellarItemId?: string | null;
};

export type ConfirmOnboardingResult = {
  readonly onboardingId: string;
  readonly item: ItemRef;
  readonly brandId: string | null;
  readonly cellarItemId: string | null;
  readonly barcode: string | null;
};

export type ReprocessResult = {
  readonly onboardingId: string;
  readonly reprocessed: boolean;
  readonly reason: string;
};

export type ItemOnboardingActorInterface = {
  get(ctx: Ctx): Promise<ItemOnboardingDto>;
  /**
   * The AI call. Runs **in this actor's turn** — which is exactly why the
   * actor exists (§8.5). Idempotent on `this.key`: a retry after a completed
   * extraction returns the stored defaults without calling the model again.
   */
  start(ctx: Ctx, input: StartOnboardingInput): Promise<ItemOnboardingDto>;
  /** The stored `defaults`, without re-running the model. */
  defaults(ctx: Ctx): Promise<ItemOnboardingDto>;
  confirm(
    ctx: Ctx,
    input: ConfirmOnboardingInput,
  ): Promise<ConfirmOnboardingResult>;
};

/**
 * Delivered by the outbox from `OnboardingReprocessJobActor` — never by a
 * resolver, which cannot name it.
 */
export type InternalItemOnboardingActorInterface = {
  /** `system`; called by `OnboardingReprocessJobActor` (C4). */
  reprocess(ctx: Ctx, input: Record<string, unknown>): Promise<ReprocessResult>;
};

export const ItemOnboardingActorDescriptor: ActorDescriptor<
  ItemOnboardingActorInterface,
  InternalItemOnboardingActorInterface
> = {
  actorType: "ItemOnboardingActor",
  category: "entity",
  methods: {
    get: {},
    // §8.5: one of the two request-driven exceptions — the user is waiting
    // on a vision model's defaults inside the request.
    start: { timeoutMs: 120_000, modelBacked: true },
    defaults: {},
    // Enqueues the new item's `regenerateVector` (an embedding).
    confirm: { modelBacked: true },
  },
  internalMethods: {
    // A vision call per row, from `OnboardingReprocessJobActor`; "over a
    // few seconds" is the norm here.
    reprocess: { timeoutMs: 90_000 },
  },
};
