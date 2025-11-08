/**
 * Integration tests for modular architecture components
 *
 * These tests verify that the new modular components work together correctly
 * without relying on the full PersistentFilterStorage implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { rm, mkdir } from 'fs/promises';
import { tmpdir } from 'os';

// Import modular components from main storage exports
import {
  SessionManager,
  StorageAdapterOrchestrator,
  StorageHealthMonitor,
  StorageStatistics,
  InMemoryStorageAdapter
} from '../../src/storage';

describe('Modular Architecture Integration', () => {
  let testDir: string;
  let sessionManager: SessionManager;
  let orchestrator: StorageAdapterOrchestrator;
  let healthMonitor: StorageHealthMonitor;
  let statistics: StorageStatistics;

  beforeAll(async () => {
    testDir = join(tmpdir(), 'vikunja-mcp-modular-tests', randomUUID());
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test directory:', error);
    }
  });

  beforeEach(() => {
    sessionManager = new SessionManager({ debugLogging: true });
    orchestrator = new StorageAdapterOrchestrator();
    healthMonitor = new StorageHealthMonitor({ enableDebugLogging: true });
    statistics = new StorageStatistics({ enableHistoricalTracking: false });
  });

  afterEach(async () => {
    await sessionManager.shutdown();
    await orchestrator.close();
    await healthMonitor.stopMonitoring();
    await statistics.close();
  });

  describe('Session Manager Integration', () => {
    it('should create and manage sessions', async () => {
      const sessionId = randomUUID();
      const userId = 'test-user';
      const apiUrl = 'https://test.vikunja.io';

      const session = await sessionManager.createSession({
        sessionId,
        userId,
        apiUrl
      });

      expect(session.id).toBe(sessionId);
      expect(session.userId).toBe(userId);
      expect(session.apiUrl).toBe(apiUrl);

      // Test session retrieval
      const retrieved = await sessionManager.getSession(sessionId);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.id).toBe(sessionId);

      // Test session validity
      const isValid = await sessionManager.isSessionValid(sessionId);
      expect(isValid).toBe(true);

      // Test session stats
      const stats = await sessionManager.getSessionStats();
      expect(stats.totalSessions).toBe(1);
      expect(stats.expiredSessions).toBe(0);
    });

    it('should handle session expiration', async () => {
      const sessionId = randomUUID();

      // Create session with very short timeout
      const shortTimeoutManager = new SessionManager({
        sessionTimeoutMs: 100, // 100ms
        cleanupIntervalMs: 50
      });

      const session = await shortTimeoutManager.createSession({
        sessionId,
        customTimeoutMs: 100
      });

      expect(session).toBeTruthy();

      // Wait for session to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Session should now be expired
      const isValid = await shortTimeoutManager.isSessionValid(sessionId);
      expect(isValid).toBe(false);

      await shortTimeoutManager.shutdown();
    });
  });

  describe('Storage Adapter Orchestrator Integration', () => {
    it('should initialize with session', async () => {
      const sessionId = randomUUID();
      const session = await sessionManager.createSession({ sessionId });

      await orchestrator.initialize(session);

      const adapter = await orchestrator.getAdapter();
      expect(adapter).toBeTruthy();

      // Test adapter functionality
      await adapter.create({
        name: 'Test Filter',
        filter: 'done = false',
        isGlobal: false
      });

      const filters = await adapter.list();
      expect(filters).toHaveLength(1);
      expect(filters[0].name).toBe('Test Filter');
    });

    it('should perform health checks', async () => {
      const sessionId = randomUUID();
      const session = await sessionManager.createSession({ sessionId });

      await orchestrator.initialize(session);

      const healthCheck = await orchestrator.performHealthCheck();
      expect(healthCheck.healthy).toBe(true);
      expect(healthCheck.error).toBeUndefined();
    });

    it('should track adapter status', async () => {
      const sessionId = randomUUID();
      const session = await sessionManager.createSession({ sessionId });

      await orchestrator.initialize(session);

      const status = orchestrator.getAdapterStatus();
      expect(status.state).toBeDefined();
      expect(status.healthy).toBe(true);
    });
  });

  describe('Health Monitor Integration', () => {
    it('should monitor adapter health', async () => {
      const adapter = new InMemoryStorageAdapter();
      const session = {
        id: randomUUID(),
        createdAt: new Date(),
        lastAccessAt: new Date()
      };

      await adapter.initialize(session);
      await healthMonitor.startMonitoring(adapter);

      const healthCheck = await healthMonitor.checkHealth();
      expect(healthCheck.healthy).toBe(true);

      const currentHealth = healthMonitor.getCurrentHealth();
      expect(currentHealth).toBeTruthy();

      await healthMonitor.stopMonitoring();
    });

    it('should provide health statistics', async () => {
      const stats = healthMonitor.getStats();
      expect(stats).toBeDefined();
      expect(stats.uptime).toBeGreaterThan(0);
    });
  });

  describe('Statistics Integration', () => {
    it('should record operations', async () => {
      await statistics.initialize();

      // Record some operations
      await statistics.recordOperation({
        operationType: 'create',
        success: true,
        startTime: Date.now() - 100,
        endTime: Date.now(),
        resultCount: 1
      });

      await statistics.recordOperation({
        operationType: 'list',
        success: true,
        startTime: Date.now() - 50,
        endTime: Date.now(),
        resultCount: 5
      });

      const snapshot = await statistics.getSnapshot();
      expect(snapshot).toBeDefined();
      expect(snapshot.performanceMetrics.totalOperations).toBe(2);
    });

    it('should update storage statistics', async () => {
      await statistics.initialize();

      await statistics.updateStorageStats(
        10,
        { memoryUsageBytes: 1024 },
        'test-session',
        'memory'
      );

      const snapshot = await statistics.getSnapshot();
      expect(snapshot.filterCount).toBe(10);
      expect(snapshot.storageType).toBe('memory');
      expect(snapshot.sessionId).toBe('test-session');
    });
  });

  describe('Full Component Integration', () => {
    it('should work together for complete workflow', async () => {
      // 1. Create session
      const sessionId = randomUUID();
      const session = await sessionManager.createSession({
        sessionId,
        userId: 'integration-user',
        apiUrl: 'https://integration.test'
      });

      // 2. Initialize orchestrator
      await orchestrator.initialize(session);
      const adapter = await orchestrator.getAdapter();

      // 3. Start health monitoring
      await healthMonitor.startMonitoring(adapter);

      // 4. Initialize statistics
      await statistics.initialize({
        sessionId: session.id,
        storageType: 'memory'
      });

      // 5. Perform some storage operations
      const filter = await adapter.create({
        name: 'Integration Test Filter',
        filter: 'priority = 1',
        isGlobal: false
      });

      // Record operations in statistics
      await statistics.recordOperation({
        operationType: 'create',
        success: true,
        startTime: Date.now() - 50,
        endTime: Date.now(),
        resultCount: 1,
        filterName: filter.name
      });

      // 6. Verify health
      const healthCheck = await healthMonitor.checkHealth();
      expect(healthCheck.healthy).toBe(true);

      const orchestratorHealth = await orchestrator.performHealthCheck();
      expect(orchestratorHealth.healthy).toBe(true);

      // 7. Check statistics
      const snapshot = await statistics.getSnapshot();
      expect(snapshot.filterCount).toBe(1);
      expect(snapshot.performanceMetrics.totalOperations).toBe(1);

      // 8. Verify session tracking
      const sessionValid = await sessionManager.isSessionValid(sessionId);
      expect(sessionValid).toBe(true);

      const sessionStats = await sessionManager.getSessionStats();
      expect(sessionStats.totalSessions).toBe(1);
    }, 10000); // Increase timeout for integration test
  });
});