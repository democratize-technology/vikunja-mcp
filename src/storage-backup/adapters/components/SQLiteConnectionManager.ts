/**
 * SQLite Connection Manager
 *
 * Manages SQLite database connection lifecycle, including initialization,
 * configuration, health monitoring, and recovery mechanisms.
 */

import type Database from 'better-sqlite3';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';
import * as sqliteModule from 'better-sqlite3';
import { logger } from '../../../utils/logger';
import type { StorageSession } from '../../interfaces';
import {
  StorageInitializationError,
  StorageConnectionError,
} from '../../interfaces';
import type {
  ISQLiteConnectionManager,
  SQLiteStorageConfig,
  HealthCheckResult,
} from './interfaces/ISQLiteConnectionManager';

/**
 * Implementation of SQLite connection management
 */
export class SQLiteConnectionManager implements ISQLiteConnectionManager {
  private db: Database.Database | null = null;
  private session: StorageSession | null = null;
  private config: SQLiteStorageConfig;

  constructor(config: SQLiteStorageConfig) {
    this.config = {
      enableWAL: true,
      enableForeignKeys: true,
      timeout: 5000,
      debug: false,
      ...config,
    };
  }

  /**
   * Initialize a new database connection with the given session
   */
  async initialize(session: StorageSession): Promise<void> {
    try {
      this.session = session;

      // Ensure database directory exists
      const dbDir = dirname(this.config.databasePath);
      await mkdir(dbDir, { recursive: true });

      // Open database connection
      this.db = new sqliteModule.default(this.config.databasePath, {
        timeout: this.config.timeout,
        verbose: this.config.debug
          ? ((message?: unknown, ...args: unknown[]) => logger.debug(String(message), ...args))
          : undefined,
      });

      // Configure database
      this.configureDatabase();

      logger.debug(`SQLite connection initialized for session ${session.id}`, {
        databasePath: this.config.databasePath,
        sessionId: session.id,
      });

    } catch (error) {
      throw new StorageInitializationError(
        `Failed to initialize SQLite connection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get the current database connection
   */
  getConnection(): Database.Database | null {
    return this.db;
  }

  /**
   * Get the current session
   */
  getSession(): StorageSession | null {
    return this.session;
  }

  /**
   * Get the configuration used for this connection manager
   */
  getConfig(): SQLiteStorageConfig {
    return { ...this.config };
  }

  /**
   * Perform health check on the database connection
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      if (!this.db) {
        // Attempt to reconnect
        const reconnectSuccess = await this.reconnect();
        const result: HealthCheckResult = {
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

        // Mark recovery as attempted and successful
        return {
          healthy: true,
          details: {
            databasePath: this.config.databasePath,
            sessionId: this.session?.id,
            initialized: !!this.db,
            integrityStatus: 'ok',
          },
          recoveryAttempted: true,
        };
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
        logger.warn('Database integrity issues detected', {
          integrityCheck: integrityCheck.integrity_check,
          databasePath: this.config.databasePath,
        });

        return {
          healthy: false,
          error: 'Database integrity check failed',
          details: {
            databasePath: this.config.databasePath,
            sessionId: this.session?.id,
            integrityCheckResult: integrityCheck.integrity_check,
          },
        };
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
   * Attempt to recover the database connection
   */
  async reconnect(): Promise<boolean> {
    // Cannot reconnect without a session
    if (!this.session) {
      logger.warn('Cannot reconnect without an active session');
      // Clear connection on early return
      if (this.db) {
        try {
          this.db.close();
        } catch (error) {
          // Ignore close errors
        }
        this.db = null;
      }
      return false;
    }

    try {
      if (this.db) {
        this.db.close();
      }

      // Recreate database connection
      this.db = new sqliteModule.default(this.config.databasePath, {
        timeout: this.config.timeout,
        verbose: this.config.debug
          ? (message?: unknown, ...args: unknown[]) => logger.debug(String(message), ...args)
          : undefined,
      });

      // Reconfigure database
      this.configureDatabase();

      logger.info('Database reconnection successful');
      return true;
    } catch (error) {
      logger.error('Database reconnection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        databasePath: this.config.databasePath,
      });

      // Clear connection on failure
      this.db = null;
      return false;
    }
  }

  /**
   * Close the database connection and clean up resources
   */
  async close(): Promise<void> {
    try {
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      this.session = null;

      logger.debug('SQLite connection closed');
    } catch (error) {
      logger.warn('Error closing SQLite connection', error);
    }
  }

  /**
   * Check if the connection is currently active and initialized
   */
  isConnected(): boolean {
    return this.db !== null && this.session !== null;
  }

  /**
   * Configure database with optimal settings
   */
  private configureDatabase(): void {
    if (!this.db) {
      throw new StorageConnectionError('Database not available for configuration');
    }

    // Configure database
    if (this.config.enableWAL) {
      this.db.pragma('journal_mode = WAL');
    }

    // Configure foreign keys explicitly (ON or OFF)
    this.db.pragma(`foreign_keys = ${this.config.enableForeignKeys ? 'ON' : 'OFF'}`);

    // Optimize for performance
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 1000');
    this.db.pragma('temp_store = memory');
  }
}