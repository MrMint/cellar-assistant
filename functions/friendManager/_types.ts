/**
 * Function-specific types for friendManager
 *
 * This module defines all types related to friend management using gql.tada
 * utilities to extract types directly from GraphQL operations.
 */

import type { FriendRequestRow } from "@cellar-assistant/shared";
import {
  graphql,
  type ResultOf,
  type VariablesOf,
} from "@cellar-assistant/shared/gql/graphql";
import {
  isNonEmptyString,
  isValidUUID,
  validateObjectInput,
  validateOptionalField,
  validateRequiredField,
} from "../_utils/function-types";

// =============================================================================
// GraphQL Operation Definitions
// =============================================================================

/**
 * GraphQL operations for friend management
 */
export const INSERT_FRIENDS_AND_DELETE_REQUEST_MUTATION = graphql(`
  mutation InsertFriends(
    $friends: [friends_insert_input!]!
    $requestId: uuid!
  ) {
    insert_friends(objects: $friends) {
      affected_rows
      returning {
        user_id
        friend_id
        created_at
      }
    }

    delete_friend_requests_by_pk(id: $requestId) {
      id
      user_id
      friend_id
      status
    }
  }
`);

// =============================================================================
// Extracted Types
// =============================================================================

/**
 * Input types for friend management operations
 */
export type InsertFriendsAndDeleteRequestInput = VariablesOf<
  typeof INSERT_FRIENDS_AND_DELETE_REQUEST_MUTATION
>;

/**
 * Output types for friend management operations
 */
export type InsertFriendsAndDeleteRequestOutput = ResultOf<
  typeof INSERT_FRIENDS_AND_DELETE_REQUEST_MUTATION
>;

// =============================================================================
// Function-specific Types
// =============================================================================

/**
 * Valid friend request status values
 */
export type FriendStatus = "PENDING" | "ACCEPTED" | "DECLINED";

/**
 * Friend request row with status
 */
export interface FriendRequestWithStatus extends FriendRequestRow {
  status: FriendStatus;
}

/**
 * Friend manager webhook input structure
 */
export interface FriendManagerInput {
  event: {
    data: {
      new: FriendRequestWithStatus;
      old?: FriendRequestWithStatus;
    };
  };
  session_variables: Record<string, string>;
}

/**
 * Friend management context
 */
export interface FriendManagerContext {
  requestId: string;
  userId: string;
  friendId: string;
  newStatus: FriendStatus;
  oldStatus?: FriendStatus;
  [key: string]: unknown;
}

/**
 * Friend acceptance processing result
 */
export interface FriendAcceptanceResult {
  success: boolean;
  action: string;
  friendshipsCreated?: number;
  requestsDeleted?: number;
}

/**
 * Friend manager operation result
 */
export interface FriendManagerResult {
  success: boolean;
  action?: string;
  message?: string;
}

/**
 * Friend insertion data
 */
export interface FriendInsertData {
  user_id: string;
  friend_id: string;
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to check if a value is a valid friend status
 */
export function isValidFriendStatus(value: unknown): value is FriendStatus {
  return (
    typeof value === "string" &&
    ["PENDING", "ACCEPTED", "DECLINED"].includes(value)
  );
}

/**
 * Type guard to check if a value matches FriendManagerInput
 */
export function isFriendManagerInput(
  value: unknown,
): value is FriendManagerInput {
  if (typeof value !== "object" || value === null) return false;

  const input = value as Record<string, unknown>;

  return (
    input.event !== undefined &&
    typeof input.event === "object" &&
    input.event !== null &&
    "data" in input.event &&
    typeof input.event.data === "object" &&
    input.event.data !== null &&
    "new" in input.event.data &&
    typeof input.event.data.new === "object" &&
    input.event.data.new !== null
  );
}

/**
 * Enhanced validation for FriendManagerInput with detailed error messages
 */
export function validateFriendManagerInput(value: unknown): FriendManagerInput {
  const input = validateObjectInput(value, "friendManager");

  // Validate event structure
  const event = validateRequiredField(
    input,
    "event",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "friendManager",
  );

  // Validate event.data
  const data = validateRequiredField(
    event,
    "data",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "friendManager",
  );

  // Validate event.data.new
  const newRequest = validateRequiredField(
    data,
    "new",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "friendManager",
  );

  // Validate required fields in the new request
  const _id = validateRequiredField(
    newRequest,
    "id",
    (value: unknown): value is string => {
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "friendManager",
  );

  const _user_id = validateRequiredField(
    newRequest,
    "user_id",
    (value: unknown): value is string => {
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "friendManager",
  );

  const _friend_id = validateRequiredField(
    newRequest,
    "friend_id",
    (value: unknown): value is string => {
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "friendManager",
  );

  const _status = validateRequiredField(
    newRequest,
    "status",
    isValidFriendStatus,
    "friendManager",
  );

  // Validate optional old data
  const _old = validateOptionalField(
    data,
    "old",
    (value: unknown): value is Record<string, unknown> | undefined => {
      if (value === undefined) return true;
      if (typeof value !== "object" || value === null) return false;

      const oldRequest = value as Record<string, unknown>;
      // If old status exists, validate it
      if (oldRequest.status !== undefined) {
        return isValidFriendStatus(oldRequest.status);
      }
      return true;
    },
    "friendManager",
  );

  // Validate session_variables
  const _session_variables =
    validateOptionalField(
      input,
      "session_variables",
      (value: unknown): value is Record<string, string> | undefined => {
        if (value === undefined) return true;
        return typeof value === "object" && value !== null;
      },
      "friendManager",
    ) ?? {};

  return value as FriendManagerInput;
}

/**
 * Creates friend management context from input data
 */
export function createFriendManagerContext(
  input: FriendManagerInput,
): FriendManagerContext {
  return {
    requestId: input.event.data.new.id,
    userId: input.event.data.new.user_id,
    friendId: input.event.data.new.friend_id,
    newStatus: input.event.data.new.status,
    oldStatus: input.event.data.old?.status,
  };
}

/**
 * Validates friend request with status
 */
export function validateFriendRequestWithStatus(
  value: unknown,
): FriendRequestWithStatus {
  const input = validateObjectInput(value, "friendRequestWithStatus");

  const id = validateRequiredField(
    input,
    "id",
    isNonEmptyString,
    "friendRequestWithStatus",
  );
  const user_id = validateRequiredField(
    input,
    "user_id",
    (value: unknown): value is string =>
      isNonEmptyString(value) && isValidUUID(value),
    "friendRequestWithStatus",
  );
  const friend_id = validateRequiredField(
    input,
    "friend_id",
    (value: unknown): value is string =>
      isNonEmptyString(value) && isValidUUID(value),
    "friendRequestWithStatus",
  );
  const status = validateRequiredField(
    input,
    "status",
    isValidFriendStatus,
    "friendRequestWithStatus",
  );

  return {
    id,
    user_id,
    friend_id,
    status,
  } as FriendRequestWithStatus;
}

/**
 * Creates friend insertion data
 */
export function createFriendInsertData(
  userId: string,
  friendId: string,
): FriendInsertData[] {
  return [
    { user_id: userId, friend_id: friendId },
    { user_id: friendId, friend_id: userId },
  ];
}

/**
 * Validates friend acceptance result
 */
export function validateFriendAcceptanceResult(
  affectedRows: number,
  deletedRequests: number,
): FriendAcceptanceResult {
  return {
    success: true,
    action: "friend_request_accepted",
    friendshipsCreated: affectedRows,
    requestsDeleted: deletedRequests,
  };
}

/**
 * Determines if a status transition should trigger processing
 */
export function shouldProcessStatusTransition(
  oldStatus?: FriendStatus,
  newStatus?: FriendStatus,
): boolean {
  return oldStatus === "PENDING" && newStatus === "ACCEPTED";
}

// =============================================================================
// Re-exports for Convenience
// =============================================================================

// Type-only re-exports
export type {
  FunctionResponse,
  FunctionValidationError,
} from "../_utils/function-types";
// Re-export common utilities for easy access
export {
  createFunctionResponse,
  validateFunctionInput,
} from "../_utils/function-types";
