/**
 * Comprehensive tests for ResponseCache implementation
 * Tests all caching functionality including TTL, LRU eviction, metrics, cleanup, and edge cases
 */

import {
  ResponseCache,
  CacheOptions,
  CacheMetrics,
  taskCache,
  projectCache,
  operationCache,
  createTaskCache,
  AGGRESSIVE_CACHE_CONFIG,
  CONSERVATIVE_CACHE_CONFIG,
} from '../../../src/utils/performance/response-cache';

// Mock logger to prevent test output noise
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('ResponseCache', () => {
  let cache: ResponseCache<string>;

  beforeEach(() => {
    cache = new ResponseCache({
      ttl: 1000,
      maxSize: 3,
      enableMetrics: true,
      cleanupInterval: 0, // Disable automatic cleanup for tests
    });
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('Basic Cache Operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete specific entries', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('TTL (Time-To-Live) Functionality', () => {
    it('should respect default TTL', async () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      // Fast forward time
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should respect custom TTL override', async () => {
      cache.set('key1', 'value1', 500); // 500ms TTL
      expect(cache.get('key1')).toBe('value1');

      await new Promise(resolve => setTimeout(resolve, 600));
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should get remaining TTL', () => {
      cache.set('key1', 'value1');
      const remainingTtl = cache.getRemainingTtl('key1');
      expect(remainingTtl).toBeGreaterThan(900);
      expect(remainingTtl).toBeLessThanOrEqual(1000);
    });

    it('should return 0 TTL for non-existent key', () => {
      expect(cache.getRemainingTtl('nonexistent')).toBe(0);
    });

    it('should return 0 TTL for expired key', async () => {
      cache.set('key1', 'value1', 100);
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(cache.getRemainingTtl('key1')).toBe(0);
    });
  });

  describe('LRU (Least Recently Used) Eviction', () => {
    it('should evict least recently used entry when cache is full', async () => {
      // Fill cache to max size
      cache.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 1)); // Ensure different timestamps
      cache.set('key2', 'value2');
      await new Promise(resolve => setTimeout(resolve, 1));
      cache.set('key3', 'value3');

      // Access key1 to make it recently used
      await new Promise(resolve => setTimeout(resolve, 1));
      cache.get('key1');

      // Add new entry, should evict key2 (least recently used)
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1'); // Still exists
      expect(cache.get('key2')).toBeUndefined(); // Evicted
      expect(cache.get('key3')).toBe('value3'); // Still exists
      expect(cache.get('key4')).toBe('value4'); // New entry
    });

    it('should not evict when updating existing key', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Update existing key - should not trigger eviction
      cache.set('key1', 'updated_value1');

      expect(cache.get('key1')).toBe('updated_value1');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });

    it('should track access time for LRU ordering', async () => {
      cache.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 1));
      cache.set('key2', 'value2');
      await new Promise(resolve => setTimeout(resolve, 1));
      cache.set('key3', 'value3');
      
      // Access key1 multiple times to make it most recently used
      await new Promise(resolve => setTimeout(resolve, 1));
      cache.get('key1');
      await new Promise(resolve => setTimeout(resolve, 1));
      cache.get('key1');

      // Add fourth entry, key2 should be evicted (least recently accessed)
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1'); // Most recently accessed
      expect(cache.get('key2')).toBeUndefined(); // Evicted
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });
  });

  describe('getOrSet Method', () => {
    it('should return cached value on cache hit', async () => {
      const factory = jest.fn().mockResolvedValue('factory_value');
      
      cache.set('key1', 'cached_value');
      const result = await cache.getOrSet('key1', factory);

      expect(result).toBe('cached_value');
      expect(factory).not.toHaveBeenCalled();
    });

    it('should execute factory on cache miss', async () => {
      const factory = jest.fn().mockResolvedValue('factory_value');
      
      const result = await cache.getOrSet('key1', factory);

      expect(result).toBe('factory_value');
      expect(factory).toHaveBeenCalledTimes(1);
      expect(cache.get('key1')).toBe('factory_value');
    });

    it('should cache factory result with custom TTL', async () => {
      const factory = jest.fn().mockResolvedValue('factory_value');
      
      await cache.getOrSet('key1', factory, 500);

      expect(cache.get('key1')).toBe('factory_value');
      
      // Verify TTL was applied
      const remainingTtl = cache.getRemainingTtl('key1');
      expect(remainingTtl).toBeGreaterThan(400);
      expect(remainingTtl).toBeLessThanOrEqual(500);
    });

    it('should propagate factory errors', async () => {
      const factory = jest.fn().mockRejectedValue(new Error('Factory failed'));
      
      await expect(cache.getOrSet('key1', factory)).rejects.toThrow('Factory failed');
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should handle factory timeout gracefully', async () => {
      const factory = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('delayed_value'), 100))
      );

      const result = await cache.getOrSet('key1', factory);
      expect(result).toBe('delayed_value');
    });
  });

  describe('Cache Metrics', () => {
    let metricsCache: ResponseCache<string>;

    beforeEach(() => {
      metricsCache = new ResponseCache({
        ttl: 1000,
        maxSize: 10,
        enableMetrics: true,
        cleanupInterval: 0,
      });
    });

    afterEach(() => {
      metricsCache.destroy();
    });

    it('should track cache hits and misses', async () => {
      const factory = jest.fn().mockResolvedValue('value');

      // Cache miss
      await metricsCache.getOrSet('key1', factory);
      
      // Cache hit
      await metricsCache.getOrSet('key1', factory);
      await metricsCache.getOrSet('key1', factory);

      const metrics = metricsCache.getMetrics();
      expect(metrics.hits).toBe(2);
      expect(metrics.misses).toBe(1);
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.hitRatio).toBeCloseTo(2/3);
      expect(metrics.savedApiCalls).toBe(2);
    });

    it('should track cache size', () => {
      metricsCache.set('key1', 'value1');
      metricsCache.set('key2', 'value2');

      const metrics = metricsCache.getMetrics();
      expect(metrics.cacheSize).toBe(2);

      metricsCache.delete('key1');
      const updatedMetrics = metricsCache.getMetrics();
      expect(updatedMetrics.cacheSize).toBe(1);
    });

    it('should track average response time', async () => {
      const fastFactory = jest.fn().mockResolvedValue('fast');
      const slowFactory = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow'), 50))
      );

      await metricsCache.getOrSet('fast', fastFactory);
      await metricsCache.getOrSet('slow', slowFactory);

      const metrics = metricsCache.getMetrics();
      expect(metrics.averageResponseTime).toBeGreaterThan(0);
    });

    it('should handle metrics when disabled', () => {
      const noMetricsCache = new ResponseCache({
        enableMetrics: false,
        cleanupInterval: 0,
      });

      noMetricsCache.set('key1', 'value1');
      const metrics = noMetricsCache.getMetrics();
      
      // Metrics should still be tracked but not updated
      expect(metrics).toBeDefined();
      expect(metrics.cacheSize).toBe(1);

      noMetricsCache.destroy();
    });
  });

  describe('Pattern Invalidation', () => {
    it('should invalidate entries matching pattern', () => {
      // Use a larger cache to avoid eviction interference
      const patternCache = new ResponseCache({
        ttl: 10000,
        maxSize: 10,
        enableMetrics: true,
        cleanupInterval: 0,
      });

      patternCache.set('user:1:profile', 'profile1');
      patternCache.set('user:2:profile', 'profile2');
      patternCache.set('user:1:settings', 'settings1');
      patternCache.set('product:1:info', 'product1');

      const invalidated = patternCache.invalidatePattern(/^user:\d+:profile$/);

      expect(invalidated).toBe(2);
      expect(patternCache.get('user:1:profile')).toBeUndefined();
      expect(patternCache.get('user:2:profile')).toBeUndefined();
      expect(patternCache.get('user:1:settings')).toBe('settings1');
      expect(patternCache.get('product:1:info')).toBe('product1');

      patternCache.destroy();
    });

    it('should return 0 when no patterns match', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const invalidated = cache.invalidatePattern(/^nonexistent:/);
      expect(invalidated).toBe(0);
    });

    it('should handle complex regex patterns', () => {
      cache.set('task:123:details', 'details');
      cache.set('task:456:summary', 'summary');
      cache.set('project:789:info', 'info');

      const invalidated = cache.invalidatePattern(/^task:\d+:(details|summary)$/);
      expect(invalidated).toBe(2);
      expect(cache.get('project:789:info')).toBe('info');
    });
  });

  describe('Cleanup Operations', () => {
    it('should manually cleanup expired entries', async () => {
      const shortTtlCache = new ResponseCache({
        ttl: 100,
        maxSize: 10,
        cleanupInterval: 0,
      });

      shortTtlCache.set('key1', 'value1');
      shortTtlCache.set('key2', 'value2');
      shortTtlCache.set('key3', 'value3', 200); // Longer TTL

      await new Promise(resolve => setTimeout(resolve, 150));

      const cleaned = shortTtlCache.cleanup();
      expect(cleaned).toBe(2); // key1 and key2 expired
      expect(shortTtlCache.get('key1')).toBeUndefined();
      expect(shortTtlCache.get('key2')).toBeUndefined();
      expect(shortTtlCache.get('key3')).toBe('value3');

      shortTtlCache.destroy();
    });

    it('should return 0 when no entries need cleanup', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const cleaned = cache.cleanup();
      expect(cleaned).toBe(0);
    });

    it('should handle automatic cleanup timer', async () => {
      const autoCleanupCache = new ResponseCache({
        ttl: 50,
        maxSize: 10,
        cleanupInterval: 100,
      });

      autoCleanupCache.set('key1', 'value1');
      
      // Wait for entry to expire and cleanup to run
      await new Promise(resolve => setTimeout(resolve, 200));
      
      expect(autoCleanupCache.get('key1')).toBeUndefined();
      
      autoCleanupCache.destroy();
    });
  });

  describe('Cache Key Utilities', () => {
    it('should create task cache keys', () => {
      const key = ResponseCache.createTaskKey('get', 123);
      expect(key).toBe('task:get:123');

      const keyWithSuffix = ResponseCache.createTaskKey('update', 456, 'status');
      expect(keyWithSuffix).toBe('task:update:456:status');
    });

    it('should create bulk operation cache keys', () => {
      const key = ResponseCache.createBulkKey('status', [3, 1, 2]);
      expect(key).toMatch(/^bulk:status:[a-z0-9]+$/);

      const keyWithField = ResponseCache.createBulkKey('update', [1, 2, 3], 'priority');
      expect(keyWithField).toMatch(/^bulk:update:[a-z0-9]+:priority$/);
    });

    it('should create consistent keys for same bulk operation', () => {
      const key1 = ResponseCache.createBulkKey('get', [1, 2, 3]);
      const key2 = ResponseCache.createBulkKey('get', [3, 2, 1]); // Same IDs, different order
      expect(key1).toBe(key2);
    });

    it('should create project cache keys', () => {
      const key = ResponseCache.createProjectKey('get', 789);
      expect(key).toBe('project:get:789');

      const keyWithSuffix = ResponseCache.createProjectKey('list', 101, 'tasks');
      expect(keyWithSuffix).toBe('project:list:101:tasks');
    });
  });

  describe('Memory Management', () => {
    it('should handle large cache sizes without memory leaks', () => {
      const largeCache = new ResponseCache({
        ttl: 10000,
        maxSize: 1000,
        cleanupInterval: 0,
      });

      // Add many entries
      for (let i = 0; i < 500; i++) {
        largeCache.set(`key${i}`, `value${i}`);
      }

      const metrics = largeCache.getMetrics();
      expect(metrics.cacheSize).toBe(500);

      largeCache.destroy();
    });

    it('should properly cleanup on destroy', () => {
      const timerCache = new ResponseCache({
        cleanupInterval: 100,
      });

      timerCache.set('key1', 'value1');
      expect(timerCache.get('key1')).toBe('value1');

      timerCache.destroy();
      expect(timerCache.get('key1')).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle undefined and null values', () => {
      cache.set('null_key', null as any);
      cache.set('undefined_key', undefined as any);

      expect(cache.get('null_key')).toBeNull();
      expect(cache.get('undefined_key')).toBeUndefined();
    });

    it('should handle invalid TTL values gracefully', () => {
      expect(() => cache.set('key1', 'value1', -100)).not.toThrow();
      expect(() => cache.set('key2', 'value2', 0)).not.toThrow();
    });

    it('should handle concurrent access patterns', async () => {
      const concurrentCache = new ResponseCache({
        ttl: 10000,
        maxSize: 10,
        enableMetrics: true,
        cleanupInterval: 0,
      });

      const factory1 = jest.fn().mockResolvedValue('value1');
      const factory2 = jest.fn().mockResolvedValue('value2');
      const factory3 = jest.fn().mockResolvedValue('value3');

      // Simulate concurrent requests for different keys
      const promises = [
        concurrentCache.getOrSet('key1', factory1),
        concurrentCache.getOrSet('key2', factory2),
        concurrentCache.getOrSet('key3', factory3),
        concurrentCache.getOrSet('key1', factory1), // Should hit cache
        concurrentCache.getOrSet('key2', factory2), // Should hit cache
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      
      // Each factory should be called only once
      expect(factory1).toHaveBeenCalledTimes(1);
      expect(factory2).toHaveBeenCalledTimes(1);
      expect(factory3).toHaveBeenCalledTimes(1);

      concurrentCache.destroy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string keys', () => {
      cache.set('', 'empty_key_value');
      expect(cache.get('')).toBe('empty_key_value');
    });

    it('should handle very long keys', () => {
      const longKey = 'a'.repeat(1000);
      cache.set(longKey, 'long_key_value');
      expect(cache.get(longKey)).toBe('long_key_value');
    });

    it('should handle complex object values', () => {
      const complexValue = {
        nested: { data: [1, 2, 3] },
        date: new Date(),
        func: () => 'test',
      };

      cache.set('complex', complexValue as any);
      const retrieved = cache.get('complex') as any;
      
      expect(retrieved.nested.data).toEqual([1, 2, 3]);
      expect(retrieved.date).toBeInstanceOf(Date);
      expect(typeof retrieved.func).toBe('function');
    });

    it('should handle zero maxSize gracefully', () => {
      const zeroSizeCache = new ResponseCache({
        maxSize: 0,
        cleanupInterval: 0,
      });

      expect(() => zeroSizeCache.set('key1', 'value1')).not.toThrow();
      zeroSizeCache.destroy();
    });
  });

  describe('Exported Cache Instances', () => {
    it('should provide working pre-configured cache instances', () => {
      expect(taskCache).toBeInstanceOf(ResponseCache);
      expect(projectCache).toBeInstanceOf(ResponseCache);
      expect(operationCache).toBeInstanceOf(ResponseCache);

      taskCache.set('test_key', 'test_value');
      expect(taskCache.get('test_key')).toBe('test_value');
      taskCache.delete('test_key');
    });

    it('should create cache with createTaskCache factory', () => {
      const customCache = createTaskCache({
        ttl: 5000,
        maxSize: 100,
      });

      expect(customCache).toBeInstanceOf(ResponseCache);
      customCache.destroy();
    });

    it('should provide valid configuration presets', () => {
      const aggressiveCache = new ResponseCache(AGGRESSIVE_CACHE_CONFIG);
      const conservativeCache = new ResponseCache(CONSERVATIVE_CACHE_CONFIG);

      expect(aggressiveCache.getMetrics().cacheSize).toBe(0);
      expect(conservativeCache.getMetrics().cacheSize).toBe(0);

      aggressiveCache.destroy();
      conservativeCache.destroy();
    });
  });

  describe('Thread Safety Simulation', () => {
    it('should handle rapid concurrent operations', async () => {
      const threadCache = new ResponseCache({
        ttl: 10000,
        maxSize: 20,
        enableMetrics: true,
        cleanupInterval: 0,
      });

      const factoryMap = new Map<string, jest.Mock>();
      
      // Create separate mock for each unique key
      for (let i = 0; i < 10; i++) {
        const key = `concurrent_${i}`;
        factoryMap.set(key, jest.fn().mockResolvedValue(`value_${i}`));
      }

      const operations = [];

      // Simulate rapid concurrent sets and gets
      for (let i = 0; i < 100; i++) {
        const key = `concurrent_${i % 10}`;
        const factory = factoryMap.get(key)!;
        operations.push(threadCache.getOrSet(key, factory));
      }

      const results = await Promise.all(operations);
      expect(results).toHaveLength(100);
      
      // Each unique key should have been processed only once
      factoryMap.forEach(factory => {
        expect(factory).toHaveBeenCalledTimes(1);
      });

      threadCache.destroy();
    });

    it('should maintain consistency during cleanup operations', async () => {
      const concurrentCache = new ResponseCache({
        ttl: 100,
        maxSize: 50,
        cleanupInterval: 50,
      });

      // Add entries while cleanup is running
      const addOperations = Array.from({ length: 20 }, (_, i) => 
        new Promise<void>(resolve => {
          setTimeout(() => {
            concurrentCache.set(`key${i}`, `value${i}`);
            resolve();
          }, Math.random() * 150);
        })
      );

      await Promise.all(addOperations);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Cache should still be functional
      concurrentCache.set('final_test', 'final_value');
      expect(concurrentCache.get('final_test')).toBe('final_value');

      concurrentCache.destroy();
    });
  });

  describe('Performance Characteristics', () => {
    it('should handle large cache sizes efficiently', () => {
      const perfCache = new ResponseCache({
        maxSize: 10000,
        cleanupInterval: 0,
      });

      // Add many entries to test scalability
      for (let i = 0; i < 1000; i++) {
        perfCache.set(`key_${i}`, `value_${i}`);
      }

      // Test basic operations still work efficiently
      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        perfCache.get(`key_${i}`);
        perfCache.set(`new_key_${i}`, `new_value_${i}`);
      }
      const duration = Date.now() - start;

      // Should complete within reasonable time (not be exponentially slow)
      expect(duration).toBeLessThan(1000); // 1 second should be more than enough

      perfCache.destroy();
    });

    it('should handle memory pressure gracefully', () => {
      const memoryCache = new ResponseCache({
        maxSize: 100,
        cleanupInterval: 0,
      });

      // Add more entries than max size
      for (let i = 0; i < 200; i++) {
        memoryCache.set(`memory_${i}`, `value_${i}`);
      }

      const metrics = memoryCache.getMetrics();
      expect(metrics.cacheSize).toBeLessThanOrEqual(100);

      memoryCache.destroy();
    });
  });
});