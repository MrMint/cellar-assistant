/**
 * The viewer's AI work (`me.aiJobs`, X10) as the job tray, the "Waiting on
 * you" inbox and the finish toasts say it.
 *
 * One table of words per kind and status, so the three surfaces never
 * disagree, and failures worded by N07's mapper (`lib/ai/outcome.ts`) from
 * the typed `failureCode` / `failureReason` / `retryAt` — the API sends no
 * message to show, by design.
 *
 * Pure — `ai-jobs.test.ts`.
 */
import { itemTypeLabel } from "@/components/cellar-api/itemTypes";
import { type AiOutcome, aiOutcome } from "@/lib/ai/outcome";
import type { ResultOf } from "@/lib/api/graphql";
import type { AiJobFieldsFragment } from "./queries";

export type AiJob = ResultOf<typeof AiJobFieldsFragment>;
export type AiJobStatus = AiJob["status"];

/** What a person would call the thing being read. */
const subjectOf = (job: AiJob): string => {
  switch (job.kind) {
    case "LABEL_READ":
      return job.itemType === null
        ? "label"
        : `${itemTypeLabel(job.itemType).toLowerCase()} label`;
    case "MENU_SCAN":
      return job.placeName === null ? "menu" : `menu at ${job.placeName}`;
    case "RECIPE_PHOTO":
      return job.recipeName ?? "recipe photo";
    case "TIER_LIST_INSIGHTS":
      return job.tierListName ?? "your tier list";
  }
};

/** Where the job's result (or its retry) lives, or null when nowhere yet. */
export const aiJobHref = (job: AiJob): string | null => {
  switch (job.kind) {
    case "LABEL_READ": {
      const query = new URLSearchParams({ draft: job.subjectId });
      if (job.itemType !== null) query.set("type", job.itemType);
      return `/add?${query.toString()}`;
    }
    case "MENU_SCAN":
      return `/map/scans/${job.subjectId}`;
    case "RECIPE_PHOTO":
      if (job.status === "READY") {
        return job.recipeId === null ? "/recipes" : `/recipes/${job.recipeId}`;
      }
      // The photo reader has no page of its own per job; a failure is
      // retried from the drafter.
      return job.status === "FAILED" ? "/recipes/ai-generator" : null;
    case "TIER_LIST_INSIGHTS":
      return `/tier-lists/${job.subjectId}`;
  }
};

/** N07's wording for a failed job. */
export const aiJobOutcome = (
  job: AiJob,
  options: { now?: Date } = {},
): AiOutcome =>
  aiOutcome(
    {
      code: job.failureCode,
      reason: job.failureReason,
      retryAt: job.retryAt,
    },
    options,
  );

/** The tray's line while a job runs: "Reading the menu at Cork & Barrel". */
export const runningLine = (job: AiJob): string => {
  switch (job.kind) {
    case "LABEL_READ":
      return `Reading your ${subjectOf(job)}`;
    case "MENU_SCAN":
      return `Reading the ${subjectOf(job)}`;
    case "RECIPE_PHOTO":
      return "Reading your recipe photo";
    case "TIER_LIST_INSIGHTS":
      return `Finding what ${subjectOf(job)} says about you`;
  }
};

/** The inbox's line for a result that waits: "Your wine draft is ready". */
export const readyLine = (job: AiJob): string => {
  switch (job.kind) {
    case "LABEL_READ":
      return `Your ${
        job.itemType === null
          ? "bottle"
          : itemTypeLabel(job.itemType).toLowerCase()
      } draft is ready to check`;
    case "MENU_SCAN":
      return job.placeName === null
        ? "Your menu is read"
        : `The menu at ${job.placeName} is read`;
    case "RECIPE_PHOTO":
      return job.recipeName === null
        ? "Your recipe is ready"
        : `${job.recipeName} is ready`;
    case "TIER_LIST_INSIGHTS":
      return `New insights on ${subjectOf(job)}`;
  }
};

/** The second line under {@link readyLine}. */
export const readyDetail = (job: AiJob): string | null => {
  switch (job.kind) {
    case "LABEL_READ":
      return "Check what was read, then add it";
    case "MENU_SCAN":
      return job.count === null || job.count === 0
        ? null
        : `${job.count} ${job.count === 1 ? "line" : "lines"} read`;
    case "RECIPE_PHOTO":
      return "Read from your photo";
    case "TIER_LIST_INSIGHTS":
      return null;
  }
};

/** The tray's line for a failure: the subject, then N07's title. */
export const failedLine = (job: AiJob): string => {
  switch (job.kind) {
    case "LABEL_READ":
      return `Your ${subjectOf(job)} wasn't read`;
    case "MENU_SCAN":
      return `The ${subjectOf(job)} wasn't read`;
    case "RECIPE_PHOTO":
      return "Your recipe photo wasn't read";
    case "TIER_LIST_INSIGHTS":
      return `No insights for ${subjectOf(job)} yet`;
  }
};

export type JobToast = {
  readonly message: string;
  readonly description: string | null;
  readonly href: string | null;
  readonly actionLabel: string;
  readonly tone: "success" | "error" | undefined;
};

/** What the watcher says when a job it saw running settles. */
export const toastFor = (job: AiJob, now?: Date): JobToast | null => {
  const href = aiJobHref(job);
  if (job.status === "READY") {
    return {
      message: readyLine(job),
      description: readyDetail(job),
      href,
      actionLabel: job.kind === "LABEL_READ" ? "Review" : "Open",
      tone: "success",
    };
  }
  if (job.status === "FAILED") {
    const outcome = aiJobOutcome(job, now === undefined ? {} : { now });
    return {
      message: failedLine(job),
      description: outcome.message,
      href,
      actionLabel: outcome.canRetry ? "Try again" : "Open",
      // A limit is not an error (N07): only a real failure is red.
      tone: outcome.tone === "danger" ? "error" : undefined,
    };
  }
  return null;
};

/**
 * Whether the page at `pathname` already shows this job finishing — its own
 * result page, or the screen that started it and watches it to the end (the
 * place page's scanner, the recipe drafter). A toast there would say twice
 * what the screen just said. A label read is always the add flow's to
 * announce (it knows whether the person left it running).
 */
export const isWatchedAt = (job: AiJob, pathname: string): boolean => {
  if (job.kind === "LABEL_READ") return true;
  const href = aiJobHref(job);
  if (href !== null && pathname === href.split("?")[0]) return true;
  switch (job.kind) {
    case "MENU_SCAN":
      return job.placeId !== null && pathname === `/places/${job.placeId}`;
    case "RECIPE_PHOTO":
      return pathname === "/recipes/ai-generator";
    default:
      return false;
  }
};

/** Each job's status, by id — what the watcher compares the next poll to. */
export type JobSnapshot = ReadonlyMap<string, AiJobStatus>;

export const snapshotOf = (jobs: readonly AiJob[]): JobSnapshot =>
  new Map(jobs.map((job) => [job.id, job.status]));

/**
 * The jobs that were running in `before` and have settled in `jobs` — the
 * only ones worth a toast. A job first seen already settled finished while
 * nobody was watching; the inbox has it, a toast would be news from the past.
 */
export const settledSince = (
  before: JobSnapshot,
  jobs: readonly AiJob[],
): AiJob[] =>
  jobs.filter(
    (job) => before.get(job.id) === "RUNNING" && job.status !== "RUNNING",
  );

/** Whether anything is still running — the watcher polls only while so. */
export const anyRunning = (jobs: readonly AiJob[]): boolean =>
  jobs.some((job) => job.status === "RUNNING");
