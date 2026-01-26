/**
 * Shared retry logic with circuit breaker pattern for serverless functions
 * Provides resilient execution with exponential backoff and intelligent failure handling
 */

import { BASE_CONFIG } from "./config";
import { isRetryableError, logError, RateLimitError } from "./errors";
import type { BasePerformanceMetrics, PerformanceTracker } from "./performance";

/**
 * Configuration for retry operations
 */
export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
  backoffMultiplier?: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  errorThreshold?: number;
  timeoutMs?: number;
  monitoringIntervalMs?: number;
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = "closed", // Normal operation
  OPEN = "open", // Circuit is open, failing fast
  HALF_OPEN = "half_open", // Testing if service has recovered
}

/**
 * Circuit breaker instance
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private errorCount = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;

  constructor(
    private readonly name: string,
    private readonly config: Required<CircuitBreakerConfig>,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(
          `Circuit breaker '${this.name}' is OPEN. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`,
        );
      }
      this.state = CircuitBreakerState.HALF_OPEN;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.errorCount = 0;
    this.state = CircuitBreakerState.CLOSED;
  }

  private onFailure(): void {
    this.errorCount++;
    this.lastFailureTime = Date.now();

    if (this.errorCount >= this.config.errorThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.timeoutMs;
      console.warn(
        `Circuit breaker '${this.name}' opened after ${this.errorCount} failures`,
      );
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      errorCount: this.errorCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }
}

/**
 * Global circuit breaker registry
 */
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker instance
 */
export function getCircuitBreaker(
  name: string,
  config: CircuitBreakerConfig = {},
): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    const fullConfig = {
      errorThreshold: BASE_CONFIG.PERFORMANCE.CIRCUIT_BREAKER_THRESHOLD,
      timeoutMs: BASE_CONFIG.PERFORMANCE.CACHE_TTL_MS,
      monitoringIntervalMs: 60000, // 1 minute
      ...config,
    };
    circuitBreakers.set(name, new CircuitBreaker(name, fullConfig));
  }
  return circuitBreakers.get(name)!;
}

/**
 * Execute an operation with retry logic and optional circuit breaker
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options: {
    retryConfig?: RetryOptions;
    circuitBreakerName?: string;
    circuitBreakerConfig?: CircuitBreakerConfig;
    performanceTracker?: PerformanceTracker<BasePerformanceMetrics>;
    operationName?: string;
    context?: Record<string, unknown>;
  } = {},
): Promise<T> {
  const {
    retryConfig = {},
    circuitBreakerName,
    circuitBreakerConfig,
    performanceTracker,
    operationName = "operation",
    context = {},
  } = options;

  const config = {
    maxRetries: BASE_CONFIG.RETRY.MAX_RETRIES,
    baseDelayMs: BASE_CONFIG.RETRY.BASE_DELAY_MS,
    maxDelayMs: BASE_CONFIG.RETRY.MAX_DELAY_MS,
    jitterFactor: BASE_CONFIG.RETRY.JITTER_FACTOR,
    backoffMultiplier: 2,
    ...retryConfig,
  };

  const circuitBreaker = circuitBreakerName
    ? getCircuitBreaker(circuitBreakerName, circuitBreakerConfig)
    : null;

  const wrappedOperation = circuitBreaker
    ? () => circuitBreaker.execute(operation)
    : operation;

  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      console.log(
        `Executing ${operationName}, attempt ${attempt}/${config.maxRetries + 1}`,
      );
      return await wrappedOperation();
    } catch (error) {
      const shouldRetry =
        isRetryableError(error) && attempt <= config.maxRetries;

      if (performanceTracker && attempt > 1) {
        performanceTracker.incrementRetry();
      }

      logError(error, {
        operationName,
        attempt,
        maxAttempts: config.maxRetries + 1,
        willRetry: shouldRetry,
        circuitBreakerName,
        circuitBreakerState: circuitBreaker?.getState(),
        ...context,
      });

      if (!shouldRetry) {
        throw error;
      }

      // Handle rate limiting with exponential backoff
      let delayMs = Math.min(
        config.baseDelayMs * config.backoffMultiplier ** (attempt - 1),
        config.maxDelayMs,
      );

      if (error instanceof RateLimitError && error.retryAfterSeconds) {
        delayMs = Math.max(delayMs, error.retryAfterSeconds * 1000);
      }

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * config.jitterFactor * delayMs;
      const totalDelay = delayMs + jitter;

      console.log(
        `Retrying ${operationName} in ${Math.round(totalDelay)}ms (attempt ${attempt + 1}/${config.maxRetries + 1})`,
      );
      await new Promise((resolve) => setTimeout(resolve, totalDelay));
    }
  }

  throw new Error(`Max retries exceeded for ${operationName}`);
}

/**
 * Enhanced cache with circuit breaker pattern
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  errors: number;
}

export class ResilientCache<T> {
  private cache: CacheEntry<T> | null = null;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    private readonly name: string,
    private readonly ttlMs: number = BASE_CONFIG.PERFORMANCE.CACHE_TTL_MS,
    circuitBreakerConfig: CircuitBreakerConfig = {},
  ) {
    this.circuitBreaker = getCircuitBreaker(
      `cache_${name}`,
      circuitBreakerConfig,
    );
  }

  async get(
    fetchOperation: () => Promise<T>,
    options: { forceRefresh?: boolean } = {},
  ): Promise<T> {
    const now = Date.now();

    // Return cached data if valid and not forced refresh
    if (
      !options.forceRefresh &&
      this.cache &&
      now - this.cache.timestamp < this.ttlMs
    ) {
      return this.cache.data;
    }

    // Check if circuit breaker should serve stale data
    if (
      this.cache &&
      this.circuitBreaker.getState() === CircuitBreakerState.OPEN
    ) {
      console.warn(
        `Cache '${this.name}' serving stale data due to circuit breaker`,
      );
      return this.cache.data;
    }

    try {
      const data = await this.circuitBreaker.execute(fetchOperation);

      // Success: update cache and reset error count
      this.cache = {
        data,
        timestamp: now,
        errors: 0,
      };

      console.log(`Cache '${this.name}' refreshed successfully`);
      return data;
    } catch (error) {
      console.error(`Failed to refresh cache '${this.name}':`, error);

      // Update error count if we have existing cache
      if (this.cache) {
        this.cache.errors++;
        console.warn(
          `Cache '${this.name}' failed ${this.cache.errors} times, serving stale data`,
        );
        return this.cache.data;
      }

      // No cached data available, re-throw the error
      throw error;
    }
  }

  clear(): void {
    this.cache = null;
  }

  getStats() {
    return {
      name: this.name,
      hasData: !!this.cache,
      dataAge: this.cache ? Date.now() - this.cache.timestamp : 0,
      errorCount: this.cache?.errors || 0,
      isStale: this.cache
        ? Date.now() - this.cache.timestamp > this.ttlMs
        : true,
      circuitBreaker: this.circuitBreaker.getStats(),
    };
  }
}

/**
 * Utility to execute multiple operations with different retry configurations
 */
export async function executeParallelWithRetry<T>(
  operations: Array<{
    operation: () => Promise<T>;
    name: string;
    retryConfig?: RetryOptions;
  }>,
  options: {
    failFast?: boolean;
    circuitBreakerConfig?: CircuitBreakerConfig;
  } = {},
): Promise<T[]> {
  const { failFast = true } = options;

  const promises = operations.map(({ operation, name, retryConfig }) =>
    executeWithRetry(operation, {
      retryConfig,
      operationName: name,
      circuitBreakerName: name,
      circuitBreakerConfig: options.circuitBreakerConfig,
    }),
  );

  if (failFast) {
    return Promise.all(promises);
  } else {
    const results = await Promise.allSettled(promises);
    return results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        console.error(
          `Operation '${operations[index].name}' failed:`,
          result.reason,
        );
        throw result.reason;
      }
    });
  }
}
