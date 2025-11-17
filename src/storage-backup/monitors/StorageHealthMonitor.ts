/**
 * Storage Health Monitor Implementation
 *
 * This module provides comprehensive health monitoring for storage adapters with
 * configurable check strategies, performance metrics, trend analysis, and alerting.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';
import { AsyncMutex } from '../../utils/AsyncMutex';
import type { StorageAdapter } from '../interfaces';
import {
  DEFAULT_HEALTH_MONITOR_CONFIG,
  type IStorageHealthMonitor,
  type HealthMonitorConfig,
  type HealthCheckResult,
  HealthStatus,
  type HealthTrend,
  type HealthMonitorStats,
  type HealthAlert,
  type HealthAlertHandler,
  type HealthMetrics,
  type HealthCheckStrategy,
  type IHealthCheckStrategy,
} from './interfaces/StorageHealthMonitor';

/**
 * Built-in health check strategies
 */
class PingHealthCheckStrategy implements IHealthCheckStrategy {
  async execute(adapter: StorageAdapter): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
    responseTime: number;
  }> {
    const startTime = Date.now();
    try {
      const result = await adapter.healthCheck();
      const responseTime = Date.now() - startTime;

      return {
        healthy: result.healthy,
        ...(result.error && { error: result.error }),
        ...(result.details && { details: result.details }),
        responseTime,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
      };
    }
  }

  getStrategy(): HealthCheckStrategy {
    return 'ping';
  }
}

class ReadHealthCheckStrategy implements IHealthCheckStrategy {
  async execute(adapter: StorageAdapter): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
    responseTime: number;
  }> {
    const startTime = Date.now();
    try {
      // Try to list filters as a read operation
      await adapter.list();
      const responseTime = Date.now() - startTime;

      return {
        healthy: true,
        responseTime,
        details: { operation: 'list_filters' },
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Read operation failed',
        responseTime: Date.now() - startTime,
      };
    }
  }

  getStrategy(): HealthCheckStrategy {
    return 'read';
  }
}

class WriteHealthCheckStrategy implements IHealthCheckStrategy {
  async execute(adapter: StorageAdapter): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
    responseTime: number;
  }> {
    const startTime = Date.now();
    try {
      // Create a temporary health check filter
      const tempFilter = {
        name: `health_check_${Date.now()}`,
        description: 'Temporary health check filter',
        filter: JSON.stringify({ projectId: 0 }),
        ownerId: 0,
        isGlobal: false,
      };

      const created = await adapter.create(tempFilter);
      const responseTime = Date.now() - startTime;

      // Clean up the test filter
      try {
        await adapter.delete(created.id);
      } catch (cleanupError) {
        logger.warn('Failed to cleanup health check filter', {
          filterId: created.id,
          error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
        });
      }

      return {
        healthy: true,
        responseTime,
        details: {
          operation: 'create_delete_filter',
          filterId: created.id,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Write operation failed',
        responseTime: Date.now() - startTime,
      };
    }
  }

  getStrategy(): HealthCheckStrategy {
    return 'write';
  }
}

class ComprehensiveHealthCheckStrategy implements IHealthCheckStrategy {
  private strategies: IHealthCheckStrategy[] = [
    new PingHealthCheckStrategy(),
    new ReadHealthCheckStrategy(),
    new WriteHealthCheckStrategy(),
  ];

  async execute(adapter: StorageAdapter): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
    responseTime: number;
  }> {
    const startTime = Date.now();
    const results: Array<{
      strategy: HealthCheckStrategy;
      healthy: boolean;
      error?: string;
      responseTime: number;
    }> = [];

    for (const strategy of this.strategies) {
      try {
        const result = await strategy.execute(adapter);
        results.push({
          strategy: strategy.getStrategy(),
          healthy: result.healthy,
          ...(result.error && { error: result.error }),
          responseTime: result.responseTime,
        });
      } catch (error) {
        results.push({
          strategy: strategy.getStrategy(),
          healthy: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          responseTime: 0,
        });
      }
    }

    const totalResponseTime = Date.now() - startTime;
    const allHealthy = results.every(r => r.healthy);
    const failedStrategies = results.filter(r => !r.healthy);

    return {
      healthy: allHealthy,
      ...(!allHealthy && {
        error: `Failed strategies: ${failedStrategies.map(r => r.strategy).join(', ')}`
      }),
      responseTime: totalResponseTime,
      details: {
        strategyResults: results,
        totalResponseTime,
        failedCount: failedStrategies.length,
        successCount: results.length - failedStrategies.length,
      },
    };
  }

  getStrategy(): HealthCheckStrategy {
    return 'comprehensive';
  }
}

/**
 * Storage Health Monitor Implementation
 */
export class StorageHealthMonitor implements IStorageHealthMonitor {
  private adapter: StorageAdapter | null = null;
  private config: HealthMonitorConfig;
  private _isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private startTime = Date.now();

  // Thread safety
  private mutex = new AsyncMutex();

  // Health tracking
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private maxConsecutiveFailures = 0;
  private currentHealth: HealthCheckResult | null = null;
  private lastHealthCheck = 0;

  // History and trends
  private healthHistory: HealthCheckResult[] = [];
  private healthStatistics: HealthMonitorStats;
  private recentAlerts: HealthAlert[] = [];

  // Recovery
  private recoveryAttempts = 0;
  private lastRecoveryAttempt = 0;

  // Alert handlers
  private alertHandlers: Set<HealthAlertHandler> = new Set();

  // Health check strategies
  private strategies: Map<HealthCheckStrategy, IHealthCheckStrategy> = new Map();

  constructor(config?: Partial<HealthMonitorConfig>) {
    this.config = { ...DEFAULT_HEALTH_MONITOR_CONFIG, ...config };
    this.healthStatistics = this.initializeStats();
    this.initializeStrategies();
  }

  private initializeStats(): HealthMonitorStats {
    return {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      currentConsecutiveFailures: 0,
      maxConsecutiveFailures: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      totalRecoveryAttempts: 0,
      successfulRecoveries: 0,
      uptime: 0,
    };
  }

  private initializeStrategies(): void {
    this.strategies.set('ping', new PingHealthCheckStrategy());
    this.strategies.set('read', new ReadHealthCheckStrategy());
    this.strategies.set('write', new WriteHealthCheckStrategy());
    this.strategies.set('comprehensive', new ComprehensiveHealthCheckStrategy());
  }

  async startMonitoring(adapter: StorageAdapter, config?: Partial<HealthMonitorConfig>): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      if (this._isMonitoring) {
        logger.warn('Health monitoring is already active');
        return;
      }

      this.adapter = adapter;
      if (config) {
        this.config = { ...this.config, ...config };
      }

      this._isMonitoring = true;
      this.startTime = Date.now();

      // Start periodic health checks
      this.monitoringInterval = setInterval(() => {
        this.performPeriodicHealthCheck().catch(error => {
          logger.error('Error during periodic health check', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }, this.config.checkInterval);

      // Perform initial health check
      await this.checkHealth();

      logger.debug('Storage health monitoring started', {
        checkInterval: this.config.checkInterval,
        strategy: this.config.defaultStrategy,
        failureThreshold: this.config.failureThreshold,
      });
    } finally {
      release();
    }
  }

  async stopMonitoring(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      if (!this._isMonitoring) {
        return;
      }

      this._isMonitoring = false;

      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval);
        this.monitoringInterval = null;
      }

      this.adapter = null;

      logger.debug('Storage health monitoring stopped');
    } finally {
      release();
    }
  }

  async checkHealth(strategy?: HealthCheckStrategy): Promise<HealthCheckResult> {
    const checkStrategy = strategy || this.config.defaultStrategy;
    const startTime = Date.now();
    const release = await this.mutex.acquire();

    try {
      if (!this.adapter) {
        throw new Error('No storage adapter configured for health monitoring');
      }

      const strategyImpl = this.strategies.get(checkStrategy);
      if (!strategyImpl) {
        throw new Error(`Unknown health check strategy: ${checkStrategy}`);
      }

      // Perform health check
      const startTime = Date.now();
      const strategyResult = await strategyImpl.execute(this.adapter);
      const totalResponseTime = Date.now() - startTime;

      // Update statistics
      this.updateStatistics(strategyResult, totalResponseTime);

      // Determine health status
      const status = this.determineHealthStatus(strategyResult, totalResponseTime);

      // Create health check result
      const healthResult: HealthCheckResult = {
        status,
        healthy: status === HealthStatus.HEALTHY,
        ...(strategyResult.error && { error: strategyResult.error }),
        strategy: checkStrategy,
        metrics: {
          responseTime: totalResponseTime,
          timestamp: new Date(),
          strategy: checkStrategy,
          ...(strategyResult.details && {
            adapterMetrics: strategyResult.details as Record<string, number>
          }),
        },
        details: {
          ...strategyResult.details,
          consecutiveFailures: this.consecutiveFailures,
          uptime: Date.now() - this.startTime,
        },
        consecutiveFailures: this.consecutiveFailures,
        ...(this.healthStatistics.lastSuccessfulCheck && {
          timeSinceLastSuccess: Date.now() - this.healthStatistics.lastSuccessfulCheck.getTime()
        }),
      };

      // Update tracking
      this.currentHealth = healthResult;
      this.lastHealthCheck = Date.now();
      this.addToHistory(healthResult);

      // Handle health state changes
      await this.handleHealthStateChange(healthResult);

      // Log health check
      if (this.config.enableDebugLogging || !healthResult.healthy) {
        logger.debug('Health check completed', {
          strategy: checkStrategy,
          status,
          healthy: healthResult.healthy,
          responseTime: totalResponseTime,
          consecutiveFailures: this.consecutiveFailures,
          error: healthResult.error,
        });
      }

      return healthResult;
    } catch (error) {
      const failureResult: HealthCheckResult = {
        status: HealthStatus.UNHEALTHY,
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        strategy: checkStrategy,
        metrics: {
          responseTime: Date.now() - startTime,
          timestamp: new Date(),
          strategy: checkStrategy,
        },
        consecutiveFailures: ++this.consecutiveFailures,
        details: {
          unexpectedError: true,
        },
      };

      this.currentHealth = failureResult;
      this.addToHistory(failureResult);
      this.updateFailureStatistics();

      logger.error('Health check failed unexpectedly', {
        strategy: checkStrategy,
        error: error instanceof Error ? error.message : 'Unknown error',
        consecutiveFailures: this.consecutiveFailures,
      });

      return failureResult;
    } finally {
      release();
    }
  }

  getCurrentHealth(): HealthCheckResult | null {
    // Check if cached health is still valid
    if (this.currentHealth && this.config.healthCacheTTL > 0) {
      const age = Date.now() - this.currentHealth.metrics.timestamp.getTime();
      if (age < this.config.healthCacheTTL) {
        return this.currentHealth;
      }
    }
    return null;
  }

  getHealthTrend(): HealthTrend | null {
    if (this.healthHistory.length === 0) {
      return null;
    }

    const windowSize = Math.min(this.config.trendWindowSize, this.healthHistory.length);
    const recentHistory = this.healthHistory.slice(-windowSize);

    const statusHistory = recentHistory.map(result => ({
      status: result.status,
      timestamp: result.metrics.timestamp,
      responseTime: result.metrics.responseTime,
    }));

    const averageResponseTime = recentHistory.reduce((sum, result) => sum + result.metrics.responseTime, 0) / recentHistory.length;
    const successCount = recentHistory.filter(result => result.healthy).length;
    const successRate = (successCount / recentHistory.length) * 100;

    // Determine trend direction
    const trendDirection = this.calculateTrendDirection(recentHistory);

    // Predict future status based on trend
    const predictedStatus = this.predictHealthStatus(trendDirection, successRate);

    return {
      currentStatus: this.currentHealth?.status || HealthStatus.UNKNOWN,
      statusHistory,
      averageResponseTime,
      successRate,
      trendDirection,
      ...(predictedStatus && { predictedStatus }),
    };
  }

  getStats(): HealthMonitorStats {
    return {
      ...this.healthStatistics,
      currentConsecutiveFailures: this.consecutiveFailures,
      maxConsecutiveFailures: this.maxConsecutiveFailures,
      uptime: Date.now() - this.startTime,
    };
  }

  onAlert(handler: HealthAlertHandler): void {
    this.alertHandlers.add(handler);
  }

  removeAlertHandler(handler: HealthAlertHandler): void {
    this.alertHandlers.delete(handler);
  }

  async forceRecovery(): Promise<boolean> {
    if (!this.adapter || !this.config.enableAutoRecovery) {
      return false;
    }

    const release = await this.mutex.acquire();
    try {
      this.recoveryAttempts++;
      this.lastRecoveryAttempt = Date.now();
      this.healthStatistics.totalRecoveryAttempts++;

      logger.debug('Attempting forced recovery', {
        attempt: this.recoveryAttempts,
        maxAttempts: this.config.maxRecoveryAttempts,
      });

      // Try different recovery strategies
      const recoveryStrategies = [
        () => this.adapter!.healthCheck(),
        () => this.adapter!.list(),
      ];

      for (const strategy of recoveryStrategies) {
        try {
          await strategy();

          // Recovery successful
          this.consecutiveFailures = 0;
          this.consecutiveSuccesses = this.config.recoveryThreshold;
          this.healthStatistics.successfulRecoveries++;

          await this.createAlert({
            type: 'recovery',
            severity: 'medium',
            message: `Storage adapter recovery successful after ${this.recoveryAttempts} attempts`,
            data: {
              recoveryAttempts: this.recoveryAttempts,
              timeSinceLastFailure: Date.now() - (this.healthStatistics.lastFailedCheck?.getTime() || 0),
            },
          });

          this.recoveryAttempts = 0;
          return true;
        } catch (error) {
          logger.debug('Recovery strategy failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // All recovery strategies failed
      if (this.recoveryAttempts >= this.config.maxRecoveryAttempts) {
        logger.error('Maximum recovery attempts reached', {
          attempts: this.recoveryAttempts,
          maxAttempts: this.config.maxRecoveryAttempts,
        });
      }

      return false;
    } finally {
      release();
    }
  }

  resetStats(): void {
    this.healthStatistics = this.initializeStats();
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.maxConsecutiveFailures = 0;
    this.recoveryAttempts = 0;
    this.healthHistory = [];
    this.recentAlerts = [];
    this.currentHealth = null;
  }

  isMonitoring(): boolean {
    return this._isMonitoring;
  }

  getConfig(): HealthMonitorConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<HealthMonitorConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart monitoring if interval changed
    if (this._isMonitoring && config.checkInterval && this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = setInterval(() => {
        this.performPeriodicHealthCheck().catch(error => {
          logger.error('Error during periodic health check', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }, this.config.checkInterval);
    }
  }

  getRecentAlerts(limit: number = 10): HealthAlert[] {
    return this.recentAlerts.slice(-limit);
  }

  // Private helper methods

  private async performPeriodicHealthCheck(): Promise<void> {
    if (!this._isMonitoring || !this.adapter) {
      return;
    }

    try {
      await this.checkHealth();
    } catch (error) {
      logger.error('Periodic health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private determineHealthStatus(
    strategyResult: { healthy: boolean; error?: string },
    responseTime: number
  ): HealthStatus {
    if (!strategyResult.healthy) {
      return HealthStatus.UNHEALTHY;
    }

    if (responseTime > this.config.responseTimeThreshold) {
      return HealthStatus.DEGRADED;
    }

    return HealthStatus.HEALTHY;
  }

  private updateStatistics(
    strategyResult: { healthy: boolean; error?: string },
    responseTime: number
  ): void {
    this.healthStatistics.totalChecks++;

    if (strategyResult.healthy) {
      this.healthStatistics.successfulChecks++;
      this.healthStatistics.lastSuccessfulCheck = new Date();
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses++;
    } else {
      this.healthStatistics.failedChecks++;
      this.healthStatistics.lastFailedCheck = new Date();
      this.consecutiveSuccesses = 0;
      this.consecutiveFailures++;
      this.maxConsecutiveFailures = Math.max(this.maxConsecutiveFailures, this.consecutiveFailures);
    }

    // Update response time statistics
    this.healthStatistics.averageResponseTime =
      (this.healthStatistics.averageResponseTime * (this.healthStatistics.totalChecks - 1) + responseTime) /
      this.healthStatistics.totalChecks;

    this.healthStatistics.minResponseTime = Math.min(this.healthStatistics.minResponseTime, responseTime);
    this.healthStatistics.maxResponseTime = Math.max(this.healthStatistics.maxResponseTime, responseTime);
  }

  private updateFailureStatistics(): void {
    this.healthStatistics.totalChecks++;
    this.healthStatistics.failedChecks++;
    this.healthStatistics.lastFailedCheck = new Date();
    this.consecutiveFailures++;
    this.maxConsecutiveFailures = Math.max(this.maxConsecutiveFailures, this.consecutiveFailures);
  }

  private addToHistory(result: HealthCheckResult): void {
    this.healthHistory.push(result);

    // Keep history size manageable
    const maxHistorySize = this.config.trendWindowSize * 2;
    if (this.healthHistory.length > maxHistorySize) {
      this.healthHistory = this.healthHistory.slice(-maxHistorySize);
    }
  }

  private async handleHealthStateChange(result: HealthCheckResult): Promise<void> {
    const previousStatus = this.healthHistory.length > 1
      ? this.healthHistory[this.healthHistory.length - 2]?.status ?? HealthStatus.UNKNOWN
      : HealthStatus.UNKNOWN;

    // Handle failure threshold exceeded
    if (this.consecutiveFailures >= this.config.failureThreshold && result.status !== HealthStatus.HEALTHY) {
      await this.createAlert({
        type: 'health_failure',
        severity: this.consecutiveFailures >= this.config.failureThreshold * 2 ? 'critical' : 'high',
        message: `Storage adapter health check failed ${this.consecutiveFailures} consecutive times`,
        healthResult: result,
      });

      // Attempt auto-recovery if enabled
      if (this.config.enableAutoRecovery && this.recoveryAttempts < this.config.maxRecoveryAttempts) {
        await this.forceRecovery();
      }
    }

    // Handle recovery
    if (this.consecutiveSuccesses >= this.config.recoveryThreshold && previousStatus !== HealthStatus.HEALTHY) {
      await this.createAlert({
        type: 'recovery',
        severity: 'medium',
        message: `Storage adapter recovered after ${this.consecutiveSuccesses} consecutive successful checks`,
        healthResult: result,
      });
    }

    // Handle performance degradation
    if (result.metrics.responseTime > this.config.responseTimeThreshold && result.healthy) {
      await this.createAlert({
        type: 'performance_degradation',
        severity: 'low',
        message: `Storage adapter response time ${result.metrics.responseTime}ms exceeds threshold ${this.config.responseTimeThreshold}ms`,
        healthResult: result,
      });
    }

    // Handle trend warnings
    const trend = this.getHealthTrend();
    if (trend && trend.trendDirection === 'degrading' && trend.successRate < 70) {
      await this.createAlert({
        type: 'trend_warning',
        severity: 'medium',
        message: `Storage adapter health trending downward with ${trend.successRate.toFixed(1)}% success rate`,
        healthResult: result,
        data: { trend },
      });
    }
  }

  private async createAlert(alertData: Omit<HealthAlert, 'id' | 'timestamp'>): Promise<void> {
    const alert: HealthAlert = {
      id: uuidv4(),
      timestamp: new Date(),
      ...alertData,
    };

    this.recentAlerts.push(alert);

    // Keep recent alerts manageable
    if (this.recentAlerts.length > 100) {
      this.recentAlerts = this.recentAlerts.slice(-100);
    }

    // Notify alert handlers
    const handlerPromises = Array.from(this.alertHandlers).map(async handler => {
      try {
        await handler(alert);
      } catch (error) {
        logger.error('Health alert handler failed', {
          alertId: alert.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    await Promise.allSettled(handlerPromises);

    logger.debug('Health alert created', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
    });
  }

  private calculateTrendDirection(history: HealthCheckResult[]): 'improving' | 'stable' | 'degrading' {
    if (history.length < 3) {
      return 'stable';
    }

    // Compare first half with second half
    const midpoint = Math.floor(history.length / 2);
    const firstHalf = history.slice(0, midpoint);
    const secondHalf = history.slice(midpoint);

    const firstHalfSuccessRate = firstHalf.filter(r => r.healthy).length / firstHalf.length;
    const secondHalfSuccessRate = secondHalf.filter(r => r.healthy).length / secondHalf.length;

    const firstHalfAvgResponseTime = firstHalf.reduce((sum, r) => sum + r.metrics.responseTime, 0) / firstHalf.length;
    const secondHalfAvgResponseTime = secondHalf.reduce((sum, r) => sum + r.metrics.responseTime, 0) / secondHalf.length;

    const successRateChange = secondHalfSuccessRate - firstHalfSuccessRate;
    const responseTimeChange = secondHalfAvgResponseTime - firstHalfAvgResponseTime;

    // Determine trend based on combined factors
    if (successRateChange > 0.1 && responseTimeChange < -100) {
      return 'improving';
    } else if (successRateChange < -0.1 || responseTimeChange > 200) {
      return 'degrading';
    } else {
      return 'stable';
    }
  }

  private predictHealthStatus(
    trendDirection: 'improving' | 'stable' | 'degrading',
    currentSuccessRate: number
  ): HealthStatus | undefined {
    if (trendDirection === 'improving' && currentSuccessRate > 80) {
      return HealthStatus.HEALTHY;
    } else if (trendDirection === 'degrading' && currentSuccessRate < 50) {
      return HealthStatus.UNHEALTHY;
    } else if (trendDirection === 'degrading' && currentSuccessRate < 70) {
      return HealthStatus.DEGRADED;
    }

    return undefined; // No clear prediction
  }
}