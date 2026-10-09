"use client";

import { useEffect, useRef, useState } from "react";
import { useClient } from "urql";
import {
  RECIPE_PHOTO_POLL_MS,
  RECIPE_PHOTO_TIMEOUT_MS,
  RecipePhotoJobQuery,
} from "@/lib/api/recipe-photos";
import { unwrapResult } from "@/lib/api/result";

/** Where a reading job is, as the composer draws it. */
export type RecipeJobPhase =
  | {
      readonly kind: "running";
      readonly stage: string;
      readonly cancelRequested: boolean;
    }
  | { readonly kind: "done"; readonly recipeId: string }
  | { readonly kind: "stalled"; readonly recipeId: string }
  | { readonly kind: "cancelled"; readonly recipeId: string }
  | {
      readonly kind: "failed";
      readonly reason: string;
      /** The draft's id, when the job got far enough to report one. */
      readonly recipeId: string | null;
    };

/**
 * Polls `recipePhotoJob(jobId:)` until it ends (X15). The photo and the
 * pasted-text jobs are the same job, so this serves both. A stage retry is
 * not an end: only `done`, `CANCELLED` and `FAILED` are, and after
 * `RECIPE_PHOTO_TIMEOUT_MS` the page stops watching without cancelling.
 *
 * A poll that never reached the API (a dropped connection, a phone between
 * networks) is not an end either: the job runs on the server regardless, so
 * the hook polls again rather than reporting a failure that did not happen.
 */
export function useRecipeJob(jobId: string | null): RecipeJobPhase | null {
  const client = useClient();
  const [phase, setPhase] = useState<RecipeJobPhase | null>(null);
  const started = useRef<number>(0);

  useEffect(() => {
    if (jobId === null) {
      setPhase(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    started.current = Date.now();
    setPhase({ kind: "running", stage: "EXTRACT", cancelRequested: false });

    const tick = async (): Promise<void> => {
      const response = await client
        .query(
          RecipePhotoJobQuery,
          { jobId },
          { requestPolicy: "network-only" },
        )
        .toPromise();
      if (cancelled) return;
      const timedOut = Date.now() - started.current > RECIPE_PHOTO_TIMEOUT_MS;
      const answer = response.data?.recipePhotoJob;
      if ((answer === null || answer === undefined) && !timedOut) {
        // The request itself failed, not the job: ask again.
        timer = setTimeout(() => void tick(), RECIPE_PHOTO_POLL_MS);
        return;
      }
      const result = unwrapResult(answer, "RecipePhotoJob");
      if (!result.ok) {
        setPhase({
          kind: "failed",
          reason: result.error.message,
          recipeId: null,
        });
        return;
      }
      const job = result.data;
      if (job.progress.done) {
        setPhase({ kind: "done", recipeId: job.progress.recipeId });
        return;
      }
      if (job.status === "CANCELLED") {
        setPhase({ kind: "cancelled", recipeId: job.progress.recipeId });
        return;
      }
      if (job.status === "FAILED") {
        setPhase({
          kind: "failed",
          reason: job.lastError ?? "Reading stopped without saying why.",
          recipeId: job.progress.recipeId,
        });
        return;
      }
      if (timedOut) {
        setPhase({ kind: "stalled", recipeId: job.progress.recipeId });
        return;
      }
      setPhase({
        kind: "running",
        stage: job.progress.stage,
        cancelRequested: job.cancelRequested,
      });
      timer = setTimeout(() => void tick(), RECIPE_PHOTO_POLL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [client, jobId]);

  return phase;
}
