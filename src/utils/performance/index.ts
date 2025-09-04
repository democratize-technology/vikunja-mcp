/**
 * Performance optimization utilities for bulk operations
 * Provides intelligent batching, caching, and monitoring
 */

export {
  BatchProcessor,
  createOptimizedBatchProcessor,
  HIGH_THROUGHPUT_CONFIG,
  RATE_LIMITED_CONFIG,
  MEMORY_OPTIMIZED_CONFIG,
  type BatchOptions,
  type BatchMetrics,
  type BatchResult,
} from './batch-processor';

export {
  ResponseCache,
  createTaskCache,
  taskCache,
  projectCache,
  operationCache,
  AGGRESSIVE_CACHE_CONFIG,
  CONSERVATIVE_CACHE_CONFIG,
  type CacheOptions,
  type CacheMetrics,
} from './response-cache';

export {
  PerformanceMonitor,
  performanceMonitor,
  monitorBulkOperation,
  recordPerformanceMetrics,
  type OperationMetrics,
  type PerformanceStats,
  type PerformanceAlert,
} from './performance-monitor';

// Convenience function to create optimized bulk operation handler
import type { BatchOptions } from './batch-processor';
import type { CacheOptions } from './response-cache';

export interface OptimizedBulkConfig {
  batchOptions?: Partial<BatchOptions>;
  cacheOptions?: Partial<CacheOptions>;
  enableMonitoring?: boolean;
  operationType?: string;
}

// Export predefined configurations for common use cases
export const BULK_OPERATION_CONFIGS = {
  HIGH_THROUGHPUT: {
    batchOptions: {
      maxConcurrency: 8,
      batchSize: 15,
      enableMetrics: true,
      batchDelay: 0,
    },
    cacheOptions: {
      ttl: 60000,
      maxSize: 2000,
      enableMetrics: true,
      cleanupInterval: 30000,
    },
    enableMonitoring: true,
  },
  RATE_LIMITED: {
    batchOptions: {
      maxConcurrency: 3,
      batchSize: 5,
      enableMetrics: true,
      batchDelay: 100,
    },
    cacheOptions: {
      ttl: 15000,
      maxSize: 500,
      enableMetrics: true,
      cleanupInterval: 60000,
    },
    enableMonitoring: true,
  },
  DEFAULT: {
    batchOptions: {
      maxConcurrency: 5,
      batchSize: 10,
      enableMetrics: true,
      batchDelay: 0,
    },
    cacheOptions: {
      ttl: 30000,
      maxSize: 500,
      enableMetrics: true,
    },
    enableMonitoring: true,
  },
};