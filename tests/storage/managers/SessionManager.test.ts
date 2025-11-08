/**
 * SessionManager tests
 */

import { SessionManager } from '../../../src/storage/managers/SessionManager';
import type { ManagedSession } from '../../../src/storage/managers/SessionManager';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({
      sessionTimeoutMs: 30 * 1000, // 30 seconds for testing
      cleanupIntervalMs: 60 * 1000, // 1 minute for testing
      debugLogging: false,
    });
  });

  afterEach(async () => {
    await sessionManager.shutdown();
  });

  describe('Session Creation', () => {
    test('should create a session with default options', async () => {
      const session = await sessionManager.createSession();

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastAccessAt).toBeInstanceOf(Date);
      expect(session.timeoutMs).toBe(30 * 1000);
      expect(session.expiresAt).toBeInstanceOf(Date);
    });

    test('should create a session with custom options', async () => {
      const options = {
        sessionId: 'test-session-id',
        userId: 'test-user-123',
        apiUrl: 'https://api.example.com',
        customTimeoutMs: 60 * 1000,
      };

      const session = await sessionManager.createSession(options);

      expect(session.id).toBe('test-session-id');
      expect(session.userId).toBe('test-user-123');
      expect(session.apiUrl).toBe('https://api.example.com');
      expect(session.timeoutMs).toBe(60 * 1000);
    });

    test('should throw error when creating duplicate session', async () => {
      const options = { sessionId: 'duplicate-id' };

      await sessionManager.createSession(options);

      await expect(sessionManager.createSession(options)).rejects.toThrow(
        "Session with ID 'duplicate-id' already exists"
      );
    });

    test('should throw error when max sessions limit is reached', async () => {
      const smallSessionManager = new SessionManager({ maxSessions: 1 });

      try {
        await smallSessionManager.createSession({ sessionId: 'session1' });

        await expect(
          smallSessionManager.createSession({ sessionId: 'session2' })
        ).rejects.toThrow('Maximum session limit (1) reached');
      } finally {
        await smallSessionManager.shutdown();
      }
    });
  });

  describe('Session Retrieval', () => {
    test('should retrieve existing session', async () => {
      const createdSession = await sessionManager.createSession({
        sessionId: 'test-session',
        userId: 'test-user',
      });

      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));

      const retrievedSession = await sessionManager.getSession('test-session');

      expect(retrievedSession).toBeDefined();
      expect(retrievedSession?.id).toBe('test-session');
      expect(retrievedSession?.userId).toBe('test-user');
      expect(retrievedSession?.lastAccessAt.getTime()).toBeGreaterThanOrEqual(
        createdSession.lastAccessAt.getTime()
      );
    });

    test('should return null for non-existent session', async () => {
      const session = await sessionManager.getSession('non-existent');
      expect(session).toBeNull();
    });

    test('should return null for expired session', async () => {
      const shortSessionManager = new SessionManager({
        sessionTimeoutMs: 1, // 1ms timeout
      });

      try {
        await shortSessionManager.createSession({ sessionId: 'expire-test' });

        // Wait for session to expire
        await new Promise(resolve => setTimeout(resolve, 10));

        const session = await shortSessionManager.getSession('expire-test');
        expect(session).toBeNull();
      } finally {
        await shortSessionManager.shutdown();
      }
    });
  });

  describe('Session Access Time Updates', () => {
    test('should update access time for existing session', async () => {
      await sessionManager.createSession({ sessionId: 'access-test' });

      const initialUpdate = await sessionManager.updateAccessTime('access-test');
      expect(initialUpdate).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 10));

      const secondUpdate = await sessionManager.updateAccessTime('access-test');
      expect(secondUpdate).toBe(true);
    });

    test('should return false for non-existent session', async () => {
      const updated = await sessionManager.updateAccessTime('non-existent');
      expect(updated).toBe(false);
    });
  });

  describe('Session Validation', () => {
    test('should validate existing active session', async () => {
      await sessionManager.createSession({ sessionId: 'valid-test' });

      const isValid = await sessionManager.isSessionValid('valid-test');
      expect(isValid).toBe(true);
    });

    test('should return false for non-existent session', async () => {
      const isValid = await sessionManager.isSessionValid('non-existent');
      expect(isValid).toBe(false);
    });
  });

  describe('Session Removal', () => {
    test('should remove existing session', async () => {
      await sessionManager.createSession({ sessionId: 'remove-test' });

      const removed = await sessionManager.removeSession('remove-test');
      expect(removed).toBe(true);

      const session = await sessionManager.getSession('remove-test');
      expect(session).toBeNull();
    });

    test('should return false for non-existent session', async () => {
      const removed = await sessionManager.removeSession('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('Active Sessions Management', () => {
    test('should return empty array when no sessions exist', async () => {
      const sessions = await sessionManager.getActiveSessions();
      expect(sessions).toEqual([]);
    });

    test('should return all active sessions', async () => {
      await sessionManager.createSession({ sessionId: 'session1' });
      await sessionManager.createSession({ sessionId: 'session2' });

      const sessions = await sessionManager.getActiveSessions();
      expect(sessions).toHaveLength(2);

      const sessionIds = sessions.map(s => s.id).sort();
      expect(sessionIds).toEqual(['session1', 'session2']);
    });

    test('should not return expired sessions', async () => {
      const shortSessionManager = new SessionManager({
        sessionTimeoutMs: 1, // 1ms timeout
      });

      try {
        await shortSessionManager.createSession({ sessionId: 'will-expire' });
        await shortSessionManager.createSession({
          sessionId: 'wont-expire',
          customTimeoutMs: 60 * 1000, // 1 minute timeout
        });

        // Wait for first session to expire
        await new Promise(resolve => setTimeout(resolve, 10));

        const sessions = await shortSessionManager.getActiveSessions();
        expect(sessions).toHaveLength(1);
        expect(sessions[0].id).toBe('wont-expire');
      } finally {
        await shortSessionManager.shutdown();
      }
    });
  });

  describe('Session Statistics', () => {
    test('should return stats for empty session manager', async () => {
      const stats = await sessionManager.getSessionStats();

      expect(stats.totalSessions).toBe(0);
      expect(stats.expiredSessions).toBe(0);
      expect(stats.averageSessionAgeMs).toBe(0);
      expect(stats.oldestSession).toBeUndefined();
      expect(stats.newestSession).toBeUndefined();
    });

    test('should return correct stats with active sessions', async () => {
      await sessionManager.createSession({ sessionId: 'session1' });
      await new Promise(resolve => setTimeout(resolve, 10));
      await sessionManager.createSession({ sessionId: 'session2' });

      const stats = await sessionManager.getSessionStats();

      expect(stats.totalSessions).toBe(2);
      expect(stats.expiredSessions).toBe(0);
      expect(stats.oldestSession).toBeInstanceOf(Date);
      expect(stats.newestSession).toBeInstanceOf(Date);
      expect(stats.averageSessionAgeMs).toBeGreaterThan(0);
    });
  });

  describe('Session Metadata Management', () => {
    test('should update and retrieve session metadata', async () => {
      await sessionManager.createSession({ sessionId: 'metadata-test' });

      const metadata = { key1: 'value1', key2: 42 };
      const updated = await sessionManager.updateSessionMetadata('metadata-test', metadata);
      expect(updated).toBe(true);

      const retrieved = await sessionManager.getSessionMetadata('metadata-test');
      expect(retrieved).toEqual(metadata);
    });

    test('should merge metadata when updating', async () => {
      await sessionManager.createSession({ sessionId: 'merge-test' });

      await sessionManager.updateSessionMetadata('merge-test', { key1: 'value1' });
      await sessionManager.updateSessionMetadata('merge-test', { key2: 'value2' });

      const metadata = await sessionManager.getSessionMetadata('merge-test');
      expect(metadata).toEqual({ key1: 'value1', key2: 'value2' });
    });

    test('should return null for non-existent session metadata', async () => {
      const metadata = await sessionManager.getSessionMetadata('non-existent');
      expect(metadata).toBeNull();
    });
  });

  describe('Cleanup Operations', () => {
    test('should clean up expired sessions', async () => {
      const shortSessionManager = new SessionManager({
        sessionTimeoutMs: 1, // 1ms timeout
        cleanupIntervalMs: 1000, // Long interval to avoid auto-cleanup
      });

      try {
        await shortSessionManager.createSession({ sessionId: 'expire1' });
        await shortSessionManager.createSession({
          sessionId: 'expire2',
          customTimeoutMs: 60 * 1000, // Won't expire
        });

        // Wait for first session to expire
        await new Promise(resolve => setTimeout(resolve, 10));

        const cleanedUp = await shortSessionManager.cleanupExpiredSessions();
        expect(cleanedUp).toBe(1);

        const sessions = await shortSessionManager.getActiveSessions();
        expect(sessions).toHaveLength(1);
        expect(sessions[0].id).toBe('expire2');
      } finally {
        await shortSessionManager.shutdown();
      }
    });
  });

  describe('Configuration', () => {
    test('should return current configuration', () => {
      const config = sessionManager.getConfig();

      expect(config.sessionTimeoutMs).toBe(30 * 1000);
      expect(config.cleanupIntervalMs).toBe(60 * 1000);
      expect(config.maxSessions).toBe(1000);
      expect(config.debugLogging).toBe(false);
    });
  });

  describe('Clear All Sessions', () => {
    test('should clear all sessions', async () => {
      await sessionManager.createSession({ sessionId: 'session1' });
      await sessionManager.createSession({ sessionId: 'session2' });

      const clearedCount = await sessionManager.clearAllSessions();
      expect(clearedCount).toBe(2);

      const sessions = await sessionManager.getActiveSessions();
      expect(sessions).toHaveLength(0);
    });
  });
});