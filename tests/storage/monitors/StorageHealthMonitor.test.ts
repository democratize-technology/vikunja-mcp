/**
 * StorageHealthMonitor comprehensive test suite
 *
 * This test suite validates all functionality of the StorageHealthMonitor including:
 * - Health check strategies and their execution
 * - Configuration management and updates
 * - Statistics tracking and trend analysis
 * - Alert handling and recovery mechanisms
 * - Thread safety and concurrent access
 * - Performance monitoring and caching
 * - Edge cases and error conditions
 */

import { StorageHealthMonitor } from '../../../src/storage/monitors/StorageHealthMonitor';
import type { StorageAdapter } from '../../../src/storage/interfaces';
import type {
  HealthStatus,
  HealthCheckStrategy,
  HealthAlert,
  IHealthCheckStrategy,
} from '../../../src/storage/monitors/interfaces/StorageHealthMonitor';
import { SavedFilter } from '../../../src/types/filters';

describe('StorageHealthMonitor', () => {
  let monitor: StorageHealthMonitor;
  let mockAdapter: jest.Mocked<StorageAdapter>;
  let testFilter: SavedFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockAdapter = {
      initialize: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByName: jest.fn(),
      getByProject: jest.fn(),
      clear: jest.fn(),
      getStats: jest.fn(),
      close: jest.fn(),
      healthCheck: jest.fn(),
    };

    testFilter = {
      id: 'test-filter-1',
      name: 'Test Filter',
      description: 'Test filter for monitoring',
      filter: { projectId: 123 },
      ownerId: 1,
      created: new Date(),
      updated: new Date(),
    };

    monitor = new StorageHealthMonitor({
      checkInterval: 1000, // 1 second for faster tests
      failureThreshold: 3,
      recoveryThreshold: 2,
      responseTimeThreshold: 500,
      trendWindowSize: 5,
      healthCacheTTL: 500,
      enableAutoRecovery: true,
      maxRecoveryAttempts: 2,
      enableDebugLogging: false,
    });
  });

  afterEach(async () => {
    jest.useRealTimers();
    await monitor.stopMonitoring();
  });

  describe('Basic Health Monitoring', () => {
    it('should start and stop monitoring correctly', async () => {
      mockAdapter.healthCheck.mockResolvedValue({
        healthy: true,
        details: { test: 'data' },
      });

      await monitor.startMonitoring(mockAdapter);
      expect(monitor.isMonitoring()).toBe(true);

      await monitor.stopMonitoring();
      expect(monitor.isMonitoring()).toBe(false);
    });

    it('should handle multiple start attempts gracefully', async () => {
      mockAdapter.healthCheck.mockResolvedValue({
        healthy: true,
        details: {},
      });

      await monitor.startMonitoring(mockAdapter);
      await monitor.startMonitoring(mockAdapter); // Should not throw

      expect(monitor.isMonitoring()).toBe(true);
    });

    it('should handle stopping when not monitoring', async () => {
      await monitor.stopMonitoring(); // Should not throw
      expect(monitor.isMonitoring()).toBe(false);
    });

    it('should perform initial health check when starting', async () => {
      mockAdapter.healthCheck.mockResolvedValue({
        healthy: true,
        details: { initialized: true },
      });

      await monitor.startMonitoring(mockAdapter);

      expect(mockAdapter.healthCheck).toHaveBeenCalledTimes(1);
      expect(monitor.getCurrentHealth()?.healthy).toBe(true);
    });
  });

  describe('Health Check Strategies', () => {
    beforeEach(async () => {
      await monitor.startMonitoring(mockAdapter);
    });

    it('should execute ping strategy successfully', async () => {
      mockAdapter.healthCheck.mockResolvedValue({
        healthy: true,
        details: { ping: 'success' },
      });

      const result = await monitor.checkHealth('ping');

      expect(result.strategy).toBe('ping');
      expect(result.healthy).toBe(true);
      expect(result.metrics.responseTime).toBeGreaterThanOrEqual(0);
      expect(mockAdapter.healthCheck).toHaveBeenCalledTimes(1);
    });

    it('should execute read strategy successfully', async () => {
      mockAdapter.list.mockResolvedValue([testFilter]);

      const result = await monitor.checkHealth('read');

      expect(result.strategy).toBe('read');
      expect(result.healthy).toBe(true);
      expect(result.details?.operation).toBe('list_filters');
      expect(mockAdapter.list).toHaveBeenCalledTimes(1);
    });

    it('should execute write strategy successfully', async () => {
      mockAdapter.create.mockResolvedValue(testFilter);
      mockAdapter.delete.mockResolvedValue(undefined);

      const result = await monitor.checkHealth('write');

      expect(result.strategy).toBe('write');
      expect(result.healthy).toBe(true);
      expect(result.details?.operation).toBe('create_delete_filter');
      expect(mockAdapter.create).toHaveBeenCalledTimes(1);
      expect(mockAdapter.delete).toHaveBeenCalledWith(testFilter.id);
    });

    it('should execute comprehensive strategy successfully', async () => {
      mockAdapter.healthCheck.mockResolvedValue({ healthy: true, details: {} });
      mockAdapter.list.mockResolvedValue([testFilter]);
      mockAdapter.create.mockResolvedValue(testFilter);
      mockAdapter.delete.mockResolvedValue(undefined);

      const result = await monitor.checkHealth('comprehensive');

      expect(result.strategy).toBe('comprehensive');
      expect(result.healthy).toBe(true);
      expect(result.details?.successCount).toBe(3);
      expect(result.details?.failedCount).toBe(0);
    });

    it('should handle strategy execution failures', async () => {
      mockAdapter.healthCheck.mockRejectedValue(new Error('Connection failed'));

      const result = await monitor.checkHealth('ping');

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Connection failed');
      expect(result.consecutiveFailures).toBe(1);
    });

    it('should use default strategy when none specified', async () => {
      mockAdapter.healthCheck.mockResolvedValue({ healthy: true, details: {} });

      const result = await monitor.checkHealth();

      expect(result.strategy).toBe('ping'); // Default strategy
    });
  });

  describe('Configuration Management', () => {
    it('should use default configuration when none provided', () => {
      const defaultMonitor = new StorageHealthMonitor();
      const config = defaultMonitor.getConfig();

      expect(config.checkInterval).toBe(30000);
      expect(config.failureThreshold).toBe(3);
      expect(config.defaultStrategy).toBe('ping');
    });

    it('should merge provided configuration with defaults', () => {
      const customMonitor = new StorageHealthMonitor({
        checkInterval: 60000,
        failureThreshold: 5,
      });

      const config = customMonitor.getConfig();

      expect(config.checkInterval).toBe(60000);
      expect(config.failureThreshold).toBe(5);
      expect(config.recoveryThreshold).toBe(2); // Default value
    });

    it('should update configuration at runtime', async () => {
      await monitor.startMonitoring(mockAdapter);

      monitor.updateConfig({
        checkInterval: 2000,
        failureThreshold: 10,
      });

      const config = monitor.getConfig();
      expect(config.checkInterval).toBe(2000);
      expect(config.failureThreshold).toBe(10);
    });

    it('should restart monitoring interval when check interval changes', async () => {
      mockAdapter.healthCheck.mockResolvedValue({ healthy: true, details: {} });

      await monitor.startMonitoring(mockAdapter);

      // Change interval
      monitor.updateConfig({ checkInterval: 2000 });

      // Advance time to trigger new interval
      jest.advanceTimersByTime(2000);

      // Should have been called with new interval
      expect(mockAdapter.healthCheck).toHaveBeenCalledTimes(2); // Initial + new interval
    });
  });

  describe('Statistics Tracking', () => {
    beforeEach(async () => {
      await monitor.startMonitoring(mockAdapter);
    });

    it('should track basic statistics correctly', async () => {
      mockAdapter.healthCheck.mockResolvedValue({ healthy: true, details: {} });

      await monitor.checkHealth();
      await monitor.checkHealth();

      const stats = monitor.getStats();

      expect(stats.totalChecks).toBe(2);
      expect(stats.successfulChecks).toBe(2);
      expect(stats.failedChecks).toBe(0);
      expect(stats.averageResponseTime).toBeGreaterThan(0);
    });

    it('should track failures correctly', async () => {
      mockAdapter.healthCheck.mockRejectedValue(new Error('Test failure'));

      await monitor.checkHealth();
      await monitor.checkHealth();

      const stats = monitor.getStats();

      expect(stats.totalChecks).toBe(2);
      expect(stats.successfulChecks).toBe(0);
      expect(stats.failedChecks).toBe(2);
      expect(stats.currentConsecutiveFailures).toBe(2);
    });

    it('should track response time statistics', async () => {
      // Simulate different response times
      mockAdapter.healthCheck.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { healthy: true, details: {} };
      });

      await monitor.checkHealth();

      mockAdapter.healthCheck.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { healthy: true, details: {} };
      });

      await monitor.checkHealth();

      const stats = monitor.getStats();

      expect(stats.minResponseTime).toBeGreaterThanOrEqual(100);
      expect(stats.maxResponseTime).toBeGreaterThanOrEqual(200);
      expect(stats.averageResponseTime).toBeGreaterThanOrEqual(150);
    });

    it('should reset statistics correctly', async () => {
      mockAdapter.healthCheck.mockRejectedValue(new Error('Test failure'));

      await monitor.checkHealth();
      expect(monitor.getStats().totalChecks).toBe(1);

      monitor.resetStats();

      const stats = monitor.getStats();
      expect(stats.totalChecks).toBe(0);
      expect(stats.currentConsecutiveFailures).toBe(0);
      expect(stats.maxConsecutiveFailures).toBe(0);
    });
  });

  describe('Trend Analysis', () => {
    beforeEach(async () => {
      await monitor.startMonitoring(mockAdapter);
    });

    it('should provide health trend analysis', async () => {
      mockAdapter.healthCheck.mockResolvedValue({ healthy: true, details: {} });

      // Perform multiple health checks
      for (let i = 0; i < 5; i++) {
        await monitor.checkHealth();
      }

      const trend = monitor.getHealthTrend();

      expect(trend).not.toBeNull();
      expect(trend!.currentStatus).toBe(HealthStatus.HEALTHY);
      expect(trend!.statusHistory).toHaveLength(5);
      expect(trend!.successRate).toBe(100);
      expect(trend!.averageResponseTime).toBeGreaterThan(0);
    });

    it('should calculate improving trend', async () => {
      // Simulate improving health
      mockAdapter.healthCheck
        .mockRejectedValueOnce(new Error('Failure'))
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValue({ healthy: true, details: {} })
        .mockResolvedValue({ healthy: true, details: {} })
        .mockResolvedValue({ healthy: true, details: {} });

      for (let i = 0; i < 5; i++) {
        await monitor.checkHealth();
      }

      const trend = monitor.getHealthTrend();
      expect(trend!.trendDirection).toBe('improving');
      expect(trend!.successRate).toBe(60); // 3/5 successful
    });

    it('should calculate degrading trend', async () => {
      // Simulate degrading health
      mockAdapter.healthCheck
        .mockResolvedValue({ healthy: true, details: {} })
        .mockResolvedValue({ healthy: true, details: {} })
        .mockResolvedValue({ healthy: true, details: {} })
        .mockRejectedValueOnce(new Error('Failure'))
        .mockRejectedValueOnce(new Error('Failure'));

      for (let i = 0; i < 5; i++) {
        await monitor.checkHealth();
      }

      const trend = monitor.getHealthTrend();
      expect(trend!.trendDirection).toBe('degrading');
    });

    it('should return null trend when no history', () => {
      const trend = monitor.getHealthTrend();
      expect(trend).toBeNull();
    });
  });

  describe('Caching', () => {
    beforeEach(async () => {
      await monitor.startMonitoring(mockAdapter);
    });

    it('should cache current health status', async () => {
      mockAdapter.healthCheck.mockResolvedValue({ healthy: true, details: {} });

      // First call should perform health check
      const result1 = await monitor.checkHealth();
      expect(mockAdapter.healthCheck).toHaveBeenCalledTimes(1);

      // Second call within TTL should return cached result
      const result2 = monitor.getCurrentHealth();
      expect(result2).not.toBeNull();
      expect(result2!.healthy).toBe(true);
      expect(mockAdapter.healthCheck).toHaveBeenCalledTimes(1); // No additional call
    });

    it('should invalidate cache after TTL', async () => {
      mockAdapter.healthCheck.mockResolvedValue({ healthy: true, details: {} });

      // Perform health check
      await monitor.checkHealth();

      // Wait for cache to expire
      jest.advanceTimersByTime(600); // 500ms TTL + margin

      // Cache should be expired
      const cached = monitor.getCurrentHealth();
      expect(cached).toBeNull();
    });

    it('should respect zero TTL (no caching)', async () => {
      monitor.updateConfig({ healthCacheTTL: 0 });

      mockAdapter.healthCheck.mockResolvedValue({ healthy: true, details: {} });

      await monitor.checkHealth();

      // With zero TTL, cache should be immediately invalid
      const cached = monitor.getCurrentHealth();
      expect(cached).toBeNull();
    });
  });

  describe('Alert Handling', () => {
    let alertHandler: jest.Mock;
    let receivedAlerts: HealthAlert[];

    beforeEach(async () => {
      alertHandler = jest.fn();
      receivedAlerts = [];

      monitor.onAlert((alert) => {
        receivedAlerts.push(alert);
        alertHandler(alert);
      });

      await monitor.startMonitoring(mockAdapter);
    });

    it('should handle health failure alerts', async () => {
      mockAdapter.healthCheck.mockRejectedValue(new Error('Persistent failure'));

      // Trigger multiple failures to exceed threshold
      for (let i = 0; i < 4; i++) {
        await monitor.checkHealth();
      }

      expect(alertHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'health_failure',
          severity: 'high',
          message: expect.stringContaining('4 consecutive times'),
        })
      );
    });

    it('should handle critical failure alerts', async () => {
      mockAdapter.healthCheck.mockRejectedValue(new Error('Critical failure'));

      // Trigger many failures to exceed 2x threshold
      for (let i = 0; i < 7; i++) {
        await monitor.checkHealth();
      }

      expect(alertHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'health_failure',
          severity: 'critical',
        })
      );
    });

    it('should handle recovery alerts', async () => {
      // First cause failures
      mockAdapter.healthCheck.mockRejectedValue(new Error('Failure'));
      for (let i = 0; i < 3; i++) {
        await monitor.checkHealth();
      }

      // Then recover
      mockAdapter.healthCheck.mockResolvedValue({ healthy: true, details: {} });
      for (let i = 0; i < 3; i++) {
        await monitor.checkHealth();
      }

      expect(alertHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'recovery',
          severity: 'medium',
          message: expect.stringContaining('recovered after'),
        })
      );
    });

    it('should handle performance degradation alerts', async () => {
      mockAdapter.healthCheck.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 600)); // Exceeds 500ms threshold
        return { healthy: true, details: {} };
      });

      await monitor.checkHealth();

      expect(alertHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'performance_degradation',
          severity: 'low',
          message: expect.stringContaining('exceeds threshold'),
        })
      );
    });

    it('should handle trend warning alerts', async () => {
      // Create a degrading trend
      mockAdapter.healthCheck
        .mockResolvedValue({ healthy: true, details: {} })
        .mockResolvedValue({ healthy: true, details: {} })
        .mockRejectedValue(new Error('Failure'))
        .mockRejectedValue(new Error('Failure'))
        .mockRejectedValue(new Error('Failure'));

      for (let i = 0; i < 5; i++) {
        await monitor.checkHealth();
      }

      expect(alertHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'trend_warning',
          severity: 'medium',
          message: expect.stringContaining('trending downward'),
        })
      );
    });

    it('should track recent alerts', async () => {
      mockAdapter.healthCheck.mockRejectedValue(new Error('Test failure'));

      // Generate some alerts
      for (let i = 0; i < 5; i++) {
        await monitor.checkHealth();
      }

      const recentAlerts = monitor.getRecentAlerts(3);
      expect(recentAlerts).toHaveLength(3);
      expect(recentAlerts[0].type).toBe('health_failure');
    });

    it('should remove alert handlers', async () => {
      monitor.removeAlertHandler(alertHandler);

      mockAdapter.healthCheck.mockRejectedValue(new Error('Test failure'));

      // This should not trigger the handler
      for (let i = 0; i < 4; i++) {
        await monitor.checkHealth();
      }

      expect(alertHandler).not.toHaveBeenCalled();
    });
  });

  describe('Recovery Mechanisms', () => {
    beforeEach(async () => {
      await monitor.startMonitoring(mockAdapter);
    });

    it('should attempt auto-recovery when enabled', async () => {
      mockAdapter.healthCheck.mockRejectedValue(new Error('Connection failed'));
      mockAdapter.list.mockRejectedValue(new Error('Still failed'));

      // Trigger failures to exceed threshold
      for (let i = 0; i < 4; i++) {
        await monitor.checkHealth();
      }

      const stats = monitor.getStats();
      expect(stats.totalRecoveryAttempts).toBeGreaterThan(0);
    });

    it('should not attempt auto-recovery when disabled', async () => {
      monitor.updateConfig({ enableAutoRecovery: false });

      mockAdapter.healthCheck.mockRejectedValue(new Error('Connection failed'));

      // Trigger failures
      for (let i = 0; i < 4; i++) {
        await monitor.checkHealth();
      }

      const stats = monitor.getStats();
      expect(stats.totalRecoveryAttempts).toBe(0);
    });

    it('should handle forced recovery successfully', async () => {
      mockAdapter.healthCheck
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ healthy: true, details: {} });

      // Cause initial failure
      await monitor.checkHealth();

      // Force recovery
      const recovered = await monitor.forceRecovery();

      expect(recovered).toBe(true);
      expect(monitor.getStats().successfulRecoveries).toBe(1);
    });

    it('should handle forced recovery failure', async () => {
      mockAdapter.healthCheck.mockRejectedValue(new Error('Still failing'));
      mockAdapter.list.mockRejectedValue(new Error('Also failing'));

      const recovered = await monitor.forceRecovery();

      expect(recovered).toBe(false);
    });

    it('should respect max recovery attempts', async () => {
      monitor.updateConfig({ maxRecoveryAttempts: 2 });

      mockAdapter.healthCheck.mockRejectedValue(new Error('Persistent failure'));
      mockAdapter.list.mockRejectedValue(new Error('Also fails'));

      // Trigger multiple failure cycles
      for (let i = 0; i < 10; i++) {
        await monitor.checkHealth();
      }

      const stats = monitor.getStats();
      expect(stats.totalRecoveryAttempts).toBeLessThanOrEqual(2);
    });
  });

  describe('Periodic Health Checks', () => {
    beforeEach(async () => {
      mockAdapter.healthCheck.mockResolvedValue({ healthy: true, details: {} });
    });

    it('should perform periodic health checks', async () => {
      await monitor.startMonitoring(mockAdapter);

      const initialCalls = mockAdapter.healthCheck.mock.calls.length;

      // Advance time by check interval
      jest.advanceTimersByTime(1000);

      // Should have performed additional health check
      expect(mockAdapter.healthCheck).toHaveBeenCalledTimes(initialCalls + 1);
    });

    it('should continue periodic checks during monitoring', async () => {
      await monitor.startMonitoring(mockAdapter);

      // Advance through multiple intervals
      for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(1000);
        await Promise.resolve(); // Allow async operations to complete
      }

      // Should have performed initial + 5 periodic checks
      expect(mockAdapter.healthCheck).toHaveBeenCalledTimes(6);
    });

    it('should stop periodic checks when monitoring stops', async () => {
      await monitor.startMonitoring(mockAdapter);
      await monitor.stopMonitoring();

      const initialCalls = mockAdapter.healthCheck.mock.calls.length;

      // Advance time
      jest.advanceTimersByTime(2000);

      // Should not perform additional checks
      expect(mockAdapter.healthCheck).toHaveBeenCalledTimes(initialCalls);
    });
  });

  describe('Thread Safety', () => {
    beforeEach(async () => {
      await monitor.startMonitoring(mockAdapter);
    });

    it('should handle concurrent health checks safely', async () => {
      mockAdapter.healthCheck.mockResolvedValue({ healthy: true, details: {} });

      // Perform multiple concurrent health checks
      const promises = Array.from({ length: 10 }, () => monitor.checkHealth());
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.healthy).toBe(true);
      });

      // All should complete without errors
      const stats = monitor.getStats();
      expect(stats.totalChecks).toBe(10);
    });

    it('should handle concurrent configuration updates safely', async () => {
      const updatePromises = Array.from({ length: 5 }, (_, i) =>
        monitor.updateConfig({ checkInterval: 1000 + i * 100 })
      );

      await Promise.all(updatePromises);

      const config = monitor.getConfig();
      expect(config.checkInterval).toBeGreaterThan(1000);
    });

    it('should handle concurrent start/stop operations safely', async () => {
      const startPromises = Array.from({ length: 3 }, () =>
        monitor.startMonitoring(mockAdapter)
      );
      const stopPromises = Array.from({ length: 3 }, () =>
        monitor.stopMonitoring()
      );

      // All operations should complete without throwing
      await Promise.allSettled([...startPromises, ...stopPromises]);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle health check without adapter', async () => {
      const result = await monitor.checkHealth();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('No storage adapter configured for health monitoring');
    });

    it('should handle unknown health check strategy', async () => {
      await monitor.startMonitoring(mockAdapter);

      const result = await monitor.checkHealth('unknown' as HealthCheckStrategy);

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Unknown health check strategy: unknown');
    });

    it('should handle strategy execution exceptions', async () => {
      await monitor.startMonitoring(mockAdapter);

      mockAdapter.create.mockImplementation(() => {
        throw new Error('Create operation failed');
      });

      const result = await monitor.checkHealth('write');

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Write operation failed');
    });

    it('should handle cleanup errors in write strategy', async () => {
      await monitor.startMonitoring(mockAdapter);

      mockAdapter.create.mockResolvedValue(testFilter);
      mockAdapter.delete.mockRejectedValue(new Error('Cleanup failed'));

      // Should still be healthy even if cleanup fails
      const result = await monitor.checkHealth('write');

      expect(result.healthy).toBe(true);
    });

    it('should handle empty alert handlers gracefully', async () => {
      // Remove all handlers
      monitor.removeAlertHandler(jest.fn());

      mockAdapter.healthCheck.mockRejectedValue(new Error('Test failure'));

      // Should not throw even with no handlers
      for (let i = 0; i < 5; i++) {
        await monitor.checkHealth();
      }
    });

    it('should handle alert handler failures gracefully', async () => {
      const failingHandler = jest.fn().mockRejectedValue(new Error('Handler failed'));
      monitor.onAlert(failingHandler);

      mockAdapter.healthCheck.mockRejectedValue(new Error('Test failure'));

      // Should not throw even if handler fails
      for (let i = 0; i < 4; i++) {
        await monitor.checkHealth();
      }

      expect(failingHandler).toHaveBeenCalled();
    });
  });

  describe('Performance Monitoring', () => {
    beforeEach(async () => {
      await monitor.startMonitoring(mockAdapter);
    });

    it('should track detailed metrics in health results', async () => {
      const startTime = Date.now();
      mockAdapter.healthCheck.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 150));
        return { healthy: true, details: { operation: 'test' } };
      });

      const result = await monitor.checkHealth();

      expect(result.metrics.responseTime).toBeGreaterThanOrEqual(150);
      expect(result.metrics.timestamp).toBeInstanceOf(Date);
      expect(result.metrics.strategy).toBe('ping');
      expect(result.metrics.adapterMetrics).toEqual({ operation: 'test' });
    });

    it('should update response time statistics accurately', async () => {
      const responseTimes = [100, 200, 300];

      for (const time of responseTimes) {
        mockAdapter.healthCheck.mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, time));
          return { healthy: true, details: {} };
        });

        await monitor.checkHealth();
      }

      const stats = monitor.getStats();

      expect(stats.minResponseTime).toBeGreaterThanOrEqual(100);
      expect(stats.maxResponseTime).toBeGreaterThanOrEqual(300);
      expect(stats.averageResponseTime).toBeGreaterThanOrEqual(200);
    });
  });

  describe('Integration with Storage Adapters', () => {
    it('should work with real adapter health check results', async () => {
      await monitor.startMonitoring(mockAdapter);

      // Simulate real adapter health check response
      mockAdapter.healthCheck.mockResolvedValue({
        healthy: true,
        details: {
          databasePath: '/test/db.sqlite',
          sessionId: 'test-session',
          initialized: true,
        },
      });

      const result = await monitor.checkHealth();

      expect(result.healthy).toBe(true);
      expect(result.details?.databasePath).toBe('/test/db.sqlite');
      expect(result.details?.sessionId).toBe('test-session');
    });

    it('should handle boolean health check responses', async () => {
      await monitor.startMonitoring(mockAdapter);

      // Some adapters might return just boolean
      mockAdapter.healthCheck.mockResolvedValue(true as any);

      const result = await monitor.checkHealth();

      expect(result.healthy).toBe(true);
    });

    it('should handle adapter initialization failures', async () => {
      mockAdapter.healthCheck.mockRejectedValue(new Error('Database not initialized'));

      await monitor.startMonitoring(mockAdapter);
      const result = await monitor.checkHealth();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Database not initialized');
    });
  });
});