/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures during API outages and network partitions
 */

import { logger } from './logger';
import { AsyncMutex } from './AsyncMutex';

export enum CircuitState {
  CLOSED = 'closed',   // Normal operation
  OPEN = 'open',       // Failing fast
  HALF_OPEN = 'half_open' // Testing if recovery has occurred
}

export interface CircuitBreakerOptions {
  failureThreshold: number;      // Number of failures before opening
  recoveryTimeout: number;      // Milliseconds to wait before trying again
  monitoringPeriod?: number;    // Period to consider for failures (optional)
  expectedException?: (error: unknown) => boolean; // Function to determine if error counts as failure
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  private stateMutex = new AsyncMutex(); // Protect all state mutations

  constructor(private options: CircuitBreakerOptions) {
    this.options = {
      monitoringPeriod: 60000, // 1 minute default
      expectedException: (error: unknown) => true, // Count all errors as failures by default
      ...options
    };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const release = await this.stateMutex.acquire();
    try {
      if (this.state === CircuitState.OPEN) {
        if (this.shouldAttemptReset()) {
          this.state = CircuitState.HALF_OPEN;
          logger.debug('Circuit breaker moving to HALF_OPEN state');
        } else {
          throw new Error('Circuit breaker is OPEN - operation not permitted');
        }
      }
    } finally {
      release();
    }

    try {
      const result = await operation();
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure();
      throw error;
    }
  }

  private async onSuccess(): Promise<void> {
    const release = await this.stateMutex.acquire();
    try {
      this.successCount++;
      if (this.state === CircuitState.HALF_OPEN) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        logger.info('Circuit breaker reset to CLOSED after successful operation');
      }
    } finally {
      release();
    }
  }

  private async onFailure(): Promise<void> {
    const release = await this.stateMutex.acquire();
    try {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.state === CircuitState.HALF_OPEN) {
        this.state = CircuitState.OPEN;
        logger.warn('Circuit breaker opening again after failure in HALF_OPEN state');
      } else if (this.failureCount >= this.options.failureThreshold) {
        this.state = CircuitState.OPEN;
        logger.warn('Circuit breaker opened due to failure threshold exceeded', {
          failureCount: this.failureCount,
          threshold: this.options.failureThreshold
        });
      }
    } finally {
      release();
    }
  }

  private shouldAttemptReset(): boolean {
    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return timeSinceLastFailure >= this.options.recoveryTimeout;
  }

  async getState(): Promise<CircuitState> {
    const release = await this.stateMutex.acquire();
    try {
      return this.state;
    } finally {
      release();
    }
  }

  async getStats(): Promise<{
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    failureThreshold: number;
    recoveryTimeout: number;
  }> {
    const release = await this.stateMutex.acquire();
    try {
      return {
        state: this.state,
        failureCount: this.failureCount,
        successCount: this.successCount,
        lastFailureTime: this.lastFailureTime,
        failureThreshold: this.options.failureThreshold,
        recoveryTimeout: this.options.recoveryTimeout
      };
    } finally {
      release();
    }
  }

  // Manual control methods
  async reset(): Promise<void> {
    const release = await this.stateMutex.acquire();
    try {
      this.state = CircuitState.CLOSED;
      this.failureCount = 0;
      this.lastFailureTime = 0;
      this.successCount = 0;
      logger.info('Circuit breaker manually reset to CLOSED');
    } finally {
      release();
    }
  }

  async open(): Promise<void> {
    const release = await this.stateMutex.acquire();
    try {
      this.state = CircuitState.OPEN;
      this.lastFailureTime = Date.now();
      logger.warn('Circuit breaker manually opened');
    } finally {
      release();
    }
  }

  // Synchronous versions for backward compatibility - NOT THREAD SAFE
  // WARNING: These methods can return inconsistent state during concurrent access
  getStateSync(): CircuitState {
    return this.state;
  }

  getStatsSync(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    failureThreshold: number;
    recoveryTimeout: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      failureThreshold: this.options.failureThreshold,
      recoveryTimeout: this.options.recoveryTimeout
    };
  }
}

// Factory function for creating circuit breakers with common configurations
export function createCircuitBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
  const defaultOptions: CircuitBreakerOptions = {
    failureThreshold: 5,
    recoveryTimeout: 30000, // 30 seconds
    expectedException: (error: unknown) => {
      // Count network errors and API failures
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
          message.includes('timeout') ||
          message.includes('connection') ||
          message.includes('network') ||
          message.includes('enotfound') ||
          message.includes('econnrefused') ||
          message.includes('econnreset') ||
          message.includes('socket') ||
          message.includes('5') || // HTTP 5xx errors
          (error as any).status >= 500
        );
      }
      return true;
    }
  };

  const circuitBreaker = new CircuitBreaker({ ...defaultOptions, ...options });
  logger.debug(`Created circuit breaker "${name}" with options`, { ...defaultOptions, ...options });

  return circuitBreaker;
}

// Global circuit breaker registry for managing multiple circuit breakers
class CircuitBreakerRegistry {
  private circuitBreakers = new Map<string, CircuitBreaker>();

  get(name: string): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, createCircuitBreaker(name));
    }
    return this.circuitBreakers.get(name)!;
  }

  async getAllStats(): Promise<Record<string, {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    failureThreshold: number;
    recoveryTimeout: number;
  }>> {
    const stats: Record<string, {
      state: CircuitState;
      failureCount: number;
      successCount: number;
      lastFailureTime: number;
      failureThreshold: number;
      recoveryTimeout: number;
    }> = {};
    const promises: Promise<void>[] = [];

    this.circuitBreakers.forEach((breaker, name) => {
      promises.push(
        breaker.getStats().then(breakerStats => {
          stats[name] = breakerStats;
        })
      );
    });

    await Promise.all(promises);
    return stats;
  }

  async resetAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    this.circuitBreakers.forEach((breaker) => {
      promises.push(breaker.reset());
    });

    await Promise.all(promises);
    logger.info('All circuit breakers reset');
  }

  // Synchronous versions for backward compatibility
  getAllStatsSync(): Record<string, {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    failureThreshold: number;
    recoveryTimeout: number;
  }> {
    const stats: Record<string, {
      state: CircuitState;
      failureCount: number;
      successCount: number;
      lastFailureTime: number;
      failureThreshold: number;
      recoveryTimeout: number;
    }> = {};
    this.circuitBreakers.forEach((breaker, name) => {
      stats[name] = breaker.getStatsSync();
    });
    return stats;
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();