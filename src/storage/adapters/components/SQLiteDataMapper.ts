/**
 * SQLite Data Mapper Component
 *
 * Handles pure data transformation between database rows and SavedFilter objects.
 * This component has no dependencies and follows the Single Responsibility Principle.
 */

import type { SavedFilter } from '../../../types/filters';
import { safeJsonParse } from '../../../utils/validation';

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
 * SQLite Data Mapper
 *
 * Responsible only for transforming between database rows and domain objects.
 * This component contains pure functions with no side effects.
 */
export class SQLiteDataMapper {
  /**
   * Convert database row to SavedFilter object
   *
   * @param row Database row from saved_filters table
   * @returns SavedFilter domain object
   */
  static rowToFilter(row: FilterRow): SavedFilter {
    const result: SavedFilter = {
      id: row.id,
      name: row.name,
      filter: row.filter,
      isGlobal: Boolean(row.is_global),
      created: new Date(row.created),
      updated: new Date(row.updated),
    };

    // Handle optional fields
    if (row.description !== null) {
      result.description = row.description;
    }

    if (row.expression !== null) {
      try {
        const parsedExpression = JSON.parse(row.expression);
        if (parsedExpression !== null && typeof parsedExpression === 'object') {
          result.expression = parsedExpression;
        }
      } catch {
        // Silently handle invalid JSON - the expression will be undefined
        // This is safer than throwing errors during data transformation
      }
    }

    if (row.project_id !== null) {
      result.projectId = row.project_id;
    }

    return result;
  }

  /**
   * Convert SavedFilter object to database row
   *
   * @param filter SavedFilter domain object
   * @param sessionId Session ID for the filter
   * @returns Database row representation
   */
  static filterToRow(filter: SavedFilter, sessionId: string): Omit<FilterRow, 'id' | 'created' | 'updated'> {
    return {
      session_id: sessionId,
      name: filter.name,
      description: filter.description || null,
      filter: filter.filter,
      expression: filter.expression ? JSON.stringify(filter.expression) : null,
      project_id: filter.projectId || null,
      is_global: filter.isGlobal ? 1 : 0,
    };
  }

  /**
   * Validate that a database row has the required structure
   *
   * @param row Database row to validate
   * @returns True if row is valid, false otherwise
   */
  static isValidRow(row: unknown): row is FilterRow {
    if (!row || typeof row !== 'object') {
      return false;
    }

    const castRow = row as Record<string, unknown>;

    return (
      typeof castRow.id === 'string' &&
      typeof castRow.session_id === 'string' &&
      typeof castRow.name === 'string' &&
      typeof castRow.filter === 'string' &&
      typeof castRow.is_global === 'number' &&
      typeof castRow.created === 'string' &&
      typeof castRow.updated === 'string' &&
      (castRow.description === null || typeof castRow.description === 'string') &&
      (castRow.expression === null || typeof castRow.expression === 'string') &&
      (castRow.project_id === null || typeof castRow.project_id === 'number')
    );
  }

  /**
   * Extract session ID from row
   *
   * @param row Database row
   * @returns Session ID
   */
  static getSessionId(row: FilterRow): string {
    return row.session_id;
  }

  /**
   * Extract filter ID from row
   *
   * @param row Database row
   * @returns Filter ID
   */
  static getFilterId(row: FilterRow): string {
    return row.id;
  }

  /**
   * Check if row represents a global filter
   *
   * @param row Database row
   * @returns True if global filter
   */
  static isGlobalFilter(row: FilterRow): boolean {
    return Boolean(row.is_global);
  }

  /**
   * Get project ID from row
   *
   * @param row Database row
   * @returns Project ID or null if not set
   */
  static getProjectId(row: FilterRow): number | null {
    return row.project_id;
  }

  /**
   * Get filter name from row
   *
   * @param row Database row
   * @returns Filter name
   */
  static getFilterName(row: FilterRow): string {
    return row.name;
  }
}