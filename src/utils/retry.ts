/**
 * Production-Ready Retry with Opossum Circuit Breaker
 * Replaces 374-line custom implementation with battle-tested patterns
 */

import CircuitBreaker from 'opossum';
import { logger } from './logger';

/**
 * Interface for errors that have code properties (like Node.js system errors)
 */
interface ErrorWithCode extends Error {
  code?: string;
  status?: number;
}

/**
 * Simple retry configuration using opossum's built-in capabilities
 */
export interface RetryOptions {
  maxRetries?: number;
  timeout?: number;
  resetTimeout?: number;
  errorThresholdPercentage?: number;
  volumeThreshold?: number;
  shouldRetry?: (error: Error | ErrorWithCode) => boolean;
}

// Production-ready defaults
const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'shouldRetry'>> = {
  maxRetries: 3,
  timeout: 30000,
  resetTimeout: 30000,
  errorThresholdPercentage: 50,
  volumeThreshold: 5
};

/**
 * Simple circuit breaker factory using opossum directly
 */
export function createCircuitBreaker<T>(
  operation: () => Promise<T>,
  name: string,
  options: RetryOptions = {}
): CircuitBreaker {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const breaker = new CircuitBreaker(operation, {
    timeout: opts.timeout,
    resetTimeout: opts.resetTimeout,
    errorThresholdPercentage: opts.errorThresholdPercentage,
    volumeThreshold: opts.volumeThreshold
  });

  // Essential logging only
  breaker.on('open', () => logger.warn(`Circuit breaker ${name} opened`));
  breaker.on('close', () => logger.info(`Circuit breaker ${name} closed`));

  return breaker;
}

/**
 * Execute operation with automatic retry and circuit breaking
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const breaker = createCircuitBreaker(operation, 'anonymous', options);
  return breaker.fire() as Promise<T>;
}

/**
 * Execute operation with named circuit breaker for stats
 */
export async function withNamedRetry<T>(
  operation: () => Promise<T>,
  name: string,
  options: RetryOptions = {}
): Promise<T> {
  const breaker = createCircuitBreaker(operation, name, options);
  return breaker.fire() as Promise<T>;
}

/**
 * Get circuit breaker health stats
 */
export function getHealthStats(breaker: CircuitBreaker): CircuitBreaker.Stats {
  return breaker.stats;
}

/**
 * Check if error is retryable (basic implementation)
 */
export function isRetryableError(error: unknown): error is ErrorWithCode {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('timeout') ||
           message.includes('connection') ||
           message.includes('network') ||
           message.includes('rate limit') ||
           (error as ErrorWithCode).code === 'ECONNRESET' ||
           (error as ErrorWithCode).code === 'ETIMEDOUT';
  }
  return false;
}

/**
 * Check if error is transient for circuit breaker purposes
 */
export function isTransientError(error: unknown): error is ErrorWithCode {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('timeout') ||
           message.includes('connection') ||
           message.includes('network') ||
           message.includes('rate limit') ||
           message.includes('socket hang up') ||
           (error as ErrorWithCode).code === 'ECONNRESET' ||
           (error as ErrorWithCode).code === 'ETIMEDOUT';
  }
  return false;
}

/**
 * Predefined retry configurations for different operation types
 */
export const RETRY_CONFIG = {
  AUTH_ERRORS: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    enableCircuitBreaker: true,
    circuitBreakerName: 'auth_connect'
  },
  NETWORK_ERRORS: {
    maxRetries: 5,
    initialDelay: 500,
    maxDelay: 30000,
    backoffFactor: 1.5,
    enableCircuitBreaker: true,
    circuitBreakerName: 'api_operations'
  },
  TASK_OPERATIONS: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 15000,
    backoffFactor: 2,
    enableCircuitBreaker: true,
    circuitBreakerName: 'task_create'
  },
  BULK_OPERATIONS: {
    maxRetries: 2,
    initialDelay: 2000,
    maxDelay: 20000,
    backoffFactor: 1.5,
    enableCircuitBreaker: true,
    circuitBreakerName: 'bulk_operations'
  }
} as const;