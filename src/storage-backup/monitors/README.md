# StorageHealthMonitor

Comprehensive health monitoring solution for storage adapters in the Vikunja MCP server.

## Overview

The `StorageHealthMonitor` provides robust health monitoring capabilities for any `StorageAdapter` implementation, including:

- **Multiple health check strategies** (ping, read, write, comprehensive)
- **Configurable monitoring intervals and thresholds**
- **Consecutive failure tracking with threshold management**
- **Graceful degradation and automatic recovery**
- **Thread-safe operations using AsyncMutex**
- **Performance metrics monitoring**
- **Health status caching with TTL**
- **Trend analysis and prediction**
- **Alert system with configurable handlers**

## Architecture

### Core Components

1. **StorageHealthMonitor Class**: Main implementation of `IStorageHealthMonitor`
2. **Health Check Strategies**: Modular strategies for different types of health checks
3. **Interface Definitions**: Comprehensive TypeScript interfaces for all health monitoring functionality

### Health Check Strategies

- **Ping**: Uses the adapter's built-in `healthCheck()` method
- **Read**: Performs a list operation to verify read functionality
- **Write**: Creates and deletes a test filter to verify write functionality
- **Comprehensive**: Executes all strategies and aggregates results

## Usage

### Basic Usage

```typescript
import { StorageHealthMonitor } from './storage/monitors';

// Create monitor with custom configuration
const monitor = new StorageHealthMonitor({
  checkInterval: 30000,        // 30 seconds
  failureThreshold: 3,         // Mark unhealthy after 3 failures
  recoveryThreshold: 2,        // Mark healthy after 2 successes
  responseTimeThreshold: 1000, // 1 second threshold
  enableAutoRecovery: true,
});

// Start monitoring
await monitor.startMonitoring(storageAdapter);

// Get current health status
const current = monitor.getCurrentHealth();

// Perform manual health check
const result = await monitor.checkHealth('comprehensive');

// Stop monitoring
await monitor.stopMonitoring();
```

### Advanced Configuration

```typescript
const monitor = new StorageHealthMonitor({
  checkInterval: 15000,           // Check every 15 seconds
  failureThreshold: 5,            // 5 consecutive failures before unhealthy
  recoveryThreshold: 3,           // 3 consecutive successes for recovery
  responseTimeThreshold: 500,     // 500ms response time threshold
  trendWindowSize: 30,            // Analyze last 30 checks for trends
  healthCacheTTL: 2000,           // Cache health for 2 seconds
  defaultStrategy: 'comprehensive', // Use comprehensive checks by default
  enableAutoRecovery: true,        // Enable automatic recovery attempts
  maxRecoveryAttempts: 5,          // Maximum recovery attempts
  enableDebugLogging: true,        // Enable detailed logging
});
```

### Alert Handling

```typescript
// Register alert handlers
monitor.onAlert((alert) => {
  console.log(`Health Alert [${alert.severity}]: ${alert.message}`);

  // Send to monitoring system
  if (alert.severity === 'critical') {
    sendToPagerDuty(alert);
  }
});

// Remove alert handlers
monitor.removeAlertHandler(handler);
```

## Health Check Results

```typescript
interface HealthCheckResult {
  status: HealthStatus;           // HEALTHY | DEGRADED | UNHEALTHY | UNKNOWN
  healthy: boolean;               // Overall health status
  error?: string;                 // Error message if unhealthy
  strategy: HealthCheckStrategy;  // Strategy used for the check
  metrics: HealthMetrics;         // Performance metrics
  details?: Record<string, unknown>; // Additional details
  consecutiveFailures: number;    // Current consecutive failure count
  timeSinceLastSuccess?: number;  // Time since last successful check (ms)
}
```

## Statistics and Trends

```typescript
// Get comprehensive statistics
const stats = monitor.getStats();
// Returns: totalChecks, successfulChecks, failedChecks, averageResponseTime, etc.

// Get health trend analysis
const trend = monitor.getHealthTrend();
// Returns: currentStatus, statusHistory, averageResponseTime, successRate,
//          trendDirection ('improving' | 'stable' | 'degrading'),
//          predictedStatus
```

## Integration Points

The StorageHealthMonitor is designed to work seamlessly with:

- **StorageAdapter**: Any adapter implementing the StorageAdapter interface
- **StorageAdapterOrchestrator**: For adapter lifecycle management
- **SessionManager**: For session-aware health monitoring

## Thread Safety

All operations are protected by an `AsyncMutex` ensuring:
- Thread-safe concurrent health checks
- Atomic configuration updates
- Safe monitoring start/stop operations
- Consistent statistics tracking

## Error Handling

The monitor implements comprehensive error handling:

- **Strategy execution failures**: Isolated failures don't crash the monitor
- **Adapter unavailability**: Graceful handling when adapter is not configured
- **Configuration errors**: Validation and safe defaults
- **Alert handler failures**: Isolated from monitoring operations

## Performance Considerations

- **Minimal overhead**: Health checks are lightweight and asynchronous
- **Configurable intervals**: Balance between responsiveness and resource usage
- **Caching**: Health status caching reduces redundant checks
- **Efficient statistics**: O(1) updates for most statistics
- **Memory management**: Bounded history and alert storage

## Extensibility

The architecture supports:

- **Custom strategies**: Implement `IHealthCheckStrategy` for new check types
- **Custom alert handlers**: Integrate with any monitoring/alerting system
- **Configuration presets**: Predefined configurations for different environments
- **Metrics collection**: Easy integration with observability platforms

## Best Practices

1. **Use appropriate intervals**: Balance responsiveness with resource usage
2. **Configure thresholds**: Match your application's tolerance for failures
3. **Monitor the monitor**: Set up alerts on the health monitor itself
4. **Test recovery**: Verify auto-recovery works in your environment
5. **Log appropriately**: Use debug logging for troubleshooting

## Files

- `StorageHealthMonitor.ts`: Main implementation
- `interfaces/StorageHealthMonitor.ts`: TypeScript interfaces and types
- `index.ts`: Module exports
- `README.md`: This documentation

## Dependencies

- `uuid`: For alert ID generation
- `logger`: Application logging
- `AsyncMutex`: Thread safety
- `StorageAdapter`: Target adapter interface