/**
 * In-memory storage adapter for filter storage
 * 
 * This adapter provides the existing in-memory storage functionality
 * while implementing the StorageAdapter interface for compatibility
 * with the new persistent storage architecture.
 */

import { v4 as uuidv4 } from 'uuid';
import type { SavedFilter } from '../../types/filters';
import type { StorageAdapter, StorageSession } from '../interfaces';

/**
 * In-memory storage adapter implementation
 * 
 * This adapter maintains backward compatibility with the existing
 * InMemoryFilterStorage while implementing the new StorageAdapter interface.
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  private filters: Map<string, SavedFilter> = new Map();
  private session: StorageSession | null = null;

  async initialize(session: StorageSession): Promise<void> {
    this.session = session;
    // No initialization needed for in-memory storage
  }

  async list(): Promise<SavedFilter[]> {
    return Array.from(this.filters.values()).sort((a, b) => b.updated.getTime() - a.updated.getTime());
  }

  async get(id: string): Promise<SavedFilter | null> {
    return this.filters.get(id) || null;
  }

  async create(filter: Omit<SavedFilter, 'id' | 'created' | 'updated'>): Promise<SavedFilter> {
    const now = new Date();
    const savedFilter: SavedFilter = {
      ...filter,
      id: uuidv4(),
      created: now,
      updated: now,
    };

    this.filters.set(savedFilter.id, savedFilter);
    return savedFilter;
  }

  async update(
    id: string,
    filter: Partial<Omit<SavedFilter, 'id' | 'created' | 'updated'>>,
  ): Promise<SavedFilter> {
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
  }

  async delete(id: string): Promise<void> {
    if (!this.filters.has(id)) {
      throw new Error(`Filter with id ${id} not found`);
    }
    this.filters.delete(id);
  }

  async findByName(name: string): Promise<SavedFilter | null> {
    for (const filter of this.filters.values()) {
      if (filter.name === name) {
        return filter;
      }
    }
    return null;
  }

  async getByProject(projectId: number): Promise<SavedFilter[]> {
    return Array.from(this.filters.values())
      .filter((f) => f.projectId === projectId || f.isGlobal)
      .sort((a, b) => b.updated.getTime() - a.updated.getTime());
  }

  async clear(): Promise<void> {
    this.filters.clear();
  }

  async getStats(): Promise<{
    filterCount: number;
    sessionId: string;
    createdAt: Date;
    lastAccessAt: Date;
    storageType: string;
    additionalInfo?: Record<string, unknown>;
  }> {
    if (!this.session) {
      throw new Error('Storage adapter not initialized');
    }

    // Estimate memory usage (rough calculation)
    let memoryBytes = 0;
    for (const filter of this.filters.values()) {
      memoryBytes += JSON.stringify(filter).length * 2; // UTF-16 chars
    }
    // Add overhead for Map structure and object references
    memoryBytes += this.filters.size * 100; // Approximate overhead per entry

    return {
      filterCount: this.filters.size,
      sessionId: this.session.id,
      createdAt: this.session.createdAt,
      lastAccessAt: this.session.lastAccessAt,
      storageType: 'memory',
      additionalInfo: {
        memoryUsageKb: Math.max(0, Math.ceil(memoryBytes / 1024)),
      },
    };
  }

  async close(): Promise<void> {
    // No cleanup needed for in-memory storage
    this.session = null;
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }> {
    return {
      healthy: true,
      details: {
        storageType: 'memory',
        sessionId: this.session?.id,
        filterCount: this.filters.size,
      },
    };
  }
}