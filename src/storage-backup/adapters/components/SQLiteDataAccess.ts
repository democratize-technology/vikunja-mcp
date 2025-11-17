/**
 * SQLite Data Access Layer
 *
 * Provides pure CRUD operations for the SQLite storage adapter with
 * prepared statements and efficient query execution.
 */

import type Database from 'better-sqlite3';
import type { SavedFilter } from '../../../types/filters';
import {
  StorageInitializationError,
  StorageDataError,
} from '../../interfaces';
import { safeJsonParse } from '../../../utils/validation';
import type {
  ISQLiteDataAccess,
  FilterRow,
  DatabaseStats,
  CreateFilterParams,
  UpdateFilterParams,
} from './interfaces/ISQLiteDataAccess';

/**
 * Implementation of SQLite data access operations
 */
export class SQLiteDataAccess implements ISQLiteDataAccess {
  private statements: {
    list?: Database.Statement;
    get?: Database.Statement;
    create?: Database.Statement;
    update?: Database.Statement;
    delete?: Database.Statement;
    findByName?: Database.Statement;
    getByProject?: Database.Statement;
    clear?: Database.Statement;
    getStats?: Database.Statement;
  } = {};

  /**
   * Prepare all SQL statements for better performance
   */
  prepareStatements(db: Database.Database): void {
    try {
      this.statements.list = db.prepare(`
        SELECT * FROM saved_filters
        WHERE session_id = ?
        ORDER BY updated DESC
      `);

      this.statements.get = db.prepare(`
        SELECT * FROM saved_filters
        WHERE session_id = ? AND id = ?
      `);

      this.statements.create = db.prepare(`
        INSERT INTO saved_filters (
          id, session_id, name, description, filter, expression,
          project_id, is_global, created, updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      this.statements.update = db.prepare(`
        UPDATE saved_filters
        SET name = ?, description = ?, filter = ?, expression = ?,
            project_id = ?, is_global = ?, updated = ?
        WHERE session_id = ? AND id = ?
      `);

      this.statements.delete = db.prepare(`
        DELETE FROM saved_filters
        WHERE session_id = ? AND id = ?
      `);

      this.statements.findByName = db.prepare(`
        SELECT * FROM saved_filters
        WHERE session_id = ? AND name = ?
      `);

      this.statements.getByProject = db.prepare(`
        SELECT * FROM saved_filters
        WHERE session_id = ? AND (project_id = ? OR is_global = 1)
        ORDER BY updated DESC
      `);

      this.statements.clear = db.prepare(`
        DELETE FROM saved_filters
        WHERE session_id = ?
      `);

      this.statements.getStats = db.prepare(`
        SELECT COUNT(*) as filter_count
        FROM saved_filters
        WHERE session_id = ?
      `);

    } catch (error) {
      throw new StorageInitializationError(
        `Failed to prepare SQL statements: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * List all filters for a session
   */
  listFilters(sessionId: string): SavedFilter[] {
    this.ensureStatementPrepared('list');

    try {
      const rows = this.statements.list!.all(sessionId) as FilterRow[];
      return rows.map(row => this.rowToFilter(row));
    } catch (error) {
      throw new StorageDataError(
        `Failed to list filters: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get a specific filter by ID and session
   */
  getFilter(sessionId: string, id: string): SavedFilter | null {
    this.ensureStatementPrepared('get');

    try {
      const row = this.statements.get!.get(sessionId, id) as FilterRow | undefined;
      return row ? this.rowToFilter(row) : null;
    } catch (error) {
      throw new StorageDataError(
        `Failed to get filter ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Create a new filter in the database
   */
  createFilter(params: CreateFilterParams): void {
    this.ensureStatementPrepared('create');

    try {
      this.statements.create!.run(
        params.id,
        params.sessionId,
        params.name,
        params.description,
        params.filter,
        params.expression,
        params.projectId,
        params.isGlobal,
        params.created,
        params.updated,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new StorageDataError(
          `Filter with name "${params.name}" already exists in this session`,
          error,
        );
      }

      throw new StorageDataError(
        `Failed to create filter: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Update an existing filter in the database
   */
  updateFilter(params: UpdateFilterParams): number {
    this.ensureStatementPrepared('update');

    try {
      const result = this.statements.update!.run(
        params.name,
        params.description,
        params.filter,
        params.expression,
        params.projectId,
        params.isGlobal,
        params.updated,
        params.sessionId,
        params.id,
      );

      return result.changes;
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new StorageDataError(
          `Filter with name "${params.name}" already exists in this session`,
          error,
        );
      }

      throw new StorageDataError(
        `Failed to update filter ${params.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a filter from the database
   */
  deleteFilter(sessionId: string, id: string): number {
    this.ensureStatementPrepared('delete');

    try {
      const result = this.statements.delete!.run(sessionId, id);
      return result.changes;
    } catch (error) {
      throw new StorageDataError(
        `Failed to delete filter ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Find a filter by name within a session
   */
  findFilterByName(sessionId: string, name: string): SavedFilter | null {
    this.ensureStatementPrepared('findByName');

    try {
      const row = this.statements.findByName!.get(sessionId, name) as FilterRow | undefined;
      return row ? this.rowToFilter(row) : null;
    } catch (error) {
      throw new StorageDataError(
        `Failed to find filter by name "${name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get filters for a specific project or global filters
   */
  getFiltersByProject(sessionId: string, projectId: number): SavedFilter[] {
    this.ensureStatementPrepared('getByProject');

    try {
      const rows = this.statements.getByProject!.all(sessionId, projectId) as FilterRow[];
      return rows.map(row => this.rowToFilter(row));
    } catch (error) {
      throw new StorageDataError(
        `Failed to get filters for project ${projectId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Clear all filters for a session
   */
  clearFilters(sessionId: string): number {
    this.ensureStatementPrepared('clear');

    try {
      const result = this.statements.clear!.run(sessionId);
      return result.changes;
    } catch (error) {
      throw new StorageDataError(
        `Failed to clear filters: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get statistics about filters for a session
   */
  getFilterCount(sessionId: string): number {
    this.ensureStatementPrepared('getStats');

    try {
      const result = this.statements.getStats!.get(sessionId) as { filter_count: number };
      return result.filter_count;
    } catch (error) {
      throw new StorageDataError(
        `Failed to get filter count: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get database statistics
   */
  getDatabaseStats(db: Database.Database): DatabaseStats {
    try {
      const pageStats = db.prepare("PRAGMA page_count").get() as { page_count: number };
      const pageSize = db.prepare("PRAGMA page_size").get() as { page_size: number };

      return {
        pageCount: pageStats.page_count,
        pageSize: pageSize.page_size,
        databaseSizeBytes: pageStats.page_count * pageSize.page_size,
        filterCount: 0, // Will be set by caller
      };
    } catch (error) {
      throw new StorageDataError(
        `Failed to get database stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Convert a database row to a SavedFilter object
   */
  rowToFilter(row: FilterRow): SavedFilter {
    const result: SavedFilter = {
      id: row.id,
      name: row.name,
      filter: row.filter,
      isGlobal: Boolean(row.is_global),
      created: new Date(row.created),
      updated: new Date(row.updated),
    };

    if (row.description !== null) {
      result.description = row.description;
    }

    if (row.expression !== null) {
      result.expression = safeJsonParse(row.expression);
    }

    if (row.project_id !== null) {
      result.projectId = row.project_id;
    }

    return result;
  }

  /**
   * Ensure a statement is prepared before use
   */
  private ensureStatementPrepared(statementName: keyof typeof this.statements): void {
    if (!this.statements[statementName]) {
      throw new StorageDataError(
        `Prepared statement for ${statementName} operation not initialized`
      );
    }
  }
}