/**
 * Storage module entry point
 * 
 * This module provides a unified interface for both legacy in-memory storage
 * and new persistent storage implementations, allowing gradual migration
 * and backward compatibility.
 */

import { logger } from '../utils/logger';
import { loadStorageConfig } from './config';

// Legacy storage exports for backward compatibility
export { InMemoryFilterStorage, storageManager } from './FilterStorage';

// New persistent storage exports
export { PersistentFilterStorage, RefactoredPersistentFilterStorage, persistentStorageManager } from './PersistentFilterStorage';

// Storage interfaces and configuration
export * from './interfaces';
export * from './config';
export * from './migrations';
export * from './adapters/factory';

// Storage adapters
export { SQLiteStorageAdapter } from './adapters/SQLiteStorageAdapter';
export { InMemoryStorageAdapter } from './adapters/InMemoryStorageAdapter';

// New modular services
export { StorageService } from './services/StorageService';
export { SessionManager as LegacySessionManager } from './services/SessionManager';
export { SessionManager } from './managers/SessionManager';
export { HealthMonitor } from './services/HealthMonitor';
export { CleanupService } from './services/CleanupService';

// New modular architecture components
export { StorageAdapterOrchestrator } from './orchestrators';
export { StorageHealthMonitor } from './monitors';
export { StorageStatistics } from './statistics';

// Export all types for the new modular components
export type {
  IStorageAdapterOrchestrator,
  AdapterState,
  AdapterStatus,
  AdapterInitializationOptions,
  OrchestrationConfig,
} from './orchestrators';

export type {
  IStorageHealthMonitor,
  HealthMonitorConfig,
  HealthCheckResult,
  HealthStatus,
  HealthTrend,
  HealthMonitorStats,
  HealthAlert,
  HealthAlertHandler,
  HealthMetrics,
  HealthCheckStrategy,
  IHealthCheckStrategy,
  DEFAULT_HEALTH_MONITOR_CONFIG,
} from './monitors';

export type {
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
} from './statistics';

// Note: Filtering modules are available but not exported by default to avoid circular dependencies
// Use direct imports if needed: import { FilterValidator } from './filtering/FilterValidator';

import type { FilterStorage } from '../types/filters';
import { persistentStorageManager } from './PersistentFilterStorage';
import { storageManager } from './FilterStorage';

/**
 * Factory function to create appropriate storage instance based on configuration
 * 
 * This function provides automatic selection between legacy in-memory storage
 * and new persistent storage based on configuration, with graceful fallback
 * to in-memory storage if persistent storage fails.
 */
export async function createFilterStorage(
  sessionId: string,
  userId?: string,
  apiUrl?: string,
  forcePersistent = false,
): Promise<FilterStorage> {
  try {
    const config = loadStorageConfig();
    
    // Use persistent storage if configured or forced
    if (config.type !== 'memory' || forcePersistent) {
      logger.debug('Creating persistent filter storage', {
        sessionId,
        storageType: config.type,
        forcePersistent,
      });
      
      return await persistentStorageManager.getStorage(sessionId, userId, apiUrl);
    }
    
    // Fallback to legacy in-memory storage
    logger.debug('Creating in-memory filter storage', {
      sessionId,
      storageType: 'memory',
    });
    
    return await storageManager.getStorage(sessionId, userId, apiUrl);
    
  } catch (error) {
    logger.warn('Failed to create configured storage, falling back to in-memory storage', {
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId,
    });
    
    // Always fallback to in-memory storage if persistent storage fails
    return await storageManager.getStorage(sessionId, userId, apiUrl);
  }
}

/**
 * Get storage statistics for all active sessions
 */
export async function getAllStorageStats(): Promise<{
  persistentSessions: Array<{
    sessionId: string;
    filterCount: number;
    createdAt: Date;
    lastAccessAt: Date;
    storageType: string;
    additionalInfo?: Record<string, unknown>;
  }>;
  memorySessions: Array<{
    sessionId: string;
    filterCount: number;
    createdAt: Date;
    lastAccessAt: Date;
    memoryUsageKb: number;
  }>;
  totalSessions: number;
  totalFilters: number;
}> {
  try {
    const [persistentStats, memoryStats] = await Promise.all([
      persistentStorageManager.getAllStats(),
      storageManager.getAllStats(),
    ]);

    const totalSessions = persistentStats.length + memoryStats.length;
    const totalFilters = persistentStats.reduce((sum, s) => sum + s.filterCount, 0) +
                        memoryStats.reduce((sum, s) => sum + s.filterCount, 0);

    return {
      persistentSessions: persistentStats,
      memorySessions: memoryStats,
      totalSessions,
      totalFilters,
    };
  } catch (error) {
    logger.error('Failed to get storage statistics', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return {
      persistentSessions: [],
      memorySessions: [],
      totalSessions: 0,
      totalFilters: 0,
    };
  }
}

/**
 * Perform health check on all storage systems
 */
export async function healthCheckAllStorage(): Promise<{
  overall: 'healthy' | 'degraded' | 'unhealthy';
  persistent: {
    healthy: boolean;
    sessions: Array<{
      sessionId: string;
      healthy: boolean;
      error?: string;
      details?: Record<string, unknown>;
    }>;
  };
  memory: {
    healthy: boolean;
    sessionCount: number;
  };
  details?: Record<string, unknown>;
}> {
  try {
    const [persistentHealth, memoryStats] = await Promise.all([
      persistentStorageManager.healthCheckAll(),
      storageManager.getAllStats(),
    ]);

    const persistentHealthy = persistentHealth.every(h => h.healthy);
    const memoryHealthy = true; // In-memory storage is always healthy

    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (persistentHealthy && memoryHealthy) {
      overall = 'healthy';
    } else if (memoryHealthy) {
      overall = 'degraded'; // Persistent storage has issues but memory works
    } else {
      overall = 'unhealthy';
    }

    return {
      overall,
      persistent: {
        healthy: persistentHealthy,
        sessions: persistentHealth,
      },
      memory: {
        healthy: memoryHealthy,
        sessionCount: memoryStats.length,
      },
      details: {
        timestamp: new Date().toISOString(),
        configuredStorageType: loadStorageConfig().type,
      },
    };
  } catch (error) {
    logger.error('Failed to perform storage health check', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      overall: 'unhealthy',
      persistent: {
        healthy: false,
        sessions: [],
      },
      memory: {
        healthy: true,
        sessionCount: 0,
      },
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Migration utility to move data from in-memory to persistent storage
 */
export async function migrateMemoryToPersistent(): Promise<{
  success: boolean;
  migratedSessions: number;
  migratedFilters: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let migratedSessions = 0;
  let migratedFilters = 0;

  try {
    const memoryStats = await storageManager.getAllStats();
    
    if (memoryStats.length === 0) {
      logger.info('No in-memory sessions to migrate');
      return {
        success: true,
        migratedSessions: 0,
        migratedFilters: 0,
        errors: [],
      };
    }

    logger.info(`Starting migration of ${memoryStats.length} in-memory sessions to persistent storage`);

    for (const sessionStat of memoryStats) {
      try {
        // Get the in-memory storage instance
        const memoryStorage = await storageManager.getStorage(sessionStat.sessionId);
        const filters = await memoryStorage.list();

        if (filters.length === 0) {
          migratedSessions++;
          continue;
        }

        // Create persistent storage instance
        const persistentStorage = await persistentStorageManager.getStorage(sessionStat.sessionId);

        // Check if persistent storage actually used persistent backend
        const stats = await persistentStorage.getStats();
        const usedPersistentStorage = stats.storageType === 'sqlite';

        if (!usedPersistentStorage) {
          errors.push(`Session ${sessionStat.sessionId}: Persistent storage not available, data may not be migrated to persistent storage`);
          logger.warn(`Migration warning: Persistent storage not available for session ${sessionStat.sessionId}`);
        }

        // Migrate each filter
        for (const filter of filters) {
          try {
            const filterData: Omit<typeof filter, 'id' | 'created' | 'updated'> = {
              name: filter.name,
              filter: filter.filter,
              isGlobal: filter.isGlobal,
              ...(filter.description !== undefined && { description: filter.description }),
              ...(filter.expression !== undefined && { expression: filter.expression }),
              ...(filter.projectId !== undefined && { projectId: filter.projectId }),
            };

            await persistentStorage.create(filterData);
            migratedFilters++;
          } catch (error) {
            const errorMsg = `Failed to migrate filter ${filter.id} from session ${sessionStat.sessionId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            logger.warn(errorMsg);
          }
        }

        migratedSessions++;
        logger.debug(`Migrated session ${sessionStat.sessionId}`, {
          filterCount: filters.length,
        });

      } catch (error) {
        const errorMsg = `Failed to migrate session ${sessionStat.sessionId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        logger.error(errorMsg);
      }
    }

    const success = errors.length === 0;
    
    logger.info('Migration completed', {
      success,
      migratedSessions,
      migratedFilters,
      errorCount: errors.length,
    });

    return {
      success,
      migratedSessions,
      migratedFilters,
      errors,
    };

  } catch (error) {
    const errorMsg = `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    logger.error(errorMsg);
    
    return {
      success: false,
      migratedSessions,
      migratedFilters,
      errors: [errorMsg, ...errors],
    };
  }
}