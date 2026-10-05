/**
 * The recipe-photo job — C4's `RecipePhotoJobActor`, given a door (A7f).
 *
 * §6 puts `/recipes/ai-generator` on this actor, C4 built it, and **nothing
 * ever exposed it**: no mutation to start a job, no field to poll one. D6 had
 * to ship an explicit "not available" page. This module is the missing door,
 * and only the door — the actor, its stage chain and its idempotency are C4's
 * and are untouched.
 *
 * ## Three fields, because a job is not a request
 *
 * `startRecipePhotoJob` returns as soon as the `jobs` row and its first outbox
 * row are committed — §1.4's "the work was accepted" — not when the recipe
 * exists. The vision call, the group dedupe, the ingredient matching and the
 * instructions are five outbox-delivered batches after that. So the page
 * starts a job, then polls `recipePhotoJob`, then reads
 * `progress.recipeId` when `progress.done` flips.
 *
 * `cancelRecipePhotoJob` is the way out; it is checked at the top of the next
 * batch, so a batch already in flight finishes rather than being torn off
 * mid-write.
 *
 * ## `progress` is a second actor call, and only if you ask for it
 *
 * `RecipePhotoJob` is backed by the `jobs` row (`JobDto`); `progress` calls
 * `RecipePhotoJobActor.result` to read the stage cursor. A poll that only
 * needs `status` never pays for it. Both land on the same activation.
 *
 * ## The owner defect this replaces, and why nothing here can reopen it
 *
 * The legacy `processRecipePhoto` action had an authorization defect in how it
 * chose a recipe's owner. It is still live in the legacy production stack, so
 * its details are withheld until that stack is retired.
 *
 * **A job acts as the user who started it.** `JobActor.start` writes
 * `jobs.created_by` from `ctx.viewerId`; `#ownerContext` reads it back and
 * every write in the chain runs as that user. This module keeps that closed by
 * having nothing to pass:
 *
 *  - `StartRecipePhotoJobInput` has no user field, and the resolver builds a
 *    `RecipePhotoJobPayload` — whose `userId?: never` makes adding one a
 *    **compile error**, re-asserted by the `@ts-expect-error` below;
 *  - `assertNoCallerSuppliedUser` re-checks at runtime, because an outbox
 *    payload is JSON with no types at all;
 *  - `recipePhotoJob` and `cancelRecipePhotoJob` take a job id and nothing
 *    else. `JobActor.get` refuses a non-owner with `NotFound` rather than
 *    `Forbidden`, because knowing that a job id is running is itself
 *    information.
 *
 * Do not add a `userId`, an `onBehalfOf`, or an `ownerId` to any of this. The
 * job id is not a secret and must not become the only thing protecting a row.
 */
import { randomUUID } from "node:crypto";
import type {
  JobDto,
  RecipePhotoJobPayload,
  RecipePhotoResult,
} from "@cellar-assistant/contracts";
import {
  assertNoCallerSuppliedUser,
  JOB_STATUSES,
  RECIPE_PHOTO_STAGES,
  RecipePhotoJobActorDescriptor,
  recipePhotoJobActorId,
} from "@cellar-assistant/contracts";
import { builder } from "./builder.ts";
import { failureSummary } from "./failure-summary.ts";

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

const JobStatusEnum = builder.enumType("JobStatus", {
  description:
    "`jobs.status`, per the table's check constraint. `completed`, `failed` " +
    "and `cancelled` are terminal — stop polling on any of the three.",
  values: Object.fromEntries(
    JOB_STATUSES.map((status) => [status.toUpperCase(), { value: status }]),
  ) as { [K in Uppercase<(typeof JOB_STATUSES)[number]>]: { value: string } },
});

const RecipePhotoStageEnum = builder.enumType("RecipePhotoStage", {
  description:
    "Which of the five stages the job has reached. The cursor walks stages " +
    "rather than rows, which is what makes the model call happen exactly " +
    "once: a host killed after `EXTRACT` resumes at `GROUP`.",
  values: Object.fromEntries(
    RECIPE_PHOTO_STAGES.map((stage) => [stage.toUpperCase(), { value: stage }]),
  ) as {
    [K in Uppercase<(typeof RECIPE_PHOTO_STAGES)[number]>]: {
      value: string;
    };
  },
});

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

const RecipePhotoProgressType = builder
  .objectRef<RecipePhotoResult>("RecipePhotoProgress")
  .implement({
    description:
      "Where the stage chain has got to. `recipeId` is deterministic and is " +
      "known before the recipe exists, so it names a row that is being " +
      "created — do not fetch it until `done`.",
    fields: (t) => ({
      jobId: t.exposeID("jobId"),
      recipeId: t.exposeID("recipeId", {
        description:
          "Derived from the job id, so a redelivery cannot fork it. Readable " +
          "through `recipe(id:)` once `done` is true.",
      }),
      recipeGroupId: t.exposeID("recipeGroupId", {
        nullable: true,
        description:
          "Set once the `GROUP` stage has run, or echoed from the input. " +
          "Null when the extraction proposed no group.",
      }),
      stage: t.field({
        type: RecipePhotoStageEnum,
        resolve: (progress) => progress.stage,
      }),
      done: t.exposeBoolean("done", {
        description: "The job completed. `recipeId` now names a real recipe.",
      }),
    }),
  });

const RecipePhotoJobType = builder
  .objectRef<JobDto>("RecipePhotoJob")
  .implement({
    description:
      "One `/recipes/ai-generator` job. Yours alone: a caller who did not " +
      "start it is told it does not exist (§1.6).",
    fields: (t) => ({
      id: t.exposeID("id"),
      status: t.field({
        type: JobStatusEnum,
        resolve: (job) => job.status,
      }),
      processed: t.exposeInt("processed", {
        description: "Stages completed, out of `total`.",
      }),
      total: t.exposeInt("total", {
        nullable: true,
        description: "Five, once the first batch has run. Null before that.",
      }),
      attempts: t.exposeInt("attempts", {
        description:
          "Outbox redeliveries so far. Rises when a stage throws; the stage " +
          "is retried with backoff, not restarted from the beginning.",
      }),
      lastError: t.string({
        nullable: true,
        description:
          "Why the most recent attempt failed, as one bounded sentence — " +
          "**not** the raw text of the failure, which may name an internal " +
          "endpoint (see `failure-summary.ts`). `jobs.last_error` keeps that " +
          "for operators. Present alongside a `RUNNING` status while the " +
          "outbox is still retrying.",
        resolve: (job) => failureSummary(job.lastError),
      }),
      cancelRequested: t.exposeBoolean("cancelRequested", {
        description:
          "Cancellation was asked for and will take effect at the top of the " +
          "next batch. `status` is still `RUNNING` until then.",
      }),
      createdAt: t.expose("createdAt", { type: "DateTime" }),
      startedAt: t.expose("startedAt", { type: "DateTime", nullable: true }),
      finishedAt: t.expose("finishedAt", { type: "DateTime", nullable: true }),
      progress: t.field({
        type: RecipePhotoProgressType,
        description:
          "The stage cursor. A second actor call on the same activation, so " +
          "a poll that only reads `status` does not pay for it.",
        resolve: (job, _args, context) =>
          context
            .actor(RecipePhotoJobActorDescriptor, recipePhotoJobActorId(job.id))
            .result(),
      }),
    }),
  });

/* -------------------------------------------------------------------------- */
/* Input                                                                       */
/* -------------------------------------------------------------------------- */

const StartRecipePhotoJobInput = builder.inputType("StartRecipePhotoJobInput", {
  description:
    "The photo, and nothing about who owns the result. **There is no " +
    "`userId` here and there must never be one** — the recipe is created " +
    "by whoever started the job (`jobs.created_by`, from the session), " +
    "which is what closes target-stack §7.",
  fields: (t) => ({
    fileId: t.id({
      required: true,
      description: "`files.id` of the photo, already uploaded via `FileActor`.",
    }),
    additionalFileIds: t.idList({
      required: false,
      description: "Second page, back of card, and so on.",
    }),
    notes: t.string({
      required: false,
      description: "A free-text hint the user typed alongside the photo.",
    }),
    recipeGroupId: t.id({
      required: false,
      description:
        "File the result into this existing group instead of letting the " +
        "extraction propose one.",
    }),
  }),
});

/**
 * **The §7 fence, at compile time.**
 *
 * `RecipePhotoJobPayload.userId` is declared `never`, so this literal does not
 * typecheck — and `@ts-expect-error` inverts that into an assertion: if a
 * later change makes `userId` assignable, the directive becomes *unused* and
 * `tsc` fails with TS2578. So this breaks the build in both directions, which
 * is what makes it a test rather than a comment.
 *
 * `services/actors/src/actors/recipe-photo-job-actor.test.ts` has the same fence on
 * the actor side. This one is the API side: the resolver above is the only
 * place a *request* can construct a payload.
 */
const _noCallerSuppliedUser: RecipePhotoJobPayload = {
  fileId: "00000000-0000-4000-8000-000000000000",
  // @ts-expect-error — a job acts as `ctx.viewerId`, never a user the caller names (§7).
  userId: "someone-else",
};
void _noCallerSuppliedUser;

/* -------------------------------------------------------------------------- */
/* Fields                                                                      */
/* -------------------------------------------------------------------------- */

builder.queryField("recipePhotoJob", (t) =>
  t.field({
    type: RecipePhotoJobType,
    description:
      "Poll a recipe-photo job. `NotFoundError` covers both 'no such job' " +
      "and 'not yours', because the two must not be distinguishable.",
    errors: {},
    args: { jobId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context
        .actor(
          RecipePhotoJobActorDescriptor,
          recipePhotoJobActorId(String(args.jobId)),
        )
        .get(),
  }),
);

builder.mutationField("startRecipePhotoJob", (t) =>
  t.field({
    type: RecipePhotoJobType,
    description:
      "Read a recipe off a photo. Returns as soon as the job is accepted — " +
      "the five stages run on the outbox after that, so poll " +
      "`recipePhotoJob(jobId:)` and read `progress.recipeId` when " +
      "`progress.done` is true. Idempotent on `jobId`: re-sending the same " +
      "id returns the running job and never starts a second chain or asks " +
      "the model twice.",
    errors: {},
    args: {
      jobId: t.arg.id({
        required: false,
        description:
          "Mint it client-side to make a retry provably the same job; " +
          "otherwise one is generated and returned as `id`.",
      }),
      input: t.arg({ type: StartRecipePhotoJobInput, required: true }),
    },
    resolve: (_root, args, context) => {
      // Annotated, not inferred: the annotation is what makes the fence below
      // bite, and what makes adding a user field here a compile error.
      const payload: RecipePhotoJobPayload = {
        fileId: String(args.input.fileId),
        additionalFileIds: args.input.additionalFileIds?.map(String) ?? [],
        notes: args.input.notes ?? null,
        recipeGroupId:
          args.input.recipeGroupId === undefined ||
          args.input.recipeGroupId === null
            ? null
            : String(args.input.recipeGroupId),
      };
      // The runtime half, because the same object is re-read from `jobs.payload`
      // as untyped JSON on every outbox delivery.
      assertNoCallerSuppliedUser(payload, "a recipe-photo job's payload");
      return context
        .actor(
          RecipePhotoJobActorDescriptor,
          recipePhotoJobActorId(
            args.jobId === undefined || args.jobId === null
              ? randomUUID()
              : String(args.jobId),
          ),
        )
        .start(payload);
    },
  }),
);

builder.mutationField("cancelRecipePhotoJob", (t) =>
  t.field({
    type: RecipePhotoJobType,
    description:
      "Ask a running job to stop. Checked at the top of the next batch, so " +
      "a stage already in flight finishes and nothing is torn down " +
      "mid-write. Cancelling a finished job is a no-op, not an error.",
    errors: {},
    args: { jobId: t.arg.id({ required: true }) },
    resolve: (_root, args, context) =>
      context
        .actor(
          RecipePhotoJobActorDescriptor,
          recipePhotoJobActorId(String(args.jobId)),
        )
        .cancel(),
  }),
);
