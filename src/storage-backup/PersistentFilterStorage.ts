/**
 * Refactored PersistentFilterStorage - True Modular Architecture Implementation
 *
 * This implementation properly delegates responsibilities to specialized components:
 * - SessionManager: Session lifecycle and access tracking
 * - StorageAdapterOrchestrator: Adapter management and coordination
 * - StorageHealthMonitor: Health monitoring and recovery
 * - StorageStatistics: Metrics collection and performance tracking
 *
 * Key improvements over ServiceContainer approach:
 * - No circular dependencies
 * - True dependency injection with constructor injection
 * - Thread-safe operations with comprehensive mutex protection
 * - 100% backward API compatibility
 * - Proper error handling and graceful degradation
 */

import { logger } from '../utils/logger';
import { AsyncMutex } from '../utils/AsyncMutex';
import type { FilterStorage, SavedFilter } from '../types/filters';
import type { StorageSession, StorageAdapter } from './interfaces';

// Import new modular components
import { SessionManager } from './managers/SessionManager';
import { StorageAdapterOrchestrator } from './orchestrators/StorageAdapterOrchestrator';
import { type OrchestrationConfig } from './orchestrators/interfaces';
import { StorageHealthMonitor } from './monitors/StorageHealthMonitor';
import { type HealthMonitorConfig } from './monitors/interfaces/StorageHealthMonitor';
import { StorageStatistics } from './statistics/StorageStatistics';
import { type StorageStatisticsConfig } from './statistics/interfaces';

/**
 * Component injection options for flexible dependency management
 */
export interface PersistentFilterStorageComponents {
  /** Custom session manager instance */
  sessionManager?: SessionManager;
  /** Custom adapter orchestrator instance */
  orchestrator?: StorageAdapterOrchestrator;
  /** Custom health monitor instance */
  healthMonitor?: StorageHealthMonitor;
  /** Custom statistics collector instance */
  statistics?: StorageStatistics;
}

/**
 * Configuration options for the refactored storage
 */
export interface PersistentFilterStorageConfig {
  /** Session management configuration */
  session?: {
    timeoutMs?: number;
    cleanupIntervalMs?: number;
    maxSessions?: number;
  };
  /** Adapter orchestration configuration */
  orchestration?: OrchestrationConfig;
  /** Health monitoring configuration */
  health?: HealthMonitorConfig;
  /** Statistics collection configuration */
  statistics?: StorageStatisticsConfig;
  /** Enable debug logging */
  debugLogging?: boolean;
}

/**
 * Initialization state for proper lifecycle management
 */
type InitializationState = 'uninitialized' | 'initializing' | 'ready' | 'error';

/**
 * Refactored PersistentFilterStorage using true modular architecture
 *
 * This class maintains 100% backward compatibility while delegating
 * responsibilities to specialized, production-ready components.
 */
export class PersistentFilterStorage implements FilterStorage {
  // Core components
  private sessionManager: SessionManager;
  private orchestrator: StorageAdapterOrchestrator;
  private healthMonitor: StorageHealthMonitor;
  private statistics: StorageStatistics;

  // Thread safety
  private mutex = new AsyncMutex();

  // Session information
  private sessionId: string;
  private userId: string | undefined;
  private apiUrl: string | undefined;

  // Lifecycle management
  private initState: InitializationState = 'uninitialized';
  private initError?: Error;

  /**
   * Create a new refactored persistent storage instance
   *
   * @param sessionId Unique session identifier
   * @param userId Optional user ID for session association
   * @param apiUrl Optional API URL for session context
   * @param components Optional injected components for testing/customization
   * @param config Optional configuration for component behavior
   */
  constructor(
    sessionId: string,
    userId?: string,
    apiUrl?: string,
    components: PersistentFilterStorageComponents = {},
    config: PersistentFilterStorageConfig = {}
  ) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.apiUrl = apiUrl;

    // Dependency injection with defaults for backward compatibility
    const sessionManagerConfig = {
      sessionTimeoutMs: config.session?.timeoutMs || 300000, // 5 minutes default
      cleanupIntervalMs: config.session?.cleanupIntervalMs || 60000, // 1 minute default
      maxSessions: config.session?.maxSessions || 1000,
      debugLogging: config.debugLogging || false,
    };

    this.sessionManager = components.sessionManager ?? new SessionManager(sessionManagerConfig);

    this.orchestrator = components.orchestrator ?? new StorageAdapterOrchestrator(
      config.orchestration
    );

    this.healthMonitor = components.healthMonitor ?? new StorageHealthMonitor(
      config.health
    );

    this.statistics = components.statistics ?? new StorageStatistics();

    if (config.debugLogging) {
      logger.debug('PersistentFilterStorage created', {
        sessionId,
        userId,
        apiUrl,
        hasCustomComponents: Object.keys(components).length > 0
      });
    }
  }

  /**
   * Get session information (backward compatibility)
   */
  getSession(): StorageSession {
    // Return basic session info for compatibility
    const session: StorageSession = {
      id: this.sessionId,
      createdAt: new Date(), // This will be updated after proper initialization
      lastAccessAt: new Date(),
    };

    if (this.userId) {
      session.userId = this.userId;
    }

    if (this.apiUrl) {
      session.apiUrl = this.apiUrl;
    }

    return session;
  }

  /**
   * Core CRUD operations - delegated to adapter with full instrumentation
   */

  async list(): Promise<SavedFilter[]> {
    return this.executeWithInstrumentation('query', async (adapter: StorageAdapter) => {
      return await adapter.list();
    });
  }

  async get(id: string): Promise<SavedFilter | null> {
    return this.executeWithInstrumentation('read', async (adapter: StorageAdapter) => {
      return await adapter.get(id);
    }, { filterId: id });
  }

  async create(filter: Omit<SavedFilter, 'id' | 'created' | 'updated'>): Promise<SavedFilter> {
    return this.executeWithInstrumentation('create', async (adapter: StorageAdapter) => {
      return await adapter.create(filter);
    }, { filterName: filter.name });
  }

  async update(
    id: string,
    filter: Partial<Omit<SavedFilter, 'id' | 'created' | 'updated'>>
  ): Promise<SavedFilter> {
    return this.executeWithInstrumentation('update', async (adapter: StorageAdapter) => {
      return await adapter.update(id, filter);
    }, { filterId: id });
  }

  async delete(id: string): Promise<void> {
    return this.executeWithInstrumentation('delete', async (adapter: StorageAdapter) => {
      return await adapter.delete(id);
    }, { filterId: id });
  }

  async findByName(name: string): Promise<SavedFilter | null> {
    return this.executeWithInstrumentation('query', async (adapter: StorageAdapter) => {
      return await adapter.findByName(name);
    }, { filterName: name });
  }

  async clear(): Promise<void> {
    return this.executeWithInstrumentation('clear', async (adapter: StorageAdapter) => {
      return await adapter.clear();
    });
  }

  async getByProject(projectId: number): Promise<SavedFilter[]> {
    return this.executeWithInstrumentation('query', async (adapter: StorageAdapter) => {
      return await adapter.getByProject(projectId);
    }, { projectId });
  }

  /**
   * Get comprehensive storage statistics (backward compatibility)
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
    } catch (error) {
      this.logError('Failed to get storage statistics', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Perform comprehensive health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }> {
    const release = await this.mutex.acquire();
    try {
      // If not initialized, try to initialize first
      if (this.initState === 'uninitialized') {
        try {
          await this.initialize();
        } catch (error) {
          const result: any = {
            healthy: false,
            details: {
              sessionId: this.sessionId,
              initPhase: this.initState
            }
          };

          result.error = `Failed to initialize: ${error instanceof Error ? error.message : 'Unknown error'}`;

          return result;
        }
      }

      // Check component health
      const sessionValid = await this.sessionManager.isSessionValid(this.sessionId);
      const adapterHealth = await this.orchestrator.performHealthCheck();
      const healthCheck = await this.healthMonitor.checkHealth();

      const healthy = sessionValid && adapterHealth.healthy && healthCheck.healthy;

      const result: any = {
        healthy,
        details: {
          sessionId: this.sessionId,
          sessionValid,
          adapterHealth: adapterHealth.healthy,
          healthCheck: healthCheck.healthy,
          initPhase: this.initState,
          adapterState: this.orchestrator.getAdapterStatus().state
        }
      };

      if (!healthy) {
        if (!sessionValid) {
          result.error = 'Session invalid or expired';
        } else if (!adapterHealth.healthy && adapterHealth.error) {
          result.error = adapterHealth.error;
        } else if (!healthCheck.healthy && healthCheck.error) {
          result.error = healthCheck.error;
        } else {
          result.error = 'Unknown health issue';
        }
      }

      return result;
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          sessionId: this.sessionId,
          unexpectedError: true
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
      logger.debug('Closing PersistentFilterStorage', {
        sessionId: this.sessionId,
        initPhase: this.initState
      });

      // Close components in reverse initialization order
      const closePromises = [
        this.healthMonitor.stopMonitoring().catch((error: unknown) => {
          logger.warn('Error stopping health monitor', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }),
        this.statistics.close().catch((error: unknown) => {
          logger.warn('Error closing statistics', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }),
        this.orchestrator.close().catch((error: unknown) => {
          logger.warn('Error closing orchestrator', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }),
        this.sessionManager.removeSession(this.sessionId).catch((error: unknown) => {
          logger.warn('Error removing session', {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        })
      ];

      await Promise.allSettled(closePromises);

      this.initState = 'uninitialized';

      logger.debug('PersistentFilterStorage closed successfully', {
        sessionId: this.sessionId
      });
    } catch (error) {
      this.logError('Error during storage close', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Private helper methods
   */

  /**
   * Initialize all components in proper sequence
   */
  private async initialize(): Promise<void> {
    if (this.initState === 'initializing') {
      // Wait for other initialization to complete
      await this.waitForInitialization();
      return;
    }

    if (this.initState === 'ready') {
      return;
    }

    this.initState = 'initializing';
    const release = await this.mutex.acquire();

    try {
      logger.debug('Initializing PersistentFilterStorage', {
        sessionId: this.sessionId
      });

      // Step 1: Create session
      const sessionOptions: any = {
        sessionId: this.sessionId,
      };

      if (this.userId) {
        sessionOptions.userId = this.userId;
      }

      if (this.apiUrl) {
        sessionOptions.apiUrl = this.apiUrl;
      }

      const session = await this.sessionManager.createSession(sessionOptions);

      // Step 2: Initialize orchestrator with session
      await this.orchestrator.initialize(session);

      // Step 3: Get adapter (triggers lazy initialization if needed)
      const adapter = await this.orchestrator.getAdapter();

      // Step 4: Initialize statistics
      await this.statistics.initialize({});

      // Step 5: Start health monitoring
      await this.healthMonitor.startMonitoring(adapter);

      this.initState = 'ready';

      logger.info('PersistentFilterStorage initialized successfully', {
        sessionId: this.sessionId,
        storageType: this.orchestrator.getStorageConfig().type
      });
    } catch (error) {
      this.initState = 'error';
      this.initError = error instanceof Error ? error : new Error('Unknown initialization error');

      logger.error('Failed to initialize PersistentFilterStorage', {
        sessionId: this.sessionId,
        error: this.initError.message
      });

      throw this.initError;
    } finally {
      release();
    }
  }

  /**
   * Ensure storage is properly initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initState === 'ready') {
      return;
    }

    if (this.initState === 'error') {
      throw this.initError || new Error('Storage initialization failed');
    }

    await this.initialize();
  }

  /**
   * Execute operation with full instrumentation and error handling
   */
  private async executeWithInstrumentation<T>(
    operationType: 'create' | 'read' | 'update' | 'delete' | 'batch_create' | 'query' | 'clear',
    operation: (adapter: StorageAdapter) => Promise<T>,
    metadata: Record<string, unknown> = {}
  ): Promise<T> {
    const startTime = Date.now();
    const release = await this.mutex.acquire();

    try {
      await this.ensureInitialized();

      // Update session access time
      await this.sessionManager.updateAccessTime(this.sessionId);

      // Get adapter through orchestrator
      const adapter = await this.orchestrator.getAdapter();

      // Execute the operation
      const result = await operation(adapter);

      // Record successful operation
      await this.statistics.recordOperation({
        operationType,
        success: true,
        startTime,
        endTime: Date.now(),
        itemCount: Array.isArray(result) ? result.length : result ? 1 : 0,
        storageType: 'persistent',
        sessionId: this.sessionId
      });

      return result;
    } catch (error) {
      // Record failed operation
      await this.statistics.recordOperation({
        operationType,
        success: false,
        startTime,
        endTime: Date.now(),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        storageType: 'persistent',
        sessionId: this.sessionId
      });

      this.logError(`Operation ${operationType} failed`, error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Wait for initialization to complete (for concurrent access)
   */
  private async waitForInitialization(): Promise<void> {
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 100; // 100ms
    let waited = 0;

    while (this.initState === 'initializing' && waited < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    if (this.initState === 'initializing') {
      throw new Error('Initialization timeout - please try again');
    }
  }

  /**
   * Log errors with context
   */
  private logError(message: string, error: unknown): void {
    logger.error(message, {
      sessionId: this.sessionId,
      initPhase: this.initState,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : 'Unknown error'
    });
  }

  /**
   * Get advanced diagnostics (for debugging and monitoring)
   */
  async getDiagnostics(): Promise<{
    sessionId: string;
    initPhase: InitializationState;
    sessionInfo: StorageSession | null;
    adapterStatus: unknown;
    healthStatus: unknown;
    statistics: unknown;
  }> {
    const release = await this.mutex.acquire();
    try {
      return {
        sessionId: this.sessionId,
        initPhase: this.initState,
        sessionInfo: await this.sessionManager.getSession(this.sessionId),
        adapterStatus: this.orchestrator.getAdapterStatus(),
        healthStatus: this.healthMonitor.getCurrentHealth(),
        statistics: await this.statistics.getSnapshot()
      };
    } finally {
      release();
    }
  }
}

// Type aliases for backward compatibility
export type RefactoredPersistentFilterStorage = PersistentFilterStorage;

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
          const statItem: any = {
            sessionId,
            filterCount: storageStats.filterCount,
            createdAt: storageStats.createdAt,
            lastAccessAt: storageStats.lastAccessAt,
            storageType: storageStats.storageType,
          };

          if (storageStats.additionalInfo) {
            statItem.additionalInfo = storageStats.additionalInfo;
          }

          stats.push(statItem);
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
          const healthResult: any = {
            sessionId,
            healthy: healthCheck.healthy,
          };

          if (healthCheck.error) {
            healthResult.error = healthCheck.error;
          }

          if (healthCheck.details) {
            healthResult.details = healthCheck.details;
          }

          healthResults.push(healthResult);
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