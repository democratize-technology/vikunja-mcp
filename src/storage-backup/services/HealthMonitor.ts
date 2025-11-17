/**
 * HealthMonitor - Monitors storage adapter health and handles recovery
 *
 * This service provides health monitoring for storage adapters with
 * automatic recovery capabilities and detailed health reporting.
 */

import { logger } from '../../utils/logger';
import type { StorageAdapter } from '../interfaces';

/**
 * Health monitoring result
 */
export interface HealthStatus {
  healthy: boolean;
  error?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * HealthMonitor provides health monitoring and recovery for storage adapters
 */
export class HealthMonitor {
  /**
   * Check the health of a storage adapter
   */
  async checkHealth(adapter: StorageAdapter, sessionId?: string): Promise<HealthStatus> {
    const timestamp = new Date();

    try {
      const healthCheck = await adapter.healthCheck();
      return {
        ...healthCheck,
        timestamp,
        details: {
          ...healthCheck.details,
          sessionId,
        },
      };
    } catch (error) {
      logger.warn('Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId,
      });

      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          sessionId,
        },
        timestamp,
      };
    }
  }

  /**
   * Check health with recovery attempt
   */
  async checkWithRecovery(
    adapter: StorageAdapter,
    sessionId: string,
    recoveryFunction: () => Promise<StorageAdapter>,
  ): Promise<HealthStatus> {
    const timestamp = new Date();

    try {
      // First check current health
      const healthCheck = await this.checkHealth(adapter, sessionId);

      if (healthCheck.healthy) {
        return healthCheck;
      }

      logger.info('Attempting storage adapter recovery', {
        sessionId,
        originalError: healthCheck.error,
      });

      // Attempt recovery
      try {
        const recoveredAdapter = await recoveryFunction();
        const recoveredHealth = await recoveredAdapter.healthCheck();

        if (recoveredHealth.healthy) {
          logger.info('Storage adapter recovery successful', {
            sessionId,
          });

          return {
            healthy: true,
            details: {
              ...recoveredHealth.details,
              sessionId,
              recovered: true,
              recoveredAt: timestamp.toISOString(),
            },
            timestamp,
          };
        } else {
          logger.warn('Storage adapter recovery failed', {
            sessionId,
            recoveryError: recoveredHealth.error,
          });

          return {
            healthy: false,
            error: `Recovery failed: ${recoveredHealth.error}`,
            details: {
              sessionId,
              recovered: false,
              attemptedAt: timestamp.toISOString(),
            },
            timestamp,
          };
        }
      } catch (recoveryError) {
        logger.error('Storage adapter recovery threw error', {
          sessionId,
          error: recoveryError instanceof Error ? recoveryError.message : 'Unknown error',
        });

        return {
          healthy: false,
          error: `Recovery threw error: ${recoveryError instanceof Error ? recoveryError.message : 'Unknown error'}`,
          details: {
            sessionId,
            recovered: false,
            attemptedAt: timestamp.toISOString(),
          },
          timestamp,
        };
      }
    } catch (error) {
      logger.error('Health check with recovery failed', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          sessionId,
          timestamp: timestamp.toISOString(),
        },
        timestamp,
      };
    }
  }

  /**
   * Continuous health monitoring for multiple adapters
   */
  async monitorMultiple(
    adapters: Array<{ adapter: StorageAdapter; sessionId: string }>,
  ): Promise<Array<{ sessionId: string; health: HealthStatus }>> {
    const healthChecks = await Promise.allSettled(
      adapters.map(async ({ adapter, sessionId }) => ({
        sessionId,
        health: await this.checkHealth(adapter, sessionId),
      })),
    );

    return healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const sessionId = adapters[index]?.sessionId || 'unknown';
        return {
          sessionId,
          health: {
            healthy: false,
            error: `Health check failed: ${result.reason}`,
            timestamp: new Date(),
          },
        };
      }
    });
  }
}