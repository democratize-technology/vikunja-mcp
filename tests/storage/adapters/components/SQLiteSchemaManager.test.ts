/**
 * Tests for SQLiteSchemaManager
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, mkdirSync } from 'fs';
import * as sqliteModule from 'better-sqlite3';
import { SQLiteSchemaManager } from '../../../../src/storage/adapters/components/SQLiteSchemaManager';
import { StorageInitializationError } from '../../../../src/storage/interfaces';

describe('SQLiteSchemaManager', () => {
  let schemaManager: SQLiteSchemaManager;
  let testDatabasePath: string;
  let testDir: string;
  let db: sqliteModule.Database;

  beforeEach(() => {
    // Create unique test directory and database path
    testDir = join(tmpdir(), `vikunja-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    mkdirSync(testDir, { recursive: true });
    testDatabasePath = join(testDir, 'test.db');

    schemaManager = new SQLiteSchemaManager();
    db = new sqliteModule.default(testDatabasePath);
  });

  afterEach(() => {
    // Clean up database connection and test files
    try {
      if (db) {
        db.close();
      }
    } catch (error) {
      // Ignore cleanup errors
    }

    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Constructor', () => {
    it('should initialize with default migrations', () => {
      const availableMigrations = schemaManager.getAvailableMigrations();
      expect(availableMigrations).toHaveLength(1);
      expect(availableMigrations[0].version).toBe(1);
      expect(availableMigrations[0].description).toBe('Initial schema with saved filters');
    });
  });

  describe('Schema Initialization', () => {
    it('should initialize schema successfully on new database', async () => {
      const result = await schemaManager.initializeSchema(db);

      expect(result.success).toBe(true);
      expect(result.currentVersion).toBe(1);
      expect(result.appliedMigrations).toBe(1);
      expect(result.error).toBeUndefined();

      // Verify schema version table exists
      const versionResult = db.prepare('SELECT version FROM schema_version WHERE version = 1').get() as { version: number };
      expect(versionResult.version).toBe(1);

      // Verify saved_filters table exists
      const tableInfo = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='saved_filters'").get() as { name: string };
      expect(tableInfo?.name).toBe('saved_filters');

      // Verify indexes exist (SQLite also creates autoindexes for UNIQUE and PRIMARY KEY constraints)
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='saved_filters'").all() as { name: string }[];
      const userDefinedIndexes = indexes.filter(i => !i.name.startsWith('sqlite_autoindex'));
      expect(userDefinedIndexes).toHaveLength(3);
      expect(userDefinedIndexes.map(i => i.name)).toEqual(expect.arrayContaining([
        'idx_saved_filters_session',
        'idx_saved_filters_project',
        'idx_saved_filters_updated'
      ]));
    });

    it('should handle already initialized database', async () => {
      // First initialization
      const firstResult = await schemaManager.initializeSchema(db);
      expect(firstResult.success).toBe(true);
      expect(firstResult.appliedMigrations).toBe(1);

      // Second initialization should not apply migrations again
      const secondResult = await schemaManager.initializeSchema(db);
      expect(secondResult.success).toBe(true);
      expect(secondResult.currentVersion).toBe(1);
      expect(secondResult.appliedMigrations).toBe(0); // No migrations applied
    });

    it('should handle database errors during initialization', async () => {
      // Close database to simulate error
      db.close();

      await expect(schemaManager.initializeSchema(db))
        .rejects.toThrow(StorageInitializationError);
    });
  });

  describe('Version Management', () => {
    it('should return version 0 for uninitialized database', () => {
      const version = schemaManager.getCurrentVersion(db);
      expect(version).toBe(0);
    });

    it('should return correct version after initialization', async () => {
      await schemaManager.initializeSchema(db);
      const version = schemaManager.getCurrentVersion(db);
      expect(version).toBe(1);
    });

    it('should detect when migration is needed', async () => {
      // Initially needs migration
      expect(schemaManager.needsMigration(db)).toBe(true);

      // After initialization, no migration needed
      await schemaManager.initializeSchema(db);
      expect(schemaManager.needsMigration(db)).toBe(false);
    });
  });

  describe('Migration Execution', () => {
    it('should execute migration SQL correctly', async () => {
      await schemaManager.initializeSchema(db);

      // Test that we can insert data into the created table
      const insertStmt = db.prepare(`
        INSERT INTO saved_filters (id, session_id, name, filter, created, updated)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const result = insertStmt.run('test-id', 'test-session', 'test-filter', 'test-data', new Date().toISOString(), new Date().toISOString());
      expect(result.changes).toBe(1);

      // Verify data was inserted
      const row = db.prepare('SELECT * FROM saved_filters WHERE id = ?').get('test-id') as any;
      expect(row.id).toBe('test-id');
      expect(row.name).toBe('test-filter');
    });

    it('should handle multiple SQL statements in migration', async () => {
      // Add a test migration with multiple statements
      const testManager = new SQLiteSchemaManager();

      await schemaManager.initializeSchema(db);

      // Verify all tables and indexes were created
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
      expect(tables.map(t => t.name)).toContain('saved_filters');
      expect(tables.map(t => t.name)).toContain('schema_version');

      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[];
      expect(indexes.length).toBeGreaterThan(0);
    });

    it('should throw StorageInitializationError on migration failure', async () => {
      // Create a schema manager with invalid SQL
      const mockSchemaManager = new SQLiteSchemaManager() as any;
      mockSchemaManager.migrations = [{
        version: 1,
        description: 'Invalid migration',
        sql: 'INVALID SQL STATEMENT'
      }];

      await expect(mockSchemaManager.initializeSchema(db))
        .rejects.toThrow(StorageInitializationError);
    });
  });

  describe('Migration Application', () => {
    it('should apply pending migrations successfully', async () => {
      const result = await schemaManager.applyMigrations(db);

      expect(result.success).toBe(true);
      expect(result.currentVersion).toBe(1);
      expect(result.appliedMigrations).toBe(1);
      expect(result.error).toBeUndefined();

      // Verify version was recorded
      const version = schemaManager.getCurrentVersion(db);
      expect(version).toBe(1);
    });

    it('should handle no pending migrations', async () => {
      // Initialize first
      await schemaManager.initializeSchema(db);

      // Apply migrations again
      const result = await schemaManager.applyMigrations(db);

      expect(result.success).toBe(true);
      expect(result.currentVersion).toBe(1);
      expect(result.appliedMigrations).toBe(0); // No migrations applied
    });

    it('should record migration details in schema_version table', async () => {
      await schemaManager.applyMigrations(db);

      const versionRow = db.prepare(`
        SELECT version, description, applied_at
        FROM schema_version
        WHERE version = 1
      `).get() as { version: number; description: string; applied_at: string };

      expect(versionRow.version).toBe(1);
      expect(versionRow.description).toBe('Initial schema with saved filters');
      expect(versionRow.applied_at).toBeDefined();
    });

    it('should handle migration errors gracefully', async () => {
      // Close database to simulate error
      db.close();

      await expect(schemaManager.applyMigrations(db))
        .rejects.toThrow(StorageInitializationError);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty migration SQL', async () => {
      const testManager = new SQLiteSchemaManager() as any;
      testManager.migrations = [{
        version: 1,
        description: 'Empty migration',
        sql: ''
      }];

      await expect(testManager.initializeSchema(db)).resolves.not.toThrow();
    });

    it('should handle SQL with comments and whitespace', async () => {
      const testManager = new SQLiteSchemaManager() as any;
      testManager.migrations = [{
        version: 1,
        description: 'Migration with comments',
        sql: `
          -- Create test table
          CREATE TABLE IF NOT EXISTS test_table (
            id INTEGER PRIMARY KEY
          );

          -- Another comment with extra spaces

          INSERT INTO test_table (id) VALUES (1);
        `
      }];

      await expect(testManager.initializeSchema(db)).resolves.not.toThrow();
    });

    it('should get current version on corrupted database', async () => {
      // Close and delete database to simulate corruption
      db.close();
      rmSync(testDatabasePath, { force: true });

      // Create new database connection (this will fail gracefully)
      const version = schemaManager.getCurrentVersion(db);
      expect(version).toBe(0);
    });
  });

  describe('Integration with Schema Manager Interface', () => {
    it('should implement all required interface methods', () => {
      const manager: SQLiteSchemaManager = schemaManager;

      expect(typeof manager.initializeSchema).toBe('function');
      expect(typeof manager.getCurrentVersion).toBe('function');
      expect(typeof manager.getAvailableMigrations).toBe('function');
      expect(typeof manager.needsMigration).toBe('function');
      expect(typeof manager.applyMigrations).toBe('function');
    });

    it('should return migrations in correct order', () => {
      const migrations = schemaManager.getAvailableMigrations();
      expect(migrations).toHaveLength(1);
      expect(migrations[0].version).toBe(1);
    });
  });
});