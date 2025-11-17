/**
 * Circuit Breaker Compatibility Layer
 * This file provides backward compatibility for the custom circuit breaker implementation
 * All functionality has been moved to src/utils/retry.ts using opossum
 *
 * DEPRECATED: Import from src/utils/retry.ts instead
 */

export { circuitBreakerRegistry, createCircuitBreaker } from './retry';

// Re-export types from opossum for backward compatibility
export type { CircuitBreakerOptions } from './retry';

// Legacy enum for backward compatibility
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

// Legacy interface for backward compatibility
export interface CircuitBreakerOptionsLegacy {
  failureThreshold?: number;
  recoveryTimeout?: number;
  monitoringPeriod?: number;
  expectedException?: (error: unknown) => boolean;
}

// Legacy circuit breaker class wrapper around opossum
export class CircuitBreaker {
  private opossumBreaker: any;
  private name: string;

  constructor(options: CircuitBreakerOptionsLegacy = {}) {
    this.name = 'legacy-circuit-breaker';
    this.opossumBreaker = null;

    // This is a compatibility wrapper - actual functionality moved to retry.ts
    throw new Error(
      'Legacy CircuitBreaker class is deprecated. ' +
      'Use createCircuitBreaker() from ./retry.ts or withRetry() function instead.'
    );
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    throw new Error('Legacy CircuitBreaker.execute() is deprecated. Use withRetry() from ./retry.ts');
  }

  async getState(): Promise<CircuitState> {
    return CircuitState.CLOSED;
  }

  async getStats(): Promise<any> {
    return { state: CircuitState.CLOSED };
  }

  async reset(): Promise<void> {
    // No-op for compatibility
  }

  async open(): Promise<void> {
    // No-op for compatibility
  }

  // Sync compatibility methods
  getStateSync(): CircuitState {
    return CircuitState.CLOSED;
  }

  getStatsSync(): any {
    return { state: CircuitState.CLOSED };
  }
}

// Factory function - redirects to opossum implementation
export function createCircuitBreakerLegacy(
  name: string,
  options?: Partial<CircuitBreakerOptionsLegacy>
): CircuitBreaker {
  console.warn(
    `createCircuitBreaker() is deprecated for circuit-breaker.ts. ` +
    `Import createCircuitBreaker from ./retry.ts instead.`
  );

  throw new Error(
    'createCircuitBreaker() moved to ./retry.ts. Import from there instead.'
  );
}