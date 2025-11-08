/**
 * Storage adapter orchestrator interfaces
 *
 * This module defines interfaces for coordinating storage adapter operations,
 * lifecycle management, and health monitoring integration points.
 */

import type { StorageAdapter, StorageConfig, StorageSession } from '../interfaces';

/**
 * Adapter lifecycle state
 */
export enum AdapterState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  UNHEALTHY = 'unhealthy',
  ERROR = 'error',
  CLOSED = 'closed',
}

/**
 * Adapter health and status information
 */
export interface AdapterStatus {
  /** Current adapter state */
  state: AdapterState;
  /** Whether the adapter is healthy */
  healthy: boolean;
  /** Last health check timestamp */
  lastHealthCheck: Date;
  /** Error information if adapter is in error state */
  error: string | undefined;
  /** Additional health details */
  details?: Record<string, unknown>;
  /** Number of consecutive health failures */
  consecutiveFailures: number;
}

/**
 * Adapter initialization options
 */
export interface AdapterInitializationOptions {
  /** Force reinitialization even if already initialized */
  force?: boolean;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Delay between retry attempts in milliseconds */
  retryDelay?: number;
  /** Timeout for initialization in milliseconds */
  timeout?: number;
}

/**
 * Adapter orchestration configuration
 */
export interface OrchestrationConfig {
  /** Health check interval in milliseconds */
  healthCheckInterval?: number;
  /** Maximum consecutive failures before fallback */
  maxConsecutiveFailures?: number;
  /** Enable automatic recovery on health failures */
  enableAutoRecovery?: boolean;
  /** Grace period before marking adapter as unhealthy (ms) */
  healthGracePeriod?: number;
}

/**
 * Storage adapter orchestrator interface
 *
 * This orchestrator manages storage adapter lifecycle, coordinates
 * adapter factory operations, and provides health monitoring integration.
 */
export interface StorageAdapterOrchestrator {
  /**
   * Initialize the orchestrator with configuration
   * @param session Storage session information
   * @param config Orchestration configuration
   */
  initialize(session: StorageSession, config?: OrchestrationConfig): Promise<void>;

  /**
   * Get or create a storage adapter instance
   * @param options Initialization options
   * @returns Storage adapter instance
   */
  getAdapter(options?: AdapterInitializationOptions): Promise<StorageAdapter>;

  /**
   * Force reinitialization of the storage adapter
   * @param options Reinitialization options
   */
  reinitializeAdapter(options?: AdapterInitializationOptions): Promise<void>;

  /**
   * Get current adapter status and health information
   * @returns Adapter status information
   */
  getAdapterStatus(): AdapterStatus;

  /**
   * Perform health check on the managed adapter
   * @returns Health check result
   */
  performHealthCheck(): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }>;

  /**
   * Close the orchestrator and clean up resources
   */
  close(): Promise<void>;

  /**
   * Get storage session information
   * @returns Storage session
   */
  getSession(): StorageSession;

  /**
   * Get storage configuration
   * @returns Storage configuration
   */
  getStorageConfig(): StorageConfig;
}