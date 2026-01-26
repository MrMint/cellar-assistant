/**
 * Shared performance monitoring utilities for serverless functions
 * Provides consistent metrics tracking and smart logging across all functions
 */

// Base performance metrics interface - can be extended by specific functions
export interface BasePerformanceMetrics {
  totalDuration: number;
  retryCount: number;
}

// Generic performance tracker that can be extended
export interface PerformanceTracker<
  T extends BasePerformanceMetrics = BasePerformanceMetrics,
> {
  startTimer: <K extends keyof T>(phase: K) => () => void;
  incrementRetry: () => void;
  setMetric: <K extends keyof T>(key: K, value: T[K]) => void;
  getMetrics: () => T;
}

/**
 * Create a performance tracker with customizable metrics
 */
export function createPerformanceTracker<T extends BasePerformanceMetrics>(
  initialMetrics?: Partial<Omit<T, keyof BasePerformanceMetrics>>,
): PerformanceTracker<T> {
  const startTime = Date.now();
  const metrics: Partial<T> = {
    retryCount: 0,
    ...initialMetrics,
  } as Partial<T>;

  return {
    startTimer: <K extends keyof T>(phase: K) => {
      const phaseStartTime = Date.now();
      return () => {
        const duration = Date.now() - phaseStartTime;
        metrics[phase] = duration as T[K];
      };
    },
    incrementRetry: () => {
      metrics.retryCount = ((metrics.retryCount as number) || 0) + 1;
    },
    setMetric: <K extends keyof T>(key: K, value: T[K]) => {
      metrics[key] = value;
    },
    getMetrics: (): T => {
      return {
        ...metrics,
        totalDuration: Date.now() - startTime,
      } as T;
    },
  };
}

/**
 * Smart performance logging with configurable sampling and slow operation detection
 */
export interface PerformanceLoggerConfig {
  sampleRate?: number; // Percentage (0-1) of operations to log
  slowOperationThresholdMs?: number; // Always log operations slower than this
  functionName?: string; // Function name for context
}

export function logPerformanceMetrics<T extends BasePerformanceMetrics>(
  metrics: T,
  context: Record<string, unknown>,
  config: PerformanceLoggerConfig = {},
): void {
  const {
    sampleRate = 0.1, // 10% default
    slowOperationThresholdMs = 5000, // 5 seconds
    functionName = "function",
  } = config;

  const shouldLogMetrics =
    Math.random() < sampleRate ||
    metrics.totalDuration > slowOperationThresholdMs;

  if (shouldLogMetrics) {
    console.log(`Performance metrics for ${functionName}`, {
      ...context,
      metrics,
      ...(metrics.totalDuration > slowOperationThresholdMs && {
        slowOperation: true,
      }),
    });
  }
}

/**
 * Extended performance metrics for functions with common phases
 */
export interface ExtendedPerformanceMetrics extends BasePerformanceMetrics {
  validationDuration: number;
  dbOperationDuration: number;
  externalApiDuration: number;
}

/**
 * Performance metrics specific to AI/ML operations
 */
export interface AIPerformanceMetrics extends ExtendedPerformanceMetrics {
  aiAnalysisDuration: number;
  imageFetchDuration: number;
  imageCount: number;
  confidence: number;
}

/**
 * Create a performance tracker optimized for AI operations
 */
export function createAIPerformanceTracker(
  initialMetrics?: Partial<
    Omit<AIPerformanceMetrics, keyof BasePerformanceMetrics>
  >,
): PerformanceTracker<AIPerformanceMetrics> {
  return createPerformanceTracker<AIPerformanceMetrics>({
    imageCount: 0,
    confidence: 0,
    ...initialMetrics,
  });
}
