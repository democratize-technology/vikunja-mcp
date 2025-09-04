/**
 * Rate Limiting Middleware
 * Provides DoS protection through request rate limiting and size controls
 */

import { MCPError, ErrorCode } from '../types/errors';
import { logger } from '../utils/logger';

/**
 * Configuration for rate limiting
 */
export interface RateLimitConfig {
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
export interface ToolRateLimits {
  /** Default limits for all tools */
  default: RateLimitConfig;
  /** Specific limits for expensive tools */
  expensive: RateLimitConfig;
  /** Specific limits for bulk operations */
  bulk: RateLimitConfig;
  /** Specific limits for export operations */
  export: RateLimitConfig;
}

/**
 * Request tracking for rate limiting
 */
interface RequestTracker {
  /** Timestamps of requests in the last minute */
  requestsLastMinute: number[];
  /** Timestamps of requests in the last hour */
  requestsLastHour: number[];
  /** Last cleanup time */
  lastCleanup: number;
}

/**
 * Session-based request tracker storage
 */
const sessionTrackers = new Map<string, RequestTracker>();

/**
 * Default rate limiting configuration
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
 * Tool categorization for rate limiting
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
 * Rate limiting middleware class
 */
export class RateLimitingMiddleware {
  private config: ToolRateLimits;

  constructor(config?: Partial<ToolRateLimits>) {
    this.config = {
      default: { ...DEFAULT_CONFIG.default, ...(config?.default || {}) },
      expensive: { ...DEFAULT_CONFIG.expensive, ...(config?.expensive || {}) },
      bulk: { ...DEFAULT_CONFIG.bulk, ...(config?.bulk || {}) },
      export: { ...DEFAULT_CONFIG.export, ...(config?.export || {}) },
    };

    logger.info('Rate limiting middleware initialized', {
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
   * Get session ID from request context
   * For now, we use a simple session identifier based on process
   * In a real implementation, this would be based on client connection
   */
  private getSessionId(): string {
    // In MCP context, we use process ID as session identifier
    // This can be enhanced with proper session management
    return `session_${process.pid}`;
  }

  /**
   * Get or create request tracker for session
   */
  private getRequestTracker(sessionId: string): RequestTracker {
    if (!sessionTrackers.has(sessionId)) {
      sessionTrackers.set(sessionId, {
        requestsLastMinute: [],
        requestsLastHour: [],
        lastCleanup: Date.now(),
      });
    }
    const tracker = sessionTrackers.get(sessionId);
    if (!tracker) {
      throw new Error(`Session tracker not found for session ${sessionId}`);
    }
    return tracker;
  }

  /**
   * Clean up old request timestamps
   */
  private cleanupOldRequests(tracker: RequestTracker): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;

    // Only cleanup every 30 seconds to avoid excessive processing
    if (now - tracker.lastCleanup < 30000) {
      return;
    }

    tracker.requestsLastMinute = tracker.requestsLastMinute.filter(
      timestamp => timestamp > oneMinuteAgo
    );
    tracker.requestsLastHour = tracker.requestsLastHour.filter(
      timestamp => timestamp > oneHourAgo
    );
    tracker.lastCleanup = now;
  }

  /**
   * Check rate limits for a request
   */
  private checkRateLimit(toolName: string, sessionId: string): void {
    const category = TOOL_CATEGORIES[toolName] || 'default';
    const config = this.config[category];

    if (!config.enabled) {
      return;
    }

    const tracker = this.getRequestTracker(sessionId);
    this.cleanupOldRequests(tracker);

    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;

    const requestsLastMinute = tracker.requestsLastMinute.filter(
      timestamp => timestamp > oneMinuteAgo
    ).length;
    const requestsLastHour = tracker.requestsLastHour.filter(
      timestamp => timestamp > oneHourAgo
    ).length;

    // Check minute limit
    if (requestsLastMinute >= config.requestsPerMinute) {
      logger.warn('Rate limit exceeded (per minute)', {
        toolName,
        sessionId,
        limit: config.requestsPerMinute,
        current: requestsLastMinute,
      });
      throw new MCPError(
        ErrorCode.RATE_LIMIT_EXCEEDED,
        `Rate limit exceeded: ${requestsLastMinute}/${config.requestsPerMinute} requests per minute`,
        {
          rateLimitType: 'per_minute',
          limit: config.requestsPerMinute,
          current: requestsLastMinute,
          resetTime: Math.ceil((60 * 1000 - (now - (tracker.requestsLastMinute[0] ?? now))) / 1000),
        }
      );
    }

    // Check hour limit
    if (requestsLastHour >= config.requestsPerHour) {
      logger.warn('Rate limit exceeded (per hour)', {
        toolName,
        sessionId,
        limit: config.requestsPerHour,
        current: requestsLastHour,
      });
      throw new MCPError(
        ErrorCode.RATE_LIMIT_EXCEEDED,
        `Rate limit exceeded: ${requestsLastHour}/${config.requestsPerHour} requests per hour`,
        {
          rateLimitType: 'per_hour',
          limit: config.requestsPerHour,
          current: requestsLastHour,
          resetTime: Math.ceil((60 * 60 * 1000 - (now - (tracker.requestsLastHour[0] ?? now))) / 1000),
        }
      );
    }

    // Record this request
    tracker.requestsLastMinute.push(now);
    tracker.requestsLastHour.push(now);
  }

  /**
   * Validate request size
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
   * Validate response size
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
   * Wrap tool handler with rate limiting, size validation, and timeout protection
   */
  public withRateLimit<T extends unknown[], R>(
    toolName: string,
    handler: (...args: T) => Promise<R>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const sessionId = this.getSessionId();
      const startTime = Date.now();

      try {
        // Check rate limits
        this.checkRateLimit(toolName, sessionId);

        // Validate request size
        this.validateRequestSize(toolName, args);

        // Get timeout configuration
        const category = TOOL_CATEGORIES[toolName] || 'default';
        const config = this.config[category];

        // Execute with timeout protection
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
          sessionId,
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
            sessionId,
          });
        } else {
          logger.error('Tool execution error', {
            toolName,
            error: error instanceof Error ? error.message : String(error),
            executionTime,
            sessionId,
          });
        }

        throw error;
      }
    };
  }

  /**
   * Get current rate limit status for monitoring
   */
  public getRateLimitStatus(sessionId?: string): {
    sessionId: string;
    requestsLastMinute: number;
    requestsLastHour: number;
    limits: ToolRateLimits;
  } {
    const actualSessionId = sessionId || this.getSessionId();
    const tracker = this.getRequestTracker(actualSessionId);
    this.cleanupOldRequests(tracker);

    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;

    return {
      sessionId: actualSessionId,
      requestsLastMinute: tracker.requestsLastMinute.filter(t => t > oneMinuteAgo).length,
      requestsLastHour: tracker.requestsLastHour.filter(t => t > oneHourAgo).length,
      limits: this.config,
    };
  }

  /**
   * Clear rate limit data for a session (for testing)
   */
  public clearSession(sessionId?: string): void {
    const actualSessionId = sessionId || this.getSessionId();
    sessionTrackers.delete(actualSessionId);
    logger.debug('Rate limit session cleared', { sessionId: actualSessionId });
  }

  /**
   * Get configuration
   */
  public getConfig(): ToolRateLimits {
    return { ...this.config };
  }
}

// Global rate limiting middleware instance
export const rateLimitingMiddleware = new RateLimitingMiddleware();

/**
 * Convenience function to wrap tool handlers with rate limiting
 */
export function withRateLimit<T extends unknown[], R>(
  toolName: string,
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return rateLimitingMiddleware.withRateLimit(toolName, handler);
}