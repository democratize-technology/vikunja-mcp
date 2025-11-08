/**
 * Persistent Filter Storage - Refactored to Use Modular Components
 *
 * This implementation now delegates responsibilities to specialized modular components:
 * - SessionManager: Session lifecycle and access tracking
 * - StorageAdapterOrchestrator: Adapter management and coordination
 * - StorageHealthMonitor: Health monitoring and recovery
 * - StorageStatistics: Metrics collection and performance tracking
 *
 * Key architectural improvements:
 * - Eliminated God module anti-pattern
 * - True dependency injection with constructor injection
 * - Thread-safe operations with comprehensive mutex protection
 * - 100% backward API compatibility maintained
 * - Proper error handling and graceful degradation
 */

import { logger } from '../utils/logger';
import { AsyncMutex } from '../utils/AsyncMutex';
import type { FilterStorage, SavedFilter } from '../types/filters';
import type { StorageSession } from './interfaces';

// Import modular components
import { SessionManager } from './managers/SessionManager';
import { StorageAdapterOrchestrator } from './orchestrators/StorageAdapterOrchestrator';
import { StorageHealthMonitor } from './monitors/StorageHealthMonitor';
import { StorageStatistics } from './statistics/StorageStatistics';

/**
 * Refactored Persistent Filter Storage using Modular Components
 *
 * This implementation maintains 100% backward compatibility while using the new modular architecture.
 * All the complex responsibilities are now delegated to specialized components.
 */
export class PersistentFilterStorage implements FilterStorage {
  // Modular components
  private sessionManager: SessionManager;
  private orchestrator: StorageAdapterOrchestrator;
  private healthMonitor: StorageHealthMonitor;
  private statistics: StorageStatistics;

  // Thread safety
  private mutex = new AsyncMutex();

  // Session information
  private sessionId: string;
  private userId?: string;
  private apiUrl?: string;

  // Lifecycle management
  private initialized = false;
  private initError?: Error;

  /**
   * Create a new persistent storage instance for a specific session
   *
   * @param sessionId Unique session identifier
   * @param userId Optional user ID for session association
   * @param apiUrl Optional API URL for session context
   */
  constructor(sessionId: string, userId?: string, apiUrl?: string) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.apiUrl = apiUrl;

    // Initialize modular components
    this.sessionManager = new SessionManager();
    this.orchestrator = new StorageAdapterOrchestrator();
    this.healthMonitor = new StorageHealthMonitor();
    this.statistics = new StorageStatistics();

    logger.debug('PersistentFilterStorage created with modular components', {
      sessionId,
      userId,
      apiUrl
    });
  }

  /**
   * Get session information (backward compatibility)
   */
  getSession(): StorageSession {
    return {
      id: this.sessionId,
      createdAt: new Date(),
      lastAccessAt: new Date(),
      userId: this.userId,
      apiUrl: this.apiUrl
    };
  }

  /**
   * Initialize all components
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const release = await this.mutex.acquire();
    try {
      // Step 1: Create session
      const session = await this.sessionManager.createSession({
        sessionId: this.sessionId,
        userId: this.userId,
        apiUrl: this.apiUrl
      });

      // Step 2: Initialize orchestrator
      await this.orchestrator.initialize(session);

      // Step 3: Get adapter and initialize other components
      const adapter = await this.orchestrator.getAdapter();

      // Step 4: Initialize statistics
      await this.statistics.initialize({
        sessionId: session.id,
        storageType: this.orchestrator.getStorageConfig().type
      });

      // Step 5: Start health monitoring
      await this.healthMonitor.startMonitoring(adapter);

      this.initialized = true;

      logger.debug(`Persistent filter storage initialized for session ${this.sessionId}`, {
        storageType: this.orchestrator.getStorageConfig().type,
        sessionId: this.sessionId,
      });
    } catch (error) {
      this.initialized = false;
      this.initError = error instanceof Error ? error : new Error('Unknown initialization error');

      logger.error('Failed to initialize persistent storage adapter', {
        error: this.initError.message,
        sessionId: this.sessionId,
      });
      throw this.initError;
    } finally {
      release();
    }
  }

  /**
   * Ensure storage is initialized and healthy
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.initError) {
      throw this.initError;
    }

    // Perform health check
    const healthCheck = await this.orchestrator.performHealthCheck();
    if (!healthCheck.healthy) {
      logger.warn('Storage adapter health check failed', {
        error: healthCheck.error,
        sessionId: this.sessionId,
      });

      // Try to reinitialize
      try {
        this.initialized = false;
        await this.initialize();
      } catch (reinitError) {
        logger.error('Failed to reinitialize storage adapter', {
          error: reinitError instanceof Error ? reinitError.message : 'Unknown error',
          sessionId: this.sessionId,
        });
        throw new Error('Storage adapter is unhealthy and cannot be recovered');
      }
    }
  }

  /**
   * Update last access time
   */
  private async updateAccessTime(): Promise<void> {
    await this.sessionManager.updateAccessTime(this.sessionId);
  }

  /**
   * Execute operation with instrumentation
   */
  private async executeWithInstrumentation<T>(
    operationType: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    const release = await this.mutex.acquire();

    try {
      await this.ensureInitialized();
      await this.updateAccessTime();

      const result = await operation();

      // Record successful operation
      await this.statistics.recordOperation({
        operationType,
        success: true,
        startTime,
        endTime: Date.now(),
        resultCount: Array.isArray(result) ? result.length : result ? 1 : 0
      });

      return result;
    } catch (error) {
      // Record failed operation
      await this.statistics.recordOperation({
        operationType,
        success: false,
        startTime,
        endTime: Date.now(),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown'
      });

      throw error;
    } finally {
      release();
    }
  }

  // CRUD operations with backward compatibility

  async list(): Promise<SavedFilter[]> {
    return this.executeWithInstrumentation('list', async () => {
      const adapter = await this.orchestrator.getAdapter();
      return await adapter.list();
    });
  }

  async get(id: string): Promise<SavedFilter | null> {
    return this.executeWithInstrumentation('get', async () => {
      const adapter = await this.orchestrator.getAdapter();
      return await adapter.get(id);
    });
  }

  async create(filter: Omit<SavedFilter, 'id' | 'created' | 'updated'>): Promise<SavedFilter> {
    return this.executeWithInstrumentation('create', async () => {
      const adapter = await this.orchestrator.getAdapter();
      return await adapter.create(filter);
    });
  }

  async update(
    id: string,
    filter: Partial<Omit<SavedFilter, 'id' | 'created' | 'updated'>>,
  ): Promise<SavedFilter> {
    return this.executeWithInstrumentation('update', async () => {
      const adapter = await this.orchestrator.getAdapter();
      return await adapter.update(id, filter);
    });
  }

  async delete(id: string): Promise<void> {
    return this.executeWithInstrumentation('delete', async () => {
      const adapter = await this.orchestrator.getAdapter();
      await adapter.delete(id);
    });
  }

  async findByName(name: string): Promise<SavedFilter | null> {
    return this.executeWithInstrumentation('findByName', async () => {
      const adapter = await this.orchestrator.getAdapter();
      return await adapter.findByName(name);
    });
  }

  /**
   * Clear all filters (useful for testing)
   */
  async clear(): Promise<void> {
    return this.executeWithInstrumentation('clear', async () => {
      const adapter = await this.orchestrator.getAdapter();
      await adapter.clear();
    });
  }

  /**
   * Get filters for a specific project
   */
  async getByProject(projectId: number): Promise<SavedFilter[]> {
    return this.executeWithInstrumentation('getByProject', async () => {
      const adapter = await this.orchestrator.getAdapter();
      return await adapter.getByProject(projectId);
    });
  }

  /**
   * Get storage statistics (backward compatibility)
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
      await this.updateAccessTime();

      // Get session information
      const session = await this.sessionManager.getSession(this.sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Get storage configuration
      const storageConfig = this.orchestrator.getStorageConfig();

      // Get statistics snapshot
      const statsSnapshot = await this.statistics.getSnapshot();

      return {
        filterCount: statsSnapshot.filterCount,
        sessionId: session.id,
        createdAt: session.createdAt,
        lastAccessAt: session.lastAccessAt,
        storageType: storageConfig.type,
        additionalInfo: {
          ...statsSnapshot.storageMetrics,
          healthStatus: (await this.healthMonitor.getCurrentHealth())?.status,
          adapterState: this.orchestrator.getAdapterStatus().state
        }
      };
    } finally {
      release();
    }
  }

  /**
   * Close the storage and clean up all resources
   */
  async close(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      logger.debug(`Closing persistent filter storage for session ${this.sessionId}`);

      // Close components in reverse initialization order
      const closePromises = [
        this.healthMonitor.stopMonitoring().catch(error => {
          logger.warn('Error stopping health monitor', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }),
        this.statistics.close().catch(error => {
          logger.warn('Error closing statistics', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }),
        this.orchestrator.close().catch(error => {
          logger.warn('Error closing orchestrator', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }),
        this.sessionManager.removeSession(this.sessionId).catch(error => {
          logger.warn('Error removing session', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        })
      ];

      await Promise.allSettled(closePromises);

      this.initialized = false;
      this.initError = undefined;

      logger.debug(`Persistent filter storage closed for session ${this.sessionId}`);
    } catch (error) {
      logger.warn('Error closing persistent filter storage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: this.sessionId,
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
              sessionId: this.sessionId,
              initialized: this.initialized,
            },
          };
        }
      }

      // Check component health
      const sessionValid = await this.sessionManager.isSessionValid(this.sessionId);
      const adapterHealth = await this.orchestrator.performHealthCheck();
      const healthCheck = await this.healthMonitor.checkHealth();

      const healthy = sessionValid && adapterHealth.healthy && healthCheck.healthy;

      return {
        healthy,
        error: healthy ? undefined :
          !sessionValid ? 'Session invalid or expired' :
          !adapterHealth.healthy ? adapterHealth.error :
          !healthCheck.healthy ? healthCheck.error :
          'Unknown health issue',
        details: {
          sessionId: this.sessionId,
          initialized: this.initialized,
          sessionValid,
          adapterHealth: adapterHealth.healthy,
          healthCheck: healthCheck.healthy,
          adapterState: this.orchestrator.getAdapterStatus().state
        },
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          sessionId: this.sessionId,
          unexpectedError: true
        },
      };
    } finally {
      release();
    }
  }
}

// Export the refactored implementation for testing and future use
export { RefactoredPersistentFilterStorage } from './RefactoredPersistentFilterStorage';

/**
 * Backward compatibility: maintain the old manager interface if needed
 * Note: This legacy interface is deprecated. Use SessionManager directly for new code.
 */
class LegacyPersistentFilterStorageManager {
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
   * Get statistics for all active storage instances
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

      for (const [sessionId, storage] of this.storageInstances.entries()) {
        try {
          const storageStats = await storage.getStats();
          stats.push({
            sessionId,
            filterCount: storageStats.filterCount,
            createdAt: storageStats.createdAt,
            lastAccessAt: storageStats.lastAccessAt,
            storageType: storageStats.storageType,
            additionalInfo: storageStats.additionalInfo
          });
        } catch (error) {
          logger.warn('Error getting stats for storage session', {
            sessionId,
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
      const healthResults = [];

      for (const [sessionId, storage] of this.storageInstances.entries()) {
        try {
          const healthCheck = await storage.healthCheck();
          healthResults.push({
            sessionId,
            healthy: healthCheck.healthy,
            error: healthCheck.error,
            details: healthCheck.details
          });
        } catch (error) {
          healthResults.push({
            sessionId,
            healthy: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return healthResults;
    } finally {
      release();
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
}

/**
 * @deprecated Use SessionManager and modular components directly
 * Global persistent storage manager instance for backward compatibility
 */
export const persistentStorageManager = new LegacyPersistentFilterStorageManager();