/**
 * Simple StorageHealthMonitor test without fake timers to debug core functionality
 */

import { StorageHealthMonitor } from '../../../src/storage/monitors/StorageHealthMonitor';
import type { StorageAdapter } from '../../../src/storage/interfaces';

describe('StorageHealthMonitor - Simple Tests', () => {
  let monitor: StorageHealthMonitor;
  let mockAdapter: jest.Mocked<StorageAdapter>;

  beforeEach(() => {
    jest.clearAllMocks();

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

    // Create monitor with longer intervals to avoid timer issues
    monitor = new StorageHealthMonitor({
      checkInterval: 10000, // 10 seconds
      failureThreshold: 3,
      recoveryThreshold: 2,
      responseTimeThreshold: 500,
      trendWindowSize: 5,
      healthCacheTTL: 5000, // 5 seconds
      enableAutoRecovery: false, // Disable to simplify
      maxRecoveryAttempts: 1,
      enableDebugLogging: false,
    });
  });

  afterEach(async () => {
    try {
      await monitor.stopMonitoring();
    } catch {
      // Ignore errors during cleanup
    }
  });

  it('should create monitor with configuration', () => {
    expect(monitor).toBeDefined();
    const config = monitor.getConfig();
    expect(config.checkInterval).toBe(10000);
    expect(config.failureThreshold).toBe(3);
  });

  it('should not be monitoring initially', () => {
    expect(monitor.isMonitoring()).toBe(false);
  });

  it('should perform basic health check without starting monitoring', async () => {
    // Test health check directly without starting periodic monitoring
    const result = await monitor.checkHealth('ping');

    expect(result).toBeDefined();
    expect(result.healthy).toBe(false); // Should fail because no adapter set
    expect(result.error).toContain('No storage adapter configured');
  });

  it('should handle configuration updates', () => {
    monitor.updateConfig({
      checkInterval: 20000,
      failureThreshold: 5,
    });

    const config = monitor.getConfig();
    expect(config.checkInterval).toBe(20000);
    expect(config.failureThreshold).toBe(5);
    expect(config.recoveryThreshold).toBe(2); // Should retain default
  });

  it('should initialize with zero statistics', () => {
    const stats = monitor.getStats();
    expect(stats.totalChecks).toBe(0);
    expect(stats.successfulChecks).toBe(0);
    expect(stats.failedChecks).toBe(0);
    expect(stats.averageResponseTime).toBe(0);
  });

  it('should reset statistics correctly', async () => {
    // Force a health check to generate some stats (this will fail because no adapter)
    await monitor.checkHealth('ping');

    let stats = monitor.getStats();
    expect(stats.totalChecks).toBe(1); // Should record the failed check
    expect(stats.failedChecks).toBe(1);

    // Reset and verify
    monitor.resetStats();
    stats = monitor.getStats();
    expect(stats.totalChecks).toBe(0);
    expect(stats.successfulChecks).toBe(0);
    expect(stats.failedChecks).toBe(0);
  });

  it('should have no recent alerts initially', () => {
    const alerts = monitor.getRecentAlerts();
    expect(alerts).toEqual([]);
  });

  it('should handle alert handlers', async () => {
    const alertHandler = jest.fn();
    monitor.onAlert(alertHandler);

    // Test that handler was registered
    monitor.removeAlertHandler(alertHandler);

    // Should not throw when removing non-existent handler
    expect(() => monitor.removeAlertHandler(alertHandler)).not.toThrow();
  });

  it('should return null for current health when no checks performed', () => {
    const currentHealth = monitor.getCurrentHealth();
    expect(currentHealth).toBeNull();
  });

  it('should return null for health trend when no history', () => {
    const trend = monitor.getHealthTrend();
    expect(trend).toBeNull();
  });
});