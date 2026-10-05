/**
 * C4's job actors — migration plan §2.6.
 *
 * Three finite cursor chains, all on `JobActor`:
 *
 * | actor | replaces | chains over |
 * |---|---|---|
 * | `PlaceRefreshJobActor` | `refreshPlaces` + `processPlaceRefreshBatch` | stale `places` rows, in `id` order |
 * | `OnboardingReprocessJobActor` | `reprocessOnboardingBatch` | `item_onboardings` rows, in `id` order |
 * | `RecipePhotoJobActor` | `processRecipePhoto` + `_utils/recipe-database` | the *stages* of one photo, not rows |
 * | `VectorReembedJobActor` | nothing (legacy had no re-embed) | `item_vectors` then `recipe_vectors` rows another embedding made, in `id` order |
 *
 * `MaintenanceActor` is listed alongside these in §2.6 and is **not** one of
 * them: it is an unbounded scheduled singleton with no terminal state, so it
 * stays a plain `ActorBase` (A5 and A8 both landed it that way; C4 agrees and
 * only extended it).
 *
 * ## No payload carries a user id — deliberately
 *
 * `target-stack.md` §7 records the live authorization gap this replaces:
 *
 * > `processRecipePhoto` takes a client-supplied `userId`.
 *
 * A job's principal is `jobs.created_by`, which `JobActor.start` writes from
 * `ctx.viewerId` and nothing else can reach. So every payload type below is
 * declared with an explicitly *forbidden* `userId`, which turns a reintroduced
 * client-supplied user id into a compile error as well as a runtime one
 * (`assertNoCallerSuppliedUser`).
 *
 * ## Every job actor has a descriptor; only one has a resolver
 *
 * `services/api` never addresses most of these through a typed proxy, because
 * §8.5 lets a resolver call one but every *chained* call comes from the outbox.
 * They used to be plain type + constant exports for that reason. They are
 * descriptors now anyway, because the descriptor is also what ties an actor
 * class to its contract: `services/actors/src/actors/registry.ts` registers
 * each class *with* its descriptor and refuses a class whose methods do not
 * match it — which is the check a descriptor-less actor had no way to get.
 *
 * **`RecipePhotoJobActor` is still the only one a resolver names**, and A7f is
 * where that shows up. §6 puts `/recipes/ai-generator` on it: a *user* starts
 * that job from a request and watches it finish, so a resolver has to be able
 * to call `start` and poll `result`. §8.5's `resolver → job` edge is exactly
 * that call. The others remain unnamed by the schema, and
 * `services/api/src/schema/actor-surface.test.ts` keeps each on its explicit
 * allow-list of actors with no GraphQL surface.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type {
  CompensationResult,
  DeadDeliveryNotice,
} from "./dead-delivery.ts";
import { ValidationError } from "./errors.ts";
import {
  MENU_MATCH_JOB_ACTOR_TYPE,
  type MenuMatchJobPayload,
} from "./menu-scans.ts";

/* -------------------------------------------------------------------------- */
/* The `jobs` row, as `services/api` sees it                                       */
/* -------------------------------------------------------------------------- */

/**
 * A `jobs` row over the wire.
 *
 * `services/actors` types this as `typeof jobs.$inferSelect` (a Drizzle inference),
 * which `services/api` cannot import without dragging Drizzle into the API process
 * — the same reason `proxy.ts` gives for not importing `@dapr/dapr`. So the
 * shape is restated here, as JSON: the two `timestamptz` columns arrive as
 * ISO-8601 strings rather than `Date`s.
 *
 * `cursor` and `payload` are **deliberately absent**. A recipe-photo cursor
 * holds the whole model extraction and the payload holds file ids; neither is
 * progress, and §2.6's progress projection is `RecipePhotoResult`. Adding them
 * here would put a job's internals on the public schema for nothing.
 */
/**
 * `jobs.status`, per the table's own check constraint. Restated here (rather
 * than imported from `services/actors`) for the same reason `JobDto` is.
 */
export const JOB_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const isJobStatus = (value: string): value is JobStatus =>
  (JOB_STATUSES as readonly string[]).includes(value);

export type JobDto = {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  /** Total units of work, once the job knows. Null until then. */
  readonly total: number | null;
  readonly processed: number;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly cancelRequested: boolean;
  /** The job's principal (§7). Written from `ctx.viewerId` by `start`. */
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
};

/* -------------------------------------------------------------------------- */
/* The surface every job actor shares                                          */
/* -------------------------------------------------------------------------- */

/**
 * The three methods `JobActor` (`services/actors/src/actors/job-actor/`) gives
 * every job. Who may call `start` is each subclass's own `authorizeStart`, not
 * something this type can say.
 */
export type JobActorInterface<TPayload> = {
  start(ctx: Ctx, payload: TPayload): Promise<JobDto>;
  get(ctx: Ctx): Promise<JobDto>;
  cancel(ctx: Ctx): Promise<JobDto>;
};

/** Why a delivered `runBatch` did nothing. Returned rather than thrown. */
export type BatchSkip =
  | "terminal" // the job already finished, failed or was cancelled
  | "cancelled" // cancellation was requested; this call performed the flip
  | "duplicate"; // an at-least-once re-delivery of an already-processed batch

export type RunBatchResult =
  | { readonly ran: true; readonly processed: number; readonly done: boolean }
  | { readonly ran: false; readonly reason: BatchSkip };

/**
 * `runBatch` is delivered by the outbox and only by the outbox — it refuses any
 * ctx that is not `system` — so it is internal on every job actor.
 */
export type InternalJobActorInterface = {
  runBatch(
    ctx: Ctx,
    delivery?: { readonly batch?: number },
  ): Promise<RunBatchResult>;
  /**
   * Every `runBatch`'s `onDead`: the outbox gave up on a batch, so the job
   * has failed. Enqueued by the drainer alone, in the statement that
   * dead-letters the batch's row — including when the host died mid-batch on
   * the last attempt and `runBatch` never got the turn to say so itself.
   * `system` only; idempotent (a terminal job, or one already past the dead
   * batch, is left alone).
   */
  markFailed(ctx: Ctx, notice: DeadDeliveryNotice): Promise<CompensationResult>;
};

/* -------------------------------------------------------------------------- */
/* MenuMatchJobActor (B8)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Started only by `MenuScanActor.match`'s outbox row, and `system`-only on
 * every method; its payload and kind live beside `MenuScanActor` in
 * `./menu-scans.ts`.
 */
export const MenuMatchJobActorDescriptor: ActorDescriptor<
  JobActorInterface<MenuMatchJobPayload>,
  InternalJobActorInterface
> = {
  actorType: MENU_MATCH_JOB_ACTOR_TYPE,
  category: "job",
  methods: {
    start: {},
    get: {},
    cancel: {},
  },
  internalMethods: {
    runBatch: {},
    markFailed: {},
  },
};

/* -------------------------------------------------------------------------- */
/* The `userId` fence                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A payload that may not name a user.
 *
 * `userId?: never` is not decoration: an object literal with a `userId`
 * property fails to typecheck against it, so the §7 IDOR cannot be
 * reintroduced by a caller who simply forgets that jobs derive their principal
 * from `ctx`. The runtime half is `assertNoCallerSuppliedUser`, because a
 * payload arriving from the outbox is JSON and has no types at all.
 */
export type ViewerlessJobPayload = {
  readonly userId?: never;
  readonly user_id?: never;
  readonly createdBy?: never;
  readonly created_by?: never;
};

/** Keys that would mean "act as this user", in either casing. */
export const FORBIDDEN_JOB_PAYLOAD_KEYS = [
  "userId",
  "user_id",
  "createdBy",
  "created_by",
  "viewerId",
  "viewer_id",
  "ownerId",
  "owner_id",
] as const;

/**
 * Refuse a payload that names a user.
 *
 * The principal of a job is `jobs.created_by`, taken from `ctx.viewerId` when
 * the job was started (§1.6, §8.2). A payload key that looks like a user id is
 * therefore either a mistake or an attempt to act as someone else, and both
 * are `Validation` — never "ignored quietly", which is how the old
 * `processRecipePhoto` behaved right up until it wrote a recipe under a user
 * the caller merely named.
 */
export const assertNoCallerSuppliedUser = (
  payload: Record<string, unknown> | null | undefined,
  what: string,
): void => {
  if (payload === null || payload === undefined) return;
  for (const key of FORBIDDEN_JOB_PAYLOAD_KEYS) {
    if (Object.hasOwn(payload, key)) {
      throw new ValidationError(
        `${what} may not carry \`${key}\`: a job acts as the user who started ` +
          "it (`jobs.created_by`, from `ctx.viewerId`), never as a user named " +
          "by the caller (target-stack.md §7).",
      );
    }
  }
};

/* -------------------------------------------------------------------------- */
/* PlaceRefreshJobActor                                                        */
/* -------------------------------------------------------------------------- */

export const PLACE_REFRESH_JOB_KIND = "place-refresh";
export const PLACE_REFRESH_JOB_ACTOR_TYPE = "PlaceRefreshJobActor";

/**
 * Places refreshed per batch. Small on purpose: each one is up to eight Google
 * round-trips inside `PlaceActor.refreshFromSource`, and §8.5 wants an
 * outbox-delivered turn to return promptly.
 */
export const PLACE_REFRESH_BATCH_SIZE = 10;
export const PLACE_REFRESH_MAX_BATCH_SIZE = 50;

/** A place is stale when its `last_sync_at` is older than this (or is null). */
export const PLACE_REFRESH_STALE_DAYS = 30;

export type PlaceRefreshJobPayload = ViewerlessJobPayload & {
  /** Staleness cutoff in days. Defaults to `PLACE_REFRESH_STALE_DAYS`. */
  readonly staleAfterDays?: number;
  /** Places per batch. Defaults to `PLACE_REFRESH_BATCH_SIZE`. */
  readonly batchSize?: number;
  /** Stop after this many places. Omit for "every stale place". */
  readonly maxPlaces?: number;
  /** Passed through to `PlaceActor.refreshFromSource`. */
  readonly maxPhotos?: number;
  /**
   * Restrict the walk to these place ids. The operator-driven case ("refresh
   * these five"), still batched and still cursor-chained.
   */
  readonly placeIds?: readonly string[];
};

/** Operator tooling: `start` is admin-only (C4). */
export const PlaceRefreshJobActorDescriptor: ActorDescriptor<
  JobActorInterface<PlaceRefreshJobPayload>,
  InternalJobActorInterface
> = {
  actorType: PLACE_REFRESH_JOB_ACTOR_TYPE,
  category: "job",
  methods: {
    start: {},
    get: {},
    cancel: {},
  },
  internalMethods: {
    // One `PlaceActor.refreshFromSource` (90s, up to eight Google
    // round-trips) is the worst case of one place; the batch stops starting
    // places once the next one's worst case would not finish inside this
    // (`JobActor`'s `BatchBudget`). Kept to one worst-case place plus margin
    // rather than the drainer's 300s ceiling: the drainer is serial, and this
    // is how long one batch may hold every other outbox row behind it.
    runBatch: { timeoutMs: 120_000 },
    markFailed: {},
  },
};

export type PlaceRefreshCursor = {
  /** Places are walked in `id` order; this is the last id of the last batch. */
  readonly lastPlaceId: string | null;
  readonly refreshed: number;
  readonly skipped: number;
  readonly failed: number;
  /** Set when the chain ended early — today, only an exhausted budget. */
  readonly stopped?: string | null;
};

/* -------------------------------------------------------------------------- */
/* OnboardingReprocessJobActor                                                 */
/* -------------------------------------------------------------------------- */

export const ONBOARDING_REPROCESS_JOB_KIND = "onboarding-reprocess";
export const ONBOARDING_REPROCESS_JOB_ACTOR_TYPE =
  "OnboardingReprocessJobActor";

/**
 * Onboardings per batch. Smaller than the place walk because each row is a
 * multi-second vision call in `ItemOnboardingActor.reprocess`.
 */
export const ONBOARDING_REPROCESS_BATCH_SIZE = 5;
export const ONBOARDING_REPROCESS_MAX_BATCH_SIZE = 25;

export type OnboardingReprocessJobPayload = ViewerlessJobPayload & {
  /** Only rows of this `item_type`. Omit for all of them. */
  readonly itemType?: string;
  /**
   * `onboarding_reprocess_jobs.filter_ai_model`: only rows extracted by this
   * model. The reason the job exists — "re-run everything the old model did".
   */
  readonly aiModel?: string;
  /** Only rows created before this ISO timestamp. */
  readonly createdBefore?: string;
  /** Rows per batch. Defaults to `ONBOARDING_REPROCESS_BATCH_SIZE`. */
  readonly batchSize?: number;
  /** Stop after this many rows. Omit for "every matching row". */
  readonly maxOnboardings?: number;
  /** Only these onboarding ids. */
  readonly onboardingIds?: readonly string[];
};

/** Operator tooling: `start` is admin-only (C4). */
export const OnboardingReprocessJobActorDescriptor: ActorDescriptor<
  JobActorInterface<OnboardingReprocessJobPayload>,
  InternalJobActorInterface
> = {
  actorType: ONBOARDING_REPROCESS_JOB_ACTOR_TYPE,
  category: "job",
  methods: {
    start: {},
    get: {},
    cancel: {},
  },
  internalMethods: {
    // One `ItemOnboardingActor.reprocess` (90s, a vision call) is the worst
    // case of one row; the batch stops starting rows once the next one's
    // worst case would not finish inside this (`JobActor`'s `BatchBudget`),
    // so a slow model shortens the batch instead of timing out the delivery.
    // Kept to one worst-case row plus margin rather than the drainer's 300s
    // ceiling: the drainer is serial, and this is how long one batch may
    // hold every other outbox row behind it.
    runBatch: { timeoutMs: 120_000 },
    markFailed: {},
  },
};

/**
 * A `(created_at, id)` keyset.
 *
 * The old `onboarding_reprocess_jobs.cursor` held `created_at` alone, which is
 * **not unique** — two rows sharing a timestamp across a batch boundary were
 * silently skipped. `id` breaks the tie and costs nothing.
 */
export type OnboardingReprocessCursor = {
  readonly lastCreatedAt: string | null;
  readonly lastOnboardingId: string | null;
  readonly reprocessed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly stopped?: string | null;
};

/* -------------------------------------------------------------------------- */
/* RecipePhotoJobActor                                                         */
/* -------------------------------------------------------------------------- */

export const RECIPE_PHOTO_JOB_KIND = "recipe-photo";
export const RECIPE_PHOTO_JOB_ACTOR_TYPE = "RecipePhotoJobActor";

/**
 * The stages of one photo, in order. This job's "cursor" walks *stages*
 * rather than rows, because the work is one photo and the batches are its
 * phases — which is exactly what makes it resumable: a host killed after
 * `extract` restarts at `recipe`, and the model is never asked twice.
 */
export const RECIPE_PHOTO_STAGES = [
  /** Vision call: photo → structured recipe. Writes nothing. */
  "extract",
  /** `RecipeGroupActor.create`, when the extraction proposed a group. */
  "group",
  /** `RecipeActor.create`. */
  "recipe",
  /**
   * Each ingredient: `ItemSearchActor` for an existing item, else
   * `BrandRegistryActor` + `ItemActor` for a new one, else a generic item —
   * then `RecipeActor.setIngredients`.
   */
  "ingredients",
  /** `RecipeActor.setInstructions`. The last stage; the job completes. */
  "instructions",
] as const;

export type RecipePhotoStage = (typeof RECIPE_PHOTO_STAGES)[number];

export const isRecipePhotoStage = (value: string): value is RecipePhotoStage =>
  (RECIPE_PHOTO_STAGES as readonly string[]).includes(value);

/**
 * What starts a recipe-photo job.
 *
 * **No `userId`.** The recipe is created by whoever started the job, read from
 * `jobs.created_by`. That single change is what closes target-stack §7's IDOR;
 * `ViewerlessJobPayload` and `assertNoCallerSuppliedUser` keep it closed.
 */
export type RecipePhotoJobPayload = ViewerlessJobPayload & {
  /** `files.id` of the photo, already verified by `FileActor`. */
  readonly fileId: string;
  /** Optional second page / back of card. */
  readonly additionalFileIds?: readonly string[];
  /** Free-text hint the user typed alongside the photo. */
  readonly notes?: string | null;
  /** File the extraction and result into this existing group, if given. */
  readonly recipeGroupId?: string | null;
};

/**
 * Everything the chain has produced so far. Written to `jobs.cursor` with the
 * stage advance, in one transaction, so a crash resumes rather than restarts.
 */
export type RecipePhotoCursor = {
  readonly stage: RecipePhotoStage;
  /** Minted before `recipe`, so `RecipeActor.create` is idempotent on it. */
  readonly recipeId: string;
  /** The extraction, once the model has answered. */
  readonly extraction: ExtractedRecipe | null;
  /** Set by the `group` stage, or echoed from the payload. */
  readonly recipeGroupId: string | null;
  readonly model: string | null;
};

/** One ingredient the model read off the photo. */
export type ExtractedRecipeIngredient = {
  readonly name: string;
  readonly quantity?: number | null;
  readonly unit?: string | null;
  readonly isOptional?: boolean | null;
  readonly substitutionNotes?: string | null;
  /**
   * Which item type a real item would be: the prompt asks for `wine`,
   * `spirit`, … (`ITEM_TYPES`, lowercased). Free text, so the matcher
   * (`declaredItemType` in `services/actors`) reads it case-insensitively and
   * accepts the plural as well; anything else searches all six types.
   */
  readonly itemType?: string | null;
  /** Brand as printed. Resolved through `BrandRegistryActor`, never inserted. */
  readonly brandName?: string | null;
  /** `generic_items.category` for the fallback generic item. */
  readonly category?: string | null;
};

export type ExtractedRecipeInstruction = {
  readonly instructionText: string;
  readonly instructionType?: string | null;
  readonly equipmentNeeded?: string | null;
  readonly timeMinutes?: number | null;
};

/** The vision seam's structured output. */
export type ExtractedRecipe = {
  readonly name: string;
  readonly type: string;
  readonly description?: string | null;
  readonly difficultyLevel?: number | null;
  readonly prepTimeMinutes?: number | null;
  readonly servingSize?: number | null;
  readonly ingredients: readonly ExtractedRecipeIngredient[];
  readonly instructions: readonly ExtractedRecipeInstruction[];
  /**
   * A group the model thinks this is a variation of ("Old Fashioned"). Created
   * only when the payload named none.
   */
  readonly groupName?: string | null;
  readonly groupCategory?: string | null;
  readonly confidence?: number | null;
};

export type RecipePhotoResult = {
  readonly jobId: string;
  readonly recipeId: string;
  readonly recipeGroupId: string | null;
  readonly stage: RecipePhotoStage;
  readonly done: boolean;
};

/**
 * The door `/recipes/ai-generator` knocks on (A7f).
 *
 * §8.5 permits `resolver → job`, and this is the one job a person starts:
 * `start` accepts the photo, `result` is the poll the page renders, `job`
 * carries the failure a poll has to be able to show, and `cancel` is the
 * user's way out of a job that has stopped being useful.
 *
 * **There is no user id anywhere in this interface, in either direction.**
 * `start` takes a `RecipePhotoJobPayload`, whose `userId?: never` makes naming
 * one a compile error; the actor's principal is `jobs.created_by`, written
 * from `ctx.viewerId`. `get`/`result`/`cancel` take no argument at all beyond
 * the bound `Ctx` — the actor's own `isOwner` check decides, and a caller who
 * is not the owner is told the job does not exist. That is the whole of
 * target-stack §7's `processRecipePhoto` IDOR, closed by having nothing to
 * pass.
 */
export type RecipePhotoJobActorInterface = {
  start(ctx: Ctx, payload: RecipePhotoJobPayload): Promise<JobDto>;
  get(ctx: Ctx): Promise<JobDto>;
  cancel(ctx: Ctx): Promise<JobDto>;
  result(ctx: Ctx): Promise<RecipePhotoResult>;
};

export const RecipePhotoJobActorDescriptor: ActorDescriptor<
  RecipePhotoJobActorInterface,
  InternalJobActorInterface
> = {
  actorType: RECIPE_PHOTO_JOB_ACTOR_TYPE,
  category: "job",
  // Its first batch is the vision extraction.
  methods: {
    start: { modelBacked: true },
    get: {},
    cancel: {},
    result: {},
  },
  internalMethods: {
    runBatch: {},
    markFailed: {},
  },
};

/**
 * A recipe-photo job's id is minted by the client (or by the resolver) and is
 * the idempotency key for the whole chain: `RecipeActor.create` derives the
 * recipe id from it, so re-sending `startRecipePhotoJob` with the same job id
 * yields one recipe rather than two. Trivial, and still a function for the
 * same reason `mapActorId` is: `services/api` must not build an actor id by hand.
 */
export const recipePhotoJobActorId = (jobId: string): string => jobId;

/* -------------------------------------------------------------------------- */
/* OvertureReloadJobActor (C4b)                                                */
/* -------------------------------------------------------------------------- */

export const OVERTURE_RELOAD_JOB_KIND = "overture-reload";
export const OVERTURE_RELOAD_JOB_ACTOR_TYPE = "OvertureReloadJobActor";

/**
 * Source rows per batch, and therefore rows per `PlaceActor` bulk turn and per
 * upsert statement. The old Nhost pair used 5000 from BigQuery split into
 * GraphQL mutations of 500; a batch here is one fetch, one statement and one
 * cursor commit, so the two numbers collapse into this one.
 */
export const OVERTURE_RELOAD_BATCH_SIZE = 500;
export const OVERTURE_RELOAD_MAX_BATCH_SIZE = 2_000;

/**
 * Rejected source rows tolerated before the chain gives up. A handful of
 * malformed rows is normal in a third-party extract and must not wedge a
 * reload (they are counted and walked past); a source that is *entirely*
 * malformed is a schema change at the other end and must not be ground
 * through silently.
 */
export const OVERTURE_RELOAD_MAX_REJECTED = 1_000;

export type OvertureReloadJobPayload = ViewerlessJobPayload & {
  /** Source rows per batch. Defaults to `OVERTURE_RELOAD_BATCH_SIZE`. */
  readonly batchSize?: number;
  /** Stop after this many source rows. Omit for "the whole table". */
  readonly maxPlaces?: number;
  /** Give up after this many rejected rows. Defaults to the constant above. */
  readonly maxRejected?: number;
};

/**
 * Operator tooling (C4b): `start` is admin-only and refuses unless a source was
 * installed at boot.
 */
export const OvertureReloadJobActorDescriptor: ActorDescriptor<
  JobActorInterface<OvertureReloadJobPayload>,
  InternalJobActorInterface
> = {
  actorType: OVERTURE_RELOAD_JOB_ACTOR_TYPE,
  category: "job",
  methods: {
    start: {},
    get: {},
    cancel: {},
  },
  internalMethods: {
    // One BigQuery page (`OVERTURE_TIMEOUT_MS`, 120s by default) and one
    // `PlaceActor.bulkUpsertFromOverture` (120s) in a single turn, plus the
    // turn around them. This is how long the outbox waits for the delivery
    // (`pairDeliveryTimeoutMs`); it is also the drainer's ceiling, half of
    // `RECLAIM_AFTER`, so a longer page means a smaller `batchSize`.
    runBatch: { timeoutMs: 300_000 },
    markFailed: {},
  },
};

/**
 * The keyset cursor, in `overture_id` order — the source's own primary key and
 * the same order the old `processPlaceRefreshBatch` walked. Unique, so unlike
 * the `created_at` cursor C4 replaced, no row can fall between two batches.
 */
export type OvertureReloadCursor = {
  readonly lastOvertureId: string | null;
  /** Source rows read, including the rejected ones. */
  readonly fetched: number;
  readonly inserted: number;
  readonly updated: number;
  readonly unchanged: number;
  /** Matched a `source != 'overture'` row; left alone. */
  readonly skipped: number;
  readonly rejected: number;
  /** Set when the chain ended early — an exhausted `maxRejected`, today. */
  readonly stopped?: string | null;
};

/* -------------------------------------------------------------------------- */
/* VectorReembedJobActor                                                       */
/* -------------------------------------------------------------------------- */

export const VECTOR_REEMBED_JOB_KIND = "vector-reembed";
export const VECTOR_REEMBED_JOB_ACTOR_TYPE = "VectorReembedJobActor";

/**
 * Vectors per batch. Each is one `regenerateVector` — an embedding, and for an
 * item with labels up to three image downloads — so the batch is small, and
 * `JobActor`'s `BatchBudget` cuts it shorter still when the calls are slow.
 */
export const VECTOR_REEMBED_BATCH_SIZE = 10;
export const VECTOR_REEMBED_MAX_BATCH_SIZE = 50;

/** The two tables whose rows record which embedding made them. */
export const VECTOR_TABLES = ["item_vectors", "recipe_vectors"] as const;
export type VectorTable = (typeof VECTOR_TABLES)[number];

export type VectorReembedJobPayload = ViewerlessJobPayload & {
  /** Vectors per batch. Defaults to `VECTOR_REEMBED_BATCH_SIZE`. */
  readonly batchSize?: number;
  /** Stop after this many vectors. Omit for "every stale vector". */
  readonly maxVectors?: number;
  /** Only these tables, walked in `VECTOR_TABLES` order. Omit for both. */
  readonly tables?: readonly VectorTable[];
};

/**
 * `JobDto` says how far a re-embed got; only the cursor says how it ended. A
 * job that ran out of embedding budget still *completes* — its chain stops
 * rather than spending refusals — so `status: "completed"` alone cannot tell
 * "every vector is on the new model" from "the budget ran out with stale
 * vectors left". `progress` carries the tallies and `stopped` so the operator
 * script can.
 */
export type VectorReembedProgress = {
  readonly job: JobDto;
  /** Null until the first batch has run. */
  readonly cursor: VectorReembedCursor | null;
};

export type VectorReembedJobActorInterface =
  JobActorInterface<VectorReembedJobPayload> & {
    /** The job and its cursor. Owner/admin/system, as `get`. */
    progress(ctx: Ctx): Promise<VectorReembedProgress>;
  };

/**
 * Operator tooling: `start` is admin-only. The cutover step after
 * `gemini-embedding-2` (and after any later model change): every migrated
 * vector's `embedding_model` is NULL, so every one is re-embedded.
 */
export const VectorReembedJobActorDescriptor: ActorDescriptor<
  VectorReembedJobActorInterface,
  InternalJobActorInterface
> = {
  actorType: VECTOR_REEMBED_JOB_ACTOR_TYPE,
  category: "job",
  methods: {
    start: {},
    get: {},
    cancel: {},
    progress: {},
  },
  internalMethods: {
    // One `regenerateVector` (100s: `EmbeddingActor.embedDocument`'s 90s and
    // the turn around it) is the worst case of one vector; the batch stops
    // starting vectors once the next one's would not finish inside this
    // (`JobActor`'s `BatchBudget`). One worst case plus margin, as the other
    // job actors keep theirs.
    runBatch: { timeoutMs: 120_000 },
    markFailed: {},
  },
};

/**
 * The keyset cursor: the table being walked, and the last row id seen there,
 * in `id` order. A re-embedded row drops out of the walk's predicate
 * (`embedding_model is distinct from` the configured one); `id >` is what
 * makes it terminate even over a row that stays stale — one whose
 * re-embedding failed, or whose vector a replica with another model made.
 */
export type VectorReembedCursor = {
  readonly table: VectorTable;
  readonly lastId: number;
  /** The `embedding_model` this run is converging on. */
  readonly model: string;
  readonly reembedded: number;
  /** Visited, but already fresh by the time it was reached. */
  readonly skipped: number;
  readonly failed: number;
  /** Set when the chain ended early — today, only an exhausted budget. */
  readonly stopped?: string | null;
};
