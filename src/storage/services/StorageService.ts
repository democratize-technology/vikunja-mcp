/**
 * StorageService - Handles all CRUD operations for filter storage
 *
 * This service extracts storage operations from the original PersistentFilterStorage
 * God module and provides a clean, focused interface for storage operations.
 * It maintains thread safety with mutex operations and proper error handling.
 */

import { logger } from '../../utils/logger';
import { AsyncMutex } from '../../utils/AsyncMutex';
import type { SavedFilter } from '../../types/filters';
import type { StorageAdapter, StorageSession, StorageConfig } from '../interfaces';
import type { AdapterFactory } from '../interfaces/AdapterFactory';

/**
 * StorageService handles all storage operations with proper initialization,
 * health checks, and session management. It maintains compatibility with
 * the original FilterStorage interface while providing better separation
 * of concerns.
 */
export class StorageService {
  private adapter: StorageAdapter | null = null;
  private mutex = new AsyncMutex();
  private session: StorageSession;
  private initialized = false;
  private adapterFactory: AdapterFactory | null = null;
  private config: StorageConfig | null = null;

  /**
   * Create a new StorageService instance
   *
   * @param adapter - Direct adapter injection (for testing)
   * @param adapterFactory - Factory for creating adapters (for production)
   * @param config - Storage configuration (for production)
   */
  constructor(
    adapter: StorageAdapter | null = null,
    adapterFactory: AdapterFactory | null = null,
    config: StorageConfig | null = null
  ) {
    // For testing, allow direct injection of mock adapter
    if (adapter) {
      this.adapter = adapter;
      this.initialized = true;
      // Create a minimal session for testing
      this.session = {
        id: 'test-session',
        createdAt: new Date(),
        lastAccessAt: new Date(),
      };
    } else {
      // Real usage - dependencies provided via constructor injection
      this.adapterFactory = adapterFactory;
      this.config = config;
      this.session = {
        id: '',
        createdAt: new Date(),
        lastAccessAt: new Date(),
      };
    }
  }

  /**
   * Initialize the storage service with session context
   */
  async initialize(session: StorageSession): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!this.adapterFactory || !this.config) {
      throw new Error('StorageService missing required dependencies: adapterFactory and config must be provided via constructor');
    }

    try {
      this.session = session;
      this.adapter = await this.adapterFactory!.createAdapter(this.config!);
      await this.adapter!.initialize(this.session);
      this.initialized = true;

      logger.debug(`StorageService initialized for session ${this.session.id}`, {
        storageType: this.config.type,
        sessionId: this.session.id,
      });
    } catch (error) {
      logger.error('Failed to initialize StorageService', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: this.session.id,
      });
      throw error;
    }
  }

  /**
   * Ensure storage is initialized and healthy
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      throw new Error('StorageService not initialized. Call initialize() first.');
    }

    if (!this.adapter) {
      throw new Error('Storage adapter not available');
    }

    // For mock adapters (testing), skip health checks
    if (this.session.id === 'test-session') {
      return;
    }

    // Perform health check periodically
    try {
      const healthCheck = await this.adapter.healthCheck();
      if (!healthCheck.healthy) {
        logger.warn('Storage adapter health check failed', {
          error: healthCheck.error,
          sessionId: this.session.id,
        });

        // Try to reinitialize
        if (this.adapterFactory && this.config) {
          try {
            this.adapter = await this.adapterFactory!.createAdapter(this.config!);
            await this.adapter!.initialize(this.session);
          } catch (reinitError) {
            logger.error('Failed to reinitialize storage adapter', {
              error: reinitError instanceof Error ? reinitError.message : 'Unknown error',
              sessionId: this.session.id,
            });
            throw new Error('Storage adapter is unhealthy and cannot be recovered');
          }
        } else {
          throw new Error('Cannot recover storage adapter: missing adapterFactory or config dependencies');
        }
      }
    } catch (error) {
      // If health check itself fails, it's still usable but log the error
      logger.warn('Health check failed, continuing with adapter', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: this.session.id,
      });
    }
  }

  /**
   * Update last access time for the session
   */
  private updateAccessTime(): void {
    this.session.lastAccessAt = new Date();
  }

  /**
   * Get session information
   */
  getSession(): StorageSession {
    return { ...this.session };
  }

  /**
   * List all filters for the current session
   */
  async list(): Promise<SavedFilter[]> {
    const release = await this.mutex.acquire();
    try {
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      await this.ensureInitialized();
      this.updateAccessTime();
      return await this.adapter.list();
    } finally {
      release();
    }
  }

  /**
   * Get a specific filter by ID
   */
  async get(id: string): Promise<SavedFilter | null> {
    const release = await this.mutex.acquire();
    try {
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      await this.ensureInitialized();
      this.updateAccessTime();
      return await this.adapter.get(id);
    } finally {
      release();
    }
  }

  /**
   * Create a new filter
   */
  async create(filter: Omit<SavedFilter, 'id' | 'created' | 'updated'>): Promise<SavedFilter> {
    const release = await this.mutex.acquire();
    try {
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      await this.ensureInitialized();
      this.updateAccessTime();
      return await this.adapter.create(filter);
    } finally {
      release();
    }
  }

  /**
   * Update an existing filter
   */
  async update(
    id: string,
    filter: Partial<Omit<SavedFilter, 'id' | 'created' | 'updated'>>,
  ): Promise<SavedFilter> {
    const release = await this.mutex.acquire();
    try {
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      await this.ensureInitialized();
      this.updateAccessTime();
      return await this.adapter.update(id, filter);
    } finally {
      release();
    }
  }

  /**
   * Delete a filter
   */
  async delete(id: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      await this.ensureInitialized();
      this.updateAccessTime();
      await this.adapter.delete(id);
    } finally {
      release();
    }
  }

  /**
   * Find a filter by name
   */
  async findByName(name: string): Promise<SavedFilter | null> {
    const release = await this.mutex.acquire();
    try {
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      await this.ensureInitialized();
      this.updateAccessTime();
      return await this.adapter.findByName(name);
    } finally {
      release();
    }
  }

  /**
   * Clear all filters for the current session
   */
  async clear(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      await this.ensureInitialized();
      this.updateAccessTime();
      await this.adapter.clear();
    } finally {
      release();
    }
  }

  /**
   * Get filters for a specific project
   */
  async getByProject(projectId: number): Promise<SavedFilter[]> {
    const release = await this.mutex.acquire();
    try {
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      await this.ensureInitialized();
      this.updateAccessTime();
      return await this.adapter.getByProject(projectId);
    } finally {
      release();
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    filterCount: number;
    sessionId: string;
    createdAt: Date;
    lastAccessAt: Date;
    storageType: string;
    additionalInfo?: Record<string, unknown>;
  }> {
    const release = await this.mutex.acquire();
    try {
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      await this.ensureInitialized();
      this.updateAccessTime();
      const stats = await this.adapter.getStats();

      return {
        ...stats,
        // Override with session info in case adapter doesn't have access
        sessionId: this.session.id,
        createdAt: this.session.createdAt,
        lastAccessAt: this.session.lastAccessAt,
      };
    } finally {
      release();
    }
  }

  /**
   * Close the storage service and clean up resources
   */
  async close(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      if (this.adapter) {
        await this.adapter.close();
        this.adapter = null;
      }
      this.initialized = false;

      logger.debug(`StorageService closed for session ${this.session.id}`);
    } catch (error) {
      logger.warn('Error closing StorageService', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: this.session.id,
      });
    } finally {
      release();
    }
  }

  /**
   * Perform health check on the storage adapter
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }> {
    const release = await this.mutex.acquire();
    try {
      // If not initialized, try to initialize it first
      if (!this.initialized) {
        return {
          healthy: false,
          error: 'StorageService not initialized',
          details: {
            sessionId: this.session.id,
            initialized: this.initialized,
          },
        };
      }

      if (!this.adapter) {
        return {
          healthy: false,
          error: 'Storage adapter not available',
          details: {
            sessionId: this.session.id,
            initialized: this.initialized,
          },
        };
      }

      const healthCheck = await this.adapter.healthCheck();
      return {
        ...healthCheck,
        details: {
          ...healthCheck.details,
          sessionId: this.session.id,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          sessionId: this.session.id,
        },
      };
    } finally {
      release();
    }
  }
}