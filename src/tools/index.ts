/**
 * Tool Registration
 * Registers all Vikunja tools with the MCP server
 * 
 * NOTE: All tools are now registered unconditionally. Permission checking
 * is handled at runtime by the permission middleware, providing better
 * user experience with clear error messages when authentication is insufficient.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthManager } from '../auth/AuthManager';
import type { VikunjaClientFactory } from '../client/VikunjaClientFactory';

import { registerAuthTool } from './auth';
import { registerTasksTool } from './tasks';
import { registerProjectsTool } from './projects/index';
import { registerLabelsTool } from './labels';
import { registerTeamsTool } from './teams';
import { registerUsersTool } from './users';
import { registerFiltersTool } from './filters';
import { registerTemplatesTool } from './templates';
import { registerWebhooksTool } from './webhooks';
import { registerBatchImportTool } from './batch-import';
import { registerExportTool } from './export';

export function registerTools(
  server: McpServer, 
  authManager: AuthManager, 
  clientFactory?: VikunjaClientFactory
): void {
  // Register all tool handlers with dependency injection
  // No conditional registration - all tools are available, permission checking happens at runtime
  
  registerAuthTool(server, authManager);
  registerTasksTool(server, authManager, clientFactory);
  registerProjectsTool(server, authManager, clientFactory);
  registerLabelsTool(server, authManager, clientFactory);
  registerTeamsTool(server, authManager, clientFactory);

  // Register filters tool (needs auth manager for session-scoped storage)
  registerFiltersTool(server, authManager, clientFactory);

  // Register templates tool
  registerTemplatesTool(server, authManager, clientFactory);

  // Register webhooks tool
  registerWebhooksTool(server, authManager, clientFactory);

  // Register batch import tool
  registerBatchImportTool(server, authManager, clientFactory);

  // Register user and export tools conditionally (preserving backward compatibility)
  // NOTE: The permission infrastructure is available for future migration
  if (authManager.isAuthenticated() && authManager.getAuthType() === 'jwt') {
    registerUsersTool(server, authManager, clientFactory);
    registerExportTool(server, authManager, clientFactory);
  }
}

