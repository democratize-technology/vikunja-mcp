/**
 * StorageStatistics module for comprehensive metrics collection and analysis
 * Extracted from PersistentFilterStorage to provide modular statistics management
 */

import { AsyncMutex } from '../../utils/AsyncMutex';
import { logger } from '../../utils/logger';
import type {
  IStorageStatistics,
  StorageOperationMetrics,
  StoragePerformanceMetrics,
  StorageHistoricalMetrics,
  StorageStatisticsSnapshot,
  StorageStatisticsConfig,
  StorageStatisticsEvents,
  StoragePerformanceAlert,
  StorageAggregatedStatistics,
  StorageTrendAnalysis,
} from './interfaces';

const DEFAULT_CONFIG: StorageStatisticsConfig = {
  enableHistoricalTracking: true,
  retentionHours: 24 * 7, // 7 days
  collectionIntervalMinutes: 5,
  maxDataPoints: 2000,
  enablePerformanceMonitoring: true,
  enableHealthMonitoring: true,
  enableMemoryTracking: true,
  percentilesToTrack: [50, 95, 99],
  errorAggregationEnabled: true,
};

export class StorageStatistics implements IStorageStatistics {
  private config: StorageStatisticsConfig = DEFAULT_CONFIG;
  private initialized = false;

  // Thread safety
  private readonly mutex = new AsyncMutex();

  // Core data storage
  private operations: StorageOperationMetrics[] = [];
  private historicalData: StorageHistoricalMetrics[] = [];
  private alerts: StoragePerformanceAlert[] = [];
  private currentStats: Partial<StorageStatisticsSnapshot> = {};

  // Event handlers
  private eventHandlers: StorageStatisticsEvents = {};

  // Timers and intervals
  private collectionTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;

  // Performance tracking
  private latencies: number[] = [];
  private operationCounts = new Map<string, number>();
  private errorCounts = new Map<string, number>();

  // Health tracking
  private isHealthy = true;
  private lastHealthCheck = Date.now();
  private consecutiveFailures = 0;
  private lastRecoveryTime = 0;

  /**
   * Initialize the statistics collector
   */
  async initialize(config?: Partial<StorageStatisticsConfig>): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      if (this.initialized) {
        logger.debug('StorageStatistics already initialized');
        return;
      }

      this.config = { ...DEFAULT_CONFIG, ...config };

      // Start periodic data collection
      if (this.config.enableHistoricalTracking) {
        this.startPeriodicCollection();
      }

      // Start periodic cleanup
      this.startPeriodicCleanup();

      this.initialized = true;
      logger.info('StorageStatistics initialized', { config: this.config });

    } catch (error) {
      logger.error('Failed to initialize StorageStatistics', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Record a storage operation
   */
  async recordOperation(metrics: StorageOperationMetrics): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      // Complete the operation if not already done
      if (!metrics.endTime) {
        metrics.endTime = Date.now();
        metrics.duration = metrics.endTime - metrics.startTime;
      }

      // Store the operation
      this.operations.push(metrics);

      // Update performance metrics
      if (metrics.duration !== undefined) {
        this.latencies.push(metrics.duration);
      }

      // Update operation counts
      const currentCount = this.operationCounts.get(metrics.operationType) || 0;
      this.operationCounts.set(metrics.operationType, currentCount + 1);

      // Update error counts
      if (!metrics.success && metrics.errorType) {
        const currentErrors = this.errorCounts.get(metrics.errorType) || 0;
        this.errorCounts.set(metrics.errorType, currentErrors + 1);
        this.consecutiveFailures++;
        this.isHealthy = false;
      } else if (metrics.success) {
        if (this.consecutiveFailures > 0) {
          this.consecutiveFailures--;
          if (this.consecutiveFailures === 0) {
            this.isHealthy = true;
            this.lastRecoveryTime = Date.now();
          }
        }
      }

      // Check for performance alerts
      await this.checkPerformanceAlerts(metrics);

      // Trigger event handler
      this.eventHandlers.onOperationCompleted?.(metrics);

      logger.debug('Operation recorded', {
        operationType: metrics.operationType,
        duration: metrics.duration,
        success: metrics.success,
      });

    } catch (error) {
      logger.error('Failed to record operation', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Get current statistics snapshot
   */
  async getSnapshot(): Promise<StorageStatisticsSnapshot> {
    const release = await this.mutex.acquire();
    try {
      this.ensureInitialized();

      const performanceMetrics = this.calculatePerformanceMetrics();
      const storageMetrics = this.currentStats.storageMetrics || {};

      const snapshot: StorageStatisticsSnapshot = {
        sessionId: this.currentStats.sessionId || '',
        storageType: this.currentStats.storageType || 'unknown',
        filterCount: this.currentStats.filterCount || 0,
        createdAt: this.currentStats.createdAt || new Date(),
        lastAccessAt: this.currentStats.lastAccessAt || new Date(),
        lastUpdated: new Date(),
        sessionMetrics: this.calculateSessionMetrics(),
        performanceMetrics,
        storageMetrics,
        historicalData: {
          dataPoints: [...this.historicalData],
          retentionHours: this.config.retentionHours,
          dataPointsCollected: this.historicalData.length,
          lastCollectionTime: this.historicalData.length > 0
            ? this.historicalData[this.historicalData.length - 1].timestamp
            : 0,
          collectionIntervalMinutes: this.config.collectionIntervalMinutes,
        },
        healthMetrics: {
          isHealthy: this.isHealthy,
          lastHealthCheck: this.lastHealthCheck,
          consecutiveFailures: this.consecutiveFailures,
          averageRecoveryTime: this.calculateAverageRecoveryTime(),
        },
        additionalInfo: this.currentStats.additionalInfo,
      };

      return snapshot;

    } catch (error) {
      logger.error('Failed to get statistics snapshot', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Get aggregated statistics for a time period
   */
  async getAggregatedStats(period: 'hour' | 'day' | 'week' | 'month'): Promise<StorageAggregatedStatistics> {
    const release = await this.mutex.acquire();
    try {
      this.ensureInitialized();

      const now = Date.now();
      let periodMs: number;

      switch (period) {
        case 'hour': periodMs = 60 * 60 * 1000; break;
        case 'day': periodMs = 24 * 60 * 60 * 1000; break;
        case 'week': periodMs = 7 * 24 * 60 * 60 * 1000; break;
        case 'month': periodMs = 30 * 24 * 60 * 60 * 1000; break;
      }

      const startTime = now - periodMs;
      const endTime = now;

      // Filter operations within the period
      const periodOperations = this.operations.filter(
        op => op.startTime >= startTime && op.startTime <= endTime
      );

      // Filter historical data within the period
      const periodHistoricalData = this.historicalData.filter(
        data => data.timestamp >= startTime && data.timestamp <= endTime
      );

      const totalOperations = periodOperations.length;
      const totalErrors = periodOperations.filter(op => !op.success).length;
      const errorRate = totalOperations > 0 ? (totalErrors / totalOperations) * 100 : 0;

      const durations = periodOperations
        .filter(op => op.duration !== undefined)
        .map(op => op.duration!);

      const averageLatency = durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : 0;

      const peakLatency = durations.length > 0 ? Math.max(...durations) : 0;

      const durationHours = periodMs / (1000 * 60 * 60);
      const throughput = totalOperations / durationHours;

      // Calculate memory and storage growth
      const memoryGrowth = this.calculateGrowthRate(
        periodHistoricalData.map(d => d.memoryUsageBytes || 0),
        periodMs
      );

      const storageGrowth = this.calculateGrowthRate(
        periodHistoricalData.map(d => d.storageSize || 0),
        periodMs
      );

      return {
        period,
        startTime,
        endTime,
        totalOperations,
        totalErrors,
        averageLatency,
        peakLatency,
        throughput,
        errorRate,
        memoryGrowth,
        storageGrowth,
        activeSessions: this.countActiveSessions(startTime),
      };

    } catch (error) {
      logger.error('Failed to get aggregated statistics', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Analyze trends for specific metrics
   */
  async analyzeTrend(
    metric: keyof StorageHistoricalMetrics,
    periodHours: number
  ): Promise<StorageTrendAnalysis> {
    const release = await this.mutex.acquire();
    try {
      this.ensureInitialized();

      const now = Date.now();
      const startTime = now - (periodHours * 60 * 60 * 1000);

      const relevantData = this.historicalData.filter(
        data => data.timestamp >= startTime
      );

      if (relevantData.length < 2) {
        throw new Error(`Insufficient data for trend analysis. Need at least 2 data points, got ${relevantData.length}`);
      }

      const values = relevantData.map(d => d[metric] as number).filter(v => !isNaN(v));

      if (values.length < 2) {
        throw new Error(`Insufficient valid data points for metric ${String(metric)}`);
      }

      // Calculate linear regression for trend
      const trend = this.calculateLinearTrend(values);
      const trendStrength = Math.abs(trend.slope);
      const changeRate = trend.slope;

      // Determine trend direction
      let trendDirection: 'increasing' | 'decreasing' | 'stable' | 'volatile';
      if (Math.abs(trend.slope) < 0.01) {
        trendDirection = 'stable';
      } else if (trend.slope > 0) {
        trendDirection = 'increasing';
      } else {
        trendDirection = 'decreasing';
      }

      // Check for volatility
      const volatility = this.calculateVolatility(values);
      if (volatility > 0.3) {
        trendDirection = 'volatile';
      }

      // Detect seasonality (basic implementation)
      const seasonality = await this.detectSeasonality(relevantData, values);

      // Simple prediction
      const nextValue = trend.intercept + trend.slope * (values.length + 1);
      const confidence = Math.max(0, Math.min(1, 1 - volatility));

      return {
        metric,
        period: periodHours,
        trend: trendDirection,
        trendStrength,
        changeRate,
        seasonality,
        prediction: {
          nextValue,
          confidence,
        },
      };

    } catch (error) {
      logger.error('Failed to analyze trend', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Get performance alerts
   */
  async getAlerts(severity?: 'info' | 'warning' | 'critical'): Promise<StoragePerformanceAlert[]> {
    const release = await this.mutex.acquire();
    try {
      let filteredAlerts = [...this.alerts];

      if (severity) {
        filteredAlerts = filteredAlerts.filter(alert => alert.severity === severity);
      }

      // Sort by timestamp (most recent first)
      return filteredAlerts.sort((a, b) => b.timestamp - a.timestamp);

    } catch (error) {
      logger.error('Failed to get alerts', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Update storage statistics (filter count, memory usage, etc.)
   */
  async updateStorageStats(
    filterCount: number,
    storageMetrics?: Partial<StorageStatisticsSnapshot['storageMetrics']>,
    sessionId?: string,
    storageType?: string
  ): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.ensureInitialized();

      // Set basic info if not already set
      if (sessionId && !this.currentStats.sessionId) {
        this.currentStats.sessionId = sessionId;
      }
      if (storageType && !this.currentStats.storageType) {
        this.currentStats.storageType = storageType;
      }
      if (!this.currentStats.createdAt) {
        this.currentStats.createdAt = new Date();
      }

      this.currentStats.filterCount = filterCount;

      if (storageMetrics) {
        this.currentStats.storageMetrics = {
          ...this.currentStats.storageMetrics,
          ...storageMetrics,
        };
      }

      this.currentStats.lastAccessAt = new Date();

      logger.debug('Storage statistics updated', { filterCount, storageMetrics });

    } catch (error) {
      logger.error('Failed to update storage statistics', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Configure statistics collection
   */
  async configure(config: Partial<StorageStatisticsConfig>): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const oldConfig = { ...this.config };
      this.config = { ...this.config, ...config };

      // Restart periodic tasks if intervals changed
      if (config.collectionIntervalMinutes &&
          config.collectionIntervalMinutes !== oldConfig.collectionIntervalMinutes) {
        this.stopPeriodicCollection();
        if (this.config.enableHistoricalTracking) {
          this.startPeriodicCollection();
        }
      }

      if (config.retentionHours &&
          config.retentionHours !== oldConfig.retentionHours) {
        // Cleanup will happen on next scheduled run
      }

      logger.info('StorageStatistics configuration updated', { config: this.config });

    } catch (error) {
      logger.error('Failed to configure StorageStatistics', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Clean up old data according to retention policy
   */
  async cleanup(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const cutoffTime = Date.now() - (this.config.retentionHours * 60 * 60 * 1000);

      // Clean historical data
      const beforeHistorical = this.historicalData.length;
      this.historicalData = this.historicalData.filter(data => data.timestamp > cutoffTime);
      const historicalRemoved = beforeHistorical - this.historicalData.length;

      // Clean operations data
      const beforeOperations = this.operations.length;
      this.operations = this.operations.filter(op => op.startTime > cutoffTime);
      const operationsRemoved = beforeOperations - this.operations.length;

      // Clean old alerts (keep only last 100)
      if (this.alerts.length > 100) {
        this.alerts = this.alerts.slice(-100);
      }

      // Keep only recent latencies for percentile calculations
      if (this.latencies.length > 10000) {
        this.latencies = this.latencies.slice(-5000);
      }

      if (historicalRemoved > 0 || operationsRemoved > 0) {
        logger.debug('Storage statistics cleanup completed', {
          historicalDataRemoved: historicalRemoved,
          operationsRemoved: operationsRemoved,
          cutoffTime,
        });
      }

    } catch (error) {
      logger.error('Failed to cleanup storage statistics', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Export statistics data
   */
  async exportData(format: 'json' | 'csv'): Promise<string> {
    const release = await this.mutex.acquire();
    try {
      this.ensureInitialized();

      const snapshot = await this.getSnapshot();

      if (format === 'json') {
        return JSON.stringify(snapshot, null, 2);
      }

      if (format === 'csv') {
        return this.convertToCSV(snapshot);
      }

      throw new Error(`Unsupported export format: ${format}`);

    } catch (error) {
      logger.error('Failed to export statistics data', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Reset all statistics
   */
  async reset(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.operations = [];
      this.historicalData = [];
      this.alerts = [];
      this.latencies = [];
      this.operationCounts.clear();
      this.errorCounts.clear();
      this.currentStats = {};
      this.isHealthy = true;
      this.consecutiveFailures = 0;

      logger.info('StorageStatistics reset');

    } catch (error) {
      logger.error('Failed to reset storage statistics', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Close and clean up resources
   */
  async close(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.stopPeriodicCollection();
      this.stopPeriodicCleanup();

      // Don't call reset() as it may cause issues, just clear data directly
      this.operations = [];
      this.historicalData = [];
      this.alerts = [];
      this.latencies = [];
      this.operationCounts.clear();
      this.errorCounts.clear();
      this.currentStats = {};
      this.isHealthy = true;
      this.consecutiveFailures = 0;
      this.initialized = false;

      logger.info('StorageStatistics closed');

    } catch (error) {
      logger.error('Failed to close StorageStatistics', error);
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Register event handlers
   */
  on(events: StorageStatisticsEvents): void {
    this.eventHandlers = { ...this.eventHandlers, ...events };
  }

  // Private helper methods

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('StorageStatistics not initialized. Call initialize() first.');
    }
  }

  private calculatePerformanceMetrics(): StoragePerformanceMetrics {
    const totalOperations = this.operations.length;
    const successfulOperations = this.operations.filter(op => op.success).length;
    const totalDuration = this.operations
      .filter(op => op.duration !== undefined)
      .reduce((sum, op) => sum + op.duration!, 0);

    const averageLatency = totalOperations > 0 ? totalDuration / totalOperations : 0;
    const successRate = totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 100;
    const errorRate = 100 - successRate;

    const durations = this.operations
      .filter(op => op.duration !== undefined)
      .map(op => op.duration!)
      .sort((a, b) => a - b);

    const minLatency = durations.length > 0 ? durations[0] : 0;
    const maxLatency = durations.length > 0 ? durations[durations.length - 1] : 0;

    const p50Latency = this.calculatePercentile(durations, 50);
    const p95Latency = this.calculatePercentile(durations, 95);
    const p99Latency = this.calculatePercentile(durations, 99);

    const operationsByType: Record<string, number> = {};
    for (const [type, count] of this.operationCounts) {
      operationsByType[type] = count;
    }

    const errorsByType: Record<string, number> = {};
    for (const [type, count] of this.errorCounts) {
      errorsByType[type] = count;
    }

    const sessionStart = this.currentStats.createdAt?.getTime() || this.operations.reduce((min, op) => Math.min(min, op.startTime), Date.now());
    const durationHours = (Date.now() - sessionStart) / (1000 * 60 * 60);
    const throughput = durationHours > 0 ? totalOperations / durationHours : 0;

    return {
      totalOperations,
      totalDuration,
      averageLatency,
      minLatency,
      maxLatency,
      p50Latency,
      p95Latency,
      p99Latency,
      operationsByType,
      successRate,
      errorRate,
      errorsByType,
      throughput,
    };
  }

  private calculateSessionMetrics(): StorageStatisticsSnapshot['sessionMetrics'] {
    const now = Date.now();
    const createdAt = this.currentStats.createdAt?.getTime() || now;
    const lastAccessAt = this.currentStats.lastAccessAt?.getTime() || now;

    const sessionDuration = now - createdAt;
    const averageAccessInterval = this.operations.length > 1
      ? sessionDuration / (this.operations.length - 1)
      : sessionDuration;

    const operationsSinceLastAccess = this.operations.filter(
      op => op.startTime > lastAccessAt
    ).length;

    return {
      totalOperations: this.operations.length,
      operationsSinceLastAccess,
      averageAccessInterval,
      sessionDuration,
    };
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }

  private async checkPerformanceAlerts(metrics: StorageOperationMetrics): Promise<void> {
    const alerts: StoragePerformanceAlert[] = [];
    const now = Date.now();

    // Check for high latency
    if (metrics.duration && metrics.duration > 5000) { // 5 seconds
      alerts.push({
        type: 'high_latency',
        severity: metrics.duration > 10000 ? 'critical' : 'warning',
        message: `High latency detected: ${metrics.duration}ms`,
        threshold: 5000,
        currentValue: metrics.duration,
        timestamp: now,
        recommendation: 'Consider optimizing the operation or checking system resources',
      });
    }

    // Check for error spike
    const recentOperations = this.operations.filter(op => now - op.startTime < 60000); // Last minute
    const recentErrors = recentOperations.filter(op => !op.success);
    const recentErrorRate = recentOperations.length > 0 ? (recentErrors.length / recentOperations.length) * 100 : 0;

    if (recentErrorRate > 20) { // 20% error rate
      alerts.push({
        type: 'error_spike',
        severity: recentErrorRate > 50 ? 'critical' : 'warning',
        message: `High error rate detected: ${recentErrorRate.toFixed(1)}%`,
        threshold: 20,
        currentValue: recentErrorRate,
        timestamp: now,
        recommendation: 'Investigate recent failures and check system health',
      });
    }

    // Add alerts to the collection
    for (const alert of alerts) {
      this.alerts.push(alert);
      this.eventHandlers.onPerformanceAlert?.(alert);

      logger.warn('Storage performance alert', alert);
    }
  }

  private startPeriodicCollection(): void {
    this.collectionTimer = setInterval(async () => {
      try {
        await this.collectHistoricalData();
      } catch (error) {
        logger.error('Failed to collect historical data', error);
      }
    }, this.config.collectionIntervalMinutes * 60 * 1000);
    // Don't prevent the process from exiting
    if (this.collectionTimer.unref) {
      this.collectionTimer.unref();
    }
  }

  private stopPeriodicCollection(): void {
    if (this.collectionTimer) {
      clearInterval(this.collectionTimer);
      this.collectionTimer = undefined;
    }
  }

  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanup();
      } catch (error) {
        logger.error('Failed to cleanup storage statistics', error);
      }
    }, 60 * 60 * 1000); // Run every hour
    // Don't prevent the process from exiting
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  private stopPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  private async collectHistoricalData(): Promise<void> {
    const now = Date.now();
    const recentOperations = this.operations.filter(op => now - op.startTime < 300000); // Last 5 minutes

    const dataPoint: StorageHistoricalMetrics = {
      timestamp: now,
      filterCount: this.currentStats.filterCount || 0,
      memoryUsageBytes: this.currentStats.storageMetrics?.memoryUsageBytes,
      operationCount: recentOperations.length,
      errorCount: recentOperations.filter(op => !op.success).length,
      averageLatency: recentOperations.length > 0
        ? recentOperations.reduce((sum, op) => sum + (op.duration || 0), 0) / recentOperations.length
        : 0,
      storageSize: this.currentStats.storageMetrics?.storageSizeBytes,
      activeSessionCount: 1, // This would need to be enhanced for multi-session support
    };

    this.historicalData.push(dataPoint);

    // Enforce max data points limit
    if (this.historicalData.length > this.config.maxDataPoints) {
      this.historicalData = this.historicalData.slice(-this.config.maxDataPoints);
    }

    this.eventHandlers.onHistoricalDataCollected?.(dataPoint);
  }

  private calculateLinearTrend(values: number[]): { slope: number; intercept: number } {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return mean > 0 ? stdDev / mean : 0;
  }

  private async detectSeasonality(
    historicalData: StorageHistoricalMetrics[],
    values: number[]
  ): Promise<StorageTrendAnalysis['seasonality']> {
    // Simple seasonality detection - can be enhanced with more sophisticated algorithms
    if (values.length < 24) return undefined; // Need at least 24 data points for daily pattern

    // Check for daily patterns (24 data points)
    const dailyStrength = this.calculateSeasonalityStrength(values, 24);

    // Check for weekly patterns (7 * 24 = 168 data points)
    const weeklyStrength = values.length >= 168 ? this.calculateSeasonalityStrength(values, 168) : 0;

    if (dailyStrength > 0.7) {
      return {
        pattern: 'daily',
        strength: dailyStrength,
      };
    }

    if (weeklyStrength > 0.7) {
      return {
        pattern: 'weekly',
        strength: weeklyStrength,
      };
    }

    return undefined;
  }

  private calculateSeasonalityStrength(values: number[], period: number): number {
    if (values.length < period * 2) return 0;

    const periods = Math.floor(values.length / period);
    let correlationSum = 0;

    for (let i = 0; i < periods - 1; i++) {
      const period1 = values.slice(i * period, (i + 1) * period);
      const period2 = values.slice((i + 1) * period, (i + 2) * period);

      const correlation = this.calculateCorrelation(period1, period2);
      correlationSum += correlation;
    }

    return correlationSum / (periods - 1);
  }

  private calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;

    const meanX = x.reduce((sum, val) => sum + val, 0) / x.length;
    const meanY = y.reduce((sum, val) => sum + val, 0) / y.length;

    let numerator = 0;
    let sumXSquared = 0;
    let sumYSquared = 0;

    for (let i = 0; i < x.length; i++) {
      const diffX = x[i] - meanX;
      const diffY = y[i] - meanY;
      numerator += diffX * diffY;
      sumXSquared += diffX * diffX;
      sumYSquared += diffY * diffY;
    }

    const denominator = Math.sqrt(sumXSquared * sumYSquared);
    return denominator === 0 ? 0 : numerator / denominator;
  }

  private calculateGrowthRate(values: number[], periodMs: number): number {
    if (values.length < 2) return 0;

    const firstValue = values[0];
    const lastValue = values[values.length - 1];

    if (firstValue === 0) return 0;

    const growth = ((lastValue - firstValue) / firstValue) * 100;
    const hours = periodMs / (1000 * 60 * 60);

    return growth / hours; // Growth per hour
  }

  private countActiveSessions(startTime: number): number {
    // This would need to be enhanced for multi-session support
    // For now, return 1 if there are recent operations
    const recentOperations = this.operations.filter(op => op.startTime >= startTime);
    return recentOperations.length > 0 ? 1 : 0;
  }

  private calculateAverageRecoveryTime(): number {
    // Simple implementation - can be enhanced with actual recovery tracking
    return this.lastRecoveryTime > 0 ? Date.now() - this.lastRecoveryTime : 0;
  }

  private convertToCSV(snapshot: StorageStatisticsSnapshot): string {
    const headers = [
      'metric', 'value', 'unit', 'timestamp'
    ];

    const rows = [
      ['filter_count', snapshot.filterCount.toString(), 'count', Date.now().toString()],
      ['total_operations', snapshot.performanceMetrics.totalOperations.toString(), 'count', Date.now().toString()],
      ['average_latency', snapshot.performanceMetrics.averageLatency.toString(), 'ms', Date.now().toString()],
      ['success_rate', snapshot.performanceMetrics.successRate.toString(), '%', Date.now().toString()],
      ['error_rate', snapshot.performanceMetrics.errorRate.toString(), '%', Date.now().toString()],
      ['throughput', snapshot.performanceMetrics.throughput.toString(), 'ops/hour', Date.now().toString()],
    ];

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
}