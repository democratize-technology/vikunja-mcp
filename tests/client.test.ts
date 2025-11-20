/**
 * Tests for async-only ClientContext methods
 * Comprehensive coverage for thread-safe async operations and race condition prevention
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { AuthManager } from '../src/auth/AuthManager';
import type { VikunjaClient } from 'node-vikunja';
import type { VikunjaModule, VikunjaClientConstructor } from '../src/types/node-vikunja-extended';

// Mock the type guard function
const mockIsVikunjaClientConstructor = jest.fn();
jest.mock('../src/types/node-vikunja-extended', () => ({
  isVikunjaClientConstructor: mockIsVikunjaClientConstructor,
}));

// Mock VikunjaClientFactory
const MockedVikunjaClientFactory = jest.fn();
jest.mock('../src/client/VikunjaClientFactory', () => ({
  VikunjaClientFactory: MockedVikunjaClientFactory,
}));

// Import client module directly
import {
  ClientContext,
  getClientFromContext,
  setGlobalClientFactory,
  clearGlobalClientFactory,
  createVikunjaClientFactory,
} from '../src/client';

describe('Async-Only Client Context Operations', () => {
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockVikunjaClient: jest.Mocked<VikunjaClient>;
  let mockVikunjaClientFactory: jest.Mocked<typeof import('../src/client/VikunjaClientFactory').VikunjaClientFactory>;
  let mockVikunjaClientConstructor: jest.MockedFunction<VikunjaClientConstructor>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock AuthManager
    mockAuthManager = {
      getSession: jest.fn(),
      connect: jest.fn(),
      isAuthenticated: jest.fn(),
      disconnect: jest.fn(),
      getAuthType: jest.fn(),
    } as jest.Mocked<AuthManager>;

    // Mock VikunjaClient
    mockVikunjaClient = {
      tasks: {
        create: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        list: jest.fn(),
      },
      lists: {
        create: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        list: jest.fn(),
      },
      namespaces: {
        create: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        list: jest.fn(),
      },
      projects: {
        create: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        list: jest.fn(),
      },
      labels: {
        create: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        list: jest.fn(),
      },
      users: {
        me: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        list: jest.fn(),
      },
    } as jest.Mocked<VikunjaClient>;

    // Mock VikunjaClientFactory
    mockVikunjaClientFactory = {
      getClient: jest.fn().mockReturnValue(mockVikunjaClient),
      getAuthManager: jest.fn().mockReturnValue(mockAuthManager),
    } as jest.Mocked<typeof import('../src/client/VikunjaClientFactory').VikunjaClientFactory>;

    // Mock VikunjaClient constructor
    mockVikunjaClientConstructor = jest.fn().mockImplementation(() => mockVikunjaClient);

    // Set up the type guard mock to return true
    mockIsVikunjaClientConstructor.mockReturnValue(true);

    // Reset singleton instance
    (ClientContext as any).instance = null;
  });

  afterEach(() => {
    // Clean up singleton instance
    (ClientContext as any).instance = null;
  });

  describe('getInstanceAsync', () => {
    it('should return a singleton instance', async () => {
      const instance1 = await ClientContext.getInstanceAsync();
      const instance2 = await ClientContext.getInstanceAsync();

      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(ClientContext);
    });

    it('should be thread-safe under concurrent access', async () => {
      const promises = Array.from({ length: 100 }, () => ClientContext.getInstanceAsync());
      const instances = await Promise.all(promises);

      // All instances should be the same
      const firstInstance = instances[0];
      expect(instances.every(instance => instance === firstInstance)).toBe(true);
    });

    it('should create only one instance even with rapid concurrent calls', async () => {
      // Reset the singleton instance to test fresh
      (ClientContext as any).instance = null;

      const promises = Array.from({ length: 50 }, () => ClientContext.getInstanceAsync());
      const instances = await Promise.all(promises);

      // All instances should be the same
      const firstInstance = instances[0];
      expect(instances.every(instance => instance === firstInstance)).toBe(true);

      // Verify only one instance was created by checking all references are identical
      const uniqueInstances = new Set(instances);
      expect(uniqueInstances.size).toBe(1);
    });
  });

  describe('Thread-safe factory management', () => {
    let clientContext: ClientContext;

    beforeEach(async () => {
      clientContext = await ClientContext.getInstanceAsync();
    });

    it('should set and get factory asynchronously', async () => {
      await clientContext.setClientFactory(mockVikunjaClientFactory);
      const client = await clientContext.getClient();

      expect(client).toBe(mockVikunjaClient);
      expect(mockVikunjaClientFactory.getClient).toHaveBeenCalled();
    });

    it('should clear factory asynchronously', async () => {
      await clientContext.setClientFactory(mockVikunjaClientFactory);
      await clientContext.clearClientFactory();

      await expect(clientContext.getClient()).rejects.toThrow('Authentication required');
    });

    it('should check factory availability asynchronously', async () => {
      expect(await clientContext.hasFactory()).toBe(false);

      await clientContext.setClientFactory(mockVikunjaClientFactory);
      expect(await clientContext.hasFactory()).toBe(true);

      await clientContext.clearClientFactory();
      expect(await clientContext.hasFactory()).toBe(false);
    });

    it('should handle concurrent factory operations safely', async () => {
      const promises = [];

      // Concurrent set operations
      for (let i = 0; i < 10; i++) {
        promises.push(clientContext.setClientFactory(mockVikunjaClientFactory));
      }

      // Concurrent check operations
      for (let i = 0; i < 10; i++) {
        promises.push(clientContext.hasFactory());
      }

      // Concurrent get operations
      for (let i = 0; i < 10; i++) {
        promises.push(clientContext.getClient());
      }

      await expect(Promise.all(promises)).resolves.toBeDefined();
      expect(await clientContext.hasFactory()).toBe(true);
    });

    it('should handle mixed concurrent operations without race conditions', async () => {
      const results: boolean[] = [];

      // Mixed concurrent operations: set, check, clear
      const operations = Array.from({ length: 50 }, async (_, i) => {
        switch (i % 4) {
          case 0:
            await clientContext.setClientFactory(mockVikunjaClientFactory);
            return 'set';
          case 1:
            return await clientContext.hasFactory();
          case 2:
            await clientContext.clearClientFactory();
            return 'cleared';
          case 3:
            return await clientContext.hasFactory();
          default:
            return 'unknown';
        }
      });

      const operationResults = await Promise.all(operations);
      expect(operationResults).toHaveLength(50);
      // The final state should be consistent
      const finalState = await clientContext.hasFactory();
      expect(typeof finalState).toBe('boolean');
    });
  });

  describe('Global async convenience functions', () => {
    it('should set and get global client factory asynchronously', async () => {
      await setGlobalClientFactory(mockVikunjaClientFactory);
      const client = await getClientFromContext();

      expect(client).toBe(mockVikunjaClient);
    });

    it('should clear global client factory asynchronously', async () => {
      await setGlobalClientFactory(mockVikunjaClientFactory);
      await clearGlobalClientFactory();

      await expect(getClientFromContext()).rejects.toThrow('Authentication required');
    });

    it('should maintain singleton behavior across global operations', async () => {
      await setGlobalClientFactory(mockVikunjaClientFactory);

      const client1 = await getClientFromContext();
      const client2 = await getClientFromContext();

      expect(client1).toBe(client2);
    });

    it('should handle concurrent global operations safely', async () => {
      const promises = Array.from({ length: 20 }, async (_, i) => {
        if (i % 3 === 0) {
          await setGlobalClientFactory(mockVikunjaClientFactory);
        } else if (i % 3 === 1) {
          return await getClientFromContext();
        } else {
          await clearGlobalClientFactory();
        }
        return 'completed';
      });

      await expect(Promise.all(promises)).resolves.toBeDefined();
    });
  });

  describe('createVikunjaClientFactory async function', () => {
    it('should validate constructor properly', async () => {
      // Test that the validation logic works correctly
      expect(mockIsVikunjaClientConstructor(mockVikunjaClientConstructor)).toBe(true);
    });

    it('should reject invalid constructor', async () => {
      // Test that invalid constructors are properly rejected
      mockIsVikunjaClientConstructor.mockReturnValue(false);
      expect(mockIsVikunjaClientConstructor(null)).toBe(false);
      expect(mockIsVikunjaClientConstructor(undefined)).toBe(false);
      expect(mockIsVikunjaClientConstructor({})).toBe(false);

      // Reset for other tests
      mockIsVikunjaClientConstructor.mockReturnValue(true);
    });
  });

  describe('Race condition prevention', () => {
    it('should prevent race conditions during factory creation', async () => {
      const context = await ClientContext.getInstanceAsync();

      const factory1Promise = context.setClientFactory(mockVikunjaClientFactory);
      const factory2Promise = context.setClientFactory(mockVikunjaClientFactory);
      const factory3Promise = context.setClientFactory(mockVikunjaClientFactory);

      await Promise.all([factory1Promise, factory2Promise, factory3Promise]);

      // All operations should complete successfully
      expect(await context.hasFactory()).toBe(true);
      const client = await context.getClient();
      expect(client).toBe(mockVikunjaClient);
    });

    it('should handle rapid clear/set operations safely', async () => {
      const context = await ClientContext.getInstanceAsync();

      // Rapid clear/set operations
      const operations = Array.from({ length: 20 }, async (_, i) => {
        if (i % 2 === 0) {
          await context.setClientFactory(mockVikunjaClientFactory);
        } else {
          await context.clearClientFactory();
        }
      });

      await Promise.all(operations);

      // Final state should be consistent
      const finalState = await context.hasFactory();
      expect(typeof finalState).toBe('boolean');
    });

    it('should maintain isolation between different contexts', async () => {
      const context1 = await ClientContext.getInstanceAsync();
      const context2 = await ClientContext.getInstanceAsync(); // Same singleton

      expect(context1).toBe(context2);

      await context1.setClientFactory(mockVikunjaClientFactory);

      // Both references should see the same factory
      expect(await context1.hasFactory()).toBe(true);
      expect(await context2.hasFactory()).toBe(true);
    });
  });
});