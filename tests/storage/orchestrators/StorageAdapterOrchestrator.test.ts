/**
 * Tests for StorageAdapterOrchestrator
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { randomUUID } from 'crypto';

import { StorageAdapterOrchestrator } from '../../../src/storage/orchestrators/StorageAdapterOrchestrator';
import { InMemoryStorageAdapter } from '../../../src/storage/adapters/InMemoryStorageAdapter';
import { storageAdapterFactory } from '../../../src/storage/adapters/factory';
import type { StorageSession, StorageConfig } from '../../../src/storage/interfaces';
import type { AdapterStatus } from '../../../src/storage/orchestrators/interfaces';
import { AdapterState } from '../../../src/storage/orchestrators/interfaces';

// Mock the factory and config
jest.mock('../../../src/storage/adapters/factory');
jest.mock('../../../src/storage/config');

const mockStorageAdapterFactory = storageAdapterFactory as jest.Mocked<typeof storageAdapterFactory>;
const mockLoadStorageConfig = jest.requireMock('../../../src/storage/config') as {
  loadStorageConfig: jest.MockedFunction<() => StorageConfig>;
};

describe('StorageAdapterOrchestrator', () => {
  let orchestrator: StorageAdapterOrchestrator;
  let mockAdapter: InMemoryStorageAdapter;
  let session: StorageSession;
  let config: StorageConfig;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create test session
    session = {
      id: randomUUID(),
      createdAt: new Date(),
      lastAccessAt: new Date(),
      userId: 'test-user',
      apiUrl: 'https://test.vikunja.io',
    };

    // Create test config
    config = {
      type: 'memory',
      timeout: 5000,
      debug: false,
    };

    // Create mock adapter
    mockAdapter = new InMemoryStorageAdapter();
    await mockAdapter.initialize(session);

    // Mock factory and config
    mockLoadStorageConfig.loadStorageConfig.mockReturnValue(config);
    mockStorageAdapterFactory.createAdapter.mockResolvedValue(mockAdapter);

    // Create orchestrator
    orchestrator = new StorageAdapterOrchestrator({
      healthCheckInterval: 1000, // Shorter for tests
      maxConsecutiveFailures: 2,
      enableAutoRecovery: true,
      healthGracePeriod: 500,
    });

    await orchestrator.initialize(session);
  });

  afterEach(async () => {
    await orchestrator.close();
  });

  describe('initialization', () => {
    it('should initialize with session and configuration', async () => {
      const newSession = {
        ...session,
        id: randomUUID(),
      };

      const newOrchestrator = new StorageAdapterOrchestrator();
      await newOrchestrator.initialize(newSession);

      expect(newOrchestrator.getSession()).toEqual(newSession);
      expect(newOrchestrator.getStorageConfig()).toEqual(config);

      await newOrchestrator.close();
    });

    it('should load storage configuration', () => {
      expect(mockLoadStorageConfig.loadStorageConfig).toHaveBeenCalled();
      expect(orchestrator.getStorageConfig()).toEqual(config);
    });

    it('should not allow reinitialization after closing', async () => {
      await orchestrator.close();

      await expect(orchestrator.initialize(session)).rejects.toThrow('Orchestrator has been closed and cannot be reinitialized');
    });

    it('should update configuration when provided', async () => {
      const newSession = {
        ...session,
        id: randomUUID(),
      };

      const newOrchestrator = new StorageAdapterOrchestrator();
      await newOrchestrator.initialize(newSession, {
        healthCheckInterval: 5000,
        maxConsecutiveFailures: 5,
      });

      expect(newOrchestrator.getSession()).toEqual(newSession);

      await newOrchestrator.close();
    });
  });

  describe('adapter management', () => {
    it('should create adapter on first access', async () => {
      // Reset mocks
      jest.clearAllMocks();
      mockStorageAdapterFactory.createAdapter.mockResolvedValue(mockAdapter);

      const adapter = await orchestrator.getAdapter();

      expect(mockStorageAdapterFactory.createAdapter).toHaveBeenCalledWith(config);
      expect(adapter).toBe(mockAdapter);
    });

    it('should reuse existing adapter', async () => {
      const adapter1 = await orchestrator.getAdapter();
      const adapter2 = await orchestrator.getAdapter();

      expect(adapter1).toBe(adapter2);
      expect(mockStorageAdapterFactory.createAdapter).toHaveBeenCalledTimes(1);
    });

    it('should force reinitialize when requested', async () => {
      const adapter1 = await orchestrator.getAdapter();

      // Reset mocks to track new creation
      jest.clearAllMocks();
      mockStorageAdapterFactory.createAdapter.mockResolvedValue(mockAdapter);

      const adapter2 = await orchestrator.getAdapter({ force: true });

      expect(mockStorageAdapterFactory.createAdapter).toHaveBeenCalled();
    });

    it('should handle adapter creation failure', async () => {
      const error = new Error('Adapter creation failed');
      mockStorageAdapterFactory.createAdapter.mockRejectedValue(error);

      await expect(orchestrator.getAdapter({
        maxRetries: 2,
        retryDelay: 10,
      })).rejects.toThrow('Adapter creation failed');

      const status = orchestrator.getAdapterStatus();
      expect(status.state).toBe(AdapterState.ERROR);
      expect(status.healthy).toBe(false);
      expect(status.error).toContain('Failed to initialize after 2 attempts');
    });

    it('should retry on initialization failure', async () => {
      const error = new Error('Temporary failure');
      mockStorageAdapterFactory.createAdapter
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(mockAdapter);

      const adapter = await orchestrator.getAdapter({
        maxRetries: 3,
        retryDelay: 10,
      });

      expect(adapter).toBe(mockAdapter);
      expect(mockStorageAdapterFactory.createAdapter).toHaveBeenCalledTimes(3);
    });
  });

  describe('health monitoring', () => {
    it('should perform health check successfully', async () => {
      const healthResult = await orchestrator.performHealthCheck();

      expect(healthResult.healthy).toBe(true);
      expect(healthResult.error).toBeUndefined();

      const status = orchestrator.getAdapterStatus();
      expect(status.state).toBe(AdapterState.READY);
      expect(status.healthy).toBe(true);
    });

    it('should handle unhealthy adapter with recovery', async () => {
      // Mock unhealthy adapter
      const unhealthyAdapter = new InMemoryStorageAdapter();
      await unhealthyAdapter.initialize(session);

      jest.spyOn(unhealthyAdapter, 'healthCheck').mockResolvedValue({
        healthy: false,
        error: 'Connection lost',
      });

      mockStorageAdapterFactory.createAdapter.mockResolvedValue(unhealthyAdapter);

      await orchestrator.reinitializeAdapter();

      // After reinitialize, should be in UNHEALTHY state
      let status = orchestrator.getAdapterStatus();
      expect(status.state).toBe(AdapterState.UNHEALTHY);
      expect(status.healthy).toBe(false);

      const healthResult = await orchestrator.performHealthCheck();

      expect(healthResult.healthy).toBe(false);
      expect(healthResult.error).toBe('Connection lost');

      status = orchestrator.getAdapterStatus();
      expect(status.state).toBe(AdapterState.UNHEALTHY);
      expect(status.consecutiveFailures).toBe(1);
    });

    it('should mark adapter as error after max failures', async () => {
      // Mock consistently unhealthy adapter
      const unhealthyAdapter = new InMemoryStorageAdapter();
      await unhealthyAdapter.initialize(session);

      jest.spyOn(unhealthyAdapter, 'healthCheck').mockResolvedValue({
        healthy: false,
        error: 'Persistent failure',
      });

      mockStorageAdapterFactory.createAdapter.mockResolvedValue(unhealthyAdapter);

      await orchestrator.reinitializeAdapter();

      // After reinitialize, should be in UNHEALTHY state with 0 failures
      let status = orchestrator.getAdapterStatus();
      expect(status.state).toBe(AdapterState.UNHEALTHY);
      expect(status.consecutiveFailures).toBe(0);

      // Perform health checks to exceed max failures
      await orchestrator.performHealthCheck(); // 1st failure
      await orchestrator.performHealthCheck(); // 2nd failure should trigger error state

      status = orchestrator.getAdapterStatus();
      expect(status.state).toBe(AdapterState.ERROR);
      expect(status.consecutiveFailures).toBe(2);
    });

    it('should initialize adapter during health check if not initialized', async () => {
      const newOrchestrator = new StorageAdapterOrchestrator();
      await newOrchestrator.initialize(session);

      // Don't create adapter manually
      const healthResult = await newOrchestrator.performHealthCheck();

      expect(healthResult.healthy).toBe(true);
      expect(mockStorageAdapterFactory.createAdapter).toHaveBeenCalled();

      await newOrchestrator.close();
    });
  });

  describe('error handling and recovery', () => {
    it('should handle health check exceptions', async () => {
      const error = new Error('Health check failed');
      jest.spyOn(mockAdapter, 'healthCheck').mockRejectedValue(error);

      const healthResult = await orchestrator.performHealthCheck();

      expect(healthResult.healthy).toBe(false);
      expect(healthResult.error).toContain('Health check failed');

      const status = orchestrator.getAdapterStatus();
      expect(status.state).toBe(AdapterState.ERROR);
      expect(status.error).toContain('Health check failed');
    });

    it('should attempt recovery when auto-recovery is enabled', async () => {
      const unhealthyAdapter = new InMemoryStorageAdapter();
      await unhealthyAdapter.initialize(session);

      jest.spyOn(unhealthyAdapter, 'healthCheck').mockResolvedValue({
        healthy: false,
        error: 'Recoverable error',
      });

      mockStorageAdapterFactory.createAdapter.mockResolvedValue(unhealthyAdapter);

      await orchestrator.reinitializeAdapter();

      // Reset factory mock to track recovery attempts
      jest.clearAllMocks();
      mockStorageAdapterFactory.createAdapter.mockResolvedValue(mockAdapter);

      // Trigger health check that should initiate recovery
      await orchestrator.performHealthCheck();

      // Wait for background recovery
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have attempted recovery (created new adapter)
      expect(mockStorageAdapterFactory.createAdapter).toHaveBeenCalled();
    });

    it('should respect closed state', async () => {
      await orchestrator.close();

      const healthResult = await orchestrator.performHealthCheck();
      expect(healthResult.healthy).toBe(false);
      expect(healthResult.error).toBe('Orchestrator has been closed');

      await expect(orchestrator.getAdapter()).rejects.toThrow('Orchestrator has been closed');
    });
  });

  describe('status and information', () => {
    it('should return correct adapter status', () => {
      const status = orchestrator.getAdapterStatus();

      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('healthy');
      expect(status).toHaveProperty('lastHealthCheck');
      expect(status).toHaveProperty('consecutiveFailures');
      expect(typeof status.lastHealthCheck).toBe('object');
    });

    it('should return session information', () => {
      const returnedSession = orchestrator.getSession();
      expect(returnedSession).toEqual(session);
    });

    it('should return storage configuration', () => {
      const returnedConfig = orchestrator.getStorageConfig();
      expect(returnedConfig).toEqual(config);
    });

    it('should throw error when getting session before initialization', async () => {
      const newOrchestrator = new StorageAdapterOrchestrator();

      expect(() => newOrchestrator.getSession()).toThrow('Orchestrator not initialized');

      await newOrchestrator.close();
    });

    it('should throw error when getting config before initialization', async () => {
      const newOrchestrator = new StorageAdapterOrchestrator();

      expect(() => newOrchestrator.getStorageConfig()).toThrow('Orchestrator not initialized');

      await newOrchestrator.close();
    });
  });

  describe('reinitialization', () => {
    it('should reinitialize adapter successfully', async () => {
      await orchestrator.getAdapter();

      // Reset mocks to track new creation
      jest.clearAllMocks();
      mockStorageAdapterFactory.createAdapter.mockResolvedValue(mockAdapter);

      await orchestrator.reinitializeAdapter();

      expect(mockStorageAdapterFactory.createAdapter).toHaveBeenCalled();

      const status = orchestrator.getAdapterStatus();
      expect(status.state).toBe(AdapterState.READY);
    });

    it('should handle reinitialization failure', async () => {
      const error = new Error('Reinitialization failed');
      mockStorageAdapterFactory.createAdapter.mockRejectedValue(error);

      await expect(orchestrator.reinitializeAdapter({
        maxRetries: 2,
        retryDelay: 10,
      })).rejects.toThrow('Reinitialization failed');

      const status = orchestrator.getAdapterStatus();
      expect(status.state).toBe(AdapterState.ERROR);
    });

    it('should close old adapter before creating new one', async () => {
      const oldAdapter = await orchestrator.getAdapter();
      const closeSpy = jest.spyOn(oldAdapter, 'close').mockResolvedValue();

      const newAdapter = new InMemoryStorageAdapter();
      await newAdapter.initialize(session);
      mockStorageAdapterFactory.createAdapter.mockResolvedValue(newAdapter);

      await orchestrator.reinitializeAdapter();

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should close adapter and stop health monitoring', async () => {
      await orchestrator.getAdapter();
      const closeSpy = jest.spyOn(mockAdapter, 'close').mockResolvedValue();

      await orchestrator.close();

      expect(closeSpy).toHaveBeenCalled();
      expect(orchestrator.getAdapterStatus().state).toBe(AdapterState.CLOSED);
    });

    it('should handle errors during cleanup gracefully', async () => {
      await orchestrator.getAdapter();
      jest.spyOn(mockAdapter, 'close').mockRejectedValue(new Error('Close failed'));

      // Should not throw
      await expect(orchestrator.close()).resolves.toBeUndefined();
    });

    it('should allow multiple close calls', async () => {
      await orchestrator.close();

      // Second close should not throw
      await expect(orchestrator.close()).resolves.toBeUndefined();
    });
  });

  describe('configuration options', () => {
    it('should use custom configuration values', async () => {
      const customOrchestrator = new StorageAdapterOrchestrator({
        healthCheckInterval: 2000,
        maxConsecutiveFailures: 5,
        enableAutoRecovery: false,
        healthGracePeriod: 1000,
      });

      await customOrchestrator.initialize(session);

      // Test that configuration is applied by triggering health checks
      const unhealthyAdapter = new InMemoryStorageAdapter();
      await unhealthyAdapter.initialize(session);

      jest.spyOn(unhealthyAdapter, 'healthCheck').mockResolvedValue({
        healthy: false,
        error: 'Test error',
      });

      mockStorageAdapterFactory.createAdapter.mockResolvedValue(unhealthyAdapter);

      await customOrchestrator.reinitializeAdapter();

      // After reinitialize, should be in UNHEALTHY state
      let status = customOrchestrator.getAdapterStatus();
      expect(status.state).toBe(AdapterState.UNHEALTHY);

      // With auto-recovery disabled, should still be unhealthy after health check
      // but should not change state (no recovery attempt)
      await customOrchestrator.performHealthCheck();

      status = customOrchestrator.getAdapterStatus();
      expect(status.state).toBe(AdapterState.UNHEALTHY);
      expect(status.consecutiveFailures).toBe(1);

      await customOrchestrator.close();
    });
  });
});