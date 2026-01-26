import type { Request, Response } from "express";
import { isNotNil } from "ramda";
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
import { createAIProvider } from "../_utils/ai-providers/factory";
import { dataUrlToImageBuffer } from "../_utils/index.js";
import {
  type VectorInput,
  type VectorOutput,
  validateVectorInput,
} from "./_types.js";

const { NHOST_WEBHOOK_SECRET } = process.env;

// Get shared configuration
const CONFIG = getConfig();

export default async function getVectorForString(
  req: Request<Record<string, never>, Record<string, never>, VectorInput>,
  res: Response,
) {
  try {
    if (req.method === "GET") return res.status(200).send();
    if (req.method !== "POST") return res.status(405).send();

    // Validate webhook secret
    const receivedSecret = req.headers["nhost-webhook-secret"];
    const expectedSecret = NHOST_WEBHOOK_SECRET;

    if (receivedSecret !== expectedSecret) {
      return res.status(400).send();
    }

    const validatedInput = validateVectorInput(req.body);
    const performanceTracker =
      createPerformanceTracker<ExtendedPerformanceMetrics>();

    const {
      input: { text, image },
      session_variables,
    } = validatedInput;

    const userId = session_variables?.["x-hasura-user-id"];
    const inputType = isNotNil(text) ? "text" : "image";

    const result = await executeWithRetry(
      () => processVectorGeneration(text, image, inputType, performanceTracker),
      {
        retryConfig: {
          maxRetries: CONFIG.RETRY.MAX_RETRIES,
          baseDelayMs: CONFIG.RETRY.BASE_DELAY_MS,
          maxDelayMs: CONFIG.RETRY.MAX_DELAY_MS,
          jitterFactor: CONFIG.RETRY.JITTER_FACTOR,
        },
        operationName: `${inputType} vector generation`,
        context: { inputType, userId, hasContent: true },
      },
    );

    // Log performance metrics
    const metrics = performanceTracker.getMetrics();
    logPerformanceMetrics(
      metrics,
      { inputType, userId },
      {
        functionName: "getVectorForString",
        sampleRate: CONFIG.PERFORMANCE.LOG_METRICS_SAMPLE_RATE,
        slowOperationThresholdMs: CONFIG.PERFORMANCE.LOG_SLOW_OPERATIONS_MS,
      },
    );

    return res.status(200).json(result.vector);
  } catch (exception) {
    // Extract context for error logging
    let errorContext: Record<string, unknown> = {};
    try {
      const context = validateVectorInput(req.body);
      errorContext = {
        inputType: isNotNil(context.input.text) ? "text" : "image",
        hasText: isNotNil(context.input.text),
        hasImage: isNotNil(context.input.image),
        userId: context.session_variables?.["x-hasura-user-id"],
      };
    } catch {
      errorContext = {
        hasInput: !!req.body?.input,
        hasSessionVars: !!req.body?.session_variables,
      };
    }

    logError(exception, errorContext, "getVectorForString");

    const errorResponse = createErrorResponse(
      exception,
      "getVectorForString",
      process.env.NODE_ENV === "development",
    );

    return res.status(errorResponse.statusCode).json(errorResponse);
  }
}

async function processVectorGeneration(
  text: string | undefined,
  image: string | undefined,
  inputType: string,
  performanceTracker: ReturnType<
    typeof createPerformanceTracker<ExtendedPerformanceMetrics>
  >,
): Promise<VectorOutput> {
  // Get the AI provider with performance tracking
  const endProviderTimer = performanceTracker.startTimer("externalApiDuration");
  const aiProvider = await createAIProvider();
  endProviderTimer();

  let result: number[];

  if (inputType === "text" && isNotNil(text)) {
    const endEmbeddingTimer = performanceTracker.startTimer(
      "externalApiDuration",
    );
    const response = await aiProvider.generateEmbeddings?.({
      content: text,
      type: "text",
    });
    endEmbeddingTimer();

    if (!response?.embeddings) {
      throw new DatabaseError("Failed to generate text embeddings");
    }

    result = response.embeddings;
  } else if (inputType === "image" && isNotNil(image)) {
    // Convert data URL to buffer with performance tracking
    const endConversionTimer =
      performanceTracker.startTimer("validationDuration");
    const imageBuffer = dataUrlToImageBuffer(image);
    endConversionTimer();

    if (!imageBuffer) {
      throw new ValidationError("Invalid image data URL provided");
    }

    const endEmbeddingTimer = performanceTracker.startTimer(
      "externalApiDuration",
    );
    const response = await aiProvider.generateEmbeddings?.({
      content: imageBuffer,
      type: "image",
    });
    endEmbeddingTimer();

    if (!response?.embeddings) {
      throw new DatabaseError("Failed to generate image embeddings");
    }

    result = response.embeddings;
  } else {
    throw new ValidationError(
      "Invalid input: neither valid text nor image provided",
    );
  }

  if (!result || result.length === 0) {
    throw new DatabaseError("Generated vector is empty or invalid");
  }

  return { success: true, vector: result };
}
