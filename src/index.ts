#!/usr/bin/env node

/**
 * Vikunja MCP Server
 * Main entry point for the Model Context Protocol server
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';

import { AuthManager } from './auth/AuthManager';
import { registerTools } from './tools';
import { logger } from './utils/logger';
import { createSecureConnectionMessage, createSecureLogConfig } from './utils/security';
import { createVikunjaClientFactory, setGlobalClientFactory, type VikunjaClientFactory } from './client';

// Load environment variables
dotenv.config({ quiet: true });

// Initialize server
const server = new McpServer({
  name: 'vikunja-mcp',
  version: '0.2.0',
});

// Initialize auth manager
const authManager = new AuthManager();

// Export modern client functions
export { getClientFromContext, clearGlobalClientFactory } from './client';

// Initialize client factory and register tools
let clientFactory: VikunjaClientFactory | null = null;

async function initializeFactory(): Promise<void> {
  try {
    clientFactory = await createVikunjaClientFactory(authManager);
    if (clientFactory) {
      await setGlobalClientFactory(clientFactory);
    }
  } catch (error) {
    logger.warn('Failed to initialize client factory during startup:', error);
    // Factory will be initialized on first authentication
  }
}

// Initialize factory during module load for both production and test environments
// This ensures the factory is available for tests
export const factoryInitializationPromise = initializeFactory()
  .then(() => {
    // Register tools after factory initialization completes
    try {
      if (clientFactory) {
        registerTools(server, authManager, clientFactory);
      } else {
        registerTools(server, authManager, undefined);
      }
    } catch (error) {
      logger.error('Failed to initialize:', error);
      // Fall back to legacy registration for backwards compatibility
      registerTools(server, authManager, undefined);
    }
  })
  .catch((error) => {
    logger.warn('Failed to initialize client factory during module load:', error);
    // Register tools without factory on failure
    registerTools(server, authManager, undefined);
  });

// Auto-authenticate using environment variables if available
if (process.env.VIKUNJA_URL && process.env.VIKUNJA_API_TOKEN) {
  const connectionMessage = createSecureConnectionMessage(
    process.env.VIKUNJA_URL, 
    process.env.VIKUNJA_API_TOKEN
  );
  logger.info(`Auto-authenticating: ${connectionMessage}`);
  authManager.connect(process.env.VIKUNJA_URL, process.env.VIKUNJA_API_TOKEN);
  const detectedAuthType = authManager.getAuthType();
  logger.info(`Using detected auth type: ${detectedAuthType}`);
}

// Start the server
async function main(): Promise<void> {
  // Tools are already registered during module initialization
  // Wait for factory initialization to complete before starting server
  await factoryInitializationPromise;

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Vikunja MCP server started');
  
  // Create secure configuration for logging
  const config = createSecureLogConfig({
    mode: process.env.MCP_MODE,
    debug: process.env.DEBUG,
    hasAuth: !!process.env.VIKUNJA_URL && !!process.env.VIKUNJA_API_TOKEN,
    url: process.env.VIKUNJA_URL,
    token: process.env.VIKUNJA_API_TOKEN,
  });
  
  logger.debug('Configuration loaded', config);
}

// Only start the server if not in test environment
if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
  main().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

// ============================================================================
// BARREL EXPORTS - Centralized imports to eliminate deep relative paths
// ============================================================================

// Export core types (avoiding conflicts)
export * from './types/errors';
export {
  MCPError,
  ErrorCode,
  type TaskResponseData,
  type StandardResponse,
  type FilterExpression,
  createStandardResponse
} from './types/index';
export * from './types/responses';
export * from './types/vikunja';

// Also export ParseResult from filters (used in tools)
export { type ParseResult } from './types/filters';

// Export core utilities (selective to avoid conflicts)
export * from './utils/logger';
export {
  parseFilterString
} from './utils/filters';
export * from './utils/memory';
export * from './utils/security';
export * from './utils/error-handler';
export * from './utils/auth-error-handler';
export * from './utils/retry';
export * from './utils/validation';
export * from './utils/AsyncMutex';

// Export specialized utilities
export * from './utils/parser/FilterParser';
export * from './utils/tokenizer/Tokenizer';
export * from './utils/tokenizer/TokenTypes';
export * from './utils/validators/SecurityValidator';
export * from './utils/validators/DateValidator';
export * from './utils/validators/ConditionValidator';
export * from './utils/validators/ValidationOrchestrator';

// Export filtering strategy utilities (selective to avoid conflicts)
export {
  HybridFilteringStrategy,
  ServerSideFilteringStrategy,
  ClientSideFilteringStrategy,
  type FilteringContext,
  type TaskFilteringStrategy
} from './utils/filtering/index';
export * from './utils/filtering/HybridFilteringStrategy';
export * from './utils/filtering/ServerSideFilteringStrategy';
export * from './utils/filtering/ClientSideFilteringStrategy';
export * from './utils/filtering/FilteringContext';
export * from './utils/filtering/types';

// Export performance monitoring
export * from './utils/performance/index';
export * from './utils/performance/performance-monitor';

// Export authentication and client utilities
export * from './auth/index';
export * from './client';

// Export storage utilities and interfaces
export * from './storage/interfaces';
export * from './storage/config';
export * from './storage/FilterStorage';

// Export middleware and transforms (selective to avoid conflicts)
export {
  RateLimitingMiddleware,
  type RateLimitConfig
} from './middleware/index';
export * from './transforms/index';

// Export configuration management
export * from './config/index';

// Export specialized utility types
export * from './aorp/index';

// Export storage interfaces
export * from './storage/interfaces';
export * from './storage/FilterStorage';

// Re-export commonly used external dependencies
export type { Task } from 'node-vikunja';
