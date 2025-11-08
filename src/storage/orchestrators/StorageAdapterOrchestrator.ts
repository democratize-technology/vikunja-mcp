/**
 * Storage Adapter Orchestrator
 *
 * This module provides coordination for storage adapter lifecycle management,
 * including initialization, health monitoring, error recovery, and graceful fallback.
 * It extracts adapter-related responsibilities from PersistentFilterStorage while
 * maintaining thread-safe operations with comprehensive error handling.
 */

import { logger } from '../../utils/logger';
import { AsyncMutex } from '../../utils/AsyncMutex';
import { storageAdapterFactory } from '../adapters/factory';
import { loadStorageConfig } from '../config';
import type { StorageAdapter, StorageConfig, StorageSession } from '../interfaces';
import {
  type StorageAdapterOrchestrator as IStorageAdapterOrchestrator,
  AdapterState,
  type AdapterStatus,
  type AdapterInitializationOptions,
  type OrchestrationConfig,
} from './interfaces';

/**
 * Default orchestration configuration
 */
const DEFAULT_ORCHESTRATION_CONFIG: Required<OrchestrationConfig> = {
  healthCheckInterval: 30000, // 30 seconds
  maxConsecutiveFailures: 3,
  enableAutoRecovery: true,
  healthGracePeriod: 5000, // 5 seconds
};

/**
 * Default initialization options
 */
const DEFAULT_INITIALIZATION_OPTIONS: Required<AdapterInitializationOptions> = {
  force: false,
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  timeout: 10000, // 10 seconds
};

/**
 * Storage Adapter Orchestrator Implementation
 *
 * This orchestrator manages storage adapter lifecycle, coordinates factory operations,
 * and provides health monitoring with automatic recovery mechanisms.
 */
export class StorageAdapterOrchestrator implements IStorageAdapterOrchestrator {
  private adapter: StorageAdapter | null = null;
  private session: StorageSession | null = null;
  private storageConfig: StorageConfig | null = null;
  private orchestrationConfig: Required<OrchestrationConfig>;
  private adapterStatus: AdapterStatus;
  private mutex = new AsyncMutex();
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private backgroundRecoveryTimer: NodeJS.Immediate | null = null;
  private closed = false;

  constructor(config?: OrchestrationConfig) {
    this.orchestrationConfig = {
      ...DEFAULT_ORCHESTRATION_CONFIG,
      ...config,
    };

    this.adapterStatus = {
      state: AdapterState.UNINITIALIZED,
      healthy: false,
      lastHealthCheck: new Date(),
      consecutiveFailures: 0,
    };
  }

  /**
   * Initialize the orchestrator with configuration and session
   */
  async initialize(session: StorageSession, config?: OrchestrationConfig): Promise<void> {
    if (this.closed) {
      throw new Error('Orchestrator has been closed and cannot be reinitialized');
    }

    const release = await this.mutex.acquire();
    try {
      // Update configuration if provided
      if (config) {
        this.orchestrationConfig = {
          ...DEFAULT_ORCHESTRATION_CONFIG,
          ...config,
        };
      }

      // Store session information
      this.session = { ...session };

      // Load storage configuration
      this.storageConfig = loadStorageConfig();

      // Update status
      this.adapterStatus = {
        state: AdapterState.UNINITIALIZED,
        healthy: false,
        lastHealthCheck: new Date(),
        consecutiveFailures: 0,
      };

      // Start health monitoring
      this.startHealthMonitoring();

      logger.debug('Storage adapter orchestrator initialized', {
        sessionId: this.session.id,
        storageType: this.storageConfig.type,
        healthCheckInterval: this.orchestrationConfig.healthCheckInterval,
      });
    } finally {
      release();
    }
  }

  /**
   * Get or create a storage adapter instance with lazy initialization
   */
  async getAdapter(options?: AdapterInitializationOptions): Promise<StorageAdapter> {
    if (this.closed) {
      throw new Error('Orchestrator has been closed');
    }

    const initOptions = { ...DEFAULT_INITIALIZATION_OPTIONS, ...options };

    const release = await this.mutex.acquire();
    try {
      // Check if we need to initialize or reinitialize
      if (!this.adapter ||
          this.adapterStatus.state === AdapterState.ERROR ||
          this.adapterStatus.state === AdapterState.CLOSED ||
          initOptions.force) {

        await this.initializeAdapter(initOptions);
      }

      // Ensure adapter is available
      if (!this.adapter) {
        throw new Error('Failed to create storage adapter');
      }

      return this.adapter;
    } finally {
      release();
    }
  }

  /**
   * Force reinitialization of the storage adapter
   */
  async reinitializeAdapter(options?: AdapterInitializationOptions): Promise<void> {
    if (this.closed) {
      throw new Error('Orchestrator has been closed');
    }

    const initOptions = { ...DEFAULT_INITIALIZATION_OPTIONS, ...options, force: true };

    const release = await this.mutex.acquire();
    try {
      // Close existing adapter if any
      if (this.adapter) {
        try {
          await this.adapter.close();
        } catch (error) {
          logger.warn('Error closing existing adapter during reinitialization', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
        this.adapter = null;
      }

      // Reset status
      this.adapterStatus = {
        state: AdapterState.UNINITIALIZED,
        healthy: false,
        lastHealthCheck: new Date(),
        consecutiveFailures: 0,
      };

      // Initialize new adapter
      await this.initializeAdapter(initOptions);
    } finally {
      release();
    }
  }

  /**
   * Get current adapter status and health information
   */
  getAdapterStatus(): AdapterStatus {
    return { ...this.adapterStatus };
  }

  /**
   * Perform health check on the managed adapter
   */
  async performHealthCheck(): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }> {
    if (this.closed) {
      return {
        healthy: false,
        error: 'Orchestrator has been closed',
        details: { state: 'closed' },
      };
    }

    const release = await this.mutex.acquire();
    try {
      // If adapter is not initialized, try to initialize it
      if (!this.adapter && this.storageConfig && this.session) {
        try {
          await this.initializeAdapter(DEFAULT_INITIALIZATION_OPTIONS);
        } catch (error) {
          this.updateAdapterStatus(AdapterState.ERROR, false,
            `Failed to initialize during health check: ${error instanceof Error ? error.message : 'Unknown error'}`);

          return {
            healthy: false,
            error: this.adapterStatus.error,
            details: { state: this.adapterStatus.state, consecutiveFailures: this.adapterStatus.consecutiveFailures },
          };
        }
      }

      // If still no adapter, report unhealthy
      if (!this.adapter) {
        return {
          healthy: false,
          error: 'No adapter available',
          details: { state: this.adapterStatus.state },
        } as const;
      }

      // Perform adapter health check
      try {
        const healthResult = await this.adapter.healthCheck();

        if (healthResult.healthy) {
          // Reset failure count on successful health check
          this.updateAdapterStatus(AdapterState.READY, true);
          return {
            ...healthResult,
            details: {
              ...healthResult.details,
              state: this.adapterStatus.state,
              consecutiveFailures: 0,
            },
          };
        } else {
          // Handle unhealthy adapter
          this.adapterStatus.consecutiveFailures++;
          this.adapterStatus.lastHealthCheck = new Date();

          // Always mark as UNHEALTHY if not exceeding max failures
          if (this.adapterStatus.consecutiveFailures < this.orchestrationConfig.maxConsecutiveFailures) {
            if (this.orchestrationConfig.enableAutoRecovery) {
              logger.warn('Storage adapter unhealthy, attempting recovery', {
                error: healthResult.error,
                consecutiveFailures: this.adapterStatus.consecutiveFailures,
                maxFailures: this.orchestrationConfig.maxConsecutiveFailures,
              });
            }

            this.updateAdapterStatus(AdapterState.UNHEALTHY, false, healthResult.error);

            // Attempt recovery in background if enabled
            if (this.orchestrationConfig.enableAutoRecovery) {
              this.backgroundRecoveryTimer = setImmediate(() => {
                this.backgroundRecoveryTimer = null;
                this.attemptRecovery().catch(error => {
                  logger.error('Background recovery failed', {
                    error: error instanceof Error ? error.message : 'Unknown error',
                  });
                });
              });
            }
          } else {
            this.updateAdapterStatus(AdapterState.ERROR, false,
              `Adapter unhealthy after ${this.adapterStatus.consecutiveFailures} consecutive failures: ${healthResult.error}`);
          }

          return {
            ...healthResult,
            details: {
              ...healthResult.details,
              state: this.adapterStatus.state,
              consecutiveFailures: this.adapterStatus.consecutiveFailures,
            },
          };
        }
      } catch (error) {
        this.adapterStatus.consecutiveFailures++;
        this.adapterStatus.lastHealthCheck = new Date();

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.updateAdapterStatus(AdapterState.ERROR, false, `Health check failed: ${errorMessage}`);

        return {
          healthy: false,
          error: errorMessage,
          details: {
            state: this.adapterStatus.state,
            consecutiveFailures: this.adapterStatus.consecutiveFailures,
          },
        };
      }
    } finally {
      release();
    }
  }

  /**
   * Close the orchestrator and clean up resources
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    const release = await this.mutex.acquire();
    try {
      this.closed = true;

      // Stop health monitoring
      this.stopHealthMonitoring();

      // Cancel pending background recovery
      if (this.backgroundRecoveryTimer) {
        clearImmediate(this.backgroundRecoveryTimer);
        this.backgroundRecoveryTimer = null;
      }

      // Close adapter if exists
      if (this.adapter) {
        try {
          await this.adapter.close();
        } catch (error) {
          logger.warn('Error closing adapter during orchestrator shutdown', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
        this.adapter = null;
      }

      // Update status
      this.updateAdapterStatus(AdapterState.CLOSED, false);

      logger.debug('Storage adapter orchestrator closed');
    } finally {
      release();
    }
  }

  /**
   * Get storage session information
   */
  getSession(): StorageSession {
    if (!this.session) {
      throw new Error('Orchestrator not initialized');
    }
    return { ...this.session };
  }

  /**
   * Get storage configuration
   */
  getStorageConfig(): StorageConfig {
    if (!this.storageConfig) {
      throw new Error('Orchestrator not initialized');
    }
    return { ...this.storageConfig };
  }

  /**
   * Initialize storage adapter with retry logic
   */
  private async initializeAdapter(options: Required<AdapterInitializationOptions>): Promise<void> {
    if (!this.session || !this.storageConfig) {
      throw new Error('Orchestrator not properly initialized');
    }

    this.updateAdapterStatus(AdapterState.INITIALIZING, false);

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
      try {
        logger.debug('Initializing storage adapter', {
          attempt,
          maxRetries: options.maxRetries,
          storageType: this.storageConfig.type,
        });

        // Create adapter using factory
        this.adapter = await storageAdapterFactory.createAdapter(this.storageConfig);

        // Initialize adapter with session
        await this.adapter.initialize(this.session);

        // Verify adapter is healthy, but allow unhealthy adapters for recovery scenarios
        const healthCheck = await this.adapter.healthCheck();
        if (!healthCheck.healthy) {
          logger.warn('Adapter initialized but unhealthy, will attempt recovery', {
            error: healthCheck.error,
          });
          this.updateAdapterStatus(AdapterState.UNHEALTHY, false, healthCheck.error);
        } else {
          this.updateAdapterStatus(AdapterState.READY, true);
        }

        logger.info('Storage adapter initialized successfully', {
          storageType: this.storageConfig.type,
          attempt,
        });

        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        logger.warn('Storage adapter initialization failed', {
          attempt,
          maxRetries: options.maxRetries,
          error: lastError.message,
          storageType: this.storageConfig.type,
        });

        // Clean up failed adapter
        if (this.adapter) {
          try {
            await this.adapter.close();
          } catch (closeError) {
            logger.warn('Error closing failed adapter', {
              error: closeError instanceof Error ? closeError.message : 'Unknown error',
            });
          }
          this.adapter = null;
        }

        // Wait before retry (unless this is the last attempt)
        if (attempt < options.maxRetries) {
          await this.delay(options.retryDelay);
        }
      }
    }

    // All attempts failed
    this.updateAdapterStatus(AdapterState.ERROR, false,
      `Failed to initialize after ${options.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);

    throw lastError || new Error('Adapter initialization failed');
  }

  /**
   * Attempt to recover from unhealthy state
   */
  private async attemptRecovery(): Promise<void> {
    if (this.closed || !this.adapter || !this.orchestrationConfig.enableAutoRecovery) {
      return;
    }

    try {
      logger.debug('Attempting adapter recovery');

      // Close existing adapter
      await this.adapter.close();
      this.adapter = null;

      // Reinitialize adapter
      await this.initializeAdapter({
        force: true,
        maxRetries: 2, // Fewer retries for recovery
        retryDelay: 2000, // Longer delay for recovery
        timeout: 15000, // Longer timeout for recovery
      });

      logger.info('Adapter recovery successful');
    } catch (error) {
      logger.error('Adapter recovery failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      this.updateAdapterStatus(AdapterState.ERROR, false,
        `Recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update adapter status
   */
  private updateAdapterStatus(state: AdapterState, healthy: boolean, error?: string): void {
    this.adapterStatus = {
      state,
      healthy,
      lastHealthCheck: new Date(),
      error,
      consecutiveFailures: healthy ? 0 : this.adapterStatus.consecutiveFailures,
    };
  }

  /**
   * Start health monitoring timer
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck().catch(error => {
        logger.error('Health monitoring error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, this.orchestrationConfig.healthCheckInterval);
  }

  /**
   * Stop health monitoring timer
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}