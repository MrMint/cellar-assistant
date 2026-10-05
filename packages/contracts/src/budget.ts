/**
 * `BudgetActor` — B5 (migration plan §2.1, §1.5; the row §6 calls B9, absorbed).
 *
 * > **`BudgetActor()`** — singleton
 * > - Owns: `api_budget_config`, `api_usage_log`.
 * > - Methods: `reserve(kind, cost)` → allowed/denied and a usage row **in one
 * >   turn** (fixes the check-then-log race), `usage(range)`.
 *
 * ## Why a true singleton
 *
 * §1.5 is explicit that singletons are for things that *should* serialize, and
 * names this one: the whole point of `reserve` is that the decision and the
 * usage row it justifies happen with nothing in between. Today's
 * `functions/_utils/budget.ts` reads an aggregate, returns `allowed`, and lets
 * the caller log afterwards — two round-trips with a window in the middle, so N
 * concurrent callers all see the same pre-spend total and all proceed. Keying
 * this actor by a constant makes Dapr serialize every reserve in the system
 * behind one turn, and the transaction inside that turn writes the usage row
 * before the next caller can read the total.
 *
 * ## The `kind` is `service` + `endpoint`, because the table's key is
 *
 * `api_budget_config`'s primary key is `(service, endpoint)`, and the per-row
 * `free_tier_monthly_requests` is per *endpoint* — Google prices autocomplete,
 * nearby search and photos differently and gives each its own free allowance.
 * §2.1's one-word `kind` is that pair; `budgetKind()` renders it for logs and
 * error messages.
 *
 * ## One deliberate behaviour change from `_utils/budget.ts`
 *
 * The old helper **fails open**: a thrown error during the check, or a missing
 * config row, returns `allowed: true` ("graceful degradation"). This actor
 * fails *closed* on a missing config row — an unconfigured service is one
 * nobody has authorised spend for, and the old default let a typo'd service
 * name spend without limit. A configured row with `monthly_budget_cents = 0`
 * and a free tier is still the normal "free tier only" setup, which is what
 * almost every row in production actually is.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";

/**
 * The single activation id. §1.5's "true singleton" — Dapr serializes every
 * turn for one actor id, and that serialization *is* the mechanism here.
 */
export const BUDGET_ACTOR_ID = "singleton";

/** `(service, endpoint)` — `api_budget_config`'s primary key (module doc). */
export type BudgetKind = {
  readonly service: string;
  readonly endpoint: string;
};

/** `"google_places/place_details"`. For messages, never for storage. */
export const budgetKind = (kind: BudgetKind): string =>
  `${kind.service}/${kind.endpoint}`;

/**
 * What `reserve` writes alongside its decision — the `api_usage_log` columns
 * the caller knows and the actor cannot infer.
 */
export type BudgetAttribution = {
  /** The row the spend is *for*, e.g. a place id. */
  readonly entityId?: string | null;
  /** `'place'`, `'item'`, … — free text, matching today's usage. */
  readonly entityType?: string | null;
  /** The user whose action caused the spend, when there is one. */
  readonly triggeredBy?: string | null;
  readonly metadata?: Record<string, unknown>;
};

export type ReserveInput = BudgetAttribution & {
  readonly kind: BudgetKind;
  /** What the call is expected to cost, in whole cents. */
  readonly estimatedCostCents: number;
  /**
   * §8.4. The idempotency key of **one paid call** — required, and never
   * inferred.
   *
   * A repeat reserve under the same key in the same month is answered with
   * the first decision and writes no second usage row, so the key decides
   * what the ledger counts. It must therefore name exactly one external call:
   *
   *  - **distinct calls get distinct keys**, including calls made inside one
   *    turn or one outbox delivery — a place's details and each of its photos,
   *    and every place in a refresh batch;
   *  - **a key is reused only by a retry that makes no new paid call** (a
   *    transport-level retry of the reserve itself, say). Where a retry really
   *    calls the provider again, it is a new call and needs a new key.
   *
   * This used to default to the delivering outbox row's id. One
   * delivery makes many calls, so every reservation after a delivery's first
   * replayed the first and recorded nothing: photos 2..n of an enrichment, and
   * every place after the first in a `PlaceRefreshJobActor` batch. The
   * default was the defect; `PlaceActor.#reservationId` documents the per-call
   * keys that replaced it.
   */
  readonly reservationId: string;
};

/**
 * `reserve`'s answer. `allowed: false` is a **return value, not a throw** —
 * `enrichFromGoogle` treats a denial as "skip the optional photo", not as a
 * failure. `BudgetExceededError` is what a *resolver-facing* method raises
 * when the denial is the whole answer; see `PlaceActor.enrichFromGoogle`.
 */
export type ReserveResult = {
  readonly allowed: boolean;
  /**
   * What was actually logged. `0` inside the free tier — the request counts
   * against `free_tier_monthly_requests` but costs nothing.
   */
  readonly effectiveCostCents: number;
  /** Paid cents already spent this month for this `(service, endpoint)`. */
  readonly currentSpendCents: number;
  readonly limitCents: number;
  /** Requests logged this month for this `(service, endpoint)`. */
  readonly requestCount: number;
  readonly freeTierLimit: number;
  readonly isEnabled: boolean;
  /** Why, in one phrase: `"within free tier"`, `"free tier exhausted"`, … */
  readonly reason: string;
  /** The `api_usage_log` row id, or `null` when nothing was written. */
  readonly usageId: string | null;
};

/** `usage`'s window. Both ends ISO-8601; `to` is exclusive. */
export type UsageRange = {
  readonly from: string;
  readonly to: string;
  /** Narrow to one service, or one `(service, endpoint)`. */
  readonly service?: string;
  readonly endpoint?: string;
};

export type UsageBucket = {
  readonly service: string;
  readonly endpoint: string;
  readonly requestCount: number;
  readonly spendCents: number;
};

export type UsageReport = {
  readonly from: string;
  readonly to: string;
  readonly buckets: readonly UsageBucket[];
  readonly totalRequestCount: number;
  readonly totalSpendCents: number;
};

/** `setBudget`'s input — the admin repair path for a config row. */
export type SetBudgetInput = {
  readonly kind: BudgetKind;
  readonly monthlyBudgetCents: number;
  readonly freeTierMonthlyRequests: number;
  readonly isEnabled: boolean;
};

export type BudgetConfigDto = {
  readonly service: string;
  readonly endpoint: string;
  readonly monthlyBudgetCents: number;
  readonly freeTierMonthlyRequests: number;
  readonly isEnabled: boolean;
  readonly updatedAt: string;
};

/**
 * `BudgetActor()` — singleton, entity category (it owns two tables).
 *
 * `reserve` is the only method a spending actor calls, and it is the only one
 * that writes `api_usage_log`. §8.5 lists `BudgetActor` as a sanctioned
 * synchronous target for an entity actor, so `PlaceActor.enrichFromGoogle`
 * calls it directly rather than through the outbox.
 */
export type BudgetActorInterface = {
  /** Admin (or system). Reading spend is not a user-facing capability. */
  usage(ctx: Ctx, range: UsageRange): Promise<UsageReport>;
  /** Admin only. Upserts one `(service, endpoint)` config row. */
  setBudget(ctx: Ctx, input: SetBudgetInput): Promise<BudgetConfigDto>;
  /** Admin only. Every configured `(service, endpoint)`. */
  config(ctx: Ctx): Promise<readonly BudgetConfigDto[]>;
};

/**
 * What a seam declares about the call it is about to make.
 *
 * The token counts are the seam's **upper-bound estimate**, not a measurement:
 * output length is unknowable before generation, and a reservation that has to
 * refuse has to be made before the call. `services/actors/src/lib/ai/budget.ts`
 * builds them, and over-books by construction — see its `estimate*` functions
 * for why the error only ever runs one way.
 *
 * Declared here rather than beside `BudgetActor` because it is half of
 * {@link InternalBudgetActorInterface}: the actor host's typed client reads the
 * argument types off the contract, and a contract cannot import the actor.
 */
export type ModelReserveInput = {
  readonly seam: string;
  /** `AIProvider.name`. Decides free-vs-paid, and is recorded. */
  readonly provider: string;
  /** The resolved model id, not the quality tier. Decides the rate. */
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /**
   * §8.4's replay does **not** apply: a redelivered model call really does
   * call the model again and really does cost again. Every reserve is
   * therefore distinct, and the caller supplies a per-call id — never the
   * outbox row's: `MenuMatchJobActor.processBatch` alone makes one model call
   * per row of a batch, all on the same delivery. (Google reservations are
   * per call too since the outbox default was removed; what differs is only
   * that a repeated Google key replays and a repeated model key is refused.)
   *
   * **It must be unique across restarts and replicas**, and a repeat in the
   * same month is refused with a `ConflictError` rather than answered as a
   * replay: one reservation is one call, so a second reservation under the
   * same id is a second call, and allowing it without a row is an allow that
   * counts against nothing. `lib/ai/budget.ts` mints a uuid per call.
   */
  readonly reservationId: string;
  readonly entityId?: string | null;
  readonly entityType?: string | null;
  readonly metadata?: Record<string, unknown>;
};

/**
 * What the provider says the call actually cost, once it has returned.
 *
 * `usageId` is the row `reserveForModel` wrote; settling replaces that row's
 * estimate with the measurement. There is no new row and no second request
 * counted — one model call is one request, whatever it turned out to cost.
 */
export type ModelSettleInput = {
  readonly usageId: string;
  readonly seam: string;
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
};

/**
 * The doors only other actors walk through, never a resolver: the model seams
 * (`services/actors/src/lib/ai/budget.ts`) for `reserveForModel` and
 * `settleForModel`, the spending entity and job actors for `reserve`, and
 * `GooglePlacesActor` for `reserveForSearch`. A resolver cannot name them:
 * `context.actor(BudgetActorDescriptor, …)` is typed over
 * {@link BudgetActorInterface} alone.
 */
export type InternalBudgetActorInterface = {
  /**
   * The same decision as `reserve`, but a denial is a typed
   * `BudgetExceededError` rather than a return value.
   *
   * §2.1 describes `reserve` as returning allowed/denied and §8.3 lists
   * `BudgetExceeded` among the five errors a mutation's result union carries;
   * those only reconcile through two entry points, because the two callers
   * genuinely differ. `PlaceActor.enrichFromGoogle` treats a denial as "skip
   * the optional photo" and needs the union; a caller whose *whole* answer was
   * the thing it could not afford — C1's `GooglePlacesActor.autocomplete` has
   * nothing but suggestions to return — needs the throw, and a `reserve`
   * result it must remember to check is exactly the check-then-act shape this
   * actor exists to remove.
   *
   * Same `system`/`admin` restriction, same idempotency key, same usage row.
   *
   * Internal since Wave 2b's follow-up: it was on the public interface, where
   * `services/api` could type a call to it, although no resolver exposes it
   * and nothing — resolver or actor — has ever called it.
   */
  reserveOrThrow(ctx: Ctx, input: ReserveInput): Promise<ReserveResult>;
  /**
   * Reserve against one model seam's budget, with the calling user's own ctx.
   * The seam must be one of `MODEL_SEAMS`; the price is the actor's, not the
   * caller's. See `BudgetActor.reserveForModel`.
   */
  reserveForModel(ctx: Ctx, input: ModelReserveInput): Promise<ReserveResult>;
  /** Replace a reservation's estimate with the provider's measurement. */
  settleForModel(ctx: Ctx, input: ModelSettleInput): Promise<void>;
  /**
   * §8.4: idempotent on `input.reservationId`, which every caller supplies
   * (see `ReserveInput.reservationId` — there is no default). A repeat
   * reserve with the same key in the same month returns the first decision
   * and writes no second usage row; an empty key is a `ValidationError`.
   *
   * `system` or `admin` only: a signed-in user may not charge the budget
   * directly, only through an actor that has already authorised the work.
   */
  reserve(ctx: Ctx, input: ReserveInput): Promise<ReserveResult>;
  /**
   * `reserve` for a **search actor**, callable with the asking user's own ctx —
   * added by C1.
   *
   * The note above predicted `GooglePlacesActor` would want `reserveOrThrow`.
   * It wants neither: a denial there is "no suggestions", not an error, which
   * is what the functions it replaces did (`return null`) and what a type-ahead
   * box should show when the month's autocomplete money is gone. What it
   * actually needed was a door it could walk through at all — `reserve` and
   * `reserveOrThrow` are both `system`/`admin` only, autocomplete is answered
   * synchronously inside a request so there is no system turn, and §1.6
   * forbids a search actor from minting a `system` ctx.
   *
   * Narrow by construction: an allow-list of `(service, endpoint)` pairs (the
   * two cheap Google search endpoints), the cost taken from that list rather
   * than from `input`, `triggeredBy` forced to `ctx.viewerId`, and anonymous
   * refused. See `BudgetActor.reserveForSearch` and `SEARCH_SPENDERS`.
   */
  reserveForSearch(ctx: Ctx, input: ReserveInput): Promise<ReserveResult>;
};

export const BudgetActorDescriptor: ActorDescriptor<
  BudgetActorInterface,
  InternalBudgetActorInterface
> = {
  actorType: "BudgetActor",
  category: "entity",
  methods: {
    usage: {},
    setBudget: {},
    config: {},
  },
  internalMethods: {
    reserveOrThrow: {},
    reserveForSearch: {},
    reserve: {},
    reserveForModel: {},
    settleForModel: {},
  },
};
