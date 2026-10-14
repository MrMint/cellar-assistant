/**
 * The viewer's AI work, in one list — Home's job tray and the "Waiting on
 * you" inbox (roadmap X10, design-direction §4.7: "a hard ceiling, after
 * which the job goes to the inbox").
 *
 * Four kinds of work run on a model and finish after the person has moved
 * on: a label read (`item_onboardings`), a menu scan (`menu_scans`), a recipe
 * photo (`jobs`, kind `recipe-photo`) and a tier list's insights
 * (`tier_lists.insights_*`). Each already records its own state in its own
 * shape; this is the one reading of all four, so a client can show what is
 * running, toast what finished and file what waits — without four polls.
 *
 * Failures cross as N07's typed outcome (`failureCode` + `failureReason` +
 * `retryAt`), parsed from the stored `CODE[REASON]: message` form
 * (`stored-failure.ts`). The message itself never crosses: the client words
 * an outcome from the closed set (`lib/ai/outcome.ts`), never an operator's
 * sentence.
 */
import type { ActorDescriptor } from "./actors.ts";
import type { Ctx } from "./ctx.ts";
import type { ActorErrorCode, ActorErrorReason } from "./errors.ts";
import type { ItemType } from "./items.ts";

export const AI_JOB_KINDS = [
  "LABEL_READ",
  "MENU_SCAN",
  "RECIPE_PHOTO",
  "TIER_LIST_INSIGHTS",
] as const;
export type AiJobKind = (typeof AI_JOB_KINDS)[number];

/**
 * - `RUNNING` — asked for and not answered yet.
 * - `READY` — answered; the result waits for the person (a draft to check, a
 *   menu's lines, a recipe, insights).
 * - `FAILED` — the latest attempt failed; `failureCode`/`failureReason` say how.
 */
export const AI_JOB_STATUSES = ["RUNNING", "READY", "FAILED"] as const;
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

/**
 * How far back the list looks. Running work older than a day is not running
 * any more (every chain gives up well inside that — the outbox in ~17
 * minutes, a label read inside its request), and a result older than three
 * days is history, not something waiting.
 */
export const AI_JOB_RUNNING_WINDOW_MS = 24 * 60 * 60 * 1000;
export const AI_JOB_SETTLED_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
/**
 * A label read is one request (`startItemOnboarding` holds it open), so a
 * session still at `START` after this long was abandoned, not reading.
 */
export const AI_JOB_LABEL_READ_STALE_MS = 15 * 60 * 1000;
/** The most rows the list returns, newest first. */
export const AI_JOB_LIMIT = 30;

/** One piece of AI work — **projection** (four tables, no common actor). */
export type AiJobDto = {
  /** `<kind>:<subjectId>` — stable across polls, so a client can diff. */
  readonly id: string;
  readonly kind: AiJobKind;
  readonly status: AiJobStatus;
  /** The onboarding, scan, job or tier list id. */
  readonly subjectId: string;
  /** LABEL_READ: what kind of bottle. */
  readonly itemType: ItemType | null;
  /** MENU_SCAN: where, when the scan names a place the viewer may see. */
  readonly placeId: string | null;
  readonly placeName: string | null;
  /** MENU_SCAN: lines read. */
  readonly count: number | null;
  /** TIER_LIST_INSIGHTS: the list's name (the viewer's own list). */
  readonly tierListName: string | null;
  /** RECIPE_PHOTO: the recipe it made, once there is one. */
  readonly recipeId: string | null;
  readonly recipeName: string | null;
  readonly startedAt: string;
  /** When it reached READY or FAILED; null while RUNNING. */
  readonly finishedAt: string | null;
  readonly failureCode: ActorErrorCode | null;
  readonly failureReason: ActorErrorReason | null;
  /** When asking again can first succeed, for a budget refusal. */
  readonly retryAt: string | null;
};

/**
 * `AiJobsCollectionActor(viewerId)` — collection actor (X10).
 *
 * Keyed by the viewer and refusing anyone else on every turn, like the C3
 * collections: every row it reads is the viewer's own (`user_id`,
 * `created_by`, `created_by_id` = viewer), which is the whole of the
 * authorization — scans, onboardings, recipe jobs and a list's insights are
 * owner-only.
 */
export type AiJobsCollectionActorInterface = {
  /**
   * **projection** — the viewer's AI work: running within
   * {@link AI_JOB_RUNNING_WINDOW_MS}, settled within
   * {@link AI_JOB_SETTLED_WINDOW_MS}; newest first, at most
   * {@link AI_JOB_LIMIT}.
   */
  list(ctx: Ctx): Promise<readonly AiJobDto[]>;
};

export const AiJobsCollectionActorDescriptor: ActorDescriptor<AiJobsCollectionActorInterface> =
  {
    actorType: "AiJobsCollectionActor",
    category: "collection",
    methods: {
      list: {},
    },
  };
