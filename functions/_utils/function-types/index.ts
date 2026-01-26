/**
 * Function types utilities
 *
 * This module provides base utilities and validation helpers for function-specific
 * type modules. These utilities are designed to be used by individual functions
 * that define their own types using gql.tada.
 */

// Export common type aliases for convenience
export type { FunctionRequest, FunctionResponse } from "./base.js";
// Export all base utilities
export * from "./base.js";
// Export validation-specific utilities (avoiding duplicates from base)
export {
  createValidationErrorResponse,
  createValidationMiddleware,
  FunctionTypeError,
  FunctionValidationError,
  isValidImageDataUrl,
  isValidItemType,
  isValidLatitude,
  isValidLongitude,
  validateObjectInput,
  validateOptionalField,
  validateRequiredField,
} from "./validation.js";
