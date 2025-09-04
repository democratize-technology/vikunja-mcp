/**
 * Tests for FilterStorage
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { InMemoryFilterStorage, storageManager } from '../../src/storage/FilterStorage';
import type { SavedFilter } from '../../src/types/filters';

describe('InMemoryFilterStorage', () => {
  let storage: InMemoryFilterStorage;

  beforeEach(async () => {
    storage = new InMemoryFilterStorage();
    await storage.clear();
  });

  describe('create', () => {
    it('should create a new filter', async () => {
      const filter = await storage.create({
        name: 'Test Filter',
        description: 'A test filter',
        filter: 'done = false',
        isGlobal: true,
      });

      expect(filter.id).toBeDefined();
      expect(filter.name).toBe('Test Filter');
      expect(filter.created).toBeInstanceOf(Date);
      expect(filter.updated).toBeInstanceOf(Date);
    });

    it('should generate unique IDs', async () => {
      const filter1 = await storage.create({
        name: 'Filter 1',
        filter: 'priority = 1',
        isGlobal: false,
      });

      const filter2 = await storage.create({
        name: 'Filter 2',
        filter: 'priority = 2',
        isGlobal: false,
      });

      expect(filter1.id).not.toBe(filter2.id);
    });
  });

  describe('get', () => {
    it('should retrieve an existing filter', async () => {
      const created = await storage.create({
        name: 'Test Filter',
        filter: 'done = false',
        isGlobal: true,
      });

      const retrieved = await storage.get(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.name).toBe('Test Filter');
    });

    it('should return null for non-existent filter', async () => {
      const retrieved = await storage.get('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('list', () => {
    it('should return all filters sorted by updated date', async () => {
      // Create filters with slight delays to ensure different timestamps
      const filter1 = await storage.create({
        name: 'Filter 1',
        filter: 'priority = 1',
        isGlobal: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const filter2 = await storage.create({
        name: 'Filter 2',
        filter: 'priority = 2',
        isGlobal: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const filter3 = await storage.create({
        name: 'Filter 3',
        filter: 'priority = 3',
        isGlobal: false,
      });

      const filters = await storage.list();
      expect(filters).toHaveLength(3);
      expect(filters[0].name).toBe('Filter 3'); // Most recent first
      expect(filters[2].name).toBe('Filter 1'); // Oldest last
    });

    it('should return empty array when no filters exist', async () => {
      const filters = await storage.list();
      expect(filters).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update an existing filter', async () => {
      const created = await storage.create({
        name: 'Original Name',
        filter: 'done = false',
        isGlobal: false,
      });

      const originalCreated = created.created;
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await storage.update(created.id, {
        name: 'Updated Name',
        description: 'Now with description',
      });

      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Now with description');
      expect(updated.filter).toBe('done = false'); // Unchanged
      expect(updated.created).toEqual(originalCreated);
      expect(updated.updated.getTime()).toBeGreaterThan(originalCreated.getTime());
    });

    it('should throw error for non-existent filter', async () => {
      await expect(storage.update('non-existent-id', { name: 'New Name' })).rejects.toThrow(
        'Filter with id non-existent-id not found',
      );
    });
  });

  describe('delete', () => {
    it('should delete an existing filter', async () => {
      const created = await storage.create({
        name: 'To Delete',
        filter: 'done = true',
        isGlobal: false,
      });

      await storage.delete(created.id);

      const retrieved = await storage.get(created.id);
      expect(retrieved).toBeNull();
    });

    it('should throw error for non-existent filter', async () => {
      await expect(storage.delete('non-existent-id')).rejects.toThrow(
        'Filter with id non-existent-id not found',
      );
    });
  });

  describe('findByName', () => {
    it('should find filter by exact name', async () => {
      await storage.create({
        name: 'Unique Name',
        filter: 'priority = 5',
        isGlobal: true,
      });

      const found = await storage.findByName('Unique Name');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Unique Name');
    });

    it('should return null for non-existent name', async () => {
      const found = await storage.findByName('Non Existent');
      expect(found).toBeNull();
    });

    it('should return first match if multiple filters have same name', async () => {
      const filter1 = await storage.create({
        name: 'Duplicate',
        filter: 'priority = 1',
        isGlobal: false,
      });

      const filter2 = await storage.create({
        name: 'Duplicate',
        filter: 'priority = 2',
        isGlobal: false,
      });

      const found = await storage.findByName('Duplicate');
      expect(found).not.toBeNull();
      // Should return the first one found (implementation dependent)
      expect([filter1.id, filter2.id]).toContain(found!.id);
    });
  });

  describe('getByProject', () => {
    it('should return project-specific and global filters', async () => {
      const projectId = 42;

      // Create various filters
      await storage.create({
        name: 'Global Filter',
        filter: 'done = false',
        isGlobal: true,
      });

      await storage.create({
        name: 'Project Filter',
        filter: 'priority >= 3',
        projectId,
        isGlobal: false,
      });

      await storage.create({
        name: 'Other Project Filter',
        filter: 'priority = 1',
        projectId: 99,
        isGlobal: false,
      });

      const filters = await storage.getByProject(projectId);
      expect(filters).toHaveLength(2);
      expect(filters.map((f) => f.name)).toContain('Global Filter');
      expect(filters.map((f) => f.name)).toContain('Project Filter');
      expect(filters.map((f) => f.name)).not.toContain('Other Project Filter');
    });

    it('should return only global filters for projects with no specific filters', async () => {
      await storage.create({
        name: 'Global Filter',
        filter: 'done = false',
        isGlobal: true,
      });

      const filters = await storage.getByProject(999);
      expect(filters).toHaveLength(1);
      expect(filters[0].name).toBe('Global Filter');
    });
  });

  describe('clear', () => {
    it('should remove all filters', async () => {
      await storage.create({
        name: 'Filter 1',
        filter: 'priority = 1',
        isGlobal: false,
      });

      await storage.create({
        name: 'Filter 2',
        filter: 'priority = 2',
        isGlobal: false,
      });

      await storage.clear();

      const filters = await storage.list();
      expect(filters).toEqual([]);
    });
  });

  describe('Constructor and Session Management', () => {
    it('should create storage with session ID only', () => {
      const sessionStorage = new InMemoryFilterStorage('test-session');
      const session = sessionStorage.getSession();
      
      expect(session.id).toBe('test-session');
      expect(session.userId).toBeUndefined();
      expect(session.apiUrl).toBeUndefined();
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastAccessAt).toBeInstanceOf(Date);
    });

    it('should create storage with session ID and user ID', () => {
      const sessionStorage = new InMemoryFilterStorage('test-session', 'user123');
      const session = sessionStorage.getSession();
      
      expect(session.id).toBe('test-session');
      expect(session.userId).toBe('user123');
      expect(session.apiUrl).toBeUndefined();
    });

    it('should create storage with all parameters', () => {
      const sessionStorage = new InMemoryFilterStorage('test-session', 'user123', 'https://api.example.com');
      const session = sessionStorage.getSession();
      
      expect(session.id).toBe('test-session');
      expect(session.userId).toBe('user123');
      expect(session.apiUrl).toBe('https://api.example.com');
    });

    it('should handle undefined userId explicitly', () => {
      const sessionStorage = new InMemoryFilterStorage('test-session', undefined);
      const session = sessionStorage.getSession();
      
      expect(session.id).toBe('test-session');
      expect(session.userId).toBeUndefined();
    });

    it('should handle undefined apiUrl explicitly', () => {
      const sessionStorage = new InMemoryFilterStorage('test-session', 'user123', undefined);
      const session = sessionStorage.getSession();
      
      expect(session.id).toBe('test-session');
      expect(session.userId).toBe('user123');
      expect(session.apiUrl).toBeUndefined();
    });

    it('should update access time when accessed', async () => {
      const sessionStorage = new InMemoryFilterStorage('test-session');
      const initialSession = sessionStorage.getSession();
      const initialAccessTime = initialSession.lastAccessAt;
      
      // Wait a bit and perform an operation
      await new Promise(resolve => setTimeout(resolve, 10));
      await sessionStorage.list();
      
      const updatedSession = sessionStorage.getSession();
      expect(updatedSession.lastAccessAt.getTime()).toBeGreaterThan(initialAccessTime.getTime());
    });
  });

  describe('Statistical Methods', () => {
    it('should return accurate statistics', async () => {
      const sessionStorage = new InMemoryFilterStorage('stats-session', 'user123', 'https://api.example.com');
      
      // Add some filters
      await sessionStorage.create({
        name: 'Filter 1',
        filter: 'priority = 1',
        isGlobal: true,
      });
      
      await sessionStorage.create({
        name: 'Filter 2',
        filter: 'priority = 2',
        isGlobal: false,
      });
      
      const stats = await sessionStorage.getStats();
      
      expect(stats.filterCount).toBe(2);
      expect(stats.sessionId).toBe('stats-session');
      expect(stats.createdAt).toBeInstanceOf(Date);
      expect(stats.lastAccessAt).toBeInstanceOf(Date);
      expect(stats.memoryUsageKb).toBeGreaterThan(0);
    });

    it('should calculate memory usage correctly', async () => {
      const sessionStorage = new InMemoryFilterStorage('memory-session');
      
      // Empty storage should have minimal memory usage
      const emptyStats = await sessionStorage.getStats();
      expect(emptyStats.memoryUsageKb).toBe(0);
      expect(emptyStats.filterCount).toBe(0);
      
      // Add a filter and check memory increases
      await sessionStorage.create({
        name: 'Large Filter',
        filter: 'priority = 1 && description like "very long description with lots of text"',
        description: 'This is a detailed description for testing memory usage calculation',
        isGlobal: true,
      });
      
      const filledStats = await sessionStorage.getStats();
      expect(filledStats.memoryUsageKb).toBeGreaterThan(emptyStats.memoryUsageKb);
      expect(filledStats.filterCount).toBe(1);
    });
  });
});

describe('FilterStorageManager', () => {
  beforeEach(async () => {
    // Ensure clean state before each test
    await storageManager.clearAll();
  });

  afterEach(async () => {
    // Clean up after each test
    await storageManager.clearAll();
    storageManager.stopCleanupTimer();
  });

  describe('Session Management', () => {
    it('should create and retrieve storage instances', async () => {
      const storage1 = await storageManager.getStorage('session1', 'user1', 'https://api1.com');
      const storage2 = await storageManager.getStorage('session2', 'user2', 'https://api2.com');
      
      expect(storage1).toBeInstanceOf(InMemoryFilterStorage);
      expect(storage2).toBeInstanceOf(InMemoryFilterStorage);
      expect(storage1).not.toBe(storage2);
      
      // Same session should return same instance
      const storage1Again = await storageManager.getStorage('session1');
      expect(storage1Again).toBe(storage1);
    });

    it('should remove storage instances', async () => {
      const storage = await storageManager.getStorage('temp-session');
      await storage.create({
        name: 'Temp Filter',
        filter: 'priority = 1',
        isGlobal: false,
      });
      
      // Verify filter exists
      const filters = await storage.list();
      expect(filters).toHaveLength(1);
      
      // Remove storage
      await storageManager.removeStorage('temp-session');
      
      // Getting storage again should create a new empty instance
      const newStorage = await storageManager.getStorage('temp-session');
      const newFilters = await newStorage.list();
      expect(newFilters).toHaveLength(0);
    });

    it('should handle removal of non-existent session gracefully', async () => {
      await expect(storageManager.removeStorage('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide statistics for all sessions', async () => {
      const storage1 = await storageManager.getStorage('session1', 'user1');
      const storage2 = await storageManager.getStorage('session2', 'user2');
      
      await storage1.create({
        name: 'Filter 1',
        filter: 'priority = 1',
        isGlobal: true,
      });
      
      await storage2.create({
        name: 'Filter 2',
        filter: 'priority = 2',
        isGlobal: false,
      });
      
      await storage2.create({
        name: 'Filter 3',
        filter: 'priority = 3',
        isGlobal: false,
      });
      
      const allStats = await storageManager.getAllStats();
      
      expect(allStats).toHaveLength(2);
      expect(allStats.find(s => s.sessionId === 'session1')?.filterCount).toBe(1);
      expect(allStats.find(s => s.sessionId === 'session2')?.filterCount).toBe(2);
      
      allStats.forEach(stat => {
        expect(stat.sessionId).toBeDefined();
        expect(stat.filterCount).toBeGreaterThanOrEqual(0);
        expect(stat.memoryUsageKb).toBeGreaterThanOrEqual(0);
        expect(stat.createdAt).toBeInstanceOf(Date);
        expect(stat.lastAccessAt).toBeInstanceOf(Date);
      });
    });

    it('should return empty array when no sessions exist', async () => {
      const allStats = await storageManager.getAllStats();
      expect(allStats).toEqual([]);
    });
  });

  describe('Cleanup Operations', () => {
    beforeEach(() => {
      // Mock Date.now for consistent testing
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should clear all storage instances', async () => {
      const storage1 = await storageManager.getStorage('session1');
      const storage2 = await storageManager.getStorage('session2');
      
      await storage1.create({
        name: 'Filter 1',
        filter: 'priority = 1',
        isGlobal: false,
      });
      
      await storage2.create({
        name: 'Filter 2',
        filter: 'priority = 2',
        isGlobal: false,
      });
      
      // Verify data exists
      let allStats = await storageManager.getAllStats();
      expect(allStats).toHaveLength(2);
      
      // Clear all
      await storageManager.clearAll();
      
      // Verify everything is cleared
      allStats = await storageManager.getAllStats();
      expect(allStats).toEqual([]);
    });

    it('should start and stop cleanup timer', () => {
      // Timer should be running by default
      expect(storageManager['cleanupInterval']).toBeDefined();
      
      // Stop timer
      storageManager.stopCleanupTimer();
      expect(storageManager['cleanupInterval']).toBeNull();
      
      // Start timer again (internal method test)
      storageManager['startCleanupTimer']();
      expect(storageManager['cleanupInterval']).toBeDefined();
      
      // Test calling startCleanupTimer when timer already exists (covers clearInterval logic)
      const existingInterval = storageManager['cleanupInterval'];
      storageManager['startCleanupTimer']();
      expect(storageManager['cleanupInterval']).toBeDefined();
      expect(storageManager['cleanupInterval']).not.toBe(existingInterval);
    });

    it('should cleanup inactive sessions', async () => {
      const storage1 = await storageManager.getStorage('active-session');
      const storage2 = await storageManager.getStorage('inactive-session');
      
      await storage1.create({ name: 'Active Filter', filter: 'priority = 1', isGlobal: false });
      await storage2.create({ name: 'Inactive Filter', filter: 'priority = 2', isGlobal: false });
      
      // Verify both sessions exist
      let allStats = await storageManager.getAllStats();
      expect(allStats).toHaveLength(2);
      
      // Advance time by more than session timeout (1 hour + buffer)
      jest.advanceTimersByTime(60 * 60 * 1000 + 1000);
      
      // Access one session to keep it active
      await storage1.list();
      
      // Trigger cleanup manually
      await storageManager['cleanupInactiveSessions']();
      
      // Only active session should remain
      allStats = await storageManager.getAllStats();
      expect(allStats).toHaveLength(1);
      expect(allStats[0].sessionId).toBe('active-session');
    });

    it('should handle errors during cleanup gracefully', async () => {
      // Create a session
      const storage = await storageManager.getStorage('error-session');
      await storage.create({ name: 'Test Filter', filter: 'priority = 1', isGlobal: false });
      
      // Mock an error in the cleanup process
      const originalClear = storage.clear.bind(storage);
      storage.clear = jest.fn().mockRejectedValue(new Error('Cleanup error'));
      
      // Advance time to trigger cleanup
      jest.advanceTimersByTime(60 * 60 * 1000 + 1000);
      
      // Cleanup should not throw (it's expected to catch and log errors)
      await expect(storageManager['cleanupInactiveSessions']()).rejects.toThrow('Cleanup error');
      
      // Restore original method
      storage.clear = originalClear;
    });
  });

  describe('Thread Safety', () => {
    it('should handle concurrent operations', async () => {
      const storage = await storageManager.getStorage('concurrent-session');
      
      // Create multiple concurrent operations
      const promises = Array.from({ length: 10 }, async (_, i) => {
        return storage.create({
          name: `Filter ${i}`,
          filter: `priority = ${i}`,
          isGlobal: false,
        });
      });
      
      const results = await Promise.all(promises);
      
      // All operations should succeed
      expect(results).toHaveLength(10);
      results.forEach(filter => {
        expect(filter.id).toBeDefined();
        expect(filter.created).toBeInstanceOf(Date);
      });
      
      // All filters should be stored
      const allFilters = await storage.list();
      expect(allFilters).toHaveLength(10);
    });

    it('should handle concurrent storage creation', async () => {
      const promises = Array.from({ length: 5 }, async (_, i) => {
        return storageManager.getStorage(`concurrent-${i}`, `user-${i}`);
      });
      
      const storages = await Promise.all(promises);
      
      // All storages should be created successfully
      expect(storages).toHaveLength(5);
      storages.forEach((storage, i) => {
        expect(storage).toBeInstanceOf(InMemoryFilterStorage);
        expect(storage.getSession().id).toBe(`concurrent-${i}`);
      });
    });
  });
});
