/**
 * Configuration Migration Examples
 * Shows how to migrate from scattered process.env usage to centralized configuration
 */

import { getRateLimitConfig, getLoggingConfig, getAuthConfig } from './ConfigurationManager';
import type { RateLimitConfig } from './types';

/**
 * BEFORE: Direct process.env usage in rate-limiting.ts
 * 
 * const DEFAULT_CONFIG: ToolRateLimits = {
 *   default: {
 *     requestsPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '60', 10),
 *     requestsPerHour: parseInt(process.env.RATE_LIMIT_PER_HOUR || '1000', 10),
 *     maxRequestSize: parseInt(process.env.MAX_REQUEST_SIZE || '1048576', 10),
 *     enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
 *   },
 * };
 */

/**
 * AFTER: Using centralized configuration
 */
export async function createRateLimitingMiddleware(): Promise<RateLimitConfig> {
  const config = await getRateLimitConfig();
  
  // Configuration is already validated and typed
  // AORP requires rate limiting to always be enabled
  return {
    default: config.default,
    expensive: config.expensive,
    bulk: config.bulk,
    export: config.export,
  };
}

/**
 * BEFORE: Direct process.env usage in logger.ts
 * 
 * constructor() {
 *   const debug = process.env.DEBUG === 'true';
 *   const logLevel = process.env.LOG_LEVEL?.toLowerCase();
 *   
 *   if (logLevel) {
 *     switch (logLevel) {
 *       case 'error': this.level = LogLevel.ERROR; break;
 *       case 'warn': this.level = LogLevel.WARN; break;
 *       // ... etc
 *     }
 *   } else {
 *     this.level = debug ? LogLevel.DEBUG : LogLevel.INFO;
 *   }
 * }
 */

/**
 * AFTER: Using centralized configuration
 */
export async function createLogger(): Promise<{
  level: number;
  debug: boolean;
}> {
  const config = await getLoggingConfig();
  
  // Configuration is already parsed and validated
  const levelMap = {
    'error': 0,
    'warn': 1,
    'info': 2,
    'debug': 3,
  } as const;
  
  return {
    level: levelMap[config.level],
    // Debug information is always included for AORP resilience
    debug: true
  };
}

/**
 * BEFORE: Direct process.env usage in index.ts
 * 
 * if (process.env.VIKUNJA_URL && process.env.VIKUNJA_API_TOKEN) {
 *   const connectionMessage = createSecureConnectionMessage(
 *     process.env.VIKUNJA_URL, 
 *     process.env.VIKUNJA_API_TOKEN
 *   );
 *   authManager.connect(process.env.VIKUNJA_URL, process.env.VIKUNJA_API_TOKEN);
 * }
 */

/**
 * AFTER: Using centralized configuration
 */
export async function initializeAuthentication(): Promise<{
  url: string;
  token: string;
  mode: string | undefined;
} | null> {
  const authConfig = await getAuthConfig();
  
  if (authConfig.vikunjaUrl && authConfig.vikunjaToken) {
    // Configuration is already validated (URL format, etc.)
    return {
      url: authConfig.vikunjaUrl,
      token: authConfig.vikunjaToken,
      mode: authConfig.mcpMode,
    };
  }
  
  return null;
}

/**
 * BEFORE: Direct process.env usage in FilteringContext.ts
 * 
 * const shouldAttemptServerSideFiltering = config.enableServerSide && (
 *   process.env.NODE_ENV === 'production' || 
 *   process.env.VIKUNJA_ENABLE_SERVER_SIDE_FILTERING === 'true'
 * );
 */

/**
 * AFTER: Using centralized configuration
 */
export function shouldUseServerSideFiltering(enableServerSide: boolean): boolean {
  // AORP is always enabled - server-side filtering is always on
  return enableServerSide;
}

/**
 * Migration Testing Pattern
 * 
 * BEFORE: Hard to test because of direct process.env dependencies
 * 
 * describe('RateLimitingMiddleware', () => {
 *   beforeEach(() => {
 *     process.env.RATE_LIMIT_PER_MINUTE = '30';
 *     process.env.RATE_LIMIT_ENABLED = 'true';
 *   });
 * 
 *   afterEach(() => {
 *     delete process.env.RATE_LIMIT_PER_MINUTE;
 *     delete process.env.RATE_LIMIT_ENABLED;
 *   });
 * });
 */

/**
 * AFTER: Easy to test with dependency injection
 */
export function createTestConfiguration(): {
  environment: 'test';
  auth: {
    vikunjaUrl: string;
    vikunjaToken: string;
  };
  logging: {
    level: 'error';
    debug: boolean;
  };
  rateLimiting: {
    enabled: boolean;
    default: {
      requestsPerMinute: number;
      requestsPerHour: number;
      maxRequestSize: number;
      maxResponseSize: number;
      executionTimeout: number;
    };
  };
  featureFlags: {
    enableServerSideFiltering: boolean;
    enableAdvancedMetrics: boolean;
    enableExperimentalFeatures: boolean;
  };
} {
  return {
    environment: 'test' as const,
    auth: {
      vikunjaUrl: 'https://test.example.com',
      vikunjaToken: 'tk_test123',
    },
    logging: {
      level: 'error' as const,
      debug: false,
    },
    rateLimiting: {
      enabled: false,
      default: {
        requestsPerMinute: 1000,
        requestsPerHour: 10000,
        maxRequestSize: 1048576,
        maxResponseSize: 10485760,
        executionTimeout: 30000,
      },
    },
    featureFlags: {
      enableServerSideFiltering: false,
      enableAdvancedMetrics: false,
      enableExperimentalFeatures: false,
    },
  };
}

/**
 * Example test using configuration injection:
 * 
 * describe('RateLimitingMiddleware', () => {
 *   it('should respect rate limits from configuration', async () => {
 *     const testConfig = createTestConfiguration();
 *     testConfig.rateLimiting.enabled = true;
 *     testConfig.rateLimiting.default.requestsPerMinute = 5;
 *     
 *     const manager = ConfigurationManager.getInstance({
 *       sources: testConfig
 *     });
 *     
 *     const middleware = await createRateLimitingMiddleware();
 *     // Test middleware with known configuration
 *   });
 * });
 */