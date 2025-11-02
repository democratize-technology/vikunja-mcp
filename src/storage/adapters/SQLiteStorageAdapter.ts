/**
 * SQLite storage adapter for persistent filter storage
 * 
 * This adapter provides persistent storage using SQLite database with:
 * - Session-scoped data isolation
 * - Thread-safe operations with WAL mode
 * - Automatic schema migrations
 * - Connection pooling and health monitoring
 * - Graceful error handling with detailed logging
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';
import { logger } from '../../utils/logger';
import type { SavedFilter } from '../../types/filters';
import type {
  StorageAdapter,
  StorageSession} from '../interfaces';
import {
  StorageInitializationError,
  StorageConnectionError,
  StorageDataError,
} from '../interfaces';

/**
 * Database schema definition for saved filters
 */
interface FilterRow {
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
 * SQLite-specific storage configuration
 */
export interface SQLiteStorageConfig {
  databasePath: string;
  enableWAL?: boolean;
  enableForeignKeys?: boolean;
  timeout?: number;
  debug?: boolean;
}

/**
 * SQLite storage adapter implementation
 * 
 * Features:
 * - Session isolation using session_id column
 * - WAL mode for better concurrency
 * - Prepared statements for performance
 * - Automatic schema migration
 * - Connection health monitoring
 */
export class SQLiteStorageAdapter implements StorageAdapter {
  private db: Database.Database | null = null;
  private session: StorageSession | null = null;
  private config: SQLiteStorageConfig;

  // Prepared statements for performance
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

  constructor(config: SQLiteStorageConfig) {
    this.config = {
      enableWAL: true,
      enableForeignKeys: true,
      timeout: 5000,
      debug: false,
      ...config,
    };
  }

  async initialize(session: StorageSession): Promise<void> {
    try {
      this.session = session;

      // Ensure database directory exists
      const dbDir = dirname(this.config.databasePath);
      await mkdir(dbDir, { recursive: true });

      // Open database connection
      this.db = new Database(this.config.databasePath, {
        timeout: this.config.timeout,
        verbose: this.config.debug ? ((message?: unknown, ...args: unknown[]) => logger.debug(String(message), ...args)) : undefined,
      });

      // Configure database
      if (this.config.enableWAL) {
        this.db.pragma('journal_mode = WAL');
      }
      
      if (this.config.enableForeignKeys) {
        this.db.pragma('foreign_keys = ON');
      }

      // Optimize for performance
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 1000');
      this.db.pragma('temp_store = memory');

      // Initialize schema
      await this.initializeSchema();
      
      // Prepare statements
      this.prepareStatements();

      logger.debug(`SQLite storage adapter initialized for session ${session.id}`, {
        databasePath: this.config.databasePath,
        sessionId: session.id,
      });

    } catch (error) {
      throw new StorageInitializationError(
        `Failed to initialize SQLite storage: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Initialize database schema with migrations
   */
  private async initializeSchema(): Promise<void> {
    if (!this.db) {
      throw new StorageInitializationError('Database not initialized');
    }

    try {
      // Create schema version table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          description TEXT
        );
      `);

      // Create filters table
      this.db.exec(`
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
      `);

      // Create indexes for performance
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_saved_filters_session 
        ON saved_filters(session_id);
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_saved_filters_project 
        ON saved_filters(session_id, project_id);
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_saved_filters_updated 
        ON saved_filters(session_id, updated DESC);
      `);

      // Record schema version
      const currentVersion = 1;
      const versionRow = this.db.prepare('SELECT version FROM schema_version WHERE version = ?').get(currentVersion);
      
      if (!versionRow) {
        this.db.prepare(`
          INSERT INTO schema_version (version, description) 
          VALUES (?, ?)
        `).run(currentVersion, 'Initial schema with saved filters');
      }

    } catch (error) {
      throw new StorageInitializationError(
        `Failed to initialize database schema: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Prepare SQL statements for better performance
   */
  private prepareStatements(): void {
    if (!this.db) {
      throw new StorageInitializationError('Database not initialized');
    }

    try {
      this.statements.list = this.db.prepare(`
        SELECT * FROM saved_filters 
        WHERE session_id = ? 
        ORDER BY updated DESC
      `);

      this.statements.get = this.db.prepare(`
        SELECT * FROM saved_filters 
        WHERE session_id = ? AND id = ?
      `);

      this.statements.create = this.db.prepare(`
        INSERT INTO saved_filters (
          id, session_id, name, description, filter, expression, 
          project_id, is_global, created, updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      this.statements.update = this.db.prepare(`
        UPDATE saved_filters 
        SET name = ?, description = ?, filter = ?, expression = ?, 
            project_id = ?, is_global = ?, updated = ?
        WHERE session_id = ? AND id = ?
      `);

      this.statements.delete = this.db.prepare(`
        DELETE FROM saved_filters 
        WHERE session_id = ? AND id = ?
      `);

      this.statements.findByName = this.db.prepare(`
        SELECT * FROM saved_filters 
        WHERE session_id = ? AND name = ?
      `);

      this.statements.getByProject = this.db.prepare(`
        SELECT * FROM saved_filters 
        WHERE session_id = ? AND (project_id = ? OR is_global = 1)
        ORDER BY updated DESC
      `);

      this.statements.clear = this.db.prepare(`
        DELETE FROM saved_filters 
        WHERE session_id = ?
      `);

      this.statements.getStats = this.db.prepare(`
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

  async list(): Promise<SavedFilter[]> {
    this.ensureInitialized();

    if (!this.statements.list) {
      throw new StorageConnectionError('Prepared statement for list operation not initialized');
    }

    if (!this.session) {
      throw new StorageConnectionError('Storage session not initialized');
    }

    try {
      const rows = this.statements.list.all(this.session.id) as FilterRow[];
      return rows.map(this.rowToFilter);
    } catch (error) {
      throw new StorageDataError(
        `Failed to list filters: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async get(id: string): Promise<SavedFilter | null> {
    this.ensureInitialized();

    if (!this.statements.get) {
      throw new StorageConnectionError('Prepared statement for get operation not initialized');
    }

    if (!this.session) {
      throw new StorageConnectionError('Storage session not initialized');
    }

    try {
      const row = this.statements.get.get(this.session.id, id) as FilterRow | undefined;
      return row ? this.rowToFilter(row) : null;
    } catch (error) {
      throw new StorageDataError(
        `Failed to get filter ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async create(filter: Omit<SavedFilter, 'id' | 'created' | 'updated'>): Promise<SavedFilter> {
    this.ensureInitialized();

    if (!this.statements.create) {
      throw new StorageConnectionError('Prepared statement for create operation not initialized');
    }

    if (!this.session) {
      throw new StorageConnectionError('Storage session not initialized');
    }

    try {
      const now = new Date();
      const savedFilter: SavedFilter = {
        ...filter,
        id: uuidv4(),
        created: now,
        updated: now,
      };

      this.statements.create.run(
        savedFilter.id,
        this.session.id,
        savedFilter.name,
        savedFilter.description || null,
        savedFilter.filter,
        savedFilter.expression ? JSON.stringify(savedFilter.expression) : null,
        savedFilter.projectId || null,
        savedFilter.isGlobal ? 1 : 0,
        savedFilter.created.toISOString(),
        savedFilter.updated.toISOString(),
      );

      return savedFilter;
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new StorageDataError(
          `Filter with name "${filter.name}" already exists in this session`,
          error,
        );
      }

      throw new StorageDataError(
        `Failed to create filter: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async update(
    id: string,
    filter: Partial<Omit<SavedFilter, 'id' | 'created' | 'updated'>>,
  ): Promise<SavedFilter> {
    this.ensureInitialized();
    
    try {
      // Get existing filter
      const existing = await this.get(id);
      if (!existing) {
        throw new StorageDataError(`Filter with id ${id} not found`);
      }

      // Merge updates - ensure updated timestamp is always later than created
      let updatedTime = new Date();
      if (updatedTime.getTime() <= existing.updated.getTime()) {
        updatedTime = new Date(existing.updated.getTime() + 1);
      }

      const updated: SavedFilter = {
        ...existing,
        ...filter,
        updated: updatedTime,
      };

      // Update in database
      if (!this.statements.update) {
        throw new StorageConnectionError('Prepared statement for update operation not initialized');
      }

      if (!this.session) {
        throw new StorageConnectionError('Storage session not initialized');
      }

      const result = this.statements.update.run(
        updated.name,
        updated.description || null,
        updated.filter,
        updated.expression ? JSON.stringify(updated.expression) : null,
        updated.projectId || null,
        updated.isGlobal ? 1 : 0,
        updated.updated.toISOString(),
        this.session.id,
        id,
      );

      if (result.changes === 0) {
        throw new StorageDataError(`Filter with id ${id} not found`);
      }

      return updated;
    } catch (error) {
      if (error instanceof StorageDataError) {
        throw error;
      }
      
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new StorageDataError(
          `Filter with name "${filter.name}" already exists in this session`,
          error,
        );
      }
      
      throw new StorageDataError(
        `Failed to update filter ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async delete(id: string): Promise<void> {
    this.ensureInitialized();

    if (!this.statements.delete) {
      throw new StorageConnectionError('Prepared statement for delete operation not initialized');
    }

    if (!this.session) {
      throw new StorageConnectionError('Storage session not initialized');
    }

    try {
      const result = this.statements.delete.run(this.session.id, id);

      if (result.changes === 0) {
        throw new StorageDataError(`Filter with id ${id} not found`);
      }
    } catch (error) {
      if (error instanceof StorageDataError) {
        throw error;
      }

      throw new StorageDataError(
        `Failed to delete filter ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async findByName(name: string): Promise<SavedFilter | null> {
    this.ensureInitialized();

    if (!this.statements.findByName) {
      throw new StorageConnectionError('Prepared statement for findByName operation not initialized');
    }

    if (!this.session) {
      throw new StorageConnectionError('Storage session not initialized');
    }

    try {
      const row = this.statements.findByName.get(this.session.id, name) as FilterRow | undefined;
      return row ? this.rowToFilter(row) : null;
    } catch (error) {
      throw new StorageDataError(
        `Failed to find filter by name "${name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async getByProject(projectId: number): Promise<SavedFilter[]> {
    this.ensureInitialized();

    if (!this.statements.getByProject) {
      throw new StorageConnectionError('Prepared statement for getByProject operation not initialized');
    }

    if (!this.session) {
      throw new StorageConnectionError('Storage session not initialized');
    }

    try {
      const rows = this.statements.getByProject.all(this.session.id, projectId) as FilterRow[];
      return rows.map(this.rowToFilter);
    } catch (error) {
      throw new StorageDataError(
        `Failed to get filters for project ${projectId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async clear(): Promise<void> {
    this.ensureInitialized();

    if (!this.statements.clear) {
      throw new StorageConnectionError('Prepared statement for clear operation not initialized');
    }

    if (!this.session) {
      throw new StorageConnectionError('Storage session not initialized');
    }

    try {
      this.statements.clear.run(this.session.id);
    } catch (error) {
      throw new StorageDataError(
        `Failed to clear filters: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async getStats(): Promise<{
    filterCount: number;
    sessionId: string;
    createdAt: Date;
    lastAccessAt: Date;
    storageType: string;
    additionalInfo?: Record<string, unknown>;
  }> {
    this.ensureInitialized();

    if (!this.statements.getStats) {
      throw new StorageConnectionError('Prepared statement for getStats operation not initialized');
    }

    if (!this.session) {
      throw new StorageConnectionError('Storage session not initialized');
    }

    if (!this.db) {
      throw new StorageConnectionError('Database connection not initialized');
    }

    try {
      const result = this.statements.getStats.get(this.session.id) as { filter_count: number };

      // Get database file stats
      const dbStats = this.db.prepare("PRAGMA page_count").get() as { page_count: number };
      const dbPageSize = this.db.prepare("PRAGMA page_size").get() as { page_size: number };
      const dbSize = dbStats.page_count * dbPageSize.page_size;

      return {
        filterCount: result.filter_count,
        sessionId: this.session.id,
        createdAt: this.session.createdAt,
        lastAccessAt: this.session.lastAccessAt,
        storageType: 'sqlite',
        additionalInfo: {
          databasePath: this.config.databasePath,
          databaseSizeBytes: dbSize,
          walMode: this.config.enableWAL,
        },
      };
    } catch (error) {
      throw new StorageDataError(
        `Failed to get storage stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async close(): Promise<void> {
    try {
      if (this.db) {
        this.db.close();
        this.db = null;
      }
      
      // Clear prepared statements
      this.statements = {};
      this.session = null;
      
      logger.debug('SQLite storage adapter closed');
    } catch (error) {
      logger.warn('Error closing SQLite storage adapter', error);
    }
  }

  /**
   * Auto-recovery mechanism for database corruption or connection issues
   */
  private async attemptRecovery(): Promise<boolean> {
    if (!this.db) {
      return false;
    }

    try {
      // Try to run PRAGMA integrity_check
      const integrityCheck = this.db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      
      if (integrityCheck.integrity_check !== 'ok') {
        logger.warn('Database integrity check failed', {
          result: integrityCheck.integrity_check,
          databasePath: this.config.databasePath,
        });

        // Attempt to run auto-recovery
        this.db.exec('PRAGMA auto_vacuum = FULL');
        this.db.exec('VACUUM');
        
        // Re-check integrity
        const secondCheck = this.db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
        
        if (secondCheck.integrity_check === 'ok') {
          logger.info('Database auto-recovery successful');
          return true;
        } else {
          logger.error('Database auto-recovery failed, corruption may be permanent');
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Database recovery attempt failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        databasePath: this.config.databasePath,
      });
      return false;
    }
  }

  /**
   * Backup database to a timestamped file
   */
  private async createBackup(): Promise<string | null> {
    if (!this.db) {
      return null;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${this.config.databasePath}.backup.${timestamp}`;

      // Simple file-based backup using SQLite VACUUM INTO
      this.db.exec(`VACUUM INTO '${backupPath}'`);

      logger.info('Database backup created successfully', {
        backupPath,
        databasePath: this.config.databasePath,
      });

      return backupPath;
    } catch (error) {
      logger.error('Failed to create database backup', {
        error: error instanceof Error ? error.message : 'Unknown error',
        databasePath: this.config.databasePath,
      });
      return null;
    }
  }

  /**
   * Connection recovery mechanism
   */
  private async reconnect(): Promise<boolean> {
    try {
      if (this.db) {
        this.db.close();
      }

      // Recreate database connection
      this.db = new Database(this.config.databasePath, {
        timeout: this.config.timeout,
        verbose: this.config.debug ? (message?: unknown, ...args: unknown[]) => logger.debug(String(message), ...args) : undefined,
      });

      // Reconfigure database
      if (this.config.enableWAL) {
        this.db.pragma('journal_mode = WAL');
      }
      
      if (this.config.enableForeignKeys) {
        this.db.pragma('foreign_keys = ON');
      }

      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 1000');
      this.db.pragma('temp_store = memory');

      // Re-prepare statements
      this.prepareStatements();

      logger.info('Database reconnection successful');
      return true;
    } catch (error) {
      logger.error('Database reconnection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        databasePath: this.config.databasePath,
      });
      return false;
    }
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
    recoveryAttempted?: boolean;
    backupCreated?: boolean;
  }> {
    try {
      if (!this.db) {
        // Attempt to reconnect
        const reconnectSuccess = await this.reconnect();
        const result: {
          healthy: boolean;
          error?: string;
          details?: Record<string, unknown>;
          recoveryAttempted?: boolean;
        } = {
          healthy: reconnectSuccess,
          details: {
            databasePath: this.config.databasePath,
            sessionId: this.session?.id,
            initialized: !!this.db,
          },
          recoveryAttempted: true,
        };

        if (!reconnectSuccess) {
          result.error = 'Database not initialized and reconnection failed';
        }

        return result;
      }

      // Test basic database connection
      let result: { test: number };
      try {
        result = this.db.prepare('SELECT 1 as test').get() as { test: number };
      } catch (connectionError) {
        logger.warn('Database connection test failed, attempting reconnection', {
          error: connectionError instanceof Error ? connectionError.message : 'Unknown error',
        });

        const reconnectSuccess = await this.reconnect();
        if (!reconnectSuccess) {
          return {
            healthy: false,
            error: 'Database connection failed and reconnection unsuccessful',
            details: {
              databasePath: this.config.databasePath,
              sessionId: this.session?.id,
            },
            recoveryAttempted: true,
          };
        }

        // Try query again after reconnection
        result = this.db.prepare('SELECT 1 as test').get() as { test: number };
      }
      
      if (result.test !== 1) {
        return {
          healthy: false,
          error: 'Database query returned unexpected result',
        };
      }

      // Test integrity
      let integrityCheck: { integrity_check: string };
      try {
        integrityCheck = this.db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      } catch (integrityError) {
        logger.error('Failed to check database integrity', {
          error: integrityError instanceof Error ? integrityError.message : 'Unknown error',
        });
        
        return {
          healthy: false,
          error: 'Unable to check database integrity',
          details: {
            databasePath: this.config.databasePath,
            sessionId: this.session?.id,
          },
        };
      }
      
      if (integrityCheck.integrity_check !== 'ok') {
        logger.warn('Database integrity issues detected, attempting recovery');
        
        // Create backup before recovery attempt
        const backupPath = await this.createBackup();
        const recoverySuccessful = await this.attemptRecovery();
        
        const result: {
            healthy: boolean;
            error?: string;
            details?: Record<string, unknown>;
            recoveryAttempted?: boolean;
            backupCreated?: boolean;
          } = {
            healthy: recoverySuccessful,
            details: {
              databasePath: this.config.databasePath,
              sessionId: this.session?.id,
              initialized: !!this.db,
              integrityCheckResult: integrityCheck.integrity_check,
            },
            recoveryAttempted: true,
            backupCreated: !!backupPath,
          };

          if (!recoverySuccessful) {
            result.error = 'Database corruption detected and recovery failed';
          }

          if (backupPath !== undefined) {
            result.details!.backupPath = backupPath;
          }

          return result;
      }

      // Check if session table exists and is accessible
      if (this.session) {
        try {
          await this.getStats();
        } catch (statsError) {
          logger.warn('Failed to get storage stats during health check', {
            error: statsError instanceof Error ? statsError.message : 'Unknown error',
          });
          
          return {
            healthy: false,
            error: 'Database tables are not accessible',
            details: {
              databasePath: this.config.databasePath,
              sessionId: this.session?.id,
            },
          };
        }
      }

      return {
        healthy: true,
        details: {
          databasePath: this.config.databasePath,
          sessionId: this.session?.id,
          initialized: !!this.db,
          integrityStatus: 'ok',
        },
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          databasePath: this.config.databasePath,
          sessionId: this.session?.id,
        },
      };
    }
  }

  /**
   * Convert database row to SavedFilter object
   */
  private rowToFilter(row: FilterRow): SavedFilter {
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
      result.expression = JSON.parse(row.expression);
    }

    if (row.project_id !== null) {
      result.projectId = row.project_id;
    }

    return result;
  }

  /**
   * Ensure the adapter is properly initialized
   */
  private ensureInitialized(): void {
    if (!this.db || !this.session) {
      throw new StorageConnectionError('Storage adapter not initialized');
    }
  }
}