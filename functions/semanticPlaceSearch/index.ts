import type { Request, Response } from "express";
import {
  createErrorResponse,
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
  type PlaceVectorResult,
  type ProcessedPlaceResult,
  SEMANTIC_PLACE_SEARCH_QUERY,
  validateBounds,
  validateSemanticPlaceSearchInput,
} from "./_types.js";

const { NHOST_WEBHOOK_SECRET } = process.env;

// Get shared configuration
const CONFIG = getConfig();

export default async function semanticPlaceSearch(req: Request, res: Response) {
  console.log("🔍 [Semantic Place Search] Function started");

  const performanceTracker =
    createPerformanceTracker<ExtendedPerformanceMetrics>();

  try {
    // Validate webhook secret
    const webhookSecret = req.headers["nhost-webhook-secret"];
    if (webhookSecret !== NHOST_WEBHOOK_SECRET) {
      console.warn("⚠️ [Semantic Place Search] Invalid webhook secret");
      return res
        .status(401)
        .json(
          createErrorResponse(new Error("Unauthorized"), "semanticPlaceSearch"),
        );
    }

    // Validate and parse input
    const endValidationTimer =
      performanceTracker.startTimer("validationDuration");
    const { input, session_variables } = validateSemanticPlaceSearchInput(
      req.body,
    );
    const { query, bounds, maxDistance, limit } = input;
    const userId = session_variables["x-hasura-user-id"];

    validateBounds(bounds);
    endValidationTimer();

    console.log(`🔍 [Semantic Place Search] Query: "${query}"`);
    console.log(
      `🗺️ [Semantic Place Search] Bounds: [${bounds.west}, ${bounds.south}] to [${bounds.east}, ${bounds.north}]`,
    );
    console.log(`👤 [Semantic Place Search] User: ${userId}`);
    console.log(
      `🎯 [Semantic Place Search] Max distance: ${maxDistance}, Limit: ${limit}`,
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
      `🧮 [Semantic Place Search] Generated query vector with ${queryVector.length} dimensions`,
    );

    // Search for similar places within bounds
    const endDbTimer = performanceTracker.startTimer("dbOperationDuration");
    const searchResult = await functionQuery(
      SEMANTIC_PLACE_SEARCH_QUERY,
      {
        queryVector: `[${queryVector.join(",")}]`,
        maxDistance,
        limit,
        westBound: bounds.west,
        southBound: bounds.south,
        eastBound: bounds.east,
        northBound: bounds.north,
      },
      { headers: getAdminAuthHeaders() },
    );
    endDbTimer();

    if (!searchResult?.place_vectors) {
      throw new Error("No search results returned from database");
    }

    // Transform results to expected format (distance filtering now handled in database)
    const filteredResults: ProcessedPlaceResult[] =
      searchResult.place_vectors.map((result: PlaceVectorResult) => {
        const distance =
          typeof result.distance === "number"
            ? result.distance
            : Number(result.distance) || 0;
        return {
          ...result.place,
          distance,
          confidenceScore: Math.max(0, Math.min(100, (1 - distance / 2) * 100)), // Convert distance (0-2) to confidence (0-100)
        } as ProcessedPlaceResult;
      });

    // Get final metrics
    const metrics = performanceTracker.getMetrics();

    // Log performance metrics
    logPerformanceMetrics(
      metrics,
      {
        operation: "semanticPlaceSearch",
        query,
        userId,
        boundsArea: (bounds.east - bounds.west) * (bounds.north - bounds.south),
        totalResults: searchResult.place_vectors.length,
        maxDistance,
        limit,
      },
      {
        functionName: "semanticPlaceSearch",
        sampleRate: CONFIG.PERFORMANCE.LOG_METRICS_SAMPLE_RATE,
        slowOperationThresholdMs: CONFIG.PERFORMANCE.LOG_SLOW_OPERATIONS_MS,
      },
    );

    console.log(
      `✅ [Semantic Place Search] Found ${filteredResults.length} places matching query`,
    );

    return res.status(200).json({
      success: true,
      places: filteredResults,
      metadata: {
        query,
        maxDistance,
        limit,
        bounds,
        totalResults: filteredResults.length, // All results are now pre-filtered by database
        queryVectorDimensions: queryVector.length,
      },
    });
  } catch (error) {
    const metrics = performanceTracker.getMetrics();
    logError(error, {
      operation: "semanticPlaceSearch",
      input: req.body,
      metrics,
    });

    if (error instanceof ValidationError) {
      return res
        .status(400)
        .json(createErrorResponse(error, "semanticPlaceSearch"));
    } else {
      return res
        .status(500)
        .json(
          createErrorResponse(
            error instanceof Error
              ? error
              : new Error("Internal server error during semantic place search"),
            "semanticPlaceSearch",
          ),
        );
    }
  }
}
