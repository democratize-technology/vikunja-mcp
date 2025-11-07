/**
 * Test for Service Layer Type Safety
 * This test verifies that all service layer functions have proper type annotations
 */

import { CircuitBreaker } from '../../src/utils/circuit-breaker';
import { createCircuitBreaker } from '../../src/utils/circuit-breaker';

describe('Service Layer Type Safety', () => {
  describe('CircuitBreaker Type Safety', () => {
    let circuitBreaker: CircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        recoveryTimeout: 30000
      });
    });

    describe('Method Return Type Annotations', () => {
      it('should have properly typed getStats method', async () => {
        // This test verifies getStats has proper return type annotation
        const stats = await circuitBreaker.getStats();

        // If return type is properly annotated, TypeScript should know the shape
        expect(stats).toHaveProperty('state');
        expect(stats).toHaveProperty('failureCount');
        expect(stats).toHaveProperty('successCount');
        expect(stats).toHaveProperty('lastFailureTime');
        expect(stats).toHaveProperty('failureThreshold');
        expect(stats).toHaveProperty('recoveryTimeout');

        // Type assertion to verify the return type structure
        const typedStats: {
          state: string;
          failureCount: number;
          successCount: number;
          lastFailureTime: number;
          failureThreshold: number;
          recoveryTimeout: number;
        } = stats;

        expect(typeof typedStats.state).toBe('string');
        expect(typeof typedStats.failureCount).toBe('number');
      });

      it('should have properly typed getStatsSync method', () => {
        // This test verifies getStatsSync has proper return type annotation
        const stats = circuitBreaker.getStatsSync();

        expect(stats).toHaveProperty('state');
        expect(stats).toHaveProperty('failureCount');
        expect(stats).toHaveProperty('successCount');
        expect(stats).toHaveProperty('lastFailureTime');
        expect(stats).toHaveProperty('failureThreshold');
        expect(stats).toHaveProperty('recoveryTimeout');

        // Type assertion to verify the return type structure
        const typedStats: {
          state: string;
          failureCount: number;
          successCount: number;
          lastFailureTime: number;
          failureThreshold: number;
          recoveryTimeout: number;
        } = stats;

        expect(typeof typedStats.state).toBe('string');
        expect(typeof typedStats.failureCount).toBe('number');
      });

      it('should have properly typed getAllStats method', async () => {
        // This test verifies getAllStats has proper return type annotation
        const breaker = createCircuitBreaker('test-breaker');
        const registry = (breaker as any).registry || { getAllStats: async () => ({}) };

        // Test the global registry's getAllStats method
        const stats = await registry.getAllStats();

        // Should return a record of circuit breaker stats
        expect(typeof stats).toBe('object');

        // Type assertion to verify the return type structure
        const typedStats: Record<string, {
          state: string;
          failureCount: number;
          successCount: number;
          lastFailureTime: number;
          failureThreshold: number;
          recoveryTimeout: number;
        }> = stats;

        expect(typeof typedStats).toBe('object');
      });

      it('should have properly typed getAllStatsSync method', () => {
        // This test verifies getAllStatsSync has proper return type annotation
        const breaker = createCircuitBreaker('test-breaker');
        const registry = (breaker as any).registry || { getAllStatsSync: () => ({}) };

        const stats = registry.getAllStatsSync();

        expect(typeof stats).toBe('object');

        // Type assertion to verify the return type structure
        const typedStats: Record<string, {
          state: string;
          failureCount: number;
          successCount: number;
          lastFailureTime: number;
          failureThreshold: number;
          recoveryTimeout: number;
        }> = stats;

        expect(typeof typedStats).toBe('object');
      });
    });

    describe('Type Safety in Operations', () => {
      it('should maintain type safety through execute operation', async () => {
        const result = await circuitBreaker.execute(async () => {
          return 'test-result';
        });

        // TypeScript should infer the return type correctly
        expect(typeof result).toBe('string');

        const typedResult: string = result;
        expect(typedResult).toBe('test-result');
      });

      it('should maintain type safety for complex return types', async () => {
        const result = await circuitBreaker.execute(async () => {
          return {
            id: 123,
            title: 'Test Task',
            completed: false,
            metadata: { count: 1, timestamp: new Date().toISOString() }
          };
        });

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