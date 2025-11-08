/**
 * Interface for SQLite database data access operations
 *
 * This interface defines the contract for performing CRUD operations
 * on the SQLite database with prepared statements and parameter binding.
 */

import type Database from 'better-sqlite3';
import type { SavedFilter } from '../../../types/filters';
import type { StorageSession } from '../../interfaces';

/**
 * Database row representation for saved filters
 */
export interface FilterRow {
  id: string;
  session_id: string;
  name: string;
  description: string | null;
  filter: string;
  expression: string | null;
  project_id: number | null;
  is_global: number; // SQLite boolean as integer
  created: string; // ISO string
  updated: string; // ISO string
}

/**
 * Statistics about the database
 */
export interface DatabaseStats {
  filterCount: number;
  pageCount: number;
  pageSize: number;
  databaseSizeBytes: number;
}

/**
 * Parameters for creating a new filter
 */
export interface CreateFilterParams {
  id: string;
  sessionId: string;
  name: string;
  description: string | null;
  filter: string;
  expression: string | null;
  projectId: number | null;
  isGlobal: number;
  created: string;
  updated: string;
}

/**
 * Parameters for updating an existing filter
 */
export interface UpdateFilterParams {
  name: string;
  description: string | null;
  filter: string;
  expression: string | null;
  projectId: number | null;
  isGlobal: number;
  updated: string;
  sessionId: string;
  id: string;
}

/**
 * Interface for SQLite database data access operations
 */
export interface ISQLiteDataAccess {
  /**
   * Prepare all SQL statements for better performance
   *
   * @param db - Database connection to prepare statements on
   * @throws {StorageInitializationError} When statement preparation fails
   */
  prepareStatements(db: Database.Database): void;

  /**
   * List all filters for a session
   *
   * @param sessionId - Session identifier
   * @returns Array of saved filters sorted by updated timestamp descending
   * @throws {StorageDataError} When query fails
   */
  listFilters(sessionId: string): SavedFilter[];

  /**
   * Get a specific filter by ID and session
   *
   * @param sessionId - Session identifier
   * @param id - Filter identifier
   * @returns Filter object or null if not found
   * @throws {StorageDataError} When query fails
   */
  getFilter(sessionId: string, id: string): SavedFilter | null;

  /**
   * Create a new filter in the database
   *
   * @param params - Filter creation parameters
   * @throws {StorageDataError} When insertion fails, including constraint violations
   */
  createFilter(params: CreateFilterParams): void;

  /**
   * Update an existing filter in the database
   *
   * @param params - Filter update parameters
   * @returns Number of rows affected
   * @throws {StorageDataError} When update fails
   */
  updateFilter(params: UpdateFilterParams): number;

  /**
   * Delete a filter from the database
   *
   * @param sessionId - Session identifier
   * @param id - Filter identifier
   * @returns Number of rows affected
   * @throws {StorageDataError} When deletion fails
   */
  deleteFilter(sessionId: string, id: string): number;

  /**
   * Find a filter by name within a session
   *
   * @param sessionId - Session identifier
   * @param name - Filter name
   * @returns Filter object or null if not found
   * @throws {StorageDataError} When query fails
   */
  findFilterByName(sessionId: string, name: string): SavedFilter | null;

  /**
   * Get filters for a specific project or global filters
   *
   * @param sessionId - Session identifier
   * @param projectId - Project identifier
   * @returns Array of filters for the project or global filters
   * @throws {StorageDataError} When query fails
   */
  getFiltersByProject(sessionId: string, projectId: number): SavedFilter[];

  /**
   * Clear all filters for a session
   *
   * @param sessionId - Session identifier
   * @returns Number of rows deleted
   * @throws {StorageDataError} When deletion fails
   */
  clearFilters(sessionId: string): number;

  /**
   * Get statistics about filters for a session
   *
   * @param sessionId - Session identifier
   * @returns Number of filters in the session
   * @throws {StorageDataError} When query fails
   */
  getFilterCount(sessionId: string): number;

  /**
   * Get database statistics
   *
   * @param db - Database connection
   * @returns Database statistics including size and page count
   */
  getDatabaseStats(db: Database.Database): DatabaseStats;

  /**
   * Convert a database row to a SavedFilter object
   *
   * @param row - Database row data
   * @returns SavedFilter object with proper type conversions
   */
  rowToFilter(row: FilterRow): SavedFilter;
}