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
import { functionMutation, getAdminAuthHeaders } from "../_utils/urql-client";
import { insertFriendsAndDeleteRequest } from "./_queries.js";
import type {
  FriendAcceptanceResult,
  FriendManagerInput,
  FriendManagerResult,
} from "./_types";
import {
  createFriendInsertData,
  shouldProcessStatusTransition,
  validateFriendAcceptanceResult,
  validateFriendManagerInput,
} from "./_types";

const { NHOST_WEBHOOK_SECRET } = process.env;

// Get shared configuration
const CONFIG = getConfig();

// Types and validation now imported from ./types.ts

export default async function friendManager(
  req: Request<
    Record<string, never>,
    Record<string, never>,
    FriendManagerInput
  >,
  res: Response,
) {
  try {
    if (req.method === "GET") return res.status(200).send();
    if (req.method !== "POST") return res.status(405).send();
    if (req.headers["nhost-webhook-secret"] !== NHOST_WEBHOOK_SECRET) {
      return res.status(400).send();
    }

    const validatedInput = validateFriendManagerInput(req.body);
    const performanceTracker =
      createPerformanceTracker<ExtendedPerformanceMetrics>();

    const {
      event: {
        data: {
          new: { id, user_id, friend_id, status: newStatus },
          old,
        },
      },
    } = validatedInput;

    const oldStatus = old?.status;
    console.log(
      `Processing friend request ${id}: ${oldStatus || "NEW"} -> ${newStatus}`,
    );

    let result: FriendManagerResult = { success: true };

    // Only process status transitions from PENDING to ACCEPTED
    if (shouldProcessStatusTransition(oldStatus, newStatus)) {
      result = await executeWithRetry(
        () =>
          processFriendAcceptance(id, user_id, friend_id, performanceTracker),
        {
          retryConfig: {
            maxRetries: CONFIG.RETRY.MAX_RETRIES,
            baseDelayMs: CONFIG.RETRY.BASE_DELAY_MS,
            maxDelayMs: CONFIG.RETRY.MAX_DELAY_MS,
            jitterFactor: CONFIG.RETRY.JITTER_FACTOR,
          },
          operationName: "friend acceptance processing",
          context: { requestId: id, userId: user_id, friendId: friend_id },
        },
      );
    } else {
      console.log(
        `No action needed for status transition: ${oldStatus} -> ${newStatus}`,
      );
    }

    // Log performance metrics
    const metrics = performanceTracker.getMetrics();
    logPerformanceMetrics(
      metrics,
      {
        requestId: id,
        userId: user_id,
        friendId: friend_id,
        statusTransition: `${oldStatus}->${newStatus}`,
      },
      {
        functionName: "friendManager",
        sampleRate: CONFIG.PERFORMANCE.LOG_METRICS_SAMPLE_RATE,
        slowOperationThresholdMs: CONFIG.PERFORMANCE.LOG_SLOW_OPERATIONS_MS,
      },
    );

    return res.status(200).json(result);
  } catch (exception) {
    // Extract context for error logging
    let errorContext: Record<string, unknown> = {};
    try {
      const context = validateFriendManagerInput(req.body);
      errorContext = {
        requestId: context.event.data.new.id,
        userId: context.event.data.new.user_id,
        friendId: context.event.data.new.friend_id,
        newStatus: context.event.data.new.status,
        oldStatus: context.event.data.old?.status,
      };
    } catch {
      errorContext = {
        hasEventData: !!req.body?.event?.data,
      };
    }

    logError(exception, errorContext, "friendManager");

    const errorResponse = createErrorResponse(
      exception,
      "friendManager",
      process.env.NODE_ENV === "development",
    );

    return res.status(errorResponse.statusCode).json(errorResponse);
  }
}

async function processFriendAcceptance(
  requestId: string,
  userId: string,
  friendId: string,
  performanceTracker: ReturnType<
    typeof createPerformanceTracker<ExtendedPerformanceMetrics>
  >,
): Promise<FriendAcceptanceResult> {
  // Create bidirectional friendship and delete the request
  const endDbTimer = performanceTracker.startTimer("dbOperationDuration");
  const insertFriendsResult = await functionMutation(
    insertFriendsAndDeleteRequest,
    {
      friends: createFriendInsertData(userId, friendId),
      requestId: requestId,
    },
    { headers: getAdminAuthHeaders() },
  );
  endDbTimer();

  const affectedRows = insertFriendsResult?.insert_friends?.affected_rows ?? 0;
  const deletedRequests = insertFriendsResult?.delete_friend_requests_by_pk?.id
    ? 1
    : 0;

  console.log(
    `Created ${affectedRows} friendship records and deleted ${deletedRequests} friend request(s)`,
  );

  if (affectedRows !== 2) {
    console.warn(`Expected 2 friendship records but created ${affectedRows}`);
  }

  if (deletedRequests !== 1) {
    console.warn(
      `Expected to delete 1 friend request but deleted ${deletedRequests}`,
    );
  }

  return validateFriendAcceptanceResult(affectedRows, deletedRequests);
}
