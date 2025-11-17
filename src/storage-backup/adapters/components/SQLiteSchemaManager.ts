/**
 * SQLite Schema Manager
 *
 * Manages database schema initialization, migrations, and version tracking
 * for the SQLite storage adapter.
 */

import type Database from 'better-sqlite3';
import { logger } from '../../../utils/logger';
import {
  StorageInitializationError,
} from '../../interfaces';
import type {
  ISQLiteSchemaManager,
  SchemaMigration,
  SchemaInitResult,
} from './interfaces/ISQLiteSchemaManager';

/**
 * Implementation of SQLite schema management
 */
export class SQLiteSchemaManager implements ISQLiteSchemaManager {
  private readonly migrations: SchemaMigration[] = [
    {
      version: 1,
      description: 'Initial schema with saved filters',
      sql: `
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

        CREATE INDEX IF NOT EXISTS idx_saved_filters_session
        ON saved_filters(session_id);

        CREATE INDEX IF NOT EXISTS idx_saved_filters_project
        ON saved_filters(session_id, project_id);

        CREATE INDEX IF NOT EXISTS idx_saved_filters_updated
        ON saved_filters(session_id, updated DESC);
      `,
    },
  ];

  /**
   * Initialize the database schema with all necessary tables
   */
  async initializeSchema(db: Database.Database): Promise<SchemaInitResult> {
    try {
      let currentVersion = this.getCurrentVersion(db);
      const appliedMigrations = currentVersion > 0 ? 0 : 1;

      // Create schema version table first
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          description TEXT
        );
      `);

      // Apply initial schema if not already done
      if (currentVersion === 0) {
        const migration = this.migrations[0];
        if (!migration) {
          throw new StorageInitializationError(
            'No initial migration available for schema initialization'
          );
        }
        this.executeMigration(db, migration);
        this.recordSchemaVersion(db, migration.version, migration.description);
        currentVersion = migration.version;
      }

      logger.debug('Database schema initialized successfully', {
        currentVersion,
        appliedMigrations,
      });

      return {
        success: true,
        currentVersion,
        appliedMigrations,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to initialize database schema', { error: errorMessage });

      throw new StorageInitializationError(
        `Failed to initialize database schema: ${errorMessage}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get the current schema version from the database
   */
  getCurrentVersion(db: Database.Database): number {
    try {
      const result = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number | null };
      return result.version || 0;
    } catch (error) {
      // Table doesn't exist or error occurred
      return 0;
    }
  }

  /**
   * Get all available migrations for the schema
   */
  getAvailableMigrations(): SchemaMigration[] {
    return [...this.migrations];
  }

  /**
   * Check if the database schema needs migration
   */
  needsMigration(db: Database.Database): boolean {
    const currentVersion = this.getCurrentVersion(db);
    const latestVersion = Math.max(...this.migrations.map(m => m.version));
    return currentVersion < latestVersion;
  }

  /**
   * Apply pending migrations to bring the schema up to date
   */
  async applyMigrations(db: Database.Database): Promise<SchemaInitResult> {
    try {
      // Ensure schema version table exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          description TEXT
        );
      `);

      const currentVersion = this.getCurrentVersion(db);
      const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);

      let appliedMigrations = 0;
      let latestVersion = currentVersion;

      for (const migration of pendingMigrations) {
        this.executeMigration(db, migration);
        this.recordSchemaVersion(db, migration.version, migration.description);
        appliedMigrations++;
        latestVersion = migration.version;

        logger.info('Applied database migration', {
          version: migration.version,
          description: migration.description,
        });
      }

      logger.debug('Database migrations completed successfully', {
        currentVersion: latestVersion,
        appliedMigrations,
      });

      return {
        success: true,
        currentVersion: latestVersion,
        appliedMigrations,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to apply database migrations', { error: errorMessage });

      throw new StorageInitializationError(
        `Failed to apply database migrations: ${errorMessage}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Execute a migration SQL statement
   */
  private executeMigration(db: Database.Database, migration: SchemaMigration): void {
    try {
      // Execute each statement separately to handle multiple statements in a single migration
      const statements = migration.sql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        if (statement.trim()) {
          db.exec(statement);
        }
      }

      logger.debug('Migration executed successfully', {
        version: migration.version,
        statementsExecuted: statements.length,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Migration execution failed', {
        version: migration.version,
        error: errorMessage,
      });

      throw new StorageInitializationError(
        `Migration ${migration.version} failed: ${errorMessage}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Record a schema version in the database
   */
  private recordSchemaVersion(db: Database.Database, version: number, description: string): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO schema_version (version, description)
        VALUES (?, ?)
      `);

      stmt.run(version, description);

      logger.debug('Schema version recorded', {
        version,
        description,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to record schema version', {
        version,
        error: errorMessage,
      });

      throw new StorageInitializationError(
        `Failed to record schema version ${version}: ${errorMessage}`,
        error instanceof Error ? error : undefined,
      );
    }
  }
}