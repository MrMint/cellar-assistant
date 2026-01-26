import type { TableRow } from "@cellar-assistant/shared";
import { graphql } from "@cellar-assistant/shared/gql/graphql";
import type { Request, Response } from "express";
import {
  createErrorResponse,
  createFunctionNhostClient,
  createPerformanceTracker,
  DatabaseError,
  type ExtendedPerformanceMetrics,
  executeWithRetry,
  functionMutation,
  getAdminAuthHeaders,
  getConfig,
  getFilePresignedURLWithAuth,
  logError,
  logPerformanceMetrics,
} from "../_utils";
import { createAIProvider } from "../_utils/ai-providers/factory.js";
import type { ImageVectorRequest, ImageVectorResult } from "./_types";
import {
  createImageVectorContext,
  validateEmbeddingResult,
  validateImageVectorRequest,
  validatePresignedUrlResponse,
} from "./_types";

const { NHOST_WEBHOOK_SECRET } = process.env;

const nhostClient = createFunctionNhostClient();

// Get shared configuration
const CONFIG = getConfig();

// Validation function now imported from ./types.ts

export default async function generateImageVector(
  req: Request<
    Record<string, never>,
    Record<string, never>,
    ImageVectorRequest
  >,
  res: Response,
) {
  try {
    if (req.method === "GET") return res.status(200).send();
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }

    const validatedInput = validateImageVectorRequest(req.body);
    const performanceTracker =
      createPerformanceTracker<ExtendedPerformanceMetrics>();

    const {
      event: {
        data: { new: item },
      },
    } = validatedInput;
    console.log(`Processing image vector generation for item_image ${item.id}`);

    const result = await executeWithRetry(
      () => processImageVectorGeneration(item, performanceTracker),
      {
        retryConfig: {
          maxRetries: CONFIG.RETRY.MAX_RETRIES,
          baseDelayMs: CONFIG.RETRY.BASE_DELAY_MS,
          maxDelayMs: CONFIG.RETRY.MAX_DELAY_MS,
          jitterFactor: CONFIG.RETRY.JITTER_FACTOR,
        },
        operationName: "image vector generation",
        context: { itemImageId: item.id, fileId: item.file_id },
      },
    );

    // Log performance metrics
    const metrics = performanceTracker.getMetrics();
    logPerformanceMetrics(
      metrics,
      { itemImageId: item.id, fileId: item.file_id },
      {
        functionName: "generateImageVector",
        sampleRate: CONFIG.PERFORMANCE.LOG_METRICS_SAMPLE_RATE,
        slowOperationThresholdMs: CONFIG.PERFORMANCE.LOG_SLOW_OPERATIONS_MS,
      },
    );

    return res.status(200).json(result);
  } catch (exception) {
    // Extract context for error logging
    let errorContext: Record<string, unknown> = {};
    try {
      const context = validateImageVectorRequest(req.body);
      errorContext = createImageVectorContext(context);
    } catch {
      errorContext = {
        hasEventData: !!req.body?.event?.data,
      };
    }

    logError(exception, errorContext, "generateImageVector");

    const errorResponse = createErrorResponse(
      exception,
      "generateImageVector",
      process.env.NODE_ENV === "development",
    );

    return res.status(errorResponse.statusCode).json(errorResponse);
  }
}

async function processImageVectorGeneration(
  item: TableRow<"item_image">,
  performanceTracker: ReturnType<
    typeof createPerformanceTracker<ExtendedPerformanceMetrics>
  >,
): Promise<ImageVectorResult> {
  // Get presigned URL with performance tracking
  const endUrlTimer = performanceTracker.startTimer("externalApiDuration");
  const presignedUrlResponse = await getFilePresignedURLWithAuth(
    nhostClient,
    item.file_id,
  );
  endUrlTimer();

  // Validate presigned URL response (Nhost SDK FetchResponse structure)
  const urlResponse = validatePresignedUrlResponse(presignedUrlResponse);
  if (
    urlResponse.status < 200 ||
    urlResponse.status >= 300 ||
    !urlResponse.body?.url
  ) {
    throw new DatabaseError(
      `Failed to get presigned URL: status ${urlResponse.status}`,
    );
  }

  // Fetch image with performance tracking
  const endFetchTimer = performanceTracker.startTimer("externalApiDuration");
  const response = await fetch(urlResponse.body.url);
  if (!response.ok) {
    throw new DatabaseError(`Failed to fetch image: ${response.statusText}`);
  }
  const image = await response.arrayBuffer();
  const content = Buffer.from(image);
  endFetchTimer();
  console.log("Fetched image");

  // Generate embeddings with performance tracking
  const endEmbeddingTimer = performanceTracker.startTimer(
    "externalApiDuration",
  );
  const aiProvider = await createAIProvider();
  const embeddingResult = await aiProvider.generateEmbeddings?.({
    content,
    type: "image",
  });
  endEmbeddingTimer();

  if (!embeddingResult?.embeddings) {
    throw new DatabaseError("Failed to generate image embeddings");
  }

  const validatedEmbedding = validateEmbeddingResult({
    embeddings: embeddingResult.embeddings,
  });

  console.log(
    `Generated image vector with ${validatedEmbedding.dimensions} dimensions`,
  );

  // Update item_image with vector
  const endDbTimer = performanceTracker.startTimer("dbOperationDuration");
  const updateItemImageMutation = graphql(`
    mutation UpdateItemImage($itemId: uuid!, $item: item_image_set_input!) {
      update_item_image_by_pk(pk_columns: { id: $itemId }, _set: $item) {
        id
      }
    }
  `);

  const insertVectorResult = await functionMutation(
    updateItemImageMutation,
    {
      itemId: item.id,
      item: {
        vector: JSON.stringify(validatedEmbedding.embeddings),
      },
    },
    { headers: getAdminAuthHeaders() },
  );
  endDbTimer();

  if (!insertVectorResult) {
    throw new DatabaseError("Failed to update item_image vector");
  }

  console.log(`Updated item_image vector for ${item.id}`);
  return {
    success: true,
    itemImageId: item.id,
    dimensions: validatedEmbedding.dimensions,
  };
}
