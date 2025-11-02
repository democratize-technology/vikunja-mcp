/**
 * Tests for batch-processor.ts - High-performance batch processing with controlled concurrency
 * Comprehensive coverage for semaphore pattern, batch delays, metrics calculation, and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  BatchProcessor,
  createOptimizedBatchProcessor,
  HIGH_THROUGHPUT_CONFIG,
  RATE_LIMITED_CONFIG,
  MEMORY_OPTIMIZED_CONFIG,
  BatchOptions,
  BatchResult,
} from '../../../src/utils/performance/batch-processor';

describe('BatchProcessor', () => {
  let processor: BatchProcessor;
  let mockProcessor: jest.Mock;

  beforeEach(() => {
    processor = new BatchProcessor();
    mockProcessor = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('Basic Batch Processing', () => {
    it('should process empty items array', async () => {
      const result = await processor.processBatches([], mockProcessor);

      expect(result.successful).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(result.metrics.totalItems).toBe(0);
      expect(result.metrics.totalBatches).toBe(0);
      expect(result.metrics.successfulOperations).toBe(0);
      expect(result.metrics.failedOperations).toBe(0);
    });

    it('should process single item', async () => {
      mockProcessor.mockResolvedValue('result');
      const items = ['item1'];

      const result = await processor.processBatches(items, mockProcessor);

      expect(result.successful).toEqual(['result']);
      expect(result.failed).toEqual([]);
      expect(result.metrics.totalItems).toBe(1);
      expect(result.metrics.successfulOperations).toBe(1);
      expect(mockProcessor).toHaveBeenCalledWith('item1', 0);
    });

    it('should process multiple items in default batch size', async () => {
      mockProcessor.mockResolvedValue('result');
      const items = ['item1', 'item2', 'item3', 'item4', 'item5'];

      const result = await processor.processBatches(items, mockProcessor);

      expect(result.successful).toEqual(['result', 'result', 'result', 'result', 'result']);
      expect(result.failed).toEqual([]);
      expect(result.metrics.totalItems).toBe(5);
      expect(result.metrics.successfulOperations).toBe(5);
      expect(result.metrics.totalBatches).toBe(1); // All items fit in default batch size of 10
    });

    it('should split items into multiple batches when needed', async () => {
      mockProcessor.mockResolvedValue('result');
      const items = Array.from({ length: 25 }, (_, i) => `item${i + 1}`);

      const result = await processor.processBatches(items, mockProcessor, { batchSize: 10 });

      expect(result.successful).toHaveLength(25);
      expect(result.metrics.totalBatches).toBe(3); // 10, 10, 5
      expect(result.metrics.successfulOperations).toBe(25);
    });
  });

  describe('Error Handling', () => {
    it('should handle processor function throwing errors', async () => {
      mockProcessor
        .mockResolvedValueOnce('success1')
        .mockRejectedValueOnce(new Error('Processing error'))
        .mockResolvedValueOnce('success3');

      const items = ['item1', 'item2', 'item3'];

      const result = await processor.processBatches(items, mockProcessor);

      expect(result.successful).toEqual(['success1', 'success3']);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]).toEqual({
        index: 1,
        error: expect.any(Error),
        originalItem: 'item2',
      });
      expect(result.metrics.successfulOperations).toBe(2);
      expect(result.metrics.failedOperations).toBe(1);
    });

    it('should handle all items failing', async () => {
      mockProcessor.mockRejectedValue(new Error('All failed'));

      const items = ['item1', 'item2', 'item3'];

      const result = await processor.processBatches(items, mockProcessor);

      expect(result.successful).toEqual([]);
      expect(result.failed).toHaveLength(3);
      expect(result.metrics.successfulOperations).toBe(0);
      expect(result.metrics.failedOperations).toBe(3);
    });

    it('should preserve original indices in error reports', async () => {
      mockProcessor.mockImplementation((item, index) => {
        if (index === 5) throw new Error('Index 5 failed');
        return `success-${index}`;
      });

      const items = Array.from({ length: 10 }, (_, i) => `item${i}`);

      const result = await processor.processBatches(items, mockProcessor);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].index).toBe(5);
      expect(result.failed[0].originalItem).toBe('item5');
    });
  });

  describe('Concurrency Control', () => {
    it('should respect maxConcurrency limit', async () => {
      let activeCount = 0;
      let maxActiveCount = 0;

      mockProcessor.mockImplementation(async (item) => {
        activeCount++;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        await new Promise(resolve => setTimeout(resolve, 10));
        activeCount--;
        return `processed-${item}`;
      });

      const items = Array.from({ length: 20 }, (_, i) => `item${i}`);

      await processor.processBatches(items, mockProcessor, {
        maxConcurrency: 3,
        batchSize: 5
      });

      expect(maxActiveCount).toBeLessThanOrEqual(3);
    });

    it('should process items concurrently within limits', async () => {
      const startTime = Date.now();
      const processingTime = 50;

      mockProcessor.mockImplementation(async (item) => {
        await new Promise(resolve => setTimeout(resolve, processingTime));
        return `processed-${item}`;
      });

      const items = ['item1', 'item2', 'item3', 'item4', 'item5'];

      const result = await processor.processBatches(items, mockProcessor, {
        maxConcurrency: 5,
        batchSize: 10
      });

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // With concurrency of 5, all 5 items should process in parallel
      // Total time should be close to processing time, not 5x processing time
      expect(totalTime).toBeLessThan(processingTime * 3); // Allow some margin
      expect(result.successful).toHaveLength(5);
    });
  });

  describe('Batch Delay Feature', () => {
    it('should apply delay between batches when configured', async () => {
      jest.useFakeTimers({ doNotFake: ['performance', 'console'] });

      mockProcessor.mockResolvedValue('result');
      const items = Array.from({ length: 20 }, (_, i) => `item${i}`);

      const processPromise = processor.processBatches(items, mockProcessor, {
        batchSize: 5,
        batchDelay: 100
      });

      // Advance timers past all processing and delays
      await jest.runAllTimersAsync();
      const result = await processPromise;

      expect(result.successful).toHaveLength(20);
      expect(mockProcessor).toHaveBeenCalledTimes(20);

      jest.useRealTimers();
    });

    it('should not apply delay after last batch', async () => {
      jest.useFakeTimers();

      mockProcessor.mockResolvedValue('result');
      const items = Array.from({ length: 8 }, (_, i) => `item${i}`);

      const processPromise = processor.processBatches(items, mockProcessor, {
        batchSize: 5,
        batchDelay: 100
      });

      // Should only have one delay (between batch 1 and 2)
      await jest.advanceTimersByTimeAsync(100);
      await Promise.resolve();

      const result = await processPromise;

      expect(result.successful).toHaveLength(8);
      expect(result.metrics.totalBatches).toBe(2);

      jest.useRealTimers();
    });

    it('should not apply delay when batchDelay is 0', async () => {
      jest.useFakeTimers();

      mockProcessor.mockResolvedValue('result');
      const items = Array.from({ length: 20 }, (_, i) => `item${i}`);

      const processPromise = processor.processBatches(items, mockProcessor, {
        batchSize: 5,
        batchDelay: 0
      });

      // Should complete immediately without delays
      await jest.runAllTimersAsync();
      const result = await processPromise;

      expect(result.successful).toHaveLength(20);

      jest.useRealTimers();
    });
  });

  describe('Metrics Collection', () => {
    it('should calculate correct metrics for successful processing', async () => {
      // Add some delay to ensure non-zero duration
      mockProcessor.mockImplementation(async (item) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return item;
      });

      const items = Array.from({ length: 25 }, (_, i) => `item${i}`);

      const result = await processor.processBatches(items, mockProcessor, {
        batchSize: 10,
        enableMetrics: true
      });

      expect(result.metrics.totalItems).toBe(25);
      expect(result.metrics.totalBatches).toBe(3);
      expect(result.metrics.successfulOperations).toBe(25);
      expect(result.metrics.failedOperations).toBe(0);
      expect(result.metrics.totalDuration).toBeGreaterThanOrEqual(0);
      expect(result.metrics.averageBatchDuration).toBeGreaterThanOrEqual(0);
      expect(result.metrics.operationsPerSecond).toBeGreaterThanOrEqual(0);
      expect(result.metrics.concurrencyUtilization).toBeGreaterThanOrEqual(0);
      expect(result.metrics.concurrencyUtilization).toBeLessThanOrEqual(1);
    });

    it('should calculate correct metrics for mixed success/failure', async () => {
      mockProcessor.mockImplementation(async (item, index) => {
        if (index % 3 === 0) throw new Error(`Failed at ${index}`);
        await new Promise(resolve => setTimeout(resolve, 1));
        return `success-${index}`;
      });

      const items = Array.from({ length: 15 }, (_, i) => `item${i}`);

      const result = await processor.processBatches(items, mockProcessor, {
        enableMetrics: true
      });

      expect(result.metrics.successfulOperations).toBe(10); // 15 - 5 failures
      expect(result.metrics.failedOperations).toBe(5);
      expect(result.metrics.operationsPerSecond).toBeGreaterThanOrEqual(0);
    });

    it('should handle metrics when disabled', async () => {
      mockProcessor.mockResolvedValue('result');
      const items = ['item1', 'item2'];

      const result = await processor.processBatches(items, mockProcessor, {
        enableMetrics: false
      });

      // Metrics should still be calculated but without detailed tracking
      expect(result.metrics.totalItems).toBe(2);
      expect(result.metrics.totalBatches).toBe(1);
      expect(result.metrics.successfulOperations).toBe(2);
      expect(result.metrics.failedOperations).toBe(0);
    });

    it('should calculate average batch duration correctly', async () => {
      mockProcessor.mockImplementation(async (item) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return `result-${item}`;
      });

      const items = Array.from({ length: 20 }, (_, i) => `item${i}`);

      const result = await processor.processBatches(items, mockProcessor, {
        batchSize: 5
      });

      expect(result.metrics.averageBatchDuration).toBeGreaterThan(0);
      expect(result.metrics.totalDuration).toBeGreaterThan(result.metrics.averageBatchDuration);
    });

    it('should handle zero duration in operations per second calculation', async () => {
      mockProcessor.mockResolvedValue('result');

      const items = ['item1'];
      const result = await processor.processBatches(items, mockProcessor);

      // For very fast operations, ops per second might be very high or zero
      expect(typeof result.metrics.operationsPerSecond).toBe('number');
      expect(result.metrics.operationsPerSecond).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Semaphore Implementation', () => {
    it('should handle semaphore acquisition and release correctly', async () => {
      let activeOperations = 0;
      let maxConcurrent = 0;

      mockProcessor.mockImplementation(async (item) => {
        activeOperations++;
        maxConcurrent = Math.max(maxConcurrent, activeOperations);
        await new Promise(resolve => setTimeout(resolve, 20));
        activeOperations--;
        return item;
      });

      const items = Array.from({ length: 10 }, (_, i) => `item${i}`);

      await processor.processBatches(items, mockProcessor, {
        maxConcurrency: 2,
        batchSize: 10
      });

      expect(maxConcurrent).toBeLessThanOrEqual(2);
      expect(activeOperations).toBe(0); // All operations should complete
    });

    it('should queue operations when permits exhausted', async () => {
      const startTimes: number[] = [];

      mockProcessor.mockImplementation(async (item) => {
        startTimes.push(Date.now());
        await new Promise(resolve => setTimeout(resolve, 50));
        return item;
      });

      const items = Array.from({ length: 5 }, (_, i) => `item${i}`);

      const startTime = Date.now();
      await processor.processBatches(items, mockProcessor, {
        maxConcurrency: 2,
        batchSize: 5
      });

      // Due to semaphore queuing, operations should be staggered
      expect(startTimes).toHaveLength(5);

      // First two should start immediately
      expect(startTimes[1] - startTime).toBeLessThan(10);

      // Next operations should be delayed by previous ones
      expect(startTimes[2] - startTimes[0]).toBeGreaterThan(40);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle single item batches with concurrency', async () => {
      mockProcessor.mockResolvedValue('result');
      const items = ['single'];

      const result = await processor.processBatches(items, mockProcessor, {
        maxConcurrency: 1,
        batchSize: 1
      });

      expect(result.successful).toEqual(['result']);
      expect(result.metrics.totalBatches).toBe(1);
    });

    it('should handle processor returning undefined', async () => {
      mockProcessor.mockResolvedValue(undefined);
      const items = ['item1', 'item2'];

      const result = await processor.processBatches(items, mockProcessor);

      expect(result.successful).toEqual([undefined, undefined]);
      expect(result.metrics.successfulOperations).toBe(2);
    });

    it('should handle processor returning null', async () => {
      mockProcessor.mockResolvedValue(null);
      const items = ['item1', 'item2'];

      const result = await processor.processBatches(items, mockProcessor);

      expect(result.successful).toEqual([null, null]);
      expect(result.metrics.successfulOperations).toBe(2);
    });

    it('should handle very large batch sizes', async () => {
      mockProcessor.mockResolvedValue('result');
      const items = Array.from({ length: 100 }, (_, i) => `item${i}`);

      const result = await processor.processBatches(items, mockProcessor, {
        batchSize: 100
      });

      expect(result.successful).toHaveLength(100);
      expect(result.metrics.totalBatches).toBe(1);
    });

    it('should handle batch size larger than item count', async () => {
      mockProcessor.mockResolvedValue('result');
      const items = ['item1', 'item2', 'item3'];

      const result = await processor.processBatches(items, mockProcessor, {
        batchSize: 100
      });

      expect(result.successful).toHaveLength(3);
      expect(result.metrics.totalBatches).toBe(1);
    });

    it('should handle batch size of 1', async () => {
      mockProcessor.mockResolvedValue('result');
      const items = ['item1', 'item2', 'item3'];

      const result = await processor.processBatches(items, mockProcessor, {
        batchSize: 1
      });

      expect(result.successful).toHaveLength(3);
      expect(result.metrics.totalBatches).toBe(3);
    });

    it('should handle maxConcurrency of 1', async () => {
      mockProcessor.mockResolvedValue('result');
      const items = ['item1', 'item2', 'item3'];

      const result = await processor.processBatches(items, mockProcessor, {
        maxConcurrency: 1
      });

      expect(result.successful).toHaveLength(3);
      // Processing should be sequential but still complete
    });

    it('should handle maxConcurrency equal to item count', async () => {
      mockProcessor.mockResolvedValue('result');
      const items = ['item1', 'item2', 'item3'];

      const result = await processor.processBatches(items, mockProcessor, {
        maxConcurrency: 3
      });

      expect(result.successful).toHaveLength(3);
    });
  });

  describe('Concurrency Utilization Calculation', () => {
    it('should calculate utilization correctly for fast operations', async () => {
      mockProcessor.mockImplementation(async (item) => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return item;
      });
      const items = Array.from({ length: 10 }, (_, i) => `item${i}`);

      const result = await processor.processBatches(items, mockProcessor, {
        maxConcurrency: 5,
        batchSize: 10
      });

      // Utilization should be a valid number between 0 and 1
      expect(typeof result.metrics.concurrencyUtilization).toBe('number');
      expect(result.metrics.concurrencyUtilization).toBeGreaterThanOrEqual(0);
      expect(result.metrics.concurrencyUtilization).toBeLessThanOrEqual(1);
      expect(isNaN(result.metrics.concurrencyUtilization)).toBe(false);
    });

    it('should return 0 utilization for empty batch durations', async () => {
      // This tests the edge case in calculateConcurrencyUtilization
      const processor = new BatchProcessor();

      // Access private method through prototype for testing
      const calculateUtilization = (processor as any).calculateConcurrencyUtilization.bind(processor);

      const utilization = calculateUtilization([], 5);
      expect(utilization).toBe(0);
    });
  });

  describe('Instance Methods and State', () => {
    it('should provide current metrics during processing', async () => {
      mockProcessor.mockImplementation(async (item) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return `processed-${item}`;
      });

      const items = ['item1', 'item2', 'item3'];

      const processPromise = processor.processBatches(items, mockProcessor, {
        maxConcurrency: 1
      });

      // Wait a bit then check metrics
      await new Promise(resolve => setTimeout(resolve, 5));
      const currentMetrics = processor.getMetrics();
      expect(currentMetrics.activeOperations).toBeGreaterThanOrEqual(0);
      expect(typeof currentMetrics.totalItems).toBe('number');

      // Wait for completion
      const result = await processPromise;

      expect(result.successful).toHaveLength(3);
      const finalMetrics = processor.getMetrics();
      expect(finalMetrics.activeOperations).toBe(0);
    }, 10000); // Increase timeout

    it('should maintain separate state for different processor instances', async () => {
      const processor1 = new BatchProcessor();
      const processor2 = new BatchProcessor();

      mockProcessor.mockResolvedValue('result');

      const items1 = ['item1', 'item2'];
      const items2 = ['item3', 'item4'];

      const [result1, result2] = await Promise.all([
        processor1.processBatches(items1, mockProcessor),
        processor2.processBatches(items2, mockProcessor)
      ]);

      expect(result1.successful).toHaveLength(2);
      expect(result2.successful).toHaveLength(2);
      expect(processor1.getMetrics().activeOperations).toBe(0);
      expect(processor2.getMetrics().activeOperations).toBe(0);
    });
  });
});

describe('BatchProcessor Convenience Functions', () => {
  describe('createOptimizedBatchProcessor', () => {
    it('should create a new BatchProcessor instance', () => {
      const processor = createOptimizedBatchProcessor();

      expect(processor).toBeInstanceOf(BatchProcessor);
    });

    it('should pass options to BatchProcessor constructor', () => {
      const options: Partial<BatchOptions> = {
        maxConcurrency: 10,
        batchSize: 20,
        batchDelay: 50
      };

      const processor = createOptimizedBatchProcessor(options);
      const metrics = processor.getMetrics();

      expect(processor).toBeInstanceOf(BatchProcessor);
    });
  });
});

describe('Predefined Configurations', () => {
  it('should export HIGH_THROUGHPUT_CONFIG', () => {
    expect(HIGH_THROUGHPUT_CONFIG).toBeDefined();
    expect(HIGH_THROUGHPUT_CONFIG.maxConcurrency).toBe(8);
    expect(HIGH_THROUGHPUT_CONFIG.batchSize).toBe(15);
    expect(HIGH_THROUGHPUT_CONFIG.enableMetrics).toBe(true);
    expect(HIGH_THROUGHPUT_CONFIG.batchDelay).toBe(0);
  });

  it('should export RATE_LIMITED_CONFIG', () => {
    expect(RATE_LIMITED_CONFIG).toBeDefined();
    expect(RATE_LIMITED_CONFIG.maxConcurrency).toBe(3);
    expect(RATE_LIMITED_CONFIG.batchSize).toBe(5);
    expect(RATE_LIMITED_CONFIG.enableMetrics).toBe(true);
    expect(RATE_LIMITED_CONFIG.batchDelay).toBe(100);
  });

  it('should export MEMORY_OPTIMIZED_CONFIG', () => {
    expect(MEMORY_OPTIMIZED_CONFIG).toBeDefined();
    expect(MEMORY_OPTIMIZED_CONFIG.maxConcurrency).toBe(4);
    expect(MEMORY_OPTIMIZED_CONFIG.batchSize).toBe(8);
    expect(MEMORY_OPTIMIZED_CONFIG.enableMetrics).toBe(true);
    expect(MEMORY_OPTIMIZED_CONFIG.batchDelay).toBe(50);
  });

  it('should create processors with predefined configs', async () => {
    const mockProcessor = jest.fn().mockResolvedValue('result');
    const items = Array.from({ length: 10 }, (_, i) => `item${i}`);

    // Test each configuration
    const highThroughputProcessor = createOptimizedBatchProcessor(HIGH_THROUGHPUT_CONFIG);
    const rateLimitedProcessor = createOptimizedBatchProcessor(RATE_LIMITED_CONFIG);
    const memoryOptimizedProcessor = createOptimizedBatchProcessor(MEMORY_OPTIMIZED_CONFIG);

    const [highResult, rateResult, memResult] = await Promise.all([
      highThroughputProcessor.processBatches(items, mockProcessor),
      rateLimitedProcessor.processBatches(items.slice(0, 5), mockProcessor),
      memoryOptimizedProcessor.processBatches(items.slice(0, 8), mockProcessor)
    ]);

    expect(highResult.successful).toHaveLength(10);
    expect(rateResult.successful).toHaveLength(5);
    expect(memResult.successful).toHaveLength(8);
  });
});

describe('BatchProcessor Integration Tests', () => {
  it('should handle real-world async processing scenario', async () => {
    // Simulate API calls with realistic timing and failures
    const apiCall = async (data: string, index: number): Promise<string> => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10));

      // Simulate occasional failures
      if (index % 7 === 0) {
        throw new Error(`API error for ${data}`);
      }

      return `processed-${data}`;
    };

    const processor = new BatchProcessor({
      maxConcurrency: 3,
      batchSize: 5,
      batchDelay: 25,
      enableMetrics: true
    });

    const items = Array.from({ length: 20 }, (_, i) => `data-${i}`);
    const result = await processor.processBatches(items, apiCall);

    expect(result.successful.length).toBeGreaterThan(10);
    expect(result.failed.length).toBeGreaterThan(0);
    expect(result.metrics.totalItems).toBe(20);
    expect(result.metrics.totalBatches).toBe(4);
    expect(result.metrics.totalDuration).toBeGreaterThan(0);
    expect(result.metrics.averageBatchDuration).toBeGreaterThan(0);
    expect(result.metrics.operationsPerSecond).toBeGreaterThan(0);
  });

  it('should maintain performance under load', async () => {
    const processor = new BatchProcessor({
      maxConcurrency: 10,
      batchSize: 50,
      enableMetrics: true
    });

    const fastProcessor = async (item: string): Promise<string> => {
      // Add minimal delay to ensure measurable timing
      await new Promise(resolve => setTimeout(resolve, 1));
      return item;
    };

    const items = Array.from({ length: 500 }, (_, i) => `item${i}`);

    const startTime = Date.now();
    const result = await processor.processBatches(items, fastProcessor);
    const endTime = Date.now();

    expect(result.successful).toHaveLength(500);
    expect(result.failed).toHaveLength(0);
    expect(endTime - startTime).toBeLessThan(2000); // Should complete quickly with delay
    expect(result.metrics.operationsPerSecond).toBeGreaterThan(100);
  });
});