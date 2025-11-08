/**
 * Refactored PersistentFilterStorage using proper dependency injection
 *
 * This implementation resolves the architectural issues identified:
 * - Proper dependency injection without factory calls
 * - No circular dependencies through service container
 * - Thread-safe session management with locking
 * - Coordinated health monitoring and cleanup
 */

import { logger } from '../utils/logger';
import type { FilterStorage, SavedFilter } from '../types/filters';
import type { StorageSession, StorageAdapter } from './interfaces';
import { serviceContainer } from './services/ServiceContainer';
import { StorageService } from './services/StorageService';
import { SessionManager } from './services/SessionManager';

/**
 * Refactored PersistentFilterStorage with proper architecture
 *
 * Features:
 * - Dependency injection via ServiceContainer
 * - No circular dependencies
 * - Thread-safe session management
 * - Coordinated health monitoring and cleanup
 * - Backward compatibility with original FilterStorage interface
 */
export class RefactoredPersistentFilterStorage implements FilterStorage {
  private sessionId: string;
  private userId?: string;
  private apiUrl?: string;
  private initialized = false;
  private mockStorageService: StorageService | null = null;
  private mockSessionManager: SessionManager | null = null;

  /**
   * Create a new refactored persistent storage instance
   *
   * @param sessionId - Unique session identifier
   * @param userId - Optional user ID for session isolation
   * @param apiUrl - Optional API URL for session context
   * @param mockAdapter - Optional mock adapter for testing
   */
  constructor(
    sessionId: string,
    userId?: string,
    apiUrl?: string,
    mockAdapter?: StorageAdapter
  ) {
    this.sessionId = sessionId;
    if (userId !== undefined) {
      this.userId = userId;
    }
    if (apiUrl !== undefined) {
      this.apiUrl = apiUrl;
    }

    // For testing, create mock services with injected adapter
    if (mockAdapter) {
      this.mockStorageService = new StorageService(mockAdapter);
      this.mockSessionManager = new SessionManager();
    }
  }

  /**
   * Ensure services are initialized through the container or mocks
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // For testing with mocks, initialize session manually
      if (this.mockSessionManager && this.mockStorageService) {
        await this.mockSessionManager.createSession(this.sessionId, this.userId, this.apiUrl);
        this.initialized = true;
        return;
      }

      // Production: Initialize service container if not already done
      await serviceContainer.initialize();

      // Get storage service from container (this handles all dependencies)
      await serviceContainer.getStorageService(this.sessionId, this.userId, this.apiUrl);

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize refactored storage services', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: this.sessionId,
      });
      throw error;
    }
  }

  /**
   * Get the storage service for this session
   */
  private async getStorageService() {
    await this.ensureInitialized();

    // For testing, return mock service
    if (this.mockStorageService) {
      return this.mockStorageService;
    }

    // Production: Get from container
    const storageService = await serviceContainer.getStorageService(this.sessionId, this.userId, this.apiUrl);
    return storageService;
  }

  /**
   * Update session access time
   */
  private async updateAccessTime(): Promise<void> {
    // For testing, use mock session manager
    if (this.mockSessionManager) {
      await this.mockSessionManager.updateAccessTime(this.sessionId);
      return;
    }

    // Production: Use container session manager
    const sessionManager = serviceContainer.getSessionManager();
    await sessionManager.updateAccessTime(this.sessionId);
  }

  // FilterStorage interface implementation

  async list(): Promise<SavedFilter[]> {
    const storageService = await this.getStorageService();
    await this.updateAccessTime();
    return await storageService.list();
  }

  async get(id: string): Promise<SavedFilter | null> {
    const storageService = await this.getStorageService();
    await this.updateAccessTime();
    return await storageService.get(id);
  }

  async create(filter: Omit<SavedFilter, 'id' | 'created' | 'updated'>): Promise<SavedFilter> {
    const storageService = await this.getStorageService();
    await this.updateAccessTime();
    return await storageService.create(filter);
  }

  async update(
    id: string,
    filter: Partial<Omit<SavedFilter, 'id' | 'created' | 'updated'>>,
  ): Promise<SavedFilter> {
    const storageService = await this.getStorageService();
    await this.updateAccessTime();
    return await storageService.update(id, filter);
  }

  async delete(id: string): Promise<void> {
    const storageService = await this.getStorageService();
    await this.updateAccessTime();
    await storageService.delete(id);
  }

  async findByName(name: string): Promise<SavedFilter | null> {
    const storageService = await this.getStorageService();
    await this.updateAccessTime();
    return await storageService.findByName(name);
  }

  async clear(): Promise<void> {
    const storageService = await this.getStorageService();
    await this.updateAccessTime();
    await storageService.clear();
  }

  async getByProject(projectId: number): Promise<SavedFilter[]> {
    const storageService = await this.getStorageService();
    await this.updateAccessTime();
    return await storageService.getByProject(projectId);
  }

  async getStats(): Promise<{
    filterCount: number;
    sessionId: string;
    createdAt: Date;
    lastAccessAt: Date;
    storageType: string;
    additionalInfo?: Record<string, unknown>;
  }> {
    const storageService = await this.getStorageService();
    await this.updateAccessTime();
    return await storageService.getStats();
  }

  async close(): Promise<void> {
    try {
      // For testing, close mock service directly
      if (this.mockStorageService) {
        await this.mockStorageService.close();
        return;
      }

      // Production: Use container cleanup
      await serviceContainer.removeStorageService(this.sessionId);
    } catch (error) {
      logger.warn('Error closing refactored persistent filter storage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: this.sessionId,
      });
    }
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }> {
    try {
      const storageService = await this.getStorageService();
      const health = await storageService.healthCheck();
      return {
        ...health,
        details: {
          ...health.details,
          serviceType: 'RefactoredPersistentFilterStorage',
          sessionId: this.sessionId,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          serviceType: 'RefactoredPersistentFilterStorage',
          sessionId: this.sessionId,
        },
      };
    }
  }

  async getSession(): Promise<StorageSession> {
    // For testing, use mock session manager
    if (this.mockSessionManager) {
      const session = await this.mockSessionManager.getSession(this.sessionId);
      if (!session) {
        throw new Error(`Session ${this.sessionId} not found`);
      }
      return session;
    }

    // Production: Use container session manager
    const sessionManager = serviceContainer.getSessionManager();
    const session = await sessionManager.getSession(this.sessionId);
    if (!session) {
      throw new Error(`Session ${this.sessionId} not found`);
    }
    return session;
  }
}