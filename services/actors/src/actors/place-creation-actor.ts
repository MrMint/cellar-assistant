/**
 * `PlaceCreationActor(viewerId)` — B5 (migration plan §2.1, §1.2, §1.5, §8.5),
 * re-keyed per creator in Wave 6.
 *
 * > **`PlaceCreationActor`**
 * > - Serializes user place creation: rate limit (25/day), duplicate check
 * >   (`find_duplicate_places`), AI review, then `PlaceActor(newId).create`.
 * >   Replaces `createUserPlaceAction`'s check-then-insert.
 *
 * §1.2's rule for registries, verbatim: *"registry actors hold a lock and call
 * the entity actor's create; they do not insert"*. Nothing in this file writes
 * to `places`. It reads `places` (the rate limit and the early duplicate
 * check), calls out to the AI review, and then makes exactly one call to
 * `PlaceActor.create`.
 *
 * ## Keyed by the creator, not a singleton
 *
 * This used to be one global activation, so every user's creation queued
 * behind everyone else's AI review (up to 120s each, in-turn): the third
 * concurrent creator anywhere could outlive the API's 120s timeout and be told
 * it failed while its place was still created. The key is now the creator's
 * own viewer id (`placeCreationActorId`), which splits the two things the
 * singleton was serialising:
 *
 *  - **one user's own submissions** still run one at a time, so the 25/day
 *    rate limit is exact (the count and the insert it guards cannot interleave
 *    with that user's next submission), and an AI review only ever blocks the
 *    user who asked for it;
 *  - **the cross-user duplicate race** moved to the database, where a lock can
 *    be exactly as wide as "near enough to be a duplicate":
 *    `PlaceActor.create` takes `pg_advisory_xact_lock` on every geocell the
 *    50 m block distance can reach and re-runs the duplicate check under them
 *    (`place-actor.ts`, `../lib/geocell.ts`). That lock is held for the insert
 *    transaction only — milliseconds — and unlike the singleton it holds
 *    in-process too, so the harness can prove it with genuinely concurrent
 *    transactions (`place-creation-actor.test.ts`).
 *
 * The check here stays, as the *early* half: it refuses an obvious duplicate
 * before an AI review is paid for. It is no longer what makes the rule sound.
 * `docs/architecture/actor-keys.md` has the design, and why a geohash-keyed
 * actor was rejected.
 *
 * **The key is an address, not a credential.** `createPlace` refuses any ctx
 * whose viewer is not this actor's key, before anything else — otherwise a
 * caller could address someone else's activation and queue behind, or be
 * rate-limited as, that user. An `admin` is held to it too (§1.6's bypass is
 * about seeing rows, not becoming somebody else); an admin creating a place
 * does so under their own key, where the rate limit does not apply to them.
 *
 * Re-keying moved no data: this actor keeps nothing in Dapr actor state
 * (`../lib/no-actor-state.test.ts` holds that for every actor), registers no
 * timer or reminder, and its only instance fields are its two seams.
 *
 * ## `places_pkey` convergence (§8.4)
 *
 * N genuinely concurrent `createPlace` calls carrying **one** idempotency key
 * (§8.4's `placeId`) converge on one row, because `places_pkey` is the
 * tripwire and `#createOrConverge` below is what makes hitting it survivable
 * rather than a 500. The geocell recheck excludes the creation's own id, so a
 * sibling of the same creation is never mistaken for a duplicate of it.
 *
 * ## Two request-driven external calls, and §8.5 allows exactly that
 *
 * §8.5: "anything over a few seconds is outbox-driven, not request-driven",
 * with two named exceptions — `ItemOnboardingActor.start` and **this actor**.
 * The user is staring at a form waiting to be told whether their place was
 * accepted, so the AI review runs in-turn. That is also why the API's actor
 * invocation timeout for `createPlace` is 120s (§8.5).
 *
 * ## The review degrades, and says so
 *
 * `PlaceReviewer` resolves the way B7's `InsightsGenerator` does: a module-level
 * registry (`setPlaceReviewer`) that `installAI()` fills at boot, read by the
 * constructor's default. With a provider configured that default is the real
 * reviewer — `providerPlaceReviewer` in `../lib/ai/seams.ts`, the port of
 * `functions/reviewUserPlace`. With `AI_PROVIDER` unset it is
 * `unconfiguredPlaceReviewer`, which **throws** rather than pretending a model
 * that never ran approved the submission. `createPlace` catches that (and any
 * other reviewer failure), logs it, and returns `review: null` — which is what
 * the old `callAIReview` did on any error, and what
 * `CreateUserPlaceResult.review`'s nullability is for. A caller can therefore
 * tell "the model approved this" from "no model ran"; what it can never get is
 * a fabricated approval.
 *
 * B5b is the fix for the version of this that shipped: the constructor default
 * was the throwing stub itself, so *every* production activation took the
 * `review: null` path and the feature was dark behind a green suite. The
 * regression test in `place-creation-actor.test.ts` constructs this actor with
 * the reviewer argument omitted, which is the one thing the rest of the file
 * never did.
 *
 * ## `google_place_id` is not here either
 *
 * Today's `createUserPlaceAction` passes `google_place_id` straight from the
 * client into the insert (`target-stack.md` §7's live gap). `CreatePlaceInput`
 * has no such field and neither does `CreateUserPlaceInput`, so there is no
 * path from a request to that column at all — see `place-actor.ts`'s class doc
 * for the whole binding story.
 */
import { randomUUID } from "node:crypto";
import type {
  ActorCategory,
  CreatePlaceInput,
  CreateUserPlaceInput,
  CreateUserPlaceResult,
  Ctx,
  DuplicateCandidate,
  LngLat,
  PlaceCreationActorInterface,
  PlaceDto,
  PlaceReview,
} from "@cellar-assistant/contracts";
import {
  ConflictError,
  ForbiddenError,
  isLngLat,
  PLACE_RATE_LIMIT_PER_DAY,
  PLACE_RATE_LIMIT_WINDOW_MS,
  PlaceActorDescriptor,
  PlaceCreationActorDescriptor,
  ValidationError,
} from "@cellar-assistant/contracts";
import { places } from "@cellar-assistant/db";
import { and, count, eq, gte } from "@cellar-assistant/db/orm";
import { bypassesPolicy } from "@cellar-assistant/policy";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { ActorBase } from "../lib/actor-base.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { requireSignedIn } from "../lib/guards.ts";
import { internal } from "../lib/internal-client.ts";
import {
  blockingDuplicate,
  DUPLICATE_RADIUS_METERS,
  duplicatePlaceConflict,
  findDuplicatePlaces,
  normalizeConfidence,
  normalizeCountryCode,
  PLACE_DESCRIPTION_MAX,
  placeRowToDto,
  requireCategories,
  requirePlaceName,
  trimOrNull,
} from "./place-actor.ts";

/** The actor *type* as registered with Dapr. */
export const PLACE_CREATION_ACTOR_TYPE = "PlaceCreationActor";

/**
 * The duplicate rule's numbers live beside `PlaceActor.create`, which applies
 * them authoritatively under the geocell locks; re-exported so both halves of
 * the check read one definition.
 */
export {
  DUPLICATE_BLOCK_DISTANCE_METERS,
  DUPLICATE_BLOCK_SIMILARITY,
  DUPLICATE_LIMIT,
  DUPLICATE_MIN_SIMILARITY,
  DUPLICATE_RADIUS_METERS,
} from "./place-actor.ts";

/** The neutral starting confidence the AI review adjusts. */
export const BASE_CONFIDENCE = 0.5;
export const CONFIDENCE_FLOOR = 0.1;
export const CONFIDENCE_CEILING = 0.9;
/** `reviewUserPlace` clamps its own output to this; so does this actor. */
export const MAX_CONFIDENCE_ADJUSTMENT = 0.3;

/* -------------------------------------------------------------------------- */
/* Injected seams                                                              */
/* -------------------------------------------------------------------------- */

/**
 * How this registry reaches `PlaceActor(newId).create` — §8.5's "registry →
 * entity", a direct synchronous sidecar hop, not an outbox row. Injectable for
 * the same reason `BrandCreator` is: the harness substitutes an in-process
 * `PlaceActor` sharing the test's own transaction.
 */
export type PlaceCreator = (
  ctx: Ctx,
  placeId: string,
  input: CreatePlaceInput & { readonly createdById: string },
) => Promise<PlaceDto>;

/** §8.5: the user waits on the AI review, so `PlaceActor.create` is bounded
 * by the 120s its descriptor declares. */
export const daprPlaceCreator: PlaceCreator = (ctx, placeId, input) =>
  internal(ctx)(PlaceActorDescriptor, placeId).create(input);

/**
 * What the AI review is handed — `functions/reviewUserPlace`'s request body,
 * field for field (checked against `a5b90784^`), with two shape changes and no
 * content changes: the pair `latitude`/`longitude` is this stack's `LngLat`,
 * and the names are camelCase. `postcode` and `email` are absent here because
 * they were absent there — the review judges what a stranger could recognise
 * the venue by, and a postcode adds nothing to that judgement.
 */
export type PlaceReviewSubject = {
  readonly name: string;
  readonly categories: readonly string[];
  readonly location: LngLat;
  readonly streetAddress: string | null;
  readonly locality: string | null;
  readonly region: string | null;
  readonly countryCode: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly description: string | null;
};

export type PlaceReviewer = (
  ctx: Ctx,
  subject: PlaceReviewSubject,
) => Promise<PlaceReview>;

/**
 * What a reviewer owes before it calls anything, whichever model is behind it.
 *
 * `normalizeCreateInput` already guarantees all three for the one caller that
 * exists today, so this never fires from `createPlace`. It is here for the
 * reason `requireExtractableInput` is in `../lib/item-defaults.ts`: the
 * precondition belongs to the *seam*, not to one implementation. "Review this
 * place" over a blank name and no categories is not a hard question, it is an
 * empty one — and a model asked an empty question does not abstain, it invents
 * a venue and returns a verdict on it (measured, for the item-defaults seam:
 * a Château d'Yquem, vintage and all, from no input whatsoever). The old
 * `reviewUserPlace` answered the same case with a 400; this is that 400,
 * moved to where every caller passes through it.
 */
export const requirePlaceReviewSubject = (
  subject: PlaceReviewSubject,
): void => {
  const problems: string[] = [];
  if (subject.name.trim() === "") problems.push("a name");
  if (subject.categories.length === 0) problems.push("at least one category");
  if (!isLngLat(subject.location)) problems.push("a location");
  if (problems.length === 0) return;
  throw new ConflictError(
    `this place submission cannot be reviewed: it is missing ${problems.join(
      ", ",
    )}. A review is a judgement about a specific venue; asked about nothing, ` +
      "a model returns a confident verdict on a venue it made up rather than " +
      "declining — see requireExtractableInput in lib/item-defaults.ts.",
  );
};

/**
 * What a caller reaches when no AI provider is configured. Throws.
 *
 * Running with `AI_PROVIDER` unset is a supported state, not a broken one: the
 * host starts, places are still created, and every AI feature fails naming
 * itself rather than producing something plausible. `#reviewOrNull` catches
 * this and records `review: null`, so an unconfigured deployment behaves the
 * way the old server action did whenever the review errored — a place, the
 * neutral 0.5 confidence, and no claim that anything approved it.
 *
 * (This used to say `services/actors` had no AI client and that a `PlaceReviewer`
 * had to be injected through the constructor. Both halves were false by the
 * time anyone read them — X1 delivered `lib/ai/`, and Dapr constructs actors
 * with `(daprClient, id)` alone, so there is no injection site above this
 * file. Together they were the whole bug: the default below was this stub, so
 * AI place review threw on every production activation while every test
 * passed its own reviewer and stayed green. `item-defaults.ts` carries the
 * same correction for the same reason.)
 */
export const unconfiguredPlaceReviewer: PlaceReviewer = async () => {
  throw new ConflictError(
    "no AI provider is configured to review a user-submitted place: " +
      "AI_PROVIDER is unset, so `installAI()` installed nothing at boot. Set " +
      "AI_PROVIDER=ollama for a local model that needs no credentials — see " +
      "services/actors/README.md · Local AI. Until then each creation is recorded " +
      "with `review: null` and the neutral confidence, which is what the old " +
      "server action did whenever the review failed.",
  );
};

/**
 * The installed reviewer, defaulting to the loud one above.
 *
 * The registry exists because a constructor cannot be reached: Dapr's
 * `ActorManager` builds every actor as `new ActorCls(daprClient, actorId)` and
 * offers no factory hook, so a constructor parameter's *default* is the only
 * wiring production ever sees. `installAI()` calls `setPlaceReviewer` at boot
 * when a provider is configured; a process that never calls it — every test
 * here, and any deployment with `AI_PROVIDER` unset — still gets
 * `unconfiguredPlaceReviewer` and still throws. This is
 * `tier-list-actor.ts`'s `InsightsGenerator` registry, exactly.
 */
let installedPlaceReviewer: PlaceReviewer = unconfiguredPlaceReviewer;

export const setPlaceReviewer = (next: PlaceReviewer): void => {
  installedPlaceReviewer = next;
};

export const placeReviewer = (): PlaceReviewer => installedPlaceReviewer;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

/** `0.5 + adjustment`, both halves clamped, to two decimals for `numeric(3,2)`. */
export const confidenceFromReview = (review: PlaceReview | null): number => {
  if (review === null) return BASE_CONFIDENCE;
  const adjustment = Number.isFinite(review.confidenceAdjustment)
    ? clamp(
        review.confidenceAdjustment,
        -MAX_CONFIDENCE_ADJUSTMENT,
        MAX_CONFIDENCE_ADJUSTMENT,
      )
    : 0;
  return Number(
    clamp(
      BASE_CONFIDENCE + adjustment,
      CONFIDENCE_FLOOR,
      CONFIDENCE_CEILING,
    ).toFixed(2),
  );
};

/* -------------------------------------------------------------------------- */
/* The actor                                                                   */
/* -------------------------------------------------------------------------- */

export class PlaceCreationActor
  extends ActorBase
  implements PlaceCreationActorInterface
{
  /** §2.1: "registry (entity category, no owned table)", as `BrandRegistryActor`. */
  static readonly category: ActorCategory =
    PlaceCreationActorDescriptor.category;

  readonly #createPlaceRow: PlaceCreator;
  readonly #review: PlaceReviewer;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    createPlaceRow: PlaceCreator = daprPlaceCreator,
    // B5b: `placeReviewer()`, **not** `unconfiguredPlaceReviewer`. Dapr builds
    // this actor with two arguments, so this default is production's only
    // wiring; naming the stub here made AI place review throw on every real
    // activation. `GooglePlacesActor` (`google: GooglePlacesClient =
    // googlePlacesClient()`) and `GeocodeActor` (X5) set the same precedent.
    review: PlaceReviewer = placeReviewer(),
  ) {
    super(daprClient, id, db);
    this.#createPlaceRow = createPlaceRow;
    this.#review = review;
  }

  /**
   * The whole creation pipeline, in one turn: validate, rate-limit,
   * duplicate-check, review, delegate.
   */
  async createPlace(
    ctx: Ctx,
    input: CreateUserPlaceInput,
  ): Promise<CreateUserPlaceResult> {
    const createdById = this.#requireCreator(ctx);
    this.#requireOwnKey(createdById);
    const normalized = normalizeCreateInput(input);
    const placeId = this.#requirePlaceId(input.placeId);

    // §8.4, and it has to come *first*. A resubmitted `placeId` is a replay of
    // one creation, not a second one: run the duplicate check before this and
    // the row committed by the first attempt is found 0m away with similarity
    // 1.0, so the retry is refused as a duplicate of itself. Nothing else has
    // happened either — no second rate-limit slot is consumed and no second
    // review is paid for — so the replay returns the row and stops.
    const replay = await this.#existing(placeId);
    if (replay !== null) {
      return { place: replay, nearbyDuplicates: [], review: null };
    }

    await this.#enforceRateLimit(ctx, createdById);

    // The early duplicate check: refuse the obvious case before an AI review
    // is paid for. `PlaceActor.create` runs the same check again under the
    // geocell locks, which is what makes it sound across users (module doc).
    //
    // Self-exclusion closes the remaining window: a concurrent sibling
    // carrying the same `placeId` can commit between the check above and this
    // query, and its row must not block the very creation it *is*.
    const nearby = (
      await this.#duplicates(
        normalized.name,
        normalized.location,
        DUPLICATE_RADIUS_METERS,
      )
    ).filter((candidate) => candidate.placeId !== placeId);
    const blocking = blockingDuplicate(nearby, placeId);
    if (blocking !== undefined) throw duplicatePlaceConflict(blocking);

    const review = await this.#reviewOrNull(ctx, normalized);
    if (review !== null && !review.approved) {
      throw new ValidationError(
        review.rejectionReason ??
          "this place submission was not approved; check the details and try again",
      );
    }

    const place = await this.#createOrConverge(ctx, placeId, {
      ...normalized,
      description:
        normalized.description ??
        trimOrNull(review?.enrichedDescription ?? null),
      confidence: confidenceFromReview(review),
      createdById,
    });

    return { place, nearbyDuplicates: nearby, review };
  }

  /**
   * The duplicate check on its own — the create form calls this as the user
   * types. Read-only, and deliberately *not* a search actor: C1 owns
   * `DuplicatePlaceSearchActor` and this delegates to it once it exists.
   */
  async findDuplicates(
    ctx: Ctx,
    input: {
      readonly name: string;
      readonly location: LngLat;
      readonly radiusMeters?: number;
    },
  ): Promise<readonly DuplicateCandidate[]> {
    requireSignedIn(ctx, "work with places");
    if (!isLngLat(input.location)) {
      throw new ValidationError(
        "location must be { lng, lat } within (-180..180, -90..90)",
      );
    }
    const name = input.name.trim();
    // Today's client-side threshold: fewer than two characters matches
    // everything, so the check is worthless and the query is skipped.
    if (name.length < 2) return [];

    const radius = input.radiusMeters ?? DUPLICATE_RADIUS_METERS;
    if (!Number.isFinite(radius) || radius <= 0 || radius > 5000) {
      throw new ValidationError("radiusMeters must be between 0 and 5000");
    }
    return this.#duplicates(name, input.location, radius);
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * A place is created *by somebody*. `system` has no viewer, so — unlike most
   * methods — a system ctx is refused here rather than waved through: there is
   * no one to attribute the row to, and `places.created_by` is what the rate
   * limit and the map's "added by you" both read.
   */
  #requireCreator(ctx: Ctx): string {
    if (ctx.viewerId === null) {
      throw new ForbiddenError(
        "sign in to create a place; a place is always created by a user, so " +
          "there is no system path through this actor",
      );
    }
    return ctx.viewerId;
  }

  /**
   * The key is the creator's viewer id (module doc), and it is an address,
   * not a credential: a ctx for anyone else is refused before the rate limit
   * is read, so nobody can spend — or be refused from — another user's
   * bucket, or queue behind another user's review.
   */
  #requireOwnKey(creatorId: string): void {
    if (creatorId === this.key) return;
    throw new ForbiddenError(
      `PlaceCreationActor(${this.key}) creates places only for that user; ` +
        "address placeCreationActorId(viewerId) with the viewer's own id",
    );
  }

  /** §8.4: the caller may mint the id, which makes a retried submit a no-op. */
  #requirePlaceId(provided: string | undefined): string {
    if (provided === undefined) return randomUUID();
    if (!UUID_PATTERN.test(provided)) {
      throw new ValidationError(`placeId must be a uuid, got ${provided}`);
    }
    return provided;
  }

  /**
   * 25 per user per 24 hours (`PLACE_RATE_LIMIT_PER_DAY`), backed by
   * `idx_places_created_by_created_at`.
   *
   * One behaviour change from `createUserPlaceAction`, deliberate: the old
   * code caught a failed rate-limit query and **allowed** the creation. A
   * failing count here propagates. Failing open on the one check that exists
   * to stop bulk abuse is the wrong default, and there is no graceful
   * degradation to be had from an unreachable database anyway.
   */
  async #enforceRateLimit(ctx: Ctx, createdById: string): Promise<void> {
    if (bypassesPolicy(ctx)) return;
    const since = new Date(Date.now() - PLACE_RATE_LIMIT_WINDOW_MS);
    const [row] = await this.db
      .select({ total: count() })
      .from(places)
      .where(
        and(eq(places.createdBy, createdById), gte(places.createdAt, since)),
      );
    const total = row?.total ?? 0;
    if (total >= PLACE_RATE_LIMIT_PER_DAY) {
      throw new ForbiddenError(
        `you can add up to ${PLACE_RATE_LIMIT_PER_DAY} places per day ` +
          `(${total} in the last 24 hours); please try again tomorrow`,
      );
    }
  }

  /** `findDuplicatePlaces` (`place-actor.ts`) over this actor's handle. */
  #duplicates(
    name: string,
    location: LngLat,
    radiusMeters: number,
  ): Promise<readonly DuplicateCandidate[]> {
    return findDuplicatePlaces(this.db, name, location, radiusMeters);
  }

  /** Never throws: a review that fails is a review that did not happen. */
  async #reviewOrNull(
    ctx: Ctx,
    subject: PlaceReviewSubject,
  ): Promise<PlaceReview | null> {
    try {
      const review = await this.#review(ctx, subject);
      return {
        ...review,
        confidenceAdjustment: Number.isFinite(review.confidenceAdjustment)
          ? review.confidenceAdjustment
          : 0,
        flags: Array.isArray(review.flags) ? review.flags : [],
      };
    } catch (error) {
      console.warn(
        "[PlaceCreationActor] AI review skipped:",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  /**
   * The one call this actor makes, plus the convergence that makes §8.4's
   * idempotency key real.
   *
   * `PlaceActor.create` is idempotent on its own key when it can *see* the
   * row, but two genuinely concurrent turns for one minted id both see no row
   * and both insert. `places_pkey` decides; the loser's unique violation
   * arrives here as a `ConflictError`, and the answer is the winner's row —
   * exactly `BrandRegistryActor.resolve`'s shape, with the primary key playing
   * the part `brands_unique_lower_name` plays there.
   */
  async #createOrConverge(
    ctx: Ctx,
    placeId: string,
    input: CreatePlaceInput & { readonly createdById: string },
  ): Promise<PlaceDto> {
    try {
      return await this.#createPlaceRow(ctx, placeId, input);
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      const row = await this.#existing(placeId);
      // Vanishingly unlikely: the winner's row would have to disappear between
      // the conflict and this re-read. Surface the conflict rather than
      // manufacture a confusing NotFound.
      if (row === null) throw error;
      return row;
    }
  }

  /**
   * The find half of find-or-create, read straight from `places` — the same
   * shape `BrandRegistryActor.loadAggregate` uses, and for the same reason:
   * this actor is not keyed by anything it could load an aggregate from.
   */
  async #existing(placeId: string): Promise<PlaceDto | null> {
    const [row] = await this.db
      .select()
      .from(places)
      .where(eq(places.id, placeId))
      .limit(1);
    return row === undefined ? null : placeRowToDto(row);
  }
}

/* -------------------------------------------------------------------------- */
/* Input normalisation                                                         */
/* -------------------------------------------------------------------------- */

type NormalizedCreateInput = PlaceReviewSubject & {
  readonly postcode: string | null;
  readonly email: string | null;
};

/**
 * Everything `createUserPlaceAction` validated before it inserted, minus the
 * two things that were never the client's to choose (`confidence`, which the
 * review sets, and `google_place_id`, which nothing user-facing sets at all).
 *
 * `requirePlaceName`, `requireCategories` and `normalizeCountryCode` are
 * imported from `place-actor.ts` rather than duplicated: `PlaceActor.create`
 * runs them again on the far side of the sidecar hop, and two copies of a
 * bound would drift.
 */
export const normalizeCreateInput = (
  input: CreateUserPlaceInput,
): NormalizedCreateInput => {
  if (!isLngLat(input.location)) {
    throw new ValidationError(
      "location must be { lng, lat } within (-180..180, -90..90)",
    );
  }
  const description = trimOrNull(input.description);
  if (description !== null && description.length > PLACE_DESCRIPTION_MAX) {
    throw new ValidationError(
      `a description must be under ${PLACE_DESCRIPTION_MAX} characters`,
    );
  }
  // Present so a caller passing one gets told it is ignored rather than
  // silently dropped — `confidence` is the review's to set (§2.1).
  if (normalizeConfidence(input.confidence ?? null) !== null) {
    throw new ValidationError(
      "confidence is set by the AI review, not by the caller",
    );
  }

  return {
    name: requirePlaceName(input.name),
    categories: requireCategories(input.categories),
    location: input.location,
    streetAddress: trimOrNull(input.streetAddress),
    locality: trimOrNull(input.locality),
    region: trimOrNull(input.region),
    postcode: trimOrNull(input.postcode),
    countryCode: normalizeCountryCode(input.countryCode ?? null),
    phone: trimOrNull(input.phone),
    website: normalizeWebsite(input.website),
    email: trimOrNull(input.email),
    description,
  };
};

const WEBSITE_MAX_LENGTH = 2048;
const WEBSITE_PROTOCOL = /^https?:\/\//i;

/**
 * `place-actions.ts`'s `normalizeWebsite`, preserved — including the bare-host
 * convenience (`example.com` → `https://example.com`) the create form relies
 * on. The one change: an unusable value is a `ValidationError` rather than a
 * silent `null`, so a typo is reported instead of quietly discarded.
 */
export const normalizeWebsite = (
  value: string | null | undefined,
): string | null => {
  const trimmed = trimOrNull(value);
  if (trimmed === null) return null;
  if (trimmed.length > WEBSITE_MAX_LENGTH) {
    throw new ValidationError(
      `a website URL must be under ${WEBSITE_MAX_LENGTH} characters`,
    );
  }
  const candidate = WEBSITE_PROTOCOL.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ValidationError(`not a usable website URL: ${trimmed}`);
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !parsed.hostname.includes(".")
  ) {
    throw new ValidationError(`not a usable website URL: ${trimmed}`);
  }
  return parsed.toString();
};
