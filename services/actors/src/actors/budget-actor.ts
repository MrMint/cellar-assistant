/**
 * `BudgetActor` — B5 (migration plan §2.1, §1.5; the §6 row labelled B9,
 * absorbed).
 *
 * > **`BudgetActor()`** — singleton
 * > - Owns: `api_budget_config`, `api_usage_log`.
 * > - Methods: `reserve(kind, cost)` → allowed/denied and a usage row **in one
 * >   turn** (fixes the check-then-log race), `usage(range)`.
 *
 * ## The race this closes, precisely
 *
 * `functions/_utils/budget.ts` is two round-trips: `checkBudget` reads the
 * aggregate and returns `allowed`, then the caller makes its API call and
 * calls `logApiUsage` afterwards. Between those, every other caller reads the
 * same pre-spend total. N concurrent enrichments all see "0 of 500 cents
 * spent" and all proceed, so the cap is advisory.
 *
 * **The singleton key serialises it in the normal case.** Keying this actor by a
 * constant makes Dapr serialize every reserve in the system behind one turn
 * (§1.5: singletons are for what *should* serialize), and a turn does not end
 * until its transaction has committed — so the next reserve's count always
 * sees the previous reserve's row.
 *
 * **And a per-kind database lock makes it exact without the key (Wave 6).**
 * The count and the `api_usage_log` insert share one `this.tx()`, which makes
 * the decision and its row commit or vanish together — but at READ COMMITTED
 * a transaction alone is not a serialiser: two running at once would each
 * count the committed rows, miss the other's uncommitted insert, and both be
 * allowed. That is what Dapr running two turns of this id at once (a placement
 * split during a rolling deploy) would do. So the first statement of every
 * `#reserve` and `settleForModel` transaction is `pg_advisory_xact_lock` on
 * its `(service, endpoint)` (`lockBudgetKind`), held to commit. Every cap here
 * — the replay lookup, the per-user windows, the request cap, the money and
 * its nanocent carry — is scoped to exactly one `(service, endpoint)`, and
 * there is no cap across kinds, so that one lock covers all of them.
 *
 * Under the singleton the lock never waits (one turn at a time already), so
 * it changes nothing in the normal case; what it buys is that the caps no
 * longer *depend* on the key. That is also what would make keying this actor
 * per kind, or dropping the hop altogether, a routing change rather than a
 * correctness one — `docs/architecture/actor-keys.md` measures both and
 * defers them to after cutover.
 *
 * ## Fails closed, unlike the helper it replaces
 *
 * The old helper fails *open* twice over: a thrown error during the check
 * returns `allowed: true`, and so does a missing config row ("allowing by
 * default"). Both are reversed here. An unconfigured `(service, endpoint)` is
 * one nobody authorised spend for, and the old default meant a typo'd service
 * name spent without limit and without a cap to stop it. A configured row with
 * `monthly_budget_cents = 0` plus a free tier is still the normal "free tier
 * only" setup — which is what almost every row in production is — and that
 * still works exactly as before.
 *
 * A thrown error is no longer swallowed either: it propagates, and the caller
 * (`PlaceActor.enrichFromGoogle`) fails its turn rather than spending money it
 * could not account for.
 *
 * ## Model calls, not just Google (X1c)
 *
 * This actor covered exactly one service for as long as it existed, and
 * `services/api/src/limits.ts` names what that left uncovered: *"nothing in
 * `services/actors/src/lib/ai/` imports `BudgetActor` — it covers Google
 * Places only. So N aliases of `itemSearch` in one request is N model
 * inferences with no spend gate anywhere on the path."* `reserveForModel` and
 * `settleForModel` are the gate; `services/actors/src/lib/ai/budget.ts` is the
 * caller. Three things about model spend are unlike Google spend and each one
 * is argued where it lands:
 *
 *  - **A model call costs a fraction of a cent**, so an integer-cent ledger
 *    rounds every one of them to nothing. See {@link MODEL_RATES} for the
 *    carry that fixes it.
 *  - **The cost is not knowable before the call**, because the output length
 *    is what generation decides. So a reservation prices an estimate and
 *    `settleForModel` writes the measurement over it.
 *  - **The cheapest provider is free**, so money cannot be the only bound.
 *    See `ModelSpender.maxMonthlyRequests`.
 *
 * ## Idempotency (§8.4)
 *
 * The key is `input.reservationId`, **required and never inferred**. It is
 * stored in `api_usage_log.metadata` and a repeat reserve **in the same
 * month** finds that row and returns the first decision without writing a
 * second — so the key is what the ledger counts, and it has to name exactly
 * one external call (`ReserveInput.reservationId`).
 *
 * It used to default to the delivering outbox row's id, on the
 * theory that a redelivered enrichment must not double-charge. That default
 * was the bug: one delivery makes many paid calls, so every reservation after
 * a delivery's first replayed the first and wrote nothing — photos 2..n of
 * an enrichment, and every place after the first in a ten-place
 * `PlaceRefreshJobActor` batch, which hands one delivery ctx to all ten. And
 * the theory did not need it: a redelivery that makes no second call makes no
 * second reservation either, because `PlaceActor`'s freshness check runs
 * *before* it reserves. `PlaceActor.#reservationId` has the per-site
 * reasoning. The month bound is load-bearing twice
 * over: the lookup runs inside this singleton on every reservation, and
 * unbounded it was a scan of the endpoint's whole history; and a hit in an
 * earlier month is a row that counts against no cap this month, so honouring
 * it was an allow nothing counted. A repeat in a later month is charged again,
 * which over-counts by one call at worst.
 *
 * **A model call has no replay at all.** Each model reservation stands for
 * exactly one call, and a redelivered generation really does call the model
 * again, so a repeated model reservation id is a `ConflictError`, never an
 * "already reserved" allow — see
 * `ModelReserveInput.reservationId`.
 *
 * A *denied* reserve writes nothing, so it has nothing to key on and is
 * re-evaluated on redelivery. That is the right answer: no money was spent, and
 * the budget may have been raised in between.
 *
 * `idx_api_usage_log_reservation_id` (partial, on `metadata->>'reservationId'`)
 * serves the lookup.
 *
 * ## The config cache
 *
 * §1.1: an actor loads its aggregate on activate and caches it. This one's
 * aggregate is `api_budget_config` — a handful of rows that change only through
 * `setBudget`, on this same actor, which reloads. It is therefore authoritative
 * for as long as the activation lives. A row edited by hand in SQL is *not*
 * picked up until the activation idles out; that is the same trade every actor
 * in this codebase makes, and `setBudget` is the supported way to change one.
 *
 * Usage totals are deliberately **not** cached: they change on every reserve,
 * including this actor's own.
 */
import type {
  ActorCategory,
  BudgetActorInterface,
  BudgetConfigDto,
  BudgetKind,
  Ctx,
  InternalBudgetActorInterface,
  ModelReserveInput,
  ModelSettleInput,
  ReserveInput,
  ReserveResult,
  SetBudgetInput,
  UsageBucket,
  UsageRange,
  UsageReport,
} from "@cellar-assistant/contracts";
import {
  BUDGET_ACTOR_ID,
  BudgetActorDescriptor,
  BudgetExceededError,
  budgetKind,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@cellar-assistant/contracts";
import { apiBudgetConfig, apiUsageLog, outbox } from "@cellar-assistant/db";

import type { SQL } from "@cellar-assistant/db/orm";
import { and, eq, gte, lt, sql } from "@cellar-assistant/db/orm";
import { EntityActorBase, exactKey, type KeyShape } from "../lib/actor-base.ts";
import {
  ADVISORY_LOCK_NAMESPACE,
  advisoryLockKeyForText,
  lockAll,
} from "../lib/advisory-locks.ts";
import type { FreeModelProviders } from "../lib/ai/billing.ts";
import {
  ALWAYS_FREE_PROVIDERS,
  freeModelProviders,
} from "../lib/ai/billing.ts";
import type { DbOrTx } from "../lib/db.ts";
import { causedByOf } from "../lib/delivery.ts";
import {
  requireAdmin,
  requirePrivileged,
  requireSignedIn,
} from "../lib/guards.ts";

/** The actor *type* as registered with Dapr. */
export const BUDGET_ACTOR_TYPE = "BudgetActor";

type ConfigRow = typeof apiBudgetConfig.$inferSelect;

export type BudgetAggregate = {
  /** Keyed `service/endpoint` — `budgetKind()`'s rendering. */
  readonly configs: ReadonlyMap<string, ConfigRow>;
} & ModelBudgetPolicy;

const configRowToDto = (row: ConfigRow): BudgetConfigDto => ({
  service: row.service,
  endpoint: row.endpoint,
  monthlyBudgetCents: row.monthlyBudgetCents,
  freeTierMonthlyRequests: row.freeTierMonthlyRequests,
  isEnabled: row.isEnabled,
  updatedAt: row.updatedAt.toISOString(),
});

/** `count`/`sum` come back from `pg` as strings for `bigint`/`numeric`. */
const int = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * §1.6/§2.1: a signed-in user may not charge the budget directly, only cause
 * a system turn that does. `PlaceActor.enrichFromGoogle` is built around
 * exactly this — the user half queues, the system half spends.
 */
const privilegedOnly = (method: string): string =>
  `BudgetActor.${method} is system or admin only; a request may not ` +
  "charge the budget directly, only cause a system turn that does";

/**
 * Serialise every reservation and settlement of one `(service, endpoint)`
 * behind a transaction-scoped advisory lock (module doc, "The race this
 * closes"). Must run inside the transaction whose count and write it guards.
 */
export const lockBudgetKind = (
  tx: DbOrTx,
  kind: BudgetKind,
): Promise<unknown> =>
  lockAll(tx, [
    advisoryLockKeyForText(
      ADVISORY_LOCK_NAMESPACE.budgetKind,
      budgetKind(kind),
    ),
  ]);

const requireKind = (kind: BudgetKind): BudgetKind => {
  const service = kind?.service?.trim() ?? "";
  const endpoint = kind?.endpoint?.trim() ?? "";
  if (service === "") {
    throw new ValidationError("a budget kind needs a service");
  }
  // `api_budget_config.endpoint` defaults to `''` and is part of the primary
  // key, so an empty endpoint is a legal row, not a missing value.
  return { service, endpoint };
};

const requireIso = (value: string, what: string): Date => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(
      `${what} must be an ISO-8601 instant, got ${value}`,
    );
  }
  return parsed;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `api_usage_log.entity_id` and `.triggered_by` are `uuid` columns, so a
 * caller that passes anything else would otherwise reach Postgres and come
 * back as an unmapped 500 — which is exactly what a live run of B5's
 * acceptance script did. A caller bug is a `ValidationError`, not a 500, and
 * silently nulling the attribution instead would lose the audit trail the
 * usage log exists for.
 */
const requireUuidOrNull = (
  value: string | null | undefined,
  what: string,
): string | null => {
  if (value === undefined || value === null || value === "") return null;
  if (!UUID_PATTERN.test(value)) {
    throw new ValidationError(`${what} must be a uuid, got ${value}`);
  }
  return value;
};

/** `getMonthStart()` from the helper this replaces, in UTC. */
export const monthStart = (now: Date = new Date()): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/** "The month this transaction is in", by the database's clock. */
const CURRENT_MONTH = "current" as const;

/** Which calendar month (UTC) a ledger query is about. */
type MonthAnchor = typeof CURRENT_MONTH | Date;

/**
 * `created_at` within the UTC calendar month containing `month`, as one SQL
 * predicate whose bounds Postgres computes.
 *
 * `now()` is the transaction's start, which is also what a row inserted in the
 * same transaction gets for `created_at` — so a reservation is capped against
 * exactly the month its row is counted in, even in the last millisecond of
 * one. The upper bound matters only for a past month (a settlement of last
 * month's row), where "since the first" alone would sweep this month in too.
 */
const inMonthOf = (month: MonthAnchor): SQL => {
  const start =
    month === CURRENT_MONTH
      ? sql`date_trunc('month', now(), 'UTC')`
      : sql`date_trunc('month', ${month.toISOString()}::timestamptz, 'UTC')`;
  return sql`(${apiUsageLog.createdAt} >= ${start} and ${apiUsageLog.createdAt} < ${start} + interval '1 month')`;
};

/**
 * The only `(service, endpoint)` pairs a **search actor** may charge, and what
 * each costs — see `BudgetActor.reserveForSearch`. Both are C1's
 * `GooglePlacesActor` endpoints; the costs match
 * `services/actors/src/lib/google-places.ts`'s `API_COST_CENTS`, duplicated here
 * rather than imported so that widening the cost table cannot silently widen
 * what a request may spend.
 */
export const SEARCH_SPENDERS: Readonly<Record<string, number>> = {
  "google_places/autocomplete": 1,
  "google_places/nearby_search": 4,
};

/* -------------------------------------------------------------------------- */
/* Model calls (X1c)                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `api_budget_config.service` for every model call, whichever provider serves
 * it. One service, seven endpoints — see {@link MODEL_SEAMS}.
 *
 * Not per-provider (`vertex_ai/…`, `ollama/…`), deliberately. A deployment
 * runs **one** provider at a time (`AI_PROVIDER` selects exactly one), so a
 * provider-keyed service would make the month's ledger reset every time an
 * operator switched providers, and a cap set against `vertex_ai/menu_extraction`
 * would silently stop applying the moment someone pointed the host at a local
 * server. The provider and the model are recorded per row in
 * `api_usage_log.metadata` instead, where they describe the spend without
 * partitioning the cap.
 */
export const AI_MODEL_SERVICE = "ai_model";

/**
 * Every place in this system that calls a model, one endpoint each.
 *
 * The list is exhaustive by construction: `services/actors/src/lib/ai/seams.ts`
 * holds all seven provider call sites (six `generateContent`, one
 * `generateEmbeddings`), `installSeams` binds one metered provider per seam,
 * and `install.test.ts` asserts that every seam it installs charges. A new
 * seam that forgets to meter itself cannot reach a provider at all, because
 * `providerFor` is the only way `seams.ts` gets one.
 */
export const MODEL_SEAMS = [
  "embedding",
  "item_defaults",
  "menu_extraction",
  "menu_match",
  "place_review",
  "recipe_photo",
  "tier_list_insights",
] as const;

export type ModelSeam = (typeof MODEL_SEAMS)[number];

export const isModelSeam = (value: string): value is ModelSeam =>
  (MODEL_SEAMS as readonly string[]).includes(value);

/** 1 cent = 10⁹ nanocents. See {@link MODEL_RATES} for why the ledger needs them. */
export const NANOCENTS_PER_CENT = 1_000_000_000;

export type ModelSpender = {
  /**
   * The cap that binds when the money does not.
   *
   * A request cap is the **only** bound that survives a free provider. Local
   * Ollama and vLLM cost nothing, so a runaway loop against them books zero
   * cents for ever and `monthly_budget_cents` never fires — which is precisely
   * the shape of failure this whole change exists to stop, because the loop
   * that is free on a laptop is an invoice on Vertex. It is also the only
   * bound that does not depend on the caller's own estimate being honest: the
   * seam declares its token counts, but it cannot declare a call to be fewer
   * than one request.
   */
  readonly maxMonthlyRequests: number;
  /**
   * The `monthly_budget_cents` used when `api_budget_config` has no row for
   * this seam. See `BudgetActor.reserveForModel` for why an absent row is a
   * default here rather than the refusal it is for Google Places.
   */
  readonly defaultMonthlyBudgetCents: number;
};

/**
 * The only endpoints a model call may be charged to, and what bounds each.
 *
 * Both numbers are **bounds, not forecasts** — they are set where a month of
 * ordinary use is nowhere near them and a loop hits them in minutes, and they
 * are meant to be raised by `setBudget` (cents) or `AI_BUDGET_MAX_REQUESTS`
 * (requests) rather than tuned here. The cents defaults are sized off the
 * published per-call prices in {@link MODEL_RATES}: roughly $5 a month for
 * each of the three vision seams, $2 for each of the text seams, $2 for
 * embeddings. Embeddings get the largest request allowance and the smallest
 * price per call, because they are the seam a single GraphQL document can fan
 * out (see `services/api/src/limits.ts`, `MAX_MODEL_BACKED_FIELDS`).
 *
 * ## These caps are **global, not per user**
 *
 * One counter per seam for the whole deployment. `api_budget_config` is keyed
 * `(service, endpoint)` and has no user dimension, and giving it one is a
 * column, an index on `api_usage_log.triggered_by`, and a contract change.
 *
 * **The failure that choice buys, stated plainly: one user in a retry loop can
 * exhaust a seam for everybody until the month turns.** One person's bug
 * becomes everyone's outage. The alternative failure is the opposite shape — a
 * per-user cap bounds fairness and bounds nothing about the invoice, because
 * total spend is then the cap times however many accounts exist. Global was
 * chosen because the thing that motivated this change is an unbounded loop
 * becoming a real bill, and only a global counter bounds a bill.
 *
 * Four things blunt the failure: the caps are per *seam*, so a loop in menu
 * extraction cannot spend embeddings' allowance and the rest of the app is
 * untouched; `MAX_MODEL_BACKED_FIELDS` still bounds one request; every usage
 * row carries `triggered_by`, so the culprit is one query away; and — since
 * W5 — {@link USER_CAPS} holds each account to an hourly and a daily share of
 * every seam, so one looping account now stops at its own cap long before the
 * global one. These global caps remain the only bound on the *bill*; the
 * per-user ones bound how much of it any single account can take.
 *
 * ### What to do at 3am when one binds
 *
 * The refusal names the seam and which cap it was. Then:
 *
 * 1. **Find out whether it is a loop or real growth**, because the remedies are
 *    opposite: `select triggered_by, count(*) from api_usage_log where service
 *    = 'ai_model' and endpoint = '<seam>' and created_at >= date_trunc('month',
 *    now()) group by 1 order by 2 desc limit 10`. One viewer with most of the
 *    month's calls is a loop — raising the cap then just buys the loop more
 *    money.
 * 2. **Raise the money** with `setBudget` on `ai_model/<seam>`; it takes effect
 *    on this actor's next activation with no deploy and no restart.
 * 3. **Raise the request cap** with `AI_BUDGET_MAX_REQUESTS=<seam>=<count>`,
 *    which is read per activation and so needs the actor host restarted.
 * 4. **Disable the seam** (`setBudget … isEnabled: false`) if the loop cannot
 *    be stopped at its source. Everything else keeps working; that seam fails
 *    with its own message rather than the whole app going dark.
 *
 * ### Which cap actually binds first
 *
 * Worth knowing before tuning either, and it differs by seam. On
 * `gemini-3.x-flash` at its standing rate a vision call is about 5k input
 * tokens (one image at {@link MODEL_RATES}' assumptions plus the prompt) and
 * about 1.5k output, so roughly **1.9 cents** — which means the $5 cents cap
 * stops a vision seam at around **260 calls a month**, long before its 5,000
 * request cap. An embedding is about 20 tokens and roughly **0.0004 cents**, so
 * its $2 buys 500,000 of them and the **200,000 request cap is what binds**.
 * That asymmetry is deliberate: money is the real bound on the expensive
 * seams, and request count is the real bound on the cheap one that fans out.
 */
export const MODEL_SPENDERS: Readonly<Record<ModelSeam, ModelSpender>> = {
  embedding: { maxMonthlyRequests: 200_000, defaultMonthlyBudgetCents: 200 },
  item_defaults: { maxMonthlyRequests: 5_000, defaultMonthlyBudgetCents: 500 },
  menu_extraction: {
    maxMonthlyRequests: 5_000,
    defaultMonthlyBudgetCents: 500,
  },
  menu_match: { maxMonthlyRequests: 20_000, defaultMonthlyBudgetCents: 200 },
  place_review: { maxMonthlyRequests: 20_000, defaultMonthlyBudgetCents: 200 },
  recipe_photo: { maxMonthlyRequests: 5_000, defaultMonthlyBudgetCents: 500 },
  tier_list_insights: {
    maxMonthlyRequests: 20_000,
    defaultMonthlyBudgetCents: 200,
  },
};

/** Nanocents per 1000 tokens. `output` is unused by an embedding model. */
export type ModelRate = {
  readonly input: number;
  readonly output: number;
};

/**
 * `$X per million tokens` is how every provider quotes a price; this is how it
 * lands in the ledger's unit. 1000 tokens is a thousandth of a million, a
 * dollar is 100 cents, and a cent is 10⁹ nanocents — so `X * 1e8`.
 */
export const perMillionDollars = (dollars: number): number =>
  Math.round(dollars * 1e8);

/**
 * **Why the ledger counts nanocents and not cents.**
 *
 * `api_usage_log.estimated_cost_cents` is an `integer`, and a model call does
 * not cost a whole cent. A vision extraction on Gemini Flash is around 0.1
 * cents; an embedding is around 0.00005. Rounding each call to the nearest
 * cent gives 0 for every one of them, so `sum(estimated_cost_cents)` stays 0
 * for ever, `monthly_budget_cents` never binds, and the whole mechanism reads
 * as working while bounding nothing — the exact class of defect this
 * repository keeps finding downstream of the guard that was supposed to catch
 * it. Rounding *up* to a cent is worse in the other direction: it overstates a
 * real month's spend by two to three orders of magnitude, so an operator who
 * trusts the number sets a cap that refuses real traffic.
 *
 * So each row records its exact price in `metadata.nanoCents` and books the
 * **carry** into the integer column: the cents a row books are
 * `floor(total nanocents this month / 1e9) - cents already booked this month`,
 * clamped at zero. Ten calls at 0.1 cents book 0 cents for the first nine and
 * then 1. The singleton serializes every reserve, so there is no interleaving
 * among reservations to get this wrong.
 *
 * **What that guarantees, precisely**: `sum(estimated_cost_cents)` is never
 * *below* the month's exact spend floored to a cent — the direction a budget
 * must not err in. Reservations alone keep it exactly equal. A settlement can
 * leave it *above*: settling a row down re-derives that row's cents, but it
 * cannot take cents back from a row that booked none, so the ledger stays
 * ahead of the exact total. Each such settle-down adds at most a cent, and
 * they accumulate — several interleaved with the calls that carried the cents
 * leave it several cents ahead. Later calls absorb the excess, booking nothing
 * until the exact total catches up. `budget-actor.test.ts` holds both halves.
 *
 * ## Where these numbers come from, and how to tell when they are wrong
 *
 * **Source: https://ai.google.dev/gemini-api/docs/pricing, paid tier, read
 * 2026-09-19.** Read off the published page, not off an invoice — this file
 * cannot know what an account is actually billed, because committed-use
 * discounts, batch rates, context caching and provisioned throughput all
 * change it. Every one of those makes the real price *lower*, so a table that
 * is merely stale over-books rather than under-books, which is the direction
 * to be wrong in. Reconcile against the provider's own bill;
 * `api_usage_log.metadata` carries the model, the provider and both token
 * counts for exactly that, and `AI_MODEL_PRICES` is how you correct it without
 * a deploy.
 *
 * Three judgements in the table that are not simply transcription:
 *
 * 1. **The 3.x Flash models are priced at their standing rate, not their
 *    introductory one.** $0.75/$3.75 per million runs through 2026-12-31 and
 *    then doubles to $1.50/$7.50. Booking the introductory rate would mean the
 *    ledger silently under-books from January 1st, which is the one failure a
 *    budget may not have. So it over-books by 2× until the year turns, and
 *    then it is exact.
 * 2. **Tiered models are priced at their short-context tier.** `gemini-2.5-pro`
 *    and `gemini-3.1-pro` charge more above 200k input tokens. Nothing here can
 *    reach that: `lib/ai/budget.ts` allows 4200 tokens per image and these
 *    prompts are a few thousand more, so a recipe photo with every image
 *    attached is two orders of magnitude short of the boundary. If a seam ever
 *    sends a 200k-token prompt, this under-books and the settlement will not
 *    catch it — the token counts would be right and the *rate* wrong.
 * 3. **Audio rates are ignored**, because no seam sends audio. `gemini-2.5-flash`
 *    is $1.00 per million for audio against $0.30 for text, image and video.
 *
 * The `gemini-2.0-*` rows are **not on that page** — they are last-known list
 * prices for models Google has since delisted from it, kept because dropping
 * them would price a still-running 2.0 deployment at
 * {@link UNKNOWN_PAID_RATE} and bind its cap forty times too early. Treat them
 * as unverified and set `AI_MODEL_PRICES` if you run one.
 *
 * Matching is by longest key prefix, because a provider's model ids carry
 * dated suffixes (`gemini-2.5-flash-001`) that price the same as the family.
 */
export const MODEL_RATES: Readonly<Record<string, ModelRate>> = {
  // Introductory pricing through 2026-12-31 is half of this; see §1 above.
  "gemini-3.8-flash": {
    input: perMillionDollars(1.5),
    output: perMillionDollars(7.5),
  },
  "gemini-3.7-flash": {
    input: perMillionDollars(1.5),
    output: perMillionDollars(7.5),
  },
  "gemini-3.6-flash": {
    input: perMillionDollars(1.5),
    output: perMillionDollars(7.5),
  },
  "gemini-3.5-flash-lite": {
    input: perMillionDollars(0.3),
    output: perMillionDollars(2.5),
  },
  "gemini-3.5-flash": {
    input: perMillionDollars(1.5),
    output: perMillionDollars(9),
  },
  "gemini-3.1-flash-lite": {
    input: perMillionDollars(0.25),
    output: perMillionDollars(1.5),
  },
  // ≤200k input tokens; see §2 above.
  "gemini-3.1-pro": {
    input: perMillionDollars(2),
    output: perMillionDollars(12),
  },
  "gemini-2.5-pro": {
    input: perMillionDollars(1.25),
    output: perMillionDollars(10),
  },
  "gemini-2.5-flash-lite": {
    input: perMillionDollars(0.1),
    output: perMillionDollars(0.4),
  },
  "gemini-2.5-flash": {
    input: perMillionDollars(0.3),
    output: perMillionDollars(2.5),
  },
  // Delisted from the pricing page; unverified. See the note above.
  "gemini-2.0-flash-lite": {
    input: perMillionDollars(0.075),
    output: perMillionDollars(0.3),
  },
  "gemini-2.0-flash": {
    input: perMillionDollars(0.1),
    output: perMillionDollars(0.4),
  },
  // "Gemini Embedding 2", text input: $0.20 per million, paid tier
  // (ai.google.dev/gemini-api/docs/pricing, re-read 2026-09-28 for
  // `gemini-embedding-2`, production's model). Its images are $0.00012 each,
  // which the embedding seam reserves as 600 tokens at this rate
  // (`EMBEDDING_IMAGE_TEXT_TOKENS`, `../lib/ai/budget.ts`). The
  // `text-embedding-*` ids are the older names for the same seat in the
  // configuration and are not separately listed.
  "gemini-embedding": { input: perMillionDollars(0.2), output: 0 },
  "text-embedding": { input: perMillionDollars(0.2), output: 0 },
  "text-multilingual-embedding": {
    input: perMillionDollars(0.2),
    output: 0,
  },
};

/**
 * What an unrecognised model on a **paid** provider is charged.
 *
 * The dearest thing on the pricing page — `gemini-3.1-pro` above 200k input
 * tokens, $4.00/$18.00 per million — not zero and not an average. An unknown
 * model is either new or misspelled; charging it nothing is how a provider
 * swap silently unmeters the system, and charging it the most expensive rate
 * anyone publishes makes the cap bind early and visibly rather than late and
 * expensively. The request cap in {@link MODEL_SPENDERS} binds either way.
 *
 * This is the row a deployment hits after Google ships its next model, which
 * is the ordinary case and not an exceptional one. It is meant to be survived
 * rather than avoided: the symptom is a seam refusing sooner than it should,
 * the diagnosis is `metadata.model` in `api_usage_log`, and the fix is one
 * `AI_MODEL_PRICES` entry.
 */
export const UNKNOWN_PAID_RATE: ModelRate = {
  input: perMillionDollars(4),
  output: perMillionDollars(18),
};

/*
 * Providers that bill nothing, because they run on hardware we already own —
 * decided by `../lib/ai/billing.ts`, not listed here, because for one of them
 * the answer depends on where it points.
 *
 * `ollama` is always free. `openai-compatible` is free only when the endpoint
 * a call goes to is loopback, private or a container-network name, or
 * `OPENAI_COMPAT_FREE=true` says so; pointed at a hosted API such as
 * api.openai.com it is a paid provider like any other, priced by
 * `AI_MODEL_PRICES` or at `UNKNOWN_PAID_RATE`. It used to be free by
 * name, which meant a deployment billed by OpenAI booked every call at zero
 * cents and the cents cap could never bind.
 *
 * **The free ones are still metered, at a price of zero.** Not metering them
 * would make the local lane the one place a runaway loop is invisible, which
 * inverts the point: the loop is cheap to *discover* locally and expensive to
 * discover in production. Every reserve still happens, still writes an
 * `api_usage_log` row, still counts against `maxMonthlyRequests` and still
 * refuses at the same request count it would refuse at on Vertex — so a seam
 * that loops fails on a laptop, in a test, with the same `BudgetExceededError`
 * an operator would have read off a bill. The one thing that differs is the
 * money, because the money really is different.
 */

/**
 * `AI_MODEL_PRICES`, as `model=<input>/<output>` pairs in nanocents per 1000
 * tokens, comma-separated: `gemini-2.5-flash=30000000/250000000`.
 *
 * Throws on anything it cannot read. An operator who sets this has said what
 * their account is billed; the only honest answer to "…but it is malformed" is
 * to stop, the same answer `installAI()` gives an incomplete provider config.
 * Silently ignoring a typo'd override would meter at list price while the
 * operator believed otherwise.
 */
export const parseModelPrices = (
  raw: string | undefined,
): Readonly<Record<string, ModelRate>> => {
  if (raw === undefined || raw.trim() === "") return {};
  const out: Record<string, ModelRate> = {};
  for (const entry of raw.split(",")) {
    const text = entry.trim();
    if (text === "") continue;
    const match = /^([^=]+)=(\d+)\/(\d+)$/.exec(text);
    const input = Number(match?.[2]);
    const output = Number(match?.[3]);
    if (
      match === null ||
      (match[1] ?? "").trim() === "" ||
      !Number.isSafeInteger(input) ||
      !Number.isSafeInteger(output)
    ) {
      throw new ValidationError(
        `AI_MODEL_PRICES entry ${JSON.stringify(text)} is not ` +
          "`model=<inputNanoCents>/<outputNanoCents>` per 1000 tokens, e.g. " +
          "`gemini-2.5-flash=30000000/250000000`",
      );
    }
    out[(match[1] ?? "").trim()] = { input, output };
  }
  return out;
};

/**
 * `AI_BUDGET_MAX_REQUESTS`, as `seam=<count>` pairs: `embedding=50000`.
 * Same throw-on-malformed rule, and for the same reason, as
 * {@link parseModelPrices}.
 */
export const parseRequestCaps = (
  raw: string | undefined,
): Readonly<Partial<Record<ModelSeam, number>>> => {
  if (raw === undefined || raw.trim() === "") return {};
  const out: Partial<Record<ModelSeam, number>> = {};
  for (const entry of raw.split(",")) {
    const text = entry.trim();
    if (text === "") continue;
    const match = /^([a-z_]+)=(\d+)$/.exec(text);
    const seam = match?.[1] ?? "";
    if (
      match === null ||
      !isModelSeam(seam) ||
      !Number.isSafeInteger(Number(match[2]))
    ) {
      throw new ValidationError(
        `AI_BUDGET_MAX_REQUESTS entry ${JSON.stringify(text)} is not ` +
          `\`seam=<count>\` for one of ${MODEL_SEAMS.join(", ")}`,
      );
    }
    out[seam] = Number(match[2]);
  }
  return out;
};

/* -------------------------------------------------------------------------- */
/* Per-user caps (W4 security F4)                                              */
/* -------------------------------------------------------------------------- */

/** Rolling-window call counts one user may cause against one kind. */
export type UserCap = { readonly hourly: number; readonly daily: number };

/**
 * **Per-user** caps, beside the global ones — the fairness bound that
 * {@link MODEL_SPENDERS} names as missing ("one user in a retry loop can
 * exhaust a seam for everybody until the month turns").
 *
 * Both kinds of cap now bind, and they answer different questions. The global
 * caps bound the *bill*: total spend is never more than they allow, however
 * many accounts exist. These bound *one account's share* of it: a loop, a
 * script, or a compromised account can use up an hour's or a day's worth and
 * then stops, while everyone else's calls go on counting against a monthly
 * allowance that one account can no longer drain alone.
 *
 * Counted over the rows `api_usage_log` already writes — every allowed
 * reservation carries `triggered_by` — so nothing new is stored. A refusal
 * writes nothing and so does not count; a replayed reservation is answered
 * before this check and does not count twice. The windows roll (the last hour,
 * the last 24 hours) rather than resetting on the clock, so a loop cannot
 * spend two windows' worth across a boundary.
 *
 * **Whose calls count.** The viewer's own (`reserveForSearch`,
 * `reserveForModel` from a user turn), and — "system work attributed to a
 * user counts against that user" — every call an outbox delivery makes on a
 * user's behalf: `reserveForModel` and `reserve` both book a delivery's spend
 * to whoever enqueued it (`outbox.attributed_to`). Work nobody's request
 * caused (a scheduled refresh) has no user and only the global caps apply.
 *
 * **The numbers are bounds, not forecasts**, sized so an ordinary heavy day
 * never meets them: an item search embeds one query, a menu scan is one
 * extraction plus a verification per ambiguous line (a long menu is ~100),
 * autocomplete is one call per distinct prefix typed. Override any of them
 * with `BUDGET_USER_CAPS` (`kind=hourly/daily`, comma-separated), read at
 * boot and per activation like `AI_BUDGET_MAX_REQUESTS`. A kind not listed
 * gets {@link DEFAULT_USER_CAP}.
 *
 * The refusal is an ordinary `allowed: false` whose `reason` begins
 * {@link USER_CAP_REASON}, so each caller surfaces it exactly as it surfaces a
 * global cap — `BudgetExceededError` (`BUDGET_EXCEEDED`) from a model seam or
 * `reserveOrThrow`, `budget_denied` from a place enrichment, no suggestions
 * from autocomplete.
 */
export const USER_CAPS: Readonly<Record<string, UserCap>> = {
  "ai_model/embedding": { hourly: 300, daily: 2_000 },
  "ai_model/item_defaults": { hourly: 30, daily: 150 },
  "ai_model/menu_extraction": { hourly: 20, daily: 60 },
  "ai_model/menu_match": { hourly: 400, daily: 1_500 },
  "ai_model/place_review": { hourly: 100, daily: 500 },
  "ai_model/recipe_photo": { hourly: 20, daily: 60 },
  "ai_model/tier_list_insights": { hourly: 30, daily: 150 },
  "google_places/autocomplete": { hourly: 300, daily: 1_500 },
  "google_places/nearby_search": { hourly: 60, daily: 300 },
  "google_places/place_details": { hourly: 100, daily: 500 },
  "google_places/photo": { hourly: 300, daily: 1_500 },
  "google_places/text_search": { hourly: 60, daily: 300 },
};

/** Any kind {@link USER_CAPS} does not name. */
export const DEFAULT_USER_CAP: UserCap = { hourly: 100, daily: 500 };

/** How every per-user refusal's `reason` begins, so it can be told apart. */
export const USER_CAP_REASON = "per-user cap reached";

/**
 * `BUDGET_USER_CAPS`, as `service/endpoint=<hourly>/<daily>` pairs:
 * `ai_model/embedding=600/4000`. Throws on anything malformed, including an
 * hourly cap above the daily one, which could never bind — the same rule as
 * {@link parseRequestCaps}, for the same reason.
 */
export const parseUserCaps = (
  raw: string | undefined,
): Readonly<Record<string, UserCap>> => {
  if (raw === undefined || raw.trim() === "") return {};
  const out: Record<string, UserCap> = {};
  for (const entry of raw.split(",")) {
    const text = entry.trim();
    if (text === "") continue;
    const match = /^([a-z0-9_]+\/[a-z0-9_]*)=(\d+)\/(\d+)$/.exec(text);
    const hourly = Number(match?.[2]);
    const daily = Number(match?.[3]);
    if (
      match === null ||
      !Number.isSafeInteger(hourly) ||
      !Number.isSafeInteger(daily) ||
      hourly < 1 ||
      daily < hourly
    ) {
      throw new ValidationError(
        `BUDGET_USER_CAPS entry ${JSON.stringify(text)} is not ` +
          "`service/endpoint=<hourly>/<daily>` with 1 <= hourly <= daily, e.g. " +
          "`ai_model/embedding=600/4000`",
      );
    }
    out[match[1] ?? ""] = { hourly, daily };
  }
  return out;
};

/**
 * Every environment-derived input to model pricing, read and validated in one
 * place.
 *
 * `installAI` calls this at boot, **before** it looks at `AI_PROVIDER`, and
 * lets it throw: a malformed `AI_MODEL_PRICES`, `AI_BUDGET_MAX_REQUESTS` or
 * `OPENAI_COMPAT_FREE` is a refusal to start. It used to surface only in
 * `loadAggregate`, lazily — which failed *every* `BudgetActor` method,
 * `reserveForSearch` for Google autocomplete included, from the first request
 * after a deploy, on a host that had booted and reported healthy. An empty
 * string, which is what compose passes for an unset override, is no overrides.
 *
 * `BudgetActor.loadAggregate` reads the same function, so the two cannot
 * disagree about what the environment says.
 */
export type ModelBudgetPolicy = {
  /**
   * `AI_MODEL_PRICES` / `AI_BUDGET_MAX_REQUESTS` / the free-provider set,
   * parsed once per activation.
   *
   * They sit in the aggregate rather than in a module-level memo for the same
   * reason `configs` does: an activation is the unit that caches, `reload()`
   * is the supported way to pick up a change, and a module memo would outlive
   * both and make one test's environment another's.
   */
  readonly modelPrices: Readonly<Record<string, ModelRate>>;
  readonly modelRequestCaps: Readonly<Partial<Record<ModelSeam, number>>>;
  readonly freeProviders: FreeModelProviders;
  /** `BUDGET_USER_CAPS` over {@link USER_CAPS}; every kind, not only models. */
  readonly userCaps: Readonly<Record<string, UserCap>>;
};

export const readModelBudgetPolicy = (
  env: Readonly<Record<string, string | undefined>> = process.env,
): ModelBudgetPolicy => ({
  modelPrices: parseModelPrices(env.AI_MODEL_PRICES),
  modelRequestCaps: parseRequestCaps(env.AI_BUDGET_MAX_REQUESTS),
  freeProviders: freeModelProviders(env),
  userCaps: { ...USER_CAPS, ...parseUserCaps(env.BUDGET_USER_CAPS) },
});

/** The free-provider set that applies to one seam's calls. */
const freeFor = (
  policy: ModelBudgetPolicy,
  seam: ModelSeam,
): ReadonlySet<string> =>
  seam === "embedding"
    ? policy.freeProviders.embedding
    : policy.freeProviders.chat;

/** Longest-prefix match into `rates`, or `null`. */
const rateFor = (
  model: string,
  rates: Readonly<Record<string, ModelRate>>,
): ModelRate | null => {
  let best: { key: string; rate: ModelRate } | null = null;
  for (const [key, rate] of Object.entries(rates)) {
    if (!model.startsWith(key)) continue;
    if (best === null || key.length > best.key.length) best = { key, rate };
  }
  return best?.rate ?? null;
};

/**
 * What one model call costs, in nanocents. Rounded **up**: a call that costs
 * something may not book nothing.
 *
 * `free` is the set of providers that bill nothing for *this* call, which
 * `BudgetActor` takes from `../lib/ai/billing.ts` per seam. It defaults to the
 * providers that are free wherever they point; `openai-compatible` is only in
 * it when its endpoint is one we host.
 */
export const modelCallNanoCents = (
  input: {
    readonly provider: string;
    readonly model: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
  },
  overrides: Readonly<Record<string, ModelRate>> = {},
  free: ReadonlySet<string> = ALWAYS_FREE_PROVIDERS,
): number => {
  if (free.has(input.provider)) return 0;
  const rate =
    rateFor(input.model, overrides) ??
    rateFor(input.model, MODEL_RATES) ??
    UNKNOWN_PAID_RATE;
  return Math.ceil(
    (input.inputTokens * rate.input + input.outputTokens * rate.output) / 1000,
  );
};

/**
 * `ModelReserveInput` and `ModelSettleInput` are declared in
 * `@cellar-assistant/contracts` (`budget.ts`), beside
 * `InternalBudgetActorInterface` whose arguments they are; re-exported here so
 * this module's existing importers keep working.
 */
export type { ModelReserveInput, ModelSettleInput };

/**
 * The `api_budget_config` row a model seam gets when nobody has written one.
 *
 * `free_tier_monthly_requests` is **0**, deliberately: no model provider gives
 * a monthly free allowance, and the column's effect in `#reserve` is to book a
 * request at zero cents. Setting it to anything else would hide real spend
 * behind a tier that does not exist. An operator who genuinely has free
 * inference can still say so with `setBudget`.
 */
const defaultModelConfig = (
  seam: ModelSeam,
  spender: ModelSpender,
): ConfigRow => ({
  service: AI_MODEL_SERVICE,
  endpoint: seam,
  monthlyBudgetCents: spender.defaultMonthlyBudgetCents,
  freeTierMonthlyRequests: 0,
  isEnabled: true,
  updatedAt: new Date(0),
});

export class BudgetActor
  extends EntityActorBase<BudgetAggregate>
  implements BudgetActorInterface, InternalBudgetActorInterface
{
  /** It owns two tables, so `entity` — as `BudgetActorDescriptor` says. */
  static readonly category: ActorCategory = BudgetActorDescriptor.category;
  /** One budget, one activation: any other key is not this actor. */
  static override readonly keyShape: KeyShape = exactKey(BUDGET_ACTOR_ID);

  protected async loadAggregate(): Promise<BudgetAggregate> {
    const rows = await this.db.select().from(apiBudgetConfig);
    return {
      configs: new Map(
        rows.map((row) => [
          budgetKind({ service: row.service, endpoint: row.endpoint }),
          row,
        ]),
      ),
      // Validated at boot by `installAI`; see `readModelBudgetPolicy`.
      ...readModelBudgetPolicy(process.env),
    };
  }

  /* ---------------------------------------------------------------------- */
  /* reserve                                                                 */
  /* ---------------------------------------------------------------------- */

  async reserve(ctx: Ctx, input: ReserveInput): Promise<ReserveResult> {
    requirePrivileged(ctx, privilegedOnly("reserve"));
    // A system turn's spend is booked to whoever enqueued the delivery it is
    // part of, as `reserveForModel` books it — so a user's place enrichments
    // count against that user's cap (`USER_CAPS`). `PlaceActor` passes its
    // ctx's `viewerId`, which a delivery never has. An explicit value wins.
    const triggeredBy =
      input.triggeredBy ??
      (ctx.kind === "system" ? await this.#deliveryAttribution(ctx) : null);
    return this.#reserve({ ...input, triggeredBy });
  }

  /**
   * `reserve` for a **search actor**, callable with the asking user's own ctx.
   *
   * C1's `GooglePlacesActor` (§2.3: "charges via `BudgetActor`") is a search
   * actor reached synchronously from a resolver — autocomplete has to answer
   * while the user is typing, so there is no outbox hop and therefore no system
   * turn to charge from. And a search actor may not mint a `system` ctx of its
   * own: §1.6 says only `OutboxActor` and job actors ever construct one, and
   * `src/lib/system-ctx.test.ts` enforces it.
   *
   * So this is the narrow door rather than a hole in `reserve`, on B5's own
   * precedent for `reserveOrThrow` ("added rather than changing `reserve`").
   * What keeps it narrow:
   *
   *  - **an allow-list.** Only the `(service, endpoint)` pairs in
   *    `SEARCH_SPENDERS` may be charged this way, and both of them are the
   *    per-keystroke Google endpoints C1 owns. Everything expensive —
   *    `place_details`, `photo`, `text_search` — stays system-only.
   *  - **the caller does not choose the cost.** It is read from
   *    `SEARCH_SPENDERS`, not from `input`, so a client that reached a search
   *    actor cannot under-declare a call to slip past the cap.
   *  - **`triggeredBy` is the viewer**, not whatever the caller passed, so
   *    `api_usage_log` attributes the spend honestly.
   *  - anonymous is refused outright.
   *
   * A signed-in user can therefore still only cause the two cheap searches to
   * be charged, at the price this actor sets, bounded by the same monthly cap —
   * which is the property B5's `system`-only rule was protecting.
   */
  async reserveForSearch(
    ctx: Ctx,
    input: ReserveInput,
  ): Promise<ReserveResult> {
    requireSignedIn(ctx, "spend against the budget");
    const kind = requireKind(input.kind);
    const allowedCost = SEARCH_SPENDERS[budgetKind(kind)];
    if (allowedCost === undefined) {
      throw new ForbiddenError(
        `${budgetKind(kind)} may not be charged by a search actor; only ` +
          `${Object.keys(SEARCH_SPENDERS).join(", ")} may. Everything else is ` +
          "system or admin only (see this method's doc).",
      );
    }
    return this.#reserve({
      ...input,
      estimatedCostCents: allowedCost,
      triggeredBy: ctx.viewerId,
    });
  }

  /**
   * `reserve` for a **model call** — X1c's half of the gap
   * `services/api/src/limits.ts` names: "nothing in
   * `services/actors/src/lib/ai/` imports `BudgetActor` — it covers Google
   * Places only. So N aliases of `itemSearch` in one request is N model
   * inferences with no spend gate anywhere on the path."
   *
   * This is the third door, alongside `reserve` and `reserveForSearch`, and it
   * is narrow in the same three ways plus one:
   *
   *  - **an allow-list.** Only {@link MODEL_SEAMS} may be charged, so a typo'd
   *    or invented seam is refused rather than opening an unbounded endpoint.
   *  - **the caller does not choose the *price*.** It declares tokens, a model
   *    and a provider; {@link modelCallNanoCents} turns those into money using
   *    this actor's own table. Widening the price table cannot be done from a
   *    call site.
   *  - **`triggeredBy` is the viewer**, and an anonymous caller is refused
   *    outright — `EmbeddingActor` already refuses an anonymous `embed`, and
   *    this is the same rule one layer down where the money is. Inside an
   *    outbox delivery there is no viewer — the ctx is `systemCtx` — so the
   *    row is attributed to whoever enqueued the delivery instead (see
   *    `#deliveryAttribution`); that changes what is *recorded*, never what
   *    is *allowed*.
   *  - **a request cap that does not depend on the price.** See
   *    `ModelSpender.maxMonthlyRequests`: the cents cap cannot bound a free
   *    provider, and a free provider is exactly where a loop is written.
   *
   * ## Why an absent config row is a default here and a refusal for Google
   *
   * `reserve` fails closed on a missing `api_budget_config` row, and the
   * module doc's argument for that is precise: "the old default meant a typo'd
   * service name spent without limit **and without a cap to stop it**." Both
   * halves are false here. A seam name cannot be typo'd past `MODEL_SEAMS`,
   * and an unconfigured seam is not uncapped — it gets
   * `ModelSpender.defaultMonthlyBudgetCents` and, more to the point,
   * `maxMonthlyRequests`, which no configuration can remove. So an absent row
   * means "nobody has tuned this", not "nobody has authorised this", and
   * failing closed on it would take every AI feature in every existing
   * deployment and every dev worktree dark on upgrade in exchange for no bound
   * that is not already there. A row written by `setBudget` overrides the
   * default and is what an operator should use to raise or disable a seam.
   */
  async reserveForModel(
    ctx: Ctx,
    input: ModelReserveInput,
  ): Promise<ReserveResult> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "spend against the budget");

    const seam = input.seam?.trim() ?? "";
    if (!isModelSeam(seam)) {
      throw new ForbiddenError(
        `${seam === "" ? "(empty)" : seam} is not a model seam; only ` +
          `${MODEL_SEAMS.join(", ")} may be charged as ${AI_MODEL_SERVICE}. ` +
          "Add the seam to MODEL_SEAMS with its own bounds rather than " +
          "charging it to a neighbour's endpoint.",
      );
    }
    const spender = MODEL_SPENDERS[seam];

    for (const [what, value] of [
      ["inputTokens", input.inputTokens],
      ["outputTokens", input.outputTokens],
    ] as const) {
      if (!Number.isInteger(value) || value < 0) {
        throw new ValidationError(`${what} must be a whole number ≥ 0`);
      }
    }
    const model = input.model?.trim() ?? "";
    const provider = input.provider?.trim() ?? "";
    if (model === "" || provider === "") {
      throw new ValidationError(
        "a model reservation needs both `provider` and `model`; they decide " +
          "the rate, and an unnamed model would be priced as free",
      );
    }
    const reservationId = input.reservationId?.trim() ?? "";
    if (reservationId === "") {
      throw new ValidationError(
        "a model reservation needs its own `reservationId`. It is not the " +
          "outbox row's: one delivery may make many model calls, and each " +
          "one of them costs (see ModelReserveInput.reservationId).",
      );
    }

    const nanoCents = modelCallNanoCents(
      {
        provider,
        model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
      },
      aggregate.modelPrices,
      freeFor(aggregate, seam),
    );
    const kind = { service: AI_MODEL_SERVICE, endpoint: seam };
    const maxRequests =
      aggregate.modelRequestCaps[seam] ?? spender.maxMonthlyRequests;

    return this.#reserve(
      {
        kind,
        // Derived inside the transaction from the nanocent carry; this is the
        // value the validation in `#reserve` sees, not the value it books.
        estimatedCostCents: 0,
        entityId: input.entityId,
        entityType: input.entityType,
        triggeredBy:
          ctx.kind === "system"
            ? await this.#deliveryAttribution(ctx)
            : ctx.viewerId,
        reservationId,
        metadata: {
          ...(input.metadata ?? {}),
          provider,
          model,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
        },
      },
      {
        config:
          aggregate.configs.get(budgetKind(kind)) ??
          defaultModelConfig(seam, spender),
        nanoCents,
        maxRequests,
      },
    );
  }

  /**
   * The decision and its row. Takes no `ctx`, on purpose: the callers above
   * have already decided who may spend, and nothing about the ctx — least of
   * all a delivery's row id — may decide what the spend is keyed on.
   */
  async #reserve(
    input: ReserveInput,
    model?: {
      readonly config: ConfigRow;
      readonly nanoCents: number;
      readonly maxRequests: number;
    },
  ): Promise<ReserveResult> {
    const aggregate = this.requireAggregate();

    const kind = requireKind(input.kind);
    const declaredCost = input.estimatedCostCents;
    if (!Number.isInteger(declaredCost) || declaredCost < 0) {
      throw new ValidationError(
        `estimatedCostCents must be a whole number of cents, got ${declaredCost}`,
      );
    }
    const entityId = requireUuidOrNull(input.entityId, "entityId");
    const triggeredBy = requireUuidOrNull(input.triggeredBy, "triggeredBy");
    // Required, and never inferred from `ctx` (module doc, "Idempotency"):
    // an outbox row id here is what collapsed a whole delivery's calls onto
    // its first. `trim` guards the JSON boundary, where the type is a hope.
    const reservationId =
      typeof input.reservationId === "string" ? input.reservationId.trim() : "";
    if (reservationId === "") {
      throw new ValidationError(
        "a reservation needs its own `reservationId`, naming the one paid " +
          "call it stands for. There is no default: one outbox delivery can " +
          "make many calls, and each of them costs (see " +
          "ReserveInput.reservationId).",
      );
    }

    const config = model?.config ?? aggregate.configs.get(budgetKind(kind));
    if (config === undefined) {
      // Fails closed (module doc). No usage row: nothing was spent.
      return {
        allowed: false,
        effectiveCostCents: 0,
        currentSpendCents: 0,
        limitCents: 0,
        requestCount: 0,
        freeTierLimit: 0,
        isEnabled: false,
        reason: `no budget is configured for ${budgetKind(kind)}; configure one with setBudget before spending against it`,
        usageId: null,
      };
    }

    if (!config.isEnabled) {
      return {
        allowed: false,
        effectiveCostCents: 0,
        currentSpendCents: 0,
        limitCents: config.monthlyBudgetCents,
        requestCount: 0,
        freeTierLimit: config.freeTierMonthlyRequests,
        isEnabled: false,
        reason: `${budgetKind(kind)} is disabled`,
        usageId: null,
      };
    }

    // The decision and the row it justifies, in one transaction (module doc).
    return await this.tx(async (tx) => {
      // First, before anything is counted: the per-kind lock that makes the
      // caps exact without leaning on the singleton key (module doc, "The
      // race this closes"). Every cap — replay, per-user, request, money — is
      // scoped to this one `(service, endpoint)`, so this one lock covers them
      // all.
      await lockBudgetKind(tx, kind);
      // This month only (module doc, "Idempotency"): bounded, and a row that
      // counts against this month's caps is the only thing a replay may
      // answer with. `idx_api_usage_log_reservation_id` serves the lookup.
      const [replay] = await tx
        .select({
          id: apiUsageLog.id,
          cost: apiUsageLog.estimatedCostCents,
        })
        .from(apiUsageLog)
        .where(
          and(
            sql`${apiUsageLog.metadata} ->> 'reservationId' = ${reservationId}`,
            eq(apiUsageLog.service, kind.service),
            eq(apiUsageLog.endpoint, kind.endpoint),
            inMonthOf(CURRENT_MONTH),
          ),
        )
        .limit(1);
      if (replay !== undefined && model !== undefined) {
        // One model reservation is one model call. A second reservation
        // under the same id is a second call, and "already reserved" would
        // let it run counted against nothing (`ModelReserveInput`).
        throw new ConflictError(
          `model reservation ${reservationId} was already made this month ` +
            `(usage row ${replay.id}); every model call reserves under its ` +
            "own id, so this is a second call, not a retry. Nothing was " +
            "charged and no model was called.",
        );
      }
      if (replay !== undefined) {
        const totals = await this.#monthToDate(tx, kind, false, CURRENT_MONTH);
        return {
          allowed: true,
          effectiveCostCents: replay.cost,
          currentSpendCents: totals.spendCents,
          limitCents: config.monthlyBudgetCents,
          requestCount: totals.requestCount,
          freeTierLimit: config.freeTierMonthlyRequests,
          isEnabled: true,
          reason: `already reserved under ${reservationId}`,
          usageId: replay.id,
        };
      }

      // The per-user cap, before any global one: it is the narrower answer,
      // and the one that tells a looping caller it is the loop.
      if (triggeredBy !== null) {
        const refusal = await this.#userCapRefusal(
          tx,
          kind,
          triggeredBy,
          aggregate.userCaps[budgetKind(kind)] ?? DEFAULT_USER_CAP,
        );
        if (refusal !== null) {
          return {
            allowed: false,
            effectiveCostCents: 0,
            currentSpendCents: 0,
            limitCents: config.monthlyBudgetCents,
            requestCount: 0,
            freeTierLimit: config.freeTierMonthlyRequests,
            isEnabled: true,
            reason: refusal,
            usageId: null,
          };
        }
      }

      const totals = await this.#monthToDate(
        tx,
        kind,
        model !== undefined,
        CURRENT_MONTH,
      );
      const base = {
        currentSpendCents: totals.spendCents,
        limitCents: config.monthlyBudgetCents,
        requestCount: totals.requestCount,
        freeTierLimit: config.freeTierMonthlyRequests,
        isEnabled: true,
      };

      // 0. The request cap, which only a model call has, and which is the one
      //    bound a free provider cannot slip (see `ModelSpender`). Checked
      //    before the money, because when it binds the money is zero.
      if (model !== undefined && totals.requestCount >= model.maxRequests) {
        return {
          ...base,
          allowed: false,
          effectiveCostCents: 0,
          reason: `${budgetKind(kind)} has made ${totals.requestCount} of its ${model.maxRequests} model calls allowed this month; raise it with AI_BUDGET_MAX_REQUESTS=${kind.endpoint}=<count> once you know why it ran that many`,
          usageId: null,
        };
      }

      /*
       * The nanocent carry (see `MODEL_RATES`). A model call's real price is a
       * fraction of a cent, so what it books is the whole cents that its
       * arrival pushes the month's exact total past — 0 for most calls and 1
       * for the call that crosses. `bookedCents >= floor(sumNano / 1e9)` is
       * the invariant; reservations alone keep it an equality, and the clamp
       * at zero is what absorbs the excess a settle-down can leave (see
       * `MODEL_RATES`, "What that guarantees").
       */
      const cost =
        model === undefined
          ? declaredCost
          : Math.max(
              0,
              Math.floor(
                (totals.nanoCents + model.nanoCents) / NANOCENTS_PER_CENT,
              ) - totals.spendCents,
            );

      // 1. Inside the free tier: the request counts, and costs nothing.
      const free = totals.requestCount < config.freeTierMonthlyRequests;
      if (!free) {
        // 2. Free tier exhausted with no paid budget — the common config.
        if (config.monthlyBudgetCents <= 0) {
          return {
            ...base,
            allowed: false,
            effectiveCostCents: 0,
            reason: `${budgetKind(kind)} free tier exhausted (${totals.requestCount}/${config.freeTierMonthlyRequests} requests) and no paid budget is configured`,
            usageId: null,
          };
        }
        // 3. Paid, but this call would cross the cap.
        if (totals.spendCents + cost > config.monthlyBudgetCents) {
          return {
            ...base,
            allowed: false,
            effectiveCostCents: 0,
            reason: `${budgetKind(kind)} monthly budget exhausted: ${totals.spendCents} of ${config.monthlyBudgetCents} cents spent, ${cost} more requested`,
            usageId: null,
          };
        }
      }

      const effectiveCostCents = free ? 0 : cost;
      // Zero inside a free tier, so the carry's invariant keeps holding: the
      // cents a row books and the nanocents it records have to tell the same
      // story, or `floor(sumNano / 1e9)` stops matching `sum(cents)` and every
      // later call is mispriced by the difference.
      const nanoCents = model === undefined || free ? 0 : model.nanoCents;
      const [row] = await tx
        .insert(apiUsageLog)
        .values({
          service: kind.service,
          endpoint: kind.endpoint,
          estimatedCostCents: effectiveCostCents,
          entityId,
          entityType: input.entityType ?? null,
          triggeredBy,
          metadata: {
            ...(input.metadata ?? {}),
            reservationId,
            ...(model === undefined ? {} : { nanoCents }),
            // Named, because `nanoCents: 0` alone cannot say *why* it is zero
            // — and `settleForModel` must not re-price a free-tier row (BU-12).
            ...(model !== undefined && free ? { freeTier: true } : {}),
          },
        })
        .returning({ id: apiUsageLog.id });

      return {
        ...base,
        allowed: true,
        effectiveCostCents,
        reason: free
          ? `within free tier (${totals.requestCount + 1}/${config.freeTierMonthlyRequests} requests)`
          : `charged ${effectiveCostCents} cents against ${budgetKind(kind)}`,
        usageId: row?.id ?? null,
      };
    });
  }

  /**
   * Replace a model reservation's estimate with what the provider billed.
   *
   * ## Why the estimate is not simply left standing
   *
   * The output side of a model call cannot be known before the call — that is
   * what generation decides — so `reserveForModel` prices
   * `OUTPUT_TOKEN_ESTIMATES`, a per-seam expectation. Left unsettled, the
   * month's ledger is a sum of guesses, and an operator reconciling it against
   * a Vertex invoice has no way to tell a mis-set cap from a mis-set estimate.
   * The providers report the real numbers; this writes them down.
   *
   * ## Why it re-derives the row's cents rather than just editing metadata
   *
   * `MODEL_RATES` explains the carry: a row books the whole cents its
   * nanocents push the month's exact total past, so that
   * `sum(estimated_cost_cents) === floor(sum(nanoCents) / 1e9)` at every
   * instant. Changing one row's nanocents without re-deriving its cents breaks
   * that equality, and every later call in the month is then mispriced by the
   * difference. So the cents are recomputed from the other rows' totals — the
   * singleton serializes turns, so "the other rows" is a stable set for the
   * length of this transaction.
   *
   * The correction is clamped at zero, because `estimated_cost_cents` cannot
   * go negative — so a settle-down cannot take cents back from a row that
   * booked none, and leaves the month's booked cents above the exact total.
   * Each one adds at most a cent and they accumulate; later calls absorb the
   * excess. Never below the exact total, which is the direction a budget must
   * not err in; not "within a cent" either. See `MODEL_RATES`.
   *
   * ## Which month
   *
   * The row's own. A call reserved in a month's last moments and settled
   * after midnight is last month's spend, so its cents are re-derived from
   * last month's carry — using the settling instant's month re-priced it
   * against a ledger it is not in.
   *
   * ## Rows it leaves alone
   *
   * A row a free tier booked at zero (`metadata.freeTier`) keeps its zero:
   * re-pricing it would charge a call the tier covered, and break the carry
   * the next paid call is priced from. The guard used to test
   * `metadata.nanoCents === undefined`, which `#reserve` never produces for a
   * model row, so it never fired (BU-12). A row from before the flag existed
   * is recognised by `nanoCents: 0` — a paid reservation always prices above
   * zero, because its estimate always has tokens — and a free provider's row
   * would settle to zero anyway.
   *
   * Not idempotent-by-reservation like `reserve`, and it does not need to be:
   * it is called once, in the same turn as the call it settles, and settling
   * twice with the same measurement is the same write.
   */
  async settleForModel(ctx: Ctx, input: ModelSettleInput): Promise<void> {
    const aggregate = this.requireAggregate();
    requireSignedIn(ctx, "spend against the budget");
    const seam = input.seam?.trim() ?? "";
    if (!isModelSeam(seam)) {
      throw new ForbiddenError(`${seam} is not a model seam`);
    }
    const usageId = requireUuidOrNull(input.usageId, "usageId");
    if (usageId === null) {
      throw new ValidationError("settleForModel needs the usage row's id");
    }
    for (const [what, value] of [
      ["inputTokens", input.inputTokens],
      ["outputTokens", input.outputTokens],
    ] as const) {
      if (!Number.isInteger(value) || value < 0) {
        throw new ValidationError(`${what} must be a whole number ≥ 0`);
      }
    }

    const nanoCents = modelCallNanoCents(
      {
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
      },
      aggregate.modelPrices,
      freeFor(aggregate, seam),
    );

    await this.tx(async (tx) => {
      // The carry below re-reads the kind's month; a reserve interleaving
      // with it would price against a half-settled total (module doc).
      await lockBudgetKind(tx, { service: AI_MODEL_SERVICE, endpoint: seam });
      const [row] = await tx
        .select({
          id: apiUsageLog.id,
          service: apiUsageLog.service,
          endpoint: apiUsageLog.endpoint,
          cost: apiUsageLog.estimatedCostCents,
          metadata: apiUsageLog.metadata,
          createdAt: apiUsageLog.createdAt,
        })
        .from(apiUsageLog)
        .where(eq(apiUsageLog.id, usageId))
        .limit(1);
      if (row === undefined) {
        throw new NotFoundError(`api_usage_log row ${usageId} does not exist`);
      }
      if (row.service !== AI_MODEL_SERVICE || row.endpoint !== seam) {
        throw new ForbiddenError(
          `api_usage_log row ${usageId} is ${row.service}/${row.endpoint}, ` +
            `not ${AI_MODEL_SERVICE}/${seam}; a settlement may only correct ` +
            "the reservation it belongs to",
        );
      }
      const metadata =
        typeof row.metadata === "object" && row.metadata !== null
          ? (row.metadata as Record<string, unknown>)
          : {};
      // Nothing to correct: not a model reservation, or one a free tier
      // covered (see "Rows it leaves alone" above — BU-12).
      if (
        metadata.nanoCents === undefined ||
        metadata.freeTier === true ||
        int(metadata.nanoCents) === 0
      ) {
        return;
      }

      // The row's month, not now's (see "Which month" above).
      const totals = await this.#monthToDate(
        tx,
        { service: row.service, endpoint: row.endpoint },
        true,
        row.createdAt,
      );
      const othersNano = Math.max(
        0,
        totals.nanoCents - int(metadata.nanoCents),
      );
      const othersCents = Math.max(0, totals.spendCents - row.cost);
      const cost = Math.max(
        0,
        Math.floor((othersNano + nanoCents) / NANOCENTS_PER_CENT) - othersCents,
      );

      await tx
        .update(apiUsageLog)
        .set({
          estimatedCostCents: cost,
          metadata: {
            ...metadata,
            nanoCents,
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            model: input.model,
            provider: input.provider,
            settled: true,
          },
        })
        .where(eq(apiUsageLog.id, usageId));
    });
  }

  /**
   * The per-user refusal for one more call to `kind` by `userId`, or `null`.
   * Counts that user's rows for that kind over the last hour and the last 24
   * hours in one scan of the day, served by
   * `idx_api_usage_log_service_created`; a day of one service's rows is
   * bounded by the global caps, so the scan is too.
   *
   * `#private` for the reason `#deliveryAttribution` gives: it would
   * otherwise be a sidecar-callable "how much has user X used" oracle.
   */
  async #userCapRefusal(
    tx: DbOrTx,
    kind: BudgetKind,
    userId: string,
    cap: UserCap,
  ): Promise<string | null> {
    const [row] = await tx
      .select({
        hour: sql<string>`count(*) filter (where ${apiUsageLog.createdAt} > now() - interval '1 hour')`,
        day: sql<string>`count(*)`,
      })
      .from(apiUsageLog)
      .where(
        and(
          eq(apiUsageLog.service, kind.service),
          eq(apiUsageLog.endpoint, kind.endpoint),
          eq(apiUsageLog.triggeredBy, userId),
          sql`${apiUsageLog.createdAt} > now() - interval '1 day'`,
        ),
      );
    const hour = int(row?.hour);
    const day = int(row?.day);
    const which =
      hour >= cap.hourly
        ? `${hour} of its ${cap.hourly} calls in the last hour`
        : day >= cap.daily
          ? `${day} of its ${cap.daily} calls in the last 24 hours`
          : null;
    return which === null
      ? null
      : `${USER_CAP_REASON}: this account has made ${which} to ${budgetKind(kind)}. ` +
          "It frees up as the window rolls; the caps are BUDGET_USER_CAPS.";
  }

  /**
   * Who an outbox delivery's spend is attributed to: the viewer that enqueued
   * the row being delivered (`outbox.attributed_to`, written by
   * `enqueueOutbox`'s `attributeTo`), or `null` when the system originated it
   * or `ctx` is not a delivery at all.
   *
   * **Attribution only.** The one thing done with the answer is to write it
   * into `api_usage_log.triggered_by`. It is not a viewer: it does not go into
   * a `Ctx`, it is not consulted by the anonymous check above or by any cap,
   * and the delivery itself still runs as `systemCtx` with `viewerId: null`.
   * `outbox-attribution.test.ts` holds that nothing else reads the column.
   *
   * `#private`, not merely `protected`: Dapr dispatches an invocation to any
   * method the instance has by name, and TypeScript's `protected` does not
   * exist at runtime — so a protected method here would be a sidecar-callable
   * "who enqueued outbox row X" oracle.
   */
  async #deliveryAttribution(ctx: Ctx): Promise<string | null> {
    // `causedBy`, not `delivery`: a model call is reached through the typed
    // client, which strips the delivery (`lib/delivery.ts`) and keeps its
    // attribution, so this is the row the whole chain descends from.
    const rowId = causedByOf(ctx);
    if (rowId === null) return null;
    const [row] = await this.db
      .select({ attributedTo: outbox.attributedTo })
      .from(outbox)
      .where(eq(outbox.id, rowId))
      .limit(1);
    return row?.attributedTo ?? null;
  }

  /** `reserve`, with the denial as a typed error. See the contract's doc. */
  async reserveOrThrow(ctx: Ctx, input: ReserveInput): Promise<ReserveResult> {
    const result = await this.reserve(ctx, input);
    if (!result.allowed) {
      throw new BudgetExceededError(
        `${budgetKind(requireKind(input.kind))} refused: ${result.reason}`,
      );
    }
    return result;
  }

  /* ---------------------------------------------------------------------- */
  /* Reporting and configuration                                             */
  /* ---------------------------------------------------------------------- */

  async usage(ctx: Ctx, range: UsageRange): Promise<UsageReport> {
    this.requireAggregate();
    requirePrivileged(ctx, privilegedOnly("usage"));

    const from = requireIso(range.from, "from");
    const to = requireIso(range.to, "to");
    if (to.getTime() <= from.getTime()) {
      throw new ValidationError("`to` must be after `from`");
    }

    const rows = await this.db
      .select({
        service: apiUsageLog.service,
        endpoint: apiUsageLog.endpoint,
        requestCount: sql<string>`count(*)`,
        spendCents: sql<string>`coalesce(sum(${apiUsageLog.estimatedCostCents}), 0)`,
      })
      .from(apiUsageLog)
      .where(
        and(
          gte(apiUsageLog.createdAt, from),
          lt(apiUsageLog.createdAt, to),
          ...(range.service === undefined
            ? []
            : [eq(apiUsageLog.service, range.service)]),
          ...(range.endpoint === undefined
            ? []
            : [eq(apiUsageLog.endpoint, range.endpoint)]),
        ),
      )
      .groupBy(apiUsageLog.service, apiUsageLog.endpoint)
      .orderBy(sql`1 asc, 2 asc`);

    const buckets: UsageBucket[] = rows.map((row) => ({
      service: row.service,
      endpoint: row.endpoint,
      requestCount: int(row.requestCount),
      spendCents: int(row.spendCents),
    }));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      buckets,
      totalRequestCount: buckets.reduce((sum, b) => sum + b.requestCount, 0),
      totalSpendCents: buckets.reduce((sum, b) => sum + b.spendCents, 0),
    };
  }

  async setBudget(ctx: Ctx, input: SetBudgetInput): Promise<BudgetConfigDto> {
    this.requireAggregate();
    requireAdmin(ctx, "BudgetActor.setBudget is admin only");

    const kind = requireKind(input.kind);
    for (const [what, value] of [
      ["monthlyBudgetCents", input.monthlyBudgetCents],
      ["freeTierMonthlyRequests", input.freeTierMonthlyRequests],
    ] as const) {
      if (!Number.isInteger(value) || value < 0) {
        throw new ValidationError(`${what} must be a whole number ≥ 0`);
      }
    }

    await this.tx(async (tx) => {
      await tx
        .insert(apiBudgetConfig)
        .values({
          service: kind.service,
          endpoint: kind.endpoint,
          monthlyBudgetCents: input.monthlyBudgetCents,
          freeTierMonthlyRequests: input.freeTierMonthlyRequests,
          isEnabled: input.isEnabled,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [apiBudgetConfig.service, apiBudgetConfig.endpoint],
          set: {
            monthlyBudgetCents: input.monthlyBudgetCents,
            freeTierMonthlyRequests: input.freeTierMonthlyRequests,
            isEnabled: input.isEnabled,
            updatedAt: new Date(),
          },
        });
    });
    await this.reload();

    const row = this.requireAggregate().configs.get(budgetKind(kind));
    if (row === undefined) {
      throw new ValidationError(
        `budget config for ${budgetKind(kind)} vanished mid-turn`,
      );
    }
    return configRowToDto(row);
  }

  async config(ctx: Ctx): Promise<readonly BudgetConfigDto[]> {
    const aggregate = this.requireAggregate();
    requireAdmin(ctx, "BudgetActor.config is admin only");
    return [...aggregate.configs.values()]
      .map(configRowToDto)
      .sort((a, b) =>
        `${a.service}/${a.endpoint}`.localeCompare(
          `${b.service}/${b.endpoint}`,
        ),
      );
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Requests and paid cents in one calendar month, for one endpoint — plus,
   * for a model endpoint, the exact nanocents behind those cents.
   *
   * `month` is {@link CURRENT_MONTH} for a reservation and the reservation
   * row's `created_at` for a settlement. Both bounds are computed by Postgres
   * (`inMonthOf`), so the month a reservation is counted in is the month its
   * row's `created_at` default — the same transaction's `now()` — lands in,
   * whatever the host's clock says.
   *
   * The nanocent sum is computed **only** for a model reserve. It reads
   * `metadata`, which is free-form `jsonb` that every other caller writes into
   * as it likes, so a `::numeric` cast over the whole table is a query that
   * fails on somebody else's row. The guard makes the cast total anyway: a
   * value that is not a run of digits contributes 0 rather than erroring the
   * aggregate, which under-books that one row instead of refusing every call
   * to the endpoint.
   */
  async #monthToDate(
    tx: DbOrTx,
    kind: BudgetKind,
    withNanoCents: boolean,
    month: MonthAnchor,
  ): Promise<{
    requestCount: number;
    spendCents: number;
    nanoCents: number;
  }> {
    const [row] = await tx
      .select({
        requestCount: sql<string>`count(*)`,
        spendCents: sql<string>`coalesce(sum(${apiUsageLog.estimatedCostCents}), 0)`,
        nanoCents: withNanoCents
          ? sql<string>`coalesce(sum(case when ${apiUsageLog.metadata} ->> 'nanoCents' ~ '^[0-9]+$' then (${apiUsageLog.metadata} ->> 'nanoCents')::numeric else 0 end), 0)`
          : sql<string>`0`,
      })
      .from(apiUsageLog)
      .where(
        and(
          eq(apiUsageLog.service, kind.service),
          eq(apiUsageLog.endpoint, kind.endpoint),
          inMonthOf(month),
        ),
      );
    return {
      requestCount: int(row?.requestCount),
      spendCents: int(row?.spendCents),
      nanoCents: int(row?.nanoCents),
    };
  }
}
