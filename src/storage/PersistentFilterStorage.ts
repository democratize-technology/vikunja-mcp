/**
 * Persistent filter storage implementation using storage adapters
 * 
 * This implementation enhances the original FilterStorage with persistent
 * storage capabilities while maintaining full API compatibility and
 * thread-safe operations with graceful fallback mechanisms.
 */

import { logger } from '../utils/logger';
import { AsyncMutex } from '../utils/AsyncMutex';
import type { FilterStorage, SavedFilter } from '../types/filters';
import type { StorageAdapter, StorageSession } from './interfaces';
import { storageAdapterFactory } from './adapters/factory';
import { loadStorageConfig } from './config';

/**
 * Enhanced filter storage with persistent backend support
 * 
 * Features:
 * - Thread-safe operations using mutex locks
 * - Session isolation preventing cross-session contamination
 * - Pluggable storage adapters with graceful fallback
 * - Automatic initialization and configuration management
 * - Health monitoring and error recovery
 */
export class PersistentFilterStorage implements FilterStorage {
  private adapter: StorageAdapter | null = null;
  private mutex = new AsyncMutex();
  private session: StorageSession;
  private initialized = false;

  /**
   * Create a new persistent storage instance for a specific session
   */
  constructor(sessionId: string, userId?: string, apiUrl?: string) {
    this.session = {
      id: sessionId,
      createdAt: new Date(),
      lastAccessAt: new Date(),
    };
    
    if (userId !== undefined) {
      this.session.userId = userId;
    }
    
    if (apiUrl !== undefined) {
      this.session.apiUrl = apiUrl;
    }
  }

  /**
   * Initialize the storage adapter
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const config = loadStorageConfig();
      this.adapter = await storageAdapterFactory.createAdapter(config);
      await this.adapter.initialize(this.session);
      this.initialized = true;

      logger.debug(`Persistent filter storage initialized for session ${this.session.id}`, {
        storageType: config.type,
        sessionId: this.session.id,
      });
    } catch (error) {
      logger.error('Failed to initialize persistent storage adapter', {
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
      await this.initialize();
    }

    if (!this.adapter) {
      throw new Error('Storage adapter not available');
    }

    // Perform health check periodically
    const healthCheck = await this.adapter.healthCheck();
    if (!healthCheck.healthy) {
      logger.warn('Storage adapter health check failed', {
        error: healthCheck.error,
        sessionId: this.session.id,
      });
      
      // Try to reinitialize
      try {
        await this.initialize();
      } catch (reinitError) {
        logger.error('Failed to reinitialize storage adapter', {
          error: reinitError instanceof Error ? reinitError.message : 'Unknown error',
          sessionId: this.session.id,
        });
        throw new Error('Storage adapter is unhealthy and cannot be recovered');
      }
    }
  }

  /**
   * Update last access time
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

  async list(): Promise<SavedFilter[]> {
    const release = await this.mutex.acquire();
    try {
      await this.ensureInitialized();
      this.updateAccessTime();
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      return await this.adapter.list();
    } finally {
      release();
    }
  }

  async get(id: string): Promise<SavedFilter | null> {
    const release = await this.mutex.acquire();
    try {
      await this.ensureInitialized();
      this.updateAccessTime();
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      return await this.adapter.get(id);
    } finally {
      release();
    }
  }

  async create(filter: Omit<SavedFilter, 'id' | 'created' | 'updated'>): Promise<SavedFilter> {
    const release = await this.mutex.acquire();
    try {
      await this.ensureInitialized();
      this.updateAccessTime();
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      return await this.adapter.create(filter);
    } finally {
      release();
    }
  }

  async update(
    id: string,
    filter: Partial<Omit<SavedFilter, 'id' | 'created' | 'updated'>>,
  ): Promise<SavedFilter> {
    const release = await this.mutex.acquire();
    try {
      await this.ensureInitialized();
      this.updateAccessTime();
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      return await this.adapter.update(id, filter);
    } finally {
      release();
    }
  }

  async delete(id: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      await this.ensureInitialized();
      this.updateAccessTime();
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      await this.adapter.delete(id);
    } finally {
      release();
    }
  }

  async findByName(name: string): Promise<SavedFilter | null> {
    const release = await this.mutex.acquire();
    try {
      await this.ensureInitialized();
      this.updateAccessTime();
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
      return await this.adapter.findByName(name);
    } finally {
      release();
    }
  }

  /**
   * Clear all filters (useful for testing)
   */
  async clear(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      await this.ensureInitialized();
      this.updateAccessTime();
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
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
      await this.ensureInitialized();
      this.updateAccessTime();
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
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
      await this.ensureInitialized();
      this.updateAccessTime();
      if (!this.adapter) {
        throw new Error('Storage adapter not available');
      }
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
   * Close the storage and clean up resources
   */
  async close(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      if (this.adapter) {
        await this.adapter.close();
        this.adapter = null;
      }
      this.initialized = false;
      
      logger.debug(`Persistent filter storage closed for session ${this.session.id}`);
    } catch (error) {
      logger.warn('Error closing persistent filter storage', {
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
        try {
          await this.initialize();
        } catch (error) {
          return {
            healthy: false,
            error: `Failed to initialize storage: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: {
              sessionId: this.session.id,
              initialized: this.initialized,
            },
          };
        }
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

/**
 * Enhanced storage manager for session-scoped persistent filter storage instances
 */
class PersistentFilterStorageManager {
  private storageInstances = new Map<string, PersistentFilterStorage>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private mutex = new AsyncMutex();
  
  // Cleanup inactive sessions after 1 hour
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  private readonly SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Get or create a storage instance for a session
   */
  async getStorage(sessionId: string, userId?: string, apiUrl?: string): Promise<PersistentFilterStorage> {
    const release = await this.mutex.acquire();
    try {
      let storage = this.storageInstances.get(sessionId);
      if (!storage) {
        storage = new PersistentFilterStorage(sessionId, userId, apiUrl);
        this.storageInstances.set(sessionId, storage);
      }
      return storage;
    } finally {
      release();
    }
  }

  /**
   * Remove a storage instance for a session
   */
  async removeStorage(sessionId: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const storage = this.storageInstances.get(sessionId);
      if (storage) {
        await storage.close();
        this.storageInstances.delete(sessionId);
      }
    } finally {
      release();
    }
  }

  /**
   * Get statistics for all storage instances
   */
  async getAllStats(): Promise<Array<{
    sessionId: string;
    filterCount: number;
    createdAt: Date;
    lastAccessAt: Date;
    storageType: string;
    additionalInfo?: Record<string, unknown>;
  }>> {
    const release = await this.mutex.acquire();
    try {
      const stats = [];
      for (const storage of this.storageInstances.values()) {
        try {
          stats.push(await storage.getStats());
        } catch (error) {
          logger.warn('Failed to get stats for storage instance', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
      return stats;
    } finally {
      release();
    }
  }

  /**
   * Clean up inactive sessions
   */
  private async cleanupInactiveSessions(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const now = new Date();
      const expiredSessions: string[] = [];
      
      for (const [sessionId, storage] of this.storageInstances.entries()) {
        try {
          const session = storage.getSession();
          const timeSinceLastAccess = now.getTime() - session.lastAccessAt.getTime();
          
          if (timeSinceLastAccess > this.SESSION_TIMEOUT_MS) {
            expiredSessions.push(sessionId);
          }
        } catch (error) {
          logger.warn('Error checking session expiry, marking for cleanup', {
            sessionId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          expiredSessions.push(sessionId);
        }
      }
      
      // Clean up expired sessions
      for (const sessionId of expiredSessions) {
        try {
          await this.removeStorage(sessionId);
        } catch (error) {
          logger.warn('Error cleaning up expired session', {
            sessionId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
      
      if (expiredSessions.length > 0) {
        logger.debug(`Cleaned up ${expiredSessions.length} inactive storage sessions`);
      }
    } finally {
      release();
    }
  }

  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions().catch((error) => {
        logger.error('Error during storage cleanup', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop the cleanup timer (for testing)
   */
  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clear all storage instances (for testing)
   */
  async clearAll(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const closePromises = Array.from(this.storageInstances.values()).map(storage => 
        storage.close().catch(error => {
          logger.warn('Error closing storage during clearAll', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        })
      );
      
      await Promise.all(closePromises);
      this.storageInstances.clear();
    } finally {
      release();
    }
  }

  /**
   * Perform health check on all storage instances
   */
  async healthCheckAll(): Promise<Array<{
    sessionId: string;
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }>> {
    const release = await this.mutex.acquire();
    try {
      const healthChecks = [];
      for (const [sessionId, storage] of this.storageInstances.entries()) {
        try {
          const healthCheck = await storage.healthCheck();
          healthChecks.push({
            sessionId,
            ...healthCheck,
          });
        } catch (error) {
          healthChecks.push({
            sessionId,
            healthy: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
      return healthChecks;
    } finally {
      release();
    }
  }
}

// Global persistent storage manager instance
export const persistentStorageManager = new PersistentFilterStorageManager();