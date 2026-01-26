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
import {
  type ItemImageVectorInput,
  type ItemImageVectorOutput,
  UPDATE_ITEM_IMAGE_VECTOR_MUTATION,
  validateItemImageVectorInput,
} from "./_types.js";

const { NHOST_WEBHOOK_SECRET } = process.env;

const nhostClient = createFunctionNhostClient();

// Get shared configuration
const CONFIG = getConfig();

export default async function generateItemImageVector(
  req: Request<
    Record<string, never>,
    Record<string, never>,
    ItemImageVectorInput
  >,
  res: Response,
) {
  try {
    if (req.method === "GET") return res.status(200).send();
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }

    const validatedInput = validateItemImageVectorInput(req.body);
    const performanceTracker =
      createPerformanceTracker<ExtendedPerformanceMetrics>();

    const {
      event: {
        data: { new: item },
      },
    } = validatedInput;

    console.log(`Processing image vector generation for item_image ${item.id}`);

    const result = await executeWithRetry(
      () => processItemImageVector(item, performanceTracker),
      {
        retryConfig: {
          maxRetries: CONFIG.RETRY.MAX_RETRIES,
          baseDelayMs: CONFIG.RETRY.BASE_DELAY_MS,
          maxDelayMs: CONFIG.RETRY.MAX_DELAY_MS,
          jitterFactor: CONFIG.RETRY.JITTER_FACTOR,
        },
        operationName: "item image vector generation",
        context: { itemImageId: item.id, fileId: item.file_id },
      },
    );

    // Log performance metrics
    const metrics = performanceTracker.getMetrics();
    logPerformanceMetrics(
      metrics,
      { itemImageId: item.id, fileId: item.file_id },
      {
        functionName: "generateItemImageVector",
        sampleRate: CONFIG.PERFORMANCE.LOG_METRICS_SAMPLE_RATE,
        slowOperationThresholdMs: CONFIG.PERFORMANCE.LOG_SLOW_OPERATIONS_MS,
      },
    );

    return res.status(200).json(result);
  } catch (exception) {
    // Extract context for error logging
    let errorContext: Record<string, unknown> = {};
    try {
      const context = validateItemImageVectorInput(req.body);
      errorContext = {
        itemImageId: context.event.data.new.id,
        fileId: context.event.data.new.file_id,
      };
    } catch {
      errorContext = {
        hasEventData: !!req.body?.event?.data,
      };
    }

    logError(exception, errorContext, "generateItemImageVector");

    const errorResponse = createErrorResponse(
      exception,
      "generateItemImageVector",
      process.env.NODE_ENV === "development",
    );

    return res.status(errorResponse.statusCode).json(errorResponse);
  }
}

async function processItemImageVector(
  item: ItemImageVectorInput["event"]["data"]["new"],
  performanceTracker: ReturnType<
    typeof createPerformanceTracker<ExtendedPerformanceMetrics>
  >,
): Promise<ItemImageVectorOutput> {
  // Get presigned URL with performance tracking
  const endUrlTimer = performanceTracker.startTimer("externalApiDuration");
  const presignedUrlResponse = await getFilePresignedURLWithAuth(
    nhostClient,
    item.file_id as string,
  );
  endUrlTimer();

  // Type assertion for Nhost SDK FetchResponse<PresignedURLResponse>
  const { body, status } =
    presignedUrlResponse as import("../_utils/types").PresignedUrlResponse;
  if (status < 200 || status >= 300 || !body?.url) {
    throw new DatabaseError(`Failed to get presigned URL: status ${status}`);
  }

  // Fetch image with performance tracking
  const endFetchTimer = performanceTracker.startTimer("externalApiDuration");
  const response = await fetch(body.url);
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

  console.log(
    `Generated image vector with ${embeddingResult.embeddings.length} dimensions`,
  );

  // Update item_image with vector
  const endDbTimer = performanceTracker.startTimer("dbOperationDuration");

  const insertVectorResult = await functionMutation(
    UPDATE_ITEM_IMAGE_VECTOR_MUTATION,
    {
      itemId: item.id as string,
      item: {
        vector: JSON.stringify(embeddingResult.embeddings),
      },
    },
    { headers: getAdminAuthHeaders() },
  );
  endDbTimer();

  if (!insertVectorResult) {
    throw new DatabaseError("Failed to update item_image vector");
  }

  console.log(`Updated item_image vector for ${item.id}`);
  return { success: true, itemImageId: item.id as string };
}
