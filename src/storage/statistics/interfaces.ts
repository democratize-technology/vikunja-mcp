/**
 * Interface definitions for storage statistics and metrics collection
 */

export interface StorageOperationMetrics {
  operationType: 'create' | 'read' | 'update' | 'delete' | 'batch_create' | 'query' | 'clear';
  startTime: number;
  endTime?: number;
  duration?: number;
  itemCount?: number;
  success: boolean;
  errorType?: string;
  storageType: string;
  sessionId: string;
  projectId?: string;
  metadata?: Record<string, unknown>;
}

export interface StoragePerformanceMetrics {
  totalOperations: number;
  totalDuration: number;
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  operationsByType: Record<string, number>;
  successRate: number;
  errorRate: number;
  errorsByType: Record<string, number>;
  throughput: number; // operations per second
}

export interface StorageHistoricalMetrics {
  timestamp: number;
  filterCount: number;
  memoryUsageBytes?: number;
  operationCount: number;
  errorCount: number;
  averageLatency: number;
  storageSize?: number;
  activeSessionCount: number;
}

export interface StorageStatisticsSnapshot {
  sessionId: string;
  storageType: string;
  filterCount: number;
  createdAt: Date;
  lastAccessAt: Date;
  lastUpdated: Date;
  sessionMetrics: {
    totalOperations: number;
    operationsSinceLastAccess: number;
    averageAccessInterval: number;
    sessionDuration: number;
  };
  performanceMetrics: StoragePerformanceMetrics;
  storageMetrics: {
    memoryUsageBytes?: number;
    storageSizeBytes?: number;
    indexSize?: number;
    compressionRatio?: number;
    fragmentationLevel?: number;
  };
  historicalData: {
    dataPoints: StorageHistoricalMetrics[];
    retentionHours: number;
    dataPointsCollected: number;
    lastCollectionTime: number;
    collectionIntervalMinutes: number;
  };
  healthMetrics: {
    isHealthy: boolean;
    lastHealthCheck: number;
    consecutiveFailures: number;
    averageRecoveryTime: number;
  };
  additionalInfo?: Record<string, unknown>;
}

export interface StorageStatisticsConfig {
  enableHistoricalTracking: boolean;
  retentionHours: number;
  collectionIntervalMinutes: number;
  maxDataPoints: number;
  enablePerformanceMonitoring: boolean;
  enableHealthMonitoring: boolean;
  enableMemoryTracking: boolean;
  percentilesToTrack: number[];
  errorAggregationEnabled: boolean;
}

export interface StorageStatisticsEvents {
  onOperationCompleted?: (metrics: StorageOperationMetrics) => void;
  onPerformanceAlert?: (alert: StoragePerformanceAlert) => void;
  onHistoricalDataCollected?: (dataPoint: StorageHistoricalMetrics) => void;
  onHealthStatusChanged?: (healthy: boolean, reason?: string) => void;
}

export interface StoragePerformanceAlert {
  type: 'high_latency' | 'low_success_rate' | 'memory_growth' | 'storage_fragmentation' | 'error_spike';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  threshold: number;
  currentValue: number;
  timestamp: number;
  recommendation?: string;
}

export interface StorageAggregatedStatistics {
  period: 'hour' | 'day' | 'week' | 'month';
  startTime: number;
  endTime: number;
  totalOperations: number;
  totalErrors: number;
  averageLatency: number;
  peakLatency: number;
  throughput: number;
  errorRate: number;
  memoryGrowth: number;
  storageGrowth: number;
  activeSessions: number;
}

export interface StorageTrendAnalysis {
  metric: keyof StorageHistoricalMetrics;
  period: number; // hours
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  trendStrength: number; // 0-1, higher = stronger trend
  changeRate: number; // units per hour
  seasonality?: {
    pattern: 'daily' | 'weekly' | 'monthly';
    strength: number;
  };
  prediction?: {
    nextValue: number;
    confidence: number;
  };
}

/**
 * Main interface for StorageStatistics implementation
 */
export interface IStorageStatistics {
  /**
   * Initialize the statistics collector
   */
  initialize(config?: Partial<StorageStatisticsConfig>): Promise<void>;

  /**
   * Record a storage operation
   */
  recordOperation(metrics: StorageOperationMetrics): Promise<void>;

  /**
   * Get current statistics snapshot
   */
  getSnapshot(): Promise<StorageStatisticsSnapshot>;

  /**
   * Get aggregated statistics for a time period
   */
  getAggregatedStats(period: 'hour' | 'day' | 'week' | 'month'): Promise<StorageAggregatedStatistics>;

  /**
   * Analyze trends for specific metrics
   */
  analyzeTrend(
    metric: keyof StorageHistoricalMetrics,
    periodHours: number
  ): Promise<StorageTrendAnalysis>;

  /**
   * Get performance alerts
   */
  getAlerts(severity?: 'info' | 'warning' | 'critical'): Promise<StoragePerformanceAlert[]>;

  /**
   * Update storage statistics (filter count, memory usage, etc.)
   */
  updateStorageStats(
    filterCount: number,
    storageMetrics?: Partial<StorageStatisticsSnapshot['storageMetrics']>
  ): Promise<void>;

  /**
   * Configure statistics collection
   */
  configure(config: Partial<StorageStatisticsConfig>): Promise<void>;

  /**
   * Clean up old data according to retention policy
   */
  cleanup(): Promise<void>;

  /**
   * Export statistics data
   */
  exportData(format: 'json' | 'csv'): Promise<string>;

  /**
   * Reset all statistics
   */
  reset(): Promise<void>;

  /**
   * Close and clean up resources
   */
  close(): Promise<void>;
}