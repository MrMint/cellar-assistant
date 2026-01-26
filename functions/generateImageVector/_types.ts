/**
 * Function-specific types for generateImageVector
 *
 * This module defines all types related to image vector generation using gql.tada
 * utilities to extract types directly from GraphQL operations.
 */

import type { TableRow, WebhookPayload } from "@cellar-assistant/shared";
import {
  graphql,
  type ResultOf,
  type VariablesOf,
} from "@cellar-assistant/shared/gql/graphql";
import {
  isNonEmptyString,
  isValidUUID,
  validateObjectInput,
  validateRequiredField,
} from "../_utils/function-types";

// =============================================================================
// GraphQL Operation Definitions
// =============================================================================

/**
 * GraphQL operations for image vector generation
 */
const UPDATE_ITEM_IMAGE_MUTATION = graphql(`
  mutation UpdateItemImage($itemId: uuid!, $item: item_image_set_input!) {
    update_item_image_by_pk(pk_columns: { id: $itemId }, _set: $item) {
      id
      vector
      updated_at
    }
  }
`);

// =============================================================================
// Extracted Types
// =============================================================================

/**
 * Input types for image vector operations
 */
export type UpdateItemImageInput = VariablesOf<
  typeof UPDATE_ITEM_IMAGE_MUTATION
>;

/**
 * Output types for image vector operations
 */
export type UpdateItemImageOutput = ResultOf<
  typeof UPDATE_ITEM_IMAGE_MUTATION
>["update_item_image_by_pk"];

// =============================================================================
// Function-specific Types
// =============================================================================

/**
 * Image vector generation request (webhook payload)
 */
export interface ImageVectorRequest
  extends WebhookPayload<TableRow<"item_image">> {
  event: {
    data: {
      new: TableRow<"item_image">;
    };
  };
}

/**
 * Image vector generation context
 */
export interface ImageVectorContext {
  itemImageId: string;
  fileId: string;
  [key: string]: unknown;
}

/**
 * Presigned URL response structure
 * Matches Nhost SDK FetchResponse<PresignedURLResponse>
 */
export interface PresignedUrlResponse {
  body: {
    url: string;
    expiration: number;
  };
  status: number;
  headers: Headers;
}

/**
 * Embedding generation result
 */
export interface EmbeddingResult {
  embeddings: number[];
  dimensions: number;
}

/**
 * Image vector generation result
 */
export interface ImageVectorResult {
  success: boolean;
  itemImageId: string;
  dimensions?: number;
  processingTimeMs?: number;
}

/**
 * Image processing metrics
 */
export interface ImageProcessingMetrics {
  urlGenerationMs: number;
  imageFetchMs: number;
  embeddingGenerationMs: number;
  databaseUpdateMs: number;
  totalProcessingMs: number;
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Type guard to check if a value matches ImageVectorRequest
 */
export function isImageVectorRequest(
  value: unknown,
): value is ImageVectorRequest {
  if (typeof value !== "object" || value === null) return false;

  const payload = value as Record<string, unknown>;

  return (
    payload.event !== undefined &&
    typeof payload.event === "object" &&
    payload.event !== null &&
    "data" in payload.event &&
    typeof payload.event.data === "object" &&
    payload.event.data !== null &&
    "new" in payload.event.data &&
    typeof payload.event.data.new === "object" &&
    payload.event.data.new !== null &&
    "id" in payload.event.data.new &&
    "file_id" in payload.event.data.new
  );
}

/**
 * Enhanced validation for ImageVectorRequest with detailed error messages
 */
export function validateImageVectorRequest(value: unknown): ImageVectorRequest {
  const input = validateObjectInput(value, "generateImageVector");

  // Validate event structure
  const event = validateRequiredField(
    input,
    "event",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "generateImageVector",
  );

  // Validate event.data
  const data = validateRequiredField(
    event,
    "data",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "generateImageVector",
  );

  // Validate event.data.new
  const newItem = validateRequiredField(
    data,
    "new",
    (value: unknown): value is Record<string, unknown> => {
      return typeof value === "object" && value !== null;
    },
    "generateImageVector",
  );

  // Validate required fields in the new item
  const _id = validateRequiredField(
    newItem,
    "id",
    (value: unknown): value is string => {
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "generateImageVector",
  );

  const _file_id = validateRequiredField(
    newItem,
    "file_id",
    (value: unknown): value is string => {
      return isNonEmptyString(value) && isValidUUID(value);
    },
    "generateImageVector",
  );

  return value as ImageVectorRequest;
}

/**
 * Creates processing context from request data
 */
export function createImageVectorContext(
  request: ImageVectorRequest,
): ImageVectorContext {
  return {
    itemImageId: request.event.data.new.id,
    fileId: request.event.data.new.file_id,
  };
}

/**
 * Validates presigned URL response from Nhost SDK FetchResponse<PresignedURLResponse>
 */
export function validatePresignedUrlResponse(
  value: unknown,
): PresignedUrlResponse {
  const input = validateObjectInput(value, "presignedUrlResponse");

  // Validate status
  const status = validateRequiredField(
    input,
    "status",
    (v: unknown): v is number => typeof v === "number",
    "presignedUrlResponse",
  );

  // Validate body
  const body = validateRequiredField(
    input,
    "body",
    (v: unknown): v is { url: string; expiration: number } =>
      typeof v === "object" &&
      v !== null &&
      "url" in v &&
      isNonEmptyString((v as { url: unknown }).url),
    "presignedUrlResponse",
  );

  // Headers might not be fully validated, just check it exists
  const headers = validateRequiredField(
    input,
    "headers",
    (v: unknown): v is Headers => v !== undefined && v !== null,
    "presignedUrlResponse",
  );

  return {
    body: body as { url: string; expiration: number },
    status,
    headers: headers as Headers,
  };
}

/**
 * Validates embedding result
 */
export function validateEmbeddingResult(value: unknown): EmbeddingResult {
  const input = validateObjectInput(value, "embeddingResult");

  const embeddings = validateRequiredField(
    input,
    "embeddings",
    (value: unknown): value is number[] => {
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => typeof item === "number")
      );
    },
    "embeddingResult",
  );

  return {
    embeddings,
    dimensions: embeddings.length,
  };
}

/**
 * Type guard for item_image table row
 */
export function isItemImageRow(
  value: unknown,
): value is TableRow<"item_image"> {
  if (typeof value !== "object" || value === null) return false;

  const item = value as Record<string, unknown>;

  return (
    isNonEmptyString(item.id) &&
    isValidUUID(item.id) &&
    isNonEmptyString(item.file_id) &&
    isValidUUID(item.file_id)
  );
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
