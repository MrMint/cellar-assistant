"use client";

import { type ReactNode, useState } from "react";
import { EmptyState } from "@/components/app/EmptyState";
import { Cocktail, ErrorIcon, Info } from "@/components/app/icons";
import { Link } from "@/components/app/Link";
import { useNavigate } from "@/components/app/useNavigate";
import {
  recipePhotoStep,
  useRecipePhotoJob,
} from "@/components/recipe/useRecipePhotoJob";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { isOffered, useAiCapabilities } from "@/lib/ai/capabilities";
import { describeUploadBlockers } from "@/lib/api/files";
import { dataUrlToFile } from "@/lib/items/data-url";
import { CaptureCamera } from "./CaptureCamera";
import { CaptureHeader, CapturePhotoPreview } from "./CaptureChrome";

export type RecipeCaptureProps = {
  /** Before the title: the surface's Close. */
  leading?: ReactNode;
  /** Right under the picture: the surface's mode row. */
  modeRow?: ReactNode;
  /** A photo carried in from another surface: no new shot. */
  initialPhoto?: string;
};

/**
 * Recipe mode of the capture surface (X06): snap a recipe card or a page and
 * it is read into a recipe — the same job as the recipe drafter
 * (`useRecipePhotoJob`), started at the shutter instead of behind "Choose
 * Photo" and "Extract Recipes". The read's stages show over the photo, with
 * Stop; when it lands, the new draft opens in the recipe editor (an AI-read
 * recipe is a private draft its author edits before sharing, X15/D22).
 */
export function RecipeCapture({
  leading,
  modeRow,
  initialPhoto,
}: RecipeCaptureProps) {
  const navigate = useNavigate();
  const capabilities = useAiCapabilities();
  const [photo, setPhoto] = useState<string | null>(initialPhoto ?? null);
  const { phase, start, stop, reset } = useRecipePhotoJob({
    // Into the draft editor, as the Bar's New recipe › Photo lands (X15):
    // its matches are confirmed there before the recipe is shared.
    onDone: (recipeId) => navigate.push(`/recipes/${recipeId}/edit`),
  });
  const blockers = describeUploadBlockers();
  // A capture that does not decode to a file has nothing to send: say so
  // rather than leave "Read this recipe" doing nothing.
  const [unreadable, setUnreadable] = useState(false);

  const read = (shot: string) => {
    setPhoto(shot);
    const file = dataUrlToFile(shot, `recipe-${Date.now()}.jpg`);
    setUnreadable(file === null);
    if (file !== null) void start(file);
  };

  if (!isOffered(capabilities, "recipePhoto") || blockers.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        <CaptureHeader leading={leading} title="Snap a recipe" />
        {modeRow}
        <EmptyState
          illustration={<Cocktail aria-hidden className="size-10" />}
          title="Recipes can't be read here."
          description={
            blockers.length > 0
              ? blockers.join(" ")
              : "This server has no AI to read a recipe photo with."
          }
          action={
            <Button variant="secondary" asChild>
              <Link href="/recipes" underline="none">
                Open the Bar
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const inFlight = phase.kind === "uploading" || phase.kind === "running";
  const { label, progress } = recipePhotoStep(phase);

  return (
    <div data-slot="recipe-capture" className="flex flex-col gap-3">
      {photo === null ? (
        // Capture-Camera: the camera stays dark in both themes.
        <div className="keep-dark -mx-4 flex flex-col gap-2 bg-bg px-4 pb-3 text-ink">
          <CaptureHeader leading={leading} title="Snap a recipe" />
          <CaptureCamera
            onCapture={read}
            shutterLabel="Photograph the recipe"
            modeRow={modeRow}
            showBackground
          />
        </div>
      ) : (
        <>
          <CaptureHeader leading={leading} title="Snap a recipe" />
          <CapturePhotoPreview
            photo={photo}
            alt="Your recipe, as snapped"
            onRetake={
              inFlight
                ? undefined
                : () => {
                    setPhoto(null);
                    setUnreadable(false);
                    reset();
                  }
            }
          >
            {inFlight ? (
              <div className="flex w-full flex-col gap-2">
                <p
                  role="status"
                  className="flex items-center justify-between t-cap"
                >
                  <span>{label}</span>
                  <span className="tabular">{Math.round(progress)}%</span>
                </p>
                {/* An AI progress state, so it is drawn in teal. */}
                <Progress
                  aria-label={label}
                  value={phase.kind === "running" ? progress : null}
                  className="bg-ai/20 [&>[data-slot=progress-indicator]]:bg-ai"
                />
              </div>
            ) : unreadable ? null : phase.kind === "idle" ? (
              <Button onClick={() => read(photo)}>Read this recipe</Button>
            ) : phase.kind === "failed" || phase.kind === "cancelled" ? (
              <Button onClick={() => read(photo)}>Try again</Button>
            ) : null}
          </CapturePhotoPreview>
          {/* Not while the read is in flight: a switch would stop watching it. */}
          {!inFlight && modeRow}
        </>
      )}

      {unreadable && (
        <Alert variant="destructive" className="border-danger/60">
          <ErrorIcon aria-hidden />
          <AlertDescription className="text-danger">
            The photo could not be read. Retake it.
          </AlertDescription>
        </Alert>
      )}

      {phase.kind === "running" && (
        <div className="flex flex-col items-center gap-1 text-center">
          {phase.lastError !== null && (
            // A stage that throws is retried with backoff — a note, not a
            // failure. Only `status: FAILED` ends the job.
            <p className="t-cap text-ink-2">
              Retry {phase.attempts}: {phase.lastError}
            </p>
          )}
          <Button
            variant="ghost"
            disabled={phase.cancelRequested}
            onClick={() => void stop()}
          >
            {phase.cancelRequested ? "Stopping…" : "Stop"}
          </Button>
        </div>
      )}

      {phase.kind === "failed" && (
        <Alert variant="destructive" className="border-danger/60">
          <ErrorIcon aria-hidden />
          <AlertTitle>The recipe wasn&rsquo;t read</AlertTitle>
          <AlertDescription className="text-danger">
            {phase.reason}
          </AlertDescription>
        </Alert>
      )}
      {phase.kind === "cancelled" && (
        <Alert>
          <Info aria-hidden />
          <AlertDescription>Stopped. Nothing was saved.</AlertDescription>
        </Alert>
      )}
      {phase.kind === "stalled" && (
        <Alert>
          <Info aria-hidden />
          <AlertTitle>Still reading</AlertTitle>
          <AlertDescription>
            <p>
              This is taking longer than usual, so we&rsquo;ve stopped watching.
              Nothing was cancelled; the recipe will be at{" "}
              <Link
                href={`/recipes/${phase.recipeId}`}
                underline="always"
                className="text-ink"
              >
                its page
              </Link>{" "}
              once it&rsquo;s read.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {photo === null && (
        <p className="text-center t-cap text-ink-2">
          A recipe card, a book page or a screenshot. It&rsquo;s read as soon as
          you snap, into a private draft you can edit.
        </p>
      )}
    </div>
  );
}
