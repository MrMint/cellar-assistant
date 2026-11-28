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
 * timer or reminder, and its only instance field is its one seam.
 *
 * ## `places_pkey` convergence (§8.4)
 *
 * N genuinely concurrent `createPlace` calls carrying **one** idempotency key
 * (§8.4's `placeId`) converge on one row, because `places_pkey` is the
 * tripwire and `#createOrConverge` below is what makes hitting it survivable
 * rather than a 500. The geocell recheck excludes the creation's own id, so a
 * sibling of the same creation is never mistaken for a duplicate of it.
 *
 * ## The review is not in this turn any more (X27 / D28)
 *
 * This actor used to run the AI review in-turn — §8.5 named it one of the two
 * request-driven exceptions, because the user was staring at a form waiting to
 * be told whether their place was accepted — and N09 later bounded that wait
 * at ~8 s, past which the place was created *unreviewed and shared*. X27
 * inverts it. The place is inserted at once as `pending`, visible to its
 * creator alone ("Under review"), and `PlaceActor.create` queues
 * `PlaceReviewActor.review` in the same transaction (§1.4). The verdict lands
 * later through `PlaceActor.applyReview`: approved → shared; rejected → still
 * creator-only, with the model's reason, for the creator to edit or delete.
 *
 * So the explicit `approved: false` gate is not dropped — it moved from "the
 * creation throws" to "the place is never shared" — and the N09 timeout path
 * no longer leads anywhere public: a review that fails, times out or cannot
 * run (no provider) leaves the place `pending`. Nothing here, or downstream,
 * ever records an approval a model did not make. `CreateUserPlaceResult.review`
 * is therefore always `null` now; the verdict is `place.reviewStatus`.
 *
 * The reviewer seam (`PlaceReviewer`, the `setPlaceReviewer` registry, the
 * unconfigured default that throws) moved to `../lib/place-review.ts` with the
 * review, and is re-exported below for the callers that import it from here.
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
import { BASE_CONFIDENCE } from "../lib/place-review.ts";
import {
  blockingDuplicate,
  DUPLICATE_RADIUS_METERS,
  duplicatePlaceConflict,
  findDuplicatePlaces,
  normalizeCreateInput,
  placeDtoFor,
  requireOwnReplay,
} from "./place-actor.ts";

/** The actor *type* as registered with Dapr. */
export const PLACE_CREATION_ACTOR_TYPE = "PlaceCreationActor";

/**
 * The review seam moved to `../lib/place-review.ts` with the review itself
 * (X27); re-exported for the callers that still import it from here.
 */
export {
  BASE_CONFIDENCE,
  CONFIDENCE_CEILING,
  CONFIDENCE_FLOOR,
  confidenceFromReview,
  MAX_CONFIDENCE_ADJUSTMENT,
  type PlaceReviewer,
  type PlaceReviewSubject,
  placeReviewer,
  requirePlaceReviewSubject,
  setPlaceReviewer,
  unconfiguredPlaceReviewer,
} from "../lib/place-review.ts";
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
  normalizeCreateInput,
  normalizeWebsite,
} from "./place-actor.ts";

/* -------------------------------------------------------------------------- */
/* Injected seam                                                               */
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

/** Bounded by the 30s `PlaceActor.create` declares. */
export const daprPlaceCreator: PlaceCreator = (ctx, placeId, input) =>
  internal(ctx)(PlaceActorDescriptor, placeId).create(input);

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    createPlaceRow: PlaceCreator = daprPlaceCreator,
  ) {
    super(daprClient, id, db);
    this.#createPlaceRow = createPlaceRow;
  }

  /**
   * The whole creation pipeline, in one short turn: validate, rate-limit,
   * duplicate-check, delegate. The place comes back `pending` — its creator's
   * alone — with its review already queued (module doc).
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
    // review is queued — so the replay returns the row and stops.
    //
    // X27: only the creator's own row is a replay. Another user's row under
    // the same id is refused in one wording whatever its review status, so
    // the id cannot be used to learn whether an unshared place sits behind it.
    const replay = await this.#existing(placeId);
    if (replay !== null) {
      requireOwnReplay(replay, createdById, placeId);
      return {
        place: placeDtoFor(ctx, replay),
        nearbyDuplicates: [],
        review: null,
      };
    }

    await this.#enforceRateLimit(ctx, createdById);

    // The early duplicate check: refuse the obvious case before the insert.
    // `PlaceActor.create` runs the same check again under the geocell locks,
    // which is what makes it sound across users (module doc).
    //
    // X27: from the creator's point of view — shared places, plus the
    // creator's own unshared ones. Somebody else's pending place is neither
    // a block nor a near-miss: either would tell this creator it exists.
    //
    // Self-exclusion closes the remaining window: a concurrent sibling
    // carrying the same `placeId` can commit between the check above and this
    // query, and its row must not block the very creation it *is*.
    const nearby = (
      await this.#duplicates(
        normalized.name,
        normalized.location,
        DUPLICATE_RADIUS_METERS,
        createdById,
      )
    ).filter((candidate) => candidate.placeId !== placeId);
    const blocking = blockingDuplicate(nearby, placeId);
    if (blocking !== undefined) throw duplicatePlaceConflict(blocking);

    const place = await this.#createOrConverge(ctx, placeId, {
      ...normalized,
      // The neutral confidence a review then moves (`applyReview`); the
      // caller may never choose its own (`normalizeCreateInput`).
      confidence: BASE_CONFIDENCE,
      createdById,
    });

    // `review: null` always: the verdict arrives later, on
    // `place.reviewStatus` (module doc).
    return { place, nearbyDuplicates: nearby, review: null };
  }

  /**
   * The duplicate check on its own — the create form calls this as the user
   * types. Read-only, and deliberately *not* a search actor: C1 owns
   * `DuplicatePlaceSearchActor` and this delegates to it once it exists.
   * Scoped to the viewer like the creation check (X27).
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
    return this.#duplicates(name, input.location, radius, ctx.viewerId);
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * A place is created *by somebody*. `system` has no viewer, so — unlike most
   * methods — a system ctx is refused here rather than waved through: there is
   * no one to attribute the row to, and `places.created_by` is what the rate
   * limit, the map's "added by you" and X27's creator-only visibility all read.
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
   * bucket.
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
   * `idx_places_created_by_created_at`. Every status counts: a pending or
   * rejected place is still a creation.
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
    viewerId: string | null,
  ): Promise<readonly DuplicateCandidate[]> {
    return findDuplicatePlaces(this.db, name, location, radiusMeters, viewerId);
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
   * the part `brands_unique_lower_name` plays there. The winner must be this
   * creator's own sibling; anybody else's row is refused (`requireOwnReplay`).
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
      requireOwnReplay(row, input.createdById, placeId);
      return placeDtoFor(ctx, row);
    }
  }

  /**
   * The find half of find-or-create, read straight from `places` — the same
   * shape `BrandRegistryActor.loadAggregate` uses, and for the same reason:
   * this actor is not keyed by anything it could load an aggregate from.
   */
  async #existing(placeId: string) {
    const [row] = await this.db
      .select()
      .from(places)
      .where(eq(places.id, placeId))
      .limit(1);
    return row ?? null;
  }
}
