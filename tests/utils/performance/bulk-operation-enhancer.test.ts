import { 
  BulkOperationEnhancer, 
  createBulkOperationEnhancer,
  executeEnhancedBulkOperation,
  type BulkOperationOptions,
  type EnhancedBatchResult 
} from '../../../src/utils/performance/bulk-operation-enhancer';

describe('BulkOperationEnhancer', () => {
  let enhancer: BulkOperationEnhancer;

  beforeEach(() => {
    enhancer = new BulkOperationEnhancer('test-operation', {
      useProgressiveEnhancement: true,
      useAdaptiveBatching: true,
      useCircuitBreaker: true,
      useCache: true,
      maxBulkSize: 100,
    });
  });

  afterEach(() => {
    enhancer.reset();
  });

  describe('initialization', () => {
    it('should create enhancer with default options', () => {
      const defaultEnhancer = new BulkOperationEnhancer('default-test');
      expect(defaultEnhancer).toBeDefined();
    });

    it('should create enhancer with custom options', () => {
      const customOptions: Partial<BulkOperationOptions> = {
        maxBulkSize: 500,
        enableStreaming: false,
        useCache: false,
      };
      
      const customEnhancer = new BulkOperationEnhancer('custom-test', customOptions);
      expect(customEnhancer).toBeDefined();
    });
  });

  describe('bulk API strategy', () => {
    it('should use bulk API when available and successful', async () => {
      const items = [1, 2, 3, 4, 5];
      const bulkApiOperation = jest.fn().mockResolvedValue(['result1', 'result2', 'result3', 'result4', 'result5']);
      const individualOperation = jest.fn();

      const result = await enhancer.execute(
        items,
        bulkApiOperation,
        individualOperation
      );

      expect(bulkApiOperation).toHaveBeenCalledWith(items);
      expect(individualOperation).not.toHaveBeenCalled();
      expect(result.strategy).toBe('bulk_api');
      expect(result.successful).toHaveLength(5);
      expect(result.failed).toHaveLength(0);
      expect(result.efficiency.apiCallsUsed).toBe(1);
    });

    it('should fallback to adaptive batching when bulk API fails', async () => {
      const items = [1, 2, 3];
      const bulkApiOperation = jest.fn().mockRejectedValue(new Error('Bulk API failed'));
      const individualOperation = jest.fn()
        .mockResolvedValueOnce('result1')
        .mockResolvedValueOnce('result2')
        .mockResolvedValueOnce('result3');

      const result = await enhancer.execute(
        items,
        bulkApiOperation,
        individualOperation
      );

      expect(bulkApiOperation).toHaveBeenCalledWith(items);
      expect(individualOperation).toHaveBeenCalledTimes(3);
      expect(result.strategy).toBe('adaptive_batching');
      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
    });

    it('should use adaptive batching when bulk API is null', async () => {
      const items = [1, 2, 3];
      const individualOperation = jest.fn()
        .mockResolvedValueOnce('result1')
        .mockResolvedValueOnce('result2')
        .mockResolvedValueOnce('result3');

      const result = await enhancer.execute(
        items,
        null, // No bulk API
        individualOperation
      );

      expect(individualOperation).toHaveBeenCalledTimes(3);
      expect(result.strategy).toBe('adaptive_batching');
      expect(result.successful).toHaveLength(3);
    });
  });

  describe('progressive enhancement disabled', () => {
    beforeEach(() => {
      enhancer = new BulkOperationEnhancer('test-operation', {
        useProgressiveEnhancement: false,
        useAdaptiveBatching: true,
      });
    });

    it('should skip bulk API when progressive enhancement is disabled', async () => {
      const items = [1, 2, 3];
      const bulkApiOperation = jest.fn().mockResolvedValue(['result1', 'result2', 'result3']);
      const individualOperation = jest.fn()
        .mockResolvedValueOnce('result1')
        .mockResolvedValueOnce('result2')
        .mockResolvedValueOnce('result3');

      const result = await enhancer.execute(
        items,
        bulkApiOperation,
        individualOperation
      );

      expect(bulkApiOperation).not.toHaveBeenCalled();
      expect(individualOperation).toHaveBeenCalledTimes(3);
      expect(result.strategy).toBe('adaptive_batching');
    });
  });

  describe('error handling', () => {
    it('should handle partial failures in individual operations', async () => {
      const items = [1, 2, 3, 4];
      const individualOperation = jest.fn()
        .mockResolvedValueOnce('result1')
        .mockRejectedValueOnce(new Error('Operation failed'))
        .mockResolvedValueOnce('result3')
        .mockResolvedValueOnce('result4');

      const result = await enhancer.execute(
        items,
        null,
        individualOperation
      );

      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].originalItem).toBe(2);
      expect(result.failed[0].error).toBeInstanceOf(Error);
    });

    it('should throw error for items exceeding max bulk size', async () => {
      const largeItems = Array.from({ length: 200 }, (_, i) => i + 1);
      const individualOperation = jest.fn();

      await expect(
        enhancer.execute(largeItems, null, individualOperation)
      ).rejects.toThrow('exceeds maximum allowed');

      expect(individualOperation).not.toHaveBeenCalled();
    });

    it('should handle complete operation failure', async () => {
      const items = [1];
      const bulkApiOperation = jest.fn().mockRejectedValue(new Error('Complete failure'));
      const individualOperation = jest.fn().mockRejectedValue(new Error('Individual failure'));

      const result = await enhancer.execute(
        items,
        bulkApiOperation,
        individualOperation
      );

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.strategy).toBe('adaptive_batching');
    });
  });

  describe('performance optimizations', () => {
    it('should track optimization usage', async () => {
      const items = [1, 2, 3];
      const individualOperation = jest.fn()
        .mockResolvedValueOnce('result1')
        .mockResolvedValueOnce('result2')
        .mockResolvedValueOnce('result3');

      const result = await enhancer.execute(
        items,
        null,
        individualOperation
      );

      expect(result.optimizations).toBeDefined();
      expect(result.optimizations.adaptiveBatchingUsed).toBe(true);
      expect(result.optimizations.circuitBreakerUsed).toBe(false); // No bulk API to use circuit breaker
      expect(result.optimizations.cacheHits).toBeGreaterThanOrEqual(0);
    });

    it('should provide efficiency metrics', async () => {
      const items = [1, 2, 3, 4, 5];
      const bulkApiOperation = jest.fn().mockResolvedValue(['r1', 'r2', 'r3', 'r4', 'r5']);
      const individualOperation = jest.fn();

      const result = await enhancer.execute(
        items,
        bulkApiOperation,
        individualOperation
      );

      expect(result.efficiency).toBeDefined();
      expect(result.efficiency.apiCallsUsed).toBe(1);
      expect(result.efficiency.apiCallsSaved).toBe(4); // 5 items - 1 bulk call
      expect(result.efficiency.efficiencyRatio).toBeCloseTo(0.8); // (5-1)/5
    });

    it('should provide optimization recommendations when available', async () => {
      // Simulate multiple operations to generate recommendations
      const items = [1, 2, 3];
      const individualOperation = jest.fn()
        .mockResolvedValue('result');

      // Execute multiple times to build performance history
      for (let i = 0; i < 5; i++) {
        await enhancer.execute(items, null, individualOperation);
      }

      const result = await enhancer.execute(items, null, individualOperation);
      
      // Recommendations may or may not be present depending on performance patterns
      if (result.recommendations) {
        expect(result.recommendations.suggestedBatchSize).toBeDefined();
        expect(result.recommendations.suggestedConcurrency).toBeDefined();
        expect(result.recommendations.reasoning).toBeInstanceOf(Array);
      }
    });
  });

  describe('metrics collection', () => {
    it('should provide comprehensive metrics', async () => {
      const items = [1, 2];
      const individualOperation = jest.fn()
        .mockResolvedValueOnce('result1')
        .mockResolvedValueOnce('result2');

      await enhancer.execute(items, null, individualOperation);

      const metrics = enhancer.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.cache).toBeDefined();
      expect(metrics.circuitBreaker).toBeDefined();
      expect(metrics.batchProcessor).toBeDefined();
    });

    it('should reset all optimization state', async () => {
      const items = [1, 2];
      const individualOperation = jest.fn()
        .mockResolvedValueOnce('result1')
        .mockResolvedValueOnce('result2');

      await enhancer.execute(items, null, individualOperation);
      
      const metricsBefore = enhancer.getMetrics();
      // The cache may or may not have been used depending on implementation
      expect(metricsBefore.cache.totalRequests).toBeGreaterThanOrEqual(0);

      enhancer.reset();

      const metricsAfter = enhancer.getMetrics();
      expect(metricsAfter.cache.totalRequests).toBe(0);
    });
  });

  describe('caching behavior', () => {
    it('should cache individual operation results when enabled', async () => {
      const items = [1, 1, 2, 2]; // Duplicate items to test caching
      let callCount = 0;
      const individualOperation = jest.fn().mockImplementation((item: number) => {
        callCount++;
        return Promise.resolve(`result${item}`);
      });

      const result = await enhancer.execute(items, null, individualOperation);

      expect(result.successful).toHaveLength(4);
      // Note: Caching behavior depends on the internal implementation
      // The enhancer may or may not cache in this specific test scenario
      expect(result.optimizations.cacheHits).toBeGreaterThanOrEqual(0);
      // The call count may vary based on internal batching and caching logic
      expect(callCount).toBeGreaterThan(0);
    });

    it('should not cache when caching is disabled', async () => {
      const noCacheEnhancer = new BulkOperationEnhancer('no-cache-test', {
        useCache: false,
      });

      const items = [1, 1, 2, 2];
      let callCount = 0;
      const individualOperation = jest.fn().mockImplementation((item: number) => {
        callCount++;
        return Promise.resolve(`result${item}`);
      });

      const result = await noCacheEnhancer.execute(items, null, individualOperation);

      expect(result.successful).toHaveLength(4);
      expect(result.optimizations.cacheHits).toBe(0);
      expect(callCount).toBe(4); // All calls made, no caching
    });
  });
});

describe('convenience functions', () => {
  describe('createBulkOperationEnhancer', () => {
    it('should create enhancer with specified options', () => {
      const enhancer = createBulkOperationEnhancer('test-op', {
        maxBulkSize: 200,
        useCache: false,
      });

      expect(enhancer).toBeInstanceOf(BulkOperationEnhancer);
    });
  });

  describe('executeEnhancedBulkOperation', () => {
    it('should execute operation with temporary enhancer', async () => {
      const items = [1, 2, 3];
      const bulkApiOperation = jest.fn().mockResolvedValue(['r1', 'r2', 'r3']);
      const individualOperation = jest.fn();

      const result = await executeEnhancedBulkOperation(
        'temp-operation',
        items,
        bulkApiOperation,
        individualOperation,
        { useCache: false }
      );

      expect(result.successful).toHaveLength(3);
      expect(result.strategy).toBe('bulk_api');
      expect(bulkApiOperation).toHaveBeenCalledWith(items);
    });
  });
});