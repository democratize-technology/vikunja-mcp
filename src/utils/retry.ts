import { logger } from './logger';
import { isAuthenticationError } from './auth-error-handler';
import { circuitBreakerRegistry } from './circuit-breaker';

interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
  shouldRetry?: (error: unknown) => boolean;
  circuitBreakerName?: string; // Name for circuit breaker instance
  enableCircuitBreaker?: boolean; // Enable circuit breaker protection
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000,    // 10 seconds
  backoffFactor: 2,
  shouldRetry: (error) => isAuthenticationError(error) || isTransientError(error)
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  // Apply circuit breaker if enabled
  if (opts.enableCircuitBreaker && opts.circuitBreakerName) {
    const circuitBreaker = circuitBreakerRegistry.get(opts.circuitBreakerName);

    try {
      return await circuitBreaker.execute(async () => {
        return await performRetryWithBackoff(operation, opts);
      });
    } catch (error) {
      // Check if error is from circuit breaker being open
      if (error instanceof Error && error.message.includes('Circuit breaker is OPEN')) {
        logger.warn('Circuit breaker prevented operation', {
          circuitBreaker: opts.circuitBreakerName,
          stats: circuitBreaker.getStatsSync() // Use sync version to avoid deadlock
        });
      }
      throw error;
    }
  } else {
    return await performRetryWithBackoff(operation, opts);
  }
}

async function performRetryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === options.maxRetries || !options.shouldRetry?.(error)) {
        break;
      }

      const delay = Math.min(
        options.initialDelay * Math.pow(options.backoffFactor, attempt),
        options.maxDelay
      );

      logger.debug(`Retrying operation after ${delay}ms`, {
        attempt: attempt + 1,
        maxRetries: options.maxRetries,
        error: error instanceof Error ? error.message : String(error)
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('etimedout') ||
      message.includes('econnreset') ||
      message.includes('connection reset') ||
      message.includes('socket hang up') ||
      message.includes('socket closed') ||
      message.includes('network')
    );
  }
  return false;
}

export const RETRY_CONFIG = {
  AUTH_ERRORS: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2
  },
  NETWORK_ERRORS: {
    maxRetries: 5,
    initialDelay: 500,
    maxDelay: 30000,
    backoffFactor: 1.5
  },
  CIRCUIT_BREAKER: {
    failureThreshold: 5,
    recoveryTimeout: 30000, // 30 seconds
    enableCircuitBreaker: true
  }
};