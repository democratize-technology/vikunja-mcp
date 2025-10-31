/**
 * Storage configuration management
 * 
 * This module provides centralized configuration for storage backends,
 * including environment variable parsing, validation, and default values.
 */

import { join } from 'path';
import { homedir } from 'os';
import { logger } from '../utils/logger';
import type { StorageConfig } from './interfaces';

/**
 * Default storage configuration values
 */
const DEFAULT_CONFIG: Partial<StorageConfig> = {
  type: 'memory',
  timeout: 5000,
  poolSize: 10,
  debug: false,
};

/**
 * Environment variable mappings
 */
const ENV_MAPPINGS = {
  VIKUNJA_MCP_STORAGE_TYPE: 'type',
  VIKUNJA_MCP_STORAGE_DATABASE_PATH: 'databasePath',
  VIKUNJA_MCP_STORAGE_CONNECTION_STRING: 'connectionString',
  VIKUNJA_MCP_STORAGE_POOL_SIZE: 'poolSize',
  VIKUNJA_MCP_STORAGE_TIMEOUT: 'timeout',
  VIKUNJA_MCP_STORAGE_DEBUG: 'debug',
} as const;

/**
 * Get default database path for SQLite storage
 */
function getDefaultDatabasePath(): string {
  // Try to use XDG data directory first, fallback to user home
  const xdgDataHome = process.env.XDG_DATA_HOME;
  const baseDir = xdgDataHome || join(homedir(), '.local', 'share');
  return join(baseDir, 'vikunja-mcp', 'filters.db');
}

/**
 * Parse environment variable value with type conversion
 */
function parseEnvValue(value: string, key: string): unknown {
  // Handle boolean values
  if (key === 'debug') {
    return value.toLowerCase() === 'true' || value === '1';
  }
  
  // Handle numeric values
  if (key === 'poolSize' || key === 'timeout') {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      logger.warn(`Invalid numeric value for ${key}: ${value}, using default`);
      return undefined;
    }
    return parsed;
  }
  
  // Handle string values
  return value;
}

/**
 * Load storage configuration from environment variables and defaults
 */
export function loadStorageConfig(): StorageConfig {
  const config: Partial<StorageConfig> = { ...DEFAULT_CONFIG };

  // Load from environment variables
  for (const [envKey, configKey] of Object.entries(ENV_MAPPINGS)) {
    const envValue = process.env[envKey];
    if (envValue) {
      const parsedValue = parseEnvValue(envValue, configKey);
      if (parsedValue !== undefined) {
        (config as any)[configKey] = parsedValue;
      }
    }
  }

  // Set default database path for SQLite if not provided
  if (config.type === 'sqlite' && !config.databasePath) {
    config.databasePath = getDefaultDatabasePath();
  }

  // Validate required fields
  const finalConfig = config as StorageConfig;
  const validation = validateStorageConfig(finalConfig);
  
  if (!validation.valid) {
    logger.error('Invalid storage configuration', { errors: validation.errors });
    // Fallback to memory storage
    return {
      ...DEFAULT_CONFIG,
      type: 'memory',
    } as StorageConfig;
  }

  logger.info('Storage configuration loaded', {
    type: finalConfig.type,
    databasePath: finalConfig.databasePath ? '***' : undefined,
    debug: finalConfig.debug,
  });

  return finalConfig;
}

/**
 * Validate storage configuration
 */
export function validateStorageConfig(config: StorageConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate storage type
  const supportedTypes = ['memory', 'sqlite', 'postgresql', 'redis'];
  if (!supportedTypes.includes(config.type)) {
    errors.push(`Unsupported storage type: ${config.type}. Supported types: ${supportedTypes.join(', ')}`);
  }

  // Validate SQLite-specific configuration
  if (config.type === 'sqlite') {
    if (!config.databasePath) {
      errors.push('Database path is required for SQLite storage');
    }
  }

  // Validate PostgreSQL/Redis-specific configuration
  if (config.type === 'postgresql' || config.type === 'redis') {
    if (!config.connectionString) {
      errors.push(`Connection string is required for ${config.type} storage`);
    }
  }

  // Validate numeric values
  if (config.timeout !== undefined && (config.timeout < 1000 || config.timeout > 60000)) {
    errors.push('Timeout must be between 1000 and 60000 milliseconds');
  }

  if (config.poolSize !== undefined && (config.poolSize < 1 || config.poolSize > 100)) {
    errors.push('Pool size must be between 1 and 100');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get storage configuration for specific storage type with defaults
 */
export function getStorageConfigForType(type: StorageConfig['type']): StorageConfig {
  const baseConfig: StorageConfig = {
    ...DEFAULT_CONFIG,
    type,
  } as StorageConfig;

  switch (type) {
    case 'sqlite':
      return {
        ...baseConfig,
        databasePath: getDefaultDatabasePath(),
        options: {
          enableWAL: true,
          enableForeignKeys: true,
        },
      };

    case 'postgresql':
      return {
        ...baseConfig,
        connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/vikunja_mcp',
        poolSize: 10,
      };

    case 'redis':
      return {
        ...baseConfig,
        connectionString: process.env.REDIS_URL || 'redis://localhost:6379',
        poolSize: 5,
      };

    case 'memory':
    default:
      return baseConfig;
  }
}

/**
 * Create storage configuration from partial configuration
 */
export function createStorageConfig(partial: Partial<StorageConfig> = {}): StorageConfig {
  // Check for explicitly null required fields before applying defaults (undefined is ok, we'll use defaults)
  if (partial.type === 'sqlite' && partial.databasePath === null) {
    throw new Error('Invalid storage configuration: Database path is required for SQLite storage');
  }

  if ((partial.type === 'postgresql' || partial.type === 'redis') &&
      partial.connectionString === null) {
    throw new Error(`Invalid storage configuration: Connection string is required for ${partial.type} storage`);
  }

  const defaultConfig = getStorageConfigForType(partial.type || 'memory');
  const mergedConfig = { ...defaultConfig, ...partial };

  const validation = validateStorageConfig(mergedConfig);
  if (!validation.valid) {
    throw new Error(`Invalid storage configuration: ${validation.errors.join(', ')}`);
  }

  return mergedConfig;
}

/**
 * Get environment variables help text
 */
export function getConfigurationHelp(): string {
  return `
Storage Configuration Environment Variables:

VIKUNJA_MCP_STORAGE_TYPE          Storage backend type (memory, sqlite, postgresql, redis)
                                  Default: memory

VIKUNJA_MCP_STORAGE_DATABASE_PATH SQLite database file path
                                  Default: ~/.local/share/vikunja-mcp/filters.db

VIKUNJA_MCP_STORAGE_CONNECTION_STRING
                                  Connection string for PostgreSQL/Redis
                                  Examples:
                                  - PostgreSQL: postgresql://user:pass@host:5432/db
                                  - Redis: redis://host:6379

VIKUNJA_MCP_STORAGE_POOL_SIZE     Connection pool size (1-100)
                                  Default: 10

VIKUNJA_MCP_STORAGE_TIMEOUT       Connection timeout in milliseconds (1000-60000)
                                  Default: 5000

VIKUNJA_MCP_STORAGE_DEBUG         Enable debug logging (true/false)
                                  Default: false

Examples:
  # Use SQLite with custom path
  export VIKUNJA_MCP_STORAGE_TYPE=sqlite
  export VIKUNJA_MCP_STORAGE_DATABASE_PATH=/path/to/database.db

  # Use PostgreSQL
  export VIKUNJA_MCP_STORAGE_TYPE=postgresql
  export VIKUNJA_MCP_STORAGE_CONNECTION_STRING=postgresql://user:pass@localhost:5432/vikunja

  # Use in-memory storage (default)
  export VIKUNJA_MCP_STORAGE_TYPE=memory
`.trim();
}