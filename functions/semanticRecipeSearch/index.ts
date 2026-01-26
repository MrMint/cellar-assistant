/**
 * Semantic Recipe Search Function
 *
 * Performs semantic search for recipes using vector embeddings.
 * Takes a query string, generates an embedding, and searches for similar recipes
 * in the recipe_vectors table using cosine distance.
 */

import type { Request } from "express";
import {
  createPerformanceTracker,
  type ExtendedPerformanceMetrics,
  executeWithRetry,
  functionQuery,
  getAdminAuthHeaders,
  getConfig,
  logError,
  logPerformanceMetrics,
  ValidationError,
} from "../_utils";
import { createAIProvider } from "../_utils/ai-providers/factory";
import {
  type RecipeSearchResult,
  type RecipeVectorResult,
  SEMANTIC_RECIPE_SEARCH_QUERY,
  type SemanticRecipeSearchOutput,
  validateSemanticRecipeSearchInput,
} from "./_types.js";

const { NHOST_WEBHOOK_SECRET } = process.env;
const CONFIG = getConfig();

/**
 * Main function handler for semantic recipe search
 */
export default async function semanticRecipeSearch(
  req: Request,
): Promise<SemanticRecipeSearchOutput> {
  console.log("[Semantic Recipe Search] Function started");

  const performanceTracker =
    createPerformanceTracker<ExtendedPerformanceMetrics>();

  try {
    // Validate webhook secret
    const webhookSecret = req.headers["nhost-webhook-secret"];
    if (webhookSecret !== NHOST_WEBHOOK_SECRET) {
      console.warn("[Semantic Recipe Search] Invalid webhook secret");
      return {
        success: false,
        error: "Unauthorized",
        recipes: [],
      };
    }

    // Validate and parse input
    const endValidationTimer =
      performanceTracker.startTimer("validationDuration");
    const { input, session_variables } = validateSemanticRecipeSearchInput(
      req.body,
    );
    const { query, maxDistance, limit } = input;
    const userId = session_variables["x-hasura-user-id"];
    endValidationTimer();

    console.log(`[Semantic Recipe Search] Query: "${query}"`);
    console.log(`[Semantic Recipe Search] User: ${userId}`);
    console.log(
      `[Semantic Recipe Search] Max distance: ${maxDistance}, Limit: ${limit}`,
    );

    // Generate query vector
    const endExternalApiTimer = performanceTracker.startTimer(
      "externalApiDuration",
    );
    const aiProvider = await createAIProvider();

    const queryVector = await executeWithRetry(
      async () => {
        if (!aiProvider.generateEmbeddings) {
          throw new Error("AI provider does not support embeddings");
        }
        const result = await aiProvider.generateEmbeddings({
          content: query.trim(),
          type: "text",
        });
        return result?.embeddings || [];
      },
      {
        retryConfig: {
          maxRetries: CONFIG.RETRY.MAX_RETRIES,
          baseDelayMs: CONFIG.RETRY.BASE_DELAY_MS,
        },
        operationName: "generateEmbeddings",
      },
    );
    endExternalApiTimer();

    if (!queryVector || queryVector.length === 0) {
      throw new Error("Failed to generate query vector");
    }

    console.log(
      `[Semantic Recipe Search] Generated query vector with ${queryVector.length} dimensions`,
    );

    // Search for similar recipes
    const endDbTimer = performanceTracker.startTimer("dbOperationDuration");
    const searchResult = await functionQuery(
      SEMANTIC_RECIPE_SEARCH_QUERY,
      {
        queryVector: `[${queryVector.join(",")}]`,
        maxDistance,
        limit,
      },
      { headers: getAdminAuthHeaders() },
    );
    endDbTimer();

    if (!searchResult?.recipe_vectors) {
      throw new Error("No search results returned from database");
    }

    // Transform results
    const recipes: RecipeSearchResult[] = searchResult.recipe_vectors.map(
      (result: RecipeVectorResult) => {
        const distance =
          typeof result.distance === "number"
            ? result.distance
            : Number(result.distance) || 0;

        return {
          id: result.recipe.id,
          name: result.recipe.name,
          description: result.recipe.description,
          type: result.recipe.type,
          difficulty_level: result.recipe.difficulty_level,
          prep_time_minutes: result.recipe.prep_time_minutes,
          serving_size: result.recipe.serving_size,
          image_url: result.recipe.image_url,
          recipe_group: result.recipe.recipe_group
            ? {
                id: result.recipe.recipe_group.id,
                name: result.recipe.recipe_group.name,
                category: result.recipe.recipe_group.category,
                base_spirit: result.recipe.recipe_group.base_spirit,
                tags: result.recipe.recipe_group.tags,
              }
            : null,
          distance,
          // Convert distance (0-2 range) to similarity (0-1 range, higher = better)
          similarity: Math.max(0, Math.min(1, 1 - distance / 2)),
        };
      },
    );

    // Log performance metrics
    const metrics = performanceTracker.getMetrics();
    logPerformanceMetrics(
      metrics,
      {
        operation: "semanticRecipeSearch",
        query,
        userId,
        totalResults: recipes.length,
        maxDistance,
        limit,
      },
      {
        functionName: "semanticRecipeSearch",
        sampleRate: CONFIG.PERFORMANCE.LOG_METRICS_SAMPLE_RATE,
        slowOperationThresholdMs: CONFIG.PERFORMANCE.LOG_SLOW_OPERATIONS_MS,
      },
    );

    console.log(
      `[Semantic Recipe Search] Found ${recipes.length} recipes matching query`,
    );

    return {
      success: true,
      recipes,
      metadata: {
        query,
        maxDistance: maxDistance ?? 0.8,
        limit: limit ?? 50,
        totalResults: recipes.length,
        queryVectorDimensions: queryVector.length,
        vectorSearchImplemented: true,
      },
    };
  } catch (error) {
    const metrics = performanceTracker.getMetrics();
    logError(error, {
      operation: "semanticRecipeSearch",
      input: req.body,
      metrics,
    });

    console.error("[Semantic Recipe Search] Error:", error);

    if (error instanceof ValidationError) {
      return {
        success: false,
        error: error.message,
        recipes: [],
      };
    }

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Internal server error during semantic recipe search",
      recipes: [],
    };
  }
}
