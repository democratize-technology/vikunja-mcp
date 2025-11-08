/**
 * Adapter Factory interface for dependency injection
 *
 * This interface allows for proper dependency injection of adapter creation
 * instead of calling the factory directly from services.
 */

import type { StorageAdapter, StorageConfig } from './interfaces';

/**
 * Interface for creating storage adapters
 */
export interface AdapterFactory {
  /**
   * Create a storage adapter based on configuration
   */
  createAdapter(config: StorageConfig): Promise<StorageAdapter>;
}