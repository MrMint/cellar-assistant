/**
 * Generate Recipe Vector Function
 *
 * This function generates vector embeddings for recipes when triggered by
 * Hasura event triggers on recipe insert/update. The generated vectors are
 * stored in the recipe_vectors table for semantic search.
 */

import type { Request, Response } from "express";
import {
  AIAnalysisError,
  createErrorResponse,
  createPerformanceTracker,
  DatabaseError,
  type ExtendedPerformanceMetrics,
  executeWithRetry,
  functionMutation,
  functionQuery,
  getAdminAuthHeaders,
  getConfig,
  logError,
  logPerformanceMetrics,
} from "../_utils";
import { createAIProvider } from "../_utils/ai-providers/factory";
import { generateRecipeEmbeddingText } from "./_embedding-generator";
import {
  DELETE_OLD_RECIPE_VECTORS_MUTATION,
  GET_RECIPE_WITH_DETAILS_QUERY,
  INSERT_RECIPE_VECTOR_MUTATION,
  validateGenerateRecipeVectorInput,
} from "./_types";

const { NHOST_WEBHOOK_SECRET } = process.env;
const CONFIG = getConfig();

/**
 * Main function handler for recipe vector generation
 */
export default async function generateRecipeVector(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    // Handle health check
    if (req.method === "GET") {
      return res.status(200).send();
    }

    // Only accept POST requests
    if (req.method !== "POST") {
      return res.status(405).send();
    }

    // Validate webhook secret
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      console.warn("[generateRecipeVector] Invalid webhook secret");
      return res.status(400).send();
    }

    // Validate input
    const validatedInput = validateGenerateRecipeVectorInput(req.body);
    const performanceTracker =
      createPerformanceTracker<ExtendedPerformanceMetrics>();
    const recipeId = validatedInput.event.data.new.id;

    console.log(
      `[generateRecipeVector] Processing vector generation for recipe ${recipeId}`,
    );

    // Process vector generation with retry logic
    const result = await executeWithRetry(
      () => processRecipeVectorGeneration(recipeId, performanceTracker),
      {
        retryConfig: {
          maxRetries: CONFIG.RETRY.MAX_RETRIES,
          baseDelayMs: CONFIG.RETRY.BASE_DELAY_MS,
          maxDelayMs: CONFIG.RETRY.MAX_DELAY_MS,
          jitterFactor: CONFIG.RETRY.JITTER_FACTOR,
        },
        operationName: "recipe vector generation",
        context: { recipeId },
      },
    );

    // Log performance metrics
    const metrics = performanceTracker.getMetrics();
    logPerformanceMetrics(
      metrics,
      { recipeId },
      {
        functionName: "generateRecipeVector",
        sampleRate: CONFIG.PERFORMANCE.LOG_METRICS_SAMPLE_RATE,
        slowOperationThresholdMs: CONFIG.PERFORMANCE.LOG_SLOW_OPERATIONS_MS,
      },
    );

    return res.status(200).json(result);
  } catch (exception) {
    // Extract context for error logging
    let errorContext: Record<string, unknown> = {};
    try {
      const context = validateGenerateRecipeVectorInput(req.body);
      errorContext = { recipeId: context.event.data.new.id };
    } catch {
      errorContext = { hasEventData: !!req.body?.event?.data };
    }

    logError(exception, errorContext, "generateRecipeVector");

    const errorResponse = createErrorResponse(
      exception,
      "generateRecipeVector",
      process.env.NODE_ENV === "development",
    );

    return res.status(errorResponse.statusCode).json(errorResponse);
  }
}

/**
 * Process vector generation for a recipe
 */
async function processRecipeVectorGeneration(
  recipeId: string,
  performanceTracker: ReturnType<
    typeof createPerformanceTracker<ExtendedPerformanceMetrics>
  >,
): Promise<{ success: boolean; vectorId?: number }> {
  // 1. Fetch recipe with all related data
  const endFetchTimer = performanceTracker.startTimer("dbOperationDuration");
  const recipeResult = await functionQuery(
    GET_RECIPE_WITH_DETAILS_QUERY,
    { id: recipeId },
    { headers: getAdminAuthHeaders() },
  );
  endFetchTimer();

  const recipe = recipeResult?.recipes_by_pk;
  if (!recipe) {
    throw new DatabaseError(`Recipe not found: ${recipeId}`);
  }

  console.log(`[generateRecipeVector] Fetched recipe: ${recipe.name}`);

  // 2. Generate embedding text
  const embeddingText = generateRecipeEmbeddingText(recipe);
  console.log(
    `[generateRecipeVector] Generated embedding text (${embeddingText.length} chars): ${embeddingText.substring(0, 200)}...`,
  );

  // 3. Get AI provider and generate embeddings
  const endProviderTimer = performanceTracker.startTimer("externalApiDuration");
  const aiProvider = await createAIProvider();
  endProviderTimer();

  const endEmbeddingTimer = performanceTracker.startTimer(
    "externalApiDuration",
  );
  const embeddingResponse = await aiProvider.generateEmbeddings?.({
    content: embeddingText,
    type: "text",
  });
  endEmbeddingTimer();

  if (!embeddingResponse?.embeddings) {
    throw new AIAnalysisError("Failed to generate embeddings");
  }

  console.log(
    `[generateRecipeVector] Generated vector with ${embeddingResponse.embeddings.length} dimensions`,
  );

  // 4. Insert new vector
  const endInsertTimer = performanceTracker.startTimer("dbOperationDuration");
  const insertResult = await functionMutation(
    INSERT_RECIPE_VECTOR_MUTATION,
    {
      recipe_id: recipeId,
      vector: `[${embeddingResponse.embeddings.join(",")}]`,
      embedding_text: embeddingText,
    },
    { headers: getAdminAuthHeaders() },
  );
  endInsertTimer();

  if (!insertResult?.insert_recipe_vectors_one) {
    throw new DatabaseError("Failed to insert recipe vector");
  }

  const vectorId = insertResult.insert_recipe_vectors_one.id;
  console.log(
    `[generateRecipeVector] Inserted recipe_vector with id ${vectorId}`,
  );

  // 5. Delete old vectors (keep only the newest)
  const endDeleteTimer = performanceTracker.startTimer("dbOperationDuration");
  const deleteResult = await functionMutation(
    DELETE_OLD_RECIPE_VECTORS_MUTATION,
    {
      recipe_id: recipeId,
      exclude_id: vectorId,
    },
    { headers: getAdminAuthHeaders() },
  );
  endDeleteTimer();

  if (deleteResult?.delete_recipe_vectors?.affected_rows) {
    console.log(
      `[generateRecipeVector] Removed ${deleteResult.delete_recipe_vectors.affected_rows} old vector(s)`,
    );
  }

  return { success: true, vectorId };
}
