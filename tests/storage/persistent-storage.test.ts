/**
 * Tests for persistent storage implementation
 */

import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals';
import { join } from 'path';
import { rm, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

import { PersistentFilterStorage, persistentStorageManager } from '../../src/storage/PersistentFilterStorage';
import { SQLiteStorageAdapter } from '../../src/storage/adapters/SQLiteStorageAdapter';
import { InMemoryStorageAdapter } from '../../src/storage/adapters/InMemoryStorageAdapter';
import { DefaultStorageAdapterFactory } from '../../src/storage/adapters/factory';
import { MigrationRunner, MIGRATIONS } from '../../src/storage/migrations';
import { loadStorageConfig, createStorageConfig } from '../../src/storage/config';
import type { SavedFilter, FilterStorage } from '../../src/types/filters';
import type { StorageConfig, StorageSession } from '../../src/storage/interfaces';

describe('Persistent Storage Implementation', () => {
  let testDbPath: string;
  let testDir: string;

  beforeAll(async () => {
    // Create temporary directory for test databases
    testDir = join(tmpdir(), 'vikunja-mcp-tests', randomUUID());
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up test directory:', error);
    }
  });

  beforeEach(() => {
    testDbPath = join(testDir, `test-${randomUUID()}.db`);
  });

  afterEach(async () => {
    // Clean up individual test databases
    try {
      await rm(testDbPath, { force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('SQLiteStorageAdapter', () => {
    let adapter: SQLiteStorageAdapter;
    let session: StorageSession;

    beforeEach(async () => {
      session = {
        id: randomUUID(),
        createdAt: new Date(),
        lastAccessAt: new Date(),
        userId: 'test-user',
        apiUrl: 'https://test.vikunja.io',
      };

      adapter = new SQLiteStorageAdapter({
        databasePath: testDbPath,
        enableWAL: true,
        enableForeignKeys: true,
        timeout: 5000,
        debug: false,
      });

      await adapter.initialize(session);
    });

    afterEach(async () => {
      await adapter.close();
    });

    describe('initialization', () => {
      it('should initialize database with correct schema', async () => {
        // Database should be initialized during constructor
        const healthCheck = await adapter.healthCheck();
        expect(healthCheck.healthy).toBe(true);
      });

      it('should handle multiple initializations gracefully', async () => {
        // Initialize again with same session
        await adapter.initialize(session);
        const healthCheck = await adapter.healthCheck();
        expect(healthCheck.healthy).toBe(true);
      });

      it('should create database directory if it does not exist', async () => {
        const nestedDbPath = join(testDir, 'nested', 'path', 'test.db');
        const nestedAdapter = new SQLiteStorageAdapter({
          databasePath: nestedDbPath,
        });

        await nestedAdapter.initialize(session);
        const healthCheck = await nestedAdapter.healthCheck();
        expect(healthCheck.healthy).toBe(true);

        await nestedAdapter.close();
      });
    });

    describe('CRUD operations', () => {
      it('should create a new filter', async () => {
        const filter = await adapter.create({
          name: 'Test Filter',
          description: 'A test filter',
          filter: 'done = false',
          isGlobal: true,
        });

        expect(filter.id).toBeDefined();
        expect(filter.name).toBe('Test Filter');
        expect(filter.description).toBe('A test filter');
        expect(filter.filter).toBe('done = false');
        expect(filter.isGlobal).toBe(true);
        expect(filter.created).toBeInstanceOf(Date);
        expect(filter.updated).toBeInstanceOf(Date);
      });

      it('should retrieve an existing filter', async () => {
        const created = await adapter.create({
          name: 'Test Filter',
          filter: 'done = false',
          isGlobal: true,
        });

        const retrieved = await adapter.get(created.id);
        expect(retrieved).not.toBeNull();
        expect(retrieved!.id).toBe(created.id);
        expect(retrieved!.name).toBe('Test Filter');
      });

      it('should return null for non-existent filter', async () => {
        const retrieved = await adapter.get('non-existent-id');
        expect(retrieved).toBeNull();
      });

      it('should list all filters sorted by updated date', async () => {
        const filter1 = await adapter.create({
          name: 'Filter 1',
          filter: 'priority = 1',
          isGlobal: false,
        });

        // Add slight delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));

        const filter2 = await adapter.create({
          name: 'Filter 2',
          filter: 'priority = 2',
          isGlobal: false,
        });

        const filters = await adapter.list();
        expect(filters).toHaveLength(2);
        expect(filters[0].name).toBe('Filter 2'); // Most recent first
        expect(filters[1].name).toBe('Filter 1');
      });

      it('should update an existing filter', async () => {
        const created = await adapter.create({
          name: 'Original Name',
          filter: 'done = false',
          isGlobal: false,
        });

        const updated = await adapter.update(created.id, {
          name: 'Updated Name',
          description: 'Updated description',
          isGlobal: true,
        });

        expect(updated.id).toBe(created.id);
        expect(updated.name).toBe('Updated Name');
        expect(updated.description).toBe('Updated description');
        expect(updated.isGlobal).toBe(true);
        expect(updated.filter).toBe('done = false'); // Unchanged
        expect(updated.updated.getTime()).toBeGreaterThan(created.updated.getTime());
      });

      it('should delete an existing filter', async () => {
        const created = await adapter.create({
          name: 'To Delete',
          filter: 'done = true',
          isGlobal: false,
        });

        await adapter.delete(created.id);

        const retrieved = await adapter.get(created.id);
        expect(retrieved).toBeNull();
      });

      it('should throw error when updating non-existent filter', async () => {
        await expect(adapter.update('non-existent-id', { name: 'New Name' }))
          .rejects.toThrow('not found');
      });

      it('should throw error when deleting non-existent filter', async () => {
        await expect(adapter.delete('non-existent-id'))
          .rejects.toThrow('not found');
      });
    });

    describe('find operations', () => {
      beforeEach(async () => {
        await adapter.create({
          name: 'Unique Filter',
          filter: 'priority = 1',
          isGlobal: false,
        });

        await adapter.create({
          name: 'Project Filter',
          filter: 'done = false',
          projectId: 123,
          isGlobal: false,
        });

        await adapter.create({
          name: 'Global Filter',
          filter: 'priority > 2',
          isGlobal: true,
        });
      });

      it('should find filter by name', async () => {
        const found = await adapter.findByName('Unique Filter');
        expect(found).not.toBeNull();
        expect(found!.name).toBe('Unique Filter');
      });

      it('should return null when finding non-existent filter by name', async () => {
        const found = await adapter.findByName('Non-existent Filter');
        expect(found).toBeNull();
      });

      it('should get filters by project including global filters', async () => {
        const projectFilters = await adapter.getByProject(123);
        expect(projectFilters).toHaveLength(2); // Project filter + global filter
        
        const names = projectFilters.map(f => f.name);
        expect(names).toContain('Project Filter');
        expect(names).toContain('Global Filter');
      });

      it('should get only global filters for non-existent project', async () => {
        const projectFilters = await adapter.getByProject(999);
        expect(projectFilters).toHaveLength(1);
        expect(projectFilters[0].name).toBe('Global Filter');
      });
    });

    describe('session isolation', () => {
      let otherAdapter: SQLiteStorageAdapter;
      let otherSession: StorageSession;

      beforeEach(async () => {
        otherSession = {
          id: randomUUID(),
          createdAt: new Date(),
          lastAccessAt: new Date(),
        };

        otherAdapter = new SQLiteStorageAdapter({
          databasePath: testDbPath, // Same database, different session
        });

        await otherAdapter.initialize(otherSession);
      });

      afterEach(async () => {
        await otherAdapter.close();
      });

      it('should isolate data between sessions', async () => {
        // Create filter in first session
        await adapter.create({
          name: 'Session 1 Filter',
          filter: 'done = false',
          isGlobal: false,
        });

        // Create filter in second session
        await otherAdapter.create({
          name: 'Session 2 Filter',
          filter: 'priority = 1',
          isGlobal: false,
        });

        // Each session should only see its own filters
        const session1Filters = await adapter.list();
        const session2Filters = await otherAdapter.list();

        expect(session1Filters).toHaveLength(1);
        expect(session1Filters[0].name).toBe('Session 1 Filter');

        expect(session2Filters).toHaveLength(1);
        expect(session2Filters[0].name).toBe('Session 2 Filter');
      });

      it('should enforce unique names per session', async () => {
        const filterName = 'Duplicate Name';

        // Create filter with same name in both sessions - should succeed
        await adapter.create({
          name: filterName,
          filter: 'done = false',
          isGlobal: false,
        });

        await otherAdapter.create({
          name: filterName,
          filter: 'priority = 1',
          isGlobal: false,
        });

        // But creating duplicate name within same session should fail
        await expect(adapter.create({
          name: filterName,
          filter: 'priority = 2',
          isGlobal: false,
        })).rejects.toThrow('already exists');
      });
    });

    describe('statistics and health', () => {
      it('should return accurate statistics', async () => {
        // Create some test data
        await adapter.create({
          name: 'Filter 1',
          filter: 'done = false',
          isGlobal: false,
        });

        await adapter.create({
          name: 'Filter 2',
          filter: 'priority = 1',
          isGlobal: true,
        });

        const stats = await adapter.getStats();
        expect(stats.filterCount).toBe(2);
        expect(stats.sessionId).toBe(session.id);
        expect(stats.storageType).toBe('sqlite');
        expect(stats.additionalInfo).toBeDefined();
        expect(stats.additionalInfo!.databasePath).toBe(testDbPath);
      });

      it('should perform health check successfully', async () => {
        const healthCheck = await adapter.healthCheck();
        expect(healthCheck.healthy).toBe(true);
        expect(healthCheck.details).toBeDefined();
        expect(healthCheck.details!.databasePath).toBe(testDbPath);
      });
    });
  });

  describe('InMemoryStorageAdapter', () => {
    let adapter: InMemoryStorageAdapter;
    let session: StorageSession;

    beforeEach(async () => {
      session = {
        id: randomUUID(),
        createdAt: new Date(),
        lastAccessAt: new Date(),
      };

      adapter = new InMemoryStorageAdapter();
      await adapter.initialize(session);
    });

    it('should implement all StorageAdapter methods', async () => {
      // Test basic CRUD operations
      const filter = await adapter.create({
        name: 'Memory Filter',
        filter: 'done = false',
        isGlobal: true,
      });

      expect(filter.id).toBeDefined();
      expect(filter.name).toBe('Memory Filter');

      const retrieved = await adapter.get(filter.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe('Memory Filter');

      const updated = await adapter.update(filter.id, { name: 'Updated Memory Filter' });
      expect(updated.name).toBe('Updated Memory Filter');

      const filters = await adapter.list();
      expect(filters).toHaveLength(1);

      await adapter.delete(filter.id);
      const deletedFilter = await adapter.get(filter.id);
      expect(deletedFilter).toBeNull();
    });

    it('should return correct storage type in stats', async () => {
      const stats = await adapter.getStats();
      expect(stats.storageType).toBe('memory');
      expect(stats.additionalInfo!.memoryUsageKb).toBeDefined();
    });

    it('should always return healthy status', async () => {
      const healthCheck = await adapter.healthCheck();
      expect(healthCheck.healthy).toBe(true);
    });
  });

  describe('StorageAdapterFactory', () => {
    let factory: DefaultStorageAdapterFactory;

    beforeEach(() => {
      factory = new DefaultStorageAdapterFactory();
    });

    it('should create SQLite adapter with valid configuration', async () => {
      const config: StorageConfig = {
        type: 'sqlite',
        databasePath: testDbPath,
        timeout: 5000,
      };

      const adapter = await factory.createAdapter(config);
      expect(adapter).toBeInstanceOf(SQLiteStorageAdapter);
      await adapter.close();
    });

    it('should create memory adapter when requested', async () => {
      const config: StorageConfig = {
        type: 'memory',
      };

      const adapter = await factory.createAdapter(config);
      expect(adapter).toBeInstanceOf(InMemoryStorageAdapter);
    });

    it('should fallback to memory adapter for unsupported types', async () => {
      const config: StorageConfig = {
        type: 'postgresql' as any, // Not yet implemented
        connectionString: 'postgresql://localhost:5432/test',
      };

      const adapter = await factory.createAdapter(config);
      expect(adapter).toBeInstanceOf(InMemoryStorageAdapter);
    });

    it('should validate configuration correctly', () => {
      const validConfig: StorageConfig = {
        type: 'sqlite',
        databasePath: testDbPath,
      };

      const invalidConfig: StorageConfig = {
        type: 'sqlite',
        // Missing databasePath
      } as any;

      expect(factory.validateConfig(validConfig).valid).toBe(true);
      expect(factory.validateConfig(invalidConfig).valid).toBe(false);
    });

    it('should return supported types', () => {
      const supportedTypes = factory.getSupportedTypes();
      expect(supportedTypes).toContain('memory');
      expect(supportedTypes).toContain('sqlite');
    });
  });

  describe('MigrationRunner', () => {
    let adapter: SQLiteStorageAdapter;
    let migrationRunner: MigrationRunner;

    beforeEach(async () => {
      adapter = new SQLiteStorageAdapter({
        databasePath: testDbPath,
      });

      const session: StorageSession = {
        id: randomUUID(),
        createdAt: new Date(),
        lastAccessAt: new Date(),
      };

      await adapter.initialize(session);
      migrationRunner = new MigrationRunner((adapter as any).db);
    });

    afterEach(async () => {
      await adapter.close();
    });

    it('should track current schema version', () => {
      const currentVersion = migrationRunner.getCurrentVersion();
      expect(currentVersion).toBeGreaterThanOrEqual(0);
    });

    it('should list applied migrations', () => {
      const appliedMigrations = migrationRunner.getAppliedMigrations();
      expect(Array.isArray(appliedMigrations)).toBe(true);
    });

    it('should validate migration registry', () => {
      const validation = migrationRunner.validateMigrations();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should get migration status', () => {
      const status = migrationRunner.getStatus();
      expect(status.currentVersion).toBeGreaterThanOrEqual(0);
      expect(status.latestVersion).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(status.appliedMigrations)).toBe(true);
      expect(Array.isArray(status.pendingMigrations)).toBe(true);
      expect(typeof status.isUpToDate).toBe('boolean');
    });

    it('should migrate to latest version', async () => {
      await migrationRunner.migrateToLatest();
      const status = migrationRunner.getStatus();
      expect(status.isUpToDate).toBe(true);
    });
  });

  describe('Configuration Management', () => {
    it('should create valid SQLite configuration', () => {
      const config = createStorageConfig({
        type: 'sqlite',
        databasePath: testDbPath,
      });

      expect(config.type).toBe('sqlite');
      expect(config.databasePath).toBe(testDbPath);
    });

    it('should throw error for explicitly null required fields', () => {
      expect(() => createStorageConfig({
        type: 'sqlite',
        databasePath: null, // Explicitly null should throw
      })).toThrow('Invalid storage configuration');
    });

    it('should provide default configuration for storage types', () => {
      const sqliteConfig = createStorageConfig({ type: 'sqlite' });
      expect(sqliteConfig.type).toBe('sqlite');
      expect(sqliteConfig.databasePath).toBeDefined();

      const memoryConfig = createStorageConfig({ type: 'memory' });
      expect(memoryConfig.type).toBe('memory');
    });
  });

  describe('PersistentFilterStorage Integration', () => {
    let storage: PersistentFilterStorage;

    beforeEach(() => {
      // Mock environment to use test database
      process.env.VIKUNJA_MCP_STORAGE_TYPE = 'sqlite';
      process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH = testDbPath;
      
      storage = new PersistentFilterStorage(randomUUID(), 'test-user', 'https://test.vikunja.io');
    });

    afterEach(async () => {
      await storage.close();
      
      // Clean up environment
      delete process.env.VIKUNJA_MCP_STORAGE_TYPE;
      delete process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH;
    });

    it('should implement FilterStorage interface', async () => {
      // Test all FilterStorage methods
      const filter = await storage.create({
        name: 'Integration Test Filter',
        filter: 'done = false',
        isGlobal: true,
      });

      expect(filter.id).toBeDefined();

      const retrieved = await storage.get(filter.id);
      expect(retrieved).not.toBeNull();

      const filters = await storage.list();
      expect(filters).toHaveLength(1);

      const updated = await storage.update(filter.id, { name: 'Updated Filter' });
      expect(updated.name).toBe('Updated Filter');

      const found = await storage.findByName('Updated Filter');
      expect(found).not.toBeNull();

      await storage.delete(filter.id);
      const deleted = await storage.get(filter.id);
      expect(deleted).toBeNull();
    });

    it('should provide storage statistics', async () => {
      await storage.create({
        name: 'Test Filter',
        filter: 'priority = 1',
        isGlobal: false,
      });

      const stats = await storage.getStats();
      expect(stats.filterCount).toBe(1);
      expect(stats.storageType).toBe('sqlite');
      expect(stats.sessionId).toBeDefined();
    });

    it('should perform health checks', async () => {
      const healthCheck = await storage.healthCheck();
      expect(healthCheck.healthy).toBe(true);
    });

    it('should handle graceful degradation', async () => {
      // Test with invalid database path
      const invalidStorage = new PersistentFilterStorage(randomUUID());
      process.env.VIKUNJA_MCP_STORAGE_DATABASE_PATH = '/invalid/path/test.db';
      
      // Should fallback gracefully (implementation should handle this)
      try {
        await invalidStorage.list();
      } catch (error) {
        // Expected to fail, but should not crash
        expect(error).toBeDefined();
      } finally {
        await invalidStorage.close();
      }
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database corruption gracefully', async () => {
      const adapter = new SQLiteStorageAdapter({
        databasePath: testDbPath,
      });

      const session: StorageSession = {
        id: randomUUID(),
        createdAt: new Date(),
        lastAccessAt: new Date(),
      };

      await adapter.initialize(session);

      // Create a filter first
      await adapter.create({
        name: 'Test Filter',
        filter: 'done = false',
        isGlobal: false,
      });

      // Simulate corruption by closing and deleting the database file
      await adapter.close();

      // Delete the database file to simulate corruption
      await rm(testDbPath, { force: true });

      const healthCheck = await adapter.healthCheck();
      expect(healthCheck.healthy).toBe(false);
      expect(healthCheck.error).toBeDefined();
      expect(healthCheck.error).toContain('reconnection failed');
    });

    it('should handle concurrent access safely', async () => {
      const adapter = new SQLiteStorageAdapter({
        databasePath: testDbPath,
      });

      const session: StorageSession = {
        id: randomUUID(),
        createdAt: new Date(),
        lastAccessAt: new Date(),
      };

      await adapter.initialize(session);

      // Create multiple concurrent operations
      const operations = Array.from({ length: 10 }, (_, i) =>
        adapter.create({
          name: `Concurrent Filter ${i}`,
          filter: `priority = ${i}`,
          isGlobal: false,
        })
      );

      const results = await Promise.all(operations);
      expect(results).toHaveLength(10);

      // Verify all filters were created
      const filters = await adapter.list();
      expect(filters).toHaveLength(10);

      await adapter.close();
    });
  });
});