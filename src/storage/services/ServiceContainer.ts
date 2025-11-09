/**
 * ServiceContainer - Dependency injection container for storage services
 *
 * This container manages all storage service dependencies and ensures
 * proper initialization order to avoid circular dependencies.
 */

import { logger } from '../../utils/logger';
import { StorageService } from './StorageService';
import { SessionManager } from './SessionManager';
import { HealthMonitor } from './HealthMonitor';
import { CleanupService } from './CleanupService';
import { storageAdapterFactory } from '../adapters/factory';
import { loadStorageConfig } from '../config';
import type { StorageAdapter, StorageSession, StorageConfig } from '../interfaces';
import type { StorageAdapterFactory } from '../interfaces';

/**
 * Service container with proper dependency injection
 */
export class ServiceContainer {
  private static instance: ServiceContainer | null = null;

  private sessionManager: SessionManager;
  private healthMonitor: HealthMonitor;
  private cleanupService: CleanupService;
  private adapterFactory: StorageAdapterFactory;
  private config: StorageConfig;

  private storageServices = new Map<string, StorageService>();
  private initialized = false;

  private constructor() {
    this.sessionManager = new SessionManager();
    this.healthMonitor = new HealthMonitor();
    this.cleanupService = new CleanupService();
    this.adapterFactory = storageAdapterFactory;
    this.config = loadStorageConfig();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  /**
   * Initialize all services
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Start cleanup timer
      this.cleanupService.startCleanupTimer();

      this.initialized = true;
      logger.debug('ServiceContainer initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ServiceContainer', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Create or get a storage service for a session
   */
  async getStorageService(sessionId: string, userId?: string, apiUrl?: string): Promise<StorageService> {
    // Check if already exists
    let storageService = this.storageServices.get(sessionId);
    if (storageService) {
      return storageService;
    }

    // Create new session
    const session = await this.sessionManager.createSession(sessionId, userId, apiUrl);

    // Create new storage service with proper dependencies
    storageService = new StorageService(null, this.adapterFactory, this.config);
    await storageService.initialize(session);

    // Register with cleanup service
    this.cleanupService.addStorage(sessionId, storageService);

    // Store in cache
    this.storageServices.set(sessionId, storageService);

    return storageService;
  }

  /**
   * Remove a storage service
   */
  async removeStorageService(sessionId: string): Promise<void> {
    const storageService = this.storageServices.get(sessionId);
    if (storageService) {
      this.cleanupService.removeStorage(sessionId);
      await storageService.close();
      this.storageServices.delete(sessionId);
      await this.sessionManager.removeSession(sessionId);
    }
  }

  /**
   * Get session manager
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get health monitor
   */
  getHealthMonitor(): HealthMonitor {
    return this.healthMonitor;
  }

  /**
   * Get cleanup service
   */
  getCleanupService(): CleanupService {
    return this.cleanupService;
  }

  /**
   * Perform health check on all storage services
   */
  async healthCheckAll(): Promise<Array<{
    sessionId: string;
    healthy: boolean;
    error?: string;
    details?: Record<string, unknown>;
  }>> {
    const healthChecks = [];

    for (const [sessionId, storageService] of this.storageServices.entries()) {
      try {
        const healthCheck = await storageService.healthCheck();
        healthChecks.push({
          sessionId,
          ...healthCheck,
        });
      } catch (error) {
        healthChecks.push({
          sessionId,
          healthy: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return healthChecks;
  }

  /**
   * Get statistics for all storage services
   */
  async getAllStats(): Promise<Array<{
    filterCount: number;
    sessionId: string;
    createdAt: Date;
    lastAccessAt: Date;
    storageType: string;
    additionalInfo?: Record<string, unknown>;
  }>> {
    return await this.cleanupService.getAllStats();
  }

  /**
   * Cleanup all resources
   */
  async cleanup(): Promise<void> {
    try {
      // Stop cleanup timer
      this.cleanupService.stopCleanupTimer();

      // Close all storage services
      const closePromises = Array.from(this.storageServices.entries()).map(
        async ([sessionId, storageService]) => {
          try {
            await storageService.close();
          } catch (error) {
            logger.warn('Error closing storage service during cleanup', {
              sessionId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      );

      await Promise.all(closePromises);
      this.storageServices.clear();

      // Clear sessions
      await this.sessionManager.clearAllSessions();

      this.initialized = false;
      logger.debug('ServiceContainer cleanup completed');
    } catch (error) {
      logger.error('Error during ServiceContainer cleanup', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Reset singleton (for testing)
   */
  static resetInstance(): void {
    if (ServiceContainer.instance) {
      ServiceContainer.instance.cleanup();
      ServiceContainer.instance = null;
    }
  }
}

// Export singleton instance
export const serviceContainer = ServiceContainer.getInstance();