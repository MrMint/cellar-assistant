import { graphql } from "@cellar-assistant/shared/gql/graphql";
import type { Request, Response } from "express";
import { isNotNil } from "ramda";
import {
  AIAnalysisError,
  createAIPerformanceTracker,
  createErrorResponse,
  createFunctionNhostClient,
  executeWithRetry,
  functionMutation,
  getAdminAuthHeaders,
  getConfig,
  getFilePresignedURLWithAuth,
  logError,
  logPerformanceMetrics,
  ValidationError,
  validateBarcode,
  validateFileId,
  validateItemType,
  validateUserId,
} from "../_utils";
import { createAIProvider } from "../_utils/ai-providers/factory";
import type { PresignedUrlResponse } from "../_utils/types";
import { getSchemaForItemType } from "./_schemas";
import type {
  AnalyzeImagesParams,
  FinalizeResultsParams,
  GetItemDefaultsRequest,
  GetItemDefaultsResult,
  ProcessingContext,
  SaveOnboardingParams,
} from "./_types";
import {
  type AIDefaults,
  buildItemAnalysisPrompt,
  calculateConfidence,
  getAllEnumValues,
  type ItemType,
  mapValidatedDataToReturnType,
  sanitizeAIResponse,
  validateAndNarrowAIDefaults,
} from "./_utils";

const addItemOnboarding = graphql(`
  mutation AddItemOnboarding($onboarding: item_onboardings_insert_input!) {
    insert_item_onboardings_one(object: $onboarding) {
      id
    }
  }
`);

// ProcessingContext is now imported from ./types.ts

// Get shared configuration
const CONFIG = getConfig();

function sanitizeProcessingContext(req: Request): ProcessingContext {
  const { hint = {}, itemType, session_variables } = req.body || {};
  const { barcode, barcodeType, frontLabelFileId, backLabelFileId } = hint;
  const userId = session_variables?.["x-hasura-user-id"];

  // Validate required fields
  if (!validateUserId(userId)) {
    throw new ValidationError("Invalid or missing user ID");
  }

  if (!validateItemType(itemType)) {
    throw new ValidationError(
      `Invalid item type: ${itemType}. Must be one of: BEER, WINE, SPIRIT, COFFEE`,
    );
  }

  // Validate optional file IDs
  if (frontLabelFileId && !validateFileId(frontLabelFileId)) {
    throw new ValidationError("Invalid front label file ID format");
  }

  if (backLabelFileId && !validateFileId(backLabelFileId)) {
    throw new ValidationError("Invalid back label file ID format");
  }

  // Validate optional barcode
  if (barcode && !validateBarcode(barcode)) {
    throw new ValidationError("Invalid barcode format. Must be 8-14 digits");
  }

  // Validate at least one image is provided
  if (!frontLabelFileId && !backLabelFileId) {
    throw new ValidationError("At least one label image is required");
  }

  return {
    userId,
    itemType,
    frontLabelFileId: frontLabelFileId || undefined,
    backLabelFileId: backLabelFileId || undefined,
    barcode: barcode || undefined,
    barcodeType: typeof barcodeType === "string" ? barcodeType : undefined,
  };
}

const { NHOST_WEBHOOK_SECRET } = process.env;

const nhostClient = createFunctionNhostClient();

// GetItemDefaultsResult is now imported from ./types.ts

export default async function getItemDefaults(
  req: Request<
    Record<string, never>,
    Record<string, never>,
    GetItemDefaultsRequest
  >,
  res: Response,
) {
  try {
    if (req.method === "GET") return res.status(200).send();
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }

    const context = sanitizeProcessingContext(req);
    const performanceTracker = createAIPerformanceTracker();

    console.log(`Processing ${context.itemType} for user ${context.userId}`);

    const result = await processItemDefaults(
      context,
      nhostClient,
      performanceTracker,
    );

    // Log performance metrics using shared utility
    const metrics = performanceTracker.getMetrics();
    logPerformanceMetrics(
      metrics,
      { userId: context.userId, itemType: context.itemType },
      {
        functionName: "getItemDefaults",
        sampleRate: CONFIG.PERFORMANCE.LOG_METRICS_SAMPLE_RATE,
        slowOperationThresholdMs: CONFIG.PERFORMANCE.LOG_SLOW_OPERATIONS_MS,
      },
    );
    return res.status(200).json(result);
  } catch (exception) {
    // Extract context from sanitized data if available, otherwise from raw request
    let errorContext: Record<string, unknown> = {};
    try {
      const context = sanitizeProcessingContext(req);
      errorContext = context;
    } catch {
      // Fall back to raw request data if sanitization fails
      errorContext = {
        userId: req.body?.session_variables?.["x-hasura-user-id"] || "unknown",
        itemType: req.body?.itemType || "unknown",
        frontLabelFileId: req.body?.hint?.frontLabelFileId,
        backLabelFileId: req.body?.hint?.backLabelFileId,
      };
    }

    // Use shared error logging
    logError(exception, errorContext, "getItemDefaults");

    // Create standardized error response
    const errorResponse = createErrorResponse(
      exception,
      "getItemDefaults",
      process.env.NODE_ENV === "development",
    );

    return res.status(errorResponse.statusCode).json(errorResponse);
  }
}

async function processItemDefaults(
  context: ProcessingContext,
  nhostClient: ReturnType<typeof createFunctionNhostClient>,
  performanceTracker: ReturnType<typeof createAIPerformanceTracker>,
): Promise<GetItemDefaultsResult> {
  const { userId, itemType } = context;

  console.log(`Processing ${itemType} for user ${userId}`, {
    frontLabelFileId: !!context.frontLabelFileId,
    backLabelFileId: !!context.backLabelFileId,
    hasBarcode: !!context.barcode,
  });

  try {
    // Fetch enum values and schema in parallel with performance tracking
    const endSchemaTimer = performanceTracker.startTimer("externalApiDuration");
    const endEnumTimer = performanceTracker.startTimer("dbOperationDuration");

    const [enumValues, schema] = await Promise.all([
      getAllEnumValues(),
      getSchemaForItemType(itemType),
    ]);

    endEnumTimer();
    endSchemaTimer();

    if (!schema) {
      throw new ValidationError(`Unknown item type: ${itemType}`);
    }

    console.log(`Successfully fetched schema and enums for ${itemType}`);
    return await executeWithRetry(
      () =>
        processItemCore(
          context,
          schema,
          enumValues,
          nhostClient,
          performanceTracker,
        ),
      {
        retryConfig: {
          maxRetries: CONFIG.RETRY.MAX_RETRIES,
          baseDelayMs: CONFIG.RETRY.BASE_DELAY_MS,
          maxDelayMs: CONFIG.RETRY.MAX_DELAY_MS,
          jitterFactor: CONFIG.RETRY.JITTER_FACTOR,
        },
        // Type assertion needed: AIPerformanceMetrics extends BasePerformanceMetrics but TS variance prevents direct assignment
        performanceTracker:
          performanceTracker as unknown as import("../_utils/performance").PerformanceTracker<
            import("../_utils/performance").BasePerformanceMetrics
          >,
        operationName: `${itemType} processing`,
        context: { userId, itemType },
      },
    );
  } catch (error) {
    console.error(`Failed to process ${itemType} for user ${userId}:`, error);
    throw error;
  }
}

async function processItemCore(
  context: ProcessingContext,
  schema: import("../_utils/ai-providers/types").JSONSchema7,
  enumValues: import("./_utils").EnumValues,
  nhostClient: ReturnType<typeof createFunctionNhostClient>,
  performanceTracker: ReturnType<typeof createAIPerformanceTracker>,
): Promise<GetItemDefaultsResult> {
  const { frontLabelFileId, backLabelFileId } = context;

  // Process AI analysis and images in parallel with performance tracking
  const endImageTimer = performanceTracker.startTimer("imageFetchDuration");
  const [aiProvider, images] = await Promise.all([
    createAIProvider(),
    fetchLabelImages(frontLabelFileId, backLabelFileId),
  ]);
  endImageTimer();

  performanceTracker.setMetric("imageCount", images.length);

  if (images.length === 0) {
    throw new ValidationError("At least one label image required");
  }

  console.log(`Fetched ${images.length} image(s) for analysis`);

  // Analyze images with AI
  console.log("Starting AI analysis...");
  const endAiTimer = performanceTracker.startTimer("aiAnalysisDuration");

  const aiDefaults = await analyzeItemImages({
    aiProvider,
    images,
    itemType: context.itemType,
    schema,
    performanceTracker,
    enumValues,
  });

  endAiTimer();
  console.log(`AI analysis completed`);

  // Process and enhance results
  const results = await finalizeResults({
    aiDefaults,
    itemType: context.itemType,
    enumValues,
    schema,
    barcode: context.barcode,
    barcodeType: context.barcodeType,
    context,
    nhostClient,
    performanceTracker,
  });

  return results;
}

// AnalyzeImagesParams is now imported from ./types.ts

async function analyzeItemImages({
  aiProvider,
  images,
  itemType,
  schema,
  performanceTracker,
  enumValues,
}: AnalyzeImagesParams): Promise<AIDefaults> {
  const prompt = buildItemAnalysisPrompt(
    itemType as ItemType,
    schema,
    enumValues,
  );

  const aiResponse = await aiProvider.generateContent(
    {
      prompt,
      images,
      schema,
    },
    "low",
  );

  // Debug: Log raw AI response
  console.log("🔍 [getItemDefaults] Raw AI response content:");
  console.log("=".repeat(80));
  console.log(aiResponse.content);
  console.log("=".repeat(80));

  // Parse the AI response
  let parsedResponse: unknown;
  try {
    parsedResponse = JSON.parse(aiResponse.content);
    console.log("✅ [getItemDefaults] JSON parsing successful");
  } catch (parseError) {
    console.error("❌ [getItemDefaults] Failed to parse AI response as JSON");
    console.error("❌ [getItemDefaults] Full raw AI content:");
    console.error("-".repeat(80));
    console.error(aiResponse.content);
    console.error("-".repeat(80));
    console.error("❌ [getItemDefaults] Parse error:", parseError);
    throw new AIAnalysisError("AI response is not valid JSON");
  }

  // Sanitize the AI response before validation
  // - Convert null values to undefined for optional string fields
  // - Pre-match enum values using fuzzy matching (e.g., "USA" -> "UNITED_STATES")
  const sanitizedResponse = enumValues
    ? sanitizeAIResponse(parsedResponse, itemType as ItemType, enumValues)
    : parsedResponse;

  console.log("🔧 [getItemDefaults] Sanitized AI response for validation");

  // Try to validate and narrow types using AJV
  const endValidationTimer =
    performanceTracker.startTimer("validationDuration");
  const validation = validateAndNarrowAIDefaults(
    sanitizedResponse,
    itemType as ItemType,
    schema,
  );
  endValidationTimer();

  if (!validation.valid) {
    const errors = "errors" in validation ? validation.errors : [];
    console.warn("AI response validation failed with type narrowing:", {
      errors,
      itemType,
      responseKeys:
        typeof parsedResponse === "object" && parsedResponse !== null
          ? Object.keys(parsedResponse)
          : "N/A",
    });

    // Log sample of invalid data for debugging
    if (process.env.NODE_ENV === "development") {
      console.debug(
        "Invalid AI response sample:",
        JSON.stringify(parsedResponse, null, 2),
      );
    }

    throw new AIAnalysisError(
      `AI response validation failed: ${errors.join(", ")}`,
    );
  }

  console.log("AI response validation passed with type narrowing");
  return validation.data;
}

// FinalizeResultsParams is now imported from ./types.ts

async function finalizeResults({
  aiDefaults,
  itemType,
  enumValues,
  schema,
  barcode,
  barcodeType,
  context,
  nhostClient,
  performanceTracker,
}: FinalizeResultsParams): Promise<GetItemDefaultsResult> {
  const confidence = calculateConfidence(aiDefaults, schema);
  performanceTracker.setMetric("confidence", confidence);
  console.log(
    `Analysis completed with ${Math.round(confidence * 100)}% confidence`,
  );

  // Use type-narrowed mapping with validated data
  const results = mapValidatedDataToReturnType(
    itemType as ItemType,
    aiDefaults,
    enumValues,
  ) as GetItemDefaultsResult;

  // Enhance with barcode data
  if (isNotNil(barcode)) {
    results.barcode_code = barcode;
  }
  if (isNotNil(barcodeType)) {
    results.barcode_type = barcodeType;
  }

  // Add confidence score
  (results as GetItemDefaultsResult & { confidence: number }).confidence =
    confidence;

  // Save to database
  const endDbTimer = performanceTracker.startTimer("dbOperationDuration");
  const onboardingResult = await saveOnboardingData({
    context,
    aiDefaults,
    results,
    nhostClient,
  });
  endDbTimer();

  results.item_onboarding_id = onboardingResult.id;
  return results;
}

// SaveOnboardingParams is now imported from ./types.ts

async function saveOnboardingData({
  context,
  aiDefaults,
  results,
  nhostClient,
}: SaveOnboardingParams): Promise<{ id: string }> {
  const addOnboardingResult = await functionMutation(
    addItemOnboarding,
    {
      onboarding: {
        barcode: context.barcode,
        barcode_type: context.barcodeType,
        back_label_image_id: context.backLabelFileId,
        front_label_image_id: context.frontLabelFileId,
        item_type: context.itemType,
        user_id: context.userId,
        raw_defaults: JSON.stringify(aiDefaults),
        defaults: results,
        status: "COMPLETED",
      },
    },
    { headers: getAdminAuthHeaders() },
  );

  console.log("Successfully saved onboarding data", {
    id: addOnboardingResult.insert_item_onboardings_one?.id,
    userId: context.userId,
    itemType: context.itemType,
  });

  return {
    id: addOnboardingResult.insert_item_onboardings_one?.id || "",
  };
}

async function fetchLabelImages(
  frontLabelFileId?: string,
  backLabelFileId?: string,
): Promise<Buffer[]> {
  const images: Buffer[] = [];

  const fetchImage = async (fileId: string): Promise<Buffer> => {
    console.log(
      `📥 [getItemDefaults] Fetching presigned URL for file: ${fileId}`,
    );

    const presignedUrlResponse = await getFilePresignedURLWithAuth(
      nhostClient,
      fileId,
    );

    console.log(
      `📥 [getItemDefaults] Presigned URL response status: ${presignedUrlResponse.status}`,
    );

    // The Nhost SDK returns FetchResponse<PresignedURLResponse> with { body, status, headers }
    const { body, status } = presignedUrlResponse as PresignedUrlResponse;

    if (status < 200 || status >= 300 || !body?.url) {
      console.error(
        `❌ [getItemDefaults] Failed to get presigned URL for file ${fileId}:`,
        {
          status,
          body,
        },
      );
      throw new Error(`Failed to get URL for file ${fileId}: status ${status}`);
    }

    console.log(`📥 [getItemDefaults] Got presigned URL, fetching image...`);
    const response = await fetch(body.url);
    if (!response.ok) {
      console.error(
        `❌ [getItemDefaults] Failed to fetch image from presigned URL:`,
        {
          status: response.status,
          statusText: response.statusText,
        },
      );
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(
      `✅ [getItemDefaults] Successfully fetched image, size: ${arrayBuffer.byteLength} bytes`,
    );
    return Buffer.from(arrayBuffer);
  };

  if (isNotNil(frontLabelFileId)) {
    images.push(await fetchImage(frontLabelFileId));
    console.log("Fetched front label image");
  }

  if (isNotNil(backLabelFileId)) {
    images.push(await fetchImage(backLabelFileId));
    console.log("Fetched back label image");
  }

  return images;
}
