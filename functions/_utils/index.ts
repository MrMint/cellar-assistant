import { createServerClient, type NhostClient } from "@nhost/nhost-js";
import FormData from "form-data";

export const isFulfilled = <T>(
  p: PromiseSettledResult<T>,
): p is PromiseFulfilledResult<T> => p.status === "fulfilled";

export const isRejected = <T>(
  p: PromiseSettledResult<T>,
): p is PromiseRejectedResult => p.status === "rejected";

// Inspired from https://github.com/microsoft/TypeScript/issues/30611#issuecomment-570773496
export function getEnumKeys<
  T extends string,
  TEnumValue extends string | number,
>(enumVariable: { [key in T]: TEnumValue }) {
  return Object.keys(enumVariable) as Array<T>;
}

export function getEnumValues<
  T extends string,
  TEnumValue extends string | number,
>(enumVariable: { [key in T]: TEnumValue }) {
  return Object.values(enumVariable) as Array<T>;
}

export function dataUrlToImageBuffer(dataUrl: string) {
  const arr = dataUrl.split(",");
  if (arr.length < 2) {
    return undefined;
  }

  return Buffer.from(arr[1], "base64");
}

export function dataUrlToFormData(
  dataUrl: string,
  filename: string,
): FormData | undefined {
  const arr = dataUrl.split(",");
  if (arr.length < 2) {
    return undefined;
  }
  if (arr[0].length > 50) {
    // This should just be the header before the base64 encoded data
    return undefined;
  }
  const mimeArr = arr[0].match(/:(.*?);/);
  if (!mimeArr || mimeArr.length < 2) {
    return undefined;
  }
  const mime = mimeArr[1];
  const buff = Buffer.from(arr[1], "base64");
  const data = new FormData();

  data.append("file[]", buff, {
    filename: `${filename}.${mime.split("/")[1]}`,
    contentType: mime,
  });
  return data;
}

export const toDataUrl = async (response: Response) => {
  const contentType = response.headers.get("Content-Type");
  const blob = await response.arrayBuffer();
  return `data:${contentType};base64,${Buffer.from(blob).toString("base64")}`;
};

/**
 * Create admin auth headers for storage operations
 */
function createAdminHeaders(): Record<string, string> {
  const adminSecret = process.env.NHOST_ADMIN_SECRET;
  if (!adminSecret) {
    throw new Error(
      "NHOST_ADMIN_SECRET environment variable is required for storage operations",
    );
  }
  return { "x-hasura-admin-secret": adminSecret };
}

/**
 * Get presigned URL with admin authentication
 */
export async function getFilePresignedURLWithAuth(
  client: NhostClient,
  fileId: string,
) {
  return client.storage.getFilePresignedURL(fileId, {
    headers: createAdminHeaders(),
  });
}

/**
 * Create a consistent Nhost client for functions
 */
export function createFunctionNhostClient(): NhostClient {
  const subdomain = process.env.NHOST_SUBDOMAIN;
  const region = process.env.NHOST_REGION;

  if (!subdomain) {
    throw new Error("NHOST_SUBDOMAIN environment variable is required");
  }

  return createServerClient({
    subdomain,
    region: region || undefined,
    // Functions don't need cookie-based session storage
    storage: {
      get: () => null,
      set: () => {},
      remove: () => {},
    },
  });
}

// Explicitly export config functions to fix Docker module resolution issue
export {
  AI_CONFIG,
  type AIConfig,
  BASE_CONFIG,
  type BaseConfig,
  EXTENDED_CONFIG,
  type ExtendedConfig,
  getConfig,
  getEnvironmentConfig,
  isValidItemType,
  type PerformanceConfig,
  type RetryConfig,
  VALID_ITEM_TYPES,
  type ValidationConfig,
  type ValidItemType,
} from "./config";
// Explicitly export error classes to fix Docker module resolution issue
export {
  AIAnalysisError,
  AuthenticationError,
  AuthorizationError,
  createErrorResponse,
  DatabaseError,
  ExternalServiceError,
  FileProcessingError,
  FunctionError,
  getErrorStatusCode,
  isRetryableError,
  logError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from "./errors";
// Export function types utilities
export * from "./function-types";
// Explicitly export performance classes to fix Docker module resolution issue
export {
  type AIPerformanceMetrics,
  type BasePerformanceMetrics,
  createAIPerformanceTracker,
  createPerformanceTracker,
  type ExtendedPerformanceMetrics,
  logPerformanceMetrics,
  type PerformanceLoggerConfig,
  type PerformanceTracker,
} from "./performance";
// Explicitly export retry classes to fix Docker module resolution issue
export {
  type CacheEntry,
  CircuitBreaker,
  type CircuitBreakerConfig,
  CircuitBreakerState,
  executeParallelWithRetry,
  executeWithRetry,
  getCircuitBreaker,
  ResilientCache,
  type RetryOptions,
} from "./retry";
// Explicitly export urql-client functions to fix Docker module resolution issue
export {
  functionMutation,
  functionQuery,
  functionRawGraphQL,
  getAdminAuthHeaders,
  getFunctionAuthHeaders,
  getFunctionClient,
} from "./urql-client";
// Explicitly export validation functions to fix Docker module resolution issue
export {
  COMMON_VALIDATION_SCHEMAS,
  sanitizeString,
  type ValidationSchema,
  validateAndSanitizeObject,
  validateArray,
  validateBarcode,
  validateEmail,
  validateFileId,
  validateItemType,
  validateNumericRange,
  validateRequiredFields,
  validateStringLength,
  validateUrl,
  validateUserId,
} from "./validation";
