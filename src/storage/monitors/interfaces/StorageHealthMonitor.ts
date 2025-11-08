/**
 * Storage health monitor interfaces
 *
 * This module defines interfaces for comprehensive health monitoring of storage adapters,
 * including configurable check strategies, performance metrics, and trend analysis.
 */

import type { StorageAdapter } from '../../interfaces';

/**
 * Health check strategies that can be performed on storage adapters
 */
export type HealthCheckStrategy = 'ping' | 'read' | 'write' | 'comprehensive';

/**
 * Health status levels for storage adapters
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

/**
 * Performance metrics collected during health checks
 */
export interface HealthMetrics {
  /** Response time in milliseconds */
  responseTime: number;
  /** Check timestamp */
  timestamp: Date;
  /** Health check strategy used */
  strategy: HealthCheckStrategy;
  /** Additional adapter-specific metrics */
  adapterMetrics?: Record<string, number>;
}

/**
 * Health check result with comprehensive information
 */
export interface HealthCheckResult {
  /** Overall health status */
  status: HealthStatus;
  /** Whether the adapter is considered healthy */
  healthy: boolean;
  /** Error message if health check failed */
  error?: string;
  /** Health check strategy used */
  strategy: HealthCheckStrategy;
  /** Performance metrics */
  metrics: HealthMetrics;
  /** Additional details */
  details?: Record<string, unknown>;
  /** Consecutive failure count */
  consecutiveFailures: number;
  /** Time since last successful check */
  timeSinceLastSuccess?: number;
}

/**
 * Health trend analysis data
 */
export interface HealthTrend {
  /** Current health status */
  currentStatus: HealthStatus;
  /** Health status over time (chronological) */
  statusHistory: Array<{
    status: HealthStatus;
    timestamp: Date;
    responseTime: number;
  }>;
  /** Average response time over the trend window */
  averageResponseTime: number;
  /** Success rate percentage over the trend window */
  successRate: number;
  /** Health trend direction ('improving', 'stable', 'degrading') */
  trendDirection: 'improving' | 'stable' | 'degrading';
  /** Predicted health status based on trend */
  predictedStatus?: HealthStatus;
}

/**
 * Health monitoring configuration
 */
export interface HealthMonitorConfig {
  /** Health check interval in milliseconds */
  checkInterval: number;
  /** Consecutive failures before marking as unhealthy */
  failureThreshold: number;
  /** Consecutive successes before marking as healthy again */
  recoveryThreshold: number;
  /** Maximum response time in milliseconds before marking as degraded */
  responseTimeThreshold: number;
  /** Size of trend analysis window (number of recent checks) */
  trendWindowSize: number;
  /** Cache health status for TTL milliseconds */
  healthCacheTTL: number;
  /** Default health check strategy */
  defaultStrategy: HealthCheckStrategy;
  /** Enable automatic recovery attempts */
  enableAutoRecovery: boolean;
  /** Maximum recovery attempts before giving up */
  maxRecoveryAttempts: number;
  /** Enable detailed logging */
  enableDebugLogging: boolean;
}

/**
 * Default health monitoring configuration
 */
export const DEFAULT_HEALTH_MONITOR_CONFIG: HealthMonitorConfig = {
  checkInterval: 30000, // 30 seconds
  failureThreshold: 3,
  recoveryThreshold: 2,
  responseTimeThreshold: 1000, // 1 second
  trendWindowSize: 20,
  healthCacheTTL: 5000, // 5 seconds
  defaultStrategy: 'ping',
  enableAutoRecovery: true,
  maxRecoveryAttempts: 3,
  enableDebugLogging: false,
};

/**
 * Health monitoring statistics
 */
export interface HealthMonitorStats {
  /** Total health checks performed */
  totalChecks: number;
  /** Successful health checks */
  successfulChecks: number;
  /** Failed health checks */
  failedChecks: number;
  /** Current consecutive failures */
  currentConsecutiveFailures: number;
  /** Maximum consecutive failures observed */
  maxConsecutiveFailures: number;
  /** Average response time */
  averageResponseTime: number;
  /** Minimum response time */
  minResponseTime: number;
  /** Maximum response time */
  maxResponseTime: number;
  /** Last successful check timestamp */
  lastSuccessfulCheck?: Date;
  /** Last failed check timestamp */
  lastFailedCheck?: Date;
  /** Total recovery attempts */
  totalRecoveryAttempts: number;
  /** Successful recoveries */
  successfulRecoveries: number;
  /** Health monitor uptime in milliseconds */
  uptime: number;
}

/**
 * Health alert information
 */
export interface HealthAlert {
  /** Alert ID */
  id: string;
  /** Alert timestamp */
  timestamp: Date;
  /** Alert type */
  type: 'health_failure' | 'performance_degradation' | 'recovery' | 'trend_warning';
  /** Alert severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Alert message */
  message: string;
  /** Associated health check result */
  healthResult?: HealthCheckResult;
  /** Additional alert data */
  data?: Record<string, unknown>;
}

/**
 * Health alert handler function
 */
export type HealthAlertHandler = (alert: HealthAlert) => void | Promise<void>;

/**
 * Storage health monitor interface
 *
 * This interface provides comprehensive health monitoring capabilities for storage adapters,
 * including periodic checks, trend analysis, performance monitoring, and alerting.
 */
export interface IStorageHealthMonitor {
  /**
   * Start health monitoring for a storage adapter
   * @param adapter Storage adapter to monitor
   * @param config Optional monitoring configuration
   */
  startMonitoring(adapter: StorageAdapter, config?: Partial<HealthMonitorConfig>): Promise<void>;

  /**
   * Stop health monitoring
   */
  stopMonitoring(): Promise<void>;

  /**
   * Perform an immediate health check
   * @param strategy Health check strategy to use
   * @returns Health check result
   */
  checkHealth(strategy?: HealthCheckStrategy): Promise<HealthCheckResult>;

  /**
   * Get current health status (cached if recent)
   * @returns Current health status
   */
  getCurrentHealth(): HealthCheckResult | null;

  /**
   * Get health trend analysis
   * @returns Health trend data
   */
  getHealthTrend(): HealthTrend | null;

  /**
   * Get monitoring statistics
   * @returns Health monitoring statistics
   */
  getStats(): HealthMonitorStats;

  /**
   * Register an alert handler
   * @param handler Alert handler function
   */
  onAlert(handler: HealthAlertHandler): void;

  /**
   * Remove an alert handler
   * @param handler Alert handler function to remove
   */
  removeAlertHandler(handler: HealthAlertHandler): void;

  /**
   * Force health recovery attempt
   * @returns Whether recovery was successful
   */
  forceRecovery(): Promise<boolean>;

  /**
   * Reset health monitoring statistics and history
   */
  resetStats(): void;

  /**
   * Check if monitoring is currently active
   * @returns Whether monitoring is active
   */
  isMonitoring(): boolean;

  /**
   * Get monitoring configuration
   * @returns Current monitoring configuration
   */
  getConfig(): HealthMonitorConfig;

  /**
   * Update monitoring configuration
   * @param config Configuration updates
   */
  updateConfig(config: Partial<HealthMonitorConfig>): void;

  /**
   * Get recent health alerts
   * @param limit Maximum number of alerts to return
   * @returns Recent health alerts
   */
  getRecentAlerts(limit?: number): HealthAlert[];
}

/**
 * Health check strategy executor interface
 *
 * Allows for custom health check strategies to be implemented
 */
export interface IHealthCheckStrategy {
  /**
   * Execute the health check strategy
   * @param adapter Storage adapter to check
   * @returns Health check result with basic information
   */
  execute(adapter: StorageAdapter): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
    responseTime: number;
  }>;

  /**
   * Get strategy name
   */
  getStrategy(): HealthCheckStrategy;
}