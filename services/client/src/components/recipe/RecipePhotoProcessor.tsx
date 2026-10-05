"use client";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/joy";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MdCheckCircle,
  MdError,
  MdInfoOutline,
  MdPhotoCamera,
} from "react-icons/md";
import { useClient, useMutation } from "urql";
import {
  describeUploadBlockers,
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
import { Link } from "../common/Link";
import { stageProgress } from "./adapter";

type Phase =
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
 *   "1 recipe".
 * - `placeId`/`menuItemId` are gone: menu linking moved to menu scans.
 */
export function RecipePhotoProcessor({
  onRecipesCreated,
  onProcessingComplete,
}: RecipePhotoProcessorProps) {
  const client = useClient();
  const [, startRecipePhotoJob] = useMutation(StartRecipePhotoJobMutation);
  const [, cancelRecipePhotoJob] = useMutation(CancelRecipePhotoJobMutation);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  /** An origin this build's CSP will not let the browser upload to. */
  const blockers = describeUploadBlockers();

  const isProcessing = phase.kind === "uploading" || phase.kind === "running";
  const jobId = phase.kind === "running" ? phase.jobId : null;

  // Keep the parent's callbacks out of the poll's dependencies.
  const callbacks = useRef({ onRecipesCreated, onProcessingComplete });
  callbacks.current = { onRecipesCreated, onProcessingComplete };

  useEffect(() => {
    if (jobId === null) return;
    let cancelled = false;
    const startedAt = Date.now();

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
        callbacks.current.onRecipesCreated?.([job.progress.recipeId]);
        callbacks.current.onProcessingComplete?.();
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file?.type.startsWith("image/")) {
      setSelectedFile(file);
      // Clear any previous results
      setPhase({ kind: "idle" });
    }
  };

  const handleUploadAndProcess = useCallback(async () => {
    if (!selectedFile) return;
    setPhase({ kind: "uploading" });
    try {
      // `StartRecipePhotoJobInput.fileId` must be verified; nothing
      // downstream verifies for us.
      const fileId = await uploadFile(client, selectedFile, "recipe-photo", {
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
        setPhase({ kind: "failed", reason: result.error.message });
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
      setPhase({
        kind: "failed",
        reason:
          thrown instanceof UploadUnavailableError
            ? thrown.blockers.join(" ")
            : thrown instanceof UploadRejectedError
              ? thrown.failure.message
              : thrown instanceof Error
                ? thrown.message
                : String(thrown),
      });
    }
  }, [client, selectedFile, startRecipePhotoJob]);

  const handleStop = useCallback(async () => {
    if (jobId === null) return;
    // Lands at the top of the next batch; the poll moves the phase.
    await cancelRecipePhotoJob({ jobId });
  }, [cancelRecipePhotoJob, jobId]);

  const currentStep =
    phase.kind === "uploading"
      ? "Uploading photo"
      : phase.kind === "running"
        ? (RECIPE_PHOTO_STAGE_LABEL[phase.stage] ?? phase.stage)
        : "";
  const progress = phase.kind === "running" ? stageProgress(phase.stage) : 0;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={3}>
          {/* Header */}
          <Box>
            <Typography level="h3" startDecorator={<MdPhotoCamera />}>
              AI Recipe Generator
            </Typography>
            <Typography level="body-sm" sx={{ color: "text.tertiary" }}>
              Simply upload a photo and our AI will extract the recipe it shows,
              with ingredients and instructions
            </Typography>
          </Box>

          {blockers.length > 0 ? (
            <Alert
              variant="soft"
              color="warning"
              startDecorator={<MdInfoOutline />}
            >
              <Box>
                <Typography level="body-sm" sx={{ fontWeight: "lg" }}>
                  Uploads are not possible from this build
                </Typography>
                <Typography level="body-sm">{blockers.join(" ")}</Typography>
              </Box>
            </Alert>
          ) : (
            <>
              {/* File Upload */}
              <Box>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  style={{ display: "none" }}
                />
                <Button
                  variant="outlined"
                  onClick={() => fileInputRef.current?.click()}
                  startDecorator={<MdPhotoCamera />}
                  fullWidth
                  disabled={isProcessing}
                >
                  {selectedFile
                    ? `Selected: ${selectedFile.name}`
                    : "Choose Photo"}
                </Button>
              </Box>

              {/* Process Button */}
              <Button
                variant="solid"
                color="primary"
                onClick={() => void handleUploadAndProcess()}
                disabled={!selectedFile || isProcessing}
                loading={isProcessing}
                loadingIndicator={<CircularProgress size="sm" />}
                fullWidth
                size="lg"
              >
                {isProcessing ? "Processing..." : "Extract Recipes"}
              </Button>
            </>
          )}

          {/* Progress Display */}
          {isProcessing && (
            <Box>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 1,
                }}
              >
                <Typography level="body-sm">{currentStep}</Typography>
                <Typography level="body-sm">{Math.round(progress)}%</Typography>
              </Box>
              <LinearProgress
                determinate={phase.kind === "running"}
                value={progress}
                sx={{ height: 8, borderRadius: 4 }}
              />
              {phase.kind === "running" && phase.lastError !== null && (
                // A stage that throws is retried with backoff — a note, not
                // a failure. Only `status: FAILED` ends the job.
                <Typography
                  level="body-xs"
                  sx={{ color: "warning.plainColor", mt: 1 }}
                >
                  Retry {phase.attempts}: {phase.lastError}
                </Typography>
              )}
              {phase.kind === "running" && (
                <Button
                  size="sm"
                  variant="plain"
                  color="neutral"
                  disabled={phase.cancelRequested}
                  onClick={() => void handleStop()}
                  sx={{ mt: 1 }}
                >
                  {phase.cancelRequested ? "Stopping…" : "Stop"}
                </Button>
              )}
            </Box>
          )}

          {/* Error Display */}
          {phase.kind === "failed" && (
            <Alert color="danger" startDecorator={<MdError />}>
              <Box>
                <Typography level="body-sm" sx={{ fontWeight: "lg" }}>
                  Processing Failed
                </Typography>
                <Typography level="body-sm">{phase.reason}</Typography>
              </Box>
            </Alert>
          )}

          {phase.kind === "cancelled" && (
            <Alert color="neutral" startDecorator={<MdError />}>
              <Typography level="body-sm">
                Stopped. Nothing was saved.
              </Typography>
            </Alert>
          )}

          {phase.kind === "stalled" && (
            <Alert color="warning" startDecorator={<MdInfoOutline />}>
              <Box>
                <Typography level="body-sm" sx={{ fontWeight: "lg" }}>
                  Still processing
                </Typography>
                <Typography level="body-sm">
                  This is taking longer than usual, so the page has stopped
                  watching. Nothing was cancelled; the recipe will be at{" "}
                  <Link href={`/recipes/${phase.recipeId}`}>its page</Link> once
                  the job finishes.
                </Typography>
              </Box>
            </Alert>
          )}

          {/* Results Display */}
          {phase.kind === "done" && (
            <Box>
              <Divider sx={{ my: 2 }} />

              <Alert color="success" startDecorator={<MdCheckCircle />}>
                <Box>
                  <Typography level="body-sm" sx={{ fontWeight: "lg" }}>
                    Processing Complete
                  </Typography>
                  <Typography level="body-sm">
                    Successfully created 1 recipe
                  </Typography>
                </Box>
              </Alert>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
