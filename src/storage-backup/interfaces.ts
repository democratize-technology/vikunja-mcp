/**
 * Storage adapter interfaces for persistent filter storage
 * 
 * This module defines the abstraction layer for different storage backends,
 * allowing the FilterStorage implementation to work with multiple persistence
 * options while maintaining a consistent API.
 */

import type { SavedFilter } from '../types/filters';

/**
 * Session information for storage isolation
 */
export interface StorageSession {
  id: string;
  userId?: string;
  apiUrl?: string;
  createdAt: Date;
  lastAccessAt: Date;
}

/**
 * Storage adapter interface that all persistence backends must implement
 * 
 * This interface provides session-scoped CRUD operations for saved filters
 * with thread-safe guarantees. All implementations must handle concurrent
 * access and provide data consistency.
 */
export interface StorageAdapter {
  /**
   * Initialize the storage adapter for a specific session
   * @param session Session information for isolation
   * @throws Error if initialization fails
   */
  initialize(session: StorageSession): Promise<void>;

  /**
   * List all filters for the current session, sorted by updated date (newest first)
   * @returns Array of saved filters
   */
  list(): Promise<SavedFilter[]>;

  /**
   * Get a specific filter by ID
   * @param id Filter ID
   * @returns Filter if found, null otherwise
   */
  get(id: string): Promise<SavedFilter | null>;

  /**
   * Create a new filter
   * @param filter Filter data without ID, created, and updated fields
   * @returns Created filter with generated ID and timestamps
   */
  create(filter: Omit<SavedFilter, 'id' | 'created' | 'updated'>): Promise<SavedFilter>;

  /**
   * Update an existing filter
   * @param id Filter ID
   * @param filter Partial filter data to update
   * @returns Updated filter
   * @throws Error if filter not found
   */
  update(
    id: string,
    filter: Partial<Omit<SavedFilter, 'id' | 'created' | 'updated'>>,
  ): Promise<SavedFilter>;

  /**
   * Delete a filter
   * @param id Filter ID
   * @throws Error if filter not found
   */
  delete(id: string): Promise<void>;

  /**
   * Find a filter by name
   * @param name Filter name
   * @returns Filter if found, null otherwise
   */
  findByName(name: string): Promise<SavedFilter | null>;

  /**
   * Get filters for a specific project
   * @param projectId Project ID
   * @returns Array of filters for the project or global filters
   */
  getByProject(projectId: number): Promise<SavedFilter[]>;

  /**
   * Clear all filters for the current session
   */
  clear(): Promise<void>;

  /**
   * Get storage statistics
   * @returns Storage statistics
   */
  getStats(): Promise<{
    filterCount: number;
    sessionId: string;
    createdAt: Date;
    lastAccessAt: Date;
    storageType: string;
    additionalInfo?: Record<string, unknown>;
  }>;

  /**
   * Close the storage adapter and clean up resources
   */
  close(): Promise<void>;

  /**
   * Test if the storage adapter is healthy and operational
   * @returns Health check result
   */
  healthCheck(): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }>;
}

/**
 * Configuration options for storage adapters
 */
export interface StorageConfig {
  /** Storage type identifier */
  type: 'memory' | 'sqlite' | 'postgresql' | 'redis';
  /** Database file path for SQLite */
  databasePath?: string;
  /** Connection string for remote databases */
  connectionString?: string;
  /** Connection pool options */
  poolSize?: number;
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Additional adapter-specific options */
  options?: Record<string, unknown>;
}

/**
 * Storage migration interface for schema versioning
 */
export interface StorageMigration {
  /** Migration version number */
  version: number;
  /** Migration description */
  description: string;
  /** Migration SQL or operations */
  up: string | (() => Promise<void>);
  /** Rollback SQL or operations */
  down: string | (() => Promise<void>);
}

/**
 * Storage adapter factory interface
 */
export interface StorageAdapterFactory {
  /**
   * Create a storage adapter instance
   * @param config Storage configuration
   * @returns Storage adapter instance
   */
  createAdapter(config: StorageConfig): Promise<StorageAdapter>;

  /**
   * Get supported storage types
   * @returns Array of supported storage type identifiers
   */
  getSupportedTypes(): string[];

  /**
   * Validate storage configuration
   * @param config Storage configuration
   * @returns Validation result
   */
  validateConfig(config: StorageConfig): {
    valid: boolean;
    errors: string[];
  };
}

/**
 * Storage adapter error types
 */
export class StorageAdapterError extends Error {
  public readonly code: string;

  constructor(
    message: string,
    code: string,
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = 'StorageAdapterError';
    this.code = code;
  }
}

export class StorageInitializationError extends StorageAdapterError {
  constructor(message: string, cause?: Error) {
    super(message, 'STORAGE_INIT_ERROR', cause);
    this.name = 'StorageInitializationError';
  }
}

export class StorageConnectionError extends StorageAdapterError {
  constructor(message: string, cause?: Error) {
    super(message, 'STORAGE_CONNECTION_ERROR', cause);
    this.name = 'StorageConnectionError';
  }
}

export class StorageDataError extends StorageAdapterError {
  constructor(message: string, cause?: Error) {
    super(message, 'STORAGE_DATA_ERROR', cause);
    this.name = 'StorageDataError';
  }
}