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
  LABEL_TYPE_WEIGHTS,
  type LabelType,
} from "../seedCategoryVectors/_types";
import {
  type CategoryVectorMatch,
  HYBRID_PLACE_SEARCH_QUERY,
  type HybridPlaceSearchRow,
  type ProcessedPlaceResult,
  SEARCH_CATEGORY_VECTORS_QUERY,
  validateHybridPlaceSearchInput,
} from "./_types";

const { NHOST_WEBHOOK_SECRET } = process.env;
const CONFIG = getConfig();

/**
 * Hybrid place search combining:
 *   1. Semantic category vector matching (query → category labels → place categories)
 *   2. Full-text search (tsvector on name + categories + locality)
 *   3. Trigram fuzzy matching (pg_trgm on name)
 *   4. PostGIS geographic filtering
 *
 * POST /v1/hybridPlaceSearch
 */
export default async function hybridPlaceSearch(req: Request, res: Response) {
  console.log("🔍 [Hybrid Place Search] Function started");

  const performanceTracker =
    createPerformanceTracker<ExtendedPerformanceMetrics>();

  try {
    // Validate webhook secret
    const webhookSecret = req.headers["nhost-webhook-secret"];
    if (webhookSecret !== NHOST_WEBHOOK_SECRET) {
      console.warn("⚠️ [Hybrid Place Search] Invalid webhook secret");
      return res
        .status(401)
        .json(
          createErrorResponse(new Error("Unauthorized"), "hybridPlaceSearch"),
        );
    }

    // Validate and parse input
    const endValidationTimer =
      performanceTracker.startTimer("validationDuration");
    const { input, session_variables } = validateHybridPlaceSearchInput(
      req.body,
    );
    const {
      query,
      queryVector: preComputedVector,
      bounds,
      limit = 50,
      itemTypes,
      minRating,
    } = input;
    const userId = session_variables["x-hasura-user-id"];
    endValidationTimer();

    console.log(`🔍 [Hybrid Place Search] Query: "${query}"`);
    console.log(
      `🗺️ [Hybrid Place Search] Bounds: [${bounds.west}, ${bounds.south}] to [${bounds.east}, ${bounds.north}]`,
    );
    console.log(`👤 [Hybrid Place Search] User: ${userId}`);
    console.log(
      `🎯 [Hybrid Place Search] Limit: ${limit}, ItemTypes: ${itemTypes?.join(",") ?? "none"}`,
    );

    // =========================================================================
    // Step 1: Use pre-computed vector or generate embedding as fallback
    // =========================================================================
    let queryVector: number[];

    if (preComputedVector && preComputedVector.length > 0) {
      queryVector = preComputedVector;
      console.log(
        `🧮 [Hybrid Place Search] Using pre-computed vector (${queryVector.length} dims)`,
      );
    } else {
      console.log(
        "🧮 [Hybrid Place Search] No pre-computed vector, generating embedding",
      );
      const endExternalApiTimer = performanceTracker.startTimer(
        "externalApiDuration",
      );
      const aiProvider = await createAIProvider();
      const generated = await executeWithRetry(
        async () => {
          if (!aiProvider.generateEmbeddings) {
            throw new Error("AI provider does not support embeddings");
          }
          const result = await aiProvider.generateEmbeddings({
            content: query.trim().toLowerCase(),
            type: "text",
            taskType: "RETRIEVAL_QUERY",
          });
          return result?.embeddings ?? [];
        },
        {
          retryConfig: {
            maxRetries: CONFIG.RETRY.MAX_RETRIES,
            baseDelayMs: CONFIG.RETRY.BASE_DELAY_MS,
          },
          operationName: "generateQueryEmbeddings",
        },
      );
      endExternalApiTimer();

      if (!generated || generated.length === 0) {
        throw new Error("Failed to generate query vector");
      }
      queryVector = generated;
    }

    // =========================================================================
    // Step 2: Find matching category vectors
    // =========================================================================
    const endCategorySearchTimer = performanceTracker.startTimer(
      "dbOperationDuration",
    );
    const queryVectorString = `[${queryVector.join(",")}]`;

    const categoryResult = await functionQuery(
      SEARCH_CATEGORY_VECTORS_QUERY,
      {
        queryVector: queryVectorString,
        maxDistance: 0.6,
        limit: 15,
      },
      { headers: getAdminAuthHeaders() },
    );

    const categoryMatches: CategoryVectorMatch[] =
      categoryResult?.searchCategoryVectors ?? [];

    console.log(
      `📂 [Hybrid Place Search] Found ${categoryMatches.length} matching category vectors`,
    );

    // Extract unique categories and their best scores from matched labels.
    // Applies two scoring improvements:
    //   1. Label-type weighting: category > item_type > alias > descriptor
    //   2. Score decay: similarity^2 penalizes weak matches more aggressively
    const categoryScoreMap = new Map<string, number>();
    for (const match of categoryMatches) {
      const distance =
        typeof match.distance === "number"
          ? match.distance
          : Number(match.distance) || 1.0;
      // Convert distance (0-2) to similarity score (0-1)
      const rawSimilarity = Math.max(0, 1 - distance / 2);

      // Apply label-type weight (category=1.0, item_type=0.95, alias=0.9, descriptor=0.8)
      const labelType = (match.label_type ?? "descriptor") as LabelType;
      const typeWeight = LABEL_TYPE_WEIGHTS[labelType] ?? 0.8;

      // Apply quadratic decay to penalize weak matches
      const weightedSimilarity = rawSimilarity * rawSimilarity * typeWeight;

      const categories = match.associated_categories ?? [];
      for (const cat of categories) {
        const existing = categoryScoreMap.get(cat) ?? 0;
        categoryScoreMap.set(cat, Math.max(existing, weightedSimilarity));
      }
    }

    // If itemTypes are provided, intersect with category mappings
    // This is handled at the server action level now, so we pass through all matched categories

    const matchedCategories = Array.from(categoryScoreMap.keys());
    const categoryScores = matchedCategories.map(
      (cat) => categoryScoreMap.get(cat) ?? 0,
    );

    console.log(
      `📂 [Hybrid Place Search] Resolved ${matchedCategories.length} unique categories from semantic matching`,
    );
    if (matchedCategories.length > 0) {
      console.log(
        `📂 [Hybrid Place Search] Top categories: ${matchedCategories.slice(0, 5).join(", ")}`,
      );
    }

    // =========================================================================
    // Step 3: Execute hybrid search (text + trigram + category + bounds)
    // =========================================================================
    const hybridResult = await functionQuery(
      HYBRID_PLACE_SEARCH_QUERY,
      {
        searchQuery: query.trim(),
        matchedCategories:
          matchedCategories.length > 0
            ? `{${matchedCategories.join(",")}}`
            : null,
        categoryScores:
          categoryScores.length > 0 ? `{${categoryScores.join(",")}}` : null,
        westBound: bounds.west,
        southBound: bounds.south,
        eastBound: bounds.east,
        northBound: bounds.north,
        minRating: minRating ?? null,
        resultLimit: limit,
      },
      { headers: getAdminAuthHeaders() },
    );
    endCategorySearchTimer();

    const rawResults = hybridResult?.searchPlacesHybrid ?? [];

    console.log(
      `🔍 [Hybrid Place Search] Raw results: ${rawResults.length} places`,
    );

    // =========================================================================
    // Step 4: Transform results to match expected format
    // =========================================================================
    const processedResults: ProcessedPlaceResult[] = rawResults.map(
      (result: HybridPlaceSearchRow) => {
        const combinedScore =
          typeof result.combined_score === "number"
            ? result.combined_score
            : Number(result.combined_score) || 0;

        // Map combined_score to a confidence score (0-100)
        // combined_score is 0-1 range from the hybrid function
        const confidenceScore = Math.max(0, Math.min(100, combinedScore * 100));

        // Map to a pseudo-distance for backward compat (0-2 range, lower = better)
        const distance = Math.max(0, 2 * (1 - combinedScore));

        return {
          id: result.id,
          name: result.name,
          primary_category: result.primary_category,
          categories: result.categories,
          location: result.location,
          rating: result.rating,
          price_level: result.price_level,
          street_address: result.street_address,
          locality: result.locality,
          region: result.region,
          postcode: result.postcode,
          country_code: result.country_code,
          phone: result.phone,
          website: result.website,
          email: result.email,
          hours: result.hours,
          confidence: result.confidence,
          is_verified: result.is_verified,
          review_count: result.review_count,
          distance,
          confidenceScore,
          text_rank: result.text_rank,
          trigram_similarity: result.trigram_similarity,
          category_score: result.category_score,
          combined_score: combinedScore,
        } satisfies ProcessedPlaceResult;
      },
    );

    // Get final metrics
    const metrics = performanceTracker.getMetrics();

    logPerformanceMetrics(
      metrics,
      {
        operation: "hybridPlaceSearch",
        query,
        userId,
        boundsArea: (bounds.east - bounds.west) * (bounds.north - bounds.south),
        totalResults: processedResults.length,
        matchedCategoryCount: matchedCategories.length,
        limit,
      },
      {
        functionName: "hybridPlaceSearch",
        sampleRate: CONFIG.PERFORMANCE.LOG_METRICS_SAMPLE_RATE,
        slowOperationThresholdMs: CONFIG.PERFORMANCE.LOG_SLOW_OPERATIONS_MS,
      },
    );

    // Determine which search layers contributed
    const searchLayers: string[] = [];
    if (processedResults.some((r) => (r.text_rank ?? 0) > 0)) {
      searchLayers.push("full_text");
    }
    if (processedResults.some((r) => (r.trigram_similarity ?? 0) > 0)) {
      searchLayers.push("trigram");
    }
    if (processedResults.some((r) => (r.category_score ?? 0) > 0)) {
      searchLayers.push("category_semantic");
    }

    console.log(
      `✅ [Hybrid Place Search] Found ${processedResults.length} places via layers: ${searchLayers.join(", ") || "none"}`,
    );

    return res.status(200).json({
      success: true,
      places: processedResults,
      metadata: {
        query,
        limit,
        bounds,
        totalResults: processedResults.length,
        matchedCategories: matchedCategories.slice(0, 10),
        searchLayers,
      },
    });
  } catch (error) {
    const metrics = performanceTracker.getMetrics();
    logError(error, {
      operation: "hybridPlaceSearch",
      input: req.body,
      metrics,
    });

    if (error instanceof ValidationError) {
      return res
        .status(400)
        .json(createErrorResponse(error, "hybridPlaceSearch"));
    }
    return res
      .status(500)
      .json(
        createErrorResponse(
          error instanceof Error
            ? error
            : new Error("Internal server error during hybrid place search"),
          "hybridPlaceSearch",
        ),
      );
  }
}
