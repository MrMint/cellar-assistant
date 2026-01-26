import { randomUUID } from "node:crypto";
import type { VariablesOf } from "@cellar-assistant/shared/gql/graphql";
import type { Request, Response } from "express";
import { isNil } from "ramda";
import {
  createErrorResponse,
  createPerformanceTracker,
  DatabaseError,
  type ExtendedPerformanceMetrics,
  executeWithRetry,
  getConfig,
  logError,
  logPerformanceMetrics,
  ValidationError,
} from "../_utils";
import { dataUrlToFormData } from "../_utils/index.js";
import { functionMutation, getAdminAuthHeaders } from "../_utils/urql-client";
import { insertItemImage } from "./_queries.js";
import type { UploadImageInput, ValidItemType } from "./_types";
import { validateUploadImageInput } from "./_types";

const { NHOST_WEBHOOK_SECRET } = process.env;

// Get shared configuration
const CONFIG = getConfig();

// Use the type-safe validation from _types.ts
const validateUploadInput = validateUploadImageInput;

export default async function uploadItemImage(
  req: Request<Record<string, never>, Record<string, never>, UploadImageInput>,
  res: Response,
) {
  try {
    if (req.method === "GET") return res.status(200).send();
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }

    const validatedInput = validateUploadInput(req.body);
    const performanceTracker =
      createPerformanceTracker<ExtendedPerformanceMetrics>();

    const {
      input: {
        input: { item_id, image, item_type },
      },
      session_variables,
    } = validatedInput;

    const userId = session_variables?.["x-hasura-user-id"] ?? "";
    console.log(
      `Processing ${item_type} image upload for item ${item_id} by user ${userId}`,
    );

    const result = await executeWithRetry(
      () =>
        processImageUpload(
          item_id,
          image,
          item_type,
          userId,
          performanceTracker,
        ),
      {
        retryConfig: {
          maxRetries: CONFIG.RETRY.MAX_RETRIES,
          baseDelayMs: CONFIG.RETRY.BASE_DELAY_MS,
          maxDelayMs: CONFIG.RETRY.MAX_DELAY_MS,
          jitterFactor: CONFIG.RETRY.JITTER_FACTOR,
        },
        operationName: "image upload",
        context: { itemId: item_id, itemType: item_type, userId },
      },
    );

    // Log performance metrics
    const metrics = performanceTracker.getMetrics();
    logPerformanceMetrics(
      metrics,
      { itemId: item_id, itemType: item_type, userId },
      {
        functionName: "uploadItemImage",
        sampleRate: CONFIG.PERFORMANCE.LOG_METRICS_SAMPLE_RATE,
        slowOperationThresholdMs: CONFIG.PERFORMANCE.LOG_SLOW_OPERATIONS_MS,
      },
    );

    return res.status(200).json(result);
  } catch (exception) {
    // Extract context for error logging
    let errorContext: Record<string, unknown> = {};
    try {
      const context = validateUploadInput(req.body);
      errorContext = {
        itemId: context.input.input.item_id,
        itemType: context.input.input.item_type,
        userId: context.session_variables?.["x-hasura-user-id"],
      };
    } catch {
      errorContext = {
        hasInput: !!req.body?.input,
        hasSessionVars: !!req.body?.session_variables,
      };
    }

    logError(exception, errorContext, "uploadItemImage");

    const errorResponse = createErrorResponse(
      exception,
      "uploadItemImage",
      process.env.NODE_ENV === "development",
    );

    return res.status(errorResponse.statusCode).json(errorResponse);
  }
}

async function processImageUpload(
  itemId: string,
  image: string,
  itemType: string,
  userId: string,
  performanceTracker: ReturnType<
    typeof createPerformanceTracker<ExtendedPerformanceMetrics>
  >,
): Promise<{ id: string; success: boolean }> {
  // Build item reference based on type
  const item: VariablesOf<typeof insertItemImage>["item"] = {};
  switch (itemType as ValidItemType) {
    case "BEER":
      item.beer_id = itemId;
      break;
    case "WINE":
      item.wine_id = itemId;
      break;
    case "SPIRIT":
      item.spirit_id = itemId;
      break;
    case "COFFEE":
      item.coffee_id = itemId;
      break;
    case "SAKE":
      item.sake_id = itemId;
      break;
    default:
      throw new ValidationError(`Unsupported item type: ${itemType}`);
  }

  // Convert data URL to FormData with performance tracking
  const endValidationTimer =
    performanceTracker.startTimer("validationDuration");
  const formData = dataUrlToFormData(image, randomUUID());
  endValidationTimer();

  if (isNil(formData)) {
    throw new ValidationError("Invalid image data URL provided");
  }

  // Add bucket-id to the FormData
  formData.append("bucket-id", "item_images");

  // Upload image to storage with performance tracking using direct fetch
  // The Nhost SDK's uploadFiles doesn't work correctly with Node.js FormData
  const endUploadTimer = performanceTracker.startTimer("externalApiDuration");

  const subdomain = process.env.NHOST_SUBDOMAIN;
  const region = process.env.NHOST_REGION;
  const adminSecret = process.env.NHOST_ADMIN_SECRET;

  if (!subdomain || !adminSecret) {
    throw new ValidationError(
      "Missing required environment variables for storage upload",
    );
  }

  // Construct storage URL based on environment
  const storageUrl =
    subdomain === "local"
      ? "https://local.storage.nhost.run/v1/files"
      : `https://${subdomain}.storage.${region}.nhost.run/v1/files`;

  // Use getBuffer() to properly serialize the FormData for native fetch
  // Convert Buffer to Uint8Array for fetch compatibility
  const formBuffer = formData.getBuffer();
  const formHeaders = formData.getHeaders();

  const uploadResponse = await fetch(storageUrl, {
    method: "POST",
    headers: {
      ...formHeaders,
      "x-hasura-admin-secret": adminSecret,
      "Content-Length": String(formBuffer.length),
    },
    body: new Uint8Array(formBuffer),
  });

  const status = uploadResponse.status;

  endUploadTimer();

  if (status < 200 || status >= 300) {
    const errorText = await uploadResponse.text();
    console.error("Failed to upload image to storage:", status, errorText);
    throw new DatabaseError(
      `Failed to upload image to storage. Status: ${status}`,
    );
  }

  const uploadResult = (await uploadResponse.json()) as {
    processedFiles: Array<{ id: string }>;
  };
  const fileMetadata = uploadResult.processedFiles?.[0];

  if (!fileMetadata?.id) {
    throw new DatabaseError("Invalid file metadata received from storage");
  }
  console.log(`Uploaded image to storage with file ID: ${fileMetadata.id}`);

  // Insert item_image record with performance tracking
  const endDbTimer = performanceTracker.startTimer("dbOperationDuration");

  try {
    const addItemImageResult = await functionMutation(
      insertItemImage,
      {
        item: {
          ...item,
          user_id: userId,
          file_id: fileMetadata.id,
          is_public: true,
        },
      },
      {
        headers: getAdminAuthHeaders(),
      },
    );
    endDbTimer();

    if (isNil(addItemImageResult?.insert_item_image_one)) {
      throw new DatabaseError("Failed to create item_image record");
    }

    const imageId = addItemImageResult.insert_item_image_one.id;
    console.log(`Created item_image record with ID: ${imageId}`);

    return { id: imageId, success: true };
  } catch (error) {
    endDbTimer();
    console.error("Failed to insert item_image record:", error);
    throw new DatabaseError("Failed to create item_image record");
  }
}
