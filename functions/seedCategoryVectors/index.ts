import type { Request, Response } from "express";
import {
  createErrorResponse,
  createPerformanceTracker,
  type ExtendedPerformanceMetrics,
  executeWithRetry,
  functionMutation,
  getAdminAuthHeaders,
  getConfig,
  logError,
  logPerformanceMetrics,
} from "../_utils";
import { createAIProvider } from "../_utils/ai-providers/factory";
import { ALL_CATEGORY_LABELS, UPSERT_CATEGORY_VECTOR } from "./_types";

const { NHOST_WEBHOOK_SECRET } = process.env;
const CONFIG = getConfig();

/**
 * Seeds the category_vectors table with embeddings for ~150-200 semantic labels.
 * Run once during setup, or re-run to refresh embeddings.
 *
 * POST /v1/functions/seedCategoryVectors
 * Header: nhost-webhook-secret
 */
export default async function seedCategoryVectors(req: Request, res: Response) {
  console.log("🌱 [Seed Category Vectors] Function started");

  const performanceTracker =
    createPerformanceTracker<ExtendedPerformanceMetrics>();

  try {
    if (req.method === "GET") return res.status(200).send();
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res
        .status(401)
        .json(
          createErrorResponse(new Error("Unauthorized"), "seedCategoryVectors"),
        );
    }

    const endExternalApiTimer = performanceTracker.startTimer(
      "externalApiDuration",
    );
    const aiProvider = await createAIProvider();
    if (!aiProvider.generateEmbeddings) {
      throw new Error("AI provider does not support embeddings");
    }

    const labels = ALL_CATEGORY_LABELS;
    console.log(
      `🌱 [Seed Category Vectors] Processing ${labels.length} labels`,
    );

    let successCount = 0;
    let errorCount = 0;

    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < labels.length; i += batchSize) {
      const batch = labels.slice(i, i + batchSize);
      console.log(
        `🌱 [Seed Category Vectors] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(labels.length / batchSize)}`,
      );

      const results = await Promise.allSettled(
        batch.map(async (labelDef) => {
          const embeddings = await executeWithRetry(
            async () => {
              const result = await aiProvider.generateEmbeddings({
                content: labelDef.embeddingText,
                type: "text",
                taskType: "RETRIEVAL_DOCUMENT",
              });
              return result?.embeddings ?? [];
            },
            {
              retryConfig: {
                maxRetries: CONFIG.RETRY.MAX_RETRIES,
                baseDelayMs: CONFIG.RETRY.BASE_DELAY_MS,
              },
              operationName: `embedLabel:${labelDef.label}`,
            },
          );

          if (!embeddings || embeddings.length === 0) {
            throw new Error(
              `Failed to generate embeddings for "${labelDef.label}"`,
            );
          }

          const vectorString = `[${embeddings.join(",")}]`;

          await functionMutation(
            UPSERT_CATEGORY_VECTOR,
            {
              label: labelDef.label,
              labelType: labelDef.labelType,
              associatedCategories: labelDef.associatedCategories,
              vector: vectorString,
              metadata: labelDef.metadata ?? {},
            },
            { headers: getAdminAuthHeaders() },
          );

          return labelDef.label;
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          successCount++;
        } else {
          errorCount++;
          console.error(`❌ [Seed Category Vectors] Failed:`, result.reason);
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < labels.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    endExternalApiTimer();

    const metrics = performanceTracker.getMetrics();
    logPerformanceMetrics(
      metrics,
      {
        operation: "seedCategoryVectors",
        totalLabels: labels.length,
        successCount,
        errorCount,
      },
      {
        functionName: "seedCategoryVectors",
        sampleRate: 1.0,
        slowOperationThresholdMs: 60000,
      },
    );

    console.log(
      `✅ [Seed Category Vectors] Complete: ${successCount} succeeded, ${errorCount} failed`,
    );

    return res.status(200).json({
      success: true,
      totalLabels: labels.length,
      successCount,
      errorCount,
    });
  } catch (error) {
    const metrics = performanceTracker.getMetrics();
    logError(error, {
      operation: "seedCategoryVectors",
      metrics,
    });
    return res
      .status(500)
      .json(
        createErrorResponse(
          error instanceof Error ? error : new Error("Internal server error"),
          "seedCategoryVectors",
        ),
      );
  }
}
