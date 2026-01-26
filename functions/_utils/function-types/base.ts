/**
 * Base function type utilities and interfaces
 *
 * This module provides common interfaces and utilities that are shared across
 * all Nhost serverless functions. These types are framework-agnostic and provide
 * standardized patterns for function input/output handling.
 */

// =============================================================================
// Common Function Interfaces
// =============================================================================

/**
 * Standard function response wrapper for success/error handling
 *
 * @template T - The type of data returned on success
 */
export interface FunctionResponse<T = unknown> {
  /** Whether the function executed successfully */
  success: boolean;
  /** The response data (only present on success) */
  data?: T;
  /** Error message (only present on failure) */
  error?: string;
  /** Additional informational message */
  message?: string;
}

/**
 * Standard function request with session variables
 *
 * @template T - The type of input data expected
 */
export interface FunctionRequest<T = unknown> {
  /** The input data for the function */
  input?: T;
  /** Hasura session variables passed from authentication */
  session_variables?: {
    "x-hasura-user-id"?: string;
    "x-hasura-role"?: string;
    [key: string]: string | undefined;
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Creates a standardized function response
 *
 * @template T - The type of data being returned
 * @param success - Whether the operation was successful
 * @param data - The response data (optional)
 * @param error - Error message (optional)
 * @param message - Additional message (optional)
 * @returns A standardized function response
 */
export function createFunctionResponse<T>(
  success: boolean,
  data?: T,
  error?: string,
  message?: string,
): FunctionResponse<T> {
  return {
    success,
    ...(data !== undefined && { data }),
    ...(error && { error }),
    ...(message && { message }),
  };
}

/**
 * Validates function input and throws descriptive errors
 *
 * @template T - The expected input type
 * @param input - The input to validate
 * @param validator - Type guard function to validate the input
 * @param functionName - Name of the function for error messages
 * @returns The validated input with correct typing
 * @throws Error if validation fails
 */
export function validateFunctionInput<T>(
  input: unknown,
  validator: (value: unknown) => value is T,
  functionName: string,
): T {
  if (!validator(input)) {
    throw new Error(
      `Invalid input for function ${functionName}. Input validation failed.`,
    );
  }
  return input;
}

/**
 * Creates a standardized success response
 *
 * @template T - The type of data being returned
 * @param data - The response data
 * @param message - Optional success message
 * @returns A standardized success response
 */
export function createSuccessResponse<T>(
  data: T,
  message?: string,
): FunctionResponse<T> {
  return createFunctionResponse(true, data, undefined, message);
}

/**
 * Creates a standardized error response
 *
 * @param error - The error message
 * @param message - Optional additional message
 * @returns A standardized error response
 */
export function createErrorResponse(
  error: string,
  message?: string,
): FunctionResponse<undefined> {
  return createFunctionResponse(false, undefined, error, message);
}

// =============================================================================
// Type Guards and Helpers
// =============================================================================

/**
 * Type guard to check if a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Type guard to check if a value is a string or undefined
 */
export function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

/**
 * Type guard to check if a value is a valid number
 */
export function isValidNumber(value: unknown): value is number {
  return (
    typeof value === "number" && !Number.isNaN(value) && Number.isFinite(value)
  );
}

/**
 * Type guard to check if a value is a positive number
 */
export function isPositiveNumber(value: unknown): value is number {
  return isValidNumber(value) && value > 0;
}

/**
 * Type guard to check if a value is an array of strings
 */
export function isValidStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/**
 * Type guard to check if a value is a valid UUID
 */
export function isValidUUID(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}
