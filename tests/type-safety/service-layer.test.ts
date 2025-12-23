/**
 * Test for Service Layer Type Safety
 * This test verifies that all service layer functions have proper type annotations
 */

import { createCircuitBreaker, circuitBreakerRegistry } from '../../src/utils/retry';
import type { CircuitBreaker as OpossumCircuitBreaker } from 'opossum';

describe('Service Layer Type Safety', () => {
  describe('CircuitBreaker Type Safety', () => {
    let circuitBreaker: OpossumCircuitBreaker;

    beforeEach(() => {
      circuitBreaker = createCircuitBreaker(
        'test-breaker',
        async () => { /* placeholder operation */ },
        {
          timeout: 30000,
          resetTimeout: 30000,
          maxFailures: 5
        }
      );
    });

    describe('Method Return Type Annotations', () => {
      it('should have properly typed getStats method', async () => {
        // This test verifies opossum getStats has proper return type annotation
        const stats = circuitBreaker.stats;
        const opened = circuitBreaker.opened;
        const closed = circuitBreaker.closed;
        const halfOpen = circuitBreaker.halfOpen;

        // If return type is properly annotated, TypeScript should know the shape
        expect(typeof opened).toBe('boolean');
        expect(typeof closed).toBe('boolean');
        expect(typeof halfOpen).toBe('boolean');
        expect(stats).toHaveProperty('failures');
        expect(stats).toHaveProperty('fires');
        expect(stats).toHaveProperty('successes');
        expect(stats).toHaveProperty('timeouts');
        expect(stats).toHaveProperty('rejects');

        // Type assertion to verify the return type structure
        const typedStats: {
          failures: number;
          fires: number;
          successes: number;
          timeouts: number;
          rejects: number;
          latencyMean: number;
          latencyTimes: number[];
          percentiles: Record<string, number>;
        } = stats;

        expect(typeof typedStats.failures).toBe('number');
        expect(typeof typedStats.successes).toBe('number');
      });

      it('should have properly typed getAllStats method', async () => {
        // Test the global registry's getAllStats method
        const stats = circuitBreakerRegistry.getAllStats();

        // Should return a record of circuit breaker stats
        expect(typeof stats).toBe('object');

        // Type assertion to verify the return type structure
        const typedStats: Record<string, {
          failures: number;
          fires: number;
          successes: number;
          timeouts: number;
          rejects: number;
          latencyMean: number;
          latencyTimes: number[];
          percentiles: Record<string, number>;
        }> = stats;

        expect(typeof typedStats).toBe('object');
      });

      it('should have properly typed getAllStatsSync method', () => {
        // Test the global registry's getAllStatsSync method
        const stats = circuitBreakerRegistry.getAllStatsSync();

        expect(typeof stats).toBe('object');

        // Type assertion to verify the return type structure
        const typedStats: Record<string, {
          failures: number;
          fires: number;
          successes: number;
          timeouts: number;
          rejects: number;
          latencyMean: number;
          latencyTimes: number[];
          percentiles: Record<string, number>;
        }> = stats;

        expect(typeof typedStats).toBe('object');
      });
    });

    describe('Type Safety in Operations', () => {
      it('should maintain type safety through fire operation', async () => {
        // Create a new circuit breaker for this specific operation
        const testBreaker = createCircuitBreaker(
          async () => {
            return 'test-result';
          },
          'test-fire-operation',
          {
            timeout: 30000,
            resetTimeout: 30000
          }
        );

        const result = await testBreaker.fire();

        // TypeScript should infer the return type correctly
        expect(typeof result).toBe('string');

        const typedResult: string = result;
        expect(typedResult).toBe('test-result');
      });

      it('should maintain type safety for complex return types', async () => {
        // Create a new circuit breaker for this specific operation
        const testBreaker = createCircuitBreaker(
          async () => {
            return {
              id: 123,
              title: 'Test Task',
              completed: false,
              metadata: { count: 1, timestamp: new Date().toISOString() }
            };
          },
          'test-complex-operation',
          {
            timeout: 30000,
            resetTimeout: 30000
          }
        );

        const result = await testBreaker.fire();

        // TypeScript should infer complex return types correctly
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('completed');
        expect(result).toHaveProperty('metadata');

        const typedResult: {
          id: number;
          title: string;
          completed: boolean;
          metadata: { count: number; timestamp: string };
        } = result;

        expect(typeof typedResult.id).toBe('number');
        expect(typeof typedResult.title).toBe('string');
        expect(typeof typedResult.completed).toBe('boolean');
      });
    });
  });
});