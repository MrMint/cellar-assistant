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
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly reason: string };

/**
 * Polls `recipePhotoJob(jobId:)` until it ends (X15). The photo and the
 * pasted-text jobs are the same job, so this serves both. A stage retry is
 * not an end: only `done`, `CANCELLED` and `FAILED` are, and after
 * `RECIPE_PHOTO_TIMEOUT_MS` the page stops watching without cancelling.
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
        setPhase({ kind: "done", recipeId: job.progress.recipeId });
        return;
      }
      if (job.status === "CANCELLED") {
        setPhase({ kind: "cancelled" });
        return;
      }
      if (job.status === "FAILED") {
        setPhase({
          kind: "failed",
          reason: job.lastError ?? "Reading stopped without saying why.",
        });
        return;
      }
      if (Date.now() - started.current > RECIPE_PHOTO_TIMEOUT_MS) {
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
