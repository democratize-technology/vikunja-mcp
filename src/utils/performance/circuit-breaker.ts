/**
 * Circuit breaker pattern for API resilience
 * Prevents cascading failures and enables graceful degradation
 */

import { logger } from '../logger';

export interface CircuitBreakerOptions {
  /**
   * Number of failures before circuit opens (default: 5)
   */
  failureThreshold: number;
  
  /**
   * Time in milliseconds before attempting to close circuit (default: 60000)
   */
  resetTimeout: number;
  
  /**
   * Time in milliseconds to monitor for failures (default: 60000)
   */
  monitoringWindow: number;
  
  /**
   * Enable performance metrics collection (default: true)
   */
  enableMetrics: boolean;
}

export enum CircuitState {
  CLOSED = 'closed',    // Normal operation
  OPEN = 'open',        // Failing, reject requests immediately
  HALF_OPEN = 'half-open' // Testing if service recovered
}

export interface CircuitMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  requests: number;
  lastFailureTime?: number | undefined;
  lastSuccessTime?: number | undefined;
  stateChanges: number;
  uptime: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  monitoringWindow: 60000, // 1 minute
  enableMetrics: true,
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private requests: number = 0;
  private lastFailureTime?: number | undefined;
  private lastSuccessTime?: number | undefined;
  private stateChanges: number = 0;
  private readonly startTime: number = Date.now();
  private readonly options: CircuitBreakerOptions;
  private resetTimer?: NodeJS.Timeout | undefined;

  constructor(
    private readonly name: string,
    options: Partial<CircuitBreakerOptions> = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    
    if (this.options.enableMetrics) {
      logger.debug('Circuit breaker initialized', {
        name: this.name,
        options: this.options,
      });
    }
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.requests++;

    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.stateChanges++;
        logger.info('Circuit breaker transitioning to half-open', {
          name: this.name,
          timeSinceFailure: this.lastFailureTime ? Date.now() - this.lastFailureTime : 0,
        });
      } else {
        throw new CircuitOpenError(this.name, this.getMetrics());
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if circuit breaker allows requests
   */
  isOpen(): boolean {
    return this.state === CircuitState.OPEN && !this.shouldAttemptReset();
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      requests: this.requests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChanges: this.stateChanges,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = undefined;
    this.stateChanges++;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }

    logger.info('Circuit breaker manually reset', {
      name: this.name,
      metrics: this.getMetrics(),
    });
  }

  /**
   * Force circuit breaker to open state
   */
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.stateChanges++;
    
    logger.warn('Circuit breaker forced open', {
      name: this.name,
      metrics: this.getMetrics(),
    });
  }

  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Successful request in half-open state, close the circuit
      this.state = CircuitState.CLOSED;
      this.failures = 0; // Reset failure count
      this.stateChanges++;
      
      logger.info('Circuit breaker closed after successful test', {
        name: this.name,
        metrics: this.getMetrics(),
      });
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Failed request in half-open state, open the circuit
      this.state = CircuitState.OPEN;
      this.stateChanges++;
      this.scheduleReset();
      
      logger.warn('Circuit breaker opened after failed test', {
        name: this.name,
        metrics: this.getMetrics(),
      });
    } else if (this.state === CircuitState.CLOSED && this.failures >= this.options.failureThreshold) {
      // Too many failures in closed state, open the circuit
      this.state = CircuitState.OPEN;
      this.stateChanges++;
      this.scheduleReset();
      
      logger.warn('Circuit breaker opened due to failure threshold', {
        name: this.name,
        failureThreshold: this.options.failureThreshold,
        metrics: this.getMetrics(),
      });
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime >= this.options.resetTimeout;
  }

  private scheduleReset(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      if (this.state === CircuitState.OPEN) {
        logger.debug('Circuit breaker reset timer expired', {
          name: this.name,
          willAttemptTest: true,
        });
      }
    }, this.options.resetTimeout);
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitOpenError extends Error {
  constructor(
    public readonly circuitName: string,
    public readonly metrics: CircuitMetrics
  ) {
    super(`Circuit breaker '${circuitName}' is open. State: ${metrics.state}, Failures: ${metrics.failures}`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Circuit breaker manager for multiple services
 */
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create circuit breaker for service
   */
  getBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, options));
    }
    return this.breakers.get(name)!;
  }

  /**
   * Get metrics for all circuit breakers
   */
  getAllMetrics(): Record<string, CircuitMetrics> {
    const metrics: Record<string, CircuitMetrics> = {};
    for (const [name, breaker] of this.breakers) {
      metrics[name] = breaker.getMetrics();
    }
    return metrics;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    logger.info('All circuit breakers reset');
  }

  /**
   * Get health status of all services
   */
  getHealthStatus(): { healthy: string[]; degraded: string[]; failed: string[] } {
    const healthy: string[] = [];
    const degraded: string[] = [];
    const failed: string[] = [];

    for (const [name, breaker] of this.breakers) {
      const metrics = breaker.getMetrics();
      
      if (metrics.state === CircuitState.CLOSED) {
        healthy.push(name);
      } else if (metrics.state === CircuitState.HALF_OPEN) {
        degraded.push(name);
      } else {
        failed.push(name);
      }
    }

    return { healthy, degraded, failed };
  }
}

// Global circuit breaker manager
export const circuitBreakerManager = new CircuitBreakerManager();

// Predefined circuit breakers for common operations
export const bulkOperationBreaker = circuitBreakerManager.getBreaker('bulk-operations', {
  failureThreshold: 3,
  resetTimeout: 30000, // 30 seconds for bulk operations
  monitoringWindow: 60000,
});

export const individualOperationBreaker = circuitBreakerManager.getBreaker('individual-operations', {
  failureThreshold: 10, // More tolerant for individual operations
  resetTimeout: 60000,
  monitoringWindow: 120000,
});

export const apiHealthBreaker = circuitBreakerManager.getBreaker('api-health', {
  failureThreshold: 5,
  resetTimeout: 120000, // 2 minutes for API health
  monitoringWindow: 300000, // 5 minutes
});