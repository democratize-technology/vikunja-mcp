/**
 * Tests for performance module exports and configurations
 * Ensures all exports work correctly and configurations are valid
 */

import {
  // BatchProcessor exports
  BatchProcessor,
  createOptimizedBatchProcessor,
  HIGH_THROUGHPUT_CONFIG,
  RATE_LIMITED_CONFIG,
  MEMORY_OPTIMIZED_CONFIG,

  // PerformanceMonitor exports
  PerformanceMonitor,
  performanceMonitor,
  monitorBulkOperation,
  recordPerformanceMetrics,

  // Configuration exports
  BULK_OPERATION_CONFIGS,
  OptimizedBulkConfig,
} from '../../../src/utils/performance/index';

describe('Performance Module Index', () => {
  describe('BatchProcessor Exports', () => {
    it('should export BatchProcessor class', () => {
      expect(BatchProcessor).toBeDefined();
      expect(typeof BatchProcessor).toBe('function');
    });

    it('should export createOptimizedBatchProcessor function', () => {
      expect(createOptimizedBatchProcessor).toBeDefined();
      expect(typeof createOptimizedBatchProcessor).toBe('function');
    });

    it('should create BatchProcessor instance with createOptimizedBatchProcessor', () => {
      const processor = createOptimizedBatchProcessor();
      expect(processor).toBeInstanceOf(BatchProcessor);
    });

    it('should export HIGH_THROUGHPUT_CONFIG with correct values', () => {
      expect(HIGH_THROUGHPUT_CONFIG).toEqual({
        maxConcurrency: 8,
        batchSize: 15,
        enableMetrics: true,
        batchDelay: 0,
      });
    });

    it('should export RATE_LIMITED_CONFIG with correct values', () => {
      expect(RATE_LIMITED_CONFIG).toEqual({
        maxConcurrency: 3,
        batchSize: 5,
        enableMetrics: true,
        batchDelay: 100,
      });
    });

    it('should export MEMORY_OPTIMIZED_CONFIG with correct values', () => {
      expect(MEMORY_OPTIMIZED_CONFIG).toEqual({
        maxConcurrency: 4,
        batchSize: 8,
        enableMetrics: true,
        batchDelay: 50,
      });
    });
  });

  
  describe('PerformanceMonitor Exports', () => {
    it('should export PerformanceMonitor class', () => {
      expect(PerformanceMonitor).toBeDefined();
      expect(typeof PerformanceMonitor).toBe('function');
    });

    it('should export global performanceMonitor instance', () => {
      expect(performanceMonitor).toBeInstanceOf(PerformanceMonitor);
    });

    it('should export monitorBulkOperation function', () => {
      expect(monitorBulkOperation).toBeDefined();
      expect(typeof monitorBulkOperation).toBe('function');
    });

    it('should export recordPerformanceMetrics function', () => {
      expect(recordPerformanceMetrics).toBeDefined();
      expect(typeof recordPerformanceMetrics).toBe('function');
    });
  });

  describe('BULK_OPERATION_CONFIGS', () => {
    it('should export BULK_OPERATION_CONFIGS object', () => {
      expect(BULK_OPERATION_CONFIGS).toBeDefined();
      expect(typeof BULK_OPERATION_CONFIGS).toBe('object');
    });

    it('should have HIGH_THROUGHPUT configuration', () => {
      expect(BULK_OPERATION_CONFIGS.HIGH_THROUGHPUT).toEqual({
        batchOptions: {
          maxConcurrency: 8,
          batchSize: 15,
          enableMetrics: true,
          batchDelay: 0,
        },
        enableMonitoring: true,
      });
    });

    it('should have RATE_LIMITED configuration', () => {
      expect(BULK_OPERATION_CONFIGS.RATE_LIMITED).toEqual({
        batchOptions: {
          maxConcurrency: 3,
          batchSize: 5,
          enableMetrics: true,
          batchDelay: 100,
        },
        enableMonitoring: true,
      });
    });

    it('should have DEFAULT configuration', () => {
      expect(BULK_OPERATION_CONFIGS.DEFAULT).toEqual({
        batchOptions: {
          maxConcurrency: 5,
          batchSize: 10,
          enableMetrics: true,
          batchDelay: 0,
        },
        enableMonitoring: true,
      });
    });

    it('should have all required configuration keys', () => {
      const configs = ['HIGH_THROUGHPUT', 'RATE_LIMITED', 'DEFAULT'];
      configs.forEach(configName => {
        const config = BULK_OPERATION_CONFIGS[configName as keyof typeof BULK_OPERATION_CONFIGS];
        expect(config).toHaveProperty('batchOptions');
        expect(config).toHaveProperty('enableMonitoring');
      });
    });

    it('should have valid batch options in all configurations', () => {
      const configs = ['HIGH_THROUGHPUT', 'RATE_LIMITED', 'DEFAULT'] as const;
      configs.forEach(configName => {
        const config = BULK_OPERATION_CONFIGS[configName];
        expect(config.batchOptions).toHaveProperty('maxConcurrency');
        expect(config.batchOptions).toHaveProperty('batchSize');
        expect(config.batchOptions).toHaveProperty('enableMetrics');
        expect(config.batchOptions).toHaveProperty('batchDelay');
        
        // Validate reasonable values
        expect(config.batchOptions.maxConcurrency).toBeGreaterThan(0);
        expect(config.batchOptions.batchSize).toBeGreaterThan(0);
        expect(typeof config.batchOptions.enableMetrics).toBe('boolean');
        expect(config.batchOptions.batchDelay).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Type Exports', () => {
    it('should export OptimizedBulkConfig type through interface', () => {
      // Test that we can create an object matching the interface
      const config: OptimizedBulkConfig = {
        batchOptions: { maxConcurrency: 5 },
        enableMonitoring: true,
        operationType: 'test',
      };

      expect(config).toBeDefined();
      expect(config.batchOptions).toEqual({ maxConcurrency: 5 });
      expect(config.enableMonitoring).toBe(true);
      expect(config.operationType).toBe('test');
    });

    it('should support optional properties in OptimizedBulkConfig', () => {
      const minimalConfig: OptimizedBulkConfig = {};
      expect(minimalConfig).toBeDefined();
      
      const partialConfig: OptimizedBulkConfig = {
        enableMonitoring: false,
      };
      expect(partialConfig.enableMonitoring).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    it('should be able to create components using exported configurations', () => {
      // Test creating batch processor with exported config
      const processor = createOptimizedBatchProcessor(HIGH_THROUGHPUT_CONFIG);
      expect(processor).toBeInstanceOf(BatchProcessor);
    });

    it('should be able to combine configurations for optimized bulk operations', () => {
      const config: OptimizedBulkConfig = {
        batchOptions: BULK_OPERATION_CONFIGS.HIGH_THROUGHPUT.batchOptions,
        enableMonitoring: BULK_OPERATION_CONFIGS.HIGH_THROUGHPUT.enableMonitoring,
        operationType: 'test-operation',
      };

      expect(config.batchOptions?.maxConcurrency).toBe(8);
      expect(config.enableMonitoring).toBe(true);
    });

    it('should ensure configuration consistency across exports', () => {
      // HIGH_THROUGHPUT_CONFIG should match BULK_OPERATION_CONFIGS.HIGH_THROUGHPUT.batchOptions
      expect(HIGH_THROUGHPUT_CONFIG).toEqual(BULK_OPERATION_CONFIGS.HIGH_THROUGHPUT.batchOptions);
    });
  });
});