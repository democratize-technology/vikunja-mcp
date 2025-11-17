/**
 * Tests for Circuit Breaker State Sharing
 * Verifies that circuit breakers share state across operations with the same name
 */

import {
  circuitBreakerRegistry,
  createCircuitBreaker,
  withCircuitBreaker,
  withTaskRetry,
  withBulkRetry,
  CIRCUIT_BREAKER_NAMES,
  RETRY_CONFIG
} from '../../src/utils/retry';
import { MCPError, ErrorCode } from '../../src/types/errors';

describe('Circuit Breaker State Sharing', () => {
  beforeEach(() => {
    // Reset all circuit breakers before each test
    circuitBreakerRegistry.resetAll();

    // Wait a bit for circuit breakers to fully reset
    return new Promise(resolve => setTimeout(resolve, 50));
  });

  describe('Circuit Breaker Registry', () => {
    it('should share state between circuit breakers with same name', async () => {
      const operation1 = async () => 'operation1-result';
      const operation2 = async () => 'operation2-result';

      // Create two circuit breakers with the same name
      const breaker1 = createCircuitBreaker('shared-test', operation1);
      const breaker2 = createCircuitBreaker('shared-test', operation2);

      // They should share the same underlying circuit breaker
      const stats1 = circuitBreakerRegistry.getAllStats();
      expect(stats1).toHaveProperty('shared-test');

      // Both breakers should have the same stats object
      expect(breaker1.stats).toEqual(breaker2.stats);
    });

    it('should maintain separate state for different circuit breaker names', async () => {
      const operation1 = async () => 'operation1-result';
      const operation2 = async () => 'operation2-result';

      // Create two circuit breakers with different names
      const breaker1 = createCircuitBreaker('test-1', operation1);
      const breaker2 = createCircuitBreaker('test-2', operation2);

      // Execute operations to generate different stats
      await breaker1.fire();

      // They should have separate stats
      const stats = circuitBreakerRegistry.getAllStats();
      expect(stats).toHaveProperty('test-1');
      expect(stats).toHaveProperty('test-2');

      // After firing one breaker, stats should be different
      expect(stats['test-1'].successes).toBe(1);
      expect(stats['test-2'].successes).toBe(0);
      expect(stats['test-1']).not.toEqual(stats['test-2']);
    });

    it('should provide access to all circuit breaker stats', () => {
      createCircuitBreaker('test-a', async () => 'result-a');
      createCircuitBreaker('test-b', async () => 'result-b');

      const allStats = circuitBreakerRegistry.getAllStats();

      expect(typeof allStats).toBe('object');
      expect(allStats).toHaveProperty('test-a');
      expect(allStats).toHaveProperty('test-b');

      // Each stats object should have required properties
      expect(allStats['test-a']).toHaveProperty('failures');
      expect(allStats['test-a']).toHaveProperty('successes');
      expect(allStats['test-a']).toHaveProperty('fires');
    });
  });

  describe('withCircuitBreaker Helper', () => {
    it('should use named circuit breaker with shared state', async () => {
      const operation = async () => 'test-result';

      const result1 = await withCircuitBreaker(operation, 'test-shared-circuit');
      expect(result1).toBe('test-result');

      const result2 = await withCircuitBreaker(operation, 'test-shared-circuit');
      expect(result2).toBe('test-result');

      // Both operations should have used the same circuit breaker
      const stats = circuitBreakerRegistry.getAllStats();
      expect(stats).toHaveProperty('test-shared-circuit');
      expect(stats['test-shared-circuit'].successes).toBe(2);
    });

    it('should handle failures and open circuit', async () => {
      let callCount = 0;
      const failingOperation = async () => {
        callCount++;
        if (callCount <= 6) { // Fail enough to open circuit
          throw new Error('Simulated failure');
        }
        return 'success-after-recovery';
      };

      // Create circuit breaker with low failure threshold for testing
      const promise = withCircuitBreaker(failingOperation, 'test-failing-circuit', {
        maxRetries: 0, // Disable retries to test circuit breaker behavior
        maxFailures: 3, // Open after 3 failures
        resetTimeout: 100 // Quick reset for testing
      });

      await expect(promise).rejects.toThrow();

      const stats = circuitBreakerRegistry.getAllStats();
      expect(stats['test-failing-circuit'].failures).toBeGreaterThan(0);
    });
  });

  describe('withTaskRetry Helper', () => {
    it('should use task-specific circuit breaker names', async () => {
      const createOperation = async () => 'task-created';
      const updateOperation = async () => 'task-updated';

      await withTaskRetry(createOperation, 'create');
      await withTaskRetry(updateOperation, 'update');

      const stats = circuitBreakerRegistry.getAllStats();

      // Should have separate circuit breakers for each operation type
      expect(stats).toHaveProperty(CIRCUIT_BREAKER_NAMES.TASK_CREATE);
      expect(stats).toHaveProperty(CIRCUIT_BREAKER_NAMES.TASK_UPDATE);
      expect(stats[CIRCUIT_BREAKER_NAMES.TASK_CREATE].successes).toBe(1);
      expect(stats[CIRCUIT_BREAKER_NAMES.TASK_UPDATE].successes).toBe(1);
    });

    it('should share state for same task operation types', async () => {
      const operation1 = async () => 'task-1-created';
      const operation2 = async () => 'task-2-created';

      // Get initial count to see what we're starting with
      const initialStats = circuitBreakerRegistry.getAllStats();
      const initialSuccesses = initialStats[CIRCUIT_BREAKER_NAMES.TASK_CREATE]?.successes || 0;

      await withTaskRetry(operation1, 'create');
      await withTaskRetry(operation2, 'create');

      const stats = circuitBreakerRegistry.getAllStats();

      // Both should use the same circuit breaker (starting from initial count + 2)
      expect(stats[CIRCUIT_BREAKER_NAMES.TASK_CREATE].successes).toBe(initialSuccesses + 2);
    });
  });

  describe('withBulkRetry Helper', () => {
    it('should use bulk-specific circuit breaker names', async () => {
      const importOperation = async () => 'bulk-imported';
      const exportOperation = async () => 'bulk-exported';

      await withBulkRetry(importOperation, 'import');
      await withBulkRetry(exportOperation, 'export');

      const stats = circuitBreakerRegistry.getAllStats();

      expect(stats).toHaveProperty(CIRCUIT_BREAKER_NAMES.BULK_IMPORT);
      expect(stats).toHaveProperty(CIRCUIT_BREAKER_NAMES.BULK_EXPORT);
      expect(stats[CIRCUIT_BREAKER_NAMES.BULK_IMPORT].successes).toBe(1);
      expect(stats[CIRCUIT_BREAKER_NAMES.BULK_EXPORT].successes).toBe(1);
    });
  });

  describe('RETRY_CONFIG with Circuit Breaker Names', () => {
    it('should include circuit breaker names in configurations', () => {
      expect(RETRY_CONFIG.AUTH_ERRORS).toHaveProperty('circuitBreakerName');
      expect(RETRY_CONFIG.AUTH_ERRORS.circuitBreakerName).toBe(CIRCUIT_BREAKER_NAMES.AUTH_CONNECT);

      expect(RETRY_CONFIG.NETWORK_ERRORS).toHaveProperty('circuitBreakerName');
      expect(RETRY_CONFIG.NETWORK_ERRORS.circuitBreakerName).toBe(CIRCUIT_BREAKER_NAMES.API_OPERATIONS);

      expect(RETRY_CONFIG.TASK_OPERATIONS).toHaveProperty('circuitBreakerName');
      expect(RETRY_CONFIG.TASK_OPERATIONS.circuitBreakerName).toBe(CIRCUIT_BREAKER_NAMES.TASK_CREATE);

      expect(RETRY_CONFIG.BULK_OPERATIONS).toHaveProperty('circuitBreakerName');
      expect(RETRY_CONFIG.BULK_OPERATIONS.circuitBreakerName).toBe(CIRCUIT_BREAKER_NAMES.BULK_OPERATIONS);
    });

    it('should enable circuit breaker in retry configurations', () => {
      expect(RETRY_CONFIG.AUTH_ERRORS.enableCircuitBreaker).toBe(true);
      expect(RETRY_CONFIG.NETWORK_ERRORS.enableCircuitBreaker).toBe(true);
      expect(RETRY_CONFIG.TASK_OPERATIONS.enableCircuitBreaker).toBe(true);
      expect(RETRY_CONFIG.BULK_OPERATIONS.enableCircuitBreaker).toBe(true);
    });
  });

  describe('Circuit Breaker Name Constants', () => {
    it('should provide consistent naming patterns', () => {
      expect(CIRCUIT_BREAKER_NAMES.AUTH_CONNECT).toBe('vikunja-auth-connect');
      expect(CIRCUIT_BREAKER_NAMES.TASK_CREATE).toBe('vikunja-task-create');
      expect(CIRCUIT_BREAKER_NAMES.BULK_OPERATIONS).toBe('vikunja-bulk-operations');
      expect(CIRCUIT_BREAKER_NAMES.API_OPERATIONS).toBe('vikunja-api-operations');
    });

    it('should include all necessary operation categories', () => {
      // Auth operations
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('AUTH_CONNECT');
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('AUTH_REFRESH');
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('AUTH_STATUS');

      // Task operations
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('TASK_CREATE');
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('TASK_UPDATE');
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('TASK_DELETE');
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('TASK_GET');
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('TASK_LIST');

      // Task relationship operations
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('TASK_RELATIONS');
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('TASK_ASSIGNEES');
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('TASK_LABELS');

      // Project operations
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('PROJECT_CRUD');
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('PROJECT_HIERARCHY');
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('PROJECT_SHARING');

      // Bulk operations
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('BULK_OPERATIONS');
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('BULK_IMPORT');
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('BULK_EXPORT');

      // Other operations
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('FILTER_OPERATIONS');
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('API_OPERATIONS');
      expect(CIRCUIT_BREAKER_NAMES).toHaveProperty('CLIENT_OPERATIONS');
    });
  });
});