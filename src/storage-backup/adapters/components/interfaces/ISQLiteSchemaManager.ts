/**
 * Interface for SQLite database schema management
 *
 * This interface defines the contract for managing database schemas,
 * including initialization, migrations, and version tracking.
 */

import type Database from 'better-sqlite3';

/**
 * Schema migration definition
 */
export interface SchemaMigration {
  version: number;
  description: string;
  sql: string;
}

/**
 * Schema initialization result
 */
export interface SchemaInitResult {
  success: boolean;
  currentVersion: number;
  appliedMigrations: number;
  error?: string;
}

/**
 * Interface for managing SQLite database schemas
 */
export interface ISQLiteSchemaManager {
  /**
   * Initialize the database schema with all necessary tables
   *
   * @param db - Database connection to use for schema operations
   * @returns Schema initialization result with version and migration info
   * @throws {StorageInitializationError} When schema initialization fails
   */
  initializeSchema(db: Database.Database): Promise<SchemaInitResult>;

  /**
   * Get the current schema version from the database
   *
   * @param db - Database connection to check
   * @returns Current schema version, 0 if not initialized
   */
  getCurrentVersion(db: Database.Database): number;

  /**
   * Get all available migrations for the schema
   *
   * @returns Array of available migrations in order
   */
  getAvailableMigrations(): SchemaMigration[];

  /**
   * Check if the database schema needs migration
   *
   * @param db - Database connection to check
   * @returns True if migrations are available and needed
   */
  needsMigration(db: Database.Database): boolean;

  /**
   * Apply pending migrations to bring the schema up to date
   *
   * @param db - Database connection to migrate
   * @returns Schema initialization result with migration details
   * @throws {StorageInitializationError} When migration fails
   */
  applyMigrations(db: Database.Database): Promise<SchemaInitResult>;
}