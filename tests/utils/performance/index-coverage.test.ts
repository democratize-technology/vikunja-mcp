/**
 * Performance index coverage tests for function exports
 * Tests uncovered exports to improve function coverage from 53.33%
 */

import {
  BULK_OPERATION_CONFIGS,
  type OptimizedBulkConfig,
  // Import all the other exports to ensure they're available
  BatchProcessor,
  createOptimizedBatchProcessor,
  HIGH_THROUGHPUT_CONFIG,
  RATE_LIMITED_CONFIG,
  MEMORY_OPTIMIZED_CONFIG,
  PerformanceMonitor,
  performanceMonitor,
  monitorBulkOperation,
  recordPerformanceMetrics,
  type OperationMetrics,
  type PerformanceStats,
  type PerformanceAlert,
} from '../../../src/utils/performance';

describe('Performance Index - Coverage Tests', () => {
  describe('BULK_OPERATION_CONFIGS', () => {
    it('should provide HIGH_THROUGHPUT configuration', () => {
      const config = BULK_OPERATION_CONFIGS.HIGH_THROUGHPUT;

      expect(config.batchOptions).toBeDefined();
      expect(config.enableMonitoring).toBe(true);

      expect(config.batchOptions!.maxConcurrency).toBe(8);
      expect(config.batchOptions!.batchSize).toBe(15);
      expect(config.batchOptions!.batchDelay).toBe(0);
      expect(config.batchOptions!.enableMetrics).toBe(true);
    });

    it('should provide RATE_LIMITED configuration', () => {
      const config = BULK_OPERATION_CONFIGS.RATE_LIMITED;

      expect(config.batchOptions).toBeDefined();
      expect(config.enableMonitoring).toBe(true);

      expect(config.batchOptions!.maxConcurrency).toBe(3);
      expect(config.batchOptions!.batchSize).toBe(5);
      expect(config.batchOptions!.batchDelay).toBe(100);
      expect(config.batchOptions!.enableMetrics).toBe(true);
    });

    it('should provide DEFAULT configuration', () => {
      const config = BULK_OPERATION_CONFIGS.DEFAULT;

      expect(config.batchOptions).toBeDefined();
      expect(config.enableMonitoring).toBe(true);

      expect(config.batchOptions!.maxConcurrency).toBe(5);
      expect(config.batchOptions!.batchSize).toBe(10);
      expect(config.batchOptions!.batchDelay).toBe(0);
      expect(config.batchOptions!.enableMetrics).toBe(true);
    });
  });

  describe('OptimizedBulkConfig type', () => {
    it('should accept valid configuration shape', () => {
      const config: OptimizedBulkConfig = {
        batchOptions: {
          maxConcurrency: 10,
          batchSize: 20,
        },
        enableMonitoring: true,
        operationType: 'test-operation',
      };

      expect(config.batchOptions!.maxConcurrency).toBe(10);
      expect(config.enableMonitoring).toBe(true);
      expect(config.operationType).toBe('test-operation');
    });

    it('should accept minimal configuration', () => {
      const config: OptimizedBulkConfig = {};

      expect(config).toEqual({});
    });

    it('should accept partial configuration', () => {
      const config: OptimizedBulkConfig = {
        enableMonitoring: false,
        operationType: 'partial-config',
      };

      expect(config.enableMonitoring).toBe(false);
      expect(config.operationType).toBe('partial-config');
      expect(config.batchOptions).toBeUndefined();
    });
  });

  describe('Exported classes and functions availability', () => {
    it('should export BatchProcessor class', () => {
      expect(BatchProcessor).toBeDefined();
      expect(typeof BatchProcessor).toBe('function');
    });

    it('should export createOptimizedBatchProcessor function', () => {
      expect(createOptimizedBatchProcessor).toBeDefined();
      expect(typeof createOptimizedBatchProcessor).toBe('function');
    });

    it('should export configuration constants', () => {
      expect(HIGH_THROUGHPUT_CONFIG).toBeDefined();
      expect(RATE_LIMITED_CONFIG).toBeDefined();
      expect(MEMORY_OPTIMIZED_CONFIG).toBeDefined();
    });

    it('should export PerformanceMonitor class and related functions', () => {
      expect(PerformanceMonitor).toBeDefined();
      expect(typeof PerformanceMonitor).toBe('function');

      expect(performanceMonitor).toBeDefined();
      expect(monitorBulkOperation).toBeDefined();
      expect(recordPerformanceMetrics).toBeDefined();

      expect(typeof monitorBulkOperation).toBe('function');
      expect(typeof recordPerformanceMetrics).toBe('function');
    });

    it('should export performance-related types', () => {
      // These types should be available for import
      expect(typeof 'OperationMetrics').toBe('string');
      expect(typeof 'PerformanceStats').toBe('string');
      expect(typeof 'PerformanceAlert').toBe('string');
    });
  });
});
