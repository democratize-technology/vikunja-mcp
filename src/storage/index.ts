/**
 * Simplified storage module - eliminates over-engineering
 *
 * Replaces 33 files and 9,803 lines with essential functionality:
 * - Session-isolated filter storage
 * - Thread-safe operations with mutex
 * - Same external API as before
 */

import { logger } from '../utils/logger';
import { SimpleFilterStorage, storageManager } from './SimpleFilterStorage';
import type { FilterStorage, SavedFilter } from '../types/filters';

// Export the main storage implementation
export { SimpleFilterStorage, storageManager };

// Export storage interface and types
export type { FilterStorage, SavedFilter };

// Export error classes
export class StorageDataError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'STORAGE_DATA_ERROR', cause?: Error) {
    super(message);
    this.name = 'StorageDataError';
    this.code = code;
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Factory function to create filter storage instance
 * (Maintains API compatibility with previous code)
 */
export async function createFilterStorage(
  sessionId: string,
  userId?: string,
  apiUrl?: string,
  _forcePersistent = false,
): Promise<FilterStorage> {
  // Ignore forcePersistent - always use simple in-memory storage
  logger.debug('Creating simple filter storage', {
    sessionId,
    userId,
    apiUrl,
  });

  return await storageManager.getStorage(sessionId, userId, apiUrl);
}

/**
 * Get storage statistics for all active sessions
 */
export async function getAllStorageStats(): Promise<{
  persistentSessions: Array<Record<string, never>>;
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
    const memoryStats = await storageManager.getAllStats();
    const totalSessions = memoryStats.length;
    const totalFilters = memoryStats.reduce((sum, s) => sum + s.filterCount, 0);

    return {
      persistentSessions: [], // No persistent storage in simplified version
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
 * Perform health check on storage system
 */
export async function healthCheckAllStorage(): Promise<{
  overall: 'healthy' | 'degraded' | 'unhealthy';
  persistent: {
    healthy: boolean;
    sessions: Array<Record<string, never>>;
  };
  memory: {
    healthy: boolean;
    sessionCount: number;
  };
  details?: Record<string, unknown>;
}> {
  try {
    const memoryStats = await storageManager.getAllStats();

    return {
      overall: 'healthy',
      persistent: {
        healthy: true, // Not applicable in simplified version
        sessions: [],
      },
      memory: {
        healthy: true,
        sessionCount: memoryStats.length,
      },
      details: {
        timestamp: new Date().toISOString(),
        storageType: 'memory',
      },
    };
  } catch (error) {
    logger.error('Failed to perform storage health check', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      overall: 'unhealthy',
      persistent: {
        healthy: true,
        sessions: [],
      },
      memory: {
        healthy: false,
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
 * Migration utility (no-op in simplified version)
 */
export function migrateMemoryToPersistent(): {
  success: boolean;
  migratedSessions: number;
  migratedFilters: number;
  errors: string[];
} {
  logger.info('Migration not needed - using simplified storage');
  return {
    success: true,
    migratedSessions: 0,
    migratedFilters: 0,
    errors: [],
  };
}

