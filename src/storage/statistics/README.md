# StorageStatistics Module

Comprehensive metrics collection and analysis system for storage operations, extracted from PersistentFilterStorage to provide modular statistics management.

## Overview

The StorageStatistics module provides real-time monitoring, historical tracking, and trend analysis for storage operations. It supports multiple storage backends and offers configurable data collection policies with thread-safe operations.

## Features

### Core Functionality
- **Real-time Operation Tracking**: Record and analyze storage operations as they happen
- **Performance Monitoring**: Track latencies, throughput, and success rates
- **Historical Data Collection**: Maintain configurable historical data for trend analysis
- **Alert System**: Automatic detection of performance issues and anomalies
- **Health Monitoring**: Track system health with recovery metrics
- **Export Capabilities**: Export data in JSON or CSV formats

### Advanced Features
- **Trend Analysis**: Linear regression and seasonality detection
- **Percentile Calculations**: Configurable latency percentiles (P50, P95, P99)
- **Growth Rate Analysis**: Memory and storage growth predictions
- **Thread-Safe Operations**: Full concurrent access support with AsyncMutex
- **Configurable Retention**: Flexible data retention policies
- **Event System**: Hooks for operation completion and performance alerts

## Architecture

### Core Components

```typescript
interface IStorageStatistics {
  // Core operations
  recordOperation(metrics: StorageOperationMetrics): Promise<void>
  getSnapshot(): Promise<StorageStatisticsSnapshot>
  updateStorageStats(filterCount: number, storageMetrics?: object): Promise<void>

  // Analysis features
  getAggregatedStats(period: 'hour' | 'day' | 'week' | 'month'): Promise<StorageAggregatedStatistics>
  analyzeTrend(metric: keyof StorageHistoricalMetrics, periodHours: number): Promise<StorageTrendAnalysis>
  getAlerts(severity?: 'info' | 'warning' | 'critical'): Promise<StoragePerformanceAlert[]>

  // Management
  configure(config: Partial<StorageStatisticsConfig>): Promise<void>
  cleanup(): Promise<void>
  exportData(format: 'json' | 'csv'): Promise<string>
  reset(): Promise<void>
  close(): Promise<void>
}
```

### Data Models

#### Operation Metrics
```typescript
interface StorageOperationMetrics {
  operationType: 'create' | 'read' | 'update' | 'delete' | 'batch_create' | 'query' | 'clear'
  startTime: number
  endTime?: number
  duration?: number
  itemCount?: number
  success: boolean
  errorType?: string
  storageType: string
  sessionId: string
  projectId?: string
  metadata?: Record<string, unknown>
}
```

#### Performance Metrics
```typescript
interface StoragePerformanceMetrics {
  totalOperations: number
  totalDuration: number
  averageLatency: number
  minLatency: number
  maxLatency: number
  p50Latency: number
  p95Latency: number
  p99Latency: number
  operationsByType: Record<string, number>
  successRate: number
  errorRate: number
  errorsByType: Record<string, number>
  throughput: number // operations per second
}
```

## Usage Examples

### Basic Setup

```typescript
import { StorageStatistics } from './statistics';

// Initialize with default configuration
const stats = new StorageStatistics();
await stats.initialize();

// Or with custom configuration
await stats.initialize({
  retentionHours: 48,           // Keep data for 48 hours
  collectionIntervalMinutes: 5, // Collect every 5 minutes
  maxDataPoints: 2000,          // Maximum historical data points
  enablePerformanceMonitoring: true,
  enableHealthMonitoring: true,
});
```

### Recording Operations

```typescript
// Record a successful operation
await stats.recordOperation({
  operationType: 'create',
  startTime: Date.now(),
  success: true,
  storageType: 'sqlite',
  sessionId: 'user-session-123',
  itemCount: 1,
  metadata: { projectId: 'project-456' }
});

// Record a failed operation
await stats.recordOperation({
  operationType: 'read',
  startTime: Date.now(),
  success: false,
  errorType: 'ConnectionTimeout',
  storageType: 'sqlite',
  sessionId: 'user-session-123'
});
```

### Monitoring and Analysis

```typescript
// Get current statistics snapshot
const snapshot = await stats.getSnapshot();
console.log(`Total operations: ${snapshot.performanceMetrics.totalOperations}`);
console.log(`Success rate: ${snapshot.performanceMetrics.successRate}%`);
console.log(`Average latency: ${snapshot.performanceMetrics.averageLatency}ms`);

// Get aggregated statistics for the last hour
const hourlyStats = await stats.getAggregatedStats('hour');
console.log(`Hourly throughput: ${hourlyStats.throughput} ops/hour`);
console.log(`Hourly error rate: ${hourlyStats.errorRate}%`);

// Analyze trends
const trend = await stats.analyzeTrend('filterCount', 24); // 24 hours
console.log(`Filter count trend: ${trend.trend} (${trend.changeRate}/hour)`);
if (trend.prediction) {
  console.log(`Predicted next value: ${trend.prediction.nextValue} (confidence: ${trend.prediction.confidence})`);
}
```

### Event Handling

```typescript
// Set up event handlers
stats.on({
  onOperationCompleted: (metrics) => {
    console.log(`Operation ${metrics.operationType} completed in ${metrics.duration}ms`);
  },

  onPerformanceAlert: (alert) => {
    console.warn(`Performance alert: ${alert.message} (${alert.severity})`);

    // Handle different alert types
    switch (alert.type) {
      case 'high_latency':
        // Investigate slow operations
        break;
      case 'error_spike':
        // Check system health
        break;
      case 'memory_growth':
        // Check for memory leaks
        break;
    }
  },

  onHistoricalDataCollected: (dataPoint) => {
    // Process new historical data
    console.log(`Collected data point: ${dataPoint.filterCount} filters`);
  },

  onHealthStatusChanged: (healthy, reason) => {
    console.log(`Health status changed: ${healthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    if (!healthy && reason) {
      console.error(`Health issue: ${reason}`);
    }
  }
});
```

### Configuration and Management

```typescript
// Update configuration
await stats.configure({
  retentionHours: 72,           // Extend retention to 3 days
  collectionIntervalMinutes: 2, // More frequent collection
  maxDataPoints: 5000,          // Allow more data points
  percentilesToTrack: [50, 90, 95, 99] // Additional percentiles
});

// Update storage statistics
await stats.updateStorageStats(150, {
  memoryUsageBytes: 1024 * 1024 * 10, // 10MB
  storageSizeBytes: 1024 * 1024 * 50, // 50MB
  compressionRatio: 0.75,
  fragmentationLevel: 0.15
});

// Export data for external analysis
const jsonData = await stats.exportData('json');
const csvData = await stats.exportData('csv');

// Clean up old data according to retention policy
await stats.cleanup();

// Reset all statistics
await stats.reset();

// Close and clean up resources
await stats.close();
```

## Configuration Options

```typescript
interface StorageStatisticsConfig {
  enableHistoricalTracking: boolean;     // Enable/disable historical data collection
  retentionHours: number;               // How long to keep historical data
  collectionIntervalMinutes: number;    // How often to collect historical data
  maxDataPoints: number;                // Maximum historical data points to keep
  enablePerformanceMonitoring: boolean; // Enable performance metric collection
  enableHealthMonitoring: boolean;      // Enable health status tracking
  enableMemoryTracking: boolean;        // Enable memory usage tracking
  percentilesToTrack: number[];         // Latency percentiles to calculate
  errorAggregationEnabled: boolean;     // Enable error type aggregation
}
```

## Performance Alerts

The system automatically generates alerts for various performance issues:

### High Latency Alerts
- **Warning**: Operations taking > 5 seconds
- **Critical**: Operations taking > 10 seconds

### Error Spike Alerts
- **Warning**: Error rate > 20% in the last minute
- **Critical**: Error rate > 50% in the last minute

### Memory Growth Alerts
- Detects rapid memory usage increases
- Tracks memory consumption patterns

### Storage Fragmentation Alerts
- Monitors storage efficiency
- Detects increasing fragmentation levels

## Thread Safety

The StorageStatistics class is fully thread-safe using AsyncMutex:

```typescript
// Safe concurrent operations
const operations = Array.from({ length: 100 }, (_, i) =>
  stats.recordOperation({
    operationType: 'create',
    startTime: Date.now() + i,
    success: Math.random() > 0.1,
    storageType: 'sqlite',
    sessionId: `session-${i % 10}`
  })
);

await Promise.all(operations); // All operations are safe to run concurrently
```

## Integration with Storage Adapters

### Example Integration

```typescript
class MyStorageAdapter implements IStorageAdapter {
  private statistics: StorageStatistics;

  constructor() {
    this.statistics = new StorageStatistics();
  }

  async initialize(session: Session): Promise<void> {
    await this.statistics.initialize({
      enableHistoricalTracking: true,
      storageType: this.getStorageType()
    });

    // Initialize adapter...
  }

  async save(filter: TaskFilter): Promise<void> {
    const startTime = Date.now();
    let success = false;

    try {
      // Perform save operation...
      success = true;
    } catch (error) {
      // Record failure
      await this.statistics.recordOperation({
        operationType: 'create',
        startTime,
        success: false,
        errorType: error.constructor.name,
        storageType: this.getStorageType(),
        sessionId: this.session.id
      });
      throw error;
    }

    // Record success
    await this.statistics.recordOperation({
      operationType: 'create',
      startTime,
      endTime: Date.now(),
      success,
      storageType: this.getStorageType(),
      sessionId: this.session.id,
      itemCount: 1
    });
  }

  async getStats() {
    const snapshot = await this.statistics.getSnapshot();
    return {
      filterCount: snapshot.filterCount,
      sessionId: snapshot.sessionId,
      storageType: snapshot.storageType,
      // ... other stats
    };
  }
}
```

## Performance Considerations

### Memory Usage
- Historical data is automatically limited by `maxDataPoints`
- Latency data is trimmed to prevent unbounded growth
- Old operations are cleaned up based on retention policy

### CPU Usage
- Percentile calculations use optimized algorithms
- Trend analysis is performed on-demand, not continuously
- Data collection intervals are configurable to balance freshness vs. performance

### I/O Impact
- No persistent storage required for statistics
- Optional export functionality for external analysis
- Minimal impact on primary storage operations

## Testing

Comprehensive test suite covering:
- ✅ Basic functionality and API
- ✅ Performance metrics calculation
- ✅ Historical data collection
- ✅ Alert generation and handling
- ✅ Trend analysis algorithms
- ✅ Thread safety and concurrency
- ✅ Configuration management
- ✅ Data export functionality
- ✅ Error handling and edge cases
- ✅ Memory management and cleanup

Run tests:
```bash
jest tests/storage/statistics/StorageStatistics.test.ts
```

## Best Practices

### Initialization
```typescript
// Good: Initialize early in application lifecycle
const stats = new StorageStatistics();
await stats.initialize({
  retentionHours: 24,        // Keep 24 hours of data
  collectionIntervalMinutes: 5, // Balance freshness vs. performance
  maxDataPoints: 2000,       // Reasonable limit for memory usage
});
```

### Error Handling
```typescript
// Good: Always record operation outcomes
try {
  await performOperation();
  await stats.recordOperation({
    operationType: 'create',
    startTime: operationStart,
    success: true,
    storageType: 'sqlite',
    sessionId: currentSession.id
  });
} catch (error) {
  await stats.recordOperation({
    operationType: 'create',
    startTime: operationStart,
    success: false,
    errorType: error.constructor.name,
    storageType: 'sqlite',
    sessionId: currentSession.id
  });
  throw error;
}
```

### Resource Management
```typescript
// Good: Always close when done
process.on('SIGTERM', async () => {
  await stats.close();
  process.exit(0);
});
```

### Configuration
```typescript
// Good: Tailor configuration to your needs
await stats.configure({
  // For high-traffic systems
  collectionIntervalMinutes: 1,    // More frequent collection
  maxDataPoints: 5000,             // More data points

  // For memory-constrained environments
  retentionHours: 12,              // Shorter retention
  maxDataPoints: 500,              // Fewer data points
});
```

## Troubleshooting

### Common Issues

1. **Memory Usage Growing**
   - Check `maxDataPoints` configuration
   - Verify `retentionHours` is set appropriately
   - Monitor data collection frequency

2. **Missing Historical Data**
   - Ensure `enableHistoricalTracking` is true
   - Check `collectionIntervalMinutes` setting
   - Verify statistics system is initialized

3. **No Performance Alerts**
   - Check alert thresholds in the source code
   - Ensure operations are being recorded with durations
   - Verify `enablePerformanceMonitoring` is enabled

4. **Thread Safety Issues**
   - Ensure all operations use `await` correctly
   - Don't mix synchronous and asynchronous operations
   - Check for proper mutex usage in custom code

### Debug Information

```typescript
// Get detailed snapshot for debugging
const snapshot = await stats.getSnapshot();

console.log('Configuration:', {
  retentionHours: snapshot.historicalData.retentionHours,
  collectionInterval: snapshot.historicalData.collectionIntervalMinutes,
  maxDataPoints: snapshot.historicalData.maxDataPoints
});

console.log('Data Points:', {
  operations: snapshot.performanceMetrics.totalOperations,
  historical: snapshot.historicalData.dataPoints.length,
  alerts: snapshot.healthMetrics.consecutiveFailures
});

console.log('Health:', {
  healthy: snapshot.healthMetrics.isHealthy,
  lastCheck: snapshot.healthMetrics.lastHealthCheck,
  consecutiveFailures: snapshot.healthMetrics.consecutiveFailures
});
```