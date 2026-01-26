/**
 * Advanced validation utilities for function types
 *
 * This module provides comprehensive validation utilities that can be used
 * by function-specific type modules for detailed error handling and validation.
 */

import { ITEM_TYPES } from "@cellar-assistant/shared";
import type { NextFunction, Request, Response } from "express";
import type { FunctionResponse } from "./base.js";
import { isValidNumber } from "./base.js";

// =============================================================================
// Validation Error Classes
// =============================================================================

/**
 * Specific validation error for function input fields
 */
export class FunctionValidationError extends Error {
  constructor(
    public functionName: string,
    public field: string,
    public reason: string,
    public receivedValue?: unknown,
  ) {
    super(`[${functionName}] Invalid ${field}: ${reason}`);
    this.name = "FunctionValidationError";
  }
}

/**
 * Type validation error for function inputs
 */
export class FunctionTypeError extends Error {
  constructor(
    public functionName: string,
    public expectedType: string,
    public receivedType: string,
  ) {
    super(
      `[${functionName}] Expected ${expectedType}, received ${receivedType}`,
    );
    this.name = "FunctionTypeError";
  }
}

// =============================================================================
// Validation Helper Functions
// =============================================================================

/**
 * Validates that a value is a valid item type
 * Uses the shared ITEM_TYPES constant as single source of truth
 */
export function isValidItemType(value: string): boolean {
  return (ITEM_TYPES as readonly string[]).includes(value);
}

/**
 * Validates that a string is a valid base64 image data URL
 */
export function isValidImageDataUrl(value: string): boolean {
  return value.startsWith("data:image/") && value.includes("base64,");
}

/**
 * Validates geographic coordinates (latitude)
 */
export function isValidLatitude(value: unknown): value is number {
  return isValidNumber(value) && value >= -90 && value <= 90;
}

/**
 * Validates geographic coordinates (longitude)
 */
export function isValidLongitude(value: unknown): value is number {
  return isValidNumber(value) && value >= -180 && value <= 180;
}

// =============================================================================
// Advanced Validation Utilities
// =============================================================================

/**
 * Creates a validation middleware for Express routes
 *
 * @template T - The expected input type
 * @param validator - Function to validate the input
 * @param functionName - Name of the function for error messages
 * @returns Express middleware function
 */
export function createValidationMiddleware<T>(
  validator: (value: unknown) => T,
  _functionName: string,
) {
  return (
    req: Request & { validatedInput?: T },
    res: Response,
    next: NextFunction,
  ) => {
    try {
      req.validatedInput = validator(req.body);
      next();
    } catch (error) {
      if (
        error instanceof FunctionValidationError ||
        error instanceof FunctionTypeError
      ) {
        return res.status(400).json({
          success: false,
          error: error.message,
          field: "field" in error ? error.field : undefined,
          receivedValue:
            "receivedValue" in error ? error.receivedValue : undefined,
        });
      }

      return res.status(500).json({
        success: false,
        error: "Internal validation error",
      });
    }
  };
}

/**
 * Creates a standardized error response from validation errors
 *
 * @param error - The error to convert to a response
 * @returns A standardized error response
 */
export function createValidationErrorResponse(
  error: unknown,
): FunctionResponse<never> {
  if (error instanceof FunctionValidationError) {
    return {
      success: false,
      error: `Validation failed for ${error.field}: ${error.reason}`,
    };
  }

  if (error instanceof FunctionTypeError) {
    return {
      success: false,
      error: `Type validation failed: ${error.message}`,
    };
  }

  return {
    success: false,
    error: "Unknown validation error",
  };
}

/**
 * Validates that an object has the expected structure
 *
 * @param value - The value to validate
 * @param functionName - Name of the function for error messages
 * @returns The value as a Record if valid
 * @throws FunctionTypeError if not an object
 */
export function validateObjectInput(
  value: unknown,
  functionName: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new FunctionTypeError(functionName, "object", typeof value);
  }
  return value as Record<string, unknown>;
}

/**
 * Validates a required field in an object
 *
 * @template T - The expected field type
 * @param input - The input object
 * @param fieldName - The name of the field
 * @param validator - Type guard to validate the field
 * @param functionName - Name of the function for error messages
 * @returns The validated field value
 * @throws FunctionValidationError if field is invalid
 */
export function validateRequiredField<T>(
  input: Record<string, unknown>,
  fieldName: string,
  validator: (value: unknown) => value is T,
  functionName: string,
): T {
  const value = input[fieldName];
  if (!validator(value)) {
    throw new FunctionValidationError(
      functionName,
      fieldName,
      "is required and must be valid",
      value,
    );
  }
  return value;
}

/**
 * Validates an optional field in an object
 *
 * @template T - The expected field type
 * @param input - The input object
 * @param fieldName - The name of the field
 * @param validator - Type guard to validate the field
 * @param functionName - Name of the function for error messages
 * @returns The validated field value or undefined
 * @throws FunctionValidationError if field is present but invalid
 */
export function validateOptionalField<T>(
  input: Record<string, unknown>,
  fieldName: string,
  validator: (value: unknown) => value is T,
  functionName: string,
): T | undefined {
  const value = input[fieldName];
  if (value === undefined) {
    return undefined;
  }
  if (!validator(value)) {
    throw new FunctionValidationError(
      functionName,
      fieldName,
      "must be valid if provided",
      value,
    );
  }
  return value;
}
