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
} from './types';
import {
  Environment,
  ConfigurationError,
  ApplicationConfigSchema,
} from './types';
import { logger } from '../utils/logger';


/**
 * Environment-specific configuration overrides
 */
type EnvironmentProfile = {
  logging?: Partial<LoggingConfig>;
  rateLimiting?: Partial<RateLimitConfig>;
  auth?: Partial<AuthConfig>;
  // AORP is always enabled - no feature flags needed
};

const ENVIRONMENT_PROFILES: Record<Environment, EnvironmentProfile> = {
  [Environment.DEVELOPMENT]: {
    logging: {
      level: 'debug' as const,
      environment: Environment.DEVELOPMENT,
    },
    // AORP is always enabled - no feature flags needed
  },

  [Environment.TEST]: {
    logging: {
      level: 'error' as const,
      environment: Environment.TEST,
    },
    // AORP is always enabled - no feature flags needed
  },

  [Environment.PRODUCTION]: {
    logging: {
      level: 'info' as const,
      environment: Environment.PRODUCTION,
    },
    // AORP is always enabled - no feature flags needed
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
      const profileConfig = ENVIRONMENT_PROFILES[environment] || {};
      
      // 3. Load configuration from environment variables
      const envConfig = this.loadFromEnvironmentVariables();
      
      // 4. Load configuration from additional sources
      const sourceConfig = this.loadOptions.sources || {};
      
      // 5. Merge configurations using deep merge (sources override env vars, env vars override profile)
      const rawConfig = this.deepMerge(
        { environment },
        profileConfig,
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

  /**
   * Check if a feature is enabled
   * AORP architecture has specific features always enabled or disabled
   */
  public isFeatureEnabled(featureName: string): boolean {
    // AORP has fixed feature configuration for operational resilience
    const enabledFeatures = new Set([
      'enableServerSideFiltering', // Always enabled for performance
    ]);

    const disabledFeatures = new Set([
      'enableAdvancedMetrics', // Disabled for operational simplicity
    ]);

    if (enabledFeatures.has(featureName)) {
      return true;
    }

    if (disabledFeatures.has(featureName)) {
      return false;
    }

    // Default to false for unknown features
    return false;
  }

  // AORP is always enabled - no feature flags needed

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
   * Load configuration from environment variables
   */
  private loadFromEnvironmentVariables(): Partial<ApplicationConfig> {
    // AORP requires direct configuration - no backward compatibility
    return {};
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
        // AORP requires rate limiting to always be enabled
        profiles: {
          default: this.config.rateLimiting.default.requestsPerMinute,
          expensive: this.config.rateLimiting.expensive.requestsPerMinute,
          bulk: this.config.rateLimiting.bulk.requestsPerMinute,
          export: this.config.rateLimiting.export.requestsPerMinute,
        },
      },
      // AORP is always enabled - no feature flags needed
    };
    
    logger.info('Configuration loaded successfully', summary);
  }
}

// Export singleton instance getter
export const getConfiguration = (): Promise<ApplicationConfig> => ConfigurationManager.getInstance().getConfiguration();
// AORP is always enabled - no feature flag exports needed