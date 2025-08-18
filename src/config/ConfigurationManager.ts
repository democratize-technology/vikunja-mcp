/**
 * Centralized Configuration Manager
 * Replaces scattered process.env usage with type-safe configuration management
 */

import { z } from 'zod';
import type {
  ApplicationConfig,
  ConfigLoadOptions,
  AuthConfig,
  LoggingConfig,
  RateLimitConfig,
  FeatureFlagsConfig,
} from './types';
import {
  Environment,
  ConfigurationError,
  ApplicationConfigSchema,
} from './types';
import { logger } from '../utils/logger';

/**
 * Environment Variable Mapping
 * Maps new configuration structure to existing environment variables for backward compatibility
 */
const ENV_VAR_MAPPING = {
  // Authentication
  'auth.vikunjaUrl': 'VIKUNJA_URL',
  'auth.vikunjaToken': 'VIKUNJA_API_TOKEN',
  'auth.mcpMode': 'MCP_MODE',
  
  // Logging
  'logging.level': 'LOG_LEVEL',
  'logging.debug': 'DEBUG',
  'logging.environment': 'NODE_ENV',
  
  // Rate Limiting - Global
  'rateLimiting.enabled': 'RATE_LIMIT_ENABLED',
  
  // Rate Limiting - Default
  'rateLimiting.default.requestsPerMinute': 'RATE_LIMIT_PER_MINUTE',
  'rateLimiting.default.requestsPerHour': 'RATE_LIMIT_PER_HOUR',
  'rateLimiting.default.maxRequestSize': 'MAX_REQUEST_SIZE',
  'rateLimiting.default.maxResponseSize': 'MAX_RESPONSE_SIZE',
  'rateLimiting.default.executionTimeout': 'TOOL_TIMEOUT',
  
  // Rate Limiting - Expensive
  'rateLimiting.expensive.requestsPerMinute': 'EXPENSIVE_RATE_LIMIT_PER_MINUTE',
  'rateLimiting.expensive.requestsPerHour': 'EXPENSIVE_RATE_LIMIT_PER_HOUR',
  'rateLimiting.expensive.maxRequestSize': 'EXPENSIVE_MAX_REQUEST_SIZE',
  'rateLimiting.expensive.maxResponseSize': 'EXPENSIVE_MAX_RESPONSE_SIZE',
  'rateLimiting.expensive.executionTimeout': 'EXPENSIVE_TOOL_TIMEOUT',
  
  // Rate Limiting - Bulk
  'rateLimiting.bulk.requestsPerMinute': 'BULK_RATE_LIMIT_PER_MINUTE',
  'rateLimiting.bulk.requestsPerHour': 'BULK_RATE_LIMIT_PER_HOUR',
  'rateLimiting.bulk.maxRequestSize': 'BULK_MAX_REQUEST_SIZE',
  'rateLimiting.bulk.maxResponseSize': 'BULK_MAX_RESPONSE_SIZE',
  'rateLimiting.bulk.executionTimeout': 'BULK_TOOL_TIMEOUT',
  
  // Rate Limiting - Export
  'rateLimiting.export.requestsPerMinute': 'EXPORT_RATE_LIMIT_PER_MINUTE',
  'rateLimiting.export.requestsPerHour': 'EXPORT_RATE_LIMIT_PER_HOUR',
  'rateLimiting.export.maxRequestSize': 'EXPORT_MAX_REQUEST_SIZE',
  'rateLimiting.export.maxResponseSize': 'EXPORT_MAX_RESPONSE_SIZE',
  'rateLimiting.export.executionTimeout': 'EXPORT_TOOL_TIMEOUT',
  
  // Feature Flags
  'featureFlags.enableServerSideFiltering': 'VIKUNJA_ENABLE_SERVER_SIDE_FILTERING',
} as const;

/**
 * Environment-specific configuration overrides
 */
type EnvironmentProfile = {
  logging?: Partial<LoggingConfig>;
  rateLimiting?: Partial<RateLimitConfig>;
  featureFlags?: Partial<FeatureFlagsConfig>;
  auth?: Partial<AuthConfig>;
};

const ENVIRONMENT_PROFILES: Record<Environment, EnvironmentProfile> = {
  [Environment.DEVELOPMENT]: {
    logging: {
      level: 'debug' as const,
      debug: true,
      environment: Environment.DEVELOPMENT,
    },
    rateLimiting: {
      enabled: false, // Disable rate limiting in development
    },
    featureFlags: {
      enableServerSideFiltering: true,
      enableAdvancedMetrics: false,
      enableExperimentalFeatures: true,
    },
  },
  
  [Environment.TEST]: {
    logging: {
      level: 'error' as const,
      debug: false,
      environment: Environment.TEST,
    },
    rateLimiting: {
      enabled: false, // Disable rate limiting in tests
    },
    featureFlags: {
      enableServerSideFiltering: false, // Consistent test behavior
      enableAdvancedMetrics: false,
      enableExperimentalFeatures: false,
    },
  },
  
  [Environment.PRODUCTION]: {
    logging: {
      level: 'info' as const,
      debug: false,
      environment: Environment.PRODUCTION,
    },
    rateLimiting: {
      enabled: true,
      // Use schema defaults for production
    },
    featureFlags: {
      enableServerSideFiltering: true,
      enableAdvancedMetrics: true,
      enableExperimentalFeatures: false,
    },
  },
};

/**
 * Centralized Configuration Manager
 */
export class ConfigurationManager {
  private static instance: ConfigurationManager | null = null;
  private config: ApplicationConfig | null = null;
  private readonly loadOptions: ConfigLoadOptions;

  private constructor(options: ConfigLoadOptions = {}) {
    this.loadOptions = {
      strict: false,
      prefix: 'VIKUNJA_MCP',
      ...options,
    };
  }

  /**
   * Get singleton instance of ConfigurationManager
   */
  public static getInstance(options?: ConfigLoadOptions): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager(options);
    }
    return ConfigurationManager.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static reset(): void {
    ConfigurationManager.instance = null;
  }

  /**
   * Load and validate configuration from multiple sources
   */
  public loadConfiguration(): ApplicationConfig {
    if (this.config) {
      return this.config;
    }

    try {
      // 1. Detect environment
      const environment = this.detectEnvironment();
      
      // 2. Load base configuration from environment profile
      const profileConfig = ENVIRONMENT_PROFILES[environment] || {} as Record<string, unknown>;
      
      // 3. Load configuration from environment variables
      const envConfig = this.loadFromEnvironmentVariables();
      
      // 4. Load configuration from additional sources
      const sourceConfig = this.loadOptions.sources || {} as Record<string, unknown>;
      
      // 5. Merge configurations using deep merge (sources override env vars, env vars override profile)
      const rawConfig = this.deepMerge(
        { environment } as Record<string, unknown>,
        profileConfig as Record<string, unknown>,
        envConfig,
        sourceConfig
      );
      
      // 6. Validate and transform configuration
      this.config = this.validateConfiguration(rawConfig);
      
      // 7. Log configuration summary (without sensitive values)
      this.logConfigurationSummary();
      
      return this.config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ConfigurationError(
          'validation',
          `Configuration validation failed: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        );
      }
      throw error;
    }
  }

  /**
   * Get current configuration (load if not already loaded)
   */
  public async getConfiguration(): Promise<ApplicationConfig> {
    if (!this.config) {
      return Promise.resolve(this.loadConfiguration());
    }
    return this.config;
  }

  /**
   * Get specific configuration section
   */
  public async getAuthConfig(): Promise<AuthConfig> {
    const config = await this.getConfiguration();
    return config.auth;
  }

  public async getLoggingConfig(): Promise<LoggingConfig> {
    const config = await this.getConfiguration();
    return config.logging;
  }

  public async getRateLimitConfig(): Promise<RateLimitConfig> {
    const config = await this.getConfiguration();
    return config.rateLimiting;
  }

  public async getFeatureFlagsConfig(): Promise<FeatureFlagsConfig> {
    const config = await this.getConfiguration();
    return config.featureFlags;
  }

  /**
   * Check if a feature flag is enabled
   */
  public async isFeatureEnabled(flag: keyof FeatureFlagsConfig): Promise<boolean> {
    const featureFlags = await this.getFeatureFlagsConfig();
    return featureFlags[flag] ?? false;
  }

  /**
   * Detect current environment
   */
  private detectEnvironment(): Environment {
    if (this.loadOptions.environment) {
      return this.loadOptions.environment;
    }

    const nodeEnv = process.env.NODE_ENV?.toLowerCase();
    const jestWorker = process.env.JEST_WORKER_ID;
    
    if (jestWorker || nodeEnv === 'test') {
      return Environment.TEST;
    }
    
    if (nodeEnv === 'production') {
      return Environment.PRODUCTION;
    }
    
    return Environment.DEVELOPMENT;
  }

  /**
   * Load configuration from environment variables using backward-compatible mapping
   */
  private loadFromEnvironmentVariables(): Partial<ApplicationConfig> {
    const config: Record<string, unknown> = {};
    
    for (const [configPath, envVar] of Object.entries(ENV_VAR_MAPPING)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        this.setNestedValue(config, configPath, this.parseEnvironmentValue(value));
      }
    }
    
    return config;
  }

  /**
   * Parse environment variable value to appropriate type
   */
  private parseEnvironmentValue(value: string): unknown {
    // Handle boolean values
    if (value === 'true') return true;
    if (value === 'false') return false;
    
    // Handle numeric values
    if (/^\d+$/.test(value)) {
      const num = parseInt(value, 10);
      if (!isNaN(num)) return num;
    }
    
    // Handle floating point values
    if (/^\d*\.\d+$/.test(value)) {
      const num = parseFloat(value);
      if (!isNaN(num)) return num;
    }
    
    // Return as string
    return value;
  }

  /**
   * Deep merge multiple configuration objects
   */
  private deepMerge(...objects: Record<string, unknown>[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    for (const obj of objects) {
      if (!obj || typeof obj !== 'object') continue;
      
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          if (
            result[key] &&
            typeof result[key] === 'object' &&
            typeof obj[key] === 'object' &&
            !Array.isArray(result[key]) &&
            !Array.isArray(obj[key])
          ) {
            result[key] = this.deepMerge(
              result[key] as Record<string, unknown>, 
              obj[key] as Record<string, unknown>
            );
          } else {
            result[key] = obj[key];
          }
        }
      }
    }
    
    return result;
  }

  /**
   * Set nested object value from dot-notation path
   */
  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    let current: Record<string, unknown> = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!key) continue; // Skip empty keys
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }
    
    const finalKey = keys[keys.length - 1];
    if (finalKey) {
      current[finalKey] = value;
    }
  }

  /**
   * Validate configuration using Zod schema
   */
  private validateConfiguration(rawConfig: unknown): ApplicationConfig {
    try {
      return ApplicationConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Provide detailed validation errors
        const errors = error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          received: 'received' in err ? err.received : 'unknown',
          expected: 'expected' in err ? err.expected : 'unknown',
        }));
        
        throw new ConfigurationError(
          'validation',
          `Configuration validation failed:\n${errors.map(e => `  - ${e.path}: ${e.message}`).join('\n')}`,
          { errors, rawConfig }
        );
      }
      throw error;
    }
  }

  /**
   * Log configuration summary without sensitive values
   */
  private logConfigurationSummary(): void {
    if (!this.config) return;
    
    const summary = {
      environment: this.config.environment,
      auth: {
        hasUrl: !!this.config.auth.vikunjaUrl,
        hasToken: !!this.config.auth.vikunjaToken,
        mcpMode: this.config.auth.mcpMode,
      },
      logging: this.config.logging,
      rateLimiting: {
        enabled: this.config.rateLimiting.enabled,
        profiles: {
          default: this.config.rateLimiting.default.requestsPerMinute,
          expensive: this.config.rateLimiting.expensive.requestsPerMinute,
          bulk: this.config.rateLimiting.bulk.requestsPerMinute,
          export: this.config.rateLimiting.export.requestsPerMinute,
        },
      },
      featureFlags: this.config.featureFlags,
    };
    
    logger.info('Configuration loaded successfully', summary);
  }
}

// Export singleton instance getter
export const getConfiguration = (): Promise<ApplicationConfig> => ConfigurationManager.getInstance().getConfiguration();
export const getAuthConfig = (): Promise<AuthConfig> => ConfigurationManager.getInstance().getAuthConfig();
export const getLoggingConfig = (): Promise<LoggingConfig> => ConfigurationManager.getInstance().getLoggingConfig();
export const getRateLimitConfig = (): Promise<RateLimitConfig> => ConfigurationManager.getInstance().getRateLimitConfig();
export const getFeatureFlagsConfig = (): Promise<FeatureFlagsConfig> => ConfigurationManager.getInstance().getFeatureFlagsConfig();
export const isFeatureEnabled = (flag: keyof FeatureFlagsConfig): Promise<boolean> => 
  ConfigurationManager.getInstance().isFeatureEnabled(flag);