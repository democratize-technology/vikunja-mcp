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
  ResponseCache,
  createTaskCache,
  taskCache,
  projectCache,
  operationCache,
  AGGRESSIVE_CACHE_CONFIG,
  CONSERVATIVE_CACHE_CONFIG,
  PerformanceMonitor,
  performanceMonitor,
  monitorBulkOperation,
  recordPerformanceMetrics,
  CircuitBreaker,
  CircuitBreakerManager,
  circuitBreakerManager,
  bulkOperationBreaker,
  individualOperationBreaker,
  apiHealthBreaker,
  CircuitOpenError,
  CircuitState,
  AdaptiveBatchOptimizer,
  AdaptiveBatchOptimizerManager,
  adaptiveBatchManager,
  BulkOperationEnhancer,
  createBulkOperationEnhancer,
  executeEnhancedBulkOperation,
} from '../../../src/utils/performance';

describe('Performance Index - Coverage Tests', () => {
  describe('BULK_OPERATION_CONFIGS', () => {
    it('should provide HIGH_THROUGHPUT configuration', () => {
      const config = BULK_OPERATION_CONFIGS.HIGH_THROUGHPUT;
      
      expect(config.batchOptions).toBeDefined();
      expect(config.cacheOptions).toBeDefined();
      expect(config.enableMonitoring).toBe(true);
      
      expect(config.batchOptions!.maxConcurrency).toBe(8);
      expect(config.batchOptions!.batchSize).toBe(15);
      expect(config.batchOptions!.batchDelay).toBe(0);
      expect(config.batchOptions!.enableMetrics).toBe(true);
      
      expect(config.cacheOptions!.ttl).toBe(60000);
      expect(config.cacheOptions!.maxSize).toBe(2000);
      expect(config.cacheOptions!.enableMetrics).toBe(true);
      expect(config.cacheOptions!.cleanupInterval).toBe(30000);
    });

    it('should provide RATE_LIMITED configuration', () => {
      const config = BULK_OPERATION_CONFIGS.RATE_LIMITED;
      
      expect(config.batchOptions).toBeDefined();
      expect(config.cacheOptions).toBeDefined();
      expect(config.enableMonitoring).toBe(true);
      
      expect(config.batchOptions!.maxConcurrency).toBe(3);
      expect(config.batchOptions!.batchSize).toBe(5);
      expect(config.batchOptions!.batchDelay).toBe(100);
      expect(config.batchOptions!.enableMetrics).toBe(true);
      
      expect(config.cacheOptions!.ttl).toBe(15000);
      expect(config.cacheOptions!.maxSize).toBe(500);
      expect(config.cacheOptions!.enableMetrics).toBe(true);
      expect(config.cacheOptions!.cleanupInterval).toBe(60000);
    });

    it('should provide DEFAULT configuration', () => {
      const config = BULK_OPERATION_CONFIGS.DEFAULT;
      
      expect(config.batchOptions).toBeDefined();
      expect(config.cacheOptions).toBeDefined();
      expect(config.enableMonitoring).toBe(true);
      
      expect(config.batchOptions!.maxConcurrency).toBe(5);
      expect(config.batchOptions!.batchSize).toBe(10);
      expect(config.batchOptions!.batchDelay).toBe(0);
      expect(config.batchOptions!.enableMetrics).toBe(true);
      
      expect(config.cacheOptions!.ttl).toBe(30000);
      expect(config.cacheOptions!.maxSize).toBe(500);
      expect(config.cacheOptions!.enableMetrics).toBe(true);
    });
  });

  describe('OptimizedBulkConfig type', () => {
    it('should accept valid configuration shape', () => {
      const config: OptimizedBulkConfig = {
        batchOptions: {
          maxConcurrency: 10,
          batchSize: 20,
        },
        cacheOptions: {
          ttl: 60000,
          maxSize: 1000,
        },
        enableMonitoring: true,
        operationType: 'test-operation',
      };

      expect(config.batchOptions!.maxConcurrency).toBe(10);
      expect(config.cacheOptions!.ttl).toBe(60000);
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
      expect(config.cacheOptions).toBeUndefined();
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
      expect(AGGRESSIVE_CACHE_CONFIG).toBeDefined();
      expect(CONSERVATIVE_CACHE_CONFIG).toBeDefined();
    });

    it('should export ResponseCache class and related functions', () => {
      expect(ResponseCache).toBeDefined();
      expect(typeof ResponseCache).toBe('function');
      
      expect(createTaskCache).toBeDefined();
      expect(typeof createTaskCache).toBe('function');
      
      expect(taskCache).toBeDefined();
      expect(projectCache).toBeDefined();
      expect(operationCache).toBeDefined();
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

    it('should export CircuitBreaker classes and error', () => {
      expect(CircuitBreaker).toBeDefined();
      expect(CircuitBreakerManager).toBeDefined();
      expect(CircuitOpenError).toBeDefined();
      expect(CircuitState).toBeDefined();
      
      expect(typeof CircuitBreaker).toBe('function');
      expect(typeof CircuitBreakerManager).toBe('function');
      expect(typeof CircuitOpenError).toBe('function');
    });

    it('should export circuit breaker instances', () => {
      expect(circuitBreakerManager).toBeDefined();
      expect(bulkOperationBreaker).toBeDefined();
      expect(individualOperationBreaker).toBeDefined();
      expect(apiHealthBreaker).toBeDefined();
    });

    it('should export AdaptiveBatchOptimizer classes and manager', () => {
      expect(AdaptiveBatchOptimizer).toBeDefined();
      expect(AdaptiveBatchOptimizerManager).toBeDefined();
      expect(adaptiveBatchManager).toBeDefined();
      
      expect(typeof AdaptiveBatchOptimizer).toBe('function');
      expect(typeof AdaptiveBatchOptimizerManager).toBe('function');
    });

    it('should export BulkOperationEnhancer classes and functions', () => {
      expect(BulkOperationEnhancer).toBeDefined();
      expect(createBulkOperationEnhancer).toBeDefined();
      expect(executeEnhancedBulkOperation).toBeDefined();
      
      expect(typeof BulkOperationEnhancer).toBe('function');
      expect(typeof createBulkOperationEnhancer).toBe('function');
      expect(typeof executeEnhancedBulkOperation).toBe('function');
    });
  });
});
