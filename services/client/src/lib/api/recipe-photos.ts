/**
 * Reading a recipe off a photo — `startRecipePhotoJob` / `recipePhotoJob` (X11).
 *
 * ## The route this restores
 *
 * `/recipes/ai-generator` shipped as a page whose entire content was an
 * explanation of why it could not exist, listing two blockers:
 *
 * 1. **No mutation.** "sixty-one mutations and not one of them takes a recipe
 *    photo… no job type to poll." There are three:
 *    {@link StartRecipePhotoJobMutation}, {@link RecipePhotoJobQuery} and
 *    `cancelRecipePhotoJob`, plus a `RecipePhotoJob` type with a five-stage
 *    `progress` cursor. C4 built the actor and it has a full GraphQL surface.
 * 2. **No provider.** X1's `services/actors/src/lib/ai/` installs
 *    `RecipePhotoExtractor` among six seams at boot.
 *
 * Both were false, and the route was dark for two workstreams because nothing
 * re-reads a page that says it is finished. `src/lib/dev-checks/
 * capability-claims.test.ts` is the guard that now checks claims of this shape
 * against the SDL and the filesystem.
 *
 * ## Why this polls rather than waits
 *
 * `startRecipePhotoJob` returns **as soon as the job is accepted**, not when it
 * is done: five stages (`EXTRACT`, `GROUP`, `INGREDIENTS`, `INSTRUCTIONS`,
 * `RECIPE`) then run on the outbox. So the mutation's answer is a job id, and
 * `recipePhotoJob(jobId:)` is the progress read.
 *
 * The stage cursor is what makes the model call happen exactly once — a host
 * killed after `EXTRACT` resumes at `GROUP` rather than re-asking — and it is
 * also why `attempts` rising is normal rather than alarming: a stage that
 * throws is retried with backoff, not restarted from the beginning.
 *
 * ## Two things about `progress.recipeId` that decide the UI
 *
 * It is **non-null from the first poll**, because it is derived from the job id
 * rather than from a row that exists. So it must not be treated as "the recipe
 * is ready" — only `progress.done` means that, and the schema says so in as
 * many words. Linking to `recipe(id:)` before then lands on a `NotFoundError`.
 *
 * And because it is derived, re-sending the same `jobId` is idempotent all the
 * way down: the schema promises a repeat "returns the running job and never
 * starts a second chain or asks the model twice". That is why the caller mints
 * the id.
 */

import { ActorErrorFieldsFragment } from "./errors.ts";
import { graphql } from "./graphql.ts";

/** How often to ask for progress. Five stages, none of them instant. */
export const RECIPE_PHOTO_POLL_MS = 2_000;

/**
 * Give up polling after this long.
 *
 * Not a cancellation — the job keeps running on the outbox and the page offers
 * its id — just the point at which a spinner stops being informative.
 */
export const RECIPE_PHOTO_TIMEOUT_MS = 180_000;

/** The five stages, in the order the cursor walks them. */
export const RECIPE_PHOTO_STAGES = [
  "EXTRACT",
  "GROUP",
  "INGREDIENTS",
  "INSTRUCTIONS",
  "RECIPE",
] as const;

/** Human labels for {@link RECIPE_PHOTO_STAGES}, for the progress line. */
export const RECIPE_PHOTO_STAGE_LABEL: Record<string, string> = {
  EXTRACT: "Reading the photo",
  GROUP: "Finding a home for it",
  INGREDIENTS: "Writing down ingredients",
  INSTRUCTIONS: "Writing down the method",
  RECIPE: "Saving the recipe",
};

/**
 * Start the job.
 *
 * `input.fileId` must already be uploaded **and verified** — nothing on this
 * path verifies for you — so `uploadFile(..., { verify: true })`.
 */
export const StartRecipePhotoJobMutation = graphql(
  `
  mutation StartRecipePhotoJob($input: StartRecipePhotoJobInput!, $jobId: ID) {
    startRecipePhotoJob(input: $input, jobId: $jobId) {
      __typename
      ... on RecipePhotoJob {
        id
        status
        attempts
        total
        processed
        lastError
        progress {
          jobId
          stage
          done
          recipeId
          recipeGroupId
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * Poll it.
 *
 * `NotFoundError` covers both "no such job" and "not yours", deliberately — a
 * job id is not an oracle — so the UI must not distinguish them either.
 */
export const RecipePhotoJobQuery = graphql(
  `
  query RecipePhotoJob($jobId: ID!) {
    recipePhotoJob(jobId: $jobId) {
      __typename
      ... on RecipePhotoJob {
        id
        status
        attempts
        total
        processed
        lastError
        finishedAt
        cancelRequested
        progress {
          jobId
          stage
          done
          recipeId
          recipeGroupId
        }
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);

/**
 * Ask it to stop.
 *
 * Takes effect at the top of the next batch, so `status` stays `RUNNING` and
 * `cancelRequested` goes true in the meantime — the UI should say "stopping"
 * rather than "stopped".
 */
export const CancelRecipePhotoJobMutation = graphql(
  `
  mutation CancelRecipePhotoJob($jobId: ID!) {
    cancelRecipePhotoJob(jobId: $jobId) {
      __typename
      ... on RecipePhotoJob {
        id
        status
        cancelRequested
      }
      ...ActorErrorFields
    }
  }
`,
  [ActorErrorFieldsFragment],
);
