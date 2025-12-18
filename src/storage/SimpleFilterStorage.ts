/**
 * Simple filter storage - eliminates over-engineering
 *
 * Replaces 33 files and 9,803 lines with essential functionality:
 * - Session-isolated filter storage
 * - Thread-safe operations with mutex
 * - Same external API as before
 */

import { logger } from '../utils/logger';
import { Mutex } from 'async-mutex';
import type { FilterStorage, SavedFilter } from '../types/filters';
import { v4 as uuidv4 } from 'uuid';

/**
 * Session information
 */
interface StorageSession {
  id: string;
  userId?: string;
  apiUrl?: string;
  createdAt: Date;
  lastAccessAt: Date;
}

/**
 * Simple filter storage implementation
 */
export class SimpleFilterStorage implements FilterStorage {
  private filters: Map<string, SavedFilter> = new Map();
  private mutex = new Mutex();
  private session: StorageSession;

  constructor(sessionId: string, userId?: string, apiUrl?: string) {
    this.session = {
      id: sessionId,
      createdAt: new Date(),
      lastAccessAt: new Date(),
      ...(userId !== undefined && { userId }),
      ...(apiUrl !== undefined && { apiUrl }),
    };
  }

  private updateAccessTime(): void {
    this.session.lastAccessAt = new Date();
  }

  async list(): Promise<SavedFilter[]> {
    const release = await this.mutex.acquire();
    try {
      this.updateAccessTime();
      return Array.from(this.filters.values()).sort((a, b) => b.updated.getTime() - a.updated.getTime());
    } finally {
      release();
    }
  }

  async get(id: string): Promise<SavedFilter | null> {
    const release = await this.mutex.acquire();
    try {
      this.updateAccessTime();
      return this.filters.get(id) || null;
    } finally {
      release();
    }
  }

  async create(filter: Omit<SavedFilter, 'id' | 'created' | 'updated'>): Promise<SavedFilter> {
    const release = await this.mutex.acquire();
    try {
      this.updateAccessTime();
      const now = new Date();
      const savedFilter: SavedFilter = {
        ...filter,
        id: uuidv4(),
        created: now,
        updated: now,
      };

      this.filters.set(savedFilter.id, savedFilter);
      return savedFilter;
    } finally {
      release();
    }
  }

  async update(
    id: string,
    filter: Partial<Omit<SavedFilter, 'id' | 'created' | 'updated'>>,
  ): Promise<SavedFilter> {
    const release = await this.mutex.acquire();
    try {
      this.updateAccessTime();
      const existing = this.filters.get(id);
      if (!existing) {
        throw new Error(`Filter with id ${id} not found`);
      }

      const updated: SavedFilter = {
        ...existing,
        ...filter,
        updated: new Date(),
      };

      this.filters.set(id, updated);
      return updated;
    } finally {
      release();
    }
  }

  async delete(id: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.updateAccessTime();
      if (!this.filters.has(id)) {
        throw new Error(`Filter with id ${id} not found`);
      }
      this.filters.delete(id);
    } finally {
      release();
    }
  }

  async findByName(name: string): Promise<SavedFilter | null> {
    const release = await this.mutex.acquire();
    try {
      this.updateAccessTime();
      for (const filter of this.filters.values()) {
        if (filter.name === name) {
          return filter;
        }
      }
      return null;
    } finally {
      release();
    }
  }

  async getByProject(projectId: number): Promise<SavedFilter[]> {
    const release = await this.mutex.acquire();
    try {
      this.updateAccessTime();
      const projectFilters: SavedFilter[] = [];
      for (const filter of this.filters.values()) {
        if (filter.projectId === projectId) {
          projectFilters.push(filter);
        }
      }
      return projectFilters.sort((a, b) => b.updated.getTime() - a.updated.getTime());
    } finally {
      release();
    }
  }

  /**
   * Session management
   */
  getSession(): StorageSession {
    return { ...this.session };
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    filterCount: number;
    sessionId: string;
    createdAt: Date;
    lastAccessAt: Date;
    storageType: string;
    additionalInfo?: Record<string, unknown>;
  }> {
    const release = await this.mutex.acquire();
    try {
      this.updateAccessTime();
      return {
        filterCount: this.filters.size,
        sessionId: this.session.id,
        createdAt: this.session.createdAt,
        lastAccessAt: this.session.lastAccessAt,
        storageType: 'memory',
      };
    } finally {
      release();
    }
  }

  /**
   * Clear all filters (for testing)
   */
  async clear(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.updateAccessTime();
      this.filters.clear();
    } finally {
      release();
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }> {
    return {
      healthy: true,
      details: {
        storageType: 'memory',
        filterCount: this.filters.size,
        sessionId: this.session.id,
      },
    };
  }

  /**
   * Close storage
   */
  async close(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.filters.clear();
    } finally {
      release();
    }
  }
}

/**
 * Storage manager
 */
export class FilterStorageManager {
  private storageInstances = new Map<string, SimpleFilterStorage>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private mutex = new Mutex();

  // Clean up sessions after 1 hour
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
  private readonly SESSION_TIMEOUT_MS = 60 * 60 * 1000;

  constructor() {
    this.startCleanupTimer();
  }

  async getStorage(sessionId: string, userId?: string, apiUrl?: string): Promise<SimpleFilterStorage> {
    const release = await this.mutex.acquire();
    try {
      let storage = this.storageInstances.get(sessionId);
      if (!storage) {
        storage = new SimpleFilterStorage(sessionId, userId, apiUrl);
        this.storageInstances.set(sessionId, storage);
      }
      return storage;
    } finally {
      release();
    }
  }

  async getAllStats(): Promise<Array<{
    sessionId: string;
    filterCount: number;
    createdAt: Date;
    lastAccessAt: Date;
    memoryUsageKb: number;
  }>> {
    const release = await this.mutex.acquire();
    try {
      const stats = [];
      for (const [sessionId, storage] of this.storageInstances) {
        const storageStats = await storage.getStats();
        stats.push({
          sessionId,
          filterCount: storageStats.filterCount,
          createdAt: storageStats.createdAt,
          lastAccessAt: storageStats.lastAccessAt,
          memoryUsageKb: 0, // Simplified - no detailed memory tracking
        });
      }
      return stats;
    } finally {
      release();
    }
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions().catch(error => {
        logger.error('Failed to cleanup inactive sessions', { error });
      });
    }, this.CLEANUP_INTERVAL_MS);
  }

  private async cleanupInactiveSessions(): Promise<void> {
    const now = Date.now();
    const expiredSessions: string[] = [];

    const release = await this.mutex.acquire();
    try {
      for (const [sessionId, storage] of this.storageInstances) {
        const session = storage.getSession();
        if (now - session.lastAccessAt.getTime() > this.SESSION_TIMEOUT_MS) {
          expiredSessions.push(sessionId);
        }
      }

      for (const sessionId of expiredSessions) {
        const storage = this.storageInstances.get(sessionId);
        if (storage) {
          await storage.close();
          this.storageInstances.delete(sessionId);
          logger.debug('Cleaned up expired storage session', { sessionId });
        }
      }
    } finally {
      release();
    }
  }

  /**
   * Cleanup on process exit
   */
  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const release = await this.mutex.acquire();
    try {
      for (const storage of this.storageInstances.values()) {
        await storage.close();
      }
      this.storageInstances.clear();
    } finally {
      release();
    }
  }

  /**
   * Clear all storage instances (for testing)
   */
  async clearAll(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      for (const storage of this.storageInstances.values()) {
        await storage.clear();
      }
      this.storageInstances.clear();
    } finally {
      release();
    }
  }

  /**
   * Stop cleanup timer (for testing)
   */
  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Global storage manager instance
export const storageManager = new FilterStorageManager();

// Cleanup on process exit
process.on('exit', () => {
  storageManager.destroy().catch(() => {
    // Ignore errors during shutdown
  });
});

process.on('SIGINT', () => {
  storageManager.destroy().then(() => {
    process.exit(0);
  }).catch(() => {
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  storageManager.destroy().then(() => {
    process.exit(0);
  }).catch(() => {
    process.exit(1);
  });
});