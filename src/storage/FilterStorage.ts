/**
 * Thread-safe, session-scoped storage implementation for saved filters
 *
 * This implementation provides:
 * - Thread-safe operations using mutex locks
 * - Session isolation preventing cross-session contamination
 * - Memory-based storage with optional persistence interface
 * - Proper cleanup and garbage collection
 */

import { logger } from '../utils/logger';
import { AsyncMutex } from '../utils/AsyncMutex';

import type { FilterStorage, SavedFilter } from '../types/filters';
import { v4 as uuidv4 } from 'uuid';

/**
 * Session information for storage isolation
 */
interface StorageSession {
  id: string;
  userId?: string;
  apiUrl?: string;
  createdAt: Date;
  lastAccessAt: Date;
}

export class InMemoryFilterStorage implements FilterStorage {
  private filters: Map<string, SavedFilter> = new Map();
  private mutex = new AsyncMutex();
  private session: StorageSession;

  /**
   * Create a new storage instance for a specific session
   */
  constructor(sessionId: string, userId?: string, apiUrl?: string) {
    this.session = {
      id: sessionId,
      createdAt: new Date(),
      lastAccessAt: new Date(),
    };
    
    if (userId !== undefined) {
      this.session.userId = userId;
    }
    
    if (apiUrl !== undefined) {
      this.session.apiUrl = apiUrl;
    }
  }

  /**
   * Get session information
   */
  getSession(): StorageSession {
    return { ...this.session };
  }

  /**
   * Update last access time
   */
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

  /**
   * Clear all filters (useful for testing)
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
   * Get filters for a specific project
   */
  async getByProject(projectId: number): Promise<SavedFilter[]> {
    const release = await this.mutex.acquire();
    try {
      this.updateAccessTime();
      return Array.from(this.filters.values())
        .filter((f) => f.projectId === projectId || f.isGlobal)
        .sort((a, b) => b.updated.getTime() - a.updated.getTime());
    } finally {
      release();
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    filterCount: number;
    sessionId: string;
    createdAt: Date;
    lastAccessAt: Date;
    memoryUsageKb: number;
  }> {
    const release = await this.mutex.acquire();
    try {
      this.updateAccessTime();
      const filterCount = this.filters.size;
      
      // Estimate memory usage (rough calculation)
      let memoryBytes = 0;
      for (const filter of this.filters.values()) {
        memoryBytes += JSON.stringify(filter).length * 2; // UTF-16 chars
      }
      // Add overhead for Map structure and object references
      memoryBytes += filterCount * 100; // Approximate overhead per entry
      
      return {
        filterCount,
        sessionId: this.session.id,
        createdAt: this.session.createdAt,
        lastAccessAt: this.session.lastAccessAt,
        memoryUsageKb: Math.max(0, Math.ceil(memoryBytes / 1024)),
      };
    } finally {
      release();
    }
  }
}

/**
 * Storage manager for session-scoped filter storage instances
 */
class FilterStorageManager {
  private storageInstances = new Map<string, InMemoryFilterStorage>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private mutex = new AsyncMutex();
  
  // Cleanup inactive sessions after 1 hour
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  private readonly SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Get or create a storage instance for a session
   */
  async getStorage(sessionId: string, userId?: string, apiUrl?: string): Promise<InMemoryFilterStorage> {
    const release = await this.mutex.acquire();
    try {
      let storage = this.storageInstances.get(sessionId);
      if (!storage) {
        storage = new InMemoryFilterStorage(sessionId, userId, apiUrl);
        this.storageInstances.set(sessionId, storage);
      }
      return storage;
    } finally {
      release();
    }
  }

  /**
   * Remove a storage instance for a session
   */
  async removeStorage(sessionId: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const storage = this.storageInstances.get(sessionId);
      if (storage) {
        await storage.clear();
        this.storageInstances.delete(sessionId);
      }
    } finally {
      release();
    }
  }

  /**
   * Get statistics for all storage instances
   */
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
      for (const storage of this.storageInstances.values()) {
        stats.push(await storage.getStats());
      }
      return stats;
    } finally {
      release();
    }
  }

  /**
   * Clean up inactive sessions
   */
  private async cleanupInactiveSessions(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      const now = new Date();
      const expiredSessions: string[] = [];
      
      for (const [sessionId, storage] of this.storageInstances.entries()) {
        const session = storage.getSession();
        const timeSinceLastAccess = now.getTime() - session.lastAccessAt.getTime();
        
        if (timeSinceLastAccess > this.SESSION_TIMEOUT_MS) {
          expiredSessions.push(sessionId);
        }
      }
      
      // Clean up expired sessions
      for (const sessionId of expiredSessions) {
        const storage = this.storageInstances.get(sessionId);
        if (storage) {
          await storage.clear();
          this.storageInstances.delete(sessionId);
        }
      }
      
      if (expiredSessions.length > 0) {
        logger.debug(`Cleaned up ${expiredSessions.length} inactive storage sessions`);
      }
    } finally {
      release();
    }
  }

  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveSessions().catch(console.error);
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop the cleanup timer (for testing)
   */
  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
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
}

// Global storage manager instance
export const storageManager = new FilterStorageManager();

// Export new persistent storage manager for migration
export { persistentStorageManager } from './PersistentFilterStorage';

