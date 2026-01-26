import type { Request, Response } from "express";
import {
  createErrorResponse,
  createPerformanceTracker,
  DatabaseError,
  type ExtendedPerformanceMetrics,
  ExternalServiceError,
  executeWithRetry,
  functionMutation,
  getAdminAuthHeaders,
  getConfig,
  logError,
  logPerformanceMetrics,
  ValidationError,
} from "../_utils";
import { toDataUrl } from "../_utils/index.js";
import {
  type PlaceholderInput,
  type PlaceholderOutput,
  UPDATE_ITEM_IMAGE_PLACEHOLDER_MUTATION,
  validatePlaceholderInput,
} from "./_types.js";

const {
  NHOST_ADMIN_SECRET,
  NHOST_SUBDOMAIN,
  NHOST_REGION,
  NHOST_WEBHOOK_SECRET,
  PLACEHOLDER_API_URL,
} = process.env;

// Get shared configuration
const CONFIG = getConfig();

export default async function generatePlaceholder(
  req: Request<Record<string, never>, Record<string, never>, PlaceholderInput>,
  res: Response,
) {
  try {
    if (req.method === "GET") return res.status(200).send();
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }

    const validatedInput = validatePlaceholderInput(req.body);
    const performanceTracker =
      createPerformanceTracker<ExtendedPerformanceMetrics>();

    const {
      event: {
        data: {
          new: { id, file_id },
        },
      },
    } = validatedInput;

    console.log(`Processing placeholder generation for item_image ${id}`);

    const result = await executeWithRetry(
      () =>
        processPlaceholderGeneration(
          id as string,
          file_id as string,
          performanceTracker,
        ),
      {
        retryConfig: {
          maxRetries: CONFIG.RETRY.MAX_RETRIES,
          baseDelayMs: CONFIG.RETRY.BASE_DELAY_MS,
          maxDelayMs: CONFIG.RETRY.MAX_DELAY_MS,
          jitterFactor: CONFIG.RETRY.JITTER_FACTOR,
        },
        operationName: "placeholder generation",
        context: { itemImageId: id, fileId: file_id },
      },
    );

    // Log performance metrics
    const metrics = performanceTracker.getMetrics();
    logPerformanceMetrics(
      metrics,
      { itemImageId: id, fileId: file_id },
      {
        functionName: "generatePlaceholder",
        sampleRate: CONFIG.PERFORMANCE.LOG_METRICS_SAMPLE_RATE,
        slowOperationThresholdMs: CONFIG.PERFORMANCE.LOG_SLOW_OPERATIONS_MS,
      },
    );

    return res.status(200).json(result);
  } catch (exception) {
    // Extract context for error logging
    let errorContext: Record<string, unknown> = {};
    try {
      const context = validatePlaceholderInput(req.body);
      errorContext = {
        itemImageId: context.event.data.new.id,
        fileId: context.event.data.new.file_id,
      };
    } catch {
      errorContext = {
        hasEventData: !!req.body?.event?.data,
      };
    }

    logError(exception, errorContext, "generatePlaceholder");

    const errorResponse = createErrorResponse(
      exception,
      "generatePlaceholder",
      process.env.NODE_ENV === "development",
    );

    return res.status(errorResponse.statusCode).json(errorResponse);
  }
}

async function processPlaceholderGeneration(
  itemImageId: string,
  fileId: string,
  performanceTracker: ReturnType<
    typeof createPerformanceTracker<ExtendedPerformanceMetrics>
  >,
): Promise<PlaceholderOutput> {
  // Validate configuration
  if (!PLACEHOLDER_API_URL) {
    throw new ValidationError(
      "PLACEHOLDER_API_URL environment variable not configured",
    );
  }

  // Get public URL for the image
  const endUrlTimer = performanceTracker.startTimer("validationDuration");
  // TODO: Update to use new storage method once available
  const url = `${process.env.NHOST_STORAGE_URL}/files/${fileId}?width=1000&quality=90`;
  endUrlTimer();

  // Download the image with performance tracking
  const endDownloadTimer = performanceTracker.startTimer("externalApiDuration");
  const imageDownloadResponse = await fetch(url);
  if (!imageDownloadResponse.ok) {
    throw new ExternalServiceError(
      "Nhost Storage",
      `Failed to download image: ${imageDownloadResponse.statusText}`,
      true,
    );
  }
  endDownloadTimer();
  console.log("Downloaded image from storage");

  // Convert image to base64 data URL
  const endConversionTimer =
    performanceTracker.startTimer("validationDuration");
  const base64 = await toDataUrl(imageDownloadResponse);
  endConversionTimer();

  // Generate placeholder via external API with performance tracking
  const endPlaceholderTimer = performanceTracker.startTimer(
    "externalApiDuration",
  );
  const placeholderResult = await fetch(PLACEHOLDER_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image: base64 }),
  });

  if (!placeholderResult.ok) {
    throw new ExternalServiceError(
      "Placeholder API",
      `Failed to generate placeholder: ${placeholderResult.statusText}`,
      true,
    );
  }

  const placeholder = await placeholderResult.text();
  endPlaceholderTimer();
  console.log("Generated placeholder image");

  if (!placeholder || placeholder.trim().length === 0) {
    throw new ExternalServiceError(
      "Placeholder API",
      "Generated placeholder is empty or invalid",
      true,
    );
  }

  // Update item_image with placeholder
  const endDbTimer = performanceTracker.startTimer("dbOperationDuration");

  const addItemImageResult = await functionMutation(
    UPDATE_ITEM_IMAGE_PLACEHOLDER_MUTATION,
    {
      itemId: itemImageId,
      item: {
        placeholder,
      },
    },
    { headers: getAdminAuthHeaders() },
  );
  endDbTimer();

  if (!addItemImageResult?.update_item_image_by_pk) {
    throw new DatabaseError("Failed to update item_image with placeholder");
  }

  console.log(`Updated item_image ${itemImageId} with placeholder`);
  return { success: true, itemImageId };
}
