/**
 * Tests for VikunjaClientFactory - Client Factory Implementation
 * Comprehensive coverage for client creation, caching, cleanup, and session management
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { VikunjaClientFactory } from '../../src/client/VikunjaClientFactory';
import type { AuthManager } from '../../src/auth/AuthManager';
import type { VikunjaClientConstructor } from '../../src/types/node-vikunja-extended';

describe('VikunjaClientFactory', () => {
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockVikunjaClient: any;
  let mockVikunjaClientConstructor: jest.MockedFunction<VikunjaClientConstructor>;
  let factory: VikunjaClientFactory;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock AuthManager
    mockAuthManager = {
      getSession: jest.fn(),
      connect: jest.fn(),
      isAuthenticated: jest.fn(),
      disconnect: jest.fn(),
      getAuthType: jest.fn(),
    } as any;

    // Mock VikunjaClientConstructor to return different objects
    mockVikunjaClientConstructor = jest.fn().mockImplementation(() => ({
      tasks: {},
      projects: {},
      users: {},
      labels: {},
      teams: {},
      webhooks: {},
    }));

    factory = new VikunjaClientFactory(mockAuthManager, mockVikunjaClientConstructor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Client Creation and Caching', () => {
    it('should create a new client instance on first call', () => {
      const session = {
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token-123'
      };

      mockAuthManager.getSession.mockReturnValue(session);

      const client = factory.getClient();

      expect(mockVikunjaClientConstructor).toHaveBeenCalledWith(
        session.apiUrl,
        session.apiToken
      );
      expect(client).toBeDefined();
      expect(typeof client).toBe('object');
      expect(mockAuthManager.getSession).toHaveBeenCalledTimes(1);
    });

    it('should return cached client for same session', () => {
      const session = {
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token-123'
      };

      mockAuthManager.getSession.mockReturnValue(session);

      const client1 = factory.getClient();
      const client2 = factory.getClient();

      expect(client1).toBe(client2);
      expect(mockVikunjaClientConstructor).toHaveBeenCalledTimes(1);
      expect(mockAuthManager.getSession).toHaveBeenCalledTimes(2);
    });

    it('should create new client when API URL changes', () => {
      const session1 = {
        apiUrl: 'https://test1.vikunja.com',
        apiToken: 'test-token-123'
      };

      const session2 = {
        apiUrl: 'https://test2.vikunja.com',
        apiToken: 'test-token-123'
      };

      mockAuthManager.getSession
        .mockReturnValueOnce(session1)
        .mockReturnValueOnce(session2);

      const client1 = factory.getClient();
      const client2 = factory.getClient();

      expect(client1).not.toBe(client2);
      expect(mockVikunjaClientConstructor).toHaveBeenCalledTimes(2);
      expect(mockVikunjaClientConstructor).toHaveBeenNthCalledWith(1, session1.apiUrl, session1.apiToken);
      expect(mockVikunjaClientConstructor).toHaveBeenNthCalledWith(2, session2.apiUrl, session2.apiToken);
    });

    it('should create new client when API token changes', () => {
      const session1 = {
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token-123'
      };

      const session2 = {
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token-456'
      };

      mockAuthManager.getSession
        .mockReturnValueOnce(session1)
        .mockReturnValueOnce(session2);

      const client1 = factory.getClient();
      const client2 = factory.getClient();

      expect(client1).not.toBe(client2);
      expect(mockVikunjaClientConstructor).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple session changes efficiently', () => {
      const sessions = [
        { apiUrl: 'https://test1.vikunja.com', apiToken: 'token1' },
        { apiUrl: 'https://test2.vikunja.com', apiToken: 'token2' },
        { apiUrl: 'https://test1.vikunja.com', apiToken: 'token1' }, // Same as first
        { apiUrl: 'https://test3.vikunja.com', apiToken: 'token3' },
      ];

      sessions.forEach(session => {
        mockAuthManager.getSession.mockReturnValueOnce(session);
        const client = factory.getClient();
        expect(client).toBeDefined();
      });

      // Should create new clients for each unique session
      expect(mockVikunjaClientConstructor).toHaveBeenCalledTimes(4);
    });
  });

  describe('Error Handling', () => {
    it('should handle client creation with various constructor returns', () => {
      // Note: The 'new' operator always returns an object, so the error check at line 45 is unreachable
      // We'll test that the factory handles whatever the constructor returns
      mockAuthManager.getSession.mockReturnValue({
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token'
      });

      const client = factory.getClient();
      expect(client).toBeDefined();
    });

    it('should propagate session errors', () => {
      const sessionError = new Error('No valid session');
      mockAuthManager.getSession.mockImplementation(() => {
        throw sessionError;
      });

      expect(() => factory.getClient()).toThrow(sessionError);
    });

    it('should handle undefined API URL', () => {
      mockAuthManager.getSession.mockReturnValue({
        apiUrl: undefined,
        apiToken: 'test-token'
      });

      const client = factory.getClient();
      expect(client).toBeDefined();
      expect(mockVikunjaClientConstructor).toHaveBeenCalledWith(undefined, 'test-token');
    });

    it('should handle undefined API token', () => {
      mockAuthManager.getSession.mockReturnValue({
        apiUrl: 'https://test.vikunja.com',
        apiToken: undefined
      });

      const client = factory.getClient();
      expect(client).toBeDefined();
      expect(mockVikunjaClientConstructor).toHaveBeenCalledWith('https://test.vikunja.com', undefined);
    });

    it('should handle empty strings in session', () => {
      mockAuthManager.getSession.mockReturnValue({
        apiUrl: '',
        apiToken: ''
      });

      const client = factory.getClient();
      expect(client).toBeDefined();
      expect(mockVikunjaClientConstructor).toHaveBeenCalledWith('', '');
    });

    it('should handle null values in session', () => {
      mockAuthManager.getSession.mockReturnValue({
        apiUrl: null,
        apiToken: null
      });

      const client = factory.getClient();
      expect(client).toBeDefined();
      expect(mockVikunjaClientConstructor).toHaveBeenCalledWith(null, null);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup client instance and session data', () => {
      const session = {
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token'
      };

      mockAuthManager.getSession.mockReturnValue(session);

      // Create a client first
      const client1 = factory.getClient();
      expect(client1).toBeDefined();

      // Cleanup
      factory.cleanup();

      // Next call should create a new client
      const client2 = factory.getClient();
      expect(client2).toBeDefined();
      expect(mockVikunjaClientConstructor).toHaveBeenCalledTimes(2);
    });

    it('should handle cleanup when no client exists', () => {
      expect(() => factory.cleanup()).not.toThrow();
      expect(mockVikunjaClientConstructor).not.toHaveBeenCalled();
    });

    it('should handle multiple cleanup calls', () => {
      const session = {
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token'
      };

      mockAuthManager.getSession.mockReturnValue(session);

      factory.getClient();
      factory.cleanup();
      factory.cleanup();
      factory.cleanup();

      expect(() => factory.getClient()).not.toThrow();
    });
  });

  describe('Session Validation', () => {
    it('should return true when session is valid', () => {
      mockAuthManager.getSession.mockReturnValue({
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token'
      });

      const isValid = factory.hasValidSession();
      expect(isValid).toBe(true);
    });

    it('should return false when session is invalid', () => {
      mockAuthManager.getSession.mockImplementation(() => {
        throw new Error('Invalid session');
      });

      const isValid = factory.hasValidSession();
      expect(isValid).toBe(false);
    });

    it('should handle session validation without throwing', () => {
      mockAuthManager.getSession.mockImplementation(() => {
        throw new Error('Session expired');
      });

      expect(() => factory.hasValidSession()).not.toThrow();
      expect(factory.hasValidSession()).toBe(false);
    });

    it('should handle various session error types', () => {
      const errorTypes = [
        new Error('Network error'),
        new TypeError('Invalid session format'),
        new RangeError('Session out of bounds'),
        new ReferenceError('Session reference error'),
        'String error',
        null,
        undefined,
      ];

      errorTypes.forEach((error) => {
        mockAuthManager.getSession.mockImplementation(() => {
          if (error instanceof Error) {
            throw error;
          }
          throw error;
        });

        expect(factory.hasValidSession()).toBe(false);
      });
    });

    it('should not create client when checking session validity', () => {
      mockAuthManager.getSession.mockReturnValue({
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token'
      });

      factory.hasValidSession();
      expect(mockVikunjaClientConstructor).not.toHaveBeenCalled();
    });
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with required dependencies', () => {
      expect(() => new VikunjaClientFactory(mockAuthManager, mockVikunjaClientConstructor))
        .not.toThrow();
    });

    it('should store provided dependencies', () => {
      const factory = new VikunjaClientFactory(mockAuthManager, mockVikunjaClientConstructor);

      // Test that factory was initialized correctly by checking it can create clients
      mockAuthManager.getSession.mockReturnValue({
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token'
      });

      const client = factory.getClient();
      expect(client).toBeDefined();
      expect(mockVikunjaClientConstructor).toHaveBeenCalledWith(
        'https://test.vikunja.com',
        'test-token'
      );
    });

    it('should handle different VikunjaClient implementations', () => {
      const customClient = {
        customMethod: jest.fn(),
        tasks: { list: jest.fn() }
      };

      const customConstructor = jest.fn().mockReturnValue(customClient);
      const customFactory = new VikunjaClientFactory(mockAuthManager, customConstructor);

      mockAuthManager.getSession.mockReturnValue({
        apiUrl: 'https://custom.vikunja.com',
        apiToken: 'custom-token'
      });

      const client = customFactory.getClient();
      expect(client).toBe(customClient);
      expect(customConstructor).toHaveBeenCalledWith(
        'https://custom.vikunja.com',
        'custom-token'
      );
    });
  });

  describe('Integration and Edge Cases', () => {
    it('should handle rapid client creation requests', () => {
      const session = {
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token'
      };

      mockAuthManager.getSession.mockReturnValue(session);

      // Make multiple rapid requests
      const clients = [];
      for (let i = 0; i < 10; i++) {
        clients.push(factory.getClient());
      }

      // All should return the same client
      clients.forEach(client => {
        expect(client).toBeDefined();
        expect(typeof client).toBe('object');
      });

      // Constructor should only be called once
      expect(mockVikunjaClientConstructor).toHaveBeenCalledTimes(1);
    });

    it('should handle session changes with cleanup', () => {
      const session1 = {
        apiUrl: 'https://test1.vikunja.com',
        apiToken: 'token1'
      };

      const session2 = {
        apiUrl: 'https://test2.vikunja.com',
        apiToken: 'token2'
      };

      mockAuthManager.getSession.mockReturnValueOnce(session1);
      const client1 = factory.getClient();

      mockAuthManager.getSession.mockReturnValueOnce(session2);
      const client2 = factory.getClient();

      // Cleanup and create new client
      factory.cleanup();
      mockAuthManager.getSession.mockReturnValueOnce(session1);
      const client3 = factory.getClient();

      expect(client1).not.toBe(client2);
      expect(client2).not.toBe(client3);
      expect(mockVikunjaClientConstructor).toHaveBeenCalledTimes(3);
    });

    it('should maintain client state after cleanup', () => {
      const session = {
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token'
      };

      mockAuthManager.getSession.mockReturnValue(session);

      const client1 = factory.getClient();
      factory.cleanup();
      const client2 = factory.getClient();

      // Both clients should be valid but different instances
      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
      expect(client1).not.toBe(client2);
      expect(mockVikunjaClientConstructor).toHaveBeenCalledTimes(2);
    });

    it('should handle constructor function returning undefined', () => {
      // Note: The 'new' operator with undefined return will create an empty object
      // This is JavaScript behavior - 'new' always returns an object
      mockVikunjaClientConstructor.mockReturnValueOnce(undefined as any);
      mockAuthManager.getSession.mockReturnValue({
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token'
      });

      const client = factory.getClient();
      expect(client).toBeDefined();
      expect(typeof client).toBe('object');
    });

    it('should handle constructor throwing an error', () => {
      const constructorError = new Error('Constructor failed');
      mockVikunjaClientConstructor.mockImplementation(() => {
        throw constructorError;
      });

      mockAuthManager.getSession.mockReturnValue({
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token'
      });

      expect(() => factory.getClient()).toThrow(constructorError);
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not leak references after cleanup', () => {
      const sessions = Array.from({ length: 5 }, (_, i) => ({
        apiUrl: `https://test${i}.vikunja.com`,
        apiToken: `token${i}`
      }));

      sessions.forEach((session, index) => {
        mockAuthManager.getSession.mockReturnValueOnce(session);
        const client = factory.getClient();
        expect(client).toBeDefined();

        // Cleanup after every few clients
        if (index % 2 === 1) {
          factory.cleanup();
        }
      });

      // Should have created clients for each unique session
      expect(mockVikunjaClientConstructor).toHaveBeenCalledTimes(5);
    });

    it('should handle cleanup without affecting session validation', () => {
      const session = {
        apiUrl: 'https://test.vikunja.com',
        apiToken: 'test-token'
      };

      mockAuthManager.getSession.mockReturnValue(session);

      const isValidBefore = factory.hasValidSession();
      expect(isValidBefore).toBe(true);

      factory.getClient();
      factory.cleanup();

      const isValidAfter = factory.hasValidSession();
      expect(isValidAfter).toBe(true);
    });
  });
});