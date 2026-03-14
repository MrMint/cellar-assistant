/**
 * Shared item analysis logic — used by both getItemDefaults (new onboardings)
 * and reprocessOnboardingBatch (reprocessing existing onboardings with updated AI models).
 */

import type { NhostClient } from "@nhost/nhost-js";
import { AIAnalysisError, getFilePresignedURLWithAuth } from "../_utils";
import type { PresignedUrlResponse } from "../_utils/types";
import type { AnalyzeImagesParams } from "./_types";
import {
  type AIDefaults,
  buildItemAnalysisPrompt,
  type ItemType,
  sanitizeAIResponse,
  validateAndNarrowAIDefaults,
} from "./_utils";

export interface AnalyzeImagesResult {
  aiDefaults: AIDefaults;
  modelUsed?: string;
}

export async function fetchLabelImages(
  nhostClient: NhostClient,
  frontLabelFileId?: string,
  backLabelFileId?: string,
): Promise<Buffer[]> {
  const fetchImage = async (fileId: string): Promise<Buffer> => {
    console.log(`📥 [analyze] Fetching presigned URL for file: ${fileId}`);

    const presignedUrlResponse = await getFilePresignedURLWithAuth(
      nhostClient,
      fileId,
    );

    const { body, status } = presignedUrlResponse as PresignedUrlResponse;

    if (status < 200 || status >= 300 || !body?.url) {
      throw new Error(`Failed to get URL for file ${fileId}: status ${status}`);
    }

    const response = await fetch(body.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(
      `✅ [analyze] Fetched image ${fileId}, size: ${arrayBuffer.byteLength} bytes`,
    );
    return Buffer.from(arrayBuffer);
  };

  // Fetch front and back label images in parallel
  const fetches: Promise<Buffer>[] = [];
  if (frontLabelFileId) fetches.push(fetchImage(frontLabelFileId));
  if (backLabelFileId) fetches.push(fetchImage(backLabelFileId));

  const images = await Promise.all(fetches);
  console.log(`[analyze] Fetched ${images.length} label image(s)`);
  return images;
}

export async function analyzeItemImages({
  aiProvider,
  images,
  itemType,
  schema,
  performanceTracker,
  enumValues,
}: AnalyzeImagesParams): Promise<AnalyzeImagesResult> {
  const prompt = buildItemAnalysisPrompt(
    itemType as ItemType,
    schema,
    enumValues,
  );

  console.log("🔍 [analyze] Starting AI analysis...");
  const aiResponse = await aiProvider.generateContent(
    { prompt, images, schema },
    "low",
  );

  console.log("🔍 [analyze] Raw AI response content:");
  console.log("=".repeat(80));
  console.log(aiResponse.content);
  console.log("=".repeat(80));

  let parsedResponse: unknown;
  try {
    parsedResponse = JSON.parse(aiResponse.content);
    console.log("✅ [analyze] JSON parsing successful");
  } catch {
    console.error("❌ [analyze] Failed to parse AI response as JSON");
    throw new AIAnalysisError("AI response is not valid JSON");
  }

  const sanitizedResponse = enumValues
    ? sanitizeAIResponse(parsedResponse, itemType as ItemType, enumValues)
    : parsedResponse;

  const endValidationTimer =
    performanceTracker.startTimer("validationDuration");
  const validation = validateAndNarrowAIDefaults(
    sanitizedResponse,
    itemType as ItemType,
    schema,
  );
  endValidationTimer();

  if (!validation.valid) {
    const errors = "errors" in validation ? validation.errors : [];
    throw new AIAnalysisError(
      `AI response validation failed: ${errors.join(", ")}`,
    );
  }

  console.log("[analyze] AI response validation passed");
  return {
    aiDefaults: validation.data,
    modelUsed: aiResponse.metadata?.model,
  };
}
