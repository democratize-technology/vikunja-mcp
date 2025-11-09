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
import type { StorageSession } from './interfaces';

// Import new modular components
import { SessionManager, type SessionOptions } from './managers/SessionManager';
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
export interface RefactoredStorageConfig {
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
export class RefactoredPersistentFilterStorage implements FilterStorage {
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

  // Configuration
  private config: RefactoredStorageConfig;

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
    config: RefactoredStorageConfig = {}
  ) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.apiUrl = apiUrl;
    this.config = config;

    // Dependency injection with defaults for backward compatibility
    const sessionManagerConfig: any = {};
    if (config.session?.timeoutMs !== undefined) {
      sessionManagerConfig.sessionTimeoutMs = config.session.timeoutMs;
    }
    if (config.session?.cleanupIntervalMs !== undefined) {
      sessionManagerConfig.cleanupIntervalMs = config.session.cleanupIntervalMs;
    }
    if (config.session?.maxSessions !== undefined) {
      sessionManagerConfig.maxSessions = config.session.maxSessions;
    }
    if (config.debugLogging !== undefined) {
      sessionManagerConfig.debugLogging = config.debugLogging;
    }

    this.sessionManager = components.sessionManager ?? new SessionManager(sessionManagerConfig);

    this.orchestrator = components.orchestrator ?? new StorageAdapterOrchestrator(
      config.orchestration
    );

    this.healthMonitor = components.healthMonitor ?? new StorageHealthMonitor(
      config.health
    );

    this.statistics = components.statistics ?? new StorageStatistics();

    if (config.debugLogging) {
      logger.debug('RefactoredPersistentFilterStorage created', {
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
    const session: any = {
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
    return this.executeWithInstrumentation('query', async (adapter) => {
      return await adapter.list();
    });
  }

  async get(id: string): Promise<SavedFilter | null> {
    return this.executeWithInstrumentation('read', async (adapter) => {
      return await adapter.get(id);
    }, { filterId: id });
  }

  async create(filter: Omit<SavedFilter, 'id' | 'created' | 'updated'>): Promise<SavedFilter> {
    return this.executeWithInstrumentation('create', async (adapter) => {
      return await adapter.create(filter);
    }, { filterName: filter.name });
  }

  async update(
    id: string,
    filter: Partial<Omit<SavedFilter, 'id' | 'created' | 'updated'>>
  ): Promise<SavedFilter> {
    return this.executeWithInstrumentation('update', async (adapter) => {
      return await adapter.update(id, filter);
    }, { filterId: id });
  }

  async delete(id: string): Promise<void> {
    return this.executeWithInstrumentation('delete', async (adapter) => {
      return await adapter.delete(id);
    }, { filterId: id });
  }

  async findByName(name: string): Promise<SavedFilter | null> {
    return this.executeWithInstrumentation('query', async (adapter) => {
      return await adapter.findByName(name);
    }, { filterName: name });
  }

  async clear(): Promise<void> {
    return this.executeWithInstrumentation('clear', async (adapter) => {
      return await adapter.clear();
    });
  }

  async getByProject(projectId: number): Promise<SavedFilter[]> {
    return this.executeWithInstrumentation('query', async (adapter) => {
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
      logger.debug('Closing RefactoredPersistentFilterStorage', {
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

      logger.debug('RefactoredPersistentFilterStorage closed successfully', {
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
      logger.debug('Initializing RefactoredPersistentFilterStorage', {
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
      await this.orchestrator.initialize(session, this.config.orchestration);

      // Step 3: Get adapter (triggers lazy initialization if needed)
      const adapter = await this.orchestrator.getAdapter();

      // Step 4: Initialize statistics
      await this.statistics.initialize(this.config.statistics);

      // Step 5: Start health monitoring
      await this.healthMonitor.startMonitoring(adapter, this.config.health);

      this.initState = 'ready';

      logger.info('RefactoredPersistentFilterStorage initialized successfully', {
        sessionId: this.sessionId,
        storageType: this.orchestrator.getStorageConfig().type
      });
    } catch (error) {
      this.initState = 'error';
      this.initError = error instanceof Error ? error : new Error('Unknown initialization error');

      logger.error('Failed to initialize RefactoredPersistentFilterStorage', {
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
    operation: (adapter: any) => Promise<T>,
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
        storageType: 'refactored',
        sessionId: this.sessionId
      });

      if (this.config.debugLogging) {
        logger.debug(`Operation ${operationType} completed successfully`, {
          sessionId: this.sessionId,
          duration: Date.now() - startTime,
          resultCount: Array.isArray(result) ? result.length : result ? 1 : 0
        });
      }

      return result;
    } catch (error) {
      // Record failed operation
      await this.statistics.recordOperation({
        operationType,
        success: false,
        startTime,
        endTime: Date.now(),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        storageType: 'refactored',
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
    sessionInfo: any;
    adapterStatus: any;
    healthStatus: any;
    statistics: any;
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