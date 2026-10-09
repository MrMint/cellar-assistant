"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useClient, useMutation } from "urql";
import { aiOutcome } from "@/lib/ai/outcome";
import {
  UploadRejectedError,
  UploadUnavailableError,
  uploadFile,
} from "@/lib/api/files";
import {
  CancelRecipePhotoJobMutation,
  RECIPE_PHOTO_POLL_MS,
  RECIPE_PHOTO_STAGE_LABEL,
  RECIPE_PHOTO_TIMEOUT_MS,
  RecipePhotoJobQuery,
  StartRecipePhotoJobMutation,
} from "@/lib/api/recipe-photos";
import { unwrapResult } from "@/lib/api/result";
import { stageProgress } from "./adapter";

export type RecipePhotoPhase =
  | { kind: "idle" }
  | { kind: "uploading" }
  | {
      kind: "running";
      jobId: string;
      stage: string;
      attempts: number;
      lastError: string | null;
      cancelRequested: boolean;
    }
  | { kind: "done"; recipeId: string }
  | { kind: "stalled"; recipeId: string }
  | { kind: "cancelled" }
  | { kind: "failed"; reason: string };

/** The step line and its percentage, for a phase in flight. */
export const recipePhotoStep = (
  phase: RecipePhotoPhase,
): { label: string; progress: number } =>
  phase.kind === "uploading"
    ? { label: "Uploading photo", progress: 0 }
    : phase.kind === "running"
      ? {
          label: RECIPE_PHOTO_STAGE_LABEL[phase.stage] ?? phase.stage,
          progress: stageProgress(phase.stage),
        }
      : { label: "", progress: 0 };

/** Words for anything an upload or a start can throw. */
const reasonOf = (thrown: unknown): string =>
  thrown instanceof UploadUnavailableError
    ? thrown.blockers.join(" ")
    : thrown instanceof UploadRejectedError
      ? thrown.failure.message
      : thrown instanceof Error
        ? thrown.message
        : String(thrown);

/**
 * One recipe photo, read into a recipe by the job (`startRecipePhotoJob` →
 * `recipePhotoJob` → `cancelRecipePhotoJob`, C4) — the half of
 * `RecipePhotoProcessor` that is not markup, shared with the capture
 * surface's Recipe mode (X06).
 *
 * - The upload is verified (`StartRecipePhotoJobInput.fileId` must be; nothing
 *   downstream verifies for us) and the job id is minted here, so a retry is
 *   the same job.
 * - The phase follows the job's real stage; a stage retry is `running` with
 *   `lastError`, not a failure. Only `status: FAILED` ends it.
 * - Past `RECIPE_PHOTO_TIMEOUT_MS` it stops watching (`stalled`) without
 *   cancelling anything.
 * - A refusal to start (a spent allowance, no provider) is said in words
 *   (`aiOutcome`, N07), never the server's message.
 */
export function useRecipePhotoJob({
  onDone,
}: {
  /** The recipe the job made, once (also the old `onRecipesCreated`). */
  onDone?: (recipeId: string) => void;
} = {}) {
  const client = useClient();
  const [, startRecipePhotoJob] = useMutation(StartRecipePhotoJobMutation);
  const [, cancelRecipePhotoJob] = useMutation(CancelRecipePhotoJobMutation);
  const [phase, setPhase] = useState<RecipePhotoPhase>({ kind: "idle" });

  const jobId = phase.kind === "running" ? phase.jobId : null;
  // Keep the caller's callback out of the poll's dependencies.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (jobId === null) return;
    let cancelled = false;
    // One poll at a time: a slow answer must not overlap the next tick, or
    // two of them can both see the job done and call `onDone` twice (two
    // navigations to the same recipe).
    let polling = false;
    const startedAt = Date.now();

    const tick = async (): Promise<void> => {
      if (polling || cancelled) return;
      polling = true;
      const response = await client
        .query(
          RecipePhotoJobQuery,
          { jobId },
          { requestPolicy: "network-only" },
        )
        .toPromise()
        .finally(() => {
          polling = false;
        });
      if (cancelled) return;

      const result = unwrapResult(
        response.data?.recipePhotoJob,
        "RecipePhotoJob",
      );
      if (!result.ok) {
        setPhase({ kind: "failed", reason: result.error.message });
        return;
      }
      const job = result.data;
      if (job.progress.done) {
        // Settled: nothing after this answer may act on the job again.
        cancelled = true;
        setPhase({ kind: "done", recipeId: job.progress.recipeId });
        done.current?.(job.progress.recipeId);
        return;
      }
      if (job.status === "CANCELLED") {
        setPhase({ kind: "cancelled" });
        return;
      }
      if (job.status === "FAILED") {
        setPhase({
          kind: "failed",
          reason: job.lastError ?? "The job failed without saying why.",
        });
        return;
      }
      if (Date.now() - startedAt > RECIPE_PHOTO_TIMEOUT_MS) {
        setPhase({ kind: "stalled", recipeId: job.progress.recipeId });
        return;
      }
      setPhase({
        kind: "running",
        jobId,
        stage: job.progress.stage,
        attempts: job.attempts,
        lastError: job.lastError ?? null,
        cancelRequested: job.cancelRequested,
      });
    };

    const timer = setInterval(() => void tick(), RECIPE_PHOTO_POLL_MS);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [client, jobId]);

  const start = useCallback(
    async (file: File) => {
      setPhase({ kind: "uploading" });
      try {
        const fileId = await uploadFile(client, file, "recipe-photo", {
          verify: true,
        });
        const result = unwrapResult(
          (
            await startRecipePhotoJob({
              jobId: crypto.randomUUID(),
              input: { fileId },
            })
          ).data?.startRecipePhotoJob,
          "RecipePhotoJob",
        );
        if (!result.ok) {
          setPhase({ kind: "failed", reason: aiOutcome(result.error).message });
          return;
        }
        setPhase({
          kind: "running",
          jobId: result.data.id,
          stage: result.data.progress.stage,
          attempts: result.data.attempts,
          lastError: result.data.lastError ?? null,
          cancelRequested: false,
        });
      } catch (thrown) {
        setPhase({ kind: "failed", reason: reasonOf(thrown) });
      }
    },
    [client, startRecipePhotoJob],
  );

  const stop = useCallback(async () => {
    if (jobId === null) return;
    // Lands at the top of the next batch; the poll moves the phase.
    await cancelRecipePhotoJob({ jobId });
  }, [cancelRecipePhotoJob, jobId]);

  const reset = useCallback(() => setPhase({ kind: "idle" }), []);

  return { phase, start, stop, reset };
}
