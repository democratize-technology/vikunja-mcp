/**
 * SQLite storage adapter for persistent filter storage (Refactored)
 *
 * This adapter provides persistent storage using SQLite database with:
 * - Session-scoped data isolation
 * - Thread-safe operations with WAL mode
 * - Automatic schema migrations
 * - Connection pooling and health monitoring
 * - Graceful error handling with detailed logging
 *
 * Refactored from God module to use dependency injection with focused components.
 */

import { v4 as uuidv4 } from 'uuid';
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
import { safeJsonStringify } from '../../utils/validation';

// Extracted components
import { SQLiteConnectionManager, type ISQLiteConnectionManager } from './components/SQLiteConnectionManager';
import { SQLiteSchemaManager, type ISQLiteSchemaManager } from './components/SQLiteSchemaManager';
import { SQLiteDataAccess, type ISQLiteDataAccess } from './components/SQLiteDataAccess';
import { SQLiteDataMapper, type FilterRow } from './components/SQLiteDataMapper';


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
 * SQLite storage adapter implementation (Refactored)
 *
 * Features:
 * - Session isolation using session_id column
 * - WAL mode for better concurrency
 * - Prepared statements for performance
 * - Automatic schema migration
 * - Connection health monitoring
 *
 * Refactored to use dependency injection with focused components.
 */
export class SQLiteStorageAdapter implements StorageAdapter {
  private session: StorageSession | null = null;
  private config: SQLiteStorageConfig;

  // Dependency-injected components
  private connectionManager: ISQLiteConnectionManager;
  private schemaManager: ISQLiteSchemaManager;
  private dataAccess: ISQLiteDataAccess;

  constructor(
    config: SQLiteStorageConfig,
    components?: {
      connectionManager?: ISQLiteConnectionManager;
      schemaManager?: ISQLiteSchemaManager;
      dataAccess?: ISQLiteDataAccess;
    }
  ) {
    this.config = {
      enableWAL: true,
      enableForeignKeys: true,
      timeout: 5000,
      debug: false,
      ...config,
    };

    // Dependency injection with defaults
    this.connectionManager = components?.connectionManager || new SQLiteConnectionManager(this.config);
    this.schemaManager = components?.schemaManager || new SQLiteSchemaManager();
    this.dataAccess = components?.dataAccess || new SQLiteDataAccess();
  }

  async initialize(session: StorageSession): Promise<void> {
    try {
      this.session = session;

      // Initialize connection manager
      await this.connectionManager.initialize(session);

      // Initialize schema
      const db = this.connectionManager.getConnection();
      await this.schemaManager.initializeSchema(db);

      // Initialize data access with connection and prepared statements
      this.dataAccess.prepareStatements(db);

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

  
  async list(): Promise<SavedFilter[]> {
    this.ensureInitialized();

    try {
      const rows = this.dataAccess.listFilters(this.session!.id);
      return rows;
    } catch (error) {
      throw new StorageDataError(
        `Failed to list filters: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async get(id: string): Promise<SavedFilter | null> {
    this.ensureInitialized();

    try {
      return this.dataAccess.getFilter(this.session!.id, id);
    } catch (error) {
      throw new StorageDataError(
        `Failed to get filter ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async create(filter: Omit<SavedFilter, 'id' | 'created' | 'updated'>): Promise<SavedFilter> {
    this.ensureInitialized();

    try {
      const now = new Date();
      const savedFilter: SavedFilter = {
        ...filter,
        id: uuidv4(),
        created: now,
        updated: now,
      };

      this.dataAccess.createFilter({
        id: savedFilter.id,
        sessionId: this.session!.id,
        name: savedFilter.name,
        description: savedFilter.description || null,
        filter: savedFilter.filter,
        expression: savedFilter.expression ? JSON.stringify(savedFilter.expression) : null,
        projectId: savedFilter.projectId || null,
        isGlobal: savedFilter.isGlobal ? 1 : 0,
        created: savedFilter.created.toISOString(),
        updated: savedFilter.updated.toISOString(),
      });

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

      const changes = this.dataAccess.updateFilter({
        name: updated.name,
        description: updated.description || null,
        filter: updated.filter,
        expression: updated.expression ? JSON.stringify(updated.expression) : null,
        projectId: updated.projectId || null,
        isGlobal: updated.isGlobal ? 1 : 0,
        updated: updated.updated.toISOString(),
        sessionId: this.session!.id,
        id: id,
      });

      if (changes === 0) {
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

    try {
      const changes = this.dataAccess.deleteFilter(this.session!.id, id);
      if (changes === 0) {
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

    try {
      return this.dataAccess.findFilterByName(this.session!.id, name);
    } catch (error) {
      throw new StorageDataError(
        `Failed to find filter by name "${name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async getByProject(projectId: number): Promise<SavedFilter[]> {
    this.ensureInitialized();

    try {
      return this.dataAccess.getFiltersByProject(this.session!.id, projectId);
    } catch (error) {
      throw new StorageDataError(
        `Failed to get filters for project ${projectId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async clear(): Promise<void> {
    this.ensureInitialized();

    try {
      this.dataAccess.clearFilters(this.session!.id);
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

    if (!this.session) {
      throw new StorageConnectionError('Storage session not initialized');
    }

    try {
      const filterCount = this.dataAccess.getFilterCount(this.session!.id);

      return {
        filterCount,
        sessionId: this.session.id,
        createdAt: this.session.createdAt,
        lastAccessAt: this.session.lastAccessAt,
        storageType: 'sqlite',
        additionalInfo: {
          databasePath: this.config.databasePath,
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
      await this.connectionManager.close();
      this.session = null;

      logger.debug('SQLite storage adapter closed');
    } catch (error) {
      logger.warn('Error closing SQLite storage adapter', error);
    }
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }> {
    try {
      const healthResult = await this.connectionManager.healthCheck();

      // Extract the healthy boolean from the result object
      const isHealthy = typeof healthResult === 'boolean'
        ? healthResult
        : healthResult.healthy;

      return {
        healthy: isHealthy,
        details: {
          databasePath: this.config.databasePath,
          sessionId: this.session?.id,
          initialized: this.session !== null,
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
   * Ensure the adapter is properly initialized
   */
  private ensureInitialized(): void {
    if (!this.session) {
      throw new StorageConnectionError('Storage adapter not initialized');
    }
  }
}