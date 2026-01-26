/**
 * Shared error classes and handling utilities for serverless functions
 * Provides consistent error categorization and HTTP status code mapping
 */

/**
 * Base error class with enhanced context
 */
export abstract class FunctionError extends Error {
  public readonly statusCode: number;
  public readonly category: string;
  public readonly isRetryable: boolean;
  public readonly context: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    category: string,
    isRetryable = false,
    context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.category = category;
    this.isRetryable = isRetryable;
    this.context = context;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Validation errors - client-side issues, not retryable
 */
export class ValidationError extends FunctionError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, 400, "validation", false, context);
  }
}

/**
 * Authentication errors - missing or invalid credentials
 */
export class AuthenticationError extends FunctionError {
  constructor(
    message: string = "Authentication required",
    context: Record<string, unknown> = {},
  ) {
    super(message, 401, "authentication", false, context);
  }
}

/**
 * Authorization errors - insufficient permissions
 */
export class AuthorizationError extends FunctionError {
  constructor(
    message: string = "Insufficient permissions",
    context: Record<string, unknown> = {},
  ) {
    super(message, 403, "authorization", false, context);
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends FunctionError {
  constructor(
    resource: string,
    id?: string,
    context: Record<string, unknown> = {},
  ) {
    const message = id
      ? `${resource} with id '${id}' not found`
      : `${resource} not found`;
    super(message, 404, "not_found", false, { resource, id, ...context });
  }
}

/**
 * Database operation errors - potentially retryable
 */
export class DatabaseError extends FunctionError {
  constructor(
    message: string,
    isRetryable = true,
    context: Record<string, unknown> = {},
  ) {
    super(message, 500, "database", isRetryable, context);
  }
}

/**
 * AI/ML service errors - potentially retryable
 */
export class AIAnalysisError extends FunctionError {
  constructor(
    message: string,
    isRetryable = true,
    context: Record<string, unknown> = {},
  ) {
    super(message, 502, "ai_analysis", isRetryable, context);
  }
}

/**
 * External service errors - potentially retryable
 */
export class ExternalServiceError extends FunctionError {
  constructor(
    service: string,
    message: string,
    isRetryable = true,
    context: Record<string, unknown> = {},
  ) {
    super(`${service}: ${message}`, 503, "external_service", isRetryable, {
      service,
      ...context,
    });
  }
}

/**
 * Rate limiting errors - retryable with backoff
 */
export class RateLimitError extends FunctionError {
  public readonly retryAfterSeconds?: number;

  constructor(
    message: string = "Rate limit exceeded",
    retryAfterSeconds?: number,
    context: Record<string, unknown> = {},
  ) {
    super(message, 429, "rate_limit", true, { retryAfterSeconds, ...context });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * File processing errors
 */
export class FileProcessingError extends FunctionError {
  constructor(
    operation: string,
    fileName?: string,
    isRetryable = false,
    context: Record<string, unknown> = {},
  ) {
    const message = fileName
      ? `File processing failed for '${fileName}': ${operation}`
      : `File processing failed: ${operation}`;
    super(message, 422, "file_processing", isRetryable, {
      operation,
      fileName,
      ...context,
    });
  }
}

/**
 * Timeout errors - retryable
 */
export class TimeoutError extends FunctionError {
  constructor(
    operation: string,
    timeoutMs: number,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      408,
      "timeout",
      true,
      { operation, timeoutMs, ...context },
    );
  }
}

/**
 * Determine if an error is retryable based on its type and characteristics
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof FunctionError) {
    return error.isRetryable;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("503") ||
      message.includes("502") ||
      message.includes("temporarily unavailable") ||
      message.includes("econnreset") ||
      message.includes("enotfound")
    );
  }

  return false;
}

/**
 * Get appropriate HTTP status code for an error
 */
export function getErrorStatusCode(error: unknown): number {
  if (error instanceof FunctionError) {
    return error.statusCode;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("unauthorized")) return 401;
    if (message.includes("forbidden")) return 403;
    if (message.includes("not found")) return 404;
    if (message.includes("timeout")) return 408;
    if (message.includes("rate limit")) return 429;
  }

  return 500;
}

/**
 * Enhanced error logging with structured context
 */
export function logError(
  error: unknown,
  context: Record<string, unknown> = {},
  functionName = "function",
): void {
  const errorInfo: Record<string, unknown> = {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    statusCode: getErrorStatusCode(error),
    isRetryable: isRetryableError(error),
    functionName,
    ...context,
  };

  if (error instanceof FunctionError) {
    errorInfo.category = error.category;
    errorInfo.context = error.context;
  }

  if (error instanceof Error && error.stack) {
    errorInfo.stack = error.stack;
  }

  // Log as error for non-client errors, warn for client errors
  const statusCode = getErrorStatusCode(error);
  if (statusCode >= 500) {
    console.error(`Server error in ${functionName}:`, errorInfo);
  } else if (statusCode >= 400) {
    console.warn(`Client error in ${functionName}:`, errorInfo);
  } else {
    console.info(`Info in ${functionName}:`, errorInfo);
  }
}

/**
 * Create standardized error response for API functions
 */
export function createErrorResponse(
  error: unknown,
  functionName = "function",
  includeStack = false,
): {
  error: string;
  message: string;
  statusCode: number;
  category?: string;
  context?: Record<string, unknown>;
  stack?: string;
} {
  const statusCode = getErrorStatusCode(error);
  const response = {
    error: `Failed to execute ${functionName}`,
    message: error instanceof Error ? error.message : "Unknown error",
    statusCode,
  };

  if (error instanceof FunctionError) {
    Object.assign(response, {
      category: error.category,
      context: error.context,
    });
  }

  if (includeStack && error instanceof Error && error.stack) {
    Object.assign(response, { stack: error.stack });
  }

  return response;
}
