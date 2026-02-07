import type { Request, Response } from "express";
import {
  createErrorResponse,
  createPerformanceTracker,
  type ExtendedPerformanceMetrics,
  executeWithRetry,
  getConfig,
  logError,
  logPerformanceMetrics,
} from "../_utils";
import {
  type MenuScanCompleteInput,
  validateMenuScanCompleteInput,
} from "./_types.js";

const { NHOST_WEBHOOK_SECRET, NHOST_FUNCTIONS_URL } = process.env;

// Get shared configuration
const CONFIG = getConfig();

export default async function onMenuScanComplete(
  req: Request<
    Record<string, never>,
    Record<string, never>,
    MenuScanCompleteInput
  >,
  res: Response,
) {
  try {
    if (req.method === "GET") return res.status(200).send();
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }

    const validatedInput = validateMenuScanCompleteInput(req.body);
    const performanceTracker =
      createPerformanceTracker<ExtendedPerformanceMetrics>();

    const {
      event: {
        data: { new: newScan, old: oldScan },
      },
    } = validatedInput;

    console.log(`Processing menu scan completion event for scan ${newScan.id}`);

    // Check that this is actually a transition to "completed" status
    if (
      newScan.processing_status !== "completed" ||
      oldScan.processing_status === "completed"
    ) {
      console.log(
        `Skipping event - not a transition to completed status (old: ${oldScan.processing_status}, new: ${newScan.processing_status})`,
      );
      return res.status(200).json({
        success: true,
        menuScanId: newScan.id as string,
        message: "Event skipped - not a status transition to completed",
      });
    }

    // Extract place_id - could be place_id, estimated_place_id, or manual_place_override
    const placeId =
      (newScan.place_id as string | null) ||
      (newScan.manual_place_override as string | null) ||
      (newScan.estimated_place_id as string | null);

    if (!placeId) {
      console.log(
        `No place_id found for menu scan ${newScan.id}, skipping matching`,
      );
      return res.status(200).json({
        success: true,
        menuScanId: newScan.id as string,
        message: "No place_id available, skipping matching",
      });
    }

    const result = await executeWithRetry(
      () => callMatchMenuItems(placeId, performanceTracker),
      {
        retryConfig: {
          maxRetries: CONFIG.RETRY.MAX_RETRIES,
          baseDelayMs: CONFIG.RETRY.BASE_DELAY_MS,
          maxDelayMs: CONFIG.RETRY.MAX_DELAY_MS,
          jitterFactor: CONFIG.RETRY.JITTER_FACTOR,
        },
        operationName: "menu item matching",
        context: { menuScanId: newScan.id, placeId },
      },
    );

    // Log performance metrics
    const metrics = performanceTracker.getMetrics();
    logPerformanceMetrics(
      metrics,
      { menuScanId: newScan.id, placeId },
      {
        functionName: "onMenuScanComplete",
        sampleRate: CONFIG.PERFORMANCE.LOG_METRICS_SAMPLE_RATE,
        slowOperationThresholdMs: CONFIG.PERFORMANCE.LOG_SLOW_OPERATIONS_MS,
      },
    );

    return res.status(200).json({
      success: true,
      menuScanId: newScan.id as string,
      placeId,
      message: `Successfully processed ${result.itemsProcessed} menu items`,
      matchingResult: result,
    });
  } catch (exception) {
    // Extract context for error logging
    let errorContext: Record<string, unknown> = {};
    try {
      const context = validateMenuScanCompleteInput(req.body);
      errorContext = {
        menuScanId: context.event.data.new.id,
        placeId:
          context.event.data.new.place_id ||
          context.event.data.new.manual_place_override ||
          context.event.data.new.estimated_place_id,
      };
    } catch {
      errorContext = {
        hasEventData: !!req.body?.event?.data,
      };
    }

    logError(exception, errorContext, "onMenuScanComplete");

    const errorResponse = createErrorResponse(
      exception,
      "onMenuScanComplete",
      process.env.NODE_ENV === "development",
    );

    return res.status(errorResponse.statusCode).json(errorResponse);
  }
}

async function callMatchMenuItems(
  placeId: string,
  performanceTracker: ReturnType<
    typeof createPerformanceTracker<ExtendedPerformanceMetrics>
  >,
): Promise<{
  itemsProcessed: number;
  totalMatches: number;
  highConfidenceMatches: number;
}> {
  const endTimer = performanceTracker.startTimer("externalApiDuration");

  // Call the matchMenuItems function with batchProcess=true
  const matchUrl = `${NHOST_FUNCTIONS_URL}/matchMenuItems`;
  console.log(`Calling matchMenuItems for placeId ${placeId} at ${matchUrl}`);

  const response = await fetch(matchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Use admin credentials for internal function call
      "x-hasura-admin-secret": process.env.NHOST_ADMIN_SECRET || "",
    },
    body: JSON.stringify({
      placeId,
      batchProcess: true,
    }),
  });

  endTimer();

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `matchMenuItems failed with status ${response.status}: ${errorText}`,
    );
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(
      `matchMenuItems returned unsuccessful result: ${result.error || "Unknown error"}`,
    );
  }

  console.log(
    `matchMenuItems completed - processed ${result.itemsProcessed} items, found ${result.totalMatches} matches`,
  );

  return {
    itemsProcessed: result.itemsProcessed || 0,
    totalMatches: result.totalMatches || 0,
    highConfidenceMatches: result.highConfidenceMatches || 0,
  };
}
