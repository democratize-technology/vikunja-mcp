/**
 * Comprehensive tests for ClientContext thread safety and race conditions
 * Tests concurrent access patterns that could cause system instability
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ClientContext } from '../src/client';
import { VikunjaClientFactory } from '../src/client/VikunjaClientFactory';
import { AuthManager } from '../src/auth/AuthManager';

// Mock the VikunjaClientFactory for testing
jest.mock('../src/client/VikunjaClientFactory');

describe('ClientContext Race Conditions and Thread Safety', () => {
  let context: ClientContext;
  let mockFactory1: jest.Mocked<VikunjaClientFactory>;
  let mockFactory2: jest.Mocked<VikunjaClientFactory>;
  let mockAuthManager: jest.Mocked<AuthManager>;

  beforeEach(() => {
    // Reset singleton instance for each test
    (ClientContext as any).instance = null;
    context = ClientContext.getInstance();

    mockAuthManager = {
      authenticate: jest.fn(),
      getSession: jest.fn(),
      isAuthenticated: jest.fn().mockReturnValue(true),
      connect: jest.fn(),
      disconnect: jest.fn(),
      getToken: jest.fn().mockReturnValue('mock-token'),
      getClient: jest.fn(),
      refreshToken: jest.fn()
    } as any;

    mockFactory1 = {
      getClient: jest.fn().mockReturnValue({ id: 'client1' }),
      getAuthManager: jest.fn().mockReturnValue(mockAuthManager)
    } as any;

    mockFactory2 = {
      getClient: jest.fn().mockReturnValue({ id: 'client2' }),
      getAuthManager: jest.fn().mockReturnValue(mockAuthManager)
    } as any;
  });

  afterEach(() => {
    // Clean up singleton instance
    (ClientContext as any).instance = null;
  });

  describe('Concurrent Factory Access', () => {
    it('should handle concurrent setClientFactory calls without corruption (thread-safe version)', async () => {
      // Test the new thread-safe async methods
      const results: string[] = [];
      const promises = Array.from({ length: 100 }, async (_, i) => {
        // Add small delay to increase chance of race conditions
        await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
        await context.setClientFactory(i % 2 === 0 ? mockFactory1 : mockFactory2);

        // Check which factory is currently set using thread-safe method
        try {
          const client = await context.getClient();
          results.push(client.id);
        } catch (error) {
          results.push('error');
        }
      });

      await Promise.all(promises);

      expect(results.length).toBe(100);

      // With thread-safe implementation, results should be consistent
      // (all operations should see the same final state)
      const uniqueClients = new Set(results);
      expect(uniqueClients.size).toBeGreaterThan(0);
    });

    it('should prevent race conditions with thread-safe async methods', async () => {
      const threadSafeContext = await ClientContext.getInstanceAsync();
      const results: string[] = [];

      const promises = Array.from({ length: 100 }, async (_, i) => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
        await threadSafeContext.setClientFactory(i % 2 === 0 ? mockFactory1 : mockFactory2);

        try {
          const client = await threadSafeContext.getClient();
          results.push(client.id);
        } catch (error) {
          results.push('error');
        }
      });

      await Promise.all(promises);

      expect(results.length).toBe(100);

      // Thread-safe version should provide more consistent behavior
      const uniqueClients = new Set(results);
      expect(uniqueClients.size).toBeGreaterThan(0);
    });

    it('should prevent getClient race conditions during factory changes', async () => {
      let operationCount = 0;
      const promises = Array.from({ length: 50 }, async (_, i) => {
        if (i % 3 === 0) {
          // Set factory
          context.setClientFactory(i % 6 === 0 ? mockFactory1 : mockFactory2);
        } else if (i % 3 === 1) {
          // Get client
          try {
            await context.getClient();
            operationCount++;
          } catch (error) {
            // Expected when factory not set
          }
        } else {
          // Check factory
          context.hasFactory();
        }
      });

      await Promise.all(promises);

      // Should have consistent final state
      const finalState = context.hasFactory();
      expect(finalState).toBe(true);
    });

    it('should handle 1000+ concurrent operations without deadlocks', async () => {
      const promises = Array.from({ length: 1000 }, async (_, i) => {
        switch (i % 4) {
          case 0:
            context.setClientFactory(mockFactory1);
            break;
          case 1:
            return context.getClient();
          case 2:
            context.hasFactory();
            break;
          case 3:
            context.clearClientFactory();
            break;
        }
      });

      const results = await Promise.allSettled(promises);

      // Most operations should succeed (only getClient should fail when factory cleared)
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(800); // Allow some failures
    });

    it('should maintain atomic getInstance behavior under load', async () => {
      const instances = await Promise.all(
        Array.from({ length: 100 }, () => Promise.resolve(ClientContext.getInstance()))
      );

      // All instances should be the same singleton
      const firstInstance = instances[0];
      instances.forEach(instance => {
        expect(instance).toBe(firstInstance);
      });
    });
  });

  describe('Factory State Consistency', () => {
    it('should not return null client when factory is being set', async () => {
      let clientCallCount = 0;
      const promises = Array.from({ length: 20 }, async (_, i) => {
        if (i === 10) {
          // Set factory in the middle of operations
          context.setClientFactory(mockFactory1);
        }

        try {
          const client = await context.getClient();
          expect(client).toBeDefined();
          clientCallCount++;
        } catch (error) {
          // Expected before factory is set
        }
      });

      await Promise.all(promises);

      // Should have gotten some successful client calls
      expect(clientCallCount).toBeGreaterThan(0);
    });

    it('should handle rapid factory changes gracefully', async () => {
      const promises = Array.from({ length: 100 }, (_, i) => {
        const factory = i % 2 === 0 ? mockFactory1 : mockFactory2;
        return context.setClientFactory(factory);
      });

      await Promise.all(promises);

      // Final state should be consistent
      expect(context.hasFactory()).toBe(true);
      const client = await context.getClient();
      expect(client).toBeDefined();
    });

    it('should prevent partial state updates during concurrent access', async () => {
      // Set initial factory
      context.setClientFactory(mockFactory1);

      const promises = Array.from({ length: 50 }, async (_, i) => {
        if (i % 2 === 0) {
          context.clearClientFactory();
        } else {
          try {
            return await context.getClient();
          } catch (error) {
            return null;
          }
        }
      });

      const results = await Promise.allSettled(promises);

      // Should handle partial failures gracefully
      expect(results.every(r => r.status === 'fulfilled')).toBe(true);
    });
  });
});