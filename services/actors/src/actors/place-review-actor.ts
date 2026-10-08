/**
 * `PlaceReviewActor(placeId)` — X27 / D28: the AI review of a user-submitted
 * place, off everybody's request path.
 *
 * `PlaceActor.create` (and `editUnshared`) insert the place `pending` —
 * visible to its creator only — and queue one outbox row here in the same
 * transaction (§1.4). The delivery reads the row, asks the installed
 * `PlaceReviewer` for a verdict, and hands it to `PlaceActor.applyReview`,
 * which shares the place (approved) or keeps it creator-only with the model's
 * reason (rejected).
 *
 * ## Why a separate actor
 *
 * Dapr runs one turn at a time per actor id. A model call inside
 * `PlaceActor(placeId)` would hold every reader of that place — the creator
 * opening the page they were just sent to, the map drawer — for as long as the
 * model takes (48.7 s measured for one review before N09). Inside
 * `PlaceCreationActor(viewerId)` it would hold that user's next creation. Here
 * it holds nothing but this review: the verdict is applied by a short
 * synchronous hop (registry → entity, §8.5's closed edge set — the same edge
 * `PlaceCreationActor` already uses for `create`).
 *
 * ## Never an approval nobody made
 *
 * The reviewer throws on every failure (`providerPlaceReviewer`, and
 * `unconfiguredPlaceReviewer` with no provider). A throw here fails the
 * delivery: the outbox retries on its backoff and the place stays `pending`
 * the whole time, dead-lettered after the last attempt — visible in the
 * dead-letter report, never shared. The single exception is the unconfigured
 * reviewer, recognised by its reason: no retry can configure a provider, so the
 * delivery ends quietly with the place `pending`, and the creator's next edit
 * (or an admin) queues another.
 *
 * ## Idempotent
 *
 * The payload names the submission (`submittedAt` = `review_requested_at`).
 * A place that is gone, no longer `pending`, or resubmitted since is
 * `skipped` before any model call — so a redelivery after success costs
 * nothing — and `applyReview` checks the same three things again under its
 * own turn, which is what makes a verdict that raced an edit harmless.
 *
 * Keeps nothing in actor state (`../lib/no-actor-state.test.ts`) and owns no
 * table: it reads `places` the way `PlaceCreationActor` does, and writes only
 * through `PlaceActor`.
 */
import type {
  ActorCategory,
  ApplyPlaceReviewInput,
  Ctx,
  InternalPlaceReviewActorInterface,
  PlaceReviewActorInterface,
  PlaceReviewOutcome,
} from "@cellar-assistant/contracts";
import {
  isActorError,
  PlaceActorDescriptor,
  PlaceReviewActorDescriptor,
} from "@cellar-assistant/contracts";
import { places } from "@cellar-assistant/db";
import { eq } from "@cellar-assistant/db/orm";
import type { ActorId, DaprClient } from "@dapr/dapr";
import { ActorBase } from "../lib/actor-base.ts";
import type { DbOrTx } from "../lib/db.ts";
import { actorDb } from "../lib/db.ts";
import { requirePrivileged } from "../lib/guards.ts";
import { internal } from "../lib/internal-client.ts";
import {
  AI_UNCONFIGURED,
  type PlaceReviewer,
  type PlaceReviewSubject,
  placeReviewer,
} from "../lib/place-review.ts";

/**
 * How a verdict reaches `PlaceActor(placeId).applyReview` — the typed client
 * in production, an in-process `PlaceActor` sharing the test's transaction in
 * the harness (`place-review-actor.test.ts`).
 */
export type ReviewApplier = (
  ctx: Ctx,
  placeId: string,
  input: ApplyPlaceReviewInput,
) => Promise<PlaceReviewOutcome>;

export const daprReviewApplier: ReviewApplier = (ctx, placeId, input) =>
  internal(ctx)(PlaceActorDescriptor, placeId).applyReview(input);

export class PlaceReviewActor
  extends ActorBase
  implements PlaceReviewActorInterface, InternalPlaceReviewActorInterface
{
  static readonly category: ActorCategory = PlaceReviewActorDescriptor.category;

  readonly #review: PlaceReviewer;
  readonly #apply: ReviewApplier;

  constructor(
    daprClient: DaprClient,
    id: ActorId,
    db: DbOrTx = actorDb(),
    // B5b's lesson, kept: `placeReviewer()`, **not** the throwing stub. Dapr
    // builds this actor with two arguments, so this default is production's
    // only wiring; `installAI()` fills the registry at boot.
    review: PlaceReviewer = placeReviewer(),
    apply: ReviewApplier = daprReviewApplier,
  ) {
    super(daprClient, id, db);
    this.#review = review;
    this.#apply = apply;
  }

  async review(
    ctx: Ctx,
    payload: { readonly submittedAt: string },
  ): Promise<PlaceReviewOutcome> {
    requirePrivileged(
      ctx,
      "PlaceReviewActor.review is delivered by the outbox; a request may " +
        "never call it directly",
    );

    const [row] = await this.db
      .select()
      .from(places)
      .where(eq(places.id, this.key))
      .limit(1);
    if (row === undefined) {
      return { placeId: this.key, status: "skipped", reason: "gone" };
    }
    if (row.reviewStatus !== "pending") {
      return { placeId: this.key, status: "skipped", reason: "decided" };
    }
    if (
      row.reviewRequestedAt === null ||
      row.reviewRequestedAt.getTime() !== Date.parse(payload.submittedAt)
    ) {
      // An edit replaced the submission this row was queued for; the edit
      // queued its own review.
      return { placeId: this.key, status: "skipped", reason: "stale" };
    }

    const subject: PlaceReviewSubject = {
      name: row.name,
      categories: row.categories,
      location: row.location,
      streetAddress: row.streetAddress,
      locality: row.locality,
      region: row.region,
      countryCode: row.countryCode,
      phone: row.phone,
      website: row.website,
      description: row.description,
    };

    let verdict: Awaited<ReturnType<PlaceReviewer>>;
    try {
      verdict = await this.#review(ctx, subject);
    } catch (error) {
      if (isActorError(error) && error.reason === AI_UNCONFIGURED) {
        console.warn(
          `[PlaceReviewActor] place ${this.key} stays pending: no AI provider ` +
            "is configured to review it",
        );
        return { placeId: this.key, status: "pending", reason: "unconfigured" };
      }
      // Fail the delivery: the outbox retries, the place stays pending.
      throw error;
    }

    return await this.#apply(ctx, this.key, {
      submittedAt: payload.submittedAt,
      review: {
        ...verdict,
        confidenceAdjustment: Number.isFinite(verdict.confidenceAdjustment)
          ? verdict.confidenceAdjustment
          : 0,
        flags: Array.isArray(verdict.flags) ? verdict.flags : [],
      },
    });
  }
}
