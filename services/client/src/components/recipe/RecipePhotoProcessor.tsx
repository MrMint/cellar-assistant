"use client";

import type React from "react";
import { useRef, useState } from "react";
import { useQuery } from "urql";
import {
  Camera,
  ErrorIcon,
  ICON_STROKE,
  Info,
  Success,
} from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { describeUploadBlockers } from "@/lib/api/files";
import { readFragment } from "@/lib/api/graphql";
import { unwrapResult } from "@/lib/api/result";
import { cn } from "@/lib/utils";
import { recipeCreatedLine } from "./adapter";
import { RecipeDetailsFragment } from "./fragments";
import { RecipePageQuery, recipePageVariables } from "./queries";
import { recipePhotoStep, useRecipePhotoJob } from "./useRecipePhotoJob";

interface RecipePhotoProcessorProps {
  /** One id per finished job — the old callback's shape, one recipe a photo. */
  onRecipesCreated?: (recipeIds: string[]) => void;
  onProcessingComplete?: () => void;
}

/**
 * `82450ad1:src/components/recipe/RecipePhotoProcessor.tsx`, restored — the
 * "AI Recipe Generator" card: Choose Photo, Extract Recipes, a progress line
 * with its percentage, and the "Processing Complete" alert.
 *
 * Over the rewrite's job (`startRecipePhotoJob` / `recipePhotoJob` /
 * `cancelRecipePhotoJob`, C4) instead of the old `processRecipePhoto` server
 * action (which had security defects still live in legacy production —
 * details withheld until it is retired, `ui-parity-inventory.md` §7):
 *
 * - The percentage is the **real** stage (`EXTRACT` … `RECIPE`, 20 % each)
 *   with its label as the step text. The old bar jumped 10 → 50 → 100 on a
 *   timer, whatever the server was doing (§7).
 * - Kept from the rewrite: the upload is verified, the job id is minted here
 *   (a retry is the same job), a stage retry is shown as a note rather than a
 *   failure, there is a Stop, and the page stops watching after
 *   `RECIPE_PHOTO_TIMEOUT_MS` without cancelling anything.
 * - One recipe per photo (G30 is not built), so "Menu Analysis" and the
 *   enhancement count have nothing to show and are gone; the alert says
 *   "1 recipe with M ingredients", M read off the generated recipe — the
 *   same `RecipePageQuery` the page's read-back runs, so one request.
 * - `placeId`/`menuItemId` are gone: menu linking moved to menu scans.
 */
export function RecipePhotoProcessor({
  onRecipesCreated,
  onProcessingComplete,
}: RecipePhotoProcessorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // The job itself (upload, start, poll, Stop) is `useRecipePhotoJob`, shared
  // with the capture surface's Recipe mode (X06).
  const { phase, start, stop, reset } = useRecipePhotoJob({
    onDone: (recipeId) => {
      onRecipesCreated?.([recipeId]);
      onProcessingComplete?.();
    },
  });

  /** An origin this build's CSP will not let the browser upload to. */
  const blockers = describeUploadBlockers();

  const doneRecipeId = phase.kind === "done" ? phase.recipeId : null;
  const [{ data: doneData }] = useQuery({
    query: RecipePageQuery,
    variables: recipePageVariables(doneRecipeId ?? ""),
    pause: doneRecipeId === null,
  });
  const doneRecipe = unwrapResult(doneData?.recipe, "Recipe");
  const ingredientCount = doneRecipe.ok
    ? readFragment(RecipeDetailsFragment, doneRecipe.data).ingredients.edges
        .length
    : null;

  const isProcessing = phase.kind === "uploading" || phase.kind === "running";

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file?.type.startsWith("image/")) {
      setSelectedFile(file);
      // Clear any previous results
      reset();
    }
  };

  const handleUploadAndProcess = () => {
    if (selectedFile) void start(selectedFile);
  };
  const handleStop = () => void stop();

  const { label: currentStep, progress } = recipePhotoStep(phase);

  return (
    <section className="flex flex-col gap-6 rounded-lg bg-surface-1 p-4">
      {/* Header */}
      <div>
        <h3 className="flex items-center gap-2 type-title-2">
          <Camera
            aria-hidden
            strokeWidth={ICON_STROKE}
            className="size-5 shrink-0 text-ink-2"
          />
          AI Recipe Generator
        </h3>
        <p className="type-callout text-ink-3">
          Simply upload a photo and our AI will extract the recipe it shows,
          with ingredients and instructions
        </p>
      </div>

      {blockers.length > 0 ? (
        <Alert>
          <Info aria-hidden />
          {/* AlertTitle clamps to one line; at 390 this one is wider. */}
          <AlertTitle className="line-clamp-none">
            Uploads are not possible from this build
          </AlertTitle>
          <AlertDescription>{blockers.join(" ")}</AlertDescription>
        </Alert>
      ) : (
        <>
          {/* File Upload */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
              disabled={isProcessing}
            >
              <Camera aria-hidden />
              <span className="truncate">
                {selectedFile
                  ? `Selected: ${selectedFile.name}`
                  : "Choose Photo"}
              </span>
            </Button>
          </div>

          {/* Process Button */}
          <Button
            onClick={handleUploadAndProcess}
            disabled={!selectedFile || isProcessing}
            aria-busy={isProcessing || undefined}
            className="w-full"
            size="lg"
          >
            {isProcessing && <Spinner aria-hidden />}
            {isProcessing ? "Processing..." : "Extract Recipes"}
          </Button>
        </>
      )}

      {/* Progress Display — an AI progress state, so it is drawn in teal. */}
      {isProcessing && (
        <div>
          <div className="mb-2 flex items-center justify-between type-callout">
            <span>{currentStep}</span>
            <span className="tabular">{Math.round(progress)}%</span>
          </div>
          <Progress
            aria-label={currentStep}
            value={phase.kind === "running" ? progress : null}
            className={cn(
              "bg-ai/20 [&>[data-slot=progress-indicator]]:bg-ai",
              phase.kind !== "running" && "motion-safe:animate-pulse",
            )}
          />
          {phase.kind === "running" && phase.lastError !== null && (
            // A stage that throws is retried with backoff — a note, not
            // a failure. Only `status: FAILED` ends the job.
            <p className="mt-2 type-footnote text-ink-2">
              Retry {phase.attempts}: {phase.lastError}
            </p>
          )}
          {phase.kind === "running" && (
            <Button
              variant="ghost"
              disabled={phase.cancelRequested}
              onClick={handleStop}
              className="mt-2"
            >
              {phase.cancelRequested ? "Stopping…" : "Stop"}
            </Button>
          )}
        </div>
      )}

      {/* Error Display */}
      {phase.kind === "failed" && (
        <Alert variant="destructive">
          <ErrorIcon aria-hidden />
          <AlertTitle>Processing Failed</AlertTitle>
          <AlertDescription>{phase.reason}</AlertDescription>
        </Alert>
      )}

      {phase.kind === "cancelled" && (
        <Alert>
          <ErrorIcon aria-hidden />
          <AlertDescription>Stopped. Nothing was saved.</AlertDescription>
        </Alert>
      )}

      {phase.kind === "stalled" && (
        <Alert>
          <Info aria-hidden />
          <AlertTitle>Still processing</AlertTitle>
          <AlertDescription>
            <p>
              This is taking longer than usual, so the page has stopped
              watching. Nothing was cancelled; the recipe will be at{" "}
              <Link
                href={`/recipes/${phase.recipeId}`}
                underline="always"
                className="text-ink-1"
              >
                its page
              </Link>{" "}
              once the job finishes.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Results Display */}
      {phase.kind === "done" && (
        <div className="flex flex-col gap-4">
          <Separator />

          <Alert className="border-success/50 text-success">
            <Success aria-hidden />
            <AlertTitle>Processing Complete</AlertTitle>
            <AlertDescription>
              {recipeCreatedLine(ingredientCount)}
            </AlertDescription>
          </Alert>
        </div>
      )}
    </section>
  );
}
