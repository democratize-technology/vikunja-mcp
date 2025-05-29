/**
 * In-memory storage implementation for saved filters
 *
 * Note: This implementation stores filters in memory only.
 * In a production environment, you would want to persist these
 * to a database or file system.
 */

import type { FilterStorage, SavedFilter } from '../types/filters';
import { v4 as uuidv4 } from 'uuid';

export class InMemoryFilterStorage implements FilterStorage {
  private filters: Map<string, SavedFilter> = new Map();

  list(): Promise<SavedFilter[]> {
    return Promise.resolve(
      Array.from(this.filters.values()).sort((a, b) => b.updated.getTime() - a.updated.getTime()),
    );
  }

  get(id: string): Promise<SavedFilter | null> {
    return Promise.resolve(this.filters.get(id) || null);
  }

  create(filter: Omit<SavedFilter, 'id' | 'created' | 'updated'>): Promise<SavedFilter> {
    const now = new Date();
    const savedFilter: SavedFilter = {
      ...filter,
      id: uuidv4(),
      created: now,
      updated: now,
    };

    this.filters.set(savedFilter.id, savedFilter);
    return Promise.resolve(savedFilter);
  }

  update(
    id: string,
    filter: Partial<Omit<SavedFilter, 'id' | 'created' | 'updated'>>,
  ): Promise<SavedFilter> {
    const existing = this.filters.get(id);
    if (!existing) {
      return Promise.reject(new Error(`Filter with id ${id} not found`));
    }

    const updated: SavedFilter = {
      ...existing,
      ...filter,
      updated: new Date(),
    };

    this.filters.set(id, updated);
    return Promise.resolve(updated);
  }

  delete(id: string): Promise<void> {
    if (!this.filters.has(id)) {
      return Promise.reject(new Error(`Filter with id ${id} not found`));
    }
    this.filters.delete(id);
    return Promise.resolve();
  }

  findByName(name: string): Promise<SavedFilter | null> {
    for (const filter of this.filters.values()) {
      if (filter.name === name) {
        return Promise.resolve(filter);
      }
    }
    return Promise.resolve(null);
  }

  /**
   * Clear all filters (useful for testing)
   */
  clear(): Promise<void> {
    this.filters.clear();
    return Promise.resolve();
  }

  /**
   * Get filters for a specific project
   */
  getByProject(projectId: number): Promise<SavedFilter[]> {
    return Promise.resolve(
      Array.from(this.filters.values())
        .filter((f) => f.projectId === projectId || f.isGlobal)
        .sort((a, b) => b.updated.getTime() - a.updated.getTime()),
    );
  }
}

// Global instance for the application
export const filterStorage = new InMemoryFilterStorage();
