/**
 * Tests for SQLiteDataAccess
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, mkdirSync } from 'fs';
import * as sqliteModule from 'better-sqlite3';
import { SQLiteDataAccess } from '../../../../src/storage/adapters/components/SQLiteDataAccess';
import { StorageInitializationError, StorageDataError } from '../../../../src/storage/interfaces';
import type { SavedFilter } from '../../../../src/types/filters';
import { safeJsonStringify } from '../../../../src/utils/validation';

describe('SQLiteDataAccess', () => {
  let dataAccess: SQLiteDataAccess;
  let testDatabasePath: string;
  let testDir: string;
  let db: sqliteModule.Database;
  let testSessionId: string;
  let testFilter: SavedFilter;

  beforeEach(() => {
    // Create unique test directory and database path
    testDir = join(tmpdir(), `vikunja-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    mkdirSync(testDir, { recursive: true });
    testDatabasePath = join(testDir, 'test.db');
    testSessionId = 'test-session-id';

    testFilter = {
      id: 'test-filter-id',
      name: 'Test Filter',
      description: 'A test filter',
      filter: 'status = "active"',
      expression: {
        groups: [{
          operator: '&&',
          conditions: [{
            field: 'done',
            operator: '=',
            value: false
          }]
        }]
      },
      projectId: 123,
      isGlobal: false,
      created: new Date('2023-01-01T00:00:00Z'),
      updated: new Date('2023-01-01T00:00:00Z'),
    };

    // Initialize database and schema
    db = new sqliteModule.default(testDatabasePath);

    // Create the schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS saved_filters (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        filter TEXT NOT NULL,
        expression TEXT,
        project_id INTEGER,
        is_global INTEGER NOT NULL DEFAULT 0,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        UNIQUE(session_id, name)
      );

      CREATE INDEX IF NOT EXISTS idx_saved_filters_session ON saved_filters(session_id);
      CREATE INDEX IF NOT EXISTS idx_saved_filters_project ON saved_filters(session_id, project_id);
      CREATE INDEX IF NOT EXISTS idx_saved_filters_updated ON saved_filters(session_id, updated DESC);
    `);

    dataAccess = new SQLiteDataAccess();
    dataAccess.prepareStatements(db);
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

  describe('Statement Preparation', () => {
    it('should prepare all required statements successfully', () => {
      expect(() => dataAccess.prepareStatements(db)).not.toThrow();
    });

    it('should throw StorageInitializationError when database connection is invalid', () => {
      const invalidDb = null as any;
      const newDataAccess = new SQLiteDataAccess();

      expect(() => newDataAccess.prepareStatements(invalidDb))
        .toThrow(StorageInitializationError);
    });

    it('should allow statement preparation multiple times', () => {
      expect(() => dataAccess.prepareStatements(db)).not.toThrow();
      expect(() => dataAccess.prepareStatements(db)).not.toThrow();
    });
  });

  describe('Filter Creation', () => {
    it('should create a new filter successfully', () => {
      const params = {
        id: testFilter.id,
        sessionId: testSessionId,
        name: testFilter.name,
        description: testFilter.description,
        filter: testFilter.filter,
        expression: safeJsonStringify(testFilter.expression),
        projectId: testFilter.projectId,
        isGlobal: testFilter.isGlobal ? 1 : 0,
        created: testFilter.created.toISOString(),
        updated: testFilter.updated.toISOString(),
      };

      expect(() => dataAccess.createFilter(params)).not.toThrow();

      // Verify the filter was created
      const createdFilter = dataAccess.getFilter(testSessionId, testFilter.id);
      expect(createdFilter).not.toBeNull();
      expect(createdFilter!.id).toBe(testFilter.id);
      expect(createdFilter!.name).toBe(testFilter.name);
    });

    it('should handle null values in filter creation', () => {
      const params = {
        id: 'test-id-2',
        sessionId: testSessionId,
        name: 'Test Filter 2',
        description: null,
        filter: 'status = "pending"',
        expression: null,
        projectId: null,
        isGlobal: 1,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      expect(() => dataAccess.createFilter(params)).not.toThrow();

      const createdFilter = dataAccess.getFilter(testSessionId, 'test-id-2');
      expect(createdFilter).not.toBeNull();
      expect(createdFilter!.description).toBeUndefined();
      expect(createdFilter!.expression).toBeUndefined();
      expect(createdFilter!.projectId).toBeUndefined();
      expect(createdFilter!.isGlobal).toBe(true);
    });

    it('should throw StorageDataError on duplicate filter name', () => {
      const params = {
        id: 'duplicate-id',
        sessionId: testSessionId,
        name: testFilter.name, // Same name as existing filter
        description: 'Different filter',
        filter: 'different filter',
        expression: null,
        projectId: null,
        isGlobal: 0,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      // Create first filter
      dataAccess.createFilter({
        ...params,
        id: testFilter.id,
      });

      // Try to create second filter with same name
      expect(() => dataAccess.createFilter(params))
        .toThrow(StorageDataError);
    });
  });

  describe('Filter Retrieval', () => {
    beforeEach(() => {
      // Insert test filter
      const params = {
        id: testFilter.id,
        sessionId: testSessionId,
        name: testFilter.name,
        description: testFilter.description,
        filter: testFilter.filter,
        expression: safeJsonStringify(testFilter.expression),
        projectId: testFilter.projectId,
        isGlobal: testFilter.isGlobal ? 1 : 0,
        created: testFilter.created.toISOString(),
        updated: testFilter.updated.toISOString(),
      };
      dataAccess.createFilter(params);
    });

    it('should retrieve filter by ID and session', () => {
      const filter = dataAccess.getFilter(testSessionId, testFilter.id);

      expect(filter).not.toBeNull();
      expect(filter!.id).toBe(testFilter.id);
      expect(filter!.name).toBe(testFilter.name);
      expect(filter!.description).toBe(testFilter.description);
      expect(filter!.filter).toBe(testFilter.filter);
      expect(filter!.isGlobal).toBe(testFilter.isGlobal);
      expect(filter!.created).toEqual(testFilter.created);
      expect(filter!.updated).toEqual(testFilter.updated);
    });

    it('should return null for non-existent filter', () => {
      const filter = dataAccess.getFilter(testSessionId, 'non-existent-id');
      expect(filter).toBeNull();
    });

    it('should return null for filter in different session', () => {
      const filter = dataAccess.getFilter('different-session', testFilter.id);
      expect(filter).toBeNull();
    });

    it('should list all filters for a session', () => {
      const filters = dataAccess.listFilters(testSessionId);

      expect(filters).toHaveLength(1);
      expect(filters[0].id).toBe(testFilter.id);
    });

    it('should return empty array for session with no filters', () => {
      const filters = dataAccess.listFilters('empty-session');
      expect(filters).toHaveLength(0);
    });
  });

  describe('Filter Updates', () => {
    beforeEach(() => {
      // Insert test filter
      const params = {
        id: testFilter.id,
        sessionId: testSessionId,
        name: testFilter.name,
        description: testFilter.description,
        filter: testFilter.filter,
        expression: safeJsonStringify(testFilter.expression),
        projectId: testFilter.projectId,
        isGlobal: testFilter.isGlobal ? 1 : 0,
        created: testFilter.created.toISOString(),
        updated: testFilter.updated.toISOString(),
      };
      dataAccess.createFilter(params);
    });

    it('should update filter successfully', () => {
      const updatedParams = {
        name: 'Updated Filter Name',
        description: 'Updated description',
        filter: 'status = "completed"',
        expression: safeJsonStringify({
        groups: [{
          operator: '&&',
          conditions: [{
            field: 'title',
            operator: 'like',
            value: 'updated'
          }]
        }]
      }),
        projectId: 456,
        isGlobal: 1,
        updated: new Date('2023-01-02T00:00:00Z').toISOString(),
        sessionId: testSessionId,
        id: testFilter.id,
      };

      const rowsAffected = dataAccess.updateFilter(updatedParams);
      expect(rowsAffected).toBe(1);

      const updatedFilter = dataAccess.getFilter(testSessionId, testFilter.id);
      expect(updatedFilter!.name).toBe('Updated Filter Name');
      expect(updatedFilter!.description).toBe('Updated description');
      expect(updatedFilter!.filter).toBe('status = "completed"');
      expect(updatedFilter!.projectId).toBe(456);
      expect(updatedFilter!.isGlobal).toBe(true);
    });

    it('should return 0 for updating non-existent filter', () => {
      const params = {
        name: 'New Name',
        description: null,
        filter: 'new filter',
        expression: null,
        projectId: null,
        isGlobal: 0,
        updated: new Date().toISOString(),
        sessionId: testSessionId,
        id: 'non-existent-id',
      };

      const rowsAffected = dataAccess.updateFilter(params);
      expect(rowsAffected).toBe(0);
    });
  });

  describe('Filter Deletion', () => {
    beforeEach(() => {
      // Insert test filter
      const params = {
        id: testFilter.id,
        sessionId: testSessionId,
        name: testFilter.name,
        description: testFilter.description,
        filter: testFilter.filter,
        expression: safeJsonStringify(testFilter.expression),
        projectId: testFilter.projectId,
        isGlobal: testFilter.isGlobal ? 1 : 0,
        created: testFilter.created.toISOString(),
        updated: testFilter.updated.toISOString(),
      };
      dataAccess.createFilter(params);
    });

    it('should delete filter successfully', () => {
      const rowsAffected = dataAccess.deleteFilter(testSessionId, testFilter.id);
      expect(rowsAffected).toBe(1);

      const deletedFilter = dataAccess.getFilter(testSessionId, testFilter.id);
      expect(deletedFilter).toBeNull();
    });

    it('should return 0 for deleting non-existent filter', () => {
      const rowsAffected = dataAccess.deleteFilter(testSessionId, 'non-existent-id');
      expect(rowsAffected).toBe(0);
    });

    it('should not delete filter from different session', () => {
      const rowsAffected = dataAccess.deleteFilter('different-session', testFilter.id);
      expect(rowsAffected).toBe(0);

      const filter = dataAccess.getFilter(testSessionId, testFilter.id);
      expect(filter).not.toBeNull();
    });
  });

  describe('Filter Queries', () => {
    beforeEach(() => {
      // Insert multiple test filters
      const filters = [
        { ...testFilter, id: 'filter-1', name: 'Filter 1', projectId: 100, isGlobal: false },
        { ...testFilter, id: 'filter-2', name: 'Filter 2', projectId: 200, isGlobal: true },
        { ...testFilter, id: 'filter-3', name: 'Filter 3', projectId: 100, isGlobal: false },
      ];

      filters.forEach(filter => {
        const params = {
          id: filter.id,
          sessionId: testSessionId,
          name: filter.name,
          description: filter.description,
          filter: filter.filter,
          expression: safeJsonStringify(filter.expression),
          projectId: filter.projectId,
          isGlobal: filter.isGlobal ? 1 : 0,
          created: filter.created.toISOString(),
          updated: filter.updated.toISOString(),
        };
        dataAccess.createFilter(params);
      });
    });

    it('should find filter by name', () => {
      const filter = dataAccess.findFilterByName(testSessionId, 'Filter 1');
      expect(filter).not.toBeNull();
      expect(filter!.id).toBe('filter-1');
    });

    it('should return null for non-existent filter name', () => {
      const filter = dataAccess.findFilterByName(testSessionId, 'Non-existent');
      expect(filter).toBeNull();
    });

    it('should get filters by project including global filters', () => {
      const filters = dataAccess.getFiltersByProject(testSessionId, 100);
      expect(filters).toHaveLength(3); // 2 project filters + 1 global filter

      const projectFilterIds = filters.filter(f => !f.isGlobal).map(f => f.id);
      const globalFilterIds = filters.filter(f => f.isGlobal).map(f => f.id);

      expect(projectFilterIds).toEqual(expect.arrayContaining(['filter-1', 'filter-3']));
      expect(globalFilterIds).toEqual(['filter-2']);
    });
  });

  describe('Session Operations', () => {
    beforeEach(() => {
      // Insert test filters with unique names to avoid conflicts
      const filters = [
        { ...testFilter, id: 'filter-1', name: 'Session Filter 1', sessionId: testSessionId },
        { ...testFilter, id: 'filter-2', name: 'Session Filter 2', sessionId: testSessionId },
        { ...testFilter, id: 'filter-3', name: 'Other Session Filter', sessionId: 'other-session' },
      ];

      filters.forEach(filter => {
        const params = {
          id: filter.id,
          sessionId: filter.sessionId || testSessionId,
          name: filter.name,
          description: filter.description,
          filter: filter.filter,
          expression: safeJsonStringify(filter.expression),
          projectId: filter.projectId,
          isGlobal: filter.isGlobal ? 1 : 0,
          created: filter.created.toISOString(),
          updated: filter.updated.toISOString(),
        };
        dataAccess.createFilter(params);
      });
    });

    it('should clear all filters for a session', () => {
      const rowsAffected = dataAccess.clearFilters(testSessionId);
      expect(rowsAffected).toBe(2);

      const remainingFilters = dataAccess.listFilters(testSessionId);
      expect(remainingFilters).toHaveLength(0);

      // Verify other session is unaffected
      const otherSessionFilters = dataAccess.listFilters('other-session');
      expect(otherSessionFilters).toHaveLength(1);
    });

    it('should return 0 for clearing empty session', () => {
      const rowsAffected = dataAccess.clearFilters('empty-session');
      expect(rowsAffected).toBe(0);
    });

    it('should get filter count for session', () => {
      const count = dataAccess.getFilterCount(testSessionId);
      expect(count).toBe(2);

      const otherCount = dataAccess.getFilterCount('other-session');
      expect(otherCount).toBe(1);

      const emptyCount = dataAccess.getFilterCount('empty-session');
      expect(emptyCount).toBe(0);
    });
  });

  describe('Database Statistics', () => {
    it('should get database statistics', () => {
      const stats = dataAccess.getDatabaseStats(db);

      expect(stats.pageCount).toBeGreaterThan(0);
      expect(stats.pageSize).toBeGreaterThan(0);
      expect(stats.databaseSizeBytes).toBeGreaterThan(0);
      expect(stats.filterCount).toBe(0); // Default value
    });
  });

  describe('Row Conversion', () => {
    it('should convert database row to filter object', () => {
      const row = {
        id: testFilter.id,
        session_id: testSessionId,
        name: testFilter.name,
        description: testFilter.description,
        filter: testFilter.filter,
        expression: safeJsonStringify(testFilter.expression),
        project_id: testFilter.projectId,
        is_global: 1,
        created: testFilter.created.toISOString(),
        updated: testFilter.updated.toISOString(),
      };

      const filter = dataAccess.rowToFilter(row);

      expect(filter.id).toBe(testFilter.id);
      expect(filter.name).toBe(testFilter.name);
      expect(filter.description).toBe(testFilter.description);
      expect(filter.filter).toBe(testFilter.filter);
      expect(filter.isGlobal).toBe(true);
      expect(filter.projectId).toBe(testFilter.projectId);
      expect(filter.expression).toEqual(testFilter.expression);
    });

    it('should handle null values in row conversion', () => {
      const row = {
        id: 'test-id',
        session_id: testSessionId,
        name: 'Test Filter',
        description: null,
        filter: 'test filter',
        expression: null,
        project_id: null,
        is_global: 0,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const filter = dataAccess.rowToFilter(row);

      expect(filter.description).toBeUndefined();
      expect(filter.expression).toBeUndefined();
      expect(filter.projectId).toBeUndefined();
      expect(filter.isGlobal).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should throw StorageDataError when statements are not prepared', () => {
      const newDataAccess = new SQLiteDataAccess();

      expect(() => newDataAccess.listFilters(testSessionId))
        .toThrow(StorageDataError);
      expect(() => newDataAccess.getFilter(testSessionId, 'test-id'))
        .toThrow(StorageDataError);
      expect(() => newDataAccess.createFilter({} as any))
        .toThrow(StorageDataError);
    });

    it('should handle database query errors gracefully', () => {
      // Close database to simulate connection error
      db.close();

      expect(() => dataAccess.listFilters(testSessionId))
        .toThrow(StorageDataError);
    });
  });

  describe('Integration with Data Access Interface', () => {
    it('should implement all required interface methods', () => {
      const access: SQLiteDataAccess = dataAccess;

      expect(typeof access.prepareStatements).toBe('function');
      expect(typeof access.listFilters).toBe('function');
      expect(typeof access.getFilter).toBe('function');
      expect(typeof access.createFilter).toBe('function');
      expect(typeof access.updateFilter).toBe('function');
      expect(typeof access.deleteFilter).toBe('function');
      expect(typeof access.findFilterByName).toBe('function');
      expect(typeof access.getFiltersByProject).toBe('function');
      expect(typeof access.clearFilters).toBe('function');
      expect(typeof access.getFilterCount).toBe('function');
      expect(typeof access.getDatabaseStats).toBe('function');
      expect(typeof access.rowToFilter).toBe('function');
    });
  });
});