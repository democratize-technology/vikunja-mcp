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

// Load environment variables
dotenv.config();

// Initialize server
const server = new McpServer({
  name: 'vikunja-mcp',
  version: '0.1.0',
});

// Initialize auth manager
const authManager = new AuthManager();

// Export client functions from client module
export { getVikunjaClient, cleanupVikunjaClient } from './client';
import { setAuthManager } from './client';

// Set the auth manager in the client module
setAuthManager(authManager);

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

// Register all tools
registerTools(server, authManager);

// Start the server
async function main(): Promise<void> {
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
