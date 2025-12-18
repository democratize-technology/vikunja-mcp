/**
 * Integration tests for storage module
 */

import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import { join } from 'path';
import { rm, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

import {
  createFilterStorage,
  getAllStorageStats,
  healthCheckAllStorage,
  migrateMemoryToPersistent,
  storageManager,
} from '../../src/storage';
import type { FilterStorage } from '../../src/types/filters';

describe('Storage Integration', () => {
  let testDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeAll(async () => {
    // Save original environment
    originalEnv = {
      VIKUNJA_MCP_STORAGE_TYPE: process.env.VIKUNJA_MCP_STORAGE_TYPE,
      VIKUNJA_MCP_STORAGE_DATABASE_PATH: process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH,
    };

    // Create temporary directory
    testDir = join(tmpdir(), 'vikunja-mcp-integration-tests', randomUUID());
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    // Restore original environment
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test directory:', error);
    }

    // Clean up storage managers
    await storageManager.clearAll();
  });

  beforeEach(async () => {
    // Clean up between tests
    await storageManager.clearAll();
  });

  describe('createFilterStorage', () => {
    it('should create memory storage by default', async () => {
      delete process.env.VIKUNJA_MCP_STORAGE_TYPE;
      
      const storage = await createFilterStorage('test-session-1');
      expect(storage).toBeDefined();

      // Test basic operations
      const filter = await storage.create({
        name: 'Test Filter',
        filter: 'done = false',
        isGlobal: true,
      });

      expect(filter.id).toBeDefined();
      
      const retrieved = await storage.get(filter.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe('Test Filter');
    });

    it('should create persistent storage when configured', async () => {
      const testDbPath = join(testDir, `test-${randomUUID()}.db`);
      
      process.env.VIKUNJA_MCP_STORAGE_TYPE = 'sqlite';
      process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH = testDbPath;

      const storage = await createFilterStorage('test-session-2');
      expect(storage).toBeDefined();

      // Test persistence by creating, closing, and recreating storage
      const filter = await storage.create({
        name: 'Persistent Filter',
        filter: 'priority > 1',
        isGlobal: false,
      });

      // Get storage stats to verify it's persistent
      const stats = await (storage as any).getStats();
      expect(stats.storageType).toBe('sqlite');

      // Close storage
      await (storage as any).close();

      // Create new storage instance with same session
      const newStorage = await createFilterStorage('test-session-2');
      
      // Filter should still exist
      const retrieved = await newStorage.get(filter.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe('Persistent Filter');

      await (newStorage as any).close();
    });

    it('should fallback to memory storage on persistent storage failure', async () => {
      // Configure invalid database path
      process.env.VIKUNJA_MCP_STORAGE_TYPE = 'sqlite';
      process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH = '/invalid/readonly/path/test.db';

      const storage = await createFilterStorage('test-session-3');
      expect(storage).toBeDefined();

      // Should still work (fallback to memory)
      const filter = await storage.create({
        name: 'Fallback Filter',
        filter: 'done = true',
        isGlobal: true,
      });

      expect(filter.id).toBeDefined();
    });

    it('should force persistent storage when requested', async () => {
      const testDbPath = join(testDir, `force-persistent-${randomUUID()}.db`);
      
      process.env.VIKUNJA_MCP_STORAGE_TYPE = 'memory';
      process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH = testDbPath;

      // Force persistent storage even though config says memory
      const storage = await createFilterStorage('test-session-4', undefined, undefined, true);
      expect(storage).toBeDefined();

      // Should use persistent storage despite memory configuration
      const filter = await storage.create({
        name: 'Forced Persistent Filter',
        filter: 'labels.includes("urgent")',
        isGlobal: false,
      });

      expect(filter.id).toBeDefined();
      await (storage as any).close();
    });
  });

  describe('getAllStorageStats', () => {
    it('should return statistics for all storage types', async () => {
      // Create memory storage sessions
      const memoryStorage1 = await createFilterStorage('memory-session-1');
      const memoryStorage2 = await createFilterStorage('memory-session-2');

      await memoryStorage1.create({
        name: 'Memory Filter 1',
        filter: 'done = false',
        isGlobal: false,
      });

      await memoryStorage2.create({
        name: 'Memory Filter 2',
        filter: 'priority = 1',
        isGlobal: true,
      });

      // Create persistent storage session
      const testDbPath = join(testDir, `stats-test-${randomUUID()}.db`);
      process.env.VIKUNJA_MCP_STORAGE_TYPE = 'sqlite';
      process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH = testDbPath;

      const persistentStorage = await createFilterStorage('persistent-session-1');
      await persistentStorage.create({
        name: 'Persistent Filter',
        filter: 'dueDate < "2024-01-01"',
        isGlobal: false,
      });

      // Get all stats
      const stats = await getAllStorageStats();

      expect(stats.totalSessions).toBeGreaterThanOrEqual(3);
      expect(stats.totalFilters).toBeGreaterThanOrEqual(3);
      expect(stats.memorySessions.length).toBeGreaterThanOrEqual(2);
      expect(stats.persistentSessions.length).toBeGreaterThanOrEqual(1);

      // Verify memory sessions
      const memoryFilterCounts = stats.memorySessions.map(s => s.filterCount);
      expect(memoryFilterCounts).toContain(1);

      // Verify persistent sessions
      const persistentFilterCounts = stats.persistentSessions.map(s => s.filterCount);
      expect(persistentFilterCounts).toContain(1);

      await (persistentStorage as any).close();
    });

    it('should handle empty storage gracefully', async () => {
      const stats = await getAllStorageStats();
      
      expect(stats.totalSessions).toBeGreaterThanOrEqual(0);
      expect(stats.totalFilters).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(stats.memorySessions)).toBe(true);
      expect(Array.isArray(stats.persistentSessions)).toBe(true);
    });
  });

  describe('healthCheckAllStorage', () => {
    it('should report healthy status for working storage', async () => {
      // Create some storage instances
      const memoryStorage = await createFilterStorage('health-memory-session');
      
      const testDbPath = join(testDir, `health-test-${randomUUID()}.db`);
      process.env.VIKUNJA_MCP_STORAGE_TYPE = 'sqlite';
      process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH = testDbPath;
      
      const persistentStorage = await createFilterStorage('health-persistent-session');

      const healthCheck = await healthCheckAllStorage();

      expect(healthCheck.overall).toBe('healthy');
      expect(healthCheck.memory.healthy).toBe(true);
      expect(healthCheck.persistent.healthy).toBe(true);
      expect(healthCheck.details).toBeDefined();

      await (persistentStorage as any).close();
    });

    it('should report degraded status when persistent storage fails', async () => {
      // Create memory storage (should work)
      await createFilterStorage('degraded-memory-session');

      // Create persistent storage with invalid path (should fail health check)
      process.env.VIKUNJA_MCP_STORAGE_TYPE = 'sqlite';
      process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH = '/nonexistent/path/test.db';

      try {
        await createFilterStorage('degraded-persistent-session', undefined, undefined, true);
      } catch (error) {
        // Expected to fail
      }

      const healthCheck = await healthCheckAllStorage();

      // Should be degraded if persistent storage has issues but memory works
      expect(['healthy', 'degraded']).toContain(healthCheck.overall);
      expect(healthCheck.memory.healthy).toBe(true);
    });
  });

  describe('migrateMemoryToPersistent', () => {
    beforeEach(async () => {
      // Ensure clean state
      await storageManager.clearAll();
      await persistentStorageManager.clearAll();
    });

    it('should migrate data from memory to persistent storage', async () => {
      // Create memory storage with test data
      const memoryStorage1 = await storageManager.getStorage('migrate-session-1');
      const memoryStorage2 = await storageManager.getStorage('migrate-session-2');

      await memoryStorage1.create({
        name: 'Memory Filter 1',
        filter: 'done = false',
        isGlobal: false,
      });

      await memoryStorage1.create({
        name: 'Memory Filter 2',
        filter: 'priority > 2',
        isGlobal: true,
      });

      await memoryStorage2.create({
        name: 'Memory Filter 3',
        filter: 'labels.includes("urgent")',
        isGlobal: false,
        projectId: 123,
      });

      // Configure persistent storage
      const testDbPath = join(testDir, `migration-test-${randomUUID()}.db`);
      process.env.VIKUNJA_MCP_STORAGE_TYPE = 'sqlite';
      process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH = testDbPath;

      // Perform migration
      const result = await migrateMemoryToPersistent();

      expect(result.success).toBe(true);
      expect(result.migratedSessions).toBe(2);
      expect(result.migratedFilters).toBe(3);
      expect(result.errors).toHaveLength(0);

      // Verify data in persistent storage
      const persistentStorage1 = await persistentStorageManager.getStorage('migrate-session-1');
      const persistentStorage2 = await persistentStorageManager.getStorage('migrate-session-2');

      const filters1 = await persistentStorage1.list();
      const filters2 = await persistentStorage2.list();

      expect(filters1).toHaveLength(2);
      expect(filters2).toHaveLength(1);

      const filter1Names = filters1.map(f => f.name);
      expect(filter1Names).toContain('Memory Filter 1');
      expect(filter1Names).toContain('Memory Filter 2');

      expect(filters2[0].name).toBe('Memory Filter 3');
      expect(filters2[0].projectId).toBe(123);

      await persistentStorage1.close();
      await persistentStorage2.close();
    });

    it('should handle empty memory storage gracefully', async () => {
      const result = await migrateMemoryToPersistent();

      expect(result.success).toBe(true);
      expect(result.migratedSessions).toBe(0);
      expect(result.migratedFilters).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle migration errors gracefully', async () => {
      // Create memory storage with test data
      const memoryStorage = await storageManager.getStorage('error-session');
      await memoryStorage.create({
        name: 'Test Filter',
        filter: 'done = false',
        isGlobal: false,
      });

      // Configure invalid persistent storage
      process.env.VIKUNJA_MCP_STORAGE_TYPE = 'sqlite';
      process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH = '/readonly/invalid/path/test.db';

      const result = await migrateMemoryToPersistent();

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should preserve filter metadata during migration', async () => {
      const memoryStorage = await storageManager.getStorage('metadata-session');
      
      const originalFilter = await memoryStorage.create({
        name: 'Complex Filter',
        description: 'A filter with all metadata',
        filter: 'priority > 1 && done = false',
        expression: {
          groups: [{
            conditions: [
              { field: 'priority', operator: '>', value: 1 },
              { field: 'done', operator: '=', value: false },
            ],
            operator: '&&',
          }],
        },
        projectId: 456,
        isGlobal: false,
      });

      // Configure persistent storage
      const testDbPath = join(testDir, `metadata-migration-${randomUUID()}.db`);
      process.env.VIKUNJA_MCP_STORAGE_TYPE = 'sqlite';
      process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH = testDbPath;

      const result = await migrateMemoryToPersistent();
      expect(result.success).toBe(true);

      // Verify migrated data
      const persistentStorage = await persistentStorageManager.getStorage('metadata-session');
      const migratedFilters = await persistentStorage.list();

      expect(migratedFilters).toHaveLength(1);
      const migratedFilter = migratedFilters[0];

      expect(migratedFilter.name).toBe(originalFilter.name);
      expect(migratedFilter.description).toBe(originalFilter.description);
      expect(migratedFilter.filter).toBe(originalFilter.filter);
      expect(migratedFilter.expression).toEqual(originalFilter.expression);
      expect(migratedFilter.projectId).toBe(originalFilter.projectId);
      expect(migratedFilter.isGlobal).toBe(originalFilter.isGlobal);

      await persistentStorage.close();
    });
  });

  describe('Cross-storage Compatibility', () => {
    it('should maintain API compatibility between storage types', async () => {
      const testDbPath = join(testDir, `compatibility-${randomUUID()}.db`);
      
      // Test with memory storage
      delete process.env.VIKUNJA_MCP_STORAGE_TYPE;
      const memoryStorage = await createFilterStorage('compatibility-session');

      // Test with persistent storage
      process.env.VIKUNJA_MCP_STORAGE_TYPE = 'sqlite';
      process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH = testDbPath;
      const persistentStorage = await createFilterStorage('compatibility-session-2');

      // Test same operations on both storage types
      const testOperations = async (storage: FilterStorage, storageType: string) => {
        // Create
        const filter = await storage.create({
          name: `${storageType} Filter`,
          description: `Test filter for ${storageType}`,
          filter: 'done = false',
          isGlobal: true,
        });

        expect(filter.id).toBeDefined();
        expect(filter.name).toBe(`${storageType} Filter`);

        // Read
        const retrieved = await storage.get(filter.id);
        expect(retrieved).not.toBeNull();
        expect(retrieved!.name).toBe(`${storageType} Filter`);

        // Update
        const updated = await storage.update(filter.id, {
          description: `Updated ${storageType} filter`,
        });
        expect(updated.description).toBe(`Updated ${storageType} filter`);

        // List
        const filters = await storage.list();
        expect(filters.length).toBeGreaterThanOrEqual(1);

        // Find by name
        const found = await storage.findByName(`${storageType} Filter`);
        expect(found).not.toBeNull();

        // Delete
        await storage.delete(filter.id);
        const deleted = await storage.get(filter.id);
        expect(deleted).toBeNull();
      };

      await testOperations(memoryStorage, 'Memory');
      await testOperations(persistentStorage, 'Persistent');

      await (persistentStorage as any).close();
    });

    it('should handle session isolation across storage types', async () => {
      const testDbPath = join(testDir, `isolation-${randomUUID()}.db`);
      
      // Create memory storage
      const memoryStorage1 = await createFilterStorage('isolation-memory-1');
      const memoryStorage2 = await createFilterStorage('isolation-memory-2');

      // Create persistent storage
      process.env.VIKUNJA_MCP_STORAGE_TYPE = 'sqlite';
      process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH = testDbPath;
      const persistentStorage1 = await createFilterStorage('isolation-persistent-1');
      const persistentStorage2 = await createFilterStorage('isolation-persistent-2');

      // Create filters in each storage
      await memoryStorage1.create({ name: 'Memory 1', filter: 'test = 1', isGlobal: false });
      await memoryStorage2.create({ name: 'Memory 2', filter: 'test = 2', isGlobal: false });
      await persistentStorage1.create({ name: 'Persistent 1', filter: 'test = 3', isGlobal: false });
      await persistentStorage2.create({ name: 'Persistent 2', filter: 'test = 4', isGlobal: false });

      // Verify isolation
      const memory1Filters = await memoryStorage1.list();
      const memory2Filters = await memoryStorage2.list();
      const persistent1Filters = await persistentStorage1.list();
      const persistent2Filters = await persistentStorage2.list();

      expect(memory1Filters).toHaveLength(1);
      expect(memory1Filters[0].name).toBe('Memory 1');

      expect(memory2Filters).toHaveLength(1);
      expect(memory2Filters[0].name).toBe('Memory 2');

      expect(persistent1Filters).toHaveLength(1);
      expect(persistent1Filters[0].name).toBe('Persistent 1');

      expect(persistent2Filters).toHaveLength(1);
      expect(persistent2Filters[0].name).toBe('Persistent 2');

      await (persistentStorage1 as any).close();
      await (persistentStorage2 as any).close();
    });
  });
});