/**
 * Database migration utilities for schema versioning
 * 
 * This module provides utilities for managing database schema migrations,
 * allowing safe upgrades and rollbacks of the storage schema while
 * preserving data integrity.
 */

import { logger } from '../utils/logger';
import type { StorageMigration } from './interfaces';

/**
 * Migration registry containing all available migrations
 * 
 * Migrations are executed in order based on version number.
 * Each migration must include both up and down operations.
 */
export const MIGRATIONS: StorageMigration[] = [
  {
    version: 1,
    description: 'Initial schema with saved filters table',
    up: `
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
    down: `
      DROP INDEX IF EXISTS idx_saved_filters_updated;
      DROP INDEX IF EXISTS idx_saved_filters_project;
      DROP INDEX IF EXISTS idx_saved_filters_session;
      DROP TABLE IF EXISTS saved_filters;
    `,
  },
  // Future migrations can be added here
  // {
  //   version: 2,
  //   description: 'Add full-text search support',
  //   up: `
  //     CREATE VIRTUAL TABLE IF NOT EXISTS saved_filters_fts 
  //     USING fts5(name, description, filter, content='saved_filters', content_rowid='rowid');
  //   `,
  //   down: `
  //     DROP TABLE IF EXISTS saved_filters_fts;
  //   `,
  // },
];

/**
 * Type definition for better-sqlite3 Database interface
 * This provides type safety for database operations
 */
interface BetterSqlite3Db {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  transaction<T>(fn: () => T): () => T;
}

/**
 * Migration runner for executing database schema migrations
 */
export class MigrationRunner {
  private db: BetterSqlite3Db; // Database connection (better-sqlite3 instance)

  constructor(db: BetterSqlite3Db) {
    this.db = db;
  }

  /**
   * Initialize migration tracking table
   */
  private initializeMigrationTable(): void {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          description TEXT,
          checksum TEXT
        );
      `);
    } catch (error) {
      throw new Error(`Failed to initialize migration table: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the current database schema version
   */
  getCurrentVersion(): number {
    try {
      this.initializeMigrationTable();

      const result = this.db.prepare(`
        SELECT MAX(version) as current_version
        FROM schema_version
      `).get() as { current_version?: number } | undefined;

      return result?.current_version || 0;
    } catch (error) {
      logger.error('Failed to get current schema version', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Get list of applied migrations
   */
  getAppliedMigrations(): Array<{
    version: number;
    description?: string;
    appliedAt: string;
    checksum?: string;
  }> {
    try {
      this.initializeMigrationTable();

      const rows = this.db.prepare(`
        SELECT version, description, applied_at, checksum
        FROM schema_version
        ORDER BY version
      `).all() as Array<{
        version: number;
        description?: string;
        applied_at: string;
        checksum?: string;
      }>;

      return rows.map(row => {
        const result: {
          version: number;
          description?: string;
          appliedAt: string;
          checksum?: string;
        } = {
          version: row.version,
          appliedAt: row.applied_at,
        };

        if (row.description !== undefined) {
          result.description = row.description;
        }

        if (row.checksum !== undefined) {
          result.checksum = row.checksum;
        }

        return result;
      });
    } catch (error) {
      logger.error('Failed to get applied migrations', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Generate checksum for migration content
   */
  private generateChecksum(migration: StorageMigration): string {
    const content = `${migration.version}-${migration.description}-${migration.up}-${migration.down}`;
    // Simple hash function (for production, consider using crypto.createHash)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Execute a single migration
   */
  private async executeMigration(migration: StorageMigration, direction: 'up' | 'down'): Promise<void> {
    const sql = direction === 'up' ? migration.up : migration.down;
    
    try {
      if (typeof sql === 'string') {
        // Execute SQL migration
        this.db.exec(sql);
      } else {
        // Execute function migration
        await sql();
      }
      
      logger.debug(`Migration ${migration.version} executed successfully (${direction})`, {
        version: migration.version,
        description: migration.description,
        direction,
      });
    } catch (error) {
      throw new Error(
        `Failed to execute migration ${migration.version} (${direction}): ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Record migration in schema_version table
   */
  private recordMigration(migration: StorageMigration): void {
    try {
      const checksum = this.generateChecksum(migration);
      
      this.db.prepare(`
        INSERT INTO schema_version (version, description, checksum) 
        VALUES (?, ?, ?)
      `).run(migration.version, migration.description, checksum);
    } catch (error) {
      throw new Error(
        `Failed to record migration ${migration.version}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Remove migration record from schema_version table
   */
  private removeMigrationRecord(version: number): void {
    try {
      this.db.prepare(`
        DELETE FROM schema_version 
        WHERE version = ?
      `).run(version);
    } catch (error) {
      throw new Error(
        `Failed to remove migration record ${version}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Migrate database to latest version
   */
  async migrateToLatest(): Promise<void> {
    const currentVersion = this.getCurrentVersion();
    const targetVersion = Math.max(...MIGRATIONS.map(m => m.version));
    
    if (currentVersion >= targetVersion) {
      logger.debug('Database is already at latest version', {
        currentVersion,
        targetVersion,
      });
      return;
    }

    logger.info('Starting database migration', {
      currentVersion,
      targetVersion,
    });

    await this.migrateTo(targetVersion);
  }

  /**
   * Migrate database to specific version
   */
  async migrateTo(targetVersion: number): Promise<void> {
    const currentVersion = this.getCurrentVersion();
    
    if (currentVersion === targetVersion) {
      logger.debug('Database is already at target version', {
        currentVersion,
        targetVersion,
      });
      return;
    }

    const isUpgrade = targetVersion > currentVersion;
    const migrationsToRun = MIGRATIONS
      .filter(m => isUpgrade ? 
        (m.version > currentVersion && m.version <= targetVersion) :
        (m.version <= currentVersion && m.version > targetVersion)
      )
      .sort((a, b) => isUpgrade ? a.version - b.version : b.version - a.version);

    if (migrationsToRun.length === 0) {
      logger.warn('No migrations found for version range', {
        currentVersion,
        targetVersion,
      });
      return;
    }

    // Execute migrations in transaction
    const transaction = this.db.transaction(() => {
      for (const migration of migrationsToRun) {
        if (isUpgrade) {
          this.executeMigration(migration, 'up');
          this.recordMigration(migration);
        } else {
          this.executeMigration(migration, 'down');
          this.removeMigrationRecord(migration.version);
        }
      }
    });

    try {
      transaction();
      
      logger.info('Database migration completed successfully', {
        fromVersion: currentVersion,
        toVersion: targetVersion,
        migrationsRun: migrationsToRun.length,
      });
    } catch (error) {
      logger.error('Database migration failed', {
        fromVersion: currentVersion,
        toVersion: targetVersion,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Rollback to previous version
   */
  async rollbackToPrevious(): Promise<void> {
    const currentVersion = this.getCurrentVersion();

    if (currentVersion <= 0) {
      throw new Error('Cannot rollback: database is at initial version');
    }

    const appliedMigrations = this.getAppliedMigrations()
      .sort((a, b) => b.version - a.version);

    if (appliedMigrations.length < 2) {
      throw new Error('Cannot rollback: no previous version found');
    }

    const previousMigration = appliedMigrations[1];
    if (previousMigration === undefined) {
      throw new Error('Cannot rollback: no previous version found');
    }

    const targetVersion = previousMigration.version;
    await this.migrateTo(targetVersion);
  }

  /**
   * Validate migration integrity
   */
  validateMigrations(): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    // Check for duplicate version numbers
    const versions = MIGRATIONS.map(m => m.version);
    const uniqueVersions = new Set(versions);
    if (versions.length !== uniqueVersions.size) {
      errors.push('Duplicate migration version numbers found');
    }

    // Check for gaps in version sequence
    const sortedVersions = [...uniqueVersions].sort((a, b) => a - b);
    for (let i = 1; i < sortedVersions.length; i++) {
      const currentVersion = sortedVersions[i];
      const previousVersion = sortedVersions[i - 1];

      if (currentVersion !== undefined && previousVersion !== undefined) {
        if (currentVersion !== previousVersion + 1) {
          errors.push(`Gap in migration versions: missing version ${previousVersion + 1}`);
        }
      }
    }

    // Check for missing migration properties
    for (const migration of MIGRATIONS) {
      if (!migration.version || migration.version < 1) {
        errors.push(`Invalid version number: ${migration.version}`);
      }
      
      if (!migration.description) {
        errors.push(`Missing description for migration ${migration.version}`);
      }
      
      if (!migration.up) {
        errors.push(`Missing up migration for version ${migration.version}`);
      }
      
      if (!migration.down) {
        errors.push(`Missing down migration for version ${migration.version}`);
      }
    }

    // Validate applied migrations against registry
    try {
      const appliedMigrations = this.getAppliedMigrations();
      
      for (const applied of appliedMigrations) {
        const registryMigration = MIGRATIONS.find(m => m.version === applied.version);
        
        if (!registryMigration) {
          errors.push(`Applied migration ${applied.version} not found in registry`);
          continue;
        }
        
        const expectedChecksum = this.generateChecksum(registryMigration);
        if (applied.checksum && applied.checksum !== expectedChecksum) {
          errors.push(`Checksum mismatch for migration ${applied.version}: migration may have been modified after application`);
        }
      }
    } catch (error) {
      errors.push(`Failed to validate applied migrations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get migration status information
   */
  getStatus(): {
    currentVersion: number;
    latestVersion: number;
    pendingMigrations: StorageMigration[];
    appliedMigrations: Array<{
      version: number;
      description?: string;
      appliedAt: string;
      checksum?: string;
    }>;
    isUpToDate: boolean;
  } {
    const currentVersion = this.getCurrentVersion();
    const latestVersion = Math.max(...MIGRATIONS.map(m => m.version), 0);
    const appliedMigrations = this.getAppliedMigrations();
    const pendingMigrations = MIGRATIONS.filter(m => m.version > currentVersion);

    return {
      currentVersion,
      latestVersion,
      pendingMigrations,
      appliedMigrations,
      isUpToDate: currentVersion >= latestVersion,
    };
  }
}