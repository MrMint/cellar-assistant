/**
 * Shared configuration constants for all serverless functions
 * Provides centralized configuration management with type safety
 */

// Base configuration structure that can be extended
export interface BaseConfig {
  VALIDATION: ValidationConfig;
  RETRY: RetryConfig;
  PERFORMANCE: PerformanceConfig;
}

export interface ValidationConfig {
  MAX_USER_ID_LENGTH: number;
  MAX_FILE_ID_LENGTH: number;
  BARCODE_PATTERN: RegExp;
  FILE_ID_PATTERN: RegExp;
  MAX_DESCRIPTION_LENGTH: number;
  MAX_NAME_LENGTH: number;
}

export interface RetryConfig {
  MAX_RETRIES: number;
  BASE_DELAY_MS: number;
  MAX_DELAY_MS: number;
  JITTER_FACTOR: number;
}

export interface PerformanceConfig {
  LOG_SLOW_OPERATIONS_MS: number;
  LOG_METRICS_SAMPLE_RATE: number;
  CIRCUIT_BREAKER_THRESHOLD: number;
  CACHE_TTL_MS: number;
}

export interface AIConfig {
  DEFAULT_TEMPERATURE: number;
  DEFAULT_MAX_TOKENS: number;
  DEFAULT_TOP_P: number;
  MAX_IMAGE_SIZE_MB: number;
  SUPPORTED_IMAGE_FORMATS: string[];
}

// Extended configuration for AI-enabled functions
export interface ExtendedConfig extends BaseConfig {
  AI: AIConfig;
}

/**
 * Base configuration constants used across all functions
 */
export const BASE_CONFIG: BaseConfig = {
  VALIDATION: {
    MAX_USER_ID_LENGTH: 256,
    MAX_FILE_ID_LENGTH: 256,
    BARCODE_PATTERN: /^[0-9]{8,14}$/,
    FILE_ID_PATTERN: /^[a-zA-Z0-9\-_]+$/,
    MAX_DESCRIPTION_LENGTH: 5000,
    MAX_NAME_LENGTH: 500,
  },
  RETRY: {
    MAX_RETRIES: 2,
    BASE_DELAY_MS: 1000,
    MAX_DELAY_MS: 5000,
    JITTER_FACTOR: 0.1,
  },
  PERFORMANCE: {
    LOG_SLOW_OPERATIONS_MS: 5000,
    LOG_METRICS_SAMPLE_RATE: 0.1, // 10% of requests
    CIRCUIT_BREAKER_THRESHOLD: 3,
    CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  },
} as const;

/**
 * AI-specific configuration constants
 */
export const AI_CONFIG: AIConfig = {
  DEFAULT_TEMPERATURE: 0.1,
  DEFAULT_MAX_TOKENS: 2048,
  DEFAULT_TOP_P: 0.95,
  MAX_IMAGE_SIZE_MB: 10,
  SUPPORTED_IMAGE_FORMATS: ["jpg", "jpeg", "png", "webp"],
} as const;

/**
 * Extended configuration including AI settings
 */
export const EXTENDED_CONFIG: ExtendedConfig = {
  ...BASE_CONFIG,
  AI: AI_CONFIG,
} as const;

/**
 * Type-safe item types used across the application
 * Re-exported from shared package for convenience
 */
export {
  ITEM_TYPES as VALID_ITEM_TYPES,
  type ItemTypeValue as ValidItemType,
} from "@cellar-assistant/shared";

/**
 * Validation helper to check if a string is a valid item type
 */
export function isValidItemType(itemType: unknown): itemType is ItemTypeValue {
  return (
    typeof itemType === "string" &&
    ITEM_TYPES.includes(itemType as ItemTypeValue)
  );
}

// Import for use in this file
import { ITEM_TYPES, type ItemTypeValue } from "@cellar-assistant/shared";

/**
 * Environment-specific configuration overrides
 */
export function getEnvironmentConfig(): Partial<ExtendedConfig> {
  const isDevelopment = process.env.NODE_ENV === "development";
  const isProduction = process.env.NODE_ENV === "production";

  if (isDevelopment) {
    return {
      PERFORMANCE: {
        ...EXTENDED_CONFIG.PERFORMANCE,
        LOG_METRICS_SAMPLE_RATE: 1.0, // Log all operations in development
      },
    };
  }

  if (isProduction) {
    return {
      PERFORMANCE: {
        ...EXTENDED_CONFIG.PERFORMANCE,
        LOG_METRICS_SAMPLE_RATE: 0.05, // Lower sampling in production (5%)
      },
    };
  }

  return {};
}

/**
 * Get merged configuration with environment-specific overrides
 */
export function getConfig(): ExtendedConfig {
  const envConfig = getEnvironmentConfig();
  return {
    ...EXTENDED_CONFIG,
    ...envConfig,
    VALIDATION: { ...EXTENDED_CONFIG.VALIDATION, ...envConfig.VALIDATION },
    RETRY: { ...EXTENDED_CONFIG.RETRY, ...envConfig.RETRY },
    PERFORMANCE: { ...EXTENDED_CONFIG.PERFORMANCE, ...envConfig.PERFORMANCE },
    AI: { ...EXTENDED_CONFIG.AI, ...envConfig.AI },
  };
}
