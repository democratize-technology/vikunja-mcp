/**
 * Configuration Types and Schemas
 * Centralized configuration management for the Vikunja MCP server
 */

import { z } from 'zod';

// Environment type for configuration profiles
export enum Environment {
  DEVELOPMENT = 'development',
  TEST = 'test',
  PRODUCTION = 'production',
}

// Authentication Configuration Schema
export const AuthConfigSchema = z.object({
  vikunjaUrl: z.string().url().optional(),
  vikunjaToken: z.string().optional(),
  mcpMode: z.string().optional(),
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

// Logging Configuration Schema - AORP requires comprehensive logging
export const LoggingConfigSchema = z.object({
  // AORP requires comprehensive logging for operational monitoring and resilience
  level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  // AORP always requires debug information for resilience - no configuration option
  environment: z.nativeEnum(Environment).default(Environment.DEVELOPMENT),
});

export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

// Individual rate limit settings schema
const RateLimitSettingsSchema = z.object({
  requestsPerMinute: z.number().int().positive().default(60),
  requestsPerHour: z.number().int().positive().default(1000),
  maxRequestSize: z.number().int().positive().default(1048576), // 1MB
  maxResponseSize: z.number().int().positive().default(10485760), // 10MB
  executionTimeout: z.number().int().positive().default(30000), // 30 seconds
});

// Rate Limiting Configuration Schema - AORP always enabled
export const RateLimitConfigSchema = z.object({
  // AORP requires rate limiting to be always enabled for operational resilience

  // Default tool limits
  default: RateLimitSettingsSchema.default({
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    maxRequestSize: 1048576,
    maxResponseSize: 10485760,
    executionTimeout: 30000,
  }),

  // Expensive tool limits
  expensive: RateLimitSettingsSchema.default({
    requestsPerMinute: 10,
    requestsPerHour: 100,
    maxRequestSize: 2097152,
    maxResponseSize: 52428800,
    executionTimeout: 120000,
  }),

  // Bulk operation limits
  bulk: RateLimitSettingsSchema.default({
    requestsPerMinute: 5,
    requestsPerHour: 50,
    maxRequestSize: 5242880,
    maxResponseSize: 104857600,
    executionTimeout: 300000,
  }),

  // Export operation limits
  export: RateLimitSettingsSchema.default({
    requestsPerMinute: 2,
    requestsPerHour: 10,
    maxRequestSize: 1048576,
    maxResponseSize: 1073741824,
    executionTimeout: 600000,
  }),
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

// AORP is always enabled - no feature flags needed
export type FeatureFlagsConfig = Record<string, never>;

// Complete Application Configuration Schema
export const ApplicationConfigSchema = z.object({
  environment: z.nativeEnum(Environment).default(Environment.DEVELOPMENT),
  auth: AuthConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
  rateLimiting: RateLimitConfigSchema.default({}),
  // AORP is always enabled - no feature flags needed
});

export type ApplicationConfig = z.infer<typeof ApplicationConfigSchema>;

// Configuration Validation Error
export class ConfigurationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
    public readonly value?: unknown
  ) {
    super(`Configuration error in ${field}: ${message}`);
    this.name = 'ConfigurationError';
  }
}

// Configuration Load Options
export interface ConfigLoadOptions {
  /** Override default environment detection */
  environment?: Environment;
  /** Throw on missing optional values */
  strict?: boolean;
  /** Custom environment variable prefix */
  prefix?: string;
  /** Additional configuration sources */
  sources?: Record<string, unknown>;
}