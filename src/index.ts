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

// Modern client functions will be exported at the bottom of the file

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

// Essential exports only - eliminated 80+ lines of unnecessary barrel exports
// Use direct imports instead of centralized re-exports for better tree-shaking

// Core types that are commonly imported by external code
export { MCPError, ErrorCode } from './types/errors';
export type { TaskResponseData, FilterExpression, Task } from './types/index';
export type { ParseResult } from './types/filters';
export type { AorpBuilderConfig, AorpFactoryResult } from './types/index';

// Core utilities that are widely used across the codebase
export { logger } from './utils/logger';
export { isAuthenticationError } from './utils/auth-error-handler';
export { withRetry, RETRY_CONFIG } from './utils/retry';
export { transformApiError, handleFetchError, handleStatusCodeError } from './utils/error-handler';
export { parseFilterString } from './utils/filters';
export { validateTaskCountLimit } from './utils/memory';
export { createStandardResponse, createAorpErrorResponse as createErrorResponse } from './utils/response-factory';

// Additional exports for task modules
export type { SimpleResponse } from './utils/simple-response';

// Client utilities for external usage
export { getClientFromContext, clearGlobalClientFactory } from './client';
