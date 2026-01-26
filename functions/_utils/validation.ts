/**
 * Shared validation utilities for serverless functions
 * Provides consistent input validation with type guards
 */

import { BASE_CONFIG, VALID_ITEM_TYPES, type ValidItemType } from "./config";
import { ValidationError } from "./errors";

/**
 * Validate user ID with type guard
 */
export function validateUserId(userId: unknown): userId is string {
  return (
    typeof userId === "string" &&
    userId.length > 0 &&
    userId.length < BASE_CONFIG.VALIDATION.MAX_USER_ID_LENGTH
  );
}

/**
 * Validate file ID with type guard
 */
export function validateFileId(fileId: unknown): fileId is string {
  return (
    typeof fileId === "string" &&
    fileId.length > 0 &&
    fileId.length < BASE_CONFIG.VALIDATION.MAX_FILE_ID_LENGTH &&
    BASE_CONFIG.VALIDATION.FILE_ID_PATTERN.test(fileId)
  );
}

/**
 * Validate barcode with type guard
 */
export function validateBarcode(barcode: unknown): barcode is string {
  return (
    typeof barcode === "string" &&
    BASE_CONFIG.VALIDATION.BARCODE_PATTERN.test(barcode)
  );
}

/**
 * Validate item type with type guard
 */
export function validateItemType(itemType: unknown): itemType is ValidItemType {
  return (
    typeof itemType === "string" &&
    VALID_ITEM_TYPES.includes(itemType as ValidItemType)
  );
}

/**
 * Validate string length within bounds
 */
export function validateStringLength(
  value: unknown,
  minLength = 0,
  maxLength = BASE_CONFIG.VALIDATION.MAX_NAME_LENGTH,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minLength &&
    value.length <= maxLength
  );
}

/**
 * Validate email format (basic validation)
 */
export function validateEmail(email: unknown): email is string {
  if (typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL format
 */
export function validateUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate numeric value within range
 */
export function validateNumericRange(
  value: unknown,
  min: number = Number.MIN_SAFE_INTEGER,
  max: number = Number.MAX_SAFE_INTEGER,
): value is number {
  return (
    typeof value === "number" &&
    !Number.isNaN(value) &&
    value >= min &&
    value <= max
  );
}

/**
 * Validate array of specific type
 */
export function validateArray<T>(
  value: unknown,
  itemValidator: (item: unknown) => item is T,
  minLength = 0,
  maxLength = 1000,
): value is T[] {
  if (!Array.isArray(value)) return false;
  if (value.length < minLength || value.length > maxLength) return false;
  return value.every(itemValidator);
}

/**
 * Validate required fields are present and not empty
 */
export function validateRequiredFields(
  data: Record<string, unknown>,
  requiredFields: string[],
): void {
  const missingFields = requiredFields.filter((field) => {
    const value = data[field];
    return value === undefined || value === null || value === "";
  });

  if (missingFields.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missingFields.join(", ")}`,
      { missingFields, providedFields: Object.keys(data) },
    );
  }
}

/**
 * Sanitize string input by trimming and limiting length
 */
export function sanitizeString(
  value: unknown,
  maxLength = BASE_CONFIG.VALIDATION.MAX_NAME_LENGTH,
): string {
  if (typeof value !== "string") return "";
  return value.trim().substring(0, maxLength);
}

/**
 * Sanitize and validate request body with schema
 */
export interface ValidationSchema {
  [key: string]: {
    required?: boolean;
    validator: (value: unknown) => boolean;
    sanitizer?: (value: unknown) => unknown;
    errorMessage?: string;
  };
}

export function validateAndSanitizeObject<T extends Record<string, unknown>>(
  data: unknown,
  schema: ValidationSchema,
): T {
  if (typeof data !== "object" || data === null) {
    throw new ValidationError("Invalid input: expected object");
  }

  const input = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [key, rules] of Object.entries(schema)) {
    const value = input[key];

    // Check required fields
    if (rules.required && (value === undefined || value === null)) {
      errors.push(`Field '${key}' is required`);
      continue;
    }

    // Skip validation for optional undefined fields
    if (!rules.required && (value === undefined || value === null)) {
      continue;
    }

    // Apply sanitizer first if provided
    const sanitizedValue = rules.sanitizer ? rules.sanitizer(value) : value;

    // Validate the sanitized value
    if (!rules.validator(sanitizedValue)) {
      const message = rules.errorMessage || `Invalid value for field '${key}'`;
      errors.push(message);
      continue;
    }

    result[key] = sanitizedValue;
  }

  if (errors.length > 0) {
    throw new ValidationError(`Validation failed: ${errors.join(", ")}`, {
      validationErrors: errors,
      input: Object.keys(input),
    });
  }

  return result as T;
}

/**
 * Common validation schemas for reuse
 */
export const COMMON_VALIDATION_SCHEMAS = {
  userId: {
    required: true,
    validator: validateUserId,
    errorMessage: "Invalid user ID format",
  },
  fileId: {
    required: false,
    validator: validateFileId,
    errorMessage: "Invalid file ID format",
  },
  itemType: {
    required: true,
    validator: validateItemType,
    errorMessage: `Invalid item type. Must be one of: ${VALID_ITEM_TYPES.join(", ")}`,
  },
  barcode: {
    required: false,
    validator: validateBarcode,
    errorMessage: "Invalid barcode format. Must be 8-14 digits",
  },
  name: {
    required: true,
    validator: (value: unknown) =>
      validateStringLength(value, 1, BASE_CONFIG.VALIDATION.MAX_NAME_LENGTH),
    sanitizer: (value: unknown) =>
      sanitizeString(value, BASE_CONFIG.VALIDATION.MAX_NAME_LENGTH),
    errorMessage: `Name must be 1-${BASE_CONFIG.VALIDATION.MAX_NAME_LENGTH} characters`,
  },
  description: {
    required: false,
    validator: (value: unknown) =>
      validateStringLength(
        value,
        0,
        BASE_CONFIG.VALIDATION.MAX_DESCRIPTION_LENGTH,
      ),
    sanitizer: (value: unknown) =>
      sanitizeString(value, BASE_CONFIG.VALIDATION.MAX_DESCRIPTION_LENGTH),
    errorMessage: `Description must be less than ${BASE_CONFIG.VALIDATION.MAX_DESCRIPTION_LENGTH} characters`,
  },
} as const;
