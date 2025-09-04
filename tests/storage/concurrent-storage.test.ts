/**
 * Comprehensive tests for thread-safe, session-scoped storage
 * Tests race conditions, concurrent access, and session isolation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { InMemoryFilterStorage, storageManager } from '../../src/storage/FilterStorage';
import type { SavedFilter } from '../../src/types/filters';

// Mock the logger to avoid console spam during tests
jest.mock('../../src/utils/logger');

describe('Thread-Safe Session-Scoped Storage', () => {
  afterEach(async () => {
    // Clean up all storage instances after each test
    await storageManager.clearAll();
    storageManager.stopCleanupTimer();
  });

  describe('AsyncMutex', () => {
    it('should prevent race conditions in concurrent operations', async () => {
      const storage = await storageManager.getStorage('test-session-1');
      
      // Create multiple concurrent operations
      const operations = Array.from({ length: 10 }, (_, i) =>
        storage.create({
          name: `Filter ${i}`,
          filter: `done = ${i % 2 === 0}`,
          isGlobal: false,
        })
      );

      // All operations should complete successfully without data corruption
      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(10);
      expect(new Set(results.map(r => r.id)).size).toBe(10); // All IDs should be unique
      
      // Verify all filters were stored correctly
      const allFilters = await storage.list();
      expect(allFilters).toHaveLength(10);
    });

    it('should handle concurrent read/write operations safely', async () => {
      const storage = await storageManager.getStorage('test-session-2');
      
      // Create an initial filter
      const initialFilter = await storage.create({
        name: 'Initial Filter',
        filter: 'done = false',
        isGlobal: true,
      });

      // Perform concurrent read and write operations
      const operations = [
        // Multiple reads
        ...Array.from({ length: 5 }, () => storage.get(initialFilter.id)),
        ...Array.from({ length: 5 }, () => storage.list()),
        // Multiple writes
        ...Array.from({ length: 3 }, (_, i) =>
          storage.create({
            name: `Concurrent Filter ${i}`,
            filter: `priority = ${i + 1}`,
            isGlobal: false,
          })
        ),
        // Updates
        ...Array.from({ length: 2 }, (_, i) =>
          storage.update(initialFilter.id, {
            description: `Updated description ${i}`,
          })
        ),
      ];

      const results = await Promise.all(operations);
      
      // All operations should complete without errors
      expect(results).toHaveLength(15);
      
      // Verify final state
      const finalFilters = await storage.list();
      expect(finalFilters).toHaveLength(4); // 1 initial + 3 created
    });

    it('should handle concurrent delete operations safely', async () => {
      const storage = await storageManager.getStorage('test-session-3');
      
      // Create multiple filters
      const filters = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          storage.create({
            name: `Filter ${i}`,
            filter: `priority = ${i + 1}`,
            isGlobal: false,
          })
        )
      );

      // Attempt to delete the same filter concurrently (should fail gracefully)
      const deleteOperations = Array.from({ length: 3 }, () =>
        storage.delete(filters[0].id).catch(e => e)
      );

      const deleteResults = await Promise.all(deleteOperations);
      
      // One should succeed, others should fail with proper error
      const successes = deleteResults.filter(r => !(r instanceof Error));
      const failures = deleteResults.filter(r => r instanceof Error);
      
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(2);
      
      // Verify filter was actually deleted
      const remainingFilters = await storage.list();
      expect(remainingFilters).toHaveLength(4);
    });
  });

  describe('Session Isolation', () => {
    it('should isolate storage between different sessions', async () => {
      const session1Storage = await storageManager.getStorage('session-1', 'user1', 'http://api1.com');
      const session2Storage = await storageManager.getStorage('session-2', 'user2', 'http://api2.com');
      
      // Create filters in each session
      const filter1 = await session1Storage.create({
        name: 'Session 1 Filter',
        filter: 'done = false',
        isGlobal: true,
      });
      
      const filter2 = await session2Storage.create({
        name: 'Session 2 Filter',
        filter: 'priority >= 3',
        isGlobal: false,
      });

      // Each session should only see its own filters
      const session1Filters = await session1Storage.list();
      const session2Filters = await session2Storage.list();
      
      expect(session1Filters).toHaveLength(1);
      expect(session2Filters).toHaveLength(1);
      expect(session1Filters[0].id).toBe(filter1.id);
      expect(session2Filters[0].id).toBe(filter2.id);
      
      // Verify complete isolation
      const filter1InSession2 = await session2Storage.get(filter1.id);
      const filter2InSession1 = await session1Storage.get(filter2.id);
      
      expect(filter1InSession2).toBeNull();
      expect(filter2InSession1).toBeNull();
    });

    it('should prevent cross-session data contamination', async () => {
      const sessions = await Promise.all([
        storageManager.getStorage('contamination-test-1'),
        storageManager.getStorage('contamination-test-2'),
        storageManager.getStorage('contamination-test-3'),
      ]);

      // Create filters in all sessions concurrently
      const createOperations = sessions.map((storage, i) =>
        Promise.all(
          Array.from({ length: 3 }, (_, j) =>
            storage.create({
              name: `Session ${i} Filter ${j}`,
              filter: `priority = ${j + 1}`,
              isGlobal: false,
            })
          )
        )
      );

      const results = await Promise.all(createOperations);
      
      // Each session should have exactly 3 filters
      for (let i = 0; i < sessions.length; i++) {
        const filters = await sessions[i].list();
        expect(filters).toHaveLength(3);
        
        // All filters should belong to the correct session
        for (const filter of filters) {
          expect(filter.name).toContain(`Session ${i}`);
        }
      }
    });

    it('should handle same session ID with different parameters correctly', async () => {
      const sessionId = 'duplicate-session-test';
      
      // Get storage instances with same session ID but different parameters
      const storage1 = await storageManager.getStorage(sessionId, 'user1', 'http://api1.com');
      const storage2 = await storageManager.getStorage(sessionId, 'user2', 'http://api2.com');
      
      // Both should reference the same underlying storage instance
      expect(storage1).toBe(storage2);
      
      // Verify they share data
      const filter = await storage1.create({
        name: 'Shared Filter',
        filter: 'done = true',
        isGlobal: true,
      });
      
      const retrievedFilter = await storage2.get(filter.id);
      expect(retrievedFilter).not.toBeNull();
      expect(retrievedFilter!.id).toBe(filter.id);
    });
  });

  describe('Storage Manager', () => {
    it('should track storage instances correctly', async () => {
      const sessionIds = ['manager-test-1', 'manager-test-2', 'manager-test-3'];
      
      // Create storage instances
      const storages = await Promise.all(
        sessionIds.map(id => storageManager.getStorage(id))
      );
      
      // Add some data to each
      await Promise.all(
        storages.map((storage, i) =>
          storage.create({
            name: `Manager Test Filter ${i}`,
            filter: 'done = false',
            isGlobal: true,
          })
        )
      );
      
      // Get statistics
      const stats = await storageManager.getAllStats();
      expect(stats).toHaveLength(3);
      
      for (let i = 0; i < stats.length; i++) {
        expect(stats[i].filterCount).toBe(1);
        expect(stats[i].sessionId).toBe(sessionIds[i]);
        expect(stats[i].memoryUsageKb).toBeGreaterThan(0);
      }
    });

    it('should remove storage instances correctly', async () => {
      const sessionId = 'removal-test';
      const storage = await storageManager.getStorage(sessionId);
      
      // Add some data
      await storage.create({
        name: 'Test Filter',
        filter: 'done = false',
        isGlobal: true,
      });
      
      // Verify data exists
      const filters = await storage.list();
      expect(filters).toHaveLength(1);
      
      // Remove storage
      await storageManager.removeStorage(sessionId);
      
      // Getting storage again should create a new empty instance
      const newStorage = await storageManager.getStorage(sessionId);
      const newFilters = await newStorage.list();
      expect(newFilters).toHaveLength(0);
    });

    it('should handle session cleanup timer correctly', async () => {
      // This test verifies the cleanup mechanism without waiting for timeout
      const sessionId = 'cleanup-test';
      const storage = await storageManager.getStorage(sessionId);
      
      // Add data
      await storage.create({
        name: 'Cleanup Test Filter',
        filter: 'done = false',
        isGlobal: true,
      });
      
      // Get initial stats
      const initialStats = await storageManager.getAllStats();
      expect(initialStats).toHaveLength(1);
      
      // Manually trigger cleanup (simulating timeout)
      await storageManager.removeStorage(sessionId);
      
      // Verify cleanup
      const finalStats = await storageManager.getAllStats();
      expect(finalStats).toHaveLength(0);
    });
  });

  describe('Memory Safety', () => {
    it('should properly cleanup memory on storage removal', async () => {
      const sessionId = 'memory-test';
      const storage = await storageManager.getStorage(sessionId);
      
      // Create many filters to use memory
      const createPromises = Array.from({ length: 100 }, (_, i) =>
        storage.create({
          name: `Memory Test Filter ${i}`,
          filter: `priority = ${i % 5 + 1}`,
          description: 'A'.repeat(1000), // Large description to use more memory
          isGlobal: false,
        })
      );
      
      await Promise.all(createPromises);
      
      // Verify memory usage is tracked
      const stats = await storage.getStats();
      expect(stats.filterCount).toBe(100);
      expect(stats.memoryUsageKb).toBeGreaterThan(50); // Should be substantial
      
      // Clear storage
      await storage.clear();
      
      // Verify memory is freed
      const clearedStats = await storage.getStats();
      expect(clearedStats.filterCount).toBe(0);
      expect(clearedStats.memoryUsageKb).toBe(0);
    });

    it('should handle large concurrent operations without memory leaks', async () => {
      const storage = await storageManager.getStorage('large-test');
      
      // Create, read, update, and delete operations concurrently
      const operations = [];
      
      // Create operations
      for (let i = 0; i < 50; i++) {
        operations.push(
          storage.create({
            name: `Large Test Filter ${i}`,
            filter: `priority = ${i % 5 + 1}`,
            isGlobal: i % 2 === 0,
          })
        );
      }
      
      // Execute all operations
      const createResults = await Promise.all(operations);
      expect(createResults).toHaveLength(50);
      
      // Perform read operations
      const readOperations = createResults.map(filter => storage.get(filter.id));
      const readResults = await Promise.all(readOperations);
      expect(readResults.filter(r => r !== null)).toHaveLength(50);
      
      // Clean up
      await storage.clear();
      const finalFilters = await storage.list();
      expect(finalFilters).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully during concurrent operations', async () => {
      const storage = await storageManager.getStorage('error-test');
      
      // Create a filter
      const filter = await storage.create({
        name: 'Error Test Filter',
        filter: 'done = false',
        isGlobal: true,
      });
      
      // Mix valid and invalid operations
      const operations = [
        // Valid operations
        storage.get(filter.id),
        storage.list(),
        // Invalid operations that should fail gracefully
        storage.get('non-existent-id'),
        storage.update('non-existent-id', { name: 'Updated' }).catch(e => e),
        storage.delete('non-existent-id').catch(e => e),
        // Valid operations
        storage.update(filter.id, { description: 'Updated description' }),
      ];
      
      const results = await Promise.all(operations);
      
      // Valid operations should succeed
      expect(results[0]).not.toBeNull(); // get existing
      expect(Array.isArray(results[1])).toBe(true); // list
      expect(results[2]).toBeNull(); // get non-existent
      expect(results[3]).toBeInstanceOf(Error); // update non-existent
      expect(results[4]).toBeInstanceOf(Error); // delete non-existent
      expect(results[5]).toBeDefined(); // valid update
    });

    it('should maintain data integrity during error scenarios', async () => {
      const storage = await storageManager.getStorage('integrity-test');
      
      // Create initial data
      const initialFilter = await storage.create({
        name: 'Integrity Test',
        filter: 'done = false',
        isGlobal: true,
      });
      
      // Perform operations that mix success and failure
      const operations = [
        storage.create({
          name: 'Valid Filter 1',
          filter: 'priority = 1',
          isGlobal: false,
        }),
        storage.update('invalid-id', { name: 'Should Fail' }).catch(e => e),
        storage.create({
          name: 'Valid Filter 2',
          filter: 'priority = 2',
          isGlobal: false,
        }),
        storage.delete('invalid-id').catch(e => e),
      ];
      
      await Promise.all(operations);
      
      // Verify data integrity
      const filters = await storage.list();
      expect(filters).toHaveLength(3); // initial + 2 valid creates
      
      // Original filter should be unchanged
      const originalFilter = await storage.get(initialFilter.id);
      expect(originalFilter).not.toBeNull();
      expect(originalFilter!.name).toBe('Integrity Test');
    });
  });
});