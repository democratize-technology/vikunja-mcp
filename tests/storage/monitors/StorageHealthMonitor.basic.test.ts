/**
 * Basic StorageHealthMonitor test to validate core functionality
 */

import { StorageHealthMonitor } from '../../../src/storage/monitors/StorageHealthMonitor';
import type { StorageAdapter } from '../../../src/storage/interfaces';

describe('StorageHealthMonitor - Basic Functionality', () => {
  let monitor: StorageHealthMonitor;
  let mockAdapter: jest.Mocked<StorageAdapter>;

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

    // Create monitor with simple config to avoid complex issues
    monitor = new StorageHealthMonitor({
      checkInterval: 1000,
      failureThreshold: 3,
      recoveryThreshold: 2,
      responseTimeThreshold: 500,
      trendWindowSize: 5,
      healthCacheTTL: 500,
      enableAutoRecovery: false, // Disable to simplify
      maxRecoveryAttempts: 1,
      enableDebugLogging: false,
    });
  });

  afterEach(async () => {
    jest.useRealTimers();
    try {
      await monitor.stopMonitoring();
    } catch {
      // Ignore errors during cleanup
    }
  });

  it('should create monitor with default configuration', () => {
    expect(monitor).toBeDefined();
    const config = monitor.getConfig();
    expect(config.checkInterval).toBe(1000);
    expect(config.failureThreshold).toBe(3);
  });

  it('should start and stop monitoring', async () => {
    mockAdapter.healthCheck.mockResolvedValue({
      healthy: true,
      details: {},
    });

    await monitor.startMonitoring(mockAdapter);
    expect(monitor.isMonitoring()).toBe(true);

    await monitor.stopMonitoring();
    expect(monitor.isMonitoring()).toBe(false);
  });

  it('should perform health check', async () => {
    await monitor.startMonitoring(mockAdapter);

    mockAdapter.healthCheck.mockResolvedValue({
      healthy: true,
      details: { test: 'data' },
    });

    const result = await monitor.checkHealth();

    expect(result.healthy).toBe(true);
    expect(result.strategy).toBe('ping');
    expect(result.metrics.responseTime).toBeGreaterThanOrEqual(0);
  });

  it('should handle health check failure', async () => {
    await monitor.startMonitoring(mockAdapter);

    mockAdapter.healthCheck.mockRejectedValue(new Error('Health check failed'));

    const result = await monitor.checkHealth();

    expect(result.healthy).toBe(false);
    expect(result.error).toBe('Health check failed');
  });

  it('should track statistics', async () => {
    await monitor.startMonitoring(mockAdapter);

    mockAdapter.healthCheck.mockResolvedValue({ healthy: true, details: {} });

    await monitor.checkHealth();
    await monitor.checkHealth();

    const stats = monitor.getStats();

    expect(stats.totalChecks).toBe(2);
    expect(stats.successfulChecks).toBe(2);
    expect(stats.failedChecks).toBe(0);
  });

  it('should get current health status', () => {
    const currentHealth = monitor.getCurrentHealth();
    expect(currentHealth).toBeNull(); // No checks performed yet
  });

  it('should update configuration', async () => {
    monitor.updateConfig({
      checkInterval: 2000,
      failureThreshold: 5,
    });

    const config = monitor.getConfig();
    expect(config.checkInterval).toBe(2000);
    expect(config.failureThreshold).toBe(5);
  });
});