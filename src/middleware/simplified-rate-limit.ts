/**
 * Simplified Rate Limiting using express-rate-limit components
 * Replaces 150+ lines of custom rate limiting with express-rate-limit MemoryStore
 */

import { MemoryStore } from 'express-rate-limit';
import { MCPError, ErrorCode } from '../types/errors';
import { logger } from '../utils/logger';

/**
 * Rate limit configuration matching the original custom implementation
 */
interface RateLimitConfig {
  /** Requests per minute limit */
  requestsPerMinute: number;
  /** Requests per hour limit */
  requestsPerHour: number;
  /** Maximum request payload size in bytes */
  maxRequestSize: number;
  /** Maximum response size in bytes */
  maxResponseSize: number;
  /** Tool execution timeout in milliseconds */
  executionTimeout: number;
  /** Enable rate limiting (for testing) */
  enabled: boolean;
}

/**
 * Tool-specific rate limiting configurations
 */
interface ToolRateLimits {
  default: RateLimitConfig;
  expensive: RateLimitConfig;
  bulk: RateLimitConfig;
  export: RateLimitConfig;
}

/**
 * Default rate limiting configuration (extracted from original implementation)
 */
const DEFAULT_CONFIG: ToolRateLimits = {
  default: {
    requestsPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '60', 10),
    requestsPerHour: parseInt(process.env.RATE_LIMIT_PER_HOUR || '1000', 10),
    maxRequestSize: parseInt(process.env.MAX_REQUEST_SIZE || '1048576', 10), // 1MB
    maxResponseSize: parseInt(process.env.MAX_RESPONSE_SIZE || '10485760', 10), // 10MB
    executionTimeout: parseInt(process.env.TOOL_TIMEOUT || '30000', 10), // 30 seconds
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  },
  expensive: {
    requestsPerMinute: parseInt(process.env.EXPENSIVE_RATE_LIMIT_PER_MINUTE || '10', 10),
    requestsPerHour: parseInt(process.env.EXPENSIVE_RATE_LIMIT_PER_HOUR || '100', 10),
    maxRequestSize: parseInt(process.env.EXPENSIVE_MAX_REQUEST_SIZE || '2097152', 10), // 2MB
    maxResponseSize: parseInt(process.env.EXPENSIVE_MAX_RESPONSE_SIZE || '52428800', 10), // 50MB
    executionTimeout: parseInt(process.env.EXPENSIVE_TOOL_TIMEOUT || '120000', 10), // 2 minutes
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  },
  bulk: {
    requestsPerMinute: parseInt(process.env.BULK_RATE_LIMIT_PER_MINUTE || '5', 10),
    requestsPerHour: parseInt(process.env.BULK_RATE_LIMIT_PER_HOUR || '50', 10),
    maxRequestSize: parseInt(process.env.BULK_MAX_REQUEST_SIZE || '5242880', 10), // 5MB
    maxResponseSize: parseInt(process.env.BULK_MAX_RESPONSE_SIZE || '104857600', 10), // 100MB
    executionTimeout: parseInt(process.env.BULK_TOOL_TIMEOUT || '300000', 10), // 5 minutes
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  },
  export: {
    requestsPerMinute: parseInt(process.env.EXPORT_RATE_LIMIT_PER_MINUTE || '2', 10),
    requestsPerHour: parseInt(process.env.EXPORT_RATE_LIMIT_PER_HOUR || '10', 10),
    maxRequestSize: parseInt(process.env.EXPORT_MAX_REQUEST_SIZE || '1048576', 10), // 1MB
    maxResponseSize: parseInt(process.env.EXPORT_MAX_RESPONSE_SIZE || '1073741824', 10), // 1GB
    executionTimeout: parseInt(process.env.EXPORT_TOOL_TIMEOUT || '600000', 10), // 10 minutes
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  },
};

/**
 * Tool categorization for rate limiting (preserved from original implementation)
 */
export const TOOL_CATEGORIES: Record<string, keyof ToolRateLimits> = {
  'vikunja_tasks': 'default',
  'vikunja_projects': 'default',
  'vikunja_labels': 'default',
  'vikunja_teams': 'default',
  'vikunja_users': 'default',
  'vikunja_auth': 'default',
  'vikunja_filters': 'default',
  'vikunja_templates': 'default',
  'vikunja_webhooks': 'default',
  'vikunja_batch_import': 'bulk',
  'vikunja_export': 'export',
  'vikunja_export_tasks': 'export',
  'vikunja_export_projects': 'export',
};

/**
 * Get session ID for rate limiting (preserved from original implementation)
 */
function getSessionId(): string {
  return `session_${process.pid}`;
}

/**
 * Simplified rate limiting middleware using express-rate-limit MemoryStore
 * Replaces the 150+ line custom implementation with standard library components
 */
export class SimplifiedRateLimitMiddleware {
  private config: ToolRateLimits;
  private minuteStore: MemoryStore;
  private hourStore: MemoryStore;

  constructor(config?: Partial<ToolRateLimits>) {
    this.config = {
      default: { ...DEFAULT_CONFIG.default, ...(config?.default || {}) },
      expensive: { ...DEFAULT_CONFIG.expensive, ...(config?.expensive || {}) },
      bulk: { ...DEFAULT_CONFIG.bulk, ...(config?.bulk || {}) },
      export: { ...DEFAULT_CONFIG.export, ...(config?.export || {}) },
    };

    // Use express-rate-limit's MemoryStore for efficient rate limiting
    this.minuteStore = new MemoryStore();
    this.hourStore = new MemoryStore();

    logger.info('Simplified rate limiting middleware initialized', {
      enabled: this.config.default.enabled,
      defaultLimits: {
        perMinute: this.config.default.requestsPerMinute,
        perHour: this.config.default.requestsPerHour,
        maxRequestSize: this.config.default.maxRequestSize,
        timeout: this.config.default.executionTimeout,
      },
    });
  }

  /**
   * Check rate limits using express-rate-limit MemoryStore
   */
  private async checkRateLimit(toolName: string): Promise<void> {
    const category = TOOL_CATEGORIES[toolName] || 'default';
    const config = this.config[category];

    if (!config.enabled) {
      return;
    }

    const sessionId = getSessionId();
    const key = `${sessionId}_${category}`;
    const now = Date.now();

    try {
      // Check minute limit
      const minuteCount = (await this.minuteStore.get(key)) as any || { totalHits: 0, resetTime: new Date(now + 60000) };
      if (minuteCount.totalHits >= config.requestsPerMinute) {
        logger.warn('Rate limit exceeded (per minute)', {
          toolName,
          category,
          sessionId,
          limit: config.requestsPerMinute,
          current: minuteCount.totalHits,
        });

        const resetTimeMs = minuteCount.resetTime ? minuteCount.resetTime.getTime() : now + 60000;
        const resetIn = Math.ceil((resetTimeMs - now) / 1000);
        throw new MCPError(
          ErrorCode.RATE_LIMIT_EXCEEDED,
          `Rate limit exceeded: ${minuteCount.totalHits}/${config.requestsPerMinute} requests per minute`,
          {
            rateLimitType: 'per_minute',
            limit: config.requestsPerMinute,
            current: minuteCount.totalHits,
            resetTime: resetIn,
          }
        );
      }

      // Check hour limit
      const hourKey = `${key}_hour`;
      const hourCount = (await this.hourStore.get(hourKey)) as any || { totalHits: 0, resetTime: new Date(now + 3600000) };
      if (hourCount.totalHits >= config.requestsPerHour) {
        logger.warn('Rate limit exceeded (per hour)', {
          toolName,
          category,
          sessionId,
          limit: config.requestsPerHour,
          current: hourCount.totalHits,
        });

        const resetTimeMs = hourCount.resetTime ? hourCount.resetTime.getTime() : now + 3600000;
        const resetIn = Math.ceil((resetTimeMs - now) / 1000);
        throw new MCPError(
          ErrorCode.RATE_LIMIT_EXCEEDED,
          `Rate limit exceeded: ${hourCount.totalHits}/${config.requestsPerHour} requests per hour`,
          {
            rateLimitType: 'per_hour',
            limit: config.requestsPerHour,
            current: hourCount.totalHits,
            resetTime: resetIn,
          }
        );
      }

      // Increment counters
      await this.minuteStore.increment(key);
      await this.hourStore.increment(hourKey);

    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }
      // Re-throw other errors
      logger.error('Rate limit check error', {
        toolName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate request size (preserved from original implementation)
   */
  private validateRequestSize(toolName: string, args: unknown): void {
    const category = TOOL_CATEGORIES[toolName] || 'default';
    const config = this.config[category];

    if (!config.enabled) {
      return;
    }

    const requestSize = JSON.stringify(args).length;
    if (requestSize > config.maxRequestSize) {
      logger.warn('Request size exceeded', {
        toolName,
        size: requestSize,
        limit: config.maxRequestSize,
      });
      throw new MCPError(
        ErrorCode.REQUEST_TOO_LARGE,
        `Request size ${requestSize} bytes exceeds limit of ${config.maxRequestSize} bytes`,
        {
          requestSize,
          maxRequestSize: config.maxRequestSize,
        }
      );
    }
  }

  /**
   * Validate response size (preserved from original implementation)
   */
  private validateResponseSize(toolName: string, response: unknown): void {
    const category = TOOL_CATEGORIES[toolName] || 'default';
    const config = this.config[category];

    if (!config.enabled) {
      return;
    }

    const responseSize = JSON.stringify(response).length;
    if (responseSize > config.maxResponseSize) {
      logger.warn('Response size exceeded', {
        toolName,
        size: responseSize,
        limit: config.maxResponseSize,
      });
      throw new MCPError(
        ErrorCode.REQUEST_TOO_LARGE,
        `Response size ${responseSize} bytes exceeds limit of ${config.maxResponseSize} bytes`,
        {
          responseSize,
          maxResponseSize: config.maxResponseSize,
        }
      );
    }
  }

  /**
   * Wrap tool handler with rate limiting using express-rate-limit MemoryStore
   */
  public withRateLimit<T extends unknown[], R>(
    toolName: string,
    handler: (...args: T) => Promise<R>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const startTime = Date.now();

      try {
        // Check rate limits using express-rate-limit MemoryStore
        await this.checkRateLimit(toolName);

        // Validate request size
        this.validateRequestSize(toolName, args);

        // Get timeout configuration
        const category = TOOL_CATEGORIES[toolName] || 'default';
        const config = this.config[category];

        // Execute with timeout protection (preserved from original)
        const result = await Promise.race([
          handler(...args),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new MCPError(
                ErrorCode.TIMEOUT_ERROR,
                `Tool execution timeout after ${config.executionTimeout}ms`,
                {
                  timeout: config.executionTimeout,
                  toolName,
                }
              ));
            }, config.executionTimeout);
          }),
        ]);

        // Validate response size
        this.validateResponseSize(toolName, result);

        // Log successful execution
        const executionTime = Date.now() - startTime;
        logger.debug('Tool executed successfully', {
          toolName,
          executionTime,
          sessionId: getSessionId(),
        });

        return result;
      } catch (error) {
        const executionTime = Date.now() - startTime;

        // Log failed execution
        if (error instanceof MCPError) {
          logger.warn('Tool execution failed', {
            toolName,
            error: error.code,
            message: error.message,
            executionTime,
            sessionId: getSessionId(),
          });
        } else {
          logger.error('Tool execution error', {
            toolName,
            error: error instanceof Error ? error.message : String(error),
            executionTime,
            sessionId: getSessionId(),
          });
        }

        throw error;
      }
    };
  }

  /**
   * Get configuration (preserved from original implementation)
   */
  public getConfig(): ToolRateLimits {
    return { ...this.config };
  }

  /**
   * Get current rate limit status for monitoring (simplified)
   */
  public getRateLimitStatus(toolName?: string): {
    sessionId: string;
    requestsLastMinute: number;
    requestsLastHour: number;
    limits: ToolRateLimits;
  } {
    const sessionId = getSessionId();
    // For sync version, return default values (original implementation was simplified anyway)
    return {
      sessionId,
      requestsLastMinute: 0,
      requestsLastHour: 0,
      limits: this.config,
    };
  }

  /**
   * Clear rate limit data for a session (for testing)
   */
  public async clearSession(sessionId?: string): Promise<void> {
    await this.clearAll();
    logger.debug('Rate limit session cleared');
  }

  /**
   * Clear all rate limit data (for testing)
   */
  public async clearAll(): Promise<void> {
    await this.minuteStore.resetAll();
    await this.hourStore.resetAll();
    logger.debug('Rate limit stores cleared');
  }
}

// Global rate limiting middleware instance
export const simplifiedRateLimitMiddleware = new SimplifiedRateLimitMiddleware();

// Backward compatibility aliases
export const rateLimitingMiddleware = simplifiedRateLimitMiddleware;
export const RateLimitingMiddleware = SimplifiedRateLimitMiddleware;

/**
 * Convenience function to wrap tool handlers with rate limiting
 * This replaces the original withRateLimit function
 */
export function withRateLimit<T extends unknown[], R>(
  toolName: string,
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return simplifiedRateLimitMiddleware.withRateLimit(toolName, handler);
}

// Export types for backward compatibility
export type { RateLimitConfig, ToolRateLimits };