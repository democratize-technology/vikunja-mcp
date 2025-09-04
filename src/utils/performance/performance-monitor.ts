/**
 * Performance monitoring and metrics collection for bulk operations
 * Tracks throughput, latency, and efficiency metrics
 */

import { logger } from '../logger';

export interface OperationMetrics {
  operationType: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  itemCount: number;
  successCount: number;
  failureCount: number;
  apiCallCount: number;
  cacheHits: number;
  cacheMisses: number;
  concurrencyLevel: number;
  metadata?: Record<string, unknown>;
}

export interface PerformanceStats {
  totalOperations: number;
  totalDuration: number;
  totalItems: number;
  totalApiCalls: number;
  totalCacheHits: number;
  totalCacheMisses: number;
  averageOperationDuration: number;
  averageItemsPerSecond: number;
  averageApiCallsPerOperation: number;
  cacheHitRatio: number;
  operationSuccessRate: number;
  peakConcurrency: number;
  operationsByType: Record<string, number>;
  recentPerformance: {
    last10Operations: OperationMetrics[];
    averageDurationLast10: number;
    throughputLast10: number;
  };
}

export interface PerformanceAlert {
  type: 'high_latency' | 'low_throughput' | 'high_failure_rate' | 'cache_inefficiency';
  message: string;
  severity: 'warning' | 'critical';
  metrics: Partial<OperationMetrics>;
  timestamp: number;
}

export class PerformanceMonitor {
  private operations: OperationMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private activeOperations = new Map<string, OperationMetrics>();
  
  // Configurable thresholds
  private readonly thresholds = {
    highLatencyMs: 5000,        // 5 seconds
    lowThroughputItemsPerSec: 2, // 2 items per second
    highFailureRatePercent: 20,  // 20% failure rate
    lowCacheHitRatePercent: 30,  // 30% cache hit rate
  };

  /**
   * Start monitoring an operation
   */
  startOperation(
    operationId: string,
    operationType: string,
    itemCount: number,
    concurrencyLevel: number = 1,
    metadata?: Record<string, unknown>
  ): void {
    const metrics: OperationMetrics = {
      operationType,
      startTime: Date.now(),
      itemCount,
      successCount: 0,
      failureCount: 0,
      apiCallCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      concurrencyLevel,
      metadata: metadata || {},
    };

    this.activeOperations.set(operationId, metrics);
    
    logger.debug('Performance monitoring started', {
      operationId,
      operationType,
      itemCount,
      concurrencyLevel,
    });
  }

  /**
   * Update operation progress
   */
  updateOperation(
    operationId: string,
    updates: Partial<Pick<OperationMetrics, 'successCount' | 'failureCount' | 'apiCallCount' | 'cacheHits' | 'cacheMisses'>>
  ): void {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      logger.warn('Attempted to update unknown operation', { operationId });
      return;
    }

    Object.assign(operation, updates);
  }

  /**
   * Increment API call count for an operation
   */
  recordApiCall(operationId: string, count: number = 1): void {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      operation.apiCallCount += count;
    }
  }

  /**
   * Record cache hit for an operation
   */
  recordCacheHit(operationId: string, count: number = 1): void {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      operation.cacheHits += count;
    }
  }

  /**
   * Record cache miss for an operation
   */
  recordCacheMiss(operationId: string, count: number = 1): void {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      operation.cacheMisses += count;
    }
  }

  /**
   * Complete operation monitoring and analyze performance
   */
  completeOperation(operationId: string): OperationMetrics | undefined {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      logger.warn('Attempted to complete unknown operation', { operationId });
      return undefined;
    }

    operation.endTime = Date.now();
    operation.duration = operation.endTime - operation.startTime;

    // Move to completed operations
    this.operations.push(operation);
    this.activeOperations.delete(operationId);

    // Analyze performance and generate alerts if needed
    this.analyzePerformance(operation);

    // Keep only last 1000 operations to prevent memory growth
    if (this.operations.length > 1000) {
      this.operations = this.operations.slice(-1000);
    }

    logger.debug('Performance monitoring completed', {
      operationId,
      operationType: operation.operationType,
      duration: operation.duration,
      itemCount: operation.itemCount,
      apiCalls: operation.apiCallCount,
      successRate: operation.itemCount > 0 ? (operation.successCount / operation.itemCount) * 100 : 0,
    });

    return operation;
  }

  /**
   * Get comprehensive performance statistics
   */
  getStats(): PerformanceStats {
    const totalOperations = this.operations.length;
    if (totalOperations === 0) {
      return this.getEmptyStats();
    }

    const totals = this.operations.reduce(
      (acc, op) => ({
        duration: acc.duration + (op.duration || 0),
        items: acc.items + op.itemCount,
        apiCalls: acc.apiCalls + op.apiCallCount,
        cacheHits: acc.cacheHits + op.cacheHits,
        cacheMisses: acc.cacheMisses + op.cacheMisses,
        successes: acc.successes + op.successCount,
        failures: acc.failures + op.failureCount,
      }),
      { duration: 0, items: 0, apiCalls: 0, cacheHits: 0, cacheMisses: 0, successes: 0, failures: 0 }
    );

    const operationsByType = this.operations.reduce((acc, op) => {
      acc[op.operationType] = (acc[op.operationType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const peakConcurrency = Math.max(...this.operations.map(op => op.concurrencyLevel));
    
    const last10Operations = this.operations.slice(-10);
    const last10Duration = last10Operations.reduce((sum, op) => sum + (op.duration || 0), 0);
    const last10Items = last10Operations.reduce((sum, op) => sum + op.itemCount, 0);

    return {
      totalOperations,
      totalDuration: totals.duration,
      totalItems: totals.items,
      totalApiCalls: totals.apiCalls,
      totalCacheHits: totals.cacheHits,
      totalCacheMisses: totals.cacheMisses,
      averageOperationDuration: totals.duration / totalOperations,
      averageItemsPerSecond: totals.duration > 0 ? (totals.items / (totals.duration / 1000)) : 0,
      averageApiCallsPerOperation: totals.apiCalls / totalOperations,
      cacheHitRatio: (totals.cacheHits + totals.cacheMisses) > 0 
        ? totals.cacheHits / (totals.cacheHits + totals.cacheMisses) 
        : 0,
      operationSuccessRate: totals.items > 0 ? (totals.successes / totals.items) : 0,
      peakConcurrency,
      operationsByType,
      recentPerformance: {
        last10Operations,
        averageDurationLast10: last10Operations.length > 0 ? last10Duration / last10Operations.length : 0,
        throughputLast10: last10Duration > 0 ? (last10Items / (last10Duration / 1000)) : 0,
      },
    };
  }

  /**
   * Get recent performance alerts
   */
  getAlerts(maxAge?: number): PerformanceAlert[] {
    if (!maxAge) {
      return [...this.alerts];
    }

    const cutoff = Date.now() - maxAge;
    return this.alerts.filter(alert => alert.timestamp > cutoff);
  }

  /**
   * Clear all alerts
   */
  clearAlerts(): void {
    this.alerts = [];
  }

  /**
   * Export performance data for analysis
   */
  exportData(): {
    operations: OperationMetrics[];
    alerts: PerformanceAlert[];
    stats: PerformanceStats;
    exportTimestamp: number;
  } {
    return {
      operations: [...this.operations],
      alerts: [...this.alerts],
      stats: this.getStats(),
      exportTimestamp: Date.now(),
    };
  }

  /**
   * Reset all performance data
   */
  reset(): void {
    this.operations = [];
    this.alerts = [];
    this.activeOperations.clear();
    logger.info('Performance monitor reset');
  }

  /**
   * Analyze operation performance and generate alerts
   */
  private analyzePerformance(operation: OperationMetrics): void {
    if (!operation.duration) return;

    // Check for high latency
    if (operation.duration > this.thresholds.highLatencyMs) {
      this.addAlert('high_latency', 'critical', 
        `Operation took ${operation.duration}ms (threshold: ${this.thresholds.highLatencyMs}ms)`,
        operation);
    }

    // Check for low throughput
    const throughput = operation.duration > 0 ? (operation.itemCount / (operation.duration / 1000)) : 0;
    if (throughput < this.thresholds.lowThroughputItemsPerSec && operation.itemCount > 5) {
      this.addAlert('low_throughput', 'warning',
        `Low throughput: ${throughput.toFixed(2)} items/sec (threshold: ${this.thresholds.lowThroughputItemsPerSec})`,
        operation);
    }

    // Check for high failure rate
    const failureRate = operation.itemCount > 0 ? (operation.failureCount / operation.itemCount) * 100 : 0;
    if (failureRate > this.thresholds.highFailureRatePercent && operation.itemCount > 1) {
      this.addAlert('high_failure_rate', 'critical',
        `High failure rate: ${failureRate.toFixed(1)}% (threshold: ${this.thresholds.highFailureRatePercent}%)`,
        operation);
    }

    // Check for cache inefficiency
    const totalCacheOps = operation.cacheHits + operation.cacheMisses;
    const cacheHitRate = totalCacheOps > 0 ? (operation.cacheHits / totalCacheOps) * 100 : 100;
    if (cacheHitRate < this.thresholds.lowCacheHitRatePercent && totalCacheOps > 5) {
      this.addAlert('cache_inefficiency', 'warning',
        `Low cache hit rate: ${cacheHitRate.toFixed(1)}% (threshold: ${this.thresholds.lowCacheHitRatePercent}%)`,
        operation);
    }
  }

  /**
   * Add performance alert
   */
  private addAlert(
    type: PerformanceAlert['type'],
    severity: PerformanceAlert['severity'],
    message: string,
    operation: OperationMetrics
  ): void {
    const alert: PerformanceAlert = {
      type,
      severity,
      message,
      metrics: {
        operationType: operation.operationType,
        duration: operation.duration || 0,
        itemCount: operation.itemCount,
        apiCallCount: operation.apiCallCount,
        cacheHits: operation.cacheHits,
        cacheMisses: operation.cacheMisses,
      },
      timestamp: Date.now(),
    };

    this.alerts.push(alert);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    logger.warn('Performance alert generated', alert);
  }

  /**
   * Get empty stats structure
   */
  private getEmptyStats(): PerformanceStats {
    return {
      totalOperations: 0,
      totalDuration: 0,
      totalItems: 0,
      totalApiCalls: 0,
      totalCacheHits: 0,
      totalCacheMisses: 0,
      averageOperationDuration: 0,
      averageItemsPerSecond: 0,
      averageApiCallsPerOperation: 0,
      cacheHitRatio: 0,
      operationSuccessRate: 0,
      peakConcurrency: 0,
      operationsByType: {},
      recentPerformance: {
        last10Operations: [],
        averageDurationLast10: 0,
        throughputLast10: 0,
      },
    };
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Helper functions for common monitoring patterns
export const monitorBulkOperation = <T>(
  operationType: string,
  itemCount: number,
  operation: () => Promise<T>,
  concurrencyLevel?: number
): Promise<T> => {
  const operationId = `${operationType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  performanceMonitor.startOperation(operationId, operationType, itemCount, concurrencyLevel);
  
  return operation()
    .then(result => {
      performanceMonitor.completeOperation(operationId);
      return result;
    })
    .catch(error => {
      performanceMonitor.updateOperation(operationId, { failureCount: itemCount });
      performanceMonitor.completeOperation(operationId);
      throw error;
    });
};

export const recordPerformanceMetrics = (
  operationId: string,
  metrics: Partial<Pick<OperationMetrics, 'successCount' | 'failureCount' | 'apiCallCount' | 'cacheHits' | 'cacheMisses'>>
): void => {
  performanceMonitor.updateOperation(operationId, metrics);
};