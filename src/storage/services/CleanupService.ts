/**
 * CleanupService - Handles cleanup of expired sessions and resources
 *
 * This service manages cleanup operations for expired storage sessions
 * and provides resource management with configurable cleanup intervals.
 */

import { logger } from '../../utils/logger';

/**
 * Storage service interface for cleanup operations
 */
export interface StorageServiceInterface {
  close(): Promise<void>;
  getStats(): Promise<{
    filterCount: number;
    sessionId: string;
    createdAt: Date;
    lastAccessAt: Date;
    storageType: string;
    additionalInfo?: Record<string, unknown>;
  }>;
}

/**
 * CleanupService manages expired session cleanup and resource management
 */
export class CleanupService {
  private storageServices = new Map<string, StorageServiceInterface>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly defaultCleanupInterval = 60 * 60 * 1000; // 1 hour

  /**
   * Add a storage service for cleanup monitoring
   */
  addStorage(sessionId: string, storageService: StorageServiceInterface): void {
    this.storageServices.set(sessionId, storageService);
  }

  /**
   * Remove a storage service from cleanup monitoring
   */
  removeStorage(sessionId: string): void {
    this.storageServices.delete(sessionId);
  }

  /**
   * Cleanup expired sessions based on timeout threshold
   */
  async cleanupExpiredSessions(timeoutMs: number = this.defaultCleanupInterval): Promise<void> {
    const now = new Date();
    const expiredSessions: string[] = [];

    // Identify expired sessions
    for (const [sessionId, storageService] of this.storageServices.entries()) {
      try {
        const stats = await storageService.getStats();
        const timeSinceLastAccess = now.getTime() - stats.lastAccessAt.getTime();

        if (timeSinceLastAccess > timeoutMs) {
          expiredSessions.push(sessionId);
        }
      } catch (error) {
        logger.warn('Error checking session expiry, marking for cleanup', {
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        expiredSessions.push(sessionId);
      }
    }

    // Clean up expired sessions
    for (const sessionId of expiredSessions) {
      try {
        const storageService = this.storageServices.get(sessionId);
        if (storageService) {
          await storageService.close();
          this.storageServices.delete(sessionId);
          logger.debug(`Cleaned up expired session: ${sessionId}`);
        }
      } catch (error) {
        logger.warn('Error cleaning up expired session', {
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    if (expiredSessions.length > 0) {
      logger.info(`Cleaned up ${expiredSessions.length} expired storage sessions`);
    }
  }

  /**
   * Start automatic cleanup timer
   */
  startCleanupTimer(intervalMs: number = this.defaultCleanupInterval): void {
    this.stopCleanupTimer();

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions().catch((error) => {
        logger.error('Error during automatic cleanup', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, intervalMs);

    logger.debug(`Started cleanup timer with ${intervalMs}ms interval`);
  }

  /**
   * Stop automatic cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.debug('Stopped cleanup timer');
    }
  }

  /**
   * Force cleanup of all storage services
   */
  async cleanupAll(): Promise<void> {
    const closePromises = Array.from(this.storageServices.entries()).map(
      async ([sessionId, storageService]) => {
        try {
          await storageService.close();
          logger.debug(`Cleaned up storage service: ${sessionId}`);
        } catch (error) {
          logger.warn('Error closing storage service during cleanup all', {
            sessionId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
    );

    await Promise.all(closePromises);
    this.storageServices.clear();

    logger.info('Cleaned up all storage services');
  }

  /**
   * Get count of active storage services
   */
  getActiveStorageCount(): number {
    return this.storageServices.size;
  }

  /**
   * Get statistics for all managed storage services
   */
  async getAllStats(): Promise<Array<{
    sessionId: string;
    filterCount: number;
    createdAt: Date;
    lastAccessAt: Date;
    storageType: string;
    additionalInfo?: Record<string, unknown>;
  }>> {
    const stats = [];

    for (const [sessionId, storageService] of this.storageServices.entries()) {
      try {
        const storageStats = await storageService.getStats();
        stats.push(storageStats);
      } catch (error) {
        logger.warn('Failed to get stats for storage service', {
          sessionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return stats;
  }
}