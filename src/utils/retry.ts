/**
 * Retry and Circuit Breaker Implementation using Opossum
 * Eliminates 200+ lines of custom retry logic with battle-tested library
 */

import { logger } from './logger';
import { isAuthenticationError } from './auth-error-handler';
import CircuitBreaker from 'opossum';

// Opossum options type
export interface CircuitBreakerOptions {
  timeout?: number;
  resetTimeout?: number;
  maxFailures?: number;
  halfOpenMaxRequests?: number;
  errorThresholdPercentage?: number;
  volumeThreshold?: number;
  enable?: boolean;
  cache?: boolean;
  cacheTimeout?: number;
  rollingCountTimeout?: number;
  rollingCountBuckets?: number;
  name?: string;
  group?: string;
  statusPercentileOptions?: any;
  fallback?: any;
  isFailure?: (error: any) => boolean;
}

// Opossum-based retry options (much simpler than custom implementation)
export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  shouldRetry?: (error: unknown) => boolean;
  circuitBreakerName?: string;
  enableCircuitBreaker?: boolean;
  timeout?: number; // Opossum supports timeout natively
  resetTimeout?: number; // Circuit breaker reset timeout
  errorThresholdPercentage?: number;
  volumeThreshold?: number;
}

// Default configurations using opossum's built-in capabilities
const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'circuitBreakerName' | 'enableCircuitBreaker' | 'shouldRetry'>> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  timeout: 30000, // 30 second timeout
  resetTimeout: 30000, // 30 second circuit breaker reset
  errorThresholdPercentage: 50, // Open circuit after 50% errors
  volumeThreshold: 5 // Minimum number of requests before opening circuit
};

// For testing: disable jitter when in test environment
const isTestEnvironment = (): boolean => {
  return process.env.NODE_ENV === 'test' ||
         (typeof jest !== 'undefined');
};

// Default error retry condition
const defaultShouldRetry = (error: unknown): boolean => {
  return isAuthenticationError(error) || isTransientError(error);
};

// Circuit breaker registry using opossum instances
class CircuitBreakerRegistry {
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private operations = new Map<string, (() => Promise<any>)>();

  get(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      const circuitBreakerOptions: CircuitBreakerOptions = {
        timeout: DEFAULT_RETRY_OPTIONS.timeout,
        resetTimeout: DEFAULT_RETRY_OPTIONS.resetTimeout,
        errorThresholdPercentage: DEFAULT_RETRY_OPTIONS.errorThresholdPercentage,
        volumeThreshold: DEFAULT_RETRY_OPTIONS.volumeThreshold,
        ...options
      };

      const breaker = new CircuitBreaker(async () => {
        const operation = this.operations.get(name);
        if (!operation) {
          throw new Error(`Circuit breaker "${name}" not configured with operation`);
        }
        return await operation();
      }, circuitBreakerOptions);

      // Opossum event handlers for logging
      breaker.on('open', () => {
        logger.warn(`Circuit breaker "${name}" opened`);
      });

      breaker.on('halfOpen', () => {
        logger.debug(`Circuit breaker "${name}" half-open`);
      });

      breaker.on('close', () => {
        logger.info(`Circuit breaker "${name}" closed`);
      });

      breaker.fallback(() => {
        throw new Error(`Circuit breaker "${name}" is OPEN - operation not permitted`);
      });

      this.circuitBreakers.set(name, breaker);
      logger.debug(`Created circuit breaker "${name}" with opossum`);
    }

    return this.circuitBreakers.get(name)!;
  }

  setOperation(name: string, operation: () => Promise<any>): void {
    this.operations.set(name, operation);
  }

  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    this.circuitBreakers.forEach((breaker, name) => {
      stats[name] = breaker.stats;
    });
    return stats;
  }

  resetAll(): void {
    this.circuitBreakers.forEach(breaker => breaker.open());
    setTimeout(() => {
      this.circuitBreakers.forEach(breaker => breaker.close());
    }, 100);
    logger.info('All circuit breakers reset');
  }

  // Backward compatibility methods
  getAllStatsSync(): Record<string, any> {
    return this.getAllStats();
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

// Helper function for using named circuit breakers
export function withCircuitBreaker<T>(
  operation: () => Promise<T>,
  circuitBreakerName: string,
  options: Partial<Omit<RetryOptions, 'circuitBreakerName' | 'enableCircuitBreaker'>> = {}
): Promise<T> {
  return withRetry(operation, {
    ...options,
    circuitBreakerName,
    enableCircuitBreaker: true
  });
}

// Helper function for task operations with shared circuit breaker state
export function withTaskRetry<T>(
  operation: () => Promise<T>,
  taskOperation: 'create' | 'update' | 'delete' | 'get' | 'list' = 'create',
  options: Partial<Omit<RetryOptions, 'circuitBreakerName' | 'enableCircuitBreaker'>> = {}
): Promise<T> {
  const circuitBreakerMap = {
    create: CIRCUIT_BREAKER_NAMES.TASK_CREATE,
    update: CIRCUIT_BREAKER_NAMES.TASK_UPDATE,
    delete: CIRCUIT_BREAKER_NAMES.TASK_DELETE,
    get: CIRCUIT_BREAKER_NAMES.TASK_GET,
    list: CIRCUIT_BREAKER_NAMES.TASK_LIST
  };
  const circuitBreakerName = circuitBreakerMap[taskOperation];
  return withCircuitBreaker(operation, circuitBreakerName, options);
}

// Helper function for bulk operations with shared circuit breaker state
export function withBulkRetry<T>(
  operation: () => Promise<T>,
  bulkOperation: 'import' | 'export' | 'operations' = 'operations',
  options: Partial<Omit<RetryOptions, 'circuitBreakerName' | 'enableCircuitBreaker'>> = {}
): Promise<T> {
  const circuitBreakerMap = {
    import: CIRCUIT_BREAKER_NAMES.BULK_IMPORT,
    export: CIRCUIT_BREAKER_NAMES.BULK_EXPORT,
    operations: CIRCUIT_BREAKER_NAMES.BULK_OPERATIONS
  };
  const circuitBreakerName = circuitBreakerMap[bulkOperation];
  return withCircuitBreaker(operation, circuitBreakerName, options);
}

// Main retry function using opossum circuit breaker
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;

  if (opts.enableCircuitBreaker && opts.circuitBreakerName) {
    // Use the circuit breaker registry to share state between calls
    const circuitBreaker = circuitBreakerRegistry.get(opts.circuitBreakerName, {
      timeout: opts.timeout,
      resetTimeout: opts.resetTimeout,
      errorThresholdPercentage: opts.errorThresholdPercentage,
      volumeThreshold: opts.volumeThreshold
    });

    // Set the operation for this circuit breaker instance
    circuitBreakerRegistry.setOperation(opts.circuitBreakerName, operation);

    try {
      // Use opossum's fire method
      const result = await circuitBreaker.fire();
      return result as T;
    } catch (error) {
      if (circuitBreaker.opened) {
        logger.warn('Circuit breaker prevented operation', {
          circuitBreaker: opts.circuitBreakerName,
          stats: circuitBreaker.stats
        });
      }
      throw error;
    }
  } else {
    // Simple retry without circuit breaker using opossum patterns
    return await performRetryWithBackoff(operation, opts, shouldRetry);
  }
}

// Simplified retry implementation using opossum patterns
async function performRetryWithBackoff<T>(
  operation: () => Promise<T>,
  options: Required<Omit<RetryOptions, 'circuitBreakerName' | 'enableCircuitBreaker' | 'shouldRetry'>>,
  shouldRetry: (error: unknown) => boolean
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === options.maxRetries || !shouldRetry(error)) {
        break;
      }

      // Exponential backoff with optional jitter (opossum best practice)
      const baseDelay = options.initialDelay * Math.pow(options.backoffFactor, attempt);
      const jitter = isTestEnvironment() ? 0 : Math.random() * 0.1 * baseDelay; // Add 10% jitter, disabled in tests
      const delay = Math.min(baseDelay + jitter, options.maxDelay);

      logger.debug(`Retrying operation after ${Math.round(delay)}ms`, {
        attempt: attempt + 1,
        maxRetries: options.maxRetries,
        error: error instanceof Error ? error.message : String(error)
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Transient error detection (unchanged for compatibility)
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

// Circuit breaker naming patterns for state sharing
export const CIRCUIT_BREAKER_NAMES = {
  // Authentication operations
  AUTH_CONNECT: 'vikunja-auth-connect',
  AUTH_REFRESH: 'vikunja-auth-refresh',
  AUTH_STATUS: 'vikunja-auth-status',

  // Task CRUD operations
  TASK_CREATE: 'vikunja-task-create',
  TASK_UPDATE: 'vikunja-task-update',
  TASK_DELETE: 'vikunja-task-delete',
  TASK_GET: 'vikunja-task-get',
  TASK_LIST: 'vikunja-task-list',

  // Task relationship operations
  TASK_RELATIONS: 'vikunja-task-relations',
  TASK_ASSIGNEES: 'vikunja-task-assignees',
  TASK_LABELS: 'vikunja-task-labels',

  // Project operations
  PROJECT_CRUD: 'vikunja-project-crud',
  PROJECT_HIERARCHY: 'vikunja-project-hierarchy',
  PROJECT_SHARING: 'vikunja-project-sharing',

  // Bulk operations
  BULK_OPERATIONS: 'vikunja-bulk-operations',
  BULK_IMPORT: 'vikunja-bulk-import',
  BULK_EXPORT: 'vikunja-bulk-export',

  // Filter operations
  FILTER_OPERATIONS: 'vikunja-filter-operations',

  // General API operations
  API_OPERATIONS: 'vikunja-api-operations',

  // Client operations
  CLIENT_OPERATIONS: 'vikunja-client-operations'
} as const;

// Retry configurations (backward compatibility)
export const RETRY_CONFIG = {
  AUTH_ERRORS: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
    enableCircuitBreaker: true,
    circuitBreakerName: CIRCUIT_BREAKER_NAMES.AUTH_CONNECT
  },
  NETWORK_ERRORS: {
    maxRetries: 5,
    initialDelay: 500,
    maxDelay: 30000,
    backoffFactor: 1.5,
    enableCircuitBreaker: true,
    circuitBreakerName: CIRCUIT_BREAKER_NAMES.API_OPERATIONS
  },
  CIRCUIT_BREAKER: {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    enableCircuitBreaker: true
  },

  // Task-specific retry configurations with circuit breaker state sharing
  TASK_OPERATIONS: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 15000,
    backoffFactor: 2,
    enableCircuitBreaker: true,
    circuitBreakerName: CIRCUIT_BREAKER_NAMES.TASK_CREATE
  },

  BULK_OPERATIONS: {
    maxRetries: 2,
    initialDelay: 2000,
    maxDelay: 30000,
    backoffFactor: 2,
    enableCircuitBreaker: true,
    circuitBreakerName: CIRCUIT_BREAKER_NAMES.BULK_OPERATIONS
  }
} as const;

// CircuitBreakerOptions already exported above - no need to re-export

// Utility function to create custom circuit breakers using registry for state sharing
export function createCircuitBreaker<T = any>(
  name: string,
  operation: () => Promise<T>,
  options?: Partial<CircuitBreakerOptions>
): CircuitBreaker {
  // Use the registry to ensure state sharing
  const breaker = circuitBreakerRegistry.get(name, options);

  // Set the operation for this circuit breaker
  circuitBreakerRegistry.setOperation(name, operation);

  logger.debug(`Created circuit breaker "${name}" with registry and opossum`);
  return breaker;
}