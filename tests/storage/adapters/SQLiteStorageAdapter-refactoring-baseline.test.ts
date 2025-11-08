/**
 * Comprehensive test suite for SQLiteStorageAdapter refactoring baseline
 *
 * This test ensures that all existing functionality is preserved during
 * the God module refactoring process. It covers all public methods and
 * error conditions to establish a complete regression test suite.
 */

import { SQLiteStorageAdapter } from '../../../src/storage/adapters/SQLiteStorageAdapter';
import type { SQLiteStorageConfig } from '../../../src/storage/adapters/SQLiteStorageAdapter';
import {
  StorageInitializationError,
  StorageConnectionError,
  StorageDataError,
} from '../../../src/storage/interfaces';
import type { SavedFilter } from '../../../src/types/filters';
import { randomUUID } from 'crypto';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('SQLiteStorageAdapter - Comprehensive Refactoring Baseline', () => {
  let adapter: SQLiteStorageAdapter;
  let config: SQLiteStorageConfig;
  const testDbPath = '/tmp/test-refactoring-baseline.db';

  const mockSession = {
    id: randomUUID(),
    userId: 'test-user',
    apiUrl: 'https://test.vikunja.com',
    createdAt: new Date(),
    lastAccessAt: new Date(),
  };

  const testFilter: Omit<SavedFilter, 'id' | 'created' | 'updated'> = {
    name: 'test-filter',
    description: 'Test filter for baseline',
    filter: 'title contains "test"',
    isGlobal: false,
    projectId: 123,
  };

  beforeEach(async () => {
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    config = {
      databasePath: testDbPath,
      enableWAL: true,
      enableForeignKeys: true,
      timeout: 5000,
      debug: false,
    };

    adapter = new SQLiteStorageAdapter(config);
    await adapter.initialize(mockSession);
  });

  afterEach(async () => {
    try {
      await adapter.close();
      if (existsSync(testDbPath)) {
        unlinkSync(testDbPath);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Initialization and Connection Management', () => {
    it('should initialize successfully with valid config', async () => {
      const newAdapter = new SQLiteStorageAdapter(config);
      await expect(newAdapter.initialize(mockSession)).resolves.not.toThrow();
      await newAdapter.close();
    });

    it('should handle initialization with invalid database path', async () => {
      const invalidConfig: SQLiteStorageConfig = {
        databasePath: '/invalid/path/that/does/not/exist/test.db',
      };
      const invalidAdapter = new SQLiteStorageAdapter(invalidConfig);
      await expect(invalidAdapter.initialize(mockSession))
        .rejects.toThrow(StorageInitializationError);
      await invalidAdapter.close();
    });

    it('should reject operations before initialization', async () => {
      const uninitializedAdapter = new SQLiteStorageAdapter(config);
      await expect(uninitializedAdapter.list())
        .rejects.toThrow(StorageConnectionError);
      await uninitializedAdapter.close();
    });
  });

  describe('CRUD Operations', () => {
    it('should create, read, update, and delete filters', async () => {
      // Create
      const created = await adapter.create(testFilter);
      expect(created).toMatchObject(testFilter);
      expect(created.id).toBeDefined();
      expect(created.created).toBeInstanceOf(Date);
      expect(created.updated).toBeInstanceOf(Date);

      // Read by ID
      const retrieved = await adapter.get(created.id);
      expect(retrieved).toEqual(created);

      // Update
      const update = {
        name: 'updated-filter-name',
        description: 'Updated description',
      };
      const updated = await adapter.update(created.id, update);
      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe(update.name);
      expect(updated.description).toBe(update.description);
      expect(updated.updated.getTime()).toBeGreaterThan(created.updated.getTime());

      // Delete
      await expect(adapter.delete(created.id)).resolves.not.toThrow();
      const deleted = await adapter.get(created.id);
      expect(deleted).toBeNull();
    });

    it('should handle creating filters with duplicate names', async () => {
      await adapter.create(testFilter);
      await expect(adapter.create(testFilter))
        .rejects.toThrow(StorageDataError);
    });

    it('should handle updating non-existent filters', async () => {
      await expect(adapter.update('non-existent-id', { name: 'new-name' }))
        .rejects.toThrow(StorageDataError);
    });

    it('should handle deleting non-existent filters', async () => {
      await expect(adapter.delete('non-existent-id'))
        .rejects.toThrow(StorageDataError);
    });
  });

  describe('Query Operations', () => {
    it('should list all filters for a session', async () => {
      const filter1 = await adapter.create({ ...testFilter, name: 'filter-1' });
      const filter2 = await adapter.create({ ...testFilter, name: 'filter-2' });

      const filters = await adapter.list();
      expect(filters).toHaveLength(2);
      expect(filters.map(f => f.id)).toContain(filter1.id);
      expect(filters.map(f => f.id)).toContain(filter2.id);
      expect(filters).toEqual(expect.arrayContaining([filter1, filter2]));
    });

    it('should return empty list when no filters exist', async () => {
      const filters = await adapter.list();
      expect(filters).toHaveLength(0);
    });

    it('should find filters by name', async () => {
      await adapter.create(testFilter);
      const found = await adapter.findByName(testFilter.name);
      expect(found).toMatchObject(testFilter);
      expect(found?.id).toBeDefined();
    });

    it('should return null when finding non-existent filter by name', async () => {
      const found = await adapter.findByName('non-existent');
      expect(found).toBeNull();
    });

    it('should get filters by project ID', async () => {
      const projectFilter = await adapter.create(testFilter);
      const globalFilter = await adapter.create({
        ...testFilter,
        name: 'global-filter',
        isGlobal: true,
        projectId: undefined,
      });

      const projectFilters = await adapter.getByProject(testFilter.projectId!);
      expect(projectFilters).toHaveLength(2); // Includes global filters
      expect(projectFilters.map(f => f.id)).toContain(projectFilter.id);
      expect(projectFilters.map(f => f.id)).toContain(globalFilter.id);
    });

    it('should clear all filters for a session', async () => {
      await adapter.create(testFilter);
      await adapter.create({ ...testFilter, name: 'filter-2' });

      expect(await adapter.list()).toHaveLength(2);
      await adapter.clear();
      expect(await adapter.list()).toHaveLength(0);
    });
  });

  describe('Statistics and Health', () => {
    it('should provide accurate storage statistics', async () => {
      await adapter.create(testFilter);
      await adapter.create({ ...testFilter, name: 'filter-2' });

      const stats = await adapter.getStats();
      expect(stats.filterCount).toBe(2);
      expect(stats.sessionId).toBe(mockSession.id);
      expect(stats.createdAt).toBe(mockSession.createdAt);
      expect(stats.lastAccessAt).toBe(mockSession.lastAccessAt);
      expect(stats.storageType).toBe('sqlite');
      expect(stats.additionalInfo).toBeDefined();
      expect(stats.additionalInfo!.databasePath).toBe(testDbPath);
    });

    it('should pass health checks when healthy', async () => {
      const health = await adapter.healthCheck();
      expect(health.healthy).toBe(true);
      expect(health.error).toBeUndefined();
      expect(health.details).toBeDefined();
    });
  });

  describe('Complex Data Handling', () => {
    it('should handle filters with complex expressions', async () => {
      const complexExpression = {
        groups: [
          {
            operator: '&&' as const,
            conditions: [
              { field: 'title', operator: 'like' as const, value: '%test%' },
              { field: 'priority', operator: '>' as const, value: 3 },
            ],
          },
        ],
      };

      const filterWithExpression = {
        ...testFilter,
        name: 'complex-filter',
        expression: complexExpression,
      };

      const created = await adapter.create(filterWithExpression);
      expect(created.expression).toEqual(complexExpression);

      const retrieved = await adapter.get(created.id);
      expect(retrieved?.expression).toEqual(complexExpression);
    });

    it('should handle filters with optional fields as null', async () => {
      const minimalFilter: Partial<SavedFilter> = {
        name: 'minimal-filter',
        filter: 'title contains "test"',
        isGlobal: false,
      };

      // Only provide required fields
      const createData = {
        name: minimalFilter.name,
        filter: minimalFilter.filter,
        isGlobal: minimalFilter.isGlobal,
      } as Omit<SavedFilter, 'id' | 'created' | 'updated'>;

      const created = await adapter.create(createData);
      expect(created.description).toBeUndefined();
      expect(created.expression).toBeUndefined();
      expect(created.projectId).toBeUndefined();
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle concurrent operations gracefully', async () => {
      // Create multiple filters concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        adapter.create({
          ...testFilter,
          name: `concurrent-filter-${i}`,
        })
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);

      // Verify all filters were created and are retrievable
      const filters = await adapter.list();
      expect(filters).toHaveLength(10);
    });

    it('should handle update with name conflicts', async () => {
      const filter1 = await adapter.create({ ...testFilter, name: 'filter-1' });
      await adapter.create({ ...testFilter, name: 'filter-2' });

      // Try to update filter-1 with filter-2's name
      await expect(adapter.update(filter1.id, { name: 'filter-2' }))
        .rejects.toThrow(StorageDataError);
    });
  });

  describe('Session Isolation', () => {
    it('should isolate data between different sessions', async () => {
      const session1 = { ...mockSession, id: randomUUID() };
      const session2 = { ...mockSession, id: randomUUID() };

      const adapter1 = new SQLiteStorageAdapter(config);
      const adapter2 = new SQLiteStorageAdapter(config);

      await adapter1.initialize(session1);
      await adapter2.initialize(session2);

      try {
        await adapter1.create(testFilter);

        // Session 2 should not see session 1's data
        const session2Filters = await adapter2.list();
        expect(session2Filters).toHaveLength(0);

        // Session 1 should see its own data
        const session1Filters = await adapter1.list();
        expect(session1Filters).toHaveLength(1);
      } finally {
        await adapter1.close();
        await adapter2.close();
      }
    });
  });
});