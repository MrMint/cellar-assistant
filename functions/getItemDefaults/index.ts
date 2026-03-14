import { graphql } from "@cellar-assistant/shared/gql/graphql";
import type { Request, Response } from "express";
import { isNotNil } from "ramda";
import {
  createAIPerformanceTracker,
  createErrorResponse,
  createFunctionNhostClient,
  executeWithRetry,
  functionMutation,
  getAdminAuthHeaders,
  getConfig,
  logError,
  logPerformanceMetrics,
  ValidationError,
  validateBarcode,
  validateFileId,
  validateItemType,
  validateUserId,
} from "../_utils";
import { createAIProvider } from "../_utils/ai-providers/factory";
import { processBrandFromAIDefaults } from "./_brand";
import { analyzeItemImages, fetchLabelImages } from "./_analyze";
import { getSchemaForItemType } from "./_schemas";
import type {
  FinalizeResultsParams,
  GetItemDefaultsRequest,
  GetItemDefaultsResult,
  ProcessingContext,
  SaveOnboardingParams,
} from "./_types";
import {
  calculateConfidence,
  getAllEnumValues,
  type ItemType,
  mapValidatedDataToReturnType,
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
    fetchLabelImages(nhostClient, frontLabelFileId, backLabelFileId),
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

  const { aiDefaults, modelUsed } = await analyzeItemImages({
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
    modelUsed,
    itemType: context.itemType,
    enumValues,
    schema,
    barcode: context.barcode,
    barcodeType: context.barcodeType,
    context,
    performanceTracker,
  });

  return results;
}

// FinalizeResultsParams is now imported from ./types.ts

async function finalizeResults({
  aiDefaults,
  modelUsed,
  itemType,
  enumValues,
  schema,
  barcode,
  barcodeType,
  context,
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

  // Process brand from AI-extracted data
  const endBrandTimer = performanceTracker.startTimer("dbOperationDuration");
  const brandResult = await processBrandFromAIDefaults(
    aiDefaults,
    itemType as ItemType,
  );
  endBrandTimer();

  if (brandResult) {
    (results as GetItemDefaultsResult & { brand_id: string }).brand_id =
      brandResult.id;
    (results as GetItemDefaultsResult & { brand_name: string }).brand_name =
      brandResult.name;
    (
      results as GetItemDefaultsResult & { is_new_brand: boolean }
    ).is_new_brand = brandResult.isNew;
  }

  // Save to database
  const endDbTimer = performanceTracker.startTimer("dbOperationDuration");
  const onboardingResult = await saveOnboardingData({
    context,
    aiDefaults,
    results,
    aiModel: modelUsed,
    confidence,
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
  aiModel,
  confidence,
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
        ai_model: aiModel,
        confidence,
      },
    },
    { headers: getAdminAuthHeaders() },
  );

  console.log("Successfully saved onboarding data", {
    id: addOnboardingResult.insert_item_onboardings_one?.id,
    userId: context.userId,
    itemType: context.itemType,
    aiModel,
    confidence,
  });

  return {
    id: addOnboardingResult.insert_item_onboardings_one?.id || "",
  };
}
