import { graphql } from "@cellar-assistant/shared/gql/graphql";
import type { Request, Response } from "express";
import {
  createErrorResponse,
  createPerformanceTracker,
  DatabaseError,
  type ExtendedPerformanceMetrics,
  executeWithRetry,
  functionMutation,
  getAdminAuthHeaders,
  getConfig,
  logError,
  logPerformanceMetrics,
} from "../_utils";
import { createAIProvider } from "../_utils/ai-providers/factory";
import type {
  PlaceEmbeddingData,
  PlaceVectorInput,
  PlaceVectorResult,
} from "./_types";
import {
  createPlaceVectorContext,
  generatePlaceEmbeddingText,
  validatePlaceEmbeddingResult,
  validatePlaceVectorInput,
} from "./_types";

const { NHOST_WEBHOOK_SECRET } = process.env;

// Get shared configuration
const CONFIG = getConfig();

// Types and helper functions now imported from ./types.ts

export default async function generatePlaceVector(
  req: Request<Record<string, never>, Record<string, never>, PlaceVectorInput>,
  res: Response,
) {
  try {
    if (req.method === "GET") return res.status(200).send();
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }

    const validatedInput = validatePlaceVectorInput(req.body);
    const performanceTracker =
      createPerformanceTracker<ExtendedPerformanceMetrics>();

    const {
      event: {
        data: { new: place },
      },
    } = validatedInput;

    console.log(
      `Processing place vector generation for ${place.name} (${place.id})`,
    );

    const result = await executeWithRetry(
      () => processPlaceVectorGeneration(place, performanceTracker),
      {
        retryConfig: {
          maxRetries: CONFIG.RETRY.MAX_RETRIES,
          baseDelayMs: CONFIG.RETRY.BASE_DELAY_MS,
          maxDelayMs: CONFIG.RETRY.MAX_DELAY_MS,
          jitterFactor: CONFIG.RETRY.JITTER_FACTOR,
        },
        operationName: `place vector generation`,
        context: { placeId: place.id, placeName: place.name },
      },
    );

    // Log performance metrics
    const metrics = performanceTracker.getMetrics();
    logPerformanceMetrics(
      metrics,
      { placeId: place.id, placeName: place.name },
      {
        functionName: "generatePlaceVector",
        sampleRate: CONFIG.PERFORMANCE.LOG_METRICS_SAMPLE_RATE,
        slowOperationThresholdMs: CONFIG.PERFORMANCE.LOG_SLOW_OPERATIONS_MS,
      },
    );

    return res.status(200).json(result);
  } catch (exception) {
    // Extract context for error logging
    let errorContext: Record<string, unknown> = {};
    try {
      const context = validatePlaceVectorInput(req.body);
      errorContext = createPlaceVectorContext(context);
    } catch {
      errorContext = {
        tableName: req.body?.table?.name || "unknown",
        hasEventData: !!req.body?.event?.data,
      };
    }

    logError(exception, errorContext, "generatePlaceVector");

    const errorResponse = createErrorResponse(
      exception,
      "generatePlaceVector",
      process.env.NODE_ENV === "development",
    );

    return res.status(errorResponse.statusCode).json(errorResponse);
  }
}

async function processPlaceVectorGeneration(
  place: PlaceEmbeddingData,
  performanceTracker: ReturnType<
    typeof createPerformanceTracker<ExtendedPerformanceMetrics>
  >,
): Promise<PlaceVectorResult> {
  // Get the AI provider with performance tracking
  const endProviderTimer = performanceTracker.startTimer("externalApiDuration");
  const aiProvider = await createAIProvider();
  endProviderTimer();

  // Build descriptive text for the place
  const embeddingText = generatePlaceEmbeddingText(place);
  console.log(`Generated place embedding text: ${embeddingText}`);

  // Generate text embedding with performance tracking
  const endEmbeddingTimer = performanceTracker.startTimer(
    "externalApiDuration",
  );
  const embeddingResponse = await aiProvider.generateEmbeddings?.({
    content: embeddingText,
    type: "text",
  });
  endEmbeddingTimer();

  if (!embeddingResponse?.embeddings) {
    throw new DatabaseError("Failed to generate place embeddings");
  }

  const validatedEmbedding = validatePlaceEmbeddingResult(
    embeddingResponse.embeddings,
    embeddingText,
  );

  console.log(
    `Generated place vector with ${validatedEmbedding.dimensions} dimensions`,
  );

  // Update place with search vector in database
  const endDbTimer = performanceTracker.startTimer("dbOperationDuration");

  const updatePlaceVectorMutation = graphql(`
    mutation UpdatePlaceVector($id: uuid!, $vector: String!) {
      update_places_by_pk(
        pk_columns: { id: $id }
        _set: { search_vector: $vector }
      ) {
        id
        name
      }
    }
  `);

  const updateResult = await functionMutation(
    updatePlaceVectorMutation,
    {
      id: place.id,
      vector: JSON.stringify(validatedEmbedding.embeddings),
    },
    { headers: getAdminAuthHeaders() },
  );
  endDbTimer();

  if (!updateResult?.update_places_by_pk?.id) {
    throw new DatabaseError("Failed to update place search vector");
  }

  console.log(`Updated place ${place.id} with search vector`);

  return {
    success: true,
    vectorId: place.id,
    dimensions: validatedEmbedding.dimensions,
    embeddingText: validatedEmbedding.text,
  };
}
