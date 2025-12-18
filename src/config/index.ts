/**
 * Configuration Module Entry Point
 * Centralized configuration management for the Vikunja MCP server
 */

export * from './types';
export * from './ConfigurationManager';

// Re-export commonly used functions for convenience
export {
  getConfiguration,
  getAuthConfig,
  getLoggingConfig,
  getRateLimitConfig,
  // AORP is always enabled - no feature flag exports needed
} from './ConfigurationManager';