/**
 * Interface for SQLite database connection management
 *
 * This interface defines the contract for managing SQLite database connections,
 * including initialization, configuration, health monitoring, and recovery.
 */

import Database from 'better-sqlite3';
import type { StorageSession } from '../../../interfaces';

/**
 * SQLite storage configuration options
 */
export interface SQLiteStorageConfig {
  databasePath: string;
  enableWAL?: boolean;
  enableForeignKeys?: boolean;
  timeout?: number;
  debug?: boolean;
}

/**
 * Connection health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  error?: string;
  details?: Record<string, unknown>;
  recoveryAttempted?: boolean;
  backupCreated?: boolean;
}

/**
 * Interface for managing SQLite database connections
 */
export interface ISQLiteConnectionManager {
  /**
   * Initialize a new database connection with the given session
   *
   * @param session - Storage session to associate with the connection
   * @throws {StorageInitializationError} When connection initialization fails
   */
  initialize(session: StorageSession): Promise<void>;

  /**
   * Get the current database connection
   *
   * @returns Database instance or null if not initialized
   */
  getConnection(): Database.Database | null;

  /**
   * Get the current session
   *
   * @returns Current session or null if not initialized
   */
  getSession(): StorageSession | null;

  /**
   * Get the configuration used for this connection manager
   *
   * @returns SQLite configuration object
   */
  getConfig(): SQLiteStorageConfig;

  /**
   * Perform health check on the database connection
   *
   * @returns Health check result with detailed status
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Attempt to recover the database connection
   *
   * @returns True if recovery was successful
   */
  reconnect(): Promise<boolean>;

  /**
   * Close the database connection and clean up resources
   */
  close(): Promise<void>;

  /**
   * Check if the connection is currently active and initialized
   *
   * @returns True if connected and initialized
   */
  isConnected(): boolean;
}