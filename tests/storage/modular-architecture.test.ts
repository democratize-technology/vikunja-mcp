/**
 * Tests for the refactored modular storage architecture
 * These tests will fail initially and pass after refactoring
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'crypto';

import { StorageService } from '../../src/storage/services/StorageService';
import { SessionManager } from '../../src/storage/services/SessionManager';
import { HealthMonitor } from '../../src/storage/services/HealthMonitor';
import { CleanupService } from '../../src/storage/services/CleanupService';
import type { SavedFilter, StorageSession } from '../../src/types/filters';
import type { StorageAdapter } from '../../src/storage/interfaces';

describe('Modular Storage Architecture', () => {
  let mockAdapter: jest.Mocked<StorageAdapter>;
  let session: StorageSession;

  beforeEach(() => {
    session = {
      id: randomUUID(),
      createdAt: new Date(),
      lastAccessAt: new Date(),
      userId: 'test-user',
      apiUrl: 'https://test.vikunja.io',
    };

    mockAdapter = {
      initialize: jest.fn(),
      close: jest.fn(),
      healthCheck: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByName: jest.fn(),
      clear: jest.fn(),
      getByProject: jest.fn(),
      getStats: jest.fn(),
    };
  });

  describe('StorageService', () => {
    let storageService: StorageService;

    beforeEach(() => {
      storageService = new StorageService(mockAdapter);
    });

    it('should perform CRUD operations with proper access time tracking', async () => {
      // Test data
      const filter: SavedFilter = {
        id: randomUUID(),
        name: 'Test Filter',
        description: 'Test description',
        filter: 'done = false',
        isGlobal: true,
        created: new Date(),
        updated: new Date(),
      };

      // Setup mocks
      mockAdapter.create.mockResolvedValue(filter);
      mockAdapter.get.mockResolvedValue(filter);
      mockAdapter.list.mockResolvedValue([filter]);
      mockAdapter.update.mockResolvedValue({ ...filter, name: 'Updated Filter' });
      mockAdapter.findByName.mockResolvedValue(filter);

      // Test create
      const created = await storageService.create({
        name: 'Test Filter',
        description: 'Test description',
        filter: 'done = false',
        isGlobal: true,
      });
      expect(created).toEqual(filter);
      expect(mockAdapter.create).toHaveBeenCalledWith({
        name: 'Test Filter',
        description: 'Test description',
        filter: 'done = false',
        isGlobal: true,
      });

      // Test read
      const retrieved = await storageService.get(filter.id);
      expect(retrieved).toEqual(filter);
      expect(mockAdapter.get).toHaveBeenCalledWith(filter.id);

      // Test list
      const filters = await storageService.list();
      expect(filters).toEqual([filter]);
      expect(mockAdapter.list).toHaveBeenCalled();

      // Test update
      const updated = await storageService.update(filter.id, { name: 'Updated Filter' });
      expect(updated.name).toBe('Updated Filter');
      expect(mockAdapter.update).toHaveBeenCalledWith(filter.id, { name: 'Updated Filter' });

      // Test findByName
      const found = await storageService.findByName('Test Filter');
      expect(found).toEqual(filter);
      expect(mockAdapter.findByName).toHaveBeenCalledWith('Test Filter');
    });

    it('should handle adapter not available errors', async () => {
      const storageService = new StorageService(null);
      await expect(storageService.list()).rejects.toThrow('Storage adapter not available');
    });
  });

  describe('SessionManager', () => {
    let sessionManager: SessionManager;

    beforeEach(() => {
      sessionManager = new SessionManager();
    });

    it('should manage session lifecycle properly', async () => {
      const sessionId = randomUUID();

      // Create session
      const createdSession = await sessionManager.createSession(sessionId, 'test-user', 'https://test.vikunja.io');
      expect(createdSession.id).toBe(sessionId);
      expect(createdSession.userId).toBe('test-user');
      expect(createdSession.apiUrl).toBe('https://test.vikunja.io');
      expect(createdSession.createdAt).toBeInstanceOf(Date);
      expect(createdSession.lastAccessAt).toBeInstanceOf(Date);

      // Get session
      const retrievedSession = await sessionManager.getSession(sessionId);
      expect(retrievedSession).toEqual(createdSession);

      // Update access time
      const originalAccessTime = createdSession.lastAccessAt;
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await sessionManager.updateAccessTime(sessionId);
      const updatedSession = await sessionManager.getSession(sessionId);
      expect(updatedSession!.lastAccessAt.getTime()).toBeGreaterThan(originalAccessTime.getTime());

      // Remove session
      await sessionManager.removeSession(sessionId);
      expect(await sessionManager.getSession(sessionId)).toBeNull();
    });

    it('should handle non-existent sessions gracefully', async () => {
      const nonExistentSession = await sessionManager.getSession('non-existent');
      expect(nonExistentSession).toBeNull();

      expect(() => sessionManager.updateAccessTime('non-existent')).not.toThrow();
    });

    it('should track active sessions', async () => {
      const sessionId1 = randomUUID();
      const sessionId2 = randomUUID();

      await sessionManager.createSession(sessionId1);
      await sessionManager.createSession(sessionId2);

      const activeSessions = await sessionManager.getActiveSessions();
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.map(s => s.id)).toContain(sessionId1);
      expect(activeSessions.map(s => s.id)).toContain(sessionId2);
    });
  });

  describe('HealthMonitor', () => {
    let healthMonitor: HealthMonitor;

    beforeEach(() => {
      healthMonitor = new HealthMonitor();
    });

    it('should monitor adapter health and perform recovery', async () => {
      const sessionId = randomUUID();

      // Setup healthy adapter
      mockAdapter.healthCheck.mockResolvedValue({
        healthy: true,
        details: { status: 'ok' },
      });

      // Test healthy adapter
      const healthStatus = await healthMonitor.checkHealth(mockAdapter, sessionId);
      expect(healthStatus.healthy).toBe(true);
      expect(mockAdapter.healthCheck).toHaveBeenCalled();

      // Test unhealthy adapter with recovery
      mockAdapter.healthCheck.mockResolvedValueOnce({
        healthy: false,
        error: 'Connection failed',
      });

      mockAdapter.initialize.mockResolvedValue();
      mockAdapter.healthCheck.mockResolvedValueOnce({
        healthy: true,
        details: { status: 'recovered' },
      });

      // Mock recovery function
      const recoveryFunction = jest.fn().mockResolvedValue(mockAdapter);
      const recoveredHealth = await healthMonitor.checkWithRecovery(mockAdapter, sessionId, recoveryFunction);

      expect(recoveredHealth.healthy).toBe(true);
      expect(recoveryFunction).toHaveBeenCalled();
    });

    it('should handle health check failures gracefully', async () => {
      const sessionId = randomUUID();

      mockAdapter.healthCheck.mockRejectedValue(new Error('Health check failed'));

      const healthStatus = await healthMonitor.checkHealth(mockAdapter, sessionId);
      expect(healthStatus.healthy).toBe(false);
      expect(healthStatus.error).toBe('Health check failed');
      expect(healthStatus.details).toEqual({ sessionId });
    });
  });

  describe('CleanupService', () => {
    let cleanupService: CleanupService;
    let mockStorageService: jest.Mocked<StorageService>;

    beforeEach(() => {
      mockStorageService = {
        close: jest.fn(),
        getStats: jest.fn(),
      } as any;

      cleanupService = new CleanupService();
      cleanupService.addStorage('session1', mockStorageService);
    });

    afterEach(() => {
      cleanupService.stopCleanupTimer();
    });

    it('should cleanup expired sessions', async () => {
      const expiredSession: StorageSession = {
        id: 'expired',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        lastAccessAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      };

      const activeSession: StorageSession = {
        id: 'active',
        createdAt: new Date(),
        lastAccessAt: new Date(),
      };

      cleanupService.addStorage('expired', mockStorageService);
      cleanupService.addStorage('active', mockStorageService);

      // Mock stats to return session info
      mockStorageService.getStats.mockImplementation(() => Promise.resolve({
        filterCount: 0,
        sessionId: expiredSession.id,
        createdAt: expiredSession.createdAt,
        lastAccessAt: expiredSession.lastAccessAt,
        storageType: 'test',
      }));

      // Run cleanup
      await cleanupService.cleanupExpiredSessions(60 * 60 * 1000); // 1 hour timeout

      // Verify expired session was cleaned up
      expect(mockStorageService.close).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      mockStorageService.close.mockRejectedValue(new Error('Close failed'));

      // Should not throw error during cleanup
      await expect(cleanupService.cleanupExpiredSessions(0)).resolves.toBeUndefined();
    });

    it('should start and stop cleanup timer', () => {
      expect(() => {
        cleanupService.startCleanupTimer();
        cleanupService.stopCleanupTimer();
      }).not.toThrow();
    });
  });

  describe('Integration: PersistentFilterStorage', () => {
    // This test will verify that the refactored PersistentFilterStorage
    // maintains the same API as the original

    it('should maintain backward compatibility', async () => {
      // Test the consolidated PersistentFilterStorage implementation
      const { PersistentFilterStorage } = require('../../src/storage/PersistentFilterStorage');

      const storage = new PersistentFilterStorage(session.id, session.userId, session.apiUrl, mockAdapter);

      // Should implement FilterStorage interface
      expect(typeof storage.list).toBe('function');
      expect(typeof storage.get).toBe('function');
      expect(typeof storage.create).toBe('function');
      expect(typeof storage.update).toBe('function');
      expect(typeof storage.delete).toBe('function');
      expect(typeof storage.findByName).toBe('function');
      expect(typeof storage.clear).toBe('function');
      expect(typeof storage.getByProject).toBe('function');
      expect(typeof storage.getStats).toBe('function');
      expect(typeof storage.close).toBe('function');
      expect(typeof storage.healthCheck).toBe('function');
      expect(typeof storage.getSession).toBe('function');
    });

    it('should orchestrate services correctly', async () => {
      // This test will verify that the consolidated version properly delegates
      // to the appropriate service classes
      const { PersistentFilterStorage } = require('../../src/storage/PersistentFilterStorage');

      const storage = new PersistentFilterStorage(session.id, session.userId, session.apiUrl, mockAdapter);

      // Should delegate to StorageService for CRUD operations
      mockAdapter.create.mockResolvedValue({
        id: randomUUID(),
        name: 'Test',
        filter: 'done = false',
        isGlobal: true,
        created: new Date(),
        updated: new Date(),
      } as SavedFilter);

      const filter = await storage.create({
        name: 'Test',
        filter: 'done = false',
        isGlobal: true,
      });

      expect(filter).toBeDefined();
      expect(mockAdapter.create).toHaveBeenCalled();
    });
  });
});