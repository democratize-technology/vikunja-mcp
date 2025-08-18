/**
 * Storage adapter factory for creating appropriate storage backends
 * 
 * This module provides a factory pattern for creating storage adapters
 * based on configuration, with graceful fallback to in-memory storage
 * if the requested backend fails to initialize.
 */

import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { logger } from '../../utils/logger';
import type { StorageAdapter, StorageAdapterFactory, StorageConfig } from '../interfaces';
import { SQLiteStorageAdapter } from './SQLiteStorageAdapter';
import { InMemoryStorageAdapter } from './InMemoryStorageAdapter';

/**
 * Storage adapter factory implementation
 */
export class DefaultStorageAdapterFactory implements StorageAdapterFactory {
  async createAdapter(config: StorageConfig): Promise<StorageAdapter> {
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      logger.error('Invalid storage configuration, falling back to memory storage', {
        errors: validation.errors,
        requestedType: config.type,
      });
      return new InMemoryStorageAdapter();
    }

    try {
      switch (config.type) {
        case 'sqlite':
          return await this.createSQLiteAdapter(config);
        
        case 'memory':
          return new InMemoryStorageAdapter();
        
        case 'postgresql':
        case 'redis':
          logger.warn(`Storage type ${config.type} not yet implemented, falling back to memory storage`);
          return new InMemoryStorageAdapter();
        
        default:
          logger.warn(`Unknown storage type ${config.type}, falling back to memory storage`);
          return new InMemoryStorageAdapter();
      }
    } catch (error) {
      logger.error('Failed to create storage adapter, falling back to memory storage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestedType: config.type,
      });
      return new InMemoryStorageAdapter();
    }
  }

  getSupportedTypes(): string[] {
    return ['memory', 'sqlite']; // TODO: Add 'postgresql', 'redis' when implemented
  }

  validateConfig(config: StorageConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate storage type
    const supportedTypes = this.getSupportedTypes();
    if (!supportedTypes.includes(config.type)) {
      errors.push(`Unsupported storage type: ${config.type}. Supported types: ${supportedTypes.join(', ')}`);
    }

    // Validate type-specific configuration
    switch (config.type) {
      case 'sqlite':
        if (!config.databasePath) {
          errors.push('Database path is required for SQLite storage');
        }
        break;

      case 'postgresql':
      case 'redis':
        if (!config.connectionString) {
          errors.push(`Connection string is required for ${config.type} storage`);
        }
        break;
    }

    // Validate numeric values
    if (config.timeout !== undefined && (config.timeout < 1000 || config.timeout > 60000)) {
      errors.push('Timeout must be between 1000 and 60000 milliseconds');
    }

    if (config.poolSize !== undefined && (config.poolSize < 1 || config.poolSize > 100)) {
      errors.push('Pool size must be between 1 and 100');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create SQLite storage adapter with proper initialization
   */
  private async createSQLiteAdapter(config: StorageConfig): Promise<StorageAdapter> {
    if (!config.databasePath) {
      throw new Error('Database path is required for SQLite storage');
    }

    try {
      // Ensure database directory exists
      const dbDir = dirname(config.databasePath);
      await mkdir(dbDir, { recursive: true });

      // Create adapter with configuration
      const adapter = new SQLiteStorageAdapter({
        databasePath: config.databasePath,
        enableWAL: config.options?.enableWAL !== false, // Default to true
        enableForeignKeys: config.options?.enableForeignKeys !== false, // Default to true
        timeout: config.timeout || 5000,
        debug: config.debug || false,
      });

      logger.info('Created SQLite storage adapter', {
        databasePath: config.databasePath,
        enableWAL: config.options?.enableWAL !== false,
        debug: config.debug,
      });

      return adapter;
    } catch (error) {
      logger.error('Failed to create SQLite storage adapter', {
        error: error instanceof Error ? error.message : 'Unknown error',
        databasePath: config.databasePath,
      });
      throw error;
    }
  }
}

/**
 * Global storage adapter factory instance
 */
export const storageAdapterFactory = new DefaultStorageAdapterFactory();