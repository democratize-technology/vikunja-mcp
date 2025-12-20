/**
 * Performance optimization utilities for bulk operations
 * Core performance monitoring and batch processing capabilities
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
  PerformanceMonitor,
  performanceMonitor,
  monitorBulkOperation,
  recordPerformanceMetrics,
  type OperationMetrics,
  type PerformanceStats,
  type PerformanceAlert,
} from './performance-monitor';

// Convenience function to create optimized bulk operation handler
export interface OptimizedBulkConfig {
  batchOptions?: Partial<import('./batch-processor').BatchOptions>;
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
    enableMonitoring: true,
  },
  RATE_LIMITED: {
    batchOptions: {
      maxConcurrency: 3,
      batchSize: 5,
      enableMetrics: true,
      batchDelay: 100,
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
    enableMonitoring: true,
  },
};